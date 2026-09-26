import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import * as XLSX from "../admin/vendor/xlsx.mjs";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
const secret = process.env.TEST_MASTER_SECRET || "ronda-local-development-only";
const uid = () => crypto.randomUUID();
function fixture(count = 3) {
  return {
    title: "Prueba de ronda",
    defaultAnswerSeconds: 15,
    questions: Array.from({ length: count }, (_, i) => {
      const options = ["Dos", "Tres", "Cuatro", "Cinco"].map((text) => ({
        id: uid(),
        text,
      }));
      return {
        id: uid(),
        prompt: `Pregunta ${i + 1}: ¿cuánto es uno más uno?`,
        options,
        correctOptionId: options[0].id,
        explanation: "Uno más uno es dos.",
        answerSeconds: i === 1 ? 1 : 60,
      };
    }),
  };
}
async function api(path, method = "GET", data, token = secret, status = 200) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const value = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(value)}`,
  );
  return value;
}
test("el catálogo rechaza a quien no presenta la contraseña", async () => {
  const response = await fetch(`${base}/api/quizzes`);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("cada ronda fija los nombres visibles y exporta ambos sin filtrar los privados", async (t) => {
  const quiz = fixture(1);
  const created = await api("/quizzes", "POST", { requestId: uid(), quiz });
  await api(`/quizzes/${created.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: 1,
  });
  for (const nameMode of ["alias", "chosen"]) {
    await t.test(nameMode, async (t) => {
      const creation = {
        requestId: uid(),
        quizId: created.id,
        version: 1,
        nameMode,
      };
      const room = await api("/rooms", "POST", creation);
      const route = `/rooms/${room.code}`;
      assert.equal((await api(`${route}/state`)).nameMode, nameMode);
      const repeated = await api("/rooms", "POST", {
        ...creation,
        nameMode: nameMode === "alias" ? "chosen" : "alias",
      });
      assert.equal(repeated.code, room.code);
      assert.equal((await api(`${route}/state`)).nameMode, nameMode);
      await api(`${route}/join`, "POST", { identifier: "without-name" }, null, 400);
      const identities = [
        { identifier: "private-001", name: 'Álex, "Sur"' },
        { identifier: "private-002", name: "=SUM(1;2)" },
      ];
      const players = [];
      for (const input of identities)
        players.push(await api(`${route}/join`, "POST", input, null));
      assert.notEqual(players[0].alias, players[1].alias);
      let state = await api(`${route}/state`);
      assert.deepEqual(
        state.players.map(p => p.name),
        identities.map(p => p.name),
      );
      const messages = [];
      const socket = new WebSocket(
        `${base.replace("http", "ws")}/api${route}/socket`,
        { origin: "http://127.0.0.1:4173" },
      );
      t.after(() => socket.terminate());
      socket.on("message", raw => messages.push(JSON.parse(raw.toString()).state));
      await new Promise((resolve, reject) => {
        socket.once("error", reject);
        socket.once("open", () =>
          socket.send(JSON.stringify({ type: "auth", role: "public" })),
        );
        socket.once("message", resolve);
      });
      const command = async action => {
        state = await api(`${route}/commands`, "POST", {
          requestId: uid(),
          expectedStep: state.step,
          action,
        });
      };
      await command("start");
      await command("open");
      for (const player of players)
        await api(`${route}/answers`, "POST", {
          questionId: quiz.questions[0].id,
          optionId: quiz.questions[0].correctOptionId,
        }, player.token);
      state = await api(`${route}/state`);
      const finished = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Falta el estado final por WebSocket.")),
          3000,
        );
        socket.on("message", raw => {
          if (JSON.parse(raw.toString()).state.phase === "finished") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      await command("finish");
      await finished;
      const publicState = await api(`${route}/state`, "GET", null, null);
      const participantState = await api(`${route}/state`, "GET", null, players[0].token);
      assert.equal(
        participantState.self.displayName,
        nameMode === "chosen" ? identities[0].name : players[0].alias,
      );
      for (const exposed of [...messages, publicState, participantState]) {
        assert.equal(JSON.stringify(exposed).includes("private-"), false);
        for (let i = 0; i < players.length; i++) {
          assert.equal(
            exposed.players[i].displayName,
            nameMode === "chosen" ? identities[i].name : players[i].alias,
          );
          assert.equal(exposed.players[i].name, undefined);
        }
        if (nameMode === "alias")
          for (const input of identities)
            assert.equal(
              JSON.stringify(exposed).includes(JSON.stringify(input.name).slice(1, -1)),
              false,
            );
        if (exposed.phase === "finished")
          for (const row of exposed.ranking) {
            const i = players.findIndex(p => p.alias === row.alias);
            assert.equal(
              row.displayName,
              nameMode === "chosen" ? identities[i].name : players[i].alias,
            );
          }
      }
      for (const file of ["results.csv", "results.csv?scope=podium", "answers.csv"]) {
        const response = await fetch(`${base}/api${route}/${file}`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        assert.equal(response.status, 200);
        const book = XLSX.read(await response.text(), { type: "string", raw: true });
        const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
        assert.equal(rows.length, 2);
        for (let i = 0; i < players.length; i++) {
          const row = rows.find(row => row.identificador === identities[i].identifier);
          assert.equal(row.personaje, players[i].alias);
          assert.equal(row.nombre_elegido, i === 1 ? "'=SUM(1;2)" : identities[i].name);
        }
      }
    });
  }
  await api("/rooms", "POST", {
    requestId: uid(),
    quizId: created.id,
    version: 1,
    nameMode: "invalid",
  }, secret, 400);
});
test("120 participantes, lectura pública, respuesta privada y cierre atómico en ráfaga", async (t) => {
  const quiz = fixture(1);
  const created = await api("/quizzes", "POST", { requestId: uid(), quiz });
  const version = await api(`/quizzes/${created.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: 1,
  });
  const { code } = await api("/rooms", "POST", {
    requestId: uid(),
    quizId: created.id,
    version: version.version,
  });
  const route = `/rooms/${code}`;
  const players = await Promise.all(
    Array.from({ length: 120 }, (_, i) =>
      api(`${route}/join`, "POST", { identifier: `load-${i}`, name: `Persona ${i}` }, null),
    ),
  );
  const livePlayers = await Promise.all(
    players.map(
      (p) =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket(
            `${base.replace("http", "ws")}/api${route}/socket`,
            { origin: "http://127.0.0.1:4173" },
          );
          t.after(() => ws.terminate());
          ws.once("error", reject);
          ws.once("open", () =>
            ws.send(
              JSON.stringify({
                type: "auth",
                role: "participant",
                token: p.token,
              }),
            ),
          );
          const states = [];
          ws.on("message", (raw) => {
            const message = JSON.parse(raw.toString());
            states.push(message.state);
            resolve({ ws, states });
          });
        }),
    ),
  );
  assert.equal(new Set(players.map((p) => p.alias)).size, 120);
  await api(`${route}/join`, "POST", { identifier: "load-121", name: "Sin lugar" }, null, 409);
  const socket = new WebSocket(
    `${base.replace("http", "ws")}/api${route}/socket`,
    { origin: "http://127.0.0.1:4173" },
  );
  const messages = [];
  socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "auth", role: "public" }));
  let state = await api(`${route}/state`);
  for (const action of ["start", "open"])
    state = await api(`${route}/commands`, "POST", {
      requestId: uid(),
      expectedStep: state.step,
      action,
    });
  const answer = {
    questionId: quiz.questions[0].id,
    optionId: quiz.questions[0].correctOptionId,
  };
  await api(`${route}/answers`, "POST", answer, players[0].token);
  const own = await api(`${route}/state`, "GET", null, players[0].token);
  assert.equal(own.self.points, 0);
  assert.equal(own.question.correctOptionId, undefined);
  await Promise.all(
    players
      .slice(1)
      .map((p) => api(`${route}/answers`, "POST", answer, p.token)),
  );
  state = await api(`${route}/state`);
  assert.equal(state.phase, "feedback");
  assert.equal(state.answered, 120);
  assert.equal(JSON.stringify(messages).includes("load-"), false);
  assert.ok(messages.some((m) => m.state?.phase === "answering"));
  for (const player of livePlayers) {
    assert.ok(
      player.states.some(
        (s) => s.phase === "feedback" && s.self.points >= 1000,
      ),
    );
    assert.ok(
      player.states
        .filter((s) => s.phase === "answering")
        .every((s) => s.self.points === 0),
    );
    assert.equal(JSON.stringify(player.states).includes("token_hash"), false);
    assert.equal(JSON.stringify(player.states).includes("load-"), false);
  }
  socket.close();
  await api(`${route}/commands`, "POST", {
    requestId: uid(),
    expectedStep: state.step,
    action: "finish",
  });
});
test("una edición en conflicto y una versión nueva no alteran la versión publicada", async () => {
  const quiz = fixture(1);
  const created = await api("/quizzes", "POST", { requestId: uid(), quiz });
  await api(`/quizzes/${created.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: 1,
  });
  const updated = structuredClone(quiz);
  updated.questions[0].prompt = "Nuevo texto";
  await api(`/quizzes/${created.id}/draft`, "PUT", {
    quiz: updated,
    expectedRevision: 1,
  });
  await api(
    `/quizzes/${created.id}/draft`,
    "PUT",
    { quiz, expectedRevision: 1 },
    secret,
    409,
  );
  await api(`/quizzes/${created.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: 2,
  });
  assert.equal(
    (await api(`/quizzes/${created.id}/versions/1`)).questions[0].prompt,
    quiz.questions[0].prompt,
  );
  assert.equal(
    (await api(`/quizzes/${created.id}/versions/2`)).questions[0].prompt,
    "Nuevo texto",
  );
});
test("el facilitador recupera un acceso y revoca credencial y socket anteriores", async () => {
  const quiz = fixture(1);
  const created = await api("/quizzes", "POST", { requestId: uid(), quiz });
  await api(`/quizzes/${created.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: 1,
  });
  const { code } = await api("/rooms", "POST", {
    requestId: uid(),
    quizId: created.id,
    version: 1,
  });
  const route = `/rooms/${code}`;
  const p = await api(
    `${route}/join`,
    "POST",
    { identifier: "recover-test", name: "Andrea" },
    null,
  );
  const socket = new WebSocket(
    `${base.replace("http", "ws")}/api${route}/socket`,
    { origin: "http://127.0.0.1:4173" },
  );
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const authenticated = new Promise((resolve) =>
    socket.once("message", resolve),
  );
  socket.send(
    JSON.stringify({ type: "auth", role: "participant", token: p.token }),
  );
  await authenticated;
  const closed = new Promise((resolve) => socket.once("close", resolve));
  const state = await api(`${route}/state`);
  const recovered = await api(`${route}/recover`, "POST", {
    playerId: state.players[0].id,
    requestId: uid(),
  });
  assert.equal(await closed, 4001);
  await api(`${route}/state`, "GET", null, p.token, 401);
  const replacement = await api(
    `${route}/join`,
    "POST",
    { identifier: "recover-test", recoveryCode: recovered.recoveryCode },
    null,
  );
  assert.equal(replacement.alias, p.alias);
  assert.equal(replacement.avatar, p.avatar);
  assert.equal((await api(`${route}/state`)).players[0].name, "Andrea");
  await api(
    `${route}/join`,
    "POST",
    { identifier: "recover-test", recoveryCode: recovered.recoveryCode },
    null,
    409,
  );
  await api(`${route}/commands`, "POST", {
    requestId: uid(),
    expectedStep: state.step,
    action: "finish",
  });
});
test("respaldo revisado, restauración sin sobrescribir y detección de catálogo cambiado", async () => {
  const quiz = fixture(1);
  const created = await api("/quizzes", "POST", { requestId: uid(), quiz });
  await api(`/quizzes/${created.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: 1,
  });
  const backup = await api("/catalog.json");
  const item = backup.quizzes.find((q) => q.id === created.id);
  item.id = uid();
  const catalog = { schemaVersion: 1, quizzes: [item] };
  const review = await api("/catalog/import", "POST", { catalog });
  assert.equal(review.newQuizzes, 1);
  await api("/catalog/import", "POST", {
    catalog,
    confirm: true,
    strategy: "keep-existing",
    fingerprint: review.fingerprint,
  });
  assert.equal(
    (await api(`/quizzes/${item.id}/versions/1`)).hash,
    item.versions[0].hash,
  );
  const again = await api("/catalog/import", "POST", { catalog });
  assert.equal(again.newQuizzes, 0);
  assert.equal(again.newVersions, 0);
  await api("/quizzes", "POST", { requestId: uid(), quiz: fixture(1) });
  await api(
    "/catalog/import",
    "POST",
    {
      catalog,
      confirm: true,
      strategy: "keep-existing",
      fingerprint: again.fingerprint,
    },
    secret,
    409,
  );
  catalog.quizzes[0].versions[0].quiz.title = "Alteración";
  await api("/catalog/import", "POST", { catalog }, secret, 400);
  const withGap = structuredClone(item);
  withGap.versions[0].quiz.title = quiz.title;
  withGap.versions[0].version = 2;
  await api(
    "/catalog/import",
    "POST",
    { catalog: { schemaVersion: 1, quizzes: [withGap] } },
    secret,
    400,
  );
});
test("50 preguntas de texto máximo se publican y exportan sin un valor creciente de respuestas", async () => {
  const quiz = fixture(50);
  quiz.title = "Título ".padEnd(120, "a");
  for (const [i, q] of quiz.questions.entries()) {
    q.prompt = `${i} `.padEnd(800, "x");
    q.explanation = "Explicación ".padEnd(2000, "e");
    q.options.forEach((o, j) => (o.text = `${j} `.padEnd(250, "o")));
    q.answerSeconds = 600;
  }
  const created = await api("/quizzes", "POST", { requestId: uid(), quiz });
  await api(`/quizzes/${created.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: 1,
  });
  const { code } = await api("/rooms", "POST", {
    requestId: uid(),
    quizId: created.id,
    version: 1,
  });
  const route = `/rooms/${code}`;
  const p = await api(
    `${route}/join`,
    "POST",
    { identifier: "max-text", name: "Persona de prueba" },
    null,
  );
  let state = await api(`${route}/state`);
  async function command(action) {
    state = await api(`${route}/commands`, "POST", {
      requestId: uid(),
      expectedStep: state.step,
      action,
    });
  }
  await command("start");
  for (let i = 0; i < 50; i++) {
    await command("open");
    await api(
      `${route}/answers`,
      "POST",
      {
        questionId: quiz.questions[i].id,
        optionId: quiz.questions[i].correctOptionId,
      },
      p.token,
    );
    state = await api(`${route}/state`);
    if (i < 49) await command("next");
  }
  await command("finish");
  assert.equal(state.summary.length, 50);
  assert.ok(state.ranking[0].points >= 50000);
  const response = await fetch(`${base}/api${route}/answers.csv`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  assert.equal((await response.text()).split("\r\n").length, 52);
});
test("una versión manual recorre sala, lectura, respuesta persistida y CSV", async () => {
  const quiz = fixture();
  const created = await api("/quizzes", "POST", { requestId: uid(), quiz });
  const publishing = { requestId: uid(), expectedRevision: created.revision };
  const version = await api(
    `/quizzes/${created.id}/publish`,
    "POST",
    publishing,
  );
  assert.deepEqual(
    await api(`/quizzes/${created.id}/publish`, "POST", publishing),
    version,
  );
  const creation = {
    requestId: uid(),
    quizId: created.id,
    version: version.version,
  };
  const room = await api("/rooms", "POST", creation);
  assert.equal((await api("/rooms", "POST", creation)).code, room.code);
  const route = `/rooms/${room.code}`;
  const player = await api(
    `${route}/join`,
    "POST",
    { identifier: "00123", name: "María" },
    null,
  );
  await api(`${route}/join`, "POST", { identifier: "00123", name: "Otra persona" }, null, 409);
  let state = await api(`${route}/state`);
  const command = async (action) => {
    state = await api(`${route}/commands`, "POST", {
      requestId: uid(),
      expectedStep: state.step,
      action,
    });
  };
  await command("start");
  assert.equal(state.phase, "reading");
  const publicState = await api(`${route}/state`, "GET", null, null);
  assert.equal(publicState.question.options, undefined);
  assert.equal(publicState.question.correctOptionId, undefined);
  assert.equal(publicState.closesAt, null);
  assert.equal(JSON.stringify(publicState).includes("00123"), false);
  await command("open");
  const answer = {
    questionId: quiz.questions[0].id,
    optionId: quiz.questions[0].correctOptionId,
  };
  const receipt = await api(`${route}/answers`, "POST", answer, player.token);
  assert.equal(receipt.accepted, true);
  assert.deepEqual(
    await api(`${route}/answers`, "POST", answer, player.token),
    receipt,
  );
  await api(
    `${route}/answers`,
    "POST",
    { ...answer, optionId: quiz.questions[0].options[1].id },
    player.token,
    409,
  );
  state = await api(`${route}/state`);
  assert.equal(state.phase, "feedback");
  assert.equal(state.closeReason, "all_answered");
  await command("next");
  await command("open");
  await new Promise((resolve) => setTimeout(resolve, 1300));
  state = await api(`${route}/state`);
  assert.equal(state.phase, "feedback");
  assert.equal(state.closeReason, "deadline");
  await command("finish");
  assert.equal(state.phase, "finished");
  assert.equal(state.summary.length, 2);
  const response = await fetch(`${base}/api${route}/answers.csv`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  assert.equal(response.status, 200);
  const report = await response.text();
  assert.equal(report.split("\r\n").length, 5);
  for (const value of ["00123", "correcta", "sin_respuesta", "no_presentada"])
    assert.ok(report.includes(value));
  const forbidden = await fetch(`${base}/api${route}/answers.csv`);
  assert.equal(forbidden.status, 401);
});
