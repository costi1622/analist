// Configurarea analistului. Tot ce e „părere” stă aici, nu în cod.
export const VERSION = '0.25.0';

// ---------- Profilul tău ----------
// Strategie „nucleu + sateliți”: nucleul e ETF-ul global, sateliții sunt acțiunile alese de tine.
export const PROFIL = {
  orizontAni: 10,
  contributieMin: 200,        // lei pe lună
  contributieMax: 500,
  contributieTipica: 350,     // folosită la estimări (mijlocul intervalului)
  tintaETF: 60,               // % din portofoliu în ETF-ul global (sfatul pentru 10+ ani)
  maxActiune: 10,             // % maxim pe o singură acțiune
  maxTema: 25,                // % maxim pe un sector
  brokerPreferat: 'Trading 212', // contul în lei: banii noi merg aici
  transaMinima: 50,           // lei; sub atât nu are rost o cumpărare separată
  maxCumparariPeLuna: 2,      // ca planul să rămână simplu
};

// Cum se adaptează strategia la orizont (anii până ai nevoie de bani).
// Regula din practica administratorilor de portofolii: cu cât orizontul e mai scurt, cu atât crește partea
// diversificată (ETF global) și scad pariurile pe acțiuni sau sectoare. O piață de acțiuni poate scădea 30–50%
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
  'AI și infrastructură': ['NVDA', 'AMD', 'TSM', 'GEV', 'PWR', 'GOOGL'],
  'Aviație și apărare': ['GE', 'AIR.PA'],
  'Tehnologie de consum': ['AAPL'],
  'Jocuri video': ['TTWO'],
};

// Universul de idei (v0.22): companii mari, din toate sectoarele, pe care le cauți săptămânal la Trading 212 și eToro.
// Nu sunt sfaturi de cumpărare: analiza le notează cu aceleași reguli (trend, evaluare, venituri, profitabilitate, analiști,
// cât de agitat e prețul) și îți arată doar ce completează portofoliul tău. Semiconductorii și apărarea lipsesc intenționat:
// ai deja destul din ele. Lista se poate lărgi oricând; o companie negăsită la eToro e pur și simplu ignorată.
const U = (sector, lista) => Object.fromEntries(lista.map(([k, nume, despre]) => [k, { nume, sector, despre }]));
export const ACTIUNI_CATALOG = {
  ...U('Financiar', [
    ['V', 'Visa', 'Rețeaua de plăți cu cardul: un comision mic din fiecare plată.'], ['MA', 'Mastercard', 'A doua rețea de plăți cu cardul din lume.'],
    ['JPM', 'JPMorgan Chase', 'Cea mai mare bancă din SUA.'], ['BAC', 'Bank of America', 'Bancă mare din SUA, cu milioane de clienți.'],
    ['GS', 'Goldman Sachs', 'Bancă de investiții și administrare de averi.'], ['MS', 'Morgan Stanley', 'Administrare de averi și bancă de investiții.'],
    ['AXP', 'American Express', 'Carduri premium și plăți.'], ['BLK', 'BlackRock', 'Cel mai mare administrator de fonduri din lume (iShares).'],
    ['SPGI', 'S&P Global', 'Ratinguri de credit și indici bursieri.'], ['ALV.DE', 'Allianz', 'Cel mai mare asigurător din Europa.'],
    ['CS.PA', 'AXA', 'Asigurări, din Franța.'], ['MUV2.DE', 'Munich Re', 'Reasigurări: asigură asigurătorii.'],
  ]),
  ...U('Sănătate', [
    ['LLY', 'Eli Lilly', 'Medicamente, între care tratamente pentru diabet și obezitate.'], ['JNJ', 'Johnson & Johnson', 'Medicamente și dispozitive medicale.'],
    ['UNH', 'UnitedHealth', 'Cea mai mare companie de asigurări de sănătate din SUA.'], ['ABBV', 'AbbVie', 'Medicamente pentru boli autoimune și cancer.'],
    ['MRK', 'Merck & Co', 'Medicamente și vaccinuri.'], ['TMO', 'Thermo Fisher', 'Echipamente pentru laboratoare.'],
    ['ABT', 'Abbott', 'Dispozitive medicale, teste și nutriție.'], ['ISRG', 'Intuitive Surgical', 'Roboți pentru chirurgie.'],
    ['AMGN', 'Amgen', 'Biotehnologie.'], ['NVO', 'Novo Nordisk', 'Insulină și tratamente pentru obezitate, din Danemarca.'],
    ['AZN', 'AstraZeneca', 'Medicamente pentru cancer și boli cardiace, din Marea Britanie.'],
  ]),
  ...U('Consum de bază', [
    ['PG', 'Procter & Gamble', 'Gillette, Pampers, Ariel: vânzări stabile și în crize.'], ['KO', 'Coca-Cola', 'Băuturi vândute în peste 200 de țări.'],
    ['PEP', 'PepsiCo', 'Băuturi și gustări (Lay’s, Doritos).'], ['COST', 'Costco', 'Magazine en-gros pe bază de abonament.'],
    ['WMT', 'Walmart', 'Cel mai mare lanț de magazine din lume.'], ['MDLZ', 'Mondelez', 'Milka, Oreo, Toblerone.'],
    ['CL', 'Colgate-Palmolive', 'Pastă de dinți și produse de igienă.'], ['PM', 'Philip Morris', 'Tutun și produse fără fum.'],
  ]),
  ...U('Consum ciclic', [
    ['AMZN', 'Amazon', 'Comerț online și servicii cloud (AWS).'], ['HD', 'Home Depot', 'Magazine de bricolaj din SUA.'],
    ['MCD', 'McDonald’s', 'Restaurante, mai ales în franciză.'], ['NKE', 'Nike', 'Încălțăminte și îmbrăcăminte sport.'],
    ['BKNG', 'Booking Holdings', 'Rezervări de hoteluri și călătorii.'], ['TJX', 'TJX', 'Magazine de haine la reducere (TK Maxx).'],
    ['LOW', 'Lowe’s', 'Magazine de bricolaj din SUA.'], ['MC.PA', 'LVMH', 'Louis Vuitton, Dior, Moët Hennessy.'],
    ['RMS.PA', 'Hermès', 'Lux, cu marje foarte mari.'], ['ADS.DE', 'adidas', 'Încălțăminte și îmbrăcăminte sport, din Germania.'],
  ]),
  ...U('Energie', [
    ['XOM', 'Exxon Mobil', 'Petrol și gaze.'], ['CVX', 'Chevron', 'Petrol și gaze.'], ['SHEL', 'Shell', 'Petrol, gaze și energie, din Marea Britanie.'],
    ['TTE', 'TotalEnergies', 'Petrol, gaze și energie regenerabilă, din Franța.'], ['COP', 'ConocoPhillips', 'Extracție de petrol și gaze.'],
    ['SLB', 'SLB', 'Servicii pentru extracția de petrol.'],
  ]),
  ...U('Utilități', [
    ['NEE', 'NextEra Energy', 'Cel mai mare producător de energie eoliană și solară din SUA.'], ['DUK', 'Duke Energy', 'Electricitate și gaze în sud-estul SUA.'],
    ['SO', 'Southern Company', 'Electricitate în sud-estul SUA.'], ['IBE.MC', 'Iberdrola', 'Electricitate și regenerabile, din Spania.'],
    ['ENEL.MI', 'Enel', 'Electricitate, din Italia (inclusiv rețele în alte țări).'], ['EOAN.DE', 'E.ON', 'Rețele de electricitate și gaze, din Germania.'],
  ]),
  ...U('Industrie', [
    ['CAT', 'Caterpillar', 'Utilaje de construcții și minerit.'], ['HON', 'Honeywell', 'Automatizări și echipamente industriale.'],
    ['UNP', 'Union Pacific', 'Căi ferate de marfă în SUA.'], ['DE', 'Deere & Co', 'Utilaje agricole (John Deere).'],
    ['UPS', 'UPS', 'Curierat și logistică.'], ['ETN', 'Eaton', 'Echipamente electrice.'],
    ['SIE.DE', 'Siemens', 'Automatizări industriale, din Germania.'], ['SU.PA', 'Schneider Electric', 'Echipamente electrice și automatizări, din Franța.'],
  ]),
  ...U('Materiale', [
    ['LIN', 'Linde', 'Gaze industriale (oxigen, azot, hidrogen).'], ['SHW', 'Sherwin-Williams', 'Vopsele.'],
    ['APD', 'Air Products', 'Gaze industriale.'], ['NEM', 'Newmont', 'Cel mai mare producător de aur din lume.'],
    ['FCX', 'Freeport-McMoRan', 'Cupru și aur.'], ['BAS.DE', 'BASF', 'Cea mai mare companie chimică din lume.'],
  ]),
  ...U('Imobiliare', [
    ['PLD', 'Prologis', 'Depozite pentru logistică.'], ['AMT', 'American Tower', 'Turnuri pentru telefonie mobilă.'],
    ['O', 'Realty Income', 'Clădiri comerciale închiriate pe termen lung. Dividend lunar.'], ['SPG', 'Simon Property', 'Centre comerciale.'],
  ]),
  ...U('Telecom și media', [
    ['TMUS', 'T-Mobile US', 'Telefonie mobilă în SUA.'], ['VZ', 'Verizon', 'Telefonie și internet în SUA.'],
    ['DTE.DE', 'Deutsche Telekom', 'Telecomunicații, din Germania (și acționarul principal al T-Mobile US).'],
    ['NFLX', 'Netflix', 'Filme și seriale prin abonament.'], ['DIS', 'Disney', 'Filme, parcuri de distracții, Disney+.'],
    ['META', 'Meta Platforms', 'Facebook, Instagram, WhatsApp.'],
  ]),
  ...U('Software', [
    ['MSFT', 'Microsoft', 'Windows, Office, cloud (Azure).'], ['ORCL', 'Oracle', 'Baze de date și cloud pentru firme.'],
    ['CRM', 'Salesforce', 'Software de vânzări pentru firme, prin abonament.'], ['ADBE', 'Adobe', 'Photoshop, Acrobat, prin abonament.'],
    ['NOW', 'ServiceNow', 'Software de automatizare pentru firme.'], ['INTU', 'Intuit', 'Software de contabilitate și taxe.'],
    ['SAP.DE', 'SAP', 'Cel mai mare producător de software din Europa, pentru firme.'],
  ]),
};
// Fiecare sector din universul de idei devine o temă (ponderile se adună pe sector, ca la acțiunile tale).
for (const [k, e] of Object.entries(ACTIUNI_CATALOG)) (THEMES[e.sector] ||= []).includes(k) || THEMES[e.sector].push(k);

// Aceeași companie, simboluri diferite (clase de acțiuni).
export const ALIASES = { GOOG: 'GOOGL' };

// Catalogul de ETF-uri pe care analistul le cunoaște și le poate recomanda (toate UCITS, acumulare, listate pe Xetra în EUR).
// Date verificate în octombrie 2026 (justETF, emitenți). rol: nucleu (global), obligatiuni, regional, tematic.
// tema = tema din THEMES în care intră (o expunere tematică prin ETF se adună la același sector ca acțiunile).
// valute = cât din ce conține ETF-ul e în dolari (aproximativ, după ponderea SUA în indice: FTSE All-World ~62%, MSCI World ~70%,
//   sectoarele MSCI World ~65%; octombrie 2026). Restul e în alte monede (euro, yeni, lire etc.). ETF-ul e cotat în euro, dar riscul valutar e al conținutului.
// detine = acțiuni din portofoliul tău pe care ETF-ul le conține printre cele mai mari poziții (pentru „similar cu ce ai”).
export const ETF_CATALOG = {
  VWCE: { valute: { USD: 62 }, nume: 'Vanguard FTSE All-World', isin: 'IE00BK5BQT80', ter: 0.14, rol: 'nucleu', indice: 'FTSE All-World', companii: '~3.700', despre: 'Companii mari și mijlocii din toată lumea, inclusiv piețe emergente.' },
  EUNL: { valute: { USD: 70 }, nume: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', ter: 0.20, rol: 'nucleu', indice: 'MSCI World', companii: '~1.300', despre: 'Companii mari și mijlocii din 23 de țări dezvoltate, fără piețe emergente.' },
  SXR8: { valute: { USD: 100 }, nume: 'iShares Core S&P 500', isin: 'IE00B5BMR087', ter: 0.07, rol: 'regional', tema: 'Indicele S&P 500', indice: 'S&P 500', companii: '~500', despre: 'Cele mai mari 500 de companii din SUA. Foarte ieftin, dar concentrat pe o singură țară și pe tehnologie.', detine: ['NVDA', 'AAPL', 'GOOGL', 'AMD', 'GE', 'GEV', 'PWR'] },
  IS3N: { nume: 'iShares Core MSCI EM IMI', isin: 'IE00BKM4GZ66', ter: 0.18, rol: 'regional', tema: 'Piețe emergente', indice: 'MSCI EM IMI', companii: '~3.100', despre: 'Companii din piețele emergente (Taiwan, India, China, Coreea și altele), inclusiv cele mici.', detine: ['TSM'] },
  VVSM: { valute: { USD: 100 }, nume: 'VanEck Semiconductor', isin: 'IE00BMC38736', ter: 0.35, rol: 'tematic', tema: 'AI și infrastructură', indice: 'MVIS US Listed Semiconductor 10% Capped', companii: '~25', despre: 'Producătorii de cipuri: TSMC, Nvidia, ASML, AMD, Broadcom și alții. Aceeași idee ca acțiunile tale de AI, împărțită pe mai multe companii.', detine: ['TSM', 'NVDA', 'AMD'] },
  DFEN: { nume: 'VanEck Defense', isin: 'IE000YYE6WK5', ter: 0.55, rol: 'tematic', tema: 'Aviație și apărare', indice: 'MarketVector Global Defense Industry', companii: '~30', despre: 'Industria de apărare din SUA și Europa (Rheinmetall, Thales, Leonardo, Saab și alții).', detine: ['GE', 'AIR.PA'] },
  XDWD: { valute: { USD: 70 }, nume: 'Xtrackers MSCI World 1C', isin: 'IE00BJ0KDQ92', ter: 0.12, rol: 'nucleu', indice: 'MSCI World', companii: '~1.300', despre: 'Aceleași companii ca iShares Core MSCI World, la un cost mai mic. Fără piețe emergente.' },
  // ETF-uri pe sector (Xtrackers MSCI World, acumulare, TER 0,25%, verificate în octombrie 2026): tot sectorul dintr-o cumpărare,
  // alternativa la o singură companie când îți lipsește un sector.
  XDWH: { valute: { USD: 65 }, nume: 'Xtrackers MSCI World Health Care 1C', isin: 'IE00BM67HK77', ter: 0.25, rol: 'sector', tema: 'Sănătate', indice: 'MSCI World Health Care', companii: '~150', despre: 'Toate companiile mari de sănătate din țările dezvoltate: medicamente, dispozitive, asigurări.' },
  XDWF: { valute: { USD: 65 }, nume: 'Xtrackers MSCI World Financials 1C', isin: 'IE00BM67HL84', ter: 0.25, rol: 'sector', tema: 'Financiar', indice: 'MSCI World Financials', companii: '~230', despre: 'Bănci, asigurători și firme de plăți din țările dezvoltate.' },
  XDWS: { valute: { USD: 65 }, nume: 'Xtrackers MSCI World Consumer Staples 1C', isin: 'IE00BM67HN09', ter: 0.25, rol: 'sector', tema: 'Consum de bază', indice: 'MSCI World Consumer Staples', companii: '~120', despre: 'Produse de zi cu zi: alimente, băuturi, igienă. Scade de obicei mai puțin în crize.' },
  XDW0: { valute: { USD: 65 }, nume: 'Xtrackers MSCI World Energy 1C', isin: 'IE00BM67HM91', ter: 0.25, rol: 'sector', tema: 'Energie', indice: 'MSCI World Energy', companii: '~60', despre: 'Petrol, gaze și servicii pentru ele. Merge adesea invers față de tehnologie.' },
  XDWU: { valute: { USD: 65 }, nume: 'Xtrackers MSCI World Utilities 1C', isin: 'IE00BM67HQ30', ter: 0.25, rol: 'sector', tema: 'Utilități', indice: 'MSCI World Utilities', companii: '~90', despre: 'Electricitate, gaze și apă: venituri stabile, în mare parte reglementate.' },
  XDWI: { valute: { USD: 65 }, nume: 'Xtrackers MSCI World Industrials 1C', isin: 'IE00BM67HV82', ter: 0.25, rol: 'sector', tema: 'Industrie', indice: 'MSCI World Industrials', companii: '~250', despre: 'Utilaje, transport, construcții și echipamente electrice.' },
  EUNA: { nume: 'iShares Core Global Aggregate Bond EUR Hedged', isin: 'IE00BDBRDM35', ter: 0.10, rol: 'obligatiuni', tema: 'Obligațiuni', indice: 'Bloomberg Global Aggregate', companii: '~23.000 de obligațiuni', despre: 'Obligațiuni de stat și de companii din toată lumea, cu riscul valutar acoperit în euro. Se mișcă mult mai puțin decât acțiunile.' },
};
// ETF-uri tratate ca nucleu: fără semnale de vânzare sau de protecție; împart ținta ETF.
export const ETFS = Object.keys(ETF_CATALOG).filter(k => ['nucleu', 'obligatiuni'].includes(ETF_CATALOG[k].rol));
// Toate ETF-urile din catalog (și cele tematice), pentru recunoaștere.
export const TOATE_ETF = Object.keys(ETF_CATALOG);

// Reguli de risc.
export const RISK = {
  reechilibrareX: 2,   // o acțiune peste 2× maxActiune -> „Reechilibrează”
  zileRezultate: 7,    // rezultate trimestriale în N zile: nu cumpăra înainte
  rsiScump: 70,        // peste: amână cumpărarea
  rsiIeftin: 35,       // sub (și peste media de 200 de zile): oportunitate
};

// Nivelul de alertă = maximul ultimelor N zile minus cel mai mare dintre K × ATR(14) și minPct%.
// Se adaptează la fiecare acțiune (una volatilă primește un prag mai larg), dar nu e niciodată mai
// strâns de 15%: pentru 10+ ani, corecțiile normale nu trebuie să te sperie.
export const PROTECTIE = { zile: 126, multATR: 5, minPct: 15 };

// Alertă în timpul zilei: mișcare de cel puțin max(prag, K × ATR%) față de închiderea anterioară.
export const MISCARE_ZI = { prag: 5, multATR: 2.5 };

// Impozit pe câștigul realizat prin brokeri străini, 2026 (Declarația Unică, până la 25 mai).
export const IMPOZIT = { cota: 16, termen: '25 mai' };
// CASS (contribuția la sănătate, 10%) pe veniturile din investiții: se datorează doar peste 6 salarii minime pe an, pe trepte fixe
// de 6, 12 sau 24 de salarii minime. Salariul minim de referință pentru veniturile din 2026: 4.050 lei (pragurile 24.300 / 48.600 / 97.200 lei).
// Verifică la depunere: dacă ANAF anunță alt salariu minim de referință, se schimbă doar pragurile.
export const CASS = { cota: 10, salariuMinim: 4050, trepte: [6, 12, 24] };
// Impozitul reținut la sursă pe dividende, după țara companiei (cota uzuală pentru rezidenți români; SUA: cu formularul W-8BEN).
// România cere 16% în total și scade ce s-a plătit deja în străinătate, până la 16% (creditul fiscal, cu document de la broker).
export const RETINERE_DIV = { US: 10, '.DE': 26.375, '.PA': 25, '.MI': 26, '.MC': 19, '.AS': 15, '.SW': 35, '.L': 0 };
// Randamentul anual al indicelui MSCI World (net, în dolari), pentru simulatorul și lecțiile de istorie din aplicație.
// Sursa: MSCI (factsheet-uri „MSCI World Index (USD)”, net returns).
export const MSCI_WORLD = { 2000: -13.18, 2001: -16.82, 2002: -19.89, 2003: 33.11, 2004: 14.72, 2005: 9.49, 2006: 20.07, 2007: 9.04,
  2008: -40.71, 2009: 29.99, 2010: 11.76, 2011: -5.54, 2012: 15.83, 2013: 26.68, 2014: 4.94, 2015: -0.87, 2016: 7.51, 2017: 22.40,
  2018: -8.71, 2019: 27.67, 2020: 15.90, 2021: 21.82, 2022: -18.14, 2023: 23.79, 2024: 18.67 };

// Sufixe Trading 212 -> sufixe de bursă. "VWCEd_EQ" = VWCE pe Xetra.
export const T212_SUFFIX = { d: '.DE', p: '.PA', l: '.L', a: '.AS', e: '.MC', m: '.MI', s: '.SW' };
export const SYMBOL_OVERRIDES = Object.fromEntries(['VWCE', 'EUNL', 'SXR8', 'IS3N', 'VVSM', 'DFEN', 'EUNA', 'XDWD', 'XDWH', 'XDWF', 'XDWS', 'XDW0', 'XDWU', 'XDWI'].map(k => [k + 'd_EQ', k]));
export const ETORO_SYMBOL = Object.fromEntries(['VWCE', 'EUNL', 'SXR8', 'IS3N', 'VVSM', 'DFEN', 'EUNA', 'XDWD', 'XDWH', 'XDWF', 'XDWS', 'XDW0', 'XDWU', 'XDWI'].map(k => [k, k + '.DE']));

// Moneda de listare după sufix (pentru expunerea valutară).
export const MONEDA_SUFIX = { '.PA': 'EUR', '.DE': 'EUR', '.AS': 'EUR', '.MC': 'EUR', '.MI': 'EUR', '.L': 'GBP', '.SW': 'CHF' };

// Costuri și orare de tranzacționare (ora României), pentru planul „exact”.
export const COMISION_FX = { 'Trading 212': 0.15, 'eToro': null }; // % la conversia leu -> moneda acțiunii
export const ORAR = {
  EUR: { text: '10:00–18:30', interval: 'între 10:00 și 18:30', motiv: 'cât timp bursa (Xetra, Euronext) e deschisă și diferența dintre prețul de cumpărare și cel de vânzare e mică' },
  USD: { text: '16:30–23:00', interval: 'între 16:30 și 23:00', motiv: 'în timpul ședinței americane, nu înainte de deschidere sau după închidere' },
};
// Costul anual al ETF-urilor (TER, % pe an), din documentul cu informații cheie al fondului.
export const TER = Object.fromEntries(Object.entries(ETF_CATALOG).map(([k, v]) => [k, v.ter])); // VWCE: 0,14% din 28 iulie 2026

// Paza la date ciudate: peste aceste praguri, datele sunt marcate „de verificat” și nu trimitem notificări pe ele.
export const PAZA = { miscareZi: 40, totalZi: 15, dif_broker: 0.5 };

// Notificări discrete: ntfy.sh e un serviciu public, iar mesajele trec prin serverul lor.
// true = fără simboluri și fără sume, doar tipul evenimentului; detaliile sunt în aplicație (după parolă).
export const NOTIFICARI = { discrete: true };
