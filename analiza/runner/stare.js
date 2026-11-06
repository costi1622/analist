// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Starea comună a dispozitivelor (telefon, calculatoare), păstrată criptat în date/utilizator.enc.
// Fiecare dispozitiv trimite doar ce s-a schimbat (o „diferență”), criptat cu DATA_KEY, printr-o rulare a analizei.
// Aici diferența se îmbină cu ce există: pentru fiecare câmp câștigă schimbarea cea mai nouă; jurnalul se îmbină notiță cu notiță,
// iar o notiță ștearsă rămâne ștearsă (cu data ștergerii). Rulările nu se suprapun (concurrency: analiza), deci nimic nu se pierde.
// Aceeași funcție rulează și în aplicație, la citire.

export const STARE_CAMPURI = ['planFacut', 'luniFacute', 'citite', 'quiz', 'notifVazut', 'alVazute', 'actConf', 'cod', 'cronExp', 'incepator', 'profil', 'exercitii', 'simulari'];
const MAX_TEXT = 200000, MAX_JURNAL = 1000, MAX_STERSE = 1000;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const okT = t => typeof t === 'string' && ISO.test(t);
const okId = id => (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && /^[\w.:-]{1,40}$/.test(id));

// Doar forma: câmpuri cunoscute, date valide, notițe cu id. Orice altceva se ignoră, fără să strice restul.
export function curataStare(o) {
  const r = { v: 1, t: {}, c: {}, j: [], s: {} };
  if (!o || typeof o !== 'object') return r;
  for (const k of STARE_CAMPURI) if (okT(o.t?.[k]) && o.c && Object.hasOwn(o.c, k)) { r.t[k] = o.t[k]; r.c[k] = o.c[k]; }
  for (const n of Array.isArray(o.j) ? o.j : []) if (n && typeof n === 'object' && okId(n.id) && okT(n.m)) r.j.push(n);
  for (const [id, t] of Object.entries(o.s && typeof o.s === 'object' ? o.s : {})) if (/^[\w.:-]{1,40}$/.test(id) && okT(t)) r.s[id] = t;
  return r;
}

export function imbinaStare(vechi, nou) {
  const a = curataStare(vechi), b = curataStare(nou), r = { v: 1, t: { ...a.t }, c: { ...a.c }, j: [], s: { ...a.s } };
  for (const k of Object.keys(b.t)) if (!r.t[k] || b.t[k] > r.t[k]) { r.t[k] = b.t[k]; r.c[k] = b.c[k]; }
  for (const [id, t] of Object.entries(b.s)) if (!r.s[id] || t > r.s[id]) r.s[id] = t;
  const m = new Map(); for (const n of [...a.j, ...b.j]) { const k = String(n.id), x = m.get(k); if (!x || n.m > x.m) m.set(k, n); }
  r.j = [...m.values()].filter(n => !(r.s[String(n.id)] >= n.m)).sort((x, y) => (y.m > x.m ? 1 : -1)).slice(0, MAX_JURNAL);
  r.s = Object.fromEntries(Object.entries(r.s).sort((x, y) => (y[1] > x[1] ? 1 : -1)).slice(0, MAX_STERSE));
  if (JSON.stringify(r).length > MAX_TEXT) r.j = r.j.slice(0, Math.floor(MAX_JURNAL / 2)); // plasă de siguranță pentru mărime
  return r;
}

// O singură sarcină în cron-job.org: ce face o rulare, după mod, oră și ultima analiză completă.
// Rularea programată de după închiderea bursei US (de la 23:00, ora României) devine analiza completă; una pe zi
// (o rulare programată completă în cel mult 3 ore de la ultima nu se mai repetă). Întoarce 'zi', 'intraday' sau 'nimic'.
export function modulRularii({ mod, programat, ora, ultimaZi, acum = Date.now() }) {
  const recenta = !!ultimaZi && acum - Date.parse(ultimaZi) < 3 * 3600e3;
  if (programat && mod === 'intraday' && ora >= 23 && !recenta) return 'zi';
  if (programat && mod === 'zi' && recenta) return 'nimic';
  return mod;
}
