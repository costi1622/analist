// Configurarea analistului. Tot ce e „părere” stă aici, nu în cod.
export const VERSION = '0.13.0';

// ---------- Profilul tău ----------
// Strategie „nucleu + sateliți”: nucleul e ETF-ul global, sateliții sunt acțiunile alese de tine.
export const PROFIL = {
  orizontAni: 10,
  contributieMin: 200,        // lei pe lună
  contributieMax: 500,
  contributieTipica: 350,     // folosită la estimări (mijlocul intervalului)
  tintaETF: 60,               // % din portofoliu în ETF-ul global (sfatul pentru 10+ ani)
  maxActiune: 10,             // % maxim pe o singură acțiune
  maxTema: 25,                // % maxim pe o temă
  brokerPreferat: 'Trading 212', // contul în lei: banii noi merg aici
  transaMinima: 50,           // lei; sub atât nu are rost o cumpărare separată
  maxCumparariPeLuna: 2,      // ca planul să rămână simplu
};

// Cum se adaptează strategia la orizont (anii până ai nevoie de bani).
// Regula din practica administratorilor de portofolii: cu cât orizontul e mai scurt, cu atât crește partea
// diversificată (ETF global) și scad pariurile pe acțiuni sau teme. O piață de acțiuni poate scădea 30–50%
// și poate avea nevoie de 3–5 ani ca să revină: banii de care ai nevoie mai repede nu au ce căuta acolo.
export const TREPTE_ORIZONT = [
  { min: 20, etf: 50, actiune: 10, tema: 25, nume: 'foarte lung' },
  { min: 10, etf: 60, actiune: 10, tema: 25, nume: 'lung' },
  { min: 7,  etf: 70, actiune: 7,  tema: 20, nume: 'mediu spre lung' },
  { min: 5,  etf: 80, actiune: 5,  tema: 15, nume: 'mediu' },
  { min: 3,  etf: 90, actiune: 3,  tema: 10, nume: 'scurt' },
  { min: 0,  etf: 90, actiune: 2,  tema: 5,  nume: 'foarte scurt' },
];
// Scenarii pentru proiecția la orizont: randament anual mediu, în lei, înainte de inflație.
// Istoric, un portofoliu global de acțiuni a avut ~6–8% pe an pe perioade de 10+ ani, cu ani mult mai buni și mult mai răi.
export const SCENARII = { prudent: 3, mediu: 6, bun: 9 };

// Ținte proprii pe acțiune (% din portofoliu). Ce nu e aici primește o parte egală din sateliți.
// Exemplu: export const TINTE = { NVDA: 6, GOOGL: 6 };
export const TINTE = {};

// Teme: acțiuni care tind să urce și să scadă împreună (ponderi adunate din AMBELE conturi).
export const THEMES = {
  'AI și infrastructura ei': ['NVDA', 'AMD', 'TSM', 'GEV', 'PWR', 'GOOGL'],
  'Aviație': ['GE', 'AIR.PA'],
  'Big Tech consum': ['AAPL'],
  'Gaming': ['TTWO'],
};

// Aceeași companie, simboluri diferite (clase de acțiuni).
export const ALIASES = { GOOG: 'GOOGL' };

// ETF-uri: nucleul portofoliului. Fără semnale de vânzare sau de protecție.
export const ETFS = ['VWCE'];

// Reguli de risc.
export const RISK = {
  reechilibrareX: 2,   // o acțiune peste 2× maxActiune -> „Reechilibrează”
  zileRezultate: 7,    // rezultate trimestriale în N zile: nu cumpăra înainte
  rsiScump: 70,        // peste: amână cumpărarea
  rsiIeftin: 35,       // sub (și peste media de 200 de zile): oportunitate
};

// Nivelul de protecție = maximul ultimelor N zile minus cel mai mare dintre K × ATR(14) și minPct%.
// Se adaptează la fiecare acțiune (una volatilă primește un prag mai larg), dar nu e niciodată mai
// strâns de 15%: pentru 10+ ani, corecțiile normale nu trebuie să te sperie.
export const PROTECTIE = { zile: 126, multATR: 5, minPct: 15 };

// Alertă în timpul zilei: mișcare de cel puțin max(prag, K × ATR%) față de închiderea anterioară.
export const MISCARE_ZI = { prag: 5, multATR: 2.5 };

// Impozit pe câștigul realizat prin brokeri străini, 2026 (Declarația Unică, până la 25 mai).
export const IMPOZIT = { cota: 16, termen: '25 mai' };

// Sufixe Trading 212 -> sufixe de bursă. "VWCEd_EQ" = VWCE pe Xetra.
export const T212_SUFFIX = { d: '.DE', p: '.PA', l: '.L', a: '.AS', e: '.MC', m: '.MI', s: '.SW' };
export const SYMBOL_OVERRIDES = { 'VWCEd_EQ': 'VWCE' };
export const ETORO_SYMBOL = { VWCE: 'VWCE.DE' };

// Moneda de listare după sufix (pentru expunerea valutară).
export const MONEDA_SUFIX = { '.PA': 'EUR', '.DE': 'EUR', '.AS': 'EUR', '.MC': 'EUR', '.MI': 'EUR', '.L': 'GBP', '.SW': 'CHF' };

// Costuri și orare de tranzacționare (ora României), pentru planul „exact”.
export const COMISION_FX = { 'Trading 212': 0.15, 'eToro': null }; // % la conversia leu -> moneda acțiunii
export const ORAR = {
  EUR: { text: '10:00–18:30', interval: 'între 10:00 și 18:30', motiv: 'cât timp bursa (Xetra, Euronext) e deschisă și diferența dintre prețul de cumpărare și cel de vânzare e mică' },
  USD: { text: '16:30–23:00', interval: 'între 16:30 și 23:00', motiv: 'în timpul ședinței americane, nu înainte de deschidere sau după închidere' },
};
// Paza la date ciudate: peste aceste praguri, datele sunt marcate „de verificat” și nu trimitem notificări pe ele.
export const PAZA = { miscareZi: 40, totalZi: 15, dif_broker: 0.5 };

// Notificări discrete: ntfy.sh e un serviciu public, iar mesajele trec prin serverul lor.
// true = fără simboluri și fără sume, doar tipul evenimentului; detaliile sunt în aplicație (după parolă).
export const NOTIFICARI = { discrete: true };
