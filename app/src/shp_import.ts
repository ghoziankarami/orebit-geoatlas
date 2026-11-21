import type maplibregl from "maplibre-gl";
import { esc, safeColor } from "./detail";
import { getLang, t } from "./i18n";
import { QUERY_LAYERS } from "./layers";
import { LITH_CLASSES } from "./lithology";

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
const IMPORT_LINE = "user-import-line";
const IMPORT_PTS = "user-import-pts";

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

  // Walk Central Directory from End of Central Directory (EOCD) so data descriptors work reliably
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

export async function parseImportedFiles(fileList: FileList): Promise<{ name: string; fc: ImportedFeatureCollection }> {
  const files = Array.from(fileList);
  const first = files[0];
  if (!first) throw new Error("No file selected");
  const lower = first.name.toLowerCase();

  if (lower.endsWith(".geojson") || lower.endsWith(".json")) {
    const text = await first.text();
    const obj = JSON.parse(text);
    const fc: ImportedFeatureCollection =
      obj.type === "FeatureCollection"
        ? obj
        : obj.type === "Feature"
          ? { type: "FeatureCollection", features: [obj] }
          : { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: obj }] };
    return { name: first.name, fc };
  }

  if (lower.endsWith(".kml")) {
    const text = await first.text();
    return { name: first.name, fc: parseKmlText(text) };
  }

  let shpBuf: ArrayBuffer | null = null;
  let dbfBuf: ArrayBuffer | null = null;

  if (lower.endsWith(".zip")) {
    const entries = await unzipEntries(await first.arrayBuffer());
    for (const [k, v] of entries.entries()) {
      const kl = k.toLowerCase();
      if (kl.endsWith(".shp") && !shpBuf) shpBuf = v;
      if (kl.endsWith(".dbf") && !dbfBuf) dbfBuf = v;
    }
  } else {
    for (const f of files) {
      const fl = f.name.toLowerCase();
      if (fl.endsWith(".shp")) shpBuf = await f.arrayBuffer();
      if (fl.endsWith(".dbf")) dbfBuf = await f.arrayBuffer();
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
  return { name: first.name, fc: { type: "FeatureCollection", features } };
}

export function computeGeojsonBboxAndSamplePoints(fc: ImportedFeatureCollection): {
  bbox: [[number, number], [number, number]] | null;
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
      if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
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
  if (!Number.isFinite(minX)) return { bbox: null, samples: [] };

  const samples: [number, number][] = [[(minX + maxX) / 2, (minY + maxY) / 2]];
  const step = Math.max(1, Math.floor(rawPts.length / 24));
  for (let i = 0; i < rawPts.length && samples.length < 30; i += step) {
    samples.push(rawPts[i]);
  }
  return {
    bbox: [
      [minX, minY],
      [maxX, maxY],
    ],
    samples,
  };
}

export function createShpImportController(
  map: maplibregl.Map,
  onNavigate: () => void,
  toast: (msg: string) => void,
) {
  const input = document.getElementById("shpFileInput") as HTMLInputElement | null;
  const triggerBtn = document.getElementById("shpImportBtn") as HTMLButtonElement | null;
  const focusBtn = document.getElementById("shpFocusBtn") as HTMLButtonElement | null;
  const clearBtn = document.getElementById("shpClearBtn") as HTMLButtonElement | null;
  const summaryEl = document.getElementById("shpImportSummary") as HTMLElement | null;

  let currentName = "";
  let currentFc: ImportedFeatureCollection | null = null;
  let currentBbox: [[number, number], [number, number]] | null = null;
  let currentSamples: [number, number][] = [];

  const ensureLayers = () => {
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
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#E11D48",
          "fill-opacity": 0.16,
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
          "line-width": 2.6,
          "line-dasharray": [3, 1.5],
        },
      });
    }
    if (!map.getLayer(IMPORT_PTS)) {
      map.addLayer({
        id: IMPORT_PTS,
        type: "circle",
        source: IMPORT_SRC,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5.5,
          "circle-color": "#E11D48",
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 2,
        },
      });
    }
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
    const layers = map.isStyleLoaded() ? QUERY_LAYERS.filter((id) => map.getLayer(id)) : [];
    const hits = new Map<string, { formation: string; symbol: string; lith: string; age: string; color: string }>();

    for (const [lng, lat] of currentSamples) {
      const pt = map.project([lng, lat]);
      const feat = layers.length ? map.queryRenderedFeatures(pt, { layers })[0] : undefined;
      if (!feat) continue;
      const p = (feat.properties ?? {}) as Record<string, unknown>;
      const formation = String(p.formation || p.strat_name || p.name_orig || p.name || "").trim();
      const symbol = String(p.symbol || "").trim();
      if (!formation && !symbol) continue;
      const lithId = String(p.lith_class || "");
      const lithMeta = LITH_CLASSES.find((c) => c.id === lithId);
      const lith = lithMeta ? (lang === "id" ? lithMeta.id_label : lithMeta.en) : String(p.lith || lithId || "—");
      const age = feat.source === "orebit"
        ? [p.interval_base, p.interval_top].filter(Boolean).join("–")
        : [p.b_int_name, p.t_int_name].filter(Boolean).join("–");
      const color = String(p.color_hex || p.color || lithMeta?.color || "#D9DEE1");
      const key = `${symbol}::${formation}`;
      if (!hits.has(key)) hits.set(key, { formation: formation || symbol, symbol, lith, age, color });
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

    summaryEl.hidden = false;
    if (focusBtn) focusBtn.hidden = false;
    if (clearBtn) clearBtn.hidden = false;
    summaryEl.innerHTML = `
      <div class="shp-audit-head">
        <strong>${esc(currentName)}</strong>
        <span>${currentFc.features.length} ${esc(t("shpFeaturesUnit"))}</span>
      </div>
      <p class="shp-audit-sub">${esc(t("shpIntersectTitle"))} (${hits.size}):</p>
      ${unitItems ? `<ul class="shp-unit-list">${unitItems}</ul>` : `<p class="muted">${esc(t("shpNoUnitsYet"))}</p>`}
    `;
  };

  const syncSource = () => {
    if (!map.isStyleLoaded()) return;
    ensureLayers();
    (map.getSource(IMPORT_SRC) as maplibregl.GeoJSONSource | undefined)?.setData(
      currentFc ?? { type: "FeatureCollection", features: [] },
    );
  };

  triggerBtn?.addEventListener("click", () => input?.click());

  input?.addEventListener("change", async () => {
    if (!input.files || !input.files.length) return;
    try {
      const { name, fc } = await parseImportedFiles(input.files);
      if (!fc.features.length) {
        toast(t("shpImportEmpty"));
        return;
      }
      currentName = name;
      currentFc = fc;
      const { bbox, samples } = computeGeojsonBboxAndSamplePoints(fc);
      currentBbox = bbox;
      currentSamples = samples;
      syncSource();
      if (currentBbox) {
        onNavigate();
        map.fitBounds(currentBbox, { padding: 56, maxZoom: 12, duration: 900 });
        map.once("idle", renderAudit);
      }
      renderAudit();
      toast(t("shpImportSuccess"));
    } catch {
      toast(t("shpImportError"));
    } finally {
      input.value = "";
    }
  });

  focusBtn?.addEventListener("click", () => {
    if (currentBbox) {
      onNavigate();
      map.fitBounds(currentBbox, { padding: 56, maxZoom: 12, duration: 800 });
      map.once("idle", renderAudit);
    }
  });

  clearBtn?.addEventListener("click", () => {
    currentName = "";
    currentFc = null;
    currentBbox = null;
    currentSamples = [];
    syncSource();
    renderAudit();
  });

  return {
    refresh: () => {
      if (currentFc) {
        syncSource();
        renderAudit();
      }
    },
  };
}
