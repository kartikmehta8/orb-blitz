import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";

const files = [
  "dist/index.html",
  "dist/download/index.html",
  "dist/privacy.html",
];
const release = JSON.parse(readFileSync("release.json", "utf8"));
const pages = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
for (const [file, html] of pages) {
  assert.match(html, /<title>(Orb|Download Orb)/);
  assert.match(html, /name="description"/);
  assert.match(html, /<main id="main">/);
  assert.ok(!html.includes("__SITE_URL__"), "Unresolved site origin");
  for (const [, ref] of html.matchAll(/(?:href|src|poster)="([^\"]+)"/g)) {
    if (!ref.startsWith("/") && !ref.startsWith("#")) continue;
    const [pathname, fragment] = ref.split("#");
    let dest = pathname ? path.join("dist", pathname) : file;
    if (pathname.endsWith("/")) dest += "/index.html";
    assert.ok(existsSync(dest), `${file}: missing ${dest}`);
    if (fragment && dest.endsWith(".html")) {
      const target =
        pages.get(dest.replaceAll("//", "/")) || readFileSync(dest, "utf8");
      assert.ok(
        target.includes(`id="${fragment}"`),
        `${file}: missing fragment ${ref}`,
      );
    }
  }
}
const canonical = pages
  .get(files[0])
  .match(/rel="canonical"\s+href="([^\"]+)"/)[1];
const origin = new URL(canonical).origin;
assert.ok(
  readFileSync("dist/robots.txt", "utf8").includes(`${origin}/sitemap.xml`),
);
assert.ok(
  readFileSync("dist/sitemap.xml", "utf8").includes(`${origin}/download/`),
);
const download = pages.get("dist/download/index.html");
assert.ok(download.includes(release.sha256));
assert.ok(download.includes(`v${release.version}`));

const journey = readFileSync("src/FeatureJourney.jsx", "utf8");
const code = readFileSync("src/interactions.jsx", "utf8");
assert.ok(
  !/fetch\([^)]*(?:rpc|\/api|ngrok)/i.test(code + journey),
  "Demo must never contact wallet or agent endpoints",
);
for (const app of ["WhatsApp", "Email", "Telegram"])
  assert.match(code, new RegExp(`name:\\s*["']${app}["']`));
assert.ok(code.includes("prefers-reduced-motion"));
assert.ok(code.includes("AbortController"));
assert.match(code, /crypto\.subtle\.digest\(\s*["']SHA-256["']/);
const hash = createHash("sha256");
let size = 0;
for (const part of release.parts) {
  const data = readFileSync(path.join("dist", part));
  assert.ok(data.length < 25 * 1024 * 1024);
  hash.update(data);
  size += data.length;
}
assert.equal(size, release.size);
assert.equal(hash.digest("hex"), release.sha256);
assert.ok(statSync("dist/assets/interactions.js").size < 300000);
// Follow emitted static and lazy imports so a deploy cannot omit a GSAP chunk.
const modules = new Set();
function checkModule(file) {
  if (modules.has(file)) return;
  assert.ok(existsSync(file), `Missing bundled module ${file}`);
  modules.add(file);
  for (const [, ref] of readFileSync(file, "utf8").matchAll(
    /\b(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/g,
  ))
    checkModule(path.resolve(path.dirname(file), ref));
}
checkModule(path.resolve("dist/assets/interactions.js"));
const symbols = readFileSync("dist/assets/icons.svg", "utf8");
for (const file of [
  ...files,
  "src/interactions.jsx",
  "src/FeatureJourney.jsx",
]) {
  for (const [, icon] of readFileSync(file, "utf8").matchAll(
    /(?:icons\.svg#|icon:\s*['"]|<Icon\s+name=['"])([a-z0-9-]+)(?=['"`])/g,
  ))
    assert.ok(symbols.includes(`id="${icon}"`), `Missing icon ${icon}`);
}
const config = JSON.parse(readFileSync("vercel.json", "utf8"));
assert.equal(config.outputDirectory, "dist");
assert.equal(config.buildCommand, "npm run verify");
console.log(
  "PASS: pages, links/fragments, module chunks, deployment metadata, fixture boundaries, icons, bundle budget and exact release APK size/SHA-256.",
);
