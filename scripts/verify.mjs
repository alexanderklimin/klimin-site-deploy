// Compares a running build of the new site with the saved snapshot of the Shopify site.
// Run: node scripts/verify.mjs http://127.0.0.1:8788
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = (process.argv[2] || "http://127.0.0.1:8788").replace(/\/$/, "");
const OUT = "/opt/klimin-site/export";
const urls = JSON.parse(readFileSync(`${OUT}/crawl/urls.json`, "utf8"));

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&#x27;/g, "'");
const norm = (s) => decode(s ?? "").replace(/\s+/g, " ").trim();
const mainOf = (html) => html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i)?.[1] ?? "";
const textOf = (html) => norm(mainOf(html).replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
const pick = (html, re) => { const m = html.match(re); return m ? norm(m[1]) : null; };
const headInfo = (html) => ({
  title: pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
  description: pick(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i),
  canonical: pick(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i),
  robots: pick(html, /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i),
  h1: pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null,
  hreflang: [...html.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/gi)].map((m) => `${m[1]}=${m[2]}`).sort().join(" "),
  jsonld: [...html.matchAll(/application\/ld\+json/gi)].length,
  images: [...mainOf(html).matchAll(/<img\b/gi)].length,
  alts: [...mainOf(html).matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)].map((m) => norm(m[1])).join(" | "),
  scripts: [...mainOf(html).matchAll(/<script\b/gi)].length,
});

const agreed = (path) => {
  const p = path.replace(/^\/(en|ru|pt)(?=\/|$)/, "");
  const prefix = path.slice(0, path.length - p.length);
  const map = { "/pages/calculadora-ecommerce": "/pages/calculadora-roas", "/pages/calculadora-e-commerce": "/pages/calculadora-roas", "/pages/casos-de-exito": "/pages/mi-track-record", "/pages/webinar": "/pages/consultoria", "/pages/servicios": "/pages/consultoria", "/privacy": "/pages/privacy-policy", "/privacy-policy": "/pages/privacy-policy", "/terms": "/pages/terms", "/terms-of-service": "/pages/terms", "/help": "/pages/help" };
  if (map[p]) return prefix + map[p];
  if (/^\/(cart|search|collections|products|blogs|account)(\/|$)/.test(p)) return prefix || "/";
  return null;
};

const problems = [];
const stats = { same200: 0, sameRedirect: 0, agreedRedirect: 0, still404: 0, skipped: 0 };
for (const old of urls) {
  const path = old.path.split("?")[0];
  if (["/robots.txt", "/sitemap.xml", "/agents.md", "/llms.txt"].includes(path)) { stats.skipped++; continue; }
  const r = await fetch(BASE + path, { redirect: "manual" });
  const loc = r.headers.get("location");
  const newTarget = loc ? new URL(loc, BASE).pathname : null;
  const want = agreed(path);
  if (want !== null) {
    if (![301, 308].includes(r.status) || newTarget !== want) problems.push({ path, kind: "agreed-redirect", got: `${r.status} ${newTarget}`, want });
    else stats.agreedRedirect++;
    continue;
  }
  if (old.status === 301) {
    if (r.status !== 301 || newTarget !== new URL(old.location, BASE).pathname) problems.push({ path, kind: "redirect", got: `${r.status} ${newTarget}`, want: old.location });
    else stats.sameRedirect++;
    continue;
  }
  if (old.status === 404) {
    if (r.status !== 404) problems.push({ path, kind: "was-404", got: `${r.status} ${newTarget}` });
    else stats.still404++;
    continue;
  }
  if (old.status !== 200 || !old.file) { problems.push({ path, kind: "unhandled", got: `${r.status}`, old: old.status }); continue; }
  // /en/ style addresses: the new site redirects them to /en.
  if (path.length > 1 && path.endsWith("/") && [301, 308].includes(r.status) && newTarget === path.slice(0, -1)) { stats.sameRedirect++; continue; }
  if (r.status !== 200) { problems.push({ path, kind: "status", got: `${r.status} ${newTarget}` }); continue; }
  const html = await r.text();
  const before = readFileSync(`${OUT}/crawl/html/${old.file}`, "utf8");
  const a = headInfo(before), b = headInfo(html);
  for (const k of ["title", "description", "canonical", "robots", "h1", "hreflang", "images", "alts", "scripts"]) if (a[k] !== b[k]) problems.push({ path, kind: k, old: a[k], new: b[k] });
  if (b.jsonld < a.jsonld) problems.push({ path, kind: "jsonld", old: a.jsonld, new: b.jsonld });
  const ta = textOf(before), tb = textOf(html);
  if (ta !== tb) {
    let i = 0;
    while (i < ta.length && ta[i] === tb[i]) i++;
    problems.push({ path, kind: "text", at: i, old: ta.slice(Math.max(0, i - 50), i + 100), new: tb.slice(Math.max(0, i - 50), i + 100) });
  } else stats.same200++;
}

// Every internal link and image on the new pages must resolve.
const pages = urls.filter((u) => u.status === 200 && u.file && agreed(u.path.split("?")[0]) === null && !u.path.endsWith("/")).map((u) => u.path);
const seen = new Map();
for (const p of pages) {
  const html = await (await fetch(BASE + p)).text();
  const refs = [...html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)].map((m) => m[1]);
  for (const s of html.matchAll(/srcset="([^"]+)"/g)) for (const part of s[1].split(",")) refs.push(part.trim().split(/\s+/)[0]);
  for (const ref of refs) {
    if (ref.startsWith("//") || seen.has(ref)) continue;
    const r = await fetch(BASE + ref.split("?")[0], { redirect: "manual" });
    seen.set(ref, r.status);
    if (r.status >= 400) problems.push({ path: p, kind: "broken-link", ref, status: r.status });
  }
}
stats.linksChecked = seen.size;

writeFileSync(`${OUT}/verify-report.json`, JSON.stringify({ stats, problems }, null, 1));
const kinds = {};
for (const p of problems) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
console.log(JSON.stringify({ stats, problems: problems.length, kinds }, null, 1));
for (const p of problems.slice(0, 40)) console.log(JSON.stringify(p).slice(0, 420));
