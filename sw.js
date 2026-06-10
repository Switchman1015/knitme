const CACHE_NAME = "knitme-shell-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=5",
  "./app.js?v=5",
  "./manifest.webmanifest?v=5",
  "./icons/icon.svg?v=5",
  "./icons/icon-192.png?v=5",
  "./icons/icon-512.png?v=5",
  "./icons/apple-touch-icon.png?v=5",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }

        return networkResponse;
      })
      .catch(() => caches.match(event.request)),
  );
});
