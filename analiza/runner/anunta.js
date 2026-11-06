// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Anunțuri scurte pe telefon, din workflow-uri, fără cereri la brokeri:
//   node runner/anunta.js raport  raportul de dimineață e gata (raport.yml, când rapoarte/ultimul.enc ajunge în repo).
//                                 Raportul e criptat pentru telefon: aici nu se citește, doar se anunță. O dată pe zi.
//   node runner/anunta.js esec    analiza completă a zilei a eșuat (analiza.yml).
import fs from 'node:fs';
import path from 'node:path';
import { cheieDate, cripteaza, decripteaza } from './seif.js';
import { notificaOdata } from './notificari.js';
import { pazaRetea } from './paza.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'date');
const citeste = f => { try { return fs.readFileSync(path.join(DIR, f), 'utf8'); } catch { return null; } };
const env = process.env;

const cheie = await cheieDate(env.DATA_KEY);
let cache = {};
const brut = citeste('cache.enc');
if (brut) { try { cache = JSON.parse(await decripteaza(cheie, brut)); } catch { console.log('::error::cache.enc nu se poate decripta cu DATA_KEY actuală. Nu trimit și nu schimb nimic.'); process.exit(1); } }
// jurnalul notificărilor (secțiunea Noutăți) stă separat, în date/notificari.enc
let jurnal = null; const jt = citeste('notificari.enc');
if (jt) { try { jurnal = await decripteaza(cheie, jt); } catch { jurnal = null; } }
let jurnalSchimbat = false;
const store = { async get(k) { return k === 'jurnalNotif' ? jurnal : (cache[k] ?? null); },
  async put(k, v) { if (k === 'jurnalNotif') { jurnal = v; jurnalSchimbat = true; } else cache[k] = v; } };

// câte semnale merită citite azi (fără simboluri: pot apărea pe ecranul blocat dacă notificările sunt discrete)
let snap = null; try { snap = JSON.parse(await decripteaza(cheie, citeste('snapshot.enc') || '')); } catch {}
const n = (snap?.pozitii || []).filter(p => ['verifica', 'reechilibreaza'].includes(p.semnal) || p.oportunitate).length;
const azi = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10); // ziua din România (diferența de o oră vara nu contează dimineața)

const ce = process.argv[2] === 'esec' ? 'esec' : 'raport';
// eșecul se anunță doar pentru analiza completă: o rulare intraday eșuată se reia singură peste 30 de minute
if (ce === 'esec') { let m = env.MOD; try { m = fs.readFileSync(path.join(env.RUNNER_TEMP || '/nu-exista', 'analist-mod'), 'utf8').trim() || m; } catch {}
  if (m === 'intraday' || m === 'sync' || m === 'profil') { console.log('Rulare scurtă eșuată: fără anunț.'); process.exit(0); } }
const alarme = [], avert = [], elibereaza = pazaRetea(alarme, avert);
let ok = false;
try {
  ok = ce === 'raport'
    ? await notificaOdata(env, store, `raport:${azi}`, 'Raportul de dimineață e gata',
      `Știrile despre companiile tale și ce înseamnă pentru semnale.${n ? ` ${n === 1 ? 'Un semnal de citit' : n + ' semnale de citit'}.` : ''} Durează două minute.`, 3, '#raport')
    : await notificaOdata(env, store, `esec:${azi}`, 'Analiza n-a rulat azi', 'Deschide Analist → Setări → Verificarea pornirii pentru detalii.', 4, '#setari');
} finally { elibereaza(); }
fs.writeFileSync(path.join(DIR, 'cache.enc'), await cripteaza(cheie, JSON.stringify(cache)));
if (jurnalSchimbat) fs.writeFileSync(path.join(DIR, 'notificari.enc'), await cripteaza(cheie, jurnal));
console.log(ok ? 'Anunțul a fost trimis.' : 'Anunțul nu a fost trimis (deja trimis azi sau fără canal de notificări).');
