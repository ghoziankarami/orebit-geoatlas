import type maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import { CONFIG } from "./config";
import { macrostratLithColor, macrostratLithColorCoarse, orebitLithColor, orebitLithColorCoarse } from "./lithology";

export type ColorMode = "age" | "lith";

/** Zoom tempat legenda/warna beralih dari "besar" (period/kelompok litologi) ke "detail"
 * (epoch/formasi per-unit). Di bawah ini ringkas biar tidak riuh saat cakupan peta luas; di atas
 * ini rinci karena pengguna sudah fokus ke satu area. */
export const FINE_ZOOM = 11;
export const isFineZoom = (zoom: number): boolean => zoom >= FINE_ZOOM;
const obZoomFade: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 7.5, 0, 8.8, 0.85] as unknown as ExpressionSpecification;

const MS = "macrostrat";
const OB = "orebit";

export const QUERY_LAYERS = ["ob-units", "ms-units"];

function firstSymbolLayer(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

export function addGeologyLayers(map: maplibregl.Map) {
  const before = firstSymbolLayer(map);

  map.addSource(MS, {
    type: "vector",
    tiles: [CONFIG.macrostratTiles],
    minzoom: 0,
    maxzoom: 14,
    attribution:
      '<a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a> (CC-BY 4.0) dan penyedia data asli',
  });

  map.addLayer({ id: "ms-units", type: "fill", source: MS, "source-layer": "units",
    paint: { "fill-color": ["coalesce", ["get", "color"], "#D9DEE1"], "fill-opacity": 0.78,
      "fill-color-transition": { duration: 420, delay: 0 } } }, before);
  map.addLayer({ id: "ms-units-edge", type: "line", source: MS, "source-layer": "units", minzoom: 6,
    paint: { "line-color": "#1F2B33", "line-opacity": 0.18, "line-width": 0.4 } }, before);
  map.addLayer({ id: "ms-lines", type: "line", source: MS, "source-layer": "lines",
    paint: { "line-color": "#1F2B33", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 12, 1.6], "line-opacity": 0.75 } }, before);

  if (CONFIG.orebitTiles) {
    map.addSource(OB, {
      type: "vector",
      url: `pmtiles://${CONFIG.orebitTiles}`,
      attribution:
        'Data layanan Geologi Litologi ESDM (status Mei 2018) © <a href="https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer" target="_blank" rel="noopener">Pusat Survei Geologi, Badan Geologi</a>; diolah oleh Orebit',
    });
    map.addLayer({ id: "ob-units", type: "fill", source: OB, "source-layer": "units", minzoom: 7.5,
      paint: { "fill-color": ["coalesce", ["get", "color_hex"], "#D9DEE1"], "fill-opacity": obZoomFade,
        "fill-color-transition": { duration: 420, delay: 0 } } }, before);
    map.addLayer({ id: "ob-units-edge", type: "line", source: OB, "source-layer": "units", minzoom: CONFIG.orebitMinZoom,
      paint: { "line-color": "#1F2B33", "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 9, 0.3], "line-width": 0.5 } }, before);
    map.addLayer({ id: "ob-lines", type: "line", source: OB, "source-layer": "lines", minzoom: CONFIG.orebitMinZoom,
      paint: {
        "line-color": "#1F2B33",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 2],
        "line-dasharray": ["case", ["==", ["get", "certainty"], "inferred"], ["literal", [3, 2]], ["literal", [1, 0]]],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 9, 1],
      } }, before);
  }

  // Sorotan poligon terpilih
  map.addLayer({ id: "ms-selected", type: "line", source: MS, "source-layer": "units",
    filter: ["==", ["get", "map_id"], -1], paint: { "line-color": "#E3B505", "line-width": 3 } }, before);
  if (CONFIG.orebitTiles) {
    map.addLayer({ id: "ob-selected", type: "line", source: OB, "source-layer": "units",
      filter: ["==", ["get", "poly_id"], ""], paint: { "line-color": "#E3B505", "line-width": 3 } }, before);
  }
}

const msAgeColor: ExpressionSpecification = ["coalesce", ["get", "color"], "#D9DEE1"];
const obAgeColor: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"],
  FINE_ZOOM - 0.5, ["coalesce", ["get", "color_hex_coarse"], ["get", "color_hex"], "#D9DEE1"],
  FINE_ZOOM + 0.5, ["coalesce", ["get", "color_hex"], "#D9DEE1"],
] as unknown as ExpressionSpecification;
const msLithColor: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], FINE_ZOOM - 0.5, macrostratLithColorCoarse, FINE_ZOOM + 0.5, macrostratLithColor] as unknown as ExpressionSpecification;
const obLithColor: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], FINE_ZOOM - 0.5, orebitLithColorCoarse, FINE_ZOOM + 0.5, orebitLithColor] as unknown as ExpressionSpecification;

export function setColorMode(map: maplibregl.Map, mode: ColorMode) {
  map.setPaintProperty("ms-units", "fill-color", mode === "age" ? msAgeColor : msLithColor);
  if (map.getLayer("ob-units")) {
    map.setPaintProperty("ob-units", "fill-color", mode === "age" ? obAgeColor : obLithColor);
  }
}

function ageOpacity(topField: string, baseField: string, min: number, max: number, on: number, fadeWithZoom = false, scale = 1): ExpressionSpecification {
  // Unit tampil penuh bila rentang umurnya beririsan dengan [min, max].
  const visible = fadeWithZoom ? ["*", obZoomFade, scale] : on * scale;
  const dimmed = fadeWithZoom ? ["*", obZoomFade, 0.1, scale] : 0.1 * scale;
  return ["case",
    ["all",
      [">=", ["to-number", ["coalesce", ["get", baseField], 9999]], min],
      ["<=", ["to-number", ["coalesce", ["get", topField], 0]], max]],
    visible, dimmed] as unknown as ExpressionSpecification;
}

export function setAgeFilter(map: maplibregl.Map, min: number, max: number, opacity = 1) {
  map.setPaintProperty("ms-units", "fill-opacity", ageOpacity("best_t_age", "best_b_age", min, max, 0.78, false, opacity));
  if (map.getLayer("ob-units")) {
    map.setPaintProperty("ob-units", "fill-opacity", ageOpacity("age_top_ma", "age_base_ma", min, max, 1, true, opacity));
  }
}

export function setLinesVisible(map: maplibregl.Map, visible: boolean) {
  for (const id of ["ms-lines", "ob-lines"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

export function highlight(map: maplibregl.Map, feature: maplibregl.MapGeoJSONFeature | null) {
  map.setFilter("ms-selected", ["==", ["get", "map_id"],
    feature?.source === MS ? (feature.properties.map_id as number) : -1]);
  if (map.getLayer("ob-selected")) {
    map.setFilter("ob-selected", ["==", ["get", "poly_id"],
      feature?.source === OB ? (feature.properties.poly_id as string) : ""]);
  }
}
