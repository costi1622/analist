// © 2026 Constantin Enache. Toate drepturile rezervate. Fără licență: vezi LICENSE.
// Date demonstrative: pozițiile tale din capturile din 29 oct 2026.
// Valorile și câștigurile sunt cele din capturi. Prețurile istorice, cursul
// și datele fundamentale sunt INVENTATE, doar ca interfața să aibă ce arăta.
export const DEMO_RON_PER_USD = 4.4; // curs demonstrativ, nu real
export const DEMO_RON_PER_EUR = 5.1;

const T212 = [ // [simbol, nume, cantitate, valoare lei, câștig lei, monedă]
  ['GEV', 'GE Vernova', 0.17791647, 735.79, 127.84, 'USD'],
  ['VWCE', 'Vanguard FTSE All-World', 0.58808637, 540.34, 26.63, 'EUR'],
  ['GOOGL', 'Alphabet (Class A)', 0.27950758, 392.90, 17.74, 'USD'],
  ['AAPL', 'Apple', 0.10266241, 170.75, 45.05, 'USD'],
  ['NVDA', 'Nvidia', 0.11977413, 122.63, 21.66, 'USD'],
  ['TSM', 'Taiwan Semiconductor', 0.04938382, 101.50, 12.79, 'USD'],
  ['PWR', 'Quanta Services', 0.03325006, 98.92, 16.47, 'USD'],
  ['GE', 'General Electric', 0.05047642, 73.23, 10.48, 'USD'],
];
const ETORO = [ // [simbol, nume, valoare $, câștig $, preț]
  ['GEV', 'GE Vernova', 226.59, 25.00, 860.00],
  ['GE', 'GE Aerospace', 159.73, 11.69, 300.57],
  ['NVDA', 'NVIDIA', 153.08, 58.53, 213.30],
  ['GOOG', 'Alphabet (Class C)', 129.44, -11.02, 290.10],
  ['AMD', 'AMD', 58.80, 8.02, 560.49],
  ['TTWO', 'Take-Two Interactive', 55.23, -8.00, 196.61],
  ['AIR.PA', 'Airbus', 62.09, 11.09, 191.92],
];

export function demoPositions() {
  const out = [];
  for (const [s, n, q, v, pnl, cur] of T212) {
    const fx = cur === 'EUR' ? DEMO_RON_PER_EUR : DEMO_RON_PER_USD;
    out.push({ broker: 'Trading 212', symbol: s, name: n, qty: q, price: v / q / fx, currency: cur, valueRON: v, costRON: v - pnl });
  }
  for (const [s, n, v, pnl, p] of ETORO) {
    out.push({ broker: 'eToro', symbol: s, name: n, qty: v / p, price: p, currency: s.endsWith('.PA') ? 'EUR' : 'USD', valueRON: v * DEMO_RON_PER_USD, costRON: (v - pnl) * DEMO_RON_PER_USD, valueUSD: v, costUSD: v - pnl });
  }
  return out;
}

// Generator determinist (aceleași date la fiecare rulare).
function rng(seed) { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7);

// Profiluri ca să apară toate tipurile de semnal în demo.
const PROFIL = {
  GEV: { drift: 0.0028, vol: 0.022, final: 0.035 },   // urcare abruptă -> RSI mare
  NVDA: { drift: 0.0016, vol: 0.026, final: 0.03 },
  GOOGL: { drift: 0.001, vol: 0.018, final: -0.13 },  // cădere bruscă (ca în captură)
  TTWO: { drift: -0.0012, vol: 0.02, final: -0.02 },
  AMD: { drift: 0.0022, vol: 0.03, final: 0.0 },
  AAPL: { drift: 0.0009, vol: 0.014, final: 0.01 },
  VWCE: { drift: 0.0005, vol: 0.008, final: 0.0 },
};
export function demoCandles(symbol, lastPrice, n = 300) {
  const r = rng(hash(symbol)), p = PROFIL[symbol] || { drift: 0.0008, vol: 0.017, final: 0 };
  const rets = [];
  for (let i = 0; i < n - 1; i++) {
    const tail = i > n - 12 ? p.final / 10 : 0;
    rets.push(p.drift + tail + (r() - 0.5) * 2 * p.vol);
  }
  let c = lastPrice; const closes = [c];
  for (let i = rets.length - 1; i >= 0; i--) { c = c / (1 + rets[i]); closes.unshift(c); }
  const d0 = Date.parse('2026-10-28');
  return closes.map((cl, i) => {
    const t = new Date(d0 - (n - 1 - i) * 864e5 * 7 / 5).toISOString().slice(0, 10);
    return { t, o: cl, h: cl * (1 + r() * 0.01), l: cl * (1 - r() * 0.01), c: cl, v: 0 };
  });
}
export const DEMO_FUND = {
  GEV: { fund: { pe: 95, crestereVenit: 18 }, rec: { strongBuy: 12, buy: 18, hold: 8, sell: 1, strongSell: 0 } },
  NVDA: { fund: { pe: 52, crestereVenit: 60 }, rec: { strongBuy: 20, buy: 35, hold: 6, sell: 1, strongSell: 0 } },
  GOOGL: { fund: { pe: 24, crestereVenit: 13 }, rec: { strongBuy: 15, buy: 30, hold: 10, sell: 0, strongSell: 0 } },
  AAPL: { fund: { pe: 36, crestereVenit: 6 }, rec: { strongBuy: 8, buy: 20, hold: 15, sell: 2, strongSell: 1 } },
  TSM: { fund: { pe: 27, crestereVenit: 35 }, rec: { strongBuy: 6, buy: 12, hold: 2, sell: 0, strongSell: 0 } },
  PWR: { fund: { pe: 68, crestereVenit: 20 }, rec: { strongBuy: 7, buy: 14, hold: 5, sell: 0, strongSell: 0 } },
  GE: { fund: { pe: 45, crestereVenit: 21 }, rec: { strongBuy: 9, buy: 12, hold: 3, sell: 0, strongSell: 0 } },
  AMD: { fund: { pe: 110, crestereVenit: 30 }, rec: { strongBuy: 14, buy: 22, hold: 9, sell: 0, strongSell: 0 } },
  TTWO: { fund: { pe: null, crestereVenit: -3 }, rec: { strongBuy: 6, buy: 14, hold: 7, sell: 1, strongSell: 0 }, rezultate: '2026-11-05' },
};
