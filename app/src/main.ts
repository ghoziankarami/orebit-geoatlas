import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import "./style.css";
import { renderAbout } from "./about";
import { CONFIG } from "./config";
import { hideDetail, showDetail } from "./detail";
import { getLang, setLang, t, type Key } from "./i18n";
import { addGeologyLayers, highlight, isFineZoom, QUERY_LAYERS, setAgeFilter, setColorMode, setLinesVisible } from "./layers";
import { renderLegend } from "./legend";
import { initSearch } from "./search";
import { readState, writeState } from "./state";

const state = readState();
setLang(state.lang ?? getLang());

maplibregl.addProtocol("pmtiles", new Protocol().tile);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const isMobile = () => matchMedia("(max-width: 640px)").matches;

const map = new maplibregl.Map({
  container: "map",
  style: CONFIG.basemapStyle,
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
  // Atribusi ditulis sendiri di pojok kanan bawah (.attrib) agar sesuai desain dan selalu terlihat.
  attributionControl: false,
});

// ---------- Kontrol peta kustom (sesuai desain) ----------
const scale = new maplibregl.ScaleControl({ unit: "metric", maxWidth: 96 });
$("scaleSlot").append(scale.onAdd(map));

$("zoomIn").addEventListener("click", () => map.zoomIn());
$("zoomOut").addEventListener("click", () => map.zoomOut());

function ensureTerrainSource() {
  if (map.getSource("terrain-dem")) return;
  map.addSource("terrain-dem", {
    type: "raster-dem",
    url: "https://tiles.mapterhorn.com/tilejson.json",
  });
  const labelLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  map.addLayer({ id: "terrain-hillshade", type: "hillshade", source: "terrain-dem",
    layout: { visibility: "none" }, paint: {
      "hillshade-exaggeration": 0.48,
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-anchor": "map",
      "hillshade-shadow-color": "rgba(25, 43, 49, 0.34)",
      "hillshade-highlight-color": "rgba(255, 255, 255, 0.16)",
      "hillshade-accent-color": "rgba(37, 57, 62, 0.2)",
    } }, labelLayer);
}

function bringHillshadeAboveGeology() {
  const labelLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  if (map.getLayer("terrain-hillshade") && labelLayer) map.moveLayer("terrain-hillshade", labelLayer);
}

function setTopography(visible: boolean) {
  ensureTerrainSource();
  map.setLayoutProperty("terrain-hillshade", "visibility", visible ? "visible" : "none");
  $("topographyToggle").setAttribute("aria-pressed", String(visible));
  $("terrainAttribution").hidden = !visible && !state.view3d;
}

let terrainTransition = 0;
function set3D(enabled: boolean) {
  const transitionId = ++terrainTransition;
  map.stop();
  ensureTerrainSource();
  if (enabled) {
    state.topo = true;
    setTopography(true);
    const animate = () => {
      if (transitionId !== terrainTransition) return;
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.6 });
      map.easeTo({ pitch: 58, bearing: 0, duration: 1100, essential: true });
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
        if (transitionId !== terrainTransition) { cleanup(); return; }
        if (event.sourceId === "terrain-dem" && map.isSourceLoaded("terrain-dem")) {
          cleanup();
          animate();
        }
      };
      map.on("sourcedata", startWhenReady);
      fallback = window.setTimeout(() => {
        if (transitionId !== terrainTransition) { cleanup(); return; }
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
  } else {
    const flatten = () => {
      if (transitionId === terrainTransition) map.setTerrain(null);
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
}
const rotateBy = (degrees: number) => map.easeTo({ bearing: map.getBearing() + degrees, duration: 420, essential: true });
$("rotateLeft").addEventListener("click", () => rotateBy(-30));
$("rotateRight").addEventListener("click", () => rotateBy(30));
$("resetNorth").addEventListener("click", () => map.easeTo({ bearing: 0, duration: 500, essential: true }));
$("tiltUp").addEventListener("click", () => {
  if (state.view3d) map.easeTo({ pitch: Math.min(70, map.getPitch() + 8), duration: 420, essential: true });
});
$("tiltDown").addEventListener("click", () => {
  if (state.view3d) map.easeTo({ pitch: Math.max(28, map.getPitch() - 8), duration: 420, essential: true });
});
map.on("rotate", () => {
  $("resetNorth").style.transform = "rotate(" + -map.getBearing() + "deg)";
});
$("topographyToggle").addEventListener("click", () => {
  state.topo = !state.topo;
  setTopography(state.topo);
  writeState(state);
});

let toastTimer: number | undefined;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 2600);
}

// Export the rendered viewport, matching legend, and data credits.
function composeExport(): HTMLCanvasElement {
  const source = map.getCanvas();
  const mapEl = map.getContainer();
  const scale = source.width / mapEl.clientWidth;
  const mapWidth = mapEl.clientWidth;
  const mapHeight = mapEl.clientHeight;
  const legendWidth = 300;
  const headerHeight = 78;
  const footerHeight = 112;
  const layoutWidth = mapWidth + legendWidth;
  const legend = $("legend");
  const items = [...legend.querySelectorAll("li")];
  const out = document.createElement("canvas");
  out.width = Math.round(layoutWidth * scale);
  out.height = Math.round((mapHeight + headerHeight + footerHeight) * scale);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f4f6f4"; ctx.fillRect(0, 0, layoutWidth, mapHeight + headerHeight + footerHeight);
  ctx.fillStyle = "#1f3b48"; ctx.fillRect(0, 0, layoutWidth, headerHeight);
  ctx.fillStyle = "#fff"; ctx.font = "700 22px Instrument Sans, sans-serif";
  ctx.fillText("Orebit GeoAtlas", 24, 31);
  ctx.font = "400 12px Instrument Sans, sans-serif";
  const c = map.getCenter();
  const mode = state.mode === "age" ? (getLang() === "id" ? "Umur geologi" : "Geologic age") : (getLang() === "id" ? "Litologi" : "Lithology");
  const meta = mode + " · " + (map.getPitch() > 0 ? "3D" : "2D") + " · " + c.lat.toFixed(4) + "°, " + c.lng.toFixed(4) + "° · z" + map.getZoom().toFixed(1) + " · " + new Date().toISOString().slice(0, 10);
  ctx.fillText(meta, 24, 57, layoutWidth - 48);
  ctx.drawImage(source, 0, headerHeight, mapWidth, mapHeight);

  const legendX = mapWidth;
  ctx.fillStyle = "#fff"; ctx.fillRect(legendX, headerHeight, legendWidth, mapHeight);
  ctx.strokeStyle = "#d6dde1"; ctx.beginPath(); ctx.moveTo(legendX, headerHeight); ctx.lineTo(legendX, headerHeight + mapHeight); ctx.stroke();
  const legendTitle = legend.querySelector("h2")?.textContent || (getLang() === "id" ? "Legenda" : "Legend");
  ctx.fillStyle = "#1f3b48"; ctx.font = "700 15px Instrument Sans, sans-serif";
  ctx.fillText(legendTitle, legendX + 22, headerHeight + 34);
  let itemY = headerHeight + 65;
  const rowHeight = items.length ? Math.min(27, Math.max(11, (mapHeight - 86) / items.length)) : 27;
  const legendBottom = headerHeight + mapHeight - 8;
  ctx.save();
  ctx.beginPath(); ctx.rect(legendX + 8, headerHeight + 48, legendWidth - 16, Math.max(0, mapHeight - 56)); ctx.clip();
  for (const item of items) {
    const spans = [...item.querySelectorAll("span")];
    const chip = spans[0];
    const label = spans[1]?.textContent?.trim() ?? "";
    const age = spans[2]?.textContent?.trim() ?? "";
    const fontSize = Math.max(8.5, Math.min(12, rowHeight * 0.48));
    ctx.fillStyle = chip ? getComputedStyle(chip).backgroundColor : "#9aa8ad";
    const chipSize = Math.min(15, Math.max(7, rowHeight - 5));
    ctx.fillRect(legendX + 22, itemY - chipSize * 0.72, chipSize, chipSize);
    ctx.fillStyle = "#263942"; ctx.font = `500 ${fontSize}px Instrument Sans, sans-serif`;
    const labelX = legendX + 48;
    const rightEdge = legendX + legendWidth - 18;
    const maxLabelWidth = Math.max(24, rightEdge - labelX - (age ? 54 : 0));
    let fittedLabel = label;
    while (fittedLabel.length > 3 && ctx.measureText(fittedLabel).width > maxLabelWidth) fittedLabel = `${fittedLabel.slice(0, -2).trimEnd()}…`;
    ctx.fillText(fittedLabel, labelX, itemY, maxLabelWidth);
    if (age) {
      ctx.fillStyle = "#64747c"; ctx.font = "400 10px Instrument Sans, sans-serif";
      ctx.textAlign = "right"; ctx.fillText(age, rightEdge, itemY, 50); ctx.textAlign = "left";
    }
    itemY += rowHeight;
    if (itemY > legendBottom) break;
  }
  ctx.restore();

  const footerY = headerHeight + mapHeight;
  ctx.fillStyle = "#f4f6f4"; ctx.fillRect(0, footerY, layoutWidth, footerHeight);
  ctx.strokeStyle = "#d6dde1"; ctx.beginPath(); ctx.moveTo(0, footerY); ctx.lineTo(layoutWidth, footerY); ctx.stroke();
  const wrapText = (text: string, maxWidth: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const footerLines: string[] = [];
  ctx.fillStyle = "#41535c"; ctx.font = "500 10px Instrument Sans, sans-serif";
  footerLines.push(...wrapText("Geologi: Macrostrat (CC BY 4.0; sumber asli per unit) · Data rinci: Pusat Survei Geologi, Badan Geologi, ESDM (status Mei 2018)", layoutWidth - 44));
  const terrainCredit = state.topo || state.view3d ? " · Elevasi: © Mapterhorn" : "";
  footerLines.push(...wrapText("Peta dasar: OpenFreeMap · © OpenMapTiles · © OpenStreetMap" + terrainCredit, layoutWidth - 44));
  ctx.fillStyle = "#64747c"; ctx.font = "400 9px Instrument Sans, sans-serif";
  footerLines.push(...wrapText("Peta ini bersifat generalisasi dan bukan peta resmi untuk keputusan teknis. Rujuk lembar asli Badan Geologi.", layoutWidth - 44));
  ctx.save(); ctx.beginPath(); ctx.rect(0, footerY + 8, layoutWidth, footerHeight - 12); ctx.clip();
  let footerTextY = footerY + 24;
  for (let i = 0; i < footerLines.length; i++) {
    if (i > 0 && i === footerLines.length - 1) { ctx.fillStyle = "#64747c"; ctx.font = "400 9px Instrument Sans, sans-serif"; }
    ctx.fillText(footerLines[i], 22, footerTextY, layoutWidth - 44);
    footerTextY += 15;
  }
  ctx.restore();
  return out;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function pdfFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const width = canvas.width, height = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let src = 0, dst = 0; src < rgba.length; src += 4) {
    rgb[dst++] = rgba[src]; rgb[dst++] = rgba[src + 1]; rgb[dst++] = rgba[src + 2];
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
  const add = (b: Uint8Array) => { chunks.push(b); offset += b.length; };
  const offsets = [0];
  add(enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
  const obj = (n: number, body: string) => { offsets[n] = offset; add(enc.encode(`${n} 0 obj\n${body}\nendobj\n`)); };
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const landscape = width / height > 1.25;
  const pageWidth = landscape ? 842 : 595, pageHeight = landscape ? 595 : 842;
  const fit = Math.min(pageWidth / width, pageHeight / height);
  const drawWidth = width * fit, drawHeight = height * fit;
  const imageX = (pageWidth - drawWidth) / 2, imageY = (pageHeight - drawHeight) / 2;
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = offset;
  add(enc.encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`));
  add(pixels); add(enc.encode("\nendstream\nendobj\n"));
  const content = enc.encode(`q ${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${imageX.toFixed(3)} ${imageY.toFixed(3)} cm /Im0 Do Q`);
  offsets[5] = offset; add(enc.encode(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`)); add(content); add(enc.encode("\nendstream\nendobj\n"));
  const xref = offset;
  add(enc.encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  const bytes = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

for (const format of ["png", "pdf"] as const) {
  const button = $<HTMLButtonElement>(`export${format.toUpperCase()}`);
  button.addEventListener("click", async () => {
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
    } catch { toast(t("exportFail")); }
    finally { button.disabled = false; }
  });
}

let meMarker: maplibregl.Marker | undefined;
$("locateBtn").addEventListener("click", () => {
  if (!("geolocation" in navigator)) { toast(t("locateFail")); return; }
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

// ---------- Teks antarmuka ----------
const TEXT_IDS: Record<string, Key> = {
  "t-tagline": "tagline", "t-searchLabel": "searchLabel", "t-colorBy": "colorBy",
  "t-modeAge": "modeAge", "t-modeLith": "modeLith", "t-ageFilter": "ageFilter",
  "t-lines": "lines", "t-disclaimer": "disclaimer", aboutBtn: "about", aboutClose: "close",
  detailCopy: "copyLink",
};
const LABEL_IDS: Record<string, Key> = {
  zoomIn: "zoomIn", zoomOut: "zoomOut", locateBtn: "locate", detailClose: "closeDetail",
  sheetHandle: "togglePanel", panelToggle: "togglePanel", langBtn: "switchLang",
  planView: "planView", terrainView: "terrainView", topographyToggle: "topography",
  rotateLeft: "rotateLeft", rotateRight: "rotateRight", resetNorth: "resetNorth",
  tiltUp: "tiltUp", tiltDown: "tiltDown",
};
function applyText() {
  for (const [id, key] of Object.entries(TEXT_IDS)) $(id).textContent = t(key);
  for (const [id, key] of Object.entries(LABEL_IDS)) $(id).setAttribute("aria-label", t(key));
  $<HTMLInputElement>("searchInput").placeholder = t("searchPlaceholder");
  $("langBtn").textContent = getLang() === "id" ? "EN" : "ID";
  $("topographyToggle").textContent = getLang() === "id" ? "Topografi" : "Terrain";
  $("opacityLabel").textContent = t("opacity");
  $("opacityHint").textContent = t("opacityHint");
  renderLegend(state.mode, isFineZoom(map.getZoom()));
  renderAbout();
  updateSheetHint();
  updateAgeReadout();
}

function updateSheetHint() {
  $("sheetHint").textContent = t(state.mode === "age" ? "sheetHintAge" : "sheetHintLith");
  updatePeek();
}

/** Tinggi bottom sheet saat tertutup: sampai bawah kolom pencarian, supaya pencarian selalu terlihat. */
function updatePeek() {
  if (!isMobile()) return;
  const form = $("searchForm");
  const peek = form.offsetTop + form.offsetHeight + 16;
  document.documentElement.style.setProperty("--peek", `${peek}px`);
}
window.addEventListener("resize", updatePeek);

// ---------- Filter umur ----------
const ageMin = $<HTMLInputElement>("ageMin");
const ageMax = $<HTMLInputElement>("ageMax");
ageMin.max = ageMax.max = String(CONFIG.ageMaxMa);
ageMin.value = String(state.ageMin);
ageMax.value = String(state.ageMax);

function updateAgeReadout() {
  const lang = getLang();
  $("ageReadout").textContent =
    `${state.ageMin.toLocaleString(lang)}–${state.ageMax.toLocaleString(lang)}${state.ageMax >= CONFIG.ageMaxMa ? "+" : ""} ${t("ma")}`;
  const fill = $("ageFill");
  const lo = (state.ageMin / CONFIG.ageMaxMa) * 100;
  const hi = (state.ageMax / CONFIG.ageMaxMa) * 100;
  // Titik slider berdiameter 18 px: sesuaikan tepi isian ke pusat titik.
  fill.style.left = `calc(${lo}% + ${9 - lo * 0.18}px)`;
  fill.style.width = `calc(${hi - lo}% - ${(hi - lo) * 0.18}px)`;
}

const effectiveMax = (b: number) => (b >= CONFIG.ageMaxMa ? 5000 : b);

function onAgeInput(e: Event) {
  let a = Number(ageMin.value), b = Number(ageMax.value);
  if (a > b) { if (e.target === ageMin) b = a; else a = b; ageMin.value = String(a); ageMax.value = String(b); }
  state.ageMin = a;
  state.ageMax = b;
  updateAgeReadout();
  if (map.getLayer("ms-units")) setAgeFilter(map, a, effectiveMax(b), state.geologyOpacity / 100);
  writeState(state);
}
ageMin.addEventListener("input", onAgeInput);
ageMax.addEventListener("input", onAgeInput);

const geologyOpacity = $<HTMLInputElement>("geologyOpacity");
geologyOpacity.value = String(state.geologyOpacity);
function updateGeologyOpacity() {
  state.geologyOpacity = Number(geologyOpacity.value);
  $("opacityValue").textContent = state.geologyOpacity + "%";
  if (map.getLayer("ms-units")) setAgeFilter(map, state.ageMin, effectiveMax(state.ageMax), state.geologyOpacity / 100);
  writeState(state);
}
geologyOpacity.addEventListener("input", updateGeologyOpacity);

// ---------- Mode warna ----------
const modeButtons = document.querySelectorAll<HTMLButtonElement>("#modeGroup button");
function applyMode() {
  modeButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
  renderLegend(state.mode, isFineZoom(map.getZoom()));
  updateSheetHint();
  if (map.getLayer("ms-units")) setColorMode(map, state.mode);
}
modeButtons.forEach((b) => b.addEventListener("click", () => {
  state.mode = b.dataset.mode === "lith" ? "lith" : "age";
  applyMode();
  writeState(state);
}));
modeButtons.forEach((b, index) => b.addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? modeButtons.length - 1
    : (index + (e.key === "ArrowLeft" ? -1 : 1) + modeButtons.length) % modeButtons.length;
  modeButtons[next].focus();
  modeButtons[next].click();
}));

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

// ---------- Panel seluler (bottom sheet) ----------
const panel = $("panel");
$("panelToggle").addEventListener("click", () => {
  const collapsed = panel.classList.toggle("compact");
  $("panelToggle").setAttribute("aria-expanded", String(!collapsed));
});
function setSheet(open: boolean) {
  panel.classList.toggle("collapsed", !open);
  $("sheetHandle").setAttribute("aria-expanded", String(open));
}
$("sheetHandle").addEventListener("click", () => setSheet(panel.classList.contains("collapsed")));

// ---------- Detail unit ----------
function selectFeature(f: maplibregl.MapGeoJSONFeature) {
  highlight(map, f);
  showDetail(f);
  if (isMobile()) setSheet(false);
}
$("detailClose").addEventListener("click", () => { hideDetail(); highlight(map, null); });
$("detailCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast(t("copied"));
  } catch {
    toast(location.href);
  }
});

// ---------- Tentang & sumber ----------
const about = $<HTMLDialogElement>("aboutDialog");
$("aboutBtn").addEventListener("click", () => about.showModal());
about.addEventListener("click", (e) => { if (e.target === about) about.close(); });

// ---------- Peta ----------
map.on("load", () => {
  ensureTerrainSource();
  const autoTopography = state.view3d && !state.topo;
  if (state.view3d) {
    state.topo = true;
  }
  addGeologyLayers(map);
  bringHillshadeAboveGeology();
  if (state.topo) setTopography(true);
  if (autoTopography) writeState(state);
  if (state.view3d) set3D(true);
  setColorMode(map, state.mode);
  setAgeFilter(map, state.ageMin, effectiveMax(state.ageMax), state.geologyOpacity / 100);
  setLinesVisible(map, state.lines);
  syncOrientationControls();
  $("opacityValue").textContent = state.geologyOpacity + "%";
});

// Legend besar↔detail mengikuti ambang zoom yang sama dengan warna peta (lihat layers.ts:FINE_ZOOM).
let lastFine = isFineZoom(map.getZoom());
map.on("zoom", () => {
  const fine = isFineZoom(map.getZoom());
  if (fine !== lastFine) {
    lastFine = fine;
    renderLegend(state.mode, fine);
  }
});

const queryLayers = () => QUERY_LAYERS.filter((id) => map.getLayer(id));
map.on("click", (e) => {
  const f = map.queryRenderedFeatures(e.point, { layers: queryLayers() })[0];
  if (!f) { hideDetail(); highlight(map, null); return; }
  selectFeature(f);
});
const hoverTip = $<HTMLDivElement>("hoverTip");
map.on("mousemove", (e) => {
  const feature = map.queryRenderedFeatures(e.point, { layers: queryLayers() })[0];
  map.getCanvas().style.cursor = feature ? "pointer" : "";
  if (!feature || isMobile()) { hoverTip.hidden = true; return; }
  const p = feature.properties as Record<string, unknown>;
  const title = String(p.formation || p.strat_name || p.name_orig || p.name || t("unnamed"));
  const age = feature.source === "orebit"
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
map.on("mouseout", () => { hoverTip.hidden = true; map.getCanvas().style.cursor = ""; });

initSearch(map, {
  onResults: () => { if (isMobile()) setSheet(true); },
  onPickFeature: (f) => selectFeature(f),
});
applyText();
applyMode();
if (isMobile()) setSheet(false);
void document.fonts?.ready.then(updatePeek);
