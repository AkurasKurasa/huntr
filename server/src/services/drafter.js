// Writes the email or cover letter from the analysis + the user's profile.
// Anything Huntr doesn't know yet stays as a [bracketed] placeholder.

const or = (v, fallback) => (v && String(v).trim() ? String(v).trim() : fallback);

export function fillSubject(job, profile) {
  const name = or(profile?.full_name, '[Your Full Name]');
  if (job.subject_rule) {
    return job.subject_rule.replace(/\[(your )?(full )?name\]|<(your )?(full )?name>|\{(your )?(full )?name\}/gi, name);
  }
  return `Application — ${job.title} — ${name}`;
}

export function draftBody(job, profile, tone = 'formal') {
  const name = or(profile?.full_name, '[Your Full Name]');
  const who = profile?.degree || profile?.school
    ? [or(profile.degree, ''), profile.school ? `at ${profile.school}` : ''].filter(Boolean).join(' ')
    : '[your year and degree] at [your school]';
  const mine = (profile?.skills || []).map((s) => s.toLowerCase());
  const overlap = job.skills.filter((s) => mine.includes(s.toLowerCase()));
  const skillList = (overlap.length ? overlap : job.skills).slice(0, 4);
  const skillText = skillList.length ? skillList.join(', ') : '[your key skills]';
  const company = job.company || 'the team';
  const portfolio = or(profile?.portfolio_url, '[portfolio link]');

  const greet = job.method === 'email'
    ? { formal: `Dear ${company} Hiring Team,`, friendly: `Hi ${company} team,`, concise: 'Hello,' }[tone]
    : { formal: 'Dear Hiring Manager,', friendly: 'Hi there,', concise: 'Hello,' }[tone];

  const intro = {
    formal: `I am writing to apply for the ${job.title} position. I am a ${who}, and I work with ${skillText}.`,
    friendly: `I'm excited to apply for the ${job.title} role! I'm a ${who} and I love building things with ${skillText}.`,
    concise: `I'd like to apply for the ${job.title} role. Relevant skills: ${skillText}.`
  }[tone];

  const project = job.wants_project
    ? {
        formal: 'One project I am proud of is [project name], where I [what you built and your role in it].',
        friendly: "A project I'm really proud of is [project name] — I [what you built and your role in it].",
        concise: 'Project: [project name] — [one line on what you built].'
      }[tone]
    : {
        formal: 'In my recent work on [project or experience], I [a result that matches this role].',
        friendly: 'Recently I worked on [project or experience], where I [a result that matches this role].',
        concise: 'Recent work: [project or experience] — [result].'
      }[tone];

  const files = job.method === 'email'
    ? (job.needs.includes('portfolio') || profile?.portfolio_url
        ? `My resume is attached, and you can see my work at ${portfolio}.`
        : 'My resume is attached.')
    : null;

  const close = {
    formal: `Thank you for your time and consideration.\n\nSincerely,\n${name}`,
    friendly: `Thanks so much for reading — I'd love to chat!\n\nBest,\n${name}`,
    concise: `Thank you,\n${name}`
  }[tone];

  return [greet, intro, project, files, close].filter(Boolean).join('\n\n');
}
