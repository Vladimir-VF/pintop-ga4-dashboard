/* ============================================================
   pin.top Marketing Intelligence Dashboard v2 — main logic
   ============================================================ */

(function() {

console.log('[pintop] dashboard.js v3.3 loaded — period-aware paid + weekly card report');
const D = window.PINTOP_DATA;
if (!D) {
  console.error('[pintop] PINTOP_DATA not loaded — показую fallback error');
  document.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('gate');
    if (gate) gate.style.display = 'none';
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    document.body.innerHTML = `
      <div style="padding:60px 40px;max-width:600px;margin:80px auto;background:#141414;border:1px solid rgba(248,113,113,.3);border-radius:16px;color:#fff;font-family:Inter,sans-serif;">
        <h2 style="color:#F87171;margin-bottom:12px;">⚠ Помилка завантаження даних</h2>
        <p style="color:rgba(255,255,255,.7);line-height:1.6;">data.js не завантажився. Це може бути через кеш або помилку мережі.</p>
        <button onclick="location.reload(true)" style="margin-top:20px;padding:12px 20px;background:linear-gradient(90deg,#06D6A0,#3B82F6);color:#0a0a0a;font-weight:700;border:none;border-radius:8px;cursor:pointer;">🔄 Перезавантажити (skip cache)</button>
      </div>`;
  });
  return;
}
console.log('[pintop] data ready:', {
  ga4_daily: D.ga4?.daily?.length,
  gads_camps: D.gads?.campaigns_30d?.length,
  tt_camps: D.tiktok?.campaigns_30d?.length,
  utm_merged: D.ga4?.utm_merged?.length,
  build: D._build?.generated_at,
});

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

function runLoader(done) {
  const loader = document.getElementById('loader');
  const sub = document.getElementById('loaderSub');
  loader.style.display = 'flex';
  const steps = [
    { t: 0,    msg: 'Синхронізую GA4…' },
    { t: 380,  msg: 'Тягну Google Ads…' },
    { t: 760,  msg: 'Тягну TikTok Ads…' },
    { t: 1100, msg: 'Зводжу UTM та Search Console…' },
    { t: 1500, msg: 'Готово · відкриваю дашборд' },
  ];
  steps.forEach(s => setTimeout(() => { sub.textContent = s.msg; }, s.t));
  setTimeout(() => {
    loader.classList.add('hide');
    setTimeout(() => { loader.style.display = 'none'; done && done(); }, 450);
  }, 1850);
}

function unlock({ animate } = { animate: true }) {
  console.log('[pintop] unlock() animate=', animate);
  document.getElementById('gate').style.display = 'none';
  if (animate) {
    runLoader(() => {
      console.log('[pintop] loader done, showing app');
      document.getElementById('app').style.display = 'block';
      try { initApp(); } catch (e) { console.error('[pintop] initApp error:', e); showInitError(e); }
    });
  } else {
    document.getElementById('app').style.display = 'block';
    try { initApp(); } catch (e) { console.error('[pintop] initApp error:', e); showInitError(e); }
  }
}

function showInitError(err) {
  const main = document.querySelector('.main');
  if (!main) return;
  main.innerHTML = `
    <div class="notice danger" style="margin:40px 0;">
      <b>⚠ Помилка ініціалізації:</b> ${(err && err.message) || err}<br>
      <button onclick="location.reload(true)" style="margin-top:10px;padding:8px 14px;background:var(--green);color:#0a0a0a;font-weight:700;border:none;border-radius:6px;cursor:pointer;">🔄 Перезавантажити</button>
    </div>`;
}

async function tryGate() {
  const pwd = document.getElementById('gatePass').value;
  const h = await sha256(pwd);
  if (h === PASS_HASH) {
    sessionStorage.setItem(KEY, '1');
    unlock({ animate: true });
  } else {
    document.getElementById('gateErr').classList.add('show');
  }
}

document.getElementById('gateBtn').addEventListener('click', tryGate);
document.getElementById('gatePass').addEventListener('keypress', e => {
  if (e.key === 'Enter') tryGate();
});

// sessionStorage check перенесено в самий кінець IIFE — щоб всі const/let (fmtN, state, setPeriodPreset тощо) уже були оголошені на момент unlock→initApp

// ============================================================
// HELPERS
// ============================================================

function $(id) { return document.getElementById(id); }
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
  channels: null, // Set of channel names; null = all selected
  scope: 'pintop', gscPeriod: '28d',
  gadsFilter: 'active', ttFilter: 'active',
};

// Канали що підпадають під paid / organic
const PAID_CHANNELS = new Set(['Paid Search', 'Paid Social', 'Paid Video', 'Paid Other', 'Display', 'Cross-network']);
const ORGANIC_CHANNELS = new Set(['Organic Search', 'Organic Social', 'Organic Video', 'Organic Shopping', 'Direct', 'Referral', 'Email']);

function chIsSelected(ch) {
  if (!state.channels) return true;
  return state.channels.has(ch);
}
// UTM → channel mapping
function utmToChannel(src, med) {
  const s = (src || '').toLowerCase();
  const m = (med || '').toLowerCase();
  if (m === 'cpc' || m === 'paid' || m === 'ppc') {
    if (s === 'tiktok' || s === 'meta' || s === 'facebook' || s === 'instagram') return 'Paid Social';
    if (s === 'google' || s === 'bing') return 'Paid Search';
    return 'Paid Other';
  }
  if (m === 'organic') return s.includes('google') || s.includes('bing') ? 'Organic Search' : 'Organic Social';
  if (m === 'referral') return 'Referral';
  if (m === 'email') return 'Email';
  if (s === '(direct)' || m === '(none)' || (s === '' && m === '')) return 'Direct';
  return 'Referral';
}

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

// Aggregate Google Ads campaigns for a given period using daily_by_camp_30d.
// For periods inside the last 30 days — compute true totals per campaign.
// For periods > 30d — fall back to static 30d snapshot with `isApprox: true`.
function aggGAdsCampaigns(from, to) {
  const days = Math.round((to - from)/86400000) + 1;
  const allCamps = D.gads.campaigns_30d || [];
  if (days > 30) {
    return { camps: allCamps, isApprox: true, days, note: 'дані за останні 30 днів — більший період потребує API розширення' };
  }
  const byName = {};
  (D.gads.daily_by_camp_30d || []).forEach(r => {
    if (!inRange(r.d, from, to)) return;
    const k = r.camp;
    if (!byName[k]) byName[k] = { cost_aed: 0, cost_usd: 0, clk: 0, conv: 0 };
    byName[k].cost_aed += r.cost_aed || 0;
    byName[k].cost_usd += r.cost_usd || 0;
    byName[k].clk += r.clk || 0;
    byName[k].conv += r.conv || 0;
  });
  const camps = allCamps.map(c => {
    const agg = byName[c.name];
    if (agg && (agg.cost_usd > 0 || agg.clk > 0)) {
      const ratio = c.cost_usd > 0 ? (agg.cost_usd / c.cost_usd) : 1;
      const imp = Math.round((c.imp || 0) * ratio);
      return Object.assign({}, c, {
        cost_aed: agg.cost_aed,
        cost_usd: agg.cost_usd,
        imp,
        clk: agg.clk,
        conv: agg.conv,
        ctr: imp ? agg.clk / imp : 0,
        cpc_usd: agg.clk ? agg.cost_usd / agg.clk : 0,
        cpc_aed: agg.clk ? agg.cost_aed / agg.clk : 0,
        cpa_usd: agg.conv ? agg.cost_usd / agg.conv : 0,
        cpa_aed: agg.conv ? agg.cost_aed / agg.conv : 0,
      });
    }
    return Object.assign({}, c, {
      cost_aed: 0, cost_usd: 0, imp: 0, clk: 0, conv: 0, ctr: 0,
      cpc_usd: 0, cpc_aed: 0, cpa_usd: 0, cpa_aed: 0,
    });
  });
  return { camps, isApprox: false, days };
}

// Compute the last completed Mon-Sun week and the prior Mon-Sun week.
// Returns dates that are guaranteed to be ≤ today and align with ISO weeks.
function getLastCompletedWeek() {
  const t = new Date(today.getTime());
  const dow = t.getDay(); // 0=Sun..6=Sat
  const daysToLastSun = dow === 0 ? 7 : dow; // last Sunday
  const lastSun = new Date(t); lastSun.setDate(lastSun.getDate() - daysToLastSun);
  const lastMon = new Date(lastSun); lastMon.setDate(lastMon.getDate() - 6);
  const prevSun = new Date(lastMon); prevSun.setDate(prevSun.getDate() - 1);
  const prevMon = new Date(prevSun); prevMon.setDate(prevMon.getDate() - 6);
  return { tw: { from: lastMon, to: lastSun }, pw: { from: prevMon, to: prevSun } };
}

// ============================================================
// DELTA / KPI rendering
// ============================================================

function delta(cur, prv, invert = false, prevLabel = '') {
  if (!prv && !cur) return { txt: '—', cls: 'neutral', arr: '·', tooltip: '' };
  if (!prv) return { txt: 'нове', cls: 'up', arr: '↑', tooltip: 'Не було даних у попередньому періоді' };
  const d = (cur - prv) / prv * 100;
  const positive = (invert ? -d : d) > 0.5;
  const negative = (invert ? -d : d) < -0.5;
  return {
    txt: Math.abs(d).toFixed(1) + '%',
    cls: positive ? 'up' : negative ? 'down' : 'neutral',
    arr: d > 0 ? '↑' : d < 0 ? '↓' : '·',
    tooltip: prevLabel ? `vs попередній період (${prevLabel}): ${fmtN(prv)}` : '',
  };
}

function kpiCard({ color, label, val, unit, sub, dlt }) {
  return `
    <div class="kpi ${color || 'green'}" ${dlt && dlt.tooltip ? `title="${dlt.tooltip}"` : ''}>
      <div class="kpi-label">${label}</div>
      <div class="kpi-val">${val}${unit ? `<span class="kpi-unit">${unit}</span>` : ''}</div>
      ${dlt ? `<div class="kpi-delta ${dlt.cls}" ${dlt.tooltip ? `title="${dlt.tooltip}"` : ''}><span class="ic">${dlt.arr}</span>${dlt.txt} <span class="muted" style="font-weight:500;margin-left:4px;">vs попер. період</span></div>` : ''}
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>`;
}

// ============================================================
// OVERVIEW
// ============================================================

function renderOverview() {
  const curFull = aggDaily(D.ga4.daily, state.from, state.to);
  const prvFull = aggDaily(D.ga4.daily, state.prevFrom, state.prevTo);

  // KPI row
  const channels = pickChannelsForPeriod();
  const totalCh = channels.reduce((a,c)=>a+c.s,0);

  // Якщо фільтр каналів активний (не всі) — KPI рахуємо з channels breakdown
  // Але delta тоді неможлива (немає prev breakdown) — показуємо cur only
  const filterActive = state.channels && state.channels.size > 0 && state.channels.size < allChCount();
  let cur = curFull, prv = prvFull, noDelta = false;
  if (filterActive) {
    const selCh = channels.filter(c => state.channels.has(c.ch));
    cur = { sum: {
      s: selCh.reduce((a,c)=>a+c.s,0),
      u: selCh.reduce((a,c)=>a+(c.u||0),0),
      nu: selCh.reduce((a,c)=>a+(c.nu||0),0),
      c: selCh.reduce((a,c)=>a+(c.c||0),0),
    }, byDay: curFull.byDay };
    prv = { sum: { s: 0, u: 0, nu: 0, c: 0 }, byDay: prvFull.byDay };
    noDelta = true;
  }
  const paidSpend = aggGAdsDaily(state.from, state.to).sum.spend_usd
                  + aggTTDaily(state.from, state.to).sum.spend;
  const paidConv = aggGAdsDaily(state.from, state.to).sum.conv
                 + aggTTDaily(state.from, state.to).sum.conv;
  const blendedCpl = paidConv ? paidSpend / paidConv : 0;
  const gscClicks28 = D.gsc.queries_28d.reduce((a,q)=>a+q.clk,0);

  // Period labels for delta clarity
  const prevLabel = `${fmtDate(dateKey(state.prevFrom))} → ${fmtDate(dateKey(state.prevTo))}`;
  const periodLen = Math.round((state.to - state.from)/86400000) + 1;

  $('kpiOverview').innerHTML = [
    kpiCard({ color: 'green', label: 'Сесії', val: fmtN(cur.sum.s), dlt: noDelta ? null : delta(cur.sum.s, prv.sum.s, false, prevLabel), sub: noDelta ? 'фільтр активний' : '' }),
    kpiCard({ color: 'purple', label: 'Активні юзери', val: fmtN(cur.sum.u), dlt: noDelta ? null : delta(cur.sum.u, prv.sum.u, false, prevLabel), sub: noDelta ? 'фільтр активний' : '' }),
    kpiCard({ color: 'pink', label: 'Нові юзери', val: fmtN(cur.sum.nu), dlt: noDelta ? null : delta(cur.sum.nu, prv.sum.nu, false, prevLabel), sub: noDelta ? 'фільтр активний' : '' }),
    kpiCard({ color: 'blue', label: 'Конв. GA4 (event count)', val: fmtN(cur.sum.c), dlt: noDelta ? null : delta(cur.sum.c, prv.sum.c, false, prevLabel), sub: noDelta ? 'фільтр активний' : 'не унікальні users' }),
    kpiCard({ color: 'amber', label: 'Paid spend', val: fmtUsd(paidSpend), unit: 'USD', sub: 'Google Ads + TikTok (кабінет)' }),
    kpiCard({ color: 'teal', label: 'Blended CPL', val: blendedCpl ? fmtUsd(blendedCpl) : '—', sub: paidConv ? `${fmtN(paidConv)} конв з кабінетів` : 'немає конв' }),
    kpiCard({ color: 'green', label: 'Organic clicks (GSC)', val: fmtN(gscClicks28), sub: 'останні 28 днів' }),
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

  // Channels donut + supporting table (з фільтром)
  const chData = channels.filter(c => c.s > 0 && chIsSelected(c.ch)).sort((a,b) => b.s - a.s);
  const totChSess = chData.reduce((a,c)=>a+c.s,0);
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
      plugins: { legend: { display: false } },
      cutout: '65%',
    },
  });
  $('overviewChannelsTable').querySelector('tbody').innerHTML = chData.map(c => `
    <tr>
      <td><span class="dot" style="background:${CHANNEL_COLORS[c.ch]||'#888'}"></span>${c.ch}</td>
      <td class="num">${fmtN(c.s)}</td>
      <td class="num"><b>${((c.s/totChSess)*100).toFixed(1)}%</b></td>
    </tr>`).join('');

  // Paid spend chart — фільтр днів з витратами > 0
  const gd = aggGAdsDaily(state.from, state.to);
  const td = aggTTDaily(state.from, state.to);
  const allDaysRaw = Array.from(new Set([...Object.keys(gd.byDay), ...Object.keys(td.byDay)])).sort();
  const allDays = allDaysRaw.filter(d => ((gd.byDay[d]||{}).spend_usd || 0) + ((td.byDay[d]||{}).spend || 0) > 0.01);
  destroy('overviewPaidSpend');
  charts.overviewPaidSpend = new Chart($('overviewPaidSpend'), {
    type: 'bar',
    data: {
      labels: allDays.map(d => d.slice(4,6)+'.'+d.slice(6,8)),
      datasets: [
        { label: 'Google Ads', data: allDays.map(d => (gd.byDay[d]||{}).spend_usd || 0), backgroundColor: '#3B82F6', stack: 'spend' },
        { label: 'TikTok', data: allDays.map(d => (td.byDay[d]||{}).spend || 0), backgroundColor: '#BE1C9A', stack: 'spend' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: gridScale({ ticks: { maxTicksLimit: 14 } }),
        y: gridScale({ stacked: true, ticks: { callback: v => '$' + v } }),
      },
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtUsd(ctx.parsed.y)}` } } },
    },
  });

  // Top sources (90d, з фільтром по каналу; URL-encoded дублі склеєні)
  const utmPool = D.ga4.utm_merged || D.ga4.utm;
  const utmSorted = utmPool
    .filter(u => chIsSelected(utmToChannel(u.src, u.med)))
    .sort((a,b) => b.s - a.s).slice(0, 12);
  $('overviewSources').querySelector('tbody').innerHTML = utmSorted.map(u => {
    const er = u.s ? (u.es / u.s) : 0;
    const erCls = er > 0.6 ? 'green' : er > 0.35 ? 'amber' : 'red';
    return `
    <tr>
      <td><b>${u.src}</b> / ${u.med}</td>
      <td><span class="badge gray">${u.camp.length > 28 ? u.camp.slice(0,28)+'…' : u.camp}</span></td>
      <td class="num">${fmtN(u.s)}</td>
      <td class="num">${fmtN(u.nu)}</td>
      <td class="num">${fmtN(u.es)}</td>
      <td class="num"><span class="badge ${erCls}">${fmtPct(er)}</span></td>
      <td class="num">${fmtDur(u.asd)}</td>
      <td class="num">${fmtN(u.c)}</td>
    </tr>`;
  }).join('');

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
      labels: months.map(m => 'міс ' + m),
      datasets: [
        { label: 'Минулий рік', data: months.map(m => yoyMap[m]['last_year'] || 0), backgroundColor: 'rgba(124,58,237,.55)' },
        { label: 'Цей рік', data: months.map(m => yoyMap[m]['this_year'] || 0), backgroundColor: '#06D6A0' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale() },
      plugins: { legend: { position: 'top' } },
    },
  });

  // YoY summary
  let totalThis = 0, totalLast = 0;
  months.forEach(m => {
    totalThis += yoyMap[m]['this_year'] || 0;
    totalLast += yoyMap[m]['last_year'] || 0;
  });
  const yoyGrow = totalLast ? ((totalThis - totalLast) / totalLast * 100).toFixed(0) : 0;
  $('yoySummary').innerHTML = totalLast
    ? `<b>Річний YoY:</b> сумарно ${fmtN(totalThis)} сесій цього року vs ${fmtN(totalLast)} минулого — <b>${yoyGrow > 0 ? '+' : ''}${yoyGrow}%</b>.`
    : `<b>Минулого року</b> даних мало — порівняння неповне.`;

  const chLabel = (!state.channels || state.channels.size === allChCount())
    ? 'всі канали'
    : `канали: ${Array.from(state.channels).slice(0, 3).join(', ')}${state.channels.size > 3 ? `… (${state.channels.size})` : ''}`;
  $('overviewSubtitle').textContent = `Період ${fmtDate(dateKey(state.from))} → ${fmtDate(dateKey(state.to))} · GA4 scope: pin.top · ${chLabel}`;
}

function allChCount() {
  const set = new Set();
  D.ga4.channels_30d.forEach(c => set.add(c.ch));
  D.ga4.channels_90d.forEach(c => set.add(c.ch));
  return set.size;
}

function buildOverviewInsights(cur, prv, paidSpend, paidConv) {
  const items = [];
  const curLabel = `${fmtDate(dateKey(state.from))} → ${fmtDate(dateKey(state.to))}`;
  const prvLabel = `${fmtDate(dateKey(state.prevFrom))} → ${fmtDate(dateKey(state.prevTo))}`;

  // Insight 1: Paid contribution
  const channels = pickChannelsForPeriod();
  const paidSocial = (channels.find(c => c.ch === 'Paid Social') || {}).s || 0;
  const paidSearch = (channels.find(c => c.ch === 'Paid Search') || {}).s || 0;
  const totalSess = channels.reduce((a,c)=>a+c.s,0);
  const paidShare = totalSess ? ((paidSocial + paidSearch) / totalSess * 100).toFixed(1) : 0;
  items.push({
    cls: paidShare > 5 ? 'good' : 'warn', ic: '💰',
    t1: 'Paid traffic share',
    t2: `Платний трафік дав <b>${paidShare}%</b> сесій (${fmtN(paidSocial + paidSearch)} з ${fmtN(totalSess)}). Spend ${fmtUsd(paidSpend)} → ${fmtN(paidConv)} кабінетних конверсій. CPL ${paidConv ? fmtUsd(paidSpend/paidConv) : '—'}.`,
  });

  // Insight 2: Growth vs previous period з конкретними датами
  const grow = prv.sum.s ? ((cur.sum.s - prv.sum.s)/prv.sum.s * 100).toFixed(1) : null;
  if (grow != null) {
    items.push({
      cls: grow > 0 ? 'good' : 'bad', ic: grow > 0 ? '📈' : '📉',
      t1: `Порівняно з ${prvLabel}`,
      t2: `Сесії: ${fmtN(cur.sum.s)} vs ${fmtN(prv.sum.s)} (<b>${grow > 0 ? '+' : ''}${grow}%</b>). Конверсії GA4 events: ${fmtN(cur.sum.c)} vs ${fmtN(prv.sum.c)} (<b>${prv.sum.c ? (((cur.sum.c-prv.sum.c)/prv.sum.c*100).toFixed(1) + '%') : '—'}</b>).`,
    });
  }

  // Insight 3: New user share
  const nuShare = cur.sum.u ? (cur.sum.nu/cur.sum.u*100).toFixed(0) : 0;
  items.push({
    cls: nuShare > 70 ? 'warn' : 'good', ic: '🆕',
    t1: 'Якість аудиторії',
    t2: `<b>${nuShare}%</b> — частка нових юзерів (${fmtN(cur.sum.nu)} з ${fmtN(cur.sum.u)} активних). ${nuShare > 80 ? 'Дуже високий — холодний трафік, низька повторна вовлеченість. Треба нарощувати retention (email, onboarding).' : nuShare > 60 ? 'Норма для активних запусків — performance-трафік домінує.' : 'Багато повертаються — продукт тримає юзерів.'}`,
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

// === Weekly Report Card (last completed Mon-Sun week vs prior week) ===
// Independent of period filter — always shows last completed week.
function renderWeeklyReport() {
  const root = $('weeklyReport');
  if (!root) return;
  const { tw, pw } = getLastCompletedWeek();
  const tw_g = aggGAdsDaily(tw.from, tw.to);
  const tw_t = aggTTDaily(tw.from, tw.to);
  const tw_ga4 = aggDaily(D.ga4.daily, tw.from, tw.to);
  const pw_g = aggGAdsDaily(pw.from, pw.to);
  const pw_t = aggTTDaily(pw.from, pw.to);
  const pw_ga4 = aggDaily(D.ga4.daily, pw.from, pw.to);

  const twSpend = tw_g.sum.spend_usd + tw_t.sum.spend;
  const pwSpend = pw_g.sum.spend_usd + pw_t.sum.spend;
  const twConv = tw_g.sum.conv + tw_t.sum.conv;
  const pwConv = pw_g.sum.conv + pw_t.sum.conv;
  const twCpl = twConv ? twSpend / twConv : 0;
  const pwCpl = pwConv ? pwSpend / pwConv : 0;
  const twClk = tw_g.sum.clk + tw_t.sum.clk;
  const pwClk = pw_g.sum.clk + pw_t.sum.clk;

  const fmtRange = (a, b) => {
    const m1 = String(a.getMonth()+1).padStart(2,'0');
    const d1 = String(a.getDate()).padStart(2,'0');
    const m2 = String(b.getMonth()+1).padStart(2,'0');
    const d2 = String(b.getDate()).padStart(2,'0');
    return `${d1}.${m1} – ${d2}.${m2}`;
  };

  const dlt = (cur, prv, invert = false) => {
    if (!prv && !cur) return { txt: '—', cls: 'neutral', arr: '·' };
    if (!prv) return { txt: 'нове', cls: 'up', arr: '↑' };
    const d = (cur - prv) / prv * 100;
    const positive = (invert ? -d : d) > 0.5;
    const negative = (invert ? -d : d) < -0.5;
    return {
      txt: (d>=0?'+':'') + d.toFixed(1) + '%',
      cls: positive ? 'up' : negative ? 'down' : 'neutral',
      arr: d > 0 ? '↑' : d < 0 ? '↓' : '·',
    };
  };

  const dSpend = dlt(twSpend, pwSpend); // напрямок зміни spend (нейтральна інтерпретація — рост може бути позитивний при scaling)
  const dConv = dlt(twConv, pwConv);
  const dCpl = dlt(twCpl, pwCpl, true); // інвертуємо: менший CPL = краще
  const dClk = dlt(twClk, pwClk);
  const dGa4Sess = dlt(tw_ga4.sum.s, pw_ga4.sum.s);
  const dGa4Nu = dlt(tw_ga4.sum.nu, pw_ga4.sum.nu);

  const card = (label, val, sub, d, accent) => `
    <div class="wr-card ${accent || ''}">
      <div class="wr-label">${label}</div>
      <div class="wr-val">${val}</div>
      ${sub ? `<div class="wr-sub">${sub}</div>` : ''}
      ${d ? `<div class="wr-delta ${d.cls}"><span class="ic">${d.arr}</span>${d.txt}<span class="muted">vs пред. тиждень</span></div>` : ''}
    </div>`;

  // Per-channel mini-cards
  const dGSpend = dlt(tw_g.sum.spend_usd, pw_g.sum.spend_usd, true);
  const dGConv = dlt(tw_g.sum.conv, pw_g.sum.conv);
  const dGCpa = dlt(tw_g.sum.conv ? tw_g.sum.spend_usd/tw_g.sum.conv : 0, pw_g.sum.conv ? pw_g.sum.spend_usd/pw_g.sum.conv : 0, true);
  const dTSpend = dlt(tw_t.sum.spend, pw_t.sum.spend, true);
  const dTConv = dlt(tw_t.sum.conv, pw_t.sum.conv);
  const dTCpa = dlt(tw_t.sum.conv ? tw_t.sum.spend/tw_t.sum.conv : 0, pw_t.sum.conv ? pw_t.sum.spend/pw_t.sum.conv : 0, true);

  // Meta — paid_social + meta/cpc + ig/social з utm_merged за цей тиждень
  const isMetaUtm = u => {
    const s = (u.src||'').toLowerCase(), m = (u.med||'').toLowerCase();
    return (s==='meta'||s==='facebook'||s==='ig'||s==='instagram') && (m==='cpc'||m==='paid_social');
  };
  // utm масиви містять 90d агрегат — окремих тижневих метрик нема. Показуємо ремарку.
  const metaPaidSess = (D.ga4.utm||[]).filter(isMetaUtm).reduce((a,r)=>a+r.s,0);
  const metaPaidConv = (D.ga4.utm||[]).filter(isMetaUtm).reduce((a,r)=>a+r.c,0);

  root.innerHTML = `
    <div class="wr-head">
      <div>
        <div class="wr-h-eyebrow">Звіт за останній повний тиждень</div>
        <div class="wr-h-range">${fmtRange(tw.from, tw.to)} <span class="wr-h-vs">vs ${fmtRange(pw.from, pw.to)}</span></div>
      </div>
      <div class="wr-h-tag">📊 Mon–Sun · WoW</div>
    </div>

    <div class="wr-grid">
      ${card('Total spend', fmtUsd(twSpend), 'Google + TikTok', dSpend, 'accent-blend')}
      ${card('Конверсії (cabinet)', fmtN(twConv), `${fmtN(twClk)} кліків`, dConv, 'accent-green')}
      ${card('Blended CPL', twCpl ? fmtUsd(twCpl) : '—', `${fmtN(twConv)} конв`, dCpl, 'accent-amber')}
      ${card('GA4 нові юзери', fmtN(tw_ga4.sum.nu), `${fmtN(tw_ga4.sum.s)} сесій`, dGa4Nu, 'accent-purple')}
    </div>

    <div class="wr-channels">
      <div class="wr-ch google">
        <div class="wr-ch-head"><div class="wr-ch-logo">G</div><div class="wr-ch-name">Google Ads</div><span class="status-pill live">live</span></div>
        <div class="wr-ch-row">
          <div><span class="wr-ch-l">Spend</span><span class="wr-ch-v">${fmtUsd(tw_g.sum.spend_usd)}</span><span class="wr-ch-d ${dGSpend.cls}">${dGSpend.arr}${dGSpend.txt}</span></div>
          <div><span class="wr-ch-l">Conv</span><span class="wr-ch-v">${fmtN(tw_g.sum.conv)}</span><span class="wr-ch-d ${dGConv.cls}">${dGConv.arr}${dGConv.txt}</span></div>
          <div><span class="wr-ch-l">CPA</span><span class="wr-ch-v">${tw_g.sum.conv ? fmtUsd(tw_g.sum.spend_usd/tw_g.sum.conv) : '—'}</span><span class="wr-ch-d ${dGCpa.cls}">${dGCpa.arr}${dGCpa.txt}</span></div>
          <div><span class="wr-ch-l">Кліків</span><span class="wr-ch-v">${fmtN(tw_g.sum.clk)}</span><span class="wr-ch-d muted">CTR ${tw_g.sum.imp ? fmtPct(tw_g.sum.clk/tw_g.sum.imp) : '—'}</span></div>
        </div>
      </div>
      <div class="wr-ch tiktok">
        <div class="wr-ch-head"><div class="wr-ch-logo">♪</div><div class="wr-ch-name">TikTok Ads</div><span class="status-pill ${tw_t.sum.spend>0?'live':'paused'}">${tw_t.sum.spend>0?'live':'idle'}</span></div>
        <div class="wr-ch-row">
          <div><span class="wr-ch-l">Spend</span><span class="wr-ch-v">${fmtUsd(tw_t.sum.spend)}</span><span class="wr-ch-d ${dTSpend.cls}">${dTSpend.arr}${dTSpend.txt}</span></div>
          <div><span class="wr-ch-l">Conv</span><span class="wr-ch-v">${fmtN(tw_t.sum.conv)}</span><span class="wr-ch-d ${dTConv.cls}">${dTConv.arr}${dTConv.txt}</span></div>
          <div><span class="wr-ch-l">CPA</span><span class="wr-ch-v">${tw_t.sum.conv ? fmtUsd(tw_t.sum.spend/tw_t.sum.conv) : '—'}</span><span class="wr-ch-d ${dTCpa.cls}">${dTCpa.arr}${dTCpa.txt}</span></div>
          <div><span class="wr-ch-l">Кліків</span><span class="wr-ch-v">${fmtN(tw_t.sum.clk)}</span><span class="wr-ch-d muted">CTR ${tw_t.sum.imp ? fmtPct(tw_t.sum.clk/tw_t.sum.imp) : '—'}</span></div>
        </div>
      </div>
      <div class="wr-ch meta">
        <div class="wr-ch-head"><div class="wr-ch-logo">M</div><div class="wr-ch-name">Meta Ads</div><span class="status-pill limited">GA4 only</span></div>
        <div class="wr-ch-row">
          <div><span class="wr-ch-l">Spend</span><span class="wr-ch-v muted">—</span><span class="wr-ch-d muted">кабінет недоступний</span></div>
          <div><span class="wr-ch-l">Сесії GA4</span><span class="wr-ch-v">${fmtN(metaPaidSess)}</span><span class="wr-ch-d muted">90д агрегат</span></div>
          <div><span class="wr-ch-l">Conv events</span><span class="wr-ch-v">${fmtN(metaPaidConv)}</span><span class="wr-ch-d muted">не unique</span></div>
          <div><span class="wr-ch-l">CPA</span><span class="wr-ch-v muted">—</span><span class="wr-ch-d muted">потрібен Marketing API</span></div>
        </div>
      </div>
    </div>
  `;
}

function renderPaid() {
  // Weekly report (independent of period)
  renderWeeklyReport();

  // Update period label
  const paidPeriodEl = $('paidPeriodLabel');
  if (paidPeriodEl) {
    const fmt = d => d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
    paidPeriodEl.textContent = `${fmt(state.from)} → ${fmt(state.to)} (${Math.round((state.to - state.from)/86400000)+1} днів)`;
  }

  const gd = aggGAdsDaily(state.from, state.to);
  const td = aggTTDaily(state.from, state.to);
  const totalSpend = gd.sum.spend_usd + td.sum.spend;
  const totalClk = gd.sum.clk + td.sum.clk;
  const totalConv = gd.sum.conv + td.sum.conv;
  const blendedCpl = totalConv ? totalSpend / totalConv : 0;

  $('kpiPaid').innerHTML = [
    kpiCard({ color: 'green', label: 'Total paid spend', val: fmtUsd(totalSpend), unit: 'USD', sub: 'Google + TikTok за ' + Math.round((state.to - state.from)/86400000+1) + ' днів' }),
    kpiCard({ color: 'blue', label: 'Total clicks', val: fmtN(totalClk), sub: 'клікі в кабінетах' }),
    kpiCard({ color: 'amber', label: 'Конверсії (cabinet)', val: fmtN(totalConv), sub: 'реєстрації з пікселів' }),
    kpiCard({ color: 'pink', label: 'Blended CPL', val: blendedCpl ? fmtUsd(blendedCpl) : '—', sub: blendedCpl ? `${fmtN(totalConv)} конв з кабінетів` : '' }),
  ].join('');

  // Paid cards — однакова висота, по 8 metrics в кожній
  const metaSess90 = D.meta.utm_90d.reduce((a,r)=>a+r.s,0);
  const metaNu90 = D.meta.utm_90d.reduce((a,r)=>a+r.nu,0);
  const metaConv90 = D.meta.utm_90d.reduce((a,r)=>a+r.c,0);
  $('paidCards').innerHTML = `
    <div class="paid-card google">
      <div class="paid-head"><div class="paid-logo">G</div>
        <div><div class="paid-name">Google Ads</div><div class="paid-sub">Customer 3651749366 · AED → USD</div></div>
        <span class="status-pill live" style="margin-left:auto;">live</span>
      </div>
      <div class="paid-metric-row">
        <div class="paid-metric"><div class="l">Spend USD</div><div class="v">${fmtUsd(gd.sum.spend_usd)}</div></div>
        <div class="paid-metric"><div class="l">Imp</div><div class="v">${fmtN(gd.sum.imp)}</div></div>
        <div class="paid-metric"><div class="l">CPM USD</div><div class="v">${gd.sum.imp ? fmtUsd(gd.sum.spend_usd / gd.sum.imp * 1000) : '—'}</div></div>
        <div class="paid-metric"><div class="l">Clicks</div><div class="v">${fmtN(gd.sum.clk)}</div></div>
        <div class="paid-metric"><div class="l">CTR</div><div class="v">${gd.sum.imp ? fmtPct(gd.sum.clk/gd.sum.imp) : '—'}</div></div>
        <div class="paid-metric"><div class="l">CPC USD</div><div class="v">${gd.sum.clk ? fmtUsd(gd.sum.spend_usd/gd.sum.clk) : '—'}</div></div>
        <div class="paid-metric"><div class="l">Conv (cabinet)</div><div class="v">${fmtN(gd.sum.conv)}</div></div>
        <div class="paid-metric"><div class="l">CPA USD</div><div class="v">${gd.sum.conv ? fmtUsd(gd.sum.spend_usd/gd.sum.conv) : '—'}</div></div>
      </div>
      <div class="muted" style="font-size:11px;margin-top:6px;">% від total spend: <b style="color:var(--text-primary);">${totalSpend ? ((gd.sum.spend_usd/totalSpend)*100).toFixed(0)+'%' : '—'}</b></div>
    </div>
    <div class="paid-card tiktok">
      <div class="paid-head"><div class="paid-logo">♪</div>
        <div><div class="paid-name">TikTok Ads</div><div class="paid-sub">Adv 7587396752228171783 · USD</div></div>
        <span class="status-pill live" style="margin-left:auto;">live</span>
      </div>
      <div class="paid-metric-row">
        <div class="paid-metric"><div class="l">Spend USD</div><div class="v">${fmtUsd(td.sum.spend)}</div></div>
        <div class="paid-metric"><div class="l">Imp</div><div class="v">${fmtN(td.sum.imp)}</div></div>
        <div class="paid-metric"><div class="l">CPM USD</div><div class="v">${td.sum.imp ? fmtUsd(td.sum.spend / td.sum.imp * 1000) : '—'}</div></div>
        <div class="paid-metric"><div class="l">Clicks</div><div class="v">${fmtN(td.sum.clk)}</div></div>
        <div class="paid-metric"><div class="l">CTR</div><div class="v">${td.sum.imp ? fmtPct(td.sum.clk/td.sum.imp) : '—'}</div></div>
        <div class="paid-metric"><div class="l">CPC USD</div><div class="v">${td.sum.clk ? fmtUsd(td.sum.spend/td.sum.clk) : '—'}</div></div>
        <div class="paid-metric"><div class="l">Conv (cabinet)</div><div class="v">${fmtN(td.sum.conv)}</div></div>
        <div class="paid-metric"><div class="l">CPL USD</div><div class="v">${td.sum.conv ? fmtUsd(td.sum.spend/td.sum.conv) : '—'}</div></div>
      </div>
      <div class="muted" style="font-size:11px;margin-top:6px;">% від total spend: <b style="color:var(--text-primary);">${totalSpend ? ((td.sum.spend/totalSpend)*100).toFixed(0)+'%' : '—'}</b></div>
    </div>
    <div class="paid-card meta">
      <div class="paid-head"><div class="paid-logo">M</div>
        <div><div class="paid-name">Meta Ads</div><div class="paid-sub">GA4 only · 90 днів · API не доступний</div></div>
        <span class="status-pill limited" style="margin-left:auto;">limited</span>
      </div>
      <div class="paid-metric-row">
        <div class="paid-metric"><div class="l">Spend USD</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">CPC</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">Imp</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">Clicks (cab)</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">CTR</div><div class="v">—</div></div>
        <div class="paid-metric"><div class="l">Сесії GA4</div><div class="v">${fmtN(metaSess90)}</div></div>
        <div class="paid-metric"><div class="l">Нові юзери</div><div class="v">${fmtN(metaNu90)}</div></div>
        <div class="paid-metric"><div class="l">Conv GA4 events</div><div class="v">${fmtN(metaConv90)}</div></div>
      </div>
      <div class="muted" style="font-size:11px;margin-top:6px;">⚠ Meta for Developers не дає developer аккаунту — кабінетні дані недоступні. GA4 conv = event count, не unique users.</div>
    </div>
  `;

  // Spend chart — приховую дні з 0 spend
  const allDaysRaw2 = Array.from(new Set([...Object.keys(gd.byDay), ...Object.keys(td.byDay)])).sort();
  const days = allDaysRaw2.filter(d => ((gd.byDay[d]||{}).spend_usd || 0) + ((td.byDay[d]||{}).spend || 0) > 0.01);
  destroy('paidSpendChart');
  charts.paidSpendChart = new Chart($('paidSpendChart'), {
    type: 'bar',
    data: {
      labels: days.map(d => d.slice(4,6)+'.'+d.slice(6,8)),
      datasets: [
        { label: 'Google Ads', data: days.map(d => (gd.byDay[d]||{}).spend_usd || 0), backgroundColor: '#3B82F6', stack: 'spend' },
        { label: 'TikTok', data: days.map(d => (td.byDay[d]||{}).spend || 0), backgroundColor: '#BE1C9A', stack: 'spend' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: gridScale({ stacked: true, ticks: { maxTicksLimit: 14 } }), y: gridScale({ stacked: true, ticks: { callback: v => '$' + v } }) },
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtUsd(ctx.parsed.y)}` } } },
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
  // Period-aware aggregation: for ≤30d use daily_by_camp_30d, for >30d use static 30d snapshot
  const { camps: periodCamps, isApprox: gadsApprox, days: gadsDays, note: gadsNote } = aggGAdsCampaigns(state.from, state.to);
  const allCamps = periodCamps;
  const c30 = state.gadsFilter === 'active'
    ? allCamps.filter(c => c.status === 'ENABLED' || c.cost_usd > 0)
    : allCamps;
  const totalSpendUsd = c30.reduce((a,c)=>a+c.cost_usd,0);
  const totalSpendAed = c30.reduce((a,c)=>a+c.cost_aed,0);
  const totalImp = c30.reduce((a,c)=>a+c.imp,0);
  const totalClk = c30.reduce((a,c)=>a+c.clk,0);
  const totalConv = c30.reduce((a,c)=>a+c.conv,0);
  const avgIs = c30.filter(c=>c.is>0).reduce((a,c,i,arr)=>a+c.is/arr.length,0);
  const ctr = totalImp ? totalClk/totalImp : 0;
  const cpcUsd = totalClk ? totalSpendUsd/totalClk : 0;

  const activeCount = allCamps.filter(c => c.status === 'ENABLED').length;
  const cpmUsd = totalImp ? totalSpendUsd / totalImp * 1000 : 0;
  const periodLabel = `за ${gadsDays || Math.round((state.to - state.from)/86400000)+1} днів`;
  $('kpiGads').innerHTML = [
    kpiCard({ color: 'green', label: 'Spend USD', val: fmtUsd(totalSpendUsd), sub: fmtAed(totalSpendAed) + ' · ' + periodLabel }),
    kpiCard({ color: 'purple', label: 'Активних', val: activeCount, sub: `${allCamps.length} всього в акаунті` }),
    kpiCard({ color: 'blue', label: 'Кліків', val: fmtN(totalClk), sub: fmtN(totalImp) + ' імп' }),
    kpiCard({ color: 'amber', label: 'CTR', val: fmtPct(ctr) }),
    kpiCard({ color: 'pink', label: 'CPC USD', val: fmtUsd(cpcUsd), sub: `CPM ${fmtUsd(cpmUsd)}` }),
    kpiCard({ color: 'teal', label: 'Avg Imp Share', val: fmtPct(avgIs), sub: 'Search кампанії' }),
  ].join('');

  // Show approx notice if applicable
  const approxEl = $('gadsApproxNotice');
  if (approxEl) {
    if (gadsApprox) {
      approxEl.innerHTML = `<b>⚠ Snapshot за 30 днів</b> — обраний період ${gadsDays} днів, але per-campaign daily-розбивка обмежена 30-денним вікном API. Цифри по кампаніях/ad groups показані за 30д. KPI на топі — точні за період.`;
      approxEl.style.display = 'block';
    } else {
      approxEl.style.display = 'none';
    }
  }

  // Daily spend chart — only days in selected period, sorted asc
  const daily = D.gads.daily_90d.slice()
    .filter(d => inRange(d.d, state.from, state.to))
    .sort((a,b) => a.d.localeCompare(b.d));
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

  // === Google Ads Ad Groups ===
  const activeCampIds = new Set(c30.map(c => c.id));
  const allAgs = D.gads.ad_groups_30d || [];
  const agsFiltered = state.gadsFilter === 'active'
    ? allAgs.filter(g => activeCampIds.has(g.campaign_id) && g.cost_usd > 0)
    : allAgs;
  const agsSorted = agsFiltered.slice().sort((a,b) => b.cost_usd - a.cost_usd).slice(0, 30);
  $('gadsAdGroupsTable').querySelector('tbody').innerHTML = agsSorted.map(g => `
    <tr>
      <td><b>${g.name}</b></td>
      <td class="muted" title="${g.campaign_name}">${g.campaign_name.slice(0, 30)}</td>
      <td class="num"><b>${fmtUsd(g.cost_usd)}</b></td>
      <td class="num">${fmtN(g.imp)}</td>
      <td class="num">${g.imp ? fmtUsd(g.cost_usd/g.imp*1000) : '—'}</td>
      <td class="num">${fmtN(g.clk)}</td>
      <td class="num">${g.imp ? fmtPct(g.clk/g.imp) : '—'}</td>
      <td class="num">${g.clk ? fmtUsd(g.cost_usd/g.clk) : '—'}</td>
      <td class="num">${fmtN(g.conv)}</td>
      <td class="num">${g.conv ? `<span class="badge ${g.cost_usd/g.conv < 1 ? 'green' : g.cost_usd/g.conv < 3 ? 'amber' : 'red'}">${fmtUsd(g.cost_usd/g.conv)}</span>` : '<span class="muted">—</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:20px;">Немає adgroups за фільтром</td></tr>';

  // Ad group insight
  const gAgWin = agsFiltered.filter(g => g.conv >= 5).sort((a,b) => (a.cost_usd/a.conv) - (b.cost_usd/b.conv)).slice(0, 3);
  const gAgBad = agsFiltered.filter(g => g.cost_usd > 20 && g.conv === 0).slice(0, 3);
  let gAgInsight = '<b>📊 Інсайти по ad groups:</b><br>';
  if (gAgWin.length) {
    gAgInsight += `🏆 <b>Кращі CPA:</b> ${gAgWin.map(g => `"${g.name.slice(0, 28)}" CPA ${fmtUsd(g.cost_usd/g.conv)} (${g.conv.toFixed(0)} конв)`).join(' · ')}.`;
  }
  if (gAgBad.length) {
    gAgInsight += `<br>⛔ <b>Без результату:</b> ${gAgBad.map(g => `"${g.name.slice(0, 28)}" (${fmtUsd(g.cost_usd)}, 0 conv)`).join(' · ')}.`;
  }
  $('gadsAdGroupsInsight').innerHTML = gAgInsight;

  // Top keywords (50, full width with cpc/cpa)
  const kws = D.gads.keywords_30d.slice(0, 50);
  $('gadsKwTable').querySelector('tbody').innerHTML = kws.map(k => `
    <tr>
      <td class="mono" title="${k.kw}"><b>${k.kw}</b></td>
      <td><span class="badge gray">${k.mt}</span></td>
      <td class="muted" title="${k.camp}">${k.camp.length > 25 ? k.camp.slice(0,25)+'…' : k.camp}</td>
      <td class="num">${fmtUsd(k.cost_usd)}</td>
      <td class="num">${fmtN(k.imp)}</td>
      <td class="num">${fmtN(k.clk)}</td>
      <td class="num"><span class="badge ${k.ctr > 0.05 ? 'green' : k.ctr > 0.02 ? 'amber' : 'red'}">${fmtPct(k.ctr)}</span></td>
      <td class="num">${k.clk ? fmtUsd(k.cost_usd/k.clk) : '—'}</td>
      <td class="num">${fmtN(k.conv)}</td>
      <td class="num">${k.conv ? fmtUsd(k.cost_usd/k.conv) : '—'}</td>
    </tr>`).join('');

  // Keyword insights
  const topKwBySpend = kws.slice(0, 3);
  const topKwByConv = kws.filter(k => k.conv > 5).sort((a,b)=>(a.cost_usd/a.conv)-(b.cost_usd/b.conv)).slice(0, 3);
  const wasteKw = kws.filter(k => k.cost_usd > 10 && k.conv === 0).slice(0, 3);
  $('gadsKwInsight').innerHTML = `
    <b>📊 Інсайти по ключах:</b><br>
    🏆 <b>Топ за обсягом spend:</b> ${topKwBySpend.map(k => `"${k.kw}" (${fmtUsd(k.cost_usd)})`).join(', ')}.
    ${topKwByConv.length ? `<br>🎯 <b>Найдешевші конв:</b> ${topKwByConv.map(k => `"${k.kw}" (CPA ${fmtUsd(k.cost_usd/k.conv)}, ${k.conv} конв)`).join(', ')}. — масштабуй ці.` : ''}
    ${wasteKw.length ? `<br>⛔ <b>Прокляті ключі (spend > $10, 0 conv):</b> ${wasteKw.map(k => `"${k.kw}" (${fmtUsd(k.cost_usd)})`).join(', ')}. Додай негативи або ріж.` : ''}
  `;

  // Top ads (30)
  const ads = D.gads.ads_30d.slice(0, 30);
  $('gadsAdsTable').querySelector('tbody').innerHTML = ads.map(a => `
    <tr>
      <td title="${a.headline}"><b>${a.headline}</b></td>
      <td class="muted" title="${a.ag}">${a.ag.length > 22 ? a.ag.slice(0,22)+'…' : a.ag}</td>
      <td class="muted" title="${a.camp}">${a.camp.length > 22 ? a.camp.slice(0,22)+'…' : a.camp}</td>
      <td class="num">${fmtUsd(a.cost_usd)}</td>
      <td class="num">${fmtN(a.imp)}</td>
      <td class="num">${fmtN(a.clk)}</td>
      <td class="num">${fmtPct(a.ctr)}</td>
      <td class="num">${fmtN(a.conv)}</td>
      <td class="num">${a.conv ? fmtUsd(a.cost_usd/a.conv) : '—'}</td>
    </tr>`).join('');

  // Ad insights
  const topAds = ads.filter(a => a.conv > 10).sort((a,b)=>(a.cost_usd/a.conv)-(b.cost_usd/b.conv)).slice(0, 3);
  $('gadsAdsInsight').innerHTML = topAds.length ? `
    <b>🎯 Топ-3 оголошення за CPA:</b> ${topAds.map(a => `"${a.headline.slice(0,40)}" (CPA ${fmtUsd(a.cost_usd/a.conv)}, ${a.conv} конв)`).join(' · ')}. Зроби ще варіації цих головних меседжів.
  ` : '<b>📋 Розрахуй CPA по оголошенням</b> щоб виявити лідерів — поки конверсій замало для надійних висновків.';
}

// ============================================================
// TIKTOK
// ============================================================

function renderTikTok() {
  const camplist = D.tiktok.campaigns_list || [];
  const adslist = D.tiktok.ads_list || [];
  const ags = D.tiktok.ad_groups_30d || [];

  // Active campaigns IDs
  const activeCampIds = new Set(camplist.filter(c => c.status && c.status.includes('ENABLE')).map(c => c.id));

  const allCamps = D.tiktok.campaigns_30d || [];
  const allAds = D.tiktok.ads_30d || [];

  const camps = state.ttFilter === 'active'
    ? allCamps.filter(c => activeCampIds.has(String(c.campaign_id)) || c.spend > 0)
    : allCamps;
  const ads = state.ttFilter === 'active'
    ? allAds.filter(a => a.spend > 0)
    : allAds;

  const totalSpend = camps.reduce((a,c)=>a+c.spend,0);
  const totalImp = camps.reduce((a,c)=>a+c.imp,0);
  const totalClk = camps.reduce((a,c)=>a+c.clk,0);
  const totalConv = camps.reduce((a,c)=>a+c.conv,0);
  const ctr = totalImp ? totalClk/totalImp : 0;
  const cpc = totalClk ? totalSpend/totalClk : 0;
  const cpl = totalConv ? totalSpend/totalConv : 0;
  const activeCampsNum = camplist.filter(c => c.status && c.status.includes('ENABLE')).length;

  // Period-aware totals from daily_30d (campaigns_30d залишається 30d snapshot — TikTok API per-campaign daily не підтягуємо)
  const ttPeriodAgg = aggTTDaily(state.from, state.to);
  const periodTotalSpend = ttPeriodAgg.sum.spend;
  const periodTotalImp = ttPeriodAgg.sum.imp;
  const periodTotalClk = ttPeriodAgg.sum.clk;
  const periodTotalConv = ttPeriodAgg.sum.conv;
  const periodCtr = periodTotalImp ? periodTotalClk/periodTotalImp : 0;
  const periodCpc = periodTotalClk ? periodTotalSpend/periodTotalClk : 0;
  const periodCpl = periodTotalConv ? periodTotalSpend/periodTotalConv : 0;
  const periodCpm = periodTotalImp ? periodTotalSpend / periodTotalImp * 1000 : 0;
  const ttDays = Math.round((state.to - state.from)/86400000) + 1;
  const ttPeriodLabel = `за ${ttDays} днів`;

  $('kpiTikTok').innerHTML = [
    kpiCard({ color: 'pink', label: 'Spend USD', val: fmtUsd(periodTotalSpend), sub: ttPeriodLabel }),
    kpiCard({ color: 'green', label: 'Активних', val: activeCampsNum, sub: `${camplist.length} всього в акаунті` }),
    kpiCard({ color: 'blue', label: 'Кліків', val: fmtN(periodTotalClk), sub: fmtN(periodTotalImp) + ' імп' }),
    kpiCard({ color: 'amber', label: 'CTR', val: fmtPct(periodCtr) }),
    kpiCard({ color: 'purple', label: 'CPC USD', val: periodCpc ? fmtUsd(periodCpc) : '—', sub: `CPM ${periodCpm ? fmtUsd(periodCpm) : '—'}` }),
    kpiCard({ color: 'teal', label: 'CPL USD', val: periodCpl ? fmtUsd(periodCpl) : '—', sub: `${fmtN(periodTotalConv)} конв з pixel` }),
  ].join('');

  // Show 30d notice if period > 30d
  const ttApproxEl = $('ttApproxNotice');
  if (ttApproxEl) {
    if (ttDays > 30) {
      ttApproxEl.innerHTML = `<b>⚠ Snapshot за 30 днів</b> — обраний період ${ttDays} днів. Кампанії/ad groups показані за 30д (TikTok API не дає старіше для per-campaign daily). KPI на топі — точні за період в межах 30д.`;
      ttApproxEl.style.display = 'block';
    } else {
      ttApproxEl.style.display = 'none';
    }
  }

  // Daily spend — only days in selected period, hide zero days
  const dailyRaw = (D.tiktok.daily_30d || []).slice()
    .filter(r => {
      const dStr = (r.stat_time_day || '').replace(/-/g, '').slice(0, 8);
      return dStr && inRange(dStr, state.from, state.to);
    })
    .sort((a,b) => (a.stat_time_day || '').localeCompare(b.stat_time_day || ''));
  const daily = dailyRaw.filter(d => d.spend > 0.01);
  destroy('ttDaily');
  charts.ttDaily = new Chart($('ttDaily'), {
    type: 'bar',
    data: {
      labels: daily.map(d => (d.stat_time_day || '').slice(5, 10)),
      datasets: [{ label: 'Spend USD', data: daily.map(d => d.spend), backgroundColor: '#BE1C9A' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale({ ticks: { maxTicksLimit: 14 } }), y: gridScale({ ticks: { callback: v => '$' + v } }) },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtUsd(ctx.parsed.y)}` } } },
    },
  });

  const dailyConv = dailyRaw.filter(d => d.spend > 0.01 || d.conv > 0);
  destroy('ttConvTrend');
  charts.ttConvTrend = new Chart($('ttConvTrend'), {
    type: 'line',
    data: {
      labels: dailyConv.map(d => (d.stat_time_day || '').slice(5, 10)),
      datasets: [
        { label: 'Конверсії з pixel', data: dailyConv.map(d => d.conv), borderColor: '#06D6A0', backgroundColor: 'rgba(6,214,160,.15)', tension: .3, fill: true, yAxisID: 'y' },
        { label: 'CPA USD', data: dailyConv.map(d => d.cpa), borderColor: '#F59E0B', backgroundColor: 'transparent', tension: .3, yAxisID: 'y1', pointRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale({ ticks: { maxTicksLimit: 14 } }), y: gridScale({ title: { display: true, text: 'Конверсії', color: '#06D6A0' } }), y1: gridScale({ position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => '$' + v }, title: { display: true, text: 'CPA USD', color: '#F59E0B' } }) },
    },
  });

  // Campaign table
  const camp_by_id = {};
  camplist.forEach(c => { camp_by_id[c.id] = c; });

  const tbody = $('ttCampTable').querySelector('tbody');
  tbody.innerHTML = camps.sort((a,b)=>b.spend-a.spend).map(c => {
    const cId = String(c.campaign_id);
    const meta = camp_by_id[cId] || {};
    const campName = meta.name || c.campaign_name || cId;
    const type = (function(){
      const n = campName.toLowerCase();
      if (n.includes('brand') || n.includes('business')) return { lbl: 'Brands', cls: 'pink' };
      if (n.includes('creator') || n.includes('blogger') || n.includes('lead')) return { lbl: 'Creators', cls: 'green' };
      if (n.includes('community') || n.includes('reach') || n.includes('top-video')) return { lbl: 'Awareness', cls: 'amber' };
      return { lbl: 'Other', cls: 'gray' };
    })();
    const stat = (meta.status||'').replace('CAMPAIGN_STATUS_','').replace('_',' ').toLowerCase();
    const statCls = stat.includes('enable') ? 'live' : stat.includes('disable') ? 'paused' : 'limited';
    return `
      <tr class="row-clickable" data-cid="${cId}">
        <td><span class="row-expand">▸</span></td>
        <td><b>${campName}</b> <span class="badge ${type.cls}">${type.lbl}</span></td>
        <td><span class="status-pill ${statCls}">${stat || '—'}</span></td>
        <td class="muted">${(meta.objective||'').replace('OBJECTIVE_TYPE_','').replace('_',' ').toLowerCase() || '—'}</td>
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

  // Lookup maps
  const ad_meta = {};
  adslist.forEach(a => { ad_meta[a.id] = a; });
  const camp_meta = {};
  camplist.forEach(c => { camp_meta[c.id] = c; });
  const ag_meta = {};
  (D.tiktok.adgroups_list || []).forEach(g => { ag_meta[g.id] = g; });

  function classifyByName(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('brand') || n.includes('business') || n.includes('b2b')) return { lbl: 'Brands', cls: 'pink' };
    if (n.includes('creator') || n.includes('blogger') || n.includes('lead')) return { lbl: 'Creators', cls: 'green' };
    if (n.includes('community') || n.includes('reach') || n.includes('top-video')) return { lbl: 'Awareness', cls: 'amber' };
    return { lbl: 'Other', cls: 'gray' };
  }

  // === Ad Groups table (зведено по adset) ===
  const allAgs = D.tiktok.ad_groups_30d || [];
  const agsFiltered = state.ttFilter === 'active'
    ? allAgs.filter(g => {
        const gMeta = ag_meta[String(g.adgroup_id)];
        return (gMeta && gMeta.op_status === 'ENABLE') || g.spend > 0;
      })
    : allAgs;

  const agsSorted = agsFiltered.slice().sort((a,b) => b.spend - a.spend);
  $('ttAdGroupsTable').querySelector('tbody').innerHTML = agsSorted.map(g => {
    const gMeta = ag_meta[String(g.adgroup_id)] || {};
    const cMeta = camp_meta[String(g.campaign_id)] || {};
    const agName = gMeta.name || g.adgroup_name || g.adgroup_id;
    const campName = cMeta.name || g.campaign_name || '—';
    const isActive = gMeta.op_status === 'ENABLE';
    return `
      <tr>
        <td><b>${agName}</b></td>
        <td class="muted" title="${campName}">${campName.slice(0, 32)}</td>
        <td><span class="status-pill ${isActive ? 'live' : 'paused'}">${isActive ? 'active' : 'paused'}</span></td>
        <td class="num"><b>${fmtUsd(g.spend)}</b></td>
        <td class="num">${fmtN(g.imp)}</td>
        <td class="num">${g.imp ? fmtUsd(g.spend/g.imp*1000) : '—'}</td>
        <td class="num">${fmtN(g.clk)}</td>
        <td class="num">${g.imp ? fmtPct(g.clk/g.imp) : '—'}</td>
        <td class="num">${g.clk ? fmtUsd(g.spend/g.clk) : '—'}</td>
        <td class="num">${fmtN(g.conv)}</td>
        <td class="num">${g.conv ? `<span class="badge ${g.spend/g.conv < 3 ? 'green' : g.spend/g.conv < 6 ? 'amber' : 'red'}">${fmtUsd(g.spend/g.conv)}</span>` : '<span class="muted">—</span>'}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="11" class="muted" style="text-align:center;padding:20px;">Немає adsets за обраним фільтром</td></tr>';

  // Ad Groups insight
  const agWin = agsFiltered.filter(g => g.conv >= 3).sort((a,b) => (a.spend/a.conv) - (b.spend/b.conv)).slice(0, 3);
  const agBad = agsFiltered.filter(g => g.spend > 20 && g.conv === 0).slice(0, 3);
  let agInsight = '<b>📊 Інсайти по adsets:</b><br>';
  if (agWin.length) {
    agInsight += `🏆 <b>Кращі CPL:</b> ${agWin.map(g => {
      const gm = ag_meta[String(g.adgroup_id)] || {};
      return `"${(gm.name || g.adgroup_id).slice(0, 30)}" CPL ${fmtUsd(g.spend/g.conv)} (${g.conv} конв)`;
    }).join(' · ')}.`;
  }
  if (agBad.length) {
    agInsight += `<br>⛔ <b>Дорогі без результату:</b> ${agBad.map(g => {
      const gm = ag_meta[String(g.adgroup_id)] || {};
      return `"${(gm.name || g.adgroup_id).slice(0, 30)}" (spend ${fmtUsd(g.spend)}, 0 conv)`;
    }).join(' · ')}. Пауза або зміна.`;
  }
  $('ttAdGroupsInsight').innerHTML = agInsight;

  // === Top ads з фільтром за operation_status ===
  const adsFiltered = state.ttFilter === 'active'
    ? ads.filter(a => {
        const m = ad_meta[String(a.ad_id)];
        return (m && m.op_status === 'ENABLE') || a.spend > 0;
      })
    : ads;
  const adsByCpl = adsFiltered.slice().sort((a,b) => b.spend - a.spend).slice(0, 30);

  $('ttAdsTable').querySelector('tbody').innerHTML = adsByCpl.map(a => {
    const m = ad_meta[String(a.ad_id)] || {};
    const itemId = m.item_id;
    const adName = m.name || a.ad_id || '';
    const agName = m.adgroup_name || '—';
    const campName = m.campaign_name || a.campaign_name || '—';
    const type = classifyByName(campName);
    const isActive = m.op_status === 'ENABLE';
    const link = itemId
      ? `<a href="https://www.tiktok.com/@mypintop_ua/video/${itemId}" target="_blank" style="color:var(--green);text-decoration:underline;font-size:11px;">▶</a>`
      : '<span class="muted">—</span>';
    return `
      <tr>
        <td title="${adName}"><b>${adName.slice(0, 28)}</b></td>
        <td><span class="badge ${type.cls}">${type.lbl}</span></td>
        <td class="muted" title="${agName}">${agName.slice(0, 22)}</td>
        <td><span class="status-pill ${isActive ? 'live' : 'paused'}">${isActive ? 'active' : 'paused'}</span></td>
        <td class="num"><b>${fmtUsd(a.spend)}</b></td>
        <td class="num">${fmtN(a.clk)}</td>
        <td class="num">${a.imp ? fmtPct(a.clk/a.imp) : '—'}</td>
        <td class="num">${fmtN(a.conv)}</td>
        <td class="num">${a.conv ? `<span class="badge ${a.spend/a.conv < 3 ? 'green' : a.spend/a.conv < 6 ? 'amber' : 'red'}">${fmtUsd(a.spend/a.conv)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${link}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:20px;">Немає креативів за обраним фільтром</td></tr>';

  // Ad insights TT
  const winners = adsFiltered.filter(a => a.conv >= 3).sort((a,b) => (a.spend/a.conv)-(b.spend/b.conv)).slice(0, 3);
  const wasteAds = adsFiltered.filter(a => a.spend > 15 && a.conv === 0).slice(0, 3);
  let ttInsightHtml = '<b>🎯 Інсайти креативи TikTok:</b><br>';
  if (winners.length) {
    ttInsightHtml += `🏆 <b>Топ-${winners.length} CPL переможців:</b> ${winners.map(w => {
      const m = ad_meta[String(w.ad_id)] || {};
      return `"${(m.name || w.ad_id || '').slice(0, 28)}" (CPL ${fmtUsd(w.spend/w.conv)}, ${w.conv} конв)`;
    }).join(' · ')}. — масштабуй або копіюй стиль (історично tt_item_id 7576247557655891256 і 7595134551362456844 давали CPL $1.44-$1.82).`;
  }
  if (wasteAds.length) {
    ttInsightHtml += `<br>⛔ <b>Витратні без результату (spend > $15, 0 conv):</b> ${wasteAds.map(w => {
      const m = ad_meta[String(w.ad_id)] || {};
      return `"${(m.name || w.ad_id || '').slice(0, 28)}" (${fmtUsd(w.spend)})`;
    }).join(' · ')}. Перевір аудиторію або зміни креатив.`;
  }
  $('ttAdsInsight').innerHTML = ttInsightHtml;

  // Reconcile: TT cabinet (30d) vs GA4 source=tiktok (90d)
  const ga4tt = D.ga4.utm.filter(u => u.src === 'tiktok' && u.med === 'cpc')
                .reduce((a,r) => ({s:a.s+r.s, c:a.c+r.c, nu:a.nu+r.nu}), {s:0, c:0, nu:0});
  $('ttReconcile').innerHTML = `
    <div class="card">
      <div class="card-title">Клікі (30д) vs сесії GA4 (90д)</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div><div class="muted" style="font-size:11px;">TikTok cabinet 30д</div><div style="font-size:24px;font-weight:800;">${fmtN(totalClk)}</div><div class="muted" style="font-size:10px;">кліки в кабінеті</div></div>
        <div style="font-size:20px;color:var(--text-muted);">→</div>
        <div><div class="muted" style="font-size:11px;">GA4 sessions 90д</div><div style="font-size:24px;font-weight:800;">${fmtN(ga4tt.s)}</div><div class="muted" style="font-size:10px;">utm_source=tiktok</div></div>
      </div>
      <div class="muted" style="margin-top:10px;font-size:11px;">Періоди різні (30д vs 90д), тому не повинні точно співпадати. Якщо за 90д GA4 сесії > 3× кабінет 30д — норма (старі кампанії накопичились).</div>
    </div>
    <div class="card">
      <div class="card-title">Конверсії з різних джерел</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div><div class="muted" style="font-size:11px;">Pixel cabinet 30д</div><div style="font-size:24px;font-weight:800;">${fmtN(totalConv)}</div><div class="muted" style="font-size:10px;">ON_WEB_REGISTER події</div></div>
        <div style="font-size:20px;color:var(--text-muted);">→</div>
        <div><div class="muted" style="font-size:11px;">GA4 conv events 90д</div><div style="font-size:24px;font-weight:800;">${fmtN(ga4tt.c)}</div><div class="muted" style="font-size:10px;">event count, не users</div></div>
      </div>
      <div class="muted" style="margin-top:10px;font-size:11px;">Pixel — точніше для performance. GA4 події рахуються кілька разів за сесію.</div>
    </div>
    <div class="card">
      <div class="card-title">Нові юзери з TikTok</div>
      <div style="font-size:30px;font-weight:800;color:var(--green);">${fmtN(ga4tt.nu)}</div>
      <div class="muted" style="margin-top:6px;font-size:12px;">Перших візитів за 90д. Із них дійшли до реєстрації — ${totalConv} (за даними pixel).</div>
      <div class="muted" style="margin-top:10px;font-size:11px;">Conversion rate: ${ga4tt.nu ? ((totalConv/ga4tt.nu*100).toFixed(2)+'%') : '—'} (нові юзери → реєстрація).</div>
    </div>
  `;
}

// ============================================================
// META
// ============================================================

function renderMeta() {
  const stats = D.meta.stats || {};
  const merged = D.meta.utm_merged_90d || [];

  $('kpiMeta').innerHTML = [
    kpiCard({ color: 'blue', label: 'Current Meta (90d)', val: fmtN(stats.current_sess_90d), sub: `активні: Brands 20.04, Creators 18/19.04` }),
    kpiCard({ color: 'pink', label: 'Нові юзери (активні)', val: fmtN(stats.current_nu_90d), sub: 'з нових запусків' }),
    kpiCard({ color: 'green', label: 'GA4 conv events (активні)', val: fmtN(stats.current_conv_90d), sub: 'event count, не users' }),
    kpiCard({ color: 'amber', label: 'У Unknown через paid_social', val: fmtN(stats.paid_social_unknown), sub: 'старі кампанії з неправильним medium' }),
  ].join('');

  // Розбивка по типах
  const byType = {};
  merged.forEach(u => {
    const t = u.meta_class ? u.meta_class.type : 'Other';
    byType[t] = byType[t] || { sess: 0, nu: 0, conv: 0 };
    byType[t].sess += u.s; byType[t].nu += u.nu; byType[t].conv += u.c;
  });

  // Заміна таблиці на merged дані + класифікацію
  $('metaTable').querySelector('tbody').innerHTML = merged.map(u => {
    const cls = u.meta_class || { type: 'Other', cls: 'gray', current: false };
    const srcCls = u.src === 'meta' ? 'blue' : u.src === 'facebook' ? 'red' : u.src === 'instagram' ? 'pink' : 'gray';
    const medWarn = u.med !== 'cpc';
    return `
      <tr${cls.current ? ' style="background:rgba(6,214,160,.04);"' : ''}>
        <td><span class="badge ${srcCls}">${u.src}</span> / ${medWarn ? `<span class="badge red" title="має бути cpc">${u.med}</span>` : `<span class="muted">${u.med}</span>`}</td>
        <td class="mono" title="${u.camp}"><b>${u.camp.length > 48 ? u.camp.slice(0,48)+'…' : u.camp}</b>${u.variants > 1 ? ` <span class="muted" style="font-size:10px;" title="склеєно ${u.variants} варіантів URL-encoded">×${u.variants}</span>` : ''}<br><span class="badge ${cls.cls}">${cls.type}${cls.current ? ' · active' : ''}</span></td>
        <td class="num"><b>${fmtN(u.s)}</b></td>
        <td class="num">${fmtN(u.es)}</td>
        <td class="num">${fmtN(u.nu)}</td>
        <td class="num">${fmtN(u.c)}</td>
        <td class="num">${fmtPct(u.br)}</td>
        <td class="num">${fmtDur(u.asd)}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px;">Немає Meta UTM-трафіку у GA4 за 90д</td></tr>';

  // Hygiene — тільки Meta-related
  const issues = (D.utm_issues || []).filter(i => ['meta', 'facebook', 'instagram', 'fb', 'ig'].includes(i.src));
  if (issues.length === 0) {
    $('metaHygiene').innerHTML = `<div class="notice success"><span class="ic">✓</span> Не знайдено помилок UTM в Meta за 90 днів.</div>`;
  } else {
    $('metaHygiene').innerHTML = issues.map(i => {
      const errCls = i.issues.some(iss => iss.includes('wrong') || iss.includes('macro')) ? 'error' : 'warn';
      return `
      <div class="issue-item ${errCls}">
        <div style="flex:1;">
          <div class="issue-title">${i.src} / ${i.med} · ${(i.camp || '').slice(0,60)}${i.variants > 1 ? ` <span class="muted" style="font-size:10px;">×${i.variants}</span>` : ''}</div>
          <div class="issue-body">
            ${i.issues.map(iss => `<span class="badge ${iss.includes('wrong') || iss.includes('macro') ? 'red' : 'amber'}">${iss}</span>`).join(' ')}
            · <b>${fmtN(i.s)}</b> сесій · ${fmtN(i.c)} конв
          </div>
        </div>
      </div>
    `;
    }).join('');
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

  // Campaigns table — використовуємо merged щоб URL-encoded дублі не плодились
  const utmForTable = (D.ga4.utm_merged || utm).slice().sort((a,b)=>b.s-a.s).slice(0, 50);
  $('utmCampTable').querySelector('tbody').innerHTML = utmForTable.map(u => `
    <tr>
      <td><b>${u.src}</b> / <span class="muted">${u.med}</span></td>
      <td class="mono" title="${u.camp}">${u.camp.length > 60 ? u.camp.slice(0,60)+'…' : u.camp}${u.variants && u.variants > 1 ? ` <span class="muted" style="font-size:10px;" title="склеєно ${u.variants} URL-encoded варіантів">×${u.variants}</span>` : ''}</td>
      <td class="num">${fmtN(u.s)}</td>
      <td class="num">${fmtN(u.nu)}</td>
      <td class="num">${fmtN(u.c)}</td>
      <td class="num">${fmtN(u.es)}</td>
      <td class="num">${u.s ? fmtPct(u.c/u.s) : '—'}</td>
    </tr>`).join('');

  // Issues — склеєно по unique issue key, показуємо variants і totals
  $('utmIssues').innerHTML = D.utm_issues.length === 0 ? `
    <div class="notice success"><span class="ic">✓</span> Не знайдено UTM помилок.</div>
  ` : D.utm_issues.map(i => {
    const errCls = i.issues.some(iss => iss.includes('wrong') || iss.includes('macro')) ? 'error' : 'warn';
    return `
    <div class="issue-item ${errCls}">
      <div style="flex:1;">
        <div class="issue-title">${i.src} / ${i.med} · <span class="mono">${(i.camp || '').slice(0,80)}</span>${i.variants > 1 ? ` <span class="muted" style="font-size:10px;">×${i.variants} варіантів склеєно</span>` : ''}</div>
        <div class="issue-body">
          ${i.issues.map(iss => `<span class="badge ${iss.includes('wrong') || iss.includes('macro') ? 'red' : 'amber'}">${iss}</span>`).join(' ')}
          · <b>${fmtN(i.s)}</b> сесій · ${fmtN(i.c)} конв
        </div>
      </div>
    </div>`;
  }).join('');

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

  const totalDevSess = D.ga4.devices_30d.reduce((a,d)=>a+d.s,0);
  $('audDeviceTable').querySelector('tbody').innerHTML = D.ga4.devices_30d.slice(0, 12).map(d => `
    <tr>
      <td><b>${d.dev}</b></td>
      <td class="muted">${d.os}</td>
      <td class="num">${fmtN(d.s)}</td>
      <td class="num">${fmtN(d.u)}</td>
      <td class="num"><span class="badge ${d.br > 0.5 ? 'red' : d.br > 0.3 ? 'amber' : 'green'}">${fmtPct(d.br)}</span></td>
      <td class="num">${totalDevSess ? ((d.s/totalDevSess)*100).toFixed(1)+'%' : '—'}</td>
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

  // Hour (sort by hour)
  const dow = D.ga4.dow_30d || [];
  const hod = (D.ga4.hod_30d || []).slice().sort((a,b) => +a.h - +b.h);
  destroy('audHourDow');
  charts.audHourDow = new Chart($('audHourDow'), {
    type: 'bar',
    data: {
      labels: hod.map(h => h.h.padStart(2, '0') + ':00'),
      datasets: [{
        label: 'Сесії',
        data: hod.map(h => h.s),
        backgroundColor: hod.map(h => {
          const hrs = +h.h;
          if (hrs >= 12 && hrs <= 18) return '#06D6A0';  // day peak
          if (hrs >= 19 && hrs <= 22) return '#7C3AED';  // evening
          return '#3B82F6';  // night/morning
        }),
      }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { x: gridScale(), y: gridScale() },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${fmtN(ctx.parsed.y)} сесій о ${ctx.label}` } } } },
  });

  // Hour insight
  if (hod.length) {
    const peakH = hod.reduce((m,x) => x.s > m.s ? x : m, { s: 0, h: '0' });
    const quietH = hod.reduce((m,x) => x.s < m.s || m.s === 0 ? x : m, { s: Infinity, h: '0' });
    $('audHourInsight').innerHTML = `
      <b>Пік:</b> <b style="color:var(--green)">${peakH.h}:00</b> (${fmtN(peakH.s)} сесій).
      <b>Затишно:</b> <b style="color:var(--text-muted)">${quietH.h}:00</b> (${fmtN(quietH.s)} сесій).
      Планування нових креативів + email-розсилок — ближче до 12-18 години.
    `;
  }

  // DOW chart — GA4 convention: 0=Sunday ... 6=Saturday
  destroy('audDow');
  if (dow.length) {
    const dowNames = { '0': 'Нд', '1': 'Пн', '2': 'Вт', '3': 'Ср', '4': 'Чт', '5': 'Пт', '6': 'Сб' };
    const order = ['1', '2', '3', '4', '5', '6', '0']; // Mon-Sun
    const dowMap = Object.fromEntries(dow.map(d => [String(d.d).trim(), d.s]));
    const labels = order.map(k => dowNames[k]);
    const dataArr = order.map(k => dowMap[k] || 0);
    charts.audDow = new Chart($('audDow'), {
      type: 'bar',
      data: { labels, datasets: [{
        label: 'Сесії',
        data: dataArr,
        backgroundColor: order.map(k => k === '0' || k === '6' ? '#BE1C9A' : '#7C3AED'),
      }] },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { x: gridScale(), y: gridScale() },
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${fmtN(ctx.parsed.y)} сесій · ${ctx.label}` } } } },
    });
  }
}

// ============================================================
// INSIGHTS
// ============================================================

function renderInsights() {
  // Funnel — structured 4-step reg flow
  const funnelByName = {};
  D.ga4.funnel.forEach(f => { funnelByName[f.event] = f; });
  const stepsDef = [
    { step: '1. Перехід на сайт', event: 'session_start', icon: '🌐' },
    { step: '2. Клік "Sign up" (креатор)', event: 'pintop_c_all_signinsignup', icon: '👆' },
    { step: '3. Sign-in AIR (OAuth)', event: 'air_signin_done', icon: '🔐' },
    { step: '4. Завершення креатор-реєстрації', event: 'pintop_c_signin_click', icon: '✅' },
    { step: '+ Brand sign-up (B2B)', event: 'pintop_b_all_signinsignup', icon: '🏢' },
    { step: '+ Demo request (Brands)', event: 'pintopn_b_all_demo', icon: '📅' },
  ];
  const showFunnel = stepsDef.map(s => ({ ...s, ...(funnelByName[s.event] || { count: 0, users: 0, conv: 0 }) }));
  $('funnelTable').querySelector('tbody').innerHTML = showFunnel.map((f, i) => {
    const prev = i > 0 && showFunnel[i-1].users > 0 ? showFunnel[i-1].users : null;
    const dropTxt = prev && f.users ? ((f.users / prev) * 100).toFixed(0) + '%' : i === 0 ? '100%' : '—';
    const dropCls = !prev ? 'gray' : (f.users/prev < 0.2) ? 'red' : (f.users/prev < 0.5) ? 'amber' : 'green';
    return `
      <tr>
        <td>${f.icon} <b>${f.step}</b></td>
        <td class="mono muted">${f.event}</td>
        <td class="num">${fmtN(f.count)}</td>
        <td class="num"><b>${fmtN(f.users)}</b></td>
        <td class="num"><span class="badge ${dropCls}">${dropTxt}</span></td>
        <td class="num">${fmtN(f.conv)}</td>
      </tr>`;
  }).join('');

  // Funnel insight
  const step2 = funnelByName['pintop_c_all_signinsignup'] || { users: 0 };
  const step3 = funnelByName['air_signin_done'] || { users: 0 };
  const signinClick = funnelByName['pintop_c_signin_click'] || { users: 0 };
  const brandReg = funnelByName['pintop_b_all_signinsignup'] || { users: 0 };
  const demoReq = funnelByName['pintopn_b_all_demo'] || { users: 0 };
  const conv23 = step2.users ? (step3.users / step2.users * 100).toFixed(0) : '—';
  $('funnelInsight').innerHTML = `
    <b>📊 Ключові висновки воронки (90 днів):</b><br>
    Клацнули "Sign up" креатора → <b>${fmtN(step2.users)}</b> юзерів.
    Довели OAuth у AIR → <b>${fmtN(step3.users)}</b>. Conversion ${step2.users ? conv23 + '%' : '—'} на цьому кроці.
    <br>B2B активність: <b>${fmtN(brandReg.users)}</b> клікнули на brand sign-up, <b>${fmtN(demoReq.users)}</b> дійшли до Book Demo форми.
    <br><b>⛔ Критично:</b> немає події <code>registration_complete</code> — не можемо виміряти точний CR "перейшов → зареєструвався". PPC оптимізує по проксі-події, що менш точно.
  `;

  // Channel path — реклама vs органіка
  const channels = pickChannelsForPeriod();
  const paidTotal = (channels.find(c => c.ch === 'Paid Social') || { s: 0, c: 0 }).s + (channels.find(c => c.ch === 'Paid Search') || { s: 0, c: 0 }).s;
  const paidConv = (channels.find(c => c.ch === 'Paid Social') || { s: 0, c: 0 }).c + (channels.find(c => c.ch === 'Paid Search') || { s: 0, c: 0 }).c;
  const orgSearch = channels.find(c => c.ch === 'Organic Search') || { s: 0, c: 0, nu: 0 };
  const orgSoc = channels.find(c => c.ch === 'Organic Social') || { s: 0, c: 0, nu: 0 };
  const orgTotal = orgSearch.s + orgSoc.s;
  const orgConv = orgSearch.c + orgSoc.c;
  const direct = channels.find(c => c.ch === 'Direct') || { s: 0, c: 0 };
  const ref = channels.find(c => c.ch === 'Referral') || { s: 0, c: 0 };

  $('channelPath').innerHTML = `
    <div class="card" style="background:linear-gradient(135deg, rgba(124,58,237,.08), rgba(190,28,154,.04));">
      <div class="card-title">🎯 Платний трафік — performance</div>
      <div style="font-size:32px;font-weight:800;color:var(--purple);">${fmtN(paidTotal)}</div>
      <div class="muted">сесій · Paid Search + Paid Social</div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
        <div><span class="muted">Конверсії GA4 events:</span> <b>${fmtN(paidConv)}</b></div>
        <div><span class="muted">CR events:</span> <b>${paidTotal ? (paidConv/paidTotal*100).toFixed(1)+'%' : '—'}</b></div>
        <div style="margin-top:8px;font-size:12px;" class="muted">⚡ Холодний трафік — платить за кожен клік. Висока швидкість тесту, але CPA росте при масштабуванні.</div>
      </div>
    </div>
    <div class="card" style="background:linear-gradient(135deg, rgba(6,214,160,.08), rgba(59,130,246,.04));">
      <div class="card-title">🌱 Органіка — безкоштовний трафік</div>
      <div style="font-size:32px;font-weight:800;color:var(--green);">${fmtN(orgTotal + direct.s + ref.s)}</div>
      <div class="muted">сесій · Organic + Direct + Referral</div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
        <div><span class="muted">Organic Search (SEO):</span> <b>${fmtN(orgSearch.s)}</b> сесій, <b>${fmtN(orgSearch.c)}</b> конв</div>
        <div><span class="muted">Organic Social:</span> <b>${fmtN(orgSoc.s)}</b> сесій</div>
        <div><span class="muted">Direct:</span> <b>${fmtN(direct.s)}</b> сесій (повертаються, bookmarks)</div>
        <div><span class="muted">Referral:</span> <b>${fmtN(ref.s)}</b> сесій (my.milx.app, партнери)</div>
        <div style="margin-top:8px;font-size:12px;" class="muted">🧲 Теплий трафік — вища лояльність. 69% органіки = branded (люди вже знають pin.top).</div>
      </div>
    </div>
  `;

  // Top / Bottom performers
  const allAds = [];
  D.gads.ads_30d.forEach(a => { if (a.conv > 3) allAds.push({ ch: 'Google', name: a.headline, spend: a.cost_usd, conv: a.conv, cpa: a.cost_usd/a.conv }); });
  (D.tiktok.ads_30d || []).forEach(a => {
    if (a.conv > 3) {
      const ad_meta = (D.tiktok.ads_list || []).find(x => x.id === String(a.ad_id));
      allAds.push({ ch: 'TikTok', name: (ad_meta && ad_meta.name) || a.ad_id, spend: a.spend, conv: a.conv, cpa: a.spend/a.conv });
    }
  });
  const topBy = allAds.slice().sort((a,b) => a.cpa - b.cpa).slice(0, 3);

  const allKws = D.gads.keywords_30d.filter(k => k.conv > 3).sort((a,b) => (a.cost_usd/a.conv) - (b.cost_usd/b.conv)).slice(0, 3);

  $('topPerformers').innerHTML = `
    <div style="margin-bottom:12px;"><b style="color:var(--green);">🎬 Топ креативи за CPL:</b></div>
    ${topBy.length ? topBy.map(a => `
      <div class="issue-item" style="border-left-color:var(--green);">
        <div>
          <div class="issue-title">${a.ch}: ${a.name.slice(0, 50)}</div>
          <div class="issue-body">CPL <b style="color:var(--green);">${fmtUsd(a.cpa)}</b> · ${a.conv} конв за ${fmtUsd(a.spend)}</div>
        </div>
      </div>`).join('') : '<div class="muted">Поки замало conv data для надійних переможців</div>'}
    <div style="margin:14px 0 10px;"><b style="color:var(--green);">🔑 Топ ключові слова за CPA:</b></div>
    ${allKws.length ? allKws.map(k => `
      <div class="issue-item" style="border-left-color:var(--green);">
        <div>
          <div class="issue-title">"${k.kw}" <span class="badge gray">${k.mt}</span></div>
          <div class="issue-body">CPA <b style="color:var(--green);">${fmtUsd(k.cost_usd/k.conv)}</b> · ${k.conv} конв · ${fmtN(k.imp)} імп</div>
        </div>
      </div>`).join('') : '<div class="muted">Недостатньо конверсій по ключах</div>'}
  `;

  const wasteAds = [];
  D.gads.ads_30d.filter(a => a.cost_usd > 10 && a.conv === 0).slice(0, 3).forEach(a => wasteAds.push({ ch: 'Google', name: a.headline, spend: a.cost_usd }));
  (D.tiktok.ads_30d || []).filter(a => a.spend > 10 && a.conv === 0).slice(0, 3).forEach(a => {
    const ad_meta = (D.tiktok.ads_list || []).find(x => x.id === String(a.ad_id));
    wasteAds.push({ ch: 'TikTok', name: (ad_meta && ad_meta.name) || a.ad_id, spend: a.spend });
  });
  wasteAds.sort((a,b) => b.spend - a.spend);

  const wasteKws = D.gads.keywords_30d.filter(k => k.cost_usd > 10 && k.conv === 0).slice(0, 3);

  $('bottomPerformers').innerHTML = `
    <div style="margin-bottom:12px;"><b style="color:var(--red);">💸 Креативи що з'їдають бюджет:</b></div>
    ${wasteAds.length ? wasteAds.slice(0, 3).map(a => `
      <div class="issue-item" style="border-left-color:var(--red);">
        <div>
          <div class="issue-title">${a.ch}: ${(a.name || '').slice(0, 50)}</div>
          <div class="issue-body">Spend <b style="color:var(--red);">${fmtUsd(a.spend)}</b> · <b>0 конверсій</b> · зупини або зміни</div>
        </div>
      </div>`).join('') : '<div class="muted">Немає проблемних креативів — добре!</div>'}
    <div style="margin:14px 0 10px;"><b style="color:var(--red);">🚫 Ключі без результату (spend > $10, 0 conv):</b></div>
    ${wasteKws.length ? wasteKws.map(k => `
      <div class="issue-item" style="border-left-color:var(--red);">
        <div>
          <div class="issue-title">"${k.kw}" <span class="badge gray">${k.mt}</span></div>
          <div class="issue-body">Spend <b style="color:var(--red);">${fmtUsd(k.cost_usd)}</b> · 0 конв · додай до негативів</div>
        </div>
      </div>`).join('') : '<div class="muted">Ключі працюють — без marnotratnykh</div>'}
  `;

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

  // Events with avg per user
  $('eventsTable').querySelector('tbody').innerHTML = D.ga4.events_30d.slice(0, 25).map(e => `
    <tr>
      <td class="mono">${e.name}</td>
      <td class="num">${fmtN(e.count)}</td>
      <td class="num">${e.conv > 0 ? `<span class="badge green">${fmtN(e.conv)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="num">${fmtN(e.users)}</td>
      <td class="num">${e.users ? (e.count/e.users).toFixed(1) : '—'}</td>
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

function renderRegistrations() {
  const R = D.registrations || {};
  if (!R.unique_registered) {
    $('kpiReg').innerHTML = '<div class="notice warning">Дані реєстрацій не завантажено. Перевір чи файл pintop_user_id_all.csv в Аналітика/ свіжий.</div>';
    return;
  }
  const f = R.funnel || {};
  const types = R.user_types || {};
  const daily = R.daily || [];

  // === Фільтр по state period ===
  const fromKey = dateKey(state.from);
  const toKey = dateKey(state.to);
  const filtered = daily.filter(r => r.d >= fromKey && r.d <= toKey);
  const allPeriod = filtered.length === daily.length;

  // Агрегати для обраного періоду
  let pBrand = 0, pCreator = 0, pUntagged = 0;
  const ftPeriod = {}, ltPeriod = {};
  const campPeriod = {};
  const FT_CHANNELS = {};
  function classify(src, med) {
    const s = (src||'').toLowerCase(), m = (med||'').toLowerCase();
    if (m === 'cpc') {
      if (s === 'google') return 'Google Ads';
      if (s === 'tiktok') return 'TikTok Ads';
      if (['meta','facebook','instagram','fb','ig'].includes(s)) return 'Meta Ads';
      return 'Paid other';
    }
    if (m === 'paid_social') return 'Meta Ads (paid_social)';
    if (m === 'organic') return (s.includes('google')||s.includes('bing')) ? 'Organic Search' : 'Organic Social';
    if (m === 'referral') {
      if (s.includes('facebook')||s.includes('instagram')||s==='ig') return 'Social Referral';
      if (s.includes('tiktok')) return 'TT Referral';
      if (s.includes('my.milx')||s.includes('my.pin')||s.includes('manager.airmedia')) return 'AIR/pin.top internal';
      if (s.includes('accounts.google')) return 'Google account';
      return 'Referral';
    }
    if (s === '(direct)' || m === '(none)') return 'Direct';
    return (s||m) ? `${s}/${m}` : 'Other';
  }
  filtered.forEach(r => {
    if (r.t === 'brand') pBrand++;
    else if (r.t === 'creator_tagged' || r.t === 'both') pCreator++;
    else pUntagged++;
    const chf = classify(r.src, r.med);
    ftPeriod[chf] = (ftPeriod[chf] || 0) + 1;
    const chl = classify(r.src_l, r.med_l);
    ltPeriod[chl] = (ltPeriod[chl] || 0) + 1;
    if (r.camp && !['(none)','(not set)','(direct)','(organic)','(referral)'].includes(r.camp)) {
      campPeriod[r.camp] = (campPeriod[r.camp] || 0) + 1;
    }
  });
  const periodTotal = filtered.length;

  $('regSubtitle').textContent = allPeriod
    ? `Всі історичні дані · ${R.unique_registered.toLocaleString('uk-UA')} унікальних реєстрацій · оновлено ${R.sheet_modified || '—'}`
    : `Період ${fmtDate(fromKey)} → ${fmtDate(toKey)} · у цьому періоді ${periodTotal} реєстрацій (з ${R.unique_registered.toLocaleString('uk-UA')} всього)`;

  // KPI для обраного періоду
  $('kpiReg').innerHTML = [
    kpiCard({ color: 'green', label: 'Реєстрацій за період', val: fmtN(periodTotal), sub: allPeriod ? 'всі дані' : `${fmtDate(fromKey)} → ${fmtDate(toKey)}` }),
    kpiCard({ color: 'pink', label: 'Бренди (B2B)', val: fmtN(pBrand), sub: periodTotal ? `${((pBrand/periodTotal)*100).toFixed(1)}% від усіх` : '' }),
    kpiCard({ color: 'blue', label: 'Креатори (tagged)', val: fmtN(pCreator), sub: 'з talag або infag тегом' }),
    kpiCard({ color: 'purple', label: 'Generic / без тегу', val: fmtN(pUntagged), sub: periodTotal ? `${((pUntagged/periodTotal)*100).toFixed(0)}% — solo creators` : '' }),
  ].join('');

  // Monthly chart — ПОВНИЙ (з підсвіткою обраного періоду)
  const monthly = R.monthly || [];
  destroy('regMonthly');
  const fromMonth = `${state.from.getFullYear()}-${String(state.from.getMonth()+1).padStart(2,'0')}`;
  const toMonth = `${state.to.getFullYear()}-${String(state.to.getMonth()+1).padStart(2,'0')}`;
  charts.regMonthly = new Chart($('regMonthly'), {
    type: 'bar',
    data: {
      labels: monthly.map(r => r.m),
      datasets: [
        { label: 'Бренди', data: monthly.map(r => r.brand + (r.both||0)), backgroundColor: '#BE1C9A', stack: 's' },
        { label: 'Креатори (tagged)', data: monthly.map(r => r.creator_tagged), backgroundColor: '#06D6A0', stack: 's' },
        { label: 'Generic / untagged', data: monthly.map(r => r.untagged), backgroundColor: '#7C3AED', stack: 's' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: gridScale({ stacked: true,
          ticks: { color: ctx => (ctx.tick.label >= fromMonth && ctx.tick.label <= toMonth) ? '#fff' : 'rgba(255,255,255,.4)' }
        }),
        y: gridScale({ stacked: true }),
      },
      plugins: { legend: { position: 'top' },
        tooltip: { callbacks: { footer: (items) => {
          const total = items.reduce((a,i) => a + i.parsed.y, 0);
          return 'Всього: ' + total + ' реєстрацій';
        } } } },
    },
  });

  const peakM = monthly.reduce((m, x) => x.total > (m.total || 0) ? x : m, {});
  $('regMonthlyInsight').innerHTML = `
    🏆 <b>Пік:</b> ${peakM.m} — <b>${peakM.total}</b> реєстрацій (активний TikTok Lead gen 08.02 з CPL $1.90).
    📅 <b>За обраний період:</b> ${periodTotal} реєстрацій. Типовий тренд: переважна більшість — <b>generic signup</b> (95% історично, без чіткого brand/creator tag). Теги business_done/talag_done/infag_done спрацьовують лише для частини юзерів що проходять окремі флоу; більшість креаторів реєструються "solo" і не отримують tag.
  `;

  // First touch donut — з обраного періоду
  const ftColors = ['#7C3AED', '#3B82F6', '#06D6A0', '#BE1C9A', '#F59E0B', '#F87171', '#14b8a6', '#ec4899', '#84cc16', '#60a5fa'];
  const ftSorted = Object.entries(ftPeriod).sort((a,b) => b[1]-a[1]);
  destroy('regFirstTouch');
  charts.regFirstTouch = new Chart($('regFirstTouch'), {
    type: 'doughnut',
    data: { labels: ftSorted.map(x => x[0]), datasets: [{ data: ftSorted.map(x => x[1]), backgroundColor: ftColors, borderColor: '#141414', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '62%' },
  });
  $('regFirstTouchTable').querySelector('tbody').innerHTML = ftSorted.map(([ch, u], i) => `
    <tr>
      <td><span class="dot" style="background:${ftColors[i % ftColors.length]}"></span>${ch}</td>
      <td class="num">${fmtN(u)}</td>
      <td class="num"><b>${periodTotal ? ((u/periodTotal)*100).toFixed(1) + '%' : '—'}</b></td>
    </tr>`).join('') || '<tr><td colspan="3" class="muted" style="text-align:center;">Немає даних за період</td></tr>';

  // Last touch
  const ltSorted = Object.entries(ltPeriod).sort((a,b) => b[1]-a[1]);
  destroy('regLastTouch');
  charts.regLastTouch = new Chart($('regLastTouch'), {
    type: 'doughnut',
    data: { labels: ltSorted.map(x => x[0]), datasets: [{ data: ltSorted.map(x => x[1]), backgroundColor: ftColors, borderColor: '#141414', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '62%' },
  });
  $('regLastTouchTable').querySelector('tbody').innerHTML = ltSorted.map(([ch, u], i) => `
    <tr>
      <td><span class="dot" style="background:${ftColors[i % ftColors.length]}"></span>${ch}</td>
      <td class="num">${fmtN(u)}</td>
      <td class="num"><b>${periodTotal ? ((u/periodTotal)*100).toFixed(1) + '%' : '—'}</b></td>
    </tr>`).join('') || '<tr><td colspan="3" class="muted" style="text-align:center;">Немає даних за період</td></tr>';

  // Funnel — загальна (events не можна розбивати по датам з agregates, показуємо total + unique з усієї історії)
  const funnelSteps = [
    { step: '1. Клік на "Sign up"', val: f.unique_goto, desc: 'унікальних людей що натиснули', prev: null },
    { step: '2. Прийняв політику', val: f.unique_policy, desc: 'унікальних з Terms accepted', prev: f.unique_goto },
    { step: '3. Завершив auth_success', val: f.unique_auth, desc: '🎯 <b>унікальні реєстранти</b> — KPI', prev: f.unique_goto },
    { step: '4a. Business tag', val: f.unique_business, desc: 'заповнили brand profile (не всі з auth)', prev: null },
    { step: '4b. Creator talag', val: f.unique_talag, desc: 'talent-agency creator', prev: null },
    { step: '4c. Creator infag', val: f.unique_infag, desc: 'influence-agency creator', prev: null },
    { step: '5. Додали pin після реєстрації', val: f.unique_addpin, desc: 'активація продукту', prev: f.unique_auth },
    { step: '— guest mode', val: f.unique_guest, desc: 'дивились без реєстрації', prev: null },
  ];
  $('regFunnelTable').querySelector('tbody').innerHTML = funnelSteps.map(s => {
    const cr = s.prev && s.prev > 0 ? ((s.val / s.prev) * 100).toFixed(0) + '%' : '—';
    const crCls = !s.prev ? 'gray' : (s.val / s.prev) < 0.3 ? 'red' : (s.val / s.prev) < 0.6 ? 'amber' : 'green';
    return `
      <tr>
        <td><b>${s.step}</b></td>
        <td class="num"><b>${fmtN(s.val)}</b></td>
        <td class="num">${s.prev ? `<span class="badge ${crCls}">${cr}</span>` : '<span class="muted">—</span>'}</td>
        <td class="muted">${s.desc}</td>
      </tr>`;
  }).join('');

  const drop = f.unique_goto ? (100 - (f.unique_auth / f.unique_goto * 100)).toFixed(0) : 0;
  $('regFunnelInsight').innerHTML = `
    <b>🔑 Головний висновок воронки (вся історія):</b> <b>${f.unique_goto.toLocaleString()}</b> людей натиснули "Sign up", <b>${f.unique_auth.toLocaleString()}</b> завершили реєстрацію.
    <b style="color:var(--red);">Drop ${drop}%</b> — найбільша діра продукту.<br>
    <b>Типи реєстрацій серед ${R.unique_registered.toLocaleString()} авторизованих:</b>
    Brands <b>${types.brand}</b> (${(types.brand/R.unique_registered*100).toFixed(1)}%),
    Creator tagged <b>${types.creator_tagged}</b> (${(types.creator_tagged/R.unique_registered*100).toFixed(1)}%),
    Both <b>${types.both}</b>,
    <b>Generic/Untagged ${types.untagged}</b> (${(types.untagged/R.unique_registered*100).toFixed(1)}%).
    <br><b>⚠ Увага:</b> теги brand/creator НЕ покривають усіх юзерів. Untagged 95% — це solo-креатори без agency + всі хто не пройшов окремий brand/creator flow. Це означає що точне розділення B2B vs Creator на pin.top через GA4 events неможливе — треба додати реєстраційний prompt "Я бренд / Я креатор" який трекається в GA4.
  `;

  // Top campaigns для обраного періоду
  const campSorted = Object.entries(campPeriod).sort((a,b) => b[1]-a[1]).slice(0, 15);
  const campSum = campSorted.reduce((a,x) => a + x[1], 0);
  $('regCampTable').querySelector('tbody').innerHTML = campSorted.map(([camp, u]) => `
    <tr>
      <td><b>${camp.length > 60 ? camp.slice(0,60)+'…' : camp}</b></td>
      <td class="num">${fmtN(u)}</td>
      <td class="num">${campSum ? ((u/campSum)*100).toFixed(1) + '%' : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="muted" style="text-align:center;">Немає campaign даних за період</td></tr>';
}

function renderActiveTab(tab) {
  // Фільтр каналів має сенс тільки на Overview
  const wrap = $('chFilterWrap');
  if (wrap) wrap.style.display = tab === 'overview' ? 'flex' : 'none';

  try {
    switch (tab) {
      case 'overview': renderOverview(); break;
      case 'paid': renderPaid(); break;
      case 'gads': renderGads(); break;
      case 'tiktok': renderTikTok(); break;
      case 'meta': renderMeta(); break;
      case 'utm': renderUtm(); break;
      case 'organic': renderGsc(); break;
      case 'audience': renderAudience(); break;
      case 'registrations': renderRegistrations(); break;
      case 'insights': renderInsights(); break;
    }
  } catch (err) {
    console.error('Render error on tab', tab, err);
    const panel = document.querySelector(`.tab-panel[data-panel="${tab}"]`);
    if (panel) {
      panel.innerHTML = `
        <div class="notice danger" style="margin:40px 20px;">
          <b>⚠ Помилка рендеру (${tab}):</b> ${err.message || err}<br>
          <button onclick="location.reload(true)" style="margin-top:10px;padding:6px 12px;background:var(--green);color:#0a0a0a;border-radius:6px;font-weight:700;cursor:pointer;">Перезавантажити</button>
        </div>`;
    }
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

  // Multi-select channels filter
  const allChNames = (() => {
    // Use 90d як широкий пул
    const set = new Set();
    D.ga4.channels_30d.forEach(c => set.add(c.ch));
    D.ga4.channels_90d.forEach(c => set.add(c.ch));
    return Array.from(set).filter(c => c).sort();
  })();
  // Init: всі обрані (null = all)
  state.channels = null;

  function rebuildChList() {
    const chMap = {};
    D.ga4.channels_30d.forEach(c => { chMap[c.ch] = c.s; });
    $('chFilterList').innerHTML = allChNames.map(ch => {
      const checked = !state.channels || state.channels.has(ch);
      const color = CHANNEL_COLORS[ch] || '#888';
      return `
        <label class="multi-opt">
          <input type="checkbox" data-ch="${ch}" ${checked ? 'checked' : ''}>
          <span class="multi-dot" style="background:${color}"></span>
          <span>${ch}</span>
          <span class="multi-count">${fmtN(chMap[ch] || 0)}</span>
        </label>`;
    }).join('');
    // Bind
    $('chFilterList').querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (!state.channels) state.channels = new Set(allChNames);
        if (cb.checked) state.channels.add(cb.dataset.ch);
        else state.channels.delete(cb.dataset.ch);
        if (state.channels.size === allChNames.length) state.channels = null;
        updateChBtn();
        renderAll();
      });
    });
  }

  function updateChBtn() {
    const btnLbl = $('chFilterBtn');
    const cnt = $('chFilterBtnCount');
    if (!state.channels || state.channels.size === allChNames.length) {
      btnLbl.firstChild.textContent = 'Всі канали ';
      cnt.textContent = `(${allChNames.length})`;
    } else if (state.channels.size === 0) {
      btnLbl.firstChild.textContent = 'Нічого не обрано ';
      cnt.textContent = '';
    } else {
      btnLbl.firstChild.textContent = `Обрано: `;
      cnt.textContent = `${state.channels.size} / ${allChNames.length}`;
    }
  }

  // Toggle dropdown
  $('chFilterBtn').addEventListener('click', e => {
    e.stopPropagation();
    const dd = $('chFilterDropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', e => {
    if (!$('chFilterWrap').contains(e.target)) $('chFilterDropdown').style.display = 'none';
  });

  // Quick actions
  document.querySelectorAll('[data-ch-action]').forEach(b => {
    b.addEventListener('click', () => {
      const act = b.dataset.chAction;
      if (act === 'all') state.channels = null;
      else if (act === 'none') state.channels = new Set();
      else if (act === 'paid') state.channels = new Set(allChNames.filter(c => PAID_CHANNELS.has(c)));
      else if (act === 'organic') state.channels = new Set(allChNames.filter(c => ORGANIC_CHANNELS.has(c)));
      rebuildChList();
      updateChBtn();
      renderAll();
    });
  });
  rebuildChList();
  updateChBtn();

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

  // Google Ads active/all toggle
  document.querySelectorAll('[data-gads-filter]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-gads-filter]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.gadsFilter = b.dataset.gadsFilter;
      renderGads();
    });
  });

  // TikTok active/all toggle
  document.querySelectorAll('[data-tt-filter]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-tt-filter]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.ttFilter = b.dataset.ttFilter;
      renderTikTok();
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

// Авто-unlock якщо сесія вже була розблокована (виконуємо ОСТАННІМ, коли всі const/функції вже оголошені)
if (sessionStorage.getItem(KEY) === '1') {
  try { unlock({ animate: false }); }
  catch (e) { console.error('[pintop] auto-unlock failed:', e); showInitError(e); }
}

})();
