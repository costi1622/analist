// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Criptarea datelor din repo. Același cod (WebCrypto) rulează în GitHub Actions și pe telefon.
//
// Datele (snapshot, istoric, intraday, realizat, cache): AES-256-GCM cu DATA_KEY.
//   DATA_KEY = 32 de octeți aleatorii, generați de aplicație pe telefon, în base64url (43 de caractere).
//   Stă doar în GitHub Secrets (care nu se pot citi înapoi) și în seiful parolat de pe telefon.
// Raportul de dimineață: hibrid RSA-OAEP-3072 + AES-256-GCM, cu cheia PUBLICĂ a telefonului.
//   Oricine are cheia publică poate cripta, doar telefonul (cheia privată) poate citi.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = u8 => Buffer.from(u8).toString('base64');
export const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));
const unb64url = s => new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

export async function cheieDate(dataKey) {
  const raw = unb64url(String(dataKey || '').trim());
  if (raw.length !== 32) throw new Error('DATA_KEY invalidă: trebuie să aibă 32 de octeți (43 de caractere base64url).');
  return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function cripteaza(cheie, text) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, cheie, enc.encode(text)));
  return JSON.stringify({ v: 1, alg: 'A256GCM', iv: b64(iv), ct: b64(ct) });
}
export async function decripteaza(cheie, s) {
  const o = JSON.parse(s);
  if (o.alg !== 'A256GCM') throw new Error('Format necunoscut.');
  return dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, cheie, unb64(o.ct)));
}

// ---- Raportul: criptare hibridă cu cheia publică a telefonului ----
export const PEM_OK = /^-----BEGIN PUBLIC KEY-----\s*[A-Za-z0-9+/=\s]{300,1200}\s*-----END PUBLIC KEY-----\s*$/;
export async function cripteazaPentruTelefon(pem, text) {
  if (!PEM_OK.test(pem)) throw new Error('Cheia publică nu are formatul așteptat.');
  const der = unb64(pem.replace(/-----[^-]+-----|\s/g, ''));
  const pub = await subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(text)));
  const k = new Uint8Array(await subtle.encrypt({ name: 'RSA-OAEP' }, pub, await subtle.exportKey('raw', aes)));
  return JSON.stringify({ v: 1, alg: 'RSA-OAEP-256+A256GCM', k: b64(k), iv: b64(iv), ct: b64(ct) });
}
