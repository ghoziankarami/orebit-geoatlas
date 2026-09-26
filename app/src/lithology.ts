import type { ExpressionSpecification } from "maplibre-gl";

/**
 * Kelas litologi baku (lihat reference/lithology.csv).
 * `keywords` dipakai untuk memetakan teks litologi bebas dari Macrostrat.
 */
export const LITH_CLASSES = [
  { id: "unconsolidated", id_label: "Endapan permukaan", en: "Unconsolidated", color: "#F2E6A0", keywords: ["alluvium", "alluvial", "sand", "gravel", "clay", "unconsolidated", "aluvium"] },
  { id: "carbonate", id_label: "Karbonat", en: "Carbonate", color: "#8FC7E6", keywords: ["limestone", "dolomite", "carbonate", "reef", "gamping", "karbonat"] },
  { id: "siliciclastic", id_label: "Sedimen klastik", en: "Siliciclastic", color: "#E4B77A", keywords: ["sandstone", "shale", "mudstone", "siltstone", "conglomerate", "sedimentary", "flysch", "batupasir"] },
  { id: "volcanic", id_label: "Vulkanik", en: "Volcanic", color: "#E7766B", keywords: ["volcanic", "andesite", "basalt", "tuff", "breccia", "pyroclastic", "dacite", "rhyolite", "lava", "vulkanik"] },
  { id: "plutonic_felsic", id_label: "Plutonik felsik", en: "Felsic plutonic", color: "#E9A1C4", keywords: ["granite", "granodiorite", "tonalite", "felsic", "granit"] },
  { id: "plutonic_mafic", id_label: "Plutonik mafik–ultramafik", en: "Mafic–ultramafic plutonic", color: "#6FA37B", keywords: ["gabbro", "diorite", "peridotite", "ultramafic", "ophiolite", "serpentinite", "diabase"] },
  { id: "metamorphic", id_label: "Metamorf", en: "Metamorphic", color: "#A895C9", keywords: ["schist", "gneiss", "phyllite", "slate", "quartzite", "marble", "metamorphic", "amphibolite", "malihan"] },
  { id: "melange", id_label: "Melange & campuran", en: "Melange & mixed", color: "#9AA4AB", keywords: ["melange", "mélange", "mixed", "complex", "kompleks"] },
] as const;

export const LITH_FALLBACK = "#D9DEE1";

/** Warna litologi untuk layer Orebit (atribut lith_class sudah baku). */
export const orebitLithColor: ExpressionSpecification = [
  "match",
  ["get", "lith_class"],
  ...LITH_CLASSES.flatMap((c) => [c.id, c.color]),
  LITH_FALLBACK,
] as unknown as ExpressionSpecification;

/** Warna litologi untuk Macrostrat: cocokkan kata kunci pertama yang muncul di teks lith. */
export const macrostratLithColor: ExpressionSpecification = [
  "case",
  ...LITH_CLASSES.flatMap((c) => [
    ["any", ...c.keywords.map((k) => ["in", k, ["downcase", ["coalesce", ["get", "lith"], ""]]])],
    c.color,
  ]),
  LITH_FALLBACK,
] as unknown as ExpressionSpecification;
