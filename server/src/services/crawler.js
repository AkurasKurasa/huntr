import * as cheerio from 'cheerio';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';

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

// Job boards list many companies' posts; their name must never be mistaken for the employer.
const JOB_BOARDS = /(^|\.)(onlinejobs|jobstreet|indeed|linkedin|glassdoor|kalibrr|upwork|bossjob|foundit|monster|ziprecruiter|jora|careerjet|workabroad|philjobnet|wellfound|remoteok|weworkremotely|jobsdb|hiringcafe|remotive|himalayas|otta|builtin|dice|simplyhired|careerbuilder|seek)\./i;

// Lines that are site furniture, not part of the job post.
const JUNK_LINE = new RegExp(
  [
    '^<?\\s*back to (search )?results?',
    '^(report|bookmark|share( this (post|job))?|save( (this )?job)?|apply( now)?|print|copy link|close|×|x)$',
    '^(view|see) (other|more|similar) (job )?(posts|jobs).*',
    '^job post reporter.*', '^(rank|reason|date|note:?|status|actions?)$',
    '^why is this blurred\\??$', '^for privacy and security reasons.*',
    '^please (log ?in|login|sign ?in|register)\\b.*$',
    '^(sign|log) ?in( to (view|apply|see).*)?$', '^create (a )?(free )?account.*$',
    '^(cookies?|we use cookies).*$', '^(follow us|share on).*$'
  ].join('|'),
  'i'
);
const LOGIN_TO_APPLY = /(log ?in|sign ?in|register)[^.\n]{0,60}\bto (apply|view|see)/i;

function cleanText(text) {
  const lines = (text || '')
    .replace(/\r/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1') // markdown bold some boards leave in
    .replace(/__(.+?)__/g, '$1')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim());
  const out = [];
  for (const l of lines) {
    if (l && JUNK_LINE.test(l)) continue;
    if (!l && (!out.length || out[out.length - 1] === '')) continue; // collapse blank lines
    out.push(l);
  }
  return out.join('\n').trim();
}

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  $('script, style, noscript, svg, button, form, iframe').remove();
  $('br').replaceWith('\n');
  $('li').each((_, el) => { $(el).prepend('• ').append('\n'); });
  $('p, div, section, article, h1, h2, h3, h4, h5, h6, tr, ul, ol, dd, dt, blockquote').each((_, el) => { $(el).append('\n'); });
  $('h1, h2, h3, h4, h5, h6').each((_, el) => { $(el).prepend('\n'); });
  return cleanText($('#__root').text());
}

/** Reader-view extraction (same engine as Firefox Reader View). */
function readable(html, pageUrl) {
  try {
    const virtualConsole = new VirtualConsole(); // silence CSS parse warnings
    const dom = new JSDOM(html, { url: pageUrl, virtualConsole });
    const article = new Readability(dom.window.document, { charThreshold: 200 }).parse();
    return article?.content ? { text: htmlToText(article.content), title: (article.title || '').trim() } : null;
  } catch {
    return null;
  }
}

/** A container that is clearly the description (many sites and ATS pages name it). */
function namedDescription($) {
  const sel = [
    '[itemprop="description"]', '#job-description', '#jobDescription', '#job-details', '.job-description',
    '[class*="job-description"]', '[class*="jobDescription"]', '[class*="job_description"]',
    '[data-testid*="description"]', '[class*="description"]'
  ].join(', ');
  let best = '';
  $(sel).each((_, el) => {
    const t = htmlToText($.html(el));
    if (t.length > best.length) best = t;
  });
  return best.length >= 200 ? best : '';
}

/**
 * Splits " | Site Name" / " — Company (City)" endings off a page title.
 * Returns the cleaned title plus what was removed (on company sites that part is the employer).
 */
function stripSiteSuffix(title, siteName, host) {
  const base = (host || '').replace(/^(www|jobs|careers|apply)\./, '').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const site = (siteName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const parts = title.split(/\s+[|–—-]\s+/);
  const removed = [];
  while (parts.length > 1) {
    const raw = parts[parts.length - 1];
    const last = raw.replace(/\(.*\)/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if ((site && last.includes(site)) || (base && (last.includes(base) || base.includes(last))) || (/jobs?|careers?/.test(last) && last.length < 20)) {
      removed.unshift(raw);
      parts.pop();
    } else break;
  }
  return { title: parts.join(' — ').trim(), suffix: removed.join(' — ').trim() };
}

/** "Kite & Co. (Makati, Hybrid)" -> { name: "Kite & Co.", location: "Makati, Hybrid" }; drops "Careers" etc. */
function companyFromSuffix(suffix) {
  if (!suffix) return { name: '', location: '' };
  const loc = suffix.match(/\(([^)]+)\)/);
  const name = suffix
    .split(/\s+—\s+/)[0]
    .replace(/\(.*\)/, '')
    .replace(/\b(careers?|jobs?|job board|hiring|recruitment|work with us)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { name: /[a-z]/i.test(name) ? name : '', location: loc ? loc[1].trim() : '' };
}

/** "ClientAscend is a custom sales operations platform…" -> "ClientAscend" */
export function companyFromText(text) {
  const t = text || '';
  // Names are joined by plain spaces only — "\s" would let a heading on the line above glue onto the name.
  const label = t.match(/^(?:company|employer|client|hiring company|organization)[ ]*[:\-][ ]*(.{2,60})$/im);
  if (label) return label[1].trim();
  const about = t.match(/^about[ ]+([A-Z][\w&.'’\- ]{1,40}?)[ ]*:?[ ]*$/im);
  if (about && !/^(the|this|us|you|the role|the job|the company)$/i.test(about[1])) return about[1].trim();
  const isA = t.match(/(?:^|\.[ ]+)(?:At[ ]+)?([A-Z][A-Za-z0-9&.'’\-]+(?:[ ]+[A-Z][A-Za-z0-9&.'’\-]+){0,3})[ ]+is[ ]+(?:a|an|the)[ ]/m);
  if (isA && !/^(This|The|It|Our|We|You|Job|Role|Position|Work)$/i.test(isA[1])) return isA[1].trim();
  return '';
}

/**
 * Pulls what Huntr needs out of a job page: title, company, location, a clean
 * description, mailto addresses, apply links, the post's image and any form fields.
 */
export function extractPage(html, pageUrl) {
  const $ = cheerio.load(html);
  let host = '';
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    /* ignore */
  }
  const isBoard = JOB_BOARDS.test(host);

  // Structured data (most ATS pages include this)
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
    if (/apply|application/i.test(text) && href && !href.startsWith('mailto:') && !href.startsWith('#') && !/log ?in|sign ?in|register/i.test(href)) {
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
      if (['hidden', 'submit', 'button', 'search'].includes(type)) return;
      const id = $(f).attr('id');
      const label = (id && $(`label[for="${id}"]`).text().trim()) || $(f).attr('aria-label') || $(f).attr('placeholder') || $(f).attr('name') || type;
      formFields.push({ label: label.slice(0, 80), type, required: $(f).is('[required]') });
    });
  });

  // JobStreet / SEEK mark their job fields with data-automation attributes.
  const auto = (name) => $(`[data-automation="${name}"]`).first();
  const seek = /(^|\.)(jobstreet|jobsdb|seek)\./i.test(host)
    ? {
        title: auto('job-detail-title').text().replace(/\s+/g, ' ').trim(),
        company: auto('advertiser-name').text().replace(/\s+/g, ' ').trim(),
        location: auto('job-detail-location').text().replace(/\s+/g, ' ').trim(),
        description: auto('jobAdDetails').html() ? htmlToText(auto('jobAdDetails').html()) : ''
      }
    : {};

  const imageUrl = pickImage($, posting, pageUrl);
  const rawText = $('body').text();
  const loginRequired = LOGIN_TO_APPLY.test(rawText);

  // Description: JSON-LD > a container named "description" > reader view > whole page (cleaned)
  let description = seek.description || (posting?.description ? htmlToText(posting.description) : '');
  if (!description) description = namedDescription($);
  const reader = readable(html, pageUrl);
  if (!description && reader?.text && reader.text.length >= 200) description = reader.text;
  if (!description) {
    $('script, style, noscript, svg, nav, footer, header, iframe, aside, form, button, [role="dialog"], [aria-hidden="true"]').remove();
    description = htmlToText(($('main').html() || $('body').html() || ''));
  }

  // Title
  const siteName = $('meta[property="og:site_name"]').attr('content') || '';
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const doc = stripSiteSuffix(($('title').text() || '').replace(/\s+/g, ' ').trim(), siteName, host);
  const og = stripSiteSuffix(($('meta[property="og:title"]').attr('content') || '').trim(), siteName, host);
  let title = seek.title || posting?.title || '';
  if (!title) title = isBoard ? (h1 || og.title || doc.title) : (og.title || doc.title || h1);

  // Company: JSON-LD > (company sites only) site name or the part cut off the title > clues in the text
  const org = posting?.hiringOrganization;
  const fromSuffix = companyFromSuffix(og.suffix || doc.suffix);
  let company = seek.company || (typeof org === 'string' ? org : org?.name) || '';
  if (!company && !isBoard) company = siteName || fromSuffix.name;
  if (!company) company = companyFromText(description);

  const loc = Array.isArray(posting?.jobLocation) ? posting.jobLocation[0] : posting?.jobLocation;
  const addr = loc?.address || {};

  return {
    title,
    company,
    location: seek.location || [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ') ||
      (posting?.jobLocationType === 'TELECOMMUTE' ? 'Remote' : '') || (isBoard ? '' : fromSuffix.location),
    description: description.slice(0, 20000),
    isBoard,
    loginRequired,
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

/** A page your own browser already loaded (sent by the Huntr extension) — read it without fetching. */
export function fromBrowser(url, html, finalUrl) {
  const u = assertSafeUrl(finalUrl || url);
  return { ...extractPage(String(html), u.toString()), finalUrl: u.toString() };
}

/**
 * The job's own page for links copied from a job board's search results.
 * JobStreet search pages show the job in a side panel: …/part-time-jobs/remote?jobId=95359992
 * → https://ph.jobstreet.com/job/95359992 (otherwise we'd read "1,356 jobs in Philippines").
 */
export function canonicalJobUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (/(^|\.)(jobstreet\.com(\.ph)?|jobsdb\.com|seek\.com(\.au)?)$/i.test(u.hostname)) {
    const id = u.searchParams.get('jobId') || (u.pathname.match(/\/job\/(\d+)/) || [])[1];
    if (id) return `${u.protocol}//${u.hostname}/job/${id}`;
  }
  if (/(^|\.)indeed\.com$/i.test(u.hostname)) {
    const jk = u.searchParams.get('jk') || u.searchParams.get('vjk');
    if (jk) return `${u.protocol}//${u.hostname}/viewjob?jk=${jk}`;
  }
  return raw;
}

/** A search-results page rather than one job ("1,356 jobs in Philippines"). */
export const looksLikeSearchPage = (title) => /^\s*[\d,.]+\+?\s+(\w+\s+)?jobs?\b/i.test(title || '') || /\bjobs? in [A-Z][\w ]+ - /.test(title || '');
