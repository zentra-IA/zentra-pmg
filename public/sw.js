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
    renotify: Boolean(data.renotify ?? true),
    requireInteraction: Boolean(data.requireInteraction),
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : undefined,
    silent: false,
    actions: Array.isArray(data.actions) ? data.actions : undefined,
    data: {
      url: data.url || "/",
      type: data.type || "PROMOTION",
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

  const notificationData = event.notification?.data || {};
  const targetUrl = notificationData.url || "/";
  const notificationType = notificationData.type || "PROMOTION";

  if (event.action === "call" && notificationData.callUrl) {
    event.waitUntil(self.clients.openWindow(notificationData.callUrl));
    return;
  }

  if (event.action === "whatsapp" && notificationData.whatsappUrl) {
    event.waitUntil(self.clients.openWindow(notificationData.whatsappUrl));
    return;
  }

  event.waitUntil(
    (async () => {
      await trackNotificationClick(targetUrl);

      const absoluteTargetUrl = new URL(
        targetUrl,
        self.location.origin
      ).toString();

      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Entrega exige deep-link. No iPhone/PWA, navegar uma janela já aberta
      // pode voltar para a raiz do app. Primeiro tentamos focar apenas uma
      // janela que já esteja exatamente na entrega; caso contrário, abrimos
      // explicitamente o URL completo da entrega.
      if (notificationType === "DELIVERY") {
        for (const client of clientList) {
          try {
            if (client.url === absoluteTargetUrl && "focus" in client) {
              return client.focus();
            }
          } catch {
            // Continua para openWindow.
          }
        }

        const opened = await self.clients.openWindow(absoluteTargetUrl);
        if (opened) return opened;
      }

      // Promoções e fallback geral podem reutilizar a janela existente.
      for (const client of clientList) {
        if ("navigate" in client && "focus" in client) {
          try {
            await client.navigate(absoluteTargetUrl);
            return client.focus();
          } catch {
            // Se o navegador não permitir navigate(), abre uma nova janela.
          }
        }
      }

      return self.clients.openWindow(absoluteTargetUrl);
    })()
  );
});
