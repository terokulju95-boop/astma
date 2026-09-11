// ============================================================
//  LÄÄKEVAHTI – SERVICE WORKER
//
//  Versionumeroa EI tarvitse enää muistaa nostaa täällä. Sivu
//  rekisteröi workerin osoitteella sw.js?v=APP_VERSION, ja tämä
//  tiedosto lukee saman numeron omasta osoitteestaan. Kun
//  index.html:n APP_VERSION muuttuu, myös workerin osoite muuttuu,
//  jolloin selain hakee ja asentaa sen uudelleen.
//
//  Hakustrategia on verkko ensin. Vanha versio ei siis voi jäädä
//  jumiin välimuistiin: uusin tiedosto haetaan aina kun verkko
//  vastaa, ja välimuistia käytetään vain jos verkkoa ei ole.
// ============================================================
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE   = 'laakevahti-' + VERSION;
const SHELL   = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Yksittäisen tiedoston epäonnistuminen ei saa kaataa koko
    // asennusta, joten ne haetaan erikseen.
    await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
    // Otetaan uusi versio heti käyttöön. Sivu ei lataudu itsestään
    // uudelleen, vaan se näyttää päivityspalkin käyttäjälle.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Firebase ja muut ulkopuoliset osoitteet menevät suoraan verkkoon.
  // Firestoren pitkät yhteydet menisivät rikki jos ne käsiteltäisiin.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Sivulatauksille tarjotaan sovelluksen runko, jotta appi
      // aukeaa myös ilman verkkoa.
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
