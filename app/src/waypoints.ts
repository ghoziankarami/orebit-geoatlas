// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Waypoint lapangan: tandai titik dari GPS atau ketuk peta, beri nama/catatan, simpan lokal, ekspor GPX/CSV.
import type maplibregl from "maplibre-gl";
import { esc } from "./detail";
import { t } from "./i18n";
import { styleReady } from "./layers";
import type { Fix } from "./gps";

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
            return `<li><button type="button" class="wp-item" data-id="${esc(w.id)}"><i class="wp-dot" style="background:${col}"></i><strong>${esc(w.name)}</strong><span>${esc(sub)}</span></button></li>`;
          })
          .join("")
      : `<li class="muted">${esc(t("wpEmpty"))}</li>`;
    ["wpExportGpx", "wpExportCsv", "wpClearAll"].forEach((id) => ($(id) as HTMLButtonElement).toggleAttribute("disabled", wps.length === 0));
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
      w.name = nameIn.value.trim() || w.name;
      w.note = noteIn.value.trim();
      w.kind = editKind;
      if (editKind === "structure") {
        const st = strikeIn.value === "" ? NaN : Number(strikeIn.value);
        const dp = dipIn.value === "" ? NaN : Number(dipIn.value);
        w.structType = structSel.value as StructType;
        w.strike = Number.isFinite(st) ? ((st % 360) + 360) % 360 : null;
        w.dip = Number.isFinite(dp) ? Math.max(0, Math.min(90, dp)) : null;
      } else {
        delete w.structType;
        w.strike = null;
        w.dip = null;
      }
      save();
    }
    close();
  });
  $("wpDelete").addEventListener("click", () => {
    wps = wps.filter((x) => x.id !== openId);
    save();
    close();
  });
  $("wpClose").addEventListener("click", close);
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
  $("wpClearAll").addEventListener("click", () => {
    if (!window.confirm(t("wpClearConfirm"))) return;
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
      setEditKind(editKind);
      draw();
      renderList();
    },
  };
}
