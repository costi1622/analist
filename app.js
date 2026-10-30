// Analist: logica aplicației. Separată de index.html ca politica de securitate (CSP) să interzică orice cod inline.
const APP_VER = '0.20.0';
const KEY = 'analist_v1'; // localStorage e comun cu Nivelo pe același domeniu: chei separate
const ETI = {adauga:'Adaugă',pastreaza:'Păstrează',nu_adauga:'Nu mai adăuga',asteapta:'Așteaptă',verifica:'Verifică acțiunea',reechilibreaza:'Reechilibrează'};
const ORD = {uita:0,cumpara:1,las:2};
// Ce vezi pe ecran: 3 stări. Motorul rămâne cu cele 6 semnale; explicația exactă e în fișa acțiunii.
const SEM = {cumpara:'Cumpără luna asta', las:'Las-o', uita:'Uită-te la ea'};
const SEMC = {cumpara:'--adauga', las:'--pastreaza', uita:'--verifica'};
const sumaPlan = () => P().contributieTipica;
const inPlan = sym => (SNAP?.planuri?.[sumaPlan()]||[]).find(l=>l.symbol===sym);
const sem = p => ['verifica','reechilibreaza'].includes(p.semnal) ? 'uita' : inPlan(p.symbol) ? 'cumpara' : 'las';
// Verdictul într-o propoziție, pentru fișa acțiunii.
function verdict(p){
  if (p.deVerificat) return `Date de verificat: ${SNAP.paza?.motiv||'mișcare neobișnuită'} Semnalele pentru ea au fost oprite azi.`;
  const l = inPlan(p.symbol);
  if (sem(p)==='uita') return p.atentie[0] || 'Verifică dacă motivul pentru care o ții mai e valabil.';
  const oz = intraValid() ? INTRA.pozitii.find(x=>x.symbol===p.symbol)?.oportunitate : null;
  if (oz) return `★ Azi: ${oz}${l?` E în planul lunii: ${l.suma} ${de(l.suma)}lei la ${l.broker}.`:''}`;
  if (l) return `E în planul lunii: ${l.suma} ${de(l.suma)}lei la ${l.broker}.${p.oportunitate?' Prețul e mai mic decât de obicei.':''}`;
  return ({ adauga:'Ar merita bani noi, dar luna asta au prioritate pozițiile mai departe de țintă.',
    pastreaza:'Totul e în regulă. Păstrezi ce ai, nu e nimic de făcut.',
    nu_adauga:p.atentie[0] || 'Are deja destul loc în portofoliu. Banii noi merg în altă parte.',
    asteapta:p.atentie[0] || 'Momentul nu e bun pentru cumpărat. Revino peste câteva săptămâni.' })[p.semnal] || '';
}
const ACT = {cumparat:'Am cumpărat',vandut:'Am vândut',ignorat:'Am ignorat semnalul',altceva:'Notă'};
const TABS = ['azi','plan','analiza','invata'];
let LOADED=false;
let S = {repo:'costi1622/analist-date',suma:null,tema:'auto',cont:'toate',planFacut:'',luniFacute:[],sort:'semnal',privat:false,stiut:false,pasi:{}}, SNAP=null, RAP=null, INTRA=null, IST=null, VIEW='azi', J=[], OFFLINE=false;
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY)||'{}')); } catch(e){}
// Moștenire din versiunile fără parolă: nimic sensibil nu rămâne în clar.
if (S.token || S.topic) { delete S.token; delete S.topic; localStorage.setItem(KEY, JSON.stringify(S)); }
['_jurnal','_cache'].forEach(k=>localStorage.removeItem(KEY+k));
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }; // setări fără secrete (temă, sortare, suma)
const saveJ = () => { if(!V){ toast('Aplicația e blocată.'); return false; } V.jurnal=J; salveazaSeif(); return true; };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Acțiuni fără cod inline (CSP fără 'unsafe-inline'): elementele poartă data-c / data-in / data-ch / data-kd / data-tg / data-er
// cu un tablou JSON [numeFuncție, ...argumente]. Rulează DOAR funcțiile din lista albă CMD; argumentele sunt date, nu cod.
const A = (fn, ...a) => esc(JSON.stringify([fn, ...a]));
const nf = (x, d=2) => x==null||isNaN(x) ? '–' : x.toLocaleString('ro-RO',{minimumFractionDigits:d,maximumFractionDigits:d});
const de = n => { const a=Math.floor(Math.abs(n)), k=a%100; return a>=20&&(k===0||k>=20)?'de ':''; };
const lei = (x,d=2) => (S.privat?'•••':nf(x,d))+' lei';
const sgL = (x,d=2) => S.privat ? '•••' : sg(x,d); // sume cu semn (lei)
const vib = () => { try { navigator.vibrate?.(8); } catch(e){} };
const sg = (x,d=2) => x==null||isNaN(x) ? '–' : (x>0?'+':x<0?'−':'')+nf(Math.abs(x),d);
const cls = x => x>0?'pos':x<0?'neg':'';
const chip = s => `<button class="chip" style="color:var(${SEMC[s]})" data-c="${A('termen',s)}">${SEM[s]}</button>`;
const toast = m => { const t=$('toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),3000); };
// ===== Seiful de pe telefon =====
// Tokenul, cheia de date, cheia privată a raportului, numele ntfy și jurnalul stau criptate cu parola ta
// (PBKDF2-SHA256, 600.000 de iterații → AES-256-GCM). Fără parolă, nimic nu se poate citi:
// nici de cineva cu telefonul în mână, nici de alte pagini de pe același domeniu (Nivelo etc.).
let V = null, VK = null, DK = null, PRIV = null, STARE = null; // seiful deschis, cheia lui, cheia de date, cheia privată
const ITER = 600000, SEIF = KEY+'_seif';
const are_seif = () => !!localStorage.getItem(SEIF);
const live = () => !!(V && V.token);
const b64e = u => btoa(String.fromCharCode(...new Uint8Array(u)));
const b64d = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const b64url = u => b64e(u).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64url = s => b64d(s.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((s.length+3)%4));
async function cheieParola(pw, sare, iter){
  const baza = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt:sare, iterations:iter, hash:'SHA-256'}, baza, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
// Seiful v2: conținutul e criptat cu o cheie-master aleatorie (MK). MK e „împachetată” de două ori:
// cu cheia din parolă și, opțional, cu cheia dată de amprentă (WebAuthn PRF, rămâne în cipul telefonului).
let MK = null; // octeții cheii-master, doar în memorie, cât timp aplicația e deblocată
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const citesteSeif = () => { try { return JSON.parse(localStorage.getItem(SEIF)); } catch(e) { return null; } };
const aes = (raw, u=['encrypt','decrypt']) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, u);
async function impacheteaza(k, raw){ const iv=rnd(12); return {iv:b64e(iv), ct:b64e(await crypto.subtle.encrypt({name:'AES-GCM',iv}, k, raw))}; }
async function despacheteaza(k, o){ return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(o.iv)}, k, b64d(o.ct))); }
async function salveazaSeif(){
  const o = citesteSeif(), iv = rnd(12);
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, VK, new TextEncoder().encode(JSON.stringify(V)));
  localStorage.setItem(SEIF, JSON.stringify({...o, iv:b64e(iv), ct:b64e(ct)}));
}
// ===== Puterea parolei (S4) =====
// Minimum 12 caractere. Scorul estimează câte încercări i-ar trebui cuiva care are o copie a seifului (600.000 de iterații PBKDF2 pe încercare).
const PAROLA_MIN = 12;
const PAROLE_SLABE = ['parola','password','qwerty','azerty','123456','abcdef','analist','iloveyou','admin','letmein','bucuresti','romania','costi','trading','etoro','bursa'];
function putereParola(pw){
  pw = String(pw||''); const L = [...pw].length; if (!L) return {n:0, t:''};
  let set = 0; if (/[a-z]/.test(pw)) set+=26; if (/[A-Z]/.test(pw)) set+=26; if (/\d/.test(pw)) set+=10; if (/[^a-zA-Z0-9]/.test(pw)) set+=33;
  const unice = new Set(pw.toLowerCase()).size;
  let bits = Math.min(L, unice*2.5) * Math.log2(Math.max(set,10));
  const mic = pw.toLowerCase().replace(/[0@]/g,'o').replace(/[1!]/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/\$/g,'s');
  if (PAROLE_SLABE.some(w=>mic.includes(w))) bits -= 30;
  if (/(19|20)\d\d/.test(pw)) bits -= 10;
  if (/(.)\1{2,}/.test(pw)) bits -= 10;
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(pw)) bits -= 12;
  if (/^\d+$/.test(pw)) bits = Math.min(bits, 40);
  const n = L < PAROLA_MIN ? 1 : bits < 50 ? 1 : bits < 65 ? 2 : bits < 85 ? 3 : 4;
  const t = L < PAROLA_MIN ? `Prea scurtă: ${L} din minimum ${PAROLA_MIN} caractere.` : ['','Slabă: ușor de ghicit. Adaugă cuvinte sau caractere variate.','Acceptabilă. Mai lungă ar fi mai sigură.','Bună.','Foarte bună.'][n];
  return {n, t};
}
const parolaAcceptata = pw => putereParola(pw).n >= 2;
const fortaHTML = id => `<div class="forta" id="${id}" data-n="0"><i></i><i></i><i></i><i></i></div><div class="fortat" id="${id}t"></div>`;
function arataForta(v, id){ const r=putereParola(v), el=$(id); if(!el) return; el.dataset.n=r.n; $(id+'t').textContent=r.t; }
let PAROLA_SCURTA = false; // doar în memorie, pe durata sesiunii: parola de deblocare are sub 12 caractere

async function creeazaSeif(pw, continut){
  const sare = rnd(16); MK = rnd(32); VK = await aes(MK); V = continut;
  localStorage.setItem(SEIF, JSON.stringify({v:2, iter:ITER, sare:b64e(sare), w: await impacheteaza(await cheieParola(pw, sare, ITER), MK)}));
  await salveazaSeif(); await pregatesteChei();
}
async function deschideCuMK(raw){
  const o = citesteSeif(), k = await aes(raw);
  const txt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(o.iv)}, k, b64d(o.ct));
  MK = raw; VK = k; V = JSON.parse(new TextDecoder().decode(txt)); J = V.jurnal || []; await pregatesteChei();
}
async function deschideSeif(pw){
  const o = citesteSeif(), k = await cheieParola(pw, b64d(o.sare), o.iter);
  if (o.v !== 2) { // seif v1 (0.12): conținutul era criptat direct cu cheia din parolă; se mută pe v2
    const txt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(o.iv)}, k, b64d(o.ct)); // aruncă eroare la parolă greșită
    await creeazaSeif(pw, JSON.parse(new TextDecoder().decode(txt))); J = V.jurnal || []; return;
  }
  await deschideCuMK(await despacheteaza(k, o.w)); // aruncă eroare la parolă greșită
}
async function pregatesteChei(){
  DK = await crypto.subtle.importKey('raw', unb64url(V.dataKey), 'AES-GCM', false, ['encrypt','decrypt']);
  PRIV = V.priv ? await crypto.subtle.importKey('jwk', V.priv, {name:'RSA-OAEP', hash:'SHA-256'}, false, ['decrypt']) : null;
}
// ---- Amprenta: WebAuthn cu extensia PRF. Telefonul derivă o cheie secretă doar după amprentă. ----
async function prfAmprenta(id, sare){
  const r = await navigator.credentials.get({publicKey:{challenge:rnd(32), rpId:location.hostname, allowCredentials:[{type:'public-key', id:b64d(id)}], userVerification:'required', timeout:60000, extensions:{prf:{eval:{first:b64d(sare)}}}}});
  const out = r?.getClientExtensionResults?.().prf?.results?.first;
  if (!out) throw new Error('fara-prf'); return new Uint8Array(out);
}
async function areAmprenta(){ try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch(e) { return false; } }
async function activeazaAmprenta(){
  if (!MK) return;
  if (!await areAmprenta()) { toast('Telefonul nu oferă deblocare cu amprentă în browser.'); return; }
  try {
    const sare = rnd(32);
    const c = await navigator.credentials.create({publicKey:{challenge:rnd(32), rp:{name:'Analist', id:location.hostname}, user:{id:rnd(16), name:'Analist', displayName:'Analist'},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}], authenticatorSelection:{authenticatorAttachment:'platform', residentKey:'preferred', userVerification:'required'},
      timeout:60000, extensions:{prf:{eval:{first:sare}}}}});
    const ext = c.getClientExtensionResults?.() || {};
    if (ext.prf?.enabled === false) throw new Error('fara-prf');
    const id = b64e(c.rawId);
    const raw = ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : await prfAmprenta(id, b64e(sare));
    const o = citesteSeif(); o.bio = {id, sare:b64e(sare), ...await impacheteaza(await aes(raw), MK)};
    localStorage.setItem(SEIF, JSON.stringify(o)); vib(); toast('Gata. De acum deblochezi cu amprenta.'); render();
  } catch(e) {
    toast(e.message==='fara-prf' ? 'Telefonul sau browserul nu suportă încă cheile derivate din amprentă. Actualizează Chrome și Google Play Services.' : e.name==='NotAllowedError' ? 'Ai anulat.' : 'Nu s-a putut activa: '+e.message);
  }
}
function dezactiveazaAmprenta(){ const o=citesteSeif(); delete o.bio; localStorage.setItem(SEIF, JSON.stringify(o)); toast('Deblocarea cu amprentă e oprită.'); render(); }
let BIO_BUSY = false;
async function deblocheazaAmprenta(auto){
  const o = citesteSeif(); if (!o?.bio || BIO_BUSY || V) return; BIO_BUSY = true;
  try { const raw = await prfAmprenta(o.bio.id, o.bio.sare); await deschideCuMK(await despacheteaza(await aes(raw), o.bio)); vib(); await dupaDeblocare(); }
  catch(e) { if (!auto) toast(e.name==='NotAllowedError' ? 'Amprenta nu a fost confirmată. Folosește parola.' : 'Nu s-a putut debloca cu amprenta. Folosește parola.'); }
  finally { BIO_BUSY = false; }
}
async function dupaDeblocare(){ S.esec={n:0,pana:0}; save(); await dinCache(); LOADED=true; stare(); VIEW='azi'; render(); reincarca(); }
async function encDate(text){ const iv=rnd(12); return JSON.stringify({v:1, alg:'A256GCM', iv:b64e(iv), ct:b64e(await crypto.subtle.encrypt({name:'AES-GCM', iv}, DK, new TextEncoder().encode(text)))}); }
async function decDate(t){ if(!t) return null; const o=JSON.parse(t); return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(o.iv)}, DK, b64d(o.ct))); }
async function decRaport(t){
  if(!t||!PRIV) return null; const o=JSON.parse(t);
  const raw = await crypto.subtle.decrypt({name:'RSA-OAEP'}, PRIV, b64d(o.k));
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(o.iv)}, k, b64d(o.ct)));
}
async function perecheRaport(){
  const kp = await crypto.subtle.generateKey({name:'RSA-OAEP', modulusLength:3072, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256'}, true, ['encrypt','decrypt']);
  const spki = b64e(await crypto.subtle.exportKey('spki', kp.publicKey));
  return { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----` };
}
function blocheaza(){
  vBlocat.incercat = false; V=null; VK=null; MK=null; DK=null; PRIV=null; J=[]; SNAP=null; RAP=null; INTRA=null; IST=null; STARE=null;
  ['sheet','sheet2'].forEach(id=>$(id).classList.remove('on')); ['veil','veil2'].forEach(id=>$(id).classList.remove('on')); document.documentElement.classList.remove('blocat'); ED = null;
  stare(); render();
}
// Încercări greșite: după 3, așteptare crescătoare (5 s, 10 s, 20 s… maximum 5 minute).
async function deblocheaza(){
  const e = S.esec || {n:0, pana:0}; if (Date.now() < e.pana) { toast(`Așteaptă ${Math.ceil((e.pana-Date.now())/1000)} s.`); return; }
  const pw = $('pw').value; if (!pw) return;
  $('bdeb').disabled = true; $('bdeb').textContent = 'Se deschide…';
  try { await deschideSeif(pw); PAROLA_SCURTA = [...pw].length < PAROLA_MIN; vib(); await dupaDeblocare(); }
  catch(err) { e.n++; if (e.n>=3) e.pana = Date.now() + Math.min(5000*Math.pow(2,e.n-3), 300000); S.esec=e; save(); vib(); render(); toast(e.n>=3?`Parolă greșită. Următoarea încercare peste ${Math.ceil((e.pana-Date.now())/1000)} s.`:'Parolă greșită.'); }
}
// Sigla: o stea (ETF-ul) cu două orbite și două planete care se mișcă. Vectorială: clară la orice rezoluție.
let LOGO_N = 0;
const LOGO = (c='', anim=true, fundal=true) => { const k='L'+(LOGO_N++);
  return `<svg class="logo ${c}" viewBox="0 0 64 64" aria-hidden="true"><defs>
  <radialGradient id="${k}b" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#16263f"/><stop offset=".6" stop-color="#0b1424"/><stop offset="1" stop-color="#060a12"/></radialGradient>
  <radialGradient id="${k}s" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#9fd0ff"/><stop offset=".7" stop-color="#5aa2ff"/><stop offset="1" stop-color="#2dd4bf"/></radialGradient>
  <radialGradient id="${k}h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#5aa2ff" stop-opacity=".55"/><stop offset="1" stop-color="#5aa2ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="${k}p" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff6d6"/><stop offset=".45" stop-color="#f5c84b"/><stop offset="1" stop-color="#b8790f"/></radialGradient>
  <radialGradient id="${k}q" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ffd6e6"/><stop offset=".5" stop-color="#e1638f"/><stop offset="1" stop-color="#8a2450"/></radialGradient>
  <linearGradient id="${k}o" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5aa2ff" stop-opacity=".25"/><stop offset=".5" stop-color="#7cc4ff"/><stop offset="1" stop-color="#2dd4bf" stop-opacity=".35"/></linearGradient>
  <clipPath id="${k}f"><rect x="0" y="32" width="64" height="32"/></clipPath><clipPath id="${k}r"><rect x="0" y="0" width="64" height="32"/></clipPath></defs>
  ${fundal?`<rect width="64" height="64" rx="15" fill="url(#${k}b)"/>`:''}
  <g fill="#cfe3ff" opacity="${fundal?'.7':'0'}"><circle cx="11" cy="13" r=".55"/><circle cx="52" cy="10" r=".45"/><circle cx="56" cy="47" r=".6"/><circle cx="9" cy="50" r=".4"/><circle cx="44" cy="56" r=".35"/><circle cx="21" cy="57" r=".45"/></g>
  <g transform="rotate(-24 32 32)">
    <g clip-path="url(#${k}r)"><ellipse cx="32" cy="32" rx="25" ry="9.5" fill="none" stroke="url(#${k}o)" stroke-width="1.3" opacity=".55"/><ellipse cx="32" cy="32" rx="16" ry="6" fill="none" stroke="#7cc4ff" stroke-width=".8" stroke-dasharray="1.6 2" opacity=".45"/></g>
    <circle cx="32" cy="32" r="17" fill="url(#${k}h)">${anim?'<animate attributeName="r" values="15;18;15" dur="4s" repeatCount="indefinite"/>':''}</circle>
    <circle cx="32" cy="32" r="8.6" fill="url(#${k}s)"/>
    <g clip-path="url(#${k}f)"><ellipse cx="32" cy="32" rx="25" ry="9.5" fill="none" stroke="url(#${k}o)" stroke-width="1.5"/><ellipse cx="32" cy="32" rx="16" ry="6" fill="none" stroke="#7cc4ff" stroke-width=".9" stroke-dasharray="1.6 2" opacity=".75"/></g>
    <circle r="3.3" fill="url(#${k}p)" ${anim?'':'cx="54" cy="27.6"'}>${anim?'<animateMotion dur="9s" repeatCount="indefinite" path="M57 32a25 9.5 0 1 1-50 0a25 9.5 0 1 1 50 0"/>':''}</circle>
    <circle r="1.9" fill="url(#${k}q)" ${anim?'':'cx="18" cy="35"'}>${anim?'<animateMotion dur="5.5s" repeatCount="indefinite" path="M16 32a16 6 0 1 0 32 0a16 6 0 1 0-32 0"/>':''}</circle>
  </g></svg>`; };
const AMPRENTA = `<svg viewBox="0 0 24 24"><path d="M12 11v3a8 8 0 0 1-1.5 4.7"/><path d="M8.5 9.5A3.5 3.5 0 0 1 15.5 11v2a12 12 0 0 1-.6 3.8"/><path d="M5.6 7.6A7 7 0 0 1 19 11v1.5"/><path d="M5 12v1a11 11 0 0 0 1.3 5.2"/><path d="M8.5 13a14 14 0 0 1-.4 3.6"/><path d="M18.6 16.5a17 17 0 0 1-.9 3"/><path d="M8 4.2A9 9 0 0 1 20.5 7"/></svg>`;
function vBlocat(){
  const e = S.esec || {n:0}, astept = Date.now() < (e.pana||0), bio = !!citesteSeif()?.bio;
  if (bio && !vBlocat.incercat) { vBlocat.incercat = true; requestAnimationFrame(()=>deblocheazaAmprenta(true)); } // amprenta se cere imediat
  return `<div style="max-width:380px;margin:9vh auto 0;text-align:center">
    ${LOGO('logo-big')}
    <h3 style="font-size:26px;margin:14px 0 4px;letter-spacing:-.3px">Analist</h3>
    <div class="sub" style="margin-bottom:22px">Analistul tău personal pe bursă</div>
    ${bio?`<button class="bio" id="bbio" data-c="${A('deblocheazaAmprenta')}">${AMPRENTA}Deblochează cu amprenta</button><div class="sub" style="margin:-4px 0 12px">sau cu parola</div>`:''}
    <input id="pw" type="password" autocomplete="current-password" placeholder="Parola" data-kd="${A('enterDeblocheaza','$ev')}" ${astept?'disabled':''}>
    <button class="btn ${bio?'ghost':''}" id="bdeb" data-c="${A('deblocheaza')}" ${astept?'disabled':''}>${astept?'Prea multe încercări greșite':'Deblochează'}</button>
    ${e.n?`<div class="sub" style="margin-top:10px">Încercări greșite: ${e.n}</div>`:''}
    <button class="link" style="margin-top:26px;color:var(--mut);font-size:13px" data-c="${A('uitatParola')}">Ai uitat parola?</button></div>`;
}
function uitatParola(){
  openSheet(`${capFoaie('lacat','Ai uitat parola?','','--warn')}
  <div class="sub" style="font-size:14px;line-height:1.6;margin-bottom:12px">Parola nu se poate recupera: nu e salvată nicăieri. Poți șterge seiful de pe acest telefon și reconecta aplicația de la zero.<br><br>Datele din GitHub rămân criptate și nu se pierd. Le recuperezi dacă ai cheia de date salvată (în managerul de parole), la Pornire → „Am deja o cheie de date”. Fără ea, analizele vechi nu mai pot fi citite, dar următoarele rulări pornesc de la zero cu o cheie nouă.</div>
  <div class="sub" style="font-size:14px;line-height:1.6;margin:-4px 0 12px">Dacă ai o copie de rezervă a seifului făcută cu o parolă pe care ți-o amintești, șterge seiful și restaureaz-o la Pornire.</div><button class="btn red" data-c="${A('stergeSeif')}">Șterge seiful de pe telefon</button><button class="btn ghost" data-c="${A('closeSheet')}">Renunță</button>`);
}
function stergeSeif(){ [SEIF, KEY+'_files', KEY+'_pornire'].forEach(k=>localStorage.removeItem(k)); S.esec={n:0,pana:0}; save(); FIS={}; closeSheet(); blocheaza(); }
// Blocare automată: după 2 minute în fundal. Conținutul se ascunde imediat, ca să nu apară în lista de aplicații recente.
let ASCUNS_LA = 0;
document.addEventListener('visibilitychange',()=>{
  if (document.hidden) { ASCUNS_LA = Date.now(); document.body.classList.add('ascuns'); }
  else { document.body.classList.remove('ascuns'); if (V && Date.now()-ASCUNS_LA > 120000) blocheaza(); }
});
// Și cu aplicația deschisă: fără nicio atingere 10 minute, se blochează singură.
let ULTIMA_ATINGERE = Date.now();
['pointerdown','keydown','scroll','touchstart'].forEach(e=>addEventListener(e,()=>{ ULTIMA_ATINGERE=Date.now(); },{passive:true,capture:true}));
setInterval(()=>{ if (V && !RULEAZA && Date.now()-ULTIMA_ATINGERE > 600000) { blocheaza(); toast('Blocat după 10 minute fără activitate.'); } }, 30000);
addEventListener('pagehide',()=>document.body.classList.add('ascuns'));
const dataRo = iso => iso ? new Date(iso).toLocaleString('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '–';
const ziRo = (iso,an=true) => iso ? new Date(iso+'T12:00:00').toLocaleDateString('ro-RO',an?{day:'numeric',month:'short',year:'numeric'}:{day:'numeric',month:'short'}) : '–';
const P = () => SNAP?.profil || {tintaETF:60,maxActiune:10,maxTema:25,contributieMin:350,contributieMax:350,contributieTipica:350,orizontAni:10,anTinta:new Date().getFullYear()+10,treapta:'lung',brokerPreferat:'Trading 212'};
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function aplicaTema(){ const r=document.documentElement; if(S.tema==='auto') delete r.dataset.theme; else r.dataset.theme=S.tema; }
aplicaTema();

// ===== Glosar: explicații scurte pentru termeni și semnale =====
const GLOS = {
  harta:['Harta zilei','Fiecare dreptunghi e o poziție. Mărimea arată cât din portofoliu ocupă, culoarea arată mișcarea zilei: verde crește, roșu scade, gri stă pe loc (sub 0,3%). Cu cât culoarea e mai intensă, cu atât mișcarea e mai mare. Atinge un dreptunghi ca să deschizi acțiunea.'],
  orbita:['Galaxia ta','Portofoliul tău ca un sistem solar. În centru e ETF-ul global: cu cât e mai mare steaua, cu atât ai mai mult în el; cercul punctat din jurul ei e ținta ta. Fiecare orbită e un sector, iar fiecare planetă e o acțiune: mărimea e ponderea, inelul colorat e semnalul (verde: cumpără, gri: las-o, roșu: uită-te la ea), iar strălucirea arată cum a mers azi. Orbitele pline au trecut de plafonul pe sector. Trage cu degetul ca să rotești și să înclini sistemul, atinge o planetă ca s-o vezi și încă o dată ca să-i deschizi fișa. „Ultimul an” arată, în câteva secunde, cum s-au schimbat mărimile în ultimele 12 luni, după prețurile zilnice (cu cantitățile de azi).'],
  proiectie:['Unde poți ajunge','Trei scenarii pentru valoarea portofoliului la orizontul tău: 3%, 6% și 9% pe an, în lei, înainte de inflație. Linia punctată e doar ce depui. Diferența până la scenarii e dobânda compusă: câștigurile fac la rândul lor câștiguri. Anii reali vor fi neregulați, cu scăderi de 20–30% pe drum. Nu e o promisiune, e un ordin de mărime.'],
  agitatie:['Cât de mult se mișcă portofoliul','Agitația (volatilitatea) arată cât urcă și coboară valoarea într-un an obișnuit, calculată din prețurile ultimelor până la 12 luni, cu ponderile de azi. VWCE e reperul. Cea mai mare scădere e de la un vârf la minimul de după. O lună proastă apare cam o dată la 20 de luni. Testele de stres arată cât ai pierde în scenarii plauzibile. Scăderile de felul ăsta sunt normale pe termen lung. Întrebarea e dacă le-ai privi liniștit, fără să vinzi.'],
  castigPoz:['De unde vine câștigul','Câștigul sau pierderea în lei a fiecărei poziții, de când o ai. Așa vezi care alegeri au contat cu adevărat, nu doar procentual: 50% pe o poziție mică poate valora mai puțin decât 10% pe una mare.'],
  alocare:['Alocare: acum și ținta','În Plan, inelul exterior e ținta și cel interior e împărțirea de acum, pe ETF și sectoare; se schimbă pe loc când muți glisoarele. În Analiză, bara de sus arată cum e împărțit portofoliul azi, pe ETF și sectoare. Bara de jos arată împărțirea țintă, după orizontul tău. Plafoanele pe sector și pe acțiune se schimbă din Plan → Profilul tău. Ajungi la țintă din depuneri, fără să vinzi.'],
  corelatie:['Ce se mișcă împreună','Corelația arată cât de des două acțiuni urcă și coboară în aceleași săptămâni: 1 înseamnă identic, 0 independent, sub 0 invers. „Diversificarea reală” arată câte poziții cu adevărat diferite ai: zece acțiuni care se mișcă la fel valorează cât o singură poziție. Se calculează din randamentele pe câte 5 zile de bursă din ultimul an: pe zile, acțiunile europene (închise la 18:30) și cele americane (închise la 23:00, ora României) ar părea mai puțin legate decât sunt. Diversificarea reală înseamnă poziții care nu cad toate odată.'],
  xirr:['Randamentul real','Câștigul tău pe an, socotit corect pentru cineva care depune lunar: fiecare sumă contează de la data la care a intrat. 1.000 de lei puși acum o lună au avut mai puțin timp să crească decât 1.000 puși acum 3 ani. E metoda folosită de fondurile de investiții (XIRR). Sumele de la eToro sunt convertite cu cursul BNR din ziua fiecărei depuneri. Comparația cu VWCE folosește exact aceleași sume, în aceleași zile, puse integral în VWCE la prețul și cursul BNR din acea zi; vânzările și dividendele scot bani din ambele variante. Dacă ești sub VWCE ani la rând, varianta simplă ar fi fost mai bună.'],
  costuri:['Costurile','Ce plătești ca să investești: comisionul valutar la Trading 212 (0,15% la fiecare cumpărare în altă monedă decât leul), costul anual al ETF-ului (TER 0,14% pentru VWCE, din iulie 2026, scăzut direct din prețul lui) și estimarea pentru depunerile tale lunare. eToro nu raportează prin API comisioanele de conversie la depunere. Pe 10 ani, 0,5% pe an în plus înseamnă aproximativ 5% din valoarea finală.'],
  dividende:['Dividendele','Partea din profit pe care unele companii o plătesc acționarilor, de obicei trimestrial. Estimarea anuală vine din randamentul anunțat al fiecărei acțiuni. VWCE nu plătește dividende: le reinvestește singur, deci câștigul apare în prețul lui. La brokerii străini, dividendele se declară în Declarația Unică; impozitul reținut în SUA se scade din cel datorat în România.'],
  ter:['TER: costul anual al ETF-ului','Total Expense Ratio: cât la sută pe an ia administratorul fondului. Nu-l plătești separat: se scade zilnic, puțin câte puțin, din prețul ETF-ului. VWCE are 0,14% pe an: la 10.000 de lei, 14 lei pe an.'],
  etfrec:['Ideile noi de investit','Două liste: ETF-uri potrivite cu ce ai deja și acțiuni mari din sectoarele care îți lipsesc. La fiecare vezi de ce apare, argumentele pro și contra și cât ai pune. „Da” o pune în planul lunar și în jurnal, „Nu” o ascunde. Le poți anula oricând. Nu e consultanță financiară: decizia e a ta.'],
  portofoliu:['Din acțiunile tale','Pentru fiecare acțiune pe care o ai: dacă poate primi bani noi luna asta și, dacă nu, de ce. Motivele posibile: are deja cât îi revine din ținta ta, sectorul ei e prea mare în portofoliu, a urcat foarte repede (RSI peste 70) sau urmează rezultatele trimestriale.'],
  isin:['ISIN','Codul unic al unui titlu, același în toată lumea (de exemplu IE00BK5BQT80 pentru VWCE). Simbolul diferă de la bursă la bursă, ISIN-ul nu: caută după el în aplicația brokerului.'],
  ucits:['UCITS','Regulile europene pentru fonduri. Un ETF UCITS e reglementat în UE, se poate cumpăra de la brokerii europeni și are protecții pentru investitori. ETF-urile americane (de exemplu VOO) de obicei nu sunt disponibile pentru români.'],
  acc:['Acumulare (Acc)','ETF-ul își reinvestește singur dividendele primite de la companii. Nu primești bani în cont și nu ai dividende de declarat: câștigul apare în preț și se impozitează doar când vinzi.'],
  compus:['Dobânda compusă','Câștigul produce, la rândul lui, câștig. La 7% pe an, 10.000 de lei devin 19.700 în 10 ani și 38.700 în 20 de ani, fără nicio depunere în plus.'],
  dca:['Investiția lunară (DCA)','Cumperi aceeași sumă la intervale fixe, oricare ar fi prețul. Iei automat mai multe unități când e ieftin și mai puține când e scump, fără să încerci să ghicești momentul.'],
  w8ben:['Formularul W-8BEN','Declarația prin care spui fiscului american că ești rezident în România. Cu el, SUA rețin 10% din dividende în loc de 30%. La Trading 212 și eToro se completează de obicei la deschiderea contului.'],
  urgenta:['Fondul de urgență','Bani puși deoparte pentru neprevăzut, de obicei cheltuielile pe 3–6 luni, într-un loc sigur și disponibil oricând. Te scutește să vinzi investiții la momentul prost.'],
  rsi:['RSI','Indice de la 0 la 100 care arată cât de repede s-a mișcat prețul în ultimele ~3 săptămâni. Peste 70: a urcat foarte repede, de obicei urmează o pauză. Sub 30: a scăzut foarte repede. Nu spune nimic despre calitatea companiei.'],
  m200:['Media de 200 de zile','Prețul mediu pe ultimele 200 de zile de bursă (~10 luni). Când prețul e peste ea, trendul pe termen lung e în sus. E cel mai folosit filtru de trend.'],
  m50:['Media de 50 de zile','Prețul mediu pe ultimele 50 de zile de bursă (~2,5 luni). Când trece peste media de 200, trendul se întărește. Când coboară sub ea, slăbește.'],
  macd:['MACD','Compară o medie rapidă a prețului cu una lentă. Când „se întoarce în sus”, impulsul s-a schimbat în bine. E un semnal de termen scurt: doar context, nu motiv să cumperi.'],
  atr:['Mișcarea zilnică medie (ATR)','Cât urcă sau coboară de obicei acțiunea într-o zi, în procente. O acțiune cu 3% pe zi e de trei ori mai agitată decât una cu 1%. Folosită ca să nu te alarmeze mișcările normale.'],
  pe:['P/E','Prețul acțiunii împărțit la profitul pe acțiune din ultimul an: cât plătești pentru 1 leu de profit. Peste 60 e scump, sub 15 e ieftin, dar o companie care crește repede poate merita un P/E mare.'],
  prot:['Nivel de alertă','Un prag sub care merită să te uiți la acțiune, ca un stop-loss pe care îl verifici tu, nu brokerul. Se calculează ca maximul ultimelor 6 luni minus cel mai mare dintre 5 mișcări zilnice medii și 15%. Peste el, scăderile sunt zgomot normal. Sub el, merită să verifici dacă motivul pentru care o ții mai e valabil. Nu e un ordin de vânzare.'],
  pondere:['Pondere și țintă','Ponderea: cât la sută din tot portofoliul (ambele conturi) ocupă poziția. Ținta: cât ar trebui să ocupe după planul tău. Linia albă de pe bară e ținta.'],
  nucleu:['ETF de bază și acțiuni alese','ETF-ul de bază e un fond global care urmează toată piața: crește odată cu economia lumii, cu risc mic de surprize. Restul sunt acțiunile alese de tine: aici ai șansa să bați piața, dar și riscul. Recomandarea depinde de orizontul tău: 60% pentru 10 ani sau mai mult, mai mult când orizontul e mai scurt. Ținta o poți alege și singur, din Plan → Profilul tău.'],
  moneda:['Riscul valutar','Acțiunile americane sunt în dolari. Când dolarul scade față de leu, valoarea lor în lei scade, chiar dacă prețul în dolari nu s-a schimbat. Pe termen lung efectul se mai echilibrează, dar o expunere de peste 60% într-o singură monedă străină adaugă un risc pe care nu-l controlezi.'],
  tema:['Sector','Domeniul de activitate al companiei: tehnologie, sănătate, energie și așa mai departe. Acțiunile din același sector urcă și scad de obicei împreună, pentru că depind de aceleași lucruri (de exemplu investițiile în AI). Zece acțiuni din același sector nu înseamnă diversificare.'],
  fantoma:['„Totul în VWCE”','Un portofoliu imaginar care primește exact aceleași depuneri ca tine, dar le pune pe toate în VWCE. Dacă al tău e peste, alegerile tale au adăugat valoare. Dacă e sub, varianta simplă ar fi fost mai bună. Câștigul dintr-o vânzare pe care îl reinvestești nu e socotit bani noi, ca să nu primească și varianta VWCE meritul alegerilor tale.'],
  pp:['Puncte procentuale (pp)','Diferența simplă dintre două procente: 12% față de 8% înseamnă 4 pp.'],
  analisti:['Consensul analiștilor','Ce recomandă analiștii băncilor de investiții care urmăresc compania: cumpărare, păstrare sau vânzare. Util ca termometru, nu ca adevăr.'],
  impozit:['Impozit 16%','La brokerii străini (Trading 212, eToro) declari singur câștigul net din vânzări în Declarația Unică, până pe 25 mai anul următor, și plătești 16%. Pierderile din același an se scad din câștiguri. Doar vânzările contează, nu ce ții.'],
  adauga:['Adaugă','Poziția e sub ținta ta și nimic nu spune „așteaptă”. E candidată pentru banii din luna asta. Planul lunar alege dintre acestea.'],
  pastreaza:['Păstrează','Totul e în regulă: ții ce ai și nu e nevoie să faci nimic.'],
  nu_adauga:['Nu mai adăuga','Poziția sau sectorul ei e deja peste plafon. Nu vinzi, doar nu mai pui bani noi aici.'],
  asteapta:['Așteaptă','Poziția e sub țintă, dar momentul nu e bun: urmează rezultatele trimestriale sau prețul a urcat foarte repede. Revino peste câteva săptămâni.'],
  verifica:['Verifică acțiunea','Prețul a coborât sub nivelul de alertă sau și trendul, și fundamentalele s-au deteriorat. Nu e un ordin de vânzare: citește știrile și întreabă-te dacă motivul pentru care ai cumpărat mai e valabil.'],
  reechilibreaza:['Reechilibrează','Poziția a crescut peste dublul plafonului. Varianta fără impozit: nu mai adaugi și o diluează depunerile. Vânzarea parțială grăbește lucrurile, dar câștigul se impozitează cu 16%.'],
  cumpara:['Cumpără luna asta','Acțiunea e în planul tău pentru luna asta. Planul alege cel mult 2 cumpărări: întâi oportunitățile, apoi pozițiile cele mai departe de țintă. Suma exactă e în fișa ei și în tabul Plan.'],
  las:['Las-o','Nu e nimic de făcut acum. Poate fi în regulă, poate are deja destul loc în portofoliu sau poate e momentul prost pentru cumpărat. Motivul exact e în fișa acțiunii.'],
  uita:['Uită-te la ea','Ceva s-a schimbat și merită 5 minute: prețul a coborât sub nivelul de alertă, trendul și fundamentalele s-au stricat, sau acțiunea a crescut mult peste locul pe care i l-ai dat. Nu e un ordin de vânzare: citește motivul din fișă.'],
  opor:['Oportunitate ★','O acțiune pe care oricum o adaugi a scăzut temporar (RSI sub 35 sau minus 10% față de maximul pe 3 luni), dar trendul lung și fundamentalele sunt în regulă. Un preț mai bun pentru o cumpărare planificată.'],
};
function termen(k){ const g=GLOS[k]; if(!g) return; openSheet(`${capFoaie('carte', g[0], 'Ce înseamnă')}<p style="color:var(--ink2);font-size:15px;line-height:1.6;margin:0 0 16px">${esc(g[1])}</p><button class="btn ghost" data-c="${A('closeSheet')}">Am înțeles</button>`); }
const q = k => `<button class="q" aria-label="Ce înseamnă?" data-c="${A('termen',k)}">?</button>`;
// Leagă termenii cunoscuți din textele motorului (textul e deja escapat).
const TL = [[/RSI/,'rsi'],[/media de 200 de zile|Media de 200/i,'m200'],[/[Mm]edia de 50 de zile/,'m50'],[/MACD/,'macd'],[/P\/E/,'pe'],[/nivelul de alertă|nivel de alertă/i,'prot'],[/Analiștii/,'analisti'],[/16%/,'impozit'],[/[Ss]ectorul(?= „)/,'tema']];
const link = s => { let h=esc(s); for(const [re,k] of TL) h=h.replace(re,m=>`<button class="term" data-c="${A('termen',k)}">${m}</button>`); return h; };

// ===== Date: repo privat prin API-ul GitHub =====
const GH = 'https://api.github.com/repos/';
const ghErr = s => s===401?'Token GitHub greșit sau expirat.':s===403?'Tokenul nu are permisiunea necesară.':s===404?'Nu găsesc repo-ul sau fișierul.':'GitHub: HTTP '+s;
async function gh(path, opt={}) {
  const r = await fetch(GH+S.repo+path, {...opt, cache:'no-store', headers:{Authorization:'Bearer '+(opt.token||V?.token||''), Accept:opt.raw?'application/vnd.github.raw':'application/vnd.github+json', ...(opt.body?{'Content-Type':'application/json'}:{}), ...(opt.etag?{'If-None-Match':opt.etag}:{})}});
  if (opt.optional && r.status===404) return null;
  if (r.status===304) return {neschimbat:true};
  if (!r.ok) throw new Error(ghErr(r.status));
  if (opt.etag!==undefined) return {text:await r.text(), etag:r.headers.get('ETag')};
  return opt.raw ? r.text() : (r.status===204 ? null : r.json());
}
// Fișierele din repo, păstrate local cu ETag: dacă nu s-au schimbat, GitHub răspunde 304 și nu se descarcă nimic.
let FIS = {}; try { FIS = JSON.parse(localStorage.getItem(KEY+'_files')||'{}'); } catch(e){ FIS={}; }
const saveFIS = () => { try { localStorage.setItem(KEY+'_files', JSON.stringify(FIS)); } catch(e){} };
async function fisier(path){
  const c = FIS[path], r = await gh('/contents/'+path, {raw:true, optional:true, etag:c?.etag||''});
  if (r===null) { delete FIS[path]; return {text:null, schimbat:!!c}; }
  if (r.neschimbat) return {text:c.text, schimbat:false};
  FIS[path] = {etag:r.etag, text:r.text}; return {text:r.text, schimbat:true};
}
const J_ = t => { try { return t ? JSON.parse(t) : null; } catch(e){ return null; } };
// Fișierele din repo sunt criptate; se decriptează doar în memorie, cât timp aplicația e deblocată.
async function dinCache(){
  if (!DK) return;
  // totul în paralel: motorul și cele patru fișiere criptate (înainte: unul după altul)
  const d = async f => { try { return J_(await decDate(FIS[f]?.text)); } catch(e) { return null; } };
  [, SNAP, INTRA, IST, RAP] = await Promise.all([motor().catch(()=>null), d('date/snapshot.enc'), d('date/intraday.enc'), d('date/istoric.enc'), decRaport(FIS['rapoarte/ultimul.enc']?.text).catch(()=>null)]);
  STARE = J_(FIS['date/stare.json']?.text);
  aplicaProfil(); pregatesteCulori();
}
// ===== Motorul (exact același cod care rulează în GitHub Actions) și profilul tău =====
let M = null, ED = null; // ED = profilul în curs de editare (previzualizare, nesalvat)
const motor = () => M ? Promise.resolve(M) : import('./motor/engine.js').then(m => (M = m));
const anAzi = () => new Date().getFullYear();
function profilUser(){
  if (V?.profil) return V.profil;
  const p = SNAP?.profil; return { anTinta: p?.anTinta || anAzi() + (p?.orizontAni || 10), suma: p?.contributieTipica || 350, tintaETF: p?.tintaETFProprie ? p.tintaETF : null, alese: p?.alese || [], decizii: {} };
}
// Recalculează țintele, semnalele, planul și avertizările după profil (orizont + sumă), direct pe telefon.
function aplicaProfil(u){
  if (SNAP?.pozitii) SNAP.pozitii = SNAP.pozitii.filter(p => !p.virtual); // pozițiile reale; ETF-urile alese stau separat
  if (!M || !SNAP?.pozitii?.length) return;
  u = u || ED || profilUser();
  const azi = SNAP.azi || new Date().toISOString().slice(0,10), pr = M.derivaProfil(u, azi);
  // Planul vede și ETF-urile alese de tine, încă necumpărate (valoare 0), ca să le poată da bani.
  const list = M.cuAlese(SNAP.pozitii, pr.alese);
  for (const v of list.filter(p=>p.virtual)) { const c=(SNAP.candidati||[]).find(x=>x.symbol===v.symbol); if (c) Object.assign(v, {ind:c.ind, fund:c.fund, rec:c.rec, ...(c.logo?{logo:c.logo}:{})}); }
  const t = M.tinte(list, pr); list.forEach(p => p.tinta = t[p.symbol]);
  for (const p of list) { try { Object.assign(p, M.evalueaza(p, {ind:p.ind, rec:p.rec, fund:p.fund, rezultate:p.rezultate}, SNAP.teme, azi, pr)); } catch(e) { if (!p.virtual) throw e; p.semnal = 'adauga'; } }
  SNAP.virtuale = list.filter(p => p.virtual);
  SNAP.planuri = { [pr.contributieTipica]: M.planLunar(list, SNAP.totalRON, pr.contributieTipica, pr).map(l => M.planExact(l, list, SNAP.fx)) };
  SNAP.avertizari = M.avertizariPortofoliu({list: SNAP.pozitii, teme:SNAP.teme, total:SNAP.totalRON}, pr);
  SNAP.profil = pr;
}
async function salveazaProfil(){
  if (!ED || !V) return;
  const v = V.profil || {};
  V.profil = { anTinta: ED.anTinta, suma: ED.suma, tintaETF: ED.tintaETF ?? null, alese: ED.alese || v.alese || [], decizii: ED.decizii || v.decizii || {}, alerte: alerte(), sincronizat: false }; ED = null; await salveazaSeif();
  aplicaProfil(); vib(); render(); await sincronizeazaProfil();
}
// Profilul ajunge în GitHub criptat cu cheia de date, printr-o rulare a analizei (nu e nevoie de alte permisiuni).
async function sincronizeazaProfil(mod='zi'){
  if (!V?.profil || !DK) return;
  try {
    const ct = await encDate(JSON.stringify({ anTinta: V.profil.anTinta, suma: V.profil.suma, tintaETF: V.profil.tintaETF ?? null, alese: V.profil.alese || [], alerte: V.profil.alerte || [] }));
    await gh('/actions/workflows/analiza.yml/dispatches', {method:'POST', body:JSON.stringify({ref:'main', inputs:{mod, profil:ct}})});
    V.profil.sincronizat = true; await salveazaSeif(); toast(mod==='profil'?'Alertele au fost trimise. Analiza din GitHub le verifică din oră în oră.':'Profil salvat. Analiza din GitHub îl folosește de acum.'); render();
  } catch(e) {
    toast(/422/.test(e.message) ? 'Salvat pe telefon. Ca notificările să-l folosească, actualizează fișierul analiza.yml (pașii din documentație).' : 'Salvat pe telefon. Sincronizarea cu GitHub a eșuat, reîncearcă din Plan.');
  }
}


let ULTIM = 0, TRANZ = '', ANIM = true; // ANIM: totalul se animă doar când sosesc date noi
async function reincarca(manual) {
  if (are_seif() && !V) { LOADED=true; stare(); render(); return; } // blocat: nimic de încărcat
  $('bref').classList.add('spin'); OFFLINE=false;
  try {
    if (live()) {
      const rez = await Promise.all(['date/snapshot.enc','rapoarte/ultimul.enc','date/intraday.enc','date/istoric.enc','date/stare.json'].map(f=>fisier(f).catch(e=>{ if(f==='date/stare.json') throw e; return {text:FIS[f]?.text||null,schimbat:false}; })));
      const schimbat = rez.some(x=>x.schimbat) || !SNAP;
      saveFIS(); await dinCache(); ULTIM=Date.now();
      if (manual) toast(schimbat?'Actualizat.':'Nimic nou de la ultima verificare.');
      $('bref').classList.remove('spin'); LOADED=true; stare(); if (schimbat) ANIM=true; if (schimbat || manual) render(); ancora(); return;
    }
    // neconectat: nu există date de arătat, doar ecranul Pornire
    SNAP = null; IST = null; RAP = null; INTRA = null;
  } catch(e) {
    if (live() && FIS['date/snapshot.enc']) { await dinCache(); OFFLINE=true; toast(navigator.onLine?e.message:'Fără conexiune: arăt ultimele date salvate.'); }
    else { $('bref').classList.remove('spin'); LOADED=true; stare(); render(); toast(e.message); return; }
  }
  $('bref').classList.remove('spin'); LOADED=true; stare(); render(); ancora();
}
// La revenirea în aplicație: verifică dacă au apărut date noi (cererile neschimbate costă doar un 304).
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && live() && Date.now()-ULTIM > 5*60e3) reincarca(); });
function cand(iso){
  if(!iso) return ''; const m=(Date.now()-Date.parse(iso))/60e3;
  if (m<1) return 'acum'; if (m<60) return `acum ${Math.round(m)} min`; if (m<24*60 && new Date(iso).getDate()===new Date().getDate()) return `azi ${new Date(iso).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}`;
  if (m<48*60) return `ieri ${new Date(iso).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}`; return dataRo(iso);
}
const zileVechi = () => SNAP ? (Date.now()-Date.parse(SNAP.generat))/864e5 : 0;
function stare(){
  const p=$('pill'); p.className='pill'+(OFFLINE?' off':''); p.textContent='OFFLINE';
  document.body.classList.toggle('nolive', !live());
  $('blk').style.display = live() ? '' : 'none';
  const ultim = intraValid() ? INTRA.generat : SNAP?.generat;
  $('stare').textContent = ultim ? cand(ultim) : '';
  const imp = (SNAP?.schimbari||[]).some(x=>x.important);
  document.querySelector('nav button[data-v=azi]').querySelector('.dot')?.remove();
  if (imp) document.querySelector('nav button[data-v=azi]').insertAdjacentHTML('beforeend','<span class="dot"></span>');
}
// ===== Tranziții continue (View Transitions, nativ în Chrome pe Android). Fără suport: animațiile de până acum. =====
const VT = () => !!document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches && !ANIM_OPRIT;
let ANIM_OPRIT = false, VT_ACUM = null;
function tranzitie(fn, tip){
  if (!VT() || VT_ACUM) { fn(); return null; }
  document.documentElement.dataset.vt = tip;
  const t = VT_ACUM = document.startViewTransition(fn);
  t.finished.finally(()=>{ if (VT_ACUM===t) { VT_ACUM=null; delete document.documentElement.dataset.vt; } });
  return t;
}
function go(v, dir){ if (ED && v!=='plan') { ED=null; aplicaProfil(); } const i0=TABS.indexOf(VIEW), i1=TABS.indexOf(v), sens = i0<0||i1<0||i0===i1 ? '' : i1>i0 ? 'dr' : 'st'; if(v!==VIEW) vib();
  const aplica = () => { TRANZ = VT() ? '' : sens; VIEW=v; document.querySelectorAll('nav button').forEach(b=>{ const on=b.dataset.v===v; b.classList.toggle('on',on); if(on){ b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } }); $('bset')?.classList.toggle('on', v==='setari'); muta(); render(); scrollTo(0,0); };
  if (sens && v!==VIEW) tranzitie(aplica, sens); else aplica(); }
// Fișa acțiunii: avatarul din listă crește și devine antetul fișei; la închidere se întoarce la locul lui.
function deschideDetaliu(sym, el){
  if (!VT() || !el || $('sheet').classList.contains('on')) { detaliu(sym); return; }
  el.style.viewTransitionName = 'avsel';
  const t = tranzitie(()=>{ el.style.viewTransitionName=''; detaliu(sym); const a=$('sheet').querySelector('.dh .av'); if(a) a.style.viewTransitionName='avsel'; }, 'fisa');
  t?.finished.finally(()=>{ const a=$('sheet').querySelector('.dh .av'); if(a) a.style.viewTransitionName=''; });
}
function spatiuJos(){ const n=document.querySelector('nav .in'); if(n) document.documentElement.style.setProperty('--navh', (n.getBoundingClientRect().height+12)+'px'); }
function muta(){ spatiuJos(); const b=document.querySelector('nav button.on'), ind=$('ind'); if(!ind) return; if(!b){ ind.style.opacity=0; return; } ind.style.opacity=1; ind.style.width=b.offsetWidth+'px'; ind.style.transform=`translateX(${b.offsetLeft}px)`; }
function render(){
  ascundeSplash();
  if (are_seif() && !V) { $('v').innerHTML = vBlocat(); if(!citesteSeif()?.bio) setTimeout(()=>$('pw')?.focus(),50); return; }
  if (!live()) VIEW='setari';
  if (!SNAP && VIEW!=='setari') { $('v').innerHTML = LOADED ? `<div class="card empty" style="margin-top:6px">Încă nu există o analiză.<br><br><button class="btn sm" data-c="${A('go','setari')}">Deschide setările</button></div>` : skeleton(); return; }
  const v=$('v'), intra = !!TRANZ || render.ultim !== VIEW; render.ultim = VIEW; v.classList.remove('dr','st'); if(TRANZ){ void v.offsetWidth; v.classList.add(TRANZ); TRANZ=''; }
  $('v').innerHTML = ({azi:vAzi,plan:vPlan,analiza:vAnaliza,invata:vInvata,setari:vSetari})[VIEW]() + `<footer>Semnalele vin din reguli și statistici, nu din predicții. Decizia îți aparține. Nu e consultanță financiară.</footer>`;
  montaGrafice(); countUp(); iconiteSectiuni(); animaAlocare(); if (intra) esalon(v); requestAnimationFrame(muta);
}
const skeleton = () => `<div class="sk" style="height:150px;margin-bottom:12px"></div><div class="sk" style="height:110px;margin-bottom:12px"></div>${'<div class="sk" style="height:58px;margin-bottom:6px"></div>'.repeat(5)}`;
const intraValid = () => INTRA && SNAP && INTRA.generat > SNAP.generat && INTRA.generat.slice(0,10) === new Date().toISOString().slice(0,10);
function countUp(){
  document.querySelectorAll('[data-count]').forEach(el=>{
    const to=+el.dataset.count; if (!ANIM || matchMedia('(prefers-reduced-motion: reduce)').matches) return; ANIM=false;
    const t0=performance.now(), from=to*0.96, d=650;
    const step=t=>{ const k=Math.min((t-t0)/d,1), e=1-Math.pow(1-k,3); el.firstChild.textContent=nf(from+(to-from)*e); if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ===== Grafice SVG (fără biblioteci) =====
const GR = {}; let grId = 0;
// series: [{name, v:[], color:'--s1', dash, w}], x: [date], h: [{v,color,label,dash}], fmt
const CHART_PREV = {};
function lineChart(o){
  const id='g'+(grId++); GR[id]=o; o.H=o.H||170;
  return `<div class="chart" id="${id}" data-noswipe><div class="ro num" aria-live="polite"></div></div>`;
}
// Praguri „rotunde” pe axă: pași de 1, 2, 2,5 sau 5 × 10^n.
function praguri(lo, hi, n=5){
  const brut=(hi-lo)/(n-1)||Math.abs(hi)||1, p10=Math.pow(10,Math.floor(Math.log10(brut)));
  const pas=[1,2,2.5,5,10].map(k=>k*p10).find(k=>k>=brut);
  const t0=Math.floor(lo/pas)*pas, out=[]; for(let v=t0; v<hi+pas*0.999; v+=pas) out.push(+v.toPrecision(12));
  return {t:out, pas};
}
function montaGrafice(){
  for (const [id,o] of Object.entries(GR)) {
    const el=$(id); if(!el){ delete GR[id]; continue; }
    const W=Math.max(el.clientWidth,260), H=o.H, pl=2, pr=46, pt=8, pb=22;
    const all=o.series.flatMap(s=>s.v).concat((o.h||[]).map(h=>h.v)).filter(x=>x!=null&&isFinite(x));
    if (!all.length) { el.innerHTML='<div class="sub">Date insuficiente.</div>'; continue; }
    const {t:ticks, pas} = praguri(Math.min(...all), Math.max(...all)), lo=ticks[0], hi=ticks[ticks.length-1];
    const fA = o.fmtAxa || (v => S.privat&&o.privat ? '•••' : nf(v, pas>=1?0:pas>=0.1?1:2));
    const n=o.series[0].v.length, X=i=>pl+(W-pl-pr)*(n<2?0:i/(n-1)), Y=v=>pt+(H-pt-pb)*(1-(v-lo)/(hi-lo||1));
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria||'grafic')}"><defs>${o.series.map((se,k)=>`<linearGradient id="${id}g${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(${se.color});stop-opacity:.24"/><stop offset="1" style="stop-color:var(${se.color});stop-opacity:0"/></linearGradient>`).join('')}</defs>`;
    s+=ticks.map(t=>`<line x1="${pl}" x2="${W-pr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)" stroke-width="1" ${t===lo?'':'stroke-dasharray="2 4"'}/><text x="${W-pr+8}" y="${Y(t)+4}" fill="var(--mut)" font-size="10.5" class="num">${esc(fA(t))}</text>`).join('');
    const fX = o.xfmt || (d=>ziRo(d,false));
    if (o.x) { const mid=Math.floor((n-1)/2); s+=[[0,'start'],[mid,'middle'],[n-1,'end']].map(([i,a])=>`<text x="${X(i)}" y="${H-5}" fill="var(--mut)" font-size="10.5" text-anchor="${a}">${esc(fX(o.x[i]))}</text>`).join(''); }
    for (const h of o.h||[]) if(h.v>=lo&&h.v<=hi) s+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(h.v)}" y2="${Y(h.v)}" stroke="var(${h.color})" stroke-width="1.4" stroke-dasharray="5 4"/>${h.eticheta?`<text x="${pl+4}" y="${Y(h.v)-5}" fill="var(${h.color})" font-size="10.5" font-weight="600">${esc(h.eticheta)}</text>`:''}`;
    o.series.forEach((se,k)=>{
      let d='',on=false; se.v.forEach((v,i)=>{ if(v==null){on=false;return;} d+=(on?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1); on=true; });
      if (k===0 && o.area) s+=`<path d="${d}L${X(n-1)} ${H-pb}L${X(0)} ${H-pb}Z" fill="url(#${id}g0)"/>`;
      s+=`<path d="${d}" fill="none" stroke="var(${se.color})" stroke-width="${se.w||2}" ${se.dash?'stroke-dasharray="4 4"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    o.series.forEach((se,k)=>{ const li=se.v.length-1; if(se.v[li]!=null&&k===0) s+=`<circle cx="${X(li)}" cy="${Y(se.v[li])}" r="7" fill="var(${se.color})" opacity=".18"/><circle cx="${X(li)}" cy="${Y(se.v[li])}" r="3.6" fill="var(${se.color})" stroke="var(--panel)" stroke-width="1.6"/>`; });
    s+=`<line class="xh" y1="${pt}" y2="${H-pb}" stroke="var(--ink2)" stroke-width="1" opacity="0"/>${o.series.map((se,k)=>`<circle class="xd${k}" r="4.5" fill="var(${se.color})" stroke="var(--panel)" stroke-width="2" opacity="0"/>`).join('')}<rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="hit"/></svg>`;
    el.insertAdjacentHTML('beforeend', s);
    const svg=el.querySelector('svg'), ro=el.querySelector('.ro');
    if (o.anim) { // aceeași diagramă, date noi: liniile alunecă din forma veche în cea nouă
      const ps=[...svg.querySelectorAll('path')], nou=ps.map(p=>p.getAttribute('d')), vechi=CHART_PREV[o.anim];
      if (vechi && vechi.length===nou.length && W===CHART_PREV[o.anim+'W']) { ps.forEach((p,i)=>p.setAttribute('d',vechi[i])); requestAnimationFrame(()=>requestAnimationFrame(()=>ps.forEach((p,i)=>{ p.style.transition='d .55s cubic-bezier(.2,.8,.2,1)'; p.setAttribute('d',nou[i]); }))); }
      CHART_PREV[o.anim]=nou; CHART_PREV[o.anim+'W']=W;
    }
    const fV = v => S.privat&&o.privat ? '•••' : (o.fmt||nf)(v);
    const citire = i => ro.innerHTML = `<span class="d">${o.x?esc(fX(o.x[i])):''}</span>`+o.series.map(se=>`<span class="v"><span class="k"><i style="background:var(${se.color})${se.dash?';height:2px':''}"></i>${esc(se.short||se.name)}</span><b>${esc(fV(se.v[i]))}</b></span>`).join('');
    citire(n-1);
    const show=ev=>{
      const r=svg.getBoundingClientRect(), cx=((ev.touches?ev.touches[0].clientX:ev.clientX)-r.left)*W/r.width;
      const i=Math.max(0,Math.min(n-1,Math.round((cx-pl)/(W-pl-pr)*(n-1)))), x=X(i);
      svg.querySelector('.xh').setAttribute('x1',x); svg.querySelector('.xh').setAttribute('x2',x); svg.querySelector('.xh').setAttribute('opacity','.45');
      o.series.forEach((se,k)=>{ const c=svg.querySelector('.xd'+k); if(se.v[i]==null){c.setAttribute('opacity','0');return;} c.setAttribute('cx',x); c.setAttribute('cy',Y(se.v[i])); c.setAttribute('opacity','1'); });
      citire(i); ro.classList.add('act');
    };
    const hide=()=>{ citire(n-1); ro.classList.remove('act'); svg.querySelector('.xh').setAttribute('opacity','0'); o.series.forEach((_,k)=>svg.querySelector('.xd'+k).setAttribute('opacity','0')); };
    svg.addEventListener('pointermove',show); svg.addEventListener('pointerdown',show); svg.addEventListener('pointerleave',hide);
    svg.addEventListener('touchmove',show,{passive:true}); svg.addEventListener('touchend',()=>setTimeout(hide,1400));
    delete GR[id];
  }
}
const wbar = p => `<div class="wb" title="pondere ${nf(p.pondere,1)}%, țintă ${nf(p.tinta,1)}%"><i class="${sem(p)==='uita'&&p.pondere>p.tinta?'over':''}" style="width:${Math.min(p.pondere/Math.max(p.tinta*1.6,p.pondere)*100,100)}%"></i><b style="left:${Math.min(p.tinta/Math.max(p.tinta*1.6,p.pondere)*100,100)}%"></b></div>`;

// ===== Luna ta: cumpărări văzute în cont + bifa locală =====
const LUNA = () => new Date().toISOString().slice(0,7);
const cumparari = () => (SNAP?.operatiuni||[]).filter(o=>o.tip==='cumparare');
const investitLuna = (l=LUNA()) => cumparari().filter(o=>o.data.slice(0,7)===l).reduce((a,o)=>a+o.lei,0);
const lunaFacuta = (l=LUNA()) => investitLuna(l) > 0 || (S.luniFacute||[]).includes(l) || S.planFacut===l;
function serieLuni(){ // câte luni la rând (până la luna curentă sau cea trecută) ai investit
  let n=0, d=new Date(); if (!lunaFacuta()) d.setMonth(d.getMonth()-1);
  for (let i=0;i<120;i++) { const l=d.toISOString().slice(0,7); if(!lunaFacuta(l)) break; n++; d.setMonth(d.getMonth()-1); }
  return n;
}
// ===== Linkuri directe din notificări: #plan, #analiza, #setari, #s=SIMBOL =====
function ancora(){
  const h = decodeURIComponent(location.hash.slice(1)); if (!h || !SNAP && h!=='setari') return;
  history.replaceState(null,'',location.pathname+location.search);
  if (h.startsWith('s=')) { go('azi'); setTimeout(()=>detaliu(h.slice(2)),60); }
  else if (['plan','analiza','setari','azi'].includes(h)) go(h);
}
addEventListener('hashchange', ancora);

// ===== „Ce fac azi” =====
function ceFac(){
  const luna = new Date().toISOString().slice(0,7), azi = new Date().toISOString().slice(0,10);
  const imp = (SNAP.schimbari||[]).filter(x=>x.important);
  if (imp.length) { const x=imp[0], p=SNAP.pozitii.find(y=>y.symbol===x.symbol);
    const op = x.eticheta==='Oportunitate';
    return {k:op?'--opor':'--verifica', tag:op?'Oportunitate':'Uită-te la ea', titlu:op?`${x.symbol} e mai ieftină decât de obicei`:`${x.symbol}: ${x.eticheta.toLowerCase()}`,
      text:(op?p?.oportunitate:p?.atentie?.[0])||'', acts:[[`Vezi ${x.symbol}`,['detaliu',x.symbol]]], extra:imp.length-1}; }
  // oportunitate apărută în timpul zilei (verificarea din oră în oră)
  const opz = intraValid() ? INTRA.pozitii.find(x=>x.oportunitate && !SNAP.pozitii.find(p=>p.symbol===x.symbol)?.oportunitate) : null;
  if (opz) return {k:'--opor', tag:'Oportunitate azi', titlu:`${opz.symbol} e mai ieftină azi`, text:opz.oportunitate+(!lunaFacuta()?' Dacă n-ai investit încă luna asta, poți cumpăra acum.':''), acts:[[`Vezi ${opz.symbol}`,['detaliu',opz.symbol]]]};
  const conf = (SNAP.operatiuniNoi||[]).filter(o=>o.tip==='cumparare');
  if (conf.length) return {k:'--pos', tag:'Din cont', titlu:`Cumpărare confirmată: ${conf.map(o=>`${S.privat?'•••':nf(o.lei,0)+' '+de(o.lei)+'lei'} în ${o.symbol}`).join(', ')}`,
    text:conf.map(o=>`${o.symbol}: ${nf(o.unitati,4)} unități${o.pret?` la aproximativ ${nf(o.pret)} ${o.moneda||''}`:''}, la ${o.broker}.`).join(' ')+' E notată în jurnal.', acts:[]};
  const s = sumaPlan(), plan = SNAP.planuri?.[s];
  if (!lunaFacuta() && plan?.length) return {k:'--acc', tag:'Luna asta', titlu: plan.length===1 ? `Investește ${s} ${de(s)}lei în ${plan[0].symbol}` : `Investește ${s} ${de(s)}lei: ${plan.map(l=>`${l.suma} în ${l.symbol}`).join(', ')}`,
    text:`La ${plan[0].broker}${plan[0].orar?`, ${plan[0].orar.interval}`:''}. Luna se bifează singură a doua zi, când cumpărarea apare în cont.`, acts:[['Vezi detaliile',['go','plan']],['Am investit',['planFacut']]]};
  const op = SNAP.pozitii.find(p=>p.oportunitate);
  if (op) return {k:'--opor', tag:'Oportunitate', titlu:`${op.symbol} e mai ieftină decât de obicei`, text:op.oportunitate, acts:[[`Vezi ${op.symbol}`,['detaliu',op.symbol]]]};
  const rez = SNAP.pozitii.filter(p=>p.rezultate && (Date.parse(p.rezultate)-Date.parse(azi))/864e5 <= 2 && p.rezultate>=azi);
  if (rez.length) return {k:'--asteapta', tag:'Atenție', titlu:`Rezultate trimestriale: ${rez.map(p=>p.symbol).join(', ')}`, text:'Sunt posibile mișcări mari. Nu cumpăra înainte de rezultate.', acts:[]};
  return {k:'--pos', tag:'Totul e pe plan', titlu:'Nimic de făcut azi', text:'Ai investit luna asta și nu există semnale noi. Următorul pas e depunerea de luna viitoare.', acts:[]};
}
function planFacut(){ vib();
  const luna = new Date().toISOString().slice(0,7), s = sumaPlan();
  for (const l of SNAP.planuri[s]) { const p=SNAP.pozitii.find(x=>x.symbol===l.symbol), e=SNAP.pozitii.find(x=>x.etf);
    J.unshift({id:Date.now()+Math.random(),data:new Date().toISOString().slice(0,10),symbol:l.symbol,actiune:'cumparat',semnal:p?.semnal||'adauga',pret:p?.ind?.pret??null,pretETF:e?.ind?.pret??null,nota:`Planul lunii: ${l.suma} lei`}); }
  saveJ(); S.planFacut=luna; S.luniFacute=[...new Set([...(S.luniFacute||[]),luna])].slice(-120); save(); render(); toast('Notat. Confirmarea din cont apare a doua zi.');
}

// ===== Ora surselor + verificarea sumelor =====
function surseLinie(){
  const o = SNAP.ora || {}, v = SNAP.verificare, ora = iso => iso ? new Date(iso).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}) : null;
  const parti = [o.t212&&`Trading 212 ${ora(o.t212)}`, o.etoro&&`eToro ${ora(o.etoro)}`, o.bnr&&`BNR ${ziRo(o.bnr,false)}`, o.preturi&&`prețuri ${ziRo(o.preturi,false)}`].filter(Boolean);
  if (!parti.length && !v) return '';
  const badge = !v ? '' : v.ok ? `<button class="link" style="color:var(--pos);font-size:12px" data-c="${A('verificare')}">✓ verificat cu brokerii</button>` : `<button class="link" style="color:var(--warn);font-size:12px" data-c="${A('verificare')}">⚠ diferență față de broker</button>`;
  return `<div class="sub num" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center">${parti.map(esc).join(' · ')} ${badge}</div>`;
}
function verificare(){
  const v = SNAP.verificare || {}, t = v.t212, e = v.etoro;
  openSheet(`${capFoaie('scut','Verificarea sumelor','cum se potrivesc cifrele','--pos')}
  <div class="sub" style="margin-bottom:10px">La fiecare analiză, suma calculată de aplicație e comparată cu cea raportată de broker. Așa se vede imediat o poziție lipsă sau numărată greșit.</div>
  ${t?`<div class="kv num"><span>Trading 212, calculat</span><span>${lei(t.calculat)}</span><span>Trading 212, raportat de broker</span><span>${lei(t.raportat)}</span>
    <span>Diferență</span><span class="${t.ok?'pos':'neg'}">${sg(t.difPct,2)}% ${t.ok?'✓':'⚠'}</span></div>`:'<div class="sub">Trading 212: soldul nu a putut fi citit la ultima analiză.</div>'}
  ${e?`<div class="kv num" style="margin-top:10px"><span>eToro, poziții citite</span><span>${e.pozitii}</span><span>Nerecunoscute</span><span class="${e.ok?'pos':'neg'}">${e.nerecunoscute.length?esc(e.nerecunoscute.join(', ')):'niciuna ✓'}</span></div>`:''}
  ${v.ok===false?`<div class="al err" style="margin-top:12px">Dacă diferența persistă două zile, trimite-mi o captură: probabil o acțiune nouă trebuie adăugată în maparea simbolurilor.</div>`:''}
  <button class="btn ghost" style="margin-top:14px" data-c="${A('closeSheet')}">Închide</button>`);
}

// ===== Azi =====
// Un singur cont: aceleași poziții, cu valorile, câștigul și ponderea doar din contul ales.
// Semnalele rămân cele calculate pe tot portofoliul (riscul real e cel cumulat).
const CONTURI = [['toate','Ambele'],['Trading 212','Trading 212'],['eToro','eToro']];
function vedereCont(C){
  if (C==='toate') return { poz: SNAP.pozitii, total: SNAP.totalRON, cost: SNAP.costRON };
  const poz = SNAP.pozitii.filter(p=>p.brokers.some(b=>b.broker===C)).map(p=>{
    const bs = p.brokers.filter(b=>b.broker===C), sum = k => bs.reduce((a,b)=>a+(b[k]||0),0);
    const v = sum('valueRON'), c = sum('costRON');
    return { ...p, valueRON:v, costRON:c, pnlRON:v-c, pnlPct:c?(v/c-1)*100:0, valueUSD:bs.every(b=>b.valueUSD!=null)?sum('valueUSD'):null, costUSD:bs.every(b=>b.costUSD!=null)?sum('costUSD'):null, peCont:true };
  });
  const total = poz.reduce((a,p)=>a+p.valueRON,0), cost = poz.reduce((a,p)=>a+p.costRON,0);
  poz.forEach(p=>p.pondere = total ? p.valueRON/total*100 : 0);
  const usd = poz.every(p=>p.valueUSD!=null) ? { v: poz.reduce((a,p)=>a+p.valueUSD,0), c: poz.reduce((a,p)=>a+p.costUSD,0) } : null;
  return { poz, total, cost, usd };
}
// ===== Identitatea: „nucleu și sateliți”. Fiecare iconiță are satelitul ei (punctul colorat). =====
const ICO = {
  azi:'<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-4.5a2 2 0 0 1 4 0V20"/><circle class="s" cx="18.6" cy="4.6" r="1.7"/>',
  plan:'<path d="M4 18c3-1 4.5-4 7-7.5S16 5 20 5"/><path d="M15.5 5H20v4.5"/><circle cx="4.5" cy="18" r="1.6"/><path d="M4 21h16" opacity=".5"/><circle class="s" cx="11" cy="10.6" r="1.7"/>',
  analiza:'<circle cx="12" cy="12" r="3.2"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)"/><circle class="s" cx="19.6" cy="8.2" r="1.8"/>',
  play:'<path d="M8 5.5v13l10.5-6.5z"/>',
  jos:'<path d="M6 9.5l6 6 6-6"/>',
  invata:'<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6V16c1.6 1.5 3.4 2.2 5.5 2.2s3.9-.7 5.5-2.2v-4.4"/><path d="M21.5 9.5v5"/><circle class="s" cx="21.5" cy="16.4" r="1.6"/>',
  setari:'<path d="M4 6.5h9.5M18.5 6.5H20M4 12h3M12 12h8M4 17.5h11M19.5 17.5H20"/><circle cx="16" cy="6.5" r="2.4" class="f2"/><circle cx="9.5" cy="12" r="2.4" class="f2"/><circle class="s" cx="17.5" cy="17.5" r="1.9"/>',
  refresh:'<path d="M18.8 9.2A7.2 7.2 0 0 0 5.6 8.4"/><path d="M5.2 14.8a7.2 7.2 0 0 0 13.2.8"/><path d="M5 4.6v4.2h4.2"/><path d="M19 19.4v-4.2h-4.2"/><circle class="s" cx="12" cy="12" r="1.7"/>',
  lacat:'<rect x="5" y="10.5" width="14" height="10.5" rx="3.2" class="f2"/><path class="toarta" d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/><path d="M12 15.2v2"/><circle class="s" cx="12" cy="14.6" r="1.5"/>',
  harta:'<rect x="3.5" y="4" width="9" height="16" rx="2"/><rect x="14.5" y="4" width="6" height="7" rx="2"/><rect x="14.5" y="13" width="6" height="7" rx="2"/><circle class="s" cx="8" cy="12" r="1.6"/>',
  bec:'<path d="M9 17h6v-2.2a6 6 0 1 0-6 0z"/><path d="M10 20.5h4"/><circle class="s" cx="12" cy="9.5" r="1.6"/>',
  lista:'<path d="M9.5 6H20M9.5 12H20M9.5 18H20"/><circle cx="4.8" cy="6" r="1.4"/><circle cx="4.8" cy="18" r="1.4"/><circle class="s" cx="4.8" cy="12" r="1.7"/>',
  raport:'<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14.5 3v4.5H19M9 12h7M9 16h5"/><circle class="s" cx="17.5" cy="17.5" r="1.7"/>',
  puls:'<path d="M3 12h4l2.2-5 4 10 2.2-5H21"/><circle class="s" cx="21" cy="12" r="1.6"/>',
  inima:'<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z"/><circle class="s" cx="12" cy="12.5" r="1.7"/>',
  trofeu:'<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6M12 14v3M8.5 20.5h7"/><circle class="s" cx="12" cy="8" r="1.5"/>',
  monede:'<ellipse cx="9.5" cy="7.5" rx="5.5" ry="2.5"/><path d="M4 7.5v4c0 1.4 2.5 2.5 5.5 2.5M4 11.5v4c0 1.4 2.5 2.5 5.5 2.5"/><ellipse cx="15.5" cy="14" rx="5" ry="2.3"/><path d="M10.5 14v3.7c0 1.3 2.2 2.3 5 2.3s5-1 5-2.3V14"/><circle class="s" cx="19.5" cy="5" r="1.6"/>',
  descarca:'<path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 16.5v1.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-1.5"/><circle class="s" cx="12" cy="4" r="1.4"/>',
  tinta:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle class="s" cx="12" cy="12" r="1.7"/>',
  glob:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/><circle class="s" cx="19" cy="5" r="1.6"/>',
  carte:'<path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5z"/><path d="M12 6.5V20"/><circle class="s" cx="16.5" cy="10" r="1.5"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8.5 3v4M15.5 3v4"/><circle class="s" cx="15.5" cy="15" r="1.7"/>',
  scut:'<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/><circle class="s" cx="19.5" cy="4.5" r="1.4"/>',
  paleta:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.6-1.8-.3-1.3.7-2.2 1.9-2.2H18a2.5 2.5 0 0 0 2.5-2.5A8.5 8.5 0 0 0 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle class="s" cx="15" cy="8" r="1.5"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><circle class="s" cx="12" cy="12" r="1.4"/>',
  info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle class="s" cx="12" cy="7.8" r="1.4"/>',
  mana:'<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7-2.4 0-4-1.2-5.2-3l-2.3-3.7a1.5 1.5 0 0 1 2.5-1.6L8 14"/><circle class="s" cx="20" cy="4" r="1.4"/>',
  racheta:'<path d="M14 4c3.5 0 6 2.5 6 6-1.5 3-4.5 6-8 7.5L6.5 12C8 8.5 11 5.5 14 4z"/><path d="M6.5 12 4 11.5 6 8.5h3.5M12 17.5l.5 2.5 3-2V14.5M5.5 15.5c-1.5 1-2 3-2 5 2 0 4-.5 5-2"/><circle class="s" cx="14.5" cy="9.5" r="1.7"/>',
  nucleu:'<circle cx="12" cy="12" r="3.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><circle class="s" cx="21.3" cy="12" r="1.5"/>',
  portofel:'<path d="M3.5 7.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 7.5 15 3.5l1.5 4"/><circle class="s" cx="16.5" cy="14" r="1.6"/>',
  profil:'<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5"/><circle class="s" cx="18.5" cy="5" r="1.5"/>',
  alerta:'<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5"/><circle class="s" cx="12" cy="17" r="1.3"/>',
  extern:'<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  ochi:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><circle class="s" cx="12" cy="12" r="1.2"/>',
  stea:'<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/><circle class="s" cx="12" cy="12" r="1.4"/>',
  sageata:'<path d="M5 12h13M13 6.5 18.5 12 13 17.5"/><circle class="s" cx="5" cy="12" r="1.6"/>',
};
const ic = (n, c='') => `<svg class="ico ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]||''}</svg>`;
// Titlurile secțiunilor primesc automat iconița potrivită.
const SEC_ICO = [[/ETF-uri pentru/,'nucleu'],[/Lecția zilei/,'bec'],[/Bazele/,'carte'],[/Strategia/,'nucleu'],[/Cum citești/,'puls'],[/Costuri și taxe/,'monede'],[/Psihologia/,'inima'],[/Instrumente/,'scut'],[/Dicționar/,'carte'],[/Harta/,'harta'],[/De știut/,'bec'],[/Poziți/,'lista'],[/Probleme/,'alerta'],[/Profilul/,'profil'],[/Ce cumperi/,'portofel'],[/Unde poți ajunge/,'racheta'],[/ETF-ul de bază/,'nucleu'],[/De ce/,'carte'],
  [/Sănătatea/,'inima'],[/față de totul|față de VWCE/i,'trofeu'],[/De unde vine/,'monede'],[/se mișcă/,'puls'],[/Alocare/,'tinta'],[/Calendar/,'calendar'],[/Monede/,'glob'],[/Școala/,'carte'],[/Decizii/,'raport'],[/Impozit/,'raport'],[/Conturi/,'portofel'],[/ambele conturi/,'link'],
  [/Conexiuni/,'link'],[/Securitate/,'scut'],[/Aspect/,'paleta'],[/Gesturi/,'mana'],[/Pornire/,'racheta']];
function iconiteSectiuni(root=document){
  root.querySelectorAll('.sec h2').forEach(h=>{ if (h.dataset.ic) return; const t=h.textContent, m=SEC_ICO.find(([re])=>re.test(t)); if (m) { h.insertAdjacentHTML('afterbegin', ic(m[1],'sic')); h.dataset.ic=1; } });
}
// Butoanele brokerilor, cu metoda verificată pe telefon (Honor 90, oct. 2026):
// eToro: linkul web al portofoliului trimis direct aplicației → se deschide aplicația.
// Trading 212: aplicația nu acceptă să fie pornită dintr-o pagină web (9 metode încercate în 0.16.x), deci butonul
// deschide pagina ei din Magazin Play, de unde apeși „Deschide”. Pe calculator: site-ul.
const BROKER = {
  t212: { nume:'Trading 212', pkg:'com.avuscapital.trading212', web:'https://app.trading212.com', prinPlay:true },
  etoro:{ nume:'eToro', pkg:'com.etoro.openbook', cale:'www.etoro.com/portfolio', web:'https://www.etoro.com/portfolio' } };
const eAndroid = () => /Android/i.test(navigator.userAgent);
const PLAY = k => 'https://play.google.com/store/apps/details?id='+BROKER[k].pkg;
function linkBroker(k){ const b=BROKER[k]; if (!eAndroid()) return b.web;
  return b.prinPlay ? `intent://launch?id=${b.pkg}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(PLAY(k))};end`
    : `intent://${b.cale}#Intent;scheme=https;package=${b.pkg};S.browser_fallback_url=${encodeURIComponent(PLAY(k))};end`; }
const butonBroker = k => `<a class="brk ${k}" href="${esc(linkBroker(k))}" ${eAndroid()?'':'target="_blank" rel="noopener noreferrer"'} data-c="${A('vib')}"><span class="bm">${k==='t212'?'212':'eT'}</span><span><b>${BROKER[k].nume}</b><small>${eAndroid()&&BROKER[k].prinPlay?'Magazin Play → Deschide':'Deschide aplicația'}</small></span>${ic('extern','ex')}</a>`;
const butoaneBrokeri = () => `<div class="brks">${butonBroker('t212')}${butonBroker('etoro')}</div>`;

// ===== Mișcarea: crește, scade, stagnează =====
const MISC = p => { const x = intraValid() ? INTRA.pozitii.find(y=>y.symbol===p.symbol)?.var : null; return x ?? p.ind?.r1z ?? null; };
const tr = (x, prag=0.3) => x==null||isNaN(x) ? 'flat' : x > prag ? 'up' : x < -prag ? 'down' : 'flat';
const TCOL = {up:'--pos', down:'--neg', flat:'--flat'};
const mv = (x, lg, prag) => { const t=tr(x,prag); return `<span class="mv ${lg?'lg':''} ${t}">${x==null||isNaN(x)?'–':t==='flat'?'● '+sg(x,2)+'%':(x>0?'▲ ':'▼ ')+nf(Math.abs(x),2)+'%'}</span>`; };
const momentZi = () => intraValid() ? 'azi' : 'la ultima închidere';
// Câștigul zilei în lei: din prețul de acum (intraday) sau din ultima închidere.
function ziua(poz){
  const iv = intraValid();
  return poz.reduce((a,p)=>{ const x=MISC(p); return x==null?a:a+p.valueRON*x/(iv?100:100+x); },0);
}
// Harta zilei: dreptunghiuri cât ponderea, colorate după mișcare (algoritmul „squarified”).
function squarify(items, x, y, w, h){
  const out=[]; let rest=items.filter(i=>i.v>0);
  const worst=(r,sh)=>{ const s=r.reduce((a,b)=>a+b.v,0), mx=Math.max(...r.map(z=>z.v)), mn=Math.min(...r.map(z=>z.v)); return Math.max(sh*sh*mx/(s*s), s*s/(sh*sh*mn)); };
  while (rest.length) {
    const sh=Math.min(w,h); let row=[rest[0]], i=1;
    while (i<rest.length && worst([...row,rest[i]],sh) <= worst(row,sh)) { row.push(rest[i]); i++; }
    const s=row.reduce((a,b)=>a+b.v,0);
    if (w>=h) { const cw=s/h; let cy=y; for (const r of row) { const ch=r.v/cw; out.push({...r,x,y:cy,w:cw,h:ch}); cy+=ch; } x+=cw; w-=cw; }
    else { const rh=s/w; let cx=x; for (const r of row) { const cw=r.v/rh; out.push({...r,x:cx,y,w:cw,h:rh}); cx+=cw; } y+=rh; h-=rh; }
    rest=rest.slice(i);
  }
  return out;
}
function harta(poz){
  const W=Math.min(innerWidth-28,732), H=210, tot=poz.reduce((a,p)=>a+p.valueRON,0); if(!tot) return '';
  const it=[...poz].sort((a,b)=>b.valueRON-a.valueRON).map(p=>({p, v:p.valueRON/tot*W*H}));
  return `<div class="tmap" data-noswipe>${squarify(it,0,0,W,H).map(({p,x,y,w,h})=>{ const m=MISC(p), t=tr(m), k=Math.round(30+60*Math.min(Math.abs(m||0)/3,1));
    const bg = t==='flat' ? '#3b4757' : `color-mix(in srgb,var(${TCOL[t]}) ${k}%,#1c2430)`;
    return `<button class="${w<54||h<38?'mic':''}" style="left:${x/W*100}%;top:${y/H*100}%;width:${w/W*100}%;height:${h/H*100}%;background:${bg}" data-c="${A('detaliu',p.symbol)}" aria-label="${esc(p.symbol)} ${sg(m,2)}%"><b>${esc(p.symbol)}</b><span class="num">${m==null?'':sg(m,1)+'%'}</span></button>`; }).join('')}</div>`;
}
// „De știut”: cartonașe cu cifra, limita și ce înseamnă pentru tine.
function deStiut(){
  const pr=P(), out=[], T=SNAP.totalRON, suma=sumaPlan(), azi=new Date().toISOString().slice(0,10);
  for (const [t,v] of Object.entries(SNAP.teme).sort((a,b)=>b[1]-a[1])) if (!t.startsWith('ETF') && t!=='Altele' && v>pr.maxTema)
    out.push({k:'--warn', ic:'◎', titlu:'Prea mult într-un singur sector', val:nf(v,1)+'%', sub:`sectorul „${t}”, plafonul tău e ${pr.maxTema}%`, g:[v,pr.maxTema,100],
      text:`Acțiunile din același sector scad împreună. Dacă sectorul pierde 30%, portofoliul pierde aproximativ ${S.privat?'•••':nf(T*v/100*0.3,0)} lei, adică ${nf(v*0.3,1)}% din tot.`, gl:'tema'});
  for (const p of [...SNAP.pozitii].sort((a,b)=>b.pondere-a.pondere)) if (!p.etf && p.pondere>pr.maxActiune*2)
    out.push({k:'--reechilibreaza', ic:'⚖', titlu:`${p.symbol} a crescut peste locul ei`, val:nf(p.pondere,1)+'%', sub:`din portofoliu, plafonul pe acțiune e ${pr.maxActiune}%`, g:[p.pondere,pr.maxActiune,Math.max(p.pondere*1.2,30)],
      text:'Nu trebuie să vinzi. Depunerile noi merg în altă parte și îi scad treptat ponderea. Vânzarea parțială e mai rapidă, dar câștigul se impozitează cu 16%.', act:['detaliu',p.symbol]});
  const etf=SNAP.pozitii.filter(p=>p.etf).reduce((a,p)=>a+p.valueRON,0), etfP=etf/T*100, luni=M?M.luniPanaLaTinta(etf,T,pr,suma):null;
  if (etfP < pr.tintaETF-5) out.push({k:'--acc', ic:'◉', titlu:'ETF-ul de bază e încă mic', val:nf(etfP,1)+'%', sub:`în ETF global, ținta ta e ${pr.tintaETF}%`, g:[etfP,pr.tintaETF,100],
    text:luni==null?`Cu acțiuni în portofoliu, ținta de ${pr.tintaETF}% se atinge doar vânzându-le. Depunerile în ETF doar te apropie de ea.`:`Cu ${suma} ${de(suma)}lei pe lună, toți în ETF, ajungi la țintă în aproximativ ${luni} ${de(luni)}${luni===1?'lună':'luni'}, fără să vinzi nimic.`, gl:'nucleu'});
  const usd=SNAP.valute?.USD||0;
  if (usd>60) out.push({k:'--asteapta', ic:'$', titlu:'Mult în dolari', val:nf(usd,1)+'%', sub:'din portofoliu e în acțiuni listate în dolari', g:[usd,60,100],
    text:`Câștigi și cheltui în lei. Dacă dolarul scade cu 10% față de leu, pierzi aproximativ ${S.privat?'•••':nf(T*usd/100*0.1,0)} lei, chiar dacă acțiunile stau pe loc.`});
  const rez=SNAP.pozitii.filter(p=>p.rezultate && p.rezultate>=azi && (Date.parse(p.rezultate)-Date.parse(azi))/864e5<=14).sort((a,b)=>a.rezultate.localeCompare(b.rezultate));
  if (rez.length) out.push({k:'--opor', ic:'◷', titlu:'Rezultate trimestriale curând', val:rez.length===1?rez[0].symbol:`${rez.length} companii`, sub:rez.map(p=>`${p.symbol}, ${ziRo(p.rezultate,false)}`).join(' · '),
    text:'În ziua rezultatelor, prețul poate sări 5–15% în orice direcție. Nu cumpăra chiar înainte. După, citește ce s-a anunțat.'});
  if (SNAP.dubluri?.length) out.push({k:'--pastreaza', ic:'⇄', titlu:'Aceleași acțiuni în două conturi', val:'2 conturi', sub:'Trading 212 și eToro', text:SNAP.dubluri[0]+' Mutarea ar însemna vânzare și impozit.'});
  return out;
}
function deStiutHTML(){
  const c=deStiut(); if(!c.length) return '';
  return `<div class="sec"><h2>De știut · ${c.length}</h2><span class="sub">glisează</span></div>
  <div class="car" id="car" data-noswipe onscroll="const i=Math.round(this.scrollLeft/(this.firstElementChild.offsetWidth+10));document.querySelectorAll('#dots i').forEach((d,k)=>d.classList.toggle('on',k===i))">${c.map(x=>`
    <div class="card ks" style="--k:var(${x.k})" ${x.act?`data-c="${esc(JSON.stringify(x.act))}"`:x.gl?`data-c="${A('termen',x.gl)}"`:''}>
      <div style="display:flex;gap:10px;align-items:center"><span class="ic">${x.ic}</span><h4>${esc(x.titlu)}</h4></div>
      <div class="val num">${esc(x.val)}</div><div class="sub">${esc(x.sub)}</div>
      ${x.g?`<div class="gauge"><i style="width:${Math.min(x.g[0]/x.g[2]*100,100)}%"></i><b style="left:${Math.min(x.g[1]/x.g[2]*100,100)}%"></b></div>`:''}
      <p>${link(x.text)}</p></div>`).join('')}</div>
  ${c.length>1?`<div class="dots" id="dots">${c.map((_,i)=>`<i class="${i?'':'on'}"></i>`).join('')}</div>`:''}`;
}
function spark(v){
  if(!v||v.length<2) return '<span></span>';
  const W=70,H=28,lo=Math.min(...v),hi=Math.max(...v),X=i=>i/(v.length-1)*(W-4)+2,Y=x=>H-3-(H-6)*((x-lo)/((hi-lo)||1));
  const c=TCOL[tr((v[v.length-1]/v[0]-1)*100, 1)], d=v.map((x,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(x).toFixed(1)).join(''), id='sp'+(spark.n=(spark.n||0)+1);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(${c});stop-opacity:.28"/><stop offset="1" style="stop-color:var(${c});stop-opacity:0"/></linearGradient></defs><path d="${d}L${X(v.length-1)} ${H}L2 ${H}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="var(${c})" stroke-width="1.7" stroke-linejoin="round"/><circle cx="${X(v.length-1)}" cy="${Y(v[v.length-1])}" r="2.5" fill="var(${c})"/></svg>`;
}
// Culoarea fiecărui sector (aceeași în avatar, hartă orbitală și alocare).
const culoareTema = t => (BUCKETE().find(b=>b.n===t)||{c:'--s1'}).c;
// Sigla vine din eToro (data URI, salvată criptat în analiză). Fără siglă: inițialele pe culoarea sectorului.
const sigla = p => typeof p.logo==='string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(p.logo) ? p.logo : '';
// ===== Culoarea fiecărei acțiuni, luată din sigla ei =====
// Se citește pe telefon dintr-un canvas (sigla e deja în datele criptate). Siglele fără culoare clară (negre, albe, gri)
// păstrează culoarea sectorului. Luminozitatea se ajustează ca textul și butoanele să rămână lizibile în ambele sectoare.
const CUL = {};
function rgbHsl(r,g,b){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, d=mx-mn; if(!d) return [0,0,l];
  const s=d/(1-Math.abs(2*l-1)), h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4; return [(h*60+360)%360, s, l]; }
function hslHex(h,s,l){ const a=s*Math.min(l,1-l), f=n=>{ const k=(n+h/30)%12; return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0'); }; return '#'+f(0)+f(8)+f(4); }
function culoareDin(img){
  const W=40, cv=document.createElement('canvas'); cv.width=cv.height=W; const x=cv.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0,W,W);
  const d=x.getImageData(0,0,W,W).data, B=Array.from({length:36},()=>({w:0,h:0,s:0,n:0})); let vizibili=0;
  for (let i=0;i<d.length;i+=4) { if (d[i+3]<128) continue; vizibili++; const [h,sat,l]=rgbHsl(d[i],d[i+1],d[i+2]); if (sat<0.28||l<0.14||l>0.9) continue;
    const w=sat*(1-Math.abs(l-0.5)*1.4), k=Math.floor(h/10)%36; B[k].w+=w; B[k].h+=h*w; B[k].s+=sat*w; B[k].n++; }
  let best=-1, bw=0; B.forEach((b,k)=>{ const w=b.w+(B[(k+35)%36].w+B[(k+1)%36].w)*0.5; if (w>bw) { bw=w; best=k; } });
  if (best<0 || B[best].n < vizibili*0.06) return null; // siglă monocromă
  return { h: B[best].h/B[best].w, s: Math.min(Math.max(B[best].s/B[best].w,0.5),0.88) };
}
function culoriActiune(sym){ const c=CUL[sym]; if(!c) return null; const luminos = cssv('--panel').toLowerCase()==='#ffffff', l = luminos?0.42:0.6;
  const hex=hslHex(c.h,c.s,l), [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255), L=0.2126*r+0.7152*g+0.0722*b;
  return { c:hex, c2:hslHex((c.h+28)%360,c.s,l), ink: L>0.45?'#06121f':'#ffffff' }; }
function pregatesteCulori(){ let rest=0, gasit=false;
  for (const p of SNAP?.pozitii||[]) { const l=sigla(p); if (!l || p.symbol in CUL) continue; CUL[p.symbol]=null; rest++; const im=new Image();
    const gata=()=>{ if (--rest===0 && gasit && V && !$('sheet').classList.contains('on') && !VT_ACUM) render(); }; // o singură redesenare, când sunt gata toate
    im.onload=()=>{ try { CUL[p.symbol]=culoareDin(im); gasit = gasit || !!CUL[p.symbol]; } catch(e) { CUL[p.symbol]=null; } gata(); }; im.onerror=gata; im.src=l; } }
function avErr(im){ const a=im.parentNode; a.classList.remove('img'); a.textContent=im.dataset.t||''; }
const avatar = (p, m) => { const l=sigla(p), t=esc(p.symbol.replace(/\..*$/,'').slice(0,4)), cl=l&&culoriActiune(p.symbol); return l ? `<span class="av img${m?' '+m:''}" style="--c:${cl?cl.c:`var(${culoareTema(p.tema)})`}"><img src="${l}" alt="" loading="lazy" decoding="async" data-t="${t}" data-er="${A('avErr','$el')}"></span>` : `<span class="av${m?' '+m:''}${p.virtual?' vt':''}" style="--c:var(${culoareTema(p.tema)})">${t}</span>`; };
function inelLuna(mic){
  const tinta = sumaPlan(), inv = investitLuna(), facut = lunaFacuta(), k = facut ? 1 : Math.min(inv/tinta,1), n = serieLuni();
  const R=mic?13:18, W=mic?34:46, C=2*Math.PI*R, c=W/2;
  const ring = `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" aria-hidden="true" style="flex:none"><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(--panel2)" stroke-width="${mic?4:5}"/>
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(${facut?'--pos':'--acc'})" stroke-width="${mic?4:5}" stroke-linecap="round" stroke-dasharray="${(C*k).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>
    ${facut?`<path d="M${c-6} ${c+.5}l4 4 7.5-8" fill="none" stroke="var(--pos)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`:''}</svg>`;
  const txt = `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${facut?'Ai investit luna asta':'De investit luna asta'}</div>
      <div class="sub num">${inv>0?`Confirmat din cont: ${S.privat?'•••':nf(inv,0)} lei`:facut?'Bifat manual':`Planul lunii: ${tinta} lei`}${n>1?` · <b class="ink2">${n} ${de(n)}luni la rând</b>`:''}</div></div>`;
  return mic ? `<div class="hfoot" data-c="${A('go','plan')}">${ring}${txt}<span class="ch">›</span></div>` : `<div class="card" style="display:flex;align-items:center;gap:14px;padding:12px 16px">${ring}${txt}</div>`;
}
const TODO_IC = {'--opor':'stea','--verifica':'alerta','--pos':'scut','--acc':'portofel','--asteapta':'calendar'};
function vAzi(){
  const C = CONTURI.some(([k])=>k===S.cont) ? S.cont : 'toate', VC = vedereCont(C);
  const pnl = VC.total - VC.cost, pc = VC.cost ? pnl/VC.cost*100 : 0;
  const iv = intraValid() ? Object.fromEntries(INTRA.pozitii.map(x=>[x.symbol,x])) : null;
  const SORT = {semnal:(a,b)=>(ORD[sem(a)]-ORD[sem(b)])||(b.pondere-a.pondere), pondere:(a,b)=>b.pondere-a.pondere, castig:(a,b)=>b.pnlPct-a.pnlPct,
    azi:(a,b)=>((MISC(b) ?? -1e9)-(MISC(a) ?? -1e9))};
  const poz = [...VC.poz].sort(SORT[S.sort]||SORT.semnal);
  const zi = ziua(VC.poz), ziP = VC.total-zi ? zi/(VC.total-zi)*100 : 0, t = tr(ziP, 0.15);
  const c = ceFac(), ist = (IST||[]).filter(x=>x.totalRON).slice(-60);
  const tIst = ist.length>5 ? tr((ist.at(-1).totalRON/ist[0].totalRON-1)*100, 0.5) : 'flat';
  let h = '';
  // 1) Portofoliul: totalul, ziua, câștigul, luna
  h += `<div class="card hcard ${t}">
    <div class="row" style="gap:8px"><div class="seg mini" data-noswipe>${CONTURI.map(([k,tt])=>`<button class="${C===k?'on':''}" data-c="${A('setCont',k)}">${tt}</button>`).join('')}</div>
      <button class="eye" aria-label="${S.privat?'Arată sumele':'Ascunde sumele'}" data-c="${A('comutaPrivat')}">${ic('ochi')}${S.privat?'Arată':'Ascunde'}</button></div>
    <div class="lbl" style="margin-top:16px">Valoare totală</div>
    <div class="hero num big" ${S.privat?'':`data-count="${VC.total.toFixed(2)}"`}>${S.privat?'•••••':nf(VC.total)}<small>lei</small></div>
    <div class="kpi3 num">
      <div><span>${momentZi()==='azi'?'Azi':'Ultima zi'}</span>${mv(ziP,1,0.15)}<small>${sgL(zi,0)} lei</small></div>
      <div><span>Câștig total</span>${mv(pc,1,0.5)}<small>${S.privat?'•••':sg(pnl)} lei</small></div>
      ${C==='toate'&&SNAP.randament?.anual!=null?`<div data-c="${A('termen','xirr')}"><span>Pe an, real</span><b class="${cls(SNAP.randament.anual)}">${sg(SNAP.randament.anual,1)}%</b><small>${SNAP.randament.vwce?.anual!=null?`VWCE ${sg(SNAP.randament.vwce.anual,1)}%`:'pe banii tăi'}</small></div>`:''}
    </div>
    ${VC.usd?`<div class="sub num" style="margin-top:8px">În dolari, ca în aplicația eToro: <b class="ink2">$${S.privat?'•••':nf(VC.usd.v)}</b> · <span class="${cls(VC.usd.v-VC.usd.c)}">${S.privat?'•••':(VC.usd.v-VC.usd.c>=0?'+':'−')+'$'+nf(Math.abs(VC.usd.v-VC.usd.c))}</span></div>`:''}
    ${C!=='toate'?`<div class="sub" style="margin-top:8px">${VC.poz.length} ${VC.poz.length===1?'poziție':'poziții'} · ${nf(VC.total/SNAP.totalRON*100,1)}% din portofoliu. Semnalele și planul țin cont de ambele conturi.</div>`:''}
    ${C==='toate'&&ist.length>5?`<div style="margin-top:14px">${lineChart({series:[{name:'Valoarea ta',short:'Tu',v:ist.map(x=>x.totalRON),color:TCOL[tIst]==='--flat'?'--s1':TCOL[tIst]},{name:'Totul în VWCE',short:'Totul în VWCE',v:ist.map(x=>x.bench),color:'--mut',dash:1,w:1.5}],x:ist.map(x=>x.azi),H:120,area:1,privat:1,fmt:x=>nf(x,0)+' lei',aria:'Valoarea ta față de VWCE, ultimele 60 de zile'})}</div>`:''}
    ${C!=='eToro'?inelLuna(true):''}
    ${surseLinie()}</div>`;
  // 2) Ce ai de făcut
  h += `<div class="card todo" style="--k:var(${c.k})"><div style="display:flex;gap:14px;align-items:flex-start"><span class="tic">${ic(TODO_IC[c.k]||'bec')}</span><div style="flex:1;min-width:0"><div class="tag">${esc(c.tag)}</div><h3>${esc(c.titlu)}</h3>${c.text?`<p>${link(c.text)}</p>`:''}</div></div>
    ${c.acts.length?`<div class="acts">${c.acts.map((a,i)=>`<button class="btn sm ${i?'ghost':''}" data-c="${esc(JSON.stringify(a[1]))}">${esc(a[0])}</button>`).join('')}</div>`:''}
    ${c.extra?`<div class="sub" style="margin-top:8px">și încă ${c.extra} ${c.extra===1?'semnal':'semnale'} mai jos</div>`:''}</div>`;
  if (SNAP.paza?.global) h += `<div class="al err"><b>Date de verificat.</b> ${esc(SNAP.paza.motiv)} Semnalele de azi au fost oprite.</div>`;
  if (SNAP.cashNeinvestit?.lei >= 20 && C!=='eToro') h += `<div class="al">Bani neinvestiți în ${esc(SNAP.cashNeinvestit.broker)}: ${S.privat?'•••':nf(SNAP.cashNeinvestit.lei)} lei. Îi poți folosi la cumpărarea din planul lunii.</div>`;
  // 3) Pozițiile: listă sau harta zilei
  const viz = S.vizAzi==='harta' ? 'harta' : 'lista';
  const sus = VC.poz.filter(p=>tr(MISC(p))==='up').length, jos = VC.poz.filter(p=>tr(MISC(p))==='down').length;
  h += `<div class="sec"><h2>${C==='toate'?'Pozițiile tale':'Pozițiile din '+esc(C)} ${q(viz==='harta'?'harta':'pondere')}</h2><span class="sub num"><span class="up">▲ ${sus}</span> · <span class="down">▼ ${jos}</span> · ${poz.length}</span></div>
  <div class="vbar" data-noswipe><div class="seg vis">${[['lista','Listă'],['harta','Hartă']].map(([k,t])=>`<button class="${viz===k?'on':''}" data-c="${A('setViz',k)}">${ic(k==='lista'?'lista':'harta')}${t}</button>`).join('')}</div></div>
  ${viz==='lista'?`<div class="sortr" data-noswipe role="group" aria-label="Ordonează pozițiile după"><div class="chips">${[['semnal','Semnal'],['pondere','Pondere'],['castig','Câștig'],['azi',iv?'Azi':'Ziua']].map(([k,t])=>`<button class="${(S.sort||'semnal')===k?'on':''}" data-c="${A('setSort',k)}">${t}</button>`).join('')}</div></div>`:''}
  ${viz==='harta'?`<div class="card" style="padding:8px">${harta(VC.poz)}</div>`:''}
  ${viz==='lista'?`<div class="card list">` + poz.map((p,k)=>{ const m=MISC(p), s=sem(p); return `
    <div class="pr" data-s="${esc(p.symbol)}" style="animation-delay:${k*25}ms;--t:var(${TCOL[tr(m)]})" data-c="${A('deschideDetaliu',p.symbol,'$av')}">
      ${avatar(p)}
      <div style="min-width:0"><div class="s">${p.oportunitate||iv?.[p.symbol]?.oportunitate?'<span class="star">★ </span>':''}${esc(p.symbol)}</div><div class="n"><span class="sd" style="color:var(${SEMC[s]})">● ${SEM[s]}</span> ${esc(p.name||'')}</div>
        ${p.deVerificat?'<div class="sub" style="color:var(--warn)">⚠ date de verificat</div>':''}
        ${p.peCont?`<div class="sub num" style="margin-top:4px">${nf(p.pondere,1)}% din cont${p.valueUSD!=null&&!S.privat?` · $${nf(p.valueUSD)}`:''}</div>`:`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;white-space:nowrap">${wbar(p).replace('class="wb"','class="wb" style="width:48px;flex:none"')}<span class="sub num">${nf(p.pondere,1)}% / ${nf(p.tinta,0)}%</span></div>`}</div>
      ${spark(p.serie?.c?.slice(-30))}
      <div class="r"><b class="num fd" style="font-size:15px">${lei(p.valueRON,0)}</b>${mv(m)}<span class="sub num ${cls(p.pnlPct)}">${sg(p.pnlPct,1)}% total</span></div>
    </div>`; }).join('') + `</div>`:''}`;
  // 4) Pe scurt: de știut, raportul, lecția zilei
  // 4) De știut
  h += deStiutHTML();
  // 5) Raportul de dimineață
  if (RAP) {
    const linii = RAP.split('\n'), i = linii.findIndex(l=>/^##\s+Pe scurt/i.test(l)), puncte = [];
    for (let k=i+1; i>=0 && k<linii.length && !/^#/.test(linii[k]); k++) { const m=linii[k].match(/^\s*[-*]\s+(.*)/); if(m) puncte.push(m[1]); }
    const titlu = (linii.find(l=>/^#\s/.test(l))||'# Raportul de dimineață').replace(/^#\s+/,'');
    h += `<div class="sec"><h2>Raportul de dimineață</h2></div><div class="card rapc" data-c="${A('raport')}"><div class="row"><span class="lbl">${esc(titlu)}</span><span class="link">Citește tot ›</span></div>
      ${puncte.length?`<ul style="margin:8px 0 0;padding-left:18px;color:var(--ink2);font-size:14px">${puncte.slice(0,3).map(x=>`<li style="margin:3px 0">${md(x).replace(/^<p>|<\/p>$/g,'')}</li>`).join('')}</ul>`:''}</div>`;
  }
  // Lecția zilei, din tabul Învață
  { const lz = lectiaZilei(), n = TOATE_LECTIILE().filter(l=>citit(l.id)).length;
    if (!citit(lz.id)) h += `<div class="sec"><h2>Lecția zilei</h2><button class="link" data-c="${A('go','invata')}">${n} din ${TOATE_LECTIILE().length} ›</button></div><button class="card lz" data-c="${A('deschideLectie',lz.id)}"><span class="tic" style="--k:var(--acc)">${ic(lz.m.ic)}</span><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:15.5px">${esc(lz.t)}</div><div class="sub">${esc(lz.k)}</div></div><span class="ch">›</span></button>`; }
  const zv = zileVechi();
  if (live() && zv > 3.5) h += `<div class="al err">Ultima analiză are ${Math.floor(zv)} zile. Verifică în GitHub → Actions dacă rulările au eșuat.</div>`;
  if (SNAP.erori?.length) h += `<div class="sec"><h2>Probleme la ultima rulare</h2></div>${SNAP.erori.map(a=>`<div class="al err">${esc(a)}</div>`).join('')}`;
  return h;
}

// Un motiv din analiză: „+ …” în favoare, „− …” împotrivă, „· …” neutru.
function motiv(m){ const t=m[0], c=t==='+'?'--pos':t==='−'?'--neg':'--mut', ic=t==='+'?'▲':t==='−'?'▼':'●';
  return `<li style="display:flex;gap:10px;align-items:baseline"><span style="color:var(${c});font-size:${ic==='●'?'8':'10'}px;flex:none;width:12px;text-align:center">${ic}</span><span>${link(m.replace(/^[+−·]\s*/,''))}</span></li>`; }

// ===== Detaliu poziție =====
let DET = {sym:null, zile:126};
// O linie de „radiografie”: etichetă, valoare și o bară cu zone, marcaj și, opțional, o țintă.
function rg({t, v, k='--acc', min=0, max=100, x, zone=[], tinta, cent, gl, nota}){
  const pz = a => Math.min(Math.max((a-min)/(max-min)*100,0),100);
  const bar = cent!=null
    ? `<i class="fill" style="background:var(${k});${x>=cent?`left:${pz(cent)}%;width:${pz(x)-pz(cent)}%`:`left:${pz(x)}%;width:${pz(cent)-pz(x)}%`}"></i><b class="mid" style="left:${pz(cent)}%"></b>`
    : `<i class="fill" style="background:var(${k});width:${pz(x)}%"></i>`;
  return `<div class="rg" ${gl?`data-c="${A('termen',gl)}"`:''}><div class="row"><span>${t}${gl?' <span class="q" style="pointer-events:none">?</span>':''}</span><b class="num" style="color:var(${k})">${v}</b></div>
    <div class="trk">${zone.map(([a,b,c])=>`<i class="zn" style="left:${pz(a)}%;width:${pz(b)-pz(a)}%;background:var(${c})"></i>`).join('')}${bar}${tinta!=null?`<b class="tg" style="left:${pz(tinta)}%"></b>`:''}<i class="dotm" style="left:${pz(x)}%;background:var(${k})"></i></div>
</div>`;
}
function radiografie(p){
  const i = p.ind || {}, e = SNAP.etfRef || {}, out = [];
  if (i.sma200) { const d=(i.pret/i.sma200-1)*100; out.push(rg({t:'Trend lung (față de media de 200 de zile)', v:sg(d,1)+'%', k:d>=0?'--pos':'--neg', min:-40, max:40, x:d, cent:0, gl:'m200', nota:d>=0?'Prețul e peste media lungă: trendul e în sus.':'Prețul e sub media lungă: trendul e în jos.'})); }
  if (i.rsi!=null) { const r=i.rsi; out.push(rg({t:'Viteza ultimelor săptămâni (RSI)', v:nf(r,0), k:r>70?'--warn':r<30?'--opor':'--acc', x:r, zone:[[0,30,'--opor'],[70,100,'--warn']], gl:'rsi', nota:r>70?'A urcat foarte repede. De obicei urmează o pauză.':r<30?'A scăzut foarte repede. Poate fi un preț bun, dacă motivul de a o ține e valabil.':'Zonă normală.'})); }
  if (!p.etf && i.protectie) { const d=(i.pret/i.protectie-1)*100; out.push(rg({t:'Distanța până la nivelul de alertă', v:sg(d,1)+'%', k:d<5?'--warn':'--pos', min:0, max:40, x:Math.max(d,0), zone:[[0,5,'--warn']], gl:'prot', nota:d<0?'Prețul e sub nivelul de alertă.':`Ar trebui să scadă ${nf(d,1)}% ca să atingă pragul.`})); }
  out.push(rg({t:'Pondere în portofoliu', v:`${nf(p.pondere,1)}% <span class="mut" style="font-weight:500">/ țintă ${nf(p.tinta,0)}%</span>`, k:p.pondere>p.tinta*1.5&&!p.etf?'--warn':'--acc', max:Math.max(p.pondere,p.tinta)*1.4||10, x:p.pondere, tinta:p.tinta, gl:'pondere'}));
  if (!p.etf && i.r1a!=null && e.r1a!=null) { const d=i.r1a-e.r1a; out.push(rg({t:'Față de VWCE, pe ultimul an', v:sg(d,1)+' pp', k:d>=0?'--pos':'--neg', min:-60, max:60, x:Math.max(Math.min(d,60),-60), cent:0, gl:'pp', nota:`${esc(p.symbol)} ${sg(i.r1a,1)}%, VWCE ${sg(e.r1a,1)}%.`})); }
  if (p.rec) { const b=(p.rec.strongBuy||0)+(p.rec.buy||0), h=p.rec.hold||0, s=(p.rec.sell||0)+(p.rec.strongSell||0), t=b+h+s||1;
    out.push(`<div class="rg" data-c="${A('termen','analisti')}"><div class="row"><span>Ce spun analiștii <span class="q" style="pointer-events:none">?</span></span><b class="num">${b+h+s} analiști</b></div>
      <div class="trk stk"><i style="width:${b/t*100}%;background:var(--pos)"></i><i style="width:${h/t*100}%;background:var(--flat)"></i><i style="width:${s/t*100}%;background:var(--neg)"></i></div>
      <div class="sub" style="margin-top:3px"><span class="up">${b} cumpărare</span> · ${h} păstrare · <span class="down">${s} vânzare</span></div></div>`); }
  const f = p.fund || {};
  const chips = [f.pe!=null?[`P/E ${nf(f.pe,0)}`, f.pe>60?'--warn':f.pe>0&&f.pe<15?'--pos':'--flat','pe']:null, f.crestereVenit!=null?[`Venituri ${sg(f.crestereVenit,0)}%/an`, f.crestereVenit>15?'--pos':f.crestereVenit<0?'--neg':'--flat',null]:null,
    i.atrPct!=null?[`Mișcare zilnică ~${nf(i.atrPct,1)}%`,'--flat','atr']:null, p.rezultate?[`Rezultate ${ziRo(p.rezultate,false)}`,'--opor',null]:null].filter(Boolean);
  return out.join('') + (chips.length?`<div class="chips" style="margin-top:12px">${chips.map(([t,k,g])=>`<button class="num" style="color:var(${k});border-color:color-mix(in srgb,var(${k}) 35%,var(--line))" ${g?`data-c="${A('termen',g)}"`:''}>${t}</button>`).join('')}</div>`:'');
}
function detaliu(sym, zile){
  const p = SNAP.pozitii.find(x=>x.symbol===sym); if(!p) return;
  if (sym!==DET.sym || !zile) DET = {sym, zile: DET.zile||126, det:false, nota:false, ad:'sub'}; if (zile) DET.zile = zile;
  const i = p.ind || {}, se = p.serie, u = sem(p), col = culoareTema(p.tema);
  let graf = '';
  if (se?.c?.length > 5) {
    const PER = [[21,'1 lună'],[63,'3 luni'],[126,'6 luni'],[252,'1 an']].filter(([z],k)=>k===0 || se.c.length >= z*0.9);
    if (!PER.some(([z])=>z===DET.zile)) DET.zile = PER.at(-1)[0];
    const k = Math.max(0, se.c.length - DET.zile - 1), c = se.c.slice(k), rp = (c.at(-1)/c[0]-1)*100, tp = tr(rp, 0.5), lc = TCOL[tp]==='--flat'?'--s1':TCOL[tp];
    const prot = !p.etf && i.protectie;
    graf = `<div class="card" style="padding:12px 12px 10px;margin-top:12px"><div class="seg" style="margin:0 0 10px">${PER.map(([z,t])=>`<button class="${DET.zile===z?'on':''}" data-c="${A('detaliu',sym,z)}">${t}</button>`).join('')}</div>
      <div class="row" id="rper" style="margin-bottom:6px"><span class="sub">În ultimele ${esc(PER.find(([z])=>z===DET.zile)[1])}</span>${mv(rp,0,0.5)}</div>`
      + lineChart({series:[{name:'Preț',short:'Preț',v:c,color:lc},{name:'Media de 50 de zile',short:'Media 50 de zile',v:se.m50.slice(k),color:'--mut',w:1.4}], x:se.d.slice(k), fmt:x=>nf(x)+' '+(p.moneda||''),
          h: prot?[{v:i.protectie,color:'--warn',eticheta:''}]:[], area:1, aria:`Prețul ${p.symbol}`})
      + `<div class="leg"><span><i style="background:var(${lc})"></i>Preț</span><span><i style="background:var(--mut)"></i>Media de 50 de zile</span>${prot?`<span style="color:var(--warn)"><i class="d" style="background:var(--warn)"></i><button class="term" data-c="${A('termen','prot')}">Nivel de alertă</button>&nbsp;<b class="num">${nf(i.protectie)}</b></span>`:''}</div></div>`;
  }
  const VIC = {uita:'alerta', cumpara:'portofel', las:'scut'};
  const cl = culoriActiune(p.symbol), stil = cl ? `--c:${cl.c};--acc:${cl.c};--acc2:${cl.c2};--accInk:${cl.ink}` : `--c:var(${col})`;
  const html = `<div class="fisa" style="${stil}"><div class="dh"><div class="grab"></div>
    <div style="display:flex;gap:14px;align-items:center">${avatar(p,'lg')}<div style="flex:1;min-width:0"><div class="row"><div class="fd" style="font-size:26px;font-weight:700">${p.oportunitate?'<span class="star">★ </span>':''}${esc(p.symbol)}</div>${chip(u)}</div>
      <div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name||'')}</div><div class="sub" style="color:var(${col})">● ${esc(p.tema)}</div></div></div>
    <div class="row" style="margin-top:16px;align-items:flex-end"><div><div class="hero num" style="font-size:34px;margin:0">${nf(i.pret)}<small>${esc(p.moneda||'')}</small></div><div class="sub">preț de închidere</div></div>
      <div style="text-align:right">${mv(MISC(p),1)}<div class="sub" style="margin-top:4px">${momentZi()}</div></div></div></div>
  <div class="vd" style="--k:var(${SEMC[u]})">${ic(VIC[u])}<div>${link(verdict(p))}</div></div>
  ${graf}
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
    <div class="st">${ic('portofel')}<div class="lbl" style="font-size:10.5px">Valoare</div><div class="fd" style="font-weight:700;margin-top:3px">${lei(p.valueRON,0)}</div><div class="sub" style="font-size:11px">${p.brokers.length>1?'2 conturi':esc(p.brokers[0].broker)}</div></div>
    <div class="st">${ic('monede')}<div class="lbl" style="font-size:10.5px">Câștig</div><div class="fd ${cls(p.pnlPct)}" style="font-weight:700;margin-top:3px">${sg(p.pnlPct,1)}%</div><div class="sub" style="font-size:11px">${sgL(p.pnlRON,0)} lei</div></div>
    <div class="st" data-c="${A('termen','pondere')}">${ic('tinta')}<div class="lbl" style="font-size:10.5px">Pondere</div><div class="fd" style="font-weight:700;margin-top:3px">${nf(p.pondere,1)}%</div><div class="sub" style="font-size:11px">țintă ${nf(p.tinta,0)}%</div></div>
  </div>
  <div class="sec"><h2>Indicatorii acțiunii</h2></div><div class="card" style="padding:6px 14px 14px">${radiografie(p)}</div>
  ${alerteHTML(p)}
  <button class="sec" style="width:100%;background:none;border:0;padding:0;cursor:pointer" aria-expanded="${!!DET.det}" data-c="${A('detComuta',sym)}"><h2>Detalii</h2><span class="sub">${DET.det?'ascunde ▴':'motive, cifre, conturi ▾'}</span></button>
  ${DET.det?`<div class="card"><div class="lbl" style="margin:0 0 2px">Semnalul motorului: ${esc(ETI[p.semnal])}</div>
  ${p.atentie.slice(u==='uita'?1:0).map(a=>`<div class="al" style="margin-top:8px">${link(a)}</div>`).join('')}
  ${p.oportunitate?`<div class="al good" style="margin-top:8px">★ ${link(p.oportunitate)}</div>`:''}
  <ul class="m">${p.motive.map(motiv).join('')||'<li>Date insuficiente</li>'}</ul></div>
  <div class="sec"><h2>Poziția ta</h2></div><div class="card"><div class="kv num">
    <span>Câștig în lei</span><span class="${cls(p.pnlRON)}">${sgL(p.pnlRON)} lei</span>
    ${p.brokers.map(b=>`<span>${esc(b.broker)} (${esc(b.symbol)})</span><span>${lei(b.valueRON)}</span>`).join('')}
    ${!p.etf&&i.protectie?`<span>Nivel de alertă ${q('prot')}</span><span>${nf(i.protectie)} (${sg((i.protectie/i.pret-1)*100,1)}%)</span>`:''}
    <span>Monedă</span><span>${esc(p.moneda)}</span></div></div>
  <div class="sec"><h2>Fundamentale și indicatori</h2></div><div class="card"><div class="kv num">
    <span>P/E ${q('pe')}</span><span>${nf(p.fund?.pe,1)}</span>
    <span>Creșterea veniturilor</span><span>${p.fund?.crestereVenit==null?'–':sg(p.fund.crestereVenit,1)+'%'}</span>
    <span>Media de 50 de zile ${q('m50')}</span><span>${nf(i.sma50)}</span>
    <span>Media de 200 de zile ${q('m200')}</span><span>${nf(i.sma200)}</span>
    <span>Față de maximul pe 3 luni</span><span>${sg(i.deLaMaxim3l,1)}%</span>
    <span>Randament 3 luni / 6 luni / 1 an</span><span>${sg(i.r3l,1)}% / ${sg(i.r6l,1)}% / ${sg(i.r1a,1)}%</span>
    ${p.rezultate?`<span>Rezultate trimestriale</span><span>${ziRo(p.rezultate)}</span>`:''}</div></div>`:''}
  ${inPlan(p.symbol)?`<div style="margin-top:14px">${butoaneBrokeri()}</div>`:''}
  ${DET.nota?`<input id="jnota" placeholder="Ce vrei să ții minte despre ${esc(p.symbol)}?" maxlength="300"><button class="btn" data-c="${A('notaJurnal',p.symbol)}">Salvează nota</button>`
    :`<button class="link" style="display:block;margin:16px auto 4px" data-c="${A('detNota',sym)}">+ Notează ceva despre ${esc(p.symbol)}</button>`}
  <button class="btn ghost" style="margin-top:10px" data-c="${A('closeSheet')}">Închide</button></div>`;
  if ($('sheet').classList.contains('on') && zile) { const st=$('sheet').scrollTop; $('sheet').innerHTML = html; iconiteSectiuni($('sheet')); montaGrafice(); $('sheet').scrollTop=st; return; }
  openSheet(html);
}
function notaJurnal(sym){ vib();
  const t = $('jnota').value.trim(); if (!t) { toast('Scrie nota întâi.'); return; }
  const p = SNAP.pozitii.find(x=>x.symbol===sym), etf = SNAP.pozitii.find(x=>x.etf);
  J.unshift({ id: Date.now(), data: new Date().toISOString().slice(0,10), symbol: sym, actiune: 'altceva', semnal: p.semnal,
    pret: p.ind?.pret ?? null, pretETF: etf?.ind?.pret ?? null, nota: t });
  if (saveJ()) { DET.nota=false; detaliu(sym, DET.zile); toast('Notat. O găsești în Analiză → Deciziile tale.'); }
}
// Foi pe două niveluri: o explicație se deschide peste detaliu fără să-l închidă.
function openSheet(html){
  const lvl2 = $('sheet').classList.contains('on'), sh = $(lvl2?'sheet2':'sheet'), vl = $(lvl2?'veil2':'veil');
  sh.innerHTML = html; iconiteSectiuni(sh); esalon(sh.querySelector(":scope>.fisa")||sh); sh.scrollTop = 0; vl.classList.add('on'); sh.classList.add('on'); document.documentElement.classList.add('blocat'); history.pushState({s:lvl2?2:1},''); montaGrafice();
}
function closeSheet(fromPop){
  if (!$('sheet').classList.contains('on') && !$('sheet2').classList.contains('on')) return;
  if (VT_ACUM && document.documentElement.dataset.vt==='inchide') return; // se închide deja
  const lvl2 = $('sheet2').classList.contains('on'), a = !lvl2 && $('sheet').querySelector('.dh .av'), li = a && DET.sym && document.querySelector(`.pr[data-s="${CSS.escape(DET.sym)}"] .av`);
  if (a && li && VT() && li.getBoundingClientRect().bottom > 0 && li.getBoundingClientRect().top < innerHeight) {
    a.style.viewTransitionName = 'avsel';
    const t = tranzitie(()=>{ a.style.viewTransitionName=''; inchideFoaia(fromPop); li.style.viewTransitionName='avsel'; }, 'inchide');
    t?.finished.finally(()=>{ li.style.viewTransitionName=''; }); if (t) return;
  }
  inchideFoaia(fromPop);
}
function inchideFoaia(fromPop){
  const lvl2 = $('sheet2').classList.contains('on'), sh = $(lvl2?'sheet2':'sheet'), vl = $(lvl2?'veil2':'veil');
  if (!sh.classList.contains('on')) return; // deja închisă (de exemplu, două închideri la rând în timpul tranziției)
  sh.classList.remove('on'); vl.classList.remove('on');
  if (!$('sheet').classList.contains('on')) document.documentElement.classList.remove('blocat');
  if(!fromPop && history.state?.s) { IGNORE_POP=true; history.back(); }
}
// history.back() declanșat de noi nu trebuie să mai închidă încă o foaie
let IGNORE_POP=false;
addEventListener('popstate',()=>{ if(IGNORE_POP){ IGNORE_POP=false; return; } if($('sheet2').classList.contains('on')||$('sheet').classList.contains('on')) closeSheet(true); });

// ===== Plan =====
const TREPTE_TEXT = {
  'foarte lung':'Ai timp să treci prin mai multe crize și să le recuperezi. Acțiunile alese de tine pot avea jumătate din portofoliu, iar ETF-ul global cealaltă jumătate.',
  'lung':'Standardul pentru investiția pe termen lung: 60% ETF global, 40% acțiunile tale. O criză de bursă are timp să se recupereze.',
  'mediu spre lung':'Încă ai timp de recuperare după o criză, dar ponderea acțiunilor individuale scade: 70% ETF și cel mult 7% pe o acțiune.',
  'mediu':'O criză de bursă poate dura 3–5 ani până se recuperează. Majoritatea banilor (80%) stau în nucleul diversificat.',
  'scurt':'Banii îți trebuie curând. Aproape totul stă în ETF-ul global. Pentru suma de care ai nevoie sigur, ia în calcul titluri de stat sau un depozit.',
  'foarte scurt':'Bursa nu e locul pentru bani de care ai nevoie în 1–2 ani: o scădere de 20–30% poate veni oricând. Variantele potrivite sunt titlurile de stat (Fidelis, Tezaur) sau depozitul. Analistul aplică regulile cele mai prudente.'};
const SUME = [50,100,200,350,500,1000];
function editeaza(o){ ED = {...(ED||profilUser()), ...o}; ED.suma = Math.min(Math.max(Math.round(+ED.suma||0),10),100000); aplicaProfil(); vib(); render(); }
function vPlan(){
  const pr = P(), u = profilUser(), e = ED || u, s = pr.contributieTipica, plan = SNAP.planuri?.[s] || [];
  const etf = SNAP.pozitii.filter(p=>p.etf).reduce((a,p)=>a+p.valueRON,0), etfP = etf/SNAP.totalRON*100;
  const luni = M ? M.luniPanaLaTinta(etf, SNAP.totalRON, pr, s) : null;
  let h = '';
  // Profilul: suma lunară și orizontul
  h += `<div class="sec" style="margin-top:6px"><h2>Profilul tău</h2>${ED?'<span class="sub" style="color:var(--warn)">previzualizare, nesalvat</span>':u.sincronizat===false?'<button class="link" data-c="[&quot;sincronizeazaProfil&quot;]">Trimite în GitHub ↻</button>':''}</div>
  <div class="card" data-noswipe>
    <div class="lbl">Cât investești pe lună</div>
    <div class="stepper" style="margin-top:8px"><button class="ib" style="width:46px;height:46px;font-size:22px" aria-label="Mai puțin" data-c="${A('sumaPas',-1)}">−</button>
      <input id="psuma" type="number" inputmode="numeric" min="10" step="10" value="${e.suma}" data-ch="${A('setSuma','$val')}" aria-label="Suma lunară în lei">
      <span class="sub" style="font-size:15px">lei</span>
      <button class="ib" style="width:46px;height:46px;font-size:22px" aria-label="Mai mult" data-c="${A('sumaPas',1)}">+</button></div>
    <div class="chips">${SUME.map(v=>`<button class="num ${v===e.suma?'on':''}" data-c="${A('setSuma',v)}">${v}</button>`).join('')}</div>
    <div class="row" style="margin-top:18px"><span class="lbl">Orizont</span><b class="num" id="ho">${pr.orizontAni} ${de(pr.orizontAni)}${pr.orizontAni===1?'an':'ani'} · până în ${pr.anTinta}</b></div>
    <input type="range" min="1" max="40" value="${pr.orizontAni}" aria-label="Orizontul în ani" data-in="${A('orizontLive','$val')}" data-ch="${A('setOrizont','$val')}">
    <div class="sub">Peste câți ani ai nevoie de bani. Orizontul scade singur în fiecare an, iar regulile devin treptat mai prudente.</div>
    <div class="row" style="margin-top:18px"><span class="lbl">Ținta în ETF global ${q('nucleu')}</span><b class="num" id="hte">${pr.tintaETF}%</b></div>
    <input type="range" min="0" max="100" step="1" value="${pr.tintaETF}" aria-label="Ținta în ETF global, în procente" data-in="${A('tintaLive','$val')}" data-ch="${A('setTinta','$val')}">
    <div class="sub">${pr.tintaETFProprie?`Aleasă de tine. Pentru orizontul tău, recomandarea e <b class="ink2">${pr.tintaETFRecomandat}%</b>. <button class="link" data-c="${A('setTinta',null)}">Revino la recomandat</button>`:`Recomandată pentru orizontul tău. O poți schimba oricând: restul planului se adaptează.`}</div>
    ${pr.tintaETFProprie && pr.tintaETF < pr.tintaETFRecomandat-15 ? `<div class="al" style="margin:8px 0 0">Cu ${pr.tintaETF}% în ETF, portofoliul depinde mai mult de acțiunile alese de tine: crește mai mult în anii buni, dar scade mai tare în crize. Plafoanele pe acțiune și pe sector rămân.</div>`:''}
    <div class="tier num"><div><b>${pr.tintaETF}%</b><span>ETF global</span></div><div><b>${pr.maxActiune}%</b><span>maxim pe acțiune</span></div><div><b>${pr.maxTema}%</b><span>maxim pe sector</span></div></div>
    <div class="sub" style="margin-top:10px;font-size:13.5px;line-height:1.55;color:var(--ink2)">Orizont ${esc(pr.treapta)}. ${esc(TREPTE_TEXT[pr.treapta]||'')}</div>
    ${ED?`<div class="acts" style="display:flex;gap:8px;margin-top:14px"><button class="btn" style="flex:1" data-c="${A('salveazaProfil')}">Salvează</button><button class="btn ghost" style="flex:1" data-c="${A('renuntaProfil')}">Renunță</button></div>`:''}
  </div>`;
  if (pr.orizontAni < 3) h += `<div class="al err">Pentru bani de care ai nevoie în mai puțin de 3 ani, acțiunile sunt riscante. Analistul nu te oprește, dar varianta prudentă e să muți treptat suma necesară în titluri de stat sau într-un depozit.</div>`;
  // Ce cumperi
  h += `${SNAP.cashNeinvestit?.lei>=20?`<div class="al" style="margin-top:12px">Ai deja bani neinvestiți în ${esc(SNAP.cashNeinvestit.broker)}: ${S.privat?'•••':nf(SNAP.cashNeinvestit.lei)} lei. Depui doar diferența.</div>`:''}
  <div class="sec"><h2>Ce cumperi luna asta</h2>${lunaFacuta()?`<span class="sub pos">✓ ${investitLuna()>0?'confirmat din cont':'bifat manual'}</span>`:`<span class="sub num">${s} lei</span>`}</div>
  ${plan.length?plan.map((l,k)=>`<div class="card" style="animation:rise .3s ${k*60}ms both;border-left:3px solid var(--adauga)">
    <div class="row"><div><div style="font-size:19px;font-weight:800">${esc(l.symbol)}${SNAP.virtuale?.some(v=>v.symbol===l.symbol)?' <span class="eti">ETF nou, ales de tine</span>':''}</div><div class="sub">la ${esc(l.broker)}</div></div><div class="hero num" style="font-size:26px">${nf(l.suma,0)}<small>lei</small></div></div>
    ${l.unitati?`<div class="num" style="margin-top:10px;font-size:14.5px">≈ <b>${nf(l.sumaValuta)} ${esc(l.moneda)}</b> · <b>${nf(l.unitati,4)}</b> ${l.unitati===1?'acțiune':'acțiuni'} la ${nf(l.pret)} ${esc(l.moneda)}</div>`:''}
    <div class="sub" style="margin-top:6px">${l.comision?`Comision valutar: aproximativ ${nf(l.comision)} lei (0,15%). `:''}${l.orar?`Cumpără <b class="ink2">${l.orar.interval}</b>, ${esc(l.orar.motiv)}.`:''}</div>
    <div class="sub" style="margin-top:6px">${esc(l.motiv)} → după cumpărare <b class="ink2">${nf(l.dupa,1)}%</b></div>
    ${l.nota?`<div class="al" style="margin:8px 0 0">${esc(l.nota)}</div>`:''}</div>`).join(''):`<div class="card sub">Nicio poziție nu are nevoie de bani noi luna asta.</div>`}
  ${!ED?`${butoaneBrokeri()}${!lunaFacuta()?`<button class="btn" style="margin-top:10px" data-c="${A('planFacut')}">Am investit</button>`:''}`:''}
  <div class="sub" style="margin:10px 2px 0">${s<100?`Cu ${s} ${de(s)}lei, planul face o singură cumpărare: comisionul și fracțiunile de acțiune ar mânca din sume mai mici. `:''}Planul ține cont de ținte, plafoane, rezultatele trimestriale și acțiunile care au urcat prea repede. Nu presupune vânzări, deci nici impozit.</div>`;
  // Acțiunile tale: care pot primi bani noi
  h += portofoliuHTML(pr);
  // Idei noi: ETF-uri și acțiuni pentru diversificare, decizia e a ta
  h += recomandariHTML(pr);
  // Proiecția la orizont
  h += proiectieHTML(pr);
  // ETF-ul de bază
  // Alocarea: acum (inelul interior) și ținta (inelul exterior); reacționează pe loc la glisoare
  h += `<div class="sec"><h2>Alocarea ta ${q('alocare')}</h2><span class="sub">acum → ținta</span></div>${alocareHTML(pr, s)}`;
  h += `<div class="sec"><h2>De ce ${pr.tintaETF} / ${100-pr.tintaETF}</h2></div><div class="card" style="font-size:14.5px;color:var(--ink2);line-height:1.6">
    <p style="margin-top:0">Ai ${pr.orizontAni} ${de(pr.orizontAni)}${pr.orizontAni===1?'an':'ani'} în față și depui ${s} ${de(s)}lei pe lună. Partea principală stă într-un ETF global: <b class="ink2">VWCE</b> are mii de companii din toată lumea, iar riscul unei singure companii aproape dispare.</p>
    <p>Restul de ${100-pr.tintaETF}% rămâne pentru acțiunile alese de tine. Aici poți câștiga mai mult decât piața, dar și pierde mai mult. De aceea nicio acțiune nu trece de ${pr.maxActiune}% și nicio <button class="term" data-c="${A('termen','tema')}">sector</button> de ${pr.maxTema}%.</p>
    <p style="margin-bottom:0">${(()=>{const [tn,tp]=Object.entries(SNAP.teme).filter(([n])=>!n.startsWith('ETF')).sort((a,b)=>b[1]-a[1])[0]||['',0];
      return `Acum ai ${nf(etfP,1)}% în ETF${tp>pr.maxTema?`, iar sectorul „${esc(tn)}” are ${nf(tp,1)}%: riscul e concentrat pe același sector`:''}. `})()}Ajungi la țintă doar din depuneri, fără să vinzi.</p></div>`;
  return h;
}

// ===== Stil comun: antetul foilor, intrarea eșalonată =====
const capFoaie = (icon, titlu, sub, col='--acc') => `<div class="grab"></div><div class="cap"><span class="tic" style="--k:var(${col})">${ic(icon)}</span><div style="min-width:0"><h3>${esc(titlu)}</h3>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div></div>`;
function esalon(root){ let i=0; for (const el of root.children) { if (el.matches('.card,.sec,.al,.tiles,.lz,.btn,.lect,.rec,.qo,.brks')) { el.style.setProperty('--i', Math.min(i++, 14)); } } root.classList.remove('intra'); void root.offsetWidth; root.classList.add('intra'); }
// ===== Învață: școala de investiții, pe module, cu cifrele tale =====
const NR = x => S.privat ? '•••' : nf(x,0);
const MODULE = [
 { id:'baza', t:'Bazele', ic:'carte', l:[
  { id:'actiune', t:'Ce cumperi când cumperi o acțiune', p:['O acțiune e o bucată mică dintr-o companie. Dacă firma câștigă mai mult în timp, crește și valoarea bucății tale.','Prețul de zi cu zi mișcă după știri și emoții. Pe termen lung, contează aproape doar profiturile companiei.'], k:'Cumperi o afacere, nu un bilet la loterie.' },
  { id:'etf', t:'Ce e un ETF', p:['Un ETF e un coș cu multe acțiuni, cumpărat dintr-o singură tranzacție. VWCE are în jur de 3.700 de companii din toată lumea.','Dacă o companie dispare, pierderea se simte abia: are o pondere foarte mică. Costul e mic, sub 0,2% pe an pentru ETF-urile mari.'], tu:()=>{ const e=SNAP.pozitii.filter(p=>p.etf&&!p.virtual).reduce((a,p)=>a+p.pondere,0); return `Acum ai ${nf(e,1)}% din portofoliu în ETF-ul global.`; }, k:'Un ETF global e cel mai simplu mod de a deține toată economia lumii.' },
  { id:'compus', t:'Dobânda compusă', p:['Câștigul de anul ăsta produce câștig anul viitor. Primii ani par lenți, ultimii cresc vizibil mai repede.','La 7% pe an, banii se dublează în aproximativ 10 ani. Regula de 72: împarți 72 la randamentul anual și afli în câți ani se dublează.'], tu:()=>{ if(!M) return ''; const pr=P(), sc=M.scenarii(SNAP.totalRON,pr.contributieTipica,pr.orizontAni); return `Cu ${pr.contributieTipica} ${de(pr.contributieTipica)}lei pe lună, în ${pr.orizontAni} ${de(pr.orizontAni)}ani, la 6% pe an ajungi la aproximativ ${NR(sc.mediu.valoare)} lei. Depui ${NR(sc.mediu.depus)} lei.`; }, k:'Timpul face mai mult decât alegerea momentului.' },
  { id:'inflatie', t:'De ce investești: inflația', p:['Inflația scade puterea de cumpărare a banilor ținuți în cont. La 5% inflație pe an, 1.000 de lei de azi cumpără peste 10 ani cât 600 de lei azi.','Acțiunile au bătut inflația pe perioade lungi, pentru că firmele își cresc prețurile odată cu ea.'], k:'Banii ținuți pe loc pierd din valoare în fiecare an.' },
  { id:'risc', t:'Risc și randament', p:['Nu există randament mare fără risc. Acțiunile au crescut în medie mai mult decât depozitele, dar pot scădea cu 30–50% într-un an prost.','Riscul real nu e scăderea temporară, ci să ai nevoie de bani exact când piața e jos. De asta contează orizontul.'], k:'Cu cât ai mai mult timp, cu atât poți suporta mai mult risc.' },
 ], quiz:[
  { q:'Ce înseamnă să deții o acțiune?', o:['Un împrumut dat companiei','O bucată din companie','Un pariu pe prețul de mâine'], ok:1, d:'Acționarul deține o parte din firmă și din profiturile ei viitoare.' },
  { q:'În aproximativ câți ani se dublează banii la 8% pe an?', o:['5 ani','9 ani','15 ani'], ok:1, d:'Regula de 72: 72 / 8 = 9 ani.' },
  { q:'Care e riscul cel mai mare pentru un investitor pe termen lung?', o:['O scădere de 20% într-o lună','Să aibă nevoie de bani când piața e jos','Să rateze o acțiune la modă'], ok:1, d:'Scăderile trec. Problema apare când ești obligat să vinzi la minim.' } ] },
 { id:'strategie', t:'Strategia ta', ic:'nucleu', l:[
  { id:'nucleu', t:'ETF de bază și acțiuni alese', p:['ETF-ul de bază e un fond global care urmează toată piața. Restul sunt acțiunile alese de tine, unde ai șansa să bați piața, dar și riscul.','Partea mare din ETF îți dă liniște. Acțiunile alese îți dau ocazia, fără să-ți strice planul dacă greșești.'], tu:()=>`Ținta ta pentru ETF e ${P().tintaETF}%${P().tintaETFProprie?' (aleasă de tine)':''}.`, k:'Partea mare stabilă, partea mică pentru idei.' },
  { id:'dca', t:'Investiția lunară bate ghicitul momentului', p:['Când cumperi lunar aceeași sumă, iei mai multe unități când prețul e jos și mai puține când e sus. Prețul tău mediu ajunge mai bun decât media prețurilor.','Cine așteaptă „momentul perfect” stă de obicei pe margine tocmai în zilele bune de după scăderi.'], tu:()=>{ const n=serieLuni(); return n>1?`Ai investit ${n} ${de(n)}luni la rând. Continuă.`:'Seria ta de luni investite apare pe Acasă.'; }, k:'Regularitatea contează mai mult decât momentul.' },
  { id:'diversificare', t:'Diversificarea adevărată', p:['Zece acțiuni din aceeași industrie nu înseamnă diversificare: scad toate odată când industria are probleme.','Uită-te la corelații, nu la numărul de acțiuni. „Diversificarea reală” din Analiză arată câte poziții ai cu adevărat.'], tu:()=>{ const c=corelatiiPortofoliu(); return c?`Portofoliul tău are ${nf(c.ne,1)} poziții cu adevărat diferite din ${c.poz.length} poziții.`:''; }, k:'Contează cât de diferit se mișcă pozițiile, nu câte sunt.' },
  { id:'reechilibrare', t:'Reechilibrarea fără vânzări', p:['Când o acțiune crește mult, ajunge să ocupe prea mult loc. Varianta clasică e să vinzi o parte și să plătești impozit.','Varianta ta: nu mai cumperi din ea și pui banii noi în rest. Durează mai mult, dar nu plătești 16% pe câștig.'], tu:()=>{ const t=SNAP.pozitii.filter(p=>!p.etf&&!p.virtual).sort((a,b)=>b.pondere-a.pondere)[0]; return t&&t.pondere>P().maxActiune?`${t.symbol} are ${nf(t.pondere,1)}%, plafonul e ${P().maxActiune}%. Planul lunar o ocolește singur.`:''; }, k:'Banii noi repară dezechilibrul fără taxe.' },
  { id:'orizont', t:'Orizontul schimbă tot', p:['Cu 20 de ani în față, o criză e doar un episod. Cu 3 ani, poate strica planul.','De aceea, pe măsură ce te apropii de momentul în care ai nevoie de bani, mutăm treptat greutatea spre ETF și obligațiuni.'], tu:()=>`Ai ${P().orizontAni} ${de(P().orizontAni)}ani până în ${P().anTinta}. Regulile se ajustează singure an de an.`, k:'Mai mult timp, mai multe acțiuni. Mai puțin timp, mai multă siguranță.' },
 ], quiz:[
  { q:'De ce cumperi lunar aceeași sumă?', o:['Ca să prinzi minimul','Ca prețul mediu să iasă bun fără să ghicești','Pentru că așa cere brokerul'], ok:1, d:'Suma fixă cumpără mai mult când e ieftin, automat.' },
  { q:'NVDA, AMD și TSM în același portofoliu înseamnă…', o:['Trei poziții cu adevărat diferite','Aproape aceeași poziție','Diversificare perfectă'], ok:1, d:'Depind de aceeași industrie și se mișcă adesea împreună.' },
  { q:'Cum reduci o poziție prea mare fără impozit?', o:['O vinzi pe toată','Pui banii noi în celelalte','O muți la alt broker'], ok:1, d:'Depunerile noi îi scad treptat ponderea, fără vânzare.' } ] },
 { id:'piata', t:'Cum citești piața', ic:'puls', l:[
  { id:'trend', t:'Trendul: media de 200 de zile', p:['Media de 200 de zile e prețul mediu din ultimele ~10 luni de bursă. Peste ea, trendul lung e în sus. Sub ea, în jos.','E cel mai folosit filtru de trend, dar nu prezice nimic singur. E context, nu semnal de cumpărare.'], k:'Folosește trendul ca să eviți să cumperi în cădere liberă.' },
  { id:'rsi', t:'Viteza: RSI', p:['RSI măsoară cât de repede s-a mișcat prețul în ultimele trei săptămâni, de la 0 la 100.','Peste 70 a urcat foarte repede: de obicei urmează o pauză. Sub 30 a scăzut foarte repede. Nu spune nimic despre calitatea companiei.'], k:'RSI te ajută să nu cumperi pe euforie.' },
  { id:'rezultate', t:'Rezultatele trimestriale', p:['De patru ori pe an, companiile își raportează veniturile și profiturile. Prețul poate sări 5–15% într-o zi, în orice direcție.','Nu cumpăra chiar înainte de rezultate. După, citește ce s-a anunțat: contează mai ales prognozele pentru trimestrele următoare.'], k:'În ziua rezultatelor, ai răbdare.' },
  { id:'semnale', t:'Cum citești semnalele analistului', p:['„Cumpără luna asta”: e în planul tău, cu suma exactă. „Las-o”: nimic de făcut. „Uită-te la ea”: ceva s-a schimbat și merită 5 minute.','Semnalele vin din reguli simple și statistici, nu din predicții. Analistul nu spune niciodată „vinde”: decizia e a ta.'], k:'Fiecare semnal are motivele lui în fișa acțiunii.' },
  { id:'valuta', t:'Riscul valutar: dolarul și leul', p:['Acțiunile americane sunt în dolari. Dacă dolarul scade cu 10% față de leu, pierzi aproximativ 10% din valoarea lor în lei, chiar dacă prețul în dolari a rămas pe loc.','Pe termen lung, efectul se mai echilibrează. Pe termen scurt poate șterge câștigul unui an. Un portofoliu cu euro, dolari și alte monede e mai liniștit decât unul doar în dolari.'], tu:()=>{ const u=SNAP.valute?.USD||0; return `Acum ai ${nf(u,0)}% în dolari. O scădere de 10% a dolarului ar însemna aproximativ ${NR(SNAP.totalRON*u/100*0.1)} lei.`; }, k:'Câștigi și cheltui în lei, deci contează și moneda.' },
  { id:'pe', t:'Evaluarea: P/E', p:['P/E e prețul acțiunii împărțit la profitul pe acțiune: cât plătești pentru 1 leu de profit.','Peste 60 e scump, sub 15 e ieftin, dar o companie care crește repede poate merita un P/E mare. Compară P/E-ul cu creșterea profitului.'], tu:()=>{ const s=SNAP.pozitii.filter(p=>p.fund?.pe).sort((a,b)=>b.fund.pe-a.fund.pe)[0]; return s?`Cea mai scumpă acțiune a ta după P/E e ${s.symbol}, cu ${nf(s.fund.pe,0)}.`:''; }, k:'Scump sau ieftin depinde de cât de repede crește compania.' },
 ], quiz:[
  { q:'Prețul e sub media de 200 de zile. Ce înseamnă?', o:['Sigur va crește','Trendul lung e în jos','Compania e ieftină'], ok:1, d:'E doar context despre trend, nu o predicție.' },
  { q:'RSI 78 înseamnă…', o:['A urcat foarte repede','Compania e foarte bună','E momentul ideal de cumpărat'], ok:0, d:'Peste 70, prețul a urcat foarte repede. De obicei urmează o pauză.' },
  { q:'Când e mai prudent să cumperi o acțiune cu rezultate săptămâna viitoare?', o:['Înainte de rezultate','După rezultate','Nu contează'], ok:1, d:'Rezultatele pot muta prețul brusc. După ele știi mai mult.' } ] },
 { id:'costuri', t:'Costuri și taxe', ic:'monede', l:[
  { id:'ter', t:'Costurile mici contează mult', p:['ETF-urile au un cost anual (TER), scăzut direct din preț: VWCE are 0,14% pe an din iulie 2026.','La Trading 212 plătești 0,15% comision valutar la fiecare cumpărare în altă monedă decât leul. Pe 10 ani, 0,5% pe an în plus mănâncă aproximativ 5% din valoarea finală.'], tu:()=>SNAP.costuri?`Costul tău estimat e ${NR(SNAP.costuri.totalAn)} lei pe an, ${nf(SNAP.costuri.procentAn,2)}% din portofoliu.`:'', k:'Fiecare 0,1% economisit rămâne la tine, cu dobândă compusă.' },
  { id:'impozit', t:'Impozitul pe câștig', p:['La brokerii străini declari singur câștigul net din vânzări, în Declarația Unică, până pe 25 mai anul următor. Cota e 16%.','Contează doar ce vinzi. Pierderile din același an se scad din câștiguri. Dacă veniturile din investiții trec de pragul anual, datorezi și CASS: verifică pragul în anul respectiv.'], tu:()=>SNAP.realizat?`Anul ăsta, impozitul estimat e ${NR(SNAP.realizat.impozitEstimat)} lei.`:'', k:'Ce ții în portofoliu nu se impozitează, oricât ar crește.' },
  { id:'dividende', t:'Dividendele și impozitul lor', p:['Unele companii îți plătesc o parte din profit. Pentru acțiunile americane, SUA rețin de obicei 10% la sursă, dacă ai completat formularul W-8BEN la broker.','În România, dividendele se declară în Declarația Unică. Impozitul plătit deja în SUA se scade din cel datorat aici.'], tu:()=>SNAP.dividende?`Estimarea ta: ${NR(SNAP.dividende.estimatAn)} lei pe an din dividende.`:'', k:'Dividendele sunt bani reali, dar se declară.' },
  { id:'acumulare', t:'Acumulare sau distribuire', p:['Un ETF cu acumulare (Acc) își reinvestește singur dividendele: tu nu primești bani și nu ai ce declara până nu vinzi.','Unul cu distribuire (Dist) îți plătește dividendele în cont. Pentru construirea averii pe termen lung, varianta Acc e de obicei mai simplă.'], k:'VWCE e de acumulare: crește fără să-ți dea de lucru la declarație.' },
 ], quiz:[
  { q:'Ce impozitezi dintr-un portofoliu de acțiuni?', o:['Valoarea totală','Câștigul din ce ai vândut','Fiecare cumpărare'], ok:1, d:'Doar câștigul realizat, adică din vânzări, se impozitează.' },
  { q:'TER-ul unui ETF se plătește…', o:['Separat, o dată pe an','Direct din prețul ETF-ului','La vânzare'], ok:1, d:'Costul anual e scăzut continuu din valoarea fondului.' },
  { q:'Un ETF de acumulare…', o:['Îți trimite dividendele','Reinvestește dividendele','Nu are dividende'], ok:1, d:'Dividendele companiilor rămân în fond și cresc prețul lui.' } ] },
 { id:'mintea', t:'Psihologia', ic:'inima', l:[
  { id:'panica', t:'Nu vinde în panică', p:['Piața globală a avut scăderi de 20–50% de mai multe ori și și-a revenit de fiecare dată, uneori în luni, alteori în ani.','Cine vinde în panică transformă o scădere temporară într-o pierdere permanentă.'], k:'Planul se face pe vreme bună și se respectă pe furtună.' },
  { id:'fomo', t:'Teama de a rata (FOMO)', p:['Când o acțiune a urcat 100% și toată lumea vorbește de ea, e tentant să intri. De obicei, cea mai mare parte a creșterii a trecut deja.','Analistul te oprește prin RSI și plafoane, nu prin predicții.'], k:'Ce e pe toate buzele e rareori ieftin.' },
  { id:'pierderea', t:'Pierderea doare de două ori mai mult', p:['Studiile arată că o pierdere de 100 de lei doare cam cât bucuria unui câștig de 200 de lei. De aceea tindem să vindem câștigătorii prea devreme și să ținem pierzătorii prea mult.','Întreabă-te mereu: dacă n-aș avea-o, aș cumpăra-o azi?'], k:'Judecă acțiunea, nu prețul la care ai cumpărat-o.' },
  { id:'plan', t:'Planul scris: regulile tale, dinainte', p:['Investitorii buni își scriu regulile când piața e liniștită: cât pun lunar, ce procent stă în ETF, când cumpără și ce îi face să vândă.','În criză nu mai iei decizii, doar urmezi planul. Aplicația ține regulile tale în Plan: suma, orizontul, ținta ETF și plafoanele.'], tu:()=>`Regulile tale: ${P().contributieTipica} ${de(P().contributieTipica)}lei pe lună, ${P().tintaETF}% în ETF, cel mult ${P().maxActiune}% pe o acțiune și ${P().maxTema}% pe un sector.`, k:'Planul se face pe vreme bună.' },
  { id:'jurnal', t:'Jurnalul de decizii', p:['Notează de ce cumperi și ce te-ar face să vinzi. Peste un an, recitește.','Așa înveți din decizii, nu din noroc. Jurnalul din Analiză compară fiecare decizie cu VWCE.'], tu:()=>{ const n=jurnalTot_().length; return n?`Ai ${n} ${n===1?'intrare':'intrări'} în jurnal.`:'Jurnalul tău e încă gol. Adaugă o notă din fișa unei acțiuni.'; }, k:'Scrisul te face mai onest cu tine.' },
 ], quiz:[
  { q:'Piața scade cu 25%. Ce spune planul tău?', o:['Vinzi tot','Continui depunerile lunare','Aștepți să scadă și mai mult'], ok:1, d:'Depunerile cumpără mai ieftin. Vânzarea ar face pierderea permanentă.' },
  { q:'Întrebarea bună când ții o acțiune pe pierdere:', o:['Când revine la prețul meu?','Aș cumpăra-o azi?','Cine e de vină?'], ok:1, d:'Prețul tău de cumpărare nu contează pentru piață.' },
  { q:'De ce ții un jurnal de decizii?', o:['Pentru Fisc','Ca să înveți din motive, nu din rezultat','Pentru broker'], ok:1, d:'O decizie bună poate ieși prost din ghinion și invers.' } ] },
 { id:'romania', t:'Instrumente din România', ic:'scut', l:[
  { id:'urgenta', t:'Fondul de urgență, înainte de tot', p:['Înainte să investești pe bursă, ține deoparte cheltuielile pe 3–6 luni, într-un loc sigur și disponibil.','Așa nu ești obligat să vinzi acțiuni într-o criză, când ai nevoie de bani pentru o urgență.'], k:'Fondul de urgență îți protejează investițiile.' },
  { id:'titluri', t:'Titlurile de stat: Tezaur și Fidelis', p:['Statul român se împrumută de la populație prin Tezaur și Fidelis, cu dobândă fixă, pe 1–5 ani sau mai mult.','Sunt potrivite pentru bani de care ai nevoie în câțiva ani sau pentru partea sigură a portofoliului. Verifică dobânda și condițiile fiecărei emisiuni.'], tu:()=>P().orizontAni<5?'Orizontul tău e scurt: titlurile de stat merită luate în calcul pentru suma de care ai nevoie sigur.':'', k:'Pentru bani pe termen scurt, siguranța contează mai mult decât randamentul.' },
  { id:'pilon3', t:'Pilonul 3 de pensie', p:['Pilonul 3 e o pensie privată facultativă. Contribuțiile sunt deductibile până la 400 de euro pe an, deci recuperezi o parte prin impozit.','Are costuri mai mari decât un ETF, dar avantajul fiscal îl poate face interesant pentru o parte din economii.'], k:'Un avantaj fiscal e un randament garantat.' },
 ], quiz:[
  { q:'Câte luni de cheltuieli ține de obicei fondul de urgență?', o:['1','3–6','24'], ok:1, d:'Suficient cât să treci de o urgență fără să vinzi investiții.' },
  { q:'Pentru bani de care ai nevoie peste 2 ani, ce e mai potrivit?', o:['Acțiuni de tehnologie','Titluri de stat sau depozit','Un ETF de semiconductori'], ok:1, d:'Pe 2 ani, acțiunile pot fi oricând cu 20–30% jos.' },
  { q:'Contribuțiile la Pilonul 3 sunt deductibile până la…', o:['100 de euro pe an','400 de euro pe an','Fără limită'], ok:1, d:'Plafonul de deductibilitate e 400 de euro pe an.' } ] },
];
// Cursul: trei niveluri, în ordinea în care merită parcurse.
const CURS = [
  { n:'Începător', d:'ce cumperi, de ce și cu ce bani', m:['baza','romania'] },
  { n:'Intermediar', d:'strategia ta și cât te costă', m:['strategie','costuri'] },
  { n:'Avansat', d:'cum citești piața și cum îți ții nervii', m:['piata','mintea'] } ];
const MODULE_ORD = () => CURS.flatMap(c=>c.m.map(id=>({...MODULE.find(x=>x.id===id), nivel:c.n})));
const TOATE_LECTIILE = () => MODULE_ORD().flatMap(m=>m.l.map(l=>({...l, m})));
const modulGata = m => m.l.every(l=>citit(l.id)) && ((S.quiz||{})[m.id]??-1) >= m.quiz.length-1;
function nivelTau(){ const ord=MODULE_ORD(); let k=0; for (const c of CURS) { if (c.m.every(id=>modulGata(ord.find(x=>x.id===id)))) k++; else break; } return ['Începător','Intermediar','Avansat','Absolvent'][k]; }
const citit = id => !!(S.citite||{})[id];
function lectiaZilei(){ const t=TOATE_LECTIILE(); return t.find(l=>!citit(l.id)) || t[new Date().getDate()%t.length]; }
function deschideLectie(id){
  const l = TOATE_LECTIILE().find(x=>x.id===id); if(!l) return;
  S.citite = {...(S.citite||{}), [id]:1}; save();
  const tu = l.tu ? l.tu() : '';
  const t = TOATE_LECTIILE(), i = t.findIndex(x=>x.id===id), urm = t[i+1]?.m.id===l.m.id ? t[i+1] : null, ultima = !urm;
  openSheet(`${capFoaie(l.m.ic, l.t, l.m.t)}
    <div class="lect">${l.p.map(x=>`<p>${link(x)}</p>`).join('')}${tu?`<div class="tu"><b>Pentru tine:</b> ${link(tu)}</div>`:''}<div class="cheie">${ic('bec')}<span>${esc(l.k)}</span></div></div>
    <div class="lpas num">Lecția ${l.m.l.findIndex(x=>x.id===id)+1} din ${l.m.l.length} · ${esc(l.m.t)}</div>
    ${urm?`<button class="btn" style="margin-top:10px" data-c="${A('dupaInchidere','deschideLectie',urm.id)}">Următoarea: ${esc(urm.t)}</button>`:ultima?`<button class="btn" style="margin-top:10px" data-c="${A('dupaInchidere','quiz',l.m.id)}">Ai terminat modulul. Testează-te</button>`:''}
    <button class="btn ghost" style="margin-top:8px" data-c="${A('inchideSiRedeseneaza')}">Închide</button>`);
}
let QZ = null;
function quiz(mid){ QZ = {mid, i:0, scor:0, ales:null}; arataQuiz(); }
function arataQuiz(){
  const m = MODULE.find(x=>x.id===QZ.mid), q = m.quiz[QZ.i];
  const html = !q ? `${capFoaie('stea', 'Rezultat', m.t)}<div class="fd" style="font-size:44px;font-weight:700;text-align:center;margin:10px 0">${QZ.scor}/${m.quiz.length}</div>
      <div class="sub" style="text-align:center;margin-bottom:14px">${QZ.scor===m.quiz.length?'Perfect. Ai stăpânit modulul.':QZ.scor?'Bine. Recitește lecțiile la care ai ezitat.':'Merită recitite lecțiile modulului.'}</div>
      <button class="btn" data-c="${A('inchideSiRedeseneaza')}">Gata</button>`
    : `${capFoaie('stea', `Întrebarea ${QZ.i+1} din ${m.quiz.length}`, m.t)}<div style="font-size:17px;font-weight:700;margin:6px 0 12px">${esc(q.q)}</div>
      ${q.o.map((o,k)=>`<button class="qo ${QZ.ales==null?'':k===q.ok?'ok':k===QZ.ales?'gr':''}" ${QZ.ales!=null?'disabled':''} data-c="${A('quizAlege',k)}">${esc(o)}</button>`).join('')}
      ${QZ.ales!=null?`<div class="al ${QZ.ales===q.ok?'good':'err'}" style="margin-top:10px">${QZ.ales===q.ok?'Corect. ':'Nu chiar. '}${esc(q.d)}</div><button class="btn" style="margin-top:8px" data-c="${A('quizUrm')}">Mai departe</button>`:''}`;
  if (QZ.i>0 || QZ.ales!=null || !q) { const sh=$('sheet'); sh.innerHTML = html; iconiteSectiuni(sh); if(!q){ S.quiz={...(S.quiz||{}), [QZ.mid]:QZ.scor}; save(); } return; }
  openSheet(html);
}
function glosar(){
  openSheet(`${capFoaie('carte','Dicționar','toți termenii din aplicație')}${Object.entries(GLOS).filter(([k])=>!['adauga','pastreaza','nu_adauga','asteapta','verifica','reechilibreaza','cumpara','las','uita','opor'].includes(k)).sort((a,b)=>a[1][0].localeCompare(b[1][0],'ro')).map(([k,g])=>`<button class="it" style="--k:var(--acc)" data-c="${A('termen',k)}"><span class="tx"><b>${esc(g[0])}</b><small>${esc(g[1].slice(0,72))}…</small></span><span class="ch">›</span></button>`).join('')}
    <button class="btn ghost" style="margin-top:12px" data-c="${A('closeSheet')}">Închide</button>`);
}
function arataModul(id){
  const m = MODULE_ORD().find(x=>x.id===id), qs = (S.quiz||{})[m.id];
  openSheet(`${capFoaie(m.ic, m.t, `${m.nivel} · ${m.l.length} lecții · ~${m.l.length*2} minute`)}
    <div class="card grp">${m.l.map((l,i)=>`<button class="it" style="--k:var(${citit(l.id)?'--pos':'--acc'})" data-c="${A('dupaInchidere','deschideLectie',l.id)}"><span class="ib2">${citit(l.id)?'<b style="color:var(--pos)">✓</b>':`<b class="fd" style="color:var(--acc)">${i+1}</b>`}</span><span class="tx"><b>${esc(l.t)}</b><small>${esc(l.k)}</small></span><span class="ch">›</span></button>`).join('')}
      <button class="it" style="--k:var(--opor)" data-c="${A('dupaInchidere','quiz',m.id)}"><span class="ib2">${ic('stea')}</span><span class="tx"><b>Testul modulului</b><small>${qs!=null?`ultimul rezultat: ${qs}/${m.quiz.length}`:'3 întrebări'}</small></span><span class="ch">›</span></button></div>
    <button class="btn ghost" style="margin-top:12px" data-c="${A('closeSheet')}">Închide</button>`);
}
function cautaTermen(v){ const q=v.trim().toLowerCase(), el=$('glr'); if(!el) return;
  if (!q) { el.innerHTML=''; return; }
  const r = Object.entries(GLOS).filter(([k,g])=>!['adauga','pastreaza','nu_adauga','asteapta','verifica','reechilibreaza','cumpara','las','uita'].includes(k) && (g[0]+' '+g[1]).toLowerCase().includes(q)).slice(0,6);
  el.innerHTML = r.length ? `<div class="card grp" style="margin-top:8px">${r.map(([k,g])=>`<button class="it" data-c="${A('termen',k)}"><span class="tx"><b>${esc(g[0])}</b><small>${esc(g[1].slice(0,80))}…</small></span><span class="ch">›</span></button>`).join('')}</div>` : `<div class="sub" style="padding:8px 4px">Niciun termen găsit.</div>`; }
function vInvata(){
  const t = TOATE_LECTIILE(), n = t.filter(l=>citit(l.id)).length, lz = lectiaZilei(), ord = MODULE_ORD(), niv = nivelTau();
  let h = `<div class="card hcard learn" style="margin-top:6px"><div style="display:flex;gap:16px;align-items:center">${inel(Math.round(n/t.length*100),'--pos')}<div style="flex:1;min-width:0"><div class="lbl">Nivelul tău</div><div class="fd" style="font-size:24px;font-weight:700">${niv}</div><div class="sub">${n} din ${t.length} lecții · ${Object.keys(S.quiz||{}).length} din ${ord.length} teste</div></div></div>
    <button class="btn" style="margin-top:14px" data-c="${A('deschideLectie',lz.id)}">${n?'Continuă':'Începe'}: ${esc(lz.t)}</button></div>
  <div class="srch">${ic('carte')}<input id="gls" placeholder="Caută un termen: ETF, RSI, impozit…" data-in="${A('cautaTermen','$val')}" autocomplete="off"></div><div id="glr"></div>`;
  h += `<div class="drum">`;
  CURS.forEach((c,ci)=>{
    h += `<div class="niv"><span class="nivn">${ci+1}</span><div><b>${c.n}</b><small>${c.d}</small></div></div>`;
    for (const id of c.m) { const m = ord.find(x=>x.id===id), k = m.l.filter(l=>citit(l.id)).length, qs = (S.quiz||{})[m.id], gata = modulGata(m), pct = k/m.l.length;
      const C=2*Math.PI*21;
      h += `<button class="mod ${gata?'gata':k?'incurs':''}" data-c="${A('arataModul',m.id)}"><span class="modr"><svg viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="21" fill="none" stroke="var(--panel2)" stroke-width="4"/><circle cx="25" cy="25" r="21" fill="none" stroke="var(${gata?'--pos':'--acc'})" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(C*pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 25 25)" ${pct?'':'opacity="0"'}/></svg>${ic(gata?'scut':m.ic)}</span>
        <span class="tx"><b>${esc(m.t)}</b><small>${k}/${m.l.length} lecții${qs!=null?` · test ${qs}/${m.quiz.length}`:''}</small></span>${gata?'<span class="pill2" style="--k:var(--pos)">gata</span>':'<span class="ch">›</span>'}</button>`; }
  });
  h += `</div>`;
  h += `<button class="card lz" style="margin-top:14px" data-c="${A('glosar')}"><span class="tic" style="--k:var(--acc2)">${ic('carte')}</span><div style="flex:1;text-align:left"><div style="font-weight:700">Dicționarul complet</div><div class="sub">${Object.keys(GLOS).length} de termeni, explicați simplu</div></div><span class="ch">›</span></button>`;
  return h;
}

// ===== ETF-uri recomandate: aplicația propune, tu decizi =====
const TIP_REC = { similar:['Similar cu ce ai','--acc'], completeaza:['Completează portofoliul','--pos'], orizont:['Pentru orizontul tău','--warn'] };
const decizii = () => (ED?.decizii) || V?.profil?.decizii || {};
const aleseAcum = () => (ED?.alese) || V?.profil?.alese || P().alese || [];
function recomandari(){ if (!M || !SNAP?.pozitii) return []; const d={...decizii()}; for (const k of aleseAcum()) d[k]=d[k]||{r:'da'}; try { return M.recomandaETF(SNAP.pozitii, SNAP.teme||{}, P(), d); } catch(e) { return []; } }
function cardRec(r){
  const [tip, col] = TIP_REC[r.tip] || ['Recomandare','--acc'];
  return `<div class="card rec" style="--k:var(${col})">
    <div class="row" style="align-items:flex-start"><div style="min-width:0"><span class="tag" style="color:var(${col})">${tip}</span><div style="font-size:19px;font-weight:800;margin-top:2px">${esc(r.ticker)}</div><div class="sub">${esc(r.nume)}</div></div>
      <div style="text-align:right;flex:none"><b class="num" style="font-size:18px">${nf(r.ter,2)}%</b><div class="sub">cost pe an ${q('ter')}</div></div></div>
    <p style="margin:10px 0 0;font-size:14.5px;line-height:1.55;color:var(--ink2)">${esc(r.motiv)}</p>
    ${r.despre?`<div class="sub" style="margin-top:8px">${esc(r.despre)}</div>`:''}
    <div class="meta num"><span><b>${esc(String(r.companii||''))}</b> companii</span><span>indice <b>${esc(r.indice||'')}</b></span><span>ISIN <b>${esc(r.isin)}</b> ${q('isin')}</span></div>
    ${r.nota?`<div class="al" style="margin:10px 0 0">${esc(r.nota)}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" style="flex:1" data-c="${A('decideETF',r.ticker,'da')}">Da, investesc</button><button class="btn ghost" style="flex:1" data-c="${A('decideETF',r.ticker,'nu')}">Nu, mulțumesc</button></div>
  </div>`;
}
// Suma sugerată pentru o idee nouă: ținta ei în lei și o primă cumpărare rezonabilă din suma lunară.
function sugestie(tinta){ const pr=P(), T=SNAP.totalRON, s=pr.contributieTipica, lei=tinta/100*(T+s), prima=Math.max(Math.min(Math.round(Math.min(lei, s*0.4)/10)*10, s), Math.min(pr.transaMinima, s));
  return { lei, prima, text:`Ținta ei ar fi ${nf(tinta,1)}% din portofoliu, adică ${S.privat?'•••':nf(lei,0)} lei. Începe cu ${prima} ${de(prima)}lei, iar restul vine din depunerile lunare, când are loc în plan.` }; }
function recomandariActiuni(){ if (!M || !SNAP?.pozitii) return []; const d={...decizii()}; for (const k of aleseAcum()) d[k]=d[k]||{r:'da'};
  try { return M.recomandaActiuni(SNAP.candidati||[], SNAP.pozitii, SNAP.teme||{}, P(), d); } catch(e) { return []; } }
function cardActiune(r){
  const i = r.ind||{}, f = r.fund||{}, plus = (r.motive||[]).filter(m=>m[0]==='+').slice(0,3), minus = (r.motive||[]).filter(m=>m[0]==='−').slice(0,2), sg2 = sugestie(r.tinta);
  return `<div class="card rec" style="--k:var(--s3)">
    <div class="row" style="align-items:flex-start;gap:12px">${avatar({symbol:r.ticker, tema:r.sector, logo:r.logo})}<div style="flex:1;min-width:0"><span class="tag" style="color:var(--s3)">${esc(r.sector)}</span><div style="font-size:19px;font-weight:800;margin-top:2px">${esc(r.nume)}</div><div class="sub">${esc(r.ticker)}${i.pret?` · ${nf(i.pret)} ${esc(M?.monedaOf?M.monedaOf(r.ticker):'')}`:''}</div></div></div>
    <p style="margin:10px 0 0;font-size:14.5px;line-height:1.55;color:var(--ink2)">${esc(r.motiv)}</p>
    <div class="sub" style="margin-top:6px">${esc(r.despre)}</div>
    <div class="meta num">${i.sma200?`<span>față de media de 200 de zile <b>${sg((i.pret/i.sma200-1)*100,0)}%</b></span>`:''}${i.rsi!=null?`<span>RSI <b>${nf(i.rsi,0)}</b></span>`:''}${f.pe?`<span>P/E <b>${nf(f.pe,0)}</b></span>`:''}${i.r1a!=null?`<span>un an <b>${sg(i.r1a,0)}%</b></span>`:''}</div>
    ${plus.length||minus.length?`<div class="pc">${plus.map(m=>`<div class="up">${link(m.slice(2))}</div>`).join('')}${minus.map(m=>`<div class="down">${link(m.slice(2))}</div>`).join('')}</div>`:''}
    ${r.nota?`<div class="al" style="margin:10px 0 0">${esc(r.nota)}</div>`:''}
    <div class="sug">${ic('portofel')}<span>${sg2.text}</span></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" style="flex:1" data-c="${A('decideETF',r.ticker,'da')}">Da, investesc</button><button class="btn ghost" style="flex:1" data-c="${A('decideETF',r.ticker,'nu')}">Nu, mulțumesc</button></div>
  </div>`;
}
// Acțiunile pe care le ai deja: care pot primi bani noi și de ce celelalte nu.
function stareActiune(p, pr){
  const l = inPlan(p.symbol), sub = p.pondere < p.tinta, tp = SNAP.teme[p.tema]||0;
  if (l) return {o:0, k:'--adauga', t:'În planul lunii', d:`${l.suma} ${de(l.suma)}lei luna asta.`};
  if (sem(p)==='uita') return {o:5, k:'--verifica', t:'Verifică întâi', d: p.semnal==='reechilibreaza' ? `Are ${nf(p.pondere,1)}% din portofoliu, mult peste ținta de ${nf(p.tinta,1)}%. Nu mai cumpăra din ea.`
    : p.ind?.subProtectie ? 'A scăzut sub nivelul de alertă. Citește știrile înainte de orice decizie.' : 'Trendul și cifrele companiei s-au înrăutățit. Citește știrile înainte de orice decizie.'};
  if (p.semnal==='asteapta') return {o:2, k:'--asteapta', t:'Așteaptă', d:p.atentie.find(a=>/RSI|Rezultate/.test(a))||'Momentul nu e bun acum.'};
  if (p.semnal==='adauga') return {o:1, k:'--adauga', t:'Poate primi bani', d:`E sub ținta ei (${nf(p.pondere,1)}% din ${nf(p.tinta,1)}%). Nu e în plan doar pentru că alte poziții sunt mai departe de țintă.`};
  if (sub && tp>pr.maxTema) return {o:3, k:'--nu_adauga', t:'Sector plin', d:`E sub ținta ei (${nf(p.pondere,1)}% din ${nf(p.tinta,1)}%), dar sectorul ${p.tema} are ${nf(tp,0)}%, peste plafonul de ${pr.maxTema}%.`};
  return {o:4, k:'--pastreaza', t:'Are destul', d:`Are ${nf(p.pondere,1)}% din portofoliu, ținta ei e ${nf(p.tinta,1)}%.`};
}
function portofoliuHTML(pr){
  const ac = SNAP.pozitii.filter(p=>!p.etf).map(p=>({p, s:stareActiune(p,pr)})).sort((a,b)=>a.s.o-b.s.o || (a.p.pondere-a.p.tinta)-(b.p.pondere-b.p.tinta));
  if (!ac.length) return '';
  const pot = ac.filter(x=>x.s.o<=1).length, aprope = ac.filter(x=>x.s.o===3).slice(0,2).map(x=>x.p.symbol);
  return `<div class="sec"><h2>Din acțiunile tale ${q('portofoliu')}</h2><span class="sub">${pot} din ${ac.length} pot primi bani</span></div>
    <div class="card"><div class="sub" style="margin-bottom:6px;color:var(--ink2);font-size:14px">${pot?`Pe lângă ETF, ${pot===1?'această acțiune poate':'aceste acțiuni pot'} primi bani noi fără să strice echilibrul portofoliului.`:`Acum niciuna nu are nevoie de bani noi: toate au deja cât le revine sau sunt într-un sector prea mare. De aceea banii merg în ETF.${aprope.length?` Cele mai apropiate de a primi bani: ${aprope.join(' și ')}.`:''}`}</div>
    ${ac.map(({p,s})=>`<button class="pf" data-c="${A('deschideDetaliu',p.symbol)}">${avatar(p,'mic')}<span class="tx"><b>${esc(p.symbol)} <span class="pill2" style="--k:var(${s.k})">${s.t}</span></b><small>${link(s.d)}</small></span><span class="ch">›</span></button>`).join('')}</div>`;
}
const PLAN_DESC = k => (S.planDesc||{})[k] ?? false;
function comutaPlan(k, el){ S.planDesc = {...(S.planDesc||{}), [k]: el.open}; save(); }
function recomandariHTML(pr){
  const rec = recomandari(), ra = recomandariActiuni(), al = aleseAcum(), d = decizii(), refuz = Object.keys(d).filter(k=>d[k]?.r==='nu');
  let h = `<div class="sec"><h2>Idei noi de investit ${q('etfrec')}</h2>${refuz.length?`<button class="link" data-c="${A('refuzuri')}">Refuzate (${refuz.length}) ›</button>`:''}</div>`;
  if (al.length) h += `<div class="card grp">${al.map(k=>{ const v=SNAP.virtuale?.find(x=>x.symbol===k); return `<div class="it" style="--k:var(--pos)"><span class="ib2">${ic(v&&!v.etf?'stea':'nucleu')}</span><span class="tx"><b>${esc(k)} · ales de tine</b><small>${v?`În planul lunar, cu ținta de ${nf(v.tinta||0,1)}%. Dispare de aici când apare în cont.`:'Îl ai deja în cont.'}</small></span><button class="link" data-c="${A('decideETF',k,'anuleaza')}">Anulează</button></div>`; }).join('')}</div>`;
  h += `<details class="dd" ${PLAN_DESC('etf')?'open':''} data-tg="${A('comutaPlan','etf','$el')}"><summary><span class="tic" style="--k:var(--acc)">${ic('nucleu')}</span><span class="tx"><b>ETF-uri</b><small>${rec.length?`${rec.length} ${rec.length===1?'idee':'idei'} potrivite cu ce ai`:'nimic nou acum'}</small></span><span class="chev">${ic('jos')}</span></summary><div class="ddb">
    ${rec.length ? rec.slice(0,4).map(cardRec).join('') : `<div class="sub" style="padding:4px 2px 10px">Ai acoperit deja ideile principale${refuz.length?' sau le-ai refuzat':''}.</div>`}
    <div class="sub" style="margin:2px 2px 6px">Toate sunt ETF-uri UCITS, listate în Europa. Înainte să cumperi, caută ISIN-ul în Trading 212.</div></div></details>`;
  const scurt = pr.orizontAni < 5;
  h += `<details class="dd" ${PLAN_DESC('act')?'open':''} data-tg="${A('comutaPlan','act','$el')}"><summary><span class="tic" style="--k:var(--s3)">${ic('stea')}</span><span class="tx"><b>Acțiuni pentru diversificare</b><small>${ra.length?`${ra.length} ${ra.length===1?'sector':'sectoare'} pe care nu le ai`:SNAP.candidati?.length?'ai deja toate sectoarele din catalog':'apar după următoarea analiză de seară'}</small></span><span class="chev">${ic('jos')}</span></summary><div class="ddb">
    ${scurt?`<div class="al" style="margin:0 0 10px">Ai ${pr.orizontAni} ${pr.orizontAni===1?'an':'ani'} până ai nevoie de bani. Pe un orizont atât de scurt, acțiunile individuale sunt riscante: ETF-ul și titlurile de stat sunt variantele potrivite.</div>`:''}
    ${ra.length ? ra.slice(0,5).map(cardActiune).join('') : `<div class="sub" style="padding:4px 2px 10px">${SNAP.candidati?.length?'Nicio idee nouă: ai deja câte ceva în fiecare sector din catalog sau le-ai refuzat.':'Datele pentru aceste acțiuni apar după următoarea analiză de seară.'}</div>`}
    <div class="sub" style="margin:2px 2px 6px">Câte o companie mare din fiecare sector care îți lipsește, aleasă după trend, evaluare și părerea analiștilor. Nu e un sfat de cumpărare: verifică știrile și decide tu.</div></div></details>`;
  return h;
}
function refuzuri(){
  const d = decizii(), r = Object.keys(d).filter(k=>d[k]?.r==='nu');
  openSheet(`${capFoaie('nucleu','ETF-uri refuzate','nu le mai propun până nu anulezi')}<div class="card grp">${r.map(k=>`<div class="it" style="--k:var(--mut)"><span class="ib2">${ic('nucleu')}</span><span class="tx"><b>${esc(k)}</b><small>refuzat pe ${ziRo(d[k].data)}</small></span><button class="link" data-c="${A('dupaInchidere','decideETF',k,'anuleaza')}">Propune din nou</button></div>`).join('')||'<div class="sub" style="padding:12px">Nimic refuzat.</div>'}</div>
    <button class="btn ghost" style="margin-top:12px" data-c="${A('closeSheet')}">Închide</button>`);
}
async function decideETF(k, r){
  if (!V) return;
  const azi = new Date().toISOString().slice(0,10), v = V.profil || {...profilUser(), alerte: alerte()};
  const d = {...(v.decizii||{})}, al = [...(v.alese||[])], inainte = al.join();
  if (r === 'anuleaza') { delete d[k]; const i = al.indexOf(k); if (i >= 0) al.splice(i, 1); }
  else { d[k] = {r, data: azi}; if (r === 'da' && !al.includes(k)) al.push(k); }
  V.profil = {...v, decizii: d, alese: al.slice(0,10)};
  if (ED) { ED.decizii = d; ED.alese = V.profil.alese; }
  const schimbat = inainte !== V.profil.alese.join(); if (schimbat) V.profil.sincronizat = false;
  await salveazaSeif();
  if (r === 'da') { const e = SNAP.pozitii.find(x=>x.etf); J.unshift({id:Date.now(), data:azi, symbol:k, actiune:'altceva', semnal:'adauga', pret:null, pretETF:e?.ind?.pret??null, nota:`Am decis să investesc în ${k} (recomandarea aplicației).`}); saveJ(); }
  aplicaProfil(); vib(); render();
  toast(r==='da' ? `${k} intră în planul lunar.` : r==='nu' ? `Bine. Nu-ți mai propun ${k}.` : 'Decizia a fost anulată.');
  if (schimbat) await sincronizeazaProfil();
}
// ===== Alocarea: două inele (acum și ținta), pe ETF și sectoare =====
// Ținta pe sector = suma țintelor pozițiilor din sector (inclusiv ETF-urile alese, încă necumpărate).
function alocareDate(pr){
  const list = [...SNAP.pozitii, ...(SNAP.virtuale||[])], t = M ? M.tinte(list, pr) : Object.fromEntries(list.map(p=>[p.symbol,p.tinta||0]));
  const teme = {}; for (const p of list) { const k = p.etf ? 'ETF' : p.tema; (teme[k] ||= {acum:0, tinta:0, n:k==='ETF'?'ETF global':p.tema}); teme[k].acum += p.pondere||0; teme[k].tinta += t[p.symbol]||0; }
  const ord = Object.entries(teme).sort((a,b)=>(b[0]==='ETF')-(a[0]==='ETF') || b[1].acum-a[1].acum);
  return ord.map(([k,v],i)=>({k, ...v, c: k==='ETF' ? '--acc' : ['--s2','--s3','--s4','--s5','--reechilibreaza','--opor','--asteapta'][(i-1)%7]}));
}
const ALOC_R = {e:76, i:58}, ALOC_C = r => 2*Math.PI*r;
function arce(b, camp, r){ const C=ALOC_C(r), tot=b.reduce((a,x)=>a+Math.max(x[camp],0),0)||1; let st=0;
  return b.map(x=>{ const len=Math.max(x[camp],0)/tot*C, gap=len>4?2.5:0, o={len:Math.max(len-gap,0), off:-st}; st+=len; return o; }); }
let ALOC_PREV = null;
function alocareHTML(pr, s){
  const b = alocareDate(pr), E = arce(b,'tinta',ALOC_R.e), I = arce(b,'acum',ALOC_R.i), et = b.find(x=>x.k==='ETF'), etf = SNAP.pozitii.filter(p=>p.etf).reduce((a,p)=>a+p.valueRON,0);
  const luni = M ? M.luniPanaLaTinta(etf, SNAP.totalRON, pr, s) : null, prev = ALOC_PREV; ALOC_PREV = {E, I};
  const seg = (o,k,r,cls,x,p) => `<circle class="arc ${cls}" data-k="${k}" r="${r}" cx="100" cy="100" fill="none" stroke="var(${x.c})" stroke-width="${cls==='e'?13:11}" ${cls==='i'?'opacity=".55"':''} stroke-dasharray="${(p||o).len.toFixed(2)} ${ALOC_C(r).toFixed(2)}" stroke-dashoffset="${(p||o).off.toFixed(2)}" data-to="${o.len.toFixed(2)}|${o.off.toFixed(2)}" transform="rotate(-90 100 100)"/>`;
  return `<div class="card aloc" data-noswipe>
    <div class="alw"><svg viewBox="0 0 200 200" class="alsvg" aria-label="Alocarea acum (inelul interior) și ținta (exterior)">
      <circle r="${ALOC_R.e}" cx="100" cy="100" fill="none" stroke="var(--panel2)" stroke-width="13"/><circle r="${ALOC_R.i}" cx="100" cy="100" fill="none" stroke="var(--panel2)" stroke-width="11"/>
      ${b.map((x,k)=>seg(E[k],x.k,ALOC_R.e,'e',x,prev?.E?.[k])).join('')}${b.map((x,k)=>seg(I[k],x.k,ALOC_R.i,'i',x,prev?.I?.[k])).join('')}
      <text x="100" y="94" text-anchor="middle" class="fd" font-size="26" font-weight="700" fill="var(--ink)" id="alC">${nf(et?.acum||0,0)}%</text>
      <text x="100" y="114" text-anchor="middle" font-size="11" fill="var(--mut)" id="alT">ETF · ținta ${pr.tintaETF}%</text></svg>
    <div class="alleg">${b.map(x=>`<div class="ali" data-k="${esc(x.k)}"><i style="background:var(${x.c})"></i><span>${esc(x.n)}</span><b class="num"><span class="mut">${nf(x.acum,0)}%</span> → <span class="alt">${nf(x.tinta,0)}%</span></b></div>`).join('')}</div></div>
    <div class="row" style="margin-top:12px"><span class="sub" id="alL">${luni==null?`Ținta de ${pr.tintaETF}% se atinge doar vânzând acțiuni.`:luni?`La ${s} ${de(s)}lei pe lună, toți în ETF: <b class="ink2">~${luni} ${de(luni)}${luni===1?'lună':'luni'}</b> până la ținta ETF.`:'ETF-ul e la țintă: banii noi se împart după ținte.'}</span></div>
    <div class="sub" style="margin-top:4px;font-size:12.5px">Inelul exterior e ținta, cel interior e acum. Trage glisoarele de mai sus și vezi cum se schimbă.</div></div>`;
}
// După randare: arcele pornesc din poziția veche și alunecă în cea nouă.
function animaAlocare(){ requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll('.alsvg .arc').forEach(c=>{ const [l,o]=c.dataset.to.split('|'); c.setAttribute('stroke-dasharray',`${l} ${2*Math.PI*+c.getAttribute('r')}`); c.setAttribute('stroke-dashoffset',o); }))); }
// În timp ce tragi glisorul țintei ETF: doar inelul exterior și cifrele, fără să refacă pagina.
function alocareLive(v){
  if (!M || !document.querySelector('.alsvg')) return;
  const u = {...(ED||profilUser()), tintaETF:+v}, pr = M.derivaProfil(u, SNAP.azi || new Date().toISOString().slice(0,10)), b = alocareDate(pr), E = arce(b,'tinta',ALOC_R.e);
  b.forEach((x,k)=>{ const c=document.querySelector(`.alsvg .arc.e[data-k="${CSS.escape(x.k)}"]`); if(c){ c.setAttribute('stroke-dasharray',`${E[k].len.toFixed(2)} ${ALOC_C(ALOC_R.e).toFixed(2)}`); c.setAttribute('stroke-dashoffset',E[k].off.toFixed(2)); }
    const l=document.querySelector(`.ali[data-k="${CSS.escape(x.k)}"] .alt`); if(l) l.textContent=nf(x.tinta,0)+'%'; });
  $('alT').textContent = `ETF · ținta ${pr.tintaETF}%`;
  const etf = SNAP.pozitii.filter(p=>p.etf).reduce((a,p)=>a+p.valueRON,0), s = pr.contributieTipica, luni = M.luniPanaLaTinta(etf, SNAP.totalRON, pr, s);
  $('alL').innerHTML = luni==null?`Ținta de ${pr.tintaETF}% se atinge doar vânzând acțiuni.`:luni?`La ${s} ${de(s)}lei pe lună, toți în ETF: <b class="ink2">~${luni} ${de(luni)}${luni===1?'lună':'luni'}</b> până la ținta ETF.`:'ETF-ul e la țintă: banii noi se împart după ținte.';
}
// Cât ar putea valora portofoliul la orizont: trei scenarii, plus doar ce depui.
function proiectieHTML(pr){
  if (!M) return '';
  const T = SNAP.totalRON, s = pr.contributieTipica, n = pr.orizontAni, an0 = anAzi();
  const sc = M.scenarii(T, s, n), ani = Array.from({length:n+1},(_,k)=>k);
  const ser = k => ani.map(a=>M.proiectie(T, s, a, M.SCENARII_RATE?.[k] ?? sc[k].rata).valoare);
  const dep = ani.map(a=>T+s*12*a);
  return `<div class="sec"><h2>Unde poți ajunge în ${n} ${de(n)}${n===1?'an':'ani'} ${q('proiectie')}</h2></div><div class="card">
    <div class="tier num" style="margin-top:0">${[['prudent','Prudent'],['mediu','Mediu'],['bun','Bun']].map(([k,t])=>`<div style="${k==='mediu'?'outline:1px solid color-mix(in srgb,var(--acc) 50%,transparent)':''}"><span>${t}, ${sc[k].rata}%/an</span><b style="font-size:16px;margin-top:3px">${S.privat?'•••':nf(sc[k].valoare/1000,0)+' mii'}</b></div>`).join('')}</div>
    <div style="margin-top:12px">${lineChart({series:[{name:'Scenariul mediu',short:'Mediu',v:ser('mediu'),color:'--s1'},{name:'Scenariul bun',short:'Bun',v:ser('bun'),color:'--pos',w:1.4},{name:'Scenariul prudent',short:'Prudent',v:ser('prudent'),color:'--warn',w:1.4},{name:'Doar depunerile',short:'Depus',v:dep,color:'--mut',dash:1,w:1.3}],
      x:ani.map(a=>an0+a), xfmt:a=>String(a), H:150, area:1, privat:1, anim:'proiectie', fmt:x=>nf(x,0)+' lei', aria:'Proiecția portofoliului la orizont'})}</div>
    <div class="sub num" style="margin-top:6px">Depui în total ${S.privat?'•••':nf(dep.at(-1),0)} lei.</div></div>`;
}

// ===== Analiză: portofoliul tău, riscul lui și ce înveți din el =====
const BUCKETE = () => { const t=Object.entries(SNAP.teme).sort((a,b)=>(b[0].startsWith('ETF')-a[0].startsWith('ETF'))||b[1]-a[1]); return t.map(([n],i)=>({n,c:'--s'+Math.min(i+1,5)})); };
// Riscul, din prețurile ultimelor până la 12 luni: volatilitate anuală, cea mai mare scădere, o lună proastă.
// Riscul istoric, calculat de motor pe zile aliniate după dată (bursele au sărbători diferite).
function riscPortofoliu(){
  if (!M) return null; const r = M.riscIstoric(SNAP.pozitii); if (!r) return null;
  return { ...r, volP: p => r.volP[p.symbol] ?? null };
}
function sanatate(){
  const pr=P(), etf=SNAP.pozitii.filter(p=>p.etf).reduce((a,p)=>a+p.pondere,0);
  const [tn,tp] = Object.entries(SNAP.teme).filter(([n])=>!n.startsWith('ETF')&&n!=='Altele').sort((a,b)=>b[1]-a[1])[0]||['',0];
  const top = SNAP.pozitii.filter(p=>!p.etf).sort((a,b)=>b.pondere-a.pondere)[0], usd = SNAP.valute?.USD||0;
  const F = [
    {n:'ETF-ul de bază', v:pr.tintaETF>0?Math.min(etf/pr.tintaETF,1)*25:25, t:`${nf(etf,1)}% din ținta de ${pr.tintaETF}%`, l:'nucleu'},
    {n:'Diversificarea pe sectoare', v:tp<=pr.maxTema?25:25*pr.maxTema/tp, t:tp?`cel mai mare sector: ${nf(tp,1)}% (plafon ${pr.maxTema}%)`:'niciun sector peste plafon', l:'tema'},
    {n:'Mărimea pozițiilor', v:!top||top.pondere<=pr.maxActiune?25:25*pr.maxActiune/top.pondere, t:top?`cea mai mare: ${top.symbol}, ${nf(top.pondere,1)}% (plafon ${pr.maxActiune}%)`:'–', l:'pondere'},
    {n:'Moneda', v:usd<=60?25:25*60/usd, t:`${nf(usd,1)}% în dolari`, l:'moneda'}];
  const sc = Math.round(F.reduce((a,f)=>a+f.v,0));
  return { sc, F, et: sc>=80?['Solid','--pos']:sc>=60?['Bun, cu ajustări','--acc']:sc>=40?['Dezechilibrat','--warn']:['Concentrat, riscant','--neg'] };
}
const kF = v => v>=22?'--pos':v>=15?'--acc':v>=9?'--warn':'--neg';
function inel(sc, col){ const r=34, C=2*Math.PI*r; return `<svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="9"/>${sc>0?'':'<!--'}<circle cx="44" cy="44" r="${r}" fill="none" stroke="var(${col})" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C*sc/100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 44 44)"/>${sc>0?'':'-->'}<text x="44" y="50" text-anchor="middle" font-size="22" font-weight="800" fill="var(--ink)" class="num">${sc}</text></svg>`; }
// Școala de investiții: lecții scurte, fiecare cu cifrele tale.
function lectii(){
  const pr=P(), s=pr.contributieTipica, n=pr.orizontAni, T=SNAP.totalRON, sc=M?M.scenarii(T,s,n):null, k=x=>S.privat?'•••':nf(x,0);
  const [tn,tp] = Object.entries(SNAP.teme).filter(([x])=>!x.startsWith('ETF')&&x!=='Altele').sort((a,b)=>b[1]-a[1])[0]||['',0];
  const top = SNAP.pozitii.filter(p=>!p.etf).sort((a,b)=>b.pondere-a.pondere)[0];
  return [
    ['Dobânda compusă: timpul face cea mai mare parte', ['Câștigul de anul ăsta produce la rândul lui câștig anul viitor. Primii ani par lenți, ultimii cresc vizibil mai repede.','De aceea contează mai mult să începi și să nu te oprești decât să alegi momentul perfect.'],
      sc?`Cu ${s} ${de(s)}lei pe lună și ${n} ${de(n)}ani, depui ${k(T+s*12*n)} lei. La 6% pe an ajungi la aproximativ ${k(sc.mediu.valoare)} lei. Diferența de ${k(sc.mediu.valoare-T-s*12*n)} lei o produce dobânda compusă.`:''],
    ['Investiția lunară bate ghicitul momentului', ['Când cumperi lunar aceeași sumă, iei mai multe unități când prețul e jos și mai puține când e sus. Prețul tău mediu ajunge mai bun decât media prețurilor.','Studiile arată că majoritatea celor care încearcă să intre „la minim” ratează tocmai zilele bune care vin după scăderi.'],
      `Planul tău lunar face exact asta: ${s} ${de(s)}lei, în fiecare lună, indiferent de știri. Seria ta de luni investite apare pe Azi.`],
    ['De ce nu vinzi când scade', ['Piața globală a avut scăderi de 20–50% de mai multe ori și și-a revenit de fiecare dată, uneori în luni, alteori în ani.','Cine vinde în panică transformă o scădere temporară într-o pierdere permanentă și plătește și impozit dacă vinde pe câștig.'],
      `Analistul nu îți spune niciodată „vinde”. Cel mai dur semnal e „Uită-te la ea”: verifici dacă motivul pentru care ai cumpărat mai e valabil.`],
    ['Diversificarea adevărată', ['Zece acțiuni din aceeași industrie nu înseamnă diversificare: scad toate odată când industria are probleme.','Un ETF global, ca VWCE, are peste 3.000 de companii din toată lumea. Dacă una dispare, aproape nu se simte.'],
      tp>pr.maxTema?`Acum ai ${nf(tp,1)}% în sectorul „${esc(tn)}”. Dacă sectorul scade cu 30%, pierzi aproximativ ${k(T*tp/100*.3)} lei. Depunerile în VWCE reduc riscul fără să vinzi.`:`Niciun sector nu trece de plafonul tău de ${pr.maxTema}%. Bine.`],
    ['Reechilibrarea fără vânzări', ['Când o acțiune crește mult, ajunge să ocupe prea mult loc. Varianta clasică e să vinzi o parte. Varianta fără impozit: nu mai cumperi din ea și pui banii noi în rest.','Durează mai mult, dar nu plătești 16% pe câștig și nu ratezi o eventuală creștere în continuare.'],
      top&&top.pondere>pr.maxActiune?`${top.symbol} are ${nf(top.pondere,1)}% față de plafonul de ${pr.maxActiune}%. Planul lunar o ocolește automat.`:'Nicio acțiune nu trece de plafon acum.'],
    ['Impozitul pe câștig, pe scurt', ['La brokerii străini declari singur câștigul net din vânzări, în Declarația Unică, până pe 25 mai anul următor. Cota e 16%.','Contează doar ce vinzi. Ce ții în portofoliu nu se impozitează, oricât ar crește. Pierderile din același an se scad din câștiguri.'],
      'Strategia ta (cumpără și ține, reechilibrare din depuneri) amână impozitul ani de zile. Banii aceia lucrează între timp pentru tine.'],
    ['Cum citești semnalele', ['„Cumpără luna asta”: e în planul tău, cu suma exactă. „Las-o”: nimic de făcut. „Uită-te la ea”: ceva s-a schimbat și merită 5 minute.','Semnalele vin din reguli simple (trend, ponderi, rezultate, evaluare), nu din predicții. Nimeni nu știe ce face piața mâine.'],
      'Fiecare semnal are motivele lui în fișa acțiunii, la „Detalii”. Atinge orice termen subliniat ca să vezi ce înseamnă.'],
  ];
}
function sectiuniAnaliza(){
  const O={};
  const pr = P(), e = SNAP.etfRef || {}, ist = (IST||[]).filter(x=>x.totalRON&&x.bench), T = SNAP.totalRON;
  let h = '';
  // 1) Sănătatea portofoliului
  const sn = sanatate();
  h += `<div class="sec" style="margin-top:6px"><h2>Sănătatea portofoliului</h2></div><div class="card">
    <div class="scor">${inel(sn.sc, sn.et[1])}<div><div style="font-size:20px;font-weight:800;color:var(${sn.et[1]})">${sn.et[0]}</div><div class="sub" style="margin-top:3px">Scor din 100, după regulile profilului tău (orizont ${pr.orizontAni} ${de(pr.orizontAni)}${pr.orizontAni===1?'an':'ani'}). Nu spune cât câștigi, ci cât de echilibrat e riscul.</div></div></div>
    <div style="margin-top:8px">${sn.F.map(f=>`<div class="fx" style="--k:var(${kF(f.v)})" data-c="${A('termen',f.l)}"><i class="d"></i><div><div style="font-weight:650;font-size:14.5px">${f.n}</div><div class="sub">${esc(f.t)}</div></div><b class="num" style="color:var(${kF(f.v)})">${Math.round(f.v)}/25</b></div>`).join('')}</div></div>`;
  O.sanatate=h; h='';
  // 2) Tu față de totul în VWCE
  h += `<div class="sec"><h2>Tu față de totul în VWCE ${q('fantoma')}</h2></div><div class="card">${SNAP.bench||ist.length>5?`
    ${SNAP.bench?`<div class="row num"><div><div class="lbl">Diferență</div><div class="hero ${cls(SNAP.bench.diferenta)}" style="font-size:28px">${sgL(SNAP.bench.diferenta,0)}<small>lei</small></div></div>
      <div style="text-align:right" class="sub">din ${ziRo(SNAP.bench.start)}<br>VWCE: ${lei(SNAP.bench.valoare,0)}</div></div>`:''}
    ${ist.length>5?`<div style="margin-top:10px">${lineChart({series:[{name:'Portofoliul tău',short:'Tu',v:ist.map(x=>x.totalRON),color:'--s1'},{name:'Aceleași depuneri, numai în VWCE',short:'Numai VWCE',v:ist.map(x=>x.bench),color:'--s2',dash:1,w:1.6}],x:ist.map(x=>x.azi),area:1,privat:1,fmt:x=>nf(x,0)+' lei',aria:'Evoluția portofoliului față de VWCE'})}</div>`:''}
`
    :`<div class="sub">Pornește la prima analiză cu date reale. Comparația devine relevantă după câteva luni.</div>`}</div>`;
  O.vwce=h; h='';
  // 3) De unde vine câștigul
  const cs = [...SNAP.pozitii].sort((a,b)=>b.pnlRON-a.pnlRON), mxc = Math.max(...cs.map(p=>Math.abs(p.pnlRON)),1), tot = cs.reduce((a,p)=>a+p.pnlRON,0);
  h += `<div class="sec"><h2>De unde vine câștigul ${q('castigPoz')}</h2><span class="sub num ${cls(tot)}">${sgL(tot,0)} lei</span></div><div class="card">${cs.map(p=>`
    <div class="dv" style="grid-template-columns:68px 1fr 74px;cursor:pointer" data-c="${A('detaliu',p.symbol)}"><b>${esc(p.symbol)}</b><div class="t"><i style="background:var(${p.pnlRON>=0?'--pos':'--neg'});${p.pnlRON>=0?`left:50%;width:${p.pnlRON/mxc*50}%`:`right:50%;width:${-p.pnlRON/mxc*50}%`}"></i></div><span class="num ${cls(p.pnlRON)}" style="text-align:right">${sgL(p.pnlRON,0)}</span></div>`).join('')}
</div>`;
  O.castig=h; h='';
  // 4) Riscul și testele de stres
  const r = riscPortofoliu();
  if (r) {
    const [tn,tp] = Object.entries(SNAP.teme).filter(([n])=>!n.startsWith('ETF')&&n!=='Altele').sort((a,b)=>b[1]-a[1])[0]||['',0];
    const top = SNAP.pozitii.filter(p=>!p.etf).sort((a,b)=>b.pondere-a.pondere)[0], usd = SNAP.valute?.USD||0;
    // piața −20%: fiecare poziție scade proporțional cu cât e de agitată față de VWCE (între 0,8× și 2,5×)
    const piata = r.volE ? SNAP.pozitii.reduce((a,p)=>{ const v=r.volP(p); const b=v&&r.volE?Math.min(Math.max(v/r.volE,0.8),2.5):1; return a+p.valueRON*0.2*(p.etf?1:b); },0) : T*0.2;
    const ST = [[`Piața globală scade cu 20%`, piata, 'Acțiunile mai agitate decât piața scad mai mult. Estimare din comportamentul fiecăreia în ultimul an.'],
      tp?[`Sectorul „${tn}” scade cu 30%`, T*tp/100*0.3, 'Se întâmplă când o idee la modă se răcește, chiar dacă restul pieței e bine.']:null,
      top?[`${top.symbol} scade cu 40%`, top.valueRON*0.4, 'O singură companie poate pierde mult la un rezultat slab sau o problemă internă.']:null,
      usd?[`Dolarul scade cu 10% față de leu`, T*usd/100*0.1, 'Afectează tot ce e listat în dolari, chiar dacă prețurile nu se mișcă.']:null].filter(Boolean);
    const mxs = Math.max(...ST.map(x=>x[1]));
    h += `<div class="sec"><h2>Cât de mult se mișcă portofoliul ${q('agitatie')}</h2></div><div class="card">
      <div class="tier num" style="margin-top:0"><div><b>${nf(r.vol,0)}%</b><span>volatilitate pe an</span></div><div><b class="neg">${nf(r.dd,0)}%</b><span>cea mai mare scădere</span></div><div><b class="neg">−${nf(r.luna,0)}%</b><span>o lună proastă</span></div></div>
      <div class="lbl" style="margin:16px 0 4px">Teste de stres</div>
      ${ST.map(([t,v,x])=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row"><span style="font-size:14px;font-weight:600">${esc(t)}</span><b class="num neg" style="white-space:nowrap">−${S.privat?'•••':nf(v,0)} lei</b></div>
        <div class="gauge" style="--k:var(--neg);height:6px"><i style="width:${v/mxs*100}%"></i></div><div class="sub" style="margin-top:4px">${esc(x)} ${nf(v/T*100,1)}% din portofoliu.</div></div>`).join('')}
</div>`;
  }
  O.risc=h; h='';
  // 5) Alocare: acum și ținta
  const B = BUCKETE(), tintaTema = n => n.startsWith('ETF') ? pr.tintaETF : SNAP.pozitii.filter(p=>p.tema===n).reduce((a,p)=>a+p.tinta,0);
  const bar = f => `<div class="stack">${B.map(b=>{const v=f(b.n);return v>0.05?`<div style="flex:${v};background:var(${b.c})" title="${esc(b.n)}: ${nf(v,1)}%"></div>`:''}).join('')}</div>`;
  h += `<div class="sec"><h2>Alocare: acum și ținta ${q('alocare')}</h2></div><div class="card">
    <div class="row sub"><span>Acum</span></div>${bar(n=>SNAP.teme[n])}
    <div class="row sub" style="margin-top:8px"><span>Ținta ta</span></div>${bar(tintaTema)}
    <div style="margin-top:12px">${B.map(b=>{const a=SNAP.teme[b.n],t=tintaTema(b.n),over=!b.n.startsWith('ETF')&&a>pr.maxTema;return `<div class="row" style="padding:5px 0;font-size:14px;border-bottom:1px solid var(--line)">
      <span style="display:flex;align-items:center;gap:8px;min-width:0"><i style="width:10px;height:10px;border-radius:3px;background:var(${b.c});flex:none"></i><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.n)}</span></span>
      <span class="num" style="white-space:nowrap"><b class="${over?'neg':''}">${nf(a,1)}%</b> <span class="mut">/ ${nf(t,0)}%</span></span></div>`}).join('')}</div>
</div>`;
  O.alocare=h; h='';
  // 6) Pe ultimul an, față de VWCE
  const rows = SNAP.pozitii.filter(p=>!p.etf&&p.ind?.r1a!=null&&e.r1a!=null).map(p=>({s:p.symbol,d:p.ind.r1a-e.r1a})).sort((a,b)=>b.d-a.d);
  const mx = Math.max(...rows.map(x=>Math.abs(x.d)),1);
  if (rows.length) h += `<div class="sec"><h2>Pe ultimul an, față de VWCE ${q('pp')}</h2></div><div class="card">${rows.map(x=>`
    <div class="dv"><b>${esc(x.s)}</b><div class="t"><i style="background:var(${x.d>=0?'--pos':'--neg'});${x.d>=0?`left:50%;width:${x.d/mx*50}%`:`right:50%;width:${-x.d/mx*50}%`}"></i></div><span class="num ${cls(x.d)}" style="text-align:right">${sg(x.d,1)}</span></div>`).join('')}</div>`;
  O.an=h; h='';
  // 7) Calendarul
  const azi = new Date().toISOString().slice(0,10), cal = SNAP.pozitii.filter(p=>p.rezultate && p.rezultate>=azi).sort((a,b)=>a.rezultate.localeCompare(b.rezultate));
  h += `<div class="sec"><h2>Calendar</h2></div><div class="card" style="padding:6px 16px">${cal.length?cal.map(p=>{ const z=Math.round((Date.parse(p.rezultate)-Date.parse(azi))/864e5);
    return `<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer" data-c="${A('detaliu',p.symbol)}"><span><b>${esc(p.symbol)}</b> <span class="sub">rezultate trimestriale</span></span><span class="num ${z<=7?'':'sub'}" style="${z<=7?'color:var(--opor);font-weight:700':''}">${ziRo(p.rezultate,false)} · ${z===0?'azi':z===1?'mâine':`în ${z} ${de(z)}zile`}</span></div>`; }).join('')
    :'<div class="sub" style="padding:10px 0">Nicio dată de rezultate cunoscută. Apar cu cheia Finnhub, pentru acțiunile americane.</div>'}
    <div class="row" style="padding:9px 0"><span><b>Plan</b> <span class="sub">investiția lunară</span></span><span class="num sub">${lunaFacuta()?'făcută luna asta ✓':'luna asta'}</span></div></div>`;
  O.calendar=h; h='';
  // 8) Monede
  const Vv = Object.entries(SNAP.valute||{}).sort((a,b)=>b[1]-a[1]), VC = ['--s1','--s2','--s3','--s4','--s5'];
  h += `<div class="sec"><h2>Monede ${q('moneda')}</h2></div><div class="card"><div class="stack">${Vv.map(([m,p],i)=>`<div style="flex:${p};background:var(${VC[i%5]})"></div>`).join('')}</div>
    <div class="leg">${Vv.map(([m,p],i)=>`<span><i style="background:var(${VC[i%5]});height:10px;width:10px;border-radius:3px"></i>${esc(m)} <b class="num">${nf(p,1)}%</b></span>`).join('')}</div></div>`;
  O.monede=h; h='';
  // 9) Școala de investiții
  h += `<div class="sec"><h2>Școala de investiții</h2><span class="sub">cu cifrele tale</span></div>${lectii().map(([t,ps,tu],i)=>`<details class="lec"><summary><span class="n num">${i+1}</span>${esc(t)}</summary><div class="b">${ps.map(x=>`<p>${link(x)}</p>`).join('')}${tu?`<div class="tu"><b>Pentru tine:</b> ${link(tu)}</div>`:''}</div></details>`).join('')}`;
  O.scoala=h; h='';
  // 10) Jurnal, impozit, conturi
  h += jurnalSectiune();
  O.jurnal=h; h='';
  if (SNAP.dubluri?.length) h += `<div class="sec"><h2>În ambele conturi</h2></div><div class="card">${SNAP.dubluri.map(d=>`<div style="font-size:14px;color:var(--ink2)">${esc(d)}</div>`).join('')}
    <div class="sub" style="margin-top:6px">Nu muta ce ai: mutarea înseamnă vânzare, iar vânzarea se impozitează. Doar banii noi merg într-un singur cont.</div></div>`;
  O.dubluri=h; h='';
  const Rz = SNAP.realizat;
  h += `<div class="sec"><h2>Impozit ${Rz?.an||''} ${q('impozit')}</h2></div><div class="card">${Rz?`
    <div class="row num"><div><div class="lbl">Impozit estimat</div><div class="hero" style="font-size:28px">${S.privat?'•••':nf(Rz.impozitEstimat)}<small>lei</small></div></div>
      <div style="text-align:right"><div class="lbl">Câștig net</div><div class="${cls(Rz.totalLei)}" style="font-size:18px;font-weight:700">${sgL(Rz.totalLei)} lei</div></div></div>
    <div class="kv num" style="margin-top:10px">${Rz.peBroker.map(b=>`<span>${esc(b.broker)} · ${b.n} vânzări</span><span class="${cls(b.lei)}">${sgL(b.lei)} lei</span>`).join('')}</div>
    <div class="sub" style="margin-top:8px">Declari în Declarația Unică până la ${esc(Rz.termen)} anul viitor. eToro e convertit cu cursul BNR din ziua vânzării. E o estimare: verifică cu rapoartele anuale ale brokerilor${Rz.faraCurs?` (${Rz.faraCurs} tranzacții fără curs BNR)`:''}.</div>`
    :`<div class="sub">Apare la prima analiză cu date reale.</div>`}</div>`;
  O.impozit=h; h='';
  h += `<div class="sec"><h2>Conturi și curs</h2></div><div class="card">${['Trading 212','eToro'].map(b=>{const v=SNAP.pozitii.flatMap(p=>p.brokers).filter(x=>x.broker===b).reduce((a,x)=>a+x.valueRON,0);return `<div class="row num" style="padding:4px 0"><span class="ink2">${b}</span><b>${lei(v)}</b></div>`}).join('')}
    ${SNAP.fx?`<div class="sub num" style="margin-top:6px">1 USD = ${nf(SNAP.fx.USD,4)} lei · 1 EUR = ${nf(SNAP.fx.EUR,4)} lei · ${esc(SNAP.fx.sursa||'')}${SNAP.fx.data?', '+ziRo(SNAP.fx.data):''}</div>`:''}</div>`;
  O.conturi=h;
  O.randament=randamentHTML(); O.costuri=costuriHTML(); O.dividende=dividendeHTML(); O.corelatii=corelatiiHTML(corelatiiPortofoliu());
  return O;
}

// ===== v0.15: corelații, randament real, costuri, dividende, alerte de preț =====
function corelatiiPortofoliu(){
  if (!M) return null;
  const poz = SNAP.pozitii.filter(p=>p.serie?.c?.length>120); if (poz.length<2) return null;
  const K = M.corelatii(Object.fromEntries(poz.map(p=>[p.symbol,{d:p.serie.d,c:p.serie.c}]))); // ultimul an, pe săptămâni
  const ne = M.pariuriEfective(Object.fromEntries(poz.map(p=>[p.symbol,p.pondere])), K.M);
  const act = poz.filter(p=>!p.etf).map(p=>p.symbol), par = {}, f = x => par[x]===x ? x : (par[x]=f(par[x]));
  act.forEach(x=>par[x]=x);
  for (const a of act) for (const b of act) if (a<b && K.M[a][b]>=0.7) par[f(a)]=f(b);
  const gr = {}; act.forEach(x=>(gr[f(x)] ||= []).push(x));
  const grupuri = Object.values(gr).filter(g=>g.length>1).map(g=>{ let s=0,n=0; for(const a of g) for(const b of g) if(a<b){ s+=K.M[a][b]; n++; }
    return { s:g, rho:s/n, pondere:g.reduce((a,x)=>a+SNAP.pozitii.find(p=>p.symbol===x).pondere,0) }; }).sort((a,b)=>b.pondere-a.pondere);
  if (!ne || K.puncte < 20) return null; // prea puține săptămâni comune: nu inventăm o corelație
  return { K, ne, grupuri, poz };
}
const culRho = r => r==null ? 'var(--panel2)' : r>=0.7 ? `color-mix(in srgb,var(--neg) ${Math.round(45+50*(r-0.7)/0.3)}%,var(--panel2))` : r>=0.4 ? `color-mix(in srgb,var(--warn) ${Math.round(30+40*(r-0.4)/0.3)}%,var(--panel2))` : r>=0 ? `color-mix(in srgb,var(--flat) ${Math.round(10+25*r/0.4)}%,var(--panel2))` : `color-mix(in srgb,var(--acc) ${Math.round(20+50*Math.min(-r,1))}%,var(--panel2))`;
function corelatiiHTML(c){
  if (!c) return `<div class="card sub">Ai nevoie de cel puțin două poziții cu istoric de prețuri.</div>`;
  const s = c.poz.map(p=>p.symbol), n = s.length, sc = x => esc(x.replace(/\..*$/,'').slice(0,4));
  return `<div class="sec"><h2>Ce se mișcă împreună ${q('corelatie')}</h2></div><div class="card">
    <div class="row"><div><div class="lbl">Diversificare reală</div><div class="hero fd" style="font-size:32px">${nf(c.ne,1)}<small>din ${n}</small></div></div>
      <div class="sub" style="text-align:right;max-width:52%">${c.ne<n/3?'Multe poziții se comportă ca una singură.':c.ne<n/1.7?'Diversificare parțială.':'Pozițiile se mișcă destul de independent.'}</div></div>
    <div class="hm" style="grid-template-columns:38px repeat(${n},1fr)"><span></span>${s.map(x=>`<b class="hx">${sc(x)}</b>`).join('')}
      ${s.map(a=>`<b class="hy">${sc(a)}</b>${s.map(b=>`<i title="${esc(a)} · ${esc(b)}: ${nf(c.K.M[a][b],2)}" style="background:${a===b?'var(--line)':culRho(c.K.M[a][b])}"></i>`).join('')}`).join('')}</div>
    <div class="leg" style="margin-top:10px"><span><i style="background:${culRho(0.9)};height:10px;width:10px;border-radius:3px"></i>se mișcă la fel</span><span><i style="background:${culRho(0.55)};height:10px;width:10px;border-radius:3px"></i>parțial</span><span><i style="background:${culRho(0.15)};height:10px;width:10px;border-radius:3px"></i>independent</span></div>
    ${c.grupuri.length?c.grupuri.map(g=>`<div class="al" style="margin-top:10px;border-left-color:var(--neg)"><b>${g.s.map(esc).join(', ')}</b> se mișcă aproape la fel (corelație ${nf(g.rho,2)}). Împreună au ${nf(g.pondere,1)}% din portofoliu: se comportă ca o singură poziție.</div>`).join(''):`<div class="sub" style="margin-top:8px">Nicio grupare de acțiuni care să se miște aproape identic.</div>`}
</div>`;
}
function randamentHTML(){
  const r = SNAP.randament, e = SNAP.etfRef||{};
  if (!r || r.anual==null) return `<div class="sec"><h2>Randamentul tău real ${q('xirr')}</h2></div><div class="card sub">${r?.inCurs?'Se adună istoricul tranzacțiilor din Trading 212, câteva pagini la fiecare analiză. Apare după câteva rulări.':'Apare după prima analiză cu istoricul tranzacțiilor.'}</div>`;
  return `<div class="sec"><h2>Randamentul tău real ${q('xirr')}</h2></div><div class="card">
    <div class="row"><div><div class="lbl">Pe an, pe banii tăi</div><div class="hero fd ${cls(r.anual)}" style="font-size:34px">${sg(r.anual,1)}<small>%</small></div></div>
      ${r.vwce?.anual!=null?`<div style="text-align:right"><div class="lbl">VWCE, aceleași depuneri</div><div class="fd ${cls(r.vwce.anual)}" style="font-size:20px;font-weight:700">${sg(r.vwce.anual,1)}%</div></div>`:''}</div>
    ${r.vwce?.anual!=null?`<div class="al ${r.anual>=r.vwce.anual?'good':''}" style="margin:10px 0 0">${r.anual>=r.vwce.anual?`Alegerile tale au adus <b>${nf(r.anual-r.vwce.anual,1)} puncte procentuale</b> pe an peste varianta „totul în VWCE”.`:`Varianta „totul în VWCE”, cu exact aceleași sume și date, ar fi adus <b>${nf(r.vwce.anual-r.anual,1)} puncte procentuale</b> pe an mai mult.`}${r.vwce.valoare&&!S.privat?` Ar valora azi ${nf(r.vwce.valoare,0)} lei.`:''}</div>`:`<div class="sub" style="margin-top:6px">Comparația cu VWCE pe aceleași depuneri apare când există prețul VWCE pentru toate datele depunerilor.</div>`}
    <div class="sub" style="margin-top:6px">${r.dela?`Din ${ziRo(r.dela)}. `:''}${r.complet?'':'Istoricul Trading 212 încă se adună: cifra se va corecta.'}</div></div>`;
}
function costuriHTML(){
  const c = SNAP.costuri; if (!c) return `<div class="sec"><h2>Costuri ${q('costuri')}</h2></div><div class="card sub">Apare după prima analiză cu istoricul tranzacțiilor.</div>`;
  return `<div class="sec"><h2>Costuri ${q('costuri')}</h2></div><div class="card">
    <div class="tier num" style="margin-top:0"><div><b>${S.privat?'•••':nf(c.platite,2)}</b><span>lei plătiți până acum</span></div><div><b>${S.privat?'•••':nf(c.totalAn,0)}</b><span>lei pe an, estimat</span></div><div><b>${nf(c.procentAn,2)}%</b><span>din portofoliu, pe an</span></div></div>
    <div class="kv num" style="margin-top:12px"><span>Comision valutar plătit (Trading 212)</span><span>${lei(c.platiteFX)}</span><span>Costul anual al ETF-urilor (TER, VWCE 0,14%)</span><span>${lei(c.ter)}</span>
      <span>Comision valutar la depunerile lunare</span><span>${lei(c.fxAn)}</span></div>
    ${c.complet?'':'<div class="sub" style="margin-top:8px">Istoricul Trading 212 încă se adună.</div>'}</div>`;
}
function dividendeHTML(){
  const d = SNAP.dividende; if (!d) return `<div class="sec"><h2>Dividende ${q('dividende')}</h2></div><div class="card sub">Apare după prima analiză.</div>`;
  const mx = Math.max(...(d.peActiune||[]).map(x=>x.lei),0.01);
  return `<div class="sec"><h2>Dividende ${q('dividende')}</h2></div><div class="card">
    <div class="tier num" style="margin-top:0"><div><b>${S.privat?'•••':nf(d.incasateAn,2)}</b><span>lei încasați anul ăsta</span></div><div><b>${S.privat?'•••':nf(d.estimatAn,0)}</b><span>lei pe an, estimat brut</span></div><div><b>${nf(d.randament,2)}%</b><span>randament din dividende</span></div></div>
    ${(d.peActiune||[]).length?`<div style="margin-top:12px">${d.peActiune.map(x=>`<div class="dv" style="grid-template-columns:58px 1fr auto"><b>${esc(x.symbol)}</b><div class="t" style="--x:0"><i style="background:var(--pos);left:0;width:${x.lei/mx*100}%"></i></div><span class="num sub" style="text-align:right">${nf(x.randDiv,2)}% · ${S.privat?'•••':nf(x.lei,2)} lei</span></div>`).join('')}</div>`:''}
    <div class="sub" style="margin-top:8px">Estimarea e brută. La acțiunile americane, SUA rețin de obicei 10% la sursă (cu formularul W-8BEN), iar în România mai datorezi diferența până la 16%.</div>
    ${d.faraPermisiune?`<div class="al" style="margin-top:10px">Ca să vezi dividendele încasate, bifează la cheia Trading 212 și „History - Dividends”.</div>`:''}
    ${(d.ultimele||[]).length?`<div class="lbl" style="margin:14px 0 4px">Ultimele încasări</div><div class="kv num">${d.ultimele.slice(0,6).map(x=>`<span>${esc(x.symbol)} · ${ziRo(x.data,false)}</span><span class="pos">+${S.privat?'•••':nf(x.lei,2)} lei</span>`).join('')}</div>`:''}
</div>`;
}
// ---- Alertele de preț: stau în profil (criptat), le verifică analiza din GitHub ----
const alerte = () => profilUser().alerte || [];
const atinse = () => ({ ...(SNAP?.alerteAtinse||{}), ...(intraValid()?INTRA.alerteAtinse||{}:{}) });
const pretAcum = p => (intraValid() ? INTRA.pozitii.find(x=>x.symbol===p.symbol)?.pret : null) ?? p.ind?.pret;
function alerteHTML(p){
  const al = alerte().filter(a=>a.s===p.symbol), at = atinse(), pr = pretAcum(p), d = DET.ad || 'sub';
  return `<div class="sec"><h2>Alertă de preț</h2></div><div class="card">
    ${al.length?al.map(a=>{ const k=`${a.s}:${a.d}:${a.p}`, dist=pr?(a.p/pr-1)*100:null;
      return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b class="${a.d==='sub'?'down':'up'}">${a.d==='sub'?'▼ sub':'▲ peste'} ${nf(a.p)}</b> <span class="sub">${at[k]?`atinsă pe ${ziRo(at[k],false)}`:dist!=null?`mai e ${sg(dist,1)}%`:''}</span></span><button class="link" style="color:var(--mut)" data-c="${A('stergeAlerta',a.s,a.d,a.p)}">Șterge</button></div>`; }).join('')
      :'<div class="sub" style="margin-bottom:8px">Primești o notificare când prețul trece pragul. Verificarea se face din oră în oră, în timpul ședinței.</div>'}
    <div style="display:flex;gap:8px;align-items:center;margin-top:10px"><div class="seg" style="flex:1">${[['sub','Sub'],['peste','Peste']].map(([k,t])=>`<button class="${d===k?'on':''}" data-c="${A('detAd',k,p.symbol)}">${t}</button>`).join('')}</div>
      <input id="apret" type="number" inputmode="decimal" step="0.01" style="flex:1;margin:0" value="${pr?(+(pr*(d==='sub'?0.9:1.1)).toPrecision(4)):''}" aria-label="Prețul alertei, în ${esc(p.moneda||'')}">
      <button class="btn sm" data-c="${A('adaugaAlerta',p.symbol)}">Adaugă</button></div>
    <div class="sub" style="margin-top:6px">Preț în ${esc(p.moneda||'moneda acțiunii')}${pr?`, acum ${nf(pr)}`:''}.</div></div>`;
}
async function scrieAlerte(lista, sym){
  const u = profilUser(); V.profil = { anTinta:u.anTinta, suma:u.suma, alerte:lista, sincronizat:false };
  await salveazaSeif(); vib(); detaliu(sym, DET.zile); await sincronizeazaProfil('profil');
}
function adaugaAlerta(sym){
  const p = +String($('apret').value).replace(',','.'), d = DET.ad || 'sub';
  if (!(p>0)) { toast('Scrie un preț.'); return; }
  if (alerte().length >= 30) { toast('Ai deja 30 de alerte.'); return; }
  scrieAlerte([...alerte().filter(a=>!(a.s===sym&&a.d===d&&a.p===p)), {s:sym, d, p}], sym);
}
function stergeAlerta(s, d, p){ scrieAlerte(alerte().filter(a=>!(a.s===s&&a.d===d&&a.p===p)), s); }
// ===== Analiză: galaxia, sănătatea și concluziile pe grupe, fiecare cu detaliile ei =====
function deschideSect(k){
  if (k==='scoala') { go('invata'); return; }
  const O = sectiuniAnaliza();
  openSheet(`<div class="grab"></div>${O[k]||''}${k==='jurnal'&&O.dubluri?O.dubluri:''}<button class="btn ghost" style="margin-top:14px" data-c="${A('closeSheet')}">Închide</button>`);
}
const tile = (k, ico, titlu, val, sub, viz='', lat='') => `<button class="tile ${lat}" data-c="${A('deschideSect',k)}"><div class="th">${ic(ico)}<span>${titlu}</span></div><div class="tv fd num">${val}</div>${sub?`<div class="sub">${sub}</div>`:''}${viz}</button>`;
// ===== Galaxia ta: portofoliul ca un sistem solar 3D, desenat pe canvas =====
// ETF-ul e steaua din centru, sectoarele sunt orbite, acțiunile sunt planete (mărimea = ponderea, inelul = semnalul,
// sigla pe planetă). Tragi cu degetul ca s-o rotești și s-o înclini; atingi o planetă ca s-o vezi; „Reluare” arată
// cum s-a schimbat sistemul în ultimul an, după prețurile zilnice.
const GX = { on:false, raf:0 };
function galaxieHTML(){
  return `<div class="gx" data-noswipe><canvas id="gxc" aria-label="Portofoliul ca sistem solar: ETF-ul în centru, acțiunile pe orbitele sectoarelor"></canvas>
    <div class="gxtop"><span class="gxd" id="gxd"></span><button class="gxb" id="gxp" data-c="${A('gxReluare')}">${ic('play')}<span>Ultimul an</span></button></div>
    <div class="gxinfo" id="gxi"></div></div>`;
}
function gxCul(n){ return cssv(n) || '#5aa2ff'; }
function gxDate(){
  const pr = P(), etf = SNAP.pozitii.filter(p=>p.etf), etfP = etf.reduce((a,p)=>a+p.pondere,0);
  const sect = BUCKETE().filter(b=>!b.n.startsWith('ETF')), n = sect.length;
  const cnt = b => SNAP.pozitii.filter(p=>!p.etf && p.tema===b.n).length; // orbitele cu mai multe planete stau mai departe, unde au loc
  const orb = [...sect].sort((a,b)=>cnt(a)-cnt(b)).map((b,k)=>({ n:b.n, c:gxCul(b.c), plin:(SNAP.teme[b.n]||0)>pr.maxTema, R: 0.36 + 0.62*(n<2?0.5:k/(n-1)) }));
  const pl = [];
  orb.forEach((o,k)=>{ const ps = SNAP.pozitii.filter(p=>!p.etf && p.tema===o.n);
    ps.forEach((p,j)=>{ const cl = culoriActiune(p.symbol), l = sigla(p); let im = null; if (l) { im = new Image(); im.src = l; }
      pl.push({ p, o, R:o.R, a0:(j/ps.length)*Math.PI*2 + k*1.3, w:0.32/Math.pow(o.R+0.25,1.5), c: cl ? cl.c : o.c, s: gxCul(SEMC[sem(p)]), im, pond:p.pondere, m: MISC(p) }); }); });
  // reluarea: ponderea fiecărei zile, din prețurile istorice (cantitățile de azi)
  const zile = [...new Set(SNAP.pozitii.flatMap(p=>p.serie?.d||[]))].filter(Boolean).sort().slice(-252);
  const val = SNAP.pozitii.map(p=>{ const s=p.serie; if(!s?.c?.length) return zile.map(()=>p.valueRON); const m=new Map(s.d.map((d,i)=>[d,s.c[i]])), u=s.c.at(-1); let x=null; return zile.map(d=>{ x=m.get(d)??x; return x&&u ? p.valueRON*x/u : p.valueRON; }); });
  const tot = zile.map((_,i)=>val.reduce((a,v)=>a+v[i],0));
  const istoric = { zile, tot, w: SNAP.pozitii.map((p,k)=>val[k].map((v,i)=>v/tot[i]*100)) };
  return { pr, etfP, orb, pl, istoric, star:gxCul('--acc'), star2:gxCul('--acc2'), ink:gxCul('--ink'), mut:gxCul('--mut'), bg:gxCul('--panel') };
}
function galaxie(){
  const cv = $('gxc'); if (!cv) return;
  cancelAnimationFrame(GX.raf);
  const D = gxDate(), calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { yaw: GX.yaw ?? 0.6, tilt: GX.tilt ?? 0.62, vy: 0, t0: performance.now(), sel: GX.sel ?? null, drag: null, rel: null };
  Object.assign(GX, { on:true, D, st });
  const ctx = cv.getContext('2d');
  let W=0, H=0, dpr=1;
  const stele = Array.from({length:170},()=>({ x:Math.random(), y:Math.random(), r:Math.random()*1.1+0.2, f:Math.random()*6.28, d:Math.random()*0.8+0.2 }));
  // fundalul (nebuloase + stelele fixe) se desenează o singură dată, pe un canvas separat; pe fiecare cadru se copiază
  const fond = document.createElement('canvas'), fc = fond.getContext('2d');
  const deseneazaFond = () => { fond.width = cv.width; fond.height = cv.height; fc.setTransform(dpr,0,0,dpr,0,0);
    D.orb.slice(0,4).forEach((o,i)=>{ const a=i*1.7, x=W/2+Math.cos(a)*W*0.28, y=H/2+Math.sin(a*1.3)*H*0.22, g=fc.createRadialGradient(x,y,0,x,y,W*0.45); g.addColorStop(0,o.c+'1f'); g.addColorStop(1,o.c+'00'); fc.fillStyle=g; fc.fillRect(0,0,W,H); });
    fc.fillStyle=D.ink; stele.forEach((s,i)=>{ if (i%6===0) return; fc.globalAlpha=0.18+0.4*s.d; fc.beginPath(); fc.arc(s.x*W,s.y*H,s.r,0,6.283); fc.fill(); }); fc.globalAlpha=1; };
  const marime = () => { const r=cv.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1, 3); W=r.width; H=r.height; cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); deseneazaFond(); };
  marime(); GX.marime = marime;
  const proj = (R, a) => { const S=Math.min(W*0.41,H*0.62), x=R*S*Math.cos(a+st.yaw), z=R*S*Math.sin(a+st.yaw), y=z*st.tilt, k=1+z/(S*4.5); return { x:W/2+x*k, y:H/2+y*k, z, k }; };
  const rStar = () => (14 + 30*Math.sqrt(Math.max(D.etfP,1)/100)) * Math.min(W,360)/360;
  const rPl = q => Math.max(3.5, (4 + 22*Math.sqrt(q/100)) * Math.min(W,360)/360);
  function cadru(now){
    if (!cv.isConnected || VIEW!=='analiza') { GX.on=false; return; }
    const t = calm ? 0 : (now - st.t0)/1000;
    if (!st.drag) { st.yaw += st.vy; st.vy *= 0.94; if (!calm && Math.abs(st.vy)<0.0004) st.yaw += 0.0009; }
    GX.yaw = st.yaw; GX.tilt = st.tilt;
    // reluarea: ziua curentă
    let zi = null; if (st.rel) { const f = Math.min((now-st.rel.t0)/9000, 1); zi = Math.round(f*(D.istoric.zile.length-1)); if (f>=1) { st.rel=null; $('gxp')?.classList.remove('on'); setTimeout(()=>{ if($('gxd')) $('gxd').textContent=''; }, 1600); } }
    const pond = p => zi==null ? p.pondere : D.istoric.w[SNAP.pozitii.indexOf(p)][zi];
    if (zi!=null && $('gxd')) { const tz=D.istoric.tot, ch=(tz[zi]/tz[0]-1)*100; $('gxd').innerHTML = `${ziRo(D.istoric.zile[zi])} <b class="${ch>=0?'pos':'neg'}">${sg(ch,1)}%</b>`; }
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); ctx.drawImage(fond,0,0);
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    // doar o parte din stele clipesc (cele sărite la fundal), restul stau pe fundalul gata desenat
    ctx.fillStyle=D.ink; for (let i=0;i<stele.length;i+=6) { const s=stele[i], a=0.2+0.7*(0.5+0.5*Math.sin(t*1.6*s.d+s.f)); ctx.globalAlpha=a; ctx.beginPath(); ctx.arc(s.x*W,s.y*H,s.r+0.3,0,6.283); ctx.fill(); }
    ctx.globalAlpha=1;
    // orbitele, în două jumătăți (în spatele stelei și în fața ei)
    const orbita = (o, fata) => { ctx.beginPath(); let on=false; for (let i=0;i<=96;i++) { const a=i/96*6.283, q=proj(o.R,a); if ((q.z>=0)===fata) { on?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); on=true; } else on=false; }
      ctx.strokeStyle=o.c; ctx.globalAlpha=fata?(o.plin?0.75:0.42):(o.plin?0.35:0.18); ctx.lineWidth=o.plin?1.8:1; ctx.setLineDash(o.plin?[]:[3,5]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1; };
    // planetele, ordonate după adâncime
    const P_ = D.pl.map(x=>{ const a=x.a0+t*x.w, q=proj(x.R,a); return {...x, a, q, r:rPl(pond(x.p))*q.k}; }).sort((a,b)=>a.q.z-b.q.z);
    D.orb.forEach(o=>orbita(o,false));
    const planeta = x => { const {q,r}=x, behind=q.z<0, dim=behind?0.72:1;
      // urma pe orbită
      ctx.beginPath(); for (let i=0;i<=14;i++) { const qq=proj(x.R, x.a - i*0.035); i?ctx.lineTo(qq.x,qq.y):ctx.moveTo(qq.x,qq.y); } ctx.strokeStyle=x.c; ctx.globalAlpha=0.32*dim; ctx.lineWidth=Math.max(r*0.5,1.2); ctx.lineCap='round'; ctx.stroke(); ctx.globalAlpha=1;
      // strălucirea zilei: verde dacă a urcat azi, roșu dacă a scăzut
      if (x.m!=null && Math.abs(x.m)>0.3 && zi==null) { const g=ctx.createRadialGradient(q.x,q.y,r,q.x,q.y,r*2.6), c=gxCul(x.m>0?'--pos':'--neg'); g.addColorStop(0,c+'55'); g.addColorStop(1,c+'00'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(q.x,q.y,r*2.6,0,6.283); ctx.fill(); }
      // sfera, luminată dinspre stea
      const lx=W/2-q.x, ly=H/2-q.y, ln=Math.hypot(lx,ly)||1, g=ctx.createRadialGradient(q.x+lx/ln*r*0.45,q.y+ly/ln*r*0.45,r*0.1,q.x,q.y,r);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.18,x.c); g.addColorStop(1,'#000000');
      ctx.globalAlpha=dim; ctx.fillStyle=g; ctx.beginPath(); ctx.arc(q.x,q.y,r,0,6.283); ctx.fill();
      // sigla companiei pe planetă (la orice mărime); fără siglă, inițialele
      if (x.im?.complete && x.im.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.arc(q.x,q.y,r*0.8,0,6.283); ctx.clip(); ctx.fillStyle='#fff'; ctx.fill(); ctx.drawImage(x.im,q.x-r*0.64,q.y-r*0.64,r*1.28,r*1.28); ctx.restore(); }
      else if (r>=7) { ctx.fillStyle='#ffffff'; ctx.globalAlpha=dim*0.95; ctx.font=`700 ${Math.max(7,r*0.58)}px SG,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; const ti=x.p.symbol.replace(/\..*$/,'').slice(0,r>=12?4:2); ctx.lineWidth=Math.max(2,r*0.16); ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineJoin='round'; ctx.strokeText(ti, q.x, q.y+0.5); ctx.fillText(ti, q.x, q.y+0.5); ctx.textBaseline='alphabetic'; }
      // inelul semnalului
      ctx.beginPath(); ctx.arc(q.x,q.y,r+2.2,0,6.283); ctx.strokeStyle=x.s; ctx.lineWidth=1.6; ctx.stroke();
      if (st.sel===x.p.symbol) { ctx.beginPath(); ctx.arc(q.x,q.y,r+7+Math.sin(t*4)*1.5,0,6.283); ctx.strokeStyle=D.ink; ctx.globalAlpha=0.8; ctx.lineWidth=1.2; ctx.setLineDash([2,3]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(q.x,q.y); ctx.lineTo(W/2,H/2); ctx.strokeStyle=x.c; ctx.globalAlpha=0.35; ctx.stroke(); }
      ctx.globalAlpha=behind?0.55:0.9; ctx.fillStyle=D.ink; ctx.font=`600 ${Math.max(9,10*q.k)}px system-ui,sans-serif`; ctx.textAlign='center'; ctx.fillText(x.p.symbol.replace(/\..*$/,''), q.x, q.y+r+14*q.k); ctx.globalAlpha=1; };
    P_.filter(x=>x.q.z<0).forEach(planeta);
    // steaua: ETF-ul, cu coroană care pulsează și ținta ca un cerc punctat
    const rs = rStar()*(zi==null?1:Math.sqrt(Math.max(D.istoric.w.reduce((a,w,k)=>a+(SNAP.pozitii[k].etf?w[zi]:0),0),0.5)/Math.max(D.etfP,0.5))), cx=W/2, cy=H/2;
    for (let i=0;i<3;i++) { const g=ctx.createRadialGradient(cx,cy,rs*0.6,cx,cy,rs*(2.2+i*0.9+0.15*Math.sin(t*1.3+i))); g.addColorStop(0,D.star+(i?'30':'55')); g.addColorStop(1,D.star+'00'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,rs*3.6,0,6.283); ctx.fill(); }
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*0.15); for (let i=0;i<12;i++) { ctx.rotate(Math.PI/6); const L=rs*(1.5+0.35*Math.sin(t*2+i*1.7)); const g=ctx.createLinearGradient(0,0,L,0); g.addColorStop(0,D.star2+'aa'); g.addColorStop(1,D.star2+'00'); ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(0,-rs*0.12); ctx.lineTo(L,0); ctx.lineTo(0,rs*0.12); ctx.fill(); } ctx.restore();
    const gs=ctx.createRadialGradient(cx-rs*0.3,cy-rs*0.35,rs*0.1,cx,cy,rs); gs.addColorStop(0,'#ffffff'); gs.addColorStop(0.35,D.star); gs.addColorStop(1,D.star2); ctx.fillStyle=gs; ctx.beginPath(); ctx.arc(cx,cy,rs,0,6.283); ctx.fill();
    const rT=(14 + 30*Math.sqrt(Math.max(D.pr.tintaETF,1)/100))*Math.min(W,360)/360; ctx.beginPath(); ctx.arc(cx,cy,rT+6,0,6.283); ctx.strokeStyle=D.star; ctx.globalAlpha=0.55; ctx.setLineDash([2,4]); ctx.lineWidth=1.2; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
    ctx.fillStyle='#04101d'; ctx.font=`700 ${Math.max(11,rs*0.42)}px SG,system-ui,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(nf(zi==null?D.etfP:D.istoric.w.reduce((a,w,k)=>a+(SNAP.pozitii[k].etf?w[zi]:0),0),0)+'%', cx, cy+1); ctx.textBaseline='alphabetic';
    D.orb.forEach(o=>orbita(o,true));
    P_.filter(x=>x.q.z>=0).forEach(planeta);
    GX.cadru = P_;
    if (!calm && !document.hidden) GX.raf = requestAnimationFrame(cadru); else GX.on=false;
  }
  // atingere: tragi = rotești și înclini; atingi = alegi o planetă
  cv.onpointerdown = e => { st.drag = {x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, tm:performance.now()}; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { const d=st.drag; if(!d) return; const dx=e.clientX-d.x, dy=e.clientY-d.y; st.yaw += dx*0.012; st.vy = dx*0.012*0.6; st.tilt = Math.min(Math.max(st.tilt - dy*0.004, 0.16), 0.9); d.x=e.clientX; d.y=e.clientY; if (calm) cadru(performance.now()); };
  cv.onpointerup = e => { const d=st.drag; st.drag=null; if (!d) return; if (Math.hypot(e.clientX-d.x0, e.clientY-d.y0) < 8) gxAtinge(e); };
  cv.onpointercancel = () => { st.drag=null; };
  GX.cadruF = cadru;
  GX.raf = requestAnimationFrame(cadru);
  gxInfo();
}
function gxAtinge(e){
  const cv=$('gxc'), r=cv.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top, st=GX.st;
  const hit = [...(GX.cadru||[])].reverse().find(p=>Math.hypot(p.q.x-x,p.q.y-y) < p.r+10);
  if (hit) { if (st.sel===hit.p.symbol) { deschideDetaliu(hit.p.symbol); return; } st.sel = GX.sel = hit.p.symbol; vib(); }
  else if (Math.hypot(x-r.width/2,y-r.height/2) < 40) { st.sel = GX.sel = 'ETF'; vib(); }
  else st.sel = GX.sel = null;
  gxInfo(); if (!GX.on) GX.cadruF?.(performance.now());
}
function gxInfo(){
  const el=$('gxi'); if (!el) return; const s=GX.st?.sel;
  if (!s) { el.innerHTML = `<span class="sub">Trage ca s-o rotești. Atinge o planetă ca s-o vezi.</span>`; return; }
  if (s==='ETF') { const e=SNAP.pozitii.filter(p=>p.etf), w=e.reduce((a,p)=>a+p.pondere,0); el.innerHTML = `<b>ETF-ul de bază</b><span class="sub"> ${nf(w,1)}% din portofoliu, ținta ta e ${P().tintaETF}%</span>`; return; }
  const p = SNAP.pozitii.find(x=>x.symbol===s); if (!p) return;
  const m = MISC(p), u = sem(p);
  el.innerHTML = `${avatar(p,'mic')}<div style="flex:1;min-width:0"><b>${esc(p.symbol)}</b> <span class="pill2" style="--k:var(${SEMC[u]})">${SEM[u]}</span><div class="sub">${esc(p.tema)} · ${nf(p.pondere,1)}% din portofoliu${m!=null?` · azi <span class="${cls(m)}">${sg(m,1)}%</span>`:''}</div></div><button class="link" data-c="${A('deschideDetaliu',p.symbol)}">Fișa ›</button>`;
}
function gxReluare(){ if (!GX.st) return; vib(); GX.st.rel = { t0: performance.now() }; $('gxp')?.classList.add('on'); if (!GX.on) { GX.on=true; GX.raf=requestAnimationFrame(GX.cadruF); } }
addEventListener('resize', ()=>{ if (GX.on && $('gxc')) GX.marime?.(); });
document.addEventListener('visibilitychange', ()=>{ if (!document.hidden && VIEW==='analiza' && $('gxc') && !GX.on) galaxie(); });

function vAnaliza(){
  const pr = P(), T = SNAP.totalRON, sn = sanatate(), r = riscPortofoliu(), ist = (IST||[]).filter(x=>x.totalRON&&x.bench);
  let h = '';
  // 1) Galaxia ta
  h += `<div class="sec" style="margin-top:6px"><h2>Galaxia ta ${q('orbita')}</h2><span class="sub">trage, atinge</span></div>
  <div class="card gxc">${galaxieHTML()}
    <div class="leg" style="justify-content:center;margin-top:8px"><span><i style="background:var(--adauga);height:8px;width:8px;border-radius:50%"></i>Cumpără</span><span><i style="background:var(--pastreaza);height:8px;width:8px;border-radius:50%"></i>Las-o</span><span><i style="background:var(--verifica);height:8px;width:8px;border-radius:50%"></i>Uită-te la ea</span></div></div>`;
  // 2) Sănătatea, pe scurt
  h += `<button class="card sanc" data-c="${A('deschideSect','sanatate')}">${inel(sn.sc, sn.et[1])}<div style="flex:1;min-width:0;text-align:left"><div class="lbl">Sănătatea portofoliului</div><div class="fd" style="font-size:20px;font-weight:700;color:var(${sn.et[1]})">${sn.et[0]}</div>
    <div class="mini4">${sn.F.map(f=>`<span title="${esc(f.n)}"><i style="width:${f.v/25*100}%;background:var(${kF(f.v)})"></i></span>`).join('')}</div><div class="sub" style="margin-top:4px">${sn.F.map(f=>f.n.split(' ')[0]).join(' · ')}</div></div><span class="ch">›</span></button>`;
  // 3) Grila de concluzii
  const cs = [...SNAP.pozitii].sort((a,b)=>b.pnlRON-a.pnlRON), tot = cs.reduce((a,p)=>a+p.pnlRON,0), mx = Math.max(...cs.map(p=>Math.abs(p.pnlRON)),1);
  const [tn,tp] = Object.entries(SNAP.teme).filter(([n])=>!n.startsWith('ETF')&&n!=='Altele').sort((a,b)=>b[1]-a[1])[0]||['',0];
  const piata = r ? (r.volE ? SNAP.pozitii.reduce((a,p)=>{ const v=r.volP(p); const b=v&&r.volE?Math.min(Math.max(v/r.volE,0.8),2.5):1; return a+p.valueRON*0.2*(p.etf?1:b); },0) : T*0.2) : 0;
  const stresMax = r ? Math.max(piata, T*tp/100*0.3, (SNAP.pozitii.filter(p=>!p.etf).sort((a,b)=>b.pondere-a.pondere)[0]?.valueRON||0)*0.4, T*(SNAP.valute?.USD||0)/100*0.1) : null;
  const azi = new Date().toISOString().slice(0,10), urm = SNAP.pozitii.filter(p=>p.rezultate&&p.rezultate>=azi).sort((a,b)=>a.rezultate.localeCompare(b.rezultate))[0];
  const e = SNAP.etfRef||{}, an = SNAP.pozitii.filter(p=>!p.etf&&p.ind?.r1a!=null&&e.r1a!=null).map(p=>({s:p.symbol,d:p.ind.r1a-e.r1a})).sort((a,b)=>b.d-a.d);
  const usd = SNAP.valute?.USD||0, B = BUCKETE(), tintaTema = n => n.startsWith('ETF') ? pr.tintaETF : SNAP.pozitii.filter(p=>p.tema===n).reduce((a,p)=>a+p.tinta,0);
  const stack = f => `<div class="stack" style="height:10px;margin-top:6px">${B.map(b=>{const v=f(b.n);return v>0.05?`<div style="flex:${v};background:var(${b.c})"></div>`:''}).join('')}</div>`;
  const nJ = jurnalTot_().length, dif = SNAP.bench?.diferenta;
  h += `<div class="sec gsec"><h2>Cum merg banii</h2><span class="sub">randament și comparații</span></div><div class="bento">
    ${SNAP.randament?.anual!=null?tile('randament','racheta','Randamentul tău real', sg(SNAP.randament.anual,1)+'<small>% pe an</small>', SNAP.randament.vwce?.anual!=null?`VWCE cu aceleași depuneri: ${sg(SNAP.randament.vwce.anual,1)}%`:'pe banii tăi, la data fiecărei depuneri','','lat acc'):tile('randament','racheta','Randamentul tău real','în curând','se adună istoricul tranzacțiilor','','lat')}
    ${tile('vwce','trofeu','Tu față de VWCE', dif!=null?sgL(dif,0)+' <small>lei</small>':'în curând', dif!=null?(dif>=0?'alegerile tale au adăugat valoare':'varianta simplă ar fi dat mai mult'):'apare după câteva luni de date', ist.length>5?spark(ist.map(x=>x.totalRON/x.bench)):'')}
    ${tile('castig','monede','Câștig total', sgL(tot,0)+' <small>lei</small>', `${cs[0]?.symbol} aduce cel mai mult`, `<div class="minib">${cs.slice(0,6).map(p=>`<i style="height:${Math.max(Math.abs(p.pnlRON)/mx*100,6)}%;background:var(${p.pnlRON>=0?'--pos':'--neg'})"></i>`).join('')}</div>`)}
    ${an.length?tile('an','stea','Pe un an vs VWCE', `${esc(an[0].s)} <small>${sg(an[0].d,0)} pp</small>`, `cea mai slabă: ${esc(an.at(-1).s)} ${sg(an.at(-1).d,0)} pp`,'','lat'):''}
  </div>`;
  h += `<div class="sec gsec"><h2>Riscul</h2><span class="sub">cât de tare se poate mișca</span></div><div class="bento">
    ${r?tile('risc','puls','Volatilitate pe an', nf(r.vol,0)+'%', r.volE?`VWCE: ${nf(r.volE,0)}%`:'', `<div class="gauge" style="--k:var(${r.volE&&r.vol>r.volE*1.3?'--warn':'--acc'})"><i style="width:${Math.min(r.vol/40*100,100)}%"></i>${r.volE?`<b style="left:${Math.min(r.volE/40*100,100)}%"></b>`:''}</div>`):''}
    ${r?tile('risc','alerta','Cel mai rău scenariu', '−'+(S.privat?'•••':nf(stresMax,0))+' <small>lei</small>', 'din testele de stres', `<div class="gauge" style="--k:var(--neg)"><i style="width:${Math.min(stresMax/T*100*2.5,100)}%"></i></div>`):''}
    ${(()=>{ const c=corelatiiPortofoliu(); return c?tile('corelatii','link','Diversificare reală', nf(c.ne,1)+` <small>din ${c.poz.length}</small>`, c.grupuri[0]?`${c.grupuri[0].s.slice(0,3).join(', ')}… se mișcă la fel`:'nicio grupare puternică', `<div class="minih">${c.poz.slice(0,6).map(a=>c.poz.slice(0,6).map(b=>`<i style="background:${a===b?'var(--line)':culRho(c.K.M[a.symbol][b.symbol])}"></i>`).join('')).join('')}</div>`):''; })()}
    ${tile('monede','glob','În dolari', nf(usd,0)+'%', usd>60?'risc valutar ridicat':'echilibrat', `<div class="gauge" style="--k:var(${usd>60?'--warn':'--acc'})"><i style="width:${usd}%"></i><b style="left:60%"></b></div>`)}
    ${tile('alocare','tinta','Alocare: acum și ținta', `${nf(SNAP.teme[B[0]?.n]||0,0)}% <small>în ${B[0]?.n.startsWith('ETF')?'ETF':'primul sector'}</small>`, '', `<div class="sub" style="margin-top:6px">Acum</div>${stack(n=>SNAP.teme[n])}<div class="sub" style="margin-top:6px">Ținta ta</div>${stack(tintaTema)}`, 'lat')}
  </div>`;
  h += `<div class="sec gsec"><h2>Costuri și taxe</h2><span class="sub">ce plătești</span></div><div class="bento">
    ${tile('costuri','portofel','Costuri pe an', SNAP.costuri?(S.privat?'•••':nf(SNAP.costuri.totalAn,0))+' <small>lei</small>':'–', SNAP.costuri?`${nf(SNAP.costuri.procentAn,2)}% din portofoliu`:'apare după prima analiză')}
    ${tile('dividende','monede','Dividende', SNAP.dividende?(S.privat?'•••':nf(SNAP.dividende.estimatAn,0))+' <small>lei/an</small>':'–', SNAP.dividende?`încasat anul ăsta: ${S.privat?'•••':nf(SNAP.dividende.incasateAn,2)} lei`:'apare după prima analiză')}
    ${tile('impozit','raport','Impozit '+(SNAP.realizat?.an||''), SNAP.realizat?(S.privat?'•••':nf(SNAP.realizat.impozitEstimat,0))+' <small>lei</small>':'0 <small>lei</small>', SNAP.realizat?'estimat, din vânzări':'nicio vânzare încă')}
    ${tile('conturi','portofel','Conturi și curs', `${S.privat?'•••':nf(SNAP.pozitii.flatMap(p=>p.brokers).filter(x=>x.broker==='Trading 212').reduce((a,x)=>a+x.valueRON,0),0)} <small>T212</small> · ${S.privat?'•••':nf(SNAP.pozitii.flatMap(p=>p.brokers).filter(x=>x.broker==='eToro').reduce((a,x)=>a+x.valueRON,0),0)} <small>eToro</small>`, SNAP.fx?`1 USD = ${nf(SNAP.fx.USD,2)} lei`:'', '', 'lat')}
  </div>`;
  h += `<div class="sec gsec"><h2>Calendar și decizii</h2><span class="sub">ce urmează, ce ai făcut</span></div><div class="bento">
    ${tile('calendar','calendar','Următorul eveniment', urm?esc(urm.symbol):'–', urm?`rezultate, ${ziRo(urm.rezultate,false)}`:'nicio dată cunoscută')}
    ${tile('jurnal','lista','Deciziile tale', String(nJ), nJ===1?'notă sau tranzacție':'note și tranzacții')}
  </div>`;
  setTimeout(galaxie, 30);
  return h;
}
// ===== Jurnal =====
function intrareJ(j, etfNow){
  const now = SNAP?.pozitii.find(p=>p.symbol===j.symbol)?.ind?.pret;
  const r = j.pret&&now ? (now/j.pret-1)*100 : null, re = j.pretETF&&etfNow ? (etfNow/j.pretETF-1)*100 : null;
  return `<div style="padding:11px 0;border-bottom:1px solid var(--line)">
    <div class="row"><div><b>${esc(j.symbol)}</b> <span class="sub">${ACT[j.actiune]||''}</span></div><span class="sub">${ziRo(j.data)}</span></div>
    ${j.nota?`<div class="ink2" style="font-size:14px;margin-top:3px">${esc(j.nota)}</div>`:''}
    <div class="row num" style="margin-top:6px;font-size:13px"><span class="mut">De atunci</span><span><b class="${cls(r)}">${sg(r,1)}%</b> <span class="mut">· VWCE ${sg(re,1)}%</span>${r!=null&&re!=null?` · <b class="${cls(r-re)}">${sg(r-re,1)} pp</b>`:''}</span></div>
    ${j.din==='cont'?'':`<button class="link" style="margin-top:6px;color:var(--mut);font-size:12px" data-c="${A('stergeJ',j.id)}">Șterge</button>`}</div>`;
}
// Jurnalul = notele tale + cumpărările/vânzările văzute în cont (fără dubluri cu „Am investit”).
function pretETFLa(data){ const e=SNAP?.pozitii.find(p=>p.etf)?.serie; if(!e) return null; let v=null; e.d.forEach((d,i)=>{ if(d<=data) v=e.c[i]; }); return v; }
function jurnalTot_(){
  const ops = (SNAP?.operatiuni||[]).filter(o=>o.tip!=='posibila_divizare').map((o,i)=>({ id:'op'+i+o.data+o.symbol, data:o.data, symbol:o.symbol, actiune:o.tip==='cumparare'?'cumparat':'vandut', din:'cont',
    nota:`${o.lei?`${S.privat?'•••':nf(o.lei,0)} lei · `:''}${nf(o.unitati,4)} unități la ${o.broker} (confirmat din cont)`, pret:o.pret, pretETF:pretETFLa(o.data) }));
  const local = J.filter(j=>!(j.actiune==='cumparat' && /^Planul lunii/.test(j.nota||'') && ops.some(o=>o.symbol===j.symbol && o.data.slice(0,7)===j.data.slice(0,7))));
  return [...ops, ...local].sort((a,b)=>b.data.localeCompare(a.data));
}
function jurnalSectiune(){
  const etfNow = SNAP?.pozitii.find(p=>p.etf)?.ind?.pret, J = jurnalTot_();
  return `<div class="sec"><h2>Deciziile tale</h2>${J.length>3?`<button class="link" data-c="${A('jurnalTot')}">Toate (${J.length}) ›</button>`:''}</div><div class="card" style="padding:4px 16px">${
    J.length ? J.slice(0,3).map(j=>intrareJ(j,etfNow)).join('') : `<div class="sub" style="padding:12px 0">Cumpărările confirmate din cont apar aici automat. Din fișa unei acțiuni poți adăuga și o notă. Peste câteva luni vezi cum au ieșit deciziile, față de VWCE.</div>`}
    <div style="display:flex;gap:8px;padding:10px 0"><button class="btn ghost sm" style="flex:1" data-c="${A('exportJurnal')}">Salvează o copie</button><button class="btn ghost sm" style="flex:1" data-c="${A('alegeFisier')}">Încarcă o copie</button></div></div>`;
}
function jurnalTot(){
  const etfNow = SNAP?.pozitii.find(p=>p.etf)?.ind?.pret, J = jurnalTot_();
  openSheet(`${capFoaie('carte','Deciziile tale','Jurnalul stă doar pe acest telefon.')}${J.map(j=>intrareJ(j,etfNow)).join('')}<button class="btn ghost" style="margin-top:12px" data-c="${A('closeSheet')}">Închide</button>`);
}
function stergeJ(id){
  const j = J.find(x=>x.id===id); if(!j) return;
  openSheet(`<div class="grab"></div><h3 style="margin:4px 0 6px">Ștergi notița pentru ${esc(j.symbol)} din ${ziRo(j.data)}?</h3>
  <div class="sub" style="margin-bottom:14px">Nu se poate anula.</div>
  <button class="btn red" data-c="${A('stergeJConfirmat',id)}">Șterge</button><button class="btn ghost" data-c="${A('closeSheet')}">Renunță</button>`);
}
function exportJurnal(){
  const b = new Blob([JSON.stringify({app:'Analist',versiune:APP_VER,jurnal:J},null,1)],{type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `Analist_jurnal_${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.json`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
function importJurnal(inp){
  const f = inp.files[0]; if(!f) return;
  f.text().then(t=>{ const d = JSON.parse(t); if(!Array.isArray(d.jurnal)) throw 0;
    const ids = new Set(J.map(x=>x.id)); const noi = d.jurnal.filter(x=>x&&x.id&&x.symbol&&!ids.has(x.id));
    J = [...noi, ...J].sort((a,b)=>b.id-a.id); saveJ(); render(); toast(`${noi.length} notițe adăugate.`); })
   .catch(()=>toast('Fișierul nu e o copie de jurnal Analist.')).finally(()=>inp.value='');
}

// ===== Raport =====
function md(t){
  const lines = esc(t).split('\n'); let h='', inUl=false;
  const inl = s => s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\[([^\]]+)\]\((https:\/\/[^)\s"]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--acc)">$1</a>');
  for (const l of lines) {
    const m = l.match(/^(#{1,3})\s+(.*)/), li = l.match(/^\s*[-*]\s+(.*)/);
    if (!li && inUl) { h+='</ul>'; inUl=false; }
    if (m) h += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`;
    else if (li) { if(!inUl){h+='<ul>';inUl=true;} h += `<li>${inl(li[1])}</li>`; }
    else if (l.trim()) h += `<p>${inl(l)}</p>`;
  }
  return h + (inUl?'</ul>':'');
}
function raport(){ openSheet(`<div class="grab"></div><div class="rap">${md(RAP||'Raportul de dimineață nu a sosit încă.')}</div><button class="btn ghost" style="margin-top:14px" data-c="${A('closeSheet')}">Închide</button>`); }

// ===== Setări =====
const PASI = [
  ['repo','Creează două repo-uri goale'],['chei','Pune cheile în GitHub'],['token','Conectează telefonul'],['test','Testează']];
const SECRETE = [
  ['DATA_KEY','Analist','obligatoriu','Cheia care criptează datele tale în GitHub. Se generează aici, pe telefon. Pune-o ca secret și salveaz-o și în managerul de parole: fără ea, datele nu mai pot fi citite dacă pierzi telefonul.',null],
  ['T212_KEY','Trading 212','obligatoriu','În aplicația Trading 212: Setări → API (Beta) → Generate. Bifează Account data, Metadata, Portfolio, History și History - Orders (plus Dividends și Transactions, dacă apar). Fără Orders - Execute. Primești o cheie și un secret. Secretul apare o singură dată.',null],
  ['T212_SECRET','Trading 212','obligatoriu','Secretul generat odată cu cheia.',null],
  ['ETORO_API_KEY','eToro','recomandat','Pe site (nu din aplicație): Setări → Trading → API Key Management → Create New Key. Environment Real, Permissions Read. Fără eToro lipsesc pozițiile de acolo și graficele.','https://www.etoro.com/settings/trade'],
  ['ETORO_USER_KEY','eToro','recomandat','A doua cheie din aceeași pagină.','https://www.etoro.com/settings/trade'],
  ['FINNHUB_KEY','Finnhub','opțional','Cont gratuit. Cheia apare în dashboard. Aduce P/E, recomandările analiștilor și datele rezultatelor.','https://finnhub.io/register'],
  ['NTFY_TOPIC','ntfy','opțional','Pentru notificări pe telefon. Generează un nume aici, pune-l ca secret și abonează-te la el în aplicația ntfy.',null]];
const copiaza = t => { (navigator.clipboard?.writeText(t)||Promise.reject()).then(()=>{vib();toast(t.length>30?'Copiat.':'Copiat: '+t);}).catch(()=>toast(t)); };
async function verificaParola(pw){ const o=citesteSeif(); const k=await cheieParola(pw, b64d(o.sare), o.iter); if (o.v===2) await despacheteaza(k, o.w); else await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(o.iv)}, k, b64d(o.ct)); }
async function schimbaParola(){
  const a=$('pwv').value, n1=$('pwn1').value, n2=$('pwn2').value;
  if (!parolaAcceptata(n1)) { toast(putereParola(n1).t || `Minimum ${PAROLA_MIN} caractere.`); return; } if (n1!==n2) { toast('Parolele noi nu coincid.'); return; }
  try { await verificaParola(a); } catch(e) { vib(); toast('Parola actuală e greșită.'); return; }
  const o=citesteSeif(), sare=rnd(16); o.sare=b64e(sare); o.iter=ITER; o.v=2; o.w=await impacheteaza(await cheieParola(n1, sare, ITER), MK); localStorage.setItem(SEIF, JSON.stringify(o)); PAROLA_SCURTA=false; S.desc=''; vib(); toast('Parola a fost schimbată. Fă o copie nouă a seifului: cea veche se deschide tot cu parola veche.'); render();
}
async function aratăCheia(){
  try { await verificaParola($('pwa').value); } catch(e) { vib(); toast('Parola e greșită.'); return; }
  $('dkv').innerHTML = `<button class="btn ghost sm num" style="width:100%;word-break:break-all;font-size:12.5px;margin-top:8px" data-c="${A('copiaza',V.dataKey)}">${V.dataKey} ⧉</button><div class="sub" style="margin-top:4px">Salveaz-o în managerul de parole. Nu o trimite nimănui.</div>`;
  setTimeout(()=>{ if($('dkv')) $('dkv').innerHTML=''; }, 60000);
}
// ===== Copia de rezervă a seifului (S6) =====
// Fișierul conține exact seiful criptat (fără legătura cu amprenta, care ține de acest telefon). Nimic în clar în afară de repo.
async function exportSeif(){
  const pw = $('pwbk')?.value||''; if (!pw) { toast('Scrie parola actuală.'); return; }
  try { await verificaParola(pw); } catch(e) { vib(); toast('Parola e greșită.'); return; }
  const o = citesteSeif(); if (o?.v!==2) { toast('Seiful nu e în formatul nou. Deblochează din nou și reîncearcă.'); return; }
  const copie = {tip:'analist-seif', format:1, creat:new Date().toISOString(), app:APP_VER, repo:S.repo, seif:{v:2, iter:o.iter, sare:o.sare, w:o.w, iv:o.iv, ct:o.ct}};
  const url = URL.createObjectURL(new Blob([JSON.stringify(copie)], {type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download=`analist-seif-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  $('pwbk').value=''; S.copieSeif=Date.now(); save(); vib(); toast('Copia a fost descărcată.'); render();
}
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function valideazaCopie(c){
  const sf = c?.seif, b = (x, min, max) => typeof x==='string' && B64.test(x) && x.length>=min && x.length<=max;
  if (!c || c.tip!=='analist-seif' || c.format!==1 || !sf || sf.v!==2) return 'Fișierul nu e o copie a seifului Analist.';
  if (!Number.isInteger(sf.iter) || sf.iter<1000 || sf.iter>10000000) return 'Copia are parametri nevalizi.';
  if (!b(sf.sare,20,32) || !b(sf.w?.iv,16,16) || !b(sf.w?.ct,40,80) || !b(sf.iv,16,16) || !b(sf.ct,20,2800000)) return 'Copia e deteriorată.';
  if (c.repo!=null && !(typeof c.repo==='string' && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(c.repo))) return 'Copia are un repo nevalid.';
  return '';
}
function alegeSeif(){
  if (are_seif()) { toast('Există deja un seif pe acest telefon.'); return; }
  const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json,.json';
  inp.onchange = () => importSeif(inp.files?.[0]); inp.click();
}
async function importSeif(f){
  if (!f) return; if (are_seif()) { toast('Există deja un seif pe acest telefon.'); return; }
  if (f.size > 4000000) { toast('Fișierul e prea mare pentru o copie a seifului.'); return; }
  let c; try { c = JSON.parse(await f.text()); } catch(e) { toast('Fișierul nu poate fi citit.'); return; }
  const err = valideazaCopie(c); if (err) { toast(err); return; }
  const sf = c.seif;
  localStorage.setItem(SEIF, JSON.stringify({v:2, iter:sf.iter, sare:sf.sare, w:{iv:sf.w.iv, ct:sf.w.ct}, iv:sf.iv, ct:sf.ct}));
  if (c.repo) S.repo = c.repo; S.esec={n:0,pana:0}; save(); localStorage.removeItem(KEY+'_pornire');
  vib(); toast('Copia a fost restaurată. Deblochează cu parola ei.'); blocheaza();
}
// Valorile generate la pornire stau temporar pe telefon, până se creează seiful (apoi se mută în el).
const PORN = () => { try { return JSON.parse(localStorage.getItem(KEY+'_pornire')||'{}'); } catch(e){ return {}; } };
const setPorn = o => localStorage.setItem(KEY+'_pornire', JSON.stringify({...PORN(), ...o}));
function topicNou(){ const a=new Uint8Array(15); crypto.getRandomValues(a); setPorn({topic:'analist-'+[...a].map(x=>(x%36).toString(36)).join('')}); render(); }
function cheieNoua(){ setPorn({dataKey:b64url(crypto.getRandomValues(new Uint8Array(32)))}); render(); }
function cheieExistenta(){ const k=($('fdk').value||'').trim(); try { if(unb64url(k).length!==32) throw 0; } catch(e){ toast('Cheia nu are formatul corect (43 de caractere).'); return; } setPorn({dataKey:k, existenta:true}); render(); toast('Cheia de date a fost preluată.'); }
const STAREI = {ok:['✓','--pos'],eroare:['✗','--neg'],lipsa:['!','--warn'],optional:['○','--mut']};
const NUMEC = {seif:'Cheia de date (DATA_KEY)',t212:'Trading 212',etoro:'eToro',finnhub:'Finnhub',ntfy:'Notificări (ntfy)',bnr:'Curs BNR'};
function conexiuniHTML(){
  const c = STARE?.conexiuni || SNAP?.conexiuni; if (!c) return `<div class="sub">Încă nu am rezultatul unui test.</div>`;
  return Object.entries(NUMEC).filter(([k])=>c[k]).map(([k,n])=>{ const [ic,col]=STAREI[c[k].stare]||['?','--mut'];
    return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><b style="color:var(${col});width:16px;text-align:center">${ic}</b><div><div style="font-weight:600">${n}</div><div class="sub">${esc(c[k].mesaj||'')}</div></div></div>`; }).join('')
    + (SNAP.ultimaIncercare?`<div class="sub" style="margin-top:6px">Ultima încercare: ${cand(SNAP.ultimaIncercare)}. Pozițiile afișate sunt din ultima analiză reușită.</div>`:'');
}
function vSetari(){
  const aspect = `<div class="sec"><h2>Aspect</h2></div><div class="card"><div class="seg">${[['auto','Automat'],['dark','Întunecat'],['light','Luminos']].map(([k,t])=>`<button class="${S.tema===k?'on':''}" data-c="${A('setTema',k)}">${t}</button>`).join('')}</div></div>`;
  const ver = `<div class="card sub">Aplicație ${APP_VER}${SNAP?.versiune?` · Analiză ${esc(SNAP.versiune)}`:''}</div>`;
  if (live()) {
    const c = STARE?.conexiuni || SNAP?.conexiuni || {}, bio = !!citesteSeif()?.bio;
    const ok = Object.values(c).filter(x=>x.stare==='ok').length, rau = Object.values(c).filter(x=>x.stare==='eroare').length;
    const it = (k, ico, titlu, sub, dreapta, on='') => `<button class="it" style="--k:var(${k})" ${on?`data-c="${esc(JSON.stringify(on))}"`:''}><span class="ib2">${ic(ico)}</span><span class="tx"><b>${titlu}</b>${sub?`<small>${sub}</small>`:''}</span>${dreapta??'<span class="ch">›</span>'}</button>`;
    const D = S.desc || '';
    const des = (k, html) => D===k ? `<div class="det">${html}</div>` : '';
    const tg = k => ['comutaDesc', k];
    return `<div class="card" style="display:flex;gap:14px;align-items:center;margin-top:6px">${LOGO('logo-big').replace('logo-big','" style="width:56px;height:56px')}<div><div style="font-size:20px;font-weight:800">Analist</div><div class="sub">Analistul personal pe bursă al lui Costi · ${APP_VER}</div>
      <div class="sub" style="margin-top:4px;color:var(${rau?'--neg':'--pos'})">${rau?`${rau} ${rau===1?'conexiune are':'conexiuni au'} probleme`:`${ok} conexiuni active · date criptate`}</div></div></div>
    <div class="sec"><h2>Conexiuni</h2>${STARE?.generat||SNAP?.generat?`<span class="sub">test ${cand(STARE?.generat||SNAP.generat)}</span>`:''}</div>
    <div class="card grp">${Object.entries(NUMEC).filter(([k])=>c[k]).map(([k,n])=>{ const [sm,col]=STAREI[c[k].stare]||['?','--mut'];
      return it(col, k==='ntfy'?'bec':k==='seif'?'scut':k==='bnr'?'glob':'link', n, esc(c[k].mesaj||''), `<b style="color:var(${col});font-size:16px">${sm}</b>`); }).join('') || `<div class="det sub">Încă nu am rezultatul unui test.</div>`}
      ${SNAP?.ultimaIncercare?`<div class="det sub">Ultima încercare: ${cand(SNAP.ultimaIncercare)}. Pozițiile afișate sunt din ultima analiză reușită.</div>`:''}
      <div class="det" style="display:flex;gap:8px;padding-top:12px"><button class="btn sm" style="flex:1" data-c="${A('ruleaza',true)}">Testează din nou</button><button class="btn ghost sm" style="flex:1" data-c="${A('ruleaza')}">Rulează analiza</button></div>
      ${it('--s4','lacat','Schimbă tokenul GitHub','expiră după un an',null,tg('tok'))}
      ${des('tok',`<input id="ft" type="password" autocomplete="off" placeholder="Tokenul nou (github_pat_…)"><button class="btn ghost" data-c="${A('salveaza',true)}">Salvează și testează</button>`)}</div>
    <div class="sec"><h2>Aplicațiile brokerilor</h2></div>${butoaneBrokeri()}
    <div class="sec"><h2>Securitate</h2></div>
    <div class="card grp">
      ${it('--pos','mana','Deblocare cu amprenta', bio?'Activă pe acest telefon':'Parola rămâne mereu variantă de rezervă', `<span class="sw ${bio?'on':''}"></span>`, bio?['dezactiveazaAmprenta']:['activeazaAmprenta']).replace('class="it"','class="it" id="bact"')}
      ${it('--acc','lacat','Blochează acum','Se blochează singură după 2 minute în fundal sau 10 minute fără activitate',null,['blocheazaAcum'])}
      ${it('--s5','scut','Schimbă parola',PAROLA_SCURTA?`<span style="color:var(--warn)">Parola ta are sub ${PAROLA_MIN} caractere. Schimb-o.</span>`:'',null,tg('pw'))}
      ${des('pw',`<input id="pwv" type="password" autocomplete="current-password" placeholder="Parola actuală"><input id="pwn1" type="password" autocomplete="new-password" placeholder="Parola nouă (minimum ${PAROLA_MIN} caractere)" data-in="${A('arataForta','$val','fpn')}">${fortaHTML('fpn')}<input id="pwn2" type="password" autocomplete="new-password" placeholder="Parola nouă, încă o dată"><button class="btn ghost" data-c="${A('schimbaParola')}">Schimbă parola</button>`)}
      ${it('--s3','descarca','Copie de rezervă a seifului',S.copieSeif?`ultima: ${new Date(S.copieSeif).toLocaleDateString('ro-RO')}`:'încă nu ai făcut una',null,tg('bk'))}
      ${des('bk',`<div class="sub" style="line-height:1.55;margin-bottom:8px">Un fișier criptat cu parola ta: tokenul, cheia de date și jurnalul. Fără parolă nu poate fi citit. Îl restaurezi la Pornire, pe acest telefon sau pe altul. Păstrează-l în afara telefonului (Drive, e-mail către tine).</div><input id="pwbk" type="password" autocomplete="current-password" placeholder="Parola actuală"><button class="btn ghost" data-c="${A('exportSeif')}">Descarcă copia</button>`)}
      ${it('--s4','info','Arată cheia de date','pentru copia de siguranță',null,tg('dk'))}
      ${des('dk',`<input id="pwa" type="password" autocomplete="current-password" placeholder="Parola actuală"><button class="btn ghost" data-c="${A('aratăCheia')}">Arată</button><div id="dkv"></div>`)}
      <div class="det sub" style="padding-top:12px;line-height:1.55">Datele din GitHub sunt criptate. Pe telefon, totul stă criptat cu parola ta (sau cu amprenta). Notificările nu conțin simboluri sau sume.</div></div>
    <div class="sec"><h2>Aspect</h2></div><div class="card"><div class="seg">${[['auto','Automat'],['dark','Întunecat'],['light','Luminos']].map(([k,t])=>`<button class="${S.tema===k?'on':''}" data-c="${A('setTema',k)}">${t}</button>`).join('')}</div></div>
    <div class="sec"><h2>Gesturi</h2></div><div class="card sub" style="font-size:13.5px;line-height:1.7">Trage în jos de sus ca să reîncarci · glisează între tab-uri · atinge un termen subliniat sau „?” · atinge un grafic ca să citești valorile · trage o fereastră în jos ca s-o închizi.</div>
    <div class="card grp">${it('--neg','extern','Deconectează telefonul','șterge seiful de pe acest telefon',null,['deconecteaza'])}</div>
    <div class="sub" style="text-align:center;margin:6px 0 4px">Aplicație ${APP_VER}${SNAP?.versiune?` · Analiză ${esc(SNAP.versiune)}`:''} · construită de Costi, cu Claude</div>`;
  }
  const R = S.repo||'costi1622/analist-date', [own] = R.split('/'), pas = S.pasi||{};
  const PR = PORN();
  const bif = k => `<button class="q" style="width:22px;height:22px;font-size:13px;${pas[k]?'background:var(--pos);color:#fff;border-color:var(--pos)':''}" aria-label="Bifează" data-c="${A('comutaPas',k)}">${pas[k]?'✓':''}</button>`;
  const pasH = (n,k,t,body) => `<div class="card"><div class="row"><span class="lbl">Pasul ${n}</span>${k?bif(k):''}</div><h3 style="margin:4px 0 8px;font-size:18px">${t}</h3>${body}</div>`;
  return `<div class="sec" style="margin-top:6px"><h2>Pornire</h2><span class="sub">~15 minute, o singură dată</span></div>
  <div class="sub" style="margin:0 2px 12px">Aplicația pornește cu datele tale după pasul 3. Fiecare pas e explicat în detaliu în documentație.</div>
  ${pasH(1,'repo','Creează două repo-uri goale',`<div class="sub" style="margin-bottom:10px">Doar le creezi, fără fișiere. Codul îl publică Claude, după ce îi spui în chat că sunt create.</div>
    <div style="display:flex;gap:8px"><a class="btn ghost sm" style="flex:1;text-align:center;text-decoration:none" href="https://github.com/new?name=analist-date&visibility=private" target="_blank" rel="noopener noreferrer">analist-date (privat) ↗</a>
    <a class="btn ghost sm" style="flex:1;text-align:center;text-decoration:none" href="https://github.com/new?name=analist&visibility=public" target="_blank" rel="noopener noreferrer">analist (public) ↗</a></div>`)}
  ${pasH(2,'chei','Pune cheile în GitHub',`<div class="sub" style="margin-bottom:6px">Pentru fiecare cheie: New repository secret, apoi numele exact și valoarea. Atinge numele ca să-l copiezi.</div>
    <a class="btn ghost sm" style="display:block;text-align:center;text-decoration:none;margin-bottom:6px" href="https://github.com/${esc(R)}/settings/secrets/actions/new" target="_blank" rel="noopener noreferrer">Deschide pagina de secrete ↗</a>
    ${SECRETE.map(([n,b,tip,cum,url])=>`<div style="padding:9px 0;border-bottom:1px solid var(--line)"><div class="row"><button class="chip" style="color:var(--acc)" data-c="${A('copiaza',n)}">${n} ⧉</button><span class="sub" style="color:var(${tip==='obligatoriu'?'--neg':tip==='recomandat'?'--warn':'--mut'})">${tip}</span></div>
      <div class="sub" style="margin-top:4px">${esc(cum)} ${url?`<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--acc)">Deschide ↗</a>`:''}</div>
      ${n==='NTFY_TOPIC'?(PORN().topic?`<div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost sm" style="flex:1" data-c="${A('copiaza',PORN().topic)}">${PORN().topic} ⧉</button><a class="btn ghost sm" style="text-decoration:none" href="https://ntfy.sh/${PORN().topic}" target="_blank" rel="noopener noreferrer">Abonează-te ↗</a></div>`:`<button class="btn ghost sm" style="margin-top:6px" data-c="${A('topicNou')}">Generează un nume</button>`):''}
      ${n==='DATA_KEY'?(PORN().dataKey?`<button class="btn ghost sm num" style="margin-top:6px;width:100%;word-break:break-all;font-size:12.5px" data-c="${A('copiaza',PORN().dataKey)}">${PORN().dataKey} ⧉</button>${PORN().existenta?'<div class="sub pos" style="margin-top:4px">Cheie existentă, preluată. Nu o pune din nou în GitHub dacă e deja acolo.</div>':''}`
        :`<div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost sm" style="flex:1" data-c="${A('cheieNoua')}">Generează cheia de date</button></div>
          <details style="margin-top:6px"><summary class="sub" style="cursor:pointer">Am deja o cheie de date (telefon nou)</summary><input id="fdk" autocomplete="off" placeholder="Cheia de date (43 de caractere)"><button class="btn ghost sm" data-c="${A('cheieExistenta')}">Folosește cheia</button></details>`):''}</div>`).join('')}`)}
  ${pasH(3,null,'Conectează telefonul',`<div class="sub">La crearea tokenului alegi:</div><ul class="m" style="font-size:13.5px"><li>Repository access: <b class="ink2">Only select repositories → analist-date</b></li><li>Permissions: <b class="ink2">Contents: Read-only</b> și <b class="ink2">Actions: Read and write</b></li><li>Expiration: <b class="ink2">1 an</b></li></ul><div class="sub">Tokenul nu poate citi alt repo și nu poate modifica fișiere.</div>
    <a class="btn ghost sm" style="display:block;text-align:center;text-decoration:none;margin:10px 0" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Creează tokenul ↗</a>
    <input id="ft" type="password" autocomplete="off" placeholder="Lipește tokenul aici (github_pat_…)">
    <details style="margin-bottom:8px"><summary class="sub" style="cursor:pointer">Alt repo decât ${esc(R)}?</summary><input id="fu" value="${esc(R)}"></details>
    <div class="sub" style="margin-top:6px">Alege o parolă pentru aplicație. Cu ea se criptează pe telefon tokenul, cheia de date și jurnalul. Minimum ${PAROLA_MIN} caractere. O frază din 4-5 cuvinte e cea mai sigură și ușor de ținut minte.</div>
    <input id="pw1" type="password" autocomplete="new-password" placeholder="Parola aplicației" data-in="${A('arataForta','$val','fp1')}">${fortaHTML('fp1')}
    <input id="pw2" type="password" autocomplete="new-password" placeholder="Parola, încă o dată">
    <button class="btn" data-c="${A('salveaza',true)}">Conectează și testează</button>
    <details style="margin-top:10px"><summary class="sub" style="cursor:pointer">Am o copie de rezervă a seifului</summary><div class="sub" style="margin:6px 0 8px">Alegi fișierul analist-seif-….json, apoi îl deschizi cu parola cu care a fost făcut. Nu mai ai nevoie de pașii de mai sus.</div><button class="btn ghost sm" data-c="${A('alegeSeif')}">Alege fișierul</button></details>`)}
  ${aspect}${ver}`;
}
async function salveaza(test){
  const r=($('fu')?.value||S.repo).trim(), t=$('ft').value.trim();
  if (!t) { toast('Lipește tokenul întâi.'); return; }
  const pornire = !V;
  if (pornire) {
    const pw1=$('pw1').value, pw2=$('pw2').value, pr=PORN();
    if (!pr.dataKey) { toast('Generează întâi cheia de date (pasul 2).'); return; }
    if (!parolaAcceptata(pw1)) { toast(putereParola(pw1).t || `Minimum ${PAROLA_MIN} caractere.`); return; }
    if (pw1 !== pw2) { toast('Parolele nu coincid.'); return; }
  }
  // tokenul se verifică înainte de orice salvare: unul greșit nu trebuie să te blocheze
  const r0 = S.repo; S.repo = r;
  try { await gh('', {token:t}); } catch(e) { S.repo=r0; vib(); toast(e.message.includes('găsesc') ? `Nu găsesc repo-ul ${r} cu acest token. Verifică „Only select repositories”.` : e.message); return; }
  if (r!==r0) { FIS={}; saveFIS(); SNAP=null; }
  save();
  if (pornire) {
    toast('Se generează cheile și se criptează seiful…');
    const pr = PORN(), kp = await perecheRaport();
    await creeazaSeif($('pw1').value, { token:t, dataKey:pr.dataKey, topic:pr.topic||'', priv:kp.priv, pub:kp.pub, jurnal:[] });
    localStorage.removeItem(KEY+'_pornire');
  } else { V.token = t; await salveazaSeif(); }
  stare();
  if (test) ruleaza(true); else reincarca().then(()=>go('azi'));
}
function deconecteaza(){
  openSheet(`${capFoaie('lacat','Deconectezi telefonul?','','--neg')}
  <div class="sub" style="font-size:14px;line-height:1.6;margin-bottom:12px">Se șterg de pe telefon seiful, tokenul și datele salvate. Datele din GitHub rămân criptate. Pentru reconectare îți trebuie cheia de date.</div>
  <button class="btn red" data-c="${A('stergeSeif')}">Deconectează</button><button class="btn ghost" data-c="${A('closeSheet')}">Renunță</button>`);
}
// Analiza la cerere: pornește rularea în GitHub și urmărește-o pas cu pas (la 3 secunde), cu timpul scurs pe ecran.
function progres(t){ const el=$('prog'); if (!el) return; if (t==null) { el.classList.remove('on'); return; } el.innerHTML=`<i></i><span>${esc(t)}</span>`; el.classList.add('on'); }
let RULEAZA = false;
async function ruleaza(test){
  if (RULEAZA) return; RULEAZA = true;
  const t0 = Date.now(), sec = () => Math.round((Date.now()-t0)/1000);
  try { vib(); if (test) { go('setari'); }
    const inainte = new Date(Date.now()-120000).toISOString(); // marjă pentru ceasul telefonului
    await gh('/actions/workflows/analiza.yml/dispatches',{method:'POST',body:JSON.stringify({ref:'main',inputs:test?{mod:'test',cheie:V.pub}:{mod:'zi'}})});
    progres(test?'Testez conexiunile…':'Pornește analiza…');
    let run = null;
    for (let i=0;i<120;i++) {
      await new Promise(r=>setTimeout(r, i<3?2000:3000));
      const j = await gh('/actions/workflows/analiza.yml/runs?event=workflow_dispatch&per_page=1');
      run = j.workflow_runs?.[0]; if (!run || run.created_at < inainte.slice(0,19)) { progres(`GitHub pregătește rularea… ${sec()} s`); continue; }
      if (run.status!=='completed') { progres(`${run.status==='in_progress'?'Citesc brokerii și prețurile':'În așteptare la GitHub'}… ${sec()} s`); continue; }
      progres('Aduc rezultatele…'); await new Promise(r=>setTimeout(r,1200)); await reincarca(); progres(null);
      if (test || run.conclusion!=='success') { go('setari'); toast(run.conclusion==='success'?`Testul s-a terminat în ${sec()} s. Rezultatul e mai jos.`:'O conexiune nu merge. Detaliile sunt mai jos.'); return; }
      go('azi'); toast(`Analiză actualizată în ${sec()} s.`); return;
    }
    progres(null); toast('Încă rulează. Reîncarcă peste un minut.');
  } catch(e){ progres(null); toast(e.message); }
  finally { RULEAZA = false; }
}

// ===== Foi: trage în jos ca să închizi =====
['sheet','sheet2'].forEach(id=>{
  const sh=$(id); let y0=null, dy=0;
  sh.addEventListener('touchstart',e=>{ if(sh.scrollTop>0||e.target.closest('[data-noswipe],input,textarea')){y0=null;return;} y0=e.touches[0].clientY; dy=0; sh.style.transition='none'; },{passive:true});
  sh.addEventListener('touchmove',e=>{ if(y0==null) return; dy=Math.max(0,e.touches[0].clientY-y0); if(dy>0) sh.style.transform=`translateY(${dy}px)`; },{passive:true});
  sh.addEventListener('touchend',()=>{ if(y0==null) return; sh.style.transition=''; sh.style.transform=''; if(dy>110){ vib(); closeSheet(); } y0=null; });
});

// ===== Gesturi: tragere pentru reîncărcare, glisare între tab-uri =====
(()=>{
  let x0=null,y0=null,pull=false,noSwipe=false;
  const sheetOn=()=>$('sheet').classList.contains('on');
  addEventListener('touchstart',e=>{ if(sheetOn()) return; const t=e.touches[0]; x0=t.clientX; y0=t.clientY; pull=scrollY<=0; noSwipe=!!e.target.closest('[data-noswipe],input,textarea'); },{passive:true});
  addEventListener('touchmove',e=>{ if(x0==null||!pull) return; const dy=e.touches[0].clientY-y0; if(dy>0) $('ptr').style.transform=`translate(-50%,${Math.min(dy*0.5,60)-60}px) rotate(${dy*2}deg)`; },{passive:true});
  addEventListener('touchend',e=>{
    if(x0==null) return; const t=e.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0;
    $('ptr').style.transform='translate(-50%,-60px)';
    if(pull&&dy>110&&Math.abs(dx)<60) reincarca(true);
    else if(!noSwipe&&Math.abs(dx)>80&&Math.abs(dy)<45&&TABS.includes(VIEW)){ const i=TABS.indexOf(VIEW)+(dx<0?1:-1); if(i>=0&&i<TABS.length) go(TABS[i]); }
    x0=null;
  });
  // doar la schimbarea lățimii (rotire), nu la apariția tastaturii, care ar șterge ce scrii
  let w0=innerWidth; addEventListener('resize',()=>{ if(innerWidth===w0) return; w0=innerWidth; clearTimeout(window._rz); window._rz=setTimeout(render,200); });
})();

// Versiune nouă: noul service worker așteaptă; bara îl activează la cerere.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(reg=>{
  const arata = w => { $('upd').classList.add('on'); $('upd').onclick = () => { w.postMessage('activeaza'); }; };
  if (reg.waiting && navigator.serviceWorker.controller) arata(reg.waiting);
  reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state==='installed' && navigator.serviceWorker.controller) arata(w); }); });
  reg.update().catch(()=>{});
}).catch(()=>{});
let RELOADING=false; navigator.serviceWorker?.addEventListener('controllerchange',()=>{ if(!RELOADING){ RELOADING=true; location.reload(); } });
document.querySelectorAll('.ni[data-i]').forEach(e=>e.innerHTML=ic(e.dataset.i)); $('blogo').innerHTML=LOGO(); setTimeout(muta,50); addEventListener('resize',()=>setTimeout(muta,60));
LOADED = !are_seif() ? true : LOADED;
// Ecranul de pornire: rămâne cel puțin 1,7 secunde (cât să se vadă animația), apoi se deschide în aplicație.
const T_START = performance.now();
$('splash').querySelector('.spl').innerHTML = LOGO('spl-logo', true, false);
function ascundeSplash(){ const sp=$('splash'); if (!sp || sp.dataset.gata) return; sp.dataset.gata=1;
  // cu amprenta, nu mai așteptăm animația: deblocarea are prioritate
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, rapid = are_seif() && !V && !!citesteSeif()?.bio;
  setTimeout(()=>{ sp.classList.add('iese'); setTimeout(()=>sp.remove(), 600); }, calm ? 0 : Math.max(0, (rapid?700:1700)-(performance.now()-T_START))); }
motor().catch(()=>{}); // motorul se încarcă din timp, cât aștepți amprenta
render(); reincarca();
setTimeout(ascundeSplash, 3500); // în orice caz, nu mai mult
setInterval(()=>{ if(!document.hidden) stare(); }, 60e3);

// ===== Acțiuni (lista albă pentru dispecer) =====
function blocheazaAcum(){ blocheaza(); toast('Blocat.'); }
function blocheazaAnim(el){ el.classList.add('inchide'); setTimeout(blocheazaAcum, 260); }
function enterDeblocheaza(ev){ if (ev.key==='Enter') deblocheaza(); }
function setCont(k){ S.cont=k; save(); vib(); ANIM=true; render(); }
function comutaPrivat(){ S.privat=!S.privat; save(); vib(); render(); }
function setViz(k){ S.vizAzi=k; save(); vib(); render(); }
function setSort(k){ S.sort=k; save(); vib(); render(); }
function setTema(k){ S.tema=k; save(); aplicaTema(); render(); }
function comutaDesc(k){ S.desc = S.desc===k ? '' : k; render(); }
function comutaPas(k){ const p=S.pasi||{}; S.pasi={...p, [k]:!p[k]}; save(); render(); }
function detComuta(sym){ DET.det=!DET.det; detaliu(sym, DET.zile); }
function detNota(sym){ DET.nota=true; detaliu(sym, DET.zile); setTimeout(()=>$('jnota')?.focus(), 50); }
function detAd(k, sym){ DET.ad=k; detaliu(sym, DET.zile); }
function sumaPas(dir){ const v=+(ED||profilUser()).suma||0; editeaza({suma: v + dir*(dir<0 ? (v>100?50:10) : (v>=100?50:10))}); }
function setSuma(v){ editeaza({suma:v}); }
function orizontLive(v){ v=+v; $('ho').textContent=v+' '+de(v)+(v===1?'an':'ani')+' · până în '+(anAzi()+v); }
function setOrizont(v){ editeaza({anTinta:anAzi()+(+v)}); }
function tintaLive(v){ $('hte').textContent=v+'%'; alocareLive(v); }
function setTinta(v){ editeaza({tintaETF: v==null ? null : +v}); }
function renuntaProfil(){ ED=null; aplicaProfil(); render(); }
function dupaInchidere(fn, ...a){ closeSheet(); setTimeout(()=>{ const f=CMD[fn]; if (typeof f==='function') f(...a); }, 320); }
function inchideSiRedeseneaza(){ closeSheet(); render(); }
function quizAlege(k){ const m=MODULE.find(x=>x.id===QZ?.mid), q=m?.quiz[QZ.i]; if(!q||QZ.ales!=null) return; QZ.ales=k; if(k===q.ok) QZ.scor++; vib(); arataQuiz(); }
function quizUrm(){ QZ.i++; QZ.ales=null; arataQuiz(); }
function alegeFisier(){ $('fimp').click(); }
function stergeJConfirmat(id){ J=J.filter(x=>x.id!==id); saveJ(); closeSheet(); if($('sheet').classList.contains('on')) closeSheet(); render(); }
const CMD = Object.freeze(Object.assign(Object.create(null), {
  go, termen, detaliu, deschideDetaliu, closeSheet, reincarca, ruleaza, salveaza, raport, verificare, vib,
  deblocheaza, deblocheazaAmprenta, uitatParola, stergeSeif, schimbaParola, aratăCheia, topicNou, cheieNoua, cheieExistenta,
  activeazaAmprenta, dezactiveazaAmprenta, deconecteaza, copiaza, importJurnal, exportJurnal, jurnalTot, stergeJ, notaJurnal,
  adaugaAlerta, stergeAlerta, sincronizeazaProfil, salveazaProfil, planFacut, glosar, refuzuri, decideETF, comutaPlan,
  deschideLectie, arataModul, quiz, cautaTermen, deschideSect, gxReluare, avErr,
  blocheazaAcum, blocheazaAnim, enterDeblocheaza, setCont, comutaPrivat, setViz, setSort, setTema, comutaDesc, comutaPas,
  detComuta, detNota, detAd, sumaPas, setSuma, orizontLive, setOrizont, tintaLive, setTinta, renuntaProfil,
  dupaInchidere, inchideSiRedeseneaza, quizAlege, quizUrm, alegeFisier, stergeJConfirmat,
  exportSeif, importSeif, alegeSeif, arataForta
}));
function ruleazaCmd(spec, el, ev){
  let a; try { a = JSON.parse(spec); } catch(e) { return; }
  if (!Array.isArray(a) || typeof a[0]!=='string' || !Object.hasOwn(CMD, a[0])) return;
  const arg = x => x==='$el' ? el : x==='$val' ? el.value : x==='$ev' ? ev : x==='$av' ? el.querySelector('.av') : x;
  CMD[a[0]](...a.slice(1).map(arg));
}
// Ascultăm în faza de captură: prinde și evenimentele care nu urcă (toggle, error, change trimis din cod).
const leaga = (tip, atr, doarEl) => document.addEventListener(tip, ev => {
  const el = ev.target?.closest?.(`[${atr}]`); if (!el || el.disabled) return;
  if (doarEl && el !== ev.target) return; // toggle/error: doar elementul însuși, nu părinții
  ruleazaCmd(el.getAttribute(atr), el, ev);
}, true);
leaga('click','data-c',false); leaga('input','data-in',false); leaga('change','data-ch',false); leaga('keydown','data-kd',false);
leaga('toggle','data-tg',true); leaga('error','data-er',true);
