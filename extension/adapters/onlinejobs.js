// OnlineJobs.ph filler. Runs in your own logged-in browser tab.
// Flow per job: job page -> click "Apply" -> fill subject + message -> you press Send
// (or, with Auto-submit on, Huntr presses it) -> confirm it went through.
//
// We can't see OnlineJobs.ph's apply form without an account, so fields are found by
// what they look like (labels, names, size) rather than fixed IDs. If the site changes,
// the panel says what it couldn't find and you can finish by hand.
(() => {
  if (window.__huntrOJ) return;
  window.__huntrOJ = true;
  const H = window.__huntr;

  const SUCCESS = /(application|message|resume|proposal) (has been |was )?(successfully )?(sent|submitted|delivered)|successfully applied|you('ve| have) (already )?applied|thank you for (applying|your application)|already applied/i;
  const LOGIN_PROMPT = /please (log ?in|login|sign ?in|register)[^.]{0,60}(apply|continue)/i;

  const loggedIn = () => H.clickables().some((el) => /log ?out|sign ?out/i.test(H.text(el)) || /logout|signout/i.test(el.getAttribute('href') || ''));
  const onLoginPage = () => [...document.querySelectorAll('input[type="password"]')].some(H.visible);

  /** The message box: the biggest visible textarea, preferring ones labelled message/letter/body. */
  function findMessageBox() {
    const boxes = [...document.querySelectorAll('textarea')].filter(H.visible);
    if (!boxes.length) return null;
    const score = (t) => (/(message|letter|cover|body|content|proposal|application|introduc)/.test(H.describe(t)) ? 1e6 : 0) + t.offsetWidth * t.offsetHeight;
    return boxes.sort((a, b) => score(b) - score(a))[0];
  }

  function findSubject(scope) {
    return [...scope.querySelectorAll('input:not([type]), input[type="text"]')]
      .filter(H.visible)
      .find((i) => /(subject|title|headline)/.test(H.describe(i)) && !/search/.test(H.describe(i)));
  }

  function findSendButton(scope) {
    const btns = H.clickables(scope).filter((b) => !/cancel|close|back|login|register|save draft/i.test(H.text(b)));
    return (
      btns.find((b) => /^(send|submit|apply|send application|submit application|apply now)( now)?$/i.test(H.text(b) || b.value || '')) ||
      btns.find((b) => b.type === 'submit') ||
      null
    );
  }

  function findApplyButton() {
    return H.clickables().find((el) => {
      const t = H.text(el) || el.value || '';
      return /^\s*apply( now| for this job| to this job)?\s*$/i.test(t) && !/login|register|signup/i.test(el.getAttribute('href') || '');
    });
  }

  // An "Applied" marker on the job page: OnlineJobs.ph swaps the Apply button out once you've applied.
  const appliedMarker = () =>
    H.pageSays(SUCCESS) ||
    [...document.querySelectorAll('a, button, span, div, p, small, strong, .badge, .label')]
      .filter(H.visible)
      .some((el) => el.children.length === 0 && /^(applied|application sent|you applied|already applied)( on .{0,30})?$/i.test(H.text(el)));

  function sent(detail = 'Sent through OnlineJobs.ph.') {
    H.panel('Sent', 'OnlineJobs.ph confirmed your application. Huntr marked it as sent.', 'ok');
    H.report('submitted', detail);
  }

  async function confirmSent(timeout = 15000) {
    const ok = await H.waitFor(() => appliedMarker(), timeout);
    if (ok) sent();
    return !!ok;
  }

  /** Nothing confirmed it: show what the page says and a way to copy details for tuning Huntr. */
  function unconfirmed(why, errors) {
    const text = errors.length ? `OnlineJobs.ph says:\n• ${errors.join('\n• ')}` : why;
    H.panel('Not confirmed', `${text}\n\nFix it and press Send, or copy the details for Huntr.`, 'warn', [
      { label: 'Copy details for Huntr', done: 'Copied ✓', onClick: () => navigator.clipboard.writeText(H.diagnostics({ why, errors })).catch(() => {}) }
    ]);
    H.report('filled', errors.length ? `OnlineJobs.ph says: ${errors.join(' · ')}` : why);
  }

  async function run({ job, stage, autoSubmit }) {
    // 1. Already done?
    if (appliedMarker()) {
      H.panel('Sent', 'This application went through. You can close this tab.', 'ok');
      return H.report('submitted', /already applied/i.test(document.body.innerText) ? 'You had already applied to this job.' : 'Sent through OnlineJobs.ph.');
    }
    // After pressing Send the page reloaded (or we went back to check): look for proof it went through.
    const target = new URL(job.applyUrl || job.sourceUrl);
    if (stage === 'submitting' || stage === 'verifying') {
      if (await confirmSent(6000)) return;
      const errors = H.pageErrors();
      if (stage === 'submitting' && !errors.length) {
        // Second check: open the job page again — once you've applied, the Apply button turns into "Applied".
        H.panel('Checking', 'Checking the job page to confirm it went through…');
        H.report('verifying', 'Checking that OnlineJobs.ph received it…');
        location.assign(target.href); // a fresh GET (a reload could re-send the form)
        return;
      }
      if (stage === 'verifying' && !errors.length && !findApplyButton() && loggedIn()) return sent('Sent — the job page no longer offers Apply.');
      return unconfirmed('Huntr pressed Send, but the job page still shows the Apply button, so it may not have gone through.', errors);
    }

    // 2. Need to log in?
    if (onLoginPage() || (!loggedIn() && H.pageSays(LOGIN_PROMPT))) {
      H.panel('Log in first', 'Log in to OnlineJobs.ph in this tab. Huntr will carry on by itself once you\'re in.', 'warn');
      return H.report('needs-login', 'Log in to OnlineJobs.ph in the tab that opened.');
    }
    // After logging in the site may land on a dashboard — go back to the job.
    if (stage === 'needs-login' && location.pathname !== target.pathname && !findMessageBox()) {
      H.panel('Back to the job', 'Logged in — opening the job again…');
      location.href = target.href;
      return;
    }

    // 3. Open the application form.
    let box = findMessageBox();
    if (!box) {
      const apply = findApplyButton();
      if (!apply) {
        H.panel('Can\'t find "Apply"', 'Huntr couldn\'t find the Apply button on this page. Click it yourself and Huntr will fill the form.', 'warn');
        H.report('filled', 'Couldn\'t find the Apply button — click it in the OnlineJobs.ph tab.');
        box = await H.waitFor(findMessageBox, 120000);
        if (!box) return H.report('error', 'No application form appeared.');
      } else {
        H.report('applying', 'Opening the application form…');
        apply.click();
        box = await H.waitFor(findMessageBox, 10000);
        if (!box) return; // it navigated to a separate apply page — we'll be injected again there
      }
    }

    // 4. Fill it in.
    const form = box.closest('form') || box.closest('[role="dialog"], .modal, section, main') || document;
    const subject = findSubject(form);
    if (subject && job.subject) H.setValue(subject, job.subject);
    H.setValue(box, job.message || '');
    box.scrollIntoView({ block: 'center' });

    const send = findSendButton(form);
    let announced = false;
    const onSend = () => {
      if (announced) return;
      announced = true;
      H.report('submitting', 'Sending…');
    };
    form.addEventListener?.('submit', onSend, { once: true });
    send?.addEventListener('click', onSend, { once: true });

    if (autoSubmit && send && !H.hasCaptcha(form)) {
      H.panel('Sending', 'Filled in your application. Sending in 3 seconds — close this tab to stop.');
      announced = true;
      H.report('submitting', 'Filled in — sending…');
      await H.sleep(3000);
      send.click();
      if (await confirmSent(10000)) return;
      // Still here after 10 s: a validation error, or a silent success. Errors first, then check the job page.
      const errors = H.pageErrors(form === document ? document : form.ownerDocument);
      if (errors.length) return unconfirmed('', errors);
      H.panel('Checking', 'Checking the job page to confirm it went through…');
      H.report('verifying', 'Checking that OnlineJobs.ph received it…');
      location.href = target.href;
      return;
    }

    const why = !send ? 'Huntr couldn\'t find the Send button.' : H.hasCaptcha(form) ? 'This form has a captcha, so it needs you.' : 'Review it and press Send.';
    H.panel('Ready to send', `Huntr filled in ${subject ? 'the subject and ' : ''}your message. ${why}`);
    H.report('filled', `Filled in on OnlineJobs.ph — ${why.charAt(0).toLowerCase() + why.slice(1)}`);
    await confirmSent(5 * 60 * 1000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'FILL') run(msg).catch((err) => H.report('error', err.message || String(err)));
  });
})();
