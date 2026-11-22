// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import "./style.css";
import { renderAbout } from "./about";
import { BASEMAPS, CONFIG, REGIONS, type BasemapId } from "./config";
import { formatCoordReadout } from "./coords";
import { hideDetail, showDetail, showIndexUnitDetail } from "./detail";
import { getLang, setLang, t, type Key } from "./i18n";
import {
  addGeologyLayers,
  applyGeologyFilters,
  highlight,
  isFineZoom,
  QUERY_LAYERS,
  setColorMode,
  setLinesVisible,
} from "./layers";
import { renderLegend } from "./legend";
import { getLoadedNationalUnits, initSearch, type NationalUnit } from "./search";
import { readState, writeState, type ConfidenceFilter } from "./state";
import { ERA_PRESETS } from "./timescale";
import { createTransectController } from "./transect";
import { createShpImportController } from "./shp_import";

const state = readState();
setLang(state.lang ?? getLang());

maplibregl.addProtocol("pmtiles", new Protocol().tile);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const isMobile = () => matchMedia("(max-width: 760px)").matches;

const map = new maplibregl.Map({
  container: "map",
  style: BASEMAPS[state.basemap] ?? CONFIG.basemapStyle,
  center: CONFIG.initialView.center,
  zoom: CONFIG.initialView.zoom,
  pitch: state.view3d ? 55 : 0,
  bearing: 0,
  maxPitch: 75,
  maxTileCacheSize: 512,
  canvasContextAttributes: { preserveDrawingBuffer: true },
  maxBounds: [[CONFIG.bounds[0][0] - 20, CONFIG.bounds[0][1] - 15], [CONFIG.bounds[1][0] + 20, CONFIG.bounds[1][1] + 15]],
  hash: "map",
  dragRotate: true,
  touchPitch: true,
  attributionControl: false,
});

// Ketahanan terhadap kegagalan tile eksternal tanpa memutus UI utama
let degradedWarned = false;
map.on("error", (ev) => {
  const errMsg = String((ev as { error?: { message?: string } })?.error?.message ?? "");
  if (!degradedWarned && /tile|pmtiles|fetch|network|404|50/i.test(errMsg)) {
    degradedWarned = true;
    toast(t("tileDegraded"));
  }
});

// ---------- Kontrol peta kustom ----------
const scale = new maplibregl.ScaleControl({ unit: "metric", maxWidth: 96 });
$("scaleSlot").append(scale.onAdd(map));

$("zoomIn").addEventListener("click", () => map.zoomIn());
$("zoomOut").addEventListener("click", () => map.zoomOut());

function ensureTerrainSource(): boolean {
  try {
    if (!map.isStyleLoaded()) return false;
    if (map.getSource("terrain-dem")) return true;
    map.addSource("terrain-dem", {
      type: "raster-dem",
      url: "https://tiles.mapterhorn.com/tilejson.json",
    });
    const labelLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
    map.addLayer(
      {
        id: "terrain-hillshade",
        type: "hillshade",
        source: "terrain-dem",
        layout: { visibility: "none" },
        paint: {
          "hillshade-exaggeration": 0.48,
          "hillshade-illumination-direction": 315,
          "hillshade-illumination-anchor": "map",
          "hillshade-shadow-color": "rgba(25, 43, 49, 0.34)",
          "hillshade-highlight-color": "rgba(255, 255, 255, 0.16)",
          "hillshade-accent-color": "rgba(37, 57, 62, 0.2)",
        },
      },
      labelLayer,
    );
    return true;
  } catch {
    return false;
  }
}

function bringHillshadeAboveGeology() {
  if (!map.isStyleLoaded()) return;
  const labelLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  if (map.getLayer("terrain-hillshade") && labelLayer) map.moveLayer("terrain-hillshade", labelLayer);
}

function setTopography(visible: boolean) {
  $("topographyToggle").setAttribute("aria-pressed", String(visible));
  $("terrainAttribution").hidden = !visible && !state.view3d;
  if (ensureTerrainSource() && map.getLayer("terrain-hillshade")) {
    map.setLayoutProperty("terrain-hillshade", "visibility", visible ? "visible" : "none");
  }
}

let terrainTransition = 0;
function set3D(enabled: boolean) {
  const transitionId = ++terrainTransition;
  map.stop();
  const ready = ensureTerrainSource();
  if (enabled) {
    state.topo = true;
    setTopography(true);
    if (ready) {
      const animate = () => {
        if (transitionId !== terrainTransition) return;
        try {
          map.setTerrain({ source: "terrain-dem", exaggeration: 1.6 });
          map.easeTo({ pitch: 58, bearing: 0, duration: 1100, essential: true });
        } catch {
          // Style belum siap
        }
      };
      if (map.isSourceLoaded("terrain-dem")) animate();
      else {
        let done = false;
        let fallback = 0;
        const cleanup = () => {
          if (done) return;
          done = true;
          map.off("sourcedata", startWhenReady);
          window.clearTimeout(fallback);
        };
        const startWhenReady = (event: maplibregl.MapSourceDataEvent) => {
          if (transitionId !== terrainTransition) {
            cleanup();
            return;
          }
          if (event.sourceId === "terrain-dem" && map.isSourceLoaded("terrain-dem")) {
            cleanup();
            animate();
          }
        };
        map.on("sourcedata", startWhenReady);
        fallback = window.setTimeout(() => {
          if (transitionId !== terrainTransition) {
            cleanup();
            return;
          }
          cleanup();
          state.view3d = false;
          $("terrainView").setAttribute("aria-pressed", "false");
          $("planView").setAttribute("aria-pressed", "true");
          syncOrientationControls();
          map.easeTo({ pitch: 0, duration: 500, essential: true });
          writeState(state);
          toast(t("terrainFail"));
        }, 7000);
      }
    }
  } else if (ready) {
    const flatten = () => {
      try {
        if (transitionId === terrainTransition && map.isStyleLoaded()) map.setTerrain(null);
      } catch {
        // Style belum siap
      }
    };
    if (map.getPitch() < 0.5) flatten();
    else {
      map.once("moveend", flatten);
      map.easeTo({ pitch: 0, bearing: 0, duration: 850, essential: true });
    }
  }
  $("terrainView").setAttribute("aria-pressed", String(enabled));
  $("planView").setAttribute("aria-pressed", String(!enabled));
  $("terrainAttribution").hidden = !enabled && !state.topo;
  state.view3d = enabled;
  writeState(state);
  syncOrientationControls();
  if (enabled && map.getZoom() < 6) toast(t("terrainZoomHint"));
}

$("planView").addEventListener("click", () => set3D(false));
$("terrainView").addEventListener("click", () => set3D(true));
function syncOrientationControls() {
  $<HTMLButtonElement>("tiltUp").disabled = !state.view3d;
  $<HTMLButtonElement>("tiltDown").disabled = !state.view3d;
  $("mapControls").classList.toggle("is-3d", state.view3d);
  document.documentElement.style.setProperty("--detail-top", state.view3d ? "106px" : "64px");
}
const rotateBy = (degrees: number) => map.easeTo({ bearing: map.getBearing() + degrees, duration: 420, essential: true });
const resetNorthAndTilt = () => {
  pushViewHistory();
  map.easeTo({ bearing: 0, pitch: state.view3d ? 50 : 0, duration: 500, essential: true });
};
$("rotateLeft").addEventListener("click", () => rotateBy(-30));
$("rotateRight").addEventListener("click", () => rotateBy(30));
$("resetNorth").addEventListener("click", resetNorthAndTilt);
$("compassNorthBtn").addEventListener("click", () => {
  pushViewHistory();
  map.easeTo({ bearing: 0, pitch: 0, duration: 500, essential: true });
});
$("tiltUp").addEventListener("click", () => {
  if (state.view3d) map.easeTo({ pitch: Math.min(70, map.getPitch() + 8), duration: 420, essential: true });
});
$("tiltDown").addEventListener("click", () => {
  if (state.view3d) map.easeTo({ pitch: Math.max(28, map.getPitch() - 8), duration: 420, essential: true });
});
map.on("rotate", () => {
  const rot = "rotate(" + -map.getBearing() + "deg)";
  $("resetNorth").style.transform = rot;
  $("compassArrow").style.transform = rot;
});

// ---------- Riwayat Navigasi Kamera (Back / Previous View) ----------
interface CameraSnapshot {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}
const viewHistory: CameraSnapshot[] = [];
let suppressHistoryCapture = false;

function captureCurrentCamera(): CameraSnapshot {
  const c = map.getCenter();
  return {
    center: [Number(c.lng.toFixed(4)), Number(c.lat.toFixed(4))],
    zoom: Number(map.getZoom().toFixed(2)),
    bearing: Number(map.getBearing().toFixed(1)),
    pitch: Number(map.getPitch().toFixed(1)),
  };
}

function pushViewHistory() {
  if (suppressHistoryCapture) return;
  const snap = captureCurrentCamera();
  const last = viewHistory[viewHistory.length - 1];
  if (
    last &&
    Math.abs(last.center[0] - snap.center[0]) < 0.005 &&
    Math.abs(last.center[1] - snap.center[1]) < 0.005 &&
    Math.abs(last.zoom - snap.zoom) < 0.08
  ) {
    return;
  }
  viewHistory.push(snap);
  if (viewHistory.length > 25) viewHistory.shift();
  $<HTMLButtonElement>("navBack").disabled = viewHistory.length === 0;
}

map.on("dragstart", pushViewHistory);
map.on("zoomstart", (e) => {
  if (e.originalEvent) pushViewHistory();
});

$("navBack").addEventListener("click", () => {
  const prev = viewHistory.pop();
  $<HTMLButtonElement>("navBack").disabled = viewHistory.length === 0;
  if (!prev) return;
  suppressHistoryCapture = true;
  map.easeTo({
    center: prev.center,
    zoom: prev.zoom,
    bearing: prev.bearing,
    pitch: prev.pitch,
    duration: 650,
    essential: true,
  });
  map.once("moveend", () => {
    suppressHistoryCapture = false;
  });
});
$("topographyToggle").addEventListener("click", () => {
  state.topo = !state.topo;
  setTopography(state.topo);
  writeState(state);
  $("toolsMenu").removeAttribute("open");
});

const toolsMenu = $<HTMLDetailsElement>("toolsMenu");
document.addEventListener("pointerdown", (event) => {
  if (toolsMenu.open && !toolsMenu.contains(event.target as Node)) toolsMenu.open = false;
});

let toastTimer: number | undefined;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

// ---------- Basemap Switcher ----------
function syncBasemapButtons() {
  document.querySelectorAll<HTMLButtonElement>("#basemapGroup button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.base === state.basemap));
  });
}

function setupGeologyOnMap() {
  ensureTerrainSource();
  if (state.view3d) state.topo = true;
  addGeologyLayers(map);
  bringHillshadeAboveGeology();
  if (state.topo) setTopography(true);
  if (state.view3d) set3D(true);
  setColorMode(map, state.mode);
  applyFiltersToMap();
  setLinesVisible(map, state.lines);
  transect.refresh();
  shpImport.refresh();
  syncOrientationControls();
  $("opacityValue").textContent = state.geologyOpacity + "%";
}

document.querySelectorAll<HTMLButtonElement>("#basemapGroup button").forEach((b) => {
  b.addEventListener("click", () => {
    const nextBase = (b.dataset.base as BasemapId) || "light";
    if (nextBase === state.basemap) return;
    state.basemap = nextBase;
    if (nextBase === "topo") state.topo = true;
    syncBasemapButtons();
    writeState(state);
    toolsMenu.open = false;
    map.setStyle(BASEMAPS[nextBase]);
    map.once("style.load", setupGeologyOnMap);
  });
});

// ---------- Ekspor PNG & PDF Publikasi ----------
function composeExport(): HTMLCanvasElement {
  const source = map.getCanvas();
  const mapEl = map.getContainer();
  const scaleRatio = source.width / mapEl.clientWidth;
  const mapWidth = mapEl.clientWidth;
  const mapHeight = mapEl.clientHeight;
  const legendWidth = 300;
  const headerHeight = 82;
  const footerHeight = 114;
  const layoutWidth = mapWidth + legendWidth;
  const legend = $("legend");
  const items = [...legend.querySelectorAll("li")];
  const out = document.createElement("canvas");
  out.width = Math.round(layoutWidth * scaleRatio);
  out.height = Math.round((mapHeight + headerHeight + footerHeight) * scaleRatio);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.scale(scaleRatio, scaleRatio);
  ctx.fillStyle = "#f4f6f4";
  ctx.fillRect(0, 0, layoutWidth, mapHeight + headerHeight + footerHeight);
  ctx.fillStyle = "#1f3b48";
  ctx.fillRect(0, 0, layoutWidth, headerHeight);
  ctx.fillStyle = "#fff";
  ctx.font = "700 22px Instrument Sans, sans-serif";
  ctx.fillText("Orebit GeoAtlas", 24, 31);
  ctx.font = "400 12px Instrument Sans, sans-serif";
  const c = map.getCenter();
  const mode = state.mode === "age" ? (getLang() === "id" ? "Umur geologi" : "Geologic age") : getLang() === "id" ? "Litologi" : "Lithology";
  const ageStr = state.ageMin === 0 && state.ageMax >= CONFIG.ageMaxMa ? "0–600+ Ma" : `${state.ageMin}–${state.ageMax} Ma`;
  const lithStr = state.lithFilter ? ` · ${state.lithFilter}` : "";
  const meta = `${mode} · ${ageStr}${lithStr} · ${map.getPitch() > 0 ? "3D" : "2D"} · ${c.lat.toFixed(4)}°, ${c.lng.toFixed(4)}° · z${map.getZoom().toFixed(1)} · ${new Date().toISOString().slice(0, 10)}`;
  ctx.fillText(meta, 24, 58, layoutWidth - 48);
  ctx.drawImage(source, 0, headerHeight, mapWidth, mapHeight);

  // Kompas arah utara pada kanvas peta
  const compX = mapWidth - 34;
  const compY = headerHeight + 34;
  ctx.save();
  ctx.translate(compX, compY);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1f3b48";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.rotate((-map.getBearing() * Math.PI) / 180);
  ctx.fillStyle = "#c93b2b";
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(5, 3);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1f3b48";
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(-5, 3);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.font = "700 9px Instrument Sans, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, 14);
  ctx.restore();

  // Skala bar grafis (km) terkalibrasi di pojok kiri bawah peta
  const metersPerPx = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** map.getZoom();
  const targetKm = (metersPerPx * 110) / 1000;
  const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const barKm = niceSteps.find((s) => s >= targetKm * 0.6) ?? 100;
  const barPx = Math.max(36, Math.min(180, (barKm * 1000) / metersPerPx));
  const barX = 18;
  const barY = headerHeight + mapHeight - 24;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(barX - 6, barY - 18, barPx + 24, 26);
  ctx.strokeStyle = "#1f3b48";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barPx, barY);
  ctx.moveTo(barX, barY - 4);
  ctx.lineTo(barX, barY + 2);
  ctx.moveTo(barX + barPx, barY - 4);
  ctx.lineTo(barX + barPx, barY + 2);
  ctx.stroke();
  ctx.fillStyle = "#1f3b48";
  ctx.font = "600 10px Instrument Sans, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${barKm} km`, barX + 4, barY - 6);

  const legendX = mapWidth;
  ctx.fillStyle = "#fff";
  ctx.fillRect(legendX, headerHeight, legendWidth, mapHeight);
  ctx.strokeStyle = "#d6dde1";
  ctx.beginPath();
  ctx.moveTo(legendX, headerHeight);
  ctx.lineTo(legendX, headerHeight + mapHeight);
  ctx.stroke();
  const legendTitle = legend.querySelector("h2")?.textContent || (getLang() === "id" ? "Legenda" : "Legend");
  ctx.fillStyle = "#1f3b48";
  ctx.font = "700 14px Instrument Sans, sans-serif";
  ctx.fillText(legendTitle, legendX + 20, headerHeight + 34, legendWidth - 36);
  let itemY = headerHeight + 65;
  const rowHeight = items.length ? Math.min(27, Math.max(11, (mapHeight - 86) / items.length)) : 27;
  const legendBottom = headerHeight + mapHeight - 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(legendX + 8, headerHeight + 48, legendWidth - 16, Math.max(0, mapHeight - 56));
  ctx.clip();
  for (const item of items) {
    const spans = [...item.querySelectorAll("span")];
    const chip = spans[0];
    const label = spans[1]?.textContent?.trim() ?? "";
    const age = spans[2]?.textContent?.trim() ?? "";
    const fontSize = Math.max(8.5, Math.min(12, rowHeight * 0.48));
    ctx.fillStyle = chip ? getComputedStyle(chip).backgroundColor : "#9aa8ad";
    const chipSize = Math.min(15, Math.max(7, rowHeight - 5));
    ctx.fillRect(legendX + 22, itemY - chipSize * 0.72, chipSize, chipSize);
    ctx.fillStyle = "#263942";
    ctx.font = `500 ${fontSize}px Instrument Sans, sans-serif`;
    const labelX = legendX + 48;
    const rightEdge = legendX + legendWidth - 18;
    const maxLabelWidth = Math.max(24, rightEdge - labelX - (age ? 54 : 0));
    let fittedLabel = label;
    while (fittedLabel.length > 3 && ctx.measureText(fittedLabel).width > maxLabelWidth) {
      fittedLabel = `${fittedLabel.slice(0, -2).trimEnd()}…`;
    }
    ctx.fillText(fittedLabel, labelX, itemY, maxLabelWidth);
    if (age) {
      ctx.fillStyle = "#64747c";
      ctx.font = "400 10px Instrument Sans, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(age, rightEdge, itemY, 50);
      ctx.textAlign = "left";
    }
    itemY += rowHeight;
    if (itemY > legendBottom) break;
  }
  ctx.restore();

  const footerY = headerHeight + mapHeight;
  ctx.fillStyle = "#f4f6f4";
  ctx.fillRect(0, footerY, layoutWidth, footerHeight);
  ctx.strokeStyle = "#d6dde1";
  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(layoutWidth, footerY);
  ctx.stroke();
  const wrapText = (text: string, maxWidth: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const footerLines: string[] = [];
  ctx.fillStyle = "#41535c";
  ctx.font = "500 10px Instrument Sans, sans-serif";
  footerLines.push(...wrapText("Geologi: Macrostrat (CC BY 4.0) · Katalog Nasional 8 Wilayah: Pusat Survei Geologi, Badan Geologi, ESDM", layoutWidth - 44));
  const terrainCredit = state.topo || state.view3d ? " · Elevasi: © Mapterhorn" : "";
  footerLines.push(...wrapText("Peta dasar: OpenFreeMap · © OpenMapTiles · © OpenStreetMap" + terrainCredit, layoutWidth - 44));
  ctx.fillStyle = "#64747c";
  ctx.font = "400 9px Instrument Sans, sans-serif";
  footerLines.push(...wrapText("Peta ini bersifat generalisasi dan bukan peta resmi untuk keputusan teknis. Rujuk lembar asli Badan Geologi.", layoutWidth - 44));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, footerY + 8, layoutWidth, footerHeight - 12);
  ctx.clip();
  let footerTextY = footerY + 24;
  for (let i = 0; i < footerLines.length; i++) {
    if (i > 0 && i === footerLines.length - 1) {
      ctx.fillStyle = "#64747c";
      ctx.font = "400 9px Instrument Sans, sans-serif";
    }
    ctx.fillText(footerLines[i], 22, footerTextY, layoutWidth - 44);
    footerTextY += 15;
  }
  ctx.restore();
  return out;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function pdfFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const width = canvas.width,
    height = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let src = 0, dst = 0; src < rgba.length; src += 4) {
    rgb[dst++] = rgba[src];
    rgb[dst++] = rgba[src + 1];
    rgb[dst++] = rgba[src + 2];
  }
  const compressor = new CompressionStream("deflate");
  const writer = compressor.writable.getWriter();
  const compressedPromise = new Response(compressor.readable).arrayBuffer();
  await writer.write(rgb);
  await writer.close();
  const pixels = new Uint8Array(await compressedPromise);
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const add = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };
  const offsets = [0];
  add(enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
  const obj = (n: number, body: string) => {
    offsets[n] = offset;
    add(enc.encode(`${n} 0 obj\n${body}\nendobj\n`));
  };
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const landscape = width / height > 1.25;
  const pageWidth = landscape ? 842 : 595,
    pageHeight = landscape ? 595 : 842;
  const fit = Math.min(pageWidth / width, pageHeight / height);
  const drawWidth = width * fit,
    drawHeight = height * fit;
  const imageX = (pageWidth - drawWidth) / 2,
    imageY = (pageHeight - drawHeight) / 2;
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = offset;
  add(enc.encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`));
  add(pixels);
  add(enc.encode("\nendstream\nendobj\n"));
  const content = enc.encode(`q ${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${imageX.toFixed(3)} ${imageY.toFixed(3)} cm /Im0 Do Q`);
  offsets[5] = offset;
  add(enc.encode(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`));
  add(content);
  add(enc.encode("\nendstream\nendobj\n"));
  const xref = offset;
  add(enc.encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  const bytes = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  }
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

for (const format of ["png", "pdf"] as const) {
  const button = $<HTMLButtonElement>(`export${format.toUpperCase()}`);
  button.addEventListener("click", async () => {
    toolsMenu.open = false;
    button.disabled = true;
    toast(t("exportWorking"));
    try {
      if (!map.loaded()) await new Promise<void>((resolve) => map.once("idle", () => resolve()));
      const image = composeExport();
      const filename = `orebit-geoatlas-${new Date().toISOString().slice(0, 10)}.${format}`;
      if (format === "png") {
        const blob = await new Promise<Blob | null>((resolve) => image.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("PNG encoding failed");
        saveBlob(blob, filename);
      } else saveBlob(await pdfFromCanvas(image), filename);
      toast(t("exportDone"));
    } catch {
      toast(t("exportFail"));
    } finally {
      button.disabled = false;
    }
  });
}

let meMarker: maplibregl.Marker | undefined;
$("locateBtn").addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    toast(t("locateFail"));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const at: [number, number] = [coords.longitude, coords.latitude];
      if (!meMarker) {
        const dot = document.createElement("div");
        dot.className = "me-dot";
        meMarker = new maplibregl.Marker({ element: dot });
      }
      meMarker.setLngLat(at).addTo(map);
      map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 11) });
    },
    () => toast(t("locateFail")),
    { enableHighAccuracy: false, timeout: 10000 },
  );
});

// ---------- Island Quick-Jump Bar ----------
function renderRegionBar() {
  const bar = $("regionBar");
  const lang = getLang();
  const activeRegion = state.region ?? "all";
  bar.innerHTML = "";
  for (const r of REGIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "region-chip";
    btn.dataset.region = r.id;
    btn.textContent = lang === "id" ? r.labelId : r.labelEn;
    btn.setAttribute("aria-pressed", String(activeRegion === r.id));
    btn.addEventListener("click", () => {
      pushViewHistory();
      state.region = r.id;
      writeState(state);
      renderRegionBar();
      map.fitBounds(r.bbox, { padding: isMobile() ? 24 : 48, duration: 900 });
    });
    bar.append(btn);
  }
}

// ---------- Era Preset Chips ----------
function renderEraBar() {
  const bar = $("eraBar");
  const lang = getLang();
  bar.innerHTML = "";
  for (const era of ERA_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "era-chip";
    btn.dataset.era = era.id;
    btn.textContent = lang === "id" ? era.labelId : era.labelEn;
    const isActive = Math.abs(state.ageMin - era.top) < 0.05 && Math.abs(state.ageMax - era.base) < 0.05;
    btn.setAttribute("aria-pressed", String(isActive));
    btn.addEventListener("click", () => {
      state.ageMin = era.top;
      state.ageMax = era.base;
      ageMin.value = String(Math.round(era.top));
      ageMax.value = String(Math.round(era.base));
      updateAgeReadout();
      applyFiltersToMap();
      renderEraBar();
      syncLegend();
      syncActiveFilterBar();
      writeState(state);
    });
    bar.append(btn);
  }
}

// ---------- Filter aktif & Reset ----------
const effectiveMax = (b: number) => (b >= CONFIG.ageMaxMa ? 5000 : b);

function applyFiltersToMap() {
  applyGeologyFilters(map, {
    ageMin: state.ageMin,
    ageMax: effectiveMax(state.ageMax),
    lithFilter: state.lithFilter,
    confFilter: state.confFilter,
    opacity: state.geologyOpacity / 100,
  });
}

function syncActiveFilterBar() {
  const bar = $("activeFilterBar");
  const text = $("activeFilterText");
  const hasAge = state.ageMin > 0 || state.ageMax < CONFIG.ageMaxMa;
  const hasLith = Boolean(state.lithFilter);
  const hasConf = state.confFilter !== "all";
  const parts: string[] = [];
  if (hasAge) parts.push(`${state.ageMin}–${state.ageMax}${state.ageMax >= CONFIG.ageMaxMa ? "+" : ""} ${t("ma")}`);
  if (hasLith && state.lithFilter) parts.push(state.lithFilter);
  if (hasConf) parts.push(state.confFilter);
  bar.hidden = parts.length === 0;
  text.textContent = `${t("activeFilterLabel")}: ${parts.join(" · ")}`;
}

function resetAllFilters() {
  state.ageMin = 0;
  state.ageMax = CONFIG.ageMaxMa;
  state.lithFilter = undefined;
  state.confFilter = "all";
  ageMin.value = "0";
  ageMax.value = String(CONFIG.ageMaxMa);
  updateAgeReadout();
  syncConfButtons();
  renderEraBar();
  syncLegend();
  applyFiltersToMap();
  syncActiveFilterBar();
  writeState(state);
}

$("resetFiltersBtn").addEventListener("click", resetAllFilters);

// ---------- Teks antarmuka ----------
const TEXT_IDS: Record<string, Key> = {
  "t-tagline": "tagline",
  "t-searchLabel": "searchLabel",
  "t-colorBy": "colorBy",
  "t-modeAge": "modeAge",
  "t-modeLith": "modeLith",
  "t-ageFilter": "ageFilter",
  "t-confTitle": "confTitle",
  "t-confAll": "confAll",
  "t-confCurated": "confCurated",
  "t-confReview": "confReview",
  "t-lines": "lines",
  "t-disclaimer": "disclaimer",
  "t-basemapTitle": "basemapTitle",
  "t-baseLight": "baseLight",
  "t-baseDark": "baseDark",
  "t-baseTopo": "baseTopo",
  aboutBtn: "about",
  aboutClose: "close",
  githubLink: "github",
  detailCopy: "copyLink",
  detailFocus: "focusFeature",
  detailGeoJSON: "downloadGeojson",
  detailReport: "reportIssue",
  resetFiltersBtn: "resetFilters",
  transectTitle: "transectTitle",
  transectClear: "transectClear",
  transectExport: "transectExportCsv",
  transectExportSvg: "transectExportSvg",
  transectVeLabel: "transectVe",
  snapPeek: "sheetSnapPeek",
  snapHalf: "sheetSnapHalf",
  snapFull: "sheetSnapFull",
  "t-shpTitle": "shpTitle",
  "t-shpHint": "shpHint",
  shpImportBtn: "shpImportBtn",
  shpFocusBtn: "shpFocusBtn",
  shpClearBtn: "shpClearBtn",
};
const LABEL_IDS: Record<string, Key> = {
  zoomIn: "zoomIn",
  zoomOut: "zoomOut",
  navBack: "navBack",
  compassNorthBtn: "navNorthUp",
  locateBtn: "locate",
  transectBtn: "transectBtn",
  detailClose: "closeDetail",
  sheetHandle: "togglePanel",
  langBtn: "switchLang",
  planView: "planView",
  terrainView: "terrainView",
  topographyToggle: "topography",
  rotateLeft: "rotateLeft",
  rotateRight: "rotateRight",
  resetNorth: "resetNorth",
  tiltUp: "tiltUp",
  tiltDown: "tiltDown",
  searchClear: "clearSearch",
};

function syncLegend() {
  renderLegend({
    mode: state.mode,
    fine: isFineZoom(map.getZoom()),
    activeAgeMin: state.ageMin,
    activeAgeMax: state.ageMax,
    activeLith: state.lithFilter,
    onSelectAge: (top, base) => {
      const same = Math.abs(state.ageMin - top) < 0.05 && Math.abs(state.ageMax - base) < 0.05;
      state.ageMin = same ? 0 : top;
      state.ageMax = same ? CONFIG.ageMaxMa : base;
      ageMin.value = String(Math.round(state.ageMin));
      ageMax.value = String(Math.round(state.ageMax));
      updateAgeReadout();
      renderEraBar();
      syncLegend();
      applyFiltersToMap();
      syncActiveFilterBar();
      writeState(state);
    },
    onSelectLith: (id) => {
      state.lithFilter = state.lithFilter === id ? undefined : id;
      syncLegend();
      applyFiltersToMap();
      syncActiveFilterBar();
      writeState(state);
    },
  });
}

function applyText() {
  for (const [id, key] of Object.entries(TEXT_IDS)) $(id).textContent = t(key);
  for (const [id, key] of Object.entries(LABEL_IDS)) $(id).setAttribute("aria-label", t(key));
  $<HTMLInputElement>("searchInput").placeholder = t("searchPlaceholder");
  $("langBtn").textContent = getLang() === "id" ? "EN" : "ID";
  $("topographyToggle").textContent = getLang() === "id" ? "Topografi" : "Terrain";
  $("toolsSummary").textContent = getLang() === "id" ? "Alat" : "Tools";
  $("toolsSummary").setAttribute("aria-label", getLang() === "id" ? "Lapisan terrain dan ekspor" : "Terrain and export tools");
  $("toolsSummary").title = getLang() === "id" ? "Lapisan dan ekspor" : "Layers and export";
  $("transectBtn").title = t("transectBtn");
  $("coordBar").title = t("copyCoordHint");
  updatePanelToggleLabel();
  $("opacityLabel").textContent = t("opacity");
  $("opacityHint").textContent = t("opacityHint");
  renderRegionBar();
  renderEraBar();
  syncLegend();
  syncActiveFilterBar();
  renderAbout();
  updateSheetHint();
  updateAgeReadout();
  if (activeFeature && !$<HTMLElement>("detail").hidden) selectFeature(activeFeature, activeNearbyLines);
  else if (activeIndexUnit && !$<HTMLElement>("detail").hidden) selectIndexUnit(activeIndexUnit);
  transect.refresh();
  shpImport.refresh();
}

function updateSheetHint() {
  $("sheetHint").textContent = t(state.mode === "age" ? "sheetHintAge" : "sheetHintLith");
}

// ---------- Filter umur ----------
const ageMin = $<HTMLInputElement>("ageMin");
const ageMax = $<HTMLInputElement>("ageMax");
ageMin.max = ageMax.max = String(CONFIG.ageMaxMa);
ageMin.value = String(Math.round(state.ageMin));
ageMax.value = String(Math.round(state.ageMax));

function updateAgeReadout() {
  const lang = getLang();
  const fmt = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 2 });
  $("ageReadout").textContent = `${fmt(state.ageMin)}–${fmt(state.ageMax)}${state.ageMax >= CONFIG.ageMaxMa ? "+" : ""} ${t("ma")}`;
  const fill = $("ageFill");
  const lo = (state.ageMin / CONFIG.ageMaxMa) * 100;
  const hi = (state.ageMax / CONFIG.ageMaxMa) * 100;
  fill.style.left = `calc(${lo}% + ${9 - lo * 0.18}px)`;
  fill.style.width = `calc(${hi - lo}% - ${(hi - lo) * 0.18}px)`;
}

function onAgeInput(e: Event) {
  let a = Number(ageMin.value),
    b = Number(ageMax.value);
  if (a > b) {
    if (e.target === ageMin) b = a;
    else a = b;
    ageMin.value = String(a);
    ageMax.value = String(b);
  }
  state.ageMin = a;
  state.ageMax = b;
  updateAgeReadout();
  renderEraBar();
  syncLegend();
  applyFiltersToMap();
  syncActiveFilterBar();
  writeState(state);
}
ageMin.addEventListener("input", onAgeInput);
ageMax.addEventListener("input", onAgeInput);

const geologyOpacity = $<HTMLInputElement>("geologyOpacity");
geologyOpacity.value = String(state.geologyOpacity);
function updateGeologyOpacity() {
  state.geologyOpacity = Number(geologyOpacity.value);
  $("opacityValue").textContent = state.geologyOpacity + "%";
  applyFiltersToMap();
  writeState(state);
}
geologyOpacity.addEventListener("input", updateGeologyOpacity);

// ---------- Filter confidence ----------
function syncConfButtons() {
  document.querySelectorAll<HTMLButtonElement>("#confGroup button").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.conf === state.confFilter));
  });
}
document.querySelectorAll<HTMLButtonElement>("#confGroup button").forEach((b) => {
  b.addEventListener("click", () => {
    state.confFilter = (b.dataset.conf as ConfidenceFilter) || "all";
    syncConfButtons();
    applyFiltersToMap();
    syncActiveFilterBar();
    writeState(state);
  });
});

// ---------- Mode warna ----------
const modeButtons = document.querySelectorAll<HTMLButtonElement>("#modeGroup button");
function applyMode() {
  modeButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
  syncLegend();
  updateSheetHint();
  setColorMode(map, state.mode);
}
modeButtons.forEach((b) =>
  b.addEventListener("click", () => {
    state.mode = b.dataset.mode === "lith" ? "lith" : "age";
    applyMode();
    writeState(state);
  }),
);
modeButtons.forEach((b, index) =>
  b.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? modeButtons.length - 1 : (index + (e.key === "ArrowLeft" ? -1 : 1) + modeButtons.length) % modeButtons.length;
    modeButtons[next].focus();
    modeButtons[next].click();
  }),
);

// ---------- Layer struktur ----------
const linesToggle = $<HTMLInputElement>("linesToggle");
linesToggle.checked = state.lines;
linesToggle.addEventListener("change", () => {
  state.lines = linesToggle.checked;
  setLinesVisible(map, state.lines);
  writeState(state);
});

// ---------- Bahasa ----------
$("langBtn").addEventListener("click", () => {
  state.lang = getLang() === "id" ? "en" : "id";
  setLang(state.lang);
  applyText();
  writeState(state);
});

// ---------- Panel seluler 3-snap-point (peek / half / full) ----------
const panel = $("panel");
type SnapPoint = "peek" | "half" | "full";
let currentSnap: SnapPoint = "peek";

function setSnap(snap: SnapPoint) {
  currentSnap = snap;
  panel.dataset.snap = snap;
  document.documentElement.style.setProperty(
    "--sheet-h",
    snap === "peek" ? "calc(154px + env(safe-area-inset-bottom, 0px))" : snap === "half" ? "54dvh" : "86dvh",
  );
  panel.classList.toggle("collapsed", snap === "peek");
  $("sheetHandle").setAttribute("aria-expanded", String(snap !== "peek"));
  document.querySelectorAll<HTMLButtonElement>("#sheetSnapBtns button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.snap === snap));
  });
}

document.querySelectorAll<HTMLButtonElement>("#sheetSnapBtns button").forEach((b) => {
  b.addEventListener("click", () => setSnap((b.dataset.snap as SnapPoint) || "peek"));
});

function updatePanelToggleLabel() {
  const collapsed = $("panelToggle").getAttribute("aria-expanded") !== "true";
  const label = getLang() === "id" ? (collapsed ? "Tampilkan panel kontrol" : "Minimalkan panel kontrol") : collapsed ? "Restore control panel" : "Minimize control panel";
  $("panelToggle").setAttribute("aria-label", label);
  $("panelToggle").title = label;
}
$("panelToggle").addEventListener("click", () => {
  const collapsed = panel.classList.toggle("compact");
  $("panelToggle").setAttribute("aria-expanded", String(!collapsed));
  updatePanelToggleLabel();
});

const sheetHandle = $("sheetHandle");
let sheetPointerStart: number | undefined;
let skipSheetClick = false;
sheetHandle.addEventListener("pointerdown", (event) => {
  sheetHandle.setPointerCapture(event.pointerId);
  sheetPointerStart = event.clientY;
  skipSheetClick = false;
});
sheetHandle.addEventListener("pointerup", (event) => {
  if (sheetPointerStart === undefined) return;
  const distance = event.clientY - sheetPointerStart;
  sheetPointerStart = undefined;
  if (Math.abs(distance) < 28) return;
  skipSheetClick = true;
  if (distance < 0) setSnap(currentSnap === "peek" ? "half" : "full");
  else setSnap(currentSnap === "full" ? "half" : "peek");
});
sheetHandle.addEventListener("pointercancel", () => {
  sheetPointerStart = undefined;
});
sheetHandle.addEventListener("click", () => {
  if (skipSheetClick) {
    skipSheetClick = false;
    return;
  }
  setSnap(currentSnap === "peek" ? "half" : "peek");
});

// ---------- Detail unit & GeoJSON download ----------
let activeFeature: maplibregl.MapGeoJSONFeature | null = null;
let activeNearbyLines: maplibregl.MapGeoJSONFeature[] | undefined;
let activeIndexUnit: NationalUnit | null = null;

function selectFeature(f: maplibregl.MapGeoJSONFeature, nearbyLines?: maplibregl.MapGeoJSONFeature[]) {
  transect.hide();
  activeFeature = f;
  activeIndexUnit = null;
  activeNearbyLines = nearbyLines;
  highlight(map, f);
  showDetail(
    f,
    nearbyLines?.map((line) => ({
      type: line.properties?.type,
      certainty: line.properties?.certainty,
      source: line.source,
    })),
  );
  if (isMobile()) setSnap("peek");
}

function selectIndexUnit(u: NationalUnit) {
  transect.hide();
  activeFeature = null;
  activeNearbyLines = undefined;
  activeIndexUnit = u;
  highlight(map, null);
  showIndexUnitDetail(u);
  if (isMobile()) setSnap("peek");
}

$("detailClose").addEventListener("click", () => {
  hideDetail();
  highlight(map, null);
  activeFeature = null;
  activeIndexUnit = null;
  activeNearbyLines = undefined;
});

$("detailFocus").addEventListener("click", () => {
  if (activeIndexUnit) {
    const [w, s, e, n] = activeIndexUnit.bbox;
    map.fitBounds([[w, s], [e, n]], { maxZoom: 11, padding: 60, duration: 800 });
    return;
  }
  if (!activeFeature) return;
  const points: [number, number][] = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      if (Number.isFinite(value[0]) && Number.isFinite(value[1])) points.push([value[0], value[1]]);
      return;
    }
    value.forEach(visit);
  };
  visit((activeFeature.geometry as { coordinates?: unknown }).coordinates);
  if (!points.length) return;
  const bounds = new maplibregl.LngLatBounds();
  points.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, {
    padding: isMobile() ? { top: 250, right: 28, bottom: 130, left: 28 } : { top: 48, right: 380, bottom: 48, left: 380 },
    maxZoom: 12.5,
    duration: 800,
  });
});

$("detailGeoJSON").addEventListener("click", () => {
  let fc: { type: "FeatureCollection"; features: Array<{ type: "Feature"; properties: Record<string, unknown>; geometry: unknown }> } | null = null;
  let slug = "unit";
  if (activeFeature) {
    slug = String(activeFeature.properties?.unit_id || activeFeature.properties?.symbol || "unit").toLowerCase();
    fc = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { ...(activeFeature.properties ?? {}) }, geometry: activeFeature.geometry }],
    };
  } else if (activeIndexUnit) {
    const [w, s, e, n] = activeIndexUnit.bbox;
    slug = activeIndexUnit.unit_id.toLowerCase();
    fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { ...activeIndexUnit },
          geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        },
      ],
    };
  }
  if (!fc) return;
  saveBlob(new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" }), `orebit-geoatlas-${slug}.geojson`);
});

$("detailCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast(t("copied"));
  } catch {
    toast(location.href);
  }
});

// ---------- Alat ukur & Lintasan Geologi ----------
const transect = createTransectController(
  map,
  (isActive) => {
    if (isActive) {
      hideDetail();
      hoverTip.hidden = true;
      if (isMobile()) setSnap("peek");
    }
  },
  getLoadedNationalUnits,
);

// ---------- Impor SHP / GeoJSON (Cek Lokasi) ----------
const shpImport = createShpImportController(map, pushViewHistory, toast, getLoadedNationalUnits);

// ---------- Tentang & sumber ----------
const about = $<HTMLDialogElement>("aboutDialog");
$("aboutBtn").addEventListener("click", () => about.showModal());
about.addEventListener("click", (e) => {
  if (e.target === about) about.close();
});

// ---------- Escape handler terpadu ----------
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (toolsMenu.open) {
    toolsMenu.open = false;
    $("toolsSummary").focus();
  } else if (transect.isActive() || !$<HTMLElement>("transectPanel").hidden) {
    transect.hide();
    $("transectBtn").focus();
  } else if (!$<HTMLElement>("detail").hidden) {
    hideDetail();
    highlight(map, null);
    activeFeature = null;
    activeIndexUnit = null;
  }
});

// ---------- Peta ----------
map.on("load", () => {
  syncBasemapButtons();
  setupGeologyOnMap();
});

let lastFine = isFineZoom(map.getZoom());
map.on("zoom", () => {
  const fine = isFineZoom(map.getZoom());
  if (fine !== lastFine) {
    lastFine = fine;
    syncLegend();
  }
});

const queryLayers = () => {
  try {
    return map.isStyleLoaded() ? QUERY_LAYERS.filter((id) => Boolean(map.getLayer(id))) : [];
  } catch {
    return [];
  }
};
map.on("click", (e) => {
  if (transect.isActive()) {
    transect.addPoint(e.lngLat.lng, e.lngLat.lat);
    return;
  }
  const ql = queryLayers();
  const f = ql.length ? map.queryRenderedFeatures(e.point, { layers: ql })[0] : undefined;
  if (!f) {
    hideDetail();
    highlight(map, null);
    activeFeature = null;
    activeIndexUnit = null;
    activeNearbyLines = undefined;
    return;
  }
  const lineLayers = map.isStyleLoaded() ? ["ob-lines", "ms-lines"].filter((id) => map.getLayer(id)) : [];
  const nearbyLines = lineLayers.length
    ? map.queryRenderedFeatures([[e.point.x - 14, e.point.y - 14], [e.point.x + 14, e.point.y + 14]], { layers: lineLayers })
    : [];
  selectFeature(f, nearbyLines);
});

const coordBar = $<HTMLButtonElement>("coordBar");
let lastCoordText = "";
function updateCoordBar(lat: number, lng: number) {
  lastCoordText = formatCoordReadout(lat, lng, map.getZoom());
  coordBar.textContent = lastCoordText;
}
coordBar.title = t("copyCoordHint");
coordBar.addEventListener("click", async () => {
  if (!lastCoordText) return;
  try {
    await navigator.clipboard.writeText(lastCoordText);
    toast(t("coordCopied"));
  } catch {
    toast(lastCoordText);
  }
});
const initC = map.getCenter();
updateCoordBar(initC.lat, initC.lng);
map.on("move", () => {
  if (isMobile()) {
    const c = map.getCenter();
    updateCoordBar(c.lat, c.lng);
  }
});
map.on("zoomend", () => {
  const c = map.getCenter();
  updateCoordBar(c.lat, c.lng);
});

const hoverTip = $<HTMLDivElement>("hoverTip");
map.on("mousemove", (e) => {
  updateCoordBar(e.lngLat.lat, e.lngLat.lng);
  if (transect.isActive()) {
    hoverTip.hidden = true;
    return;
  }
  const ql = queryLayers();
  const feature = ql.length ? map.queryRenderedFeatures(e.point, { layers: ql })[0] : undefined;
  map.getCanvas().style.cursor = feature ? "pointer" : "";
  if (!feature || isMobile()) {
    hoverTip.hidden = true;
    return;
  }
  const p = feature.properties as Record<string, unknown>;
  const title = String(p.formation || p.strat_name || p.name_orig || p.name || t("unnamed"));
  const age =
    feature.source === "orebit"
      ? [p.interval_base, p.interval_top].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ")
      : [p.b_int_name, p.t_int_name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ");
  hoverTip.textContent = title + (age ? "\n" + String(age) : "") + "\n" + t("hoverHint");
  hoverTip.hidden = false;
  const bounds = map.getContainer().getBoundingClientRect();
  const x = Math.min(e.point.x + 16, bounds.width - hoverTip.offsetWidth - 8);
  const y = Math.min(e.point.y + 16, bounds.height - hoverTip.offsetHeight - 8);
  hoverTip.style.left = Math.max(8, x) + "px";
  hoverTip.style.top = Math.max(8, y) + "px";
});
map.on("mouseout", () => {
  hoverTip.hidden = true;
  if (!transect.isActive()) map.getCanvas().style.cursor = "";
});

initSearch(map, {
  onResults: () => {
    if (isMobile() && currentSnap === "peek") setSnap("half");
  },
  onPickFeature: (f) => selectFeature(f),
  onPickIndexUnit: (u) => selectIndexUnit(u),
});

syncConfButtons();
syncBasemapButtons();
applyText();
applyMode();
if (isMobile()) setSnap("peek");
