/* ============================================================
   pin.top Marketing Intelligence Dashboard v2 — main logic
   ============================================================ */

(function() {

const D = window.PINTOP_DATA;
if (!D) { console.error('PINTOP_DATA not loaded'); return; }

// ============================================================
// PASSWORD GATE (SHA-256)
// ============================================================

// SHA-256 hash of password (set during build)
const PASS_HASH = '12a7b4e62b05275160ed3514efdf99212b70be04323199d26e184c7f10cffbb1';

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const KEY = 'pintop_dash_unlocked_v2';
function unlock() {
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  initApp();
}

async function tryGate() {
  const pwd = document.getElementById('gatePass').value;
  const h = await sha256(pwd);
  if (h === PASS_HASH) {
    sessionStorage.setItem(KEY, '1');
    unlock();
  } else {
    document.getElementById('gateErr').classList.add('show');
  }
}

document.getElementById('gateBtn').addEventListener('click', tryGate);
document.getElementById('gatePass').addEventListener('keypress', e => {
  if (e.key === 'Enter') tryGate();
});

if (sessionStorage.getItem(KEY) === '1') {
  unlock();
}

// ============================================================
// HELPERS
// ============================================================

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

const PALETTE = ['#06D6A0', '#7C3AED', '#BE1C9A', '#3B82F6', '#F59E0B', '#F87171', '#14b8a6', '#ec4899', '#84cc16', '#60a5fa', '#a78bfa', '#fb7185'];
const CHANNEL_COLORS = {
  'Direct': '#7C3AED', 'Organic Search': '#06D6A0', 'Paid Search': '#3B82F6',
  'Paid Social': '#BE1C9A', 'Paid Video': '#F59E0B', 'Organic Social': '#14b8a6',
  'Referral': '#60a5fa', 'Email': '#F87171', 'Display': '#84cc16',
  'Unassigned': '#666', 'Cross-network': '#a78bfa',
};

const fmtN = n => {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1) + 'k';
  return Math.round(n).toLocaleString('uk-UA');
};
const fmtUsd = n => '$' + (n == null ? 0 : n).toFixed(n >= 100 ? 0 : 2);
const fmtAed = n => 'AED ' + Math.round(n || 0).toLocaleString('uk-UA');
const fmtPct = n => (n == null ? 0 : n*100).toFixed(1) + '%';
const fmtDur = s => {
  if (!s) return '0с';
  if (s < 60) return s.toFixed(0) + 'с';
  return Math.floor(s/60) + 'м ' + Math.floor(s%60) + 'с';
};
const fmtDate = s => s.length === 8 ? s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8) : s;
const parseD = s => {
  if (s.length === 8) {
    return new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8));
  }
  return new Date(s);
};
const dateKey = d => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}${m}${dd}`;
};
const inRange = (dateStr, from, to) => {
  const d = parseD(dateStr);
  return d >= from && d <= to;
};

// ============================================================
// CHART.JS DEFAULTS
// ============================================================

if (window.Chart) {
  Chart.defaults.color = 'rgba(255,255,255,.65)';
  Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
  Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 12;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(20,20,20,.95)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,.12)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { size: 12, weight: '700' };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
}

const charts = {};
const destroy = id => { if (charts[id]) { charts[id].destroy(); delete charts[id]; } };

const gridScale = (extras = {}) => ({
  ticks: { color: 'rgba(255,255,255,.55)' },
  grid: { color: 'rgba(255,255,255,.04)', drawBorder: false },
  ...extras,
});

// ============================================================
// STATE
// ============================================================

const today = (() => {
  const max = D.ga4.daily.reduce((m, r) => r.d > m ? r.d : m, '20250101');
  return parseD(max);
})();

const state = {
  from: null, to: null, prevFrom: null, prevTo: null, period: '30',
  channel: '', scope: 'pintop', gscPeriod: '28d',
};

function setPeriodPreset(p) {
  state.period = p;
  let from, to = new Date(today);
  if (p === 'qtd') {
    const q = Math.floor(today.getMonth() / 3);
    from = new Date(today.getFullYear(), q*3, 1);
  } else if (p === 'ytd') {
    from = new Date(today.getFullYear(), 0, 1);
  } else {
    const days = +p;
    from = new Date(today);
    from.setDate(from.getDate() - days + 1);
  }
  const days = Math.round((to - from)/86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  state.from = from; state.to = to;
  state.prevFrom = prevFrom; state.prevTo = prevTo;
  renderAll();
}

function setCustom(fStr, tStr) {
  state.period = 'custom';
  state.from = new Date(fStr);
  state.to = new Date(tStr);
  const days = Math.round((state.to - state.from)/86400000) + 1;
  state.prevTo = new Date(state.from);
  state.prevTo.setDate(state.prevTo.getDate() - 1);
  state.prevFrom = new Date(state.prevTo);
  state.prevFrom.setDate(state.prevFrom.getDate() - days + 1);
  renderAll();
}

// ============================================================
// AGGREGATIONS
// ============================================================

function aggDaily(data, from, to) {
  const out = { sum: { s: 0, u: 0, nu: 0, c: 0 }, byDay: {} };
  data.forEach(r => {
    if (!inRange(r.d, from, to)) return;
    out.sum.s += r.s; out.sum.u += r.u; out.sum.nu += r.nu; out.sum.c += r.c;
    if (!out.byDay[r.d]) out.byDay[r.d] = { s: 0, u: 0, nu: 0, c: 0 };
    out.byDay[r.d].s += r.s; out.byDay[r.d].u += r.u;
    out.byDay[r.d].nu += r.nu; out.byDay[r.d].c += r.c;
  });
  return out;
}

function pickChannelsForPeriod() {
  const days = Math.round((state.to - state.from)/86400000) + 1;
  if (days <= 35) return D.ga4.channels_30d;
  if (days <= 100) return D.ga4.channels_90d;
  return D.ga4.channels_365d;
}

function aggGAdsDaily(from, to) {
  const out = { sum: { spend_usd: 0, spend_aed: 0, imp: 0, clk: 0, conv: 0 }, byDay: {} };
  D.gads.daily_90d.forEach(r => {
    if (!inRange(r.d, from, to)) return;
    out.sum.spend_usd += r.cost_usd; out.sum.spend_aed += r.cost_aed;
    out.sum.imp += r.imp; out.sum.clk += r.clk; out.sum.conv += r.conv;
    if (!out.byDay[r.d]) out.byDay[r.d] = { spend_usd: 0, spend_aed: 0, imp: 0, clk: 0, conv: 0 };
    out.byDay[r.d].spend_usd += r.cost_usd; out.byDay[r.d].spend_aed += r.cost_aed;
    out.byDay[r.d].imp += r.imp; out.byDay[r.d].clk += r.clk; out.byDay[r.d].conv += r.conv;
  });
  return out;
}

function aggTTDaily(from, to) {
  const out = { sum: { spend: 0, imp: 0, clk: 0, conv: 0 }, byDay: {} };
  (D.tiktok.daily_30d || []).forEach(r => {
    const dStr = (r.stat_time_day || r.date || '').replace(/-/g, '').slice(0, 8);
    if (!dStr || !inRange(dStr, from, to)) return;
    out.sum.spend += r.spend; out.sum.imp += r.imp;
    out.sum.clk += r.clk; out.sum.conv += r.conv;
    if (!out.byDay[dStr]) out.byDay[dStr] = { spend: 0, imp: 0, clk: 0, conv: 0 };
    out.byDay[dStr].spend += r.spend; out.byDay[dStr].imp += r.imp;
    out.byDay[dStr].clk += r.clk; out.byDay[dStr].conv += r.conv;
  });
  return out;
}

// ============================================================
// DELTA / KPI rendering
// ============================================================

function delta(cur, prv, invert = false) {
  if (!prv && !cur) return { txt: '—', cls: 'neutral', arr: '·' };
  if (!prv) return { txt: 'нове', cls: 'up', arr: '↑' };
  const d = (cur - prv) / prv * 100;
  const positive = (invert ? -d : d) > 0.5;
  const negative = (invert ? -d : d) < -0.5;
  return {
    txt: Math.abs(d).toFixed(1) + '%',
    cls: positive ? 'up' : negative ? 'down' : 'neutral',
    arr: d > 0 ? '↑' : d < 0 ? '↓' : '·',
  };
}

function kpiCard({ color, label, val, unit, sub, dlt }) {
  return `
    <div class="kpi ${color || 'green'}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-val">${val}${unit ? `<span class="kpi-unit">${unit}</span>` : ''}</div>
      ${dlt ? `<div class="kpi-delta ${dlt.cls}"><span class="ic">${dlt.arr}</span>${dlt.txt} <span class="muted" style="font-weight:500;margin-left:4px;">vs попер.</span></div>` : ''}
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>`;
}

// ============================================================
// OVERVIEW
// ============================================================

function renderOverview() {
  const cur = aggDaily(D.ga4.daily, state.from, state.to);
  const prv = aggDaily(D.ga4.daily, state.prevFrom, state.prevTo);

  // KPI row
  const channels = pickChannelsForPeriod();
  const totalCh = channels.reduce((a,c)=>a+c.s,0);
  const paidSpend = aggGAdsDaily(state.from, state.to).sum.spend_usd
                  + aggTTDaily(state.from, state.to).sum.spend;
  const paidConv = aggGAdsDaily(state.from, state.to).sum.conv
                 + aggTTDaily(state.from, state.to).sum.conv;
  const blendedCpl = paidConv ? paidSpend / paidConv : 0;
  const gscClicks28 = D.gsc.queries_28d.reduce((a,q)=>a+q.clk,0);

  $('kpiOverview').innerHTML = [
    kpiCard({ color: 'green', label: 'Сесії', val: fmtN(cur.sum.s), dlt: delta(cur.sum.s, prv.sum.s) }),
    kpiCard({ color: 'purple', label: 'Активні юзери', val: fmtN(cur.sum.u), dlt: delta(cur.sum.u, prv.sum.u) }),
    kpiCard({ color: 'pink', label: 'Нові юзери', val: fmtN(cur.sum.nu), dlt: delta(cur.sum.nu, prv.sum.nu) }),
    kpiCard({ color: 'blue', label: 'Конв. (event count)', val: fmtN(cur.sum.c), dlt: delta(cur.sum.c, prv.sum.c) }),
    kpiCard({ color: 'amber', label: 'Paid spend', val: fmtUsd(paidSpend), unit: 'USD', sub: 'Google Ads + TikTok' }),
    kpiCard({ color: 'teal', label: 'Blended CPL', val: blendedCpl ? fmtUsd(blendedCpl) : '—', sub: paidConv ? `${fmtN(paidConv)} конв` : 'немає конв' }),
    kpiCard({ color: 'green', label: 'Organic clicks (GSC)', val: fmtN(gscClicks28), sub: '28 днів, GSC' }),
    kpiCard({ color: 'purple', label: 'Сесій / юзер', val: cur.sum.u ? (cur.sum.s/cur.sum.u).toFixed(2) : '—', sub: 'глибина залучення' }),
  ].join('');

  // Insights
  $('overviewInsights').innerHTML = buildOverviewInsights(cur, prv, paidSpend, paidConv);

  // Trend chart
  const days = Object.keys(cur.byDay).sort();
  const labels = days.map(d => d.slice(4,6)+'.'+d.slice(6,8));
  $('trendRange').textContent = days.length ? `${fmtDate(days[0])} → ${fmtDate(days[days.length-1])}` : '';
  destroy('overviewTrend');
  charts.overviewTrend = new Chart($('overviewTrend'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Сесії', data: days.map(d => cur.byDay[d].s), borderColor: '#06D6A0', backgroundColor: 'rgba(6,214,160,.1)', tension: .3, fill: true, yAxisID: 'y' },
        { label: 'Нові юзери', data: days.map(d => cur.byDay[d].nu), borderColor: '#7C3AED', backgroundColor: 'transparent', tension: .3, yAxisID: 'y', borderDash: [3,3] },
        { label: 'Конверсії', data: days.map(d => cur.byDay[d].c), borderColor: '#F59E0B', backgroundColor: 'transparent', tension: .3, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: gridScale({ ticks: { color: 'rgba(255,255,255,.55)', maxTicksLimit: 14 } }),
        y: gridScale({ position: 'left', title: { display: true, text: 'Sessions / Users', color: 'rgba(255,255,255,.55)' } }),
        y1: gridScale({ position: 'right', title: { display: true, text: 'Conversions', color: '#F59E0B' }, grid: { drawOnChartArea: false } }),
      },
    },
  });

  // Channels donut
  const chData = channels.filter(c => c.s > 0).sort((a,b) => b.s - a.s);
  destroy('overviewChannels');
  charts.overviewChannels = new Chart($('overviewChannels'), {
    type: 'doughnut',
    data: {
      labels: chData.map(c => c.ch),
      datasets: [{
        data: chData.map(c => c.s),
        backgroundColor: chData.map(c => CHANNEL_COLORS[c.ch] || '#888'),
        borderColor: '#141414', borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 8, padding: 8, font: { size: 11 } } } },
      cutout: '62%',
    },
  });

  // Paid spend chart
  const gd = aggGAdsDaily(state.from, state.to);
  const td = aggTTDaily(state.from, state.to);
  const allDays = Array.from(new Set([...Object.keys(gd.byDay), ...Object.keys(td.byDay)])).sort();
  destroy('overviewPaidSpend');
  charts.overviewPaidSpend = new Chart($('overviewPaidSpend'), {
    type: 'bar',
    data: {
      labels: allDays.map(d => d.slice(4,6)+'.'+d.slice(6,8)),
      datasets: [
        { label: 'Google Ads (USD)', data: allDays.map(d => (gd.byDay[d]||{}).spend_usd || 0), backgroundColor: '#3B82F6', stack: 'spend' },
        { label: 'TikTok (USD)', data: allDays.map(d => (td.byDay[d]||{}).spend || 0), backgroundColor: '#BE1C9A', stack: 'spend' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: gridScale({ ticks: { maxTicksLimit: 14 } }),
        y: gridScale({ stacked: true, ticks: { callback: v => '$' + v } }),
      },
      plugins: { legend: { position: 'top' } },
    },
  });

  // Top sources
  const utmSorted = D.ga4.utm.slice().sort((a,b) => b.s - a.s).slice(0, 12);
  $('overviewSources').querySelector('tbody').innerHTML = utmSorted.map(u => `
    <tr>
      <td><b>${u.src}</b> / ${u.med}</td>
      <td><span class="badge gray">${u.camp.length > 30 ? u.camp.slice(0,30)+'…' : u.camp}</span></td>
      <td class="num">${fmtN(u.s)}</td>
      <td class="num">${fmtN(u.nu)}</td>
      <td class="num">${fmtN(u.c)}</td>
      <td class="num">${u.s ? fmtPct(u.c/u.s) : '—'}</td>
    </tr>`).join('');

  // Monthly chart
  const monthly = D.ga4.monthly.slice().sort((a,b) => (a.y+a.m).localeCompare(b.y+b.m)).slice(-12);
  destroy('overviewMonthly');
  charts.overviewMonthly = new Chart($('overviewMonthly'), {
    type: 'bar',
    data: {
      labels: monthly.map(r => r.y + '-' + r.m),
      datasets: [
        { label: 'Сесії', data: monthly.map(r => r.s), backgroundColor: '#06D6A0' },
        { label: 'Нові юзери', data: monthly.map(r => r.nu), backgroundColor: '#7C3AED' },
        { label: 'Конверсії', data: monthly.map(r => r.c), type: 'line', borderColor: '#F59E0B', backgroundColor: '#F59E0B', tension: .3, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: gridScale(), y: gridScale(),
        y1: gridScale({ position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#F59E0B' } }),
      },
      plugins: { legend: { position: 'top' } },
    },
  });

  // YoY chart
  const yoyMap = {};
  D.ga4.yoy.forEach(r => {
    if (!yoyMap[r.m]) yoyMap[r.m] = {};
    yoyMap[r.m][r.period] = r.s;
  });
  const months = Object.keys(yoyMap).sort();
  destroy('overviewYoY');
  charts.overviewYoY = new Chart($('overviewYoY'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Last year', data: months.map(m => yoyMap[m]['last_year'] || 0), backgroundColor: 'rgba(124,58,237,.4)' },
        { label: 'This year', data: months.map(m => yoyMap[m]['this_year'] || 0), backgroundColor: '#06D6A0' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale() },
      plugins: { legend: { position: 'top' } },
    },
  });

  $('overviewSubtitle').textContent = `Період ${fmtDate(dateKey(state.from))} → ${fmtDate(dateKey(state.to))} · GA4 scope: pin.top тільки`;
}

function buildOverviewInsights(cur, prv, paidSpend, paidConv) {
  const items = [];

  // Insight 1: Paid contribution
  const channels = pickChannelsForPeriod();
  const paidSocial = (channels.find(c => c.ch === 'Paid Social') || {}).s || 0;
  const paidSearch = (channels.find(c => c.ch === 'Paid Search') || {}).s || 0;
  const totalSess = channels.reduce((a,c)=>a+c.s,0);
  const paidShare = totalSess ? ((paidSocial + paidSearch) / totalSess * 100).toFixed(1) : 0;
  items.push({
    cls: paidShare > 5 ? 'good' : 'warn', ic: '💰',
    t1: 'Paid traffic share',
    t2: `Платний трафік дав <b>${paidShare}%</b> сесій. Spend $${paidSpend.toFixed(0)} → ${paidConv} конверсій. CPL $${paidConv ? (paidSpend/paidConv).toFixed(2) : '—'}.`,
  });

  // Insight 2: Growth vs previous period
  const grow = prv.sum.s ? ((cur.sum.s - prv.sum.s)/prv.sum.s * 100).toFixed(1) : null;
  if (grow != null) {
    items.push({
      cls: grow > 0 ? 'good' : 'bad', ic: grow > 0 ? '📈' : '📉',
      t1: 'Period over period',
      t2: `Сесії <b>${grow > 0 ? '+' : ''}${grow}%</b> до попереднього періоду. Конверсії ${prv.sum.c ? (((cur.sum.c-prv.sum.c)/prv.sum.c*100).toFixed(1) + '%') : 'нові'}.`,
    });
  }

  // Insight 3: New user share
  const nuShare = cur.sum.u ? (cur.sum.nu/cur.sum.u*100).toFixed(0) : 0;
  items.push({
    cls: nuShare > 70 ? 'warn' : 'good', ic: '🆕',
    t1: 'Якість аудиторії',
    t2: `<b>${nuShare}%</b> — частка нових юзерів. ${nuShare > 80 ? 'Дуже високий — холодний трафік, низька повторна вовлеченість.' : nuShare > 60 ? 'Норма для активних запусків.' : 'Багато повертаються — продукт тримає.'}`,
  });

  return items.map(it => `
    <div class="insight ${it.cls}" data-ic="${it.ic}">
      <div class="t1">${it.t1}</div>
      <div class="t2">${it.t2}</div>
    </div>`).join('');
}

// ============================================================
// PAID
// ============================================================

function renderPaid() {
  const gd = aggGAdsDaily(state.from, state.to);
  const td = aggTTDaily(state.from, state.to);
  const totalSpend = gd.sum.spend_usd + td.sum.spend;
  const totalClk = gd.sum.clk + td.sum.clk;
  const totalConv = gd.sum.conv + td.sum.conv;
  const blendedCpl = totalConv ? totalSpend / totalConv : 0;

  $('kpiPaid').innerHTML = [
    kpiCard({ color: 'green', label: 'Total paid spend', val: fmtUsd(totalSpend), unit: 'USD', sub: 'Google + TikTok' }),
    kpiCard({ color: 'blue', label: 'Total clicks', val: fmtN(totalClk) }),
    kpiCard({ color: 'amber', label: 'Total conversions', val: fmtN(totalConv) }),
    kpiCard({ color: 'pink', label: 'Blended CPL', val: blendedCpl ? fmtUsd(blendedCpl) : '—', sub: blendedCpl ? `${fmtN(totalConv)} конв` : '' }),
  ].join('');

  // Paid cards
  $('paidCards').innerHTML = `
    <div class="paid-card google">
      <div class="paid-head"><div class="paid-logo">G</div>
        <div><div class="paid-name">Google Ads</div><div class="paid-sub">Customer 3651749366 · AED → USD</div></div>
        <span class="status-pill live" style="margin-left:auto;">live</span>
      </div>
      <div class="paid-metric-row">
        <div class="paid-metric"><div class="l">Spend</div><div class="v">${fmtUsd(gd.sum.spend_usd)} <small>(${fmtAed(gd.sum.spend_aed)})</small></div></div>
        <div class="paid-metric"><div class="l">Imp</div><div class="v">${fmtN(gd.sum.imp)}</div></div>
        <div class="paid-metric"><div class="l">Clicks</div><div class="v">${fmtN(gd.sum.clk)}</div></div>
        <div class="paid-metric"><div class="l">CTR</div><div class="v">${gd.sum.imp ? fmtPct(gd.sum.clk/gd.sum.imp) : '—'}</div></div>
        <div class="paid-metric"><div class="l">CPC USD</div><div class="v">${gd.sum.clk ? fmtUsd(gd.sum.spend_usd/gd.sum.clk) : '—'}</div></div>
        <div class="paid-metric"><div class="l">Conv</div><div class="v">${fmtN(gd.sum.conv)}</div></div>
        <div class="paid-metric"><div class="l">CPA</div><div class="v">${gd.sum.conv ? fmtUsd(gd.sum.spend_usd/gd.sum.conv) : '—'}</div></div>
        <div class="paid-metric"><div class="l">% spend</div><div class="v">${totalSpend ? ((gd.sum.spend_usd/totalSpend)*100).toFixed(0)+'%' : '—'}</div></div>
      </div>
    </div>
    <div class="paid-card tiktok">
      <div class="paid-head"><div class="paid-logo">♪</div>
        <div><div class="paid-name">TikTok Ads</div><div class="paid-sub">Adv 7587396752228171783 · USD</div></div>
        <span class="status-pill live" style="margin-left:auto;">live</span>
      </div>
      <div class="paid-metric-row">
        <div class="paid-metric"><div class="l">Spend</div><div class="v">${fmtUsd(td.sum.spend)}</div></div>
        <div class="paid-metric"><div class="l">Imp</div><div class="v">${fmtN(td.sum.imp)}</div></div>
        <div class="paid-metric"><div class="l">Clicks</div><div class="v">${fmtN(td.sum.clk)}</div></div>
        <div class="paid-metric"><div class="l">CTR</div><div class="v">${td.sum.imp ? fmtPct(td.sum.clk/td.sum.imp) : '—'}</div></div>
        <div class="paid-metric"><div class="l">CPC</div><div class="v">${td.sum.clk ? fmtUsd(td.sum.spend/td.sum.clk) : '—'}</div></div>
        <div class="paid-metric"><div class="l">Conv</div><div class="v">${fmtN(td.sum.conv)}</div></div>
        <div class="paid-metric"><div class="l">CPL</div><div class="v">${td.sum.conv ? fmtUsd(td.sum.spend/td.sum.conv) : '—'}</div></div>
        <div class="paid-metric"><div class="l">% spend</div><div class="v">${totalSpend ? ((td.sum.spend/totalSpend)*100).toFixed(0)+'%' : '—'}</div></div>
      </div>
    </div>
    <div class="paid-card meta">
      <div class="paid-head"><div class="paid-logo">M</div>
        <div><div class="paid-name">Meta Ads</div><div class="paid-sub">GA4 only · API pending</div></div>
        <span class="status-pill limited" style="margin-left:auto;">limited</span>
      </div>
      <div class="paid-metric-row">
        <div class="paid-metric"><div class="l">Spend</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">Imp</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">Clicks</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">CTR</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">Сесії GA4</div><div class="v">${fmtN(D.meta.utm_90d.reduce((a,r)=>a+r.s,0))}</div></div>
        <div class="paid-metric"><div class="l">Нові</div><div class="v">${fmtN(D.meta.utm_90d.reduce((a,r)=>a+r.nu,0))}</div></div>
        <div class="paid-metric"><div class="l">Conv GA4</div><div class="v">${fmtN(D.meta.utm_90d.reduce((a,r)=>a+r.c,0))}</div></div>
        <div class="paid-metric"><div class="l">Status</div><div class="v" style="font-size:13px;color:var(--amber);">API ↩</div></div>
      </div>
    </div>
  `;

  // Spend chart
  const days = Array.from(new Set([...Object.keys(gd.byDay), ...Object.keys(td.byDay)])).sort();
  destroy('paidSpendChart');
  charts.paidSpendChart = new Chart($('paidSpendChart'), {
    type: 'line',
    data: {
      labels: days.map(d => d.slice(4,6)+'.'+d.slice(6,8)),
      datasets: [
        { label: 'Google Ads', data: days.map(d => (gd.byDay[d]||{}).spend_usd || 0), borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,.15)', tension: .3, fill: true },
        { label: 'TikTok', data: days.map(d => (td.byDay[d]||{}).spend || 0), borderColor: '#BE1C9A', backgroundColor: 'rgba(190,28,154,.15)', tension: .3, fill: true },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale({ ticks: { callback: v => '$' + v } }) },
    },
  });

  // GA4 sessions paid
  const paidUtm = D.ga4.utm.filter(u => u.med === 'cpc');
  const grouped = {};
  paidUtm.forEach(u => {
    const src = u.src;
    if (!grouped[src]) grouped[src] = 0;
    grouped[src] += u.s;
  });
  destroy('paidSessionsChart');
  charts.paidSessionsChart = new Chart($('paidSessionsChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(grouped),
      datasets: [{
        label: 'Сесії GA4 (90d)',
        data: Object.values(grouped),
        backgroundColor: ['#3B82F6', '#BE1C9A', '#F59E0B', '#06D6A0'],
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: gridScale(), y: gridScale() }, plugins: { legend: { display: false } } },
  });

  // Cross-channel
  const ga4PaidGoogle = D.ga4.utm.filter(u => u.src === 'google' && u.med === 'cpc').reduce((a,r) => ({s:a.s+r.s, c:a.c+r.c}), {s:0,c:0});
  const ga4PaidTikTok = D.ga4.utm.filter(u => u.src === 'tiktok' && u.med === 'cpc').reduce((a,r) => ({s:a.s+r.s, c:a.c+r.c}), {s:0,c:0});
  const ga4PaidMeta = D.ga4.utm.filter(u => (u.src === 'meta' || u.src === 'facebook') && u.med === 'cpc').reduce((a,r) => ({s:a.s+r.s, c:a.c+r.c}), {s:0,c:0});

  $('paidCrossTable').querySelector('tbody').innerHTML = `
    <tr>
      <td><b>Google Ads</b> <span class="badge blue">live</span></td>
      <td><span class="status-pill live">active</span></td>
      <td class="num">${fmtUsd(gd.sum.spend_usd)}</td>
      <td class="num">${fmtN(gd.sum.imp)}</td>
      <td class="num">${fmtN(gd.sum.clk)}</td>
      <td class="num">${gd.sum.imp ? fmtPct(gd.sum.clk/gd.sum.imp) : '—'}</td>
      <td class="num">${gd.sum.clk ? fmtUsd(gd.sum.spend_usd/gd.sum.clk) : '—'}</td>
      <td class="num">${fmtN(gd.sum.conv)}</td>
      <td class="num">${gd.sum.conv ? fmtUsd(gd.sum.spend_usd/gd.sum.conv) : '—'}</td>
      <td class="num">${fmtN(ga4PaidGoogle.s)} <span class="muted">(90d)</span></td>
      <td class="num">${fmtN(ga4PaidGoogle.c)}</td>
    </tr>
    <tr>
      <td><b>TikTok Ads</b> <span class="badge pink">live</span></td>
      <td><span class="status-pill live">active</span></td>
      <td class="num">${fmtUsd(td.sum.spend)}</td>
      <td class="num">${fmtN(td.sum.imp)}</td>
      <td class="num">${fmtN(td.sum.clk)}</td>
      <td class="num">${td.sum.imp ? fmtPct(td.sum.clk/td.sum.imp) : '—'}</td>
      <td class="num">${td.sum.clk ? fmtUsd(td.sum.spend/td.sum.clk) : '—'}</td>
      <td class="num">${fmtN(td.sum.conv)}</td>
      <td class="num">${td.sum.conv ? fmtUsd(td.sum.spend/td.sum.conv) : '—'}</td>
      <td class="num">${fmtN(ga4PaidTikTok.s)} <span class="muted">(90d)</span></td>
      <td class="num">${fmtN(ga4PaidTikTok.c)}</td>
    </tr>
    <tr>
      <td><b>Meta Ads</b> <span class="badge amber">limited</span></td>
      <td><span class="status-pill limited">GA4 only</span></td>
      <td class="num muted">—</td>
      <td class="num muted">—</td>
      <td class="num muted">—</td>
      <td class="num muted">—</td>
      <td class="num muted">—</td>
      <td class="num muted">—</td>
      <td class="num muted">—</td>
      <td class="num">${fmtN(ga4PaidMeta.s)} <span class="muted">(90d)</span></td>
      <td class="num">${fmtN(ga4PaidMeta.c)}</td>
    </tr>
  `;
}

// ============================================================
// GOOGLE ADS
// ============================================================

function renderGads() {
  const c30 = D.gads.campaigns_30d;
  const totalSpendUsd = c30.reduce((a,c)=>a+c.cost_usd,0);
  const totalSpendAed = c30.reduce((a,c)=>a+c.cost_aed,0);
  const totalImp = c30.reduce((a,c)=>a+c.imp,0);
  const totalClk = c30.reduce((a,c)=>a+c.clk,0);
  const totalConv = c30.reduce((a,c)=>a+c.conv,0);
  const avgIs = c30.filter(c=>c.is>0).reduce((a,c,i,arr)=>a+c.is/arr.length,0);
  const ctr = totalImp ? totalClk/totalImp : 0;
  const cpcUsd = totalClk ? totalSpendUsd/totalClk : 0;

  $('kpiGads').innerHTML = [
    kpiCard({ color: 'green', label: 'Spend USD', val: fmtUsd(totalSpendUsd), sub: fmtAed(totalSpendAed) }),
    kpiCard({ color: 'purple', label: 'Кампаній', val: c30.filter(c=>c.cost_usd>0).length, sub: `${c30.length} всього` }),
    kpiCard({ color: 'blue', label: 'Кліків', val: fmtN(totalClk), sub: fmtN(totalImp) + ' імп' }),
    kpiCard({ color: 'amber', label: 'CTR', val: fmtPct(ctr) }),
    kpiCard({ color: 'pink', label: 'Avg CPC', val: fmtUsd(cpcUsd), sub: 'USD' }),
    kpiCard({ color: 'teal', label: 'Avg Imp Share', val: fmtPct(avgIs), sub: 'Search кампанії' }),
  ].join('');

  // Daily spend chart
  const daily = D.gads.daily_90d.slice().sort((a,b) => a.d.localeCompare(b.d));
  destroy('gadsDaily');
  charts.gadsDaily = new Chart($('gadsDaily'), {
    type: 'bar',
    data: {
      labels: daily.map(d => d.d.slice(4,6)+'.'+d.d.slice(6,8)),
      datasets: [
        { label: 'Spend USD', data: daily.map(d => d.cost_usd), backgroundColor: '#3B82F6', yAxisID: 'y' },
        { label: 'Spend AED', data: daily.map(d => d.cost_aed), type: 'line', borderColor: 'rgba(124,58,237,.5)', borderDash: [3,3], yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index' },
      scales: {
        x: gridScale({ ticks: { maxTicksLimit: 14 } }),
        y: gridScale({ ticks: { callback: v => '$' + v } }),
        y1: gridScale({ position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => 'AED ' + v } }),
      },
    },
  });

  // Conv trend
  destroy('gadsConvTrend');
  charts.gadsConvTrend = new Chart($('gadsConvTrend'), {
    type: 'line',
    data: {
      labels: daily.map(d => d.d.slice(4,6)+'.'+d.d.slice(6,8)),
      datasets: [
        { label: 'Кліки', data: daily.map(d => d.clk), borderColor: '#06D6A0', backgroundColor: 'rgba(6,214,160,.1)', tension: .3, fill: true, yAxisID: 'y' },
        { label: 'Конверсії', data: daily.map(d => d.conv), borderColor: '#F59E0B', backgroundColor: 'transparent', tension: .3, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale(), y1: gridScale({ position: 'right', grid: { drawOnChartArea: false } }) },
    },
  });

  // Campaigns table with drill-down
  const tbody = $('gadsCampTable').querySelector('tbody');
  tbody.innerHTML = c30.sort((a,b)=>b.cost_usd-a.cost_usd).map((c, i) => {
    const cls = c.cost_usd > 0 ? 'row-clickable' : '';
    return `
      <tr class="${cls}" data-cid="${c.id}">
        <td><span class="row-expand">▸</span></td>
        <td><b>${c.name}</b></td>
        <td><span class="badge gray">${c.type}</span></td>
        <td><span class="status-pill ${c.status === 'ENABLED' ? 'live' : c.status === 'PAUSED' ? 'paused' : 'off'}">${c.status}</span></td>
        <td class="num"><b>${fmtUsd(c.cost_usd)}</b></td>
        <td class="num muted">${fmtAed(c.cost_aed)}</td>
        <td class="num">${fmtN(c.imp)}</td>
        <td class="num">${fmtN(c.clk)}</td>
        <td class="num">${fmtPct(c.ctr)}</td>
        <td class="num">${c.clk ? fmtUsd(c.cost_usd/c.clk) : '—'}</td>
        <td class="num">${fmtN(c.conv)}</td>
        <td class="num">${c.conv ? fmtUsd(c.cost_usd/c.conv) : '—'}</td>
        <td class="num">${c.is ? fmtPct(c.is) : '—'}</td>
      </tr>`;
  }).join('');

  // Click → expand ad groups
  tbody.querySelectorAll('.row-clickable').forEach(row => {
    row.addEventListener('click', e => {
      const cid = row.dataset.cid;
      const exp = row.querySelector('.row-expand');
      const next = row.nextElementSibling;
      if (next && next.classList.contains('drill-row')) {
        next.remove();
        exp.classList.remove('open');
        return;
      }
      const ags = D.gads.ad_groups_30d.filter(a => a.campaign_id === cid && a.cost_usd > 0)
                 .sort((a,b) => b.cost_usd - a.cost_usd);
      if (!ags.length) return;
      const drill = document.createElement('tr');
      drill.className = 'drill-row';
      drill.innerHTML = `
        <td colspan="13" style="padding:0;">
          <table class="t" style="margin:0;">
            <thead><tr>
              <th style="padding-left:36px;">Ad Group</th>
              <th class="num">Spend USD</th><th class="num">Imp</th>
              <th class="num">Clk</th><th class="num">Conv</th><th class="num">CPA USD</th>
            </tr></thead>
            <tbody>
              ${ags.map(a => `
                <tr>
                  <td style="padding-left:36px;color:var(--text-secondary);">${a.name}</td>
                  <td class="num">${fmtUsd(a.cost_usd)}</td>
                  <td class="num">${fmtN(a.imp)}</td>
                  <td class="num">${fmtN(a.clk)}</td>
                  <td class="num">${fmtN(a.conv)}</td>
                  <td class="num">${a.conv ? fmtUsd(a.cost_usd/a.conv) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </td>`;
      row.after(drill);
      exp.classList.add('open');
    });
  });

  // Top keywords
  $('gadsKwTable').querySelector('tbody').innerHTML = D.gads.keywords_30d.slice(0, 50).map(k => `
    <tr>
      <td class="mono" title="${k.kw}">${k.kw.length > 35 ? k.kw.slice(0,35)+'…' : k.kw}</td>
      <td><span class="badge gray">${k.mt}</span></td>
      <td class="num">${fmtUsd(k.cost_usd)}</td>
      <td class="num">${fmtN(k.imp)}</td>
      <td class="num">${fmtN(k.clk)}</td>
      <td class="num">${fmtPct(k.ctr)}</td>
      <td class="num">${fmtN(k.conv)}</td>
    </tr>`).join('');

  // Top ads
  $('gadsAdsTable').querySelector('tbody').innerHTML = D.gads.ads_30d.slice(0, 30).map(a => `
    <tr>
      <td title="${a.headline}">${a.headline.length > 45 ? a.headline.slice(0,45)+'…' : a.headline}</td>
      <td class="muted" title="${a.camp}">${a.camp.length > 20 ? a.camp.slice(0,20)+'…' : a.camp}</td>
      <td class="num">${fmtUsd(a.cost_usd)}</td>
      <td class="num">${fmtN(a.imp)}</td>
      <td class="num">${fmtN(a.clk)}</td>
      <td class="num">${fmtN(a.conv)}</td>
    </tr>`).join('');
}

// ============================================================
// TIKTOK
// ============================================================

function renderTikTok() {
  const camps = D.tiktok.campaigns_30d || [];
  const ads = D.tiktok.ads_30d || [];
  const ags = D.tiktok.ad_groups_30d || [];
  const camplist = D.tiktok.campaigns_list || [];
  const adslist = D.tiktok.ads_list || [];

  const totalSpend = camps.reduce((a,c)=>a+c.spend,0);
  const totalImp = camps.reduce((a,c)=>a+c.imp,0);
  const totalClk = camps.reduce((a,c)=>a+c.clk,0);
  const totalConv = camps.reduce((a,c)=>a+c.conv,0);
  const ctr = totalImp ? totalClk/totalImp : 0;
  const cpc = totalClk ? totalSpend/totalClk : 0;
  const cpl = totalConv ? totalSpend/totalConv : 0;
  const activeCamps = camplist.filter(c => c.status && c.status.includes('ENABLE')).length;

  $('kpiTikTok').innerHTML = [
    kpiCard({ color: 'pink', label: 'Spend USD', val: fmtUsd(totalSpend), sub: '30 днів' }),
    kpiCard({ color: 'green', label: 'Кампаній active', val: activeCamps, sub: `${camplist.length} всього` }),
    kpiCard({ color: 'blue', label: 'Кліків', val: fmtN(totalClk), sub: fmtN(totalImp) + ' імп' }),
    kpiCard({ color: 'amber', label: 'CTR', val: fmtPct(ctr) }),
    kpiCard({ color: 'purple', label: 'CPC', val: cpc ? fmtUsd(cpc) : '—' }),
    kpiCard({ color: 'teal', label: 'CPL', val: cpl ? fmtUsd(cpl) : '—', sub: `${fmtN(totalConv)} конв` }),
  ].join('');

  // Daily spend
  const daily = (D.tiktok.daily_30d || []).slice().sort((a,b) => (a.stat_time_day || '').localeCompare(b.stat_time_day || ''));
  destroy('ttDaily');
  charts.ttDaily = new Chart($('ttDaily'), {
    type: 'bar',
    data: {
      labels: daily.map(d => (d.stat_time_day || '').slice(5)),
      datasets: [{ label: 'Spend USD', data: daily.map(d => d.spend), backgroundColor: '#BE1C9A' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale({ ticks: { maxTicksLimit: 14 } }), y: gridScale({ ticks: { callback: v => '$' + v } }) },
      plugins: { legend: { display: false } },
    },
  });

  destroy('ttConvTrend');
  charts.ttConvTrend = new Chart($('ttConvTrend'), {
    type: 'line',
    data: {
      labels: daily.map(d => (d.stat_time_day || '').slice(5)),
      datasets: [
        { label: 'Конверсії', data: daily.map(d => d.conv), borderColor: '#06D6A0', backgroundColor: 'rgba(6,214,160,.1)', tension: .3, fill: true, yAxisID: 'y' },
        { label: 'CPA USD', data: daily.map(d => d.cpa), borderColor: '#F59E0B', backgroundColor: 'transparent', tension: .3, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale(), y1: gridScale({ position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => '$' + v } }) },
    },
  });

  // Campaign table — match by id from list
  const camp_by_id = {};
  camplist.forEach(c => { camp_by_id[c.id] = c; });

  const tbody = $('ttCampTable').querySelector('tbody');
  tbody.innerHTML = camps.sort((a,b)=>b.spend-a.spend).map(c => {
    const cId = String(c.campaign_id);
    const meta = camp_by_id[cId] || {};
    return `
      <tr class="row-clickable" data-cid="${cId}">
        <td><span class="row-expand">▸</span></td>
        <td><b>${meta.name || c.campaign_name || cId}</b></td>
        <td><span class="status-pill ${(meta.status||'').includes('ENABLE') ? 'live' : (meta.status||'').includes('DISABLE') ? 'paused' : 'limited'}">${(meta.status||'—').replace('STATUS_','').replace('_','-')}</span></td>
        <td class="muted">${meta.objective || '—'}</td>
        <td class="num"><b>${fmtUsd(c.spend)}</b></td>
        <td class="num">${fmtN(c.imp)}</td>
        <td class="num">${fmtN(c.clk)}</td>
        <td class="num">${fmtPct(c.ctr/100)}</td>
        <td class="num">${c.cpc ? fmtUsd(c.cpc) : '—'}</td>
        <td class="num">${fmtN(c.conv)}</td>
        <td class="num">${c.conv ? fmtUsd(c.spend/c.conv) : '—'}</td>
      </tr>`;
  }).join('');

  // Drill-down
  tbody.querySelectorAll('.row-clickable').forEach(row => {
    row.addEventListener('click', e => {
      const cid = row.dataset.cid;
      const exp = row.querySelector('.row-expand');
      const next = row.nextElementSibling;
      if (next && next.classList.contains('drill-row')) {
        next.remove(); exp.classList.remove('open'); return;
      }
      const groups = ags.filter(a => String(a.campaign_id) === cid)
                       .sort((a,b) => b.spend - a.spend);
      if (!groups.length) return;
      const drill = document.createElement('tr');
      drill.className = 'drill-row';
      drill.innerHTML = `
        <td colspan="11" style="padding:0;">
          <table class="t" style="margin:0;">
            <thead><tr>
              <th style="padding-left:36px;">Ad Group</th>
              <th class="num">Spend</th><th class="num">Imp</th>
              <th class="num">Clk</th><th class="num">CTR</th>
              <th class="num">Conv</th><th class="num">CPL</th>
            </tr></thead>
            <tbody>
              ${groups.map(g => `
                <tr>
                  <td style="padding-left:36px;color:var(--text-secondary);">${g.adgroup_name || g.adgroup_id}</td>
                  <td class="num">${fmtUsd(g.spend)}</td>
                  <td class="num">${fmtN(g.imp)}</td>
                  <td class="num">${fmtN(g.clk)}</td>
                  <td class="num">${fmtPct(g.ctr/100)}</td>
                  <td class="num">${fmtN(g.conv)}</td>
                  <td class="num">${g.conv ? fmtUsd(g.spend/g.conv) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </td>`;
      row.after(drill);
      exp.classList.add('open');
    });
  });

  // Top ads (with item_id from list)
  const ad_meta = {};
  adslist.forEach(a => { ad_meta[a.id] = a; });
  $('ttAdsTable').querySelector('tbody').innerHTML = ads.sort((a,b)=>b.conv-a.conv).slice(0,30).map(a => {
    const m = ad_meta[String(a.ad_id)] || {};
    const itemId = m.item_id || '—';
    return `
      <tr>
        <td title="${m.name || a.ad_id}">${(m.name || a.ad_id || '').slice(0,35)}</td>
        <td class="mono">${itemId !== '—' ? `<a href="https://www.tiktok.com/@mypintop_ua/video/${itemId}" target="_blank" style="color:var(--green);text-decoration:underline;">${itemId.slice(-8)}</a>` : '—'}</td>
        <td class="muted" title="${a.campaign_name || ''}">${(a.campaign_name || '').slice(0,18)}</td>
        <td class="num">${fmtUsd(a.spend)}</td>
        <td class="num">${fmtN(a.imp)}</td>
        <td class="num">${fmtN(a.clk)}</td>
        <td class="num">${fmtPct(a.ctr/100)}</td>
        <td class="num">${fmtN(a.conv)}</td>
        <td class="num">${a.conv ? fmtUsd(a.spend/a.conv) : '—'}</td>
      </tr>`;
  }).join('');

  // Reconcile: TT cabinet vs GA4 source=tiktok
  const ga4tt = D.ga4.utm.filter(u => u.src === 'tiktok' && u.med === 'cpc')
                .reduce((a,r) => ({s:a.s+r.s, c:a.c+r.c, nu:a.nu+r.nu}), {s:0, c:0, nu:0});
  $('ttReconcile').innerHTML = `
    <div class="card">
      <div class="card-title">Кліки/Сесії</div>
      <div style="display:flex;align-items:center;gap:14px;">
        <div><div class="muted">TT cabinet</div><div style="font-size:24px;font-weight:800;">${fmtN(totalClk)}</div></div>
        <div style="font-size:20px;color:var(--text-muted);">→</div>
        <div><div class="muted">GA4 sessions (90d)</div><div style="font-size:24px;font-weight:800;">${fmtN(ga4tt.s)}</div></div>
      </div>
      <div class="muted" style="margin-top:10px;font-size:11px;">Якщо різниця велика — перевір UTM розмітку та blockers.</div>
    </div>
    <div class="card">
      <div class="card-title">Конверсії</div>
      <div style="display:flex;align-items:center;gap:14px;">
        <div><div class="muted">TT cabinet conv</div><div style="font-size:24px;font-weight:800;">${fmtN(totalConv)}</div></div>
        <div style="font-size:20px;color:var(--text-muted);">→</div>
        <div><div class="muted">GA4 conv (90d)</div><div style="font-size:24px;font-weight:800;">${fmtN(ga4tt.c)}</div></div>
      </div>
      <div class="muted" style="margin-top:10px;font-size:11px;">GA4 conv — event count (не unique users).</div>
    </div>
    <div class="card">
      <div class="card-title">Нові юзери GA4</div>
      <div style="font-size:30px;font-weight:800;">${fmtN(ga4tt.nu)}</div>
      <div class="muted" style="margin-top:10px;font-size:11px;">Із них зареєструвалось як креатори — дивись у "Insights → Funnel".</div>
    </div>
  `;
}

// ============================================================
// META
// ============================================================

function renderMeta() {
  const meta_utm = D.meta.utm_90d || [];
  const totalSess = meta_utm.reduce((a,r)=>a+r.s,0);
  const totalNu = meta_utm.reduce((a,r)=>a+r.nu,0);
  const totalConv = meta_utm.reduce((a,r)=>a+r.c,0);
  const totalEng = meta_utm.reduce((a,r)=>a+r.es,0);

  $('kpiMeta').innerHTML = [
    kpiCard({ color: 'blue', label: 'GA4 сесії (90d)', val: fmtN(totalSess), sub: 'utm_source IN (meta, facebook)' }),
    kpiCard({ color: 'purple', label: 'Engaged sessions', val: fmtN(totalEng), sub: totalSess ? `${(totalEng/totalSess*100).toFixed(0)}% engagement rate` : '' }),
    kpiCard({ color: 'pink', label: 'Нові юзери', val: fmtN(totalNu) }),
    kpiCard({ color: 'amber', label: 'Конверсії GA4', val: fmtN(totalConv) }),
  ].join('');

  $('metaTable').querySelector('tbody').innerHTML = meta_utm.map(u => `
    <tr>
      <td><span class="badge ${u.src === 'meta' ? 'blue' : 'red'}">${u.src}</span></td>
      <td class="mono" title="${u.camp}">${u.camp.length > 50 ? u.camp.slice(0,50)+'…' : u.camp}</td>
      <td class="num">${fmtN(u.s)}</td>
      <td class="num">${fmtN(u.es)}</td>
      <td class="num">${fmtN(u.nu)}</td>
      <td class="num">${fmtN(u.c)}</td>
      <td class="num">${fmtPct(u.br)}</td>
      <td class="num">${fmtDur(u.asd)}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px;">Немає Meta UTM-трафіку у GA4 за 90д</td></tr>';

  // Hygiene
  const issues = (D.utm_issues || []).filter(i => i.src === 'meta' || i.src === 'facebook' || i.src === 'fb' || i.src === 'instagram' || i.src === 'ig');
  if (issues.length === 0) {
    $('metaHygiene').innerHTML = `<div class="notice success"><span class="ic">✓</span> Не знайдено помилок UTM в Meta за 90 днів.</div>`;
  } else {
    $('metaHygiene').innerHTML = issues.map(i => `
      <div class="issue-item ${i.issues.includes('wrong_meta_source') ? 'error' : 'warn'}">
        <div>
          <div class="issue-title">${i.src} / ${i.med} · ${i.camp.slice(0,60)}</div>
          <div class="issue-body">
            ${i.issues.map(iss => `<span class="badge ${iss.includes('wrong') ? 'red' : 'amber'}">${iss}</span>`).join(' ')}
            · ${fmtN(i.s)} сесій · ${fmtN(i.c)} конв
          </div>
        </div>
      </div>
    `).join('');
  }
}

// ============================================================
// UTM
// ============================================================

function renderUtm() {
  const utm = D.ga4.utm;
  const totalSess = utm.reduce((a,u)=>a+u.s,0);
  const totalConv = utm.reduce((a,u)=>a+u.c,0);
  const cpc = utm.filter(u => u.med === 'cpc').reduce((a,u)=>a+u.s,0);
  const direct = utm.filter(u => u.src === '(direct)').reduce((a,u)=>a+u.s,0);

  $('kpiUtm').innerHTML = [
    kpiCard({ color: 'green', label: 'Total UTM сесії', val: fmtN(totalSess), sub: '90 днів' }),
    kpiCard({ color: 'blue', label: 'Paid (cpc) сесії', val: fmtN(cpc), sub: totalSess ? fmtPct(cpc/totalSess) : '' }),
    kpiCard({ color: 'purple', label: 'Direct сесії', val: fmtN(direct), sub: totalSess ? fmtPct(direct/totalSess) : '' }),
    kpiCard({ color: 'red', label: 'UTM hygiene issues', val: D.utm_issues.length, sub: 'нерозгорнуті макроси, encoding, wrong sources' }),
  ].join('');

  // Heatmap (group by source × medium)
  const matrix = {};
  utm.forEach(u => {
    if (!matrix[u.src]) matrix[u.src] = {};
    matrix[u.src][u.med] = (matrix[u.src][u.med] || 0) + u.s;
  });
  const sources = Object.keys(matrix).sort((a,b) => Object.values(matrix[b]).reduce((x,y)=>x+y,0) - Object.values(matrix[a]).reduce((x,y)=>x+y,0)).slice(0, 10);
  const mediums = Array.from(new Set(utm.map(u => u.med))).sort();

  destroy('utmHeat');
  const dataPts = [];
  sources.forEach((s, si) => {
    mediums.forEach((m, mi) => {
      const v = matrix[s][m] || 0;
      if (v > 0) dataPts.push({ x: m, y: s, v });
    });
  });

  charts.utmHeat = new Chart($('utmHeat'), {
    type: 'bar',
    data: {
      labels: sources,
      datasets: mediums.map((m, i) => ({
        label: m,
        data: sources.map(s => matrix[s][m] || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: gridScale({ stacked: true }), y: gridScale({ stacked: true }) },
      plugins: { legend: { position: 'right', labels: { boxWidth: 8, font: { size: 10 } } } },
    },
  });

  // Donut
  const srcAgg = {};
  utm.forEach(u => { srcAgg[u.src] = (srcAgg[u.src] || 0) + u.s; });
  const srcSorted = Object.entries(srcAgg).sort((a,b) => b[1]-a[1]).slice(0, 12);
  destroy('utmDonut');
  charts.utmDonut = new Chart($('utmDonut'), {
    type: 'doughnut',
    data: {
      labels: srcSorted.map(s => s[0]),
      datasets: [{ data: srcSorted.map(s => s[1]), backgroundColor: PALETTE, borderColor: '#141414', borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 8, font: { size: 10 } } } },
      cutout: '60%' },
  });

  // Campaigns table
  $('utmCampTable').querySelector('tbody').innerHTML = utm.slice().sort((a,b)=>b.s-a.s).slice(0, 50).map(u => `
    <tr>
      <td><b>${u.src}</b> / <span class="muted">${u.med}</span></td>
      <td class="mono" title="${u.camp}">${u.camp.length > 60 ? u.camp.slice(0,60)+'…' : u.camp}</td>
      <td class="num">${fmtN(u.s)}</td>
      <td class="num">${fmtN(u.nu)}</td>
      <td class="num">${fmtN(u.c)}</td>
      <td class="num">${fmtN(u.es)}</td>
      <td class="num">${u.s ? fmtPct(u.c/u.s) : '—'}</td>
    </tr>`).join('');

  // Issues
  $('utmIssues').innerHTML = D.utm_issues.length === 0 ? `
    <div class="notice success"><span class="ic">✓</span> Не знайдено UTM помилок.</div>
  ` : D.utm_issues.map(i => `
    <div class="issue-item ${i.issues.includes('wrong_meta_source') || i.issues.includes('tiktok_wrong_macro') ? 'error' : 'warn'}">
      <div>
        <div class="issue-title">${i.src} / ${i.med} · <span class="mono">${i.camp.slice(0,80)}</span></div>
        <div class="issue-body">
          ${i.issues.map(iss => `<span class="badge ${iss.includes('wrong') || iss.includes('macro') ? 'red' : 'amber'}">${iss}</span>`).join(' ')}
          · ${fmtN(i.s)} сесій · ${fmtN(i.c)} конв
        </div>
      </div>
    </div>`).join('');

  // Reconcile
  const gd = D.gads.campaigns_30d.reduce((a,c)=>({clk:a.clk+c.clk, conv:a.conv+c.conv}), {clk:0,conv:0});
  const tt = (D.tiktok.campaigns_30d||[]).reduce((a,c)=>({clk:a.clk+c.clk, conv:a.conv+c.conv}), {clk:0,conv:0});
  const ga4G = D.ga4.utm.filter(u=>u.src==='google'&&u.med==='cpc').reduce((a,r)=>({s:a.s+r.s,c:a.c+r.c}),{s:0,c:0});
  const ga4T = D.ga4.utm.filter(u=>u.src==='tiktok'&&u.med==='cpc').reduce((a,r)=>({s:a.s+r.s,c:a.c+r.c}),{s:0,c:0});
  $('reconcileTable').querySelector('tbody').innerHTML = `
    <tr>
      <td><b>Google Ads</b></td>
      <td class="num">${fmtN(gd.clk)} <span class="muted">(30d)</span></td>
      <td class="num">${fmtN(ga4G.s)} <span class="muted">(90d)</span></td>
      <td class="num"><span class="badge ${gd.clk > ga4G.s ? 'amber' : 'green'}">${gd.clk && ga4G.s ? ((ga4G.s-gd.clk)/gd.clk*100).toFixed(0)+'%' : '—'}</span></td>
      <td class="num">${fmtN(gd.conv)}</td>
      <td class="num">${fmtN(ga4G.c)}</td>
      <td class="num"><span class="badge ${gd.conv > ga4G.c ? 'red' : 'green'}">${gd.conv && ga4G.c ? ((ga4G.c-gd.conv)/gd.conv*100).toFixed(0)+'%' : '—'}</span></td>
    </tr>
    <tr>
      <td><b>TikTok</b></td>
      <td class="num">${fmtN(tt.clk)}</td>
      <td class="num">${fmtN(ga4T.s)} <span class="muted">(90d)</span></td>
      <td class="num"><span class="badge ${tt.clk > ga4T.s ? 'amber' : 'green'}">${tt.clk && ga4T.s ? ((ga4T.s-tt.clk)/tt.clk*100).toFixed(0)+'%' : '—'}</span></td>
      <td class="num">${fmtN(tt.conv)}</td>
      <td class="num">${fmtN(ga4T.c)}</td>
      <td class="num"><span class="badge ${tt.conv > ga4T.c ? 'red' : 'green'}">${tt.conv && ga4T.c ? ((ga4T.c-tt.conv)/tt.conv*100).toFixed(0)+'%' : '—'}</span></td>
    </tr>
  `;
}

// ============================================================
// ORGANIC & GSC
// ============================================================

let gscPeriod = '28d';

function renderGsc() {
  const queries = gscPeriod === '28d' ? D.gsc.queries_28d : D.gsc.queries_90d;
  const pages = gscPeriod === '28d' ? D.gsc.pages_28d : D.gsc.pages_90d;
  const brand = gscPeriod === '28d' ? D.gsc.brand_28d : D.gsc.brand_90d;
  const nonbrand = gscPeriod === '28d' ? D.gsc.nonbrand_28d : D.gsc.nonbrand_90d;

  const totalClk = queries.reduce((a,q)=>a+q.clk,0);
  const totalImp = queries.reduce((a,q)=>a+q.imp,0);
  const avgCtr = totalImp ? totalClk/totalImp : 0;
  const avgPos = queries.length ? queries.reduce((a,q)=>a+q.pos*q.imp,0)/totalImp : 0;

  $('kpiGsc').innerHTML = [
    kpiCard({ color: 'green', label: 'Кліки', val: fmtN(totalClk), sub: gscPeriod }),
    kpiCard({ color: 'blue', label: 'Покази', val: fmtN(totalImp) }),
    kpiCard({ color: 'amber', label: 'CTR', val: fmtPct(avgCtr) }),
    kpiCard({ color: 'purple', label: 'Avg position', val: avgPos.toFixed(1), sub: 'weighted by impressions' }),
  ].join('');

  // Brand terms
  const BRAND_T = ['pin.top','pin top','pintop','pin-top','пінтоп','пин топ','пін топ','пинтоп'];
  const isBrand = q => BRAND_T.some(b => (q||'').toLowerCase().includes(b));

  // Queries
  $('gscQueriesTable').querySelector('tbody').innerHTML = queries.slice(0, 50).map(q => `
    <tr>
      <td class="mono" title="${q.k}">${(q.k || '').slice(0, 50)}</td>
      <td class="num">${fmtN(q.clk)}</td>
      <td class="num">${fmtN(q.imp)}</td>
      <td class="num">${fmtPct(q.ctr)}</td>
      <td class="num">${q.pos.toFixed(1)}</td>
      <td>${isBrand(q.k) ? '<span class="badge purple">brand</span>' : '<span class="badge gray">non-brand</span>'}</td>
    </tr>`).join('');

  // Pages
  $('gscPagesTable').querySelector('tbody').innerHTML = pages.slice(0, 50).map(p => `
    <tr>
      <td class="mono" title="${p.k}">${(p.k || '').replace('https://pin.top','').slice(0, 45) || '/'}</td>
      <td class="num">${fmtN(p.clk)}</td>
      <td class="num">${fmtN(p.imp)}</td>
      <td class="num">${fmtPct(p.ctr)}</td>
      <td class="num">${p.pos.toFixed(1)}</td>
    </tr>`).join('');

  // Brand chart
  destroy('gscBrandChart');
  charts.gscBrandChart = new Chart($('gscBrandChart'), {
    type: 'doughnut',
    data: {
      labels: ['Brand', 'Non-brand'],
      datasets: [
        { label: 'Clicks', data: [brand.clk, nonbrand.clk], backgroundColor: ['#7C3AED', '#06D6A0'], borderColor: '#141414', borderWidth: 2 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtN(ctx.parsed)} clicks` } } } },
  });

  // Position distribution
  const buckets = { '1-3': 0, '4-10': 0, '11-20': 0, '21-50': 0, '51+': 0 };
  queries.forEach(q => {
    const p = q.pos;
    if (p <= 3) buckets['1-3']++;
    else if (p <= 10) buckets['4-10']++;
    else if (p <= 20) buckets['11-20']++;
    else if (p <= 50) buckets['21-50']++;
    else buckets['51+']++;
  });
  destroy('gscPosChart');
  charts.gscPosChart = new Chart($('gscPosChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{ label: 'Кількість запитів', data: Object.values(buckets), backgroundColor: ['#06D6A0', '#3B82F6', '#F59E0B', '#F87171', '#666'] }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale() },
      plugins: { legend: { display: false } } },
  });

  // SEO blockers
  $('seoBlockers').innerHTML = `
    <div class="issue-item error">
      <div>
        <div class="issue-title">322 сторінок не проіндексовано</div>
        <div class="issue-body">Згідно технічного аудиту pin.top, з 96 проіндексованих сторінок ще 322 чекають індексації. Перевір robots.txt, canonical, sitemap.</div>
      </div>
    </div>
    <div class="issue-item warn">
      <div>
        <div class="issue-title">Sitemap не відправлено в GSC</div>
        <div class="issue-body">GSC sitemaps endpoint повернув <code>[]</code>. Окремий блокер для індексації нових creator pages.</div>
      </div>
    </div>
    <div class="issue-item warn">
      <div>
        <div class="issue-title">${brand.clk}/${totalClk} (${totalClk ? Math.round(brand.clk/totalClk*100) : 0}%) кліків — branded</div>
        <div class="issue-body">Висока частка branded означає що небрендовий SEO-трафік потребує робит. Запити на pin.top шукають ті, хто вже знає бренд.</div>
      </div>
    </div>
    <div class="issue-item info">
      <div>
        <div class="issue-title">GSC має 2 дні затримки даних</div>
        <div class="issue-body">Дані за останні 1-2 дні ще не доступні в API. Це не баг.</div>
      </div>
    </div>
  `;
}

// ============================================================
// AUDIENCE
// ============================================================

function renderAudience() {
  // Devices
  const devSum = {};
  D.ga4.devices_30d.forEach(d => { devSum[d.dev] = (devSum[d.dev] || 0) + d.s; });
  destroy('audDevice');
  charts.audDevice = new Chart($('audDevice'), {
    type: 'doughnut',
    data: { labels: Object.keys(devSum).map(d => d === 'mobile' ? '📱 Mobile' : d === 'desktop' ? '💻 Desktop' : d === 'tablet' ? '📱 Tablet' : d),
            datasets: [{ data: Object.values(devSum), backgroundColor: ['#06D6A0', '#7C3AED', '#F59E0B'], borderColor: '#141414', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });

  $('audDeviceTable').querySelector('tbody').innerHTML = D.ga4.devices_30d.slice(0, 8).map(d => `
    <tr>
      <td>${d.dev}</td><td class="muted">${d.os}</td>
      <td class="num">${fmtN(d.s)}</td>
      <td class="num">${fmtPct(d.br)}</td>
    </tr>`).join('');

  // Country
  const co = D.ga4.geo_country_90d.filter(c => c.s > 50).slice(0, 12);
  destroy('audCountry');
  charts.audCountry = new Chart($('audCountry'), {
    type: 'bar',
    data: { labels: co.map(c => c.co || '?'), datasets: [{ label: 'Сесії', data: co.map(c => c.s), backgroundColor: '#06D6A0' }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: gridScale(), y: gridScale() }, plugins: { legend: { display: false } } },
  });

  // City UA
  const ci = D.ga4.geo_30d.filter(c => c.co === 'Ukraine' && c.ci && c.ci !== '(not set)').slice(0, 12);
  destroy('audCity');
  charts.audCity = new Chart($('audCity'), {
    type: 'bar',
    data: { labels: ci.map(c => c.ci), datasets: [{ label: 'Сесії', data: ci.map(c => c.s), backgroundColor: '#7C3AED' }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: gridScale(), y: gridScale() }, plugins: { legend: { display: false } } },
  });

  // Pages pin.top
  $('audPagesTable').querySelector('tbody').innerHTML = D.ga4.pages_pintop.slice(0, 25).map(p => `
    <tr>
      <td class="mono" title="${p.p}">${p.p.length > 35 ? p.p.slice(0,35)+'…' : p.p}</td>
      <td class="num">${fmtN(p.pv)}</td>
      <td class="num">${fmtN(p.u)}</td>
      <td class="num">${fmtDur(p.asd)}</td>
      <td class="num">${fmtPct(p.br)}</td>
    </tr>`).join('');

  // Landing
  $('audLandingTable').querySelector('tbody').innerHTML = D.ga4.landing_pintop.slice(0, 25).map(p => `
    <tr>
      <td class="mono" title="${p.p}">${p.p.length > 35 ? p.p.slice(0,35)+'…' : p.p}</td>
      <td class="num">${fmtN(p.s)}</td>
      <td class="num">${fmtN(p.nu)}</td>
      <td class="num">${fmtPct(p.br)}</td>
    </tr>`).join('');

  // Lang
  const lg = D.ga4.language_90d.filter(l => l.s > 100).slice(0, 12);
  destroy('audLang');
  charts.audLang = new Chart($('audLang'), {
    type: 'doughnut',
    data: { labels: lg.map(l => l.l), datasets: [{ data: lg.map(l => l.s), backgroundColor: PALETTE, borderColor: '#141414', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 8, font: { size: 10 } } } }, cutout: '55%' },
  });

  // Hour & DOW
  const dow = D.ga4.dow_30d || [];
  const hod = D.ga4.hod_30d || [];
  destroy('audHourDow');
  charts.audHourDow = new Chart($('audHourDow'), {
    type: 'bar',
    data: {
      labels: hod.map(h => h.h + 'г'),
      datasets: [{ label: 'Сесії за годину', data: hod.map(h => h.s), backgroundColor: '#06D6A0' }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale() }, plugins: { legend: { display: false } } },
  });
}

// ============================================================
// INSIGHTS
// ============================================================

function renderInsights() {
  // Funnel
  const funnelEvents = ['pintop_c_all_signinsignup', 'pintop_c_all_macroconv', 'pintop_c_all_microconv',
                        'pintop_c_all_engaged_audience', 'pintop_c_all_topengaged'];
  const funnelByName = {};
  D.ga4.funnel.forEach(f => { funnelByName[f.event] = f; });

  const showFunnel = D.ga4.funnel.filter(f => f.event.includes('pintop') || f.event.includes('signin') || f.event.includes('signup') || f.event.includes('register'))
                      .sort((a,b) => b.users - a.users).slice(0, 12);

  $('funnelTable').querySelector('tbody').innerHTML = showFunnel.map((f, i) => {
    const prev = i > 0 ? showFunnel[i-1].users : null;
    const dropTxt = prev ? ((f.users / prev) * 100).toFixed(0) + '%' : '100%';
    return `
      <tr>
        <td class="mono">${f.event}</td>
        <td class="num">${fmtN(f.count)}</td>
        <td class="num"><b>${fmtN(f.users)}</b></td>
        <td class="num">${fmtN(f.conv)}</td>
        <td class="num"><span class="badge ${prev && f.users/prev < 0.5 ? 'red' : prev && f.users/prev < 0.8 ? 'amber' : 'green'}">${dropTxt}</span></td>
      </tr>`;
  }).join('');

  // Tracking checklist
  const events_set = new Set(D.ga4.events_30d.map(e => e.name));
  const checks = [
    {
      name: 'GA4 Property підключено',
      pass: !!D.ga4.daily.length,
      detail: `${D.ga4.daily.length} днів даних`,
    },
    {
      name: 'GTM Container активний',
      pass: true,
      detail: 'GTM-KP2Q25S, останній push v69 (Meta Pixel Book Demo) 19.04',
    },
    {
      name: 'Meta Pixel налаштований',
      pass: true,
      detail: '1234927445323510 (PinTop Pixel New) — основний для активного Ad Account',
    },
    {
      name: 'TikTok Pixel ON_WEB_REGISTER',
      pass: true,
      detail: '7601540347134558215, на всіх сторінках',
    },
    {
      name: 'Подія registration_complete',
      pass: events_set.has('registration_complete'),
      detail: events_set.has('registration_complete') ? 'OK' : '⛔ ВІДСУТНЯ — критичний блокер для атрибуції',
    },
    {
      name: 'Подія onboarding_complete',
      pass: events_set.has('onboarding_complete'),
      detail: events_set.has('onboarding_complete') ? 'OK' : '⛔ ВІДСУТНЯ',
    },
    {
      name: 'GSC Sitemap відправлено',
      pass: false,
      detail: '⚠ GSC sitemaps endpoint повернув [] — окремий блокер',
    },
    {
      name: 'UTM hygiene clean',
      pass: D.utm_issues.length === 0,
      detail: D.utm_issues.length === 0 ? 'OK' : `⚠ Знайдено ${D.utm_issues.length} проблем (URL-encoded, нерозгорнуті макроси, wrong sources)`,
    },
    {
      name: 'Google Ads API підключено',
      pass: D.gads.campaigns_30d.length > 0,
      detail: `${D.gads.campaigns_30d.length} кампаній за 30д`,
    },
    {
      name: 'TikTok Marketing API підключено',
      pass: (D.tiktok.campaigns_30d || []).length > 0,
      detail: `${(D.tiktok.campaigns_30d || []).length} кампаній за 30д`,
    },
    {
      name: 'Meta Marketing API підключено',
      pass: false,
      detail: '⛔ Acc у Meta for Developers не схвалено — блокер на API доступ',
    },
  ];

  $('trackingChecklist').innerHTML = checks.map(c => `
    <div class="issue-item ${c.pass ? 'info' : 'error'}" style="border-left-color:${c.pass ? 'var(--green)' : 'var(--red)'};">
      <div style="flex-shrink:0;font-size:18px;">${c.pass ? '✓' : '✗'}</div>
      <div>
        <div class="issue-title">${c.name}</div>
        <div class="issue-body">${c.detail}</div>
      </div>
    </div>
  `).join('');

  // Anomalies — automatic detection
  const anomalies = [];

  // High-CR campaigns
  D.gads.campaigns_30d.forEach(c => {
    if (c.cost_usd > 5 && c.conv > c.clk) {
      anomalies.push({
        cls: 'warn',
        title: `Google Ads: ${c.name}`,
        body: `Конверсії (${c.conv.toFixed(0)}) > клікі (${c.clk}) — означає кілька event-конверсій на 1 клік. Перевір якщо це макро/мікро event mix.`,
      });
    }
    if (c.is && c.is < 0.3 && c.imp > 100) {
      anomalies.push({
        cls: 'warn',
        title: `Низький Imp Share: ${c.name}`,
        body: `IS = ${(c.is*100).toFixed(0)}%. Кампанія втрачає ${((1-c.is)*100).toFixed(0)}% можливих показів. Підвищи бюджет або bid.`,
      });
    }
  });

  // Best TikTok ads
  const ttAds = (D.tiktok.ads_30d || []).filter(a => a.conv > 5).sort((a,b) => (a.spend/Math.max(a.conv,1)) - (b.spend/Math.max(b.conv,1))).slice(0, 3);
  ttAds.forEach(a => {
    anomalies.push({
      cls: 'good',
      title: `Топ TikTok креатив: CPL $${(a.spend/a.conv).toFixed(2)}`,
      body: `${a.ad_name || 'Ad ' + a.ad_id} — ${a.conv} конв за $${a.spend.toFixed(2)}. CTR ${(a.ctr/100).toFixed(2)}%. Масштабуй або копіюй стиль.`,
    });
  });

  // GSC opportunities
  const gscQuick = D.gsc.queries_28d.filter(q => q.imp > 50 && q.pos > 5 && q.pos < 15).slice(0, 3);
  gscQuick.forEach(q => {
    anomalies.push({
      cls: 'good',
      title: `SEO opportunity: "${q.k}"`,
      body: `Pos ${q.pos.toFixed(1)}, ${q.imp} показів, тільки ${q.clk} кліків (CTR ${(q.ctr*100).toFixed(1)}%). Якщо вийдеш в топ-3 — приріст значний.`,
    });
  });

  if (anomalies.length === 0) {
    anomalies.push({ cls: 'info', title: 'Аномалій не знайдено', body: 'Все виглядає в межах норми.' });
  }

  $('anomalyList').innerHTML = anomalies.slice(0, 10).map(a => `
    <div class="issue-item ${a.cls === 'good' ? 'info' : a.cls}" style="border-left-color:${a.cls === 'good' ? 'var(--green)' : a.cls === 'warn' ? 'var(--amber)' : 'var(--blue)'};">
      <div>
        <div class="issue-title">${a.title}</div>
        <div class="issue-body">${a.body}</div>
      </div>
    </div>`).join('');

  // Events
  $('eventsTable').querySelector('tbody').innerHTML = D.ga4.events_30d.slice(0, 25).map(e => `
    <tr>
      <td class="mono">${e.name}</td>
      <td class="num">${fmtN(e.count)}</td>
      <td class="num">${fmtN(e.conv)}</td>
      <td class="num">${fmtN(e.users)}</td>
    </tr>`).join('');
}

// ============================================================
// MAIN RENDER
// ============================================================

function renderAll() {
  $('periodIndicator').innerHTML = `<b>${fmtDate(dateKey(state.from))} → ${fmtDate(dateKey(state.to))}</b>`;
  // Render only the active panel for performance
  const activeTab = document.querySelector('.tab.active').dataset.tab;
  renderActiveTab(activeTab);
}

function renderActiveTab(tab) {
  switch (tab) {
    case 'overview': renderOverview(); break;
    case 'paid': renderPaid(); break;
    case 'gads': renderGads(); break;
    case 'tiktok': renderTikTok(); break;
    case 'meta': renderMeta(); break;
    case 'utm': renderUtm(); break;
    case 'organic': renderGsc(); break;
    case 'audience': renderAudience(); break;
    case 'insights': renderInsights(); break;
  }
}

// ============================================================
// EVENT BINDINGS
// ============================================================

function initApp() {
  // Period buttons
  document.querySelectorAll('#periodGroup button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#periodGroup button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const p = btn.dataset.period;
      if (p === 'custom') {
        $('customRange').style.display = 'flex';
        const tStr = today.toISOString().slice(0, 10);
        const fStr = new Date(today.getTime() - 30*86400000).toISOString().slice(0, 10);
        $('dateFrom').value = fStr; $('dateTo').value = tStr;
        setCustom(fStr, tStr);
      } else {
        $('customRange').style.display = 'none';
        setPeriodPreset(p);
      }
    });
  });

  $('dateFrom').addEventListener('change', () => {
    if ($('dateFrom').value && $('dateTo').value) setCustom($('dateFrom').value, $('dateTo').value);
  });
  $('dateTo').addEventListener('change', () => {
    if ($('dateFrom').value && $('dateTo').value) setCustom($('dateFrom').value, $('dateTo').value);
  });

  // Channel filter
  const ch30 = D.ga4.channels_30d;
  $('chFilter').innerHTML = '<option value="">Всі канали</option>' + ch30.map(c => `<option value="${c.ch}">${c.ch}</option>`).join('');
  $('chFilter').addEventListener('change', () => { state.channel = $('chFilter').value; renderAll(); });
  $('scopeFilter').addEventListener('change', () => { state.scope = $('scopeFilter').value; renderAll(); });

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const tn = tab.dataset.tab;
      document.querySelector(`.tab-panel[data-panel="${tn}"]`).classList.add('active');
      renderActiveTab(tn);
    });
  });

  // GSC sub-tabs
  document.querySelectorAll('#gscSubTabs .sub-tab').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#gscSubTabs .sub-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      gscPeriod = b.dataset.sub;
      renderGsc();
    });
  });

  // Updated at
  const buildMeta = D._build || {};
  const dt = buildMeta.generated_at ? new Date(buildMeta.generated_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  $('updatedAt').textContent = dt;
  $('brandSub').textContent = `GA4 · Google Ads · TikTok · Meta · GSC · оновлено ${dt}`;

  // Initial render
  setPeriodPreset('30');
}

window._pintopRender = renderAll;

})();
