import { parseExcel } from "./excel.mjs";
self.onmessage = (event) => {
  try {
    self.postMessage(parseExcel(event.data.bytes, event.data.filename));
  } catch {
    self.postMessage({
      errors: ["No se pudo interpretar el archivo. Revisá la plantilla."],
      warnings: [],
      questions: [],
    });
  }
};
