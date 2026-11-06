// v0.44: erorile prinse și ocolite (sigle, notificări, date salvate necitibile) nu mai dispar în tăcere.
// Se strâng aici pe durata unei rulări și ajung în analiză, ca să apară în Setări → Verifică tot.
const L = [];
export function tacut(loc, e) {
  const motiv = String(e?.message || e || 'necunoscut').replace(/\s+/g, ' ').slice(0, 160);
  const x = L.find(y => y.loc === loc && y.motiv === motiv);
  if (x) x.n++; else if (L.length < 30) L.push({ loc, motiv, n: 1 });
}
export const tacute = () => L.map(x => ({ ...x }));
export const golesteTacute = () => { L.length = 0; };
// JSON salvat: dacă nu se poate citi, se folosește valoarea implicită, dar se notează (altfel un fișier stricat ar fi suprascris fără să știi).
export const citesteJ = (s, d, nume = 'date salvate') => { if (!s) return d; try { return JSON.parse(s); } catch (e) { tacut(`${nume} necitibile`, e); return d; } };
