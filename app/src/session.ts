// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Sesi otomatis: tampilan peta + filter (hash URL) dan lintasan terakhir, dipulihkan saat app dibuka tanpa tautan.
export interface Session {
  hash?: string;
  transect?: { lng: number; lat: number }[];
}

const KEY = "geoatlas.session.v1";

export function loadSession(): Session {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "{}");
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}

export function saveSession(patch: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSession(), ...patch }));
  } catch {
    /* penyimpanan diblokir (mode privat): sesi tidak disimpan */
  }
}

/** Tautan bertanda #map= selalu menang; tanpa itu, pulihkan hash sesi terakhir. Mengembalikan true bila dipulihkan. */
export function restoreHashIfEmpty(): boolean {
  if (location.hash.includes("map=")) return false;
  const { hash } = loadSession();
  if (!hash || !hash.startsWith("#") || !hash.includes("map=")) return false;
  history.replaceState(null, "", location.pathname + location.search + hash);
  return true;
}
