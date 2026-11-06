// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Paza contra tranzacțiilor neautorizate. Analistul NU tranzacționează niciodată; dacă cineva ar strecura cod care încearcă,
// sau dacă în conturi apare ceva ce n-ai făcut tu, aici se vede.
//  1) Gardianul rețelei: în timpul analizei, la brokeri pleacă DOAR citiri (GET). Orice scriere (cumpărare, vânzare, anulare)
//     e blocată înainte să iasă din calculator și devine alarmă critică. Spre adrese necunoscute nu pleacă nimic.
//  2) Ordinele Trading 212 trimise prin API (aplicația ta nu trimite niciunul) devin alarmă critică.
//  3) Cheia eToro cu drept de scriere devine avertizare: o cheie de citire nu poate tranzacționa nici dacă e furată.
//  4) Orice tranzacție nouă (cumpărare, vânzare, poziție deschisă sau închisă) intră în „Activitate”, ca s-o confirmi în aplicație.
import { dataRo } from './engine.js';
const BROKERI = [/(^|\.)trading212\.com$/, /(^|\.)etoro\.com$/];
import { PUSH_GAZDE } from './webpush.js';
// Notificările direct în aplicație pleacă doar spre serviciile de livrare ale telefoanelor (Google, Mozilla, Microsoft, Apple).
// oauth2.googleapis.com: doar pentru tokenul de acces cu care se trimit notificările în aplicația Android (fcm.js).
const PERMISE = [...BROKERI, /(^|\.)etorostatic\.com$/, /(^|\.)finnhub\.io$/, /(^|\.)bnr\.ro$/, /^ec\.europa\.eu$/, ...PUSH_GAZDE, /^oauth2\.googleapis\.com$/];

// Învelește fetch pe durata unei rulări. Întoarce funcția care îl readuce la normal.
export function pazaRetea(alarme, avertizari) {
  const original = globalThis.fetch;
  const pazit = async (url, opt = {}) => {
    let u; try { u = new URL(url && typeof url === 'object' && typeof url.url === 'string' ? url.url : String(url)); } catch { throw new Error('Paza: adresă invalidă'); }
    const gazda = u.hostname.toLowerCase(), metoda = String(opt.method || (typeof url === 'object' && url.method) || 'GET').toUpperCase();
    if (u.protocol !== 'https:') { avertizari.push(`Paza: cerere blocată (nu e https): ${gazda}`); throw new Error('Paza: doar https'); }
    if (!PERMISE.some(r => r.test(gazda))) { avertizari.push(`Paza: cerere blocată spre o adresă necunoscută: ${gazda}`); throw new Error(`Paza: ${gazda} nu e pe lista permisă`); }
    if (BROKERI.some(r => r.test(gazda)) && metoda !== 'GET' && metoda !== 'HEAD') {
      alarme.push({ id: `scriere:${gazda}${u.pathname}:${new Date().toISOString().slice(0, 13)}`, nivel: 'critic', tip: 'scriere-blocata',
        text: `Codul analizei a încercat o operațiune de scriere la ${gazda.includes('etoro') ? 'eToro' : 'Trading 212'} (${metoda} ${u.pathname}). A fost blocată.` });
      throw new Error('Paza: la brokeri sunt permise doar citiri');
    }
    return original(url, opt);
  };
  globalThis.fetch = pazit;
  return () => { if (globalThis.fetch === pazit) globalThis.fetch = original; };
}

// Activitatea nouă din conturi, față de ce s-a văzut la rularea trecută. Prima rulare doar reține ce există (nu e „nou”).
// t212: execuțiile noi ({ id, data, symbol, tip, lei, din }); etoro: toate pozițiile deschise acum ({ id, symbol, data, usd, cumparare }).
export function activitateNoua(stare, t212, etoro, azi) {
  const s = { baza: stare?.baza || null, etoro: stare?.etoro || null, lista: stare?.lista || [] }, noi = [];
  if (!s.baza) s.baza = azi;
  for (const e of t212) if (e.data >= s.baza && !s.lista.some(x => x.id === e.id))
    noi.push({ id: e.id, broker: 'Trading 212', data: e.data, symbol: e.symbol, tip: e.tip, lei: +(+e.lei || 0).toFixed(2), din: e.din || null });
  if (etoro) {
    const acum = new Map(etoro.map(p => [String(p.id), p]));
    if (s.etoro) {
      for (const [id, p] of acum) if (!(id in s.etoro)) noi.push({ id: 'e' + id, broker: 'eToro', data: p.data || azi, symbol: p.symbol || null, tip: p.cumparare === false ? 'vanzare-short' : 'cumparare', usd: +(+p.usd || 0).toFixed(2) });
      for (const id of Object.keys(s.etoro)) if (!acum.has(id)) noi.push({ id: 'x' + id, broker: 'eToro', data: azi, symbol: s.etoro[id] || null, tip: 'inchidere' });
    }
    s.etoro = Object.fromEntries([...acum].map(([id, p]) => [id, p.symbol || null]));
  }
  s.lista = [...s.lista, ...noi].filter(x => x.data >= addZile(azi, -45)).slice(-60);
  return { stare: s, noi };
}
const addZile = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

// Alarmele care decurg din activitate: un ordin trimis prin API e critic (aplicația ta nu trimite ordine).
export function alarmeActivitate(lista) {
  return lista.filter(x => x.broker === 'Trading 212' && /api/i.test(x.din || '')).map(x => ({ id: 'api:' + x.id, nivel: 'critic', tip: 'ordin-api',
    text: `Trading 212: un ordin de ${x.tip === 'vanzare' ? 'vânzare' : 'cumpărare'} ${x.symbol || ''} din ${dataRo(x.data)} a fost trimis prin API. Aplicația ta nu trimite ordine.` }));
}

// Drepturile cheii eToro, din /me: doar lista de drepturi, nimic din profil nu se păstrează.
// Un drept e „de scriere” doar dacă are cuvântul write ca segment separat (ex. etoro-public:trading:real:write).
// Până în 0.36, orice drept care conținea „trade” era luat drept scriere. eToro numește însă și dreptul de citire
// „etoro-public:trade.real:read”, deci o cheie doar de citire apărea cu „drept de scriere”: alarmă falsă.
const SCRIE = /(^|[:._\-\s/])(write|execute)($|[:._\-\s/])/i;
const scopuri = j => j && (Array.isArray(j.scopes) ? j.scopes : Array.isArray(j.profile?.scopes) ? j.profile.scopes : null);
export function scopuriScriere(j) { const sc = scopuri(j); return sc ? sc.map(x => String(x)).filter(x => SCRIE.test(x)).map(x => x.replace(/[^\w:.\-\/]/g, '').slice(0, 60)).slice(0, 10) : null; }
export function scrieEtoro(j) { const l = scopuriScriere(j); return l === null ? null : l.length > 0; }
