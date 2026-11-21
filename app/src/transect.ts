import type maplibregl from "maplibre-gl";
import { esc } from "./detail";
import { getLang, t } from "./i18n";
import { QUERY_LAYERS } from "./layers";

export interface TransectPoint {
  lng: number;
  lat: number;
}

export interface TransectSegment {
  label: string;
  symbol: string;
  color: string;
  age: string;
  km: number;
  pct: number;
}

const R_EARTH_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineKm(a: TransectPoint, b: TransectPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: TransectPoint, b: TransectPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lng - a.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function computeTransectStats(points: readonly TransectPoint[]): { totalKm: number; azimuthDeg: number } {
  if (points.length < 2) return { totalKm: 0, azimuthDeg: 0 };
  let totalKm = 0;
  for (let i = 1; i < points.length; i++) totalKm += haversineKm(points[i - 1], points[i]);
  return { totalKm, azimuthDeg: bearingDeg(points[0], points[points.length - 1]) };
}

export function samplePointsAlongLine(points: readonly TransectPoint[], n = 48): TransectPoint[] {
  if (points.length < 2) return [];
  const cumKm: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumKm.push(cumKm[i - 1] + haversineKm(points[i - 1], points[i]));
  }
  const total = cumKm[cumKm.length - 1];
  if (total <= 0) return [points[0]];
  const out: TransectPoint[] = [];
  for (let k = 0; k < n; k++) {
    const target = (k / Math.max(1, n - 1)) * total;
    let seg = 1;
    while (seg < cumKm.length - 1 && cumKm[seg] < target) seg++;
    const prev = cumKm[seg - 1];
    const span = Math.max(1e-9, cumKm[seg] - prev);
    const frac = (target - prev) / span;
    out.push({
      lng: points[seg - 1].lng + (points[seg].lng - points[seg - 1].lng) * frac,
      lat: points[seg - 1].lat + (points[seg].lat - points[seg - 1].lat) * frac,
    });
  }
  return out;
}

const SOURCE_ID = "transect-src";
const LINE_LAYER = "transect-line";
const PT_LAYER = "transect-pts";

export function createTransectController(map: maplibregl.Map, onActiveChange: (active: boolean) => void) {
  let active = false;
  let points: TransectPoint[] = [];
  let lastSegments: TransectSegment[] = [];

  const panel = document.getElementById("transectPanel")!;
  const body = document.getElementById("transectBody")!;
  const btn = document.getElementById("transectBtn") as HTMLButtonElement;
  const clearBtn = document.getElementById("transectClear") as HTMLButtonElement;
  const exportBtn = document.getElementById("transectExport") as HTMLButtonElement;
  const closeBtn = document.getElementById("transectClose") as HTMLButtonElement;

  const ensureLayers = () => {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#D9381E", "line-width": 3, "line-dasharray": [2, 1.2] },
      });
    }
    if (!map.getLayer(PT_LAYER)) {
      map.addLayer({
        id: PT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#FFFFFF",
          "circle-stroke-color": "#D9381E",
          "circle-stroke-width": 2.5,
        },
      });
    }
  };

  const syncGeojson = () => {
    ensureLayers();
    const features: Array<{ type: "Feature"; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> = points.map((p, idx) => ({
      type: "Feature",
      properties: { idx },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    }));
    if (points.length >= 2) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
      });
    }
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
  };

  const renderPanel = () => {
    const lang = getLang();
    const { totalKm, azimuthDeg } = computeTransectStats(points);
    if (points.length < 2) {
      lastSegments = [];
      body.innerHTML = `<p class="muted">${esc(t("transectHint"))}</p><p class="muted">${esc(t("transectNoSegments"))}</p>`;
      return;
    }

    const layers = QUERY_LAYERS.filter((id) => map.getLayer(id));
    const samples = samplePointsAlongLine(points, 48);
    const rawRuns: { label: string; symbol: string; color: string; age: string; count: number }[] = [];

    for (const s of samples) {
      const pt = map.project([s.lng, s.lat]);
      const feat = layers.length ? map.queryRenderedFeatures(pt, { layers })[0] : undefined;
      const p = (feat?.properties ?? {}) as Record<string, unknown>;
      const label = String(p.formation || p.strat_name || p.name_orig || p.name || (lang === "id" ? "Laut / Tanpa unit" : "Sea / Unmapped"));
      const symbol = String(p.symbol || "");
      const color = String(p.color_hex || p.color || "#D9DEE1");
      const age = feat?.source === "orebit"
        ? [p.interval_base, p.interval_top].filter(Boolean).join("–")
        : [p.b_int_name, p.t_int_name].filter(Boolean).join("–");
      const last = rawRuns[rawRuns.length - 1];
      if (last && last.label === label && last.symbol === symbol) {
        last.count += 1;
      } else {
        rawRuns.push({ label, symbol, color, age, count: 1 });
      }
    }

    const totalCount = samples.length;
    lastSegments = rawRuns.map((r) => ({
      label: r.label,
      symbol: r.symbol,
      color: r.color,
      age: r.age,
      km: Number(((r.count / totalCount) * totalKm).toFixed(2)),
      pct: Math.round((r.count / totalCount) * 100),
    }));

    const stripHtml = `<div class="transect-strip" role="img" aria-label="${esc(t("transectTitle"))}">${lastSegments
      .map((seg) => `<span style="width:${Math.max(2, seg.pct)}%;background:${esc(seg.color)}" title="${esc(seg.label)} (${seg.km} km)"></span>`)
      .join("")}</div>`;

    const listHtml = `<ul class="transect-list">${lastSegments
      .map(
        (seg) => `<li>
        <span class="chip" style="background:${esc(seg.color)}"></span>
        <span class="transect-seg-name">${esc(seg.label)}${seg.symbol ? ` <code>${esc(seg.symbol)}</code>` : ""}</span>
        <span class="transect-seg-meta">${seg.km.toFixed(1)} km · ${seg.pct}%</span>
      </li>`,
      )
      .join("")}</ul>`;

    body.innerHTML = `
      <div class="transect-metrics">
        <div><span>${esc(t("transectDistance"))}</span><strong>${totalKm.toFixed(2)} km</strong></div>
        <div><span>${esc(t("transectAzimuth"))}</span><strong>${azimuthDeg.toFixed(0)}°</strong></div>
      </div>
      ${stripHtml}
      ${listHtml}
    `;
  };

  const setActive = (next: boolean) => {
    active = next;
    btn.setAttribute("aria-pressed", String(active));
    map.getCanvas().style.cursor = active ? "crosshair" : "";
    panel.hidden = !active && points.length === 0;
    onActiveChange(active);
    if (active) renderPanel();
  };

  const clear = () => {
    points = [];
    lastSegments = [];
    syncGeojson();
    if (active) renderPanel();
    else panel.hidden = true;
  };

  btn.addEventListener("click", () => setActive(!active));
  clearBtn.addEventListener("click", clear);
  closeBtn.addEventListener("click", () => {
    setActive(false);
    clear();
  });

  exportBtn.addEventListener("click", () => {
    if (!lastSegments.length) return;
    const header = "unit,symbol,age,distance_km,percent\n";
    const rows = lastSegments
      .map((s) => `"${s.label.replace(/"/g, '""')}","${s.symbol}","${s.age}",${s.km},${s.pct}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orebit-transect-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  });

  return {
    isActive: () => active,
    setActive,
    addPoint: (lng: number, lat: number) => {
      if (!active) return false;
      points.push({ lng, lat });
      syncGeojson();
      panel.hidden = false;
      renderPanel();
      return true;
    },
    refresh: () => {
      if (points.length) {
        syncGeojson();
        renderPanel();
      }
    },
    clear,
  };
}
