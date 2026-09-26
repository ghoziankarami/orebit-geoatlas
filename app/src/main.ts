import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import "./style.css";
import { renderAbout } from "./about";
import { CONFIG } from "./config";
import { hideDetail, showDetail } from "./detail";
import { getLang, setLang, t, type Key } from "./i18n";
import { addGeologyLayers, highlight, QUERY_LAYERS, setAgeFilter, setColorMode, setLinesVisible } from "./layers";
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
  maxBounds: [[CONFIG.bounds[0][0] - 20, CONFIG.bounds[0][1] - 15], [CONFIG.bounds[1][0] + 20, CONFIG.bounds[1][1] + 15]],
  hash: "map",
  // Atribusi ditulis sendiri di pojok kanan bawah (.attrib) agar sesuai desain dan selalu terlihat.
  attributionControl: false,
});

// ---------- Kontrol peta kustom (sesuai desain) ----------
const scale = new maplibregl.ScaleControl({ unit: "metric", maxWidth: 96 });
$("scaleSlot").append(scale.onAdd(map));

$("zoomIn").addEventListener("click", () => map.zoomIn());
$("zoomOut").addEventListener("click", () => map.zoomOut());

let toastTimer: number | undefined;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 2600);
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
  sheetHandle: "togglePanel", langBtn: "switchLang",
};
function applyText() {
  for (const [id, key] of Object.entries(TEXT_IDS)) $(id).textContent = t(key);
  for (const [id, key] of Object.entries(LABEL_IDS)) $(id).setAttribute("aria-label", t(key));
  $<HTMLInputElement>("searchInput").placeholder = t("searchPlaceholder");
  $("langBtn").textContent = getLang() === "id" ? "EN" : "ID";
  renderLegend(state.mode);
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
  if (map.getLayer("ms-units")) setAgeFilter(map, a, effectiveMax(b));
  writeState(state);
}
ageMin.addEventListener("input", onAgeInput);
ageMax.addEventListener("input", onAgeInput);

// ---------- Mode warna ----------
const modeButtons = document.querySelectorAll<HTMLButtonElement>("#modeGroup button");
function applyMode() {
  modeButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
  renderLegend(state.mode);
  updateSheetHint();
  if (map.getLayer("ms-units")) setColorMode(map, state.mode);
}
modeButtons.forEach((b) => b.addEventListener("click", () => {
  state.mode = b.dataset.mode === "lith" ? "lith" : "age";
  applyMode();
  writeState(state);
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
  addGeologyLayers(map);
  setColorMode(map, state.mode);
  setAgeFilter(map, state.ageMin, effectiveMax(state.ageMax));
  setLinesVisible(map, state.lines);
});

const queryLayers = () => QUERY_LAYERS.filter((id) => map.getLayer(id));
map.on("click", (e) => {
  const f = map.queryRenderedFeatures(e.point, { layers: queryLayers() })[0];
  if (!f) { hideDetail(); highlight(map, null); return; }
  selectFeature(f);
});
map.on("mousemove", (e) => {
  map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: queryLayers() }).length ? "pointer" : "";
});

initSearch(map, {
  onResults: () => { if (isMobile()) setSheet(true); },
  onPickFeature: (f) => selectFeature(f),
});
applyText();
applyMode();
if (isMobile()) setSheet(false);
void document.fonts?.ready.then(updatePeek);
