// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Foto lapangan per waypoint: dikompres ke JPEG (sisi terpanjang <= 1600 px) dan disimpan di IndexedDB,
// bukan localStorage (kuota ~5 MB). Galat IndexedDB ditangkap dan dilaporkan lewat notifier, tidak pernah melempar ke UI.
import { t, type Key } from "./i18n";

export interface PhotoMeta {
  id: string;
  wpId: string;
  caption: string;
  /** Arah pengambilan foto 0..360, null bila tidak diisi. */
  azimuth: number | null;
  takenAt: string;
  w: number;
  h: number;
  bytes: number;
}

interface PhotoRecord extends PhotoMeta {
  blob: Blob;
}

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_MAX_SRC_BYTES = 25 * 1024 * 1024;
const DB_NAME = "geoatlas-photos";
const STORE = "photos";

let notify: (msg: string) => void = () => {};
/** Dipanggil saat galat penyimpanan foto (biasanya toast aplikasi). */
export const setPhotoNotifier = (fn: (msg: string) => void) => {
  notify = fn;
};

/** Ukuran hasil: sisi terpanjang dibatasi `max`; gambar kecil tidak diperbesar. */
export function fitSize(w: number, h: number, max = PHOTO_MAX_SIDE): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  const k = max / long;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Kunci i18n galat bila berkas tidak boleh dipakai sebagai foto, null bila boleh. */
export function photoFileError(file: { type: string; size: number }): Key | null {
  if (!file.type.startsWith("image/")) return "wpPhotoNotImage";
  if (file.size > PHOTO_MAX_SRC_BYTES) return "wpPhotoTooLarge";
  return null;
}

/** Dekode, kecilkan, dan encode JPEG 0.82. Orientasi EXIF diterapkan agar foto HP tidak terputar. */
export async function compressImage(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { w, h } = fitSize(bmp.width, bmp.height);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.fillStyle = "#FFFFFF"; // latar putih untuk PNG transparan
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.82),
    );
    return { blob, w, h };
  } finally {
    bmp.close();
  }
}

export const newPhotoId = (): string => `ph${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("wpId", "wpId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  }).catch((e) => {
    dbPromise = null; // coba lagi pada panggilan berikutnya
    throw e;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function safe<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[photos] ${label}`, e);
    notify(t("wpPhotoError"));
    return fallback;
  }
}

/** Simpan foto baru. Mengembalikan false bila gagal (tidak ada foto yang setengah tersimpan). */
export const putPhoto = (blob: Blob, meta: PhotoMeta): Promise<boolean> =>
  safe("put", false, async () => {
    const rec: PhotoRecord = { ...meta, blob };
    await run("readwrite", (s) => s.put(rec));
    return true;
  });

export const getPhoto = (id: string): Promise<Blob | null> =>
  safe("get", null, async () => {
    const rec = (await run<PhotoRecord | undefined>("readonly", (s) => s.get(id))) as PhotoRecord | undefined;
    return rec?.blob ?? null;
  });

/** Metadata foto milik satu waypoint, tanpa blob. */
export const listPhotoMeta = (wpId: string): Promise<PhotoMeta[]> =>
  safe("list", [] as PhotoMeta[], async () => {
    const rows = ((await run<PhotoRecord[]>("readonly", (s) => s.index("wpId").getAll(wpId))) ?? []) as PhotoRecord[];
    return rows.map(({ blob: _blob, ...meta }) => meta);
  });

/** Ubah keterangan atau arah foto yang sudah tersimpan. */
export const updatePhotoMeta = (id: string, patch: Partial<Pick<PhotoMeta, "caption" | "azimuth">>): Promise<boolean> =>
  safe("update", false, async () => {
    await run("readwrite", (s) => {
      const r = s.get(id);
      r.onsuccess = () => {
        if (r.result) s.put({ ...r.result, ...patch });
      };
    });
    return true;
  });

/** Hapus foto permanen. Pemanggil wajib sudah mendapat konfirmasi pengguna. */
export const deletePhotos = (ids: readonly string[]): Promise<boolean> =>
  safe("delete", false, async () => {
    if (ids.length) await run("readwrite", (s) => ids.forEach((id) => s.delete(id)));
    return true;
  });
