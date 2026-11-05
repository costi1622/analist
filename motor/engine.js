// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Motorul analistului: funcții pure, fără rețea. Testabil în node.
// Orientare: investitor pe termen lung (nucleu ETF + sateliți), care reechilibrează din depuneri.
import { THEMES, ALIASES, ETFS, RISK, PROFIL, TINTE, PROTECTIE, MONEDA_SUFIX, COMISION_FX, ORAR, TREPTE_ORIZONT, SCENARII, ETF_CATALOG, ACTIUNI_CATALOG, IMPOZIT, CASS, RETINERE_DIV, MSCI_WORLD } from './config.js';
export { MSCI_WORLD, CASS, IMPOZIT };

// ---------- Indicatori ----------
export function sma(v, n) {
  if (v.length < n) return null;
  let s = 0; for (let i = v.length - n; i < v.length; i++) s += v[i];
  return s / n;
}
export function emaSeries(v, n) {
  const k = 2 / (n + 1), out = []; let e = null;
  v.forEach((x, i) => {
    if (i < n - 1) { out.push(null); return; }
    if (e === null) e = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else e = x * k + e * (1 - k);
    out.push(e);
  });
  return out;
}
export function rsi(v, n = 14) { // Wilder
  if (v.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; d > 0 ? g += d : l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}
export function atr(candles, n = 14) { // Wilder, pe true range
  if (candles.length < n + 1) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const { h, l } = candles[i], pc = candles[i - 1].c;
    tr.push(Math.max((h ?? candles[i].c) - (l ?? candles[i].c), Math.abs((h ?? candles[i].c) - pc), Math.abs((l ?? candles[i].c) - pc)));
  }
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}
export function macd(v) {
  const e12 = emaSeries(v, 12), e26 = emaSeries(v, 26);
  const line = v.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const valid = line.filter(x => x != null);
  if (valid.length < 9) return null;
  const sig = emaSeries(valid, 9);
  const hist = valid.map((x, i) => sig[i] == null ? null : x - sig[i]).filter(x => x != null);
  return { hist: hist.slice(-5) };
}
const pct = (a, b) => (b ? (a / b - 1) * 100 : null);
const ret = (c, n) => (c.length > n ? pct(c[c.length - 1], c[c.length - 1 - n]) : null);
// Volatilitatea anuală (%): abaterea standard a randamentelor zilnice din ultimul an, × √252.
export function volAnual(c, n = 252) {
  const x = c.slice(-(n + 1)); if (x.length < 60) return null;
  const r = []; for (let i = 1; i < x.length; i++) if (x[i - 1] > 0 && x[i] > 0) r.push(Math.log(x[i] / x[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length, v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v * 252) * 100;
}

export function indicators(candles) {
  const c = candles.map(x => x.c);
  if (c.length < 30) return null;
  const last = c[c.length - 1];
  const hi52 = Math.max(...candles.slice(-252).map(x => x.h ?? x.c));
  const m = macd(c);
  let macdCross = 0;
  if (m && m.hist.length >= 4) {
    const h = m.hist, prevNeg = h.slice(-4, -1).some(x => x < 0), prevPos = h.slice(-4, -1).some(x => x > 0);
    if (h[h.length - 1] > 0 && prevNeg) macdCross = 1;
    if (h[h.length - 1] < 0 && prevPos) macdCross = -1;
  }
  const a = atr(candles.slice(-120));
  const maxP = Math.max(...c.slice(-PROTECTIE.zile));
  const protectie = a != null ? maxP - Math.max(PROTECTIE.multATR * a, maxP * PROTECTIE.minPct / 100) : null;
  return {
    pret: last,
    sma20: sma(c, 20), sma50: sma(c, 50), sma200: sma(c, 200),
    volAn: volAnual(c),
    rsi: rsi(c.slice(-120)),
    macdCross,
    atr: a, atrPct: a != null ? a / last * 100 : null,
    protectie, subProtectie: protectie != null && last < protectie,
    deLaMaxim: pct(last, hi52),
    deLaMaxim3l: pct(last, Math.max(...c.slice(-63))),
    // v0.42: data ultimei lumânări (poate fi ziua de azi, încă deschisă) și închiderea dinainte, pentru „azi” corect
    data: candles.at(-1)?.t ? String(candles.at(-1).t).slice(0, 10) : null, dataPrec: candles.at(-2)?.t ? String(candles.at(-2).t).slice(0, 10) : null, prec: c.at(-2) ?? null,
    r1z: ret(c, 1), r1l: ret(c, 21), r3l: ret(c, 63), r6l: ret(c, 126), r1a: ret(c, 252),
    zile: c.length,
  };
}

// Seria pentru grafice: ultimele n închideri + media de 50 de zile pe aceeași fereastră.
const r4 = x => x == null ? null : +x.toPrecision(6);
export function serie(candles, n = 260) {
  const c = candles.map(x => x.c), k = Math.max(0, c.length - n), out = { d: [], c: [], m50: [] };
  for (let i = k; i < c.length; i++) {
    out.d.push(String(candles[i].t || '').slice(0, 10)); out.c.push(r4(c[i]));
    out.m50.push(i >= 49 ? r4(c.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50) : null);
  }
  return out;
}

// ---------- Profilul: orizont + suma lunară -> toate regulile ----------
// u = { anTinta, suma } setate de tine în aplicație. Orizontul scade singur, an de an,
// iar strategia devine treptat mai prudentă pe măsură ce te apropii de anul în care ai nevoie de bani.
const intreg = (x, lo, hi, d) => { const n = Math.round(+x); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d; };
export function derivaProfil(u = {}, azi = new Date().toISOString().slice(0, 10)) {
  const an = +azi.slice(0, 4);
  const anTinta = intreg(u.anTinta, an + 1, an + 50, an + PROFIL.orizontAni);
  const h = anTinta - an, suma = intreg(u.suma, 10, 100000, PROFIL.contributieTipica);
  const t = TREPTE_ORIZONT.find(x => h >= x.min);
  const unaSingura = suma < 2 * PROFIL.transaMinima;
  const proprie = Number.isFinite(+u.tintaETF) && u.tintaETF !== null && u.tintaETF !== '' ? intreg(u.tintaETF, 0, 100, t.etf) : null;
  const alese = (Array.isArray(u.alese) ? u.alese : []).filter(k => ETF_CATALOG[k] || ACTIUNI_CATALOG[k]);
  return { ...PROFIL, orizontAni: h, anTinta, treapta: t.nume,
    contributieTipica: suma, contributieMin: suma, contributieMax: suma,
    tintaETF: proprie ?? t.etf, tintaETFRecomandat: t.etf, tintaETFProprie: proprie != null, alese,
    maxActiune: t.actiune, maxTema: t.tema,
    transaMinima: Math.min(PROFIL.transaMinima, suma), maxCumparariPeLuna: unaSingura ? 1 : PROFIL.maxCumparariPeLuna };
}
// Valoarea estimată peste `ani` ani: ce ai acum + depunerea lunară, capitalizat lunar.
export function proiectie(total, suma, ani, rataAn) {
  const r = Math.pow(1 + rataAn / 100, 1 / 12) - 1, n = Math.round(ani * 12);
  const fv = total * Math.pow(1 + r, n) + (r ? suma * (Math.pow(1 + r, n) - 1) / r : suma * n);
  return { valoare: fv, depus: total + suma * n };
}
export function scenarii(total, suma, ani) {
  return Object.fromEntries(Object.entries(SCENARII).map(([k, r]) => [k, { rata: r, ...proiectie(total, suma, ani, r) }]));
}

// ---------- Randamentul real al banilor tăi (XIRR) ----------
// flows: [{ data: 'AAAA-LL-ZZ', suma }], negativ = bani puși, pozitiv = bani scoși (și valoarea de azi la final).
// Ține cont de momentul fiecărei depuneri: 1.000 de lei puși acum o lună contează mai puțin decât acum 3 ani.
export function xirr(flows) {
  const f = flows.filter(x => x.suma && x.data).sort((a, b) => a.data.localeCompare(b.data));
  if (f.length < 2 || !f.some(x => x.suma < 0) || !f.some(x => x.suma > 0)) return null;
  const t0 = Date.parse(f[0].data), ani = x => (Date.parse(x.data) - t0) / (365.25 * 864e5);
  if (ani(f.at(-1)) < 0.08) return null; // sub o lună nu are sens anualizat
  const npv = r => f.reduce((a, x) => a + x.suma / Math.pow(1 + r, ani(x)), 0);
  let lo = -0.95, hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (npv(lo) * npv(m) <= 0) ? hi = m : lo = m; }
  return (lo + hi) / 2 * 100;
}

// ---------- Riscul istoric al portofoliului de azi ----------
// Ponderile de azi aplicate randamentelor din ultimul an, aliniate pe date (bursele au sărbători diferite;
// o zi fără preț păstrează prețul anterior). vol = volatilitate anualizată, dd = cea mai mare scădere,
// luna = pierderea lunară depășită doar în ~5% din luni (aproximare normală).
export function riscIstoric(pozitii, n = 252) {
  const poz = pozitii.filter(p => p.serie?.c?.length > 40 && p.serie.d?.length === p.serie.c.length && p.pondere > 0);
  if (!poz.length) return null;
  const toate = [...new Set(poz.flatMap(p => p.serie.d))].filter(Boolean).sort();
  const start = poz.map(p => p.serie.d[0]).sort().pop(); // de când au toate preț
  const zile = toate.filter(d => d >= start).slice(-(n + 1));
  if (zile.length < 30) return null;
  const W = poz.reduce((a, p) => a + p.pondere, 0);
  // v0.42: prețurile în lei (prețul × cursul BNR al zilei), când analiza a pus cursurile în serie: riscul pe care îl simți tu
  const lei = (p, i) => p.serie.fx?.length === p.serie.c.length && p.serie.fx[i] > 0 ? p.serie.c[i] * p.serie.fx[i] : p.serie.c[i];
  const preturi = poz.map(p => { const m = new Map(p.serie.d.map((d, i) => [d, lei(p, i)])); let u = null; return zile.map(d => (u = m.get(d) ?? u)); });
  const R = [];
  for (let i = 1; i < zile.length; i++) R.push(poz.reduce((a, p, k) => { const x = preturi[k][i - 1], y = preturi[k][i]; return a + (x && y ? p.pondere / W * (y / x - 1) : 0); }, 0));
  const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  let v = 1, mx = 1, dd = 0; for (const r of R) { v *= 1 + r; mx = Math.max(mx, v); dd = Math.min(dd, v / mx - 1); }
  const volP = {}; poz.forEach((p, k) => { const c = preturi[k].filter(Boolean); if (c.length > 30) volP[p.symbol] = sd(c.slice(1).map((x, i) => x / c[i] - 1)) * Math.sqrt(252) * 100; });
  const e = poz.find(p => p.etf);
  return { vol: sd(R) * Math.sqrt(252) * 100, volE: e ? volP[e.symbol] ?? null : null, dd: dd * 100, luna: 1.65 * sd(R) * Math.sqrt(21) * 100, zile: R.length, volP };
}

// ---------- Tu față de VWCE, cu exact aceleași depuneri ----------
// flows: aceleași fluxuri ca la xirr (negativ = bani puși, pozitiv = bani scoși: vânzări, dividende).
// pretLa(data) = prețul unei unități de ETF în lei la acea dată (sau null dacă nu se știe).
// Fiecare depunere cumpără ETF la prețul zilei; fiecare ieșire vinde ETF de aceeași valoare.
export function aceleasiDepuneri(flows, pretLa, azi) {
  const f = flows.filter(x => x.suma && x.data && x.data <= azi).sort((a, b) => a.data.localeCompare(b.data));
  if (!f.length) return null;
  let u = 0;
  for (const x of f) { const p = pretLa(x.data); if (!(p > 0)) return null; u = Math.max(0, u - x.suma / p); }
  const pA = pretLa(azi); if (!(pA > 0)) return null;
  const valoare = u * pA;
  return { valoare, anual: xirr([...f, { data: azi, suma: valoare }]) };
}

// ---------- Corelații: ce acțiuni se mișcă împreună ----------
// series: { SIMBOL: { d:[date], c:[închideri] } }. Randamente zilnice pe zilele comune, ultimele n.
// pas = 5: randamente pe câte 5 zile de bursă. Pe zile, o acțiune europeană (închisă la 17:30) și una americană
// (închisă la 22:00) par mai puțin legate decât sunt; pe săptămâni, diferența de oră dispare.
export function corelatii(series, n = 250, pas = 5) {
  const sim = Object.keys(series), R = {}, set = Object.fromEntries(sim.map(s => [s, new Set(series[s].d)]));
  const comune = sim.reduce((acc, s) => acc ? acc.filter(d => set[s].has(d)) : [...series[s].d], null) || [];
  const tot = comune.slice(-(n + 1)), zile = tot.filter((_, i) => (tot.length - 1 - i) % pas === 0);
  for (const s of sim) { const m = new Map(series[s].d.map((d, i) => [d, series[s].c[i]])); const c = zile.map(d => m.get(d)); R[s] = c.slice(1).map((x, i) => x / c[i] - 1); }
  const rho = (a, b) => { const k = a.length; if (k < 20) return null; const ma = a.reduce((x, y) => x + y, 0) / k, mb = b.reduce((x, y) => x + y, 0) / k;
    let sab = 0, sa = 0, sb = 0; for (let i = 0; i < k; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; sa += x * x; sb += y * y; } return sa && sb ? sab / Math.sqrt(sa * sb) : null; };
  const M = {}; for (const a of sim) { M[a] = {}; for (const b of sim) M[a][b] = a === b ? 1 : rho(R[a], R[b]); }
  return { simboluri: sim, M, zile: Math.max(tot.length - 1, 0), puncte: Math.max(zile.length - 1, 0), pas };
}
// Câte poziții cu adevărat diferite are portofoliul (1 = totul se mișcă la fel, N = N acțiuni independente).
export function pariuriEfective(ponderi, M) {
  const s = Object.keys(ponderi), W = s.reduce((a, x) => a + ponderi[x], 0); if (!W) return null;
  let v = 0; for (const a of s) for (const b of s) v += ponderi[a] * ponderi[b] * (M[a]?.[b] ?? (a === b ? 1 : 0));
  return v > 0 ? (W * W) / v : null;
}

// ---------- ETF-urile alese de tine, încă necumpărate ----------
// Intră în calcul cu valoare 0, ca planul lunar să le poată da bani; dispar singure când apar în cont.
export function cuAlese(list, alese = []) {
  const are = new Set(list.map(g => g.symbol));
  const virt = alese.filter(k => (ETF_CATALOG[k] || ACTIUNI_CATALOG[k]) && !are.has(k)).map(k => ({ symbol: k, name: (ETF_CATALOG[k] || ACTIUNI_CATALOG[k]).nume, valueRON: 0, costRON: 0, pnlRON: 0, pnlPct: 0, pondere: 0,
    brokers: [{ broker: 'Trading 212', symbol: k, qty: 0, valueRON: 0, costRON: 0 }], moneda: monedaOf(k), tema: themeOf(k), etf: ETFS.includes(k), virtual: true }));
  return [...list, ...virt];
}
// ---------- Scorul unei idei noi (0–100) ----------
// Aceleași criterii pentru orice companie, din date pe care le verifici oricând:
// trend (25), cum a mers față de piață pe un an (15), profitabilitate (20), creșterea veniturilor (15), evaluare (10), analiști (15).
// Scorul e raportat la punctele pentru care există date; sub 70 de puncte posibile, ideea e marcată „date incomplete”.
// ref = { r1a } al ETF-ului global (VWCE), pentru comparația cu piața.
export function scorIdee(c, ref = {}) {
  const i = c?.ind || {}, f = c?.fund || {}, r = c?.rec, pct = [];
  let p = 0, max = 0;
  const add = (pts, din, text) => { p += pts; max += din; pct.push({ pts, din, text }); };
  if (i.sma200 != null && i.pret != null) add((i.pret > i.sma200 ? 15 : 0) + (i.sma50 != null && i.sma50 > i.sma200 ? 10 : 0), 25,
    i.pret > i.sma200 ? (i.sma50 > i.sma200 ? 'Trend lung în sus (peste media de 200 de zile, iar media de 50 e peste ea)' : 'Peste media de 200 de zile, dar media de 50 e încă sub ea') : 'Sub media de 200 de zile: trendul lung e în jos');
  // în lei când există (aceeași monedă pentru amândouă), altfel în moneda fiecăreia
  const lei = i.r1aLei != null && ref.r1aLei != null, r1 = lei ? i.r1aLei : i.r1a, rv = lei ? ref.r1aLei : ref.r1a;
  if (r1 != null && rv != null) { const d = r1 - rv; add(d >= 10 ? 15 : d >= 0 ? 10 : d >= -10 ? 5 : 0, 15, `Pe un an${lei ? ', în lei' : ''}: ${fmt(r1)}%, față de ${fmt(rv)}% pentru VWCE`); }
  if (f.marja != null || f.roe != null) {
    const m = f.marja == null ? null : f.marja >= 15 ? 10 : f.marja >= 8 ? 6 : f.marja > 0 ? 3 : 0, e = f.roe == null ? null : f.roe >= 15 ? 10 : f.roe >= 8 ? 6 : f.roe > 0 ? 3 : 0;
    add((m ?? 0) + (e ?? 0), (m != null ? 10 : 0) + (e != null ? 10 : 0), [f.marja != null && `marja netă ${fmt(f.marja)}%`, f.roe != null && `rentabilitatea capitalului ${fmt(f.roe)}%`].filter(Boolean).join(', ').replace(/^./, x => x.toUpperCase()));
  }
  if (f.crestereVenit != null) add(f.crestereVenit >= 10 ? 15 : f.crestereVenit >= 3 ? 10 : f.crestereVenit >= 0 ? 5 : 0, 15, `Veniturile ${f.crestereVenit >= 0 ? 'cresc' : 'scad'} cu ${fmt(Math.abs(f.crestereVenit))}% pe an`);
  if (f.pe != null) add(f.pe > 0 && f.pe <= 25 ? 10 : f.pe > 0 && f.pe <= 40 ? 6 : f.pe > 0 && f.pe <= 60 ? 3 : 0, 10, f.pe > 0 ? `P/E ${fmt(f.pe)}: ${f.pe <= 25 ? 'evaluare rezonabilă' : f.pe <= 40 ? 'puțin scumpă' : 'scumpă'}` : 'Fără profit în ultimul an (P/E negativ)');
  if (r) { const pos = (r.strongBuy || 0) + (r.buy || 0), neg = (r.sell || 0) + (r.strongSell || 0), tot = pos + neg + (r.hold || 0);
    if (tot) { const net = (pos - neg) / tot; add(net >= 0.6 ? 15 : net >= 0.3 ? 10 : net >= 0 ? 5 : 0, 15, `Analiștii: ${pos} cumpărare, ${r.hold || 0} păstrare, ${neg} vânzare`); } }
  return { scor: max ? Math.round(p / max * 100) : null, puncte: p, max, incomplet: max < 70, criterii: pct };
}
// ---------- Cât pui într-o idee nouă ----------
// Treapta vine din scor (20%, 35% sau 50% din suma lunară), apoi se ajustează după cât de agitat e prețul:
// față de piața globală (~18% pe an), o acțiune de două ori mai agitată primește jumătate (niciodată mai puțin de jumătate).
// Plafoane: cel mult jumătate din suma lunară și cel mult cât lipsește până la ținta ei. Date incomplete: cel mult 35%.
export const VOL_PIATA = 18;
export function sumaStart({ scor, vol, incomplet, etf }, suma, minim = 50, plafonLei = Infinity) {
  if (!(suma > 0)) return null;
  let treapta = scor >= 70 ? 0.5 : scor >= 50 ? 0.35 : 0.2;
  if (incomplet) treapta = Math.min(treapta, 0.35);
  const risc = etf || !(vol > 0) ? 1 : Math.min(1, Math.max(0.5, VOL_PIATA / vol));
  const brut = suma * treapta * risc, jos = Math.min(minim, suma), sus = Math.max(Math.min(suma * 0.5, plafonLei), jos);
  // rotunjit la 10 lei, fără să treacă de plafon din cauza rotunjirii (175 → 170, nu 180)
  let lei = Math.round(Math.min(Math.max(brut, jos), sus) / 10) * 10;
  if (lei > sus) lei = Math.floor(sus / 10) * 10; if (lei < jos) lei = Math.ceil(jos / 10) * 10;
  lei = Math.max(10, lei);
  return { lei, treapta, risc, brut };
}
// ---------- Recomandări de ETF-uri ----------
// tip: similar (aceeași idee ca acțiunile tale, dar împărțită pe multe companii), completeaza (ce îți lipsește), orizont (potrivit cu anii rămași).
// cand: { simbol: { ind } } din analiză (pentru scor și pentru cât de agitat e prețul).
export function recomandaETF(pozitii, teme, profil, decizii = {}, cand = {}, ref = {}) {
  const are = new Set(pozitii.filter(p => !p.virtual).map(p => p.symbol)), w = Object.fromEntries(pozitii.map(p => [p.symbol, p.pondere || 0]));
  const nucleu = [...are].some(k => ETF_CATALOG[k]?.rol === 'nucleu');
  const out = [];
  for (const [k, e] of Object.entries(ETF_CATALOG)) {
    if (are.has(k) || decizii[k] || k === 'EUNL' || k === 'XDWD' || (k === 'VWCE' && nucleu)) continue;
    if (cand[k]?.t212 === false) continue; // nu se găsește la Trading 212: nu are rost să-l propun
    const comune = (e.detine || []).filter(s => are.has(s)), pc = comune.reduce((a, s) => a + w[s], 0);
    const temaP = e.tema ? (teme[e.tema] || 0) : 0, pestePlafon = ['tematic', 'sector'].includes(e.rol) && temaP > profil.maxTema;
    let tip = null, scor = 0, motiv = '';
    if (k === 'VWCE') { tip = 'completeaza'; scor = 100; motiv = 'ETF-ul de bază recomandat pentru orice orizont lung: toată lumea, într-un singur ETF.'; }
    else if (e.rol === 'tematic' && comune.length >= 1) {
      tip = 'similar'; scor = 40 + pc;
      motiv = `Ai deja ${listaRo(comune)} (${fmt(pc)}% din portofoliu). ${e.nume} pune aceeași idee în ${e.companii} de companii: dacă una are o problemă, te lovește mult mai puțin.`;
    } else if (e.rol === 'sector' && !temaP) {
      tip = 'completeaza'; scor = 45;
      motiv = `Nu ai nimic din sectorul ${e.tema}. ${DE_CE_SECTOR[e.tema] || ''} Un singur ETF îți dă toate cele ${e.companii} de companii mari din sector, în loc să alegi una.`.replace('  ', ' ');
    } else if (k === 'SXR8' && comune.length >= 3) {
      tip = 'similar'; scor = 20 + pc / 4;
      motiv = `Majoritatea acțiunilor tale (${listaRo(comune.slice(0, 4))}) sunt americane și mari. S&P 500 le are pe toate, plus încă ~490, la un cost de doar ${String(e.ter).replace('.', ',')}% pe an.`;
    } else if (k === 'IS3N' && profil.orizontAni >= 10) {
      tip = 'completeaza'; scor = 25;
      motiv = 'Piețele emergente au cam 10% în VWCE. Dacă vrei mai mult din creșterea Asiei și a altor economii în dezvoltare, ăsta e ETF-ul care le acoperă pe toate, inclusiv companiile mici.';
    } else if (e.rol === 'regional' && k !== 'IS3N' && k !== 'SXR8' && !temaP) {
      tip = 'diversifica'; scor = k === 'EUNK' ? 22 : 16;
      motiv = k === 'EUNK' ? 'Portofoliul tău e mai ales în companii americane. Europa are alte sectoare puternice (bănci, sănătate, industrie, lux) și altă monedă, deci se mișcă diferit.'
        : 'Japonia are propriul ciclu economic și propria monedă (yenul). E o felie a lumii care se mișcă des altfel decât SUA și Europa.';
    } else if (e.rol === 'stil' && !temaP) {
      const tech = (teme['AI și infrastructură'] || 0) + (teme['Software'] || 0);
      if (k === 'IS3Q') { tip = 'stil'; scor = 24; motiv = 'Pune accentul pe companiile cu profit mare și stabil și datorii mici. E o variantă mai prudentă de a deține piața globală, cu mai puține firme fragile.'; }
      else if (k === 'VGWE') { tip = 'stil'; scor = tech > 20 ? 26 : 18; motiv = `Companii mature care plătesc dividende: bănci, energie, consum de bază.${tech > 20 ? ` Ai ${fmt(tech)}% în tehnologie: astea se mișcă altfel și echilibrează portofoliul.` : ' Se mișcă altfel decât companiile care cresc repede.'}`; }
      else if (k === 'IQQ0') { tip = profil.orizontAni < 10 ? 'orizont' : 'stil'; scor = profil.orizontAni < 10 ? 35 : 15; motiv = 'Companiile cu prețurile cele mai liniștite. Câștigi de obicei mai puțin când bursa urcă tare, dar pierzi mai puțin când scade: util când te apropii de momentul în care ai nevoie de bani.'; }
      else if (k === 'IUSN' && profil.orizontAni >= 10) { tip = 'stil'; scor = 17; motiv = 'Companiile mici lipsesc aproape complet din VWCE. Pe termen lung pot adăuga creștere, dar sunt mai agitate: o parte mică, pentru cine are 10+ ani.'; }
    } else if (e.rol === 'aur' && !temaP) {
      tip = 'diversifica'; scor = 14;
      motiv = 'Aurul nu depinde de profitul companiilor și a crescut de multe ori când bursele au scăzut (2008, 2020, 2022). Folosit de obicei ca o felie mică, 5–10% din portofoliu.';
    } else if (k === 'XEON' && profil.orizontAni < 3) {
      tip = 'orizont'; scor = 95 - profil.orizontAni * 5;
      motiv = `Ai ${profil.orizontAni} ${profil.orizontAni === 1 ? 'an' : 'ani'} până ai nevoie de bani. Banii care trebuie să fie acolo la o dată fixă stau cel mai sigur aici: cresc puțin în fiecare zi și practic nu scad.`;
    } else if (k === 'EUNA' && profil.orizontAni < 7) {
      tip = 'orizont'; scor = 90 - profil.orizontAni * 5;
      motiv = `Ai ${profil.orizontAni} ${profil.orizontAni === 1 ? 'an' : 'ani'} până ai nevoie de bani. Obligațiunile scad mult mai puțin decât acțiunile într-o criză și apără suma de care ai nevoie la final.`;
    }
    if (!tip) continue;
    const ind = cand[k]?.ind || null, s = ind ? scorIdee({ ind }, ref) : null;
    out.push({ ticker: k, ...e, tip, scor, scorTehnic: s?.scor ?? null, criterii: s?.criterii || [], ind, vol: ind?.volAn ?? null, comune, ponderaComuna: pc,
      acum: !pestePlafon, nota: pestePlafon ? `Sectorul „${e.tema}” are deja ${fmt(temaP)}%, peste plafonul de ${profil.maxTema}%. Ca alternativă pentru banii viitori pe tema asta, nu ca bani în plus acum.` : null });
  }
  return out.sort((a, b) => (b.acum - a.acum) || (b.scor - a.scor) || ((b.scorTehnic ?? 0) - (a.scorTehnic ?? 0))); // întâi ce se potrivește acum
}
// ---------- Acțiuni pentru diversificare ----------
const DE_CE_SECTOR = {
  'Financiar': 'Băncile și firmele de plăți câștigă din dobânzi și tranzacții, nu din tehnologie, deci se mișcă altfel decât acțiunile tale.',
  'Sănătate': 'Oamenii au nevoie de medicamente și în crize, așa că sectorul scade de obicei mai puțin când bursa scade.',
  'Consum de bază': 'Produsele de zi cu zi se vând și în crize, așa că sectorul scade de obicei mai puțin când bursa scade.',
  'Consum ciclic': 'Magazine, restaurante, călătorii și lux: cresc când oamenii cheltuie mai mult, independent de tehnologie.',
  'Energie': 'Energia merge adesea invers față de tehnologie: în 2022, când tehnologia a scăzut mult, petrolul și gazele au crescut.',
  'Utilități': 'Venituri stabile, în mare parte reglementate, și dividende constante. Echilibrează acțiunile care cresc repede.',
  'Industrie': 'Utilaje, transport și construcții: urmează economia reală, nu ciclul tehnologiei.',
  'Materiale': 'Metale, chimicale și aur: protejează parțial când prețurile cresc (inflație).',
  'Imobiliare': 'Venituri din chirii, de obicei cu dividende mari. Se mișcă după dobânzi mai mult decât după tehnologie.',
  'Telecom și media': 'Abonamente lunare (telefonie, streaming): venituri care se repetă.',
  'Software': 'Venituri din abonamente, cu marje mari. Atenție: se mișcă des împreună cu restul tehnologiei.',
};
// candidati: [{ symbol, ind, fund, rec, logo, t212 }] din analiză, pentru universul de idei.
// Sectoarele pe care nu le ai deloc vin primele, apoi cele sub plafon; cele peste plafon nu apar.
// În fiecare sector, cea mai bună companie după scor; apoi a doua cea mai bună din fiecare sector, și tot așa:
// când refuzi una, următoarea din listă îi ia locul imediat, fără nicio cerere nouă.
export function recomandaActiuni(candidati, pozitii, teme, profil, decizii = {}, ref = {}) {
  const are = new Set(pozitii.filter(p => !p.virtual).map(p => p.symbol)), alese = new Set(profil.alese || []);
  const nSat = pozitii.filter(p => !p.etf && !p.virtual).length + 1;
  const tinta = Math.min(Math.max(100 - profil.tintaETF, 0) / nSat, profil.maxActiune);
  const pe = {};
  for (const c of candidati || []) {
    const k = c.symbol, e = ACTIUNI_CATALOG[k]; if (!e || are.has(k) || decizii[k] || alese.has(k) || c.t212 === false) continue;
    const tp = teme[e.sector] || 0; if (tp >= profil.maxTema) continue;
    const s = scorIdee(c, ref), i = c.ind || {};
    if (s.scor == null) continue;
    const scump = i.rsi != null && i.rsi > RISK.rsiScump, jos = i.sma200 != null && i.pret < i.sma200;
    (pe[e.sector] ||= []).push({ ticker: k, ...e, ...s, grup: tp > 0 ? 1 : 0, vol: i.volAn ?? null, ind: c.ind || null, fund: c.fund || null, rec: c.rec || null, logo: c.logo || null,
      motive: s.criterii.map(x => `${x.pts >= x.din * 0.6 ? '+' : x.pts <= x.din * 0.2 ? '−' : '·'} ${x.text}`),
      acum: !scump && !jos, nota: scump ? `RSI ${Math.round(i.rsi)}: a urcat foarte repede. Dacă o alegi, așteaptă o scădere pentru prima cumpărare.` : jos ? 'Prețul e sub media de 200 de zile: trendul lung e în jos. Merită așteptat până se întoarce.' : null,
      tinta, motiv: tp > 0 ? `Ai ${fmt(tp)}% în ${e.sector}, sub plafonul de ${profil.maxTema}%.` : `Nu ai nicio companie din sectorul ${e.sector}. ${DE_CE_SECTOR[e.sector] || ''}`.trim() });
  }
  const out = [];
  // ordinea folosește scorul „sigur”: un 100 din doar 25 de puncte posibile cântărește mai puțin decât un 80 din 100 de puncte
  const sig = x => x.scor * Math.min(1, x.max / 70), ord = (a, b) => (b.acum - a.acum) || (sig(b) - sig(a));
  for (const l of Object.values(pe)) l.sort(ord).forEach((x, r) => { x.rang = r; out.push(x); });
  return out.sort((a, b) => (a.rang - b.rang) || (a.grup - b.grup) || ord(a, b));
}
const listaRo = a => a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} și ${a.at(-1)}`;

// ---------- Portofoliu combinat ----------
export const canon = s => ALIASES[s] || s;
export const TEMA_ETF = 'ETF global';
export function themeOf(sym) {
  if (ETFS.includes(sym)) return TEMA_ETF;
  if (ETF_CATALOG[sym]?.tema) return ETF_CATALOG[sym].tema;
  for (const [t, list] of Object.entries(THEMES)) if (list.includes(sym)) return t;
  return 'Altele';
}
export function monedaOf(sym, cur) {
  if (cur) return cur;
  if (ETF_CATALOG[sym]) return 'EUR'; // listate pe Xetra
  const suf = Object.keys(MONEDA_SUFIX).find(s => sym.endsWith(s));
  return suf ? MONEDA_SUFIX[suf] : 'USD';
}

// positions: [{broker, symbol, name, qty, price, currency, valueRON, costRON}]
export function combine(positions) {
  const map = {};
  for (const p of positions) {
    const s = canon(p.symbol);
    const g = map[s] ||= { symbol: s, name: p.name, valueRON: 0, costRON: 0, brokers: [], moneda: monedaOf(s, p.currency) };
    g.valueRON += p.valueRON; g.costRON += p.costRON;
    g.brokers.push({ broker: p.broker, symbol: p.symbol, qty: p.qty, valueRON: p.valueRON, costRON: p.costRON, ...(p.costUSD != null ? { costUSD: p.costUSD } : {}), ...(p.valueUSD != null ? { valueUSD: p.valueUSD } : {}) });
  }
  const list = Object.values(map);
  const total = list.reduce((a, b) => a + b.valueRON, 0);
  for (const g of list) {
    g.pondere = total ? g.valueRON / total * 100 : 0;
    g.pnlRON = g.valueRON - g.costRON;
    g.pnlPct = g.costRON ? g.pnlRON / g.costRON * 100 : 0;
    g.tema = themeOf(g.symbol);
    g.etf = ETFS.includes(g.symbol);
  }
  const teme = {};
  for (const g of list) teme[g.tema] = (teme[g.tema] || 0) + g.pondere;
  list.sort((a, b) => b.valueRON - a.valueRON);
  return { list, total, teme };
}

// Ținta fiecărei poziții: ETF-urile împart tintaETF, acțiunile împart restul (cu plafon).
// Obligațiunile (EUNA), dacă le ai sau le-ai ales, iau din ținta ETF o parte după orizont: 10% de la 7 ani în sus,
// apoi câte 10 puncte în plus pentru fiecare an sub 7 (5 ani → 20%, 3 ani → 40%), fără să depășească ținta ETF.
export const tintaObligatiuni = profil => Math.min(profil.tintaETF, Math.max(10, 10 * (7 - profil.orizontAni)));
export function tinte(list, profil = PROFIL, proprii = TINTE) {
  const etf = list.filter(g => g.etf), act = list.filter(g => !g.etf);
  const out = {};
  const obl = etf.filter(g => ETF_CATALOG[g.symbol]?.rol === 'obligatiuni'), nuc = etf.filter(g => !obl.includes(g));
  const tObl = obl.length ? (nuc.length ? tintaObligatiuni(profil) : profil.tintaETF) : 0;
  nuc.forEach(g => out[g.symbol] = (profil.tintaETF - tObl) / nuc.length);
  obl.forEach(g => out[g.symbol] = tObl / obl.length);
  const sat = 100 - (etf.length ? profil.tintaETF : 0);
  const fixe = act.filter(g => proprii[g.symbol] != null);
  const rest = sat - fixe.reduce((a, g) => a + proprii[g.symbol], 0);
  const libere = act.filter(g => proprii[g.symbol] == null);
  fixe.forEach(g => out[g.symbol] = proprii[g.symbol]);
  libere.forEach(g => out[g.symbol] = Math.min(Math.max(rest, 0) / (libere.length || 1), profil.maxActiune));
  return out;
}

// ---------- Evaluarea unei poziții ----------
// Semnale pentru investitor: adauga, pastreaza, nu_adauga, asteapta, verifica, reechilibreaza.
export const ETICHETE = {
  adauga: 'Adaugă', pastreaza: 'Păstrează', nu_adauga: 'Nu mai adăuga', asteapta: 'Așteaptă',
  verifica: 'Verifică acțiunea', reechilibreaza: 'Reechilibrează',
};
// Acordul numeralului: „de” de la 20 în sus (după ultimele două cifre): 22 de luni, 101 lei, 350 de lei.
export const de = n => { const a = Math.floor(Math.abs(n)), k = a % 100; return a >= 20 && (k === 0 || k >= 20) ? 'de ' : ''; };
export const fmt = x => (x == null ? '–' : (Math.round(x * 10) / 10).toString().replace('.', ',').replace('-', '−'));
const LUNI = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
export const dataRo = iso => { const [, m, d] = iso.split('-').map(Number); return `${d} ${LUNI[m - 1]}`; };

// v0.45: datoriile (datorie totală / capital propriu, Finnhub). Băncile și asigurătorii lucrează normal cu datorii mari: nu se aplică.
export const DATORII_MARI = 2.5;
const FINANCIARE = sym => ACTIUNI_CATALOG[sym]?.sector === 'Financiar';
export function contextScor(m, sym = '') {
  const motive = []; let tehnic = 0, fundam = 0;
  const ind = m?.ind;
  if (ind) {
    if (ind.sma200 != null) {
      if (ind.pret > ind.sma200) { tehnic += 1; motive.push('+ Prețul e peste media de 200 de zile: trendul lung e în sus'); }
      else { tehnic -= 1; motive.push('− Prețul e sub media de 200 de zile: trendul lung e în jos'); }
    }
    if (ind.sma50 != null && ind.sma200 != null) {
      if (ind.sma50 > ind.sma200) { tehnic += 0.5; motive.push('+ Media de 50 de zile e peste cea de 200'); }
      else { tehnic -= 0.5; motive.push('− Media de 50 de zile e sub cea de 200'); }
    }
    if (ind.rsi != null) {
      const r = Math.round(ind.rsi);
      if (ind.rsi < 30) { tehnic += 1; motive.push(`+ RSI ${r}: a scăzut foarte repede (supravândută)`); }
      else if (ind.rsi > 70) { tehnic -= 1; motive.push(`− RSI ${r}: a urcat foarte repede (supracumpărată)`); }
      else motive.push(`· RSI ${r}: zonă neutră`);
    }
    if (ind.macdCross === 1) { tehnic += 0.5; motive.push('+ MACD s-a întors în sus în ultimele zile'); }
    if (ind.macdCross === -1) { tehnic -= 0.5; motive.push('− MACD s-a întors în jos în ultimele zile'); }
  }
  const rec = m?.rec;
  if (rec) {
    const pos = (rec.strongBuy || 0) + (rec.buy || 0), neg = (rec.sell || 0) + (rec.strongSell || 0), tot = pos + neg + (rec.hold || 0);
    if (tot) {
      const h = rec.hold || 0, net = (pos - neg) / tot, txt = `Analiștii: ${pos} recomandă cumpărare, ${h} păstrare, ${neg} vânzare`;
      if (net > 0.5) { fundam += 1; motive.push('+ ' + txt); } else if (net < 0) { fundam -= 1; motive.push('− ' + txt); } else motive.push('· ' + txt);
    }
  }
  const f = m?.fund;
  if (f) {
    if (f.crestereVenit != null) {
      if (f.crestereVenit > 15) { fundam += 0.5; motive.push(`+ Venituri în creștere cu ${fmt(f.crestereVenit)}% pe an`); }
      else if (f.crestereVenit < 0) { fundam -= 0.5; motive.push(`− Venituri în scădere (${fmt(f.crestereVenit)}% pe an)`); }
    }
    if (f.datorii != null && f.datorii > DATORII_MARI && !FINANCIARE(sym)) { fundam -= 0.5; motive.push(`− Datorii mari: ${fmt(f.datorii)} lei datorie la 1 leu capital propriu`); }
    if (f.pe != null) {
      if (f.pe > Math.max(60, 1.8 * (f.peSector || 0))) { fundam -= 0.5; motive.push(`− Evaluare scumpă: P/E ${fmt(f.pe)}${f.peSector ? `, față de ${fmt(f.peSector)} median în sector` : ''}`); }
      else if (f.pe > 0 && f.pe < 15) { fundam += 0.5; motive.push(`+ Evaluare ieftină: P/E ${fmt(f.pe)}`); }
    }
  }
  return { tehnic, fundam, motive };
}

export function evalueaza(g, m, teme, azi, profil = PROFIL) {
  const { tehnic, fundam, motive } = contextScor(m, g.symbol);
  const atentie = []; const ind = m?.ind;
  const scor = Math.round((tehnic + fundam) * 10) / 10;
  const tinta = g.tinta ?? 0, abatere = g.pondere - tinta;
  const tp = teme[g.tema] || 0;
  let zileRez = null;
  if (m?.rezultate && azi) zileRez = Math.round((Date.parse(m.rezultate) - Date.parse(azi)) / 864e5);
  const rezAproape = zileRez != null && zileRez >= 0 && zileRez <= RISK.zileRezultate;
  if (rezAproape) atentie.push(`Rezultate trimestriale pe ${dataRo(m.rezultate)}. Sunt posibile mișcări mari, în ambele sensuri.`);

  let semnal, oportunitate = null, cauza = null, refRel = null;
  if (g.etf) {
    motive.unshift('· ETF-ul global e nucleul portofoliului: se cumpără constant și nu se vinde pe semnale');
    semnal = abatere < -1 ? 'adauga' : abatere > 5 ? 'nu_adauga' : 'pastreaza';
  } else if (g.pondere > profil.maxActiune * RISK.reechilibrareX) {
    semnal = 'reechilibreaza';
    atentie.push(`Ocupă ${fmt(g.pondere)}% din portofoliu, ${tinta > 0 ? `de ${fmt(g.pondere / tinta)} ori mai mult decât ținta ta de ${fmt(tinta)}%` : 'iar ținta ta pentru acțiuni e 0%'}. Fără impozit: nu mai cumpăra și lasă depunerile noi să-i scadă ponderea. Mai repede: vinzi o parte, dar câștigul din vânzare se impozitează cu 16%.`);
  } else if (ind?.subProtectie) {
    semnal = 'verifica';
    // v0.45: dacă pe 3 luni a mers cam ca sectorul ei (sau ca piața), scăderea vine din sector, nu din companie
    const rel = ind.r3l != null && m?.ref3l != null ? ind.r3l - m.ref3l : null; refRel = rel;
    if (rel != null && rel > -5) { cauza = /^sectorul/.test(m?.refNume || '') ? 'sector' : 'piata';
      atentie.push(cauza === 'sector'
        ? `A coborât sub nivelul de alertă (${fmt(ind.protectie)}), dar pe 3 luni a mers cam ca ${m.refNume} (${fmt(ind.r3l)}% față de ${fmt(m.ref3l)}%): scade tot sectorul, nu doar compania. Nu e un ordin de vânzare; uită-te dacă vrei atâția bani într-un singur sector.`
        : `A coborât sub nivelul de alertă (${fmt(ind.protectie)}), dar pe 3 luni a mers cam ca piața (${fmt(ind.r3l)}% față de ${fmt(m.ref3l)}% VWCE): scăderea vine din piață, nu din companie. Nu e un ordin de vânzare.`); }
    else if (rel != null) atentie.push(`A coborât sub nivelul de alertă (${fmt(ind.protectie)}), iar pe 3 luni a mers cu ${fmt(Math.abs(rel))} puncte mai slab decât ${/^sectorul/.test(m?.refNume || '') ? m.refNume : 'piața (VWCE)'} (${fmt(ind.r3l)}% față de ${fmt(m.ref3l)}%): problema pare la companie. Nu e un ordin de vânzare. Verifică dacă motivul pentru care o ții mai e valabil: rezultate, prognoze, știri.`);
    else atentie.push(`A coborât sub nivelul de alertă (${fmt(ind.protectie)}). Nu e un ordin de vânzare. Verifică dacă motivul pentru care o ții mai e valabil: rezultate, prognoze, știri.`);
  } else if (tehnic + fundam <= -2.5) {
    semnal = 'verifica';
    atentie.push('S-au deteriorat și trendul, și fundamentalele. Verifică dacă motivul pentru care o ții mai e valabil.');
  } else if (tp > profil.maxTema && g.tema !== 'Altele') {
    semnal = abatere < 0 ? 'pastreaza' : 'nu_adauga';
    atentie.push(`Sectorul „${g.tema}” are ${fmt(tp)}% din portofoliu, peste plafonul de ${profil.maxTema}%. Banii noi merg în altă parte.`);
  } else if (abatere > 2) {
    semnal = 'nu_adauga';
  } else if (abatere < 0) {
    if (rezAproape) semnal = 'asteapta';
    else if (ind?.rsi > RISK.rsiScump) { semnal = 'asteapta'; atentie.push(`RSI ${Math.round(ind.rsi)}: a urcat foarte repede în ultimele săptămâni. Amână cumpărarea, adesea apare un preț mai bun.`); }
    else semnal = 'adauga';
  } else semnal = 'pastreaza';

  // Reducere (v0.22): o acțiune care a scăzut mult, dar din cauza pieței, nu a companiei.
  // „Mult” = cel puțin 15% sub maximul pe un an SAU 1,5 × mișcarea ei obișnuită pe o lună, oricare e mai mare
  // (pentru o acțiune agitată, 15% e o lună normală). „Din cauza pieței” = pe 3 luni a scăzut cel mult cu 10 puncte
  // mai mult decât sectorul ei (sau decât VWCE, dacă nu are cu cine se compara). Fundamentalele trebuie să fie cel puțin neutre.
  // Se cumpără în trei tranșe: acum, când prețul nu mai scade (peste media de 20 de zile), când revine peste media de 200.
  let reducere = null;
  if (!g.etf && semnal !== 'reechilibreaza' && ind?.deLaMaxim != null) {
    const scad = -ind.deLaMaxim, volLuna = ind.volAn != null ? ind.volAn / Math.sqrt(12) : null, prag = Math.max(15, volLuna != null ? 1.5 * volLuna : 0);
    if (scad >= prag) {
      const ref = m?.ref3l, rel = ind.r3l != null && ref != null ? ind.r3l - ref : null, refNume = m?.refNume || 'piața';
      const areDate = !!(m?.fund || m?.rec), fundOk = areDate && fundam >= 0;
      if (rel != null && rel < -10) atentie.push(`A scăzut ${fmt(scad)}% față de maximul pe un an. Pe 3 luni: ${fmt(ind.r3l)}%, față de ${fmt(ref)}% pentru ${refNume}: scăderea vine mai ales de la companie, nu de la piață. Nu e o reducere.`);
      else if (areDate && !fundOk) atentie.push(`A scăzut ${fmt(scad)}% față de maximul pe un an, iar cifrele companiei s-au înrăutățit. Nu e o reducere.`);
      else if (fundOk && rel != null && abatere < 0) reducere = { scadere: scad, prag, r3l: ind.r3l, ref3l: ref, refNume, sma20: ind.sma20, sma200: ind.sma200,
        etapa: ind.sma20 != null && ind.pret > ind.sma20 ? 'stabilizat' : 'scade', sectorPeste: tp > profil.maxTema && g.tema !== 'Altele', tema: g.tema, tp };
    }
  }
  // Oportunitate: o acțiune sub țintă, în trend lung bun, care a scăzut repede (RSI mic).
  // v0.41: doar după RSI. „10% sub maximul pe 3 luni” a fost urmat, pe istoric, mai des de încă o cădere de 20% (34% din cazuri,
  // față de 22% în mod obișnuit): nu era o oportunitate. RSI mic într-un trend bun a fost urmat mai des de revenire.
  if (!g.etf && semnal === 'adauga' && ind && ind.sma200 != null && ind.pret > ind.sma200 && fundam >= 0 && ind.rsi != null && ind.rsi < RISK.rsiIeftin) {
    oportunitate = `RSI ${Math.round(ind.rsi)}: a scăzut repede în ultimele săptămâni${ind.deLaMaxim3l != null && ind.deLaMaxim3l < -1 ? ` (${fmt(-ind.deLaMaxim3l)}% sub maximul pe 3 luni)` : ''}. Trendul lung și fundamentalele sunt în regulă.`;
  }
  if (abatere !== 0 && !g.etf) motive.push(`· Pondere ${fmt(g.pondere)}%, ținta ta e ${fmt(tinta)}%`);
  return { semnal, eticheta: ETICHETE[semnal], scor, tehnic, fundam, motive, atentie, oportunitate, reducere, cauza, refRel, refNume: m?.refNume || null };
}

// ---------- Oportunitate în timpul zilei ----------
// Aceleași reguli ca seara, pe prețul de acum: o acțiune pe care oricum o adaugi (semnal Adaugă),
// în trend lung bun, cu fundamentale neutre sau bune, care a scăzut temporar.
// p = poziția din ultima analiză de seară (cu serie, ind, fundam), pret = prețul de acum.
export function oportunitateIntraday(p, pret) {
  if (!p || p.etf || p.semnal !== 'adauga' || p.oportunitate || !(pret > 0)) return null;
  const c = p.serie?.c, ind = p.ind;
  if (!c?.length || !ind?.sma200 || pret <= ind.sma200 || (p.fundam ?? 0) < 0) return null;
  const max3l = Math.max(...c.slice(-63)), scadere = (pret / max3l - 1) * 100;
  const r = rsi([...c.slice(-120), pret]);
  if (!(r != null && r < RISK.rsiIeftin)) return null; // v0.41: doar după RSI (vezi evalueaza)
  return { scadere, rsi: r, text: `RSI ${Math.round(r)}: a scăzut foarte repede${scadere < -1 ? ` (${fmt(-scadere)}% sub maximul pe 3 luni)` : ''}. Trendul lung și fundamentalele sunt în regulă.` };
}

// ---------- Planul lunar ----------
// Unde merg banii noi ca portofoliul să se apropie de ținte, FĂRĂ vânzări.
export function planLunar(pozitii, total, suma, profil = PROFIL) {
  const T2 = total + suma;
  const cand = pozitii
    .filter(p => p.semnal === 'adauga')
    .map(p => ({ p, deficit: p.tinta / 100 * T2 - p.valueRON }))
    .filter(x => x.deficit > 0)
    .sort((a, b) => (!!b.p.oportunitate - !!a.p.oportunitate) || b.deficit - a.deficit) // oportunitățile întâi
    .slice(0, profil.maxCumparariPeLuna);
  let linii = [];
  if (!cand.length) {
    const etf = pozitii.find(p => p.etf);
    if (etf) linii = [{ symbol: etf.symbol, suma, motiv: 'Toate acțiunile sunt la țintă sau peste: banii merg în ETF-ul global' }];
  } else {
    const totDef = cand.reduce((a, x) => a + x.deficit, 0);
    linii = cand.map(x => ({ symbol: x.p.symbol, suma: Math.floor(suma * x.deficit / totDef / 10) * 10, etf: x.p.etf,
      motiv: `acum ${fmt(x.p.pondere)}%, ținta ${fmt(x.p.tinta)}%` }));
    // tranșe prea mici se adună la prima
    for (let i = linii.length - 1; i > 0; i--) if (linii[i].suma < profil.transaMinima) { linii[0].suma += linii[i].suma; linii.splice(i, 1); }
    linii[0].suma += suma - linii.reduce((a, l) => a + l.suma, 0);
  }
  for (const l of linii) {
    const p = pozitii.find(x => x.symbol === l.symbol);
    l.broker = profil.brokerPreferat;
    l.dupa = (p.valueRON + l.suma) / T2 * 100;
    if (!p.brokers.some(b => b.broker === profil.brokerPreferat)) l.nota = `O ai doar la ${p.brokers[0].broker}. Dacă o găsești și la ${profil.brokerPreferat}, cumpăr-o acolo: contul e în lei.`;
  }
  return linii;
}

// Planul în unități reale: cât în moneda acțiunii, câte acțiuni, comisionul valutar, când să cumperi.
export function planExact(l, pozitii, fx) {
  const p = pozitii.find(x => x.symbol === l.symbol), pret = p?.ind?.pret, m = p?.moneda, curs = fx?.[m];
  const out = { ...l, moneda: m };
  if (pret && curs) { out.sumaValuta = l.suma / curs; out.unitati = out.sumaValuta / pret; out.pret = pret; }
  const c = COMISION_FX[l.broker]; if (c != null && m && m !== 'RON') out.comision = l.suma * c / 100;
  if (ORAR[m]) out.orar = ORAR[m];
  return out;
}

// Câte luni de depuneri până ETF-ul atinge ținta, dacă toți banii noi merg acolo.
// null = ținta nu se poate atinge doar din depuneri (ținta 100% cu acțiuni în portofoliu).
export function luniPanaLaTinta(totalETF, total, profil = PROFIL, suma = profil.contributieTipica) {
  const t = profil.tintaETF / 100;
  if (totalETF >= t * total) return 0;
  if (t >= 1 || !(suma > 0)) return null;
  return Math.ceil((t * total - totalETF) / (1 - t) / suma);
}

// ---------- Avertizări pe tot portofoliul ----------
export function avertizariPortofoliu(comb, profil = PROFIL) {
  const out = [];
  for (const [t, p] of Object.entries(comb.teme)) {
    if (t !== 'Altele' && t !== TEMA_ETF && p > profil.maxTema) out.push(`Sectorul „${t}” are ${fmt(p)}% din portofoliu, peste plafonul de ${profil.maxTema}%. Dacă sectorul scade, scad aproape toate pozițiile odată.`);
  }
  for (const g of comb.list) {
    if (!g.etf && g.pondere > profil.maxActiune * RISK.reechilibrareX) out.push(`${g.symbol} are singură ${fmt(g.pondere)}% din portofoliu, peste plafonul de ${profil.maxActiune}% pe acțiune.`);
  }
  const etf = comb.list.filter(g => g.etf).reduce((a, b) => a + b.valueRON, 0);
  const etfP = comb.total ? etf / comb.total * 100 : 0;
  if (etfP < profil.tintaETF - 5) {
    const luni = luniPanaLaTinta(etf, comb.total, profil);
    out.push(luni == null ? `ETF-ul global are ${fmt(etfP)}% din portofoliu, ținta ta e ${profil.tintaETF}%. Cu acțiuni în portofoliu, ținta de 100% se atinge doar vânzându-le; depunerile doar te apropie de ea.`
      : `ETF-ul global are ${fmt(etfP)}% din portofoliu, ținta e ${profil.tintaETF}%. Dacă toate depunerile merg acolo, ajungi la țintă în aproximativ ${luni} ${de(luni)}${luni === 1 ? 'lună' : 'luni'}, cu ${profil.contributieTipica} ${de(profil.contributieTipica)}lei pe lună, fără să vinzi nimic.`);
  }
  return out;
}

// Expunerea valutară reală: la ETF-uri contează moneda companiilor din interior, nu moneda în care e cotat ETF-ul.
// VWCE e cotat în euro, dar ~62% din el sunt companii americane: acea parte se mișcă după dolar.
export function expunereValutara(list) {
  const out = {};
  for (const g of list) {
    const v = ETF_CATALOG[g.symbol]?.valute;
    if (!v) { out[g.moneda] = (out[g.moneda] || 0) + g.pondere; continue; }
    let rest = 100; for (const [m, x] of Object.entries(v)) { out[m] = (out[m] || 0) + g.pondere * x / 100; rest -= x; }
    if (rest > 0) out['Alte'] = (out['Alte'] || 0) + g.pondere * rest / 100;
  }
  return out;
}
export function dubluri(list, profil = PROFIL) {
  const s = list.filter(g => new Set(g.brokers.map(b => b.broker)).size > 1).map(g => g.symbol);
  if (!s.length) return [];
  const lista = s.length === 1 ? s[0] : `${s.slice(0, -1).join(', ')} și ${s.at(-1)}`;
  return [`${lista} ${s.length === 1 ? 'e' : 'sunt'} în ambele conturi. Păstrează ce ai și cumpără de acum doar la ${profil.brokerPreferat}.`];
}

// ---------- Instantaneul complet ----------
export function construiesteSnapshot({ positions, market, azi, surse, fx, profil = PROFIL }) {
  const comb = combine(positions);
  comb.list = cuAlese(comb.list, profil.alese);
  const t = tinte(comb.list, profil);
  for (const g of comb.list) g.tinta = t[g.symbol];
  const pozitii = comb.list.map(g => {
    const m = market[g.symbol];
    const ev = evalueaza(g, m, comb.teme, azi, profil);
    return { ...g, ind: m?.ind || null, serie: m?.serie || null, ...(m?.ref3l != null ? { ref3l: m.ref3l } : {}), fund: m?.fund || null, rec: m?.rec || null, rezultate: m?.rezultate || null, ...(m?.logo ? { logo: m.logo } : {}), ...ev };
  });
  const planuri = { [profil.contributieTipica]: planLunar(pozitii, comb.total, profil.contributieTipica, profil).map(l => planExact(l, pozitii, fx)) };
  const vw = pozitii.find(p => p.etf)?.ind;
  return {
    generat: new Date().toISOString(), azi, surse, fx, profil,
    totalRON: comb.total,
    costRON: comb.list.reduce((a, b) => a + b.costRON, 0),
    teme: comb.teme,
    valute: expunereValutara(comb.list),
    dubluri: dubluri(comb.list, profil),
    avertizari: avertizariPortofoliu(comb, profil),
    etfRef: vw ? { r3l: vw.r3l, r6l: vw.r6l, r1a: vw.r1a } : null,
    planuri,
    pozitii,
  };
}

// Schimbări de semnal care merită o notificare (nu orice pendulare Păstrează/Adaugă).
const IMPORTANTE = ['verifica', 'reechilibreaza'];
export function schimbari(vechi, nou) {
  if (!vechi) return [];
  const v = Object.fromEntries((vechi.pozitii || []).map(p => [p.symbol, p]));
  const out = [];
  for (const p of nou.pozitii) {
    const o = v[p.symbol]; if (!o) continue;
    if (o.semnal !== p.semnal) out.push({ symbol: p.symbol, din: o.semnal, in: p.semnal, eticheta: p.eticheta, important: IMPORTANTE.includes(p.semnal) });
    if (p.oportunitate && !o.oportunitate) out.push({ symbol: p.symbol, din: o.semnal, in: p.semnal, eticheta: 'Oportunitate', important: true });
  }
  return out;
}

// ---------- Raportul anual pentru Declarația Unică (F5) ----------
// tranzactii: [{ broker, data, symbol, lei }] (câștigul sau pierderea fiecărei vânzări, în lei; eToro cu cursul BNR din ziua vânzării)
// dividende: [{ data, symbol, lei }] încasate (net de reținerea din străinătate), în lei.
// Impozitul pe câștig: 16% din câștigul net al anului (pierderile din același an se scad). Dividende: România cere 16% din brut,
// minus ce s-a reținut deja în străinătate (cel mult 16%). CASS: 10% din treapta de 6, 12 sau 24 de salarii minime atinsă.
export const retinereDiv = sym => RETINERE_DIV[Object.keys(RETINERE_DIV).find(k => k !== 'US' && sym.endsWith(k))] ?? RETINERE_DIV.US;
export function raportAnual(an, tranzactii = [], dividende = []) {
  const t = tranzactii.filter(x => String(x.data).startsWith(an)), d = dividende.filter(x => String(x.data).startsWith(an));
  const peBroker = ['Trading 212', 'eToro'].map(b => { const l = t.filter(x => x.broker === b);
    return { broker: b, n: l.length, castig: l.filter(x => (x.lei || 0) > 0).reduce((a, x) => a + x.lei, 0), pierdere: l.filter(x => (x.lei || 0) < 0).reduce((a, x) => a + x.lei, 0), net: l.reduce((a, x) => a + (x.lei || 0), 0) }; });
  const net = peBroker.reduce((a, b) => a + b.net, 0), impozitCastig = Math.max(0, net) * IMPOZIT.cota / 100;
  const peTara = {};
  for (const x of d) { const r = retinereDiv(x.symbol), brut = x.lei / (1 - r / 100), tara = r === RETINERE_DIV.US && !x.symbol.includes('.') ? 'SUA' : (x.symbol.match(/\.(\w+)$/)?.[1] || 'alta');
    const g = peTara[tara] ||= { tara, retinere: r, net: 0, brut: 0, retinut: 0, n: 0 };
    g.net += x.lei; g.brut += brut; g.retinut += brut - x.lei; g.n++; }
  const tari = Object.values(peTara).map(g => ({ ...g, impozitRO: Math.max(0, g.brut * IMPOZIT.cota / 100 - Math.min(g.retinut, g.brut * IMPOZIT.cota / 100)) }));
  const divBrut = tari.reduce((a, g) => a + g.brut, 0), divNet = tari.reduce((a, g) => a + g.net, 0), impozitDiv = tari.reduce((a, g) => a + g.impozitRO, 0);
  // CASS: veniturile din investiții ale anului (câștigul net, dacă e pozitiv, plus dividendele brute), pe trepte
  const venituri = Math.max(0, net) + divBrut, praguri = CASS.trepte.map(k => k * CASS.salariuMinim);
  const treapta = [...praguri].reverse().find(p => venituri >= p) || 0, cass = treapta * CASS.cota / 100;
  return { an, tranzactii: t.length, faraCurs: t.filter(x => x.lei == null).length, peBroker, net, impozitCastig, dividende: d.length, tari, divBrut, divNet, impozitDiv,
    venituri, praguri, treapta, cass, total: impozitCastig + impozitDiv + cass, depune: net !== 0 || d.length > 0 || cass > 0 };
}

// Evoluția fiecărui cont, zi cu zi, pe ultimele n zile de bursă, reconstituită din ce ai acum și din ce ai cumpărat/vândut:
//   valoare(zi) = unități deținute în ziua aceea × prețul de închidere × cursul BNR al zilei.
//   Trading 212: unitățile de azi minus execuțiile de după acea zi (suma în lei / prețul unității în ziua execuției).
//   eToro: unitățile de azi împărțite pe loturi după data deschiderii (lotul intră în ziua în care l-ai deschis).
//   f = banii intrați (+) sau ieșiți (−) în fiecare zi; vw = prețul VWCE în lei. Comparația se face cu comparaVWCE pe fereastra aleasă.
// Prețul unității e calibrat pe valoarea de azi a poziției (acoperă moneda de listare, pence etc.).
// poz: [{ cont, sym, qty, valueRON, d:[], c:[], moneda, loturi }]; exec: [{ data, sym, tip, lei }] (Trading 212);
// curs(d, m) = lei pentru 1 unitate din moneda m la data d; vw = { d:[], c:[] } (VWCE în EUR).
export function evolutieConturi(poz, exec, curs, vw, n = 260) {
  const zile = [...new Set(poz.flatMap(p => p.d || []))].filter(Boolean).sort().slice(-n);
  if (zile.length < 2) return null;
  const ffill = (d, c) => { const m = new Map(d.map((x, i) => [x, c[i]])); let ult = c.find(x => x != null) ?? null; return zile.map(z => { const v = m.get(z); if (v != null) ult = v; return ult; }); };
  const fx = (z, m) => !m || m === 'RON' ? 1 : curs(z, m);
  const out = { d: zile, cont: {} }, fin = zile.length - 1;
  const vwL = vw?.d?.length ? ffill(vw.d, vw.c).map((c, i) => { const e = fx(zile[i], 'EUR'); return c && e ? c * e : null; }) : null;
  for (const cont of [...new Set(poz.map(p => p.cont))]) {
    const val = zile.map(() => 0), cumparat = zile.map(() => 0); let bune = 0;
    for (const p of poz.filter(x => x.cont === cont)) {
      const cl = ffill(p.d || [], p.c || []); if (cl[fin] == null || !(p.valueRON > 0)) continue;
      const fxNow = fx(zile[fin], p.moneda) || 1, qn = p.qty > 0 ? p.qty : 1;
      const k = p.valueRON / (qn * cl[fin] * fxNow);
      const unit = zile.map((z, i) => cl[i] == null ? null : cl[i] * (fx(z, p.moneda) || fxNow) * k);
      const idx = d => { let i = zile.findIndex(z => z >= d); return i < 0 ? fin + 1 : i; };
      let q;
      if (cont === 'eToro' && p.loturi?.length) {
        const tot = p.loturi.reduce((a, l) => a + (l.usd || 0), 0) || 1;
        q = zile.map(z => qn * p.loturi.reduce((a, l) => a + (!l.data || l.data <= z ? (l.usd || 0) : 0), 0) / tot);
      } else {
        q = zile.map(() => qn);
        for (const e of exec.filter(x => x.sym === p.sym)) {
          const i = idx(e.data); if (i > fin) continue; const u = unit[i]; if (!u) continue;
          const du = (e.tip === 'vanzare' ? -1 : 1) * e.lei / u;
          for (let j = 0; j < i; j++) q[j] -= du; // înainte de execuție aveai cu atât mai puțin (sau mai mult, la vânzare)
        }
        q = q.map(x => Math.max(0, x));
      }
      zile.forEach((z, i) => { if (unit[i] == null) return; val[i] += q[i] * unit[i]; cumparat[i] += (q[i] - (i ? q[i - 1] : 0)) * unit[i]; });
      bune++;
    }
    if (!bune) continue;
    out.cont[cont] = { v: val.map(x => +x.toFixed(2)), f: cumparat.map(x => +x.toFixed(2)) };
  }
  if (vwL) out.vw = vwL.map(x => x == null ? null : +x.toFixed(4));
  return Object.keys(out.cont).length ? out : null;
}
// Comparația cu VWCE pe orice fereastră: în prima zi, aceeași valoare ca tine; apoi fiecare cumpărare/vânzare (f) intră în VWCE
// la prețul zilei (vw, în lei). Așa „1 lună” compară doar luna, nu tot anul.
export function comparaVWCE(v, f, vw) {
  if (!vw || !v?.length) return null;
  let u = 0, rest = 0;
  return v.map((x, i) => { rest += i ? (f[i] || 0) : x; if (!vw[i]) return null; u += rest / vw[i]; rest = 0; return +(u * vw[i]).toFixed(2); });
}

// ---- v0.30 ----
// Versiuni „0.29.0” < „0.30.0”: comparație pe numere, nu pe text.
export function versiuneMaiMica(a, b) {
  const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); }
  return false;
}

// Lunile în care fiecare companie a plătit dividende în ultimele 13 luni (din istoricul Trading 212), ca să știm când vin următoarele.
// lista: [{ data, symbol, lei }]; canonic: funcția care aduce simbolul la forma din portofoliu.
export function luniDividende(lista, azi, canonic = s => s) {
  const de = new Date(Date.parse(azi) - 400 * 864e5).toISOString().slice(0, 10), out = {};
  for (const d of lista || []) { if (!d?.data || d.data < de || d.data > azi || !d.symbol) continue;
    const s = canonic(d.symbol), l = +d.data.slice(5, 7); (out[s] ||= new Set()).add(l); }
  return Object.fromEntries(Object.entries(out).map(([s, v]) => [s, [...v].sort((a, b) => a - b)]));
}

// Calendarul dividendelor pe următoarele 12 luni, în lei net.
// peActiune: [{ symbol, net }] (net pe an, estimat); luni: { SYM: [1, 4, 7, 10] }.
// O companie fără plăți în istoric nu primește o lună inventată: apare separat, „fără dată”.
export function calendarDividende(peActiune, luni, azi) {
  const y = +azi.slice(0, 4), m = +azi.slice(5, 7), z = +azi.slice(8, 10);
  const urm = Array.from({ length: 12 }, (_, i) => { const k = m - 1 + i + (z > 20 ? 1 : 0), an = y + Math.floor(k / 12), l = k % 12 + 1; return { cheie: `${an}-${String(l).padStart(2, '0')}`, luna: l, plati: [], total: 0 }; });
  const faraLuna = [];
  for (const p of peActiune || []) {
    if (!(p.net > 0)) continue;
    const L = luni?.[p.symbol];
    if (!L?.length) { faraLuna.push({ symbol: p.symbol, net: +p.net.toFixed(2) }); continue; }
    const pe = p.net / L.length;
    for (const u of urm) if (L.includes(u.luna)) { u.plati.push({ symbol: p.symbol, net: +pe.toFixed(2) }); u.total += pe; }
  }
  for (const u of urm) { u.total = +u.total.toFixed(2); u.plati.sort((a, b) => b.net - a.net); }
  return { luni: urm, faraLuna, total: +urm.reduce((a, u) => a + u.total, 0).toFixed(2) };
}

// Cât impozit (și CASS) economisești dacă vinzi până la sfârșitul anului pozițiile aflate pe pierdere.
// tranzactii/dividende: ca la raportAnual; pierderi: [{ symbol, broker, lei }] (lei < 0, câștigul nerealizat al poziției).
// Se aleg pierderile, de la cea mai mare, doar cât să acopere câștigul net realizat: mai mult nu scade impozitul.
export function optimizareImpozit(an, tranzactii, dividende, pierderi) {
  const inainte = raportAnual(an, tranzactii, dividende);
  const lista = (pierderi || []).filter(p => p.lei < -0.5).sort((a, b) => a.lei - b.lei), alese = [];
  let rest = inainte.net;
  for (const p of lista) { if (rest <= 0) break; alese.push(p); rest += p.lei; }
  const ziua = `${an}-12-31`;
  const dupa = raportAnual(an, [...tranzactii, ...alese.map(p => ({ broker: p.broker, data: ziua, symbol: p.symbol, lei: p.lei }))], dividende);
  return { inainte, dupa, alese, economie: +Math.max(0, inainte.total - dupa.total).toFixed(2), pierdereFolosita: +alese.reduce((a, p) => a + p.lei, 0).toFixed(2) };
}

// Raportul unei perioade (lună sau an) din evoluția zilnică a conturilor: valoarea la început și la sfârșit, banii depuși,
// câștigul pieței și comparația cu VWCE pe aceiași bani. ev = snap.evolutie; de/pana = 'YYYY-MM-DD' inclusiv.
export function raportPerioada(ev, de, pana, conturi = null) {
  if (!ev?.d?.length) return null;
  const cs = Object.entries(ev.cont || {}).filter(([k]) => !conturi || conturi.includes(k)).map(([, c]) => c);
  if (!cs.length) return null;
  const idx = ev.d.map((d, i) => [d, i]).filter(([d]) => d >= de && d <= pana).map(([, i]) => i);
  if (idx.length < 2) return null;
  const i0 = idx[0] > 0 ? idx[0] - 1 : idx[0], i1 = idx[idx.length - 1]; // începutul = închiderea dinaintea perioadei
  const v = ev.d.map((_, i) => cs.reduce((a, c) => a + (c.v[i] || 0), 0)), f = ev.d.map((_, i) => cs.reduce((a, c) => a + (c.f?.[i] || 0), 0));
  const start = v[i0], fin = v[i1], depus = f.slice(i0 + 1, i1 + 1).reduce((a, x) => a + x, 0), castig = fin - start - depus;
  const baza = start + depus / 2, rand = baza > 0 ? castig / baza * 100 : null;
  const b = ev.vw ? comparaVWCE(v.slice(i0, i1 + 1), f.slice(i0, i1 + 1), ev.vw.slice(i0, i1 + 1)) : null;
  return { de: ev.d[idx[0]], pana: ev.d[i1], start: +start.toFixed(2), fin: +fin.toFixed(2), depus: +depus.toFixed(2), castig: +castig.toFixed(2),
    rand: rand == null ? null : +rand.toFixed(2), vwce: b?.at(-1) != null ? +b.at(-1).toFixed(2) : null, peZi: { d: ev.d.slice(i0, i1 + 1), v: v.slice(i0, i1 + 1).map(x => +x.toFixed(2)) } };
}

// ---- v0.32: analistul care te anunță ----
// Cumpărările din planul lunii încă nefăcute care sunt azi la reducere față de închiderea de ieri.
// plan: [{ symbol, suma, broker }]; ref: { SYM: poziția din analiza de ieri (ind.pret = închiderea, ind.atrPct) };
// pret: { SYM: prețul de acum }; operatiuni: cumpărările văzute (din analiza de seară); azi: 'YYYY-MM-DD'.
export function ocaziiPlan(plan, ref, pret, operatiuni, azi, o = { planMin: 1.5, planATR: 0.8 }) {
  const luna = azi.slice(0, 7), cumparat = new Set((operatiuni || []).filter(x => x.tip === 'cumparare' && String(x.data).startsWith(luna)).map(x => x.symbol));
  const out = [];
  for (const l of plan || []) {
    const r = ref?.[l.symbol], p = pret?.[l.symbol];
    if (!r?.ind?.pret || !(p > 0) || cumparat.has(l.symbol)) continue;
    const vari = (p / r.ind.pret - 1) * 100, prag = Math.max(o.planMin, o.planATR * (r.ind.atrPct || 0));
    if (vari <= -prag) out.push({ symbol: l.symbol, vari, prag, suma: l.suma, broker: l.broker, etf: !!r.etf });
  }
  return out.sort((a, b) => a.vari - b.vari);
}

// Mișcarea de azi a portofoliului: media ponderată a mișcărilor, în procente și în lei, cu cele mai mari mișcări.
// pozitii: [{ symbol, valueRON }]; vari: { SYM: % azi }. Pozițiile fără preț de azi contează cu 0%.
export function miscarePortofoliu(pozitii, vari) {
  const tot = (pozitii || []).reduce((a, p) => a + (p.valueRON || 0), 0);
  if (!(tot > 0)) return null;
  let lei = 0; const l = [];
  for (const p of pozitii) { const v = vari?.[p.symbol]; if (v == null || !Number.isFinite(v)) continue;
    const d = p.valueRON * v / 100; lei += d; l.push({ symbol: p.symbol, vari: v }); }
  l.sort((a, b) => b.vari - a.vari);
  return { pct: lei / tot * 100, lei, sus: l.filter(x => x.vari > 0).slice(0, 2), jos: l.filter(x => x.vari < 0).slice(-2).reverse() };
}

// Rezumatul zilei, după închidere: cât s-a mișcat portofoliul, cine a urcat, cine a scăzut, ce semnale noi au apărut.
// pozitii: din analiza de azi (valueRON = valoarea la închidere, ind.r1z = mișcarea zilei în %); sch: schimbările de semnal.
export function rezumatZi(pozitii, sch = []) {
  const vari = {}, ieri = [];
  for (const p of pozitii || []) { const r = p.ind?.r1z; if (r == null || !Number.isFinite(r)) continue;
    vari[p.symbol] = r; ieri.push({ symbol: p.symbol, valueRON: p.valueRON / (1 + r / 100) }); }
  const m = miscarePortofoliu(ieri, vari); if (!m) return null;
  const f = x => `${x.symbol} ${x.vari > 0 ? '+' : '−'}${fmt(Math.abs(x.vari))}%`;
  const linii = [];
  if (m.sus.length) linii.push('Sus: ' + m.sus.map(f).join(', ') + '.');
  if (m.jos.length) linii.push('Jos: ' + m.jos.map(f).join(', ') + '.');
  const noi = (sch || []).filter(x => x.important);
  if (noi.length) linii.push(`${noi.length === 1 ? 'Semnal nou' : noi.length + ' semnale noi'}: ${noi.map(x => `${x.symbol} (${x.eticheta})`).join(', ')}.`);
  return { pct: m.pct, lei: m.lei, titlu: `Ziua pe bursă: ${m.pct >= 0 ? '+' : '−'}${fmt(Math.abs(m.pct))}% (${m.lei >= 0 ? '+' : '−'}${String(Math.round(Math.abs(m.lei))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} lei)`, text: linii.join(' ') || 'O zi liniștită.' };
}

// Ziua de bursă pentru rezumat: cea mai nouă lumânare din date (cel mult 3 zile în urmă) și pozițiile care o au.
// Într-o zi fără bursă nu apare o lumânare nouă, deci rezumatul (cheia „rezumat:ZIUA”) nu se repetă.
export function ziRezumat(pozitii, azi) {
  const poz = (pozitii || []).filter(p => !p.virtual), ok = d => /^\d{4}-\d\d-\d\d$/.test(d || '');
  const zi = poz.map(p => p.serie?.d?.at(-1)).filter(ok).sort().at(-1);
  if (!zi || zi > azi || (Date.parse(azi) - Date.parse(zi)) / 864e5 > 3) return null;
  return { zi, pozitii: poz.filter(p => p.serie?.d?.at(-1) === zi) };
}

// ===================== v0.40: sentimentul pieței, verdictul de cumpărare, perspectiva portofoliului =====================
// Totul vine din prețurile pe care analiza le are deja (portofoliul tău + universul de idei), nu din știri și nu din predicții.
const lim = (x, a, b) => Math.min(b, Math.max(a, x));
const ETF_LARG = k => ['nucleu', 'regional', 'stil', 'obligatiuni'].includes(ETF_CATALOG[k]?.rol);

// Sentimentul pieței (0 = frică mare, 100 = euforie), din 5 măsurători, fiecare 0–100:
//  trendul global (VWCE față de media de 200 de zile), lățimea (câte companii sunt peste media lor de 200 de zile),
//  impulsul (câte au urcat în ultima lună), distanța VWCE față de maximul pe un an și cât de agitată e piața (VWCE, ATR).
// v0.41: trendul, distanța de la maxim și agitația se notează după cât de des s-au văzut în istorie (S&P 500 zilnic, 1962–2019):
// 50 = o zi obișnuită, 90 = mai sus decât în 9 zile din 10. Înainte, o piață pe creștere obișnuită ieșea „euforie” jumătate din timp.
const ISTORIC_PIATA = { // percentilele 5, 10, 20, …, 90, 95
  trend: [-10.4, -6.92, -2.93, 0.14, 2.33, 3.93, 5.3, 6.77, 8.74, 11.78, 14.18],
  maxim: [-23.76, -18.32, -11.86, -7.52, -5.27, -3.73, -2.54, -1.7, -1, -0.47, -0.2],
  agitatie: [0.68, 0.76, 0.88, 1.01, 1.15, 1.3, 1.47, 1.63, 1.83, 2.13, 2.51] };
const PCT = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
export function percentila(v, b) {
  const n = b.length - 1;
  if (v <= b[0]) return Math.max(0, PCT[0] - PCT[0] * (b[0] - v) / (2 * (b[1] - b[0]) || 1));
  if (v >= b[n]) return Math.min(100, PCT[n] + (100 - PCT[n]) * (v - b[n]) / (2 * (b[n] - b[n - 1]) || 1));
  for (let i = 1; i <= n; i++) if (v <= b[i]) return PCT[i - 1] + (PCT[i] - PCT[i - 1]) * (v - b[i - 1]) / ((b[i] - b[i - 1]) || 1);
  return 50;
}
export function sentimentPiata(pozitii = [], candidati = []) {
  const toate = [...pozitii.filter(p => !p.virtual), ...candidati].filter(x => x?.ind?.pret != null);
  const glob = ['VWCE', 'EUNL', 'XDWD', 'SXR8'].map(k => toate.find(x => x.symbol === k)?.ind).find(i => i?.sma200 != null) || null;
  const act = [...new Map(toate.filter(x => !ETF_CATALOG[x.symbol]).map(x => [x.symbol, x])).values()];
  const C = [];
  if (glob) {
    const d = (glob.pret / glob.sma200 - 1) * 100;
    C.push({ k: 'trend', nume: 'Trendul pieței globale', scor: Math.round(percentila(d, ISTORIC_PIATA.trend)),
      text: `VWCE e cu ${fmt(Math.abs(d))}% ${d >= 0 ? 'peste' : 'sub'} media lui de 200 de zile.` });
    if (glob.deLaMaxim != null) C.push({ k: 'maxim', nume: 'Distanța de la maxim', scor: Math.round(percentila(glob.deLaMaxim, ISTORIC_PIATA.maxim)),
      text: glob.deLaMaxim > -1 ? 'VWCE e aproape de maximul pe un an.' : `VWCE e cu ${fmt(Math.abs(glob.deLaMaxim))}% sub maximul pe un an.` });
    if (glob.atrPct != null) C.push({ k: 'agitatie', nume: 'Cât de agitată e piața', scor: Math.round(100 - percentila(glob.atrPct, ISTORIC_PIATA.agitatie)),
      text: `VWCE se mișcă în medie ${fmt(glob.atrPct)}% pe zi${glob.atrPct > 1.6 ? ', mai mult decât de obicei' : glob.atrPct < 0.9 ? ', mai puțin decât de obicei' : ', cam cât de obicei'}.` });
  }
  const cu200 = act.filter(x => x.ind.sma200 != null);
  if (cu200.length >= 15) { const p = cu200.filter(x => x.ind.pret > x.ind.sma200).length / cu200.length * 100;
    C.push({ k: 'latime', nume: 'Câte companii sunt pe creștere', scor: Math.round(lim(50 + (p - 60) * 1.25, 0, 100)), text: `${Math.round(p)}% din ${cu200.length} companii mari sunt peste media lor de 200 de zile (de obicei, cam 60%).` }); }
  const cu1l = act.filter(x => x.ind.r1l != null);
  if (cu1l.length >= 15) { const p = cu1l.filter(x => x.ind.r1l > 0).length / cu1l.length * 100;
    C.push({ k: 'impuls', nume: 'Impulsul ultimei luni', scor: Math.round(lim(50 + (p - 55) * 1.1, 0, 100)), text: `${Math.round(p)}% dintre ele au urcat în ultima lună (de obicei, cam 55%).` }); }
  if (C.length < 2) return null;
  const scor = Math.round(C.reduce((a, c) => a + c.scor, 0) / C.length);
  const [stare, eticheta] = scor < 20 ? ['frica_mare', 'Frică mare'] : scor < 40 ? ['frica', 'Frică'] : scor < 60 ? ['neutru', 'Neutru'] : scor < 80 ? ['optimism', 'Optimism'] : ['euforie', 'Euforie'];
  const ce = {
    frica_mare: 'Piața e speriată: prețurile au scăzut mult și se mișcă tare. Istoric, astfel de momente au fost bune pentru cumpărări pe termen lung, în tranșe, dar fundul nu se poate ghici.',
    frica: 'Piața e prudentă: mai multe companii scad decât urcă. Pentru cine are ani înainte, cumpărările regulate continuă; ocaziile apar la companiile bune care scad odată cu piața.',
    neutru: 'Piața nu e nici speriată, nici euforică. Planul obișnuit, fără grabă.',
    optimism: 'Piața e optimistă: majoritatea companiilor urcă. Cumpărările regulate continuă; nu e momentul pentru sume mari dintr-odată.',
    euforie: 'Piața e foarte optimistă: aproape totul a urcat mult. Istoric, asta singură nu a anunțat o scădere apropiată, dar nici nu e momentul pentru sume mari puse dintr-odată. Ține-te de plan și de plafoane.',
  }[stare];
  return { scor, stare, eticheta, ce, componente: C, n: act.length };
}

// Merită să cumperi acum (inclusiv după o scădere)? Pentru o poziție, o idee nouă sau un ETF din catalog.
// x: { symbol, ind, fund, rec, rezultate?, etf? }; piata: sentimentPiata(); ref: { r3l } (VWCE). Decizia rămâne a ta.
// v0.41, verificat pe istoric (15 acțiuni mari 1996–2019, S&P 500 1950–2019, lunar, cu ce s-a întâmplat în 6 și 12 luni după):
//  - ETF-urile largi nu au moment bun sau rău: verdictul după preț nu a deosebit lunile bune de cele rele, iar pe 3 ani
//    S&P 500 a fost pe plus în 84% din cazuri, oricând ai fi cumpărat. Pentru ele verdictul e mereu „cumpără regulat”.
//  - La acțiuni, ce a prezis bine riscul unei căderi mari în continuare: trendul lung (în jos: 22% din cazuri au mai căzut 25% în
//    6 luni; în sus: 14%), distanța de la maxim (aproape de maxim: 10%; 15–25% sub maxim: 28%), piața în frică (34% față de 10%)
//    și o scădere mult mai mare decât a pieței. Înainte, scăderile și frica primeau puncte în plus: de aici veneau „Merită”-urile
//    urmate de căderi (Merită: 19% căderi mari, față de 17% media; acum, vezi testul test-v41.mjs).
//  - Fără efect măsurabil: RSI peste 70 și euforia pieței. Nu mai scad verdictul.
//  - Fiecare informație contează o singură dată (înainte, trendul și analiștii intrau de două ori, o dată prin scorul ideii).
export function verdictCumparare(x, piata = null, ref = {}, azi = new Date().toISOString().slice(0, 10), ctx = null) {
  const i = x?.ind || {}, k = x?.symbol, etfC = !!ETF_CATALOG[k], larg = ETF_LARG(k), plus = [], minus = [];
  if (i.pret == null) return null;
  let p = 0;
  const dd = i.deLaMaxim ?? null, aScazut = dd != null && dd <= -8;
  const sus = i.sma200 != null && i.pret > i.sma200, confirmat = sus && i.sma50 != null && i.sma50 >= i.sma200,
    jos = i.sma200 != null && i.pret < i.sma200 && i.sma50 != null && i.sma50 < i.sma200;
  // 1) trendul lung
  if (i.sma200 != null) {
    if (confirmat) { p += 2; plus.push('Trendul lung e în sus (peste media de 200 de zile, iar media de 50 e peste ea).'); }
    else if (sus) { p += 1; plus.push('A trecut peste media de 200 de zile, dar trendul nu e încă confirmat (media de 50 e sub ea).'); }
    else if (jos) { p -= 2; minus.push(`Trendul lung e în jos (sub media de 200 de zile, iar media de 50 e sub ea)${larg ? ': piața întreagă e în scădere' : ': istoric, acțiunile în trend descendent au căzut mai des încă 25% în următoarele 6 luni'}.`); }
    else minus.push('E sub media de 200 de zile: trendul lung e la limită.');
  }
  // 2) distanța de la maximul pe un an și de unde vine scăderea
  if (dd != null && !larg) {
    if (dd > -8 && sus) { p += 1; plus.push('E aproape de maximul pe un an: istoric, căderile mari au fost cele mai rare de aici.'); }
    else if (dd <= -15) { p -= 1; minus.push(`E cu ${fmt(Math.abs(dd))}% sub maximul pe un an: istoric, după scăderi atât de mari a urmat mai des încă o cădere decât o revenire rapidă.`); }
  }
  if (aScazut && i.r3l != null && ref?.r3l != null && !larg) {
    const rel = i.r3l - ref.r3l;
    if (rel <= -10) { p -= 2; minus.push(`Pe 3 luni a mers mult mai slab decât piața (${fmt(i.r3l)}% față de ${fmt(ref.r3l)}% VWCE): problema pare la companie, nu la piață.`); }
    else if (rel > -5) plus.push(`Pe 3 luni a mers cam ca piața (${fmt(i.r3l)}% față de ${fmt(ref.r3l)}% VWCE): scăderea vine mai ales din piață.`);
  }
  // 3) o scădere rapidă într-un trend bun (RSI mic) a fost urmată mai des de revenire
  if (i.rsi != null && i.rsi < RISK.rsiIeftin && confirmat) { p += 1; plus.push(`A scăzut repede în ultimele săptămâni (RSI ${Math.round(i.rsi)}), într-un trend lung bun: de obicei urmează o revenire, măcar parțială.`); }
  // 4) calitatea: compania (doar cifrele ei, plus analiștii) sau ETF-ul
  if (larg) { const cc = ETF_CATALOG[k].companii || '', ce = /obligațiuni/.test(cc) ? `ETF cu ${cc}` : /^~?[\d.]+$/.test(cc) ? `ETF cu ${cc} de companii` : `ETF (${cc})`;
    plus.push(`${ce}: nu poate da faliment ca o singură firmă.`); }
  else if (!etfC) {
    const f = x.fund || {}, crit = [];
    if (f.marja != null) crit.push(f.marja >= 15 ? 1 : f.marja >= 8 ? 0.6 : f.marja > 0 ? 0.3 : 0);
    if (f.roe != null) crit.push(f.roe >= 15 ? 1 : f.roe >= 8 ? 0.6 : f.roe > 0 ? 0.3 : 0);
    if (f.crestereVenit != null) crit.push(f.crestereVenit >= 10 ? 1 : f.crestereVenit >= 3 ? 0.67 : f.crestereVenit >= 0 ? 0.33 : 0);
    if (crit.length >= 2) { const sc = Math.round(crit.reduce((a, b) => a + b, 0) / crit.length * 100);
      if (sc >= 70) { p += 1; plus.push(`Cifrele companiei sunt bune (${sc}/100: profit, rentabilitate, creșterea veniturilor).`); }
      else if (sc < 40) { p -= 2; minus.push(`Cifrele companiei sunt slabe (${sc}/100: profit, rentabilitate, creșterea veniturilor).`); } }
    if (f.pe != null) {
      // v0.45: P/E comparat și cu sectorul (mediana companiilor din același sector, din universul analizat): un P/E de 45 e mult
      // pentru o bancă, dar obișnuit pentru software. Penalizarea rămâne doar pentru extreme (peste 60 și peste 1,8 × sectorul).
      const ps = f.peSector > 0 ? f.peSector : null;
      if (f.pe <= 0) { p -= 1; minus.push('Compania n-a avut profit în ultimul an (P/E negativ).'); }
      else if (f.pe > Math.max(60, 1.8 * (ps || 0))) { p -= 1; minus.push(`Evaluare foarte mare (P/E ${Math.round(f.pe)}${ps ? `, față de ${Math.round(ps)} median în sector` : ''}): prețul presupune ani de creștere puternică; orice dezamăgire costă mult.`); }
      else if (ps && f.pe > 1.4 * ps) minus.push(`Mai scumpă decât sectorul: P/E ${Math.round(f.pe)}, față de ${Math.round(ps)} median.`);
      else if (ps && f.pe < 0.7 * ps) plus.push(`Mai ieftină decât sectorul: P/E ${Math.round(f.pe)}, față de ${Math.round(ps)} median.`);
    }
    if (f.datorii != null && !FINANCIARE(k)) {
      if (f.datorii > DATORII_MARI) { p -= 1; minus.push(`Datorii mari: ${fmt(f.datorii)} lei datorie la fiecare leu de capital propriu. Când dobânzile cresc sau vânzările scad, astfel de companii suferă primele.`); }
      else if (f.datorii < 0.5) plus.push(`Datorii mici (${fmt(f.datorii)} la 1 leu capital propriu).`);
    }
    const r = x.rec; if (r) { const pos = (r.strongBuy || 0) + (r.buy || 0), neg = (r.sell || 0) + (r.strongSell || 0), tot = pos + neg + (r.hold || 0);
      if (tot >= 3) { const net = (pos - neg) / tot; if (net >= 0.5) { p += 1; plus.push(`Analiștii sunt în majoritate pozitivi (${pos} din ${tot} recomandă cumpărarea).`); } else if (net < 0) { p -= 1; minus.push(`Mai mulți analiști recomandă vânzarea decât cumpărarea.`); } } }
    if (x.rezultate && x.rezultate >= azi && (new Date(x.rezultate) - new Date(azi)) / 864e5 <= RISK.zileRezultate) { p -= 1; minus.push(`Rezultatele trimestriale vin pe ${x.rezultate}: prețul poate sări în orice direcție. De obicei merită așteptate.`); }
  }
  if (i.volAn != null && i.volAn > 45 && !larg) { p -= 1; minus.push(`Prețul e foarte agitat (${Math.round(i.volAn)}% pe an): doar sume mici.`); }
  // 5) piața: în frică, acțiunile individuale au căzut mai des încă mult; euforia nu a schimbat nimic măsurabil
  if (piata && !larg && piata.scor < 40) { p -= 1; minus.push(`Piața e în „${piata.eticheta.toLowerCase()}” (${piata.scor}/100): istoric, în astfel de perioade acțiunile individuale au mai căzut des. Un ETF larg e varianta mai sigură acum.`); }
  // 6) se potrivește în portofoliul tău? (ctx: { teme, profil }): un sector sau o poziție peste plafon nu mai primește bani noi
  let plin = null;
  if (ctx?.profil && !ETFS.includes(k)) {
    const t = x.tema || themeOf(k), tp = ctx.teme?.[t] || 0, pr = ctx.profil;
    if (x.pondere != null && x.pondere >= pr.maxActiune) plin = `Are deja ${fmt(x.pondere)}% din portofoliul tău, peste plafonul de ${pr.maxActiune}% pe o poziție.`;
    else if (t && t !== 'Altele' && tp >= pr.maxTema) plin = `Sectorul „${t}” are deja ${fmt(tp)}% din portofoliul tău, peste plafonul de ${pr.maxTema}%.`;
    if (plin) minus.push(plin);
  }
  let [nivel, titlu, sfat] = p >= 4 ? ['merita', 'Merită', 'Semnalele care au contat în istorie sunt de partea ei. Dacă se potrivește în planul tău, cumpără în 2–3 tranșe, la câteva săptămâni distanță.']
    : p >= 2 ? ['poate', 'Poate, cu o sumă mică', 'Semnalele sunt mai mult bune decât rele. O primă tranșă mică; restul doar dacă se confirmă.']
    : p >= 0 ? ['asteapta', 'Mai așteaptă', 'Semnalele sunt amestecate. Nu e o grabă: urmărește-o încă 2–4 săptămâni.']
    : ['nu', 'Nu acum', 'Mai multe semnale sunt contra. Banii merg mai bine în ETF-ul de bază sau în altă idee din plan.'];
  // un ETF larg: nu se caută momentul (vezi mai sus); doar un trend descendent e spus, ca să știi la ce să te aștepți
  if (larg) [nivel, titlu, sfat] = ['merita', 'Merită, regulat', `Pentru un ETF larg, momentul contează puțin: pe 3 ani, piața a fost pe plus în peste 8 cazuri din 10, oricând ai fi cumpărat. Cumpără regulat, în fiecare lună${jos ? '; în scădere cumperi mai ieftin, dar nu ghici fundul cu sume mari' : ''}.`];
  if (plin && (nivel === 'merita' || nivel === 'poate')) [nivel, titlu, sfat] = ['asteapta', 'Arată bine, dar nu pentru tine acum', 'Ca investiție, semnalele sunt bune. În portofoliul tău însă locul ei e deja plin: banii noi merg mai bine în ETF sau într-un sector care îți lipsește.'];
  return { nivel, titlu, sfat, puncte: p, plus, minus, aScazut, dd, plin: !!plin };
}

// Funcția de repartiție normală (aproximare Abramowitz–Stegun, eroare < 1e-7).
const Phi = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - q : q; };
// Perspectiva portofoliului: direcția semnalelor de azi (termen scurt) + intervalul statistic (1 an și orizontul tău).
// Randamentul așteptat vine din scenariul „mediu” (acțiuni), 3% (obligațiuni, aur), iar riscul din volatilitatea fiecărei poziții,
// cu o corelație de 0,6 între acțiuni (cât au de obicei acțiunile între ele) și 0,1 între acțiuni și obligațiuni sau aur.
// v0.42: prețul față de care se măsoară „azi”: închiderea de ieri. Dacă ultima lumânare e chiar de azi (analiza a rulat în timpul
// ședinței), e cea dinaintea ei.
export function referintaZi(ind, azi) {
  if (!ind?.pret) return { pret: null, data: null };
  return ind.data === azi && ind.prec > 0 ? { pret: ind.prec, data: ind.dataPrec } : { pret: ind.pret, data: ind.data };
}
// v0.42: costul unei poziții eToro în lei, cu cursul din ziua fiecărei cumpărări (curs(data) → lei pentru 1 USD).
// Loturile pot acoperi doar o parte din cost (vânzări parțiale): se folosește cursul lor mediu, ponderat cu sumele. null = lipsă curs.
export function costInLei(costUSD, loturi, curs) {
  const L = (loturi || []).filter(l => l.usd > 0 && l.data), tot = L.reduce((a, l) => a + l.usd, 0);
  if (!tot || !(costUSD > 0)) return null;
  let lei = 0; for (const l of L) { const c = curs(String(l.data).slice(0, 10)); if (!(c > 0)) return null; lei += l.usd * c; }
  return costUSD * lei / tot;
}
// Volatilitatea anuală în lei (prețul × cursul BNR al zilei), din seria pusă de analiză; null dacă lipsește cursul.
export function volLei(p, n = 252) {
  const s = p?.serie; if (!s?.c?.length || s.fx?.length !== s.c.length) return null;
  const v = s.c.map((x, i) => x * s.fx[i]).slice(-(n + 1)); if (v.length < 60) return null;
  const r = []; for (let i = 1; i < v.length; i++) if (v[i - 1] > 0 && v[i] > 0) r.push(Math.log(v[i] / v[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252) * 100;
}
export function perspectivaPortofoliu(pozitii = [], piata = null, profil = PROFIL) {
  const L = pozitii.filter(p => !p.virtual && (p.pondere || 0) > 0); if (!L.length) return null;
  const W = L.reduce((a, p) => a + p.pondere, 0);
  const cls = p => ['obligatiuni'].includes(ETF_CATALOG[p.symbol]?.rol) ? 'obl' : ETF_CATALOG[p.symbol]?.rol === 'aur' ? 'aur' : 'act';
  const mu = { act: SCENARII.mediu, obl: 3, aur: 3 }, volImp = { act: 18, obl: 5, aur: 15 };
  const x = L.map(p => { const c = cls(p), v = volLei(p) ?? p.ind?.volAn ?? (c === 'act' && !p.etf ? 30 : volImp[c]); return { p, c, w: p.pondere / W, v: v / 100, m: mu[c] / 100 }; });
  const m = x.reduce((a, e) => a + e.w * e.m, 0);
  let varP = 0; for (const a of x) for (const b of x) { const rho = a === b ? 1 : a.c === 'act' && b.c === 'act' ? 0.6 : a.c === b.c ? 0.5 : 0.1; varP += a.w * b.w * a.v * b.v * rho; }
  const s = Math.sqrt(varP), ml = Math.log(1 + m);
  const interval = N => ({ ani: N, p10: (Math.exp(N * ml - 1.2816 * s * Math.sqrt(N)) - 1) * 100, median: (Math.exp(N * ml) - 1) * 100,
    p90: (Math.exp(N * ml + 1.2816 * s * Math.sqrt(N)) - 1) * 100, sansaPierdere: Phi(-N * ml / (s * Math.sqrt(N))) * 100 });
  // semnalele de azi, ponderate cu valoarea pozițiilor
  let tr = 0, cuDate = 0, sus = 0, jos = 0; const slabe = [];
  for (const e of x) { const i = e.p.ind; if (i?.sma200 == null || i.pret == null) continue; cuDate += e.w;
    const t = i.pret > i.sma200 && (i.sma50 == null || i.sma50 > i.sma200) ? 1 : i.pret < i.sma200 && i.sma50 != null && i.sma50 < i.sma200 ? -1 : 0;
    tr += e.w * t; if (t > 0) sus += e.w; if (t < 0) { jos += e.w; slabe.push(e.p.symbol); } }
  const trend = cuDate ? tr / cuDate : 0, sent = piata ? (piata.scor - 50) / 50 : 0, comb = 0.7 * trend + 0.3 * sent;
  const [dir, eticheta] = comb > 0.25 ? ['crestere', 'Spre creștere'] : comb < -0.25 ? ['scadere', 'Spre scădere'] : ['stagnare', 'Mai degrabă pe loc'];
  const ani = Math.max(1, Math.round(profil.orizontAni || 10));
  return { dir, eticheta, comb, trend, susPct: cuDate ? sus / cuDate * 100 : null, josPct: cuDate ? jos / cuDate * 100 : null, slabe,
    randAn: m * 100, volAn: s * 100, muAct: SCENARII.mediu, an: interval(1), orizont: interval(ani) };
}

// v0.44: valoarea pozițiilor eToro = unitățile × prețul de acum (din aceeași serie ca restul analizei), nu valoarea raportată
// de API-ul de portofoliu, care se actualizează mai rar (GEV, AMD ieșeau cu ~1,5% sub eToro). Prețul în moneda acțiunii se
// trece în lei cu cursul BNR. Dacă rezultatul se abate cu peste `prag`% de la valoarea API (simbol greșit, preț vechi), rămâne
// valoarea API și abaterea apare în verificare.
export function valoareEtoro(positions, market, fx, prag = 8) {
  const out = [];
  for (const p of positions) {
    if (p.broker !== 'eToro' || !(p.qty > 0) || !(fx?.USD > 0)) continue;
    const s = canon(p.symbol), pret = market?.[s]?.ind?.pret, m = monedaOf(s), c = m === 'RON' ? 1 : fx[m];
    const api = p.valueUSD ?? (p.valueRON / fx.USD);
    if (!(pret > 0) || !(c > 0) || !(api > 0)) { out.push({ symbol: s, api, calc: null, aplicat: false }); continue; }
    const ron = p.qty * pret * c, usd = ron / fx.USD, dif = (usd / api - 1) * 100;
    const aplicat = Math.abs(dif) <= prag;
    if (aplicat) { p.valueUSDapi = api; p.valueRON = ron; p.valueUSD = usd; }
    out.push({ symbol: s, api: +api.toFixed(2), calc: +usd.toFixed(2), difPct: +dif.toFixed(2), aplicat });
  }
  return out;
}
// v0.44: verificări de bun-simț după fiecare analiză. Fiecare problemă: { id, text }. Lista goală = totul se leagă.
export function verificariBunSimt(snap, { fx = {}, valoriEtoro = [], vechi = null, operatiuniAzi = 0, prag = { miscare: 25, total: 15, curs: 1.5 } } = {}) {
  const v = [], poz = (snap?.pozitii || []).filter(p => !p.virtual), f = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ',');
  for (const p of poz) {
    if (!(p.valueRON > 0)) v.push({ id: `val0:${p.symbol}`, text: `${p.symbol}: valoarea e zero sau lipsește.` });
    if (!(p.costRON > 0)) v.push({ id: `cost0:${p.symbol}`, text: `${p.symbol}: costul e zero sau lipsește, deci câștigul ei nu se poate calcula.` });
    const r = p.ind?.r1z; if (r != null && Math.abs(r) > prag.miscare) v.push({ id: `miscare:${p.symbol}`, text: `${p.symbol}: ${r > 0 ? '+' : '−'}${f(Math.abs(r))}% față de ieri. Poate fi o știre mare, dar și o eroare de preț sau o divizare a acțiunii.` });
    for (const b of p.brokers || []) {
      if (b.broker !== 'eToro' || !(b.costUSD > 0) || !(b.valueUSD > 0) || !(fx.USD > 0)) continue;
      const cv = b.valueRON / b.valueUSD, cc = b.costRON / b.costUSD;
      if (Math.abs(cv / fx.USD - 1) * 100 > prag.curs) v.push({ id: `cursval:${p.symbol}`, text: `${p.symbol} la eToro: valoarea în lei folosește ${f(cv, 3)} lei/$, iar cursul BNR e ${f(fx.USD, 3)}.` });
      if (!(cc > 3 && cc < 7)) v.push({ id: `curscost:${p.symbol}`, text: `${p.symbol} la eToro: costul în lei iese la ${f(cc, 3)} lei/$, un curs imposibil.` });
    }
  }
  for (const e of valoriEtoro) if (e.calc != null && !e.aplicat) v.push({ id: `etoroval:${e.symbol}`, text: `${e.symbol} la eToro: unități × preț dă $${f(e.calc, 2)}, eToro raportează $${f(e.api, 2)} (${e.difPct > 0 ? '+' : '−'}${f(Math.abs(e.difPct))}%). Am păstrat cifra eToro.` });
  const sp = poz.reduce((a, p) => a + (p.pondere || 0), 0);
  if (poz.length && Math.abs(sp - 100) > 0.5) v.push({ id: 'ponderi', text: `Ponderile pozițiilor adună ${f(sp)}%, nu 100%.` });
  if (vechi?.totalRON > 0 && snap?.totalRON > 0 && !operatiuniAzi) {
    const dt = (snap.totalRON / vechi.totalRON - 1) * 100;
    if (Math.abs(dt) > prag.total) v.push({ id: 'total', text: `Valoarea totală s-a schimbat cu ${dt > 0 ? '+' : '−'}${f(Math.abs(dt))}% față de analiza precedentă, fără cumpărări sau vânzări văzute în conturi.` });
  }
  return v;
}

// ---------- Jurnalul semnalelor (v0.45) ----------
// Fiecare verdict „Merită acum?” se notează cu prețul zilei (o dată pe lună pe simbol, sau când verdictul se schimbă).
// După ~3 și ~6 luni se măsoară ce a urmat: randamentul acțiunii, al VWCE pe aceleași zile, și dacă a mai căzut 10%+.
// Așa se vede, pe acțiunile tale și pe ideile reale, dacă „Merită” chiar a mers mai bine decât „Nu acum”.
// Randamentele sunt în moneda fiecărei acțiuni (fără curs), ca să măsoare semnalul, nu dolarul.
export const JURNAL = { maxIntrari: 1500, termene: [{ k: 3, zile: 91, pana: 120 }, { k: 6, zile: 182, pana: 215 }], cadere: -10 };
// lista: intrările existente; noi: [{ s, v, p, vw }] (simbol, nivel, preț, prețul VWCE în aceeași zi)
export function noteazaJurnal(lista = [], noi = [], azi) {
  const luna = azi.slice(0, 7), out = [...lista];
  for (const n of noi) {
    if (!n?.s || !n.v || !(n.p > 0)) continue;
    const ult = [...out].reverse().find(x => x.s === n.s);
    if (ult && ult.d.slice(0, 7) === luna && ult.v === n.v) continue; // deja notat luna asta, cu același verdict
    out.push({ d: azi, s: n.s, v: n.v, p: +n.p.toPrecision(8), ...(n.vw > 0 ? { vw: +n.vw.toPrecision(8) } : {}) });
  }
  return out.slice(-JURNAL.maxIntrari);
}
// pret(s) → { p, d } (prețul de acum al simbolului și data lui); vwLa(d) → prețul VWCE în ziua d (sau înainte)
export function evalueazaJurnal(lista = [], pret, vwLa) {
  for (const e of lista) for (const t of JURNAL.termene) {
    if (e['r' + t.k] != null) continue;
    const x = pret(e.s); if (!(x?.p > 0) || !x.d) continue;
    const zile = (Date.parse(x.d) - Date.parse(e.d)) / 864e5;
    if (!Number.isFinite(zile) || zile < t.zile) continue; // dată necunoscută sau prea devreme
    if (zile > t.pana) { e['r' + t.k] = null; e['x' + t.k] = 'ratat'; continue; } // prețul n-a fost văzut la timp (simbol ieșit din listă)
    e['r' + t.k] = +((x.p / e.p - 1) * 100).toFixed(2);
    const v1 = vwLa(x.d); if (e.vw > 0 && v1 > 0) e['b' + t.k] = +((v1 / e.vw - 1) * 100).toFixed(2);
  }
  return lista;
}
export function rezumatJurnal(lista = []) {
  const niv = ['merita', 'poate', 'asteapta', 'nu'], out = { intrari: lista.length, prima: lista[0]?.d || null, nivele: {} };
  for (const v of niv) {
    const L = lista.filter(e => e.v === v), o = { notate: L.length };
    for (const t of JURNAL.termene) {
      const M = L.filter(e => e['r' + t.k] != null); if (!M.length) continue;
      const B = M.filter(e => e['b' + t.k] != null), med = a => a.reduce((x, y) => x + y, 0) / a.length;
      o['t' + t.k] = { n: M.length, medie: +med(M.map(e => e['r' + t.k])).toFixed(2), ...(B.length ? { fataDeVWCE: +med(B.map(e => e['r' + t.k] - e['b' + t.k])).toFixed(2) } : {}),
        caderi: Math.round(M.filter(e => e['r' + t.k] <= JURNAL.cadere).length / M.length * 100), pePlus: Math.round(M.filter(e => e['r' + t.k] > 0).length / M.length * 100) };
    }
    out.nivele[v] = o;
  }
  const urm = lista.find(e => e.r3 === undefined); if (urm) out.primeleRezultate = new Date(Date.parse(urm.d) + JURNAL.termene[0].zile * 864e5).toISOString().slice(0, 10);
  return out;
}
