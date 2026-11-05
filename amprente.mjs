// Amprentele codului analizei (SHA-256 pe textul normalizat), pentru verificarea din aplicație: fișierele din analist-date
// trebuie să fie exact cele livrate cu această versiune. Rulează după orice schimbare în date-repo (o face sincronizeaza-motor.sh).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const norm = t => t.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');
const R = new URL('./date-repo/', import.meta.url), f = {};
const ad = p => { f[p] = createHash('sha256').update(norm(readFileSync(new URL(p, R), 'utf8'))).digest('hex'); };
for (const n of readdirSync(new URL('runner/', R)).filter(n => n.endsWith('.js')).sort()) ad('runner/' + n);
ad('package.json');
for (const n of readdirSync(new URL('.github/workflows/', R)).filter(n => n.endsWith('.yml')).sort()) ad('.github/workflows/' + n);
const v = readFileSync(new URL('runner/config.js', R), 'utf8').match(/VERSION = '([\d.]+)'/)[1];
writeFileSync(new URL('./pwa/amprente.json', import.meta.url), JSON.stringify({ versiune: v, fisiere: f }, null, 1) + '\n');
console.log(`amprente ${v}: ${Object.keys(f).length} fișiere`);
