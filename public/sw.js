// Service worker: receives Web Push and shows the alert; caches the app shell for offline load.
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.json', '/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open('shell-v1').then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // always live
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
self.addEventListener('push', (e) => {
  let data = { title: 'NFL Game Reminder', body: '' };
  try { data = { ...data, ...e.data.json() }; } catch { data.body = e.data ? e.data.text() : ''; }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, tag: data.tag, icon: '/icon.svg', badge: '/icon.svg', data: { url: data.url || '/' }, renotify: false }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
