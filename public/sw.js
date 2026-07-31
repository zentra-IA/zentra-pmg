self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;

  try {
    data = event.data.json();
  } catch {
    data = {
      title: "PMG",
      body: event.data.text(),
      url: "/",
    };
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/logo-pmg.png",
    badge: data.badge || "/logo-pmg.png",

    // Android/Chrome e navegadores compatíveis podem
    // renderizar a arte da promoção dentro da notificação.
    image: data.image || undefined,

    tag: data.tag || "pmg-promotion",
    renotify: true,
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || "PMG",
      options
    )
  );
});

async function trackNotificationClick(targetUrl) {
  try {
    const url = new URL(targetUrl, self.location.origin);

    if (!url.pathname.startsWith("/ofertas/")) return;

    const portalToken =
      decodeURIComponent(
        url.pathname.replace(/^\/ofertas\//, "").split("/")[0] || ""
      );

    const promotionId =
      url.searchParams.get("promotion_id") || "";
    const deliveryId =
      url.searchParams.get("delivery_id") || "";

    if (!portalToken || !promotionId || !deliveryId) return;

    await fetch("/api/push/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        portalToken,
        promotionId,
        deliveryId,
        event: "clicked",
      }),
    });
  } catch {
    // O clique deve continuar abrindo o portal
    // mesmo que o analytics esteja indisponível.
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url || "/";

  event.waitUntil(
    (async () => {
      await trackNotificationClick(targetUrl);

      const clientList =
        await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

      for (const client of clientList) {
        if ("focus" in client) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })()
  );
});
