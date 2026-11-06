// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Notificări direct în aplicația Android Analist (Firebase Cloud Messaging), criptate cap-coadă de noi.
//
// Google duce mesajul până la telefon, dar vede doar octeți criptați: textul e criptat cu cheia publică pe care aplicația
// Analist a creat-o pe telefon (P-256). Cheia privată nu iese niciodată de pe telefon (e păstrată criptată de Android Keystore).
// Schema (aceeași în Cutie.java, pe telefon):
//   cheie efemeră P-256 → ECDH cu cheia telefonului → HKDF-SHA256 (sare: 32 de zerouri; info: „analist-fcm-v1” + cheia
//   telefonului + cheia efemeră) → AES-256-GCM, nonce de 12 octeți, etichetă de 16.
// Mesajul trimis: doar date { v, e, n, c } (fără titlu sau text în clar), cu prioritate mare, valabil 12 ore.
// Contul de serviciu Firebase (secretul FCM_CONT) poate doar să trimită mesaje către aplicație; nu vede nimic din conturile tale.
// Fără dependențe: doar node:crypto.
import crypto from 'node:crypto';

const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');
export const INFO = 'analist-fcm-v1';

// Ce vine din aplicație: tokenul Firebase al telefonului și cheia lui publică. Orice altceva e respins.
export const tokenValid = t => typeof t === 'string' && t.length >= 100 && t.length <= 4096 && /^[A-Za-z0-9:_\-]+$/.test(t);
export const cheieValida = k => { try { const b = unb64u(k); if (typeof k !== 'string' || b.length !== 65 || b[0] !== 4) return false;
  const ec = crypto.createECDH('prime256v1'); ec.generateKeys(); ec.computeSecret(b); return true; } catch { return false; } };
export const telefonValid = x => !!x && tokenValid(x.t) && cheieValida(x.k);

export function cripteaza(cheiePub, obiect) {
  const tel = unb64u(cheiePub), ec = crypto.createECDH('prime256v1'); ec.generateKeys();
  const efem = ec.getPublicKey(), comun = ec.computeSecret(tel);
  const k = Buffer.from(crypto.hkdfSync('sha256', comun, Buffer.alloc(32), Buffer.concat([Buffer.from(INFO), tel, efem]), 32));
  const n = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, n);
  const ct = Buffer.concat([c.update(JSON.stringify(obiect), 'utf8'), c.final(), c.getAuthTag()]);
  return { v: '1', e: b64u(efem), n: b64u(n), c: b64u(ct) };
}
// doar pentru teste: ce face telefonul
export function decripteaza(privata, cheiePub, m) {
  const ec = crypto.createECDH('prime256v1'); ec.setPrivateKey(privata);
  const efem = unb64u(m.e), comun = ec.computeSecret(efem);
  const k = Buffer.from(crypto.hkdfSync('sha256', comun, Buffer.alloc(32), Buffer.concat([Buffer.from(INFO), unb64u(cheiePub), efem]), 32));
  const ct = unb64u(m.c), d = crypto.createDecipheriv('aes-256-gcm', k, unb64u(m.n)); d.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'));
}

// Contul de serviciu (JSON-ul descărcat din Firebase) → token de acces OAuth (1 oră), cerut o singură dată pe rulare.
export function contFirebase(json) {
  let c; try { c = JSON.parse(String(json || '')); } catch { return null; }
  if (!c || c.type !== 'service_account' || !/^[a-z0-9-]{4,40}$/.test(c.project_id || '') || !/@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(c.client_email || '')
    || !String(c.private_key || '').includes('PRIVATE KEY')) return null;
  return { proiect: c.project_id, email: c.client_email, cheie: c.private_key };
}
let ACCES = null;
async function tokenAcces(cont, fetchF) {
  if (ACCES && ACCES.cont === cont.email && ACCES.exp > Date.now() + 60e3) return ACCES.t;
  const acum = Math.floor(Date.now() / 1000), h = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: cont.email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: acum, exp: acum + 3600 }));
  const sem = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), cont.cheie);
  const r = await fetchF('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${h}.${p}.${b64u(sem)}` }) });
  if (!r.ok) throw new Error(`Firebase: autentificarea a eșuat (${r.status}). Verifică secretul FCM_CONT.`);
  const j = await r.json(); ACCES = { cont: cont.email, t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return ACCES.t;
}

// Trimite un mesaj criptat. Întoarce { ok, sters } (sters = tokenul nu mai e valabil: aplicația a fost dezinstalată sau tokenul s-a schimbat).
export async function trimiteFcm(cont, tel, mesaj, { urgent = true, ttl = 12 * 3600, fetchF = fetch } = {}) {
  const acces = await tokenAcces(cont, fetchF);
  const body = { message: { token: tel.t, data: cripteaza(tel.k, mesaj), android: { priority: urgent ? 'HIGH' : 'NORMAL', ttl: `${ttl}s` } } };
  const r = await fetchF(`https://fcm.googleapis.com/v1/projects/${cont.proiect}/messages:send`, { method: 'POST',
    headers: { authorization: `Bearer ${acces}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (r.ok) return { ok: true, sters: false };
  let cod = ''; try { cod = JSON.stringify(await r.json()); } catch {}
  return { ok: false, sters: r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*token/i.test(cod), status: r.status };
}
