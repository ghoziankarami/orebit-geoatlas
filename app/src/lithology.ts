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

/**
 * Kelompok besar litologi (kolom `parent` di reference/lithology.csv) untuk legenda/warna saat
 * zoom jauh — 4 kelompok saja supaya tidak riuh saat cakupan peta luas.
 */
export const LITH_PARENT_GROUPS = [
  { id: "sedimentary", id_label: "Sedimen", en: "Sedimentary", color: "#E4B77A" },
  { id: "igneous", id_label: "Beku", en: "Igneous", color: "#E7766B" },
  { id: "metamorphic", id_label: "Metamorf", en: "Metamorphic", color: "#A895C9" },
  { id: "mixed", id_label: "Campuran", en: "Mixed", color: "#9AA4AB" },
] as const;

const LITH_PARENT_OF: Record<string, (typeof LITH_PARENT_GROUPS)[number]["id"]> = {
  unconsolidated: "sedimentary", carbonate: "sedimentary", siliciclastic: "sedimentary",
  volcanic: "igneous", plutonic_felsic: "igneous", plutonic_mafic: "igneous",
  metamorphic: "metamorphic", melange: "mixed",
};

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

/** Warna kelompok besar litologi untuk layer Orebit. Pakai lith_parent bila ada (data baru),
 * jatuh ke turunan dari lith_class (data lama/cache) sebagai jaga-jaga. */
export const orebitLithColorCoarse: ExpressionSpecification = [
  "match",
  ["coalesce", ["get", "lith_parent"], ["match", ["get", "lith_class"],
    ...LITH_CLASSES.flatMap((c) => [c.id, LITH_PARENT_OF[c.id]]),
    ""]],
  ...LITH_PARENT_GROUPS.flatMap((g) => [g.id, g.color]),
  LITH_FALLBACK,
] as unknown as ExpressionSpecification;

/** Warna kelompok besar litologi untuk Macrostrat: kata kunci yang sama, keluaran warna parent. */
export const macrostratLithColorCoarse: ExpressionSpecification = [
  "case",
  ...LITH_CLASSES.flatMap((c) => [
    ["any", ...c.keywords.map((k) => ["in", k, ["downcase", ["coalesce", ["get", "lith"], ""]]])],
    LITH_PARENT_GROUPS.find((g) => g.id === LITH_PARENT_OF[c.id])!.color,
  ]),
  LITH_FALLBACK,
] as unknown as ExpressionSpecification;
