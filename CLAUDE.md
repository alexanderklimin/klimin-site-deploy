# klimin.marketing → перенос с Shopify на Astro + Cloudflare

Личный сайт пользователя (бренд-визитка + калькуляторы для e-commerce). Сейчас на Shopify (тариф Pause and Build, ничего не продаётся). Цель: перенести на Astro + Cloudflare — бесплатно, быстрее, проще править, без ограничений темы Shopify. SEO и ссылки не потерять.

## Правила работы
- Все сообщения пользователю — на русском, включая промежуточные. Контент сайта — как сейчас (основной испанский + en/pt-BR/ru).
- Ничего не менять на живом Shopify и не трогать DNS/домен без явного «да». Shopify не отключать, пока новый сайт не проверен на живом домене.
- Сначала всё показывать на тестовом адресе *.pages.dev, публикация на домен — только после «да».
- Секреты не выводить; хранить в /opt/klimin-site/.env (chmod 600). Cloudflare/GitHub токены — те же, что пользователь заводит для /opt/astro-es (спросить, можно ли переиспользовать, или нужен отдельный репозиторий).
- Изменения логировать в /opt/klimin-site/CHANGELOG.md.

## Доступ к текущему сайту (только чтение для выгрузки)
- Shopify Admin API: `import { readConfigFromEnv, pickShop, gql } from "/opt/shopify-mcp/src/shopifyClient.js"`, магазин `pickShop(config, "klimin")`; .env в /opt/shopify-mcp (загружать `set -a; . /opt/shopify-mcp/.env`).
- История правок сайта: /opt/shopify-mcp/CHANGELOG.md; исходники переводов: /opt/shopify-mcp/work/klimin-i18n/ (если есть); радар: /opt/shopify-mcp/klimin-radar (fetch.mjs, page.tpl.html).
- GA4 property 359116828; Search Console — read-only CLI /opt/shopify-mcp/scripts/gsc.mjs.

## Что есть на сайте (важно не потерять)
1. **Privacy policy / terms** — на них ссылаются приложения пользователя (в GA4 эти страницы смотрят пользователи приложений; ссылки, вероятно, в App Store / Google Play). URL обязаны остаться рабочими (тот же путь или 301).
2. **4 языка**: es (основной), /en, /ru, /pt (pt-BR) с переключателем и hreflang. Калькулятор и радар — только ES.
3. **Проиндексированы** (GSC 11-16): главная, /pages/sobre-klimin, /pages/calculadora-roas, /pages/demanda-nichos-ecommerce-chile, /pages/consultoria (+ sistema, mi-track-record). Сохранить пути `/pages/...` или сделать 301 через Cloudflare `_redirects`.
4. **Уже существующие 301 в Shopify** (lanzar, review, revision, review-ecommerce/agencia/crecer, review1, copia-de-review → /pages/consultoria) — перенести в `_redirects`. Выгрузить полный список urlRedirects через API.
5. **Калькулятор ROAS** (JS + FAQ + JSON-LD в теле страницы) и **радар ниш** (данные Keyword Planner + Merchant Center, ежемесячное обновление через klimin-radar; на сайте никаких живых запросов к Google Ads API).
6. **Schema**: Person/Organization JSON-LD (sameAs: facebook/instagram/tiktok klimin.marketing, youtube @Klimin.Marketing, LinkedIn), FAQPage на страницах.
7. **Трекинг**: GA4 (gtag), Meta pixel (fbq) с событиями кликов по кнопкам WhatsApp/консультации, тег Bing msvalidate.
8. **Контакты**: страница contact без формы (кнопки WhatsApp + Consultoría + email/телефон, тексты по языкам). Консультация USD 400 / 60 мин, CTA → WhatsApp / email (оплаты на сайте нет).
9. Картинки и alt-тексты, главный H1: «Opero e-commerce propios y participo en decisiones de crecimiento».

## План
1. Домен klimin.marketing уже на Cloudflare (user 2026-11-18) — переноса не нужно, переключение = подключить custom domain к Pages и заменить DNS-записи Shopify (A/CNAME на shops.myshopify.com). Перед этим снять снимок всех DNS-записей; MX/TXT/SPF/DKIM (почта, верификации Google/Bing/Meta) не трогать. Тариф Shopify ~$110/год.
2. Инвентаризация через API: все pages, блоги/статьи, menus, urlRedirects, переводы (translatableResources по 3 локалям), файлы/картинки, текущий sitemap.xml. Сохранить снимок в /opt/klimin-site/export/.
3. Собрать Astro-сайт с теми же URL и текстами, i18n, калькулятор и радар как компоненты; sitemap, robots, hreflang, schema.
4. Деплой на *.pages.dev → пользователь проверяет → сравнить все старые URL (sitemap + GSC) на 200/301.
5. С «да»: переключить домен/DNS на Cloudflare, проверить privacy/terms ссылки из приложений, отправить sitemap в GSC.
6. Только после проверки — Shopify отключить (пользователь сам).
7. Дальше: новые калькуляторы (punto de equilibrio, LTV/CAC, precio de venta), статьи.
