import { useMemo } from 'react';
import { buildSankey } from '../lib/sankey.js';

const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;

export default function Sankey({ applications }) {
  const sk = useMemo(() => buildSankey(applications), [applications]);
  if (!sk.nodes.length) return <p className="muted">Send a few applications and the flow will show up here.</p>;
  const label = `Flow of ${applications.length} applications: ` + sk.nodes.map((n) => `${n.name} ${n.value}`).join(', ');

  return (
    <div className="sankey-scroll">
      <div className="sankey" role="img" aria-label={label}>
        <svg viewBox={`0 0 ${sk.W} ${sk.H}`} preserveAspectRatio="none" aria-hidden="true" className="sankey__links">
          {sk.links.map((l, i) => (
            <path key={i} d={l.d} fill={l.fill} />
          ))}
        </svg>
        {sk.nodes.map((n) => (
          <div key={n.key}>
            <div
              className="sankey__node"
              style={{ left: pct(n.x, sk.W), top: pct(n.y, sk.H), width: pct(sk.NW, sk.W), height: pct(Math.max(n.h, 2), sk.H), background: n.color }}
            />
            <div
              className={`sankey__label ${n.last ? 'sankey__label--end' : ''}`}
              style={n.last ? { right: pct(sk.W - n.x + 8, sk.W), top: pct(n.y + n.h / 2, sk.H) } : { left: pct(n.x + sk.NW + 8, sk.W), top: pct(n.y + n.h / 2, sk.H) }}
            >
              {n.name}: {n.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
