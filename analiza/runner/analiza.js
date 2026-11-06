// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Analist, o rulare. O pornește GitHub Actions (vezi ruleaza.js).
//   MOD=zi        după închiderea bursei US: analiza completă
//   MOD=intraday  din oră în oră cât e bursa deschisă: doar mișcări mari și praguri de protecție
import { VERSION, PROFIL, MISCARE_ZI, OCAZII, IMPOZIT, PAZA, TER, COMISION_FX, ACTIUNI_CATALOG, ETF_CATALOG } from './config.js';
import { referintaZi, costInLei, valoareEtoro, verificariBunSimt, sentimentPiata, verdictCumparare, noteazaJurnal, evalueazaJurnal, rezumatJurnal, indicators, serie, construiesteSnapshot, schimbari, canon, ETICHETE, fmt, dataRo, de, oportunitateIntraday, derivaProfil, xirr, aceleasiDepuneri, evolutieConturi, luniDividende, scorIdee, themeOf, monedaOf, raportAnual, ocaziiPlan, miscarePortofoliu, rezumatZi, ziRezumat } from './engine.js';
import { t212Positions, t212Sumar, etoroPositions, etoroResolve, etoroCandles, fhFundamentale, fhRezultate, paralel,
  bnrAzi, bnrAn, cursLa, cursCumparare, inflatieEurostat, t212Realizat, etoroRealizat, t212Executii, t212Dividende, etoroSigle, t212Instrumente, etoroDrepturi } from './sources.js';
import { pazaRetea, activitateNoua, alarmeActivitate, scrieEtoro, scopuriScriere } from './paza.js';
import { notificaOdata, trimite, configPush } from './notificari.js';
import { vapidChei } from './webpush.js';
import { contFirebase } from './fcm.js';
import { tacut, tacute, golesteTacute, citesteJ } from './tacute.js';
import { demoPositions, demoCandles, DEMO_FUND, DEMO_RON_PER_USD, DEMO_RON_PER_EUR } from './demo.js';

const FUND_TTL = 7 * 864e5; // fundamentalele se reîmprospătează săptămânal
// Universul de idei: câte companii se reîmprospătează la o rulare. Analiza de seară (programată) ia cele mai vechi 24,
// deci tot universul (~100) e reîmprospătat în ~4 seri, adică mai des decât o dată pe săptămână. „Rulează analiza” din aplicație
// reîmprospătează doar primele 12 din vitrină, ca să nu te țină să aștepți.
const UNIVERS = { seara: 24, vitrina: 12, laCerere: 0, logo: 20 };
const compact = i => i && { pret: i.pret, sma20: i.sma20, sma50: i.sma50, sma200: i.sma200, rsi: i.rsi, r1a: i.r1a, r3l: i.r3l, deLaMaxim: i.deLaMaxim, volAn: i.volAn };
const J = (s, d, nume) => citesteJ(s, d, nume);

// Notificările (Web Push direct în aplicație): vezi notificari.js.
export { textNotificare } from './notificari.js';

// Starea fiecărei conexiuni, cu indicația exactă de reparat (pentru ecranul Pornire din aplicație).
const COD = m => +(String(m).match(/HTTP (\d{3})/)?.[1] || 0);
export function sfat(sursa, mesaj) {
  const c = COD(mesaj);
  const S = {
    t212: { 401: 'Cheia sau secretul sunt greșite: verifică T212_KEY și T212_SECRET.', 403: 'Cheia nu are toate permisiunile de citire. Generează alta cu Account data, Metadata, Portfolio, History și History - Orders bifate (fără Orders - Execute).', 429: 'Prea multe cereri. Se rezolvă singur la următoarea rulare.' },
    etoro: { 401: 'Cheile sunt greșite: verifică ETORO_API_KEY și ETORO_USER_KEY.', 403: 'Cheia nu are permisiunea Read sau e pentru Demo în loc de Real.' },
    finnhub: { 401: 'Cheia Finnhub e greșită: verifică FINNHUB_KEY.', 403: 'Cheia Finnhub nu are acces la acest serviciu.' },
  };
  return S[sursa]?.[c] || (c >= 500 ? 'Serviciul a avut o problemă temporară. Reîncearcă mai târziu.' : '');
}
async function citestePozitii(env, erori, conex = {}, extra = {}) {
  const positions = []; let fx = {}; const ora = extra.ora = {};
  if (!env.T212_KEY) conex.t212 = { stare: 'lipsa', mesaj: 'Adaugă secretele T212_KEY și T212_SECRET.' };
  // Trading 212 (poziții + sold) și cursul BNR se citesc în paralel
  const pT = !env.T212_KEY ? null : Promise.all([t212Positions(env), extra.sumar ? t212Sumar(env).catch(e => { erori.push(`Soldul Trading 212: ${e.message}`); return null; }) : null]);
  const pB = bnrAzi().then(b => ({ b }), e => ({ e }));
  if (pT) {
    try { const [t, sum] = await pT; positions.push(...t.positions); fx = { ...t.fx, sursa: 'Trading 212' }; conex.t212 = { stare: 'ok', mesaj: `${t.positions.length} poziții citite` }; ora.t212 = new Date().toISOString();
      if (sum) extra.t212Sumar = sum; }
    catch (e) { erori.push(`Trading 212: ${e.message}`); conex.t212 = { stare: 'eroare', mesaj: sfat('t212', e.message) || e.message }; }
  }
  try { const r = await pB; if (r.e) throw r.e; const b = r.b; if (b?.USD) { fx = { USD: b.USD, EUR: b.EUR, data: b.data, sursa: 'BNR' }; conex.bnr = { stare: 'ok', mesaj: `1 USD = ${b.USD} lei` }; } }
  catch (e) { erori.push(`Curs BNR: ${e.message}. Se folosește cursul dedus din Trading 212.`); conex.bnr = { stare: 'eroare', mesaj: 'Se folosește cursul dedus din Trading 212.' }; }
  const ronUSD = fx.USD || +env.FX_USDRON || null;
  if (!env.ETORO_USER_KEY) conex.etoro = { stare: 'lipsa', mesaj: 'Adaugă ETORO_API_KEY și ETORO_USER_KEY. Fără ele lipsesc pozițiile de la eToro și graficele.' };
  else if (!ronUSD) { erori.push('eToro: lipsește cursul USD→RON.'); conex.etoro = { stare: 'eroare', mesaj: 'Lipsește cursul USD→RON.' }; }
  else {
    try { const e = await etoroPositions(env, ronUSD, extra.etoroToate = []); positions.push(...e); conex.etoro = { stare: 'ok', mesaj: `${e.length} poziții citite` }; ora.etoro = new Date().toISOString(); }
    catch (e) { erori.push(`eToro: ${e.message}`); conex.etoro = { stare: 'eroare', mesaj: sfat('etoro', e.message) || e.message }; }
  }
  return { positions, fx };
}

// ---------- Rularea zilnică ----------
// Fiecare rulare trece prin paza rețelei: la brokeri pleacă doar citiri (vezi paza.js).
// Starea notificărilor pentru aplicație: cheia publică VAPID (publică prin natura ei), câte telefoane sunt abonate, preferințele.
export async function pushInfo(env, KV) {
  const c = configPush(await KV.get('push')); let cheie = null;
  try { if (env.DATA_KEY) cheie = vapidChei(env.DATA_KEY).public; } catch (e) { tacut('cheia notificărilor (VAPID)', e); }
  return { cheie, abonati: c.subs.length + c.tel.length, aplicatie: c.tel.length, firebase: !!contFirebase(env.FCM_CONT), discret: c.discret, tipuri: c.tipuri };
}
export async function ruleaza(env, KV) {
  const alarme = [], avert = [], elibereaza = pazaRetea(alarme, avert);
  golesteTacute();
  try {
    const snap = env.MOD === 'intraday' ? await ruleazaIntraday(env, KV) : await ruleazaZi(env, KV, { alarme, avert });
    // încercările de scriere blocate rămân 30 de zile, ca să le vezi chiar dacă au apărut într-o rulare din timpul zilei
    if (alarme.length) { const v = J(await KV.get('alarmeRetea'), []), lim = Date.now() - 30 * 864e5;
      await KV.put('alarmeRetea', JSON.stringify([...v, ...alarme.map(a => ({ ...a, cand: new Date().toISOString() }))].filter(a => Date.parse(a.cand) > lim).slice(-20))); }
    if (env.MOD === 'intraday' && alarme.length) await notificaOdata(env, KV, `alarma:${alarme[0].id}`, 'Analist: ALARMĂ de securitate', alarme[0].text, 5, '#securitate');
    // v0.44: ce s-a ocolit după ce analiza a fost salvată (de exemplu o notificare netrimisă) apare la rularea următoare
    const t = tacute(); if (t.length) { const v = J(await KV.get('tacuteDupa'), [], 'lista erorilor ascunse');
      await KV.put('tacuteDupa', JSON.stringify([...v, ...t.map(x => ({ ...x, cand: new Date().toISOString(), mod: env.MOD === 'intraday' ? 'verificare rapidă' : 'analiză' }))].slice(-30))); }
    return snap;
  } finally { elibereaza(); }
}
async function ruleazaZi(env, KV, paza) {
  const azi = new Date().toISOString().slice(0, 10);
  const demo = env.DEMO === '1';
  const erori = [];
  if (!demo && !env.T212_KEY) erori.push('Lipsește cheia Trading 212 (secretul T212_KEY în repo).');
  let positions = [], fx = {}, market = {}; const conex = {}, extra = { sumar: true };

  if (demo) {
    positions = demoPositions();
    fx = { USD: DEMO_RON_PER_USD, EUR: DEMO_RON_PER_EUR, sursa: 'demonstrativ' };
    const byS = {};
    for (const p of positions) { const s = canon(p.symbol); byS[s] = p.broker === 'eToro' ? p.price : (byS[s] ?? p.price); }
    for (const [s, price] of Object.entries(byS)) { const c = demoCandles(s, price); market[s] = { ind: indicators(c), serie: serie(c), ...(DEMO_FUND[s] || {}) }; }
  } else {
    ({ positions, fx } = await citestePozitii(env, erori, conex, extra));
    const detinute = [...new Set(positions.map(p => canon(p.symbol)))];
    // universul de idei: o parte la fiecare rulare (vezi UNIVERS), plus cele alese de tine, încă necumpărate
    const univ = J(await KV.get('univers'), {}), alese = J(await KV.get('profil'), {}).alese || [];
    const deVazut = [...Object.keys(ACTIUNI_CATALOG), ...Object.keys(ETF_CATALOG)].filter(k => !detinute.includes(k));
    const vitrina = deVazut.filter(k => univ[k]?.scor != null).sort((a, b) => univ[b].scor - univ[a].scor).slice(0, UNIVERS.vitrina);
    // la început (universul încă gol), și rulările din aplicație adună câte un lot, ca ideile să apară din prima zi
    const programata = env.SCANARE === '1' || Object.values(univ).filter(u => u.scor != null).length < 30;
    const vechi = deVazut.filter(k => !vitrina.includes(k)).sort((a, b) => (univ[a]?.t || 0) - (univ[b]?.t || 0)).slice(0, programata ? UNIVERS.seara : UNIVERS.laCerere);
    const reimprospatat = [...new Set([...vitrina.filter(k => programata || Date.now() - (univ[k]?.t || 0) > 20 * 3600e3), ...vechi, ...alese.filter(k => deVazut.includes(k))])];
    const simboluri = [...new Set([...detinute, 'VWCE', ...reimprospatat])];
    let rez = {};
    if (!env.FINNHUB_KEY) conex.finnhub = { stare: 'optional', mesaj: 'Opțional. Fără el lipsesc P/E, părerea analiștilor și datele rezultatelor.' };
    else try { rez = await fhRezultate(env, azi, simboluri); conex.finnhub = { stare: 'ok', mesaj: 'conectat' }; }
    catch (e) { erori.push(`Finnhub rezultate: ${e.message}`); conex.finnhub = { stare: 'eroare', mesaj: sfat('finnhub', e.message) || e.message }; }
    for (const s of simboluri) market[s] = { rezultate: rez[s] || null };
    if (env.ETORO_USER_KEY) await paralel(simboluri, 6, async s => {
      try {
        const id = await etoroResolve(env, s, KV);
        if (!id) { if (detinute.includes(s)) erori.push(`${s}: simbolul nu a fost găsit la eToro. Se corectează în config.js, la ETORO_SYMBOL.`); return; }
        market[s].etoroId = id;
        const c = await etoroCandles(env, id);
        market[s].ind = indicators(c); market[s].serie = serie(c);
      } catch (e) { if (detinute.includes(s)) erori.push(`${s} prețuri: ${e.message}`); }
    });
    // siglele: o singură dată pe simbol, păstrate în cache
    if (env.ETORO_USER_KEY) {
      // v2: imagini la rezoluție mai mare; cele negăsite se mai încearcă o dată pe săptămână
      const sigle = J(await KV.get('sigle2'), {}), lipsa = simboluri.filter(s => market[s].etoroId && (!sigle[s] || (!sigle[s].d && Date.now() - sigle[s].t > 7 * 864e5)));
      if (lipsa.length) try {
        const noi = await etoroSigle(env, lipsa.map(s => market[s].etoroId));
        for (const s of lipsa) sigle[s] = { d: noi[market[s].etoroId] || null, t: Date.now() };
        await KV.put('sigle2', JSON.stringify(sigle));
      } catch (e) { tacut('siglele eToro', e); }
      for (const s of simboluri) if (sigle[s]?.d) market[s].logo = sigle[s].d;
    }
    const fcache = J(await KV.get('fund'), {});
    await paralel(simboluri.filter(s => !s.includes('.') && Date.now() - (fcache[s]?.t || 0) >= FUND_TTL), 4, async s => {
      try { const f = await fhFundamentale(env, s); if (f) fcache[s] = { t: Date.now(), ...f }; }
      catch (e) { if (detinute.includes(s)) erori.push(`${s} fundamentale: ${e.message}`); }
    });
    await KV.put('fund', JSON.stringify(fcache));
    for (const s of simboluri) if (fcache[s]) Object.assign(market[s], { fund: fcache[s].fund, rec: fcache[s].rec });
    // disponibilitatea la Trading 212: lista lor de instrumente, o dată pe săptămână
    let t212 = J(await KV.get('t212instr'), null);
    if (env.T212_KEY && (!t212 || Date.now() - t212.t > 7 * 864e5)) try { const l = await t212Instrumente(env); t212 = { t: Date.now(), l }; await KV.put('t212instr', JSON.stringify(t212)); }
      catch (e) { tacut('lista de instrumente Trading 212', e); }
    const laT212 = t212?.l ? new Set(t212.l) : null, ref = { r1a: market.VWCE?.ind?.r1a ?? null };
    for (const k of reimprospatat) { const m = market[k];
      univ[k] = { t: Date.now(), etoro: !!m?.etoroId, t212: laT212 ? laT212.has(k) : null, ind: compact(m?.ind) || univ[k]?.ind || null, fund: m?.fund ?? univ[k]?.fund ?? null, rec: m?.rec ?? univ[k]?.rec ?? null };
      univ[k].scor = univ[k].ind ? scorIdee(univ[k], ref).scor : null; }
    await KV.put('univers', JSON.stringify(univ)); market._univ = univ;
    // v0.45: P/E median pe sector (cel puțin 4 companii cu profit), din universul analizat și din pozițiile tale
    const pe = {}; const adPe = (k, f) => { if (f?.pe > 0 && f.pe < 400) (pe[themeOf(k)] ||= {})[k] = f.pe; };
    for (const [k, u] of Object.entries(univ)) adPe(k, u.fund);
    for (const k of simboluri) adPe(k, market[k]?.fund);
    const peSector = {}; for (const [t, o] of Object.entries(pe)) { const v = Object.values(o).sort((a, b) => a - b); if (v.length >= 4 && t !== 'Altele') peSector[t] = +((v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2).toFixed(1); }
    market._peSector = peSector;
    for (const k of simboluri) if (market[k]?.fund && peSector[themeOf(k)]) market[k].fund = { ...market[k].fund, peSector: peSector[themeOf(k)] };
  }

  if (!demo) {
    // notificările direct în aplicație (Web Push)
    const cfgPush = configPush(await KV.get('push')), nAb = cfgPush.subs.length + cfgPush.tel.length;
    if (nAb) {
      if (env.MOD === 'test') {
        const ok = await trimite(env, KV, `test:${Date.now()}`, 'Analist e conectat', 'Notificările merg. Te anunț când văd o ocazie, o mișcare mare sau un semnal nou.', 4, '#azi');
        conex.push = ok ? { stare: 'ok', mesaj: 'Notificarea de test a fost trimisă. Verifică dacă a ajuns pe telefon.' } : { stare: 'eroare', mesaj: 'Nu am putut trimite notificarea de test. Activează din nou notificările din Setări.' };
      } else conex.push = cfgPush.tel.length && !contFirebase(env.FCM_CONT) ? { stare: 'eroare', mesaj: 'Aplicația Android e înregistrată, dar lipsește secretul FCM_CONT din GitHub: notificările merg deocamdată prin Chrome.' }
        : { stare: 'ok', mesaj: `Active pe ${nAb === 1 ? 'un telefon' : nAb + ' telefoane'}${cfgPush.tel.length ? ', direct în aplicație' : ''}${cfgPush.discret ? ', discrete' : ''}.` };
    } else conex.push = { stare: 'lipsa', mesaj: 'Nu sunt activate. Setări → Notificări → Activează pe acest telefon.' };
  }
  // Nicio poziție citită (cheie greșită, broker căzut): păstrăm ultima analiză bună, cu erorile proaspete.
  if (!demo && !positions.length) {
    const vechi = J(await KV.get('snapshot'), null);
    if (vechi?.pozitii?.length) {
      const s = { ...vechi, erori, conexiuni: conex, ultimaIncercare: new Date().toISOString(), schimbari: [] };
      await KV.put('snapshot', JSON.stringify(s));
      return { ...s, pastrat: true };
    }
  }
  // Profilul tău (orizont + suma lunară), setat din aplicație și păstrat criptat.
  const profil = derivaProfil(J(await KV.get('profil'), {}), azi);
  // Cu cine se compară o scădere (pentru „Reducere”): media pe 3 luni a celorlalte companii din același sector
  // (ale tale și din universul de idei); fără cel puțin două, VWCE.
  { const u = market._univ || {}, r3 = {};
    for (const [k, m] of Object.entries(market)) if (k !== '_univ' && m?.ind?.r3l != null) r3[k] = m.ind.r3l;
    for (const [k, x] of Object.entries(u)) if (x.ind?.r3l != null && r3[k] == null) r3[k] = x.ind.r3l;
    for (const [k, m] of Object.entries(market)) { if (k === '_univ' || !m?.ind) continue;
      const t = themeOf(k), peers = Object.keys(r3).filter(x => x !== k && themeOf(x) === t);
      if (peers.length >= 2 && t !== 'Altele') { m.ref3l = peers.reduce((a, x) => a + r3[x], 0) / peers.length; m.refNume = `sectorul ${t}`; }
      else if (market.VWCE?.ind?.r3l != null) { m.ref3l = market.VWCE.ind.r3l; m.refNume = 'VWCE'; } } }
  // v0.44: valoarea eToro = unități × prețul de acum
  const valoriEtoro = demo ? [] : valoareEtoro(positions, market, fx);
  const snap = construiesteSnapshot({ positions, market, azi, fx, profil,
    surse: demo ? ['DEMO'] : ['Trading 212', env.ETORO_USER_KEY && 'eToro', env.FINNHUB_KEY && 'Finnhub', fx.sursa === 'BNR' && 'BNR'].filter(Boolean) });
  snap.versiune = VERSION; snap.demo = demo; snap.erori = erori;
  snap.push = await pushInfo(env, KV);
  // candidații pentru diversificare: doar datele de care au nevoie recomandările (fără serii lungi)
  // universul de idei, fără serii lungi: telefonul alege din el instant, inclusiv după un refuz. Sigle doar pentru primele 20.
  const univ = market._univ || {}, sig = J(await KV.get('sigle2'), {});
  const lista = Object.entries(univ).filter(([k, u]) => u.ind && (ACTIUNI_CATALOG[k] || ETF_CATALOG[k]) && !snap.pozitii.some(p => p.symbol === k && !p.virtual));
  const top = new Set(lista.filter(([k]) => ACTIUNI_CATALOG[k]).sort((a, b) => (b[1].scor ?? -1) - (a[1].scor ?? -1)).slice(0, UNIVERS.logo).map(([k]) => k));
  const PS = market._peSector || {};
  snap.candidati = lista.map(([k, u]) => ({ symbol: k, ind: u.ind, fund: u.fund && PS[themeOf(k)] ? { ...u.fund, peSector: PS[themeOf(k)] } : u.fund, rec: u.rec, t212: u.t212, etoro: u.etoro, scor: u.scor, actualizat: new Date(u.t).toISOString().slice(0, 10),
    ...((top.has(k) || ETF_CATALOG[k]) && (market[k]?.logo || sig[k]?.d) ? { logo: market[k]?.logo || sig[k].d } : {}) }));
  snap.etfRef = snap.etfRef || (market.VWCE?.ind ? { r1a: market.VWCE.ind.r1a, r3l: market.VWCE.ind.r3l } : null);
  if (!demo) snap.conexiuni = conex;
  const vechiS = J(await KV.get('snapshot'), null);
  if (!demo) {
    // ---- Ora fiecărei surse ----
    const ultimaZi = snap.pozitii.map(p => p.serie?.d?.at(-1)).filter(Boolean).sort().pop() || null;
    snap.ora = { ...extra.ora, bnr: fx.sursa === 'BNR' ? fx.data : null, preturi: ultimaZi };
    // ---- Verificarea sumelor cu brokerii ----
    snap.verificare = verificaSume(positions, extra.t212Sumar, valoriEtoro);
    if (extra.t212Sumar?.cash != null) snap.cashNeinvestit = { lei: extra.t212Sumar.cash, broker: 'Trading 212' };
    // ---- Cumpărări și vânzări văzute în cont (comparat cu analiza de ieri) ----
    const op = J(await KV.get('operatiuni'), []);
    const noi = operatiuniNoi(vechiS, snap, fx, azi);
    op.push(...noi); await KV.put('operatiuni', JSON.stringify(op.slice(-500)));
    snap.operatiuni = op.slice(-120); snap.operatiuniNoi = noi;
    // ---- Paza la date ciudate ----
    snap.paza = pazaDate(vechiS, snap, noi);
    for (const p of snap.pozitii) if (snap.paza.simboluri.includes(p.symbol)) p.deVerificat = true;
  }

  // ---- Câștiguri realizate în anul curent (Declarația Unică) ----
  if (!demo) {
    const an = azi.slice(0, 4), deLa = `${an}-01-01`;
    const real = J(await KV.get('realizat'), { an, tranzactii: [] });
    // anul încheiat nu se mai șterge: Declarația Unică pentru el se depune abia până la 25 mai anul următor
    if (real.an !== an) { const arh = J(await KV.get('realizatAni'), {}); arh[real.an] = real.tranzactii; await KV.put('realizatAni', JSON.stringify(arh)); real.an = an; real.tranzactii = []; }
    const stiute = new Set(real.tranzactii.map(t => t.id));
    if (env.T212_KEY) {
      try { real.tranzactii.push(...await t212Realizat(env, deLa, stiute)); }
      catch (e) { erori.push(`Istoric Trading 212: ${e.message}${COD(e.message) === 403 ? ' (bifează la cheie și History, și History - Orders)' : ''}`); }
    }
    if (env.ETORO_USER_KEY) {
      try {
        const bnr = await bnrAn(an);
        real.tranzactii = real.tranzactii.filter(t => t.broker !== 'eToro'); // istoricul eToro vine complet de fiecare dată
        real.tranzactii.push(...await etoroRealizat(env, deLa, bnr));
      } catch (e) { erori.push(`Istoric eToro: ${e.message}`); }
    }
    await KV.put('realizat', JSON.stringify(real)); snap._realizate = real.tranzactii;
    snap._arhivaRealizat = J(await KV.get('realizatAni'), {});
    const tot = real.tranzactii.reduce((a, t) => a + (t.lei || 0), 0);
    snap.realizat = {
      an, totalLei: tot, impozitEstimat: Math.max(0, tot) * IMPOZIT.cota / 100, cota: IMPOZIT.cota, termen: IMPOZIT.termen,
      peBroker: ['Trading 212', 'eToro'].map(b => ({ broker: b, lei: real.tranzactii.filter(t => t.broker === b).reduce((a, t) => a + (t.lei || 0), 0), n: real.tranzactii.filter(t => t.broker === b).length })),
      faraCurs: real.tranzactii.filter(t => t.lei == null).length,
    };
  }

  // ---- Comparația cu VWCE: un portofoliu „fantomă” care primește aceleași depuneri, dar numai în VWCE ----
  // Depunerea netă = cât a crescut costul pozițiilor minus câștigul realizat din vânzările noi
  // (la o vânzare costul scade cu cât ai plătit, dar ies din portofoliu banii primiți, adică cost + câștig).
  const costT212 = positions.filter(p => p.broker === 'Trading 212').reduce((a, p) => a + p.costRON, 0);
  const costEtUSD = positions.filter(p => p.broker === 'eToro').reduce((a, p) => a + (p.costUSD ?? p.costRON / (fx.USD || 1)), 0);
  const vwce = snap.pozitii.find(p => p.symbol === 'VWCE') || snap.pozitii.find(p => p.etf && !p.virtual);
  const vwRON = vwce?.ind?.pret && fx.EUR ? vwce.ind.pret * fx.EUR : null;
  let bench = J(await KV.get('bench'), null);
  if (!demo && vwRON && positions.length) {
    const vanzari = (snap._realizate || []).filter(t => t.lei != null);
    if (!bench) bench = { start: azi, unitati: snap.totalRON / vwRON, costT212, costEtUSD, totalStart: snap.totalRON, vazute: vanzari.map(t => t.id) };
    else {
      const vazute = new Set(bench.vazute || vanzari.map(t => t.id)); // prima rulare cu regula nouă: istoricul nu se mai numără
      const castigNou = vanzari.filter(t => !vazute.has(t.id)).reduce((a, t) => a + t.lei, 0);
      const depunere = (costT212 - bench.costT212) + (costEtUSD - bench.costEtUSD) * (fx.USD || 0) - castigNou;
      bench.unitati = Math.max(0, bench.unitati + depunere / vwRON); bench.costT212 = costT212; bench.costEtUSD = costEtUSD;
      bench.vazute = [...new Set([...vazute, ...vanzari.map(t => t.id)])].slice(-3000);
    }
    await KV.put('bench', JSON.stringify(bench));
    snap.bench = { start: bench.start, valoare: bench.unitati * vwRON, diferenta: snap.totalRON - bench.unitati * vwRON };
  }
  snap._tranzactiiAn = snap._realizate; delete snap._realizate;
  // ---- Execuții, dividende, randament real, costuri ----
  if (!demo) await banii(env, KV, snap, positions, fx, azi, erori, market);
  if (!demo) await randamenteInLei(KV, snap, azi);
  if (!demo) {
    // ---- Inflația (Eurostat), o dată pe zi; dacă nu răspunde, rămâne ultima citită ----
    let inf = J(await KV.get('inflatie'), null, 'inflația salvată');
    if (!inf || Date.now() - (inf.t || 0) > 20 * 3600e3) {
      try { inf = { ...(await inflatieEurostat()), t: Date.now() }; await KV.put('inflatie', JSON.stringify(inf)); }
      catch (e) { tacut('inflația de la Eurostat', e); }
    }
    if (inf?.an != null) snap.inflatie = { an: inf.an, luna: inf.luna, sursa: inf.sursa };
    // ---- Verificări de bun-simț: dacă ceva nu se leagă, notificare (o dată pe problemă) ----
    snap.bunSimt = verificariBunSimt(snap, { fx, valoriEtoro, vechi: vechiS, operatiuniAzi: (snap.operatiuniNoi || []).length });
    snap.valoriEtoro = valoriEtoro;
    // ---- Jurnalul semnalelor (v0.45): verdictul de azi, notat; cele vechi de 3 și 6 luni, măsurate ----
    try {
      const piata = sentimentPiata(snap.pozitii, snap.candidati || []), ref = snap.etfRef || {}, noi = [], pretAcum = {};
      const vwS = market.VWCE?.serie, vwLa = d => { if (!vwS?.d?.length) return null; let i = vwS.d.length - 1; while (i >= 0 && vwS.d[i] > d) i--; return i >= 0 ? vwS.c[i] : null; };
      const vwAzi = market.VWCE?.ind?.pret;
      for (const p of snap.pozitii.filter(p => !p.virtual && p.ind?.pret)) { pretAcum[p.symbol] = { p: p.ind.pret, d: p.ind.data || azi };
        const v = verdictCumparare(p, piata, ref, azi); if (v) noi.push({ s: p.symbol, v: v.nivel, p: p.ind.pret, vw: vwAzi }); }
      for (const c of snap.candidati || []) { if (!c.ind?.pret || c.actualizat !== azi) continue; pretAcum[c.symbol] ||= { p: c.ind.pret, d: c.actualizat };
        const v = verdictCumparare(c, piata, ref, azi); if (v) noi.push({ s: c.symbol, v: v.nivel, p: c.ind.pret, vw: vwAzi }); }
      // prețurile pentru măsurare: și ideile care nu mai sunt în listă, dacă au fost reîmprospătate recent
      for (const [k, u] of Object.entries(market._univ || {})) if (!pretAcum[k] && u.ind?.pret && u.t) pretAcum[k] = { p: u.ind.pret, d: new Date(u.t).toISOString().slice(0, 10) };
      let jur = J(await KV.get('jurnalSemnale'), [], 'jurnalul semnalelor');
      jur = evalueazaJurnal(noteazaJurnal(jur, noi, azi), s => pretAcum[s], vwLa);
      await KV.put('jurnalSemnale', JSON.stringify(jur));
      snap.jurnalSemnale = rezumatJurnal(jur);
    } catch (e) { tacut('jurnalul semnalelor', e); }
    const vazute = new Set((vechiS?.bunSimt || []).map(x => x.id)); // doar problemele noi; cele vechi rămân în Verificare
    for (const x of snap.bunSimt.filter(x => !vazute.has(x.id))) await notificaOdata(env, KV, `bunsimt:${x.id}:${azi}`, 'Analist: o cifră nu se leagă', x.text, 4, '#verificare');
    const dupa = J(await KV.get('tacuteDupa'), [], 'lista erorilor ascunse'); await KV.put('tacuteDupa', '[]');
    snap.tacute = [...tacute(), ...dupa.map(x => ({ loc: x.loc, motiv: x.motiv, n: x.n, cand: x.cand, mod: x.mod }))].slice(0, 30);
  }
  // ---- Alertele tale de preț (din profil), pe prețul de închidere ----
  await verificaAlerte(env, KV, snap, Object.fromEntries(snap.pozitii.filter(p => p.ind?.pret).map(p => [p.symbol, p.ind.pret])), azi);

  // ---- Istoric, schimbări, notificări ----
  const vechi = vechiS;
  const sch = schimbari(vechi, snap).filter(x => !snap.paza?.simboluri?.includes(x.symbol));
  snap.schimbari = sch;
  await KV.put('snapshot', JSON.stringify(snap));
  const ist = J(await KV.get('istoric'), []).filter(x => x.azi !== azi);
  ist.push({ azi, totalRON: +snap.totalRON.toFixed(2), bench: snap.bench ? +snap.bench.valoare.toFixed(2) : null,
    semnale: Object.fromEntries(snap.pozitii.map(p => [p.symbol, p.semnal])) });
  await KV.put('istoric', JSON.stringify(ist.slice(-500)));

  if (!demo) await pazaConturi(env, KV, snap, extra, azi, paza);
  await KV.put('snapshot', JSON.stringify(snap));
  if (!demo) await notificariZi(env, KV, snap, sch, azi);
  return snap;
}

// Paza conturilor: activitate nouă, ordine trimise prin API, drepturile cheii eToro, încercări de scriere blocate.
async function pazaConturi(env, KV, snap, extra, azi, paza) {
  const sec = { garda: true, alarme: [], etoroScrie: null, activitate: [], verificat: new Date().toISOString() };
  try {
    const t212 = (snap._execNoi || []).filter(e => e.data && e.id);
    const act = activitateNoua(J(await KV.get('activitate'), null), t212, extra.etoroToate || null, azi);
    await KV.put('activitate', JSON.stringify(act.stare));
    sec.activitate = act.stare.lista; sec.baza = act.stare.baza;
    sec.alarme.push(...alarmeActivitate(act.stare.lista));
    if (act.noi.length) await notificaOdata(env, KV, `activ:${act.noi.map(x => x.id).join(',').slice(0, 80)}`, 'Analist: tranzacție nouă în cont',
      act.noi.map(x => `${x.broker}: ${x.tip} ${x.symbol || ''}`).join('\n'), 4, '#securitate');
  } catch (e) { snap.erori.push(`Paza conturilor: ${e.message}`); }
  if (env.ETORO_USER_KEY) { try { const dr = await etoroDrepturi(env); sec.etoroScrie = scrieEtoro(dr); if (sec.etoroScrie) sec.etoroScopuri = scopuriScriere(dr); } catch (e) { sec.etoroScrie = null; tacut('drepturile cheii eToro (nu s-a putut verifica dacă e doar de citire)', e); } }
  if (sec.etoroScrie) sec.alarme.push({ id: 'etoro-scriere', nivel: 'atentie', tip: 'cheie-scriere',
    text: 'Cheia eToro are drept de scriere (poate tranzacționa). Generează o cheie nouă doar cu „Read” și șterge-o pe cea veche.' });
  const ret = J(await KV.get('alarmeRetea'), []);
  sec.alarme.push(...ret, ...paza.alarme.filter(a => !ret.some(b => b.id === a.id)));
  if (paza.avert.length) snap.erori.push(...[...new Set(paza.avert)].slice(0, 3));
  delete snap._execNoi;
  snap.securitate = sec;
  for (const a of sec.alarme.filter(a => a.nivel === 'critic')) await notificaOdata(env, KV, `alarma:${a.id}`, 'Analist: ALARMĂ de securitate', a.text, 5, '#securitate');
}

async function notificariZi(env, KV, snap, sch, azi) {
  if (snap.paza?.global) { // date suspecte: un singur mesaj, nimic altceva
    await notificaOdata(env, KV, `paza:${azi}`, 'Analist: date de verificat', snap.paza.motiv + ' Semnalele de azi au fost oprite.', 3, '#analiza');
    return;
  }
  // 1) semnale importante: Verifică acțiunea, Reechilibrează, Oportunitate
  const trimise = J(await KV.get('notificari'), {});
  // v0.41: „Verifică acțiunea” și „Reechilibrează” se anunță o singură dată în 30 de zile pentru aceeași acțiune. Pe istoric, 62% din
  // intrările sub nivelul de alertă erau reveniri în cel mult 10 zile după ce prețul ieșise de acolo: aceeași veste, de mai multe ori.
  const zile = d => (Date.parse(azi) - Date.parse(d)) / 864e5, cheieSem = x => `semn:${x.symbol}:${x.in}`;
  const imp = sch.filter(x => x.important && !(x.eticheta === 'Oportunitate' && trimise[`opor:${x.symbol}:${azi}`])
    && !(x.eticheta !== 'Oportunitate' && trimise[cheieSem(x)] && zile(trimise[cheieSem(x)]) < 30));
  if (imp.length) await notificaOdata(env, KV, `sch:${azi}`, `Analist: ${imp.length === 1 ? imp[0].symbol + ' – ' + imp[0].eticheta : imp.length + ' semnale importante'}`,
    imp.map(x => `${x.symbol}: ${x.eticheta}`).join('\n'), 4, imp.length === 1 ? `#s=${encodeURIComponent(imp[0].symbol)}` : '');
  if (imp.some(x => x.eticheta !== 'Oportunitate')) { const t = J(await KV.get('notificari'), {}); for (const x of imp) if (x.eticheta !== 'Oportunitate') t[cheieSem(x)] = azi; await KV.put('notificari', JSON.stringify(t)); }
  // 2) planul lunii, la prima rulare din lună
  const luna = azi.slice(0, 7), s = snap.profil.contributieTipica, plan = snap.planuri[s];
  if (plan?.length) await notificaOdata(env, KV, `plan:${luna}`, `Planul lunii (${s} lei)`,
    plan.map(l => `${l.symbol}: ${l.suma} ${de(l.suma)}lei la ${l.broker}${l.orar ? `, ${l.orar.interval}` : ''}`).join('\n') + '\nPentru altă sumă, deschide tabul Plan.', 3, '#plan');
  // 3) rezumatul zilei, la analiza programată de seară: o singură dată pentru fiecare zi nouă de bursă din date
  //    (într-o zi fără bursă nu apare o lumânare nouă, deci cheia există deja și nu se repetă ziua trecută)
  if (env.SCANARE === '1') {
    const z = ziRezumat(snap.pozitii, azi), rz = z && rezumatZi(z.pozitii, sch);
    if (rz) await notificaOdata(env, KV, `rezumat:${z.zi}`, rz.titlu, rz.text, 2, '#azi', { silentios: true });
  }
  // 4) rezultate trimestriale în 2 zile
  for (const p of snap.pozitii) {
    if (!p.rezultate) continue;
    const z = Math.round((Date.parse(p.rezultate) - Date.parse(azi)) / 864e5);
    if (z >= 0 && z <= 2) await notificaOdata(env, KV, `rez:${p.symbol}:${p.rezultate}`, `${p.symbol}: rezultate pe ${dataRo(p.rezultate)}`,
      'Sunt posibile mișcări mari. Nu cumpăra înainte de rezultate.', 3, `#s=${encodeURIComponent(p.symbol)}`);
  }
}

// Comparațiile „pe un an” trebuie făcute în aceeași monedă. NVDA în dolari față de VWCE în euro ar include și mișcarea
// cursului euro/dolar (până la 10% pe an). Convertim randamentul pe un an în lei, cu cursul BNR de acum un an și de azi.
async function randamenteInLei(KV, snap, azi) {
  const an = +azi.slice(0, 4), bnr = await bnrPeAni(KV, [String(an - 1), String(an)], azi), d0 = `${an - 1}${azi.slice(4)}`;
  const f = {}; for (const m of ['USD', 'EUR', 'GBP', 'CHF']) { const c0 = cursLa(bnr, d0, m), c1 = cursLa(bnr, azi, m); if (c0 && c1) f[m] = c1 / c0; }
  f.RON = 1; snap.fx1a = f;
  const conv = (r, m) => r == null || !f[m] ? null : ((1 + r / 100) * f[m] - 1) * 100;
  for (const p of snap.pozitii) if (p.ind?.r1a != null) p.ind.r1aLei = conv(p.ind.r1a, p.moneda);
  // v0.42: mișcarea ultimei zile în lei (prețul × cursul BNR din ziua lui, față de ziua dinainte) și cursul pe fiecare zi din serie,
  // ca riscul (volatilitatea) să fie cel din lei, adică cel pe care îl vezi tu în cont
  for (const p of snap.pozitii) {
    const m = p.moneda, i = p.ind; if (!m || !i) continue;
    if (m === 'RON') { if (i.r1z != null) i.r1zLei = i.r1z; continue; }
    if (i.r1z != null && i.data && i.dataPrec) { const c1 = cursLa(bnr, i.data, m), c0 = cursLa(bnr, i.dataPrec, m); if (c1 && c0) i.r1zLei = ((1 + i.r1z / 100) * c1 / c0 - 1) * 100; }
    if (p.serie?.d?.length) { const fx = p.serie.d.map(d => cursLa(bnr, d, m)); if (fx.every(x => x > 0)) p.serie.fx = fx.map(x => +x.toFixed(4)); }
  }
  snap.fxIst = Object.fromEntries(Object.keys(bnr).sort().slice(-12).map(d => [d, Object.fromEntries(['USD', 'EUR', 'GBP', 'CHF'].filter(m => bnr[d][m]).map(m => [m, bnr[d][m]]))]));
  for (const c of snap.candidati || []) if (c.ind?.r1a != null) c.ind.r1aLei = conv(c.ind.r1a, ETF_CATALOG[c.symbol] ? 'EUR' : monedaOf(c.symbol));
  if (snap.etfRef?.r1a != null) snap.etfRef.r1aLei = conv(snap.etfRef.r1a, 'EUR');
}

// Banii tăi în timp: execuțiile Trading 212 (cu comisioane), dividendele, loturile eToro -> randament real și costuri.
// Cursurile BNR pe un an întreg; anii încheiați nu se mai schimbă, deci se păstrează în cache.
async function bnrPeAni(KV, ani, azi, lipsa = null) {
  const z = {};
  for (const an of [...new Set(ani)].sort()) {
    const k = `bnr:${an}`, vechi = an < azi.slice(0, 4) ? J(await KV.get(k), null) : null;
    if (vechi && Object.keys(vechi).length) { Object.assign(z, vechi); continue; }
    try { const r = await bnrAn(an); Object.assign(z, r); if (an < azi.slice(0, 4)) await KV.put(k, JSON.stringify(r)); }
    catch (e) { if (lipsa) lipsa.push({ an, motiv: e.message }); /* fără cursul anului: comparația rămâne incompletă */ }
  }
  return z;
}
async function banii(env, KV, snap, positions, fx, azi, erori, market = {}) {
  snap._execNoi = [];
  const ex = J(await KV.get('executii'), { lista: [], cursor: null, complet: false });
  const div = J(await KV.get('dividende'), { lista: [] });
  if (env.T212_KEY) {
    // execuțiile și dividendele sunt endpoint-uri diferite, cu limite separate: se citesc în paralel
    await Promise.all([(async () => { try {
      const stiute = new Set(ex.lista.map(x => x.id));
      if (ex.lista.length) { const n = await t212Executii(env, stiute, null, 2); ex.lista.push(...n.executii); snap._execNoi.push(...n.executii); }
      if (!ex.complet) { const v = await t212Executii(env, stiute, ex.cursor, 4); ex.lista.push(...v.executii); ex.cursor = v.urm; ex.complet = !v.urm; snap._execNoi.push(...v.executii); }
      ex.lista = [...new Map(ex.lista.map(x => [x.id, x])).values()];
    } catch (e) { erori.push(`Execuții Trading 212: ${e.message}`); } })(),
    (async () => { try { const st = new Set(div.lista.map(x => x.id)); div.lista.push(...await t212Dividende(env, st)); }
    catch (e) { if (COD(e.message) === 403) div.faraPermisiune = true; else erori.push(`Dividende Trading 212: ${e.message}`); } })()]);
    await KV.put('executii', JSON.stringify(ex)); await KV.put('dividende', JSON.stringify(div));
  }
  // randamentul real (XIRR): fiecare sumă cu data ei; azi, valoarea pozițiilor ca „ieșire”
  const flux = [];
  for (const x of ex.lista) flux.push({ data: x.data, suma: x.tip === 'vanzare' ? x.lei : -x.lei });
  for (const d of div.lista) flux.push({ data: d.data, suma: d.lei });
  const et = positions.filter(p => p.broker === 'eToro');
  // loturile eToro: dolarii din ziua deschiderii, la cursul BNR din acea zi (nu la cel de azi)
  const aniNec = [...ex.lista, ...div.lista, ...et.flatMap(p => p.loturi || [])].map(x => String(x.data).slice(0, 4)).filter(a => /^\d{4}$/.test(a));
  // v0.43: și anul dinaintea celui mai vechi lot (o cumpărare din 1–2 ianuarie ia cursul din ultima zi a anului trecut)
  const aniLipsa = [], primAn = aniNec.length ? String(Math.min(...aniNec.map(Number)) - 1) : null;
  const bnr = await bnrPeAni(KV, [...aniNec, ...(primAn ? [primAn] : []), azi.slice(0, 4)], azi, aniLipsa);
  let farCurs = 0;
  for (const p of et) for (const l of p.loturi || []) { const c = cursCumparare(bnr, l.data, 'USD'); if (!c) farCurs++; flux.push({ data: l.data, suma: -l.usd * (c || fx.USD || 0) }); }
  // v0.42: costul pozițiilor eToro în lei, cu cursul BNR din ziua fiecărei cumpărări (nu cu cel de azi). Altfel, câștigul sau
  // pierderea din curs (dolarul a urcat de la ~4,29 la ~4,75 lei în 2026) nu apărea nicăieri. Cum faci și la impozit.
  const costLei = {};
  // diagnosticul: câte poziții au costul la cursul din ziua cumpărării și, pentru celelalte, de ce nu
  const diag = { pozitii: et.length, laCumparare: 0, faraData: [], faraCurs: [], aniLipsa: aniLipsa.filter(x => x.an !== primAn) };
  for (const p of et) {
    const c = costInLei(p.costUSD, p.loturi, d => cursCumparare(bnr, d, 'USD'));
    if (c != null) { costLei[p.symbol] = c; diag.laCumparare++; }
    else if (!(p.loturi || []).some(l => l.data && l.usd > 0)) diag.faraData.push(canon(p.symbol));
    else diag.faraCurs.push(canon(p.symbol));
  }
  snap.costEtoroDiag = diag;
  if (diag.aniLipsa.length) erori.push(`Cursul BNR pe ${diag.aniLipsa.map(x => x.an).join(', ')} nu s-a putut citi (${diag.aniLipsa[0].motiv}). Costul unor poziții eToro e la cursul de azi.`);
  let schimbat = false;
  for (const g of snap.pozitii) for (const b of g.brokers || []) {
    if (b.broker !== 'eToro' || costLei[b.symbol] == null) continue;
    const d = costLei[b.symbol] - b.costRON; b.costRON = costLei[b.symbol]; b.costCurs = 'BNR la cumpărare';
    g.costRON += d; g.pnlRON = g.valueRON - g.costRON; g.pnlPct = g.costRON ? g.pnlRON / g.costRON * 100 : 0; schimbat = true;
  }
  if (schimbat) snap.costRON = snap.pozitii.filter(g => !g.virtual).reduce((a, g) => a + g.costRON, 0);
  snap.costEtoroLaCumparare = Object.keys(costLei).length;
  const valT = positions.filter(p => p.broker === 'Trading 212').reduce((a, p) => a + p.valueRON, 0), valE = et.reduce((a, p) => a + p.valueRON, 0);
  const costT = positions.filter(p => p.broker === 'Trading 212').reduce((a, p) => a + p.costRON, 0);
  const netT = ex.lista.reduce((a, x) => a + (x.tip === 'vanzare' ? -x.lei : x.lei), 0);
  const completT = ex.complet && Math.abs(netT - costT) <= Math.max(costT * 0.25, 50); // istoricul acoperă ce ai acum
  // același flux de bani, pus integral în VWCE la prețul zilei respective (preț în EUR × cursul BNR EUR din acea zi)
  let vw = null, vwIst = null;
  try {
    const ist = J(await KV.get('vwceIstoric'), { d: [], c: [] }), id = market.VWCE?.etoroId; vwIst = ist;
    if (id && !ist.lung && (!ist.d.length || ist.d[0] > (flux.map(x => x.data).sort()[0] || azi))) { // istoricul lung se cere o singură dată
      try { const c = await etoroCandles(env, id, 1000); if (c.length) { ist.d = c.map(x => String(x.t).slice(0, 10)); ist.c = c.map(x => x.c); } } catch (e) { tacut('istoricul lung VWCE', e); }
      ist.lung = true;
    }
    const s = market.VWCE?.serie; // completează cu zilele noi
    if (s?.d?.length) { const m = new Map(ist.d.map((d, i) => [d, ist.c[i]])); s.d.forEach((d, i) => d && m.set(d, s.c[i])); const k = [...m.keys()].sort(); ist.d = k; ist.c = k.map(d => m.get(d)); }
    if (ist.d.length) await KV.put('vwceIstoric', JSON.stringify(ist));
    const pretLa = d => { if (!ist.d.length || d < ist.d[0]) return null; let i = ist.d.length - 1; while (i > 0 && ist.d[i] > d) i--; const e = cursLa(bnr, d, 'EUR') || (d >= azi ? fx.EUR : null); return e ? ist.c[i] * e : null; };
    vw = aceleasiDepuneri(flux, pretLa, azi);
  } catch (e) { erori.push(`Comparația cu VWCE: ${e.message}`); }
  // evoluția fiecărui cont, pentru graficul de pe Acasă (Ambele / Trading 212 / eToro), chiar și fără istoric salvat
  try {
    const zileBnr = Object.keys(bnr).sort();
    const curs = (d, m) => { let lo = 0, hi = zileBnr.length - 1, r = -1; while (lo <= hi) { const k = (lo + hi) >> 1; if (zileBnr[k] <= d) { r = k; lo = k + 1; } else hi = k - 1; }
      return (r >= 0 ? bnr[zileBnr[r]]?.[m] : null) || fx[m] || null; };
    const poz = positions.map(p => { const s = canon(p.symbol), sp = snap.pozitii.find(x => x.symbol === s), se = market[s]?.serie || sp?.serie;
      return { cont: p.broker, sym: p.symbol, qty: p.qty, valueRON: p.valueRON, d: se?.d, c: se?.c, moneda: sp?.moneda || monedaOf(s), loturi: p.loturi }; }).filter(p => p.d?.length);
    snap.evolutie = evolutieConturi(poz, ex.lista.map(x => ({ data: x.data, sym: x.symbol, tip: x.tip, lei: x.lei })), curs, vwIst?.d?.length ? vwIst : market.VWCE?.serie);
  } catch (e) { erori.push(`Evoluția conturilor: ${e.message}`); }
  flux.push({ data: azi, suma: valT + valE });
  const r = xirr(flux), prima = flux.filter(x => x.suma < 0).map(x => x.data).sort()[0] || null;
  snap.randament = { anual: r, dela: prima, complet: completT && !farCurs, executii: ex.lista.length, inCurs: !ex.complet,
    vwce: vw ? { anual: vw.anual, valoare: vw.valoare } : null };
  // costuri
  const comis = ex.lista.reduce((a, x) => a + (x.taxe || 0), 0), comisFX = ex.lista.reduce((a, x) => a + (x.taxeFX || 0), 0);
  const ter = snap.pozitii.reduce((a, p) => a + (TER[p.symbol] ? p.valueRON * TER[p.symbol] / 100 : 0), 0);
  const fxAn = snap.profil.contributieTipica * 12 * (COMISION_FX['Trading 212'] || 0) / 100;
  snap.costuri = { platite: comis, platiteFX: comisFX, ter, fxAn, totalAn: ter + fxAn, procentAn: (ter + fxAn) / (snap.totalRON || 1) * 100, complet: ex.complet };
  // dividende
  // Estimarea: randamentul anunțat × valoarea de azi, doar la acțiuni (ETF-urile tale sunt cu acumulare: nu plătesc nimic în cont).
  // Net: statul companiei reține la sursă, iar România cere 16% în total, scăzând ce s-a reținut deja (fără să dea înapoi diferența).
  // SUA: 10% cu formularul W-8BEN (bifat automat la Trading 212 și eToro), deci mai plătești 6% în țară. Germania 26,375%, Franța 25%, Italia 26%,
  // Spania 19%, Olanda 15%, Elveția 35%, Marea Britanie 0%: impozitul total e cel mai mare dintre reținere și 16%.
  const RETINERE = { '.DE': 26.375, '.PA': 25, '.MI': 26, '.MC': 19, '.AS': 15, '.SW': 35, '.L': 0 };
  const taxa = sym => Math.max(16, RETINERE[Object.keys(RETINERE).find(k => sym.endsWith(k))] ?? 10);
  const cuDiv = snap.pozitii.filter(p => !p.etf && !ETF_CATALOG[p.symbol] && !p.virtual && p.fund?.randDiv > 0);
  const an = azi.slice(0, 4), estimat = cuDiv.reduce((a, p) => a + p.valueRON * p.fund.randDiv / 100, 0), net = cuDiv.reduce((a, p) => a + p.valueRON * p.fund.randDiv / 100 * (1 - taxa(p.symbol) / 100), 0);
  snap.dividende = { incasateAn: div.lista.filter(d => d.data.startsWith(an)).reduce((a, d) => a + d.lei, 0), incasateTot: div.lista.reduce((a, d) => a + d.lei, 0),
    estimatAn: estimat, netAn: net, randament: estimat / (snap.totalRON || 1) * 100, ultimele: [...div.lista].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12), faraPermisiune: !!div.faraPermisiune,
    peActiune: cuDiv.map(p => ({ symbol: p.symbol, randDiv: p.fund.randDiv, lei: p.valueRON * p.fund.randDiv / 100, net: p.valueRON * p.fund.randDiv / 100 * (1 - taxa(p.symbol) / 100), taxa: taxa(p.symbol) })).sort((a, b) => b.lei - a.lei),
    luni: luniDividende(div.lista, azi, canon) };
  // ---- Raportul anual pentru Declarația Unică: anul curent și, până la termenul de depunere (mai), anul trecut ----
  { const anT = String(+an - 1), arh = snap._arhivaRealizat || {}, toate = [...(snap._tranzactiiAn || []), ...Object.values(arh).flat()];
    snap.raportAnual = { [an]: raportAnual(an, toate, div.lista) };
    if (+azi.slice(5, 7) <= 6 && (arh[anT]?.length || div.lista.some(d => d.data.startsWith(anT)))) snap.raportAnual[anT] = raportAnual(anT, toate, div.lista);
    snap.raportAnual._detalii = { tranzactii: toate.filter(t => t.data >= `${anT}-01-01`).map(t => ({ b: t.broker === 'eToro' ? 'E' : 'T', d: t.data, s: t.symbol || (t.instrumentId ? '#' + t.instrumentId : ''), l: t.lei == null ? null : Math.round(t.lei * 100) / 100 })),
      dividende: div.lista.filter(d => d.data >= `${anT}-01-01`).map(d => ({ d: d.data, s: d.symbol, l: Math.round(d.lei * 100) / 100 })) }; }
  delete snap._arhivaRealizat; delete snap._tranzactiiAn;
}
// Alertele de preț setate de tine: o singură notificare pe alertă, apoi rămâne marcată ca atinsă.
async function verificaAlerte(env, KV, snap, preturi, azi) {
  const alerte = J(await KV.get('profil'), {}).alerte || [];
  const atinse = J(await KV.get('alerteAtinse'), {});
  for (const a of alerte) {
    const k = `${a.s}:${a.d}:${a.p}`, pr = preturi[a.s];
    if (!pr || atinse[k]) continue;
    if ((a.d === 'sub' && pr <= a.p) || (a.d === 'peste' && pr >= a.p)) {
      atinse[k] = azi;
      await notificaOdata(env, KV, `alerta:${k}`, `${a.s} a ajuns ${a.d === 'sub' ? 'sub' : 'peste'} ${fmt(a.p)}`, `Prețul e acum ${fmt(pr)}. Alerta ta s-a atins.`, 4, `#s=${encodeURIComponent(a.s)}`);
    }
  }
  await KV.put('alerteAtinse', JSON.stringify(atinse));
  snap.alerteAtinse = atinse;
}

// ---------- Rularea din timpul zilei ----------
export async function ruleazaIntraday(env, KV) {
  const azi = new Date().toISOString().slice(0, 10);
  const snap = J(await KV.get('snapshot'), null);
  const erori = [];
  if (!snap) return { mod: 'intraday', erori: ['Nicio analiză zilnică încă.'], pozitii: [] };
  const { positions } = await citestePozitii(env, erori);
  // v0.42: „azi” se măsoară față de închiderea de ieri. Dacă ultima analiză a rulat în timpul ședinței, prețul ei e deja de azi,
  // iar mișcarea față de el ar arăta doar ce s-a întâmplat de atunci (de exemplu +0,04% în loc de −2,24%).
  const refZi = p => referintaZi(p.ind, azi);
  const ref = Object.fromEntries(snap.pozitii.map(p => [p.symbol, p.ind?.pret ? { ...p, ind: { ...p.ind, pret: refZi(p).pret }, _snapPret: p.ind.pret, _dataRef: refZi(p).data } : p]));
  let fxAcum = null; try { fxAcum = await bnrAzi(); } catch (e) { tacut('cursul BNR de azi (mișcarea în lei rămâne în moneda acțiunii)', e); }
  const fxLa = (d, m) => { if (!d || !snap.fxIst) return null; const k = Object.keys(snap.fxIst).filter(x => x <= d).sort().pop(); return k ? snap.fxIst[k][m] : null; };
  const pret = {};
  for (const p of positions) { const s = canon(p.symbol); if (p.price > 0) pret[s] = p.price; }
  const alt = {}; await verificaAlerte(env, KV, alt, pret, azi);
  const pozitii = [], variAzi = {};
  // prețuri cu mișcări imposibile (erori de date, divizări) nu intră în niciun calcul de mai jos
  const pretBun = Object.fromEntries(Object.entries(pret).filter(([s, pr]) => { const r = ref[s]; return !r?.ind?.pret || Math.abs((pr / r.ind.pret - 1) * 100) <= PAZA.miscareZi; }));
  const plan = snap.planuri?.[snap.profil?.contributieTipica] || [];
  const ocazii = Object.fromEntries(ocaziiPlan(plan, ref, pretBun, snap.operatiuni, azi, OCAZII).map(o => [o.symbol, o]));
  // v0.45: când 2+ acțiuni din același sector se mișcă mult în aceeași direcție, primești o singură notificare pentru sector
  // („scade tot sectorul”), nu câte una pe acțiune: e o mișcare a sectorului, nu a fiecărei companii.
  const inSector = new Set(), grup = {};
  for (const [s, pr] of Object.entries(pret)) { const r = ref[s]; if (!r?.ind?.pret || r.etf) continue;
    const v = (pr / r.ind.pret - 1) * 100, pg = Math.max(MISCARE_ZI.prag, MISCARE_ZI.multATR * (r.ind.atrPct || 0)), t = r.tema || themeOf(s);
    if (Math.abs(v) <= PAZA.miscareZi && Math.abs(v) >= pg && t !== 'Altele') (grup[`${t}|${v > 0 ? 'sus' : 'jos'}`] ||= []).push({ s, v }); }
  for (const [k, L] of Object.entries(grup)) { if (L.length < 2) continue;
    const [t, sens] = k.split('|'); L.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)); L.forEach(x => inSector.add(x.s));
    await notificaOdata(env, KV, `miscare:sector-${t}:${azi}:${sens}`, `Sectorul „${t}” ${sens === 'sus' ? 'urcă' : 'scade'} azi`,
      `${L.map(x => `${x.s} ${x.v > 0 ? '+' : '−'}${fmt(Math.abs(x.v))}%`).join(', ')}. Se mișcă împreună: e o mișcare a sectorului, nu a unei singure companii. ${sens === 'jos' ? 'Nu e nimic de făcut pe o zi; dacă te deranjează cât de tare se mișcă, ai prea mulți bani într-un singur sector.' : 'Informativ, nu e nimic de făcut.'}`, 4, '#azi'); }
  for (const [s, pr] of Object.entries(pret)) {
    const r = ref[s]; if (!r?.ind?.pret) continue;
    const vari = (pr / r.ind.pret - 1) * 100;
    if (Math.abs(vari) > PAZA.miscareZi) { erori.push(`${s}: mișcare de ${fmt(vari)}% față de ieri, ignorată. Probabil o eroare de date sau o divizare.`); pozitii.push({ symbol: s, pret: pr, var: vari, deVerificat: true }); continue; }
    const prag = Math.max(MISCARE_ZI.prag, MISCARE_ZI.multATR * (r.ind.atrPct || 0));
    // 1) oportunitate: are prioritate față de alerta de mișcare (aceeași acțiune, un singur mesaj)
    const op = oportunitateIntraday(r, pr), oc = !op && ocazii[s];
    variAzi[s] = vari;
    const m = r.moneda, c0 = m === 'RON' ? 1 : fxLa(r._dataRef, m), c1 = m === 'RON' ? 1 : fxAcum?.[m];
    const varLei = c0 && c1 ? ((1 + vari / 100) * c1 / c0 - 1) * 100 : null;
    pozitii.push({ symbol: s, pret: pr, var: vari, ...(varLei != null ? { varLei } : {}), fs: r._snapPret ? pr / r._snapPret : 1, prag, ...(op ? { oportunitate: op.text } : {}), ...(oc ? { ocaziePlan: true } : {}) });
    // 2) cumpărare din planul lunii, încă nefăcută, la reducere azi (are prioritate față de alerta de mișcare)
    if (oc) {
      await notificaOdata(env, KV, `ocazie:${s}:${azi}`, `${s} e la reducere pentru planul lunii`,
        `${s} ${fmt(oc.vari)}% azi. În planul lunii: ${oc.suma} ${de(oc.suma)}lei la ${oc.broker}. Dacă n-ai cumpărat încă luna asta, prețul e acum mai bun decât ieri.`, 4, '#plan');
      continue;
    }
    if (op) {
      const l = (snap.planuri?.[snap.profil?.contributieTipica] || []).find(x => x.symbol === s);
      await notificaOdata(env, KV, `opor:${s}:${azi}`, `★ ${s} e mai ieftină azi`,
        `${op.text}${l ? ` E în planul lunii: ${l.suma} ${de(l.suma)}lei la ${l.broker}.` : ' E pe lista ta de cumpărat.'} Dacă n-ai investit încă luna asta, poți cumpăra acum. Citește întâi știrile.`, 4, `#s=${encodeURIComponent(s)}`);
      continue;
    }
    if (Math.abs(vari) >= prag && !inSector.has(s)) {
      const sens = vari > 0 ? 'urcă' : 'scade';
      const ce = r.etf ? 'ETF-ul global nu se vinde pe mișcări de o zi.'
        : vari < 0 ? (r.semnal === 'adauga' ? 'E pe lista ta de cumpărat. Citește știrile înainte să cumperi.' : 'Citește știrile înainte de orice decizie.')
        : (r.pondere > r.tinta ? 'Ponderea ei crește și mai mult peste țintă.' : 'Informativ, nu e nimic de făcut.');
      await notificaOdata(env, KV, `miscare:${s}:${azi}`, `${s} ${sens} ${fmt(Math.abs(vari))}% azi`, ce, 4, `#s=${encodeURIComponent(s)}`);
    }
    if (!r.etf && r.ind.protectie && pr < r.ind.protectie && !r.ind.subProtectie) {
      await notificaOdata(env, KV, `prot:${s}:${azi}`, `${s} sub nivelul de alertă`,
        `Preț ${fmt(pr)}, nivel de alertă ${fmt(r.ind.protectie)}. Nu e un ordin de vânzare. Verifică dacă motivul pentru care o ții mai e valabil.`, 4, `#s=${encodeURIComponent(s)}`);
    }
  }
  // 3) portofoliul întreg se mișcă mult azi
  const mp = miscarePortofoliu(snap.pozitii.filter(p => !p.virtual), variAzi);
  if (mp && Math.abs(mp.pct) >= OCAZII.portofoliuZi) {
    const f = x => `${x.symbol} ${x.vari > 0 ? '+' : '−'}${fmt(Math.abs(x.vari))}%`, lei = String(Math.round(Math.abs(mp.lei))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const det = [mp.sus.length ? 'Sus: ' + mp.sus.map(f).join(', ') + '.' : '', mp.jos.length ? 'Jos: ' + mp.jos.map(f).join(', ') + '.' : ''].filter(Boolean).join(' ');
    await notificaOdata(env, KV, `portofoliu:${azi}:${mp.pct > 0 ? 'sus' : 'jos'}`, `Portofoliul ${mp.pct > 0 ? '+' : '−'}${fmt(Math.abs(mp.pct))}% azi`,
      `Aproximativ ${mp.pct > 0 ? '+' : '−'}${lei} lei față de ieri. ${det} ${mp.pct < 0 ? 'Scăderile de o zi sunt normale. Dacă ai bani pentru planul lunii, prețurile sunt acum mai mici.' : 'Nu e nimic de făcut.'}`.replace(/\s+/g, ' ').trim(), 4, '#azi');
  }
  const out = { mod: 'intraday', generat: new Date().toISOString(), pozitii, erori, ...(mp ? { portofoliu: { pct: mp.pct, lei: mp.lei } } : {}) };
  out.alerteAtinse = alt.alerteAtinse; out.tacute = tacute();
  await KV.put('intraday', JSON.stringify(out));
  return out;
}

// ---------- Verificarea sumelor cu brokerii ----------
// Trading 212: suma pozițiilor citite față de soldul raportat de broker (endpoint separat).
// eToro: câte poziții n-am putut recunoaște (simbol necunoscut).
export function verificaSume(positions, sumar, valoriEtoro = []) {
  const out = {};
  const t = positions.filter(p => p.broker === 'Trading 212');
  if (sumar?.investit != null && t.length) {
    const calc = t.reduce((a, p) => a + p.valueRON, 0), dif = sumar.investit ? (calc / sumar.investit - 1) * 100 : 0;
    out.t212 = { calculat: calc, raportat: sumar.investit, difPct: dif, ok: Math.abs(dif) <= PAZA.dif_broker };
  }
  const e = positions.filter(p => p.broker === 'eToro');
  if (e.length) { const nem = e.filter(p => String(p.symbol).startsWith('ETORO#'));
    // v0.44: totalul calculat (unități × preț) față de totalul raportat de eToro; diferențe mici vin din prețul mai proaspăt
    const v = valoriEtoro.filter(x => x.calc != null), api = v.reduce((a, x) => a + x.api, 0), calc = v.reduce((a, x) => a + (x.aplicat ? x.calc : x.api), 0);
    const dif = api ? (calc / api - 1) * 100 : 0;
    out.etoro = { pozitii: e.length, nerecunoscute: nem.map(p => p.symbol), ...(api ? { calculatUSD: +calc.toFixed(2), raportatUSD: +api.toFixed(2), difPct: +dif.toFixed(2) } : {}),
      ok: !nem.length && Math.abs(dif) <= PAZA.dif_etoro && v.every(x => x.aplicat) }; }
  out.ok = Object.values(out).every(x => x.ok);
  return out;
}

// ---------- Cumpărări și vânzări văzute în cont ----------
// Compară cantitățile de azi cu cele de la analiza precedentă, pe fiecare broker și simbol.
// Costul în lei: la T212 direct; la eToro din dolari × cursul de azi.
export function operatiuniNoi(vechi, nou, fx, azi) {
  if (!vechi?.pozitii) return [];
  const idx = s => { const m = {}; for (const p of s.pozitii) for (const b of p.brokers || []) m[`${b.broker}|${p.symbol}`] = { ...b, symbol: p.symbol, pret: p.ind?.pret, moneda: p.moneda }; return m; };
  const a = idx(vechi), b = idx(nou), out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || { qty: 0, costRON: 0, costUSD: 0 }, y = b[k] || { qty: 0, costRON: 0, costUSD: 0 };
    const dq = (y.qty || 0) - (x.qty || 0); if (Math.abs(dq) < 1e-7) continue;
    const broker = k.split('|')[0], symbol = (y.symbol || x.symbol);
    const dCost = broker === 'eToro' && (y.costUSD != null || x.costUSD != null) ? ((y.costUSD || 0) - (x.costUSD || 0)) * (fx?.USD || 0) : (y.costRON || 0) - (x.costRON || 0);
    if (dq > 0 && dCost > 0.5) out.push({ data: azi, tip: 'cumparare', broker, symbol, lei: dCost, unitati: dq, pret: (y.pret ?? x.pret) ?? null, moneda: y.moneda || x.moneda });
    else if (dq < 0) out.push({ data: azi, tip: 'vanzare', broker, symbol, unitati: -dq, pret: (x.pret ?? y.pret) ?? null, moneda: x.moneda || y.moneda });
    else out.push({ data: azi, tip: 'posibila_divizare', broker, symbol, unitati: dq });
  }
  return out;
}

// ---------- Paza la date ciudate ----------
export function pazaDate(vechi, nou, operatiuni) {
  const simboluri = nou.pozitii.filter(p => p.ind?.r1z != null && Math.abs(p.ind.r1z) > PAZA.miscareZi).map(p => p.symbol);
  for (const o of operatiuni) if (o.tip === 'posibila_divizare' && !simboluri.includes(o.symbol)) simboluri.push(o.symbol);
  let global = false, motiv = '';
  if (vechi?.totalRON) {
    // cumpărările adaugă bani, vânzările scot (valoarea vândută, estimată din unități × preț × curs)
    const curs = m => m === 'RON' ? 1 : (nou.fx?.[m] || 0);
    const depus = operatiuni.reduce((a, o) => o.tip === 'cumparare' ? a + o.lei : o.tip === 'vanzare' && o.pret ? a - o.unitati * o.pret * curs(o.moneda) : a, 0);
    const salt = ((nou.totalRON - depus) / vechi.totalRON - 1) * 100;
    if (Math.abs(salt) > PAZA.totalZi) { global = true; motiv = `Totalul s-a schimbat cu ${fmt(salt)}% față de ieri, fără depuneri care să explice diferența.`; }
  }
  if (!motiv && simboluri.length) motiv = `Mișcare neobișnuită la ${simboluri.join(', ')}: peste ${PAZA.miscareZi}% într-o zi sau cantitate schimbată fără cost.`;
  return { global, simboluri, motiv };
}
