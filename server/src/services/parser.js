// Works out *how* a job wants you to apply, from the crawled page.

export const SKILLS = [
  'HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Node', 'Express',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Supabase', 'Firebase', 'Python', 'Django', 'Flask', 'Java', 'Spring',
  'Kotlin', 'Swift', 'Flutter', 'Dart', 'C#', '.NET', 'C++', 'Go', 'Rust', 'PHP', 'Laravel', 'Ruby', 'SQL',
  'Excel', 'Power BI', 'Tableau', 'Figma', 'Git', 'Docker', 'AWS', 'Azure', 'GCP', 'Linux', 'Accessibility',
  'REST', 'GraphQL', 'Tailwind'
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const IGNORE_EMAIL = /(noreply|no-reply|donotreply|privacy|support|abuse|webmaster|example\.com$|sentry|@2x)/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function splitTitle(raw) {
  // "Junior Web Developer — Kite & Co. (Makati, Hybrid)" or "Role at Company"
  const t = (raw || '').trim();
  const dash = t.split(/\s+[—–|-]\s+/);
  if (dash.length > 1) {
    const loc = dash.slice(1).join(' ').match(/\(([^)]+)\)/);
    return { title: dash[0].trim(), company: dash[1].replace(/\(.*\)/, '').trim(), location: loc ? loc[1] : '' };
  }
  const at = t.match(/^(.*?)\s+at\s+(.+)$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim(), location: '' };
  return { title: t, company: '', location: '' };
}

export function analyze(page, sourceUrl) {
  const text = page.description || '';
  const split = splitTitle(page.title);
  const title = split.title || 'Untitled role';
  const company = page.company || split.company || hostName(sourceUrl);
  const location = page.location || split.location || '';

  const emails = [...new Set([...(page.mailtos || []), ...(text.match(EMAIL_RE) || [])])].filter((e) => !IGNORE_EMAIL.test(e));
  const urlInText = (text.match(/https?:\/\/[^\s)<>"]+/g) || []).map((u) => u.replace(/[.,;]+$/, ''));
  const noEmail = /(e-?mail[^.]*(not be considered|not (be )?accepted|will be ignored))|do not (send|e-?mail)|apply (only )?(through|via|on) (our|the) (portal|website|site)/i.test(text);

  // Prefer an email that the "how to apply" part mentions.
  const applyEmail = emails.find((e) => new RegExp(`(send|email|e-mail|forward|submit)[^.]{0,120}${escapeRe(e)}`, 'i').test(text)) || emails[0] || '';
  const method = applyEmail && !noEmail ? 'email' : 'site';

  const subjM = text.match(/subject(?:\s+line)?[^"“'\n]{0,40}["“']([^"”'\n]{3,120})["”']/i);
  const sentences = text
    .replace(/\s*\n+\s*/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length < 400 && /(apply|send|subject|e-?mail|portal|cover letter|screening|resume|cv\b|portfolio)/i.test(s))
    .slice(0, 4);

  const skills = SKILLS.filter((s) => new RegExp(`(^|[^A-Za-z])${escapeRe(s)}([^A-Za-z]|$)`, 'i').test(text));
  const needs = ['resume'];
  if (/cover letter/i.test(text) || method === 'site') needs.push('cover letter');
  if (/portfolio/i.test(text)) needs.push('portfolio');
  if (/screening|questionnaire|assessment questions/i.test(text)) needs.push('screening');

  return {
    source_url: sourceUrl,
    title,
    company,
    location,
    method,
    apply_email: method === 'email' ? applyEmail : null,
    apply_url: method === 'site' ? (page.applyLinks?.[0] || urlInText.find((u) => /apply|career|job/i.test(u)) || page.finalUrl || sourceUrl) : null,
    instructions: sentences,
    skills,
    needs,
    subject_rule: subjM ? subjM[1].trim() : null,
    wants_project: /project/i.test(text),
    no_email: noEmail,
    form_fields: page.formFields || []
  };
}

export function hostName(url) {
  try {
    const h = new URL(url).hostname.replace(/^(www|jobs|careers|apply)\./, '');
    const base = h.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return '';
  }
}
