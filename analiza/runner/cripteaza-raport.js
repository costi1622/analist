// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Criptează raportul de dimineață cu cheia publică a telefonului.
// Folosire (de către taskul programat): node runner/cripteaza-raport.js /tmp/raport.md
// Scrie rapoarte/ultimul.enc și rapoarte/AAAA-LL-ZZ.enc. Fișierul .md în clar NU intră în repo.
import fs from 'node:fs';
import path from 'node:path';
import { cripteazaPentruTelefon } from './seif.js';
const radacina = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const [, , sursa] = process.argv;
if (!sursa) { console.error('Folosire: node runner/cripteaza-raport.js <raport.md>'); process.exit(2); }
const pem = fs.readFileSync(path.join(radacina, 'date', 'cheie-publica.pem'), 'utf8');
const text = fs.readFileSync(sursa, 'utf8');
const out = await cripteazaPentruTelefon(pem, text);
fs.mkdirSync(path.join(radacina, 'rapoarte'), { recursive: true });
const azi = new Date().toISOString().slice(0, 10);
for (const f of ['ultimul.enc', `${azi}.enc`]) fs.writeFileSync(path.join(radacina, 'rapoarte', f), out);
console.log(`Raport criptat: rapoarte/ultimul.enc, rapoarte/${azi}.enc (${text.length} caractere)`);
