// Admin service worker: makes the panel installable and shows a friendly page when a page cannot be reached
// because the device is offline. It never caches anything: orders, stock and staff data must always be live.

const OFFLINE_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You are offline</title></head>' +
  '<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#fff;color:#222;text-align:center;padding:24px">' +
  '<div><div style="font-size:48px">📡</div><h1 style="font-size:22px;margin:12px 0 6px">You are offline</h1>' +
  '<p style="margin:0 0 18px;color:#666">The admin panel needs an internet connection. Please check it and try again.</p>' +
  '<button onclick="location.reload()" style="background:#ED2320;color:#fff;border:0;border-radius:999px;padding:10px 24px;font-size:15px;font-weight:600">Try again</button></div></body></html>';

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
