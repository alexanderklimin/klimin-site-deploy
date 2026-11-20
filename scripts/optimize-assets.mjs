// Runs after extract-content.py:
// 1. converts JPG/PNG in public/img to WebP and points every page at the WebP files;
// 2. builds src/generated/site.min.css: theme + site styles without rules no page uses, minified, for inlining.
// Run: node scripts/optimize-assets.mjs
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { PurgeCSS } from "purgecss";
import { transform } from "esbuild";

const ROOT = "/opt/klimin-site";
const IMG = `${ROOT}/public/img`;
const GEN = `${ROOT}/src/generated`;
const htmlFiles = readdirSync(`${GEN}/html`).map((f) => `${GEN}/html/${f}`);

// Images. Social preview images (og-*) stay as they are: some networks do not read WebP.
const renamed = {};
let before = 0, after = 0;
for (const file of readdirSync(IMG)) {
  const m = file.match(/^(?!og-)(.+)\.(jpe?g|png)$/i);
  if (!m) continue;
  const src = join(IMG, file), out = join(IMG, `${m[1]}.webp`);
  await sharp(src).webp({ quality: m[2].toLowerCase() === "png" ? 85 : 80, effort: 5 }).toFile(out);
  const a = statSync(src).size, b = statSync(out).size;
  if (b < a) { renamed[`/img/${file}`] = `/img/${m[1]}.webp`; before += a; after += b; }
  else unlinkSync(out);
}
const swap = (text) => text.replace(/\/img\/[^"'\s,)]+\.(?:jpe?g|png)/gi, (p) => renamed[p] || p);
for (const f of [...htmlFiles, `${GEN}/manifest.json`]) writeFileSync(f, swap(readFileSync(f, "utf8")));
for (const old of Object.keys(renamed)) unlinkSync(join(ROOT, "public", old));
console.log(`images: ${Object.keys(renamed).length} converted, ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);

// CSS. Every class, id and tag used on any page, in the layout or in page scripts is kept.
const css = ["theme.css", "site.css"].map((f) => readFileSync(`${ROOT}/public/css/${f}`, "utf8")).join("\n");
const [purged] = await new PurgeCSS().purge({
  content: [...htmlFiles, `${GEN}/manifest.json`, `${ROOT}/src/layouts/Layout.astro`, `${ROOT}/src/pages/404.astro`],
  css: [{ raw: css }],
  safelist: { standard: ["js", "no-js"], greedy: [/view-transition/] },
  fontFace: false,
  keyframes: true,
  variables: false,
});
const { code } = await transform(purged.css, { loader: "css", minify: true });
writeFileSync(`${GEN}/site.min.css`, code);
console.log(`css: ${(css.length / 1024).toFixed(0)} KB -> ${(code.length / 1024).toFixed(0)} KB`);
if (!existsSync(`${GEN}/site.min.css`)) process.exit(1);
