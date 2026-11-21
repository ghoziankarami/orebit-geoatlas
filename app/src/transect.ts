import type maplibregl from "maplibre-gl";
import { esc, safeColor } from "./detail";
import { getLang, t } from "./i18n";
import { QUERY_LAYERS } from "./layers";
import { LITH_CLASSES } from "./lithology";
import type { NationalUnit } from "./search";

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
  samples: readonly SampleHit[],
  totalKm: number,
): TransectStructureHit[] {
  const hits: TransectStructureHit[] = [];
  if (points.length < 2 || totalKm <= 0) return hits;

  try {
    if (map.isStyleLoaded()) {
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
                    hits.push({ km: Number(km.toFixed(2)), frac, type });
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

  // Deteksi kontak tektonik / sesar batas formasi / intrusi dari perubahan formasi tajam sepanjang lintasan
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (prev.label !== curr.label || prev.symbol !== curr.symbol) {
      const isSea = /laut|sea|unmapped/i.test(prev.label) || /laut|sea|unmapped/i.test(curr.label);
      if (isSea) continue;
      const frac = i / Math.max(1, samples.length - 1);
      if (hits.some((h) => Math.abs(h.frac - frac) < 0.04)) continue;
      const isPlutonic =
        prev.lithClass.startsWith("plutonic") || curr.lithClass.startsWith("plutonic");
      const ageJump = Math.abs(prev.ageBaseMa - curr.ageBaseMa);
      const isBasement =
        prev.lithClass === "metamorphic" ||
        curr.lithClass === "metamorphic" ||
        prev.lithClass === "melange" ||
        curr.lithClass === "melange";
      if (isPlutonic || isBasement || ageJump >= 18) {
        const type = isPlutonic
          ? getLang() === "en"
            ? "Intrusive / Fault Contact"
            : "Kontak Intrusi / Sesar"
          : getLang() === "en"
            ? "Fault / Tectonic Contact"
            : "Sesar / Kontak Tektonik";
        hits.push({
          km: Number((frac * totalKm).toFixed(2)),
          frac,
          type,
        });
      }
    }
  }

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

interface UnitBlock {
  startIdx: number;
  endIdx: number;
  label: string;
  symbol: string;
  color: string;
  lithClass: string;
  lithLabel: string;
  ageBaseMa: number;
}

// Geometri dasar penampang (dipakai juga oleh hover sinkron di controller)
const SEC_W = 820;
const SEC_PAD_L = 48;
const SEC_PAD_R = 18;

function buildSectionSvg(
  samples: readonly SampleHit[],
  structures: readonly TransectStructureHit[],
  totalKm: number,
  azimuthDeg: number,
  ve = 1,
): string {
  // Panoramic wide geological cross-section (3.1 : 1 horizontal ratio)
  // Perbesaran Vertikal (VE): tinggi plot dikali VE, sehingga skala vertikal (m per piksel) ikut membesar.
  const W = SEC_W;
  const padL = SEC_PAD_L;
  const padR = SEC_PAD_R;
  const padT = 26;
  const padB = 28;
  const H = Math.round(268 + (Math.max(1, ve) - 1) * (268 - padT - padB));
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const validElevs = samples.map((s) => s.elevM).filter((v): v is number => v !== null);
  const hasDem = validElevs.length >= 2;
  const rawMin = hasDem ? Math.min(...validElevs, 0) : 0;
  const rawMax = hasDem ? Math.max(...validElevs, 150) : 150;
  const topoSpan = Math.max(80, rawMax - rawMin);
  // Beri 65% ruang kedalaman bawah permukaan agar lapisan stratigrafi, lipatan, batolit & patahan terlihat proporsional
  const subDepthM = Math.max(250, Math.round(topoSpan * 1.45));
  const yMin = rawMin - subDepthM;
  const yMax = rawMax + topoSpan * 0.22;
  const yToPx = (elev: number) => padT + ((yMax - elev) / (yMax - yMin)) * plotH;
  const xToPx = (idx: number) => padL + (idx / Math.max(1, samples.length - 1)) * plotW;
  const yBase = H - padB;

  // Hitung vertical fault throw (pergeseran blok patahan naik/turun) untuk setiap sampel berdasarkan struktur yang memotong
  const faultThrowsPx = samples.map((_, idx) => {
    const frac = idx / Math.max(1, samples.length - 1);
    let throwAcc = 0;
    structures.forEach((st, sIdx) => {
      if (frac > st.frac) {
        throwAcc += (sIdx % 2 === 0 ? 1 : -1) * 14;
      }
    });
    // Tambahkan gelombang struktur lipatan regional halus (gentle structural folding)
    const foldWave = Math.sin(frac * Math.PI * 2.5) * 9;
    return throwAcc + foldWave;
  });

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
        lithLabel: s.lithLabel,
        ageBaseMa: s.ageBaseMa,
      });
    }
  }

  // Cari batuan dasar (basement) tertua dan satuan sedimen regional menengah untuk lapisan bawah permukaan bertingkat
  const bedrockBlocks = blocks.filter((b) => b.lithClass !== "unconsolidated" && b.ageBaseMa > 2.6);
  const sortedByAge = [...(bedrockBlocks.length ? bedrockBlocks : blocks)].sort((a, b) => b.ageBaseMa - a.ageBaseMa);
  const oldestBasement = sortedByAge[0] ?? blocks[0];
  const midSequence = sortedByAge[Math.min(1, sortedByAge.length - 1)] ?? oldestBasement;

  const layersSvg: string[] = [];

  // Horizon kedalaman:
  // 1) yBasementTop(i): batas atas Batuan Dasar (Basement) di kedalaman ~58% bawah permukaan (bergeser naik/turun oleh patahan!)
  const yBasementTop = (i: number) => {
    const ySurf = yToPx(samples[i].elevM ?? 50);
    return Math.min(yBase - 18, Math.max(ySurf + 26, ySurf + (yBase - ySurf) * 0.58 + faultThrowsPx[i]));
  };

  // Gambar Lapisan 1: Deep Crystalline / Metamorphic Basement (paling bawah, terpatahkan oleh sesar)
  if (oldestBasement) {
    const topBasementPts = samples.map((_, i) => `${xToPx(i).toFixed(1)},${yBasementTop(i).toFixed(1)}`).join(" ");
    const bCol = safeColor(oldestBasement.color === "#D9DEE1" ? "#A895C9" : oldestBasement.color);
    const bPat = `pat-${oldestBasement.lithClass === "unconsolidated" ? "metamorphic" : oldestBasement.lithClass || "metamorphic"}`;
    layersSvg.push(
      `<polygon points="${padL.toFixed(1)},${yBase.toFixed(1)} ${topBasementPts} ${(W - padR).toFixed(1)},${yBase.toFixed(1)}" fill="${bCol}" fill-opacity="0.78"/>`,
      `<polygon points="${padL.toFixed(1)},${yBase.toFixed(1)} ${topBasementPts} ${(W - padR).toFixed(1)},${yBase.toFixed(1)}" fill="url(#${bPat})"/>`,
      `<polyline points="${topBasementPts}" fill="none" stroke="rgba(31,43,51,0.55)" stroke-width="1.1" stroke-dasharray="5,3"/>`,
    );
  }

  // Gambar Lapisan 2: Subsurface Regional Stratigraphic Sequence di atas Basement (dengan garis perlapisan miring/terlipat)
  if (midSequence) {
    const topSurfPts = samples.map((s, i) => `${xToPx(i).toFixed(1)},${yToPx(s.elevM ?? 50).toFixed(1)}`).join(" ");
    const botBasePts = [...samples].map((_, idx) => {
      const i = samples.length - 1 - idx;
      return `${xToPx(i).toFixed(1)},${yBasementTop(i).toFixed(1)}`;
    }).join(" ");
    const mCol = safeColor(midSequence.color === "#D9DEE1" ? "#E4B77A" : midSequence.color);
    const mPat = `pat-${midSequence.lithClass || "siliciclastic"}`;
    layersSvg.push(
      `<polygon points="${topSurfPts} ${botBasePts}" fill="${mCol}" fill-opacity="0.65"/>`,
      `<polygon points="${topSurfPts} ${botBasePts}" fill="url(#${mPat})"/>`,
    );
  }

  // Gambar Lapisan 3: Setiap Blok Formasi Permukaan & Bawah Permukaan (Sedimen Miring + Garis Perlapisan, Batolit Plutonik Memotong dari Bawah, dan Endapan Kuarter di Atas)
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
    const lithMeta = LITH_CLASSES.find((c) => c.id === b.lithClass);
    const col = safeColor(b.color && b.color !== "#D9DEE1" ? b.color : lithMeta?.color || "#E4B77A");
    const patId = `pat-${b.lithClass || "siliciclastic"}`;

    let polyPts = "";
    let extraLines = "";
    if (mode === "veneer") {
      // Lapisan Endapan Kuarter / Aluvium di atas ketidakselarasan (unconformity)
      const botPts: string[] = [];
      for (let i = i1; i >= i0; i--) {
        const ySurf = yToPx(samples[i].elevM ?? 50);
        const thickness = Math.min(28, Math.max(14, (yBase - ySurf) * 0.24));
        botPts.push(`${xToPx(i).toFixed(1)},${Math.min(yBase - 8, ySurf + thickness).toFixed(1)}`);
      }
      polyPts = `${topPts.join(" ")} ${botPts.join(" ")}`;
      extraLines = `<polyline points="${botPts.join(" ")}" fill="none" stroke="rgba(31,43,51,0.7)" stroke-width="1.2" stroke-dasharray="4,2"/>`;
    } else if (mode === "pluton") {
      // Batolit / Intrusi Beku (Granit, Granodiorit, Adamelit, Diorit, Gabro) melebar ke bawah memotong seluruh lapisan hingga dasar penampang
      const spreadL = i0 > 0 ? Math.max(padL, xL - 26) : xL;
      const spreadR = i1 < samples.length - 1 ? Math.min(W - padR, xR + 26) : xR;
      polyPts = `${topPts.join(" ")} ${spreadR.toFixed(1)},${yBase.toFixed(1)} ${spreadL.toFixed(1)},${yBase.toFixed(1)}`;
      if (i0 > 0) {
        extraLines += `<line x1="${xL.toFixed(1)}" y1="${yTopL.toFixed(1)}" x2="${spreadL.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="#7F1D1D" stroke-width="1.8"/>`;
      }
      if (i1 < samples.length - 1) {
        extraLines += `<line x1="${xR.toFixed(1)}" y1="${yTopR.toFixed(1)}" x2="${spreadR.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="#7F1D1D" stroke-width="1.8"/>`;
      }
    } else {
      // Lapisan Sedimen / Metamorf / Vulkanik dengan kemiringan perlapisan (dip) & 3 garis horizon internal
      const prevBlock = blocks.find((p) => p.endIdx === i0 - 1);
      const nextBlock = blocks.find((n) => n.startIdx === i1 + 1);
      const dipL = prevBlock ? (prevBlock.ageBaseMa < b.ageBaseMa ? -22 : 22) : 0;
      const dipR = nextBlock ? (nextBlock.ageBaseMa < b.ageBaseMa ? 22 : -22) : 0;
      const isDeepUnit = b.ageBaseMa >= oldestBasement.ageBaseMa * 0.85;
      const botPts: string[] = [];
      for (let i = i1; i >= i0; i--) {
        const fracInBlock = (i - i0) / Math.max(1, i1 - i0);
        const shiftX = dipL * (1 - fracInBlock) + dipR * fracInBlock;
        const bx = Math.max(padL, Math.min(W - padR, xToPx(i) + shiftX * 0.5));
        const by = isDeepUnit ? yBase : yBasementTop(i);
        botPts.push(`${bx.toFixed(1)},${by.toFixed(1)}`);
      }
      polyPts = `${topPts.join(" ")} ${botPts.join(" ")}`;

      // Gambar 3 garis perlapisan internal (bedding planes) yang mengikuti kemiringan & pergeseran patahan
      for (const depthFrac of [0.28, 0.55, 0.82]) {
        const bedPts: string[] = [];
        for (let i = i0; i <= i1; i++) {
          const ySurf = yToPx(samples[i].elevM ?? 50);
          const yBot = isDeepUnit ? yBase : yBasementTop(i);
          const by = ySurf + (yBot - ySurf) * depthFrac;
          bedPts.push(`${xToPx(i).toFixed(1)},${by.toFixed(1)}`);
        }
        if (bedPts.length >= 2) {
          extraLines += `<polyline points="${bedPts.join(" ")}" fill="none" stroke="rgba(20,35,45,0.34)" stroke-width="0.95" stroke-dasharray="6,3"/>`;
        }
      }
      // Garis kontak batas formasi miring
      const bxL = Math.max(padL, Math.min(W - padR, xL + dipL * 0.5));
      const bxR = Math.max(padL, Math.min(W - padR, xR + dipR * 0.5));
      const byL = isDeepUnit ? yBase : yBasementTop(i0);
      const byR = isDeepUnit ? yBase : yBasementTop(i1);
      if (i0 > 0) {
        extraLines += `<line x1="${xL.toFixed(1)}" y1="${yTopL.toFixed(1)}" x2="${bxL.toFixed(1)}" y2="${byL.toFixed(1)}" stroke="rgba(31,43,51,0.72)" stroke-width="1.3"/>`;
      }
      if (i1 < samples.length - 1) {
        extraLines += `<line x1="${xR.toFixed(1)}" y1="${yTopR.toFixed(1)}" x2="${bxR.toFixed(1)}" y2="${byR.toFixed(1)}" stroke="rgba(31,43,51,0.72)" stroke-width="1.3"/>`;
      }
    }

    layersSvg.push(
      `<polygon points="${polyPts}" fill="${col}" fill-opacity="0.93"/>`,
      `<polygon points="${polyPts}" fill="url(#${patId})"/>`,
      extraLines,
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

  // 4. Label Simbol & Nama Formasi langsung di tubuh lapisan penampang geologi
  const unitBadgesSvg: string[] = [];
  for (const b of blocks) {
    const xL = xToPx(b.startIdx);
    const xR = xToPx(Math.min(samples.length - 1, Math.max(b.endIdx, b.startIdx + 1)));
    const widthPx = xR - xL;
    if (widthPx < 28) continue;
    const midIdx = Math.round((b.startIdx + b.endIdx) / 2);
    const cx = (xL + xR) / 2;
    const ySurf = yToPx(samples[midIdx]?.elevM ?? 50);
    const isVeneer = b.lithClass === "unconsolidated" && blocks.length > 1;
    const isPluton = b.lithClass === "plutonic_felsic" || b.lithClass === "plutonic_mafic";
    const cy = isVeneer
      ? Math.min(yBase - 12, ySurf + 12)
      : isPluton
        ? Math.min(yBase - 18, ySurf + (yBase - ySurf) * 0.56)
        : Math.min(yBase - 22, ySurf + (yBase - ySurf) * 0.34);

    const symTag = (b.symbol || b.label.slice(0, 6)).trim();
    const shortName = b.label.replace(/^(Formasi|Kompleks|Batuan|Endapan)\s+/i, "").slice(0, 16);
    const fullTag = widthPx >= 78 && b.symbol ? `${symTag} · ${shortName}` : symTag;
    const boxW = Math.min(widthPx - 6, Math.max(26, fullTag.length * 5.7 + 12));
    unitBadgesSvg.push(
      `<rect x="${(cx - boxW / 2).toFixed(1)}" y="${(cy - 8).toFixed(1)}" width="${boxW.toFixed(1)}" height="16" rx="4" fill="rgba(255,255,255,0.92)" stroke="rgba(31,43,51,0.65)" stroke-width="0.9"/>`,
      `<text x="${cx.toFixed(1)}" y="${(cy + 3.2).toFixed(1)}" text-anchor="middle" font-size="9.2" font-weight="700" fill="#1F2B33">${esc(fullTag)}</text>`,
    );
  }

  // Label Batuan Dasar (Basement) di bagian bawah penampang bila ada lebih dari 1 formasi
  if (oldestBasement && blocks.length > 1) {
    const baseTag = `${oldestBasement.symbol ? oldestBasement.symbol + " · " : ""}${oldestBasement.label.slice(0, 22)} (Basement)`;
    const bw = Math.min(220, baseTag.length * 5.4 + 14);
    unitBadgesSvg.push(
      `<rect x="${(padL + 10).toFixed(1)}" y="${(yBase - 19).toFixed(1)}" width="${bw.toFixed(1)}" height="15" rx="3" fill="rgba(31,43,51,0.82)"/>`,
      `<text x="${(padL + 10 + bw / 2).toFixed(1)}" y="${(yBase - 8.5).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="600" fill="#FFFFFF">${esc(baseTag)}</text>`,
    );
  }

  const surfacePts = samples
    .map((s, i) => `${xToPx(i).toFixed(1)},${yToPx(s.elevM ?? 50).toFixed(1)}`)
    .join(" ");

  const seaLineY = yToPx(0);
  const seaLine =
    seaLineY >= padT + 6 && seaLineY <= yBase - 6
      ? `<line x1="${padL}" y1="${seaLineY.toFixed(1)}" x2="${W - padR}" y2="${seaLineY.toFixed(1)}" stroke="#0284C7" stroke-width="1.1" stroke-dasharray="4,3"/>
         <text x="${W - padR - 4}" y="${(seaLineY - 3).toFixed(1)}" text-anchor="end" font-size="8.5" font-weight="600" fill="#0284C7">0 m (MSL)</text>`
      : "";

  // 5. Bidang Patahan / Sesar Miring (~68° dip) + Panah Pergeseran Hanging-Wall / Footwall (↑ / ↓)
  const structTraces = structures
    .map((st, idx) => {
      const sx = padL + st.frac * plotW;
      const sampleIdx = Math.min(samples.length - 1, Math.max(0, Math.round(st.frac * (samples.length - 1))));
      const topElev = samples[sampleIdx]?.elevM ?? 50;
      const sy = yToPx(topElev);
      const isFold = /lipat|fold|anti|syn/i.test(st.type);
      const stroke = isFold ? "#6D28D9" : "#DC2626";
      const dash = isFold ? "3,2" : "7,2.5";
      const dipDir = idx % 2 === 0 ? 1 : -1;
      const dipDx = dipDir * 24;
      const bx = Math.max(padL + 4, Math.min(W - padR - 4, sx + dipDx));
      const midX = (sx + bx) / 2;
      const midY = (sy + yBase) / 2;
      const tag = isFold ? `L${idx + 1}` : `F${idx + 1}`;
      const labelY = Math.max(13, sy - 6 - (idx % 2) * 10);
      const throwArrows = isFold
        ? ""
        : `<text x="${(midX + dipDir * 8).toFixed(1)}" y="${(midY - 3).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#DC2626">↓</text>
           <text x="${(midX - dipDir * 8).toFixed(1)}" y="${(midY + 7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#DC2626">↑</text>`;
      return `
        <line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="#FFFFFF" stroke-width="4.2" stroke-opacity="0.75"/>
        <line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="${stroke}" stroke-width="2.3" stroke-dasharray="${dash}"/>
        ${throwArrows}
        <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.2" fill="${stroke}" stroke="#FFFFFF" stroke-width="1"/>
        <rect x="${(sx - 13).toFixed(1)}" y="${(labelY - 9).toFixed(1)}" width="26" height="12" rx="3" fill="${stroke}"/>
        <text x="${sx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#FFFFFF">${tag}</text>
      `;
    })
    .join("");

  const maxLabel = `${Math.round(rawMax)} m`;
  const midLabel = `${Math.round((rawMax + yMin) / 2)} m`;
  const minLabel = `${Math.round(yMin)} m`;
  const azCard =
    azimuthDeg >= 337.5 || azimuthDeg < 22.5
      ? "N"
      : azimuthDeg < 67.5
        ? "NE"
        : azimuthDeg < 112.5
          ? "E"
          : azimuthDeg < 157.5
            ? "SE"
            : azimuthDeg < 202.5
              ? "S"
              : azimuthDeg < 247.5
                ? "SW"
                : azimuthDeg < 292.5
                  ? "W"
                  : "NW";

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Geological Cross-Section A to A' (VE ${ve}×)" data-ve="${ve}">
    ${SVG_LITH_PATTERNS}
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#F8FAFC" stroke="rgba(31,43,51,0.24)" stroke-width="1"/>
    ${layersSvg.join("")}
    ${seaLine}
    <polyline points="${surfacePts}" fill="none" stroke="#0F172A" stroke-width="2.3" stroke-linejoin="round"/>
    ${structTraces}
    ${unitBadgesSvg.join("")}
    <line id="secCursor" x1="${padL}" y1="${padT}" x2="${padL}" y2="${yBase}" stroke="#0F172A" stroke-width="1" stroke-dasharray="2,2" visibility="hidden" pointer-events="none"/>
    <text x="${padL + 6}" y="${padT - 8}" font-size="10" font-weight="800" fill="#0F172A">A</text>
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

const SOURCE_ID = "transect-src";
const LINE_LAYER = "transect-line";
const PT_LAYER = "transect-pts";
const HOVER_SOURCE = "transect-hover-src";
const HOVER_LAYER = "transect-hover";

export function createTransectController(
  map: maplibregl.Map,
  onActiveChange: (active: boolean) => void,
  getNationalUnits?: () => NationalUnit[],
) {
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
  const veSelect = document.getElementById("transectVe") as HTMLSelectElement | null;
  const svgExportBtn = document.getElementById("transectExportSvg") as HTMLButtonElement | null;
  let redrawSection: (() => void) | null = null;

  // Tampilkan titik hover penampang di peta (kosong = sembunyikan)
  const setHoverPoint = (p: TransectPoint | null) => {
    try {
      if (!map.isStyleLoaded()) return;
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
        return {
          label: label || symbol,
          symbol,
          color,
          lithClass,
          lithLabel,
          lithDetail,
          age,
          ageBaseMa,
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
      if (map.isStyleLoaded()) {
        layers = QUERY_LAYERS.filter((id) => Boolean(map.getLayer(id)));
        hasTerrain = Boolean(map.getTerrain());
      }
    } catch {
      layers = [];
    }
    const natUnits = getNationalUnits ? getNationalUnits() : [];
    const samplePts = samplePointsAlongLine(points, 80);
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
    lastStructures = findStructureIntersections(map, points, sampleHits, totalKm);

    const drawHtml = () => {
      const validElevs = sampleHits.map((s) => s.elevM).filter((v): v is number => v !== null);
      lastElevRange = validElevs.length >= 2 ? [Math.min(...validElevs), Math.max(...validElevs)] : null;
      const elevStr = lastElevRange ? `${lastElevRange[0]}..${lastElevRange[1]} m` : "…";
      const ve = Math.max(1, Number(veSelect?.value) || 1);
      const sectionHtml = `<div class="transect-section">${buildSectionSvg(sampleHits, lastStructures, totalKm, azimuthDeg, ve)}</div>`;
      const structHtml = lastStructures.length
        ? `<div class="transect-struct-badges" aria-label="${esc(t("transectStructures"))}">${lastStructures
            .map((st, idx) => `<span class="transect-struct-badge">${/lipat|fold|anti|syn/i.test(st.type) ? `L${idx + 1}` : `F${idx + 1}`}: ${esc(st.type)} @ ${st.km.toFixed(1)} km</span>`)
            .join("")}</div>`
        : "";
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
        ${structHtml}
        ${listHtml}
      `;
      bindSectionHover(sampleHits);
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

  const setActive = (next: boolean) => {
    active = next;
    btn.setAttribute("aria-pressed", String(active));
    map.getCanvas().style.cursor = active ? "crosshair" : "";
    panel.hidden = !active && points.length === 0;
    onActiveChange(active);
    if (active) renderPanel();
  };

  const clear = () => {
    setHoverPoint(null);
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

  veSelect?.addEventListener("change", () => redrawSection?.());

  svgExportBtn?.addEventListener("click", () => {
    const svgEl = body.querySelector(".transect-section svg");
    if (!svgEl) return;
    let xml = new XMLSerializer().serializeToString(svgEl);
    if (!xml.includes("xmlns=")) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orebit-geological-section-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
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
