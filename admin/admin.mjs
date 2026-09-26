import config from "./config.mjs";
import { el, field, button, api, avatar, download } from "./shared/ui.mjs";
import { connectRoom } from "./shared/room-client.mjs";
import { renderRoom, startClock } from "./shared/room-view.mjs";
const app = document.querySelector("#app");
const nav = document.querySelector("#navigation");
let secret = "",
  dirty = false,
  stopRoom,
  clock;
const uid = () => crypto.randomUUID();
const request = (path, method = "GET", body) =>
  api(config.apiBaseUrl, path, { method, body, token: secret });
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function page(...children) {
  stopRoom?.();
  stopRoom = null;
  clock?.stop();
  clock = null;
  document.body.classList.remove("game");
  app.replaceChildren(...children.filter((x) => x !== null && x !== undefined));
  window.scrollTo(0, 0);
}
function showError(target, error) {
  target.textContent = error.message;
  target.scrollIntoView({ block: "nearest" });
}
function confirmAction(title, message, proceed) {
  const dialog = el(
    "dialog",
    {},
    el("h2", {}, title),
    el("p", {}, message),
    el(
      "div",
      { class: "actions" },
      button("Confirmar", () => {
        dialog.close();
        dialog.remove();
        proceed();
      }),
      button(
        "Volver",
        () => {
          dialog.close();
          dialog.remove();
        },
        "secondary",
      ),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
}
function leave(action) {
  if (!dirty) action();
  else
    confirmAction(
      "Hay cambios sin guardar",
      "Si salís ahora, se perderán los cambios que todavía no guardaste.",
      () => {
        dirty = false;
        action();
      },
    );
}
function login() {
  secret = "";
  dirty = false;
  nav.replaceChildren(el("span", {}, "Espacio compartido"));
  const input = el("input", {
    type: "password",
    autocomplete: "current-password",
    required: true,
    maxlength: "512",
  });
  const error = el("div", { class: "error", role: "alert" });
  const submit = el(
    "button",
    { type: "submit", class: "button" },
    "Entrar al espacio ↗",
  );
  const form = el(
    "form",
    {
      class: "form-stack",
      onsubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.textContent = "";
        secret = input.value;
        try {
          await request("/quizzes");
          input.value = "";
          nav.replaceChildren(
            button("Cuestionarios", () => leave(catalog), "secondary small"),
            button("Cerrar sesión", () => leave(login), "secondary small"),
          );
          await catalog();
        } catch (e) {
          secret = "";
          showError(error, e);
          submit.disabled = false;
        }
      },
    },
    field("Contraseña de creadores", input),
    button(
      "Mostrar contraseña",
      (event) => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        event.currentTarget.textContent = show
          ? "Ocultar contraseña"
          : "Mostrar contraseña";
      },
      "secondary small",
    ),
    error,
    submit,
  );
  page(
    el(
      "section",
      { class: "narrow" },
      el("p", { class: "eyebrow" }, "BUENAS PREGUNTAS, EN COMPAÑÍA"),
      el("h1", {}, "Creá la próxima ronda."),
      el(
        "p",
        { class: "muted" },
        "El catálogo es compartido. La contraseña permite crear, editar y conducir sesiones, y descargar resultados identificados.",
      ),
      form,
      el(
        "p",
        { class: "bottom-note" },
        "La contraseña se conserva solo mientras esta página permanece abierta.",
      ),
    ),
  );
}
async function catalog({ offset = 0, search = "", archived = false } = {}) {
  page(el("p", { role: "status" }, "Cargando cuestionarios…"));
  dirty = false;
  const error = el("div", { class: "error", role: "alert" });
  try {
    const data = await request(
      `/quizzes?offset=${offset}&search=${encodeURIComponent(search)}&archived=${archived}`,
    );
    const rooms = await request("/rooms");
    const searchInput = el("input", {
      type: "search",
      value: search,
      placeholder: "Buscar por título",
      "aria-label": "Buscar por título",
    });
    const filters = el(
      "form",
      {
        class: "catalog-filters",
        onsubmit: (e) => {
          e.preventDefault();
          catalog({ search: searchInput.value, archived });
        },
      },
      searchInput,
      el("button", { class: "button secondary", type: "submit" }, "Buscar"),
      button(
        archived ? "Ver activos" : "Ver archivados",
        () => catalog({ search, archived: !archived }),
        "secondary",
      ),
    );
    const list = el("div");
    if (!data.quizzes.length)
      list.append(
        el(
          "div",
          { class: "empty" },
          el("h2", {}, "Toda ronda empieza con una pregunta."),
          el(
            "p",
            { class: "muted" },
            "Creá tu primer cuestionario y compartilo con el grupo.",
          ),
          button("Crear cuestionario", () => editor()),
        ),
      );
    for (const q of data.quizzes) {
      const actions = el(
        "div",
        { class: "actions" },
        button(
          "Editar",
          async () => {
            try {
              await editor(await request(`/quizzes/${q.id}/draft`));
            } catch (e) {
              showError(error, e);
            }
          },
          "secondary small",
        ),
      );
      if (q.version && !q.archived)
        actions.append(button("Crear sala", () => prepare(q), "small"));
      actions.append(
        button(
          q.archived ? "Restaurar" : "Archivar",
          async () => {
            try {
              await request(`/quizzes/${q.id}/archive`, "POST", {
                expectedRevision: q.revision,
                archived: !q.archived,
              });
              await catalog();
            } catch (e) {
              showError(error, e);
            }
          },
          "secondary small",
        ),
      );
      actions.append(
        button(
          "Duplicar",
          async () => {
            try {
              const source = await request(`/quizzes/${q.id}/draft`);
              const quiz = source.quiz;
              quiz.title = `${quiz.title.slice(0, 110)} (copia)`;
              for (const question of quiz.questions) {
                question.id = uid();
                const correct = question.correctOptionId;
                for (const option of question.options) {
                  const old = option.id;
                  option.id = uid();
                  if (old === correct) question.correctOptionId = option.id;
                }
              }
              await editor({ quiz });
            } catch (e) {
              showError(error, e);
            }
          },
          "secondary small",
        ),
      );
      list.append(
        el(
          "article",
          { class: "catalog-row" },
          el(
            "div",
            {},
            el("h3", {}, q.title),
            el(
              "small",
              {},
              `${q.questionCount} preguntas · ${q.archived ? "Archivado" : q.version ? `Publicada v${q.version}` : "Borrador"} · ${new Date(q.updatedAt).toLocaleDateString("es-AR")}`,
            ),
          ),
          actions,
        ),
      );
    }
    list.append(
      el(
        "div",
        { class: "actions" },
        offset
          ? button(
              "Anteriores",
              () =>
                catalog({ offset: Math.max(0, offset - 50), search, archived }),
              "secondary",
            )
          : null,
        data.nextOffset !== null
          ? button(
              "Siguientes",
              () => catalog({ offset: data.nextOffset, search, archived }),
              "secondary",
            )
          : null,
      ),
    );
    const roomList = el("div", { class: "room-list" });
    const finished = el("div", { class: "room-list" });
    for (const r of rooms.rooms)
      (r.phase === "finished" ? finished : roomList).append(
        button(
          `${r.phase === "finished" ? "Resultados" : "Retomar sala"} ${r.code}`,
          () => host(r.code),
          "secondary small",
        ),
      );
    page(
      el(
        "div",
        { class: "heading-row" },
        el(
          "div",
          {},
          el("p", { class: "eyebrow" }, "ESPACIO COMPARTIDO"),
          el("h1", {}, "Tus próximas rondas"),
          el("p", {}, "Buenas preguntas para encontrarse."),
        ),
        el(
          "div",
          { class: "actions" },
          button("Importar Excel", importScreen, "secondary"),
          button("＋ Nuevo cuestionario", () => editor()),
        ),
      ),
      error,
      roomList.childElementCount
        ? el(
            "div",
            {},
            el(
              "p",
              { class: "notice" },
              "Hay una sala sin finalizar. Podés retomarla; el uso previsto es una sala a la vez.",
            ),
            roomList,
          )
        : null,
      finished.childElementCount
        ? el(
            "details",
            {},
            el(
              "summary",
              {},
              `Resultados disponibles (${finished.childElementCount})`,
            ),
            finished,
          )
        : null,
      filters,
      el(
        "div",
        { class: "catalog-grid" },
        list,
        el(
          "aside",
          { class: "catalog-side" },
          el("p", { class: "eyebrow" }, "DE UNA IDEA A UNA RONDA"),
          el("h2", {}, "La próxima buena pregunta es tuya."),
          el(
            "p",
            {},
            "Creá, revisá y publicá una versión. Cada sala conserva las preguntas con las que comenzó.",
          ),
          avatar(0),
        ),
      ),
      el(
        "div",
        { class: "bottom-note" },
        button("Respaldo del catálogo", backupScreen, "secondary small"),
      ),
    );
  } catch (e) {
    page(error, button("Reintentar", catalog));
    showError(error, e);
  }
}
function newQuestion() {
  const options = Array.from({ length: 4 }, () => ({ id: uid(), text: "" }));
  return {
    id: uid(),
    prompt: "",
    options,
    correctOptionId: options[0].id,
    explanation: "",
    answerSeconds: 15,
  };
}
function editor(existing) {
  let id = existing?.id,
    revision = existing?.revision,
    selected = 0,
    createId = uid();
  let quiz = existing?.quiz || {
    title: "",
    defaultAnswerSeconds: 15,
    questions: [newQuestion()],
  };
  let busy = false;
  dirty = !existing?.id;
  const notice = el(
    "span",
    { class: "badge", role: "status" },
    dirty ? "Cambios sin guardar" : "Guardado",
  );
  const error = el("div", { class: "error", role: "alert" });
  const title = el("input", {
    value: quiz.title,
    maxlength: 120,
    required: true,
    oninput: (e) => {
      quiz.title = e.target.value;
      changed();
    },
  });
  const defaultTime = el("input", {
    type: "number",
    min: 1,
    max: 600,
    step: 1,
    value: quiz.defaultAnswerSeconds,
    oninput: (e) => {
      quiz.defaultAnswerSeconds = Number(e.target.value);
      changed();
    },
  });
  const questionNav = el("nav", {
    class: "question-nav",
    "aria-label": "Preguntas",
  });
  const form = el("div", { class: "editor-form" });
  function changed() {
    dirty = true;
    notice.textContent = "Cambios sin guardar";
  }
  function countedField(label, input, max, hint = "") {
    const counter = el("span");
    const update = () => {
      counter.textContent = `${input.value.length} / ${max} caracteres. ${hint}${input.value.length > max * 0.75 ? " Texto extenso: revisá su lectura en pantalla." : ""}`;
    };
    input.addEventListener("input", update);
    update();
    return field(label, input, counter);
  }
  function drawQuestion() {
    questionNav.replaceChildren();
    quiz.questions.forEach((q, i) =>
      questionNav.append(
        button(
          `${String(i + 1).padStart(2, "0")} · ${q.prompt || "Sin enunciado"}`,
          () => {
            selected = i;
            drawQuestion();
          },
          "secondary",
        ),
      ),
    );
    questionNav.children[selected].setAttribute("aria-current", "true");
    const q = quiz.questions[selected];
    const prompt = el(
      "textarea",
      {
        rows: 3,
        maxlength: 800,
        oninput: (e) => {
          q.prompt = e.target.value;
          changed();
        },
      },
      q.prompt,
    );
    const options = el("div", { class: "question-options" });
    q.options.forEach((o, i) =>
      options.append(
        el(
          "div",
          { class: "edit-option" },
          el("input", {
            type: "radio",
            name: "correct",
            value: o.id,
            checked: o.id === q.correctOptionId,
            "aria-label": `Marcar ${"ABCD"[i]} como correcta`,
            onchange: () => {
              q.correctOptionId = o.id;
              changed();
            },
          }),
          countedField(
            `Alternativa ${"ABCD"[i]}`,
            el("input", {
              value: o.text,
              maxlength: 250,
              oninput: (e) => {
                o.text = e.target.value;
                changed();
              },
            }),
            250,
          ),
        ),
      ),
    );
    const explanation = el(
      "textarea",
      {
        rows: 3,
        maxlength: 2000,
        oninput: (e) => {
          q.explanation = e.target.value;
          changed();
        },
      },
      q.explanation,
    );
    const time = el("input", {
      type: "number",
      min: 1,
      max: 600,
      step: 1,
      value: q.answerSeconds,
      oninput: (e) => {
        q.answerSeconds = Number(e.target.value);
        changed();
      },
    });
    const move = (delta) => {
      const to = selected + delta;
      if (to < 0 || to >= quiz.questions.length) return;
      [quiz.questions[selected], quiz.questions[to]] = [
        quiz.questions[to],
        quiz.questions[selected],
      ];
      selected = to;
      changed();
      drawQuestion();
    };
    form.replaceChildren(
      el(
        "div",
        { class: "form-stack" },
        el(
          "p",
          { class: "eyebrow" },
          `PREGUNTA ${selected + 1} DE ${quiz.questions.length}`,
        ),
        countedField("Enunciado", prompt, 800),
        el(
          "p",
          { class: "muted" },
          "Marcá una respuesta correcta. El orden se mezclará al crear cada sala.",
        ),
        options,
        countedField(
          "Explicación",
          explanation,
          2000,
          "Obligatoria. Se muestra después del cierre. ",
        ),
        field(
          "Tiempo para responder (segundos)",
          time,
          "Entero de 1 a 600. El tiempo de lectura no tiene reloj.",
        ),
      ),
      el(
        "div",
        { class: "editor-toolbar" },
        el(
          "div",
          { class: "actions" },
          button("↑ Subir", () => move(-1), "secondary small"),
          button("↓ Bajar", () => move(1), "secondary small"),
          button(
            "Duplicar",
            () => {
              if (quiz.questions.length >= 50) return;
              const copy = structuredClone(q);
              copy.id = uid();
              copy.options = copy.options.map((o) => {
                const fresh = { ...o, id: uid() };
                if (o.id === q.correctOptionId) copy.correctOptionId = fresh.id;
                return fresh;
              });
              quiz.questions.splice(selected + 1, 0, copy);
              selected++;
              changed();
              drawQuestion();
            },
            "secondary small",
          ),
        ),
        button(
          "Quitar pregunta",
          () => {
            if (quiz.questions.length === 1) {
              error.textContent =
                "El cuestionario necesita al menos una pregunta.";
              return;
            }
            confirmAction(
              "Quitar pregunta",
              "La pregunta se quitará de este borrador cuando guardes los cambios.",
              () => {
                quiz.questions.splice(selected, 1);
                selected = Math.max(0, selected - 1);
                changed();
                drawQuestion();
              },
            );
          },
          "danger small",
        ),
      ),
    );
  }
  async function save(asNew = false) {
    if (busy) return;
    busy = true;
    app
      .querySelectorAll("input,textarea,button,select")
      .forEach((x) => (x.disabled = true));
    error.textContent = "";
    try {
      if (asNew) {
        id = undefined;
        createId = uid();
      }
      const result = id
        ? await request(`/quizzes/${id}/draft`, "PUT", {
            expectedRevision: revision,
            quiz,
          })
        : await request("/quizzes", "POST", { requestId: createId, quiz });
      id = result.id;
      revision = result.revision;
      dirty = false;
      notice.textContent = "Borrador guardado";
    } catch (e) {
      showError(error, e);
    } finally {
      busy = false;
      app
        .querySelectorAll("input,textarea,button,select")
        .forEach((x) => (x.disabled = false));
    }
  }
  const saveButton = button("Guardar borrador", () => save(), "secondary");
  const previewButton = button(
    "Vista previa",
    () => {
      const q = quiz.questions[selected];
      const preview = el("div", { class: "room-content" });
      renderRoom(preview, {
        phase: "feedback",
        title: quiz.title,
        code: "VISTA PREVIA",
        index: selected,
        total: quiz.questions.length,
        question: q,
        registered: 0,
        frozenCount: 0,
        answered: 0,
        closeReason: "all_answered",
        distribution: [],
        players: [],
      });
      const dialog = el(
        "dialog",
        {
          class: "question-preview game",
          tabindex: "-1",
          "aria-label": "Vista previa de la pregunta",
        },
        el(
          "p",
          { class: "eyebrow" },
          "ASÍ SE VERÁ LA SOLUCIÓN · EL ORDEN SE MEZCLARÁ EN LA SALA",
        ),
        preview,
        button("Volver al editor", () => dialog.close(), "secondary"),
      );
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
      dialog.focus();
      dialog.scrollTop = 0;
    },
    "secondary",
  );
  let publishId;
  const publishButton = button("Publicar versión", async () => {
    if (!id || dirty) {
      error.textContent = "Guardá el borrador y revisalo antes de publicar.";
      return;
    }
    confirmAction(
      "Publicar esta versión",
      `Se congelarán ${quiz.questions.length} preguntas. Podrás seguir editando el borrador para una versión posterior.`,
      async () => {
        publishButton.disabled = true;
        error.textContent = "";
        try {
          publishId ||= uid();
          const version = await request(`/quizzes/${id}/publish`, "POST", {
            requestId: publishId,
            expectedRevision: revision,
          });
          notice.textContent = `Versión ${version.version} publicada`;
          publishId = undefined;
        } catch (e) {
          showError(error, e);
        } finally {
          publishButton.disabled = false;
        }
      },
    );
  });
  page(
    el(
      "div",
      { class: "heading-row" },
      el(
        "div",
        {},
        el("p", { class: "eyebrow" }, "EL TALLER DE PREGUNTAS"),
        el("h1", {}, id ? "Editar cuestionario" : "Una nueva ronda"),
        notice,
      ),
      el("div", { class: "actions" }, previewButton, saveButton, publishButton),
    ),
    error,
    el(
      "div",
      { class: "editor-title" },
      countedField("Título del cuestionario", title, 120),
      field("Tiempo inicial", defaultTime),
    ),
    el(
      "div",
      { class: "editor" },
      el(
        "aside",
        {},
        questionNav,
        button(
          "＋ Pregunta",
          () => {
            if (quiz.questions.length >= 50) {
              error.textContent = "El máximo es de 50 preguntas.";
              return;
            }
            const q = newQuestion();
            q.answerSeconds = quiz.defaultAnswerSeconds;
            quiz.questions.push(q);
            selected = quiz.questions.length - 1;
            changed();
            drawQuestion();
          },
          "secondary",
        ),
      ),
      form,
    ),
    el(
      "div",
      { class: "bottom-note actions" },
      button(
        "Guardar como cuestionario nuevo",
        () => save(true),
        "secondary small",
      ),
      button("Volver al catálogo", () => leave(catalog), "secondary small"),
    ),
  );
  drawQuestion();
}
async function prepare(q) {
  const error = el("div", { class: "error", role: "alert" });
  const list = el("div", { class: "times-list" });
  const versionTitle = el("p", { class: "muted" }, q.title);
  const nameMode = el(
    "select",
    {},
    el("option", { value: "alias" }, "Nombres en clave"),
    el("option", { value: "chosen" }, "Nombres elegidos"),
  );
  const nameSelection = field(
    "Mostrar participantes como",
    nameMode,
    "Se mantiene durante toda la ronda. Los CSV siempre incluyen el nombre elegido y el nombre en clave.",
  );
  nameSelection.classList.add("session-names");
  let snapshot, times;
  const selector = el("select", { onchange: () => loadVersion() });
  for (let i = q.version; i >= 1; i--)
    selector.append(el("option", { value: i }, `Versión ${i}`));
  const general = el("input", {
    type: "number",
    min: 1,
    max: 600,
    step: 1,
    value: 15,
  });
  function drawTimes() {
    list.replaceChildren(
      ...snapshot.questions.map((question, i) =>
        el(
          "div",
          { class: "time-row" },
          el("span", {}, `${i + 1}. ${question.prompt}`),
          field(
            "Segundos",
            el("input", {
              type: "number",
              min: 1,
              max: 600,
              step: 1,
              value: times[i],
              oninput: (e) => {
                times[i] = Number(e.target.value);
              },
            }),
          ),
        ),
      ),
    );
  }
  async function loadVersion() {
    try {
      snapshot = await request(`/quizzes/${q.id}/versions/${selector.value}`);
      versionTitle.textContent = snapshot.title;
      times = snapshot.questions.map((q) => q.answerSeconds);
      drawTimes();
    } catch (e) {
      showError(error, e);
    }
  }
  let creationId = uid();
  const create = button("Crear sala ↗", async () => {
    create.disabled = true;
    error.textContent = "";
    try {
      const room = await request("/rooms", "POST", {
        requestId: creationId,
        quizId: q.id,
        version: Number(selector.value),
        times,
        nameMode: nameMode.value,
      });
      await host(room.code);
    } catch (e) {
      showError(error, e);
      create.disabled = false;
    }
  });
  page(
    el("p", { class: "eyebrow" }, "ANTES DE ENCONTRARNOS"),
    el("h1", {}, "Preparar sesión"),
    versionTitle,
    error,
    nameSelection,
    el(
      "div",
      { class: "editor-title" },
      field("Versión publicada", selector),
      field("Tiempo general", general),
    ),
    el(
      "div",
      { class: "actions" },
      ...[15, 30, 60].map((s) =>
        button(
          `${s} segundos`,
          () => {
            general.value = s;
            times = times.map(() => s);
            drawTimes();
          },
          "secondary",
        ),
      ),
      button(
        "Aplicar tiempo personalizado",
        () => {
          const value = Number(general.value);
          if (!Number.isInteger(value) || value < 1 || value > 600) {
            error.textContent = "Elegí un entero entre 1 y 600.";
            return;
          }
          times = times.map(() => value);
          drawTimes();
        },
        "secondary",
      ),
    ),
    el(
      "p",
      { class: "notice" },
      "Podés ajustar cada pregunta. Al crear la sala, las preguntas y sus tiempos quedarán congelados para esa ejecución.",
    ),
    list,
    el(
      "div",
      { class: "actions" },
      create,
      button("Volver", catalog, "secondary"),
    ),
  );
  await loadVersion();
}
async function host(code) {
  const error = el("div", { class: "error", role: "alert" });
  const content = el("section");
  const controls = el("div", { class: "host-tools" });
  const privateArea = el("div", { class: "host-private" });
  const status = el("span", { class: "connection", role: "status" });
  page(error, controls, content, privateArea);
  document.body.classList.add("game");
  clock = startClock(content);
  let state, pendingCommand;
  let controlsKey;
  const recoveryOutput = el("p", { role: "status" });
  const playerUrl = new URL(`jugar.html?room=${code}`, config.publicBaseUrl)
    .href;
  const projectionUrl = new URL(
    `proyectar.html?room=${code}`,
    config.publicBaseUrl,
  ).href;
  async function showQr() {
    try {
      const { qrcode } = await import("./vendor/qrcode.mjs");
      const qr = qrcode(0, "M");
      qr.addData(playerUrl);
      qr.make();
      const svg = qr.createSvgTag({ cellSize: 8 });
      const dialog = el(
        "dialog",
        { class: "room-qr", "aria-labelledby": "room-qr-title" },
        el("p", { class: "eyebrow" }, `SALA ${code}`),
        el("h2", { id: "room-qr-title" }, "Escaneá y sumate."),
        el("p", { class: "qr-quiz-title" }, state.title),
        el("img", {
          class: "qr-image",
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          alt: `QR para ingresar a la sala ${code}`,
        }),
        el("p", {}, "El enlace abre esta sala y pide tu nombre e identificador."),
        state.phase !== "lobby"
          ? el(
              "p",
              { class: "notice" },
              "Esta sala ya cerró el ingreso de participantes nuevos. Quienes ya ingresaron pueden volver a su acceso.",
            )
          : null,
        el(
          "a",
          { href: playerUrl, target: "_blank", rel: "noopener", class: "qr-link" },
          "Abrir entrada de participantes ↗",
        ),
        el(
          "div",
          { class: "actions" },
          button("Descargar QR", () =>
            download(
              `ronda-${code}-qr.svg`,
              new Blob([svg], { type: "image/svg+xml" }),
            ),
          ),
          button("Cerrar", () => dialog.close(), "secondary"),
        ),
      );
      dialog.addEventListener("close", () => dialog.remove(), { once: true });
      document.body.append(dialog);
      dialog.showModal();
    } catch {
      showError(
        error,
        new Error("No se pudo generar el QR. Podés usar el enlace de participantes o volver a intentarlo."),
      );
    }
  }
  async function command(action) {
    const body = pendingCommand || {
      requestId: uid(),
      expectedStep: state.step,
      action,
    };
    pendingCommand = body;
    controls.querySelectorAll("button").forEach((b) => (b.disabled = true));
    error.textContent = "";
    try {
      state = await request(`/rooms/${code}/commands`, "POST", body);
      pendingCommand = undefined;
      render();
    } catch (e) {
      if (e.code) pendingCommand = undefined;
      showError(error, e);
      controls.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }
  async function exportCsv(path) {
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/rooms/${code}/${path}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
      if (!response.ok) throw new Error((await response.json()).error.message);
      download(
        `ronda-${code}-${path.replace("?scope=podium", "-podio")}`,
        await response.blob(),
      );
    } catch (e) {
      showError(error, e);
    }
  }
  function render() {
    if (!state) return;
    renderRoom(content, state, { role: "host" });
    const nextControlsKey = `${state.step}:${state.registered}:${Boolean(pendingCommand)}`;
    if (controlsKey === nextControlsKey) return;
    controlsKey = nextControlsKey;
    const actions = el("div", { class: "actions" });
    if (pendingCommand)
      actions.append(
        button("Reintentar la misma acción", () =>
          command(pendingCommand.action),
        ),
      );
    else if (state.phase === "lobby")
      actions.append(button("Iniciar ronda", () => command("start")));
    else if (state.phase === "reading")
      actions.append(button("Mostrar opciones", () => command("open")));
    else if (state.phase === "feedback" && state.index + 1 < state.total)
      actions.append(button("Siguiente pregunta", () => command("next")));
    if (state.phase !== "finished")
      actions.append(
        button(
          "Finalizar",
          () =>
            confirmAction(
              "Finalizar la ronda",
              "Se cerrará la partida y estarán disponibles los resultados durante 24 horas.",
              () => command("finish"),
            ),
          "secondary",
        ),
      );
    else
      actions.append(
        button("Clasificación CSV", () => exportCsv("results.csv")),
        button(
          "Podio CSV",
          () => exportCsv("results.csv?scope=podium"),
          "secondary",
        ),
        button("Respuestas CSV", () => exportCsv("answers.csv"), "secondary"),
      );
    controls.replaceChildren(actions, status);
    privateArea.replaceChildren(
      el("strong", {}, "Solo visible para creadores"),
      el(
        "div",
        { class: "actions" },
        el(
          "a",
          {
            class: "button secondary small",
            href: projectionUrl,
            target: "_blank",
            rel: "noopener",
          },
          "Abrir proyección ↗",
        ),
        button(
          "Copiar enlace de participantes",
          async () => {
            try {
              await navigator.clipboard.writeText(playerUrl);
              status.textContent = "Enlace copiado";
            } catch {
              error.textContent = playerUrl;
            }
          },
          "secondary small",
        ),
        button("Mostrar QR de esta sala", showQr, "secondary small"),
      ),
      el(
        "p",
        {},
        `Disponible hasta ${new Date(state.expiresAt).toLocaleString("es-AR")}. Los identificadores aparecen en los CSV protegidos.`,
      ),
    );
    if (state.phase === "finished")
      privateArea.append(
        el(
          "p",
          {},
          "En Excel, importá la columna identificador como texto para conservar los ceros iniciales.",
        ),
      );
    else if (state.players.length) {
      const players = el(
        "select",
        { "aria-label": "Participante a recuperar" },
        state.players.map((p) =>
          el("option", { value: p.id }, `${p.identifier} · ${p.name || "Sin nombre registrado"} · ${p.alias}`),
        ),
      );
      privateArea.append(
        el(
          "details",
          {},
          el("summary", {}, "Recuperar el acceso de un participante"),
          field("Participante", players),
          button(
            "Generar código de recuperación",
            () =>
              confirmAction(
                "Recuperar acceso",
                "El acceso anterior se cerrará. Compartí el código nuevo en privado con esa persona.",
                async () => {
                  try {
                    const result = await request(
                      `/rooms/${code}/recover`,
                      "POST",
                      { playerId: players.value, requestId: uid() },
                    );
                    recoveryOutput.textContent = `Código: ${result.recoveryCode}. Válido por 10 minutos y una sola vez.`;
                  } catch (e) {
                    showError(error, e);
                  }
                },
              ),
            "secondary small",
          ),
          recoveryOutput,
        ),
      );
    }
  }
  try {
    state = await request(`/rooms/${code}/state`);
    clock.update(state.serverNow);
    render();
  } catch (e) {
    showError(error, e);
    return;
  }
  stopRoom = connectRoom({
    base: config.apiBaseUrl,
    code,
    role: "host",
    token: secret,
    onStatus: (text) => {
      status.textContent = text;
    },
    onState: (next) => {
      if (state && next.revision < state.revision) return;
      state = next;
      clock.update(state.serverNow);
      render();
    },
  });
}
function importScreen() {
  const error = el("div", { class: "error", role: "alert" });
  const preview = el("div");
  const status = el("p", { role: "status" });
  const title = el("input", { maxlength: 120, required: true });
  let parsed,
    worker,
    timeout,
    selection = 0,
    creationId = uid();
  const confirm = button("Guardar borrador", async () => {
    if (!parsed || parsed.errors.length) return;
    confirm.disabled = true;
    title.disabled = true;
    file.disabled = true;
    error.textContent = "";
    try {
      const quiz = {
        title: title.value,
        defaultAnswerSeconds: 15,
        questions: parsed.questions,
      };
      const created = await request("/quizzes", "POST", {
        requestId: creationId,
        quiz,
      });
      await editor({ ...created, quiz });
    } catch (e) {
      showError(error, e);
      confirm.disabled = false;
      title.disabled = false;
      file.disabled = false;
    }
  });
  confirm.disabled = true;
  const file = el("input", {
    type: "file",
    accept: ".xlsx",
    onchange: async () => {
      const currentSelection = ++selection;
      worker?.terminate();
      clearTimeout(timeout);
      parsed = null;
      confirm.disabled = true;
      confirm.textContent = "Guardar borrador";
      status.textContent = "";
      error.textContent = "";
      preview.replaceChildren();
      const chosen = file.files[0];
      if (!chosen) return;
      if (chosen.size > 2 * 1024 * 1024) {
        error.textContent = "El archivo supera 2 MiB.";
        return;
      }
      const bytes = await chosen.arrayBuffer();
      if (currentSelection !== selection) return;
      status.textContent = "Revisando el archivo en este navegador…";
      creationId = uid();
      worker = new Worker(new URL("./excel-worker.mjs", import.meta.url), {
        type: "module",
      });
      timeout = setTimeout(() => {
        worker.terminate();
        status.textContent = "";
        error.textContent =
          "La lectura superó cinco segundos. Copiá las preguntas a la plantilla y reintentá.";
      }, 5000);
      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        parsed = e.data;
        status.textContent = parsed.errors.length
          ? `${parsed.errors.length} ${parsed.errors.length === 1 ? "error" : "errores"}. No se guardó ninguna pregunta.`
          : `${parsed.questions.length} preguntas listas para revisar.`;
        const notices = [...parsed.errors, ...parsed.warnings];
        preview.replaceChildren(
          el(
            "ul",
            {},
            notices.slice(0, 100).map((message) => el("li", {}, message)),
          ),
        );
        if (notices.length > 100)
          preview.append(
            el(
              "p",
              {},
              `Hay ${notices.length - 100} avisos adicionales. Corregí los primeros y volvé a importar.`,
            ),
          );
        for (const [i, q] of parsed.questions.entries())
          preview.append(
            el(
              "article",
              { class: "summary-question" },
              el("h3", {}, `${i + 1}. ${q.prompt}`),
              el(
                "ol",
                {},
                q.options.map((o) =>
                  el(
                    "li",
                    {},
                    `${o.text}${o.id === q.correctOptionId ? " · Correcta" : ""}`,
                  ),
                ),
              ),
              el("p", {}, q.explanation),
            ),
          );
        confirm.disabled = parsed.errors.length > 0;
        confirm.textContent = `Guardar ${parsed.questions.length} preguntas como borrador`;
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        status.textContent = "";
        error.textContent = "No se pudo leer el archivo. Revisá su formato.";
      };
      worker.postMessage({ bytes, filename: chosen.name }, [bytes]);
    },
  });
  page(
    el("p", { class: "eyebrow" }, "DE TU PLANILLA A LA RONDA"),
    el("h1", {}, "Importar preguntas"),
    el(
      "p",
      { class: "muted" },
      "Seis columnas, una pregunta por fila. La columna B contiene la respuesta correcta.",
    ),
    el(
      "div",
      { class: "actions" },
      el(
        "a",
        {
          href: "plantilla-preguntas.xlsx",
          download: "plantilla-preguntas.xlsx",
          class: "button secondary",
        },
        "Descargar plantilla Excel",
      ),
      button(
        "Volver al catálogo",
        () => {
          worker?.terminate();
          clearTimeout(timeout);
          catalog();
        },
        "secondary",
      ),
    ),
    el(
      "div",
      { class: "form-stack import-fields" },
      field("Título del nuevo cuestionario", title),
      field(
        "Archivo .xlsx",
        file,
        "Hasta 2 MiB. Se lee localmente; el archivo original no se sube al servidor.",
      ),
    ),
    error,
    status,
    preview,
    confirm,
    el(
      "p",
      { class: "bottom-note" },
      "Confirmar crea un borrador nuevo. Revisalo en el editor antes de publicar una versión.",
    ),
  );
}
function backupScreen() {
  const error = el("div", { class: "error", role: "alert" });
  const preview = el("div");
  let backup, review;
  const restore = button("Confirmar restauración", async () => {
    restore.disabled = true;
    error.textContent = "";
    try {
      const result = await request("/catalog/import", "POST", {
        catalog: backup,
        fingerprint: review.fingerprint,
        confirm: true,
        strategy: "keep-existing",
      });
      preview.replaceChildren(
        el(
          "p",
          { class: "notice", role: "status" },
          `Restauración completa: ${result.newQuizzes} cuestionarios y ${result.newVersions} versiones agregados.`,
        ),
      );
    } catch (e) {
      showError(error, e);
    }
  });
  restore.disabled = true;
  const file = el("input", {
    type: "file",
    accept: ".json",
    onchange: async () => {
      restore.disabled = true;
      error.textContent = "";
      preview.replaceChildren();
      try {
        const f = file.files[0];
        if (!f) return;
        if (f.size > 16 * 1024 * 1024)
          throw new Error("El respaldo supera 16 MiB.");
        backup = JSON.parse(await f.text());
        review = await request("/catalog/import", "POST", { catalog: backup });
        preview.replaceChildren(
          el(
            "p",
            {},
            `Se agregarán ${review.newQuizzes} cuestionarios y ${review.newVersions} versiones.`,
          ),
          el(
            "ul",
            {},
            review.conflicts.map((c) =>
              el(
                "li",
                {},
                `${c.quizId}${c.version ? ` v${c.version}` : ""}: ${c.message}`,
              ),
            ),
          ),
          el(
            "p",
            { class: "notice" },
            "Los borradores y versiones que ya existen se conservan. Confirmar agrega únicamente los elementos ausentes.",
          ),
        );
        restore.disabled = false;
      } catch (e) {
        showError(error, e);
      }
    },
  });
  page(
    el("p", { class: "eyebrow" }, "CUIDAR LAS BUENAS PREGUNTAS"),
    el("h1", {}, "Respaldo del catálogo"),
    el(
      "p",
      {},
      "El respaldo contiene preguntas y soluciones. Guardalo en un lugar privado, fuera del repositorio de código.",
    ),
    error,
    el(
      "div",
      { class: "actions" },
      button("Descargar respaldo JSON", async () => {
        try {
          const backup = await request("/catalog.json");
          download(
            `ronda-catalogo-${new Date().toISOString().slice(0, 10)}.json`,
            new Blob([JSON.stringify(backup, null, 2)], {
              type: "application/json",
            }),
          );
        } catch (e) {
          showError(error, e);
        }
      }),
      button("Volver", catalog, "secondary"),
    ),
    el(
      "div",
      { class: "import-fields" },
      field(
        "Revisar respaldo para restaurar",
        file,
        "JSON de Ronda, hasta 16 MiB. La vista previa no guarda cambios.",
      ),
    ),
    preview,
    restore,
  );
}
login();
