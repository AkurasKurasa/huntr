import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 HuntrBot/0.1';
const MAX_BYTES = 3_000_000;

/** Only allow public http(s) URLs (blocks localhost / private network targets). */
export function assertSafeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Not a valid link');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https links are supported');
  const host = url.hostname.toLowerCase();
  const privateHost =
    host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) || host === '0.0.0.0' || host === '[::1]';
  if (privateHost) throw new Error('That link points to a private network address');
  return url;
}

export async function fetchPage(rawUrl, { timeoutMs = 15000 } = {}) {
  const url = assertSafeUrl(rawUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }
    });
    if (!res.ok) throw new Error(`The page answered with HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('html')) throw new Error('That link is not a web page');
    const html = await res.text();
    return { html: html.slice(0, MAX_BYTES), finalUrl: res.url || url.toString() };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The page took too long to load');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function findJobPosting(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const type = node['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return node;
  if (node['@graph']) return findJobPosting(node['@graph']);
  return null;
}

const imgOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? imgOf(v[0]) : v?.url || v?.contentUrl || null);
const looksLikeIcon = (src) => /(sprite|icon|pixel|spacer|tracking|favicon|\.svg(\?|$)|data:)/i.test(src);

/** The best picture for the post: its share image, the JSON-LD image/logo, or the first real image on the page. */
function pickImage($, posting, pageUrl) {
  const candidates = [
    $('meta[property="og:image:secure_url"]').attr('content'),
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    imgOf(posting?.image),
    imgOf(posting?.hiringOrganization?.logo)
  ];
  $('main img, article img, [class*="job"] img, body img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    const w = Number($(el).attr('width') || 0);
    if (src && !looksLikeIcon(src) && (w === 0 || w >= 120)) candidates.push(src);
  });
  for (const c of candidates) {
    if (!c || looksLikeIcon(c)) continue;
    try {
      const u = new URL(c.trim(), pageUrl);
      if (/^https?:$/.test(u.protocol)) return u.toString();
    } catch {
      /* try the next one */
    }
  }
  return null;
}

// A <title> like "Role — Company (City)" carries more than the <h1>, so prefer it.
function pickTitle(docTitle, h1) {
  if (docTitle && /\s[—–|-]\s|\sat\s/i.test(docTitle)) return docTitle;
  return h1 || docTitle;
}

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(`<div>${html}</div>`);
  $('br').replaceWith('\n');
  $('p, li, div, h1, h2, h3, h4').each((_, el) => { $(el).append('\n'); });
  return $.text().replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Pulls what Huntr needs out of a job page: title, company, location, the
 * description text, mailto addresses, apply links and whether there is a form.
 */
export function extractPage(html, pageUrl) {
  const $ = cheerio.load(html);

  // Structured data (most job boards and ATS pages include this)
  let posting = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (posting) return;
    try {
      posting = findJobPosting(JSON.parse($(el).contents().text()));
    } catch {
      /* ignore broken JSON-LD */
    }
  });

  const mailtos = new Set();
  $('a[href^="mailto:"]').each((_, el) => {
    const addr = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
    if (addr) mailtos.add(decodeURIComponent(addr));
  });

  const applyLinks = [];
  $('a[href]').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    if (/apply|application/i.test(text) && href && !href.startsWith('mailto:') && !href.startsWith('#')) {
      try {
        applyLinks.push(new URL(href, pageUrl).toString());
      } catch {
        /* ignore */
      }
    }
  });

  const formFields = [];
  $('form').each((_, form) => {
    $(form).find('input, textarea, select').each((__, f) => {
      const type = ($(f).attr('type') || f.tagName).toLowerCase();
      if (['hidden', 'submit', 'button'].includes(type)) return;
      const id = $(f).attr('id');
      const label = (id && $(`label[for="${id}"]`).text().trim()) || $(f).attr('aria-label') || $(f).attr('placeholder') || $(f).attr('name') || type;
      formFields.push({ label: label.slice(0, 80), type, required: $(f).is('[required]') });
    });
  });

  const imageUrl = pickImage($, posting, pageUrl);

  $('script, style, noscript, svg, nav, footer, header, iframe').remove();
  const bodyText = ($('main').text() || $('body').text()).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();

  const org = posting?.hiringOrganization;
  const loc = Array.isArray(posting?.jobLocation) ? posting.jobLocation[0] : posting?.jobLocation;
  const addr = loc?.address || {};

  return {
    title: posting?.title || $('meta[property="og:title"]').attr('content') || pickTitle($('title').text().trim(), $('h1').first().text().trim()),
    company: (typeof org === 'string' ? org : org?.name) || $('meta[property="og:site_name"]').attr('content') || '',
    location: [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ') ||
      (posting?.jobLocationType === 'TELECOMMUTE' ? 'Remote' : ''),
    description: posting?.description ? htmlToText(posting.description) : bodyText.slice(0, 20000),
    mailtos: [...mailtos],
    applyLinks: [...new Set(applyLinks)].slice(0, 5),
    imageUrl,
    formFields: formFields.slice(0, 40)
  };
}

export async function crawl(url) {
  const { html, finalUrl } = await fetchPage(url);
  return { ...extractPage(html, finalUrl), finalUrl };
}
