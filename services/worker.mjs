import {
  bearer,
  isMaster,
  json,
  errorResponse,
  requireThat,
  readJson,
  digest,
} from "./security.mjs";
export { QuizCatalog } from "./catalog.mjs";
export { QuizRoom } from "./room.mjs";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = [new URL(env.PUBLIC_BASE_URL).origin, url.origin];
    let response;
    try {
      requireThat(
        !origin || allowed.includes(origin),
        403,
        "ORIGIN_FORBIDDEN",
        "Este origen no está habilitado.",
      );
      if (request.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else if (url.pathname === "/health")
        response = json({
          ok: true,
          revision: env.WORKER_VERSION?.id || env.REVISION,
        });
      else if (!url.pathname.startsWith("/api/"))
        response = await env.ASSETS.fetch(request);
      else {
        const token = bearer(request);
        const master = await isMaster(token, env);
        const role = master ? "host" : token ? "participant" : "public";
        const catalogRoute =
          /^\/api\/(quizzes(?:\/.*)?|rooms|catalog\.json|catalog\/import)$/.test(
            url.pathname,
          );
        const roomRoute = url.pathname.match(
          /^\/api\/rooms\/(\d{6})\/(join|state|socket|answers|commands|recover|answers\.csv|results\.csv)$/,
        );
        const privateRoute =
          catalogRoute ||
          (roomRoute &&
            ["commands", "recover", "answers.csv", "results.csv"].includes(
              roomRoute[2],
            ));
        if (privateRoute && !master) {
          if (env.AUTH_RATE_LIMIT) {
            const limit = await env.AUTH_RATE_LIMIT.limit({
              key: `ronda:${request.headers.get("CF-Connecting-IP") || "local"}`,
            });
            requireThat(
              limit.success,
              429,
              "AUTH_RATE_LIMIT",
              "Demasiados intentos. Esperá un minuto.",
            );
          }
          requireThat(
            false,
            401,
            "AUTH_REQUIRED",
            "Ingresá la contraseña de creadores.",
          );
        }
        const headers = new Headers(request.headers);
        headers.delete("Authorization");
        headers.set("X-Ronda-Role", role);
        headers.delete("X-Ronda-Token-Hash");
        if (role === "participant")
          headers.set("X-Ronda-Token-Hash", await digest(token));
        const catalog = env.CATALOG.getByName("catalog");
        if (url.pathname === "/api/rooms" && request.method === "POST") {
          const body = await readJson(request);
          const reservation = await catalog.fetch(
            new Request("https://internal/internal/reserve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
          );
          if (!reservation.ok) response = reservation;
          else {
            const data = await reservation.json();
            const result = await env.ROOMS.getByName(data.code).fetch(
              new Request("https://internal/initialize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              }),
            );
            response = result.ok
              ? json({
                  code: data.code,
                  playerUrl: new URL(
                    `jugar.html?room=${data.code}`,
                    env.PUBLIC_BASE_URL,
                  ).href,
                  projectionUrl: new URL(
                    `proyectar.html?room=${data.code}`,
                    env.PUBLIC_BASE_URL,
                  ).href,
                })
              : result;
          }
        } else if (url.pathname === "/api/rooms" && request.method === "GET") {
          const registry = await (
            await catalog.fetch(new Request(request, { headers }))
          ).json();
          const rooms = await Promise.all(
            registry.rooms.map(async (room) => {
              const result = await env.ROOMS.getByName(room.code).fetch(
                new Request(`https://internal/api/rooms/${room.code}/state`),
              );
              if (!result.ok) return null;
              const state = await result.json();
              return {
                ...room,
                title: state.title,
                phase: state.phase,
                expiresAt: state.expiresAt,
              };
            }),
          );
          response = json({ rooms: rooms.filter(Boolean) });
        } else if (catalogRoute)
          response = await catalog.fetch(new Request(request, { headers }));
        else if (roomRoute) {
          if (roomRoute[2] === "socket")
            requireThat(
              origin && allowed.includes(origin),
              403,
              "SOCKET_ORIGIN",
              "El origen de la conexión no está habilitado.",
            );
          response = await env.ROOMS.getByName(roomRoute[1]).fetch(
            new Request(request, { headers }),
          );
        } else
          response = json(
            {
              error: {
                code: "NOT_FOUND",
                message: "No se encontró esta operación.",
              },
            },
            404,
          );
      }
    } catch (error) {
      response = errorResponse(error);
    }
    if (response.status === 101) return response;
    const headers = new Headers(response.headers);
    if (origin && allowed.includes(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Vary", "Origin");
      headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
      headers.set("Access-Control-Max-Age", "600");
    }
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  },
};
