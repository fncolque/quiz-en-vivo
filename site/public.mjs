import config from "./config.mjs";
import { el, field, button, api, avatar } from "./shared/ui.mjs";
import { connectRoom } from "./shared/room-client.mjs";
import { renderRoom, startClock } from "./shared/room-view.mjs";
const app = document.querySelector("#app");
const projection = location.pathname.endsWith("proyectar.html");
const code = new URL(location.href).searchParams.get("room");
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
const key = `ronda:participant:${config.apiBaseUrl}:${code}`;
document.querySelector("#admin-link")?.setAttribute("href", config.adminUrl);
const error = el("div", { class: "error", role: "alert" });
let token,
  state,
  pending = false;
try {
  token = JSON.parse(localStorage.getItem(key) || "null")?.token;
} catch {
  /* Joining still works if storage is unavailable. */
}
function joinForm() {
  document.body.classList.remove("game", "mobile-player");
  const inputCode = el("input", {
    name: "code",
    inputmode: "numeric",
    pattern: "[0-9]{6}",
    maxlength: "6",
    autocomplete: "off",
    placeholder: "000000",
    required: true,
    value: code || "",
  });
  const inputId = el("input", {
    name: "identifier",
    autocomplete: "off",
    maxlength: "64",
    required: true,
  });
  const inputName = el("input", {
    name: "name",
    autocomplete: "nickname",
    maxlength: "64",
    required: true,
  });
  const recovery = el("input", {
    name: "recovery",
    autocomplete: "off",
    maxlength: 12,
    oninput: () => {
      const recovering = Boolean(recovery.value.trim());
      inputName.disabled = recovering;
      inputName.required = !recovering;
    },
  });
  const submit = el(
    "button",
    { class: "button", type: "submit" },
    "Entrar a la ronda ↗",
  );
  const form = el(
    "form",
    {
      class: "form-stack join-form",
      onsubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.textContent = "";
        const room = inputCode.value.trim();
        try {
          const joined = await api(config.apiBaseUrl, `/rooms/${room}/join`, {
            method: "POST",
            body: {
              identifier: inputId.value,
              ...(recovery.value.trim()
                ? { recoveryCode: recovery.value.trim() }
                : { name: inputName.value }),
            },
          });
          const targetKey = `ronda:participant:${config.apiBaseUrl}:${room}`;
          try {
            localStorage.setItem(
              targetKey,
              JSON.stringify({ token: joined.token }),
            );
          } catch {
            token = joined.token;
            history.replaceState(null, "", `jugar.html?room=${room}`);
            start(room, joined.token);
            return;
          }
          location.href = `jugar.html?room=${room}`;
        } catch (e) {
          error.textContent = e.message;
          submit.disabled = false;
        }
      },
    },
    el("h2", {}, "Tu lugar está acá."),
    field("Código de sala", inputCode),
    field(
      "Nombre elegido",
      inputName,
      "Si quien conduce elige mostrar nombres, el grupo verá este nombre. Siempre queda en los resultados privados.",
    ),
    field(
      "Identificador",
      inputId,
      "Tu legajo o código acordado. Sirve para recuperar tu acceso y no se muestra al grupo.",
    ),
    el(
      "details",
      {},
      el("summary", {}, "Tengo un código de recuperación"),
      field(
        "Código de recuperación",
        recovery,
        "Pedíselo en privado a quien conduce. Conservás tu nombre, personaje y puntaje.",
      ),
    ),
    error,
    submit,
    el(
      "small",
      { class: "muted" },
      "Sin cuenta personal. Al entrar vas a recibir un personaje propio.",
    ),
  );
  app.replaceChildren(
    el(
      "div",
      { class: "join-layout" },
      el(
        "section",
        {},
        el("p", { class: "eyebrow" }, "PENSAR EN COMPAÑÍA"),
        el("h1", {}, "Las buenas ideas dan vueltas."),
        el(
          "p",
          {},
          "Una pregunta, un grupo y muchas ganas de compartir. Sumate a la próxima ronda.",
        ),
        el("div", { class: "join-art" }, avatar(0), avatar(19), avatar(52)),
      ),
      form,
    ),
  );
}
function start(room, credential) {
  document.body.classList.add("game");
  if (!projection) document.body.classList.add("mobile-player");
  const content = el("section");
  const retry = el("div");
  app.replaceChildren(error, content, retry);
  const status =
    document.querySelector("#connection") ||
    el("span", { class: "connection", role: "status" });
  if (!status.isConnected) document.querySelector(".topbar").append(status);
  const clock = startClock(content);
  let pendingChoice;
  async function answer(optionId) {
    const choice = pendingChoice || { questionId: state.question.id, optionId };
    pendingChoice = choice;
    pending = true;
    error.textContent = "";
    retry.replaceChildren();
    render();
    try {
      await api(config.apiBaseUrl, `/rooms/${room}/answers`, {
        method: "POST",
        body: choice,
        token: credential,
      });
      pendingChoice = undefined;
      const confirmed = await api(config.apiBaseUrl, `/rooms/${room}/state`, {
        token: credential,
      });
      if (!state || confirmed.revision >= state.revision) state = confirmed;
    } catch (e) {
      error.textContent = e.message;
      if (!e.code)
        retry.append(
          button(
            "Reintentar la misma respuesta",
            () => answer(choice.optionId),
            "secondary",
          ),
        );
      else pendingChoice = undefined;
    } finally {
      pending = false;
      render();
    }
  }
  function render() {
    if (state)
      renderRoom(content, state, {
        role: projection ? "public" : "participant",
        answer,
        pending: pending || Boolean(pendingChoice),
      });
  }
  const stop = connectRoom({
    base: config.apiBaseUrl,
    code: room,
    role: projection ? "public" : "participant",
    token: credential,
    onStatus: (text) => {
      status.textContent = text;
    },
    onClosed: (closeCode) => {
      clock.stop();
      retry.replaceChildren(
        button(
          closeCode === 4001 && !projection
            ? "Recuperar mi acceso"
            : "Volver a la entrada",
          () => {
            stop();
            try {
              localStorage.removeItem(
                `ronda:participant:${config.apiBaseUrl}:${room}`,
              );
            } catch {}
            if (projection) {
              location.href = "./";
              return;
            }
            error.textContent =
              closeCode === 4001
                ? "Tu acceso anterior fue revocado. Ingresá tu identificador y el código de recuperación que te dio quien conduce."
                : "La sala venció. Ingresá el código de una nueva ronda.";
            joinForm();
          },
          "secondary",
        ),
      );
    },
    onState: (next) => {
      if (state && next.revision < state.revision) return;
      state = next;
      clock.update(state.serverNow);
      render();
    },
  });
  window.addEventListener(
    "pagehide",
    () => {
      stop();
      clock.stop();
    },
    { once: true },
  );
  if (projection)
    document
      .querySelector(".topbar")
      .append(
        button(
          "Pantalla completa",
          () => document.documentElement.requestFullscreen(),
          "secondary small",
        ),
      );
}
if (code && /^\d{6}$/.test(code) && (projection || token)) start(code, token);
else joinForm();
