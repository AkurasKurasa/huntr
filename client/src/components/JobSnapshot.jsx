import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/** Signed (temporary) URL for a private snapshot image. */
function useSnapshotUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) return undefined;
    supabase.storage
      .from('job-snapshots')
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => alive && setUrl(data?.signedUrl || null));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** The saved copy of a job post: its image and the description as it was when Huntr read it. */
export default function JobSnapshot({ app, compact = false }) {
  const imgUrl = useSnapshotUrl(app.image_path);
  const [open, setOpen] = useState(false);
  const text = app.description || '';
  const long = text.length > 900;

  if (!text && !app.image_path) {
    return <p className="muted" style={{ margin: 0 }}>No snapshot was saved for this job.</p>;
  }

  return (
    <div className={`snapshot ${compact ? 'snapshot--compact' : ''}`}>
      {app.image_path && (
        <figure className="snapshot__figure">
          {imgUrl ? (
            <img src={imgUrl} alt={`Image from the ${app.company || ''} job post`} loading="lazy" />
          ) : (
            <div className="snapshot__placeholder" aria-hidden="true" />
          )}
          {app.image_source_url && (
            <figcaption>
              From <a href={app.image_source_url} target="_blank" rel="noreferrer">{new URL(app.image_source_url).hostname}</a>
            </figcaption>
          )}
        </figure>
      )}
      {text && (
        <div className="snapshot__text">
          <div className={`snapshot__body ${open || !long ? 'is-open' : ''}`}>{text}</div>
          {long && (
            <button type="button" className="btn btn--text" style={{ paddingLeft: 0 }} onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Show less' : 'Show full description'}
            </button>
          )}
        </div>
      )}
      {app.snapshot_at && <div className="snapshot__meta mono">Saved {fmt(app.snapshot_at)}</div>}
    </div>
  );
}
