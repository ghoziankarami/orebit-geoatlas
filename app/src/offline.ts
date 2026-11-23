// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// WP-31: simpan area peta (tile geologi PMTiles) agar poligon tetap tampil tanpa sinyal. Tile diunduh lewat PMTiles.getZxy;
// service worker (public/sw.js) menyimpan tiap respons Range di cache "geoatlas-pmtiles-v1".
import type { Map as MLMap } from "maplibre-gl";
import { FetchSource, PMTiles } from "pmtiles";
import { CONFIG } from "./config";
import { esc } from "./detail";
import { getLang, t } from "./i18n";

export const PMTILES_CACHE = "geoatlas-pmtiles-v1"; // area yang disimpan pengguna (tidak pernah dipangkas otomatis)
export const PMTILES_BROWSE_CACHE = "geoatlas-pmtiles-browse-v1"; // tile hasil menjelajah (dipangkas)
export const MAX_TILES = 2000;
export const MAX_EXTRA_ZOOM = 3;
export const ABS_MAX_ZOOM = 14;

export type Bbox = { w: number; s: number; e: number; n: number };
export type TileSpan = { z: number; x0: number; x1: number; y0: number; y1: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rentang tile XYZ yang menutup bbox pada zoom z (lintang dipotong ke batas Web Mercator). */
export function tileSpan(b: Bbox, z: number): TileSpan {
  const n = 2 ** z;
  const x = (lon: number) => clamp(Math.floor(((lon + 180) / 360) * n), 0, n - 1);
  const y = (lat: number) => {
    const r = (clamp(lat, -85.0511, 85.0511) * Math.PI) / 180;
    return clamp(Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n), 0, n - 1);
  };
  return { z, x0: x(b.w), x1: x(b.e), y0: y(b.n), y1: y(b.s) };
}

/** Rencana unduhan zoom z0..min(z0+3, 14, maxZoom): jumlah tile total dan rentang per zoom. */
export function planTiles(b: Bbox, zoom: number, minZoom = 0, maxZoom = ABS_MAX_ZOOM): { spans: TileSpan[]; total: number } {
  const top = Math.min(maxZoom, ABS_MAX_ZOOM);
  const z0 = clamp(Math.floor(zoom), Math.min(minZoom, top), top);
  const spans: TileSpan[] = [];
  let total = 0;
  for (let z = z0; z <= Math.min(z0 + MAX_EXTRA_ZOOM, top); z++) {
    const s = tileSpan(b, z);
    spans.push(s);
    total += (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1);
  }
  return { spans, total };
}

const KEY = "geoatlas.offline.v1";
type Saved = { savedAt: number; tiles: number; bbox: Bbox };
const readSaved = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null") as Saved | null;
  } catch {
    return null;
  }
};
const writeSaved = (v: Saved | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* penyimpanan diblokir: abaikan */
  }
};

const mb = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;

async function cacheBytes(name: string): Promise<number> {
  try {
    if (!(await caches.has(name))) return 0;
    const c = await caches.open(name);
    let sum = 0;
    for (const k of await c.keys()) sum += Number((await c.match(k))?.headers.get("content-length")) || 0;
    return sum;
  } catch {
    return 0;
  }
}

/** Service worker hanya mencegat PMTiles satu origin; di origin lain tile tidak bisa disimpan offline. */
export const tilesSameOrigin = (url: string, base: string = location.href): boolean => new URL(url, base).origin === new URL(base).origin;

export function initOffline(opts: { map: MLMap; toast: (msg: string) => void }): void {
  const block = document.getElementById("offlineBlock");
  if (!block) return;
  if (!CONFIG.orebitTiles) {
    block.hidden = true; // mode Macrostrat: tidak ada PMTiles Orebit untuk disimpan
    return;
  }
  const sameOrigin = tilesSameOrigin(CONFIG.orebitTiles);
  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const title = el("t-offTitle");
  const hint = el("t-offHint");
  const saveBtn = el("offSave") as HTMLButtonElement;
  const clearBtn = el("offClear") as HTMLButtonElement;
  const cancelBtn = el("offCancel") as HTMLButtonElement;
  const prog = el("offProgress") as HTMLProgressElement;
  const status = el("offStatus");

  let abort: AbortController | null = null;
  let cacheFull = false;
  let note = ""; // pesan terakhir (sudah di-escape saat dirender)

  navigator.serviceWorker?.addEventListener("message", (e) => {
    const type = (e.data as { type?: string } | null)?.type;
    if (type === "geoatlas-cache-full") cacheFull = true;
    if (type === "geoatlas-saved-purged") {
      // Berkas PMTiles diganti di server: area tersimpan dibuang SW; catatan area harus ikut dihapus dan pengguna diberi tahu.
      writeSaved(null);
      note = esc(t("offPurged"));
      opts.toast(t("offPurged"));
      void render();
    }
  });

  async function render() {
    title.textContent = t("offTitle");
    hint.textContent = t("offHint");
    saveBtn.textContent = t("offSave");
    clearBtn.textContent = t("offClear");
    cancelBtn.textContent = t("offCancel");
    saveBtn.disabled = !!abort;
    cancelBtn.hidden = !abort;
    prog.hidden = !abort;
    const [savedSize, browseSize] = await Promise.all([cacheBytes(PMTILES_CACHE), cacheBytes(PMTILES_BROWSE_CACHE)]);
    const size = savedSize + browseSize;
    if (!abort && readSaved() && savedSize === 0) {
      writeSaved(null); // catatan area tanpa isi cache (dibersihkan peramban/SW): jangan klaim tersimpan
      note = esc(t("offLost"));
    }
    clearBtn.disabled = !!abort || size === 0;
    let quota = "";
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.quota) quota = ` · ${t("offQuota")} ${mb(est.usage ?? 0)} / ${mb(est.quota)}`;
    } catch {
      /* estimate tidak didukung */
    }
    const saved = readSaved();
    const when = saved ? new Date(saved.savedAt).toLocaleString(getLang() === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";
    const lines = [`${esc(t("offSize"))}: <b>${esc(mb(size))}</b>${esc(quota)}`];
    if (saved) lines.push(esc(`${t("offSavedAt")} ${when} (${saved.tiles} tile). ${t("offStale")}`));
    if (!navigator.onLine) lines.push(esc(t("offOfflineNow")));
    if (note) lines.push(note);
    status.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
  }

  const say = (msg: string) => {
    note = esc(msg);
    void render();
  };

  async function save() {
    if (!sameOrigin) return say(t("offCrossOrigin"));
    if (!navigator.serviceWorker?.controller) return say(t("offNoSw"));
    note = "";
    cacheFull = false;
    const ctl = new AbortController();
    let pm: PMTiles;
    let plan: ReturnType<typeof planTiles>;
    try {
      // Header x-geoatlas-save: service worker menaruh respons di cache area tersimpan (bukan cache penjelajahan yang dipangkas).
      pm = new PMTiles(new FetchSource(CONFIG.orebitTiles, new Headers({ "x-geoatlas-save": "1" })));
      const h = await pm.getHeader();
      const b = opts.map.getBounds();
      plan = planTiles({ w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() }, opts.map.getZoom(), h.minZoom, h.maxZoom);
    } catch {
      return say(t("offFail"));
    }
    if (plan.total > MAX_TILES) return say(`${t("offTooBig")} (${plan.total} > ${MAX_TILES})`);
    try {
      await navigator.storage?.persist?.(); // minta penyimpanan permanen; hasil tidak wajib
    } catch {
      /* diabaikan */
    }
    abort = ctl;
    prog.max = plan.total;
    prog.value = 0;
    let done = 0;
    let failed = 0;
    const jobs = plan.spans.flatMap((s) => {
      const out: [number, number, number][] = [];
      for (let x = s.x0; x <= s.x1; x++) for (let y = s.y0; y <= s.y1; y++) out.push([s.z, x, y]);
      return out;
    });
    let next = 0;
    const worker = async () => {
      while (!ctl.signal.aborted && next < jobs.length) {
        const [z, x, y] = jobs[next++];
        try {
          await pm.getZxy(z, x, y, ctl.signal); // undefined = tile kosong di area itu: bukan kegagalan
        } catch {
          if (!ctl.signal.aborted) failed++;
        }
        prog.value = ++done;
        note = esc(`${t("offProgress")} ${done}/${plan.total}`);
        if (done % 10 === 0) void render();
      }
    };
    await render();
    await Promise.all([worker(), worker(), worker(), worker()]);
    const cancelled = ctl.signal.aborted;
    abort = null;
    if (cancelled) return say(t("offCancelled"));
    // Verifikasi: tiap tile harus ada di cache (permintaan cache-only ke SW tidak pernah memakai jaringan).
    const check = new PMTiles(new FetchSource(CONFIG.orebitTiles, new Headers({ "x-geoatlas-cache-only": "1" })));
    let missing = 0;
    let vi = 0;
    const verifier = async () => {
      while (vi < jobs.length) {
        const [z, x, y] = jobs[vi++];
        try {
          await check.getZxy(z, x, y);
        } catch {
          missing++;
        }
      }
    };
    await Promise.all([verifier(), verifier(), verifier(), verifier()]);
    if (cacheFull || failed > 0 || missing > 0) say(`${t("offPartial")} (${failed + missing} ${t("offFailedTiles")})`);
    else {
      const b = opts.map.getBounds();
      writeSaved({ savedAt: Date.now(), tiles: plan.total, bbox: { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() } });
      say(t("offDone"));
      opts.toast(t("offDone"));
    }
  }

  async function clear() {
    if (!window.confirm(t("offConfirmClear"))) return;
    try {
      await caches.delete(PMTILES_CACHE);
      await caches.delete(PMTILES_BROWSE_CACHE);
      navigator.serviceWorker?.controller?.postMessage({ type: "geoatlas-pm-reset" }); // SW menghitung ulang ukuran cache
    } catch {
      /* diabaikan */
    }
    writeSaved(null);
    say(t("offCleared"));
  }

  saveBtn.addEventListener("click", () => void save());
  cancelBtn.addEventListener("click", () => abort?.abort());
  clearBtn.addEventListener("click", () => void clear());
  window.addEventListener("offline", () => {
    opts.toast(t("offOfflineNow"));
    void render();
  });
  window.addEventListener("online", () => void render());
  // Terdaftar setelah handler bahasa di main.ts, sehingga t() sudah memakai bahasa baru saat render.
  document.getElementById("langBtn")?.addEventListener("click", () => void render());
  void render();
}
