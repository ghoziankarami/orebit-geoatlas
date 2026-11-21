import type maplibregl from "maplibre-gl";
import { esc, safeColor } from "./detail";
import { getLang, t } from "./i18n";
import { QUERY_LAYERS } from "./layers";
import { LITH_CLASSES } from "./lithology";

export interface TransectPoint {
  lng: number;
  lat: number;
}

export interface TransectSegment {
  label: string;
  symbol: string;
  color: string;
  lithClass: string;
  lithLabel: string;
  lithDetail: string;
  age: string;
  ageBaseMa: number;
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
  lithClass: string;
  lithLabel: string;
  lithDetail: string;
  age: string;
  ageBaseMa: number;
  elevM: number | null;
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
  try {
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
      const type = rawType === "fault" ? "Sesar" : rawType === "anticline" ? "Antiklin" : rawType === "syncline" ? "Sinklin" : rawType === "contact" ? "Kontak Geologi" : rawType || "Sesar";

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
              if (!hits.some((h) => Math.abs(h.frac - frac) < 0.015 && h.type === type)) {
                hits.push({ km: Number(km.toFixed(2)), frac, type });
              }
            }
          }
        }
      }
    }
    return hits.sort((a, b) => a.frac - b.frac).slice(0, 12);
  } catch {
    return [];
  }
}

const SVG_LITH_PATTERNS = `
  <defs>
    <pattern id="pat-carbonate" width="16" height="10" patternUnits="userSpaceOnUse">
      <path d="M0,5 H16 M0,10 H16 M4,0 V5 M12,0 V5 M8,5 V10" stroke="rgba(20,35,45,0.28)" stroke-width="0.8" fill="none"/>
    </pattern>
    <pattern id="pat-siliciclastic" width="14" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
      <line x1="0" y1="3" x2="14" y2="3" stroke="rgba(20,35,45,0.26)" stroke-width="0.8" stroke-dasharray="4,2"/>
      <circle cx="3" cy="7" r="0.7" fill="rgba(20,35,45,0.3)"/>
      <circle cx="9" cy="7.5" r="0.7" fill="rgba(20,35,45,0.3)"/>
    </pattern>
    <pattern id="pat-volcanic" width="12" height="10" patternUnits="userSpaceOnUse">
      <path d="M2,3 L4,6 L6,3 M8,7 L10,10 L12,7" stroke="rgba(20,35,45,0.34)" stroke-width="0.9" fill="none"/>
    </pattern>
    <pattern id="pat-plutonic_felsic" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M3,1.5 V5.5 M1,3.5 H5 M9,6.5 V10.5 M7,8.5 H11" stroke="rgba(20,35,45,0.35)" stroke-width="0.9" fill="none"/>
    </pattern>
    <pattern id="pat-plutonic_mafic" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M2,2 L6,6 M6,2 L2,6" stroke="rgba(15,28,35,0.35)" stroke-width="0.9" fill="none"/>
    </pattern>
    <pattern id="pat-metamorphic" width="16" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-10)">
      <path d="M0,4 Q4,1 8,4 T16,4" stroke="rgba(20,35,45,0.34)" stroke-width="0.9" fill="none"/>
    </pattern>
    <pattern id="pat-unconsolidated" width="10" height="8" patternUnits="userSpaceOnUse">
      <circle cx="2.5" cy="3" r="0.85" fill="rgba(20,35,45,0.32)"/>
      <circle cx="7.5" cy="6" r="1.1" fill="rgba(20,35,45,0.26)"/>
    </pattern>
    <pattern id="pat-melange" width="12" height="10" patternUnits="userSpaceOnUse">
      <polygon points="2,8 5,3 7,8" fill="none" stroke="rgba(20,35,45,0.34)" stroke-width="0.8"/>
    </pattern>
  </defs>
`;

interface UnitBlock {
  startIdx: number;
  endIdx: number;
  label: string;
  symbol: string;
  color: string;
  lithClass: string;
  ageBaseMa: number;
}

function buildSectionSvg(
  samples: readonly SampleHit[],
  structures: readonly TransectStructureHit[],
  totalKm: number,
): string {
  const W = 420;
  const H = 205;
  const padL = 38;
  const padR = 12;
  const padT = 18;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const validElevs = samples.map((s) => s.elevM).filter((v): v is number => v !== null);
  const hasDem = validElevs.length >= 2;
  const rawMin = hasDem ? Math.min(...validElevs, 0) : 0;
  const rawMax = hasDem ? Math.max(...validElevs, 120) : 120;
  const span = Math.max(60, rawMax - rawMin);
  // 48% subsurface thickness so geological architecture (batholiths, dipping strata, basement) is clearly visible
  const yMin = rawMin - span * 0.55;
  const yMax = rawMax + span * 0.14;
  const yToPx = (elev: number) => padT + ((yMax - elev) / (yMax - yMin)) * plotH;
  const xToPx = (idx: number) => padL + (idx / Math.max(1, samples.length - 1)) * plotW;
  const yBase = H - padB;

  // Group contiguous samples into UnitBlocks
  const blocks: UnitBlock[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const last = blocks[blocks.length - 1];
    if (last && last.label === s.label && last.symbol === s.symbol) {
      last.endIdx = i;
    } else {
      blocks.push({
        startIdx: i,
        endIdx: i,
        label: s.label,
        symbol: s.symbol,
        color: s.color,
        lithClass: s.lithClass,
        ageBaseMa: s.ageBaseMa,
      });
    }
  }

  // Pick oldest pre-Quaternary bedrock unit along the line as deep basement foundation
  const bedrockBlocks = blocks.filter((b) => b.lithClass !== "unconsolidated" && b.ageBaseMa > 2.6);
  const oldestBedrock = bedrockBlocks.length
    ? bedrockBlocks.reduce((a, b) => (a.ageBaseMa >= b.ageBaseMa ? a : b))
    : blocks[0];

  const layersSvg: string[] = [];

  // 1. Deep Basement Foundation Layer across the whole section base (Law of Superposition)
  if (oldestBedrock) {
    const baseTopPoints = samples
      .map((s, i) => `${xToPx(i).toFixed(1)},${yToPx(s.elevM ?? 50).toFixed(1)}`)
      .join(" ");
    const bCol = safeColor(oldestBedrock.color);
    const bPat = `pat-${oldestBedrock.lithClass || "metamorphic"}`;
    layersSvg.push(
      `<polygon points="${padL.toFixed(1)},${yBase.toFixed(1)} ${baseTopPoints} ${(W - padR).toFixed(1)},${yBase.toFixed(1)}" fill="${bCol}" fill-opacity="0.72"/>`,
      `<polygon points="${padL.toFixed(1)},${yBase.toFixed(1)} ${baseTopPoints} ${(W - padR).toFixed(1)},${yBase.toFixed(1)}" fill="url(#${bPat})"/>`,
    );
  }

  // 2. Render Sedimentary / Metamorphic / Volcanic strata with dipping contacts, then Plutons cross-cutting, then Quaternary veneer on top
  const renderBlockPolygon = (b: UnitBlock, mode: "strata" | "pluton" | "veneer") => {
    const i0 = b.startIdx;
    const i1 = Math.min(samples.length - 1, Math.max(b.endIdx, i0 + 1));
    const topPts: string[] = [];
    for (let i = i0; i <= i1; i++) {
      topPts.push(`${xToPx(i).toFixed(1)},${yToPx(samples[i].elevM ?? 50).toFixed(1)}`);
    }
    const xL = xToPx(i0);
    const xR = xToPx(i1);
    const yTopL = yToPx(samples[i0].elevM ?? 50);
    const yTopR = yToPx(samples[i1].elevM ?? 50);
    const col = safeColor(b.color);
    const patId = `pat-${b.lithClass || "siliciclastic"}`;

    let polyPts = "";
    let contactLines = "";
    if (mode === "veneer") {
      // Surficial Quaternary unconsolidated blanket (top ~24% of subsurface thickness)
      const botPts: string[] = [];
      for (let i = i1; i >= i0; i--) {
        const ySurf = yToPx(samples[i].elevM ?? 50);
        const thickness = Math.min(24, Math.max(11, (yBase - ySurf) * 0.25));
        botPts.push(`${xToPx(i).toFixed(1)},${Math.min(yBase - 4, ySurf + thickness).toFixed(1)}`);
      }
      polyPts = `${topPts.join(" ")} ${botPts.join(" ")}`;
      contactLines = `<polyline points="${botPts.join(" ")}" fill="none" stroke="rgba(31,43,51,0.55)" stroke-width="1" stroke-dasharray="3,2"/>`;
    } else if (mode === "pluton") {
      // Intrusive batholith/stock widening downward with cross-cutting contacts
      const spreadL = i0 > 0 ? Math.max(padL, xL - 16) : xL;
      const spreadR = i1 < samples.length - 1 ? Math.min(W - padR, xR + 16) : xR;
      polyPts = `${topPts.join(" ")} ${spreadR.toFixed(1)},${yBase.toFixed(1)} ${spreadL.toFixed(1)},${yBase.toFixed(1)}`;
      if (i0 > 0) {
        contactLines += `<line x1="${xL.toFixed(1)}" y1="${yTopL.toFixed(1)}" x2="${spreadL.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="#7F1D1D" stroke-width="1.3"/>`;
      }
      if (i1 < samples.length - 1) {
        contactLines += `<line x1="${xR.toFixed(1)}" y1="${yTopR.toFixed(1)}" x2="${spreadR.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="#7F1D1D" stroke-width="1.3"/>`;
      }
    } else {
      // Dipping sedimentary/metamorphic/volcanic unit: dip contact beneath younger neighbor
      const prevBlock = blocks.find((p) => p.endIdx === i0 - 1);
      const nextBlock = blocks.find((n) => n.startIdx === i1 + 1);
      const dipL = prevBlock ? (prevBlock.ageBaseMa < b.ageBaseMa ? -14 : 14) : 0;
      const dipR = nextBlock ? (nextBlock.ageBaseMa < b.ageBaseMa ? 14 : -14) : 0;
      const bxL = i0 > 0 ? Math.max(padL, Math.min(W - padR, xL + dipL)) : xL;
      const bxR = i1 < samples.length - 1 ? Math.max(padL, Math.min(W - padR, xR + dipR)) : xR;
      polyPts = `${topPts.join(" ")} ${bxR.toFixed(1)},${yBase.toFixed(1)} ${bxL.toFixed(1)},${yBase.toFixed(1)}`;
      if (i0 > 0) {
        contactLines += `<line x1="${xL.toFixed(1)}" y1="${yTopL.toFixed(1)}" x2="${bxL.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="rgba(31,43,51,0.55)" stroke-width="1.05"/>`;
      }
      if (i1 < samples.length - 1) {
        contactLines += `<line x1="${xR.toFixed(1)}" y1="${yTopR.toFixed(1)}" x2="${bxR.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="rgba(31,43,51,0.55)" stroke-width="1.05"/>`;
      }
    }

    layersSvg.push(
      `<polygon points="${polyPts}" fill="${col}" fill-opacity="0.92"/>`,
      `<polygon points="${polyPts}" fill="url(#${patId})"/>`,
      contactLines,
    );
  };

  for (const b of blocks) {
    const isPluton = b.lithClass === "plutonic_felsic" || b.lithClass === "plutonic_mafic";
    const isVeneer = b.lithClass === "unconsolidated" && blocks.length > 1;
    if (!isPluton && !isVeneer) renderBlockPolygon(b, "strata");
  }
  for (const b of blocks) {
    if (b.lithClass === "plutonic_felsic" || b.lithClass === "plutonic_mafic") {
      renderBlockPolygon(b, "pluton");
    }
  }
  for (const b of blocks) {
    if (b.lithClass === "unconsolidated" && blocks.length > 1) {
      renderBlockPolygon(b, "veneer");
    }
  }

  // 3. On-Section Formation Symbol Badges (TRJkg, TRt, CPp, Tma, Qa, etc.)
  const unitBadgesSvg: string[] = [];
  for (const b of blocks) {
    const xL = xToPx(b.startIdx);
    const xR = xToPx(Math.min(samples.length - 1, Math.max(b.endIdx, b.startIdx + 1)));
    const widthPx = xR - xL;
    const tag = (b.symbol || b.label.slice(0, 6)).trim();
    if (!tag || widthPx < 24) continue;
    const midIdx = Math.round((b.startIdx + b.endIdx) / 2);
    const cx = (xL + xR) / 2;
    const ySurf = yToPx(samples[midIdx]?.elevM ?? 50);
    const isVeneer = b.lithClass === "unconsolidated" && blocks.length > 1;
    const cy = isVeneer ? Math.min(yBase - 8, ySurf + 11) : Math.min(yBase - 12, ySurf + (yBase - ySurf) * 0.45);
    const boxW = Math.min(widthPx - 4, Math.max(22, tag.length * 5.8 + 8));
    unitBadgesSvg.push(
      `<rect x="${(cx - boxW / 2).toFixed(1)}" y="${(cy - 6.5).toFixed(1)}" width="${boxW.toFixed(1)}" height="13" rx="3" fill="rgba(255,255,255,0.86)" stroke="rgba(31,43,51,0.45)" stroke-width="0.7"/>`,
      `<text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" font-size="8.2" font-weight="700" fill="#1F2B33">${esc(tag)}</text>`,
    );
  }

  const surfacePts = samples
    .map((s, i) => `${xToPx(i).toFixed(1)},${yToPx(s.elevM ?? 50).toFixed(1)}`)
    .join(" ");

  const seaLineY = yToPx(0);
  const seaLine =
    hasDem && rawMin < 0 && rawMax > 0
      ? `<line x1="${padL}" y1="${seaLineY.toFixed(1)}" x2="${W - padR}" y2="${seaLineY.toFixed(1)}" stroke="#0284C7" stroke-width="0.9" stroke-dasharray="3,3"/>
         <text x="${padL + 3}" y="${(seaLineY - 2).toFixed(1)}" font-size="8" fill="#0284C7">0 m (MSL)</text>`
      : "";

  // 4. Inclined Structural Fault Planes (~68° dip) & Fold Axial Traces
  const structTraces = structures
    .map((st, idx) => {
      const sx = padL + st.frac * plotW;
      const sampleIdx = Math.min(samples.length - 1, Math.max(0, Math.round(st.frac * (samples.length - 1))));
      const topElev = samples[sampleIdx]?.elevM ?? 50;
      const sy = yToPx(topElev);
      const isFold = /lipat|fold|anti|syn/i.test(st.type);
      const isContact = /kontak|contact/i.test(st.type);
      const stroke = isFold ? "#6D28D9" : isContact ? "#0F766E" : "#B91C1C";
      const dash = isFold ? "2,2" : isContact ? "3,2" : "5,2";
      const dipDx = (idx % 2 === 0 ? 1 : -1) * 14;
      const bx = Math.max(padL + 2, Math.min(W - padR - 2, sx + dipDx));
      const tag = isFold ? "⇅L" : isContact ? "K" : `F${idx + 1}`;
      const labelY = Math.max(11, sy - 4 - (idx % 2) * 8);
      return `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="${stroke}" stroke-width="1.6" stroke-dasharray="${dash}"/>
              <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.6" fill="${stroke}"/>
              <text x="${sx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="8.2" font-weight="700" fill="${stroke}">${tag}</text>`;
    })
    .join("");

  const maxLabel = hasDem ? `${Math.round(rawMax)}m` : "—";
  const minLabel = hasDem ? `${Math.round(rawMin)}m` : "0m";

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Geological Cross-Section">
    ${SVG_LITH_PATTERNS}
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#F8FAFC" stroke="rgba(31,43,51,0.18)" stroke-width="1"/>
    ${layersSvg.join("")}
    ${seaLine}
    <polyline points="${surfacePts}" fill="none" stroke="#1F2B33" stroke-width="2" stroke-linejoin="round"/>
    ${structTraces}
    ${unitBadgesSvg.join("")}
    <text x="${padL - 4}" y="${padT + 8}" text-anchor="end" font-size="8.5" fill="#4B5563">${maxLabel}</text>
    <text x="${padL - 4}" y="${yBase - 2}" text-anchor="end" font-size="8.5" fill="#4B5563">${minLabel}</text>
    <text x="${padL}" y="${H - 7}" text-anchor="start" font-size="8.5" font-weight="600" fill="#374151">A (0 km)</text>
    <text x="${(padL + W - padR) / 2}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="#4B5563">${(totalKm / 2).toFixed(1)} km</text>
    <text x="${W - padR}" y="${H - 7}" text-anchor="end" font-size="8.5" font-weight="600" fill="#374151">A' (${totalKm.toFixed(1)} km)</text>
  </svg>`;
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
    try {
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
    } catch {
      // Style masih dimuat; akan disinkronkan saat style.load
    }
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

    let layers: string[] = [];
    let hasTerrain = false;
    try {
      if (map.isStyleLoaded()) {
        layers = QUERY_LAYERS.filter((id) => Boolean(map.getLayer(id)));
        hasTerrain = Boolean(map.getTerrain());
      }
    } catch {
      layers = [];
    }
    const samplePts = samplePointsAlongLine(points, 64);
    const rawRuns: {
      label: string;
      symbol: string;
      color: string;
      lithClass: string;
      lithLabel: string;
      lithDetail: string;
      age: string;
      ageBaseMa: number;
      count: number;
    }[] = [];
    const sampleHits: SampleHit[] = [];

    for (const s of samplePts) {
      const pt = map.project([s.lng, s.lat]);
      let feat: maplibregl.MapGeoJSONFeature | undefined;
      try {
        feat = layers.length ? map.queryRenderedFeatures(pt, { layers })[0] : undefined;
      } catch {
        feat = undefined;
      }
      const p = (feat?.properties ?? {}) as Record<string, unknown>;
      const label = String(p.formation || p.strat_name || p.name_orig || p.name || (lang === "id" ? "Laut / Tanpa unit" : "Sea / Unmapped"));
      const symbol = String(p.symbol || "");
      const lithClass = String(p.lith_class || "siliciclastic");
      const lithMeta = LITH_CLASSES.find((c) => c.id === lithClass);
      const lithLabel = lithMeta ? (lang === "id" ? lithMeta.id_label : lithMeta.en) : String(p.lith || (lang === "id" ? "Batuan" : "Rock"));
      const lithDetail = String(p.lith_detail || p.lith || "");
      const color = String(p.color_hex || p.color || lithMeta?.color || "#D9DEE1");
      const age = feat?.source === "orebit"
        ? [p.interval_base, p.interval_top].filter(Boolean).join("–")
        : [p.b_int_name, p.t_int_name].filter(Boolean).join("–");
      const ageBaseMa = Number(p.age_base_ma ?? p.best_b_age ?? 20) || 20;
      let syncElev: number | null = null;
      if (hasTerrain) {
        try {
          syncElev = map.queryTerrainElevation([s.lng, s.lat]);
        } catch {
          syncElev = null;
        }
      }
      sampleHits.push({
        point: s,
        label,
        symbol,
        color,
        lithClass,
        lithLabel,
        lithDetail,
        age,
        ageBaseMa,
        elevM: typeof syncElev === "number" && Number.isFinite(syncElev) ? Math.round(syncElev) : null,
      });
      const last = rawRuns[rawRuns.length - 1];
      if (last && last.label === label && last.symbol === symbol) {
        last.count += 1;
      } else {
        rawRuns.push({ label, symbol, color, lithClass, lithLabel, lithDetail, age, ageBaseMa, count: 1 });
      }
    }

    const totalCount = samplePts.length;
    lastSegments = rawRuns.map((r) => ({
      label: r.label,
      symbol: r.symbol,
      color: r.color,
      lithClass: r.lithClass,
      lithLabel: r.lithLabel,
      lithDetail: r.lithDetail,
      age: r.age,
      ageBaseMa: r.ageBaseMa,
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
            .map((st, idx) => `<span class="transect-struct-badge">F${idx + 1}: ${esc(st.type)} @ ${st.km.toFixed(1)} km</span>`)
            .join("")}</div>`
        : "";
      const listHtml = `<ul class="transect-list">${lastSegments
        .map(
          (seg) => `<li>
          <span class="chip" style="background:${safeColor(seg.color)}"></span>
          <div class="transect-seg-info">
            <span class="transect-seg-name">${esc(seg.label)}${seg.symbol ? ` <code>${esc(seg.symbol)}</code>` : ""}</span>
            <span class="transect-seg-lith">${esc(seg.lithLabel)}${seg.lithDetail ? ` · ${esc(seg.lithDetail)}` : ""}${seg.age ? ` (${esc(seg.age)})` : ""}</span>
          </div>
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
    lastStructures = [];
    lastElevRange = null;
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
    const header = "unit,symbol,lithology_class,lithology_detail,age,distance_km,percent\n";
    const rows = lastSegments
      .map((s) => `"${s.label.replace(/"/g, '""')}","${s.symbol}","${s.lithLabel.replace(/"/g, '""')}","${s.lithDetail.replace(/"/g, '""')}","${s.age}",${s.km},${s.pct}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orebit-geological-section-${new Date().toISOString().slice(0, 10)}.csv`;
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
