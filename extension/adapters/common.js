// Shared helpers for site fillers. Injected into the job site's tab on every page load.
(() => {
  if (window.__huntr) return;
  const H = (window.__huntr = {});

  H.visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  H.text = (el) => (el?.innerText || el?.value || el?.textContent || '').replace(/\s+/g, ' ').trim();
  H.pageSays = (re) => re.test(document.body?.innerText || '');
  H.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Wait until fn() returns something truthy (checks on DOM changes and every 250 ms). */
  H.waitFor = (fn, timeout = 8000) =>
    new Promise((resolve) => {
      const hit = fn();
      if (hit) return resolve(hit);
      const obs = new MutationObserver(() => {
        const v = fn();
        if (v) done(v);
      });
      const timer = setInterval(() => {
        const v = fn();
        if (v) done(v);
      }, 250);
      const stop = setTimeout(() => done(null), timeout);
      function done(v) {
        obs.disconnect();
        clearInterval(timer);
        clearTimeout(stop);
        resolve(v);
      }
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });

  /** Sets a field the way a person typing would, so the site's own scripts notice. */
  H.setValue = (el, value) => {
    el.focus();
    // Text boxes: replace the text the way typing does (select all + insert), which every framework notices.
    if ((el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|email|tel|url|number|search|)$/.test(el.type))) && typeof document.execCommand === 'function') {
      try {
        el.select();
        if (document.execCommand('insertText', false, value) && el.value === value) {
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
          return;
        }
      } catch {
        /* fall back below */
      }
    }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  };

  /** Label text for a field: its <label>, aria-label, placeholder, name and id. */
  H.describe = (el) => {
    const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return [H.text(id), H.text(el.closest('label')), el.getAttribute('aria-label'), el.placeholder, el.name, el.id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  };

  H.clickables = (root = document) =>
    [...root.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')].filter(H.visible);

  H.hasCaptcha = (root = document) =>
    !!root.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, .cf-turnstile');

  /** Visible error / alert messages on the page (validation errors, flash messages). */
  H.pageErrors = (root = document) => {
    const nodes = [...root.querySelectorAll('.error, .errors, .alert, .alert-danger, .alert-warning, .invalid-feedback, .help-block, .text-danger, .text-error, [role="alert"], .swal2-popup, .toast, .notification')].filter(H.visible);
    const invalid = [...root.querySelectorAll('input, textarea, select')].filter((f) => H.visible(f) && f.willValidate && !f.checkValidity());
    // Framework forms mark bad fields with aria-invalid and point at the message with aria-describedby.
    const aria = [...root.querySelectorAll('[aria-invalid="true"]')].flatMap((f) =>
      (f.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => H.text(document.getElementById(id))).filter(Boolean).map((m) => `${H.describe(f).slice(0, 60) || 'A field'}: ${m}`)
    );
    return [...new Set([
      ...aria,
      ...nodes.map(H.text).filter((t) => t && t.length < 300),
      ...invalid.map((f) => `${H.describe(f) || f.name || 'A field'}: ${f.validationMessage}`)
    ])].slice(0, 6);
  };

  /** What Huntr saw on the page — no message text, just structure — to tune the filler. */
  H.diagnostics = (extra = {}) => {
    const fields = [...document.querySelectorAll('input, textarea, select')].filter(H.visible).map((f) => ({
      tag: f.tagName.toLowerCase(), type: f.type, name: f.name, id: f.id, label: H.describe(f).slice(0, 80), required: f.required, filled: !!f.value
    }));
    const buttons = H.clickables().map((b) => (H.text(b) || b.value || '').slice(0, 40)).filter(Boolean).slice(0, 40);
    const forms = [...document.forms].map((f) => ({ action: f.getAttribute('action'), method: f.method, id: f.id, cls: f.className }));
    return JSON.stringify({ url: location.href, title: document.title, errors: H.pageErrors(), forms, fields: fields.filter((f) => f.type !== 'password' && f.type !== 'hidden'), buttons, ...extra }, null, 1);
  };

  H.report = (status, detail = '', extra = {}) => chrome.runtime.sendMessage({ type: 'ADAPTER', status, detail, ...extra }).catch(() => {});

  /** Small Huntr panel in the corner of the job site so you can see what is happening. Built from elements (no HTML strings). */
  H.panel = (title, body, tone = 'info', actions = []) => {
    let host = document.getElementById('huntr-panel-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'huntr-panel-host';
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
      host.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(host);
    }
    const colors = { info: '#4B2FD6', ok: '#11714D', warn: '#8A6200', error: '#8A2643' };
    const root = host.shadowRoot;
    root.replaceChildren();
    const el = (tag, css, text) => {
      const n = document.createElement(tag);
      if (css) n.style.cssText = css;
      if (text != null) n.textContent = text;
      return n;
    };
    const card = el('div', 'font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;width:320px;background:#fff;color:#1B1440;border:1px solid #E4E0F5;border-radius:14px;box-shadow:0 18px 50px rgba(27,20,64,.25);overflow:hidden');
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    const head = el('div', `display:flex;align-items:center;gap:8px;padding:10px 14px;background:${colors[tone] || colors.info};color:#fff;font-weight:600`);
    head.append(el('span', '', `Huntr · ${title}`));
    const close = el('button', 'all:unset;cursor:pointer;margin-left:auto;font-size:18px;line-height:1;padding:2px 6px;border-radius:6px', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Hide');
    close.onclick = () => host.remove();
    head.append(close);
    card.append(head, el('div', 'padding:12px 14px;color:#3D3760;white-space:pre-line', body));
    if (actions.length) {
      const row = el('div', 'display:flex;gap:8px;padding:0 14px 12px');
      for (const a of actions) {
        const b = el('button', 'all:unset;cursor:pointer;font-weight:600;font-size:13px;padding:7px 11px;border-radius:9px;background:#5B3DF5;color:#fff', a.label);
        b.type = 'button';
        b.onclick = async () => {
          await a.onClick();
          b.textContent = a.done || a.label;
        };
        row.append(b);
      }
      card.append(row);
    }
    root.append(card);
  };
})();
