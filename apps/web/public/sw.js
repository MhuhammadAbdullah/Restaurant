// Service worker: receives order status push notifications (see PushService on the API and the subscribe
// flow on the order-confirmation page), lets the site be installed as an app, and shows a friendly page when
// a page cannot be reached because the phone is offline. Nothing else is cached on purpose: menu prices,
// stock and orders must always come fresh from the server.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const OFFLINE_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You are offline</title></head>' +
  '<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#fff;color:#222;text-align:center;padding:24px">' +
  '<div><div style="font-size:48px">📡</div><h1 style="font-size:22px;margin:12px 0 6px">You are offline</h1>' +
  '<p style="margin:0 0 18px;color:#666">Please check your internet connection and try again.</p>' +
  '<button onclick="location.reload()" style="background:#ED2320;color:#fff;border:0;border-radius:999px;padding:10px 24px;font-size:15px;font-weight:600">Try again</button></div></body></html>';

// Only page navigations are handled, and only when the network fails.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Order update", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Order update", {
      body: payload.body,
      icon: "/logo-fallback.png",
      badge: "/logo-fallback.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
