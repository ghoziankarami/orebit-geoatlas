// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Waypoint lapangan: tandai titik dari GPS atau ketuk peta, beri nama/catatan, simpan lokal, ekspor GPX/CSV.
import type maplibregl from "maplibre-gl";
import { esc } from "./detail";
import { t } from "./i18n";
import { styleReady } from "./layers";
import type { Fix } from "./gps";

export interface Waypoint {
  id: string;
  name: string;
  note: string;
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
      const desc = [w.note, w.unit && `${w.unit}${w.symbol ? ` (${w.symbol})` : ""}`, w.accM !== null ? `±${Math.round(w.accM)} m` : ""].filter(Boolean).join(" | ");
      return `  <wpt lat="${w.lat.toFixed(7)}" lon="${w.lng.toFixed(7)}">${w.elevM !== null ? `<ele>${w.elevM.toFixed(1)}</ele>` : ""}<time>${xml(w.time)}</time><name>${xml(w.name)}</name>${desc ? `<desc>${xml(desc)}</desc>` : ""}</wpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Orebit GeoAtlas" xmlns="http://www.topografix.com/GPX/1/1">\n${body}\n</gpx>\n`;
}

export function toCsv(wps: readonly Waypoint[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = wps.map((w) => [q(w.name), w.lat.toFixed(7), w.lng.toFixed(7), w.elevM ?? "", w.accM === null ? "" : Math.round(w.accM), q(w.unit), q(w.symbol), q(w.note), w.time].join(","));
  return "name,lat,lon,elev_m,accuracy_m,unit,symbol,note,time\n" + rows.join("\n") + "\n";
}

export function createWaypoints(
  map: maplibregl.Map,
  opts: {
    toast: (msg: string) => void;
    getFix: () => Fix | null;
    unitAt: (lng: number, lat: number) => { name: string; symbol: string } | null;
    beforeOpen: () => void;
    saveBlob: (blob: Blob, filename: string) => void;
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

  const draw = () => {
    try {
      if (!styleReady(map)) return;
      if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      if (!map.getLayer(WP_LAYER)) {
        map.addLayer({ id: WP_LAYER, type: "circle", source: SRC, paint: { "circle-radius": 7, "circle-color": "#E8590C", "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2.5 } });
        map.addLayer({
          id: "wp-labels",
          type: "symbol",
          source: SRC,
          layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.25], "text-anchor": "top", "text-optional": true },
          paint: { "text-color": "#7C2D12", "text-halo-color": "#FFFFFF", "text-halo-width": 1.6 },
        });
      } else {
        map.moveLayer(WP_LAYER);
        map.moveLayer("wp-labels");
      }
      (map.getSource(SRC) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: wps.map((w) => ({ type: "Feature" as const, properties: { id: w.id, name: w.name }, geometry: { type: "Point" as const, coordinates: [w.lng, w.lat] } })),
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
          .map((w) => `<li><button type="button" class="wp-item" data-id="${esc(w.id)}"><strong>${esc(w.name)}</strong><span>${esc(w.unit || `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`)}</span></button></li>`)
          .join("")
      : `<li class="muted">${esc(t("wpEmpty"))}</li>`;
    ["wpExportGpx", "wpExportCsv", "wpClearAll"].forEach((id) => ($(id) as HTMLButtonElement).toggleAttribute("disabled", wps.length === 0));
  };

  const save = () => {
    persist(wps);
    draw();
    renderList();
  };

  const open = (id: string) => {
    const w = wps.find((x) => x.id === id);
    if (!w) return;
    opts.beforeOpen();
    openId = id;
    nameIn.value = w.name;
    noteIn.value = w.note;
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
    isPlacing: () => placing,
    /** Ketukan peta saat mode tempatkan aktif. */
    place: (lng: number, lat: number) => {
      setPlacing(false);
      add(lng, lat, null);
    },
    open,
    close,
    refresh: () => {
      draw();
      renderList();
    },
  };
}
