function notificationPath(data = {}) {
  if (typeof data.url === "string" && data.url.startsWith("/")) return data.url;
  if (data.requestId) return `/request-proposals/${data.requestId}`;
  if (data.deepLink === "home") return "/home";
  if (data.deepLink === "bookings" || data.bookingId) return "/bookings";
  if (data.deepLink === "priests") return "/priests";
  if (data.deepLink === "profile") return "/Profile";
  return "/notifications";
}

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = {}; }
  const title = String(payload.title || "Purohith Connect");
  const body = String(payload.body || "You have a new update.");
  const data = payload.data || {};
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.campaignId || data.bookingId || data.requestId || undefined,
      data: { url: notificationPath(data) },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if (typeof existing.navigate === "function") await existing.navigate(destination);
    } else await self.clients.openWindow(destination);
  })());
});
