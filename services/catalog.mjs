import { DurableObject } from "cloudflare:workers";
import {
  json,
  errorResponse,
  requireThat,
  readJson,
  digest,
} from "./security.mjs";
import { validateQuiz, requestId, randomInt, seconds, DAY } from "./rules.mjs";
export class QuizCatalog extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY, title TEXT NOT NULL, revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, create_request TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (quiz_id TEXT PRIMARY KEY, content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quiz_versions (quiz_id TEXT NOT NULL, version INTEGER NOT NULL, content TEXT NOT NULL, hash TEXT NOT NULL, publish_request TEXT UNIQUE NOT NULL, source_revision INTEGER NOT NULL, PRIMARY KEY (quiz_id,version));
      CREATE TABLE IF NOT EXISTS room_registry (code TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, quiz_id TEXT NOT NULL, version INTEGER NOT NULL, times TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    `);
    if (
      !this.sql.exec("PRAGMA table_info(room_registry)").toArray()
        .some(c => c.name === "name_mode")
    )
      this.sql.exec(
        "ALTER TABLE room_registry ADD COLUMN name_mode TEXT NOT NULL DEFAULT 'alias'",
      );
  }
  row(query, ...args) {
    return this.sql.exec(query, ...args).toArray()[0];
  }
  quiz(id) {
    const q = this.row("SELECT * FROM quizzes WHERE id=?", id);
    requireThat(q, 404, "QUIZ_NOT_FOUND", "No se encontró el cuestionario.");
    return q;
  }
  version(id, version) {
    const v = this.row(
      "SELECT * FROM quiz_versions WHERE quiz_id=? AND version=?",
      id,
      version,
    );
    requireThat(v, 404, "VERSION_NOT_FOUND", "No se encontró la versión.");
    return v;
  }
  backup() {
    return {
      schemaVersion: 1,
      quizzes: this.sql
        .exec("SELECT * FROM quizzes ORDER BY id")
        .toArray()
        .map((q) => ({
          id: q.id,
          revision: q.revision,
          archived: Boolean(q.archived),
          updatedAt: q.updated_at,
          draft: JSON.parse(
            this.row("SELECT content FROM drafts WHERE quiz_id=?", q.id)
              .content,
          ),
          versions: this.sql
            .exec(
              "SELECT version,content,hash,source_revision FROM quiz_versions WHERE quiz_id=? ORDER BY version",
              q.id,
            )
            .toArray()
            .map((v) => ({
              version: v.version,
              quiz: JSON.parse(v.content),
              hash: v.hash,
              sourceRevision: v.source_revision,
            })),
        })),
    };
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const data =
        request.method === "GET"
          ? null
          : await readJson(
              request,
              path === "/api/catalog/import" ? 16 * 1024 * 1024 : 540 * 1024,
            );
      if (path === "/api/catalog.json" && request.method === "GET")
        return json(this.backup());
      if (path === "/api/catalog/import" && request.method === "POST") {
        const backup = data.catalog;
        requireThat(
          backup?.schemaVersion === 1 &&
            Array.isArray(backup.quizzes) &&
            backup.quizzes.length <= 1000,
          400,
          "INVALID_BACKUP",
          "El respaldo no tiene un formato válido.",
        );
        const seen = new Set();
        const entries = [];
        for (const q of backup.quizzes) {
          requestId(q.id);
          requireThat(
            !seen.has(q.id),
            400,
            "INVALID_BACKUP",
            "Hay cuestionarios repetidos en el respaldo.",
          );
          seen.add(q.id);
          requireThat(
            Number.isInteger(q.revision) &&
              q.revision > 0 &&
              typeof q.archived === "boolean" &&
              Number.isFinite(q.updatedAt) &&
              Array.isArray(q.versions) &&
              q.versions.length <= 1000,
            400,
            "INVALID_BACKUP",
            "Metadatos de respaldo inválidos.",
          );
          const versions = [];
          const versionNumbers = new Set();
          for (const v of q.versions) {
            requireThat(
              Number.isInteger(v.version) &&
                v.version > 0 &&
                v.version <= q.versions.length &&
                !versionNumbers.has(v.version) &&
                Number.isInteger(v.sourceRevision) &&
                v.sourceRevision > 0,
              400,
              "INVALID_BACKUP",
              "Las versiones del respaldo deben ser consecutivas desde 1.",
            );
            versionNumbers.add(v.version);
            const quiz = validateQuiz(v.quiz);
            const hash = await digest(JSON.stringify(quiz));
            requireThat(
              hash === v.hash,
              400,
              "BACKUP_HASH",
              "Una versión no coincide con su hash. No se importó nada.",
            );
            versions.push({ ...v, quiz, hash });
          }
          entries.push({ ...q, draft: validateQuiz(q.draft), versions });
        }
        const before = this.backup();
        const fingerprint = await digest(JSON.stringify(before));
        const conflicts = [];
        let newQuizzes = 0,
          newVersions = 0;
        for (const q of entries) {
          const current = before.quizzes.find((x) => x.id === q.id);
          if (!current) {
            newQuizzes++;
            newVersions += q.versions.length;
            continue;
          }
          if (
            JSON.stringify(current.draft) !== JSON.stringify(q.draft) ||
            current.archived !== q.archived
          )
            conflicts.push({
              quizId: q.id,
              message:
                "El borrador o el estado de archivo difiere. Se conservará el catálogo actual.",
            });
          for (const v of q.versions) {
            const old = current.versions.find((x) => x.version === v.version);
            if (old && old.hash !== v.hash)
              conflicts.push({
                quizId: q.id,
                version: v.version,
                message:
                  "Una versión inmutable tiene contenido distinto. Se conservará la versión actual.",
              });
            else if (!old) newVersions++;
          }
        }
        if (!data.confirm)
          return json({ fingerprint, newQuizzes, newVersions, conflicts });
        requireThat(
          data.fingerprint === fingerprint,
          409,
          "CATALOG_CHANGED",
          "El catálogo cambió. Revisá otra vez la vista previa del respaldo.",
        );
        requireThat(
          data.strategy === "keep-existing",
          400,
          "RESTORE_STRATEGY",
          "Confirmá que se conservarán los datos actuales ante conflictos.",
        );
        return json(
          this.ctx.storage.transactionSync(() => {
            requireThat(
              JSON.stringify(this.backup()) === JSON.stringify(before),
              409,
              "CATALOG_CHANGED",
              "El catálogo cambió durante la revisión. Reintentá.",
            );
            for (const q of entries) {
              const current = this.row(
                "SELECT id FROM quizzes WHERE id=?",
                q.id,
              );
              if (!current) {
                this.sql.exec(
                  "INSERT INTO quizzes VALUES (?,?,?,?,?,?)",
                  q.id,
                  q.draft.title,
                  q.revision,
                  Number(q.archived),
                  q.updatedAt,
                  crypto.randomUUID(),
                );
                this.sql.exec(
                  "INSERT INTO drafts VALUES (?,?)",
                  q.id,
                  JSON.stringify(q.draft),
                );
              }
              for (const v of q.versions)
                if (
                  !this.row(
                    "SELECT hash FROM quiz_versions WHERE quiz_id=? AND version=?",
                    q.id,
                    v.version,
                  )
                )
                  this.sql.exec(
                    "INSERT INTO quiz_versions VALUES (?,?,?,?,?,?)",
                    q.id,
                    v.version,
                    JSON.stringify(v.quiz),
                    v.hash,
                    crypto.randomUUID(),
                    v.sourceRevision,
                  );
            }
            return { newQuizzes, newVersions, conflicts, restored: true };
          }),
        );
      }
      if (path === "/api/quizzes" && request.method === "GET") {
        const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
        const search = (url.searchParams.get("search") || "").slice(0, 120);
        const archived = url.searchParams.get("archived") === "true";
        const rows = this.sql
          .exec(
            "SELECT q.*, json_array_length(d.content,'$.questions') AS question_count, (SELECT MAX(version) FROM quiz_versions v WHERE v.quiz_id=q.id) AS version FROM quizzes q JOIN drafts d ON d.quiz_id=q.id WHERE q.archived=? AND instr(lower(q.title),lower(?))>0 ORDER BY updated_at DESC LIMIT 50 OFFSET ?",
            Number(archived),
            search,
            offset,
          )
          .toArray();
        return json({
          quizzes: rows.map((q) => ({
            id: q.id,
            title: q.title,
            revision: q.revision,
            questionCount: q.question_count,
            archived: Boolean(q.archived),
            updatedAt: q.updated_at,
            version: q.version || 0,
          })),
          nextOffset: rows.length === 50 ? offset + 50 : null,
        });
      }
      if (path === "/api/quizzes" && request.method === "POST") {
        requestId(data.requestId);
        const content = validateQuiz(data.quiz);
        const result = this.ctx.storage.transactionSync(() => {
          const prior = this.row(
            "SELECT * FROM quizzes WHERE create_request=?",
            data.requestId,
          );
          if (prior) return { id: prior.id, revision: prior.revision };
          const id = crypto.randomUUID();
          this.sql.exec(
            "INSERT INTO quizzes (id,title,revision,updated_at,create_request) VALUES (?,?,1,?,?)",
            id,
            content.title,
            Date.now(),
            data.requestId,
          );
          this.sql.exec(
            "INSERT INTO drafts VALUES (?,?)",
            id,
            JSON.stringify(content),
          );
          return { id, revision: 1 };
        });
        return json(result);
      }
      const match = path.match(
        /^\/api\/quizzes\/([\w-]+)\/(draft|publish|archive|versions\/\d+)$/,
      );
      if (match) {
        const id = match[1];
        const action = match[2];
        this.quiz(id);
        if (action === "draft" && request.method === "GET") {
          const q = this.quiz(id);
          return json({
            id,
            revision: q.revision,
            quiz: JSON.parse(
              this.row("SELECT content FROM drafts WHERE quiz_id=?", id)
                .content,
            ),
          });
        }
        if (action === "draft" && request.method === "PUT") {
          const content = validateQuiz(data.quiz);
          return json(
            this.ctx.storage.transactionSync(() => {
              const q = this.quiz(id);
              requireThat(
                q.revision === data.expectedRevision,
                409,
                "EDIT_CONFLICT",
                "Otra persona guardó cambios. Conservá tu copia o recargá antes de guardar.",
              );
              this.sql.exec(
                "UPDATE drafts SET content=? WHERE quiz_id=?",
                JSON.stringify(content),
                id,
              );
              this.sql.exec(
                "UPDATE quizzes SET title=?,revision=revision+1,updated_at=? WHERE id=?",
                content.title,
                Date.now(),
                id,
              );
              return { id, revision: q.revision + 1 };
            }),
          );
        }
        if (action === "publish" && request.method === "POST") {
          requestId(data.requestId);
          const draft = this.row(
            "SELECT content FROM drafts WHERE quiz_id=?",
            id,
          );
          const content = JSON.stringify(
            validateQuiz(JSON.parse(draft.content)),
          );
          const hash = await digest(content);
          return json(
            this.ctx.storage.transactionSync(() => {
              const prior = this.row(
                "SELECT * FROM quiz_versions WHERE publish_request=?",
                data.requestId,
              );
              if (prior) {
                requireThat(
                  prior.quiz_id === id &&
                    prior.source_revision === data.expectedRevision,
                  409,
                  "REQUEST_CONFLICT",
                  "La operación ya se usó para otra publicación.",
                );
                return { quizId: id, version: prior.version, hash: prior.hash };
              }
              const q = this.quiz(id);
              requireThat(
                q.revision === data.expectedRevision &&
                  this.row("SELECT content FROM drafts WHERE quiz_id=?", id)
                    .content === content,
                409,
                "EDIT_CONFLICT",
                "El borrador cambió. Volvé a revisarlo antes de publicar.",
              );
              requireThat(
                !q.archived,
                409,
                "ARCHIVED",
                "Restaurá el cuestionario antes de publicar.",
              );
              const version =
                (this.row(
                  "SELECT MAX(version) AS last FROM quiz_versions WHERE quiz_id=?",
                  id,
                ).last || 0) + 1;
              this.sql.exec(
                "INSERT INTO quiz_versions VALUES (?,?,?,?,?,?)",
                id,
                version,
                content,
                hash,
                data.requestId,
                q.revision,
              );
              return { quizId: id, version, hash };
            }),
          );
        }
        if (action.startsWith("versions/") && request.method === "GET") {
          const v = this.version(id, Number(action.split("/")[1]));
          return json({
            ...JSON.parse(v.content),
            quizId: id,
            version: v.version,
            hash: v.hash,
          });
        }
        if (action === "archive" && request.method === "POST") {
          requireThat(
            typeof data.archived === "boolean",
            400,
            "INVALID_ARCHIVE",
            "Indicá si querés archivar o restaurar.",
          );
          const q = this.quiz(id);
          requireThat(
            q.revision === data.expectedRevision,
            409,
            "EDIT_CONFLICT",
            "El cuestionario cambió. Recargá el catálogo.",
          );
          this.sql.exec(
            "UPDATE quizzes SET archived=?,revision=revision+1,updated_at=? WHERE id=?",
            Number(data.archived),
            Date.now(),
            id,
          );
          return json({ id, revision: q.revision + 1 });
        }
      }
      if (path === "/api/rooms" && request.method === "GET") {
        this.sql.exec(
          "DELETE FROM room_registry WHERE expires_at<=?",
          Date.now(),
        );
        return json({
          rooms: this.sql
            .exec(
              "SELECT code,quiz_id AS quizId,version,created_at AS createdAt FROM room_registry ORDER BY created_at DESC LIMIT 50",
            )
            .toArray(),
        });
      }
      if (path === "/internal/room-expiry" && request.method === "POST") {
        this.sql.exec(
          "UPDATE room_registry SET expires_at=? WHERE code=?",
          data.expiresAt,
          data.code,
        );
        return json({ ok: true });
      }
      if (path === "/internal/reserve" && request.method === "POST") {
        requestId(data.requestId);
        const nameMode = data.nameMode ?? "alias";
        requireThat(
          ["alias", "chosen"].includes(nameMode),
          400,
          "INVALID_NAME_MODE",
          "Elegí nombres en clave o nombres elegidos.",
        );
        const reservation = this.ctx.storage.transactionSync(() => {
          const prior = this.row(
            "SELECT * FROM room_registry WHERE request_id=?",
            data.requestId,
          );
          if (prior) return prior;
          const q = this.quiz(data.quizId);
          requireThat(
            !q.archived,
            409,
            "ARCHIVED",
            "El cuestionario está archivado.",
          );
          const v = JSON.parse(this.version(data.quizId, data.version).content);
          const times = data.times ?? v.questions.map((q) => q.answerSeconds);
          requireThat(
            Array.isArray(times) && times.length === v.questions.length,
            400,
            "INVALID_TIMES",
            "Revisá el tiempo de cada pregunta.",
          );
          times.forEach(seconds);
          let code;
          do {
            code = String(100000 + randomInt(900000));
          } while (
            this.row("SELECT code FROM room_registry WHERE code=?", code)
          );
          const now = Date.now();
          this.sql.exec(
            "INSERT INTO room_registry (code,request_id,quiz_id,version,times,created_at,expires_at,name_mode) VALUES (?,?,?,?,?,?,?,?)",
            code,
            data.requestId,
            data.quizId,
            data.version,
            JSON.stringify(times),
            now,
            now + DAY,
            nameMode,
          );
          return this.row("SELECT * FROM room_registry WHERE code=?", code);
        });
        requireThat(
          reservation.expires_at > Date.now(),
          410,
          "ROOM_EXPIRED",
          "Esta creación de sala venció. Creá una ejecución nueva.",
        );
        const version = this.version(reservation.quiz_id, reservation.version);
        return json({
          code: reservation.code,
          createdAt: reservation.created_at,
          times: JSON.parse(reservation.times),
          nameMode: reservation.name_mode,
          quiz: {
            ...JSON.parse(version.content),
            quizId: reservation.quiz_id,
            version: reservation.version,
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
