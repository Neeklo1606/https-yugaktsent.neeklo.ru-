/**
 * После `vite build`: встраивает title/description/canonical/og в HTML для SEO
 * и создаёт вложенные index.html (nginx try_files $uri/ → catalog/index.html и т.д.).
 *
 * Env:
 *   VITE_PUBLIC_SITE_URL | PUBLIC_SITE_URL — базовый URL сайта (без слэша в конце)
 *   PRERENDER_API_BASE — URL API для выборки ЖК (по умолчанию SITE + /api/v1)
 *   SKIP_PRERENDER=1 — пропустить (оставить только корневой index как после Vite)
 *   PRERENDER_MAX_COMPLEX — макс. число страниц /complex/* (по умолчанию 500)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

function trimSlash(u) {
  return String(u || '').replace(/\/+$/, '');
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainFromMaybeHtml(s, maxLen) {
  if (!s) return '';
  const t = String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** @param {string} html @param {{ title: string; description: string; canonical: string; robots?: string }} p */
function patchHtmlHead(html, p) {
  let out = html;
  /* Удаляем «хвост» от старых прогонов: robots/canonical перед </head> после script */
  out = out.replace(
    /\s*<meta\s+name="robots"[^>]+>\s*\n?\s*<link\s+rel="canonical"[^>]+>(?=\s*\n?\s*<\/head>)/gi,
    '',
  );
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(p.title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*>/i,
    `<meta name="description" content="${escapeAttr(p.description)}">`,
  );
  const robots = p.robots || 'index, follow';
  const robotsTag = `<meta name="robots" content="${escapeAttr(robots)}">`;
  const canonTag = `<link rel="canonical" href="${escapeAttr(p.canonical)}">`;
  if (/<meta\s+name="robots"/i.test(out)) {
    out = out.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
      robotsTag,
    );
  } else if (/<meta\s+charset/i.test(out)) {
    out = out.replace(/<meta\s+charset[^>]+>/i, (m) => `${m}\n    ${robotsTag}`);
  } else {
    out = out.replace(/<head>/i, `<head>\n    ${robotsTag}`);
  }
  if (/<link\s+rel="canonical"/i.test(out)) {
    out = out.replace(/<link\s+rel="canonical"[^>]*>/i, canonTag);
  } else {
    out = out.replace(/(<meta\s+name="robots"\s+content="[^"]*"\s*\/?>)/i, `$1\n    ${canonTag}`);
  }
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*>/i,
    `<meta property="og:title" content="${escapeAttr(p.title)}">`,
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*>/i,
    `<meta property="og:description" content="${escapeAttr(p.description)}">`,
  );
  if (/property="og:url"/i.test(out)) {
    out = out.replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${escapeAttr(p.canonical)}">`,
    );
  } else {
    out = out.replace(
      /<meta\s+property="og:type"[^>]*>/i,
      (m) => `${m}\n    <meta property="og:url" content="${escapeAttr(p.canonical)}">`,
    );
  }
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*>/i,
    `<meta name="twitter:title" content="${escapeAttr(p.title)}">`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*>/i,
    `<meta name="twitter:description" content="${escapeAttr(p.description)}">`,
  );
  return out;
}

function writeHtml(relDir, baseHtml, patch) {
  const dir = path.join(distDir, relDir);
  fs.mkdirSync(dir, { recursive: true });
  const html = patchHtmlHead(baseHtml, patch);
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'LiveGrid-Prerender/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function loadBlockSlugs(apiBase, maxComplex) {
  const slugs = [];
  const seen = new Set();
  let page = 1;
  let totalPages = 1;
  const perPage = 100;
  while (page <= totalPages && slugs.length < maxComplex) {
    const url = `${apiBase}/blocks?page=${page}&per_page=${perPage}`;
    const j = await fetchJson(url);
    totalPages = Math.max(1, Number(j.meta?.total_pages) || 1);
    const rows = j.data || [];
    if (!rows.length) break;
    for (const row of rows) {
      if (!row?.slug || seen.has(row.slug)) continue;
      if (row.slug.includes('..') || row.slug.includes('/') || row.slug.includes('\\')) continue;
      seen.add(row.slug);
      slugs.push({ slug: row.slug, name: row.name || row.slug, description: row.description || '' });
      if (slugs.length >= maxComplex) break;
    }
    page += 1;
  }
  return slugs;
}

function buildSitemapXml(siteUrl, complexPaths, extraPaths = []) {
  const staticPaths = [
    '/',
    '/catalog',
    '/catalog/apartments',
    // Дома, участки и коммерция пока пустые — пустые разделы в sitemap не отдаём
    '/map',
    '/news',
    '/about',
    '/contacts',
    '/privacy',
    '/terms',
    '/cookies',
    ...extraPaths,
  ];
  const urls = [];
  for (const p of staticPaths) {
    urls.push({ loc: `${siteUrl}${p}`, changefreq: p === '/' ? 'daily' : 'weekly', priority: p === '/' ? '1.0' : '0.7' });
  }
  for (const slug of complexPaths) {
    urls.push({
      loc: `${siteUrl}/complex/${encodeURIComponent(slug)}`,
      changefreq: 'weekly',
      priority: '0.85',
    });
  }
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

async function main() {
  if (process.env.SKIP_PRERENDER === '1') {
    console.log('[prerender-seo] SKIP_PRERENDER=1 — пропуск.');
    return;
  }

  const siteUrl = trimSlash(process.env.VITE_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://yugaktsent.neeklo.ru');
  const siteBrand = (process.env.VITE_DEFAULT_BRAND || process.env.SITE_BRAND || 'Агентство недвижимости').trim();
  const sitemapIndexUrl = `${siteUrl}/api/v1/sitemap/sitemap-index.xml`;
  const apiBase = trimSlash(process.env.PRERENDER_API_BASE || `${siteUrl}/api/v1`);
  const maxComplex = Math.max(1, Math.min(5000, Number(process.env.PRERENDER_MAX_COMPLEX) || 500));

  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('[prerender-seo] Нет dist/index.html. Сначала выполните vite build.');
    process.exit(1);
  }
  const baseHtml = fs.readFileSync(indexPath, 'utf8');

  const homeTitle = `${siteBrand} — новостройки и недвижимость`;
  const homeDesc = 'Каталог жилых комплексов и квартир: фильтры, карта, избранное и подборки.';
  fs.writeFileSync(
    indexPath,
    patchHtmlHead(baseHtml, {
      title: homeTitle,
      description: homeDesc,
      canonical: `${siteUrl}/`,
    }),
    'utf8',
  );

  writeHtml('catalog', baseHtml, {
    title: `Каталог недвижимости | ${siteBrand}`,
    description: 'Подбор ЖК и квартир по цене, району, метро и другим параметрам.',
    canonical: `${siteUrl}/catalog`,
  });

  let complexes = [];
  try {
    complexes = await loadBlockSlugs(apiBase, maxComplex);
    console.log(`[prerender-seo] API: ${complexes.length} ЖК (лимит ${maxComplex}).`);
  } catch (e) {
    console.warn(`[prerender-seo] Не удалось загрузить список ЖК (${e.message}). Только / и /catalog.`);
  }

  for (const c of complexes) {
    const desc = plainFromMaybeHtml(c.description, 200) || `ЖК ${c.name}: квартиры, планировки, инфраструктура.`;
    writeHtml(`complex/${c.slug}`, baseHtml, {
      title: `${c.name} — ЖК | ${siteBrand}`,
      description: desc,
      canonical: `${siteUrl}/complex/${encodeURIComponent(c.slug)}`,
    });
  }

  // Визитки экспертов: превью ссылки в Telegram/MAX должно работать без JS
  const experts = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../src/shared/experts/expert-seo.json'), 'utf8'),
  );
  for (const e of experts) {
    writeHtml(`experts/${e.slug}`, baseHtml, {
      title: `${e.title} | ${siteBrand}`,
      description: e.description,
      canonical: `${siteUrl}/experts/${e.slug}`,
    });
  }

  const sitemap = buildSitemapXml(
    siteUrl,
    complexes.map((c) => c.slug),
    experts.map((e) => `/experts/${e.slug}`),
  );
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap, 'utf8');

  const robots = `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${sitemapIndexUrl}
Sitemap: ${siteUrl}/sitemap.xml
`;
  fs.writeFileSync(path.join(distDir, 'robots.txt'), robots, 'utf8');

  console.log('[prerender-seo] Готово: index.html, catalog/, complex/*/, experts/*/, sitemap.xml, robots.txt');
}

main().catch((e) => {
  console.error('[prerender-seo]', e);
  process.exit(1);
});
