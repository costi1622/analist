// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Punctul de intrare pentru GitHub Actions: `node runner/ruleaza.js`.
// Stocarea e chiar repo-ul, CRIPTAT: date/*.enc (AES-256-GCM cu DATA_KEY).
// În clar rămân doar:
//   date/stare.json          starea conexiunilor (fără sume), pentru ecranul de pornire
//   date/raport-intrare.json ponderi și semnale (fără sume, cantități sau conturi), pentru raportul de dimineață
//   date/cheie-publica.pem   cheia publică a telefonului (publică prin natura ei)
// Criptat, în plus: date/utilizator.enc = starea comună a dispozitivelor (jurnal, plan bifat, lecții, decizii), vezi stare.js.
import fs from 'node:fs';
import path from 'node:path';
import { ruleaza, pushInfo } from './analiza.js';
import { aplicaPush, trimite } from './notificari.js';
import { pazaRetea } from './paza.js';
import { cheieDate, cripteaza, decripteaza, PEM_OK } from './seif.js';
import { imbinaStare, modulRularii } from './stare.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'date');
fs.mkdirSync(DIR, { recursive: true });
const scrie = (f, t) => fs.writeFileSync(path.join(DIR, f), t);
const citeste = f => { try { return fs.readFileSync(path.join(DIR, f), 'utf8'); } catch { return null; } };
const env = process.env;
// Modul vine din butoanele aplicației: acceptăm doar valorile cunoscute; orice altceva devine analiza obișnuită.
if (!['zi', 'test', 'intraday', 'profil', 'pushtest', 'sync'].includes(env.MOD)) env.MOD = 'zi';
// Profilul trimis de aplicație: limită de mărime, ca să nu poată umple memoria.
if (env.PROFIL_NOU && env.PROFIL_NOU.length > 20000) { console.log('::warning::Profil prea mare; ignorat.'); env.PROFIL_NOU = ''; }
if (env.STARE_NOUA && env.STARE_NOUA.length > 65000) { console.log('::warning::Starea trimisă e prea mare; ignorată.'); env.STARE_NOUA = ''; }

let cheie;
try { cheie = await cheieDate(env.DATA_KEY); }
catch (e) {
  scrie('stare.json', JSON.stringify({ generat: new Date().toISOString(), erori: [e.message], conexiuni: { seif: { stare: 'lipsa', mesaj: 'Adaugă secretul DATA_KEY: cheia de date generată în aplicație.' } } }, null, 1));
  console.log(`::error::${e.message}`); process.exit(1);
}

// Cheia publică a telefonului (pentru raport), trimisă de aplicație la „Conectează și testează”. Din 0.38 vine criptată cu DATA_KEY:
// cine are doar un token GitHub (de exemplu cel din cron-job.org) nu poate înlocui cheia ca să primească el rapoartele.
if (env.CHEIE_PUBLICA) {
  let pem = null; try { pem = await decripteaza(cheie, env.CHEIE_PUBLICA); } catch {}
  if (pem && PEM_OK.test(pem)) scrie('cheie-publica.pem', pem.trim() + '\n');
  else console.log('::warning::Cheia publică primită nu e criptată cu cheia de date sau nu are formatul așteptat; ignorată.');
}

const FIS = { snapshot: 'snapshot.enc', istoric: 'istoric.enc', intraday: 'intraday.enc', realizat: 'realizat.enc', jurnalNotif: 'notificari.enc' }; // restul -> cache.enc
const dec = async f => { const t = citeste(f); return t ? decripteaza(cheie, t) : null; };
let cache = {};
try { cache = JSON.parse(await dec('cache.enc') || '{}'); }
catch { console.log('::error::Datele existente nu se pot decripta cu DATA_KEY actuală. A fost schimbată cheia?'); process.exit(1); }
const store = {
  async get(k) { return FIS[k] ? dec(FIS[k]) : (cache[k] ?? null); },
  async put(k, v) { if (FIS[k]) scrie(FIS[k], await cripteaza(cheie, v)); else cache[k] = v; },
};

// Profilul trimis din aplicație (orizont + suma lunară, alertele) și abonamentul la notificări, criptate cu DATA_KEY.
// Cele două părți se verifică separat: un profil lipsă sau greșit nu oprește abonamentul, și invers.
if (env.PROFIL_NOU) {
  let p = null;
  try { p = JSON.parse(await decripteaza(cheie, env.PROFIL_NOU)); } catch (e) { console.log('::warning::Profilul primit din aplicație nu se poate citi.'); }
  if (p && p.push !== undefined) {
    cache.push = JSON.stringify(aplicaPush(cache.push, p.push, new Date().toISOString().slice(0, 10)));
    console.log('Notificări: preferințe actualizate din aplicație.');
  }
  if (p && p.anTinta !== undefined) try {
    const an = new Date().getUTCFullYear();
    if (!(Number.isInteger(p.anTinta) && p.anTinta > an && p.anTinta <= an + 50 && Number.isFinite(p.suma) && p.suma >= 10 && p.suma <= 100000)) throw new Error('valori în afara limitelor');
    const alerte = (Array.isArray(p.alerte) ? p.alerte : []).filter(a => a && /^[A-Z0-9.]{1,12}$/.test(a.s) && ['sub', 'peste'].includes(a.d) && Number.isFinite(a.p) && a.p > 0 && a.p < 1e7).slice(0, 30)
      .map(a => ({ s: a.s, d: a.d, p: +a.p }));
    const { ETF_CATALOG, ACTIUNI_CATALOG } = await import('./config.js');
    const tintaETF = Number.isInteger(p.tintaETF) && p.tintaETF >= 0 && p.tintaETF <= 100 ? p.tintaETF : null;
    const alese = (Array.isArray(p.alese) ? p.alese : []).filter(k => ETF_CATALOG[k] || ACTIUNI_CATALOG[k]).slice(0, 10);
    cache.profil = JSON.stringify({ anTinta: p.anTinta, suma: Math.round(p.suma), alerte, ...(tintaETF != null ? { tintaETF } : {}), alese });
    console.log('Profil actualizat din aplicație.');
  } catch (e) { console.log(`::warning::Profilul primit din aplicație a fost ignorat: ${e.message}`); }
}

// Starea comună a dispozitivelor: diferența trimisă de un dispozitiv se îmbină cu ce există (câștigă schimbarea cea mai nouă).
if (env.STARE_NOUA) {
  let d = null; try { d = JSON.parse(await decripteaza(cheie, env.STARE_NOUA)); } catch { console.log('::warning::Starea trimisă nu se poate citi cu cheia de date; ignorată.'); }
  if (d) { let v = null; try { v = JSON.parse(await dec('utilizator.enc') || 'null'); } catch {}
    scrie('utilizator.enc', await cripteaza(cheie, JSON.stringify(imbinaStare(v, d)))); console.log('Starea comună a dispozitivelor a fost actualizată.'); }
}
if (env.MOD === 'sync') { if (env.PROFIL_NOU) scrie('cache.enc', await cripteaza(cheie, JSON.stringify(cache))); console.log('Sincronizare salvată.'); process.exit(0); }

// O singură sarcină în cron-job.org (la fiecare 30 de minute, 9:15–23:45): prima rulare programată de după închiderea bursei US
// (23:00, ora României) devine analiza completă a zilei. Una pe zi: dacă a mai fost una în ultimele 3 ore, o rulare programată
// completă (de exemplu cea de rezervă din GitHub, 21:30 UTC) nu se mai repetă.
const PROGRAMAT = env.PROGRAMAT === '1' || env.GITHUB_EVENT_NAME === 'schedule';
const oraRo = (() => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); return +p.hour; })();
const modReal = modulRularii({ mod: env.MOD, programat: PROGRAMAT, ora: oraRo, ultimaZi: cache.ultimaZi });
if (modReal === 'nimic') { console.log('Analiza completă a zilei a rulat deja. Nimic de făcut.'); process.exit(0); }
if (modReal !== env.MOD) { env.MOD = modReal; env.SCANARE = '1'; console.log('Rularea de după închidere: analiza completă a zilei.'); }
// pentru pasul „Anunță dacă analiza a eșuat”: doar analiza completă anunță (o rulare intraday se reia singură peste 30 de minute)
try { if (env.RUNNER_TEMP) fs.writeFileSync(path.join(env.RUNNER_TEMP, 'analist-mod'), env.MOD); } catch {}

// Starea fișierului stare.json, păstrând ce era (o rulare scurtă nu șterge conexiunile).
const stareVeche = () => { try { return JSON.parse(citeste('stare.json') || '{}'); } catch { return {}; } };
// La activarea, testul sau oprirea notificărilor din aplicație, conexiunea „push” din stare.json se actualizează imediat
// (înainte rămânea „Nu sunt activate” până la analiza de seară).
const stareCuPush = async (extra = {}) => { const v = stareVeche(), info = await pushInfo(env, store);
  const push = info.abonati ? { stare: 'ok', mesaj: `Active pe ${info.abonati === 1 ? 'un telefon' : info.abonati + ' telefoane'}${info.discret ? ', discrete' : ''}.` }
    : { stare: 'lipsa', mesaj: 'Nu sunt activate. Setări → Notificări → Activează pe acest telefon.' };
  return JSON.stringify({ ...v, conexiuni: { ...(v.conexiuni || {}), push }, push: { ...info, ...extra } }, null, 1); };

// Testul notificărilor, pornit din aplicație: salvează abonamentul, trimite un mesaj și se oprește. Fără cereri la brokeri.
if (env.MOD === 'pushtest') {
  const elibereaza = pazaRetea([], []); // și aici pleacă cereri doar spre serviciile permise
  let ok = false;
  try { ok = await trimite(env, store, `test:${Date.now()}`, 'Analist e conectat', 'Notificările merg. Te anunț când văd o ocazie, o mișcare mare sau un semnal nou.', 4, '#azi'); }
  finally { elibereaza(); }
  scrie('cache.enc', await cripteaza(cheie, JSON.stringify(cache)));
  scrie('stare.json', await stareCuPush({ test: { cand: new Date().toISOString(), ok } }));
  console.log(ok ? 'Notificarea de test a fost trimisă.' : '::warning::Notificarea de test nu a putut fi trimisă.');
  process.exit(0);
}

// Doar salvarea profilului (de exemplu o alertă nouă): fără analiză, fără cereri la brokeri.
if (env.MOD === 'profil') { scrie('cache.enc', await cripteaza(cheie, JSON.stringify(cache))); scrie('stare.json', await stareCuPush()); console.log('Profil salvat.'); process.exit(0); }

const snap = await ruleaza(env, store);
// doar o analiză completă de după închidere contează ca „analiza zilei” (una pornită de mână la prânz nu înlocuiește rularea de seară)
if (snap.mod !== 'intraday' && env.MOD === 'zi' && (PROGRAMAT || oraRo >= 23 || oraRo < 6) && snap.pozitii?.length && !snap.pastrat) cache.ultimaZi = new Date().toISOString();
scrie('cache.enc', await cripteaza(cheie, JSON.stringify(cache)));

// Fără sume: doar ce trebuie pentru diagnostic și pentru raport.
if (snap.mod !== 'intraday') {
  scrie('stare.json', JSON.stringify({ generat: new Date().toISOString(), versiune: snap.versiune, conexiuni: snap.conexiuni || {}, erori: snap.erori || [], push: snap.push || await pushInfo(env, store) }, null, 1));
  if (snap.pozitii?.length) scrie('raport-intrare.json', JSON.stringify(intrareRaport(snap), null, 1));
}
export function intrareRaport(s) {
  return {
    generat: s.generat, azi: s.azi, teme: s.teme, valute: s.valute, avertizari: s.avertizari, schimbari: s.schimbari || [],
    paza: s.paza ? { global: s.paza.global, simboluri: s.paza.simboluri } : null,
    planLunii: (() => { const k = s.profil?.contributieTipica, pl = s.planuri?.[k] || []; return pl.map(l => ({ symbol: l.symbol, ponderePct: +(l.suma / k * 100).toFixed(1) })); })(),
    orizontAni: s.profil?.orizontAni ?? null,
    pozitii: s.pozitii.map(p => ({ symbol: p.symbol, nume: p.name, tema: p.tema, etf: !!p.etf, pondere: +p.pondere.toFixed(1), tinta: +(p.tinta ?? 0).toFixed(1),
      semnal: p.eticheta, motive: p.motive, atentie: p.atentie, oportunitate: p.oportunitate, rezultate: p.rezultate,
      ind: p.ind ? { r1z: p.ind.r1z, r1l: p.ind.r1l, r3l: p.ind.r3l, rsi: p.ind.rsi, pesteMedia200: p.ind.sma200 ? p.ind.pret > p.ind.sma200 : null } : null })),
  };
}

// Jurnalul rulării, fără sume (jurnalele Actions sunt păstrate de GitHub).
if (snap.mod === 'intraday') console.log(`Intraday: ${snap.pozitii.length} prețuri verificate`);
else {
  console.log(`Analist ${snap.versiune}: ${snap.pozitii.length} poziții`);
  for (const [k, c] of Object.entries(snap.conexiuni || {})) console.log(`  [${c.stare}] ${k}`);
}
for (const e of snap.erori) console.log(`::warning::${e.replace(/[\d.,]+\s*(lei|USD|EUR|\$)/g, '… $1')}`);
if (snap.pastrat || (snap.mod !== 'intraday' && !snap.pozitii.length)) { console.log('::error::Nicio poziție citită. Detalii în aplicație, la Setări.'); process.exitCode = 1; }
