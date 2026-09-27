import { DurableObject } from "cloudflare:workers";
import {
  AppError,
  json,
  errorResponse,
  requireThat,
  readJson,
  digest,
  isMaster,
} from "./security.mjs";
import {
  DAY,
  CAPACITY,
  identifier,
  identity,
  shuffle,
  score,
  rank,
  csv,
  requestId,
  randomInt,
} from "./rules.mjs";

export class QuizRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.authTimers = new Map();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK(id=1), content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, position INTEGER UNIQUE NOT NULL, content TEXT NOT NULL, opened_at INTEGER, closed_at INTEGER, close_reason TEXT);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, normalized TEXT UNIQUE NOT NULL, alias TEXT NOT NULL, avatar INTEGER NOT NULL, token_hash TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS answers (question_id TEXT NOT NULL, player_id TEXT NOT NULL, option_id TEXT NOT NULL, received_at INTEGER NOT NULL, points INTEGER NOT NULL, PRIMARY KEY(question_id,player_id));
      CREATE TABLE IF NOT EXISTS commands (request_id TEXT PRIMARY KEY, action TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recoveries (player_id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    `);
    if (
      !this.sql.exec("PRAGMA table_info(players)").toArray()
        .some(c => c.name === "name")
    )
      this.sql.exec(
        "ALTER TABLE players ADD COLUMN name TEXT NOT NULL DEFAULT ''",
      );
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
    for (const socket of ctx.getWebSockets()) {
      const auth = socket.deserializeAttachment();
      if (!auth?.authenticated)
        this.authTimers.set(
          socket,
          setTimeout(
            () => this.closeSocket(socket, 4001, "Autenticación vencida"),
            Math.max(0, (auth?.expiresAt || Date.now()) - Date.now()),
          ),
        );
    }
  }
  rows(sql, ...args) {
    return this.sql.exec(sql, ...args).toArray();
  }
  row(sql, ...args) {
    return this.rows(sql, ...args)[0];
  }
  metadata() {
    const row = this.row("SELECT content FROM room WHERE id=1");
    requireThat(
      row,
      404,
      "ROOM_NOT_FOUND",
      "No se encontró esta sala. Revisá el código.",
    );
    return JSON.parse(row.content);
  }
  save(room) {
    this.sql.exec("UPDATE room SET content=? WHERE id=1", JSON.stringify(room));
  }
  question(room) {
    const row = this.row(
      "SELECT * FROM questions WHERE position=?",
      room.index,
    );
    return row ? { ...row, ...JSON.parse(row.content) } : null;
  }
  player(hash) {
    const p = this.row("SELECT * FROM players WHERE token_hash=?", hash);
    requireThat(
      p,
      401,
      "PLAYER_AUTH",
      "No se pudo recuperar tu acceso. Pedí ayuda a quien conduce.",
    );
    return p;
  }
  closeQuestion(room, reason, now) {
    const q = this.question(room);
    this.sql.exec(
      "UPDATE questions SET closed_at=?,close_reason=? WHERE id=?",
      now,
      reason,
      q.id,
    );
    room.phase = "feedback";
    room.step++;
    room.revision++;
    this.save(room);
  }
  async tick() {
    let room = this.metadata();
    const now = Date.now();
    if (now >= room.expiresAt) {
      this.ctx.storage.transactionSync(() => {
        for (const table of [
          "questions",
          "players",
          "answers",
          "commands",
          "recoveries",
        ])
          this.sql.exec(`DELETE FROM ${table}`);
        this.save({
          code: room.code,
          phase: "expired",
          expiresAt: room.expiresAt,
        });
      });
      for (const socket of this.ctx.getWebSockets())
        this.closeSocket(socket, 4004, "Sala vencida");
      await this.ctx.storage.deleteAlarm();
      throw new AppError(
        410,
        "ROOM_EXPIRED",
        "La sala venció. Sus resultados ya no están disponibles.",
      );
    }
    if (room.phase === "answering" && now >= room.closesAt) {
      this.ctx.storage.transactionSync(() =>
        this.closeQuestion(room, "deadline", room.closesAt),
      );
      await this.schedule();
      await this.broadcast();
    }
    return this.metadata();
  }
  async schedule() {
    const room = this.metadata();
    await this.ctx.storage.setAlarm(
      room.phase === "answering"
        ? Math.min(room.expiresAt, room.closesAt)
        : room.expiresAt,
    );
  }
  async alarm() {
    try {
      await this.tick();
      await this.schedule();
    } catch (e) {
      if (e.code !== "ROOM_EXPIRED") throw e;
    }
  }
  visibleIdentity(player, room) {
    return {
      alias: player.alias,
      avatar: player.avatar,
      displayName: room.nameMode === "chosen" ? player.name : player.alias,
    };
  }
  summary(room) {
    const players = this.rows("SELECT id,name,alias,avatar FROM players");
    const answers = this.rows("SELECT * FROM answers");
    const totals = new Map();
    for (const a of answers)
      totals.set(a.player_id, (totals.get(a.player_id) || 0) + a.points);
    const ranking = rank(
      players.map((p) => ({
        playerId: p.id,
        ...this.visibleIdentity(p, room),
        points: totals.get(p.id) || 0,
      })),
    );
    const summary = this.rows(
      "SELECT * FROM questions WHERE opened_at IS NOT NULL ORDER BY position",
    )
      .map((row) => {
        const q = JSON.parse(row.content);
        const received = answers.filter((a) => a.question_id === q.id);
        const correct = received.filter(
          (a) => a.option_id === q.correctOptionId,
        ).length;
        return {
          id: q.id,
          position: row.position,
          prompt: q.prompt,
          options: q.options,
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
          correct,
          incorrect: received.length - correct,
          missing: room.frozenCount - received.length,
          received: received.length,
          accuracy: received.length ? correct / received.length : null,
          participation: room.frozenCount
            ? received.length / room.frozenCount
            : 0,
          distribution: q.options.map((o) => ({
            ...o,
            count: received.filter((a) => a.option_id === o.id).length,
          })),
        };
      })
      .sort((a, b) => b.incorrect - a.incorrect || a.position - b.position);
    return { ranking, summary };
  }
  snapshot() {
    const room = this.metadata();
    const q = this.question(room);
    return {
      room,
      q,
      players: this.rows(
        "SELECT id,identifier,name,alias,avatar,token_hash FROM players",
      ),
      answers: q
        ? this.rows(
            "SELECT player_id,option_id AS optionId,received_at AS receivedAt FROM answers WHERE question_id=?",
            q.id,
          )
        : [],
      summary: room.phase === "finished" ? this.summary(room) : null,
    };
  }
  closedScores(room) {
    // Scores become visible only when a question closes. This cache can always
    // be reconstructed from SQLite after hibernation; it never accepts writes.
    if (this.scoreStep !== room.step) {
      this.scoreTotals = new Map(
        this.rows(
          "SELECT a.player_id,SUM(a.points) AS points FROM answers a JOIN questions q ON q.id=a.question_id WHERE q.closed_at IS NOT NULL GROUP BY a.player_id",
        ).map((a) => [a.player_id, a.points]),
      );
      this.scoreStep = room.step;
    }
    return this.scoreTotals;
  }
  state(role = "public", hash = "", snapshot = this.snapshot()) {
    const { room, q, players, answers } = snapshot;
    const state = {
      code: room.code,
      title: room.title,
      quizId: room.quizId,
      version: room.version,
      nameMode: room.nameMode ?? "alias",
      phase: room.phase,
      step: room.step,
      revision: room.revision,
      total: room.total,
      index: room.index,
      registered: players.length,
      frozenCount: room.frozenCount,
      capacity: CAPACITY,
      expiresAt: room.expiresAt,
      serverNow: Date.now(),
      opensAt: room.phase === "answering" ? room.opensAt : null,
      closesAt: room.phase === "answering" ? room.closesAt : null,
      closeReason: q?.close_reason || null,
    };
    state.players = players.map((p) =>
      role === "host"
        ? {
            id: p.id,
            identifier: p.identifier,
            name: p.name,
            ...this.visibleIdentity(p, room),
          }
        : this.visibleIdentity(p, room),
    );
    if (q && room.phase !== "lobby") {
      state.question = {
        id: q.id,
        prompt: q.prompt,
        answerSeconds: q.answerSeconds,
      };
      if (["answering", "feedback", "finished"].includes(room.phase))
        state.question.options = q.options;
      if (
        ["feedback", "finished"].includes(room.phase) &&
        q.opened_at !== null
      ) {
        Object.assign(state.question, {
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
        });
        state.distribution = q.options.map((option) => ({
          optionId: option.id,
          count: answers.filter((a) => a.optionId === option.id).length,
        }));
      }
      state.answered = answers.length;
    }
    if (role === "participant") {
      const p = players.find((player) => player.token_hash === hash);
      requireThat(
        p,
        401,
        "PLAYER_AUTH",
        "No se pudo recuperar tu acceso. Pedí ayuda a quien conduce.",
      );
      const a = answers.find((answer) => answer.player_id === p.id);
      state.self = {
        ...this.visibleIdentity(p, room),
        answer: a ? { optionId: a.optionId, receivedAt: a.receivedAt } : null,
        points: this.closedScores(room).get(p.id) || 0,
      };
    }
    if (room.phase === "finished") Object.assign(state, snapshot.summary);
    return state;
  }
  closeSocket(socket, code, reason) {
    clearTimeout(this.authTimers.get(socket));
    this.authTimers.delete(socket);
    try {
      socket.close(code, reason);
    } catch {}
  }
  async broadcast() {
    const masterHash = await digest(this.env.MASTER_SECRET || "");
    const snapshot = this.snapshot();
    const publicState = this.state("public", "", snapshot);
    for (const socket of this.ctx.getWebSockets()) {
      const auth = socket.deserializeAttachment();
      if (!auth?.authenticated) continue;
      try {
        if (auth.role === "host" && auth.masterHash !== masterHash) {
          this.closeSocket(socket, 4001, "Volvé a ingresar");
          continue;
        }
        const state =
          auth.role === "public"
            ? publicState
            : this.state(auth.role, auth.tokenHash, snapshot);
        socket.send(JSON.stringify({ type: "state", state }));
      } catch {
        this.closeSocket(socket, 4001, "Acceso finalizado");
      }
    }
  }
  async webSocketMessage(socket, message) {
    try {
      requireThat(
        typeof message === "string" && message.length <= 2048,
        400,
        "SOCKET_MESSAGE",
        "Mensaje inválido.",
      );
      const auth = socket.deserializeAttachment();
      requireThat(
        !auth?.authenticated,
        400,
        "SOCKET_MESSAGE",
        "Las acciones se envían por HTTP.",
      );
      const data = JSON.parse(message);
      requireThat(
        data.type === "auth" &&
          ["host", "participant", "public"].includes(data.role),
        401,
        "SOCKET_AUTH",
        "Autenticación requerida.",
      );
      await this.tick();
      const attachment = { authenticated: true, role: data.role };
      if (data.role === "host") {
        if (this.env.AUTH_RATE_LIMIT) {
          const limit = await this.env.AUTH_RATE_LIMIT.limit({
            key: `ronda:${auth.ip}`,
          });
          requireThat(
            limit.success,
            429,
            "AUTH_RATE_LIMIT",
            "Demasiados intentos de autenticación.",
          );
        }
        const authenticated = await isMaster(data.token, this.env);
        requireThat(
          authenticated,
          401,
          "SOCKET_AUTH",
          "Contraseña incorrecta.",
        );
        attachment.masterHash = await digest(data.token);
      } else if (data.role === "participant") {
        attachment.tokenHash = await digest(String(data.token || ""));
        this.player(attachment.tokenHash);
      }
      socket.serializeAttachment(attachment);
      clearTimeout(this.authTimers.get(socket));
      this.authTimers.delete(socket);
      socket.send(
        JSON.stringify({
          type: "state",
          state: this.state(attachment.role, attachment.tokenHash),
        }),
      );
    } catch {
      this.closeSocket(socket, 4001, "No se pudo autenticar la conexión");
    }
  }
  webSocketClose(socket, code) {
    this.closeSocket(
      socket,
      [1005, 1006, 1015].includes(code) ? 1000 : code,
      "Conexión cerrada",
    );
  }
  webSocketError(socket) {
    this.closeSocket(socket, 1011, "Reconectá para continuar");
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const action = url.pathname.split("/").at(-1);
      const role = request.headers.get("X-Ronda-Role") || "public";
      const hash = request.headers.get("X-Ronda-Token-Hash") || "";
      if (action === "initialize") {
        const data = await readJson(request);
        const previous = this.row("SELECT content FROM room WHERE id=1");
        const reuse =
          previous && JSON.parse(previous.content).expiresAt <= data.createdAt;
        if (reuse)
          for (const socket of this.ctx.getWebSockets())
            this.closeSocket(socket, 4004, "Sala vencida");
        if (!previous || reuse)
          this.ctx.storage.transactionSync(() => {
            if (reuse)
              for (const table of [
                "room",
                "questions",
                "players",
                "answers",
                "commands",
                "recoveries",
              ])
                this.sql.exec(`DELETE FROM ${table}`);
            const quiz = data.quiz;
            const room = {
              code: data.code,
              title: quiz.title,
              quizId: quiz.quizId,
              version: quiz.version,
              nameMode: data.nameMode,
              total: quiz.questions.length,
              createdAt: data.createdAt,
              expiresAt: data.createdAt + DAY,
              phase: "lobby",
              index: -1,
              step: 0,
              revision: 0,
              frozenCount: 0,
            };
            this.sql.exec(
              "INSERT INTO room VALUES (1,?)",
              JSON.stringify(room),
            );
            quiz.questions.forEach((q, i) =>
              this.sql.exec(
                "INSERT INTO questions (id,position,content) VALUES (?,?,?)",
                q.id,
                i,
                JSON.stringify({
                  ...q,
                  options: shuffle(q.options),
                  answerSeconds: data.times[i],
                }),
              ),
            );
          });
        this.scoreStep = undefined;
        await this.tick();
        await this.schedule();
        return json({ code: data.code });
      }
      let room = await this.tick();
      if (
        action === "socket" &&
        request.headers.get("Upgrade") === "websocket"
      ) {
        requireThat(
          this.ctx.getWebSockets().length < 300,
          429,
          "SOCKET_CAPACITY",
          "Hay demasiadas conexiones. Reintentá en unos segundos.",
        );
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({
          authenticated: false,
          ip: request.headers.get("CF-Connecting-IP") || "local",
          expiresAt: Date.now() + 5000,
        });
        this.authTimers.set(
          server,
          setTimeout(
            () => this.closeSocket(server, 4001, "Autenticación vencida"),
            5000,
          ),
        );
        return new Response(null, { status: 101, webSocket: client });
      }
      if (action === "state" && request.method === "GET")
        return json(this.state(role, hash));
      if (action === "recover" && request.method === "POST") {
        requireThat(
          role === "host",
          401,
          "AUTH_REQUIRED",
          "Ingresá la contraseña de creadores.",
        );
        const data = await readJson(request, 1024);
        requestId(data.requestId);
        const recoveryCode = crypto
          .randomUUID()
          .replaceAll("-", "")
          .slice(0, 12)
          .toUpperCase();
        const recoveryHash = await digest(recoveryCode);
        this.ctx.storage.transactionSync(() => {
          requireThat(
            this.row("SELECT id FROM players WHERE id=?", data.playerId),
            404,
            "PLAYER_NOT_FOUND",
            "No se encontró el participante.",
          );
          this.sql.exec(
            "UPDATE players SET token_hash=? WHERE id=?",
            crypto.randomUUID(),
            data.playerId,
          );
          this.sql.exec(
            "INSERT OR REPLACE INTO recoveries (player_id,code_hash,expires_at,attempts) VALUES (?,?,?,0)",
            data.playerId,
            recoveryHash,
            Date.now() + 600000,
          );
        });
        await this.ctx.storage.sync();
        await this.broadcast();
        return json({ recoveryCode, expiresInSeconds: 600 });
      }
      if (action === "join" && request.method === "POST") {
        const data = await readJson(request, 1024);
        requireThat(
          data.name === undefined,
          409,
          "CLIENT_UPDATE_REQUIRED",
          "Recargá esta página para usar el ingreso de un solo campo.",
        );
        const input = identifier(data.identifier);
        const token = crypto.randomUUID() + crypto.randomUUID();
        const tokenHash = await digest(token);
        const recoveryHash = data.recoveryCode
          ? await digest(String(data.recoveryCode).trim().toUpperCase())
          : null;
        if (recoveryHash) {
          const p = this.row(
            "SELECT * FROM players WHERE normalized=?",
            input.normalized,
          );
          const recovery = p
            ? this.row("SELECT * FROM recoveries WHERE player_id=?", p.id)
            : null;
          if (recovery)
            this.sql.exec(
              "UPDATE recoveries SET attempts=attempts+1 WHERE player_id=?",
              p.id,
            );
          requireThat(
            p &&
              recovery &&
              recovery.attempts < 10 &&
              recovery.expires_at > Date.now() &&
              recovery.code_hash === recoveryHash,
            409,
            "RECOVERY_INVALID",
            "El código de recuperación no es válido o venció. Pedí uno nuevo.",
          );
          this.ctx.storage.transactionSync(() => {
            this.sql.exec("DELETE FROM recoveries WHERE player_id=?", p.id);
            this.sql.exec(
              "UPDATE players SET token_hash=? WHERE id=?",
              tokenHash,
              p.id,
            );
          });
          await this.ctx.storage.sync();
          await this.broadcast();
          return json({ token, alias: p.alias, avatar: p.avatar });
        }
        const p = this.ctx.storage.transactionSync(() => {
          room = this.metadata();
          requireThat(
            room.phase === "lobby",
            409,
            "JOIN_CLOSED",
            "La ronda ya comenzó. Solo se pueden recuperar accesos existentes.",
          );
          requireThat(
            !this.row(
              "SELECT id FROM players WHERE normalized=?",
              input.normalized,
            ),
            409,
            "IDENTIFIER_TAKEN",
            "Ese nombre o identificador ya está en la sala. Si ya ingresaste, recuperá tu acceso; si no, usá otro según las instrucciones de quien conduce.",
          );
          const assigned = this.rows("SELECT avatar FROM players");
          requireThat(
            assigned.length < CAPACITY,
            409,
            "ROOM_FULL",
            "La sala ya tiene 120 participantes.",
          );
          const used = new Set(assigned.map(p => p.avatar));
          const available = Array.from({ length: CAPACITY }, (_, i) => i)
            .filter(i => !used.has(i));
          const p = {
            id: crypto.randomUUID(),
            ...identity(available[randomInt(available.length)]),
          };
          // Keep historical names and CSV columns; new joins use one value in both.
          this.sql.exec(
            "INSERT INTO players (id,identifier,normalized,alias,avatar,token_hash,name) VALUES (?,?,?,?,?,?,?)",
            p.id,
            input.original,
            input.normalized,
            p.alias,
            p.avatar,
            tokenHash,
            input.original,
          );
          room.revision++;
          this.save(room);
          return p;
        });
        await this.ctx.storage.sync();
        await this.broadcast();
        return json({ token, alias: p.alias, avatar: p.avatar });
      }
      if (action === "answers" && request.method === "POST") {
        requireThat(
          role === "participant",
          401,
          "PLAYER_AUTH",
          "Ingresá a la sala para responder.",
        );
        const data = await readJson(request, 1024);
        const receipt = this.ctx.storage.transactionSync(() => {
          const p = this.player(hash);
          room = this.metadata();
          const prior = this.row(
            "SELECT * FROM answers WHERE question_id=? AND player_id=?",
            data.questionId,
            p.id,
          );
          if (prior) {
            requireThat(
              prior.option_id === data.optionId,
              409,
              "ANSWER_LOCKED",
              "Tu primera respuesta ya fue guardada.",
            );
            return {
              accepted: true,
              questionId: data.questionId,
              optionId: data.optionId,
              receivedAt: prior.received_at,
            };
          }
          const q = this.question(room);
          const now = Date.now();
          requireThat(
            room.phase === "answering" &&
              now < room.closesAt &&
              q.id === data.questionId,
            409,
            "ANSWER_CLOSED",
            "La pregunta ya no admite respuestas.",
          );
          requireThat(
            q.options.some((o) => o.id === data.optionId),
            400,
            "OPTION_NOT_FOUND",
            "La alternativa no pertenece a esta pregunta.",
          );
          this.sql.exec(
            "INSERT INTO answers VALUES (?,?,?,?,?)",
            q.id,
            p.id,
            data.optionId,
            now,
            score(
              data.optionId === q.correctOptionId,
              now - room.opensAt,
              q.answerSeconds,
            ),
          );
          room.revision++;
          this.save(room);
          const count = this.row(
            "SELECT COUNT(*) AS count FROM answers WHERE question_id=?",
            q.id,
          ).count;
          if (count === room.frozenCount)
            this.closeQuestion(room, "all_answered", now);
          return {
            accepted: true,
            questionId: q.id,
            optionId: data.optionId,
            receivedAt: now,
          };
        });
        await this.schedule();
        await this.ctx.storage.sync();
        await this.broadcast();
        return json(receipt);
      }
      if (action === "commands" && request.method === "POST") {
        requireThat(
          role === "host",
          401,
          "AUTH_REQUIRED",
          "Ingresá la contraseña de creadores.",
        );
        const data = await readJson(request, 1024);
        requestId(data.requestId);
        this.ctx.storage.transactionSync(() => {
          room = this.metadata();
          const prior = this.row(
            "SELECT action FROM commands WHERE request_id=?",
            data.requestId,
          );
          if (prior) {
            requireThat(
              prior.action === data.action,
              409,
              "REQUEST_CONFLICT",
              "La operación ya fue usada.",
            );
            return;
          }
          requireThat(
            data.expectedStep === room.step,
            409,
            "STEP_CONFLICT",
            "La sala avanzó desde otra pestaña. Revisá el estado actual.",
          );
          const now = Date.now();
          if (data.action === "start") {
            const count = this.row(
              "SELECT COUNT(*) AS count FROM players",
            ).count;
            requireThat(
              room.phase === "lobby" && count > 0,
              409,
              "INVALID_PHASE",
              "Necesitás al menos un participante para iniciar.",
            );
            room.frozenCount = count;
            room.phase = "reading";
            room.index = 0;
          } else if (data.action === "open") {
            requireThat(
              room.phase === "reading",
              409,
              "INVALID_PHASE",
              "La pregunta no está en lectura.",
            );
            const q = this.question(room);
            room.opensAt = now;
            room.closesAt = now + q.answerSeconds * 1000;
            room.phase = "answering";
            this.sql.exec(
              "UPDATE questions SET opened_at=? WHERE id=?",
              now,
              q.id,
            );
          } else if (data.action === "next") {
            requireThat(
              room.phase === "feedback" && room.index + 1 < room.total,
              409,
              "INVALID_PHASE",
              "No hay otra pregunta disponible.",
            );
            room.index++;
            room.phase = "reading";
          } else if (data.action === "finish") {
            requireThat(
              room.phase !== "finished",
              409,
              "INVALID_PHASE",
              "La sala ya finalizó.",
            );
            if (room.phase === "answering")
              this.closeQuestion(room, "host_finished", now);
            room.phase = "finished";
            room.finishedAt = now;
            room.expiresAt = now + DAY;
          } else {
            throw new AppError(400, "INVALID_COMMAND", "Acción desconocida.");
          }
          room.step++;
          room.revision++;
          this.save(room);
          this.sql.exec(
            "INSERT INTO commands VALUES (?,?)",
            data.requestId,
            data.action,
          );
        });
        await this.schedule();
        await this.ctx.storage.sync();
        await this.broadcast();
        if (room.phase === "finished")
          await this.env.CATALOG.getByName("catalog").fetch(
            new Request("https://internal/internal/room-expiry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: room.code,
                expiresAt: room.expiresAt,
              }),
            }),
          );
        return json(this.state("host"));
      }
      if (
        ["answers.csv", "results.csv"].includes(action) &&
        request.method === "GET"
      ) {
        requireThat(
          role === "host",
          401,
          "AUTH_REQUIRED",
          "Ingresá la contraseña de creadores.",
        );
        requireThat(
          room.phase === "finished",
          409,
          "RESULTS_NOT_READY",
          "Finalizá la sala antes de descargar.",
        );
        const players = this.rows("SELECT * FROM players");
        let rows;
        if (action === "results.csv") {
          let ranking = this.summary(room).ranking;
          if (url.searchParams.get("scope") === "podium")
            ranking = ranking.filter((p) => p.place <= 3);
          rows = [
            [
              "sala", "puesto", "identificador", "personaje", "puntos",
              "nombre_elegido",
            ],
            ...ranking.map((p) => [
              room.code,
              p.place,
              players.find((x) => x.id === p.playerId).identifier,
              p.alias,
              p.points,
              players.find((x) => x.id === p.playerId).name,
            ]),
          ];
        } else {
          const answers = new Map(
            this.rows("SELECT * FROM answers").map((a) => [
              `${a.question_id}:${a.player_id}`,
              a,
            ]),
          );
          rows = [
            [
              "sala",
              "cuestionario_id",
              "version",
              "orden",
              "pregunta_id",
              "pregunta",
              "tiempo_segundos",
              "identificador",
              "personaje",
              "elegida_id",
              "elegida",
              "correcta_id",
              "correcta",
              "resultado",
              "puntos",
              "transcurrido_ms",
              "nombre_elegido",
            ],
          ];
          for (const row of this.rows(
            "SELECT * FROM questions ORDER BY position",
          )) {
            const q = JSON.parse(row.content);
            const correct = q.options.find((o) => o.id === q.correctOptionId);
            for (const p of players) {
              const a = answers.get(`${q.id}:${p.id}`);
              const chosen = q.options.find((o) => o.id === a?.option_id);
              rows.push([
                room.code,
                room.quizId,
                room.version,
                row.position + 1,
                q.id,
                q.prompt,
                q.answerSeconds,
                p.identifier,
                p.alias,
                a?.option_id,
                chosen?.text,
                correct.id,
                correct.text,
                row.opened_at === null
                  ? "no_presentada"
                  : !a
                    ? "sin_respuesta"
                    : a.option_id === q.correctOptionId
                      ? "correcta"
                      : "incorrecta",
                a?.points || 0,
                a ? a.received_at - row.opened_at : "",
                p.name,
              ]);
            }
          }
        }
        return new Response(csv(rows), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="ronda-${room.code}-${action}"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return json(
        {
          error: {
            code: "NOT_FOUND",
            message: "No se encontró esta operación.",
          },
        },
        404,
      );
    } catch (error) {
      return errorResponse(error);
    }
  }
}
