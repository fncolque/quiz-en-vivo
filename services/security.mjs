export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function requireThat(condition, status, code, message) {
  if (!condition) throw new AppError(status, code, message);
}
export function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function errorResponse(error) {
  if (
    /Exceeded allowed rows (read|written) in Durable Objects free tier/.test(
      error.message || "",
    )
  )
    return json(
      {
        error: {
          code: "STORAGE_QUOTA",
          message:
            "El servicio alcanzó su cupo diario de lecturas o escrituras. Se restablece a las 00:00 UTC.",
        },
      },
      503,
    );
  return json(
    {
      error: {
        code: error.code || "INTERNAL",
        message:
          error instanceof AppError
            ? error.message
            : "No se pudo completar la operación. Reintentá.",
      },
    },
    error.status || 500,
  );
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function isMaster(value, env) {
  if (!env.MASTER_SECRET || !value || value.length > 512) return false;
  const [a, b] = await Promise.all([digest(value), digest(env.MASTER_SECRET)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export function bearer(request) {
  return (
    request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1] || ""
  );
}
export async function readJson(request, max = 540 * 1024) {
  requireThat(
    request.headers.get("content-type")?.split(";")[0] === "application/json",
    400,
    "CONTENT_TYPE",
    "Se requiere JSON.",
  );
  const reader = request.body?.getReader();
  requireThat(reader, 400, "EMPTY_BODY", "Faltan los datos.");
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      throw new AppError(
        413,
        "TOO_LARGE",
        "El contenido supera el tamaño permitido.",
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError(400, "INVALID_JSON", "No se pudo leer el contenido.");
  }
}
