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
  const preturi = poz.map(p => { const m = new Map(p.serie.d.map((d, i) => [d, p.serie.c[i]])); let u = null; return zile.map(d => (u = m.get(d) ?? u)); });
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

export function contextScor(m) {
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
    if (f.pe != null) {
      if (f.pe > 60) { fundam -= 0.5; motive.push(`− Evaluare scumpă: P/E ${fmt(f.pe)}`); }
      else if (f.pe > 0 && f.pe < 15) { fundam += 0.5; motive.push(`+ Evaluare ieftină: P/E ${fmt(f.pe)}`); }
    }
  }
  return { tehnic, fundam, motive };
}

export function evalueaza(g, m, teme, azi, profil = PROFIL) {
  const { tehnic, fundam, motive } = contextScor(m);
  const atentie = []; const ind = m?.ind;
  const scor = Math.round((tehnic + fundam) * 10) / 10;
  const tinta = g.tinta ?? 0, abatere = g.pondere - tinta;
  const tp = teme[g.tema] || 0;
  let zileRez = null;
  if (m?.rezultate && azi) zileRez = Math.round((Date.parse(m.rezultate) - Date.parse(azi)) / 864e5);
  const rezAproape = zileRez != null && zileRez >= 0 && zileRez <= RISK.zileRezultate;
  if (rezAproape) atentie.push(`Rezultate trimestriale pe ${dataRo(m.rezultate)}. Sunt posibile mișcări mari, în ambele sensuri.`);

  let semnal, oportunitate = null;
  if (g.etf) {
    motive.unshift('· ETF-ul global e nucleul portofoliului: se cumpără constant și nu se vinde pe semnale');
    semnal = abatere < -1 ? 'adauga' : abatere > 5 ? 'nu_adauga' : 'pastreaza';
  } else if (g.pondere > profil.maxActiune * RISK.reechilibrareX) {
    semnal = 'reechilibreaza';
    atentie.push(`Ocupă ${fmt(g.pondere)}% din portofoliu, ${tinta > 0 ? `de ${fmt(g.pondere / tinta)} ori mai mult decât ținta ta de ${fmt(tinta)}%` : 'iar ținta ta pentru acțiuni e 0%'}. Fără impozit: nu mai cumpăra și lasă depunerile noi să-i scadă ponderea. Mai repede: vinzi o parte, dar câștigul din vânzare se impozitează cu 16%.`);
  } else if (ind?.subProtectie) {
    semnal = 'verifica';
    atentie.push(`A coborât sub nivelul de alertă (${fmt(ind.protectie)}). Nu e un ordin de vânzare. Verifică dacă motivul pentru care o ții mai e valabil: rezultate, prognoze, știri.`);
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
  // Oportunitate: o acțiune sub țintă, în trend lung bun, care a scăzut temporar.
  if (!g.etf && semnal === 'adauga' && ind && ind.sma200 != null && ind.pret > ind.sma200 && fundam >= 0 &&
      ((ind.rsi != null && ind.rsi < RISK.rsiIeftin) || (ind.deLaMaxim3l != null && ind.deLaMaxim3l <= -10))) {
    oportunitate = `A scăzut ${fmt(-ind.deLaMaxim3l)}% față de maximul pe 3 luni. Trendul lung și fundamentalele sunt în regulă.`;
  }
  if (abatere !== 0 && !g.etf) motive.push(`· Pondere ${fmt(g.pondere)}%, ținta ta e ${fmt(tinta)}%`);
  return { semnal, eticheta: ETICHETE[semnal], scor, tehnic, fundam, motive, atentie, oportunitate, reducere };
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
  if (!(scadere <= -10 || (r != null && r < RISK.rsiIeftin))) return null;
  return { scadere, rsi: r, text: scadere <= -10
    ? `A scăzut ${fmt(-scadere)}% față de maximul pe 3 luni. Trendul lung și fundamentalele sunt în regulă.`
    : `RSI ${Math.round(r)}: a scăzut foarte repede. Trendul lung și fundamentalele sunt în regulă.` };
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
    return { ...g, ind: m?.ind || null, serie: m?.serie || null, fund: m?.fund || null, rec: m?.rec || null, rezultate: m?.rezultate || null, ...(m?.logo ? { logo: m.logo } : {}), ...ev };
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
