// Writes the email or cover letter from the analysis + the user's profile.
// Rule: never invent facts and never leave [placeholders] for things we simply don't know —
// if a detail is missing, that sentence is left out. The only bracket that can appear is a
// question the employer asked that only the applicant can answer, and Huntr flags it before sending.

const clean = (v) => (v && String(v).trim() ? String(v).trim().replace(/\s+/g, ' ') : '');
const sentence = (s) => (s ? s.replace(/\s*[.!]?\s*$/, '.') : '');
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export const QUESTION_MARK = '[Answer needed:';

export function fillSubject(job, profile) {
  const name = clean(profile?.full_name);
  if (job.subject_rule) {
    const filled = job.subject_rule.replace(/\[(your )?(full )?name\]|<(your )?(full )?name>|\{(your )?(full )?name\}/gi, name || '');
    return filled.replace(/\s*[–—-]\s*$/, '').trim();
  }
  return name ? `Application for ${job.title} — ${name}` : `Application for ${job.title}`;
}

export function draftBody(job, profile = {}, tone = 'formal') {
  const name = clean(profile?.full_name);
  const headline = clean(profile?.headline);
  const summary = clean(profile?.summary);
  const highlight = clean(profile?.highlight);
  const school = clean(profile?.school);
  const degree = clean(profile?.degree);
  const portfolio = clean(profile?.portfolio_url);
  const mySkills = (profile?.skills || []).map(clean).filter(Boolean);
  const jobSkills = job.skills || [];

  // Skills: the ones you have that the job wants > your own top skills > nothing (never invent)
  const overlap = mySkills.filter((s) => jobSkills.some((j) => j.toLowerCase() === s.toLowerCase()));
  const skills = (overlap.length ? overlap : mySkills).slice(0, 4);
  const company = clean(job.company);
  const role = clean(job.title) || 'this role';

  const greet = job.method === 'email' && company && company !== 'the hiring team'
    ? { formal: `Dear ${company} Hiring Team,`, friendly: `Hi ${company} team,`, concise: 'Hello,' }[tone]
    : { formal: 'Dear Hiring Manager,', friendly: 'Hi there,', concise: 'Hello,' }[tone];

  // Who you are — built only from what's in your profile
  const study = degree && school ? `${degree} at ${school}` : degree || (school ? `a student at ${school}` : '');
  const who = headline || study;
  const intro = {
    formal: `I am writing to apply for the ${role} position${company && company !== 'the hiring team' ? ` at ${company}` : ''}.${who ? ` I am a ${lowerFirst(who).replace(/^(a|an) /, '')}${headline && study ? `, currently ${lowerFirst(study)}` : ''}.` : ''}`,
    friendly: `I'm excited to apply for the ${role} role${company && company !== 'the hiring team' ? ` at ${company}` : ''}!${who ? ` I'm a ${lowerFirst(who).replace(/^(a|an) /, '')}${headline && study ? `, currently ${lowerFirst(study)}` : ''}.` : ''}`,
    concise: `I'd like to apply for the ${role} role.${who ? ` I'm a ${lowerFirst(who).replace(/^(a|an) /, '')}.` : ''}`
  }[tone].replace(/I am a a |I'm a a /g, (m) => m.replace('a a ', 'a '));

  const skillLine = skills.length
    ? {
        formal: `I work with ${list(skills)}${overlap.length ? ', which match what this role needs' : ''}.`,
        friendly: `I work with ${list(skills)}${overlap.length ? ' — right in line with what you’re looking for' : ''}.`,
        concise: `Skills: ${skills.join(', ')}.`
      }[tone]
    : '';

  const about = summary ? sentence(summary) : '';
  const proud = highlight
    ? { formal: sentence(`A recent example of my work: ${highlight}`), friendly: sentence(`Something I'm proud of: ${highlight}`), concise: sentence(`Recent work: ${highlight}`) }[tone]
    : '';

  // Questions the employer explicitly asked — only the applicant can answer these.
  const asks = (job.asks || []).slice(0, 2).map((a) => `${QUESTION_MARK} ${a.length > 220 ? a.slice(0, 217) + '…' : a}]`);

  const links = [];
  if (job.method === 'email') links.push(portfolio ? `My resume is attached, and you can see my work at ${portfolio}.` : 'My resume is attached.');
  else if (portfolio) links.push(`You can see my work at ${portfolio}.`);

  const close = {
    formal: `Thank you for your time and consideration.${name ? `\n\nSincerely,\n${name}` : ''}`,
    friendly: `Thanks so much for reading — I'd love to chat!${name ? `\n\nBest,\n${name}` : ''}`,
    concise: `Thank you.${name ? `\n\n${name}` : ''}`
  }[tone];

  const middle = [about, [skillLine, proud].filter(Boolean).join(' ')].filter(Boolean);
  return [greet, intro, ...middle, ...asks, ...links, close].filter(Boolean).join('\n\n');
}

/** Things in a draft that still need the applicant before sending. */
export function unansweredQuestions(body) {
  return (body || '').match(/\[Answer needed:[^\]]*\]/g) || [];
}
