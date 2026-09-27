import { requireThat } from "./security.mjs";
export const DAY = 86_400_000;
export const CAPACITY = 120;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requestId(value) {
  requireThat(
    typeof value === "string" && UUID.test(value),
    400,
    "REQUEST_ID",
    "La operación necesita un identificador válido.",
  );
  return value;
}
export function seconds(value) {
  requireThat(
    Number.isInteger(value) && value >= 1 && value <= 600,
    400,
    "INVALID_TIME",
    "El tiempo debe ser un entero entre 1 y 600 segundos.",
  );
  return value;
}
export function text(value, max, field) {
  requireThat(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    400,
    "INVALID_TEXT",
    `${field}: completá entre 1 y ${max} caracteres.`,
  );
  requireThat(
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u.test(
      value,
    ),
    400,
    "INVALID_TEXT",
    `${field}: contiene caracteres de control.`,
  );
  return value.trim();
}
export function normalize(value) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es");
}
export function identifier(value) {
  requireThat(
    typeof value === "string" &&
      value.trim().length >= 1 &&
      value.length <= 64 &&
      !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value),
    400,
    "INVALID_IDENTIFIER",
    "El nombre o identificador admite de 1 a 64 caracteres visibles.",
  );
  return { original: value, normalized: value.normalize("NFKC").trim() };
}
export function validateQuiz(input) {
  requireThat(
    input && typeof input === "object",
    400,
    "INVALID_QUIZ",
    "Falta el cuestionario.",
  );
  requireThat(
    Array.isArray(input.questions) &&
      input.questions.length >= 1 &&
      input.questions.length <= 50,
    400,
    "QUESTION_COUNT",
    "El cuestionario debe tener entre 1 y 50 preguntas.",
  );
  const seen = new Set();
  function id(value) {
    requestId(value);
    requireThat(
      !seen.has(value),
      400,
      "DUPLICATE_ID",
      "Cada pregunta y opción necesita un ID único.",
    );
    seen.add(value);
    return value;
  }
  const quiz = {
    schemaVersion: 1,
    title: text(input.title, 120, "Título"),
    defaultAnswerSeconds: seconds(input.defaultAnswerSeconds),
    questions: input.questions.map((q, index) => {
      requireThat(
        q && Array.isArray(q.options) && q.options.length === 4,
        400,
        "OPTION_COUNT",
        `Pregunta ${index + 1}: se requieren cuatro opciones.`,
      );
      const options = q.options.map((o) => ({
        id: id(o.id),
        text: text(o.text, 250, "Alternativa"),
      }));
      requireThat(
        new Set(options.map((o) => normalize(o.text))).size === 4,
        400,
        "DUPLICATE_OPTIONS",
        `Pregunta ${index + 1}: las cuatro opciones deben ser distintas.`,
      );
      requireThat(
        options.some((o) => o.id === q.correctOptionId),
        400,
        "CORRECT_OPTION",
        "Elegí exactamente una alternativa correcta.",
      );
      return {
        id: id(q.id),
        prompt: text(q.prompt, 800, "Pregunta"),
        options,
        correctOptionId: q.correctOptionId,
        explanation: text(q.explanation, 2000, "Explicación"),
        answerSeconds: seconds(q.answerSeconds),
      };
    }),
  };
  requireThat(
    new TextEncoder().encode(JSON.stringify(quiz)).length <= 512 * 1024,
    413,
    "QUIZ_TOO_LARGE",
    "El cuestionario supera 512 KiB.",
  );
  return quiz;
}
export function randomInt(max) {
  const limit = 2 ** 32 - (2 ** 32 % max);
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % max;
}
export function shuffle(options) {
  const result = options.map((o) => ({ ...o }));
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function score(correct, elapsedMs, assignedSeconds) {
  if (!correct || elapsedMs < 0 || elapsedMs >= assignedSeconds * 1000)
    return 0;
  return 1000 + Math.round(250 * (1 - elapsedMs / (assignedSeconds * 1000)));
}
const animals = [
  "Lince",
  "Zorro",
  "Búho",
  "Puma",
  "Koala",
  "Panda",
  "Tucán",
  "Quetzal",
  "Colibrí",
  "Delfín",
];
const colors = [
  "Menta",
  "Coral",
  "Ámbar",
  "Lima",
  "Cielo",
  "Nube",
  "Índigo",
  "Jade",
  "Cobre",
  "Lila",
  "Sol",
  "Luna",
];
export function identity(index) {
  return {
    alias: `${animals[Math.floor(index / colors.length)]} ${colors[index % colors.length]}`,
    avatar: index,
  };
}
export function rank(players) {
  const rows = [...players].sort(
    (a, b) => b.points - a.points || a.alias.localeCompare(b.alias),
  );
  let place = 0;
  return rows.map((p, i) => {
    if (!i || p.points !== rows[i - 1].points) place = i + 1;
    return { ...p, place };
  });
}
export function csv(rows) {
  const cell = (value) => {
    let s = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/u.test(s) || /^[\t\r\n]/u.test(s))
      s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
