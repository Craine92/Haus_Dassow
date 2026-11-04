/* Haus Dassow – Netzwerk-only Service Worker.
   Erfüllt die Installierbarkeit in unterstützten Browsern.
   Keine privaten API-Antworten, Nutzerbilder oder Einkaufsliste cachen. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && event.request.method === 'GET') {
    event.respondWith(fetch(event.request));
  }
});
