import type maplibregl from "maplibre-gl";
import { esc, safeColor } from "./detail";
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

export interface TransectStructureHit {
  km: number;
  frac: number;
  type: string;
}

interface SampleHit {
  point: TransectPoint;
  label: string;
  symbol: string;
  color: string;
  age: string;
  elevM: number | null;
}

const DEM_TILE_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
const DEM_TILE_SIZE = 512;
const demTileCache = new Map<string, Promise<ImageData | null>>();

function lngLatToTilePixel(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tx = Math.max(0, Math.min(n - 1, Math.floor(xFloat)));
  const ty = Math.max(0, Math.min(n - 1, Math.floor(yFloat)));
  const px = Math.max(0, Math.min(DEM_TILE_SIZE - 1, Math.floor((xFloat - tx) * DEM_TILE_SIZE)));
  const py = Math.max(0, Math.min(DEM_TILE_SIZE - 1, Math.floor((yFloat - ty) * DEM_TILE_SIZE)));
  return { tx, ty, px, py };
}

function fetchDemTile(z: number, tx: number, ty: number): Promise<ImageData | null> {
  const key = `${z}/${tx}/${ty}`;
  const cached = demTileCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    try {
      const url = DEM_TILE_URL.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty));
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = DEM_TILE_SIZE;
      canvas.height = DEM_TILE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0, DEM_TILE_SIZE, DEM_TILE_SIZE);
      bmp.close?.();
      return ctx.getImageData(0, 0, DEM_TILE_SIZE, DEM_TILE_SIZE);
    } catch {
      return null;
    }
  })();
  demTileCache.set(key, p);
  return p;
}

async function sampleDemElevations(points: readonly TransectPoint[], totalKm: number): Promise<(number | null)[]> {
  if (typeof fetch !== "function" || typeof document === "undefined") return points.map(() => null);
  const z = totalKm < 15 ? 11 : totalKm < 60 ? 10 : totalKm < 200 ? 9 : 8;
  const coords = points.map((pt) => lngLatToTilePixel(pt.lng, pt.lat, z));
  const uniqueTiles = new Map<string, Promise<ImageData | null>>();
  for (const c of coords) {
    const k = `${z}/${c.tx}/${c.ty}`;
    if (!uniqueTiles.has(k)) uniqueTiles.set(k, fetchDemTile(z, c.tx, c.ty));
  }
  const tileMap = new Map<string, ImageData | null>();
  await Promise.all(
    [...uniqueTiles.entries()].map(async ([k, prom]) => {
      tileMap.set(k, await prom);
    }),
  );
  return coords.map((c) => {
    const img = tileMap.get(`${z}/${c.tx}/${c.ty}`);
    if (!img) return null;
    const idx = (c.py * DEM_TILE_SIZE + c.px) * 4;
    const r = img.data[idx];
    const g = img.data[idx + 1];
    const b = img.data[idx + 2];
    const elev = r * 256 + g + b / 256 - 32768;
    return Number.isFinite(elev) ? Math.round(elev) : null;
  });
}

function segmentIntersection2D(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number | null {
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-12) return null;
  const qpx = cx - ax;
  const qpy = cy - ay;
  const t = (qpx * sY - qpy * sX) / denom;
  const u = (qpx * rY - qpy * rX) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

function findStructureIntersections(
  map: maplibregl.Map,
  points: readonly TransectPoint[],
  totalKm: number,
): TransectStructureHit[] {
  if (points.length < 2 || totalKm <= 0 || !map.isStyleLoaded()) return [];
  const lineLayers = ["ob-lines", "ms-lines"].filter((id) => map.getLayer(id));
  if (!lineLayers.length) return [];

  const screenPts = points.map((p) => map.project([p.lng, p.lat]));
  const xs = screenPts.map((p) => p.x);
  const ys = screenPts.map((p) => p.y);
  const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
    [Math.min(...xs) - 4, Math.min(...ys) - 4],
    [Math.max(...xs) + 4, Math.max(...ys) + 4],
  ];
  const feats = map.queryRenderedFeatures(bbox, { layers: lineLayers });
  if (!feats.length) return [];

  const cumKm: number[] = [0];
  for (let i = 1; i < points.length; i++) cumKm.push(cumKm[i - 1] + haversineKm(points[i - 1], points[i]));

  const hits: TransectStructureHit[] = [];
  for (const feat of feats) {
    const geom = feat.geometry;
    const rings: number[][][] =
      geom.type === "LineString"
        ? [geom.coordinates as number[][]]
        : geom.type === "MultiLineString"
          ? (geom.coordinates as number[][][])
          : [];
    if (!rings.length) continue;
    const props = (feat.properties ?? {}) as Record<string, unknown>;
    const rawType = String(props.line_type || props.type || props.descrip || props.name || "Sesar").trim();
    const type = rawType || "Sesar";

    for (const line of rings) {
      for (let j = 1; j < line.length; j++) {
        const [cx, cy] = line[j - 1];
        const [dx, dy] = line[j];
        for (let i = 1; i < points.length; i++) {
          const tHit = segmentIntersection2D(
            points[i - 1].lng, points[i - 1].lat,
            points[i].lng, points[i].lat,
            cx, cy, dx, dy,
          );
          if (tHit !== null) {
            const segKm = cumKm[i] - cumKm[i - 1];
            const km = cumKm[i - 1] + tHit * segKm;
            const frac = km / totalKm;
            if (!hits.some((h) => Math.abs(h.frac - frac) < 0.012 && h.type === type)) {
              hits.push({ km: Number(km.toFixed(2)), frac, type });
            }
          }
        }
      }
    }
  }
  return hits.sort((a, b) => a.frac - b.frac).slice(0, 14);
}

function buildSectionSvg(
  samples: readonly SampleHit[],
  structures: readonly TransectStructureHit[],
  totalKm: number,
): string {
  const W = 420;
  const H = 180;
  const padL = 38;
  const padR = 12;
  const padT = 18;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const validElevs = samples.map((s) => s.elevM).filter((v): v is number => v !== null);
  const hasDem = validElevs.length >= 2;
  const rawMin = hasDem ? Math.min(...validElevs, 0) : 0;
  const rawMax = hasDem ? Math.max(...validElevs, 100) : 100;
  const span = Math.max(50, rawMax - rawMin);
  const yMin = rawMin - span * 0.35; // ruang bawah permukaan untuk penampang geologi
  const yMax = rawMax + span * 0.12;
  const yToPx = (elev: number) => padT + ((yMax - elev) / (yMax - yMin)) * plotH;
  const xToPx = (idx: number) => padL + (idx / Math.max(1, samples.length - 1)) * plotW;
  const yBase = H - padB;

  const polygons: string[] = [];
  const contacts: string[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    const e0 = s0.elevM ?? 50;
    const e1 = s1.elevM ?? 50;
    const x0 = xToPx(i).toFixed(1);
    const x1 = xToPx(i + 1).toFixed(1);
    const yt0 = yToPx(e0).toFixed(1);
    const yt1 = yToPx(e1).toFixed(1);
    const yb = yBase.toFixed(1);
    const col = safeColor(s0.color);
    polygons.push(`<polygon points="${x0},${yt0} ${x1},${yt1} ${x1},${yb} ${x0},${yb}" fill="${col}" fill-opacity="0.88" stroke="none"/>`);
    if (i > 0 && (s0.label !== samples[i - 1].label || s0.symbol !== samples[i - 1].symbol)) {
      contacts.push(`<line x1="${x0}" y1="${yt0}" x2="${x0}" y2="${yb}" stroke="rgba(31,43,51,0.32)" stroke-width="0.9"/>`);
    }
  }

  const surfacePts = samples
    .map((s, i) => `${xToPx(i).toFixed(1)},${yToPx(s.elevM ?? 50).toFixed(1)}`)
    .join(" ");

  const seaLineY = yToPx(0);
  const seaLine =
    hasDem && rawMin < 0 && rawMax > 0
      ? `<line x1="${padL}" y1="${seaLineY.toFixed(1)}" x2="${W - padR}" y2="${seaLineY.toFixed(1)}" stroke="#0284C7" stroke-width="0.9" stroke-dasharray="3,3"/>
         <text x="${padL + 3}" y="${(seaLineY - 2).toFixed(1)}" font-size="8" fill="#0284C7">0 m</text>`
      : "";

  const structTraces = structures
    .map((st, idx) => {
      const sx = padL + st.frac * plotW;
      const sampleIdx = Math.min(samples.length - 1, Math.max(0, Math.round(st.frac * (samples.length - 1))));
      const topElev = samples[sampleIdx]?.elevM ?? 50;
      const sy = yToPx(topElev);
      const isFold = /lipat|fold|anti|syn/i.test(st.type);
      const stroke = isFold ? "#7C3AED" : "#B91C1C";
      const dash = isFold ? "2,2" : "4,2";
      const tag = isFold ? "L" : "S";
      const labelY = Math.max(10, sy - 4 - (idx % 2) * 8);
      return `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${dash}"/>
              <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.6" fill="${stroke}"/>
              <text x="${sx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${stroke}">${tag}</text>`;
    })
    .join("");

  const maxLabel = hasDem ? `${Math.round(rawMax)}m` : "—";
  const minLabel = hasDem ? `${Math.round(rawMin)}m` : "0m";

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Geological Cross-Section">
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#F8FAFC" stroke="rgba(31,43,51,0.16)" stroke-width="1"/>
    ${polygons.join("")}
    ${contacts.join("")}
    ${seaLine}
    <polyline points="${surfacePts}" fill="none" stroke="#1F2B33" stroke-width="1.8" stroke-linejoin="round"/>
    ${structTraces}
    <text x="${padL - 4}" y="${padT + 8}" text-anchor="end" font-size="8.5" fill="#4B5563">${maxLabel}</text>
    <text x="${padL - 4}" y="${yBase - 2}" text-anchor="end" font-size="8.5" fill="#4B5563">${minLabel}</text>
    <text x="${padL}" y="${H - 7}" text-anchor="start" font-size="8.5" fill="#4B5563">0 km</text>
    <text x="${(padL + W - padR) / 2}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="#4B5563">${(totalKm / 2).toFixed(1)} km</text>
    <text x="${W - padR}" y="${H - 7}" text-anchor="end" font-size="8.5" fill="#4B5563">${totalKm.toFixed(1)} km</text>
  </svg>`;
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
  let lastStructures: TransectStructureHit[] = [];
  let lastElevRange: [number, number] | null = null;
  let renderSeq = 0;

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
    if (!map.isStyleLoaded()) return;
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
    const seq = ++renderSeq;
    const lang = getLang();
    const { totalKm, azimuthDeg } = computeTransectStats(points);
    if (points.length < 2) {
      lastSegments = [];
      lastStructures = [];
      lastElevRange = null;
      body.innerHTML = `<p class="muted">${esc(t("transectHint"))}</p><p class="muted">${esc(t("transectNoSegments"))}</p>`;
      return;
    }

    const styleReady = map.isStyleLoaded();
    const layers = styleReady ? QUERY_LAYERS.filter((id) => map.getLayer(id)) : [];
    const samplePts = samplePointsAlongLine(points, 64);
    const rawRuns: { label: string; symbol: string; color: string; age: string; count: number }[] = [];
    const sampleHits: SampleHit[] = [];

    for (const s of samplePts) {
      const pt = map.project([s.lng, s.lat]);
      const feat = layers.length ? map.queryRenderedFeatures(pt, { layers })[0] : undefined;
      const p = (feat?.properties ?? {}) as Record<string, unknown>;
      const label = String(p.formation || p.strat_name || p.name_orig || p.name || (lang === "id" ? "Laut / Tanpa unit" : "Sea / Unmapped"));
      const symbol = String(p.symbol || "");
      const color = String(p.color_hex || p.color || "#D9DEE1");
      const age = feat?.source === "orebit"
        ? [p.interval_base, p.interval_top].filter(Boolean).join("–")
        : [p.b_int_name, p.t_int_name].filter(Boolean).join("–");
      const syncElev = styleReady && map.getTerrain() ? map.queryTerrainElevation([s.lng, s.lat]) : null;
      sampleHits.push({
        point: s,
        label,
        symbol,
        color,
        age,
        elevM: typeof syncElev === "number" && Number.isFinite(syncElev) ? Math.round(syncElev) : null,
      });
      const last = rawRuns[rawRuns.length - 1];
      if (last && last.label === label && last.symbol === symbol) {
        last.count += 1;
      } else {
        rawRuns.push({ label, symbol, color, age, count: 1 });
      }
    }

    const totalCount = samplePts.length;
    lastSegments = rawRuns.map((r) => ({
      label: r.label,
      symbol: r.symbol,
      color: r.color,
      age: r.age,
      km: Number(((r.count / totalCount) * totalKm).toFixed(2)),
      pct: Math.round((r.count / totalCount) * 100),
    }));
    lastStructures = findStructureIntersections(map, points, totalKm);

    const drawHtml = () => {
      const validElevs = sampleHits.map((s) => s.elevM).filter((v): v is number => v !== null);
      lastElevRange = validElevs.length >= 2 ? [Math.min(...validElevs), Math.max(...validElevs)] : null;
      const elevStr = lastElevRange ? `${lastElevRange[0]}..${lastElevRange[1]} m` : "…";
      const sectionHtml = `<div class="transect-section">${buildSectionSvg(sampleHits, lastStructures, totalKm)}</div>`;
      const structHtml = lastStructures.length
        ? `<div class="transect-struct-badges" aria-label="${esc(t("transectStructures"))}">${lastStructures
            .map((st) => `<span class="transect-struct-badge">${esc(st.type)} @ ${st.km.toFixed(1)} km</span>`)
            .join("")}</div>`
        : "";
      const listHtml = `<ul class="transect-list">${lastSegments
        .map(
          (seg) => `<li>
          <span class="chip" style="background:${safeColor(seg.color)}"></span>
          <span class="transect-seg-name">${esc(seg.label)}${seg.symbol ? ` <code>${esc(seg.symbol)}</code>` : ""}</span>
          <span class="transect-seg-meta">${seg.km.toFixed(1)} km · ${seg.pct}%</span>
        </li>`,
        )
        .join("")}</ul>`;

      body.innerHTML = `
        <div class="transect-metrics">
          <div><span>${esc(t("transectDistance"))}</span><strong>${totalKm.toFixed(2)} km</strong></div>
          <div><span>${esc(t("transectAzimuth"))}</span><strong>${azimuthDeg.toFixed(0)}°</strong></div>
          <div><span>${esc(t("transectElevation"))}</span><strong>${esc(elevStr)}</strong></div>
        </div>
        ${sectionHtml}
        ${structHtml}
        ${listHtml}
      `;
    };

    drawHtml();

    if (sampleHits.some((s) => s.elevM === null)) {
      void sampleDemElevations(samplePts, totalKm).then((elevs) => {
        if (seq !== renderSeq || points.length < 2) return;
        let updated = false;
        elevs.forEach((e, idx) => {
          if (e !== null && sampleHits[idx]) {
            sampleHits[idx].elevM = e;
            updated = true;
          }
        });
        if (updated) drawHtml();
      });
    }
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
    hide: () => {
      active = false;
      btn.setAttribute("aria-pressed", "false");
      map.getCanvas().style.cursor = "";
      panel.hidden = true;
    },
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
