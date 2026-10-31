/* © 2026 Constantin Enache. Toate drepturile rezervate. Analist e operă protejată (Legea nr. 8/1996); orice copiere, publicare sau modificare fără acordul scris al autorului e interzisă. */
/* aplicația nu se deschide în interiorul altui site (protecție la clickjacking: GitHub Pages nu trimite antetul frame-ancestors) */ if (window.top !== window.self) { document.documentElement.style.display='none'; try { window.top.location = window.self.location.href; } catch(e) {} }
/* aplicația rulează doar la adresa oficială: o copie publicată în altă parte afișează avizul de drepturi de autor și se oprește */
(function () {
  var h = String(location.hostname || '').toLowerCase();
  if (h === 'costi1622.github.io' || h === 'localhost' || h === '127.0.0.1') return;
  window.ANALIST_COPIE = true;
  document.addEventListener('DOMContentLoaded', function () {
    document.body.innerHTML = '';
    var d = document.createElement('div');
    d.setAttribute('style', 'max-width:560px;margin:15vh auto;padding:24px;font:16px/1.6 system-ui,sans-serif;color:#e8eef6;background:#0b111a;border:1px solid #3a2330;border-radius:16px');
    d.innerHTML = '<h1 style="font-size:20px;margin:0 0 12px">Copie neautorizată</h1><p>Analist este o aplicație privată. © 2026 Constantin Enache. Toate drepturile rezervate.</p>' +
      '<p>Copierea, publicarea sau modificarea ei fără acordul scris al autorului încalcă Legea nr. 8/1996 privind dreptul de autor și poate atrage răspundere civilă și penală.</p>';
    document.body.appendChild(d);
  });
})();
