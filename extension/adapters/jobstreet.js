// JobStreet (SEEK) filler. Runs in your own logged-in browser tab.
// Flow per job: job page -> "Quick apply" -> choose documents (resume stays as your default,
// cover letter = "Write a cover letter" with Huntr's draft) -> employer questions -> profile step
// -> review -> Submit application -> "Application sent" confirmation.
//
// Employer questions are answered from your saved answers. Anything new is sent to Huntr, where you
// answer it (and Huntr remembers it for next time) — the filler never guesses an answer.
//
// JobStreet's apply form is a single-page app, so this script walks the steps itself instead of
// waiting for page loads. Fields are found by their labels and button text, not fixed IDs.
(() => {
  if (window.__huntrJS) return;
  window.__huntrJS = true;
  const H = window.__huntr;

  const SUCCESS = /(your )?application (has been |was )?(sent|submitted)|application sent|you applied (on|for)|you('ve| have) (already )?applied|thanks for applying/i;
  const SIGN_IN = /sign in to (apply|continue)|sign in or create|log in to apply/i;

  const norm = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+#.]+/g, ' ').trim();
  const btnText = (b) => (H.text(b) || b.value || '').toLowerCase();
  const findButton = (re) => H.clickables().find((b) => re.test(btnText(b)) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');

  const onSignIn = () => [...document.querySelectorAll('input[type="password"]')].some(H.visible) || /\/(login|sign-?in|oauth)/i.test(location.pathname);
  const onApplyFlow = () => /\/apply\b/i.test(location.pathname);
  const shown = (el) => H.visible(el) || H.visible(el.closest('label') || el.parentElement);
  const labelOf = (el) => H.text(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || H.text(el.closest('label')) || el.getAttribute('aria-label') || '';

  /** The visible radio/checkbox whose label matches. */
  function option(re) {
    return [...document.querySelectorAll('input[type="radio"], input[type="checkbox"]')].find((i) => re.test(labelOf(i) || H.text(i.parentElement)) && shown(i));
  }
  const onDocumentsStep = () => !!option(/write (a )?cover letter|upload (a )?cover letter|don.?t include/i);

  function coverBox() {
    const boxes = [...document.querySelectorAll('textarea')].filter(H.visible);
    const near = (t) => /cover letter/i.test(H.text(t.closest('section, fieldset, [role="group"], div')?.parentElement) || '');
    return boxes.find((t) => /cover|letter/.test(H.describe(t))) || boxes.find(near) || boxes.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0];
  }

  function fillCoverLetter(job) {
    const write = option(/write (a )?cover letter/i);
    if (write && !write.checked) {
      (write.closest('label') || write).click();
      return 'waiting';
    }
    const box = coverBox();
    if (box && job.message && box.value.trim() !== job.message.trim()) H.setValue(box, job.message);
    return box ? 'filled' : 'none';
  }

  /** Pick "Write a cover letter", put this job's letter in, and check it stayed (JobStreet may prefill your last one). */
  async function ensureCoverLetter(job) {
    for (let i = 0; i < 4; i++) {
      if (fillCoverLetter(job) === 'waiting') await H.sleep(800);
      fillCoverLetter(job);
      await H.sleep(700);
      const box = coverBox();
      if (!box || !job.message || norm(box.value) === norm(job.message)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Employer questions
  // ---------------------------------------------------------------------------

  /** The question a group of radios/checkboxes belongs to. */
  function groupQuestion(el) {
    const set = el.closest('fieldset, [role="radiogroup"], [role="group"]');
    const byId = (ids) => (ids || '').split(/\s+/).map((id) => H.text(document.getElementById(id))).filter(Boolean).join(' ');
    return H.text(set?.querySelector('legend')) || set?.getAttribute('aria-label') || byId(set?.getAttribute('aria-labelledby')) || H.text(set?.previousElementSibling) || el.name;
  }

  /** Every question on the current step: { key, label, kind, options, required, answered, els }. */
  function questions() {
    const out = new Map();
    for (const f of document.querySelectorAll('select, input, textarea')) {
      if (['hidden', 'search', 'file', 'password', 'submit', 'button', 'reset', 'image'].includes(f.type) || !shown(f)) continue;
      // Resume / cover letter choices and the letter itself aren't employer questions.
      if ((onDocumentsStep() && f === coverBox()) || /resum[eé]|cover letter|default/i.test(labelOf(f) || H.text(f.parentElement))) continue;
      const required = f.required || f.getAttribute('aria-required') === 'true' || !!f.closest('[aria-required="true"]');
      if (f.type === 'radio' || f.type === 'checkbox') {
        const key = `g:${f.name || groupQuestion(f)}`;
        const q = out.get(key) || { key, label: groupQuestion(f), kind: f.type === 'radio' ? 'choice' : 'multi', options: [], required: false, answered: false, els: [] };
        q.els.push(f);
        q.options.push(labelOf(f) || H.text(f.parentElement));
        q.required ||= required;
        q.answered ||= f.checked;
        out.set(key, q);
      } else {
        const label = labelOf(f) || f.placeholder || f.name;
        const key = `f:${f.id || f.name || label}`;
        const options = f.tagName === 'SELECT' ? [...f.options].filter((o) => o.value !== '' && !/^(select|choose|please select)/i.test(o.text.trim())).map((o) => o.text.trim()) : [];
        out.set(key, { key, label, kind: f.tagName === 'SELECT' ? 'choice' : f.tagName === 'TEXTAREA' ? 'long' : f.type === 'number' ? 'number' : 'text', options, required, answered: !!f.value, els: [f] });
      }
    }
    // A single checkbox ("I confirm…") is a yes/no question.
    for (const q of out.values()) if (q.kind === 'multi' && q.els.length === 1) Object.assign(q, { kind: 'confirm', label: q.options[0] || q.label, options: ['Yes', 'No'] });
    return [...out.values()].filter((q) => q.label);
  }

  /** Put an answer into a question's field(s). Returns false if the answer doesn't fit the options. */
  function fill(q, value) {
    if (value == null || value === '') return false;
    const match = (opts, v) => {
      const n = norm(v);
      const exact = opts.findIndex((o) => norm(o) === n);
      return exact >= 0 ? exact : opts.findIndex((o) => norm(o).startsWith(n) || n.startsWith(norm(o)));
    };
    const el = q.els[0];
    if (q.kind === 'choice' && el.tagName === 'SELECT') {
      const opts = [...el.options].filter((o) => o.value !== '');
      const i = match(opts.map((o) => o.text.trim()), value);
      if (i < 0) return false;
      H.setValue(el, opts[i].value);
      return true;
    }
    if (q.kind === 'choice') {
      const i = match(q.options, value);
      if (i < 0) return false;
      if (!q.els[i].checked) (q.els[i].closest('label') || q.els[i]).click();
      return true;
    }
    if (q.kind === 'multi') {
      const wanted = (Array.isArray(value) ? value : String(value).split(/\s*;\s*/)).map((v) => match(q.options, v));
      if (wanted.some((i) => i < 0)) return false;
      q.els.forEach((box, i) => {
        if (box.checked !== wanted.includes(i)) (box.closest('label') || box).click();
      });
      return true;
    }
    if (q.kind === 'confirm') {
      const yes = /^(yes|y|true|1)$/i.test(String(value));
      if (el.checked !== yes) (el.closest('label') || el).click();
      return true;
    }
    if (q.kind === 'number' && !/^-?\d+(\.\d+)?$/.test(String(value).trim())) return false;
    H.setValue(el, String(value));
    return true;
  }

  /** Fill what we can from saved answers; ask Huntr for the rest. Resolves when everything required is answered. */
  async function answerQuestions(job, all = false) {
    const saved = Object.fromEntries(Object.entries(job.answers || {}).map(([k, v]) => [norm(k), v]));
    for (const q of questions()) if (!q.answered && saved[norm(q.label)] != null) fill(q, saved[norm(q.label)]);
    await H.sleep(300);

    const open = questions().filter((q) => !q.answered && (q.required || all));
    if (!open.length) return true;

    H.panel('Employer questions', `This job asks ${open.length} question${open.length === 1 ? '' : 's'} Huntr doesn't have answers for yet. Answer ${open.length === 1 ? 'it' : 'them'} in Huntr — or right here — and Huntr carries on.`, 'warn');
    H.report('questions', `JobStreet asks ${open.length} question${open.length === 1 ? '' : 's'} — answer in Huntr.`, {
      questions: open.map(({ key, label, kind, options, required }) => ({ key, label, kind, options, required }))
    });

    // Wait for answers from Huntr, or for you to answer them in this tab.
    const answered = await new Promise((resolve) => {
      const keys = open.map((q) => q.key);
      let poll = null;
      let stop = null;
      const done = (v) => {
        clearInterval(poll);
        clearTimeout(stop);
        chrome.runtime.onMessage.removeListener(onMsg);
        resolve(v);
      };
      const onMsg = (msg) => {
        if (msg?.type !== 'ANSWERS') return;
        const now = questions();
        for (const [key, value] of Object.entries(msg.answers)) {
          const q = now.find((x) => x.key === key) || now.find((x) => norm(x.label) === norm(key));
          if (q) fill(q, value);
        }
        setTimeout(() => done(true), 400);
      };
      chrome.runtime.onMessage.addListener(onMsg);
      poll = setInterval(() => {
        const now = questions().filter((q) => keys.includes(q.key));
        if (now.length && now.every((q) => q.answered)) done(true);
      }, 1000);
      stop = setTimeout(() => done(false), 20 * 60 * 1000);
    });
    if (!answered) return false;
    H.report('applying', 'Got your answers — carrying on…');
    H.panel('Carrying on', 'Thanks — finishing the application…');
    return true;
  }

  // ---------------------------------------------------------------------------

  let running = false;

  async function run({ job, stage, autoSubmit }) {
    if (running) return;
    running = true;
    try {
      if (H.pageSays(SUCCESS) && (onApplyFlow() || stage === 'submitting')) return sent();

      if (onSignIn() || (!onApplyFlow() && H.pageSays(SIGN_IN) && !findButton(/quick apply/))) {
        H.panel('Sign in first', 'Sign in to JobStreet in this tab. Huntr carries on by itself once you\'re in.', 'warn');
        return H.report('needs-login', 'Sign in to JobStreet in the tab that opened.');
      }

      // 1. Job page: go to the Quick apply form. JobStreet's Quick apply lives at <job url>/apply,
      //    so if the button can't be found (or hasn't rendered yet) Huntr opens that address directly.
      if (!onApplyFlow()) {
        const applyBtn = () =>
          document.querySelector('[data-automation="job-detail-apply"], [data-automation="job-detail-apply-button"]') ||
          findButton(/quick\s*apply/) ||
          H.clickables().find((a) => /\/job\/\d+\/apply\b/.test(a.getAttribute('href') || ''));
        const btn = await H.waitFor(applyBtn, 8000);
        const text = btn ? btnText(btn) : '';
        const href = btn?.getAttribute('href') || '';
        // A plain "Apply" that leaves JobStreet = the company's own site.
        let offSite = false;
        try {
          offSite = !!href && !/^(#|javascript:)/i.test(href) && !/(^|\.)(jobstreet\.com(\.ph)?|seek\.com(\.au)?|jobsdb\.com)$/i.test(new URL(href, location.href).hostname);
        } catch {
          /* odd link — treat as on JobStreet */
        }
        if (btn && offSite) {
          return H.report('unsupported', 'This JobStreet job is applied for on the company\'s own site — open it and apply there.');
        }
        if (/you applied/i.test(document.body.innerText) && !btn) return H.report('submitted', 'You had already applied to this job.');
        H.report('applying', 'Opening the application form…');
        const id = (location.pathname.match(/\/job\/(\d+)/) || [])[1] || new URLSearchParams(location.search).get('jobId');
        if (id) {
          location.assign(`${location.origin}/job/${id}/apply`);
        } else if (btn) {
          btn.click();
        } else {
          H.panel('Can\'t find the job', 'Huntr couldn\'t find this job\'s Quick apply form.', 'warn', [
            { label: 'Copy details for Huntr', done: 'Copied ✓', onClick: () => navigator.clipboard.writeText(H.diagnostics({ site: 'jobstreet', step: 'job page' })).catch(() => {}) }
          ]);
          return H.report('filled', 'Couldn\'t find the Quick apply form for this job — copy the details from the JobStreet tab for Huntr.');
        }
        return; // the apply page loads next and we carry on there
      }

      // 2. Walk the steps of the apply flow: fill this step, press Continue, wait for the next one —
      //    until Submit application shows up, then press it.
      H.report('applying', 'Filling in the application…');
      const stepId = () => location.pathname + location.search + '|' + (H.text(document.querySelector('h1, h2, h3, legend')) || '');
      for (let step = 0; step < 20; step++) {
        await H.waitFor(() => findButton(SUBMIT) || findButton(NEXT) || H.pageSays(SUCCESS), 15000);
        await H.sleep(600); // let the step finish rendering
        if (await dismissPrefill()) await H.sleep(600);
        if (H.pageSays(SUCCESS)) return sent();

        // Some jobs put everything on one page (resume, cover letter, questions, Submit), so do both every time.
        if (onDocumentsStep() && !(await ensureCoverLetter(job))) {
          return notConfirmed('Huntr couldn\'t put this job\'s cover letter into JobStreet\'s cover letter box.');
        }
        if (!(await answerQuestions(job, H.pageErrors().length > 0))) {
          return notConfirmed('No answers to the employer\'s questions came in.');
        }

        const submit = findButton(SUBMIT);
        if (submit) {
          if (!coverLetterLooksRight(job)) {
            return notConfirmed('The cover letter on JobStreet isn\'t this job\'s draft (it may be from your last application), so Huntr didn\'t submit. Paste the cover letter from Huntr, then press Submit application.');
          }
          return submitNow(submit, autoSubmit);
        }

        const next = findButton(NEXT);
        if (!next) continue;
        const before = stepId();
        next.click();
        // Wait for JobStreet to move on. Slow connections are fine — give it up to 20 s.
        const moved = await H.waitFor(() => stepId() !== before || H.pageSays(SUCCESS), 20000);
        if (moved) continue;

        // Didn't move: JobStreet wants something on this step. Answer what's empty (asking you if needed) and try once more.
        if (!(await answerQuestions(job, true))) return notConfirmed('No answers to the employer\'s questions came in.');
        findButton(NEXT)?.click();
        if (!(await H.waitFor(() => stepId() !== before || H.pageSays(SUCCESS), 20000))) {
          return notConfirmed('JobStreet didn\'t move past this step.');
        }
      }
      notConfirmed('');
    } finally {
      running = false;
    }
  }

  // JobStreet may offer "Use details from your last application" in a pop-up with its own Submit button.
  // That would send your PREVIOUS cover letter and answers, so Huntr closes it and fills this job's own.
  const PREFILL = /details from your (last|most recent|previous) application|prefill this form/i;
  async function dismissPrefill() {
    const box = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].find((d) => H.visible(d) && PREFILL.test(H.text(d)));
    if (!box) return false;
    const close =
      box.querySelector('[aria-label*="close" i], [aria-label*="dismiss" i], [data-automation*="close" i]') ||
      H.clickables(box).find((b) => /^(×|x|close|no thanks|start fresh|start a new application|don.?t use)$/i.test(btnText(b)));
    if (close) close.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await H.waitFor(() => !H.visible(box) || !box.isConnected, 3000);
    return true;
  }

  /** On the review step: does the cover letter shown match this job's draft? */
  function coverLetterLooksRight(job) {
    const start = norm(job.message || '').slice(0, 40);
    if (!start || !/cover letter/i.test(document.body.innerText)) return true;
    const typed = [...document.querySelectorAll('textarea')].map((t) => t.value).join(' ');
    if (norm(document.body.innerText + ' ' + typed).includes(start)) return true;
    // Ours isn't shown. Only object if a different letter is on the page ("Dear …" / "I am writing to apply …").
    return !/(\b(dear|hi|hello)\b[^\n]{3,}\n?.{0,80}(apply|application|position|role))|i am writing to apply/i.test(document.body.innerText + ' ' + typed);
  }

  // "Submit application" (or just "Submit"), and the buttons that move to the next step.
  const SUBMIT = /^(submit( your)?( application)?|send application)$/;
  const NEXT = /^(continue|next|next step|save and continue|continue to review|review( and submit| application)?|proceed)$/;

  async function submitNow(submit, autoSubmit) {
    if (!autoSubmit || H.hasCaptcha()) {
      H.panel('Ready to submit', 'Huntr filled everything in. Check it and press Submit application.');
      H.report('filled', 'Filled in on JobStreet — review it and press Submit application.');
      submit.addEventListener('click', () => H.report('submitting', 'Sending…'), { once: true });
      if (await H.waitFor(() => H.pageSays(SUCCESS), 5 * 60 * 1000)) sent();
      return;
    }
    H.panel('Sending', 'Submitting your application…');
    H.report('submitting', 'Filled in — submitting…');
    await H.sleep(1500);
    (findButton(SUBMIT) || submit).click();
    if (await H.waitFor(() => H.pageSays(SUCCESS), 20000)) return sent();
    // One more press in case the first click only closed a tooltip or scrolled the button into view.
    findButton(SUBMIT)?.click();
    if (await H.waitFor(() => H.pageSays(SUCCESS), 20000)) return sent();
    return notConfirmed('Huntr pressed Submit application, but JobStreet didn\'t confirm it.');
  }

  function sent() {
    H.panel('Sent', 'JobStreet confirmed your application. Huntr marked it as sent.', 'ok');
    H.report('submitted', 'Sent through JobStreet.');
  }

  function notConfirmed(why) {
    const errors = H.pageErrors();
    H.panel('Not confirmed', `${errors.length ? `JobStreet says:\n• ${errors.join('\n• ')}` : why || 'Huntr couldn\'t finish the steps or see a confirmation.'}\n\nFinish it here, or copy the details for Huntr.`, 'warn', [
      { label: 'Copy details for Huntr', done: 'Copied ✓', onClick: () => navigator.clipboard.writeText(H.diagnostics({ site: 'jobstreet', errors, why })).catch(() => {}) }
    ]);
    H.report('filled', errors.length ? `JobStreet says: ${errors.join(' · ')}` : why || 'Couldn\'t finish the JobStreet steps — finish it in the tab.');
  }

  let lastMsg = null;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'FILL') return;
    lastMsg = msg;
    run(msg).catch((err) => H.report('error', err.message || String(err)));
  });

  // JobStreet moves to the apply form without a full page load — notice that and continue.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (lastMsg && onApplyFlow()) run({ ...lastMsg, stage: 'applying' }).catch(() => {});
    }
  }, 700);
})();
