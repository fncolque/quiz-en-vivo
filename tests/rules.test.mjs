import test from "node:test";
import assert from "node:assert/strict";
import { errorResponse } from "../services/security.mjs";
import {
  seconds,
  score,
  identifier,
  identity,
  rank,
  csv,
  validateQuiz,
} from "../services/rules.mjs";
test("el agotamiento de la cuota informa indisponibilidad y su reinicio", async () => {
  const response = errorResponse(
    new Error("Exceeded allowed rows read in Durable Objects free tier."),
  );
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.error.code, "STORAGE_QUOTA");
  assert.match(result.error.message, /00:00 UTC/);
});
test("el tiempo es entero y el bono se normaliza por pregunta", () => {
  for (const s of [1, 15, 30, 60, 600]) assert.equal(seconds(s), s);
  for (const s of [0, -1, 1.5, 601, "15", "", null])
    assert.throws(() => seconds(s));
  assert.equal(score(true, 30000, 60), 1125);
  assert.equal(score(true, 7500, 15), 1125);
  assert.equal(score(true, 15000, 15), 0);
  assert.equal(score(false, 10, 60), 0);
});
test("identificadores como texto, 120 alias y empates deportivos", () => {
  assert.deepEqual(identifier(" 0012 "), {
    original: " 0012 ",
    normalized: "0012",
  });
  assert.throws(() => identifier("a\u200bb"));
  assert.equal(
    new Set(Array.from({ length: 120 }, (_, i) => identity(i).alias)).size,
    120,
  );
  assert.deepEqual(
    rank([
      { alias: "A", points: 100 },
      { alias: "B", points: 100 },
      { alias: "C", points: 50 },
    ]).map((x) => x.place),
    [1, 1, 3],
  );
});
test("CSV conserva comillas y saltos y neutraliza fórmulas", () => {
  assert.equal(
    csv([["0012", 'hola, "ronda"', "=1+1", "  @SUM(A1)", "texto\ncon salto"]]),
    '\uFEFF"0012","hola, ""ronda""","\'=1+1","\'  @SUM(A1)","texto\ncon salto"\r\n',
  );
});
test("valida límites de preguntas y alternativas normalizadas", () => {
  const make = () => {
    const options = ["Uno", "Dos", "Tres", "Cuatro"].map((text) => ({
      id: crypto.randomUUID(),
      text,
    }));
    return {
      id: crypto.randomUUID(),
      prompt: "Pregunta",
      options,
      correctOptionId: options[0].id,
      explanation: "Explicación",
      answerSeconds: 15,
    };
  };
  const quiz = {
    title: "Título",
    defaultAnswerSeconds: 15,
    questions: [make()],
  };
  assert.equal(validateQuiz(quiz).questions.length, 1);
  assert.equal(
    validateQuiz({ ...quiz, questions: Array.from({ length: 50 }, make) })
      .questions.length,
    50,
  );
  assert.throws(() => validateQuiz({ ...quiz, questions: [] }));
  assert.throws(() =>
    validateQuiz({ ...quiz, questions: Array.from({ length: 51 }, make) }),
  );
  quiz.questions[0].options[1].text = " UNO ";
  assert.throws(
    () => validateQuiz(quiz),
    (e) => e.code === "DUPLICATE_OPTIONS",
  );
});
