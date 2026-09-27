import { el, avatar } from "./ui.mjs";
export function renderRoom(
  container,
  state,
  { role = "public", answer, pending } = {},
) {
  const focusedOption = container.contains(document.activeElement)
    ? document.activeElement.dataset.optionId
    : undefined;
  const root = el("div", { class: "room-content" });
  root.append(
    el(
      "div",
      { class: "room-meta" },
      el(
        "span",
        {},
        `${state.title} · ${state.version ? `v${state.version}` : "Vista previa"}`,
      ),
      el("span", { class: "room-code" }, `Sala ${state.code}`),
    ),
  );
  if (state.phase === "lobby") {
    root.append(
      el("p", { class: "eyebrow" }, "LA RONDA ESTÁ POR EMPEZAR"),
      el("h1", { class: "lobby-title" }, "Un lugar para cada idea."),
      el("p", { class: "big-code" }, state.code),
      el(
        "p",
        {},
        `${state.registered} de ${state.capacity} participantes · ${state.nameMode === "chosen" ? "Dato ingresado visible" : "Nombres aleatorios"} · Esperando a quien conduce`,
      ),
    );
    if (state.self)
      root.append(
        el(
          "div",
          { class: "self" },
          avatar(state.self.avatar),
          el("strong", {}, `Sos ${state.self.displayName}`),
        ),
      );
    const people = el("div", { class: "people" });
    for (const p of state.players)
      people.append(el("div", {}, avatar(p.avatar), el("span", {}, p.displayName)));
    root.append(people);
  } else if (state.phase === "finished") {
    root.append(
      el("p", { class: "eyebrow" }, "GRACIAS POR SER PARTE"),
      el("h1", {}, "Una ronda más de ideas."),
      el("h2", {}, "El podio"),
    );
    const podium = el("div", { class: "podium" });
    for (const p of state.ranking.filter((p) => p.place <= 3))
      podium.append(
        el(
          "div",
          {},
          avatar(p.avatar),
          el("strong", {}, `${p.place} · ${p.displayName}`),
          el("span", {}, `${p.points.toLocaleString("es-AR")} puntos`),
        ),
      );
    root.append(
      podium,
      el(
        "details",
        {},
        el("summary", {}, "Ver clasificación completa"),
        el(
          "ol",
          { class: "ranking" },
          state.ranking.map((p) =>
            el("li", {}, `${p.place} · ${p.displayName} — ${p.points} puntos`),
          ),
        ),
      ),
    );
    root.append(el("h2", {}, "Para seguir conversando"));
    if (!state.summary.length)
      root.append(el("p", {}, "No se abrió ninguna pregunta."));
    for (const q of state.summary)
      root.append(
        el(
          "article",
          { class: "summary-question" },
          el("h3", {}, `${q.position + 1}. ${q.prompt}`),
          el(
            "p",
            {},
            `${q.correct} aciertos · ${q.incorrect} errores · ${q.missing} sin respuesta`,
          ),
          el(
            "p",
            {},
            q.received
              ? `Acierto: ${Math.round(q.accuracy * 100)} % · Participación: ${Math.round(q.participation * 100)} %`
              : "Sin respuestas",
          ),
          el("p", {}, q.explanation),
          el(
            "p",
            {},
            `Correcta: ${q.options.find((option) => option.id === q.correctOptionId).text}`,
          ),
          el(
            "div",
            { class: "summary-distribution" },
            q.distribution.map((option) =>
              el(
                "div",
                {},
                el("span", {}, `${option.text} · ${option.count}`),
                el("progress", {
                  value: option.count,
                  max: Math.max(1, state.frozenCount),
                  "aria-label": `Respuestas ${option.text}`,
                }),
              ),
            ),
          ),
        ),
      );
  } else {
    root.append(
      el(
        "div",
        { class: "question-meta" },
        el(
          "span",
          {},
          `PREGUNTA ${String(state.index + 1).padStart(2, "0")} / ${state.total}`,
        ),
        state.phase === "answering"
          ? el("span", {
              class: "timer",
              "data-closes": state.closesAt,
              "aria-label": "Segundos restantes",
            })
          : el(
              "span",
              { class: "phase-label" },
              state.phase === "reading"
                ? "Tiempo para leer · Sin reloj"
                : state.closeReason === "all_answered"
                  ? "Todos respondieron"
                  : state.closeReason === "host_finished"
                    ? "Cerrada por quien conduce"
                    : "Tiempo agotado",
            ),
      ),
    );
    root.append(el("h1", { class: "question-title" }, state.question.prompt));
    if (state.phase === "reading")
      root.append(
        el(
          "p",
          { class: "quiet" },
          "Leé con calma. Las opciones aparecerán cuando quien conduce las abra.",
        ),
      );
    else {
      const choices = el("div", { class: "answers-grid" });
      for (const [i, option] of state.question.options.entries()) {
        const correct = option.id === state.question.correctOptionId;
        const selected = option.id === state.self?.answer?.optionId;
        const choice = el(
          role === "participant" && state.phase === "answering"
            ? "button"
            : "div",
          {
            class: `answer ${correct ? "correct" : ""} ${selected ? "selected" : ""}`,
            "data-option-id": option.id,
            ...(role === "participant" && state.phase === "answering"
              ? {
                  type: "button",
                  disabled: Boolean(state.self?.answer || pending),
                  onclick: () => answer(option.id),
                  "aria-pressed": selected ? "true" : "false",
                }
              : {}),
          },
          el("span", { class: "option-letter" }, "ABCD"[i]),
          el("span", {}, option.text),
          correct ? el("strong", {}, "✓ Correcta") : null,
        );
        choices.append(choice);
      }
      root.append(choices);
      if (state.phase === "feedback") {
        root.append(
          el("p", { class: "explanation" }, state.question.explanation),
        );
        const bars = el("div", { class: "distribution" });
        for (const [i, o] of state.question.options.entries()) {
          const count =
            state.distribution.find((d) => d.optionId === o.id)?.count || 0;
          bars.append(
            el(
              "div",
              {},
              el("span", {}, `${"ABCD"[i]} · ${count}`),
              el("progress", {
                value: count,
                max: Math.max(1, state.frozenCount),
                "aria-label": `Respuestas ${o.text}`,
              }),
            ),
          );
        }
        root.append(
          bars,
          el("p", {}, `${state.frozenCount - state.answered} sin respuesta`),
        );
      }
      root.append(
        el(
          "p",
          { class: "answer-status", role: "status" },
          pending
            ? "Enviando… Esperá la confirmación."
            : state.self?.answer
              ? "✓ Respuesta guardada. Podés esperar la explicación."
              : role === "participant" && state.phase === "feedback"
                ? "No quedó una respuesta guardada para esta pregunta."
                : `${state.answered} de ${state.frozenCount} respondieron`,
        ),
      );
    }
    if (state.self)
      root.append(
        el(
          "div",
          { class: "self" },
          avatar(state.self.avatar),
          el("span", {}, `${state.self.displayName} · ${state.self.points} puntos`),
        ),
      );
  }
  container.replaceChildren(root);
  if (focusedOption) {
    const replacement = container.querySelector(
      `button[data-option-id="${focusedOption}"]`,
    );
    if (replacement && !replacement.disabled)
      replacement.focus({ preventScroll: true });
  }
}
export function startClock(container) {
  let offset = 0;
  const timer = setInterval(() => {
    for (const clock of container.querySelectorAll("[data-closes]"))
      clock.textContent = Math.max(
        0,
        Math.ceil((Number(clock.dataset.closes) - Date.now() - offset) / 1000),
      );
  }, 200);
  return {
    update(serverNow) {
      offset = serverNow - Date.now();
    },
    stop() {
      clearInterval(timer);
    },
  };
}
