// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Waypoint lapangan: tandai titik dari GPS atau ketuk peta, beri nama/catatan, simpan lokal, ekspor GPX/CSV.
import type maplibregl from "maplibre-gl";
import { esc } from "./detail";
import { t, type Key } from "./i18n";
import { styleReady } from "./layers";
import type { Fix } from "./gps";
import { compressImage, deletePhotos, getPhoto, listPhotoMeta, newPhotoId, photoFileError, putPhoto, setPhotoNotifier, updatePhotoMeta, type PhotoMeta } from "./photos";

export type WpKind = "outcrop" | "sample" | "structure" | "photo" | "other";
export type StructType = "bedding" | "contact" | "fault" | "joint" | "foliation";

export const WP_KINDS: readonly WpKind[] = ["outcrop", "sample", "structure", "photo", "other"];
export const STRUCT_TYPES: readonly StructType[] = ["bedding", "contact", "fault", "joint", "foliation"];
export const KIND_COLOR: Record<WpKind, string> = { outcrop: "#E8590C", sample: "#7C3AED", structure: "#111827", photo: "#0F766E", other: "#475569" };
export const STRUCT_COLOR: Record<StructType, string> = { bedding: "#111827", contact: "#1E40AF", fault: "#DC2626", joint: "#7C3AED", foliation: "#047857" };

export interface Waypoint {
  id: string;
  name: string;
  note: string;
  kind?: WpKind;
  structType?: StructType;
  /** Strike azimuth 0..360 (right-hand rule: dip to the right of strike). */
  strike?: number | null;
  dip?: number | null;
  lat: number;
  lng: number;
  elevM: number | null;
  accM: number | null;
  unit: string;
  symbol: string;
  time: string;
  /** Id foto (IndexedDB `geoatlas-photos`); opsional, data lama tanpa field ini tetap sah. */
  photos?: string[];
}

const KEY = "geoatlas.waypoints.v1";
const SRC = "wp-src";
export const WP_LAYER = "wp-pts";

const isWp = (w: unknown): w is Waypoint => {
  const o = w as Waypoint;
  return Boolean(o) && typeof o.id === "string" && Number.isFinite(o.lat) && Number.isFinite(o.lng);
};

export const kindOf = (w: Waypoint): WpKind => (WP_KINDS.includes(w.kind as WpKind) ? (w.kind as WpKind) : "outcrop");
/** True when the waypoint carries a usable strike/dip measurement. */
export const hasAttitude = (w: Waypoint): boolean =>
  kindOf(w) === "structure" && Number.isFinite(w.strike as number) && Number.isFinite(w.dip as number);
/** "030/45" style strike/dip text (right-hand rule). */
export const attitudeText = (w: Waypoint): string =>
  hasAttitude(w) ? `${String(Math.round(w.strike as number) % 360).padStart(3, "0")}/${Math.round(w.dip as number)}` : "";

/**
 * Validasi isian strike/dip. Kosong = tidak diukur (null). Dip di luar 0–90 atau strike bukan angka ditolak,
 * bukan dipotong diam-diam. Strike di luar 0–360 juga ditolak; 360 disimpan sebagai 0.
 */
export function parseAttitude(strikeRaw: string, dipRaw: string): { ok: true; strike: number | null; dip: number | null } | { ok: false; field: "strike" | "dip"; key: Key } {
  const s = strikeRaw.trim();
  const d = dipRaw.trim();
  const st = s === "" ? null : Number(s);
  if (st !== null && (!Number.isFinite(st) || st < 0 || st > 360)) return { ok: false, field: "strike", key: "wpStrikeErr" };
  const dp = d === "" ? null : Number(d);
  if (dp !== null && (!Number.isFinite(dp) || dp < 0 || dp > 90)) return { ok: false, field: "dip", key: "wpDipErr" };
  return { ok: true, strike: st === null ? null : st % 360, dip: dp };
}

/** Arah foto 0..360; kosong = null. */
export function parseAzimuth(raw: string): { ok: true; value: number | null } | { ok: false } {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 360 ? { ok: true, value: n } : { ok: false };
}

export function loadWaypoints(): Waypoint[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(isWp) : [];
  } catch {
    return [];
  }
}

function persist(wps: Waypoint[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(wps));
  } catch {
    /* penyimpanan penuh/diblokir: data tetap di memori sesi ini */
  }
}

/** Nama berikutnya WP-001, WP-002, … (lanjut dari nomor terbesar). */
export function nextName(wps: readonly Waypoint[]): string {
  const max = wps.reduce((m, w) => Math.max(m, Number(/^WP-(\d+)$/.exec(w.name)?.[1] ?? 0)), 0);
  return `WP-${String(max + 1).padStart(3, "0")}`;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toGpx(wps: readonly Waypoint[]): string {
  const body = wps
    .map((w) => {
      const att = attitudeText(w);
      const desc = [att && `${w.structType ?? "bedding"} ${att}`, w.note, w.unit && `${w.unit}${w.symbol ? ` (${w.symbol})` : ""}`, w.accM !== null ? `±${Math.round(w.accM)} m` : ""].filter(Boolean).join(" | ");
      return `  <wpt lat="${w.lat.toFixed(7)}" lon="${w.lng.toFixed(7)}">${w.elevM !== null ? `<ele>${w.elevM.toFixed(1)}</ele>` : ""}<time>${xml(w.time)}</time><name>${xml(w.name)}</name>${desc ? `<desc>${xml(desc)}</desc>` : ""}<type>${kindOf(w)}</type></wpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Orebit GeoAtlas" xmlns="http://www.topografix.com/GPX/1/1">\n${body}\n</gpx>\n`;
}

export function toCsv(wps: readonly Waypoint[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = wps.map((w) => {
    const st = hasAttitude(w);
    return [q(w.name), kindOf(w), st ? w.structType ?? "bedding" : "", st ? Math.round(w.strike as number) : "", st ? Math.round(w.dip as number) : "", w.lat.toFixed(7), w.lng.toFixed(7), w.elevM ?? "", w.accM === null ? "" : Math.round(w.accM), q(w.unit), q(w.symbol), q(w.note), w.time].join(",");
  });
  return "name,kind,structure,strike,dip,lat,lon,elev_m,accuracy_m,unit,symbol,note,time\n" + rows.join("\n") + "\n";
}

/**
 * Draw a waypoint symbol centred at (0,0) on a 2D canvas, `s` = nominal size in px.
 * Structures use the standard strike/dip symbol with strike pointing up (north) and the
 * dip tick to the right (right-hand rule); callers rotate by the strike azimuth.
 */
export function drawWpIcon(ctx: CanvasRenderingContext2D, kind: WpKind, s: number, struct: StructType = "bedding", vertical = false): void {
  const r = s / 2;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (kind === "structure") {
    const col = STRUCT_COLOR[struct];
    const strokeSym = (color: string, w: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.6, 0);
      if (vertical) {
        ctx.moveTo(0, 0);
        ctx.lineTo(-r * 0.6, 0);
      }
      ctx.stroke();
    };
    strokeSym("rgba(255,255,255,0.95)", s * 0.26);
    strokeSym(col, s * 0.12);
    if (struct === "foliation" || struct === "fault") {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.24);
      ctx.lineTo(r * 0.72, 0);
      ctx.lineTo(r * 0.2, r * 0.24);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = KIND_COLOR[kind];
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = s * 0.12;
  ctx.beginPath();
  if (kind === "outcrop") ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  else if (kind === "sample") {
    ctx.moveTo(0, -r * 0.86);
    ctx.lineTo(r * 0.82, r * 0.62);
    ctx.lineTo(-r * 0.82, r * 0.62);
    ctx.closePath();
  } else if (kind === "photo") {
    const w = r * 1.5;
    const h = r * 1.14;
    ctx.roundRect(-w / 2, -h / 2, w, h, r * 0.24);
  } else {
    ctx.moveTo(0, -r * 0.84);
    ctx.lineTo(r * 0.84, 0);
    ctx.lineTo(0, r * 0.84);
    ctx.lineTo(-r * 0.84, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  if (kind === "outcrop") {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "photo") {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.lineWidth = s * 0.09;
    ctx.stroke();
  }
  ctx.restore();
}

const iconId = (w: Waypoint): string =>
  kindOf(w) === "structure" && hasAttitude(w)
    ? `wp-st-${w.structType ?? "bedding"}${(w.dip as number) >= 89 ? "-v" : ""}`
    : `wp-${kindOf(w) === "structure" ? "other" : kindOf(w)}`;

function ensureIcons(map: maplibregl.Map) {
  const ids: Array<[string, WpKind, StructType, boolean]> = [
    ...WP_KINDS.filter((k) => k !== "structure").map((k) => [`wp-${k}`, k, "bedding", false] as [string, WpKind, StructType, boolean]),
    ...STRUCT_TYPES.flatMap((t) => [
      [`wp-st-${t}`, "structure", t, false] as [string, WpKind, StructType, boolean],
      [`wp-st-${t}-v`, "structure", t, true] as [string, WpKind, StructType, boolean],
    ]),
  ];
  const ratio = 2;
  const size = 26;
  for (const [id, kind, st, vert] of ids) {
    if (map.hasImage(id)) continue;
    const c = document.createElement("canvas");
    c.width = c.height = size * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    ctx.scale(ratio, ratio);
    ctx.translate(size / 2, size / 2);
    drawWpIcon(ctx, kind, size - 4, st, vert);
    map.addImage(id, ctx.getImageData(0, 0, c.width, c.height), { pixelRatio: ratio });
  }
}

export function createWaypoints(
  map: maplibregl.Map,
  opts: {
    toast: (msg: string) => void;
    getFix: () => Fix | null;
    unitAt: (lng: number, lat: number) => { name: string; symbol: string } | null;
    beforeOpen: () => void;
    saveBlob: (blob: Blob, filename: string) => void;
    onChange?: () => void;
  },
) {
  let wps = loadWaypoints();
  let placing = false;
  let openId: string | null = null;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const btn = $<HTMLButtonElement>("wpBtn");
  const panel = $<HTMLElement>("wpPanel");
  const nameIn = $<HTMLInputElement>("wpName");
  const noteIn = $<HTMLTextAreaElement>("wpNote");
  const meta = $<HTMLElement>("wpMeta");
  const list = $<HTMLElement>("wpList");
  const count = $<HTMLElement>("wpCount");
  const kindGroup = $<HTMLElement>("wpKind");
  const structBox = $<HTMLElement>("wpStruct");
  const structSel = $<HTMLSelectElement>("wpStructType");
  const strikeIn = $<HTMLInputElement>("wpStrike");
  const dipIn = $<HTMLInputElement>("wpDip");
  let editKind: WpKind = "outcrop";
  const strikeErr = $<HTMLElement>("wpStrikeErr");
  const dipErr = $<HTMLElement>("wpDipErr");
  const photoGrid = $<HTMLElement>("wpPhotoGrid");
  const camIn = $<HTMLInputElement>("wpPhotoCam");
  const galIn = $<HTMLInputElement>("wpPhotoGal");
  let photoUrls: string[] = [];
  let photoSeq = 0;
  setPhotoNotifier(opts.toast);

  const setEditKind = (k: WpKind) => {
    editKind = k;
    kindGroup.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === k)));
    structBox.hidden = k !== "structure";
  };
  // Label & ikon tombol jenis dibangun sekali; teks diperbarui saat bahasa berganti.
  const renderKindButtons = () => {
    kindGroup.innerHTML = WP_KINDS.map((k) => `<button type="button" data-kind="${k}" aria-pressed="${k === editKind}"><canvas width="36" height="36" aria-hidden="true"></canvas><span>${esc(t(`wpKind_${k}` as Parameters<typeof t>[0]))}</span></button>`).join("");
    kindGroup.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      const c = b.querySelector("canvas")!;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.scale(2, 2);
        ctx.translate(9, 9);
        if (b.dataset.kind === "structure") ctx.rotate(Math.PI / 6);
        drawWpIcon(ctx, b.dataset.kind as WpKind, 15);
      }
      b.addEventListener("click", () => setEditKind(b.dataset.kind as WpKind));
    });
    structSel.innerHTML = STRUCT_TYPES.map((st) => `<option value="${st}">${esc(t(`wpStruct_${st}` as Parameters<typeof t>[0]))}</option>`).join("");
  };
  renderKindButtons();
  // Label foto yang statis (bukan bagian dari daftar yang dirender ulang).
  const renderStatic = () => {
    $("t-wpPhotoTitle").textContent = t("wpPhotoTitle");
    $("t-wpPhotoCamera").textContent = t("wpPhotoCamera");
    $("t-wpPhotoGallery").textContent = t("wpPhotoGallery");
  };
  renderStatic();

  const draw = () => {
    try {
      if (!styleReady(map)) return;
      if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      ensureIcons(map);
      if (!map.getLayer(WP_LAYER)) {
        // Ikon + label selalu tampil (allow-overlap) supaya ikut terekspor utuh ke PNG.
        map.addLayer({
          id: WP_LAYER,
          type: "symbol",
          source: SRC,
          layout: {
            "icon-image": ["get", "icon"],
            "icon-rotate": ["get", "rot"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 11.5,
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: { "text-color": ["get", "color"], "text-halo-color": "#FFFFFF", "text-halo-width": 1.8 },
        });
      } else {
        map.moveLayer(WP_LAYER);
      }
      (map.getSource(SRC) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: wps.map((w) => ({
          type: "Feature" as const,
          properties: {
            id: w.id,
            icon: iconId(w),
            rot: hasAttitude(w) ? Number(w.strike) : 0,
            label: hasAttitude(w) ? `${w.name} ${Math.round(w.dip as number)}°` : w.name,
            color: hasAttitude(w) ? STRUCT_COLOR[w.structType ?? "bedding"] : KIND_COLOR[kindOf(w)] === "#475569" ? "#334155" : "#1F2B33",
          },
          geometry: { type: "Point" as const, coordinates: [w.lng, w.lat] },
        })),
      });
    } catch {
      /* gaya sedang berganti; digambar ulang saat refresh */
    }
  };

  const renderList = () => {
    count.textContent = String(wps.length);
    list.innerHTML = wps.length
      ? wps
          .slice()
          .reverse()
          .map((w) => {
            const att = attitudeText(w);
            const col = hasAttitude(w) ? STRUCT_COLOR[w.structType ?? "bedding"] : KIND_COLOR[kindOf(w)];
            const sub = [att && `${t(`wpStruct_${w.structType ?? "bedding"}` as Parameters<typeof t>[0])} ${att}`, w.unit || `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`].filter(Boolean).join(" · ");
            const cam = w.photos?.length
              ? `<svg class="wp-cam" viewBox="0 0 24 24" role="img" aria-label="${esc(t("wpPhotoBadge"))}"><title>${esc(t("wpPhotoBadge"))}</title><path fill-rule="evenodd" d="M4 7h3.2l1.6-2h6.4l1.6 2H20v12H4zM12 9.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/></svg>`
              : "";
            return `<li><button type="button" class="wp-item" data-id="${esc(w.id)}"><i class="wp-dot" style="background:${col}"></i><strong>${esc(w.name)}</strong><span>${esc(sub)}</span>${cam}</button></li>`;
          })
          .join("")
      : `<li class="muted">${esc(t("wpEmpty"))}</li>`;
    ["wpExportGpx", "wpExportCsv", "wpClearAll"].forEach((id) => ($(id) as HTMLButtonElement).toggleAttribute("disabled", wps.length === 0));
  };

  const revokePhotoUrls = () => {
    photoUrls.forEach((u) => URL.revokeObjectURL(u));
    photoUrls = [];
  };

  const photoItemHtml = (m: PhotoMeta) => {
    const az = m.azimuth === null ? "" : String(m.azimuth);
    return `<li class="wp-photo" data-pid="${esc(m.id)}"><img alt="" width="72" height="72" /><div class="wp-photo-fields"><input type="text" maxlength="200" data-k="caption" value="${esc(m.caption)}" placeholder="${esc(t("wpPhotoCaption"))}" aria-label="${esc(t("wpPhotoCaption"))}" /><input type="number" inputmode="decimal" min="0" max="360" step="1" data-k="az" value="${esc(az)}" placeholder="${esc(t("wpPhotoAzimuth"))}" aria-label="${esc(t("wpPhotoAzimuth"))}" /><button type="button" class="btn wp-clear" data-del="${esc(m.id)}">${esc(t("wpPhotoDelete"))}</button></div></li>`;
  };
  const setThumb = (pid: string, blob: Blob) => {
    const li = photoGrid.querySelector<HTMLLIElement>(`li.wp-photo[data-pid="${CSS.escape(pid)}"]`);
    if (!li) return;
    const url = URL.createObjectURL(blob);
    photoUrls.push(url);
    li.querySelector("img")!.src = url;
  };

  /** Render penuh dari IndexedDB, hanya saat panel dibuka; thumbnail memakai object URL yang dicabut saat ditutup. */
  const renderPhotos = async (w: Waypoint) => {
    const seq = ++photoSeq;
    revokePhotoUrls();
    const metas = await listPhotoMeta(w.id);
    if (seq !== photoSeq) return;
    const byId = new Map(metas.map((m) => [m.id, m] as const));
    const ordered = (w.photos ?? []).map((pid) => byId.get(pid)).filter((m): m is PhotoMeta => Boolean(m));
    photoGrid.innerHTML = ordered.length ? ordered.map(photoItemHtml).join("") : `<li class="muted wp-photo-empty">${esc(t("wpPhotoEmpty"))}</li>`;
    for (const m of ordered) {
      const blob = await getPhoto(m.id);
      if (seq !== photoSeq) return;
      if (blob) setThumb(m.id, blob);
    }
  };

  /** Tambah satu item tanpa menyentuh item lain, sehingga keterangan yang sedang diketik tidak hilang. */
  const appendPhoto = (m: PhotoMeta, blob: Blob) => {
    photoGrid.querySelector(".wp-photo-empty")?.remove();
    photoGrid.insertAdjacentHTML("beforeend", photoItemHtml(m));
    setThumb(m.id, blob);
  };

  /** Foto dikompres lalu disimpan; hanya masuk ke waypoint bila penyimpanan berhasil. */
  const addPhotos = async (files: File[]) => {
    const wid = openId;
    if (!wid || !files.length) return;
    for (const f of files) {
      const bad = photoFileError(f);
      if (bad) {
        opts.toast(t(bad));
        continue;
      }
      try {
        const { blob, w: pw, h: ph } = await compressImage(f);
        const id = newPhotoId();
        const meta: PhotoMeta = {
          id,
          wpId: wid,
          caption: "",
          azimuth: null,
          takenAt: new Date(f.lastModified || Date.now()).toISOString(),
          w: pw,
          h: ph,
          bytes: blob.size,
        };
        if (!(await putPhoto(blob, meta))) continue;
        const cur = wps.find((x) => x.id === wid);
        if (!cur) {
          await deletePhotos([id]); // panel ditutup selama proses: jangan tinggalkan yatim
          continue;
        }
        cur.photos = [...(cur.photos ?? []), id];
        save();
        if (openId === wid) appendPhoto(meta, blob);
      } catch {
        opts.toast(t("wpPhotoError"));
      }
    }
  };

  const save = () => {
    persist(wps);
    draw();
    renderList();
    opts.onChange?.();
  };

  const open = (id: string) => {
    const w = wps.find((x) => x.id === id);
    if (!w) return;
    opts.beforeOpen();
    openId = id;
    nameIn.value = w.name;
    noteIn.value = w.note;
    setEditKind(kindOf(w));
    structSel.value = w.structType ?? "bedding";
    strikeIn.value = Number.isFinite(w.strike as number) ? String(w.strike) : "";
    dipIn.value = Number.isFinite(w.dip as number) ? String(w.dip) : "";
    strikeErr.hidden = true;
    dipErr.hidden = true;
    void renderPhotos(w);
    meta.innerHTML = `<dl>
      <div><dt>${esc(t("wpCoords"))}</dt><dd>${w.lat.toFixed(6)}°, ${w.lng.toFixed(6)}°</dd></div>
      ${w.elevM !== null ? `<div><dt>${esc(t("wpElev"))}</dt><dd>${Math.round(w.elevM)} m</dd></div>` : ""}
      ${w.accM !== null ? `<div><dt>${esc(t("gpsAccuracy"))}</dt><dd>±${Math.round(w.accM)} m (GPS)</dd></div>` : ""}
      ${w.unit ? `<div><dt>${esc(t("wpUnit"))}</dt><dd>${esc(w.unit)}${w.symbol ? ` <code>${esc(w.symbol)}</code>` : ""}</dd></div>` : ""}
      <div><dt>${esc(t("wpTime"))}</dt><dd>${esc(new Date(w.time).toLocaleString())}</dd></div>
    </dl>`;
    panel.hidden = false;
  };

  const close = () => {
    panel.hidden = true;
    openId = null;
    photoSeq++; // batalkan render foto yang masih berjalan
    revokePhotoUrls();
    photoGrid.innerHTML = "";
  };

  const add = (lng: number, lat: number, fix: Fix | null) => {
    const u = opts.unitAt(lng, lat);
    let elev: number | null = fix?.alt ?? null;
    if (elev === null) {
      try {
        const e = map.queryTerrainElevation([lng, lat]);
        elev = typeof e === "number" && Number.isFinite(e) ? e : null;
      } catch {
        elev = null;
      }
    }
    const w: Waypoint = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: nextName(wps),
      note: "",
      kind: "outcrop",
      lat,
      lng,
      elevM: elev,
      accM: fix?.acc ?? null,
      unit: u?.name ?? "",
      symbol: u?.symbol ?? "",
      time: new Date().toISOString(),
    };
    wps.push(w);
    save();
    open(w.id);
  };

  const setPlacing = (on: boolean) => {
    placing = on;
    btn.setAttribute("aria-pressed", String(on));
    map.getCanvas().style.cursor = on ? "crosshair" : "";
    if (on) opts.toast(t("wpPlaceHint"));
    else document.getElementById("toast")?.setAttribute("hidden", ""); // petunjuk selesai; jangan tutupi editor
  };

  btn.addEventListener("click", () => {
    if (placing) return setPlacing(false);
    const fix = opts.getFix();
    if (fix) add(fix.lng, fix.lat, fix);
    else setPlacing(true);
  });
  $("wpSave").addEventListener("click", () => {
    const w = wps.find((x) => x.id === openId);
    if (w) {
      // validity.badInput: teks yang tidak bisa dibaca input number (value-nya "") harus ditolak, bukan disimpan sebagai null.
      let att: ReturnType<typeof parseAttitude> = { ok: true, strike: null, dip: null };
      if (editKind === "structure") {
        if (strikeIn.validity.badInput) att = { ok: false, field: "strike", key: "wpStrikeErr" };
        else if (dipIn.validity.badInput) att = { ok: false, field: "dip", key: "wpDipErr" };
        else att = parseAttitude(strikeIn.value, dipIn.value);
      }
      strikeErr.textContent = !att.ok && att.field === "strike" ? t(att.key) : "";
      strikeErr.hidden = strikeErr.textContent === "";
      dipErr.textContent = !att.ok && att.field === "dip" ? t(att.key) : "";
      dipErr.hidden = dipErr.textContent === "";
      if (!att.ok) return; // isian salah: panel tetap terbuka, tidak ada yang tersimpan
      if (Array.from(photoGrid.querySelectorAll<HTMLInputElement>('[data-k="az"]')).some((el) => !parseAzimuth(el.value).ok)) {
        opts.toast(t("wpAzErr"));
        return;
      }
      w.name = nameIn.value.trim() || w.name;
      w.note = noteIn.value.trim();
      w.kind = editKind;
      if (editKind === "structure") {
        w.structType = structSel.value as StructType;
        w.strike = att.strike;
        w.dip = att.dip;
      } else {
        delete w.structType;
        w.strike = null;
        w.dip = null;
      }
      save();
    }
    close();
  });
  // Hapus waypoint selalu minta konfirmasi; foto ikut terhapus dan hanya dilepas dari waypoint bila berkas foto berhasil dihapus.
  $("wpDelete").addEventListener("click", async () => {
    const w = wps.find((x) => x.id === openId);
    if (!w || !window.confirm(t("wpDeleteConfirm"))) return;
    if (w.photos?.length && !(await deletePhotos(w.photos))) return;
    wps = wps.filter((x) => x.id !== w.id);
    save();
    close();
  });
  $("wpClose").addEventListener("click", close);
  camIn.addEventListener("change", () => {
    const files = Array.from(camIn.files ?? []);
    camIn.value = "";
    void addPhotos(files);
  });
  galIn.addEventListener("change", () => {
    const files = Array.from(galIn.files ?? []);
    galIn.value = "";
    void addPhotos(files);
  });
  // Keterangan dan arah disimpan saat isian kehilangan fokus, sehingga render ulang tidak menghapus ketikan.
  photoGrid.addEventListener("change", async (e) => {
    const el = e.target as HTMLInputElement;
    const pid = el.closest<HTMLElement>(".wp-photo")?.dataset.pid;
    if (!pid) return;
    if (el.dataset.k === "caption") await updatePhotoMeta(pid, { caption: el.value.trim() });
    else if (el.dataset.k === "az") {
      const a = parseAzimuth(el.value);
      if (!a.ok) opts.toast(t("wpAzErr"));
      else await updatePhotoMeta(pid, { azimuth: a.value });
    }
  });
  photoGrid.addEventListener("click", async (e) => {
    const pid = (e.target as HTMLElement).closest<HTMLElement>("[data-del]")?.dataset.del;
    const w = wps.find((x) => x.id === openId);
    if (!pid || !w || !window.confirm(t("wpPhotoDeleteConfirm"))) return;
    // Berkas dihapus dulu; bila gagal, foto tetap tercatat di waypoint.
    if (!(await deletePhotos([pid]))) return;
    w.photos = (w.photos ?? []).filter((x) => x !== pid);
    save();
    const li = photoGrid.querySelector<HTMLElement>(`[data-pid="${CSS.escape(pid)}"]`);
    const src = li?.querySelector("img")?.src ?? "";
    if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    li?.remove();
    if (!photoGrid.querySelector("li.wp-photo")) photoGrid.innerHTML = `<li class="muted wp-photo-empty">${esc(t("wpPhotoEmpty"))}</li>`;
  });
  $("wpFly").addEventListener("click", () => {
    const w = wps.find((x) => x.id === openId);
    if (w) map.flyTo({ center: [w.lng, w.lat], zoom: Math.max(map.getZoom(), 14), duration: 700 });
  });
  list.addEventListener("click", (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>(".wp-item")?.dataset.id;
    const w = wps.find((x) => x.id === id);
    if (!w) return;
    map.flyTo({ center: [w.lng, w.lat], zoom: Math.max(map.getZoom(), 13), duration: 700 });
    open(w.id);
  });
  const stamp = () => new Date().toISOString().slice(0, 10);
  $("wpExportGpx").addEventListener("click", () => opts.saveBlob(new Blob([toGpx(wps)], { type: "application/gpx+xml" }), `orebit-waypoints-${stamp()}.gpx`));
  $("wpExportCsv").addEventListener("click", () => opts.saveBlob(new Blob([toCsv(wps)], { type: "text/csv;charset=utf-8" }), `orebit-waypoints-${stamp()}.csv`));
  $("wpClearAll").addEventListener("click", async () => {
    if (!window.confirm(t("wpClearConfirm"))) return;
    const pids = wps.flatMap((w) => w.photos ?? []);
    if (pids.length && !(await deletePhotos(pids))) return;
    wps = [];
    save();
    close();
  });

  renderList();

  return {
    all: (): readonly Waypoint[] => wps,
    isPlacing: () => placing,
    /** Ketukan peta saat mode tempatkan aktif. */
    place: (lng: number, lat: number) => {
      setPlacing(false);
      add(lng, lat, null);
    },
    open,
    close,
    refresh: () => {
      renderKindButtons();
      renderStatic();
      setEditKind(editKind);
      draw();
      renderList();
    },
  };
}
