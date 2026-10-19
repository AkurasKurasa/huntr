// Turns tracked applications into a Sankey diagram (nodes + ribbon paths).

export const STAGE_LABELS = { applied: 'Applied only', replied: 'Replied', screen: 'Recruiter screen', interview: 'Interview' };
export const STATUS_LABELS = {
  waiting: 'Waiting', in_progress: 'In progress', offer: 'Offer', rejected: 'Rejected', ghosted: 'Ghosted', declined: 'Declined'
};

/** The stages one application went through, e.g. Applied → Replied → Recruiter screen → Rejected */
export function journey(app) {
  const p = ['Applied'];
  if (app.stage === 'applied') {
    p.push({ waiting: 'Waiting', in_progress: 'Waiting', ghosted: 'No reply', rejected: 'Rejected', declined: 'Declined', offer: 'Offer' }[app.status] || 'Waiting');
    return p;
  }
  p.push('Replied');
  if (app.stage === 'screen' || app.stage === 'interview') p.push('Recruiter screen');
  if (app.stage === 'interview') p.push('Interview');
  const end = { offer: 'Offer', rejected: 'Rejected', declined: 'Declined', ghosted: 'Ghosted' }[app.status];
  if (end) p.push(end);
  return p;
}

const RANK = ['Applied', 'Replied', 'Recruiter screen', 'Interview', 'Offer', 'Waiting', 'Declined', 'Ghosted', 'No reply', 'Rejected'];
export const NODE_COLOR = {
  Applied: '#4B2FD6', Replied: '#FF7A59', 'Recruiter screen': '#2F5FCC', Interview: '#2F5FCC', Offer: '#1FA971',
  Waiting: '#E0A21B', Declined: '#9C96B8', Ghosted: '#9C96B8', 'No reply': '#9C96B8', Rejected: '#9C96B8'
};
const FILL = {
  Replied: 'rgba(255,122,89,0.35)', 'Recruiter screen': 'rgba(47,95,204,0.25)', Interview: 'rgba(47,95,204,0.25)',
  Offer: 'rgba(31,169,113,0.4)', Waiting: 'rgba(224,162,27,0.28)'
};
const GREY = 'rgba(120,110,160,0.16)';

export function buildSankey(apps, { W = 1000, H = 440, NW = 10, GAP = 26 } = {}) {
  const paths = apps.map(journey);
  if (!paths.length) return { nodes: [], links: [], W, H };
  const maxDepth = Math.max(...paths.map((p) => p.length - 1));
  const key = (name, d) => (name === 'Rejected' ? `${maxDepth}|Rejected` : `${d}|${name}`);
  const nodes = {};
  const links = {};
  for (const p of paths) {
    let prev = null;
    p.forEach((name, d) => {
      const k = key(name, d);
      nodes[k] ||= { key: k, name, depth: name === 'Rejected' ? maxDepth : d, value: 0, out: [], inn: [] };
      nodes[k].value += 1;
      if (prev) links[`${prev}>${k}`] = (links[`${prev}>${k}`] || 0) + 1;
      prev = k;
    });
  }
  const cols = {};
  Object.values(nodes).forEach((n) => (cols[n.depth] ||= []).push(n));
  const maxN = Math.max(...Object.values(cols).map((c) => c.length));
  const k = (H - GAP * (maxN - 1)) / paths.length;
  for (const [d, col] of Object.entries(cols)) {
    col.sort((a, b) => RANK.indexOf(a.name) - RANK.indexOf(b.name));
    const total = col.reduce((s, n) => s + n.value * k, 0) + GAP * (col.length - 1);
    let y = (H - total) / 2;
    for (const n of col) {
      n.x = maxDepth ? (Number(d) / maxDepth) * (W - NW) : 0;
      n.y = y;
      n.h = n.value * k;
      y += n.h + GAP;
    }
  }
  const L = Object.entries(links).map(([lk, v]) => {
    const [s, t] = lk.split('>');
    return { s: nodes[s], t: nodes[t], v };
  });
  L.forEach((l) => { l.s.out.push(l); l.t.inn.push(l); });
  for (const n of Object.values(nodes)) {
    let o = n.y;
    let i = n.y;
    n.out.sort((a, b) => a.t.y - b.t.y).forEach((l) => { l.sy = o; o += l.v * k; });
    n.inn.sort((a, b) => a.s.y - b.s.y).forEach((l) => { l.ty = i; i += l.v * k; });
  }
  const f = (x) => x.toFixed(1);
  return {
    W, H, NW, maxDepth,
    nodes: Object.values(nodes).map((n) => ({ ...n, color: NODE_COLOR[n.name] || '#9C96B8', last: n.depth === maxDepth })),
    links: L.map((l) => {
      const x0 = l.s.x + NW;
      const x1 = l.t.x;
      const xm = (x0 + x1) / 2;
      const h = l.v * k;
      return {
        src: l.s.name, dst: l.t.name, v: l.v, fill: FILL[l.t.name] || GREY,
        d: `M${f(x0)} ${f(l.sy)} C${f(xm)} ${f(l.sy)} ${f(xm)} ${f(l.ty)} ${f(x1)} ${f(l.ty)} L${f(x1)} ${f(l.ty + h)} C${f(xm)} ${f(l.ty + h)} ${f(xm)} ${f(l.sy + h)} ${f(x0)} ${f(l.sy + h)} Z`
      };
    })
  };
}

/** Text you can paste into sankeymatic.com */
export function toSankeyMatic(sankey) {
  return sankey.links.map((l) => `${l.src} [${l.v}] ${l.dst}`).join('\n');
}
