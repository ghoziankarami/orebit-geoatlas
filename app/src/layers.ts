import type maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import { CONFIG } from "./config";
import { macrostratLithColor, orebitLithColor } from "./lithology";

export type ColorMode = "age" | "lith";

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
    paint: { "fill-color": ["coalesce", ["get", "color"], "#D9DEE1"], "fill-opacity": 0.78 } }, before);
  map.addLayer({ id: "ms-units-edge", type: "line", source: MS, "source-layer": "units", minzoom: 6,
    paint: { "line-color": "#1F2B33", "line-opacity": 0.18, "line-width": 0.4 } }, before);
  map.addLayer({ id: "ms-lines", type: "line", source: MS, "source-layer": "lines",
    paint: { "line-color": "#1F2B33", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 12, 1.6], "line-opacity": 0.75 } }, before);

  if (CONFIG.orebitTiles) {
    map.addSource(OB, {
      type: "vector",
      url: `pmtiles://${CONFIG.orebitTiles}`,
      attribution:
        'Peta geologi 1:100.000 © <a href="https://geologi.esdm.go.id/geomap" target="_blank" rel="noopener">Pusat Survei Geologi, Badan Geologi</a>; diolah oleh Orebit',
    });
    map.addLayer({ id: "ob-units", type: "fill", source: OB, "source-layer": "units", minzoom: CONFIG.orebitMinZoom,
      paint: { "fill-color": ["coalesce", ["get", "color_hex"], "#D9DEE1"], "fill-opacity": 0.85 } }, before);
    map.addLayer({ id: "ob-units-edge", type: "line", source: OB, "source-layer": "units", minzoom: CONFIG.orebitMinZoom,
      paint: { "line-color": "#1F2B33", "line-opacity": 0.3, "line-width": 0.5 } }, before);
    map.addLayer({ id: "ob-lines", type: "line", source: OB, "source-layer": "lines", minzoom: CONFIG.orebitMinZoom,
      paint: {
        "line-color": "#1F2B33",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 2],
        "line-dasharray": ["case", ["==", ["get", "certainty"], "inferred"], ["literal", [3, 2]], ["literal", [1, 0]]],
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

export function setColorMode(map: maplibregl.Map, mode: ColorMode) {
  map.setPaintProperty("ms-units", "fill-color",
    mode === "age" ? ["coalesce", ["get", "color"], "#D9DEE1"] : macrostratLithColor);
  if (map.getLayer("ob-units")) {
    map.setPaintProperty("ob-units", "fill-color",
      mode === "age" ? ["coalesce", ["get", "color_hex"], "#D9DEE1"] : orebitLithColor);
  }
}

function ageOpacity(topField: string, baseField: string, min: number, max: number, on: number): ExpressionSpecification {
  // Unit tampil penuh bila rentang umurnya beririsan dengan [min, max].
  return ["case",
    ["all",
      [">=", ["to-number", ["coalesce", ["get", baseField], 9999]], min],
      ["<=", ["to-number", ["coalesce", ["get", topField], 0]], max]],
    on, 0.1];
}

export function setAgeFilter(map: maplibregl.Map, min: number, max: number) {
  map.setPaintProperty("ms-units", "fill-opacity", ageOpacity("best_t_age", "best_b_age", min, max, 0.78));
  if (map.getLayer("ob-units")) {
    map.setPaintProperty("ob-units", "fill-opacity", ageOpacity("age_top_ma", "age_base_ma", min, max, 0.85));
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
