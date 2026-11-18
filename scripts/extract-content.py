#!/usr/bin/env python3
"""Turn the saved Shopify pages (export/crawl) into static content for Astro.
Writes src/generated/, public/img, public/css, public/_redirects, public/_headers,
public/robots.txt and public/sitemap.xml. Reads the live CDN only to fetch images.
Run: python3 -I scripts/extract-content.py
"""
import hashlib, html, json, os, re, shutil, time, urllib.parse, urllib.request

ROOT = "/opt/klimin-site"
EXPORT = f"{ROOT}/export"
CRAWL = f"{EXPORT}/crawl/html"
GEN = f"{ROOT}/src/generated"
PUBLIC = f"{ROOT}/public"
IMG = f"{PUBLIC}/img"
ORIGIN = "https://klimin.marketing"
LOCALES = {"es": "", "en": "/en", "ru": "/ru", "pt": "/pt"}
HANDLES = ["contact", "sobre-klimin", "sistema", "mi-track-record", "consultoria", "calculadora-roas",
           "demanda-nichos-ecommerce-chile", "informacion-legal", "help", "terms", "privacy-policy", "gracias"]
POLICIES = ["privacy-policy", "terms-of-service", "refund-policy", "shipping-policy", "contact-information"]
CSS_FILES = ["base.css", "section-rich-text.css", "component-image-with-text.css", "section-multicolumn.css",
             "collapsible-content.css", "component-accordion.css", "section-image-banner.css",
             "section-main-page.css", "component-slider.css", "component-list-menu.css", "section-footer.css",
             "component-list-social.css"]

for d in (GEN, IMG):
    shutil.rmtree(d, ignore_errors=True)
os.makedirs(f"{GEN}/html", exist_ok=True)
os.makedirs(IMG, exist_ok=True)
os.makedirs(f"{PUBLIC}/css", exist_ok=True)
os.makedirs(f"{PUBLIC}/js", exist_ok=True)

downloads = {}  # local name -> remote url


def local_image(url):
    """Map a Shopify CDN image URL to a local path in one of two sizes."""
    url = html.unescape(url)
    if url.startswith("//"):
        url = "https:" + url
    u = urllib.parse.urlparse(url)
    q = urllib.parse.parse_qs(u.query)
    name = urllib.parse.unquote(u.path.rsplit("/", 1)[-1])
    stem, ext = os.path.splitext(name)
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", stem)
    width = int(q.get("width", ["1500"])[0])
    bucket = 750 if width <= 750 else 1500
    local = f"{stem}-{bucket}{ext.lower()}"
    downloads[local] = f"https://klimin.marketing{u.path}?width={bucket}"
    return f"/img/{local}"


CDN_RE = r"(?:https?:)?//(?:klimin\.marketing|cdn\.shopify\.com)(?:/s)?/(?:cdn/)?(?:shop/)?(?:files|t/\d+/assets)/[^\"'\s,)]+"


def rewrite_srcset(m):
    seen, out = set(), []
    for part in html.unescape(m.group(1)).split(","):
        bits = part.strip().split()
        if not bits:
            continue
        path = local_image(bits[0])
        if path in seen:
            continue
        seen.add(path)
        out.append(f"{path} {'750w' if path.rsplit('.', 1)[0].endswith('-750') else '1500w'}")
    return f'srcset="{", ".join(out)}"'


def clean_main(main):
    main = re.sub(r"<link\b[^>]*rel=\"stylesheet\"[^>]*>\s*", "", main)
    main = re.sub(r"<link\b[^>]*\.css[^>]*>\s*", "", main)
    main = main.replace(" data-shopify", "")
    main = re.sub(r"\s*data-cascade\b", "", main)
    main = re.sub(r"\b(scroll-trigger(?:--[\w-]+)?|animate--[\w-]+)\b", "", main)
    main = re.sub(r'srcset="([^"]+)"', rewrite_srcset, main)
    main = re.sub(CDN_RE, lambda m: local_image(m.group(0)), main)
    main = re.sub(r'(href|action)="https://(?:www\.)?klimin\.marketing(/[^"]*)?"', lambda m: f'{m.group(1)}="{m.group(2) or "/"}"', main)
    # Phones only: section gaps one third tighter. Desktop values live in their own @media rule.
    main = re.sub(r"(-padding\s*\{\s*padding-top:\s*calc\(\d+px\s*\*\s*)0\.75(\);\s*padding-bottom:\s*calc\(\d+px\s*\*\s*)0\.75(\))", r"\g<1>0.5\g<2>0.5\g<3>", main)
    main = re.sub(r"(-padding\s*\{\s*padding-top:\s*)(\d+)(px;\s*padding-bottom:\s*)(\d+)(px;\s*\}\s*@media screen and \(min-width: 750px\))",
                  lambda m: f"{m.group(1)}{round(int(m.group(2)) * 2 / 3)}{m.group(3)}{round(int(m.group(4)) * 2 / 3)}{m.group(5)}", main)
    # Blank lines at the end of a paragraph are hidden on phones by .trailing-breaks in site.css.
    main = re.sub(r"((?:<br\s*/?>\s*)+)</p>", r'<span class="trailing-breaks">\1</span></p>', main)
    return main


def meta(head, attr, name):
    m = re.search(rf'<meta\s+{attr}="{re.escape(name)}"\s+content="([^"]*)"', head)
    return html.unescape(m.group(1)) if m else None


def og_image(url):
    if not url:
        return None
    digest = hashlib.sha1(url.encode()).hexdigest()[:8]
    path = urllib.parse.urlparse(url).path
    ext = os.path.splitext(path)[1].lower() or ".png"
    local = f"og-{digest}{ext}"
    downloads[local] = url.replace("http://", "https://", 1)
    return f"{ORIGIN}/img/{local}"


def clean_ld(raw):
    data = json.loads(raw)
    if data.get("@type") == "WebSite":
        data.pop("potentialAction", None)  # the search page does not exist on the new site
    if isinstance(data.get("sameAs"), list):
        data["sameAs"] = [s for s in data["sameAs"] if s]
    if isinstance(data.get("logo"), str):
        data["logo"] = ORIGIN + local_image(data["logo"])
    return json.dumps(data, ensure_ascii=False)


def crawl_name(path):
    return "index" if path == "/" else re.sub(r"[^a-zA-Z0-9_-]+", "__", path[1:])


def parse_page(path, locale):
    t = open(f"{CRAWL}/{crawl_name(path)}.html", encoding="utf8").read()
    head = re.search(r"<head\b.*?</head>", t, re.S).group(0)
    m = re.search(r"<main\b[^>]*>(.*)</main>", t, re.S)
    outside = t[: m.start()] + t[m.end():]
    title = re.search(r"<title[^>]*>(.*?)</title>", head, re.S).group(1)
    return {
        "path": path,
        "locale": locale,
        "lang": re.search(r'<html[^>]*\blang="([^"]+)"', t).group(1),
        "title": re.sub(r"\s+", " ", html.unescape(title)).strip(),
        "description": meta(head, "name", "description"),
        "robots": meta(head, "name", "robots"),
        "canonical": re.search(r'<link rel="canonical" href="([^"]+)"', head).group(1),
        "ogTitle": meta(head, "property", "og:title"),
        "ogDescription": meta(head, "property", "og:description"),
        "ogType": meta(head, "property", "og:type"),
        "ogImage": og_image(meta(head, "property", "og:image:secure_url")),
        "hreflang": [[a, b] for a, b in re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', head)],
        "jsonld": [clean_ld(s) for s in re.findall(r'<script[^>]+ld\+json[^>]*>(.*?)</script>', outside, re.S)],
        "file": crawl_name(path) + ".html",
    }, clean_main(m.group(1))


pages = []
for locale, prefix in LOCALES.items():
    paths = [prefix or "/"] + [f"{prefix}/pages/{h}" for h in HANDLES] + [f"{prefix}/policies/{p}" for p in POLICIES]
    for path in paths:
        rec, body = parse_page(path, locale)
        open(f"{GEN}/html/{rec['file']}", "w", encoding="utf8").write(body)
        pages.append(rec)


def clean_footer(f):
    """Original Shopify footer without the newsletter form and the empty payment row."""
    f = re.sub(r'<div class="footer-block__newsletter">.*?</form>\s*</div>\s*', "", f, flags=re.S)
    f = re.sub(r'<div class="footer__content-bottom-wrapper page-width">\s*<div class="footer__column footer__localization.*?(?=<div class="footer__content-bottom-wrapper page-width">)', "", f, flags=re.S)
    f = re.sub(r"\s*data-cascade\b", "", f)
    f = re.sub(r"\b(scroll-trigger(?:--[\w-]+)?|animate--[\w-]+)\b", "", f)
    return re.sub(r'href="https://klimin\.marketing/"', 'href="/"', f)


# Navigation and footer, taken from each language's own home page.
nav = {}
for locale, prefix in LOCALES.items():
    t = open(f"{CRAWL}/{crawl_name(prefix or '/')}.html", encoding="utf8").read()
    header = re.search(r"<header\b.*?</header>", t, re.S).group(0)
    footer = re.search(r"<footer\b.*?</footer>", t, re.S).group(0)
    text = lambda s: html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()
    menu, seen = [], set()
    for href, label in re.findall(r'<a\b[^>]*?href="([^"]+)"[^>]*?class="[^"]*header__menu-item[^"]*"[^>]*>(.*?)</a>', header, re.S):
        if href not in seen:
            seen.add(href)
            menu.append([href, text(label)])
    nav[locale] = {"menu": menu, "footerHtml": clean_footer(footer)}

logo = local_image("https://klimin.marketing/cdn/shop/files/Aleksandr_Klimin_Logo_8.png?width=600")
json.dump({"pages": pages, "nav": nav, "logo": logo}, open(f"{GEN}/manifest.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)

# CSS: Dawn stylesheets plus the theme variables that Shopify rendered into <head>.
home = open(f"{CRAWL}/index.html", encoding="utf8").read()
vars_css = max(re.findall(r"<style data-shopify>(.*?)</style>", re.search(r"<head\b.*?</head>", home, re.S).group(0), re.S), key=len)
vars_css = re.sub(r"@font-face\s*\{.*?\}", "", vars_css, flags=re.S)
footer_css = next(s for s in re.findall(r"<style\b[^>]*>(.*?)</style>", home, re.S) if re.search(r"\.footer\s*\{\s*margin-top", s))
parts = [vars_css] + [open(f"{EXPORT}/theme/assets/{f}", encoding="utf8").read() for f in CSS_FILES] + [footer_css]
open(f"{PUBLIC}/css/theme.css", "w", encoding="utf8").write("\n".join(parts))
shutil.copy(f"{EXPORT}/theme/assets/fb_events.js", f"{PUBLIC}/js/fb_events.js")

# Redirects.
rules = []
def both(src, dst):
    for prefix in LOCALES.values():
        rules.append(f"{prefix}{src} {prefix}{dst} 301")

for r in json.load(open(f"{EXPORT}/redirects.json")):
    target = "/pages/calculadora-roas" if r["target"] == "/pages/calculadora-ecommerce" else r["target"]
    both(r["path"], target)
both("/pages/calculadora-ecommerce", "/pages/calculadora-roas")
both("/pages/casos-de-exito", "/pages/mi-track-record")
both("/pages/webinar", "/pages/consultoria")
both("/pages/servicios", "/pages/consultoria")
for src, dst in [("/privacy", "/pages/privacy-policy"), ("/privacy-policy", "/pages/privacy-policy"),
                 ("/terms", "/pages/terms"), ("/terms-of-service", "/pages/terms"), ("/help", "/pages/help")]:
    both(src, dst)
for section in ["cart", "search", "collections", "products", "blogs", "account"]:
    for prefix in LOCALES.values():
        home_path = prefix or "/"
        rules.append(f"{prefix}/{section} {home_path} 301")
        rules.append(f"{prefix}/{section}/* {home_path} 301")
open(f"{PUBLIC}/_redirects", "w").write("\n".join(dict.fromkeys(rules)) + "\n")

open(f"{PUBLIC}/_headers", "w").write("""https://:project.pages.dev/*
  X-Robots-Tag: noindex

/img/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=600

/js/*
  Cache-Control: public, max-age=600
""")
open(f"{PUBLIC}/robots.txt", "w").write(f"User-agent: *\nAllow: /\n\nSitemap: {ORIGIN}/sitemap.xml\n")

# Sitemap: the same pages Shopify listed, with hreflang alternates.
listed = set()
for f in os.listdir(f"{EXPORT}/crawl/sitemaps"):
    if "_pages_" in f:
        xml = open(f"{EXPORT}/crawl/sitemaps/{f}", encoding="utf8").read()
        listed |= {urllib.parse.urlparse(u).path or "/" for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)}
listed |= {p or "/" for p in LOCALES.values()}
entries = []
for p in pages:
    if p["path"] in listed and not (p["robots"] or "").startswith("noindex"):
        alt = "".join(f'<xhtml:link rel="alternate" hreflang="{a}" href="{b}"/>' for a, b in p["hreflang"])
        entries.append(f"<url><loc>{p['canonical']}</loc>{alt}</url>")
open(f"{PUBLIC}/sitemap.xml", "w", encoding="utf8").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + "\n".join(entries) + "\n</urlset>\n")

# Favicon: the same image Shopify served, in the sizes browsers and Google ask for.
fav = urllib.parse.urlparse(html.unescape(re.search(r'<link[^>]+rel="(?:shortcut )?icon"[^>]*href="([^"]+)"', home).group(1)))
for size in (32, 48, 180):
    req = urllib.request.Request(f"https://klimin.marketing{fav.path}?width={size}&height={size}&crop=center",
                                 headers={"User-Agent": "Mozilla/5.0 (compatible; site-migration-inventory)"})
    with urllib.request.urlopen(req, timeout=40) as r:
        open(f"{PUBLIC}/favicon-{size}.png", "wb").write(r.read())

# Images.
failed = []
for local, url in sorted(downloads.items()):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; site-migration-inventory)"})
        with urllib.request.urlopen(req, timeout=40) as r:
            open(f"{IMG}/{local}", "wb").write(r.read())
    except Exception as e:
        failed.append((local, str(e)))
    time.sleep(0.1)

left = {}
for f in os.listdir(f"{GEN}/html"):
    body = open(f"{GEN}/html/{f}", encoding="utf8").read()
    for u in re.findall(r"[^\s\"']*(?:cdn/shop|cdn\.shopify|myshopify)[^\s\"']*", body):
        left[u[:110]] = left.get(u[:110], 0) + 1
print(json.dumps({"pages": len(pages), "images": len(downloads), "imageFailures": failed, "redirectRules": len(dict.fromkeys(rules)),
                  "sitemapUrls": len(entries), "shopifyRefsLeft": left, "nav": nav["es"]}, ensure_ascii=False, indent=1))
