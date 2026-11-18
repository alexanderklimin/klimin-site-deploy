// Read-only snapshot of the public site: every known URL, without following redirects.
// Run: node scripts/crawl-public.mjs
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = "https://klimin.marketing";
const OUT = "/opt/klimin-site/export";
const HTML = join(OUT, "crawl/html");
mkdirSync(HTML, { recursive: true });
const UA = "Mozilla/5.0 (compatible; site-migration-inventory)";
const json = (f) => JSON.parse(readFileSync(join(OUT, f), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  let lastError;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, connection: "close" }, signal: AbortSignal.timeout(30000) });
      if (r.status !== 429) return r;
      await r.arrayBuffer().catch(() => {});
    } catch (e) {
      lastError = e;
    }
    await sleep(5000 * (i + 1));
  }
  console.log(`gave up: ${url} (${lastError?.cause?.code || lastError?.message || "429"})`);
  return new Response(null, { status: 599 });
}

const locales = ["", "/en", "/ru", "/pt"];
const urls = new Map(); // path -> sources
const add = (p, src) => {
  const u = new URL(p, ORIGIN);
  if (u.hostname.replace(/^www\./, "") !== "klimin.marketing") return;
  const path = u.pathname + u.search;
  if (!urls.has(path)) urls.set(path, new Set());
  urls.get(path).add(src);
};

// sitemaps
const sitemapDir = join(OUT, "crawl/sitemaps");
mkdirSync(sitemapDir, { recursive: true });
const queue = [`${ORIGIN}/sitemap.xml`];
const seen = new Set();
while (queue.length) {
  const sm = queue.shift();
  if (seen.has(sm)) continue;
  seen.add(sm);
  const r = await get(sm);
  const xml = await r.text();
  writeFileSync(join(sitemapDir, new URL(sm).pathname.replace(/\W+/g, "_") + new URL(sm).search.replace(/\W+/g, "_") + ".xml"), xml);
  for (const [, loc] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const clean = loc.replace(/&amp;/g, "&");
    if (/<sitemapindex/.test(xml)) queue.push(clean); else add(clean, "sitemap");
  }
  for (const [, href] of xml.matchAll(/hreflang="[^"]+"\s+href="([^"]+)"/g)) add(href.replace(/&amp;/g, "&"), "sitemap-hreflang");
}

// API inventory
for (const l of locales) add(l || "/", "home");
for (const p of json("pages.json")) for (const l of locales) add(`${l}/pages/${p.handle}`, p.isPublished ? "page-published" : "page-unpublished");
for (const r of json("redirects.json")) add(r.path, "shopify-redirect");
for (const c of json("collections.json")) add(`/collections/${c.handle}`, "collection");
for (const p of json("products.json")) add(`/products/${p.handle}`, "product");
for (const b of json("blogs.json")) add(`/blogs/${b.handle}`, "blog");
for (const l of locales) for (const p of ["privacy-policy", "terms-of-service", "refund-policy", "shipping-policy", "contact-information", "legal-notice", "subscription-policy"]) add(`${l}/policies/${p}`, "policy");
for (const p of ["/robots.txt", "/sitemap.xml", "/collections", "/collections/all", "/products", "/blogs", "/search", "/cart", "/account", "/pages", "/llms.txt", "/agents.md"]) add(p, "system");

// Search Console + GA4
for (const [file, src] of [["gsc-pages.json", "gsc"], ["ga4-pages.json", "ga4"]]) {
  if (!existsSync(join(OUT, file))) continue;
  for (const row of json(file)) add(row.path, src);
}

const pick = (html, re) => (html.match(re)?.[1] ?? null);
const PROGRESS = join(OUT, "crawl/progress.jsonl");
const done = new Map();
if (existsSync(PROGRESS)) for (const l of readFileSync(PROGRESS, "utf8").split("\n").filter(Boolean)) { const x = JSON.parse(l); if (x.status !== 599) done.set(x.path, x); }
console.log(`urls: ${urls.size}, already done: ${done.size}`);
const results = [];
let n = 0;
for (const [path, sources] of urls) {
  if (done.has(path)) { results.push({ ...done.get(path), sources: [...sources] }); n++; continue; }
  const r = await get(ORIGIN + path);
  const type = r.headers.get("content-type") || "";
  const rec = { path, status: r.status, location: r.headers.get("location"), type: type.split(";")[0], sources: [...sources] };
  if (r.status === 200 && type.includes("text/html")) {
    const html = await r.text();
    const name = (path === "/" ? "index" : path.slice(1).replace(/[^a-zA-Z0-9_-]+/g, "__")) + ".html";
    writeFileSync(join(HTML, name), html);
    Object.assign(rec, {
      file: name,
      title: pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.trim() ?? null,
      description: pick(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i),
      canonical: pick(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i),
      robots: pick(html, /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i),
      h1: pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null,
      hreflang: [...html.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/gi)].map((m) => [m[1], m[2]]),
      jsonld: [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].length,
    });
  } else {
    await r.arrayBuffer().catch(() => {});
  }
  results.push(rec);
  appendFileSync(PROGRESS, JSON.stringify(rec) + "\n");
  if (++n % 25 === 0) console.log(`${n}/${urls.size}`);
  await sleep(250);
}
writeFileSync(join(OUT, "crawl/urls.json"), JSON.stringify(results, null, 2));
const byStatus = {};
for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log("total", results.length, JSON.stringify(byStatus));
