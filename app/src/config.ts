export const CONFIG = {
  /** Basemap OSM gratis tanpa API key. */
  basemapStyle: "https://tiles.openfreemap.org/styles/positron",
  /** Tile Macrostrat (CC-BY 4.0) untuk zoom jauh dan area yang belum dikurasi. */
  macrostratTiles: "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.mvt",
  macrostratSourcesApi: "https://macrostrat.org/api/v2/defs/sources?source_id=",
  /** PMTiles hasil pipeline Orebit. Kosong = mode Macrostrat saja. */
  orebitTiles: (import.meta.env.VITE_TILES_URL as string | undefined) ?? "",
  /** Overlay tile dimulai pada z6, sesuai build tippecanoe. */
  orebitMinZoom: 6,
  initialView: { center: [117.5, -2.5] as [number, number], zoom: 4.2 },
  bounds: [[90, -15], [145, 10]] as [[number, number], [number, number]],
  ageMaxMa: 600,
};
