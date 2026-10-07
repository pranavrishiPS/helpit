// Minimal service worker so the app is installable. It deliberately caches nothing:
// every page and API response is behind sign-in and must always come from the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
