import { useState } from 'react';

const KEY = 'huntr:browserNoticeDismissed';

/** "chrome" | "edge" | null — Chromium browsers that we warn about. */
function detectBrowser() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  const brands = (navigator.userAgentData?.brands || []).map((b) => b.brand);
  if (/Edg\//.test(ua) || brands.includes('Microsoft Edge')) return 'edge';
  if (/Firefox\//.test(ua) || /OPR\//.test(ua)) return null;
  if (/Chrome\//.test(ua) || brands.includes('Google Chrome')) return 'chrome';
  return null;
}

/** Banner shown on Chrome and Edge: Huntr is built and tested for Firefox. */
export default function BrowserNotice() {
  const browser = detectBrowser();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!browser || hidden) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div className="browser-notice" role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
      <span>
        <strong>Heads up:</strong> Huntr is built for Firefox. On {browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome'} some features — like sending applications through the Huntr extension — may not work properly.
      </span>
      <a href="https://www.mozilla.org/firefox/new/" target="_blank" rel="noreferrer" className="browser-notice__link">Get Firefox</a>
      <button type="button" className="browser-notice__close" onClick={dismiss} aria-label="Dismiss this notice">×</button>
    </div>
  );
}
