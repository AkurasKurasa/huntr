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
