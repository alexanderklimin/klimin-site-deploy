# CHANGELOG

## 2026-11-18
- Инвентаризация текущего сайта, только чтение. Shopify и DNS не менялись.
- `scripts/export-shopify.mjs`: выгрузка страниц, меню, редиректов, файлов, переводов и активной темы в `export/`.
- `scripts/crawl-public.mjs`: снимок 219 публичных URL в `export/crawl/`.
- `export/dns-public-20261118.txt`: публичный снимок DNS.
- `export/gsc-pages.json`, `export/ga4-pages.json`: адреса из Search Console и GA4.
- `export/INVENTORY.md`: сводка инвентаризации.
- Пользователь подтвердил («да»): отдельный проект, 301 для старых адресов с посещениями, 301 служебных адресов Shopify на главную.
- Собран Astro-сайт (локально, не опубликован): `scripts/extract-content.py` генерирует контент, картинки, `_redirects`, `_headers`, `robots.txt`, `sitemap.xml`; шапка и подвал в `src/layouts/Layout.astro`.
- Трекинг (GA4, Google Ads, Meta pixel) включается только на домене klimin.marketing, на тестовом адресе выключен.
- Форма подписки из подвала не перенесена: она отправляла данные в Shopify.
- `scripts/verify.mjs`: сверка нового сайта со снимком старого, отчёт в `export/verify-report.json`.
- Публикация как в astro-es (GitHub → Cloudflare): локальный git-репозиторий, отдельный deploy key `/root/.ssh/klimin_site_deploy`, host-алиас `github-klimin-site`, remote `alexanderklimin/klimin-site-deploy` (репозиторий создан пользователем).
- Проверка автопубликации GitHub → Cloudflare Pages: добавлен служебный файл `public/version.txt`.
- Шапка как на Shopify: на компьютере меню рядом с логотипом, язык справа; на телефоне кнопка меню слева, логотип по центру, языки и соцсети внутри меню.
