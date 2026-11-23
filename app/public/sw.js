// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Service worker GeoAtlas: app shell offline + cache tile peta yang pernah dibuka (untuk sinyal lemah di lapangan).
const VERSION = "v4"; // v3 -> v4 (WP-31): Range PMTiles + precache /assets/. Naikkan setiap mengubah sw.js agar pengguna lama menerima versi baru.
const SHELL = `geoatlas-shell-${VERSION}`;
// Nama cache tile basemap sengaja TIDAK memakai VERSION: nama lama (v3) dipertahankan agar upgrade SW tidak menghapus basemap pengguna.
const TILES = "geoatlas-tiles-v3";
const MAX_TILES = 3000;
// Cache PMTiles geologi (respons 206 per rentang byte), tidak mengikuti VERSION SW. Isi usang dibuang hanya bila ETag/isi header berubah.
const PM_SAVED = "geoatlas-pmtiles-v1";
const PM_BROWSE = "geoatlas-pmtiles-browse-v1";
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("geoatlas-") && k !== SHELL && k !== TILES && k !== PM_SAVED && k !== PM_BROWSE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

// ---------- PMTiles Range ----------
// Dua cache: PM_SAVED (area yang disimpan pengguna lewat "Simpan area", header x-geoatlas-save; tidak pernah dipangkas otomatis)
// dan PM_BROWSE (tile yang kebetulan dilihat saat menjelajah; dipangkas sampai PM_MAX_BYTES). Mencari: SAVED dulu, lalu BROWSE.
// Kunci sintetis memakai query, bukan #fragment: Cache API mengabaikan fragment sehingga semua rentang akan bertabrakan.
const pmKey = (url, range) => new Request(url + (url.includes("?") ? "&" : "?") + "__bytes=" + range.replace(/^bytes=/, ""));
let pmPuts = 0;
let pmCleaned = false;
let savedBytes = null; // perkiraan ukuran PM_SAVED; null = hitung ulang

function notifyClients(msg) {
  return self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage(msg)));
}

async function cacheBytes(cache) {
  let sum = 0;
  for (const k of await cache.keys()) sum += Number((await cache.match(k))?.headers.get("content-length")) || 0;
  return sum;
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

// keep=true: buang entri berkas LAIN; keep=false: buang entri berkas ini. Mengembalikan jumlah yang dibuang dari PM_SAVED.
async function pmPurge(keep, pathname) {
  let droppedSaved = 0;
  for (const name of [PM_SAVED, PM_BROWSE]) {
    const cache = await caches.open(name);
    for (const k of await cache.keys()) {
      const p = new URL(k.url).pathname;
      if (keep ? p !== pathname : p === pathname) {
        await cache.delete(k);
        if (name === PM_SAVED) droppedSaved++;
      }
    }
  }
  savedBytes = null;
  return droppedSaved;
}

// Cache.put menolak status 206, jadi disimpan sebagai 200 (dengan header Content-Range asli) dan dikembalikan sebagai 206.
const as206 = (r) => new Response(r.body, { status: 206, statusText: "Partial Content", headers: r.headers });

async function pmLookup(key) {
  for (const name of [PM_SAVED, PM_BROWSE]) {
    const hit = await (await caches.open(name)).match(key);
    if (hit) return { hit, saved: name === PM_SAVED };
  }
  return { hit: undefined, saved: false };
}

// Simpan satu respons (200 + Content-Range asli) ke PM_SAVED; melempar bila melewati batas ukuran.
async function pmSaveEntry(key, buf, headers) {
  const cache = await caches.open(PM_SAVED);
  savedBytes ??= await cacheBytes(cache);
  if (savedBytes + buf.byteLength > PM_MAX_BYTES) throw new Error("saved cache cap"); // penuh: jangan lapor tersimpan
  await cache.put(key, new Response(buf, { status: 200, headers })); // 206 tidak boleh di-put
  savedBytes += buf.byteLength;
}

const sameBytes = async (a, b) => {
  const x = new Uint8Array(await a.clone().arrayBuffer());
  const y = new Uint8Array(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

// Respons 206 valid: Content-Range sesuai rentang yang diminta dan panjang isi sama dengan rentang itu.
function validRange(range, net, byteLength) {
  const cr = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(net.headers.get("content-range") || "");
  const rq = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!cr || !rq) return false;
  const [start, end] = [Number(cr[1]), Number(cr[2])];
  if (start !== Number(rq[1]) || byteLength !== end - start + 1) return false;
  const rqEnd = rq[2] === "" ? Infinity : Number(rq[2]);
  if (cr[3] === "*") return rqEnd === Infinity || end === rqEnd; // total tidak diketahui: harus persis yang diminta
  return end === Math.min(rqEnd, Number(cr[3]) - 1); // server hanya boleh memotong di akhir berkas
}

// Salin respons dari cache penjelajahan ke area tersimpan lalu sajikan; gagal menyalin = klien diberi tahu (simpan dianggap tidak lengkap).
async function serveHit(hit, hitSaved, toSaved, key) {
  if (toSaved && !hitSaved) {
    try {
      await pmSaveEntry(key, await hit.clone().arrayBuffer(), hit.headers);
    } catch {
      notifyClients({ type: "geoatlas-cache-full" });
    }
  }
  return as206(hit);
}

self.addEventListener("message", (e) => {
  if (e.data?.type === "geoatlas-pm-reset") savedBytes = null;
  // Halaman memastikan SW yang mengendalikannya adalah versi ini (yang paham header x-geoatlas-save) sebelum Simpan area.
  if (e.data?.type === "geoatlas-ping") e.ports[0]?.postMessage({ type: "geoatlas-pong", version: VERSION });
});

async function pmRange(req) {
  const range = req.headers.get("range");
  const url = req.url;
  const key = pmKey(url, range);
  const { hit, saved: hitSaved } = await pmLookup(key);
  const toSaved = req.headers.has("x-geoatlas-save");
  // Verifikasi simpan area: hanya cache area tersimpan yang dihitung (tile yang cuma ada di cache penjelajahan bisa terpangkas).
  if (req.headers.has("x-geoatlas-cache-only")) return hit && hitSaved ? as206(hit) : new Response("not cached", { status: 504 });
  // req.cache sengaja tidak dipakai. Dua alasan: (1) pmtiles.js menyetel mustReload = true setelah ETag tidak cocok dan tidak pernah
  // meresetnya, sehingga semua request berikutnya dari instance itu "reload"; (2) di Chrome Windows pmtiles.js selalu memakai
  // cache: "no-store". Menghormati keduanya mematikan cache dan offline. Pengganti yang benar-benar menangani ETag berubah adalah
  // pengecekan ETag/isi pada permintaan header di bawah, yang membuang cache usang. (Catatan: "reload" yang tampak pada semua request
  // Range di tes Playwright berasal dari routing Playwright, bukan dari Chromium; jangan dijadikan bukti perilaku peramban.)
  // Rentang mulai 0 memuat header + direktori akar: selalu coba jaringan dulu agar berkas yang diganti terdeteksi.
  const isHead = /^bytes=0-/.test(range);
  if (hit && !isHead) return serveHit(hit, hitSaved, toSaved, key);
  const fallback = () => (hit ? serveHit(hit, hitSaved, toSaved, key) : Response.error());
  const ctl = new AbortController();
  const timer = hit && isHead ? setTimeout(() => ctl.abort(), 3000) : 0; // sinyal buruk: jangan menahan peta, pakai salinan
  let net;
  let buf;
  try {
    net = await fetch(req, { signal: ctl.signal });
    if (net.status !== 206) return hit ? serveHit(hit, hitSaved, toSaved, key) : net; // 200/4xx/5xx: pakai salinan bila ada, jangan di-cache
    buf = await net.arrayBuffer();
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
  if (!validRange(range, net, buf.byteLength)) return fallback(); // parsial/terpotong/rentang salah: jangan disajikan atau disimpan
  const init = { status: 206, statusText: net.statusText, headers: new Headers() };
  for (const h of ["content-range", "content-type", "etag", "last-modified"]) if (net.headers.get(h)) init.headers.set(h, net.headers.get(h));
  init.headers.set("content-length", String(buf.byteLength));
  const out = () => new Response(buf, init);
  try {
    const pathname = new URL(url).pathname;
    if (isHead && hit) {
      const tag = (r) => r.headers.get("etag") || r.headers.get("last-modified");
      const [a, b] = [tag(hit), tag(net)];
      const changed = a && b ? a !== b : !(await sameBytes(hit, buf)); // tanpa ETag/Last-Modified: bandingkan 16 KB header
      if (changed && (await pmPurge(false, pathname)) > 0) notifyClients({ type: "geoatlas-saved-purged" }); // berkas diganti: area tersimpan usang
    }
    if (!pmCleaned) {
      pmCleaned = true;
      await pmPurge(true, pathname); // buang PMTiles berkas lain
    }
    const stored = () => new Response(buf, { status: 200, headers: init.headers }); // 206 tidak boleh di-put
    if (toSaved) {
      await pmSaveEntry(key, buf, init.headers);
    } else {
      const cache = await caches.open(PM_BROWSE);
      await cache.put(key, stored());
      if (++pmPuts % 25 === 0) pmTrim(cache).catch(() => undefined);
    }
  } catch {
    if (toSaved) notifyClients({ type: "geoatlas-cache-full" }); // kuota/batas penuh: data tetap disajikan, tapi tidak tersimpan offline
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
