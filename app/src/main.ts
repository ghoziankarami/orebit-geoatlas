import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import "./style.css";
import { CONFIG } from "./config";
import { hideDetail, showDetail } from "./detail";
import { getLang, setLang, t, type Key } from "./i18n";
import { addGeologyLayers, highlight, QUERY_LAYERS, setAgeFilter, setColorMode, setLinesVisible } from "./layers";
import { renderLegend } from "./legend";
import { initSearch } from "./search";
import { readState, writeState } from "./state";

const state = readState();
if (state.lang) setLang(state.lang); else setLang(getLang());

maplibregl.addProtocol("pmtiles", new Protocol().tile);

const map = new maplibregl.Map({
  container: "map",
  style: CONFIG.basemapStyle,
  center: CONFIG.initialView.center,
  zoom: CONFIG.initialView.zoom,
  maxBounds: [[CONFIG.bounds[0][0] - 20, CONFIG.bounds[0][1] - 15], [CONFIG.bounds[1][0] + 20, CONFIG.bounds[1][1] + 15]],
  hash: "map",
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right");

// ---------- Teks antarmuka ----------
const TEXT_IDS: Record<string, Key> = {
  "t-tagline": "tagline", "t-searchLabel": "searchLabel", "t-colorBy": "colorBy",
  "t-modeAge": "modeAge", "t-modeLith": "modeLith", "t-ageFilter": "ageFilter",
  "t-lines": "lines", "t-disclaimer": "disclaimer",
};
function applyText() {
  for (const [id, key] of Object.entries(TEXT_IDS)) document.getElementById(id)!.textContent = t(key);
  (document.getElementById("searchInput") as HTMLInputElement).placeholder = t("searchPlaceholder");
  document.getElementById("langBtn")!.textContent = getLang() === "id" ? "EN" : "ID";
  renderLegend(state.mode);
  updateAgeReadout();
}

// ---------- Kontrol ----------
const ageMin = document.getElementById("ageMin") as HTMLInputElement;
const ageMax = document.getElementById("ageMax") as HTMLInputElement;
ageMin.max = ageMax.max = String(CONFIG.ageMaxMa);
ageMin.value = String(state.ageMin);
ageMax.value = String(state.ageMax);

function updateAgeReadout() {
  const lang = getLang();
  document.getElementById("ageReadout")!.textContent =
    `${state.ageMin.toLocaleString(lang)}–${state.ageMax.toLocaleString(lang)}${state.ageMax >= CONFIG.ageMaxMa ? "+" : ""} ${t("ma")}`;
}

function onAgeInput(e: Event) {
  let a = Number(ageMin.value), b = Number(ageMax.value);
  if (a > b) { if (e.target === ageMin) b = a; else a = b; ageMin.value = String(a); ageMax.value = String(b); }
  state.ageMin = a;
  state.ageMax = b;
  updateAgeReadout();
  if (map.isStyleLoaded()) setAgeFilter(map, a, b >= CONFIG.ageMaxMa ? 5000 : b);
  writeState(state);
}
ageMin.addEventListener("input", onAgeInput);
ageMax.addEventListener("input", onAgeInput);

const modeButtons = document.querySelectorAll<HTMLButtonElement>("#modeGroup button");
function applyMode() {
  modeButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
  renderLegend(state.mode);
  if (map.isStyleLoaded()) setColorMode(map, state.mode);
}
modeButtons.forEach((b) => b.addEventListener("click", () => {
  state.mode = b.dataset.mode === "lith" ? "lith" : "age";
  applyMode();
  writeState(state);
}));

const linesToggle = document.getElementById("linesToggle") as HTMLInputElement;
linesToggle.checked = state.lines;
linesToggle.addEventListener("change", () => {
  state.lines = linesToggle.checked;
  setLinesVisible(map, state.lines);
  writeState(state);
});

document.getElementById("langBtn")!.addEventListener("click", () => {
  state.lang = getLang() === "id" ? "en" : "id";
  setLang(state.lang);
  applyText();
  writeState(state);
});

document.getElementById("detailClose")!.addEventListener("click", () => { hideDetail(); highlight(map, null); });
document.getElementById("sheetHandle")!.addEventListener("click", () => {
  document.getElementById("panel")!.classList.toggle("collapsed");
});

// ---------- Peta ----------
map.on("load", () => {
  addGeologyLayers(map);
  setColorMode(map, state.mode);
  setAgeFilter(map, state.ageMin, state.ageMax >= CONFIG.ageMaxMa ? 5000 : state.ageMax);
  setLinesVisible(map, state.lines);
});

map.on("click", (e) => {
  const layers = QUERY_LAYERS.filter((id) => map.getLayer(id));
  const f = map.queryRenderedFeatures(e.point, { layers })[0];
  if (!f) { hideDetail(); highlight(map, null); return; }
  highlight(map, f);
  showDetail(f);
});
map.on("mousemove", (e) => {
  const layers = QUERY_LAYERS.filter((id) => map.getLayer(id));
  map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers }).length ? "pointer" : "";
});

initSearch(map);
applyText();
applyMode();
if (matchMedia("(max-width: 640px)").matches) document.getElementById("panel")!.classList.add("collapsed");
