// Read-only inventory of the klimin Shopify store. Only GraphQL queries, no mutations.
// Run: set -a; . /opt/shopify-mcp/.env; set +a; node scripts/export-shopify.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readConfigFromEnv, pickShop, gql } from "/opt/shopify-mcp/src/shopifyClient.js";

const OUT = "/opt/klimin-site/export";
const config = readConfigFromEnv();
const shop = pickShop(config, "klimin");
const q = (query, vars) => gql(config, shop, query, vars);

function save(name, data) {
  const path = join(OUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function paginate(query, pick, vars = {}) {
  const out = [];
  let after = null;
  for (;;) {
    const conn = pick(await q(query, { ...vars, after }));
    out.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) return out;
    after = conn.pageInfo.endCursor;
  }
}

const summary = {};
async function section(name, fn) {
  try {
    const n = await fn();
    summary[name] = n;
    console.log(`ok    ${name}: ${n}`);
  } catch (e) {
    summary[name] = `ERROR: ${e.message.slice(0, 300)}`;
    console.log(`FAIL  ${name}: ${e.message.slice(0, 300)}`);
  }
}

const PI = "pageInfo { hasNextPage endCursor }";
const META = "metafields(first: 30) { nodes { namespace key type value } }";

await section("shop", async () => {
  const d = await q(`{ shop { name email contactEmail description myshopifyDomain url
    primaryDomain { host url sslEnabled } currencyCode ianaTimezone plan { displayName }
    }
    shopLocales { locale name primary published } }`);
  save("shop.json", d);
  return d.shopLocales.length + " locales";
});

await section("domains", async () => {
  const d = await q(`{ shop { domains: primaryDomain { host } } webPresences: shop { url } }`);
  save("domains.json", d);
  return 1;
});

await section("pages", async () => {
  const n = await paginate(`query($after: String) { pages(first: 50, after: $after) { nodes {
    id title handle body bodySummary isPublished publishedAt createdAt updatedAt templateSuffix ${META} } ${PI} } }`, (d) => d.pages);
  save("pages.json", n);
  return n.length;
});

await section("blogs", async () => {
  const n = await paginate(`query($after: String) { blogs(first: 50, after: $after) { nodes {
    id title handle templateSuffix commentPolicy ${META}
    articles(first: 100) { nodes { id title handle body summary isPublished publishedAt tags
      author { name } image { url altText } ${META} } }
  } ${PI} } }`, (d) => d.blogs);
  save("blogs.json", n);
  return n.length + " blogs, " + n.reduce((a, b) => a + b.articles.nodes.length, 0) + " articles";
});

await section("menus", async () => {
  const n = await paginate(`query($after: String) { menus(first: 50, after: $after) { nodes {
    id title handle isDefault items { id title type url resourceId tags
      items { id title type url resourceId tags items { id title type url resourceId tags } } } } ${PI} } }`, (d) => d.menus);
  save("menus.json", n);
  return n.length;
});

await section("urlRedirects", async () => {
  const n = await paginate(`query($after: String) { urlRedirects(first: 250, after: $after) { nodes { id path target } ${PI} } }`, (d) => d.urlRedirects);
  save("redirects.json", n);
  return n.length;
});

await section("files", async () => {
  const n = await paginate(`query($after: String) { files(first: 100, after: $after) { nodes {
    id alt createdAt fileStatus __typename
    ... on MediaImage { image { url width height } mimeType originalSource { fileSize } }
    ... on GenericFile { url mimeType originalFileSize }
    ... on Video { filename sources { url mimeType width height } }
  } ${PI} } }`, (d) => d.files);
  save("files.json", n);
  return n.length;
});

await section("collections", async () => {
  const n = await paginate(`query($after: String) { collections(first: 100, after: $after) { nodes {
    id title handle descriptionHtml productsCount { count } seo { title description } ${META} } ${PI} } }`, (d) => d.collections);
  save("collections.json", n);
  return n.length;
});

await section("products", async () => {
  const n = await paginate(`query($after: String) { products(first: 100, after: $after) { nodes {
    id title handle status descriptionHtml onlineStoreUrl seo { title description } } ${PI} } }`, (d) => d.products);
  save("products.json", n);
  return n.length;
});

const TR_TYPES = ["PAGE", "ARTICLE", "BLOG", "MENU", "LINK", "SHOP", "SHOP_POLICY",
  "COLLECTION", "PRODUCT", "METAFIELD", "ONLINE_STORE_THEME", "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_SECTION_GROUP", "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS", "ONLINE_STORE_THEME_LOCALE_CONTENT",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY", "ONLINE_STORE_THEME_APP_EMBED"];

for (const type of TR_TYPES) {
  await section(`translations/${type}`, async () => {
    const n = await paginate(`query($after: String, $type: TranslatableResourceType!) {
      translatableResources(first: 25, after: $after, resourceType: $type) { nodes { resourceId
        translatableContent { key value digest locale }
        en: translations(locale: "en") { key value outdated }
        ru: translations(locale: "ru") { key value outdated }
        pt: translations(locale: "pt-BR") { key value outdated }
      } ${PI} } }`, (d) => d.translatableResources, { type });
    save(`translations/${type}.json`, n);
    return n.length;
  });
}

await section("theme", async () => {
  const d = await q(`{ themes(first: 20) { nodes { id name role createdAt updatedAt } } }`);
  save("themes.json", d.themes.nodes);
  const main = d.themes.nodes.find((t) => t.role === "MAIN");
  const files = await paginate(`query($id: ID!, $after: String) { theme(id: $id) { files(first: 50, after: $after) { nodes {
    filename size contentType checksumMd5
    body { __typename ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } ... on OnlineStoreThemeFileBodyUrl { url } }
  } ${PI} } } }`, (x) => x.theme.files, { id: main.id });
  for (const f of files) {
    if (f.body?.content !== undefined) save(`theme/${f.filename}`, f.body.content);
    else if (f.body?.contentBase64) { mkdirSync(dirname(join(OUT, "theme", f.filename)), { recursive: true }); writeFileSync(join(OUT, "theme", f.filename), Buffer.from(f.body.contentBase64, "base64")); }
  }
  save("theme-files.json", files.map((f) => ({ filename: f.filename, size: f.size, contentType: f.contentType, url: f.body?.url || null })));
  return `${main.name}: ${files.length} files`;
});

save("_summary.json", { exportedAt: new Date().toISOString(), summary });
console.log("done");
