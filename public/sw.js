self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(data.title ?? "Aliança Barber Club", {
    body: data.body ?? "Você tem uma nova atualização.",
    icon: "/icons/android-chrome-192x192-v2.png",
    badge: "/icons/android-chrome-192x192-v2.png",
    tag: data.tag,
    data: { url: data.url ?? "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? "/"));
});
