// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Notificările analistului: Web Push direct în aplicația de pe telefon, criptat cap-coadă, cu detalii (simbol, procent).
// Orice eveniment intră și în jurnalul din Noutăți, chiar dacă telefonul nu e abonat sau notificarea nu ajunge.
// O notificare e marcată „trimisă” doar dacă a ajuns; altfel se reîncearcă la rularea următoare.
import { vapidChei, trimitePush, abonamentValid } from './webpush.js';
import crypto from 'node:crypto';
import { tacut } from './tacute.js';
import { telefonValid, contFirebase, trimiteFcm } from './fcm.js';

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

// Tipul fiecărei notificări (după prefixul cheii), pentru filtrele din aplicație. Securitatea și testul nu se pot opri.
export const TIP = { opor: 'ocazii', ocazie: 'ocazii', alerta: 'alerte', miscare: 'miscari', portofoliu: 'miscari', prot: 'miscari',
  sch: 'semnale', plan: 'plan', rez: 'rezultate', rezumat: 'rezumat', raport: 'raport', esec: 'sistem', paza: 'sistem', alarma: 'securitate', activ: 'securitate', test: 'sistem', bunsimt: 'sistem' };
export const TIPURI = ['ocazii', 'alerte', 'miscari', 'semnale', 'plan', 'rezultate', 'rezumat', 'raport'];
const MEREU = ['securitate', 'sistem'];

// În modul discret, textul spune doar tipul evenimentului. Simbolul și sumele rămân în aplicație.
const DISCRET = {
  sch: ['Analist: semnal nou', '#azi'], plan: ['Analist: planul lunii e gata', '#plan'], rez: ['Analist: rezultate trimestriale în curând', '#azi'],
  opor: ['Analist: oportunitate azi', '#azi'], ocazie: ['Analist: moment bun pentru planul lunii', '#plan'], miscare: ['Analist: mișcare mare azi', '#azi'],
  portofoliu: ['Analist: portofoliul se mișcă mult azi', '#azi'], prot: ['Analist: o acțiune a coborât sub nivelul de alertă', '#azi'],
  rezumat: ['Analist: rezumatul zilei', '#azi'], raport: ['Analist: raportul de dimineață e gata', '#raport'],
  esec: ['Analist: analiza n-a rulat azi', '#setari'], paza: ['Analist: date de verificat', '#azi'], alerta: ['Analist: o alertă de preț s-a atins', '#azi'],
  alarma: ['Analist: ALARMĂ de securitate', '#securitate'], activ: ['Analist: tranzacție nouă în cont. Ai făcut-o tu?', '#securitate'],
};
export function textNotificare(cheie, titlu, text, ancora, discret = false) {
  if (!discret) return { titlu, text, ancora };
  const [t, a] = DISCRET[cheie.split(':')[0]] || ['Analist: noutăți', '#azi'];
  return { titlu: t, text: 'Deschide aplicația pentru detalii.', ancora: a };
}

// Abonamentele și preferințele trimise din aplicație (păstrate criptat, în cache.enc).
// tel: telefoanele cu aplicația Android Analist (token Firebase + cheia publică a telefonului), pentru notificările directe.
export function configPush(s) {
  const c = J(s, null) || {};
  return { subs: (Array.isArray(c.subs) ? c.subs : []).filter(abonamentValid), tel: (Array.isArray(c.tel) ? c.tel : []).filter(telefonValid),
    discret: c.discret === true, tipuri: c.tipuri && typeof c.tipuri === 'object' ? c.tipuri : {} };
}
// Ce vine din aplicație: abonamentul acestui telefon (sau scoaterea lui) și preferințele. Orice câmp ciudat e ignorat.
export function aplicaPush(vechi, p, azi) {
  const c = configPush(vechi);
  if (!p || typeof p !== 'object') return c;
  let subs = c.subs, tel = c.tel;
  if (typeof p.scoate === 'string') subs = subs.filter(s => s.endpoint !== p.scoate);
  if (typeof p.scoateTel === 'string') tel = tel.filter(x => x.k !== p.scoateTel);
  if (p.tel && typeof p.tel === 'object') { const x = { t: String(p.tel.t || ''), k: String(p.tel.k || '') };
    if (telefonValid(x)) tel = [x, ...tel.filter(y => y.k !== x.k && y.t !== x.t)]; }
  if (p.sub && typeof p.sub === 'object') {
    const s = { endpoint: String(p.sub.endpoint || ''), p256dh: String(p.sub.p256dh || ''), auth: String(p.sub.auth || '') };
    if (abonamentValid(s)) subs = [s, ...subs.filter(x => x.endpoint !== s.endpoint)];
  }
  const tipuri = {}; if (p.tipuri && typeof p.tipuri === 'object') for (const k of TIPURI) if (typeof p.tipuri[k] === 'boolean') tipuri[k] = p.tipuri[k];
  return { subs: subs.slice(0, 5), tel: tel.slice(0, 3), discret: typeof p.discret === 'boolean' ? p.discret : c.discret, tipuri: Object.keys(tipuri).length ? tipuri : c.tipuri, actualizat: azi };
}

// Id-ul scurt al unei notificări (în linkul ei și în jurnal): nu dezvăluie simbolul, nici cu notificările discrete.
export const idNotif = cheie => crypto.createHash('sha256').update(String(cheie)).digest('base64url').slice(0, 12);

// Jurnalul notificărilor, pentru secțiunea Noutăți din aplicație: textul complet (nu cel discret), criptat în date/notificari.enc.
// Fiecare eveniment apare o singură dată, chiar dacă trimiterea pe telefon se reîncearcă. Păstrăm 150 de intrări, cel mult 60 de zile.
export async function noteaza(KV, cheie, titlu, text, ancora, { trimisa = null } = {}) {
  const id = idNotif(cheie), l = J(await KV.get('jurnalNotif'), []), e = l.find(x => x.id === id);
  if (e) { if (trimisa != null && !e.trimisa) { e.trimisa = trimisa; await KV.put('jurnalNotif', JSON.stringify(l)); } return id; }
  // trimisa: 'push' | 'oprit' (tip oprit din aplicație) | lipsă (încă netrimisă)
  const lim = new Date(Date.now() - 60 * 864e5).toISOString();
  l.push({ id, cand: new Date().toISOString(), tip: TIP[cheie.split(':')[0]] || 'sistem', pre: cheie.split(':')[0], titlu, text, ancora: ancora || '#azi', ...(trimisa != null ? { trimisa } : {}) });
  await KV.put('jurnalNotif', JSON.stringify(l.filter(x => x.cand >= lim).slice(-150)));
  return id;
}

// Trimite pe telefoanele abonate. Întoarce true dacă a ajuns (sau dacă tipul e oprit din aplicație: nu mai insistăm).
// rezultat (opțional): primește 'push' sau 'oprit' (tipul e oprit din aplicație).
export async function trimite(env, KV, cheie, titlu0, text0, prioritate = 3, ancora0 = '', { silentios = false, rezultat = {} } = {}) {
  const pre = cheie.split(':')[0], tip = TIP[pre] || 'sistem';
  const cfg = configPush(await KV.get('push'));
  if ((cfg.subs.length || cfg.tel.length) && env.DATA_KEY) {
    if (!MEREU.includes(tip) && cfg.tipuri[tip] === false) { rezultat.canal = 'oprit'; return true; }
    const { titlu, text, ancora } = textNotificare(cheie, titlu0, text0, ancora0, cfg.discret);
    // 1) direct în aplicația Android (Firebase, criptat de noi). Dacă a ajuns, nu mai trimitem și prin Chrome (ar veni de două ori).
    const cont = cfg.tel.length ? contFirebase(env.FCM_CONT) : null;
    if (cont) {
      const id = idNotif(cheie), m = { id, titlu, text, a: pre === 'test' ? ancora : `#n=${id}`, tag: cfg.discret ? pre : cheie.split(':').slice(0, 2).join(':'), s: !!silentios };
      let ok = false; const ramase = [];
      for (const t of cfg.tel) { const r = await trimiteFcm(cont, t, m, { urgent: !silentios }).catch(e => { console.log('::warning::' + e.message); tacut('notificare prin aplicație (Firebase)', e); return { ok: false, sters: false }; });
        if (r.ok) ok = true; if (!r.sters) ramase.push(t); }
      if (ramase.length !== cfg.tel.length) { const brut = J(await KV.get('push'), {}); brut.tel = ramase; await KV.put('push', JSON.stringify(brut)); }
      if (ok) { rezultat.canal = 'aplicatie'; return true; }
    }
    if (!cfg.subs.length) return false;
    let vapid; try { vapid = vapidChei(env.DATA_KEY); } catch (e) { vapid = null; tacut('cheia notificărilor (VAPID)', e); }
    if (vapid) {
      // linkul deschide notificarea în secțiunea Noutăți (#n=id); de acolo, un buton duce la acțiune, plan sau raport
      const id = idNotif(cheie), url = (env.APP_URL || '') + (pre === 'test' ? ancora : `#n=${id}`);
      const mesaj = { id, titlu, text, url, tag: cfg.discret ? pre : cheie.split(':').slice(0, 2).join(':'), silentios: !!silentios, urgent: prioritate >= 5 };
      let ok = false; const ramase = [];
      for (const s of cfg.subs) {
        const r = await trimitePush(s, mesaj, vapid, { urgenta: silentios ? 'normal' : 'high', ttl: 12 * 3600, contact: env.APP_URL || undefined }).catch(e => { tacut('notificare prin Chrome (Web Push)', e); return { ok: false, sters: false }; });
        if (r.ok) ok = true; if (!r.sters) ramase.push(s);
      }
      if (ramase.length !== cfg.subs.length) { const brut = J(await KV.get('push'), {}); brut.subs = ramase; await KV.put('push', JSON.stringify(brut)); }
      if (ok) rezultat.canal = 'push';
      return ok;
    }
  }
  return false;
}

// O singură dată pe cheie (ex. „rez:TTWO:2026-11-05”). Cheile trimise se păstrează 90 de zile.
export async function notificaOdata(env, KV, cheie, titlu, text, prioritate, ancora = '', opt = {}) {
  if (J(await KV.get('notificari'), {})[cheie]) return false;
  await noteaza(KV, cheie, titlu, text, ancora);
  const rezultat = {}, ok = await trimite(env, KV, cheie, titlu, text, prioritate, ancora, { ...opt, rezultat });
  if (!ok) return false;
  await noteaza(KV, cheie, titlu, text, ancora, { trimisa: rezultat.canal || true });
  const trimise = J(await KV.get('notificari'), {});
  trimise[cheie] = new Date().toISOString().slice(0, 10);
  const lim = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  for (const k of Object.keys(trimise)) if (trimise[k] < lim) delete trimise[k];
  await KV.put('notificari', JSON.stringify(trimise));
  return true;
}
