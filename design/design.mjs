const themes = {
  estudio: {
    label: "DIRECCIÓN A / ESTUDIO",
    title: "Todo en su lugar. Un poco de juego.",
    note: "Estudio · Recomendada por su equilibrio: un editor luminoso y tranquilo, una proyección de alto contraste y pequeños personajes que aportan cercanía. Coral para actuar; lima para confirmar.",
    phoneTitle: "Tu lugar en la ronda.",
    aside: "La próxima buena pregunta es tuya.",
  },
  pista: {
    label: "DIRECCIÓN B / PISTA",
    title: "El grupo toma la pista.",
    note: "Pista · Para grupos que disfrutan de la competencia. Navegación lateral, tipografía compacta, cifras contundentes y un verde de señal. La información se siente como un marcador, con pocos adornos.",
    phoneTitle: "Cada respuesta cuenta.",
    aside: "Prepará la próxima ronda.",
  },
  salon: {
    label: "DIRECCIÓN C / SALÓN",
    title: "Un espacio para la curiosidad.",
    note: "Salón · Para encuentros con un tono más conversacional. Catálogo amplio sin barra lateral, títulos de revista y colores cálidos. La proyección clara favorece la lectura en ambientes iluminados.",
    phoneTitle: "Pensá. Elegí. Compartí.",
    aside: "Una pregunta puede abrir un mundo.",
  },
};
const avatar = `<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M15 62V31Q15 10 39 10T65 31V62Z" fill="#d6ef9f"/><path d="M20 18L14 4L33 12M53 12L66 3L64 22" fill="#d6ef9f"/><circle cx="30" cy="36" r="5" fill="#243226"/><circle cx="51" cy="36" r="5" fill="#243226"/><path d="M33 48q8 10 16 0" fill="none" stroke="#243226" stroke-width="3"/><path d="M9 65H71" stroke="#243226" stroke-width="4"/></svg>`;
const options = ["Mercurio", "Venus", "Marte", "Júpiter"];
let theme = new URL(location.href).searchParams.get("theme") || "estudio";
if (!themes[theme]) theme = "estudio";
let view = "catalog";
const preview = document.querySelector("#preview");
function answers() {
  return `<div class="answers">${options.map((x, i) => `<button class="answer" data-answer="${i}" aria-pressed="false"><span class="answer-mark">${"ABCD"[i]}</span><span>${x}</span></button>`).join("")}</div>`;
}
function catalog(t) {
  return `<header class="app-head"><span class="app-brand">ronda<span style="color:var(--accent)">.</span></span><nav class="app-nav" aria-label="Ejemplo de navegación"><span>Cuestionarios</span><span>Sesiones</span></nav><span class="head-user">Espacio compartido <span class="avatar-mini">R</span></span></header><div class="catalog-layout"><section class="catalog-main"><div class="catalog-title"><div><h3>Tus próximas rondas</h3><p>Buenas preguntas para encontrarse.</p></div><button class="ui-button" data-demo="create">＋ Nuevo cuestionario</button></div><div class="catalog-filters"><span>Todos <b>03</b> &nbsp; · &nbsp; Publicados &nbsp; · &nbsp; Borradores</span><span class="fake-search">⌕ &nbsp; Buscar un cuestionario</span></div>${[
    [
      "01",
      "Un poco de todo",
      "12 preguntas · Versión 2 · Hace 2 horas",
      "Publicado",
    ],
    [
      "02",
      "Ideas que cambian el mundo",
      "8 preguntas · Versión 1 · Ayer",
      "Publicado",
    ],
    [
      "03",
      "Nuestro próximo encuentro",
      "6 preguntas · Cambios guardados",
      "Borrador",
    ],
  ]
    .map(
      (x) =>
        `<div class="quiz-row"><span class="quiz-icon">${x[0]}</span><div><div class="quiz-name">${x[1]}</div><div class="quiz-meta">${x[2]}</div></div><span class="pill">${x[3]}</span><span>↗</span></div>`,
    )
    .join(
      "",
    )}<p class="sample-feedback" role="status"></p></section><aside class="catalog-aside"><div class="aside-card"><span class="small">DE UNA IDEA A UNA RONDA</span><h4>${t.aside}</h4><p>Creá preguntas a mano o traelas desde tu planilla.</p>${avatar}</div><p class="aside-foot">El catálogo es compartido.<br>Todos los creadores pueden editar y conducir.</p></aside></div><footer class="catalog-footer"><span>3 cuestionarios en este espacio</span><span>Hecho para pensar en compañía ↗</span></footer>`;
}
function projection() {
  return `<section class="stage"><header class="stage-head"><span class="app-brand">ronda.</span><span>UN POCO DE TODO / VERSIÓN 2</span><span>SALA 482 761</span></header><div class="stage-meta"><span>PREGUNTA <strong>04</strong> / 12</span><span class="timer" aria-label="Ejemplo de reloj: 18 segundos">18</span></div><h3>¿Qué planeta tiene el día más largo del sistema solar?</h3>${answers()}<footer class="stage-footer"><div>18 de 24 ya respondieron<div class="progress"><span></span></div></div><span>Elegí una opción desde tu teléfono ↗</span></footer><p class="sample-feedback" role="status">Reloj y participación ilustrativos.</p></section>`;
}
function player(t) {
  return `<section class="phone-scene"><div class="phone-note"><p class="eyebrow">LA RONDA, EN TU MANO</p><h3>${t.phoneTitle}</h3><p>Una sola decisión por pantalla. Opciones grandes, tu personaje y una confirmación que no deja dudas.</p><small>VISTA DE PARTICIPANTE</small></div><div class="phone"><div class="phone-status"><span>9:41</span><span>▴ ▴ ▰</span></div><header class="phone-header"><span class="app-brand">ronda.</span><span class="timer">18 s</span></header><div class="phone-id">${avatar}<span>ESTÁS JUGANDO COMO<strong>Lince menta</strong></span><span style="margin-left:auto">04 / 12</span></div><h4>¿Qué planeta tiene el día más largo del sistema solar?</h4>${answers()}<p class="sample-feedback" role="status">Tocá una opción para probar la confirmación.</p></div><aside class="phone-detail"><b>Sin apuro para leer.</b>Primero llega la pregunta. El reloj aparece cuando quien conduce abre las opciones.<br><br><b>Tu respuesta queda clara.</b>La confirmación real aparecerá después de que el servidor la guarde.</aside></section>`;
}
function render() {
  const t = themes[theme];
  document.querySelectorAll("[data-theme]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.theme === theme);
    b.setAttribute("aria-pressed", b.dataset.theme === theme);
  });
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
  document.querySelector("#direction-label").textContent = t.label;
  document.querySelector("#direction-title").textContent = t.title;
  document.querySelector("#theme-note").textContent = t.note;
  preview.className = `preview theme-${theme}`;
  preview.innerHTML =
    view === "catalog"
      ? catalog(t)
      : view === "projection"
        ? projection()
        : player(t);
  preview.querySelectorAll("[data-answer]").forEach((b) =>
    b.addEventListener("click", () => {
      preview.querySelectorAll("[data-answer]").forEach((x) => {
        x.classList.toggle("selected", x === b);
        x.setAttribute("aria-pressed", x === b);
      });
      preview.querySelector(".sample-feedback").textContent =
        `✓ Elegiste ${options[Number(b.dataset.answer)]}. Confirmación visual de muestra; no se envió una respuesta.`;
    }),
  );
  preview
    .querySelector("[data-demo]")
    ?.addEventListener(
      "click",
      () =>
        (preview.querySelector(".sample-feedback").textContent =
          "En el producto, este botón abre el editor. Esta vista sirve para elegir la dirección visual."),
    );
}
document.querySelectorAll("[data-theme]").forEach((b) =>
  b.addEventListener("click", () => {
    theme = b.dataset.theme;
    history.replaceState(null, "", `?theme=${theme}#explorer`);
    render();
    document
      .querySelector("#explorer")
      .scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }),
);
document.querySelectorAll("[data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    view = b.dataset.view;
    render();
  }),
);
render();
