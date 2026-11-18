import { defineConfig } from "astro/config";

// URLs must match Shopify exactly: /pages/terms, /en, no trailing slash.
export default defineConfig({
  site: "https://klimin.marketing",
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "never" },
});
