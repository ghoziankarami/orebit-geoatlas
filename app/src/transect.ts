// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
import maplibregl from "maplibre-gl";
import { esc, safeColor } from "./detail";
import { getLang, t } from "./i18n";
import { QUERY_LAYERS, styleReady } from "./layers";
import { LITH_CLASSES } from "./lithology";
import type { NationalUnit } from "./search";
import {
  apparentDip,
  buildSectionModel,
  dipTowardFromStrike,
  layoutSection,
  lineAzimuth,
  projectOntoLine,
  type AttitudeOverride,
  type ContactKind,
  type DipToward,
  type MeasuredAttitude,
  type SectionModel,
} from "./section_model";
import { attitudeText, hasAttitude, KIND_COLOR, kindOf, STRUCT_COLOR, type Waypoint } from "./waypoints";

/** Waypoint projected onto the section, ready to draw. */
interface SectionMark {
  frac: number;
  name: string;
  color: string;
  offsetM: number;
  side: "L" | "R";
  att: string;
  appDipDeg: number | null;
  toward: DipToward;
}

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
  /** strike azimuth of the mapped trace at the crossing */
  strikeAz?: number | null;
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
  ageTopMa: number;
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

function inferLithClassFromText(rawText: string, symbol = ""): string {
  const text = `${rawText} ${symbol}`.toLowerCase();
  for (const c of LITH_CLASSES) {
    if (c.keywords.some((kw) => text.includes(kw))) return c.id;
  }
  if (/^(qv|qtv|tqv|tmv|tpv)/i.test(symbol)) return "volcanic";
  if (/^(qa|qal|qh|qs|qak)/i.test(symbol)) return "unconsolidated";
  if (/^(ql|tml|tol)/i.test(symbol)) return "carbonate";
  if (/^(trjkg|trtg|jma|kbd|kbg|jgr)/i.test(symbol)) return "plutonic_felsic";
  return "siliciclastic";
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
  const hits: TransectStructureHit[] = [];
  if (points.length < 2 || totalKm <= 0) return hits;

  try {
    if (styleReady(map)) {
      const lineLayers = ["ob-lines", "ms-lines"].filter((id) => map.getLayer(id));
      if (lineLayers.length) {
        const screenPts = points.map((p) => map.project([p.lng, p.lat]));
        const xs = screenPts.map((p) => p.x);
        const ys = screenPts.map((p) => p.y);
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [Math.min(...xs) - 10, Math.min(...ys) - 10],
          [Math.max(...xs) + 10, Math.max(...ys) + 10],
        ];
        const feats = map.queryRenderedFeatures(bbox, { layers: lineLayers });
        const cumKm: number[] = [0];
        for (let i = 1; i < points.length; i++) cumKm.push(cumKm[i - 1] + haversineKm(points[i - 1], points[i]));

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
          const type =
            rawType === "fault"
              ? "Sesar"
              : rawType === "anticline"
                ? "Antiklin"
                : rawType === "syncline"
                  ? "Sinklin"
                  : rawType === "contact"
                    ? "Kontak Sesar / Formasi"
                    : rawType || "Sesar";

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
                  if (!hits.some((h) => Math.abs(h.frac - frac) < 0.03)) {
                    hits.push({ km: Number(km.toFixed(2)), frac, type, strikeAz: lineAzimuth(cx, cy, dx, dy) });
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // Abaikan bila layer struktur belum selesai dimuat
  }

  // Faults are only those mapped on the layers above; unit changes are classified in section_model.
  return hits.sort((a, b) => a.frac - b.frac).slice(0, 10);
}

const SVG_LITH_PATTERNS = `
  <defs>
    <pattern id="pat-carbonate" width="18" height="12" patternUnits="userSpaceOnUse">
      <path d="M0,6 H18 M0,12 H18 M5,0 V6 M14,0 V6 M9,6 V12" stroke="rgba(18,32,42,0.42)" stroke-width="0.95" fill="none"/>
    </pattern>
    <pattern id="pat-siliciclastic" width="16" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
      <line x1="0" y1="3.5" x2="16" y2="3.5" stroke="rgba(18,32,42,0.4)" stroke-width="0.95" stroke-dasharray="5,2.5"/>
      <line x1="0" y1="8.5" x2="16" y2="8.5" stroke="rgba(18,32,42,0.28)" stroke-width="0.8"/>
      <circle cx="4" cy="6" r="0.9" fill="rgba(18,32,42,0.42)"/>
      <circle cx="11" cy="6.2" r="0.9" fill="rgba(18,32,42,0.42)"/>
    </pattern>
    <pattern id="pat-volcanic" width="14" height="12" patternUnits="userSpaceOnUse">
      <path d="M2,3.5 L4.5,7.5 L7,3.5 M8.5,8 L11,11.5 L13.5,8" stroke="rgba(18,32,42,0.46)" stroke-width="1.05" fill="none"/>
    </pattern>
    <pattern id="pat-plutonic_felsic" width="14" height="14" patternUnits="userSpaceOnUse">
      <path d="M3.5,1.5 V6.5 M1,4 H6 M10.5,7.5 V12.5 M8,10 H13" stroke="rgba(18,32,42,0.48)" stroke-width="1.05" fill="none"/>
    </pattern>
    <pattern id="pat-plutonic_mafic" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M2.5,2.5 L7.5,7.5 M7.5,2.5 L2.5,7.5" stroke="rgba(15,28,35,0.48)" stroke-width="1.05" fill="none"/>
    </pattern>
    <pattern id="pat-metamorphic" width="18" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
      <path d="M0,5 Q4.5,1.2 9,5 T18,5" stroke="rgba(18,32,42,0.46)" stroke-width="1.05" fill="none"/>
    </pattern>
    <pattern id="pat-unconsolidated" width="12" height="9" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.05" fill="rgba(18,32,42,0.42)"/>
      <circle cx="8.5" cy="6.5" r="1.3" fill="rgba(18,32,42,0.34)"/>
      <circle cx="10" cy="2.5" r="0.75" fill="rgba(18,32,42,0.38)"/>
    </pattern>
    <pattern id="pat-melange" width="14" height="12" patternUnits="userSpaceOnUse">
      <polygon points="2,9 5.5,3 8.5,9" fill="none" stroke="rgba(18,32,42,0.45)" stroke-width="0.95"/>
    </pattern>
  </defs>
`;

// Geometri dasar penampang (dipakai juga oleh hover sinkron di controller)
const SEC_W = 820;
const SEC_PAD_L = 48;
const SEC_PAD_R = 18;

function buildSectionSvg(
  samples: readonly SampleHit[],
  model: SectionModel,
  totalKm: number,
  azimuthDeg: number,
  ve = 1,
  marks: readonly SectionMark[] = [],
): string {
  const W = SEC_W;
  const padL = SEC_PAD_L;
  const padR = SEC_PAD_R;
  const padT = 26;
  const padB = 28;
  const H = Math.round(268 + (Math.max(1, ve) - 1) * (268 - padT - padB));
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const lang = getLang();
  const n = Math.max(1, samples.length - 1);

  const elevOf = (i: number) => samples[Math.max(0, Math.min(samples.length - 1, i))]?.elevM ?? 0;
  const validElevs = samples.map((s) => s.elevM).filter((v): v is number => v !== null);
  const hasDem = validElevs.length >= 2;
  const rawMin = hasDem ? Math.min(...validElevs, 0) : 0;
  const rawMax = hasDem ? Math.max(...validElevs, 150) : 150;
  const topoSpan = Math.max(80, rawMax - rawMin);
  const subDepthM = Math.max(250, Math.round(topoSpan * 1.45));
  const yMin = rawMin - subDepthM;
  const yMax = rawMax + topoSpan * 0.22;
  const yToPx = (elev: number) => padT + ((yMax - elev) / (yMax - yMin)) * plotH;
  const xToPx = (idx: number) => padL + (idx / n) * plotW;
  const yBase = H - padB;
  const pxPerM = plotH / (yMax - yMin);
  const pxPerKm = plotW / Math.max(0.001, totalKm);
  const trueVe = (pxPerM * 1000) / pxPerKm; // real vertical exaggeration of the drawing
  const surfaceY = (frac: number) => {
    const f = Math.max(0, Math.min(1, frac)) * n;
    const i0 = Math.floor(f);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const e = elevOf(i0) + (elevOf(i1) - elevOf(i0)) * (f - i0);
    return yToPx(e);
  };

  const layout = layoutSection(model, { padL, plotW, pxPerKm, pxPerM, yTop: padT, yFloor: yBase, surfaceY });
  const surfacePts = samples.map((s, i) => `${xToPx(i).toFixed(1)},${yToPx(s.elevM ?? 0).toFixed(1)}`).join(" ");
  const clipPts = `${surfacePts} ${(W - padR).toFixed(1)},${yBase.toFixed(1)} ${padL.toFixed(1)},${yBase.toFixed(1)}`;
  const pts = (a: Array<[number, number]>) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // Units: polygon between the planes bounding each slot, clipped by the topographic surface.
  const unitSvg: string[] = [];
  const badgeSvg: string[] = [];
  for (const slot of layout.slots) {
    if (slot.left.length < 2) continue;
    const run = model.runs[slot.run];
    if (!run) continue;
    const poly = pts([...slot.left, ...[...slot.right].reverse()]);
    const lithMeta = LITH_CLASSES.find((c) => c.id === run.lithClass);
    const col = safeColor(run.color && run.color !== "#D9DEE1" ? run.color : lithMeta?.color || "#E4B77A");
    unitSvg.push(
      `<polygon points="${poly}" fill="${col}" fill-opacity="0.93"/>`,
      `<polygon points="${poly}" fill="url(#pat-${run.lithClass || "siliciclastic"})"/>`,
    );
    // label where the unit is widest within the upper part of the section
    let best = -1;
    let bestW = 0;
    const lim = Math.floor(slot.left.length * 0.55);
    for (let i = 1; i < lim; i++) {
      const w = slot.right[i][0] - slot.left[i][0];
      const midFrac = ((slot.left[i][0] + slot.right[i][0]) / 2 - padL) / plotW;
      if (w > bestW && slot.left[i][1] > surfaceY(midFrac) + 10) {
        bestW = w;
        best = i;
      }
    }
    if (best >= 0 && bestW >= 30) {
      const cx = (slot.left[best][0] + slot.right[best][0]) / 2;
      const cy = slot.left[best][1];
      const tag = (run.symbol || run.label.slice(0, 6)).trim();
      const short = run.label.replace(/^(Formasi|Kompleks|Batuan|Endapan)\s+/i, "").slice(0, 16);
      const full = bestW >= 84 && run.symbol ? `${tag} · ${short}` : tag;
      const bw = Math.min(bestW - 6, Math.max(26, full.length * 5.7 + 12));
      badgeSvg.push(
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(cy - 8).toFixed(1)}" width="${bw.toFixed(1)}" height="16" rx="4" fill="rgba(255,255,255,0.92)" stroke="rgba(31,43,51,0.65)" stroke-width="0.9"/>`,
        `<text x="${cx.toFixed(1)}" y="${(cy + 3.2).toFixed(1)}" text-anchor="middle" font-size="9.2" font-weight="700" fill="#1F2B33">${esc(full)}</text>`,
      );
    }
  }

  // Contacts and structures drawn as the planes that were projected to depth.
  let faultNo = 0;
  const lineSvg: string[] = [];
  for (const lb of layout.boundaries) {
    const b = model.boundaries[lb.index];
    if (lb.path.length < 2) continue;
    const path = pts(lb.path);
    const surfX = lb.path[0][0];
    let stroke = "rgba(31,43,51,0.72)";
    let width = 1.2;
    let dash = b.assumed ? "2,3" : "";
    let tag = "";
    if (b.kind === "fault") {
      stroke = "#DC2626"; width = 2.3; dash = "7,2.5"; tag = `F${++faultNo}`;
    } else if (b.kind === "intrusive") {
      stroke = "#7F1D1D"; width = 1.9; dash = ""; tag = "I";
    } else if (b.kind === "unconformity") {
      stroke = "#1F2B33"; width = 1.5; dash = "9,3,2,3"; tag = "U";
    }
    if (b.kind === "fault") lineSvg.push(`<polyline points="${path}" fill="none" stroke="#FFFFFF" stroke-width="4.2" stroke-opacity="0.75"/>`);
    lineSvg.push(`<polyline points="${path}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
    const sy = surfaceY(b.fracX);
    if (tag) {
      const ly = Math.max(13, sy - 7);
      lineSvg.push(
        `<rect x="${(surfX - 11).toFixed(1)}" y="${(ly - 9).toFixed(1)}" width="22" height="12" rx="3" fill="${stroke}"/>`,
        `<text x="${surfX.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#FFFFFF">${tag}</text>`,
      );
    }
    // dip annotation halfway down the plane (true dip; * = assumed default, not measured)
    if (b.kind !== "conformable" || !b.assumed) {
      const mid = lb.path[Math.floor(lb.path.length * 0.55)];
      lineSvg.push(
        `<text x="${(mid[0] + 4).toFixed(1)}" y="${mid[1].toFixed(1)}" font-size="8.4" font-weight="700" fill="#111827" stroke="#FFFFFF" stroke-width="2.4" paint-order="stroke">${Math.round(b.trueDipDeg)}°${b.assumed ? "*" : ""}</text>`,
      );
    }
  }

  // Waypoint lapangan: pin + nama di atas permukaan; struktur terukur diberi garis dip semu ke bawah.
  const markSvg: string[] = [];
  const sorted = [...marks].sort((a, b) => a.frac - b.frac);
  let lastX = -1e9;
  let tier = 0;
  for (const m of sorted) {
    const x = padL + Math.max(0, Math.min(1, m.frac)) * plotW;
    const y = surfaceY(m.frac);
    tier = x - lastX < 54 ? (tier + 1) % 3 : 0;
    lastX = x;
    const pinY = Math.max(padT + 4, y - 16 - tier * 13);
    if (m.appDipDeg !== null) {
      const dir = m.toward === "B" ? 1 : -1;
      const L = 30;
      let dx = 0;
      let dy = 1;
      if (m.appDipDeg < 89.5) {
        const k = (dir * (1 / Math.tan((m.appDipDeg * Math.PI) / 180)) * (pxPerKm / 1000)) / pxPerM;
        const norm = Math.hypot(k, 1);
        dx = k / norm;
        dy = 1 / norm;
      }
      markSvg.push(
        `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + dx * L).toFixed(1)}" y2="${(y + dy * L).toFixed(1)}" stroke="#FFFFFF" stroke-width="4.4" stroke-linecap="round"/>`,
        `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + dx * L).toFixed(1)}" y2="${(y + dy * L).toFixed(1)}" stroke="${m.color}" stroke-width="2.2" stroke-linecap="round"/>`,
        `<text x="${(x + dx * L + (dir > 0 ? 3 : -3)).toFixed(1)}" y="${(y + dy * L + 3).toFixed(1)}" text-anchor="${dir > 0 ? "start" : "end"}" font-size="8.2" font-weight="700" fill="${m.color}" stroke="#FFFFFF" stroke-width="2.2" paint-order="stroke">${Math.round(m.appDipDeg)}°</text>`,
      );
    }
    markSvg.push(
      `<line x1="${x.toFixed(1)}" y1="${pinY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${m.color}" stroke-width="1.2"/>`,
      `<circle cx="${x.toFixed(1)}" cy="${pinY.toFixed(1)}" r="4.2" fill="${m.color}" stroke="#FFFFFF" stroke-width="1.6"/>`,
      `<text x="${(x + 6).toFixed(1)}" y="${(pinY + 3).toFixed(1)}" font-size="8.6" font-weight="800" fill="#1F2B33" stroke="#FFFFFF" stroke-width="2.6" paint-order="stroke">${esc(m.name)}${m.att ? ` ${esc(m.att)}` : ""}</text>`,
    );
  }

  const seaLineY = yToPx(0);
  const seaLine =
    seaLineY >= padT + 6 && seaLineY <= yBase - 6
      ? `<line x1="${padL}" y1="${seaLineY.toFixed(1)}" x2="${W - padR}" y2="${seaLineY.toFixed(1)}" stroke="#0284C7" stroke-width="1.1" stroke-dasharray="4,3"/>
         <text x="${W - padR - 4}" y="${(seaLineY - 3).toFixed(1)}" text-anchor="end" font-size="8.5" font-weight="600" fill="#0284C7">0 m (MSL)</text>`
      : "";

  const maxLabel = `${Math.round(rawMax)} m`;
  const midLabel = `${Math.round((rawMax + yMin) / 2)} m`;
  const minLabel = `${Math.round(yMin)} m`;
  const azCard = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor(((azimuthDeg + 22.5) % 360) / 45)];
  const inferred = lang === "en" ? "inferred at depth" : "interpretasi di kedalaman";
  const veTxt = `VE ≈ ${trueVe >= 10 ? trueVe.toFixed(0) : trueVe.toFixed(1)}×`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Geological Cross-Section A to A' (${veTxt})" data-ve="${ve}">
    ${SVG_LITH_PATTERNS}
    <defs>
      <clipPath id="secTopo"><polygon points="${clipPts}"/></clipPath>
      <linearGradient id="secFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.5"/></linearGradient>
    </defs>
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#F8FAFC" stroke="rgba(31,43,51,0.24)" stroke-width="1"/>
    <g clip-path="url(#secTopo)">
      ${unitSvg.join("")}
      ${lineSvg.join("")}
      <rect x="${padL}" y="${(yBase - plotH * 0.5).toFixed(1)}" width="${plotW}" height="${(plotH * 0.5).toFixed(1)}" fill="url(#secFade)"/>
    </g>
    ${seaLine}
    <polyline points="${surfacePts}" fill="none" stroke="#0F172A" stroke-width="2.3" stroke-linejoin="round"/>
    ${badgeSvg.join("")}
    ${markSvg.join("")}
    <text x="${(W - padR - 6).toFixed(1)}" y="${(yBase - 8).toFixed(1)}" text-anchor="end" font-size="8.5" font-style="italic" fill="#374151">${esc(inferred)}</text>
    <line id="secCursor" x1="${padL}" y1="${padT}" x2="${padL}" y2="${yBase}" stroke="#0F172A" stroke-width="1" stroke-dasharray="2,2" visibility="hidden" pointer-events="none"/>
    <text x="${padL + 6}" y="${padT - 8}" font-size="10" font-weight="800" fill="#0F172A">A</text>
    <text x="${(W / 2).toFixed(1)}" y="${padT - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#374151">${esc(veTxt)}</text>
    <text x="${W - padR - 6}" y="${padT - 8}" text-anchor="end" font-size="10" font-weight="800" fill="#0F172A">A' (${azimuthDeg.toFixed(0)}° ${azCard})</text>
    <text x="${padL - 5}" y="${padT + 8}" text-anchor="end" font-size="8.8" font-weight="600" fill="#374151">${maxLabel}</text>
    <text x="${padL - 5}" y="${(padT + plotH / 2 + 3).toFixed(1)}" text-anchor="end" font-size="8.5" fill="#6B7280">${midLabel}</text>
    <text x="${padL - 5}" y="${yBase - 2}" text-anchor="end" font-size="8.8" font-weight="600" fill="#374151">${minLabel}</text>
    <text x="${padL}" y="${H - 7}" text-anchor="start" font-size="9" font-weight="700" fill="#1F2937">0 km</text>
    <text x="${padL + plotW * 0.25}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="#4B5563">${(totalKm * 0.25).toFixed(1)} km</text>
    <text x="${padL + plotW * 0.5}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="#4B5563">${(totalKm * 0.5).toFixed(1)} km</text>
    <text x="${padL + plotW * 0.75}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="#4B5563">${(totalKm * 0.75).toFixed(1)} km</text>
    <text x="${W - padR}" y="${H - 7}" text-anchor="end" font-size="9" font-weight="700" fill="#1F2937">${totalKm.toFixed(1)} km</text>
  </svg>`;
}


const SECTION_TXT = {
  id: {
    attTitle: "Struktur & kemiringan (strike/dip)",
    attNote: "Kontak dan sesar diproyeksikan ke kedalaman dengan kemiringan semu (tan δ_semu = tan δ · |sin β|). Isi dip (°) bila Anda punya pengukuran; tanda * berarti nilai asumsi, bukan pengukuran. Sesar hanya dari garis yang terpeta di peta, bukan ditebak dari perbedaan umur.",
    kind: "Jenis", dip: "Dip °", toward: "Miring ke", strike: "Strike °", auto: "otomatis",
    hiatus: "hiatus", mapped: "terpeta",
    kinds: { fault: "Sesar", intrusive: "Kontak intrusi", unconformity: "Ketidakselarasan", conformable: "Kontak selaras" },
    lgd: "Legenda kontak",
  },
  en: {
    attTitle: "Structures & attitude (strike/dip)",
    attNote: "Contacts and faults are projected to depth with their apparent dip (tan δ_app = tan δ · |sin β|). Enter a dip (°) if you have a measurement; * marks an assumed value, not a measurement. Faults come only from lines mapped on the map, never inferred from an age difference.",
    kind: "Type", dip: "Dip °", toward: "Dips toward", strike: "Strike °", auto: "auto",
    hiatus: "hiatus", mapped: "mapped",
    kinds: { fault: "Fault", intrusive: "Intrusive contact", unconformity: "Unconformity", conformable: "Conformable contact" },
    lgd: "Contact legend",
  },
} as const;

const SOURCE_ID = "transect-src";
const LINE_LAYER = "transect-line";
const PT_LAYER = "transect-pts";
const HOVER_SOURCE = "transect-hover-src";
const HOVER_LAYER = "transect-hover";

export function createTransectController(
  map: maplibregl.Map,
  onActiveChange: (active: boolean) => void,
  getNationalUnits?: () => NationalUnit[],
  onPointsChange?: (points: TransectPoint[]) => void,
  gpsHooks?: {
    getFix: () => TransectPoint | null;
    ensureOn: () => void;
    toast: (msg: string) => void;
    getWaypoints?: () => readonly Waypoint[];
  },
) {
  let active = false;
  let points: TransectPoint[] = [];
  let lastSegments: TransectSegment[] = [];
  let lastStructures: TransectStructureHit[] = [];
  let lastElevRange: [number, number] | null = null;
  let overrides: Record<string, AttitudeOverride> = {};
  let renderSeq = 0;

  const panel = document.getElementById("transectPanel")!;
  const body = document.getElementById("transectBody")!;
  const btn = document.getElementById("transectBtn") as HTMLButtonElement;
  const clearBtn = document.getElementById("transectClear") as HTMLButtonElement;
  const exportBtn = document.getElementById("transectExport") as HTMLButtonElement;
  const closeBtn = document.getElementById("transectClose") as HTMLButtonElement;
  const veSelect = document.getElementById("transectVe") as HTMLSelectElement | null;
  const bufSelect = document.getElementById("transectWpBuf") as HTMLSelectElement | null;
  const svgExportBtn = document.getElementById("transectExportSvg") as HTMLButtonElement | null;
  let redrawSection: (() => void) | null = null;

  // Tampilkan titik hover penampang di peta (kosong = sembunyikan)
  const setHoverPoint = (p: TransectPoint | null) => {
    try {
      if (!styleReady(map)) return;
      ensureLayers();
      const features = p
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] } }]
        : [];
      (map.getSource(HOVER_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    } catch {
      /* gaya peta belum siap; hover bersifat opsional */
    }
  };

  // Kursor vertikal di SVG penampang mengikuti posisi sampel; marker di peta ikut berpindah
  const bindSectionHover = (hits: readonly SampleHit[]) => {
    const svgEl = body.querySelector<SVGSVGElement>(".transect-section svg");
    if (!svgEl || hits.length < 2) return;
    const cursor = svgEl.querySelector<SVGLineElement>("#secCursor");
    const plotW = SEC_W - SEC_PAD_L - SEC_PAD_R;
    svgEl.addEventListener("pointermove", (ev) => {
      const r = svgEl.getBoundingClientRect();
      const vx = ((ev.clientX - r.left) / r.width) * SEC_W;
      const frac = Math.min(1, Math.max(0, (vx - SEC_PAD_L) / plotW));
      const idx = Math.round(frac * (hits.length - 1));
      const x = (SEC_PAD_L + (idx / (hits.length - 1)) * plotW).toFixed(1);
      cursor?.setAttribute("x1", x);
      cursor?.setAttribute("x2", x);
      cursor?.setAttribute("visibility", "visible");
      setHoverPoint(hits[idx]?.point ?? null);
    });
    svgEl.addEventListener("pointerleave", () => {
      cursor?.setAttribute("visibility", "hidden");
      setHoverPoint(null);
    });
  };

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
        paint: { "line-color": "#D9381E", "line-width": 3.2, "line-dasharray": [2, 1.2] },
      });
    }
    if (!map.getSource(HOVER_SOURCE)) {
      map.addSource(HOVER_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer(HOVER_LAYER)) {
      map.addLayer({
        id: HOVER_LAYER,
        type: "circle",
        source: HOVER_SOURCE,
        paint: { "circle-radius": 7, "circle-color": "#0F172A", "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 },
      });
    }
    if (!map.getLayer(PT_LAYER)) {
      map.addLayer({
        id: PT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5.5,
          "circle-color": "#FFFFFF",
          "circle-stroke-color": "#D9381E",
          "circle-stroke-width": 2.5,
        },
      });
    }
  };

  const syncGeojson = () => {
    try {
      if (!styleReady(map)) return;
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
      // Style masih dimuat
    }
  };

  const resolveSampleUnit = (
    s: TransectPoint,
    layers: string[],
    natUnits: NationalUnit[],
    lang: "id" | "en",
  ): Omit<SampleHit, "point" | "elevM"> => {
    const pt = map.project([s.lng, s.lat]);
    let feat: maplibregl.MapGeoJSONFeature | undefined;
    try {
      feat = layers.length
        ? map.queryRenderedFeatures(
            [
              [pt.x - 6, pt.y - 6],
              [pt.x + 6, pt.y + 6],
            ],
            { layers },
          )[0]
        : undefined;
    } catch {
      feat = undefined;
    }

    if (feat) {
      const p = (feat.properties ?? {}) as Record<string, unknown>;
      const label = String(p.formation || p.strat_name || p.name_orig || p.name || "").trim();
      const symbol = String(p.symbol || "").trim();
      if (label || symbol) {
        const rawLith = String(p.lith_class || "");
        const lithClass = LITH_CLASSES.some((c) => c.id === rawLith)
          ? rawLith
          : inferLithClassFromText(String(p.lith || p.lith_detail || p.descrip || label), symbol);
        const lithMeta = LITH_CLASSES.find((c) => c.id === lithClass);
        const lithLabel = lithMeta ? (lang === "id" ? lithMeta.id_label : lithMeta.en) : String(p.lith || (lang === "id" ? "Batuan" : "Rock"));
        const lithDetail = String(p.lith_detail || p.lith || "");
        const color = String(p.color_hex || p.color || lithMeta?.color || "#E4B77A");
        const age =
          feat.source === "orebit"
            ? [p.interval_base, p.interval_top].filter(Boolean).join("–")
            : [p.b_int_name, p.t_int_name].filter(Boolean).join("–");
        const ageBaseMa = Number(p.age_base_ma ?? p.best_b_age ?? 25) || 25;
        const ageTopMa = Number(p.age_top_ma ?? p.best_t_age ?? 0) || 0;
        return {
          label: label || symbol,
          symbol,
          color,
          lithClass,
          lithLabel,
          lithDetail,
          age,
          ageBaseMa,
          ageTopMa,
        };
      }
    }

    // Fallback: cari unit katalog nasional dengan bbox terkecil yang mencakup titik (s.lng, s.lat)
    let bestUnit: NationalUnit | null = null;
    let bestArea = Infinity;
    for (const u of natUnits) {
      const [w, south, e, n] = u.bbox;
      if (s.lng >= w && s.lng <= e && s.lat >= south && s.lat <= n) {
        const bboxArea = (e - w) * (n - south);
        if (bboxArea < bestArea) {
          bestArea = bboxArea;
          bestUnit = u;
        }
      }
    }
    if (bestUnit) {
      const lithClass = LITH_CLASSES.some((c) => c.id === bestUnit!.lith_class)
        ? bestUnit.lith_class
        : inferLithClassFromText(bestUnit.formation, bestUnit.symbol);
      const lithMeta = LITH_CLASSES.find((c) => c.id === lithClass);
      const lithLabel = lithMeta ? (lang === "id" ? lithMeta.id_label : lithMeta.en) : lithClass;
      return {
        label: bestUnit.formation || bestUnit.symbol,
        symbol: bestUnit.symbol,
        color: bestUnit.color_hex || lithMeta?.color || "#E4B77A",
        lithClass,
        lithLabel,
        lithDetail: bestUnit.lith_detail || "",
        age: [bestUnit.interval_base, bestUnit.interval_top].filter(Boolean).join("–"),
        ageBaseMa: Number(bestUnit.age_base_ma ?? 25) || 25,
        ageTopMa: Number(bestUnit.age_top_ma ?? 0) || 0,
      };
    }

    return {
      label: lang === "id" ? "Laut / Lepas Pantai" : "Sea / Offshore",
      symbol: "Sea",
      color: "#BAE6FD",
      lithClass: "unconsolidated",
      lithLabel: lang === "id" ? "Perairan / Endapan Laut" : "Marine / Unconsolidated",
      lithDetail: "",
      age: "Holosen",
      ageBaseMa: 0.01,
      ageTopMa: 0,
    };
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
      if (styleReady(map)) {
        layers = QUERY_LAYERS.filter((id) => Boolean(map.getLayer(id)));
        hasTerrain = Boolean(map.getTerrain());
      }
    } catch {
      layers = [];
    }
    const natUnits = getNationalUnits ? getNationalUnits() : [];
    const samplePts = samplePointsAlongLine(points, 120);
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
      const resolved = resolveSampleUnit(s, layers, natUnits, lang);
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
        ...resolved,
        elevM: typeof syncElev === "number" && Number.isFinite(syncElev) ? Math.round(syncElev) : null,
      });
      const last = rawRuns[rawRuns.length - 1];
      if (last && last.label === resolved.label && last.symbol === resolved.symbol) {
        last.count += 1;
      } else {
        rawRuns.push({ ...resolved, count: 1 });
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
      const ve = Math.max(1, Number(veSelect?.value) || 1);
      // Waypoint dalam jarak buffer diproyeksikan ke garis; struktur terukur ikut membentuk model.
      const bufM = Math.max(50, Number(bufSelect?.value) || 500);
      const marks: SectionMark[] = [];
      const measured: MeasuredAttitude[] = [];
      for (const w of gpsHooks?.getWaypoints?.() ?? []) {
        const pr = projectOntoLine(points, w);
        if (pr.offsetM > bufM || pr.totalKm <= 0) continue;
        const frac = pr.alongKm / pr.totalKm;
        const att = hasAttitude(w);
        const st = w.structType ?? "bedding";
        marks.push({
          frac,
          name: w.name,
          color: att ? STRUCT_COLOR[st] : KIND_COLOR[kindOf(w)],
          offsetM: pr.offsetM,
          side: pr.side,
          att: attitudeText(w),
          appDipDeg: att ? apparentDip(Number(w.dip), Number(w.strike), azimuthDeg) : null,
          toward: att ? dipTowardFromStrike(Number(w.strike), azimuthDeg) : "B",
        });
        if (att && st !== "joint") measured.push({ frac, strikeAz: Number(w.strike), dipDeg: Number(w.dip), target: st === "fault" ? "fault" : "contact", name: w.name });
      }
      const model = buildSectionModel(sampleHits, lastStructures, azimuthDeg, overrides, measured, Math.min(0.15, Math.max(0.02, 0.5 / Math.max(0.01, totalKm))));
      const X = SECTION_TXT[lang];
      const sectionHtml = `<div class="transect-section">${buildSectionSvg(sampleHits, model, totalKm, azimuthDeg, ve, marks)}</div>`;
      let fNo = 0;
      const tagOf = (k: ContactKind) => (k === "fault" ? `F${++fNo}` : k === "intrusive" ? "I" : k === "unconformity" ? "U" : "C");
      const kindOpts = (cur: ContactKind) =>
        (Object.keys(X.kinds) as ContactKind[]).map((k) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(X.kinds[k])}</option>`).join("");
      const rowsHtml = model.boundaries
        .map((b) => {
          const ov = overrides[b.id] ?? {};
          return `<div class="att-row" data-id="${b.id}">
            <span class="att-name"><b>${tagOf(b.kind)}</b> ${esc(b.between[0])}${b.between[1] !== b.between[0] ? ` | ${esc(b.between[1])}` : ""}<small>${(b.fracX * totalKm).toFixed(1)} km${b.hiatusMa ? ` · ${X.hiatus} ${b.hiatusMa} Ma` : ""}${b.mapped ? ` · ${X.mapped}` : ""}${b.source ? ` · ${esc(b.source)} (${esc(t("transectMeasured"))})` : ""}</small></span>
            <label>${X.kind}<select data-att="kind">${kindOpts(b.kind)}</select></label>
            <label>${X.dip}<input type="number" inputmode="numeric" min="1" max="90" step="1" data-att="dip" value="${typeof ov.dipDeg === "number" ? ov.dipDeg : ""}" placeholder="${b.trueDipDeg}*"></label>
            <label>${X.toward}<select data-att="toward"><option value="A"${b.toward === "A" ? " selected" : ""}>A</option><option value="B"${b.toward === "B" ? " selected" : ""}>A'</option></select></label>
            <label>${X.strike}<input type="number" inputmode="numeric" min="0" max="360" step="1" data-att="strike" value="${typeof ov.strikeAz === "number" ? ov.strikeAz : ""}" placeholder="${b.strikeAz === null ? X.auto : Math.round(b.strikeAz)}"></label>
          </div>`;
        })
        .join("");
      const structHtml = model.boundaries.length
        ? `<details class="transect-att"${window.matchMedia("(max-width: 760px)").matches ? "" : " open"}><summary>${esc(X.attTitle)}</summary><p class="muted">${esc(X.attNote)}</p>${rowsHtml}</details>`
        : "";
      const markHtml = `<details class="transect-att transect-wp"${marks.length ? " open" : ""}><summary>${esc(t("transectWpTitle"))} (${marks.length})</summary>${
        marks.length
          ? `<ul class="transect-wp-list">${[...marks]
              .sort((a, b) => a.frac - b.frac)
              .map((m) => `<li><i class="wp-dot" style="background:${m.color}"></i><strong>${esc(m.name)}</strong><span>${(m.frac * totalKm).toFixed(2)} km · ${Math.round(m.offsetM)} m ${m.side === "L" ? "kiri/left" : "kanan/right"}${m.att ? ` · ${esc(m.att)}${m.appDipDeg !== null ? ` → ${Math.round(m.appDipDeg)}° (${m.toward === "B" ? "A'" : "A"})` : ""}` : ""}</span></li>`)
              .join("")}</ul>`
          : `<p class="muted">${esc(t("transectWpNone"))}</p>`
      }</details>`;
      const legendHtml = `<div class="transect-legend" aria-label="${esc(X.lgd)}">${(["fault", "intrusive", "unconformity", "conformable"] as ContactKind[])
        .map((k) => {
          const st = k === "fault" ? 'stroke="#DC2626" stroke-width="2.3" stroke-dasharray="7,2.5"' : k === "intrusive" ? 'stroke="#7F1D1D" stroke-width="1.9"' : k === "unconformity" ? 'stroke="#1F2B33" stroke-width="1.5" stroke-dasharray="9,3,2,3"' : 'stroke="#334155" stroke-width="1.2"';
          return `<span><svg width="30" height="8" aria-hidden="true"><line x1="0" y1="4" x2="30" y2="4" ${st}/></svg>${esc(X.kinds[k])}</span>`;
        })
        .join("")}</div>`;
      const listHtml = `<ul class="transect-list">${lastSegments
        .map(
          (seg) => `<li>
          <span class="chip" style="background:${safeColor(seg.color)}"></span>
          <div class="transect-seg-info">
            <span class="transect-seg-name">${esc(seg.label)}${seg.symbol ? ` <code>${esc(seg.symbol)}</code>` : ""}</span>
            <span class="transect-seg-lith">${esc(seg.lithLabel)}${seg.lithDetail ? ` — ${esc(seg.lithDetail)}` : ""}${seg.age ? ` · ${esc(seg.age)}` : ""}</span>
          </div>
          <span class="transect-seg-meta">${seg.km.toFixed(1)} km (${seg.pct}%)</span>
        </li>`,
        )
        .join("")}</ul>`;

      body.innerHTML = `
        <div class="transect-metrics">
          <div><span>${esc(t("transectDistance"))} (A–A')</span><strong>${totalKm.toFixed(2)} km</strong></div>
          <div><span>${esc(t("transectAzimuth"))}</span><strong>${azimuthDeg.toFixed(0)}°</strong></div>
          <div><span>${esc(t("transectElevation"))}</span><strong>${esc(elevStr)}</strong></div>
        </div>
        ${sectionHtml}
        ${legendHtml}
        ${markHtml}
        ${structHtml}
        ${listHtml}
      `;
      bindSectionHover(sampleHits);
      body.querySelectorAll<HTMLElement>(".att-row").forEach((row) => {
        const id = row.dataset.id ?? "";
        row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-att]").forEach((el) => {
          el.addEventListener("change", () => {
            const cur: AttitudeOverride = { ...(overrides[id] ?? {}) };
            const key = el.dataset.att;
            const num = el.value === "" ? undefined : Number(el.value);
            if (key === "kind") cur.kind = el.value as ContactKind;
            else if (key === "toward") cur.toward = el.value as "A" | "B";
            else if (key === "dip") cur.dipDeg = num === undefined || !Number.isFinite(num) ? undefined : num;
            else if (key === "strike") cur.strikeAz = num === undefined || !Number.isFinite(num) ? null : ((num % 360) + 360) % 360;
            overrides = { ...overrides, [id]: cur };
            drawHtml();
          });
        });
      });
    };
    redrawSection = drawHtml;

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

  const drawBar = document.getElementById("drawBar")!;
  const drawTitle = document.getElementById("drawTitle")!;
  const drawMeta = document.getElementById("drawMeta")!;
  const drawUndo = document.getElementById("drawUndo") as HTMLButtonElement;
  const drawGps = document.getElementById("drawGps") as HTMLButtonElement;
  const drawDone = document.getElementById("drawDone") as HTMLButtonElement;
  const drawCancel = document.getElementById("drawCancel") as HTMLButtonElement;
  const editBtn = document.getElementById("transectEdit") as HTMLButtonElement;

  // Mode gambar: hanya bar ringkas yang tampil agar peta bebas diketuk; panel penampang muncul setelah "Selesai".
  const syncDrawBar = () => {
    drawBar.hidden = !active;
    if (!active) return;
    const n = points.length;
    drawTitle.textContent = t(n === 0 ? "transectDrawStart" : n === 1 ? "transectDrawNext" : "transectDrawMore");
    if (n >= 2) {
      const { totalKm, azimuthDeg } = computeTransectStats(points);
      drawMeta.textContent = `${n} ${t("transectPts")} · ${totalKm.toFixed(2)} km · ${azimuthDeg.toFixed(0)}°`;
    } else drawMeta.textContent = n ? `1 ${t("transectPts")}` : "";
    drawUndo.disabled = n === 0;
    document.getElementById("drawGpsLabel")!.textContent = t("transectGpsPoint");
    drawGps.classList.toggle("is-live", Boolean(gpsHooks?.getFix()));
    drawGps.hidden = !gpsHooks;
    drawDone.disabled = n < 2;
  };

  const setActive = (next: boolean) => {
    active = next;
    btn.setAttribute("aria-pressed", String(active));
    map.getCanvas().style.cursor = active ? "crosshair" : "";
    if (active) panel.hidden = true;
    onActiveChange(active);
    syncDrawBar();
  };

  // Paskan lintasan ke area peta yang tidak tertutup panel.
  const fitToLine = () => {
    if (points.length < 2) return;
    const b = new maplibregl.LngLatBounds();
    points.forEach((p) => b.extend([p.lng, p.lat]));
    const H = window.innerHeight;
    const pr = panel.getBoundingClientRect();
    const ctrl = document.getElementById("mapControls")?.getBoundingClientRect();
    const side = document.getElementById("panel")?.getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    let top = (ctrl ? ctrl.bottom : 60) + 24;
    let bottom = panel.hidden ? 40 : H - pr.top + 24;
    const left = !mobile && side ? side.right + 32 : 32;
    if (top + bottom > H - 60) {
      const k = (H - 60) / (top + bottom);
      top *= k;
      bottom *= k;
    }
    try {
      map.fitBounds(b, { padding: { top, bottom, left, right: 32 }, maxZoom: 13, duration: 700 });
    } catch {
      /* padding melebihi kanvas; abaikan */
    }
  };

  const finish = () => {
    if (points.length < 2) return;
    setActive(false);
    panel.hidden = false;
    renderPanel();
    panel.scrollTop = 0;
    requestAnimationFrame(fitToLine);
  };

  const clear = () => {
    setHoverPoint(null);
    points = [];
    lastSegments = [];
    lastStructures = [];
    overrides = {};
    lastElevRange = null;
    onPointsChange?.([]);
    syncGeojson();
    syncDrawBar();
  };

  btn.addEventListener("click", () => {
    // Lintasan tersimpan/tersembunyi (mis. setelah membuka detail unit): buka lagi penampangnya, jangan dihapus.
    if (!active && panel.hidden && points.length >= 2) return finish();
    if (active) {
      if (points.length >= 2) finish();
      else {
        setActive(false);
        clear();
      }
    } else if (!panel.hidden) {
      panel.hidden = true;
      clear();
    } else {
      clear();
      setActive(true);
    }
  });
  drawGps.addEventListener("click", () => {
    const fix = gpsHooks?.getFix();
    if (!fix) {
      gpsHooks?.ensureOn();
      gpsHooks?.toast(t("transectGpsWait"));
      return;
    }
    points.push({ lng: fix.lng, lat: fix.lat });
    onPointsChange?.(points.slice());
    syncGeojson();
    syncDrawBar();
  });
  drawUndo.addEventListener("click", () => {
    points.pop();
    onPointsChange?.(points.slice());
    syncGeojson();
    syncDrawBar();
  });
  drawDone.addEventListener("click", finish);
  drawCancel.addEventListener("click", () => {
    setActive(false);
    clear();
  });
  editBtn.addEventListener("click", () => setActive(true));
  clearBtn.addEventListener("click", () => {
    clear();
    setActive(true);
  });
  closeBtn.addEventListener("click", () => {
    panel.hidden = true;
    clear();
  });

  veSelect?.addEventListener("change", () => redrawSection?.());
  bufSelect?.addEventListener("change", () => redrawSection?.());

  const download = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orebit-geological-section-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const sectionXml = (): string | null => {
    const svgEl = body.querySelector(".transect-section svg");
    if (!svgEl) return null;
    const xml = new XMLSerializer().serializeToString(svgEl);
    return xml.includes("xmlns=") ? xml : xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  };

  svgExportBtn?.addEventListener("click", () => {
    const xml = sectionXml();
    if (xml) download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: "image/svg+xml;charset=utf-8" }), "svg");
  });

  // PNG siap laporan: judul, jarak/azimuth, koordinat A & A', penampang 2×, dan atribusi.
  exportBtn.addEventListener("click", async () => {
    const xml = sectionXml();
    const svgEl = body.querySelector<SVGSVGElement>(".transect-section svg");
    if (!xml || !svgEl || points.length < 2) return;
    exportBtn.disabled = true;
    try {
      const img = new Image();
      // Gambar data-URL tidak memuat webfont; paksa sans sistem agar tidak jatuh ke serif.
      const sansXml = xml.replace("<svg", '<svg font-family="Helvetica, Arial, sans-serif"');
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sansXml)}`;
      await img.decode();
      const vb = svgEl.viewBox.baseVal;
      const k = 2;
      const pad = 24;
      const headH = 64;
      const footH = 64;
      const w = vb.width * k + pad * 2;
      const h = vb.height * k + headH + footH + pad;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      const { totalKm, azimuthDeg } = computeTransectStats(points);
      const a = points[0];
      const b = points[points.length - 1];
      const fmt = (p: TransectPoint) => `${p.lat.toFixed(5)}°, ${p.lng.toFixed(5)}°`;
      ctx.fillStyle = "#1F2B33";
      ctx.font = "700 26px Instrument Sans, system-ui, sans-serif";
      ctx.fillText(t("transectTitle"), pad, pad + 14);
      ctx.fillStyle = "#56656E";
      ctx.font = "500 17px Instrument Sans, system-ui, sans-serif";
      ctx.fillText(`A ${fmt(a)}  →  A' ${fmt(b)}  ·  ${totalKm.toFixed(2)} km  ·  ${azimuthDeg.toFixed(0)}°  ·  ${new Date().toISOString().slice(0, 10)}`, pad, pad + 44);
      ctx.drawImage(img, pad, headH + 8, vb.width * k, vb.height * k);
      // Legenda kontak, sama dengan legenda di panel.
      const X = SECTION_TXT[getLang()];
      const kinds: [ContactKind, string, number, number[]][] = [
        ["fault", "#DC2626", 4.6, [14, 5]],
        ["intrusive", "#7F1D1D", 3.8, []],
        ["unconformity", "#1F2B33", 3, [18, 6, 4, 6]],
        ["conformable", "#334155", 2.4, []],
      ];
      let lx = pad;
      const ly = h - footH + 8;
      ctx.font = "500 15px Instrument Sans, system-ui, sans-serif";
      kinds.forEach(([kind, color, lw, dash]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 44, ly);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#41535C";
        ctx.fillText(X.kinds[kind], lx + 52, ly + 5);
        lx += 52 + ctx.measureText(X.kinds[kind]).width + 28;
      });
      ctx.fillStyle = "#64747C";
      ctx.font = "400 14px Instrument Sans, system-ui, sans-serif";
      ctx.fillText("Orebit GeoAtlas · Geologi: Pusat Survei Geologi (ESDM), Macrostrat (CC BY 4.0) · Penampang interpretatif, bukan peta resmi", pad, h - 12);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (blob) download(blob, "png");
    } finally {
      exportBtn.disabled = false;
    }
  });

  return {
    isActive: () => active,
    setActive,
    hide: () => {
      active = false;
      btn.setAttribute("aria-pressed", "false");
      map.getCanvas().style.cursor = "";
      panel.hidden = true;
      syncDrawBar();
    },
    addPoint: (lng: number, lat: number) => {
      if (!active) return false;
      points.push({ lng, lat });
      onPointsChange?.(points.slice());
      syncGeojson();
      syncDrawBar();
      return true;
    },
    setPoints: (pts: readonly TransectPoint[]) => {
      points = pts.filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat)).map((p) => ({ lng: p.lng, lat: p.lat }));
      syncGeojson();
    },
    /** Dipanggil saat status GPS berubah agar tombol "Posisi saya" ikut menyala. */
    syncGps: () => syncDrawBar(),
    refresh: () => {
      syncGeojson();
      syncDrawBar();
      if (points.length >= 2 && !panel.hidden) renderPanel();
    },
    clear,
  };
}
