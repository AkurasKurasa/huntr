import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPage } from '../src/services/crawler.js';
import { analyze } from '../src/services/parser.js';
import { draftBody, fillSubject } from '../src/services/drafter.js';
import { buildMime } from '../src/services/gmail.js';

const emailPage = `<!doctype html><html><head><meta property="og:image" content="/img/kite-banner.png"><title>Junior Web Developer — Kite &amp; Co. (Makati, Hybrid)</title></head>
<body><main><h1>Junior Web Developer</h1>
<p>We're looking for a junior web developer comfortable with HTML, CSS, JavaScript and React.</p>
<p>How to apply: Send your resume and portfolio link to hiring@kite-co.example with the subject line "Junior Web Developer – [Your Full Name]". Tell us about one project you're proud of.</p>
</main></body></html>`;

const sitePage = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Frontend Engineer","hiringOrganization":{"@type":"Organization","name":"Lumen Pay"},"hiringOrganization2":null,"image":{"@type":"ImageObject","url":"https://cdn.lumenpay.example/careers/hero.jpg"},"jobLocation":{"@type":"Place","address":{"addressLocality":"Manila","addressCountry":"PH"}},"description":"<p>Build payment flows in React and TypeScript.</p><p>Applications sent by email will not be considered. Questions? careers@lumenpay.example</p><p>You'll need a resume, a cover letter and answers to two screening questions.</p>"}</script>
</head><body><a href="/jobs/frontend-engineer/apply">Apply now</a>
<form><label for="n">Full name</label><input id="n" name="name" required><input type="file" name="resume"></form></body></html>`;

test('email listing: finds address, subject rule and skills', () => {
  const page = extractPage(emailPage, 'https://jobs.kite-co.example/jwd');
  const job = analyze({ ...page, finalUrl: 'https://jobs.kite-co.example/jwd' }, 'https://jobs.kite-co.example/jwd');
  assert.equal(job.method, 'email');
  assert.equal(job.apply_email, 'hiring@kite-co.example');
  assert.equal(job.subject_rule, 'Junior Web Developer – [Your Full Name]');
  assert.deepEqual(job.skills, ['HTML', 'CSS', 'JavaScript', 'React']);
  assert.ok(job.needs.includes('portfolio'));
  assert.equal(page.imageUrl, 'https://jobs.kite-co.example/img/kite-banner.png');
  assert.match(page.description, /How to apply/);
  assert.equal(fillSubject(job, { full_name: 'Paul Calma' }), 'Junior Web Developer – Paul Calma');
  const body = draftBody(job, { full_name: 'Paul Calma', skills: ['React'] }, 'formal');
  assert.equal(job.company, 'Kite & Co.');
  assert.equal(job.location, 'Makati, Hybrid');
  assert.match(body, /^Dear Kite & Co\. Hiring Team,/);
  assert.match(body, /Paul Calma$/);
});

test('site listing: JSON-LD, "no email" rule and apply link', () => {
  const page = extractPage(sitePage, 'https://careers.lumenpay.example/jobs/frontend-engineer');
  assert.equal(page.title, 'Frontend Engineer');
  assert.equal(page.company, 'Lumen Pay');
  assert.equal(page.location, 'Manila, PH');
  const job = analyze({ ...page, finalUrl: 'https://careers.lumenpay.example/jobs/frontend-engineer' }, 'https://careers.lumenpay.example/jobs/frontend-engineer');
  assert.equal(job.method, 'site');
  assert.equal(job.apply_url, 'https://careers.lumenpay.example/jobs/frontend-engineer/apply');
  assert.ok(job.needs.includes('cover letter'));
  assert.ok(job.needs.includes('screening'));
  assert.equal(page.formFields[0].label, 'Full name');
  assert.equal(page.imageUrl, 'https://cdn.lumenpay.example/careers/hero.jpg');
});

test('MIME message with attachment is well formed', () => {
  const mime = buildMime({ to: 'a@b.co', subject: 'Héllo', body: 'Hi', attachment: { filename: 'cv.pdf', contentType: 'application/pdf', data: Buffer.from('pdf') } });
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /filename="cv.pdf"/);
});

const onlinejobsPage = `<!doctype html><html><head>
<title>Part-Time Developer — Next.js / Supabase / Telnyx Troubleshooting | OnlineJobs.ph</title>
<meta property="og:site_name" content="OnlineJobs.ph"></head><body>
<header><nav><a href="/jobseekers/jobsearch">&lt; Back to search results</a></nav></header>
<main><div class="container">
<h1>Part-Time Developer — Next.js / Supabase / Telnyx Troubleshooting</h1>
<p class="alert">Please login or register as jobseeker to apply for this job.</p>
<dl><dt>TYPE OF WORK</dt><dd>Any</dd><dt>WAGE / SALARY</dt><dd>5</dd><dt>HOURS PER WEEK</dt><dd>20</dd><dt>DATE UPDATED</dt><dd>Oct 16, 2026</dd></dl>
<div class="job-description"><h3>JOB OVERVIEW</h3>
<p>ClientAscend is a custom sales operations platform used by remote employees for outbound calling, power dialing, SMS, warm transfers, inbound calls and sales tracking. We need a developer who can diagnose recurring production problems and implement reliable, tested fixes.</p>
<p>**Tech stack:** Next.js, TypeScript, Supabase/PostgreSQL, Telnyx Voice API, WebRTC, GitHub and Codex.</p>
<p>**Requirements:** Experience debugging real-world APIs, webhooks, asynchronous call flows and production errors.</p>
<p>Please include a description of a real voice API or WebRTC problem you've diagnosed and repaired. Explain how you identified its root cause and verified the fix.</p>
</div>
<p>VIEW OTHER JOB POSTS FROM:</p><p>SHARE THIS POST</p><button>Report</button>
<div role="dialog" aria-hidden="true"><p>Job Post Reporter</p><p>Rank</p><p>Reason</p><p>Why is this blurred?</p><p>For privacy and security reasons, you need to be logged into an OnlineJobs.ph account in order to view this link.</p></div>
</div></main></body></html>`;

test('job board page: clean description, real company, login-to-apply and the post\'s request', () => {
  const url = 'https://www.onlinejobs.ph/jobseekers/job/Part-Time-Developer-1234';
  const page = extractPage(onlinejobsPage, url);
  assert.equal(page.isBoard, true);
  assert.equal(page.loginRequired, true);
  assert.equal(page.title, 'Part-Time Developer — Next.js / Supabase / Telnyx Troubleshooting');
  assert.equal(page.company, 'ClientAscend');
  assert.match(page.description, /^JOB OVERVIEW\n+ClientAscend is a custom/);
  assert.match(page.description, /\n+Tech stack: Next\.js/);
  for (const junk of ['Back to search', 'Report', 'Why is this blurred', 'SHARE THIS POST', 'login or register']) {
    assert.ok(!page.description.includes(junk), `description should not contain "${junk}"`);
  }
  const job = analyze({ ...page, finalUrl: url }, url);
  assert.equal(job.method, 'site');
  assert.equal(job.company, 'ClientAscend');
  assert.equal(job.title, 'Part-Time Developer — Next.js / Supabase / Telnyx Troubleshooting');
  assert.ok(job.needs.includes('site login'));
  assert.ok(job.asks[0].startsWith('Please include a description of a real voice API'));
  assert.deepEqual(job.skills.filter((x) => ['Next.js', 'TypeScript', 'Supabase', 'PostgreSQL'].includes(x)).sort(), ['Next.js', 'PostgreSQL', 'Supabase', 'TypeScript']);
  const body = draftBody(job, { full_name: 'Paul Calma' }, 'formal');
  assert.match(body, /\[Answer needed: Please include a description of a real voice API/);
});

test('login-only board: email wins when the post says to email', () => {
  const url = 'https://www.onlinejobs.ph/jobseekers/job/Virtual-Assistant-555';
  const html = onlinejobsPage
    .replace('Please include a description', 'Send your resume to hiring@clientascend.example with the subject "VA Application". Please include a description');
  const page = extractPage(html, url);
  const job = analyze({ ...page, finalUrl: url }, url);
  assert.equal(page.loginRequired, true);
  assert.equal(job.method, 'email');
  assert.equal(job.apply_email, 'hiring@clientascend.example');
  assert.equal(job.subject_rule, 'VA Application');
});

test('drafts never contain made-up placeholders', () => {
  const job = { title: 'Webflow Developer', company: 'Acme', method: 'site', skills: ['Webflow', 'SEO'], asks: [] };
  const empty = draftBody(job, { full_name: 'Andrei Calma' }, 'friendly');
  assert.ok(!/\[/.test(empty), `no brackets when the profile is thin:\n${empty}`);
  assert.match(empty, /^Hi there,\n\nI'm excited to apply for the Webflow Developer role at Acme!/);
  assert.match(empty, /Andrei Calma$/);

  const full = draftBody(job, {
    full_name: 'Andrei Calma', headline: 'Web developer focused on Webflow and React', degree: '4th-year BS Computer Science student', school: 'Angeles University Foundation',
    skills: ['Webflow', 'React', 'SEO'], highlight: 'rebuilt a PC shop’s site in Webflow and cut load time in half', portfolio_url: 'https://example.dev'
  }, 'formal');
  assert.ok(!/\[/.test(full), full);
  assert.match(full, /I am a web developer focused on Webflow and React, currently 4th-year BS Computer Science student at Angeles University Foundation\./);
  assert.match(full, /I work with Webflow and SEO, which match what this role needs\./);
  assert.match(full, /A recent example of my work: rebuilt a PC shop’s site in Webflow and cut load time in half\./);
  assert.match(full, /You can see my work at https:\/\/example\.dev\./);
});

test('JobStreet page read through the browser: SEEK fields', async () => {
  const { fromBrowser } = await import('../src/services/crawler.js');
  const html = `<!doctype html><html><head><title>Frontend Developer Job in Makati City - Jobstreet</title></head><body>
  <h1 data-automation="job-detail-title">Frontend Developer</h1>
  <span data-automation="advertiser-name">Lumen Pay Inc.</span>
  <span data-automation="job-detail-location">Makati City, Metro Manila</span>
  <div data-automation="jobAdDetails"><p>We build payment apps in React and TypeScript.</p><ul><li>2+ years with React</li><li>Git</li></ul></div>
  <a href="/job/123/apply">Quick apply</a></body></html>`;
  const url = 'https://ph.jobstreet.com/job/123';
  const page = fromBrowser(url, html, url);
  assert.equal(page.title, 'Frontend Developer');
  assert.equal(page.company, 'Lumen Pay Inc.');
  assert.equal(page.location, 'Makati City, Metro Manila');
  assert.match(page.description, /payment apps in React/);
  const job = analyze(page, url);
  assert.equal(job.method, 'site');
  assert.deepEqual(job.skills.filter((s) => ['React', 'TypeScript', 'Git'].includes(s)).sort(), ['Git', 'React', 'TypeScript']);
  assert.throws(() => fromBrowser('http://127.0.0.1/x', html), /private|local|not allowed|supported/i);
});

test('job-board search links point at the job itself', async () => {
  const { canonicalJobUrl, looksLikeSearchPage } = await import('../src/services/crawler.js');
  assert.equal(canonicalJobUrl('https://ph.jobstreet.com/part-time-jobs/remote?jobId=95359992&type=standard'), 'https://ph.jobstreet.com/job/95359992');
  assert.equal(canonicalJobUrl('https://ph.jobstreet.com/job/95359992?ref=search'), 'https://ph.jobstreet.com/job/95359992');
  assert.equal(canonicalJobUrl('https://ph.indeed.com/jobs?q=react&vjk=abc123'), 'https://ph.indeed.com/viewjob?jk=abc123');
  assert.equal(canonicalJobUrl('https://www.onlinejobs.ph/jobseekers/job/Part-Time-Developer-1234'), 'https://www.onlinejobs.ph/jobseekers/job/Part-Time-Developer-1234');
  assert.ok(looksLikeSearchPage('1,356 jobs in Philippines - Part Time, Remote'));
  assert.ok(!looksLikeSearchPage('Frontend Developer'));
});
