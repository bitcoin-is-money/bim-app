self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  self.clients.claim();
});

// Optionally, add fetch event to enable future caching
// self.addEventListener('fetch', event => {});
