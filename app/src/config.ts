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

export type BasemapId = "light" | "dark" | "topo";

export const BASEMAPS: Record<BasemapId, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
  topo: "https://tiles.openfreemap.org/styles/positron",
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
