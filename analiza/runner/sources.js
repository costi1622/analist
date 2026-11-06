// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Surse de date: Trading 212, eToro, Finnhub, BNR.
// Toate cheile vin din env (GitHub Secrets), niciodată din cod.
import { T212_SUFFIX, SYMBOL_OVERRIDES, ETORO_SYMBOL } from './config.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Limita Trading 212 pentru istoric: 6 cereri pe minut, pe fiecare endpoint. Așteptăm doar când chiar ar fi depășită,
// nu înaintea fiecărei cereri (înainte: 10,5 secunde de pauză la fiecare pagină, chiar și la prima).
const LIMITA = {};
export async function t212Rand(cheie, env) {
  const n = 6, fereastra = +(env?.T212_FEREASTRA_MS ?? 61000), acum = Date.now(), t = (LIMITA[cheie] ||= []).filter(x => acum - x < fereastra);
  if (t.length >= n) await sleep(fereastra - (acum - t[0]) + 50);
  t.push(Date.now()); LIMITA[cheie] = t.slice(-n);
}
// Rulează fn pe elemente, câte n în paralel (prețurile pentru 20 de acțiuni: secunde în loc de zeci de secunde).
export async function paralel(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
async function getJSON(url, headers = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers });
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${new URL(url).host}${new URL(url).pathname} → HTTP ${r.status}`);
    return r.json();
  }
  throw new Error(`${new URL(url).host} → prea multe cereri (429)`);
}
// Caută primul tablou de obiecte care au cheia dată (răspunsurile eToro variază ca formă/casing).
function findArray(o, key, depth = 0) {
  if (!o || depth > 5) return null;
  if (Array.isArray(o)) {
    if (o.length && typeof o[0] === 'object' && o[0] && Object.keys(o[0]).some(k => k.toLowerCase() === key.toLowerCase())) return o;
    for (const x of o) { const f = findArray(x, key, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof o === 'object') for (const v of Object.values(o)) { const f = findArray(v, key, depth + 1); if (f) return f; }
  return null;
}
const pick = (o, ...keys) => {
  for (const k of keys) {
    if (o == null) return undefined;
    const hit = Object.keys(o).find(x => x.toLowerCase() === k.toLowerCase());
    if (hit !== undefined && o[hit] != null) return o[hit];
  }
  return undefined;
};

// ---------- Trading 212 ----------
export function t212Symbol(ticker) {
  if (SYMBOL_OVERRIDES[ticker]) return SYMBOL_OVERRIDES[ticker];
  let m = ticker.match(/^(.+?)_US_EQ$/); if (m) return m[1];
  m = ticker.match(/^([A-Z0-9.]+)([a-z])_EQ$/); if (m) return m[1] + (T212_SUFFIX[m[2]] || '');
  return ticker.replace(/_EQ$/, '');
}
export async function t212Positions(env) {
  const base = env.T212_ENV === 'demo' ? 'https://demo.trading212.com' : 'https://live.trading212.com';
  const auth = 'Basic ' + btoa(`${env.T212_KEY}:${env.T212_SECRET}`);
  const rows = await getJSON(`${base}/api/v0/equity/positions`, { Authorization: auth });
  const fx = {}; // RON per unitate de monedă, dedus din pozițiile însele
  const out = rows.map(p => {
    const w = p.walletImpact || {};
    const cur = p.instrument?.currency;
    if (cur && p.quantity * p.currentPrice > 0 && w.currentValue) fx[cur] = w.currentValue / (p.quantity * p.currentPrice);
    return {
      broker: 'Trading 212', symbol: t212Symbol(p.instrument?.ticker || ''), name: p.instrument?.name,
      qty: p.quantity, price: p.currentPrice, avg: p.averagePricePaid, currency: cur,
      valueRON: w.currentValue, costRON: w.totalCost, contValuta: w.currency,
    };
  });
  return { positions: out, fx };
}

// Soldul raportat de Trading 212: verificare independentă a sumelor calculate de noi + cash neinvestit.
export async function t212Sumar(env) {
  const base = env.T212_ENV === 'demo' ? 'https://demo.trading212.com' : 'https://live.trading212.com';
  const j = await getJSON(`${base}/api/v0/equity/account/summary`, { Authorization: 'Basic ' + btoa(`${env.T212_KEY}:${env.T212_SECRET}`) });
  return { investit: j.investments?.currentValue ?? null, cost: j.investments?.totalCost ?? null, cash: j.cash?.availableToTrade ?? null, moneda: j.currency };
}

// Lista instrumentelor pe care le poți cumpăra la Trading 212 (permisiunea „Metadata” a cheii). Se citește o dată pe săptămână.
// Întoarce simbolurile în aceeași formă ca pozițiile (AAPL, SAP.DE, VWCE), sau null dacă cheia nu are permisiunea.
export async function t212Instrumente(env) {
  const base = env.T212_ENV === 'demo' ? 'https://demo.trading212.com' : 'https://live.trading212.com';
  await t212Rand('instrumente', env);
  const r = await fetch(`${base}/api/v0/equity/metadata/instruments`, { headers: { Authorization: 'Basic ' + btoa(`${env.T212_KEY}:${env.T212_SECRET}`) } });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`Trading 212 instrumente → HTTP ${r.status}`);
  const j = await r.json();
  return [...new Set((Array.isArray(j) ? j : j.items || []).map(x => t212Symbol(x.ticker || '')).filter(Boolean))];
}

// ---------- eToro ----------
// Drepturile cheii eToro (citire / scriere). Din răspuns se folosește doar lista de drepturi.
export async function etoroDrepturi(env) { return getJSON(`${ETB}/me`, etH(env)); }
const etH = env => ({ 'x-api-key': env.ETORO_API_KEY, 'x-user-key': env.ETORO_USER_KEY, 'x-request-id': crypto.randomUUID() });
const ETB = 'https://public-api.etoro.com/api/v1';

export async function etoroPositions(env, ronPerUSD, toate = null) {
  const j = await getJSON(`${ETB}/trading/info/real/pnl`, etH(env));
  const pos = pick(j.clientPortfolio || j, 'positions') || [];
  const byId = {};
  for (const p of pos) {
    // pentru paza: TOATE pozițiile, inclusiv cele short sau cu efect de levier, pe care analiza nu le folosește
    if (toate) toate.push({ id: String(pick(p, 'positionId') ?? `${pick(p, 'instrumentId')}:${pick(p, 'openDateTime', 'openTimestamp', 'openDate') || ''}:${pick(p, 'amount') ?? ''}`), instr: pick(p, 'instrumentId', 'instrumentID'), cumparare: pick(p, 'isBuy') !== false,
      data: String(pick(p, 'openDateTime', 'openTimestamp', 'openDate') || '').slice(0, 10) || null, usd: +pick(p, 'amount') || 0 });
    if (pick(p, 'isBuy') === false) continue; // fără poziții short în etapa 1
    const id = pick(p, 'instrumentId', 'instrumentID');
    const amount = +pick(p, 'amount') || 0;
    const pnl = +(pick(p, 'pnL') ?? pick(pick(p, 'unrealizedPnL') || {}, 'pnL') ?? 0);
    const units = +pick(p, 'units') || 0;
    const rate = +(pick(p, 'closeRate') ?? pick(pick(p, 'unrealizedPnL') || {}, 'closeRate') ?? 0);
    const g = byId[id] ||= { id, amount: 0, pnl: 0, units: 0, rate, loturi: [] };
    g.amount += amount; g.pnl += pnl; g.units += units; g.rate = rate || g.rate;
    const deschis = String(pick(p, 'openDateTime', 'openTimestamp', 'openDate') || '').slice(0, 10);
    if (deschis) g.loturi.push({ data: deschis, usd: amount }); // pentru randamentul real: când a intrat fiecare sumă
  }
  const ids = Object.keys(byId);
  const names = await etoroInstrumentNames(env, ids);
  if (toate) for (const t of toate) t.symbol = names[t.instr]?.symbol || `ETORO#${t.instr}`;
  return ids.map(id => {
    const g = byId[id], n = names[id] || {};
    return {
      broker: 'eToro', symbol: n.symbol || `ETORO#${id}`, name: n.name, etoroId: +id,
      qty: g.units, price: g.rate, currency: null, // moneda de listare se deduce din simbol
      valueRON: (g.amount + g.pnl) * ronPerUSD, costRON: g.amount * ronPerUSD, costUSD: g.amount, valueUSD: g.amount + g.pnl, loturi: g.loturi,
    };
  });
}
async function etoroInstrumentNames(env, ids) {
  if (!ids.length) return {};
  const j = await getJSON(`${ETB}/market-data/instruments?instrumentIds=${ids.join(',')}`, etH(env));
  const arr = findArray(j, 'instrumentId') || findArray(j, 'instrumentID') || [];
  const out = {};
  for (const x of arr) {
    const id = pick(x, 'instrumentId', 'instrumentID');
    out[id] = { symbol: pick(x, 'symbolFull', 'internalSymbolFull', 'symbol'), name: pick(x, 'instrumentDisplayName', 'displayname', 'name') };
  }
  return out;
}
// Siglele instrumentelor, din datele eToro (aceleași imagini ca în aplicația lor). Se descarcă o singură dată
// și se păstrează ca date în analiza criptată: telefonul nu face cereri către alte servere.
function imaginiDin(o, out = []) {
  if (!o || typeof o !== 'object') return out;
  if (Array.isArray(o)) { o.forEach(x => imaginiDin(x, out)); return out; }
  const u = pick(o, 'uri', 'url');
  if (typeof u === 'string' && /^https:\/\//.test(u) && /\.(png|jpe?g|svg|webp)(\?|$)/i.test(u)) out.push({ u, w: +pick(o, 'width') || 0 });
  for (const v of Object.values(o)) if (v && typeof v === 'object') imaginiDin(v, out);
  return out;
}
export async function etoroSigle(env, ids) {
  if (!ids.length) return {};
  const j = await getJSON(`${ETB}/market-data/instruments?instrumentIds=${ids.join(',')}`, etH(env));
  const arr = findArray(j, 'instrumentId') || findArray(j, 'instrumentID') || [], out = {};
  for (const x of arr) {
    const id = pick(x, 'instrumentId', 'instrumentID'), im = imaginiDin(x);
    if (!im.length) continue;
    // cea mai mică imagine de cel puțin 150 px (clară pe ecranele cu densitate 3x), altfel cea mai mare
    const ales = im.filter(i => i.w >= 150 && i.w <= 400).sort((a, b) => a.w - b.w)[0] || im.sort((a, b) => b.w - a.w)[0];
    try {
      const r = await fetch(ales.u); if (!r.ok) continue;
      const tip = r.headers.get('content-type') || (/\.svg/i.test(ales.u) ? 'image/svg+xml' : 'image/png'), buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 90000 || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(tip.split(';')[0].trim())) continue;
      out[id] = `data:${tip.split(';')[0]};base64,${buf.toString('base64')}`;
    } catch { /* fără siglă: aplicația arată inițialele */ }
  }
  return out;
}
export async function etoroResolve(env, symbol, kv) {
  const q = ETORO_SYMBOL[symbol] || symbol;
  const key = `etoroid:${q}`;
  const cached = kv && await kv.get(key);
  if (cached) return +cached;
  const j = await getJSON(`${ETB}/market-data/search?internalSymbolFull=${encodeURIComponent(q)}&fields=instrumentId,internalSymbolFull,displayname&pageSize=5`, etH(env));
  const items = j.items || findArray(j, 'internalSymbolFull') || [];
  const hit = items.find(i => (pick(i, 'internalSymbolFull') || '').toUpperCase() === q.toUpperCase());
  if (!hit) return null;
  const id = pick(hit, 'instrumentId', 'instrumentID');
  if (kv) await kv.put(key, String(id));
  return +id;
}
export async function etoroCandles(env, id, n = 300) {
  const j = await getJSON(`${ETB}/market-data/instruments/${id}/history/candles/asc/OneDay/${n}`, etH(env));
  const arr = findArray(j, 'close') || [];
  return arr.map(x => ({
    t: pick(x, 'fromDate', 'time', 'date'), o: +pick(x, 'open'), h: +pick(x, 'high'), l: +pick(x, 'low'), c: +pick(x, 'close'), v: +(pick(x, 'volume') || 0),
  })).filter(x => x.c > 0);
}

// ---------- Finnhub (doar piața US, varianta gratuită) ----------
const FH = 'https://finnhub.io/api/v1';
// Fundamentale + consensul analiștilor: 2 cereri pe simbol. Se schimbă rar, deci se țin în cache.
// Varianta gratuită: 60 de cereri pe minut. Păstrăm o marjă (55), cu o fereastră comună pentru toate cererile.
const FH_LIM = [];
async function fhRand(env) {
  const n = +(env?.FH_LIMITA ?? 55), fer = +(env?.FH_FEREASTRA_MS ?? 61000);
  for (;;) { const acum = Date.now(); while (FH_LIM.length && acum - FH_LIM[0] >= fer) FH_LIM.shift();
    if (FH_LIM.length < n) { FH_LIM.push(acum); return; } await sleep(fer - (acum - FH_LIM[0]) + 30); }
}
export async function fhFundamentale(env, symbol) {
  if (!env.FINNHUB_KEY || symbol.includes('.')) return null;
  const t = `&token=${env.FINNHUB_KEY}`;
  await fhRand(env); await fhRand(env);
  const [met, rec] = await Promise.allSettled([
    getJSON(`${FH}/stock/metric?symbol=${symbol}&metric=all${t}`),
    getJSON(`${FH}/stock/recommendation?symbol=${symbol}${t}`),
  ]);
  const out = {};
  if (met.status === 'fulfilled' && met.value.metric) {
    const m = met.value.metric;
    out.fund = { pe: m.peTTM ?? m.peBasicExclExtraTTM ?? null, crestereVenit: m.revenueGrowthTTMYoy ?? null,
      randDiv: m.dividendYieldIndicatedAnnual ?? m.currentDividendYieldTTM ?? null,
      marja: m.netProfitMarginTTM ?? null, roe: m.roeTTM ?? null,
      // v0.45: datoria totală la 1 unitate de capital propriu (trimestrial, altfel anual) și marja operațională
      datorii: m['totalDebt/totalEquityQuarterly'] ?? m['totalDebt/totalEquityAnnual'] ?? null, marjaOp: m.operatingMarginTTM ?? null };
  }
  if (rec.status === 'fulfilled' && rec.value[0]) out.rec = rec.value[0];
  return out;
}
// Calendarul de rezultate pe următoarele 14 zile, pentru toate simbolurile: o singură cerere.
export async function fhRezultate(env, azi, simboluri) {
  if (!env.FINNHUB_KEY) return {};
  const to = new Date(Date.parse(azi) + 14 * 864e5).toISOString().slice(0, 10);
  const j = await getJSON(`${FH}/calendar/earnings?from=${azi}&to=${to}&token=${env.FINNHUB_KEY}`);
  const out = {};
  for (const e of j.earningsCalendar || []) if (simboluri.includes(e.symbol) && (!out[e.symbol] || e.date < out[e.symbol])) out[e.symbol] = e.date;
  return out;
}

// ---------- BNR (cursul oficial, folosit și pentru impozit) ----------
function parseBNR(xml) {
  const zile = {};
  for (const m of xml.matchAll(/<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g)) {
    const r = {};
    for (const x of m[2].matchAll(/<Rate currency="([A-Z]{3})"(?: multiplier="(\d+)")?>([\d.]+)<\/Rate>/g)) r[x[1]] = +x[3] / (+x[2] || 1);
    zile[m[1]] = r;
  }
  return zile;
}
export async function bnrAzi() {
  const r = await fetch('https://www.bnr.ro/nbrfxrates.xml');
  if (!r.ok) throw new Error(`BNR → HTTP ${r.status}`);
  const z = parseBNR(await r.text()); const d = Object.keys(z).sort().pop();
  return d ? { data: d, ...z[d] } : null;
}
// v0.43: arhiva anuală e publicată și pe curs.bnr.ro; dacă adresa veche nu răspunde sau nu are cursuri, se încearcă a doua.
export async function bnrAn(an) {
  let ult = 'fără răspuns';
  for (const g of ['https://www.bnr.ro', 'https://curs.bnr.ro']) {
    try {
      const r = await fetch(`${g}/files/xml/years/nbrfxrates${an}.xml`);
      if (!r.ok) { ult = `HTTP ${r.status}`; continue; }
      const z = parseBNR(await r.text());
      if (Object.keys(z).length) return z;
      ult = 'fișier fără cursuri';
    } catch (e) { ult = e.message; }
  }
  throw new Error(`BNR ${an} → ${ult}`);
}
// Cursul din ziua dată sau din ultima zi bancară dinainte (weekend, sărbători).
export function cursLa(zile, data, moneda) {
  const d = Object.keys(zile).filter(x => x <= data).sort().pop();
  return d ? zile[d][moneda] : null;
}
// v0.43: ca cursLa, dar pentru o zi dinaintea primului curs disponibil (de ex. 1–2 ianuarie) ia primul curs din următoarele 7 zile.
export function cursCumparare(zile, data, moneda) {
  const c = cursLa(zile, data, moneda); if (c) return c;
  const lim = new Date(Date.parse(data) + 7 * 864e5).toISOString().slice(0, 10);
  const d = Object.keys(zile).filter(x => x > data && x <= lim).sort()[0];
  return d ? zile[d][moneda] || null : null;
}
export { parseBNR };

// ---------- Câștiguri realizate (pentru Declarația Unică) ----------
// Trading 212: profitul realizat vine direct în moneda contului (lei). 6 cereri/minut -> pauză între pagini.
export async function t212Realizat(env, deLa, stiute = new Set(), maxPagini = 10) {
  const base = env.T212_ENV === 'demo' ? 'https://demo.trading212.com' : 'https://live.trading212.com';
  const auth = 'Basic ' + btoa(`${env.T212_KEY}:${env.T212_SECRET}`);
  let urm = '/api/v0/equity/history/orders?limit=50', out = [], pagini = 0;
  while (urm && pagini < maxPagini) {
    await t212Rand('orders', env);
    const j = await getJSON(base + urm, { Authorization: auth }); pagini++;
    let gata = false;
    for (const it of j.items || []) {
      const f = it.fill || {}; const w = f.walletImpact || {};
      if (!f.filledAt || f.filledAt.slice(0, 10) < deLa || stiute.has('t' + f.id)) { gata = true; break; }
      if (w.realisedProfitLoss) out.push({ id: 't' + f.id, broker: 'Trading 212', data: f.filledAt.slice(0, 10),
        symbol: t212Symbol(it.order?.ticker || it.order?.instrument?.ticker || ''), lei: +w.realisedProfitLoss, moneda: w.currency });
    }
    urm = gata ? null : j.nextPagePath;
  }
  return out;
}
// Toate execuțiile din Trading 212 (cumpărări, vânzări, comisioane), pentru randamentul real și costuri.
// Se citesc incremental: cele noi până la prima cunoscută, iar istoricul vechi câteva pagini la fiecare rulare.
export async function t212Executii(env, stiute = new Set(), dela = null, maxPagini = 4) {
  const base = env.T212_ENV === 'demo' ? 'https://demo.trading212.com' : 'https://live.trading212.com';
  const auth = 'Basic ' + btoa(`${env.T212_KEY}:${env.T212_SECRET}`);
  let urm = dela || '/api/v0/equity/history/orders?limit=50', out = [], pagini = 0, gata = false;
  while (urm && pagini < maxPagini && !gata) {
    await t212Rand('orders', env); // limita Trading 212: 6 cereri pe minut
    const j = await getJSON(base + urm, { Authorization: auth }); pagini++;
    for (const it of j.items || []) {
      const f = it.fill || {}, w = f.walletImpact || {}, o = it.order || {};
      if (!f.filledAt) continue;
      if (stiute.has('t' + f.id)) { if (!dela) { gata = true; break; } continue; }
      const vanzare = /SELL/i.test(o.side || '') || (+f.quantity < 0) || (+o.filledQuantity < 0) || (+o.quantity < 0);
      const taxe = (w.taxes || []).map(t => ({ n: String(t.name || ''), v: Math.abs(+(t.quantity ?? t.amount ?? 0)) }));
      out.push({ id: 't' + f.id, data: f.filledAt.slice(0, 10), symbol: t212Symbol(o.ticker || o.instrument?.ticker || ''), tip: vanzare ? 'vanzare' : 'cumparare', din: o.initiatedFrom || it.initiatedFrom || null,
        lei: Math.abs(+w.netValue || 0), taxe: taxe.reduce((a, t) => a + t.v, 0), taxeFX: taxe.filter(t => /CONVERSION|FX/i.test(t.n)).reduce((a, t) => a + t.v, 0) });
    }
    urm = gata ? null : j.nextPagePath || null;
  }
  return { executii: out, urm };
}
// Dividendele încasate la Trading 212 (cer permisiunea „History - Dividends”).
export async function t212Dividende(env, stiute = new Set(), maxPagini = 3) {
  const base = env.T212_ENV === 'demo' ? 'https://demo.trading212.com' : 'https://live.trading212.com';
  const auth = 'Basic ' + btoa(`${env.T212_KEY}:${env.T212_SECRET}`);
  let urm = '/api/v0/history/dividends?limit=50', out = [], pagini = 0;
  while (urm && pagini < maxPagini) {
    await t212Rand('dividends', env);
    const j = await getJSON(base + urm, { Authorization: auth }); pagini++;
    let gata = false;
    for (const d of j.items || []) {
      const id = 'd' + (d.reference || `${d.ticker}${d.paidOn}`);
      if (stiute.has(id)) { gata = true; break; }
      out.push({ id, data: String(d.paidOn || '').slice(0, 10), symbol: t212Symbol(d.ticker || ''), lei: +d.amount || 0 });
    }
    urm = gata ? null : j.nextPagePath || null;
  }
  return out;
}
// eToro: profitul net vine în dolari; îl convertim cu cursul BNR din ziua închiderii.
export async function etoroRealizat(env, deLa, bnr) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const j = await getJSON(`${ETB}/trading/info/trade/history?minDate=${deLa}&page=${page}&pageSize=100`, etH(env));
    const arr = Array.isArray(j) ? j : (findArray(j, 'netProfit') || []);
    for (const t of arr) {
      const data = String(pick(t, 'closeTimestamp') || '').slice(0, 10);
      const usd = +pick(t, 'netProfit') || 0, curs = cursLa(bnr, data, 'USD');
      out.push({ id: 'e' + pick(t, 'positionId'), broker: 'eToro', data, instrumentId: pick(t, 'instrumentId'), usd, curs, lei: curs ? usd * curs : null });
    }
    if (arr.length < 100) break;
  }
  return out;
}


// ---------- Inflația (v0.44) ----------
// Rata anuală a inflației pentru România, de la Eurostat (IAPC, indicele armonizat; INS nu are o interfață HTTPS stabilă).
// Din februarie 2026 Eurostat publică seriile noi (ECOICOP 2) în prc_hicp_minr; prc_hicp_manr rămâne ca rezervă.
// Răspunsul e JSON-stat: se alege seria totală (TOTAL/CP00), rata anuală (RCH_A), lunară, pentru RO; ultima lună cu valoare.
export function inflatieDinJsonStat(j) {
  const ids = j?.id, size = j?.size, dims = j?.dimension, val = j?.value;
  if (!Array.isArray(ids) || !Array.isArray(size) || !dims || !val) return null;
  const pref = { geo: ['RO'], unit: ['RCH_A'], freq: ['M'] }, total = ['TOTAL', 'CP00'];
  const coduri = ids.map(id => { const idx = dims[id]?.category?.index || {}; return Array.isArray(idx) ? Object.fromEntries(idx.map((k, i) => [k, i])) : idx; });
  const ok = ids.map((id, k) => {
    if (id === 'time') return null;
    const c = Object.keys(coduri[k]); if (c.length === 1) return coduri[k][c[0]];
    const p = pref[id] || (/coicop/i.test(id) ? total : null), gasit = p && p.find(x => x in coduri[k]);
    return gasit ? coduri[k][gasit] : undefined;
  });
  if (ok.some(x => x === undefined)) return null;
  const ti = ids.indexOf('time'); if (ti < 0) return null;
  const luni = Object.entries(coduri[ti]).sort((a, b) => b[1] - a[1]);
  for (const [luna, li] of luni) {
    let poz = 0; for (let k = 0; k < ids.length; k++) poz = poz * size[k] + (k === ti ? li : ok[k]);
    const x = Array.isArray(val) ? val[poz] : val[String(poz)];
    if (typeof x === 'number' && isFinite(x)) { const m = /^(\d{4})-?M?(\d{2})$/.exec(luna); if (m) return { an: x, luna: `${m[1]}-${m[2]}` }; }
  }
  return null;
}
export async function inflatieEurostat() {
  const B = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';
  let best = null, ult = 'fără răspuns';
  for (const q of ['prc_hicp_minr?format=JSON&lang=EN&geo=RO&unit=RCH_A&lastTimePeriod=3', 'prc_hicp_minr?format=JSON&lang=EN&geo=RO&lastTimePeriod=3',
    'prc_hicp_manr?format=JSON&lang=EN&geo=RO&unit=RCH_A&coicop=CP00&lastTimePeriod=3']) {
    try { const r = await fetch(B + q); if (!r.ok) { ult = `HTTP ${r.status}`; continue; }
      const x = inflatieDinJsonStat(await r.json()); if (x && (!best || x.luna > best.luna)) best = x; if (best && q.startsWith('prc_hicp_minr')) break; }
    catch (e) { ult = e.message; }
  }
  if (!best) throw new Error(`Eurostat → ${ult}`);
  return { ...best, sursa: 'Eurostat (IAPC)' };
}
