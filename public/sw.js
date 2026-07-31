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
    image: data.image || undefined,
    tag: data.tag || "pmg-promotion",
    renotify: true,
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "PMG", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
