import { cp, mkdir, writeFile } from "node:fs/promises";
const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8787/api";
const adminUrl = new URL("/", apiBaseUrl).href;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4173/";
for (const [source, target] of [
  ["site", "dist/public"],
  ["admin", "dist/admin"],
]) {
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
  await cp("shared", `${target}/shared`, { recursive: true });
  await mkdir(`${target}/shared/fonts`, { recursive: true });
  for (const name of ["bricolage", "source"])
    for (const suffix of [".woff2", "-OFL.txt"])
      await cp(
        `design/fonts/${name}${suffix}`,
        `${target}/shared/fonts/${name}${suffix}`,
      );
  await writeFile(
    `${target}/config.mjs`,
    source === "admin"
      ? `export default {apiBaseUrl: new URL('/api', location.origin).href, adminUrl: location.origin + '/', publicBaseUrl: ${JSON.stringify(publicBaseUrl)}};\n`
      : `export default ${JSON.stringify({ apiBaseUrl, adminUrl, publicBaseUrl })};\n`,
  );
}
console.log(
  "Construcción completa: dist/public y dist/admin. Las propuestas visuales quedan fuera del despliegue.",
);
