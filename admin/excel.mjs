import * as XLSX from "./vendor/xlsx.mjs";
const headers = [
  "Pregunta",
  "Respuesta correcta",
  "Alternativa 2",
  "Alternativa 3",
  "Alternativa 4",
  "Explicación",
];
const limits = [800, 250, 250, 250, 250, 2000];
const normalized = (value) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("es");
export function parseExcel(bytes, filename) {
  const errors = [],
    warnings = [],
    questions = [];
  const fail = (message) => ({ errors: [message], warnings, questions: [] });
  if (!/\.xlsx$/i.test(filename))
    return fail("Elegí un archivo .xlsx sin macros ni contraseña.");
  if (bytes.byteLength > 2 * 1024 * 1024)
    return fail("El archivo supera 2 MiB.");
  const signature = new Uint8Array(
    bytes.buffer || bytes,
    bytes.byteOffset || 0,
    Math.min(4, bytes.byteLength),
  );
  if (signature[0] !== 0x50 || signature[1] !== 0x4b)
    return fail("No es un archivo .xlsx válido o está cifrado.");
  let book;
  try {
    book = XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      cellNF: true,
      cellText: true,
      cellFormula: true,
      cellStyles: true,
      bookVBA: true,
      bookFiles: true,
      sheets: "Preguntas",
      sheetRows: 10002,
    });
  } catch {
    return fail(
      "No se pudo leer el archivo. Quitá la protección y guardalo como .xlsx.",
    );
  }
  const files = book.files || {};
  const decode = (value) =>
    typeof value === "string" ? value : new TextDecoder().decode(value);
  const contentTypes = files["[Content_Types].xml"]
    ? decode(files["[Content_Types].xml"].content)
    : "";
  if (
    !contentTypes.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    ) ||
    book.vbaraw
  )
    return fail("El archivo debe ser .xlsx, sin macros.");
  if (
    Object.entries(files).some(
      ([path, file]) =>
        /^xl\/(workbook|worksheets\/sheet\d+)\.xml$/.test(path) &&
        /<(?:\w+:)?(?:sheetProtection|workbookProtection)\b/.test(
          decode(file.content),
        ),
    )
  )
    return fail("El archivo tiene protección. Quitala antes de importar.");
  const sheet = book.Sheets.Preguntas;
  if (!sheet)
    return fail(
      "Falta la hoja Preguntas. Renombrá la hoja que contiene los datos.",
    );
  if (book.SheetNames.length > 1)
    warnings.push(
      `Se ignoraron las otras hojas: ${book.SheetNames.filter((x) => x !== "Preguntas").join(", ")}.`,
    );
  if (book.Workbook?.Sheets?.find((x) => x.name === "Preguntas")?.Hidden)
    warnings.push("La hoja Preguntas está oculta y también se leerá.");
  if (sheet["!merges"]?.length)
    errors.push("Hay celdas combinadas. Separalas antes de importar.");
  const range = XLSX.utils.decode_range(
    sheet["!fullref"] || sheet["!ref"] || "A1",
  );
  if (range.e.r > 10000)
    return fail(
      "El archivo abarca más de 10.000 filas. Copiá las preguntas a la plantilla para reducirlo.",
    );
  for (let c = 0; c < 6; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell?.f || normalized(String(cell?.v ?? "")) !== normalized(headers[c]))
      errors.push(`Fila 1, ${"ABCDEF"[c]}: se espera «${headers[c]}».`);
  }
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    if (
      XLSX.utils.decode_cell(address).c > 5 &&
      ((cell.v !== undefined && String(cell.v).trim() !== "") || cell.f)
    )
      errors.push(
        `${address}: hay contenido fuera de A:F. Quitá las columnas extra.`,
      );
  }
  const prompts = new Set();
  for (let r = 1; r <= range.e.r; r++) {
    const cells = Array.from(
      { length: 6 },
      (_, c) => sheet[XLSX.utils.encode_cell({ r, c })],
    );
    if (
      cells.every(
        (c) => !c?.f && (c?.v === undefined || String(c.v).trim() === ""),
      )
    )
      continue;
    if (sheet["!rows"]?.[r]?.hidden)
      warnings.push(`Fila ${r + 1}: está oculta y se incluyó en la lectura.`);
    const countBefore = errors.length;
    const values = cells.map((cell, c) => {
      const at = `Fila ${r + 1}, ${"ABCDEF"[c]}`;
      if (cell?.f) {
        errors.push(`${at}: hay una fórmula. Pegá su texto o valor explícito.`);
        return "";
      }
      if (!cell || cell.v === undefined || String(cell.v).trim() === "") {
        errors.push(`${at}: falta ${headers[c].toLocaleLowerCase("es")}.`);
        return "";
      }
      if (!["s", "str", "n"].includes(cell.t)) {
        errors.push(
          `${at}: hay una fecha, error o tipo no admitido. Usá texto.`,
        );
        return "";
      }
      if (cell.t === "n" && XLSX.SSF.is_date(cell.z || "")) {
        errors.push(`${at}: la fecha es ambigua. Convertí la celda a texto.`);
        return "";
      }
      if (cell.t === "n")
        warnings.push(
          `${at}: se convirtió un número a su texto visible. Revisalo.`,
        );
      const value = String(
        cell.t === "n" ? (cell.w ?? XLSX.utils.format_cell(cell)) : cell.v,
      ).trim();
      if (value.length > limits[c])
        errors.push(`${at}: supera ${limits[c]} caracteres. Acortá el texto.`);
      if (
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u.test(
          value,
        )
      )
        errors.push(`${at}: contiene caracteres de control.`);
      return value;
    });
    if (new Set(values.slice(1, 5).map(normalized)).size !== 4)
      errors.push(
        `Fila ${r + 1}: hay alternativas repetidas. Escribí cuatro diferentes.`,
      );
    if (prompts.has(normalized(values[0])))
      warnings.push(
        `Fila ${r + 1}: el enunciado está repetido. Revisalo antes de guardar.`,
      );
    prompts.add(normalized(values[0]));
    if (countBefore === errors.length) {
      const options = values
        .slice(1, 5)
        .map((text) => ({ id: crypto.randomUUID(), text }));
      questions.push({
        id: crypto.randomUUID(),
        prompt: values[0],
        options,
        correctOptionId: options[0].id,
        explanation: values[5],
        answerSeconds: 15,
      });
    }
  }
  if (questions.length < 1 || questions.length > 50)
    errors.push("Se necesitan entre 1 y 50 preguntas válidas.");
  if (
    new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        title: "x".repeat(120),
        defaultAnswerSeconds: 15,
        questions,
      }),
    ).length >
    512 * 1024
  )
    errors.push("Las preguntas superan el tamaño total de 512 KiB.");
  return { errors, warnings, questions: errors.length ? [] : questions };
}
