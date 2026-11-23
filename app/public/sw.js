// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Service worker GeoAtlas: app shell offline + cache tile peta yang pernah dibuka (untuk sinyal lemah di lapangan).
const VERSION = "v4"; // v3 -> v4 (WP-31): Range PMTiles + precache /assets/. Naikkan setiap mengubah sw.js agar pengguna lama menerima versi baru.
const SHELL = `geoatlas-shell-${VERSION}`;
const TILES = `geoatlas-tiles-${VERSION}`;
const MAX_TILES = 3000;
// Cache PMTiles geologi (respons 206 per rentang byte). Nama tidak mengikuti VERSION: isi tile ber-versi lewat nama berkas
// (all-v3.pmtiles), jadi tetap dipakai lintas versi SW; berkas PMTiles lain dibuang otomatis saat entri baru disimpan.
const PM_CACHE = "geoatlas-pmtiles-v1";
const PM_MAX_BYTES = 150 * 1024 * 1024;
const SHELL_URLS = ["/", "/index.html", "/app/", "/app/index.html", "/manifest.json", "/favicon.svg", "/icon-192.png", "/data/indonesia-units-index.json"];
const TILE_HOSTS = ["tiles.openfreemap.org", "tiles.macrostrat.org", "server.arcgisonline.com", "tiles.mapterhorn.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

// Shell + berkas /assets/ ber-hash yang dirujuk halaman (dan chunk yang dirujuk JS-nya), supaya kunjungan berikutnya lengkap offline.
// Kegagalan aset tidak membatalkan instalasi (cache-first saat runtime tetap menyimpannya); hanya respons ok yang disimpan.
async function precacheShell() {
  const cache = await caches.open(SHELL);
  await cache.addAll(SHELL_URLS);
  const seen = new Set();
  const grab = async (text) => {
    const found = [...text.matchAll(/\/?assets\/[\w.-]+\.(?:js|css)/g)].map((m) => "/" + m[0].replace(/^\//, ""));
    return found.filter((u) => !seen.has(u) && seen.add(u));
  };
  let queue = [];
  for (const page of ["/", "/app/"]) {
    const hit = await cache.match(page);
    if (hit) queue.push(...(await grab(await hit.text())));
  }
  for (let depth = 0; depth < 2 && queue.length; depth++) {
    const next = [];
    await Promise.allSettled(
      queue.map(async (u) => {
        const res = await fetch(u);
        if (!res.ok) return;
        await cache.put(u, res.clone());
        if (u.endsWith(".js")) next.push(...(await grab(await res.text())));
      }),
    );
    queue = next;
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("geoatlas-") && k !== SHELL && k !== TILES && k !== PM_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

// ---------- PMTiles Range ----------
// Kunci sintetis memakai query, bukan #fragment: Cache API mengabaikan fragment sehingga semua rentang akan bertabrakan.
const pmKey = (url, range) => new Request(url + (url.includes("?") ? "&" : "?") + "__bytes=" + range.replace(/^bytes=/, ""));
let pmPuts = 0;
let pmCleaned = false;

function notifyClients(msg) {
  return self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage(msg)));
}

async function pmTrim(cache) {
  const keys = await cache.keys();
  const sizes = [];
  let total = 0;
  for (const k of keys) {
    const r = await cache.match(k);
    const n = Number(r?.headers.get("content-length")) || 0;
    sizes.push(n);
    total += n;
  }
  // Buang yang tertua dulu; entri header/direktori (rentang mulai 0) dipertahankan agar berkas tetap terbaca.
  for (let i = 0; i < keys.length && total > PM_MAX_BYTES; i++) {
    if (/__bytes=0-/.test(keys[i].url)) continue;
    await cache.delete(keys[i]);
    total -= sizes[i];
  }
}

async function pmPurge(cache, keep, pathname) {
  for (const k of await cache.keys()) {
    const p = new URL(k.url).pathname;
    if (keep ? p !== pathname : p === pathname) await cache.delete(k);
  }
}

// Cache.put menolak status 206, jadi disimpan sebagai 200 (dengan header Content-Range asli) dan dikembalikan sebagai 206.
const as206 = (r) => new Response(r.body, { status: 206, statusText: "Partial Content", headers: r.headers });

async function pmRange(req) {
  const range = req.headers.get("range");
  const url = req.url;
  const cache = await caches.open(PM_CACHE);
  const key = pmKey(url, range);
  const hit = await cache.match(key);
  // Rentang mulai 0 memuat header + direktori akar: selalu coba jaringan dulu agar berkas yang diganti terdeteksi.
  const isHead = /^bytes=0-/.test(range);
  if (hit && !isHead) return as206(hit);
  let net;
  try {
    net = await fetch(req);
  } catch {
    return hit ? as206(hit) : Response.error();
  }
  if (net.status !== 206) return net; // 200/404/416: teruskan apa adanya, jangan di-cache
  const cr = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(net.headers.get("content-range") || "");
  const buf = await net.arrayBuffer();
  const init = { status: 206, statusText: net.statusText, headers: new Headers() };
  for (const h of ["content-range", "content-type", "etag", "last-modified"]) if (net.headers.get(h)) init.headers.set(h, net.headers.get(h));
  init.headers.set("content-length", String(buf.byteLength));
  const out = () => new Response(buf, init);
  if (!cr || buf.byteLength !== Number(cr[2]) - Number(cr[1]) + 1) return out(); // parsial/terpotong: sajikan tapi jangan simpan
  try {
    const tag = (r) => r?.headers.get("etag") || r?.headers.get("last-modified");
    const pathname = new URL(url).pathname;
    if (isHead && hit && tag(hit) && tag(net) && tag(hit) !== tag(net)) await pmPurge(cache, false, pathname); // berkas diganti: entri lama usang
    if (!pmCleaned) {
      pmCleaned = true;
      await pmPurge(cache, true, pathname); // buang PMTiles versi lain
    }
    await cache.put(key, new Response(buf, { status: 200, headers: init.headers })); // 206 tidak boleh di-put
    if (++pmPuts % 25 === 0) pmTrim(cache).catch(() => undefined);
  } catch {
    notifyClients({ type: "geoatlas-cache-full" }); // kuota penuh: data tetap disajikan, tapi tidak tersimpan offline
  }
  return out();
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const url = new URL(req.url);
    const shell = url.pathname.startsWith("/app") ? "/app/index.html" : "/index.html";
    const hit = (await cache.match(req)) || (req.mode === "navigate" ? await cache.match(shell) : undefined);
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
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.headers.has("range")) {
    // PMTiles memakai Range (206): di-cache per rentang. Range lain (mis. video) tetap lewat jaringan.
    if (url.origin === self.location.origin && url.pathname.endsWith(".pmtiles")) event.respondWith(pmRange(req));
    return;
  }
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate" || url.pathname === "/" || url.pathname === "/app/" || url.pathname.endsWith(".json")) {
      event.respondWith(networkFirst(req, SHELL));
    } else if (url.pathname.startsWith("/assets/") || /\.(png|svg|webp|jpg|woff2?)$/.test(url.pathname)) {
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
