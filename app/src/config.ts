// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
export interface RegionInfo {
  id: string;
  labelId: string;
  labelEn: string;
  bbox: [[number, number], [number, number]];
}

export const REGIONS: readonly RegionInfo[] = [
  { id: "all", labelId: "Nasional", labelEn: "National", bbox: [[94.8, -11.2], [141.2, 6.2]] },
  { id: "sumatra", labelId: "Sumatra", labelEn: "Sumatra", bbox: [[95.0, -6.0], [106.0, 5.9]] },
  { id: "babel", labelId: "Babel", labelEn: "Babel", bbox: [[105.05, -3.35], [108.35, -1.45]] },
  { id: "jawa", labelId: "Jawa", labelEn: "Java", bbox: [[105.0, -8.9], [114.6, -5.8]] },
  { id: "balinusra", labelId: "Bali–Nusra", labelEn: "Bali–Nusra", bbox: [[114.4, -11.0], [125.3, -8.0]] },
  { id: "kalimantan", labelId: "Kalimantan", labelEn: "Kalimantan", bbox: [[108.6, -4.3], [119.0, 4.4]] },
  { id: "sulawesi", labelId: "Sulawesi", labelEn: "Sulawesi", bbox: [[118.8, -6.0], [125.6, 2.0]] },
  { id: "maluku", labelId: "Maluku", labelEn: "Maluku", bbox: [[124.2, -8.5], [134.8, 2.6]] },
  { id: "papua", labelId: "Papua", labelEn: "Papua", bbox: [[129.6, -9.2], [141.1, -0.5]] },
] as const;

import type { StyleSpecification } from "maplibre-gl";

export type BasemapId = "light" | "dark" | "topo" | "satellite";

// Citra satelit Esri World Imagery + label referensi (raster); atribusi wajib tampil di peta & ekspor.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    "sat-ref": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: "sat-bg", type: "background", paint: { "background-color": "#0b1a20" } },
    { id: "sat", type: "raster", source: "sat" },
    { id: "sat-labels", type: "raster", source: "sat-ref" },
  ],
};

export const BASEMAPS: Record<BasemapId, string | StyleSpecification> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
  topo: "https://tiles.openfreemap.org/styles/positron",
  satellite: SATELLITE_STYLE,
};

export const CONFIG = {
  /** Basemap OSM gratis tanpa API key. */
  basemapStyle: BASEMAPS.light,
  /** Tile Macrostrat (CC-BY 4.0) untuk zoom jauh dan area yang belum dikurasi. */
  macrostratTiles: "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.mvt",
  macrostratSourcesApi: "https://macrostrat.org/api/v2/defs/sources?source_id=",
  /** Indeks unit nasional 8 wilayah (dibangkitkan oleh pipeline/build_index.py). */
  nationalIndexUrl: "/data/indonesia-units-index.json",
  /** PMTiles hasil pipeline Orebit. Kosong = mode Macrostrat + indeks nasional. */
  orebitTiles: (import.meta.env.VITE_TILES_URL as string | undefined) ?? "",
  /** Zoom saat data Orebit mengambil alih dari Macrostrat. */
  orebitMinZoom: 6,
  initialView: { center: [117.5, -2.5] as [number, number], zoom: 4.2 },
  bounds: [[90, -15], [145, 10]] as [[number, number], [number, number]],
  ageMaxMa: 600,
  githubRepo: "https://github.com/ghoziankarami/orebit-geoatlas",
};
