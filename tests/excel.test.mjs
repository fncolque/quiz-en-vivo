import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as XLSX from "../admin/vendor/xlsx.mjs";
import { parseExcel } from "../admin/excel.mjs";
const headers = [
  "Pregunta",
  "Respuesta correcta",
  "Alternativa 2",
  "Alternativa 3",
  "Alternativa 4",
  "Explicación",
];
const row = [
  "¿Cuánto es uno más uno?",
  "Dos",
  "Tres",
  "Cuatro",
  "Cinco",
  "Uno más uno es dos.",
];
function file(rows, modify = () => {}) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(book, sheet, "Preguntas");
  modify(sheet, book);
  return XLSX.write(book, { type: "array", bookType: "xlsx" });
}
test("la plantilla del kit produce tres preguntas con B correcta y conserva Unicode", async () => {
  const bytes = await readFile(
    new URL("../admin/plantilla-preguntas.xlsx", import.meta.url),
  );
  const result = parseExcel(bytes, "preguntas.xlsx");
  assert.deepEqual(result.errors, []);
  assert.equal(result.questions.length, 3);
  assert.match(result.questions[0].prompt, /¿Qué/);
  assert.equal(
    result.questions[0].correctOptionId,
    result.questions[0].options[0].id,
  );
  assert.equal(result.questions[0].explanation.includes("aceptación"), true);
});
test("Excel rechaza conjunto parcial, fórmulas, columnas extra, repetidos y protección", () => {
  const cases = [
    file([headers, [...row.slice(0, 5), ""]]),
    file([headers, row], (s) => {
      s.B2 = { t: "n", v: 2, f: "1+1" };
    }),
    file([headers, [...row, "extra"]]),
    file([headers, [row[0], "Dos", " DOS ", ...row.slice(3)]]),
    file([headers, row], (s) => {
      s["!protect"] = { password: "test" };
    }),
  ];
  for (const bytes of cases) {
    const result = parseExcel(bytes, "preguntas.xlsx");
    assert.ok(result.errors.length);
    assert.deepEqual(result.questions, []);
  }
});
test("ignora filas vacías y avisa sobre números, ocultas y hojas adicionales", () => {
  const bytes = file(
    [headers, [], ["Porcentaje", 75, "10", "20", "30", "Es 75."]],
    (s, b) => {
      s["!rows"] = [{}, {}, { hidden: true }];
      XLSX.utils.book_append_sheet(
        b,
        XLSX.utils.aoa_to_sheet([["Texto"]]),
        "Notas",
      );
    },
  );
  const result = parseExcel(bytes, "preguntas.xlsx");
  assert.deepEqual(result.errors, []);
  assert.equal(result.questions.length, 1);
  assert.equal(result.warnings.length, 3);
});
