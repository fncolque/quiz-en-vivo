import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import WebSocket from "ws";
import * as XLSX from "../admin/vendor/xlsx.mjs";

// Run explicitly against the chosen installation. Nothing is deployed by this script.
const base = process.env.TEST_BASE_URL;
const secret = process.env.TEST_MASTER_SECRET;
const origin = process.env.PUBLIC_BASE_URL
  ? new URL(process.env.PUBLIC_BASE_URL).origin
  : null;
if (!base || !secret || !origin)
  throw new Error(
    "Configurar TEST_BASE_URL, TEST_MASTER_SECRET y PUBLIC_BASE_URL antes de ejecutar.",
  );
const duration = Number(process.env.LOAD_DURATION_SECONDS || 2400) * 1000;
assert.ok(
  Number.isFinite(duration) && duration > 0,
  "La duración debe ser positiva.",
);
if (
  duration < 2400000 &&
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname)
)
  throw new Error("La aceptación remota requiere al menos 40 minutos.");
const uid = () => crypto.randomUUID();
const report = {
  startedAt: new Date().toISOString(),
  target: base,
  plannedDurationSeconds: duration / 1000,
  players: 120,
  questions: 15,
  passed: false,
  accepted: 0,
  omissions: 7,
  reconnections: 0,
  latenciesMs: [],
  publicStates: 0,
};
const sockets = [];
let roomPath, state, heartbeat, socketFailure, quiz;
const pause = (ms) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
async function request(
  path,
  method = "GET",
  body,
  token = secret,
  expected = 200,
) {
  if (socketFailure) throw socketFailure;
  const start = performance.now();
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: token === secret ? new URL(base).origin : origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(res.status, expected, `${method} ${path}: estado ${res.status}`);
  const data = await res.json();
  if (path.endsWith("/answers") && expected === 200)
    report.latenciesMs.push(performance.now() - start);
  return data;
}
async function socket(role, token) {
  const ws = new WebSocket(
    `${base.replace(/^http/, "ws")}/api${roomPath}/socket`,
    { origin: role === "host" ? new URL(base).origin : origin },
  );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("El socket no confirmó autenticación.")),
      15000,
    );
    ws.once("open", () =>
      ws.send(JSON.stringify({ type: "auth", role, token })),
    );
    ws.once("error", reject);
    ws.once("message", (raw) => {
      clearTimeout(timeout);
      try {
        assert.equal(JSON.parse(raw.toString()).type, "state");
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  ws.on("error", (error) => {
    socketFailure = error;
  });
  ws.on("message", (raw) => {
    try {
      if (raw.toString() === "pong") return;
      const message = JSON.parse(raw.toString());
      if (role === "public") {
        report.publicStates++;
        assert.equal(JSON.stringify(message).includes("synthetic-"), false);
        assert.equal(JSON.stringify(message).includes("Persona sintética"), false);
        if (["lobby", "reading", "answering"].includes(message.state?.phase)) {
          assert.equal(message.state.question?.correctOptionId, undefined);
          assert.equal(message.state.question?.explanation, undefined);
        }
      }
    } catch (error) {
      socketFailure = error;
    }
  });
  return ws;
}
try {
  const questions = Array.from({ length: 15 }, (_, i) => {
    const options = ["Dos", "Tres", "Cuatro", "Cinco"].map((text) => ({
      id: uid(),
      text,
    }));
    return {
      id: uid(),
      prompt: `Pregunta sintética ${i + 1}: ¿cuánto es 1 + 1?`,
      options,
      correctOptionId: options[0].id,
      explanation: "Uno más uno es dos.",
      answerSeconds: [15, 30, 60, 23][i % 4],
    };
  });
  quiz = await request("/quizzes", "POST", {
    requestId: uid(),
    quiz: {
      title: `Carga sintética ${report.startedAt}`,
      defaultAnswerSeconds: 15,
      questions,
    },
  });
  const version = await request(`/quizzes/${quiz.id}/publish`, "POST", {
    requestId: uid(),
    expectedRevision: quiz.revision,
  });
  const room = await request("/rooms", "POST", {
    requestId: uid(),
    quizId: quiz.id,
    version: version.version,
  });
  roomPath = `/rooms/${room.code}`;
  report.code = room.code;
  const participants = await Promise.all(
    Array.from({ length: 120 }, (_, i) =>
      request(
        `${roomPath}/join`,
        "POST",
        {
          identifier: `synthetic-${String(i).padStart(3, "0")}`,
          name: `Persona sintética ${i}`,
        },
        null,
      ),
    ),
  );
  assert.equal(new Set(participants.map((p) => p.alias)).size, 120);
  await request(
    `${roomPath}/join`,
    "POST",
    { identifier: "synthetic-121", name: "Sin lugar" },
    null,
    409,
  );
  for (const p of participants)
    sockets.push(await socket("participant", p.token));
  const hostSocket = await socket("host", secret);
  sockets.push(hostSocket, await socket("public"));
  heartbeat = setInterval(() => {
    for (const ws of sockets)
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
  }, 25000);
  state = await request(`${roomPath}/state`);
  const begin = Date.now();
  report.playStartedAt = new Date(begin).toISOString();
  console.log(`Sala ${room.code}: 120 participantes y 122 conexiones. Inicio ${report.playStartedAt}.`);
  async function command(action) {
    state = await request(`${roomPath}/commands`, "POST", {
      requestId: uid(),
      expectedStep: state.step,
      action,
    });
  }
  await command("start");
  const expected = [];
  for (let i = 0; i < 15; i++) {
    const q = questions[i];
    for (let j = 0; j < 5; j++) {
      sockets[j].terminate();
      sockets[j] = await socket("participant", participants[j].token);
      report.reconnections++;
    }
    // Browser preflight is cached. Represent its renewal every four questions.
    if (i % 4 === 0)
      await Promise.all(
        participants.map(() =>
          fetch(`${base}/api${roomPath}/answers`, {
            method: "OPTIONS",
            headers: {
              Origin: origin,
              "Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers": "authorization,content-type",
            },
          }).then((r) => assert.equal(r.status, 204)),
        ),
      );
    await command("open");
    if (i === 7) hostSocket.close();
    const omit = i % 2 === 1;
    const answering = participants.slice(0, omit ? 119 : 120);
    await Promise.all(
      answering.map(async (p, j) => {
        await pause(20 + (j % 12) * 25);
        const correct = j % 4 !== 0;
        const answer = {
          questionId: q.id,
          optionId: q.options[correct ? 0 : 1].id,
        };
        const receipt = await request(
          `${roomPath}/answers`,
          "POST",
          answer,
          p.token,
        );
        assert.equal(receipt.accepted, true);
        expected.push({
          questionId: q.id,
          identifier: `synthetic-${String(j).padStart(3, "0")}`,
          result: correct ? "correcta" : "incorrecta",
        });
        report.accepted++;
        if (j < 5)
          assert.deepEqual(
            await request(`${roomPath}/answers`, "POST", answer, p.token),
            receipt,
          );
        if (j === 0)
          await request(
            `${roomPath}/answers`,
            "POST",
            { ...answer, optionId: q.options[2].id },
            p.token,
            409,
          );
      }),
    );
    if (omit) await pause(state.closesAt - Date.now() + 400);
    state = await request(`${roomPath}/state`);
    assert.equal(state.phase, "feedback");
    assert.equal(state.closeReason, omit ? "deadline" : "all_answered");
    await pause(begin + ((i + 1) * duration) / 15 - Date.now());
    console.log(
      `Pregunta ${i + 1}/15: ${answering.length} respuestas; ${state.closeReason}.`,
    );
    if (i < 14) await command("next");
  }
  await command("finish");
  clearInterval(heartbeat);
  const response = await fetch(`${base}/api${roomPath}/answers.csv`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  assert.equal(response.status, 200);
  const workbook = XLSX.read(await response.text(), {
    type: "string",
    raw: true,
  });
  const rows = XLSX.utils.sheet_to_json(
    workbook.Sheets[workbook.SheetNames[0]],
    { raw: true },
  );
  assert.equal(rows.length, 1800);
  assert.equal(rows.filter((r) => r.resultado === "sin_respuesta").length, 7);
  for (const item of expected)
    assert.ok(
      rows.some(
        (r) =>
          r.pregunta_id === item.questionId &&
          r.identificador === item.identifier &&
          r.resultado === item.result,
      ),
    );
  assert.equal(report.accepted, 1793);
  const receivedSummary = state.summary.reduce((sum, q) => sum + q.received, 0);
  assert.equal(receivedSummary, 1793);
  for (const row of rows) {
    const points =
      row.resultado === "correcta"
        ? 1000 +
          Math.round(
            250 *
              (1 -
                Number(row.transcurrido_ms) /
                  (Number(row.tiempo_segundos) * 1000)),
          )
        : 0;
    assert.equal(Number(row.puntos), points);
  }
  const rankingResponse = await fetch(`${base}/api${roomPath}/results.csv`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  assert.equal(rankingResponse.status, 200);
  const rankingBook = XLSX.read(await rankingResponse.text(), {
    type: "string",
    raw: true,
  });
  const ranking = XLSX.utils.sheet_to_json(
    rankingBook.Sheets[rankingBook.SheetNames[0]],
  );
  assert.equal(ranking.length, 120);
  for (const entry of ranking) {
    const total = rows
      .filter((r) => r.identificador === entry.identificador)
      .reduce((sum, r) => sum + Number(r.puntos), 0);
    assert.equal(Number(entry.puntos), total);
    assert.equal(
      state.ranking.find((p) => p.alias === entry.personaje).points,
      total,
    );
    assert.equal(
      Number(entry.puesto),
      1 + ranking.filter((p) => Number(p.puntos) > total).length,
    );
  }
  const podiumResponse = await fetch(
    `${base}/api${roomPath}/results.csv?scope=podium`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  assert.equal(podiumResponse.status, 200);
  const podiumBook = XLSX.read(await podiumResponse.text(), {
    type: "string",
    raw: true,
  });
  assert.deepEqual(
    XLSX.utils.sheet_to_json(podiumBook.Sheets[podiumBook.SheetNames[0]]),
    ranking.filter((p) => Number(p.puesto) <= 3),
  );
  assert.ok(report.publicStates > 15);
  if (socketFailure) throw socketFailure;
  report.actualDurationSeconds = (Date.now() - begin) / 1000;
  assert.ok(report.actualDurationSeconds >= duration / 1000);
  report.csvRows = rows.length;
  await request(`/quizzes/${quiz.id}/archive`, "POST", {
    archived: true,
    expectedRevision: quiz.revision,
  });
  report.passed = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  for (const ws of sockets) ws.terminate();
  report.finishedAt = new Date().toISOString();
  const sorted = report.latenciesMs.sort((a, b) => a - b);
  report.latencyP95Ms = sorted[Math.floor(sorted.length * 0.95)] || null;
  delete report.latenciesMs;
  await mkdir("artifacts", { recursive: true });
  const path = `artifacts/load-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(`${report.passed ? "PASS" : "FAIL"}: ${path}`);
  process.exit(process.exitCode || 0);
}
