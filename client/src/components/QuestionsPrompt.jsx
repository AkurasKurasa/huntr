import { useEffect, useRef, useState } from 'react';

/**
 * Employer questions a job site asked while the extension was applying.
 * You answer here; the extension fills them in on the site and carries on.
 * props: app (application), questions [{ key, label, kind, options, required }], onSubmit(answersByKey, remember), onClose
 */
export default function QuestionsPrompt({ app, site, questions, onSubmit, onClose }) {
  const ref = useRef(null);
  const [values, setValues] = useState({});
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    setValues({});
    if (app && questions?.length) {
      if (!ref.current?.open) ref.current?.showModal();
    } else ref.current?.close();
  }, [app?.id, questions]);

  const set = (key, v) => setValues((m) => ({ ...m, [key]: v }));
  const missing = (questions || []).filter((q) => {
    const v = values[q.key];
    return q.kind === 'multi' ? !(v || []).length : v == null || String(v).trim() === '';
  });

  function submit(e) {
    e.preventDefault();
    if (missing.length) return;
    onSubmit(values, remember);
  }

  return (
    <dialog ref={ref} className="modal modal--md" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-labelledby="q-title">
      {app && questions?.length > 0 && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card__head">
            <div style={{ minWidth: 0 }}>
              <h3 id="q-title">{site || 'The employer'} asks {questions.length === 1 ? 'a question' : `${questions.length} questions`}</h3>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{[app.title, app.company].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div className="questions">
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>Answer honestly — employers screen on these. Huntr fills them in on {site || 'the site'} and finishes the application.</p>
            {questions.map((q, i) => (
              <fieldset key={q.key} className="question">
                <legend>{i + 1}. {q.label}{q.required ? '' : <span className="muted"> (optional)</span>}</legend>
                {q.kind === 'choice' && q.options.length > 0 && q.options.length <= 6 && (
                  <div className="question__options">
                    {q.options.map((o) => (
                      <label key={o} className={`pill-option${values[q.key] === o ? ' is-on' : ''}`}>
                        <input type="radio" name={q.key} checked={values[q.key] === o} onChange={() => set(q.key, o)} /> {o}
                      </label>
                    ))}
                  </div>
                )}
                {q.kind === 'choice' && q.options.length > 6 && (
                  <select value={values[q.key] || ''} onChange={(e) => set(q.key, e.target.value)}>
                    <option value="">Choose…</option>
                    {q.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                )}
                {q.kind === 'multi' && (
                  <div className="question__options">
                    {q.options.map((o) => {
                      const on = (values[q.key] || []).includes(o);
                      return (
                        <label key={o} className={`pill-option${on ? ' is-on' : ''}`}>
                          <input type="checkbox" checked={on} onChange={() => set(q.key, on ? values[q.key].filter((x) => x !== o) : [...(values[q.key] || []), o])} /> {o}
                        </label>
                      );
                    })}
                  </div>
                )}
                {q.kind === 'confirm' && (
                  <div className="question__options">
                    {['Yes', 'No'].map((o) => (
                      <label key={o} className={`pill-option${values[q.key] === o ? ' is-on' : ''}`}>
                        <input type="radio" name={q.key} checked={values[q.key] === o} onChange={() => set(q.key, o)} /> {o}
                      </label>
                    ))}
                  </div>
                )}
                {q.kind === 'long' && <textarea rows={4} value={values[q.key] || ''} onChange={(e) => set(q.key, e.target.value)} />}
                {(q.kind === 'text' || q.kind === 'number' || (q.kind === 'choice' && !q.options.length)) && (
                  <input type={q.kind === 'number' ? 'number' : 'text'} value={values[q.key] || ''} onChange={(e) => set(q.key, e.target.value)} />
                )}
              </fieldset>
            ))}
          </div>
          <div className="card__foot">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my answers for next time
            </label>
            <span className="spacer" />
            <button type="button" className="btn btn--text" onClick={onClose}>Later</button>
            <button type="submit" className="btn btn--primary" disabled={missing.length > 0}>Answer & continue</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
