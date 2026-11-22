// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
import maplibregl from "maplibre-gl";
import { esc, safeColor } from "./detail";
import { getLang, t } from "./i18n";
import { QUERY_LAYERS } from "./layers";
import { LITH_CLASSES } from "./lithology";
import type { NationalUnit } from "./search";

export interface ImportedFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
      type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
      coordinates: unknown;
    };
  }>;
}

const IMPORT_SRC = "user-import-src";
const IMPORT_FILL = "user-import-fill";
const IMPORT_HALO = "user-import-halo";
const IMPORT_LINE = "user-import-line";
const IMPORT_PTS = "user-import-pts";

/**
 * Konversi koordinat UTM (WGS84 / DGN95) ke WGS84 [lng, lat] (derajat).
 * Mendukung seluruh zona UTM Indonesia (46N–54N dan 46S–54S).
 */
export function utmToLngLat(easting: number, northing: number, zone: number, isSouth: boolean): [number, number] {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const x = easting - 500000.0;
  const y = isSouth ? northing - 10000000.0 : northing;
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const j1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
  const j2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
  const j3 = (151 * Math.pow(e1, 3)) / 96;
  const j4 = (1097 * Math.pow(e1, 4)) / 512;
  const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu) + j4 * Math.sin(8 * mu);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = ep2 * cosFp * cosFp;
  const t1 = tanFp * tanFp;
  const r1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinFp * sinFp, 1.5);
  const n1 = a / Math.sqrt(1 - e2 * sinFp * sinFp);
  const d = x / (n1 * k0);

  const q1 = (n1 * tanFp) / r1;
  const q2 = (d * d) / 2;
  const q3 = ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * Math.pow(d, 4)) / 24;
  const q4 = ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * Math.pow(d, 6)) / 720;
  const latRad = fp - q1 * (q2 - q3 + q4);

  const q5 = d;
  const q6 = ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6;
  const q7 = ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * Math.pow(d, 5)) / 120;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const lonRad = lon0 + (q5 - q6 + q7) / cosFp;

  return [(lonRad * 180) / Math.PI, (latRad * 180) / Math.PI];
}

function webMercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lng, lat];
}

export interface PrjSpec {
  mode: "wgs84" | "utm" | "mercator";
  zone: number;
  isSouth: boolean;
}

export function detectPrjSpec(prjText: string | null, fallbackZone: number, fallbackSouth: boolean): PrjSpec {
  if (!prjText) return { mode: "wgs84", zone: fallbackZone, isSouth: fallbackSouth };
  const s = prjText.toUpperCase();
  if (s.includes("MERCATOR") || s.includes("3857") || s.includes("900913")) {
    return { mode: "mercator", zone: fallbackZone, isSouth: fallbackSouth };
  }
  const utmMatch = s.match(/UTM[\s_]*ZONE[\s_]*(\d{2})\s*([NS])?/i) || s.match(/ZONE[\s_]*(\d{2})\s*([NS])?/i);
  if (utmMatch) {
    const z = Math.max(46, Math.min(54, Number(utmMatch[1]) || fallbackZone));
    const hemi = utmMatch[2] ? utmMatch[2].toUpperCase() === "S" : s.includes("SOUTH") || s.includes("FALSE_NORTHING\",10000000");
    return { mode: "utm", zone: z, isSouth: hemi };
  }
  if (s.includes("TRANSVERSE_MERCATOR") || s.includes("PROJECTION")) {
    const cmMatch = s.match(/CENTRAL_MERIDIAN["\s,]+([0-9.]+)/i);
    const cm = cmMatch ? Number(cmMatch[1]) : NaN;
    const z = Number.isFinite(cm) ? Math.max(46, Math.min(54, Math.round((cm + 183) / 6))) : fallbackZone;
    const isSouth = s.includes("10000000") || s.includes("SOUTH") || fallbackSouth;
    return { mode: "utm", zone: z, isSouth };
  }
  return { mode: "wgs84", zone: fallbackZone, isSouth: fallbackSouth };
}

function reprojectFeatureCollection(
  rawFc: ImportedFeatureCollection,
  spec: PrjSpec,
): { fc: ImportedFeatureCollection; usedSpec: PrjSpec } {
  // Cek sampel koordinat pertama untuk mendeteksi apakah data dalam meter (UTM / WebMercator) meski tanpa .prj
  let sampleX = 0;
  let sampleY = 0;
  let foundSample = false;
  const findFirst = (c: unknown) => {
    if (foundSample || !Array.isArray(c)) return;
    if (c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
      sampleX = c[0];
      sampleY = c[1];
      foundSample = true;
    } else {
      for (const item of c) findFirst(item);
    }
  };
  for (const f of rawFc.features) findFirst(f.geometry?.coordinates);

  let activeSpec: PrjSpec = { ...spec };
  if (foundSample && (Math.abs(sampleX) > 180 || Math.abs(sampleY) > 90)) {
    if (activeSpec.mode === "wgs84") {
      if (sampleX > 10000000 && sampleX < 16500000) {
        activeSpec = { mode: "mercator", zone: spec.zone, isSouth: spec.isSouth };
      } else {
        // Otomatis deteksi belahan bumi Selatan jika Northing > 8.000.000 m atau negatif
        const autoSouth = sampleY > 8000000 || sampleY < 0 ? true : spec.isSouth;
        activeSpec = { mode: "utm", zone: spec.zone, isSouth: autoSouth };
      }
    }
  } else if (foundSample && Math.abs(sampleX) <= 180 && Math.abs(sampleY) <= 90) {
    // Jika user accidentally terbalik [lat, lng] di Indonesia (x di -12..7 dan y di 94..142), balikkan ke [lng, lat]
    const isSwappedLatLon = sampleX >= -12 && sampleX <= 8 && sampleY >= 94 && sampleY <= 142;
    if (!isSwappedLatLon && activeSpec.mode === "wgs84") {
      return { fc: rawFc, usedSpec: activeSpec };
    }
  }

  const transformCoord = (c: unknown): unknown => {
    if (!Array.isArray(c)) return c;
    if (c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
      const x = c[0];
      const y = c[1];
      if (activeSpec.mode === "mercator" && (Math.abs(x) > 180 || Math.abs(y) > 90)) {
        return webMercatorToLngLat(x, y);
      }
      if (activeSpec.mode === "utm" && (Math.abs(x) > 180 || Math.abs(y) > 90)) {
        const yn = y < 0 ? 10000000 + y : y;
        return utmToLngLat(x, yn, activeSpec.zone, activeSpec.isSouth);
      }
      if (x >= -12 && x <= 8 && y >= 94 && y <= 142) {
        return [y, x];
      }
      return [x, y];
    }
    return c.map(transformCoord);
  };

  return {
    usedSpec: activeSpec,
    fc: {
      type: "FeatureCollection",
      features: rawFc.features.map((f) => ({
        ...f,
        geometry: {
          ...f.geometry,
          coordinates: transformCoord(f.geometry.coordinates),
        },
      })),
    },
  };
}

function parseShpBuffer(buf: ArrayBuffer): Array<{ type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon"; coordinates: unknown } | null> {
  const dv = new DataView(buf);
  if (buf.byteLength < 100 || dv.getInt32(0, false) !== 9994) {
    throw new Error("Invalid ESRI .shp header");
  }
  const geoms: Array<{ type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon"; coordinates: unknown } | null> = [];
  let offset = 100;
  while (offset + 8 <= buf.byteLength) {
    const contentLenWords = dv.getInt32(offset + 4, false);
    const recBytes = contentLenWords * 2;
    const recStart = offset + 8;
    if (recStart + recBytes > buf.byteLength || recBytes < 4) break;
    const shapeType = dv.getInt32(recStart, true);
    if (shapeType === 0) {
      geoms.push(null);
    } else if (shapeType === 1 || shapeType === 11 || shapeType === 21) {
      const x = dv.getFloat64(recStart + 4, true);
      const y = dv.getFloat64(recStart + 12, true);
      geoms.push({ type: "Point", coordinates: [x, y] });
    } else if (shapeType === 8 || shapeType === 18 || shapeType === 28) {
      const numPoints = dv.getInt32(recStart + 36, true);
      const pts: [number, number][] = [];
      let pOff = recStart + 40;
      for (let i = 0; i < numPoints && pOff + 16 <= recStart + recBytes; i++) {
        pts.push([dv.getFloat64(pOff, true), dv.getFloat64(pOff + 8, true)]);
        pOff += 16;
      }
      geoms.push({ type: "MultiPoint", coordinates: pts });
    } else if ([3, 5, 13, 15, 23, 25].includes(shapeType)) {
      const numParts = dv.getInt32(recStart + 36, true);
      const numPoints = dv.getInt32(recStart + 40, true);
      const partIdx: number[] = [];
      for (let p = 0; p < numParts; p++) {
        partIdx.push(dv.getInt32(recStart + 44 + p * 4, true));
      }
      const ptsStart = recStart + 44 + numParts * 4;
      const rings: [number, number][][] = [];
      for (let p = 0; p < numParts; p++) {
        const startPt = partIdx[p];
        const endPt = p + 1 < numParts ? partIdx[p + 1] : numPoints;
        const ring: [number, number][] = [];
        for (let i = startPt; i < endPt; i++) {
          const pOff = ptsStart + i * 16;
          if (pOff + 16 <= recStart + recBytes) {
            ring.push([dv.getFloat64(pOff, true), dv.getFloat64(pOff + 8, true)]);
          }
        }
        if (ring.length) rings.push(ring);
      }
      const isPoly = shapeType === 5 || shapeType === 15 || shapeType === 25;
      if (isPoly) {
        geoms.push({ type: "Polygon", coordinates: rings });
      } else {
        geoms.push(
          rings.length === 1
            ? { type: "LineString", coordinates: rings[0] }
            : { type: "MultiLineString", coordinates: rings },
        );
      }
    } else {
      geoms.push(null);
    }
    offset = recStart + recBytes;
  }
  return geoms;
}

function parseDbfBuffer(buf: ArrayBuffer): Record<string, unknown>[] {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  if (buf.byteLength < 32) return [];
  const numRecords = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recordLen = dv.getUint16(10, true);
  const dec = new TextDecoder("utf-8", { fatal: false });

  const fields: { name: string; type: string; len: number }[] = [];
  let fOff = 32;
  while (fOff + 32 <= headerLen && bytes[fOff] !== 0x0d) {
    const rawName = bytes.subarray(fOff, fOff + 11);
    const zeroIdx = rawName.indexOf(0);
    const name = dec.decode(zeroIdx >= 0 ? rawName.subarray(0, zeroIdx) : rawName).trim();
    const type = String.fromCharCode(bytes[fOff + 11]);
    const len = bytes[fOff + 16];
    fields.push({ name, type, len });
    fOff += 32;
  }

  const rows: Record<string, unknown>[] = [];
  let rOff = headerLen;
  for (let r = 0; r < numRecords && rOff + recordLen <= buf.byteLength; r++) {
    if (bytes[rOff] !== 0x2a) {
      const row: Record<string, unknown> = {};
      let cOff = rOff + 1;
      for (const f of fields) {
        const valStr = dec.decode(bytes.subarray(cOff, cOff + f.len)).trim();
        if (f.type === "N" || f.type === "F") {
          const num = Number(valStr);
          row[f.name] = valStr !== "" && Number.isFinite(num) ? num : valStr;
        } else {
          row[f.name] = valStr;
        }
        cOff += f.len;
      }
      rows.push(row);
    }
    rOff += recordLen;
  }
  return rows;
}

async function unzipEntries(buf: ArrayBuffer): Promise<Map<string, ArrayBuffer>> {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const dec = new TextDecoder("utf-8", { fatal: false });
  const out = new Map<string, ArrayBuffer>();

  let eocd = buf.byteLength - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Invalid ZIP archive");

  const cdCount = dv.getUint16(eocd + 10, true);
  let cdOff = dv.getUint32(eocd + 16, true);

  for (let i = 0; i < cdCount && cdOff + 46 <= buf.byteLength; i++) {
    if (dv.getUint32(cdOff, true) !== 0x02014b50) break;
    const method = dv.getUint16(cdOff + 10, true);
    const compSize = dv.getUint32(cdOff + 20, true);
    const nameLen = dv.getUint16(cdOff + 28, true);
    const extraLen = dv.getUint16(cdOff + 30, true);
    const commentLen = dv.getUint16(cdOff + 32, true);
    const localHeaderOff = dv.getUint32(cdOff + 42, true);
    const name = dec.decode(bytes.subarray(cdOff + 46, cdOff + 46 + nameLen));

    const lNameLen = dv.getUint16(localHeaderOff + 26, true);
    const lExtraLen = dv.getUint16(localHeaderOff + 28, true);
    const dataStart = localHeaderOff + 30 + lNameLen + lExtraLen;
    const rawSlice = bytes.subarray(dataStart, dataStart + compSize);

    if (!name.endsWith("/") && compSize > 0) {
      if (method === 0) {
        out.set(name, rawSlice.buffer.slice(rawSlice.byteOffset, rawSlice.byteOffset + rawSlice.byteLength));
      } else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        void writer.write(rawSlice);
        void writer.close();
        const ab = await new Response(ds.readable).arrayBuffer();
        out.set(name, ab);
      }
    }
    cdOff += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function parseKmlText(text: string): ImportedFeatureCollection {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  const placemarks = Array.from(doc.querySelectorAll("Placemark"));
  const features: ImportedFeatureCollection["features"] = [];

  for (const pm of placemarks) {
    const name = pm.querySelector("name")?.textContent?.trim() || "KML Feature";
    const polyCoords = pm.querySelector("Polygon coordinates")?.textContent?.trim();
    const lineCoords = pm.querySelector("LineString coordinates")?.textContent?.trim();
    const ptCoords = pm.querySelector("Point coordinates")?.textContent?.trim();

    const parseTuples = (raw: string): [number, number][] =>
      raw
        .split(/\s+/)
        .map((tok) => tok.split(",").map(Number))
        .filter((arr) => arr.length >= 2 && Number.isFinite(arr[0]) && Number.isFinite(arr[1]))
        .map((arr) => [arr[0], arr[1]]);

    if (polyCoords) {
      const ring = parseTuples(polyCoords);
      if (ring.length >= 3) {
        features.push({ type: "Feature", properties: { name }, geometry: { type: "Polygon", coordinates: [ring] } });
      }
    } else if (lineCoords) {
      const pts = parseTuples(lineCoords);
      if (pts.length >= 2) {
        features.push({ type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates: pts } });
      }
    } else if (ptCoords) {
      const pts = parseTuples(ptCoords);
      if (pts.length >= 1) {
        features.push({ type: "Feature", properties: { name }, geometry: { type: "Point", coordinates: pts[0] } });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

export async function parseImportedFiles(
  fileList: FileList,
  fallbackZone = 48,
  fallbackSouth = true,
): Promise<{ name: string; rawFc: ImportedFeatureCollection; prjSpec: PrjSpec }> {
  const files = Array.from(fileList);
  const first = files[0];
  if (!first) throw new Error("No file selected");
  const lower = first.name.toLowerCase();

  if (lower.endsWith(".geojson") || lower.endsWith(".json")) {
    const text = await first.text();
    const obj = JSON.parse(text);
    const rawFc: ImportedFeatureCollection =
      obj.type === "FeatureCollection"
        ? obj
        : obj.type === "Feature"
          ? { type: "FeatureCollection", features: [obj] }
          : { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: obj }] };
    return { name: first.name, rawFc, prjSpec: { mode: "wgs84", zone: fallbackZone, isSouth: fallbackSouth } };
  }

  if (lower.endsWith(".kml")) {
    const text = await first.text();
    return {
      name: first.name,
      rawFc: parseKmlText(text),
      prjSpec: { mode: "wgs84", zone: fallbackZone, isSouth: fallbackSouth },
    };
  }

  let shpBuf: ArrayBuffer | null = null;
  let dbfBuf: ArrayBuffer | null = null;
  let prjText: string | null = null;

  if (lower.endsWith(".zip")) {
    const entries = await unzipEntries(await first.arrayBuffer());
    for (const [k, v] of entries.entries()) {
      const kl = k.toLowerCase();
      if (kl.endsWith(".shp") && !shpBuf) shpBuf = v;
      if (kl.endsWith(".dbf") && !dbfBuf) dbfBuf = v;
      if (kl.endsWith(".prj") && !prjText) prjText = new TextDecoder("utf-8", { fatal: false }).decode(v);
    }
  } else {
    for (const f of files) {
      const fl = f.name.toLowerCase();
      if (fl.endsWith(".shp")) shpBuf = await f.arrayBuffer();
      if (fl.endsWith(".dbf")) dbfBuf = await f.arrayBuffer();
      if (fl.endsWith(".prj")) prjText = await f.text();
    }
  }

  if (!shpBuf) throw new Error("No .shp / .geojson / .kml found");
  const geoms = parseShpBuffer(shpBuf);
  const attrs = dbfBuf ? parseDbfBuffer(dbfBuf) : [];
  const features: ImportedFeatureCollection["features"] = [];
  geoms.forEach((g, idx) => {
    if (g) {
      features.push({
        type: "Feature",
        properties: attrs[idx] ?? { FID: idx },
        geometry: g,
      });
    }
  });
  return {
    name: first.name,
    rawFc: { type: "FeatureCollection", features },
    prjSpec: detectPrjSpec(prjText, fallbackZone, fallbackSouth),
  };
}

export function computeGeojsonBboxAndSamplePoints(fc: ImportedFeatureCollection): {
  bbox: [[number, number], [number, number]] | null;
  center: [number, number] | null;
  samples: [number, number][];
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const rawPts: [number, number][] = [];

  const visit = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
      const x = c[0];
      const y = c[1];
      if (Number.isFinite(x) && Number.isFinite(y) && x >= -180 && x <= 180 && y >= -90 && y <= 90) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        rawPts.push([x, y]);
      }
    } else {
      for (const item of c) visit(item);
    }
  };

  for (const f of fc.features) visit(f.geometry?.coordinates);
  if (!Number.isFinite(minX)) return { bbox: null, center: null, samples: [] };

  const center: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const samples: [number, number][] = [center];
  const step = Math.max(1, Math.floor(rawPts.length / 28));
  for (let i = 0; i < rawPts.length && samples.length < 34; i += step) {
    samples.push(rawPts[i]);
  }
  return {
    bbox: [
      [minX, minY],
      [maxX, maxY],
    ],
    center,
    samples,
  };
}

export function createShpImportController(
  map: maplibregl.Map,
  onNavigate: () => void,
  toast: (msg: string) => void,
  getNationalUnits?: () => NationalUnit[],
) {
  const input = document.getElementById("shpFileInput") as HTMLInputElement | null;
  const triggerBtn = document.getElementById("shpImportBtn") as HTMLButtonElement | null;
  const focusBtn = document.getElementById("shpFocusBtn") as HTMLButtonElement | null;
  const clearBtn = document.getElementById("shpClearBtn") as HTMLButtonElement | null;
  const summaryEl = document.getElementById("shpImportSummary") as HTMLElement | null;

  let currentName = "";
  let currentRawFc: ImportedFeatureCollection | null = null;
  let currentFc: ImportedFeatureCollection | null = null;
  let currentSpec: PrjSpec = { mode: "wgs84", zone: 48, isSouth: true };
  let currentBbox: [[number, number], [number, number]] | null = null;
  let currentCenter: [number, number] | null = null;
  let currentSamples: [number, number][] = [];
  let pinMarker: maplibregl.Marker | null = null;

  const updatePinMarker = () => {
    if (pinMarker) {
      pinMarker.remove();
      pinMarker = null;
    }
    if (!currentCenter || !currentFc || !currentFc.features.length) return;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "shp-pin-marker";
    el.title = currentName;
    el.innerHTML = `<span class="shp-pin-dot"></span><span class="shp-pin-label">${esc(currentName.replace(/\.(zip|shp|geojson|json|kml)$/i, ""))}</span>`;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      zoomToLayer();
    });
    pinMarker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(currentCenter).addTo(map);
  };

  const ensureLayers = () => {
    try {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource(IMPORT_SRC)) {
        map.addSource(IMPORT_SRC, {
          type: "geojson",
          data: currentFc ?? { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(IMPORT_FILL)) {
        map.addLayer({
          id: IMPORT_FILL,
          type: "fill",
          source: IMPORT_SRC,
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "fill-color": "#E11D48",
            "fill-opacity": 0.26,
          },
        });
      }
      if (!map.getLayer(IMPORT_HALO)) {
        map.addLayer({
          id: IMPORT_HALO,
          type: "line",
          source: IMPORT_SRC,
          paint: {
            "line-color": "#FFFFFF",
            "line-width": 5.5,
            "line-opacity": 0.92,
          },
        });
      }
      if (!map.getLayer(IMPORT_LINE)) {
        map.addLayer({
          id: IMPORT_LINE,
          type: "line",
          source: IMPORT_SRC,
          paint: {
            "line-color": "#E11D48",
            "line-width": 3,
          },
        });
      }
      if (!map.getLayer(IMPORT_PTS)) {
        map.addLayer({
          id: IMPORT_PTS,
          type: "circle",
          source: IMPORT_SRC,
          filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
          paint: {
            "circle-radius": 7,
            "circle-color": "#E11D48",
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2.5,
          },
        });
      }
      // Pastikan layer SHP selalu berada paling atas di atas layer geologi
      for (const lid of [IMPORT_FILL, IMPORT_HALO, IMPORT_LINE, IMPORT_PTS]) {
        if (map.getLayer(lid)) map.moveLayer(lid);
      }
    } catch {
      // Style masih dimuat
    }
  };

  const zoomToLayer = () => {
    if (!currentBbox || !currentCenter) return;
    onNavigate();
    const [[minX, minY], [maxX, maxY]] = currentBbox;
    const span = Math.max(Math.abs(maxX - minX), Math.abs(maxY - minY));
    if (span < 0.002) {
      map.flyTo({ center: currentCenter, zoom: 12.5, duration: 900, essential: true });
    } else {
      map.fitBounds(currentBbox, {
        padding: { top: 80, right: 80, bottom: 80, left: window.innerWidth > 860 ? 380 : 80 },
        maxZoom: 13,
        duration: 900,
        essential: true,
      });
    }
    map.once("idle", renderAudit);
  };

  const renderAudit = () => {
    if (!summaryEl) return;
    if (!currentFc || !currentFc.features.length) {
      summaryEl.hidden = true;
      summaryEl.innerHTML = "";
      if (focusBtn) focusBtn.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      return;
    }

    const lang = getLang();
    let layers: string[] = [];
    try {
      if (map.isStyleLoaded()) layers = QUERY_LAYERS.filter((id) => Boolean(map.getLayer(id)));
    } catch {
      layers = [];
    }
    const hits = new Map<string, { formation: string; symbol: string; lith: string; age: string; color: string }>();

    for (const [lng, lat] of currentSamples) {
      const pt = map.project([lng, lat]);
      let feat: maplibregl.MapGeoJSONFeature | undefined;
      try {
        feat = layers.length
          ? map.queryRenderedFeatures(
              [
                [pt.x - 5, pt.y - 5],
                [pt.x + 5, pt.y + 5],
              ],
              { layers },
            )[0]
          : undefined;
      } catch {
        feat = undefined;
      }
      if (feat) {
        const p = (feat.properties ?? {}) as Record<string, unknown>;
        const formation = String(p.formation || p.strat_name || p.name_orig || p.name || "").trim();
        const symbol = String(p.symbol || "").trim();
        if (formation || symbol) {
          const lithId = String(p.lith_class || "");
          const lithMeta = LITH_CLASSES.find((c) => c.id === lithId);
          const lith = lithMeta ? (lang === "id" ? lithMeta.id_label : lithMeta.en) : String(p.lith || lithId || "—");
          const age =
            feat.source === "orebit"
              ? [p.interval_base, p.interval_top].filter(Boolean).join("–")
              : [p.b_int_name, p.t_int_name].filter(Boolean).join("–");
          const color = String(p.color_hex || p.color || lithMeta?.color || "#D9DEE1");
          const key = `${symbol}::${formation}`;
          if (!hits.has(key)) hits.set(key, { formation: formation || symbol, symbol, lith, age, color });
          continue;
        }
      }
      // Fallback ke katalog unit nasional 8 wilayah bila tile sedang dimuat
      const natUnits = getNationalUnits ? getNationalUnits() : [];
      for (const u of natUnits) {
        const [w, s, e, n] = u.bbox;
        if (lng >= w && lng <= e && lat >= s && lat <= n) {
          const lithMeta = LITH_CLASSES.find((c) => c.id === u.lith_class);
          const lith = lithMeta ? (lang === "id" ? lithMeta.id_label : lithMeta.en) : u.lith_class;
          const age = [u.interval_base, u.interval_top].filter(Boolean).join("–");
          const key = `${u.symbol}::${u.formation}`;
          if (!hits.has(key)) {
            hits.set(key, {
              formation: u.formation || u.symbol,
              symbol: u.symbol,
              lith,
              age,
              color: u.color_hex || lithMeta?.color || "#D9DEE1",
            });
          }
          if (hits.size >= 6) break;
        }
      }
    }

    const unitItems = [...hits.values()]
      .slice(0, 8)
      .map(
        (u) => `<li>
          <span class="chip" style="background:${safeColor(u.color)}"></span>
          <div class="shp-unit-meta">
            <strong>${esc(u.formation)}${u.symbol ? ` <code>${esc(u.symbol)}</code>` : ""}</strong>
            <span>${esc(u.lith)}${u.age ? ` · ${esc(u.age)}` : ""}</span>
          </div>
        </li>`,
      )
      .join("");

    const crsOptions: { val: string; label: string }[] = [
      { val: "wgs84", label: "WGS84 (Lat/Lon)" },
      ...([46, 47, 48, 49, 50, 51, 52, 53, 54] as const).flatMap((z) => [
        { val: `utm-${z}-S`, label: `UTM ${z}S` },
        { val: `utm-${z}-N`, label: `UTM ${z}N` },
      ]),
    ];
    const activeCrsVal =
      currentSpec.mode === "utm" ? `utm-${currentSpec.zone}-${currentSpec.isSouth ? "S" : "N"}` : "wgs84";
    const coordStr = currentCenter ? `${currentCenter[1].toFixed(4)}°, ${currentCenter[0].toFixed(4)}°` : "—";

    summaryEl.hidden = false;
    if (focusBtn) focusBtn.hidden = false;
    if (clearBtn) clearBtn.hidden = false;
    summaryEl.innerHTML = `
      <div class="shp-audit-head">
        <strong>📍 ${esc(currentName)}</strong>
        <span>${currentFc.features.length} ${esc(t("shpFeaturesUnit"))}</span>
      </div>
      <div class="shp-crs-row">
        <span>CRS:</span>
        <select id="shpCrsSelect" class="shp-crs-select" aria-label="Sistem koordinat SHP">
          ${crsOptions.map((o) => `<option value="${o.val}"${o.val === activeCrsVal ? " selected" : ""}>${o.label}</option>`).join("")}
        </select>
        <span class="shp-coord-tag">${esc(coordStr)}</span>
      </div>
      <p class="shp-audit-sub">${esc(t("shpIntersectTitle"))} (${hits.size}):</p>
      ${unitItems ? `<ul class="shp-unit-list">${unitItems}</ul>` : `<p class="muted">${esc(t("shpNoUnitsYet"))}</p>`}
    `;

    const sel = document.getElementById("shpCrsSelect") as HTMLSelectElement | null;
    sel?.addEventListener("change", () => {
      if (!currentRawFc) return;
      const v = sel.value;
      if (v === "wgs84") {
        currentSpec = { mode: "wgs84", zone: 48, isSouth: true };
      } else {
        const [, zStr, hStr] = v.split("-");
        currentSpec = { mode: "utm", zone: Number(zStr) || 48, isSouth: hStr === "S" };
      }
      const { fc } = reprojectFeatureCollection(currentRawFc, currentSpec);
      currentFc = fc;
      const { bbox, center, samples } = computeGeojsonBboxAndSamplePoints(fc);
      currentBbox = bbox;
      currentCenter = center;
      currentSamples = samples;
      syncSource();
      updatePinMarker();
      zoomToLayer();
      renderAudit();
    });
  };

  const syncSource = () => {
    try {
      if (!map.isStyleLoaded()) return;
      ensureLayers();
      (map.getSource(IMPORT_SRC) as maplibregl.GeoJSONSource | undefined)?.setData(
        currentFc ?? { type: "FeatureCollection", features: [] },
      );
    } catch {
      // Style masih dimuat
    }
  };

  triggerBtn?.addEventListener("click", () => input?.click());

  // Satu jalur untuk tombol pilih berkas maupun drag-and-drop ke kanvas peta
  const handleFiles = async (files: FileList) => {
    if (!files.length) return;
    try {
      const c = map.getCenter();
      const fallbackZone = Math.max(46, Math.min(54, Math.floor((c.lng + 180) / 6) + 1));
      const fallbackSouth = c.lat <= 0;
      const { name, rawFc, prjSpec } = await parseImportedFiles(files, fallbackZone, fallbackSouth);
      if (!rawFc.features.length) {
        toast(t("shpImportEmpty"));
        return;
      }
      currentName = name;
      currentRawFc = rawFc;
      const { fc, usedSpec } = reprojectFeatureCollection(rawFc, prjSpec);
      currentSpec = usedSpec;
      currentFc = fc;
      const { bbox, center, samples } = computeGeojsonBboxAndSamplePoints(fc);
      currentBbox = bbox;
      currentCenter = center;
      currentSamples = samples;
      syncSource();
      updatePinMarker();
      zoomToLayer();
      renderAudit();
      toast(t("shpImportSuccess"));
    } catch {
      toast(t("shpImportError"));
    }
  };

  input?.addEventListener("change", async () => {
    if (!input.files) return;
    await handleFiles(input.files);
    input.value = "";
  });

  // Drag-and-drop berkas .zip/.shp/.geojson/.kml langsung ke kanvas peta
  const container = map.getContainer();
  container.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    container.classList.add("shp-dragging");
  });
  container.addEventListener("dragleave", (e) => {
    if (!container.contains(e.relatedTarget as Node | null)) container.classList.remove("shp-dragging");
  });
  container.addEventListener("drop", (e) => {
    container.classList.remove("shp-dragging");
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    void handleFiles(e.dataTransfer.files);
  });

  // Klik fitur impor → popup seluruh atribut .dbf (nilai di-escape sebelum masuk DOM)
  const showFeatureAttributes = (e: maplibregl.MapLayerMouseEvent) => {
    const props = Object.entries(e.features?.[0]?.properties ?? {})
      .filter(([, v]) => v !== null && v !== "" && v !== undefined)
      .slice(0, 14);
    if (!props.length) return;
    const rows = props.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`).join("");
    new maplibregl.Popup({ maxWidth: "320px" })
      .setLngLat(e.lngLat)
      .setHTML(`<table class="shp-attr">${rows}</table>`)
      .addTo(map);
  };
  for (const layerId of [IMPORT_FILL, IMPORT_LINE, IMPORT_PTS]) {
    map.on("click", layerId, showFeatureAttributes);
    map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
  }

  focusBtn?.addEventListener("click", zoomToLayer);

  clearBtn?.addEventListener("click", () => {
    currentName = "";
    currentRawFc = null;
    currentFc = null;
    currentBbox = null;
    currentCenter = null;
    currentSamples = [];
    updatePinMarker();
    syncSource();
    renderAudit();
  });

  return {
    refresh: () => {
      if (currentFc) {
        syncSource();
        updatePinMarker();
        renderAudit();
      }
    },
  };
}
