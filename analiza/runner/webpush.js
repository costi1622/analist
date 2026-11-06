// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Notificări Web Push direct în aplicația de pe telefon, fără servicii terțe care să citească textul.
//
// Conținutul e criptat cap-coadă (RFC 8291, aes128gcm) cu cheile pe care telefonul le-a creat la abonare.
// Serviciul de livrare al telefonului (Google, la Chrome pe Android) vede doar octeți criptați.
// Identitatea expeditorului (VAPID, RFC 8292) e o cheie P-256 derivată din DATA_KEY: fără un secret nou în GitHub.
// Fără dependențe: doar node:crypto.
import crypto from 'node:crypto';

const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
// ordinul curbei P-256: o cheie privată validă e în [1, n-1]
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

// Cheia VAPID: determinată de DATA_KEY (aceeași la fiecare rulare), dar fără să dezvăluie nimic despre ea.
export function vapidChei(dataKey) {
  const ikm = Buffer.from(String(dataKey || '').trim(), 'utf8');
  if (ikm.length < 16) throw new Error('DATA_KEY lipsește: nu pot crea cheia pentru notificări.');
  for (let i = 0; i < 16; i++) {
    const d = Buffer.from(crypto.hkdfSync('sha256', ikm, Buffer.from('analist/notificari'), Buffer.from('vapid-p256:' + i), 32));
    const v = BigInt('0x' + d.toString('hex'));
    if (v === 0n || v >= N) continue;
    const ec = crypto.createECDH('prime256v1'); ec.setPrivateKey(d);
    const pub = ec.getPublicKey(); // 65 de octeți, necomprimat
    const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
    return { public: b64u(pub), key };
  }
  throw new Error('Nu am putut deriva cheia pentru notificări.');
}

// Antetul Authorization pentru un serviciu de livrare: un JWT ES256 valabil 12 ore, pentru originea lui.
export function vapidAntet(vapid, endpoint, contact, acum = Date.now()) {
  const aud = new URL(endpoint).origin;
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const c = b64u(JSON.stringify({ aud, exp: Math.floor(acum / 1000) + 12 * 3600, sub: contact }));
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${c}`), { key: vapid.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${vapid.public}`;
}

// Criptarea mesajului pentru un abonament (RFC 8291). asPrivat și sare se dau doar în teste (vectorul din RFC).
export function cripteazaPush(sub, text, { asPrivat, sare } = {}) {
  const ua = unb64u(sub.p256dh), auth = unb64u(sub.auth);
  if (ua.length !== 65 || ua[0] !== 4) throw new Error('Cheia abonamentului nu are formatul așteptat.');
  if (auth.length !== 16) throw new Error('Secretul abonamentului nu are formatul așteptat.');
  const as = crypto.createECDH('prime256v1');
  if (asPrivat) as.setPrivateKey(unb64u(asPrivat)); else as.generateKeys();
  const asPub = as.getPublicKey(), salt = sare ? unb64u(sare) : crypto.randomBytes(16);
  const ecdh = as.computeSecret(ua);
  const prkKey = hmac(auth, ecdh);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

// Gazdele serviciilor de livrare acceptate: Chrome/Android, Firefox, Edge/Windows, Safari.
export const PUSH_GAZDE = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /^web\.push\.apple\.com$/];
export const abonamentValid = s => {
  try {
    if (!s || typeof s !== 'object') return false;
    const u = new URL(s.endpoint);
    return u.protocol === 'https:' && s.endpoint.length < 1000 && PUSH_GAZDE.some(r => r.test(u.hostname))
      && unb64u(s.p256dh).length === 65 && unb64u(s.auth).length === 16;
  } catch { return false; }
};

// Trimite un mesaj. Întoarce { ok, sters }: sters = abonamentul nu mai există (telefonul l-a anulat), trebuie scos din listă.
export async function trimitePush(sub, mesaj, vapid, { contact = 'https://costi1622.github.io/analist/', urgenta = 'high', ttl = 6 * 3600 } = {}) {
  if (!abonamentValid(sub)) return { ok: false, sters: true };
  const corp = cripteazaPush(sub, JSON.stringify(mesaj));
  const r = await fetch(sub.endpoint, { method: 'POST', body: corp, headers: {
    Authorization: vapidAntet(vapid, sub.endpoint, contact), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
    TTL: String(ttl), Urgency: urgenta } });
  return { ok: r.status >= 200 && r.status < 300, sters: r.status === 404 || r.status === 410, status: r.status };
}
