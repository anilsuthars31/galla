/* ===== Galla engine: parse → categorize → analyze → forecast =====
   Pure functions, no DOM. Rules + averages only (no ML) for V1. */
const Galla = (() => {
  const EXP = [
    { id: 'suppliers', name: 'Suppliers & stock', slot: 1 },
    { id: 'salary',    name: 'Salaries',          slot: 2 },
    { id: 'rent',      name: 'Rent',              slot: 3 },
    { id: 'utilities', name: 'Utilities',         slot: 4 },
    { id: 'emi',       name: 'EMI & loans',       slot: 5 },
    { id: 'tax',       name: 'GST & tax',         slot: 6 },
    { id: 'personal',  name: 'Personal',          slot: 7 },
    { id: 'charges',   name: 'Bank charges',      slot: 8 },
    { id: 'other',     name: 'Other / cash',      slot: 0 },
  ];
  const INC = [
    { id: 'sales',    name: 'Sales' },
    { id: 'otherinc', name: 'Other income' },
  ];
  const CAT = Object.fromEntries([...EXP, ...INC].map(c => [c.id, c]));

  /* ---------- low-level parsing ---------- */
  const MON = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

  function parseAmount(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? Math.abs(v) : 0;
    const s = String(v).replace(/[₹,\s]|INR|Rs\.?/gi, '').replace(/(dr|cr)$/i, '');
    const n = parseFloat(s);
    return isFinite(n) ? Math.abs(n) : 0;
  }

  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) { // Excel serial
      const d = new Date(Math.round((v - 25569) * 864e5));
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,9}|\d{1,2})[\/\-. ,]+(\d{2,4})/);
    if (!m) return null;
    const d = +m[1];
    const mo = /\d/.test(m[2]) ? +m[2] - 1 : MON[m[2].slice(0, 3).toLowerCase()];
    let y = +m[3]; if (y < 100) y += 2000;
    if (mo == null || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    return new Date(y, mo, d);
  }

  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* Find the header row and map columns. Works for SBI, HDFC, ICICI, Axis, Kotak style exports. */
  function rowsToTxns(rows) {
    const low = r => r.map(c => String(c ?? '').toLowerCase().trim());
    let hi = -1, cols = null;
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
      const r = low(rows[i] || []);
      const hasDate = r.some(c => /date/.test(c));
      const hasNarr = r.some(c => /narration|description|particular|remark|details/.test(c));
      if (hasDate && hasNarr) { hi = i; cols = r; break; }
    }
    if (hi < 0) throw new Error('Could not find the header row. The file needs columns for date, narration/description, and withdrawal/deposit amounts.');
    const find = (re, not) => cols.findIndex(c => re.test(c) && !(not && not.test(c)));
    let date = find(/(txn|tran|transaction).*date/);
    if (date < 0) date = find(/date/, /value/);
    if (date < 0) date = find(/date/);
    const narr = find(/narration|description|particular|remark|details/);
    const debit = find(/withdraw|debit|\bdr\b/, /credit|\/|type/);
    const credit = find(/deposit|credit|\bcr\b/, /debit|\/|type/);
    const bal = find(/balance/);
    const amt = find(/^amount|amount \(|amt/);
    const typ = find(/dr\s*\/\s*cr|cr\s*\/\s*dr|type/);
    if (narr < 0 || (debit < 0 && credit < 0 && amt < 0)) throw new Error('Could not find the amount columns. Expected "Withdrawal" and "Deposit" (or "Debit" and "Credit").');

    const out = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const d = parseDate(r[date]); if (!d) continue;
      let dr = debit >= 0 ? parseAmount(r[debit]) : 0;
      let cr = credit >= 0 ? parseAmount(r[credit]) : 0;
      if (debit < 0 && credit < 0 && amt >= 0) {
        const a = parseAmount(r[amt]); const t = String(r[typ] ?? r[amt]).toLowerCase();
        if (/cr/.test(t)) cr = a; else dr = a;
      }
      if (!dr && !cr) continue;
      const b = bal >= 0 && r[bal] !== '' && r[bal] != null ? parseAmount(r[bal]) : null;
      out.push({ date: d, narr: String(r[narr] ?? '').replace(/\s+/g, ' ').trim(), debit: dr, credit: cr, bal: b, order: out.length });
    }
    if (!out.length) throw new Error('Found the columns but no transactions with a valid date.');
    return out;
  }

  /* ---------- narration understanding ---------- */
  function detectRail(n) {
    const u = n.toUpperCase();
    if (/(^|[^A-Z])UPI([^A-Z]|$)/.test(u)) return 'UPI';
    if (/NEFT/.test(u)) return 'NEFT';
    if (/IMPS/.test(u)) return 'IMPS';
    if (/RTGS/.test(u)) return 'RTGS';
    if (/NACH|\bACH\b|\bECS\b/.test(u)) return 'NACH';
    if (/\bATM\b|\bATW\b|\bNWD\b|CASH WDL/.test(u)) return 'ATM';
    if (/CHRG|\bCHG\b|CHARGES|\bAMC\b/.test(u)) return 'Charge';
    if (/INT\.?\s?PD|INTEREST|\bINT CR/.test(u)) return 'Interest';
    if (/CASH DEP|BY CASH|\bCDM\b/.test(u)) return 'Cash';
    if (/\bCHQ\b|CHEQUE|\bCLG\b|CLEARING/.test(u)) return 'Cheque';
    if (/BILLDESK|\bBBPS\b|BILLPAY/.test(u)) return 'Bill pay';
    if (/\bPOS\b/.test(u)) return 'Card';
    return 'Other';
  }

  const NOISE = /^(UPI|NEFT|IMPS|RTGS|NACH|ACH|ECS|DR|CR|P2A|P2M|P2P|MB|IB|INB|TO|BY|FROM|TRANSFER|TRF|PAYMENT|PAYMENT FROM PH|SUCCESS|REF|NA|N\/A|BILLDESK|BBPS|CHALLAN|INDIA|PVT|LTD)$/;
  function extractPayee(n, rail) {
    let s = n.toUpperCase();
    if (rail === 'ATM') return 'ATM withdrawal';
    if (rail === 'Cash') return 'Cash deposit';
    if (rail === 'Interest') return 'Bank interest';
    if (rail === 'Charge') return 'Bank charges';
    if (/\bGST\b|CPIN/.test(s)) return 'GST payment';
    if (/ADV(ANCE)? TAX|CHALLAN 280/.test(s)) return 'Advance tax';
    if (/TDS/.test(s) && /TAX|CHALLAN/.test(s)) return 'TDS payment';
    s = s.replace(/[A-Z]{4}0[A-Z0-9]{6}/g, ' ');            // IFSC
    const parts = s.split(/[\/|:*\-]+/).map(p => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (p.includes('@')) continue;                          // VPA
      const clean = p.split(/\s+/).filter(w => w.length > 1 && !/\d/.test(w) && !NOISE.test(w)).join(' ');
      if (clean.replace(/\s/g, '').length < 3) continue;
      return titleCase(clean.slice(0, 40));
    }
    const vpa = s.match(/([A-Z0-9._-]+)@[A-Z]+/);
    if (vpa) return vpa[1].toLowerCase();
    return titleCase(n.slice(0, 28));
  }
  const titleCase = s => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Upi|Gst|Emi|Atm|Ltd|Hul|Itc)\b/g, m => m.toUpperCase());
  const keyOf = p => p.toLowerCase().replace(/[^a-z0-9]/g, '');

  const RULES = [
    // [pattern, category, direction?]  first match wins
    [/CHRG|\bCHG\b|CHARGES|SMS ALERT|MIN BAL|\bAMC\b|QR RENTAL/, 'charges', 'D'],
    [/\bGST\b|CPIN|GSTN|\bTDS\b|INCOME TAX|CBDT|ADV(ANCE)? TAX|CHALLAN 280/, 'tax', 'D'],
    [/NACH|\bACH\b|\bECS\b|\bEMI\b|LOAN|BAJAJ FIN|FINANCE LTD|LENDINGKART|CAPITAL FLOAT/, 'emi', 'D'],
    [/\bRENT\b|LEASE/, 'rent', 'D'],
    [/SALARY|\bSAL\b|WAGES|STAFF/, 'salary', 'D'],
    [/ELECTRIC|MSEDCL|BESCOM|TPDDL|BSES|TNEB|WATER|AIRTEL|\bJIO\b|VODAFONE|\bVI\b|BSNL|BROADBAND|\bGAS\b|MAHANAGAR/, 'utilities', 'D'],
    [/ZOMATO|NETFLIX|HOTSTAR|PRIME VIDEO|MYNTRA|BOOKMYSHOW|SPOTIFY|\bUBER\b|\bOLA\b|MAKEMYTRIP|NYKAA|AJIO|SWIGGY(?! ?INSTAMART)/, 'personal', 'D'],
    [/TRADERS|DISTRIBUT|WHOLESALE|ENTERPRISE|AGENC|SUPPL|STOCK|UNILEVER|\bHUL\b|\bITC\b|NESTLE|DABUR|UDAAN|JUMBOTAIL|METRO CASH|CASH AND CARRY|MART\b/, 'suppliers', 'D'],
    [/\bATM\b|\bATW\b|\bNWD\b|CASH WDL/, 'other', 'D'],
    [/INT\.?\s?PD|INTEREST|REFUND|REVERSAL|\bREV\b|CASHBACK/, 'otherinc', 'C'],
    [/SETTLEMENT|PAYTM|BHARATPE|PHONEPE|RAZORPAY|PINE ?LABS|CASH DEP|BY CASH|\bCDM\b|\bUPI\b|\bPOS\b/, 'sales', 'C'],
  ];

  function categorize(t, overrides) {
    if (overrides && overrides[t.key]) {
      const o = overrides[t.key];
      if ((t.dir === 'C') === INC.some(c => c.id === o)) return { cat: o, why: 'Your choice' };
    }
    const u = t.narr.toUpperCase();
    for (const [re, cat, dir] of RULES) if ((!dir || dir === t.dir) && re.test(u)) return { cat, why: 'Rule' };
    return { cat: t.dir === 'C' ? 'sales' : 'other', why: 'Default' };
  }

  function enrich(raw, overrides) {
    const txns = raw.slice().sort((a, b) => a.date - b.date || a.order - b.order).map((r, i) => {
      const dir = r.credit > 0 ? 'C' : 'D';
      const rail = detectRail(r.narr);
      const payee = extractPayee(r.narr, rail);
      const t = { ...r, id: i, dir, amount: dir === 'C' ? r.credit : r.debit, rail, payee, key: keyOf(payee) + ':' + dir };
      Object.assign(t, categorize(t, overrides));
      return t;
    });
    return txns;
  }

  /* ---------- analysis ---------- */
  const mIdx = d => d.getFullYear() * 12 + d.getMonth();
  const mLabel = (i, long) => new Date(Math.floor(i / 12), i % 12, 1).toLocaleString('en-IN', { month: long ? 'long' : 'short', year: 'numeric' });
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

  function findRecurring(txns, months) {
    const groups = {};
    for (const t of txns) if (t.dir === 'D' && t.rail !== 'ATM') (groups[t.key] ||= []).push(t);
    const last = months[months.length - 1];
    const out = [];
    for (const [key, list] of Object.entries(groups)) {
      const ms = [...new Set(list.map(t => mIdx(t.date)))].sort((a, b) => a - b);
      const amts = list.map(t => t.amount);
      const m = mean(amts), cv = m ? sd(amts) / m : 1;
      const base = { key, payee: list[0].payee, cat: list[list.length - 1].cat, amount: Math.round(median(amts)), day: Math.round(median(list.map(t => t.date.getDate()))), count: list.length, ids: new Set(list.map(t => t.id)) };
      if (ms.length >= 3 && list.length / ms.length <= 1.5 && cv <= 0.35 && sd(list.map(t => t.date.getDate())) <= 5 && ms[ms.length - 1] >= last - 1) {
        out.push({ ...base, freq: 'Monthly', perMonth: Math.round(sum(list.map(t => t.amount)) / ms.length), since: ms[0], months: ms.length });
      } else if (ms.length >= 2 && list.length === ms.length && cv <= 0.35) {
        const gaps = ms.slice(1).map((x, i) => x - ms[i]);
        if (gaps.every(g => g === 3)) out.push({ ...base, freq: 'Quarterly', next: ms[ms.length - 1] + 3, since: ms[0], months: ms.length });
      }
    }
    return out.sort((a, b) => b.amount - a.amount);
  }
  const sum = a => a.reduce((s, x) => s + x, 0);

  function analyze(txns) {
    const first = mIdx(txns[0].date), last = mIdx(txns[txns.length - 1].date);
    const months = []; for (let i = first; i <= last; i++) months.push(i);
    const byMonth = Object.fromEntries(months.map(m => [m, { in: 0, out: 0, cats: {}, n: 0, endBal: null }]));
    for (const t of txns) {
      const b = byMonth[mIdx(t.date)];
      b[t.dir === 'C' ? 'in' : 'out'] += t.amount;
      b.cats[t.cat] = (b.cats[t.cat] || 0) + t.amount; b.n++;
      if (t.bal != null) b.endBal = t.bal;
    }
    const hasBal = txns.some(t => t.bal != null);
    const curBal = hasBal ? [...txns].reverse().find(t => t.bal != null).bal : null;
    const series = (cat) => months.map(m => byMonth[m].cats[cat] || 0);

    const recurring = findRecurring(txns, months);
    const recIds = new Set(); for (const r of recurring) for (const id of r.ids) recIds.add(id);
    const nonRec = {}; // cat -> month -> amount (debits not in recurring groups)
    for (const t of txns) if (t.dir === 'D' && !recIds.has(t.id)) { const o = (nonRec[t.cat] ||= {}); o[mIdx(t.date)] = (o[mIdx(t.date)] || 0) + t.amount; }
    const last3 = months.slice(-3);

    /* forecast: conservative. income = lower of (last 3 months avg, whole-period avg);
       expenses = recurring at typical amount + quarterly items when due + recent avg of the rest */
    const forecast = [];
    let bal = curBal;
    for (let f = 1; f <= 3; f++) {
      const m = last + f; const cats = {}; const notes = [];
      for (const c of INC) { const s = series(c.id); const v = Math.min(mean(s.slice(-3)), mean(s)); if (v > 0) cats[c.id] = v; }
      for (const c of EXP) {
        let v = mean(last3.map(mm => (nonRec[c.id] || {})[mm] || 0));
        for (const r of recurring) if (r.cat === c.id) {
          if (r.freq === 'Monthly') v += r.perMonth;
          else if (r.freq === 'Quarterly' && (m - r.next) % 3 === 0 && m >= r.next) { v += r.amount; notes.push(r); }
        }
        if (v > 0) cats[c.id] = v;
      }
      const inn = sum(INC.map(c => cats[c.id] || 0)), out = sum(EXP.map(c => cats[c.id] || 0));
      if (bal != null) bal += inn - out;
      forecast.push({ m, in: inn, out, net: inn - out, cats, endBal: bal, notes });
    }

    /* budget: suggested monthly limit = median month, rounded up to ₹500 */
    const lastM = byMonth[last];
    const recFloor = c => sum(recurring.filter(r => r.cat === c && r.freq === 'Monthly').map(r => r.perMonth));
    const budget = EXP.map(c => {
      const s = series(c.id); const lim = Math.ceil(Math.max(median(s), recFloor(c.id)) / 500) * 500; const act = lastM.cats[c.id] || 0;
      const status = !lim ? (act ? 'over' : 'ok') : act > lim * 1.1 ? 'over' : 'ok';
      return { ...c, limit: lim, actual: act, avg: mean(s), total: sum(s), status, trend: s };
    }).filter(b => b.total > 0);

    const fixedMonthly = sum(recurring.filter(r => r.freq === 'Monthly').map(r => r.perMonth));
    const alerts = buildAlerts({ months, byMonth, forecast, recurring, budget, txns, fixedMonthly, curBal, series, last });

    return {
      months, byMonth, forecast, recurring, budget, alerts, curBal, hasBal, fixedMonthly,
      avgIn: mean(months.map(m => byMonth[m].in)), avgOut: mean(months.map(m => byMonth[m].out)),
      period: [txns[0].date, txns[txns.length - 1].date],
    };
  }

  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');

  function buildAlerts(a) {
    const out = [];
    for (const f of a.forecast) if (f.net < 0) {
      const big = f.notes[0];
      out.push({ level: 'critical', title: `${mLabel(f.m)}: expected shortfall of ${inr(-f.net)}`,
        body: `Likely outflow ${inr(f.out)} against inflow ${inr(f.in)}.` + (big ? ` ${big.payee} (${inr(big.amount)}, quarterly) falls due this month.` : '') + ' Hold back stock purchases or collect dues early.' });
    }
    if (a.curBal != null && a.fixedMonthly) {
      const low = a.forecast.reduce((m, f) => (f.endBal < m.endBal ? f : m), a.forecast[0]);
      if (low.endBal < a.fixedMonthly) out.push({ level: 'warning', title: `Balance may drop below one month of fixed costs`,
        body: `Projected ${inr(low.endBal)} at the end of ${mLabel(low.m)}. Your fixed monthly payments add up to ${inr(a.fixedMonthly)}.` });
    }
    const s = a.series('sales'); if (s.length >= 6) {
      const early = mean(s.slice(0, 3)), late = mean(s.slice(-3)); const ch = (late - early) / early;
      if (ch < -0.05) out.push({ level: 'warning', title: `Sales down ${Math.round(-ch * 100)}% in the last 3 months`, body: `Average ${inr(late)} a month, down from ${inr(early)}. The forecast uses the lower figure.` });
      else if (ch > 0.05) out.push({ level: 'good', title: `Sales up ${Math.round(ch * 100)}% in the last 3 months`, body: `Average ${inr(late)} a month, up from ${inr(early)}. The forecast still uses the lower long-run average.` });
    }
    const newRec = a.recurring.filter(r => r.freq === 'Monthly' && r.since >= a.last - 3 && r.since > a.months[0]);
    for (const r of newRec) out.push({ level: 'warning', title: `New monthly payment: ${r.payee}`, body: `${inr(r.amount)} every month since ${mLabel(r.since)}. It is included in every forecast month.` });
    const explained = new Set([...newRec.map(r => r.cat), ...a.recurring.filter(r => r.freq === 'Quarterly' && r.next - 3 === a.last).map(r => r.cat)]);
    for (const b of a.budget) if (b.status === 'over' && b.limit && !explained.has(b.id)) out.push({ level: 'warning', title: `${b.name} over the usual level`, body: `${inr(b.actual)} last month against a typical ${inr(b.limit)}.` });
    const pers = a.txns.filter(t => t.cat === 'personal');
    if (pers.length) out.push({ level: 'info', title: `${pers.length} personal payments from this account`, body: `${inr(sum(pers.map(t => t.amount)))} in total (food delivery, shopping, subscriptions). Keeping these in a separate account makes the business numbers cleaner.` });
    const ch = a.txns.filter(t => t.cat === 'charges');
    if (ch.length) out.push({ level: 'info', title: `Bank charges: ${inr(sum(ch.map(t => t.amount)))}`, body: `${ch.length} charges across the statement period. Ask your bank if a different account plan removes the QR rental or SMS fees.` });
    return out;
  }

  /* ---------- sample statement (fictional store) ---------- */
  function sampleRows() {
    let seed = 20260401; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const r = (a, b) => a + rnd() * (b - a);
    const ref = () => String(Math.floor(r(1e11, 9.99e11)));
    const season = { 3: 1.0, 4: 1.06, 5: 0.96, 6: 0.86, 7: 0.9, 8: 0.9 };
    const people = [['PRIYA DESHMUKH','priyad@oksbi'],['ROHIT JOSHI','rohitj99@ybl'],['SNEHA KULKARNI','snehak@okaxis'],['AMIT PATIL','9823011122@paytm'],['VIKRAM SHINDE','vikram.s@ibl'],['NEHA GOKHALE','nehag@okicici'],['SANJAY MORE','sanjaymore@ybl'],['POOJA JADHAV','poojaj@oksbi']];
    const rows = [];
    const add = (d, narr, dr, cr) => rows.push({ d, narr, dr: Math.round(dr * 100) / 100, cr: Math.round(cr * 100) / 100 });
    for (let mo = 3; mo <= 8; mo++) {
      const days = new Date(2026, mo + 1, 0).getDate(); const k = season[mo];
      for (let day = 1; day <= days; day++) {
        const d = new Date(2026, mo, day); const dow = d.getDay();
        add(d, `NEFT CR-YESB0000001-BHARATPE SETTLEMENT-SHARMA KIRANA-N${ref().slice(0, 9)}`, 0, r(5600, 8200) * k);
        const nUpi = Math.floor(r(1, 4));
        for (let j = 0; j < nUpi; j++) { const p = people[Math.floor(r(0, people.length))]; add(d, `UPI/CR/${ref()}/${p[0]}/${p[1]}/Payment from Ph`, 0, Math.round(r(80, 1600))); }
        if (dow === 1) add(d, `BY CASH DEPOSIT-CDM PUNE KOTHRUD-${ref().slice(0, 6)}`, 0, Math.round(r(26000, 40000) * k / 500) * 500);
        if (dow === 2 || dow === 5) add(d, `NEFT DR-HDFC0001432-SHREE GANESH DISTRIBUTORS-N${ref().slice(0, 9)}`, r(19000, 27000) * k, 0);
        if (dow === 4) add(d, `UPI/DR/${ref()}/AGARWAL TRADERS/agarwaltraders@okhdfcbank/Stock`, Math.round(r(11000, 17000) * k), 0);
        if (day === 1) { add(d, `UPI/DR/${ref()}/SURESH PAWAR/suresh.p@ybl/Salary ${d.toLocaleString('en', { month: 'short' })}`, 14000, 0); add(d, `UPI/DR/${ref()}/ANITA KAMBLE/anitak@ibl/Salary`, 12000, 0); }
        if (day === 5) add(d, `IMPS/P2A/${ref()}/RAMESH GUPTA/SBIN0011234/Shop rent`, 28000, 0);
        if (day === 7 && mo >= 6) add(d, `NACH DR/BAJAJ FINANCE LTD/ACH-DR-4501${Math.floor(r(1000, 9999))}`, 18500, 0);
        if (day === 10) add(d, `BILLDESK/MSEDCL ELECTRICITY/170012345678`, Math.round(r(5400, 6200) + (mo <= 5 ? 1600 : 0)), 0);
        if (day === 12) add(d, `UPI/DR/${ref()}/AIRTEL/airtelbroadband@paytm/Broadband`, 999, 0);
        if (day === 14) add(d, `NEFT DR-SBIN0000691-METRO CASH AND CARRY INDIA-N${ref().slice(0, 9)}`, r(28000, 36000) * k, 0);
        if (day === 15 && (mo === 5 || mo === 8)) add(d, `CBDT ADV TAX CHALLAN 280/${ref().slice(0, 8)}`, 24000, 0);
        if (day === 19) add(d, `GST PAYMENT CPIN 2604${ref()}/GSTN`, Math.round(r(6500, 9000)), 0);
        if (day === 22) add(d, `UPI/DR/${ref()}/NETFLIX/netflix@hdfcbank/Mandate`, 649, 0);
        if (day === 28) add(d, `CHRG:QR RENTAL ${d.toLocaleString('en', { month: 'short' }).toUpperCase()}26 INCL GST`, 354, 0);
        if ([3, 11, 17, 24].includes(day) && rnd() < 0.8) add(d, `UPI/DR/${ref()}/ZOMATO/zomato.order@hdfcbank/Order`, Math.round(r(280, 850)), 0);
        if (rnd() < 0.018) add(d, `UPI/DR/${ref()}/MYNTRA DESIGNS/myntra@icici/Order`, Math.round(r(1200, 3200)), 0);
        if ((day === 9 || day === 25) && rnd() < 0.75) add(d, `ATM WDL/ATM SBI KOTHRUD PUNE/${ref().slice(0, 6)}`, [5000, 8000, 10000][Math.floor(r(0, 3))], 0);
      }
      if (mo === 5 || mo === 8) add(new Date(2026, mo, days), `SMS ALERT CHRG ${mo === 5 ? 'APR-JUN' : 'JUL-SEP'}26`, 17.7, 0);
      if (mo === 5) add(new Date(2026, mo, days), `INT.PD:01-04-2026 TO 30-06-2026`, 0, 1184);
    }
    rows.sort((a, b) => a.d - b.d);
    let bal = 185000;
    const out = [['Sharma Kirana & General Store — Current Account XXXX4521'], ['Statement period 01/04/2026 to 30/09/2026'], [], ['Txn Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']];
    for (const x of rows) { bal += x.cr - x.dr; out.push([`${String(x.d.getDate()).padStart(2, '0')}/${String(x.d.getMonth() + 1).padStart(2, '0')}/2026`, x.narr, x.dr || '', x.cr || '', Math.round(bal * 100) / 100]); }
    return out;
  }

  return { EXP, INC, CAT, parseCSV, rowsToTxns, enrich, analyze, sampleRows, mLabel, mIdx, inr, detectRail, extractPayee };
})();
if (typeof module !== 'undefined') module.exports = Galla;
