// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Service worker GeoAtlas: app shell offline + cache tile peta yang pernah dibuka (untuk sinyal lemah di lapangan).
const VERSION = "v1";
const SHELL = `geoatlas-shell-${VERSION}`;
const TILES = `geoatlas-tiles-${VERSION}`;
const MAX_TILES = 3000;
const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/data/indonesia-units-index.json"];
const TILE_HOSTS = ["tiles.openfreemap.org", "tiles.macrostrat.org", "server.arcgisonline.com", "tiles.mapterhorn.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("geoatlas-") && k !== SHELL && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req)) || (req.mode === "navigate" ? await cache.match("/index.html") : undefined);
    if (hit) return hit;
    throw new Error("offline");
  }
}

async function cacheFirst(req, cacheName, trim) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (trim && Math.random() < 0.05) trimTiles();
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return; // PMTiles memakai Range (206), tidak bisa di-cache utuh.
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".json") || url.pathname.endsWith(".webmanifest")) {
      event.respondWith(networkFirst(req, SHELL));
    } else if (url.pathname.startsWith("/assets/") || /\.(png|svg|woff2?)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(req, SHELL, false)); // berkas /assets/ ber-hash, aman cache-first
    }
    return;
  }
  if (TILE_HOSTS.includes(url.hostname)) {
    // Style/TileJSON berubah sesekali: network-first; tile/font/sprite: cache-first.
    if (url.pathname.includes("/styles/") || url.pathname.endsWith(".json")) event.respondWith(networkFirst(req, TILES));
    else event.respondWith(cacheFirst(req, TILES, true));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") event.respondWith(cacheFirst(req, SHELL, false));
});
