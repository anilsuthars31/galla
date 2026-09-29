(() => {
const G = Galla, { EXP, INC, CAT, inr, mLabel } = G;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const colorVar = id => (id === 'sales' || id === 'otherinc') ? '--in' : '--s' + CAT[id].slot;
const short = n => { const a = Math.abs(n), s = n < 0 ? '−₹' : '₹'; return a >= 1e5 ? s + (a / 1e5).toFixed(a >= 1e6 ? 1 : 2) + 'L' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + 'k' : s + Math.round(a); };
const signed = n => (n < 0 ? '−' : '+') + inr(Math.abs(n));
const fmtDate = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const S = { raw: null, txns: [], a: null, overrides: store.get('galla-overrides') || {}, isSample: true, fileName: '', sel: null, hidden: new Set(), q: '', cat: '', month: null, shown: 25 };

/* ---------- data flow ---------- */
function load(rows, name, isSample) {
  const raw = G.rowsToTxns(rows);
  S.raw = raw; S.isSample = isSample; S.fileName = name; S.sel = null; S.month = null; S.cat = ''; S.q = ''; $('#q').value = ''; S.shown = 25;
  recompute();
}
function recompute() {
  S.txns = G.enrich(S.raw, S.overrides);
  S.a = G.analyze(S.txns);
  if (S.sel == null || !allMonths().some(x => x.m === S.sel)) S.sel = S.a.months[S.a.months.length - 1];
  renderAll();
}
function allMonths() {
  const a = S.a;
  return [...a.months.map(m => ({ m, in: a.byMonth[m].in, out: a.byMonth[m].out, cats: a.byMonth[m].cats, endBal: a.byMonth[m].endBal, f: false })),
          ...a.forecast.map(x => ({ ...x, f: true }))];
}
function renderAll() { renderSource(); renderKPIs(); renderLegend(); renderDetail(); renderBalance(); renderAlerts(); renderBudget(); renderRecurring(); renderFilters(); renderLedger(); V3.build(allMonths()); }

/* ---------- header / KPIs ---------- */
function renderSource() {
  const a = S.a, [d0, d1] = a.period;
  $('#source').innerHTML = (S.isSample ? '<span class="pill sample">Sample data</span><span>A fictional kirana store in Pune. Upload your own statement to replace it.</span>' : `<span class="pill">Your file</span><b>${esc(S.fileName)}</b>`) +
    `<span>${fmtDate(d0)} – ${fmtDate(d1)} · <span class="num">${S.txns.length}</span> transactions</span>`;
}
function renderKPIs() {
  const a = S.a, fixed = a.fixedMonthly, net3 = a.forecast.reduce((s, f) => s + f.net, 0);
  const worst = a.forecast.reduce((m, f) => f.net < m.net ? f : m, a.forecast[0]);
  const k = [
    ['Money in · monthly avg', inr(a.avgIn), `${a.months.length} months of statement`],
    ['Money out · monthly avg', inr(a.avgOut), fixed ? `${inr(fixed)} of it is fixed payments` : 'No fixed payments found'],
    ['Bank balance', a.curBal != null ? inr(a.curBal) : '—', a.curBal != null ? `on ${fmtDate(a.period[1])}` : 'No balance column in the file'],
    ['Next 3 months · net', signed(net3), worst.net < 0 ? `${mLabel(worst.m)} runs ${short(worst.net)} short` : 'Every forecast month stays positive', worst.net < 0],
  ];
  $('#kpis').innerHTML = k.map(([l, v, s, bad]) => `<div class="kpi${bad ? ' alert' : ''}"><span class="eyebrow">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join('');
}

/* ---------- legend (toggles categories in 3D) ---------- */
function renderLegend() {
  const present = new Set(); for (const m of allMonths()) for (const c in m.cats) if (m.cats[c] > 0) present.add(c);
  $('#legend').innerHTML = `<button class="chip" aria-pressed="true" disabled style="cursor:default"><span class="sw" style="background:var(--in)"></span>Money in</button>` +
    EXP.filter(c => present.has(c.id)).map(c => `<button class="chip" data-c="${c.id}" aria-pressed="${!S.hidden.has(c.id)}"><span class="sw" style="background:var(${colorVar(c.id)})"></span>${c.name}</button>`).join('');
}
$('#legend').addEventListener('click', e => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  const c = b.dataset.c; S.hidden.has(c) ? S.hidden.delete(c) : S.hidden.add(c);
  b.setAttribute('aria-pressed', !S.hidden.has(c)); V3.build(allMonths());
});

/* ---------- month detail ---------- */
function renderDetail() {
  const list = allMonths(), i = list.findIndex(x => x.m === S.sel), x = list[i];
  const exp = EXP.map(c => [c, x.cats[c.id] || 0]).filter(([, v]) => v > 0).sort((p, q) => q[1] - p[1]);
  const inc = INC.map(c => [c, x.cats[c.id] || 0]).filter(([, v]) => v > 0);
  const maxE = Math.max(1, ...exp.map(([, v]) => v));
  const row = ([c, v], max, click) => `<div class="brow"><span class="sw" style="background:var(${colorVar(c.id)})"></span>${click ? `<button data-fc="${c.id}" title="Show these transactions">${c.name}</button>` : `<span>${c.name}</span>`}<span class="num">${inr(v)}</span><span class="track"><i style="width:${(v / max * 100).toFixed(1)}%;background:var(${colorVar(c.id)})"></i></span></div>`;
  $('#detail').innerHTML = `
    <div class="phead" style="margin:0"><div><span class="eyebrow">Month detail</span><h2 style="margin-top:6px">${mLabel(x.m, true)} <span class="pill ${x.f ? 'sample' : ''}" style="vertical-align:2px;margin-left:4px">${x.f ? 'Forecast' : 'Actual'}</span></h2></div>
      <div class="monthnav"><button id="mprev" aria-label="Previous month" ${i === 0 ? 'disabled' : ''}>‹</button><button id="mnext" aria-label="Next month" ${i === list.length - 1 ? 'disabled' : ''}>›</button></div></div>
    <div class="big"><div><span class="eyebrow">In</span><span class="num">${short(x.in)}</span></div><div><span class="eyebrow">Out</span><span class="num">${short(x.out)}</span></div><div><span class="eyebrow">Net</span><span class="num" style="color:var(${x.in - x.out < 0 ? '--crit' : '--good'})">${short(x.in - x.out)}</span></div></div>
    <div><span class="eyebrow">Where money went</span><div class="bars" style="margin-top:10px">${exp.map(e => row(e, maxE, !x.f)).join('')}</div></div>
    <div><span class="eyebrow">Where it came from</span><div class="bars" style="margin-top:10px">${inc.map(e => row(e, Math.max(...inc.map(([, v]) => v)), !x.f)).join('')}</div></div>
    ${x.f ? `<p style="margin:0;font-size:12.5px;color:var(--muted)">Estimated from recurring payments${x.notes && x.notes.length ? ', ' + x.notes.map(n => esc(n.payee) + ' (quarterly)').join(', ') : ''} and the average of the last 3 months.</p>` : '<p style="margin:0;font-size:12.5px;color:var(--muted)">Click a category to see its transactions.</p>'}`;
}
$('#detail').addEventListener('click', e => {
  if (e.target.closest('#mprev') || e.target.closest('#mnext')) {
    const list = allMonths(), i = list.findIndex(x => x.m === S.sel) + (e.target.closest('#mprev') ? -1 : 1);
    if (list[i]) selectMonth(list[i].m); return;
  }
  const b = e.target.closest('[data-fc]'); if (!b) return;
  S.cat = b.dataset.fc; S.month = S.sel; S.shown = 25; renderFilters(); renderLedger();
  $('#ledger').closest('.panel').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
});
function selectMonth(m) { S.sel = m; renderDetail(); V3.select(m); }

/* ---------- balance projection (SVG) ---------- */
function renderBalance() {
  const a = S.a, box = $('#bal');
  const ft = $('#ftable');
  ft.innerHTML = `<thead><tr><th>Month</th><th>Money in</th><th>Money out</th><th>Net</th>${a.hasBal ? '<th>Closing balance</th>' : ''}</tr></thead><tbody>` +
    a.forecast.map(f => `<tr><td>${mLabel(f.m)}</td><td class="num">${inr(f.in)}</td><td class="num">${inr(f.out)}</td><td class="num ${f.net < 0 ? 'neg' : ''}">${signed(f.net)}</td>${a.hasBal ? `<td class="num">${inr(f.endBal)}</td>` : ''}</tr>`).join('') + '</tbody>';
  if (!a.hasBal) { box.innerHTML = '<p style="color:var(--muted);margin:0">This file has no balance column, so only monthly net cash flow is projected (table below).</p>'; return; }
  const pts = [...a.months.map(m => ({ m, v: a.byMonth[m].endBal, f: false })), ...a.forecast.map(f => ({ m: f.m, v: f.endBal, f: true }))].filter(p => p.v != null);
  const W = 640, H = 230, L = 58, R = 18, T = 14, B = 30;
  const buf = a.fixedMonthly;
  let lo = Math.min(...pts.map(p => p.v), buf || Infinity), hi = Math.max(...pts.map(p => p.v));
  const span = hi - lo || hi || 1; lo = Math.max(0, lo - span * 0.25); hi += span * 0.12;
  const step = niceStep((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = i => L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = []; for (let v = lo; v <= hi + 1; v += step) ticks.push(v);
  const k = pts.findIndex(p => p.f); const lastA = k < 0 ? pts.length - 1 : k - 1;
  const path = ps => ps.map((p, j) => `${j ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const P = pts.map((p, i) => ({ ...p, i }));
  const act = P.slice(0, lastA + 1), fc = P.slice(lastA);
  const area = path(act) + `L${x(lastA)},${y(lo)}L${x(0)},${y(lo)}Z`;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Month-end bank balance, actual and projected">
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" font-family="var(--f-mono)" fill="var(--faint)">${short(v)}</text>`).join('')}
    ${k >= 0 ? `<rect x="${(x(lastA) + x(k)) / 2}" y="${T}" width="${W - R - (x(lastA) + x(k)) / 2}" height="${H - T - B}" fill="var(--panel-2)"/><text x="${W - R - 4}" y="${T + 13}" text-anchor="end" font-size="11" font-family="var(--f-mono)" fill="var(--faint)">FORECAST</text>` : ''}
    ${buf && buf > lo && buf < hi ? `<line x1="${L}" x2="${W - R}" y1="${y(buf)}" y2="${y(buf)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="3 4"/><text x="${L + 6}" y="${y(buf) - 6}" font-size="11" fill="var(--warn)">1 month of fixed payments · ${short(buf)}</text>` : ''}
    <path d="${area}" fill="var(--s1)" opacity=".12"/>
    <path d="${path(act)}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>
    ${fc.length > 1 ? `<path d="${path(fc)}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-dasharray="6 5"/>` : ''}
    ${P.map(p => `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="4.5" fill="${p.f ? 'var(--panel)' : 'var(--s1)'}" stroke="var(--s1)" stroke-width="2"/>`).join('')}
    ${P.map(p => `<text x="${x(p.i)}" y="${H - 9}" text-anchor="middle" font-size="11" font-family="var(--f-mono)" fill="var(${p.f ? '--faint' : '--muted'})">${new Date(Math.floor(p.m / 12), p.m % 12).toLocaleString('en-IN', { month: 'short' })}</text>`).join('')}
    <g id="balhit">${P.map(p => `<rect data-i="${p.i}" x="${x(p.i) - (W - L - R) / Math.max(1, P.length - 1) / 2}" y="${T}" width="${(W - L - R) / Math.max(1, P.length - 1)}" height="${H - T - B}" fill="transparent"/>`).join('')}</g>
    <line id="balx" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--faint)" stroke-width="1" visibility="hidden"/>
  </svg><div class="tip" id="baltip" hidden></div>`;
  const svg = box.querySelector('svg'), tip = $('#baltip'), cx = $('#balx');
  svg.addEventListener('pointermove', e => {
    const r = e.target.closest('rect[data-i]'); if (!r) return;
    const p = P[+r.dataset.i]; const bb = svg.getBoundingClientRect(), sc = bb.width / W;
    cx.setAttribute('x1', x(p.i)); cx.setAttribute('x2', x(p.i)); cx.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.innerHTML = `<b>${mLabel(p.m, true)}${p.f ? ' · forecast' : ''}</b><span class="num">${inr(p.v)}</span>`;
    const tx = x(p.i) * sc; tip.style.left = Math.min(Math.max(0, tx - 80), bb.width - 170) + 'px'; tip.style.top = Math.max(0, y(p.v) * sc - 64) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cx.setAttribute('visibility', 'hidden'); });
}
function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw || 1)); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

/* ---------- alerts ---------- */
const ICON = {
  critical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9.5"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 11v6M12 7h.01"/><circle cx="12" cy="12" r="9.5"/></svg>',
};
const LVL = { critical: 'Act now', warning: 'Watch', good: 'Good', info: 'Note' };
function renderAlerts() {
  const al = S.a.alerts;
  $('#alerts').innerHTML = al.length ? al.map(x => `<div class="al ${x.level}"><span class="ic" title="${LVL[x.level]}">${ICON[x.level]}</span><div><b>${esc(x.title)}</b><p><span class="sr-level" style="font-weight:600;color:var(--ink)">${LVL[x.level]}.</span> ${esc(x.body)}</p></div></div>`).join('')
    : '<div class="al good"><span class="ic">' + ICON.good + '</span><div><b>Nothing unusual</b><p>The next 3 months stay positive and spending is at its usual level.</p></div></div>';
}

/* ---------- budget & recurring ---------- */
function renderBudget() {
  const b = S.a.budget, last = S.a.months[S.a.months.length - 1];
  $('#budget').innerHTML = `<thead><tr><th>Category</th><th class="r">Monthly limit</th><th class="r">${new Date(Math.floor(last / 12), last % 12).toLocaleString('en-IN', { month: 'short' })} actual</th><th></th><th>Status</th></tr></thead><tbody>` +
    b.map(r => { const p = r.limit ? Math.min(1, r.actual / r.limit) : 1; return `<tr><td><span class="catname"><span class="sw" style="background:var(${colorVar(r.id)})"></span>${r.name}</span></td><td class="r num">${inr(r.limit)}</td><td class="r num">${inr(r.actual)}</td><td><div class="meter ${r.status}" title="${r.limit ? Math.round(r.actual / r.limit * 100) : 0}% of limit"><i style="width:${(p * 100).toFixed(0)}%"></i></div></td><td>${r.status === 'over' ? '<span class="pill critical">Over</span>' : '<span class="pill good">On track</span>'}</td></tr>`; }).join('') + '</tbody>';
}
function renderRecurring() {
  const a = S.a, last = a.months[a.months.length - 1];
  const due = r => { const m = r.freq === 'Monthly' ? last + 1 : r.next; return new Date(Math.floor(m / 12), m % 12, Math.min(r.day, 28)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  $('#recurring').innerHTML = a.recurring.length ? `<thead><tr><th>Payee</th><th>Every</th><th class="r">Typical</th><th class="r">Next due</th></tr></thead><tbody>` +
    a.recurring.map(r => `<tr><td><span class="catname"><span class="sw" style="background:var(${colorVar(r.cat)})"></span><span>${esc(r.payee)}<br><span class="freq">${CAT[r.cat].name}</span></span></span></td><td class="freq">${r.freq === 'Monthly' ? 'Month' : 'Quarter'}</td><td class="r num">${inr(r.amount)}</td><td class="r num">~${due(r)}</td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td style="color:var(--muted)">No repeating payments found yet. They appear once a payee shows up in 3 or more months.</td></tr></tbody>';
}

/* ---------- ledger ---------- */
function renderFilters() {
  $('#fcat').innerHTML = '<option value="">All categories</option>' + [...EXP, ...INC].map(c => `<option value="${c.id}" ${S.cat === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  $('#fchips').innerHTML = S.month != null ? `<span class="fchip">${mLabel(S.month)}<button data-x="month" aria-label="Clear month filter">×</button></span>` : '';
}
function renderLedger() {
  const q = S.q.toLowerCase();
  const rows = S.txns.filter(t => (!S.cat || t.cat === S.cat) && (S.month == null || G.mIdx(t.date) === S.month) && (!q || t.narr.toLowerCase().includes(q) || t.payee.toLowerCase().includes(q))).slice().reverse();
  const opts = t => (t.dir === 'C' ? INC : EXP).map(c => `<option value="${c.id}" ${c.id === t.cat ? 'selected' : ''}>${c.name}</option>`).join('');
  const shown = rows.slice(0, S.shown);
  $('#ledger').innerHTML = `<thead><tr><th>Date</th><th>Payee · narration</th><th>Mode</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>` +
    (shown.length ? shown.map(t => `<tr><td class="num" style="white-space:nowrap">${t.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td><td class="who"><b>${esc(t.payee)}</b><span>${esc(t.narr)}</span></td><td><span class="rail">${t.rail}</span></td><td><select data-id="${t.id}" class="${t.why === 'Your choice' ? 'mine' : ''}" aria-label="Category for ${esc(t.payee)}">${opts(t)}</select></td><td class="r num amt ${t.dir === 'C' ? 'c' : ''}" style="white-space:nowrap">${t.dir === 'C' ? '+' : '−'}${inr(t.amount)}</td></tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--muted)">No transactions match these filters.</td></tr>') + '</tbody>';
  const nOv = Object.keys(S.overrides).length;
  const total = rows.reduce((s, t) => s + (t.dir === 'C' ? t.amount : -t.amount), 0);
  $('#more').innerHTML = `<span>Showing <span class="num">${shown.length}</span> of <span class="num">${rows.length}</span> · net <span class="num">${signed(total)}</span></span>` +
    (rows.length > S.shown ? '<button class="btn" id="showmore">Show 100 more</button>' : '') +
    (nOv ? `<button class="btn" id="resetcat">Undo my ${nOv} category change${nOv > 1 ? 's' : ''}</button>` : '');
}
$('#ledger').addEventListener('change', e => {
  const s = e.target.closest('select[data-id]'); if (!s) return;
  const t = S.txns[+s.dataset.id]; S.overrides[t.key] = s.value; store.set('galla-overrides', S.overrides);
  const n = S.txns.filter(x => x.key === t.key).length; recompute();
  toast(`${n} payment${n > 1 ? 's' : ''} to ${t.payee} moved to ${CAT[s.value].name}.`);
});
$('#more').addEventListener('click', e => {
  if (e.target.closest('#showmore')) { S.shown += 100; renderLedger(); }
  if (e.target.closest('#resetcat')) { S.overrides = {}; store.set('galla-overrides', {}); recompute(); toast('Categories reset to the automatic rules.'); }
});
$('#q').addEventListener('input', e => { S.q = e.target.value; S.shown = 25; renderLedger(); });
$('#fcat').addEventListener('change', e => { S.cat = e.target.value; S.shown = 25; renderLedger(); });
$('#fchips').addEventListener('click', e => { if (e.target.closest('[data-x]')) { S.month = null; renderFilters(); renderLedger(); } });

let toastT; function toast(msg) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3200); }

/* ---------- file input ---------- */
function showErr(m) { const e = $('#error'); e.hidden = !m; e.textContent = m || ''; }
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load the Excel reader. Save the statement as CSV and try again.')); document.head.appendChild(s); }); }
async function readFile(f) {
  showErr('');
  try {
    let rows;
    if (/\.(xlsx?|xlsm)$/i.test(f.name)) {
      if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    } else if (/\.pdf$/i.test(f.name)) {
      throw new Error('PDF statements are not supported yet. Download the Excel or CSV statement from net banking instead.');
    } else rows = G.parseCSV(await f.text());
    load(rows, f.name, false);
    toast(`Loaded ${S.txns.length} transactions from ${f.name}.`);
  } catch (err) { showErr(err.message || String(err)); }
}
$('#uploadBtn').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ''; });
$('#sampleBtn').addEventListener('click', () => { showErr(''); load(G.sampleRows(), 'sample', true); toast('Sample statement loaded.'); });
const app = $('#app');
app.addEventListener('dragover', e => { e.preventDefault(); app.classList.add('drop'); });
app.addEventListener('dragleave', e => { if (!app.contains(e.relatedTarget)) app.classList.remove('drop'); });
app.addEventListener('drop', e => { e.preventDefault(); app.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f) readFile(f); });

/* ---------- 3D cash city ---------- */
const V3 = (() => {
  const el = $('#scene'), lblBox = $('#lbls'), tip = $('#tip');
  if (!window.THREE) { el.insertAdjacentHTML('beforeend', '<div class="nogl">The 3D view could not load. The month detail panel and tables show the same numbers.</div>'); return { build() {}, select() {} }; }
  let R, scene, cam, root, ray, ok = false, meshes = [], labels = [], data = [], selM = null, selTile = null;
  let yaw = -0.5, pitch = 0.6, dist = 24, baseDist = 24, interacted = false, tBuild = 0, hover = null, running = true, drag = null;
  const SP = 2.2, H = 6.2, target = new THREE.Vector3(0, 1.8, 0);
  try {
    R = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    R.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    el.prepend(R.domElement); ok = true;
  } catch (e) { el.insertAdjacentHTML('beforeend', '<div class="nogl">This browser could not start the 3D view. The month detail panel and tables show the same numbers.</div>'); }
  if (!ok) return { build() {}, select() {} };
  scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(38, 1, 0.1, 400); ray = new THREE.Raycaster();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(6, 14, 9); scene.add(sun);
  root = new THREE.Group(); scene.add(root);

  function col(v) { return new THREE.Color(css(v) || '#888'); }
  function clear() { root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); root.clear(); meshes = []; lblBox.innerHTML = ''; labels = []; }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  function box(w, d, color, f) {
    const m = new THREE.Mesh(unit.clone(), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, transparent: f, opacity: f ? 0.34 : 1, depthWrite: !f }));
    m.scale.set(w, 0.0001, d);
    if (f) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(unit), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })); m.add(e); }
    return m;
  }
  function label(text, pos, cls) { const d = document.createElement('div'); d.className = 'lbl ' + (cls || ''); d.textContent = text; lblBox.appendChild(d); labels.push({ d, pos }); return d; }

  function build(list) {
    data = list; clear(); tBuild = performance.now();
    const n = list.length, x0 = -(n - 1) / 2 * SP;
    const max = Math.max(1, ...list.map(m => Math.max(m.in, EXP.reduce((s, c) => s + (S.hidden.has(c.id) ? 0 : (m.cats[c.id] || 0)), 0))));
    const k = H / max;
    const floorC = col('--panel-2'), lineC = col('--line');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(n * SP + 3, 5.6), new THREE.MeshBasicMaterial({ color: floorC }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; root.add(floor);
    const fi = list.findIndex(m => m.f);
    if (fi >= 0) {
      const w = (n - fi) * SP + 1.5 - SP / 2 + 0.2, zone = new THREE.Mesh(new THREE.PlaneGeometry(w, 5.6), new THREE.MeshBasicMaterial({ color: lineC }));
      zone.rotation.x = -Math.PI / 2; zone.position.set(x0 + (fi - 0.5) * SP + w / 2, -0.005, 0); root.add(zone);
      label('FORECAST', new THREE.Vector3(x0 + (fi - 0.5) * SP + w / 2, 0, -2.6), 'f');
    }
    selTile = new THREE.Mesh(new THREE.PlaneGeometry(SP * 0.92, 5.2), new THREE.MeshBasicMaterial({ color: col('--faint'), transparent: true, opacity: 0.22 }));
    selTile.rotation.x = -Math.PI / 2; selTile.position.y = 0.001; root.add(selTile);
    list.forEach((m, i) => {
      const x = x0 + i * SP;
      if (m.in > 0) { const b = box(0.9, 0.9, col('--in'), m.f); b.position.set(x, 0, -0.62); b.userData = { i, kind: 'in', h: m.in * k, base: 0, m, val: m.in }; root.add(b); meshes.push(b); }
      let base = 0;
      for (const c of EXP) {
        const v = m.cats[c.id] || 0; if (!v || S.hidden.has(c.id)) continue;
        const h = v * k, b = box(0.9, 0.9, col(colorVar(c.id)), m.f);
        b.position.set(x, 0, 0.62); b.userData = { i, kind: 'out', cat: c.id, h: Math.max(0.001, h - 0.04), base: base, m, val: v }; root.add(b); meshes.push(b); base += h;
      }
      m._lbl = label(new Date(Math.floor(m.m / 12), m.m % 12).toLocaleString('en-IN', { month: 'short' }) + (i === 0 || m.m % 12 === 0 ? " '" + String(Math.floor(m.m / 12)).slice(2) : ''), new THREE.Vector3(x, 0, 2.15), m.f ? 'f' : '');
    });
    label('In', new THREE.Vector3(x0 - 1.35, 0, -0.62), 'row'); label('Out', new THREE.Vector3(x0 - 1.35, 0, 0.62), 'row');
    select(S.sel);
    resize();
  }
  function select(m) {
    selM = m; const i = data.findIndex(d => d.m === m); const n = data.length;
    if (selTile) { selTile.visible = i >= 0; selTile.position.x = (-(n - 1) / 2 + i) * SP; }
    data.forEach(d => d._lbl && d._lbl.classList.toggle('sel', d.m === m));
  }
  function resize() {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const span = data.length * SP + 3, fitW = (span / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / cam.aspect, fitH = (H + 2) / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const nd = Math.max(fitW * 0.92, fitH * 1.25, 12);
    dist = dist / baseDist * nd; baseDist = nd;
  }
  new ResizeObserver(resize).observe(el);
  let looping = false;
  new IntersectionObserver(es => { running = es[0].isIntersecting; if (running && !looping) { looping = true; loop(); } }).observe(el);

  const v = new THREE.Vector3();
  function loop() {
    if (!running) { looping = false; return; } requestAnimationFrame(loop);
    const now = performance.now();
    if (!interacted && !reduced) yaw = -0.5 + Math.sin(now / 5200) * 0.16;
    cam.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw));
    cam.lookAt(target);
    for (const b of meshes) {
      const u = b.userData, t = reduced ? 1 : Math.min(1, Math.max(0, (now - tBuild - u.i * 55) / 750)), e = 1 - Math.pow(1 - t, 3);
      b.scale.y = Math.max(0.0001, u.h * e); b.position.y = (u.base + u.h / 2) * e;
    }
    const w = el.clientWidth, h = el.clientHeight;
    for (const l of labels) { v.copy(l.pos).project(cam); l.d.style.left = ((v.x + 1) / 2 * w) + 'px'; l.d.style.top = ((1 - v.y) / 2 * h) + 'px'; l.d.style.visibility = v.z < 1 ? 'visible' : 'hidden'; }
    R.render(scene, cam);
  }

  function pick(e) {
    const r = el.getBoundingClientRect();
    ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, cam);
    const hit = ray.intersectObjects(meshes, false)[0]; return hit ? hit.object : null;
  }
  function setHover(o, e) {
    if (hover && hover !== o) hover.material.emissive.setHex(0);
    hover = o;
    if (!o) { tip.hidden = true; return; }
    o.material.emissive.copy(col('--focus')).multiplyScalar(0.35);
    const u = o.userData, m = u.m, r = el.getBoundingClientRect();
    const name = u.kind === 'in' ? 'Money in' : CAT[u.cat].name;
    const extra = u.kind === 'in' ? INC.filter(c => m.cats[c.id]).map(c => `<div style="display:flex;justify-content:space-between;gap:12px;color:var(--muted)"><span>${c.name}</span><span class="num">${inr(m.cats[c.id])}</span></div>`).join('') : `<div style="color:var(--muted)">${Math.round(u.val / m.out * 100)}% of money out</div>`;
    tip.innerHTML = `<span class="eyebrow">${mLabel(m.m)}${m.f ? ' · forecast' : ''}</span><b style="margin-top:4px">${name}</b><span class="num">${inr(u.val)}</span>${extra}`;
    tip.hidden = false;
    const tx = e.clientX - r.left, ty = e.clientY - r.top;
    tip.style.left = Math.min(tx + 14, r.width - tip.offsetWidth - 8) + 'px'; tip.style.top = Math.max(8, ty - tip.offsetHeight - 10) + 'px';
  }
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('.ctrl')) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId, type: e.pointerType };
  });
  el.addEventListener('pointermove', e => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4) {
        if (!el.classList.contains('drag')) { el.classList.add('drag'); try { el.setPointerCapture(e.pointerId); } catch {} }
        interacted = true; yaw -= dx * 0.008; if (drag.type === 'mouse') pitch = Math.min(1.25, Math.max(0.16, pitch + dy * 0.006)); setHover(null);
      }
      return;
    }
    if (e.pointerType === 'mouse') setHover(pick(e), e);
  });
  const end = e => {
    if (!drag) return;
    if (drag.moved <= 4 && !e.target.closest('.ctrl')) { const o = pick(e); if (o) { selectMonth(o.userData.m.m); if (e.pointerType !== 'mouse') setHover(o, e); } }
    drag = null; el.classList.remove('drag');
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { drag = null; el.classList.remove('drag'); });
  el.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
  $('#zin').onclick = () => { interacted = true; dist = Math.max(baseDist * 0.45, dist * 0.85); };
  $('#zout').onclick = () => { interacted = true; dist = Math.min(baseDist * 1.8, dist * 1.18); };
  $('#zreset').onclick = () => { interacted = false; dist = baseDist; pitch = 0.6; yaw = -0.5; };
  const rethemed = () => build(data);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rethemed);
  new MutationObserver(rethemed).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return { build, select };
})();

/* ---------- start ---------- */
load(G.sampleRows(), 'sample', true);
})();
