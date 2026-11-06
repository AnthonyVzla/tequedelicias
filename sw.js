const BUILD_VERSION = "__BUILD_VERSION__";
const CACHE_PREFIX = "delicias-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./brand-logo.jpg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (path) => {
      const url = new URL(path, self.location).href;
      const versionedUrl = new URL(url);
      versionedUrl.searchParams.set("sw-version", BUILD_VERSION);
      const response = await fetch(new Request(versionedUrl, { cache: "reload" }));
      if (!response.ok) throw new Error(`No se pudo precargar ${path}: ${response.status}`);
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const freshRequest = new Request(request, { cache: "no-cache" });
  event.respondWith(fetch(freshRequest).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const appClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (appClient) return appClient.focus();
    return self.clients.openWindow(event.notification.data?.url || "./");
  }));
});
