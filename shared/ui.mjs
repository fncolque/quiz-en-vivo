export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on"))
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (value !== undefined && value !== false)
      node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity))
    if (child !== undefined && child !== null)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
export function field(label, input, help) {
  return el(
    "label",
    { class: "field" },
    el("span", {}, label),
    input,
    help ? el("small", {}, help) : null,
  );
}
export function button(label, action, kind = "") {
  return el(
    "button",
    { type: "button", class: `button ${kind}`, onclick: action },
    label,
  );
}
export async function api(base, path, { method = "GET", body, token } = {}) {
  const response = await fetch(base + path, {
    method,
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.error?.message || "No se pudo completar la operación.",
    );
    error.code = data.error?.code;
    throw error;
  }
  return data;
}
export function avatar(index = 0) {
  const colors = [
    "#cde79d",
    "#ffad91",
    "#eed082",
    "#bddd77",
    "#9cc9df",
    "#ddd9cf",
    "#c2b3e1",
    "#a8d2b2",
    "#d8b094",
    "#dbb6d4",
    "#efd496",
    "#b7c8dd",
  ];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 80 80");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("avatar");
  // All geometry and colors are application constants; no imported text enters SVG markup.
  const type = Math.floor(index / 12);
  const color = colors[index % colors.length];
  svg.innerHTML = `<path d="M13 64V${27 + type}Q13 9 40 9T67 ${27 + type}V64Z" fill="${color}"/><path d="M18 21L${10 + type} 3L34 14M48 13L${70 - type} 3L63 25" fill="${color}"/><circle cx="29" cy="35" r="${4 + (type % 3)}" fill="#253020"/><circle cx="51" cy="35" r="${4 + (type % 3)}" fill="#253020"/><path d="M32 48q8 ${8 + type} 16 0" fill="none" stroke="#253020" stroke-width="3"/><path d="M15 64H65" stroke="#253020" stroke-width="3"/><text x="40" y="75" text-anchor="middle" fill="currentColor" font-size="10">${String(index + 1).padStart(3, "0")}</text>`;
  return svg;
}
export function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: name });
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
