/**
 * Periode ICS untuk legenda mode umur. Batas umur mengikuti International
 * Chronostratigraphic Chart; verifikasi ulang dengan rilis ICS terbaru sebelum rilis publik.
 */
export const PERIODS = [
  { id: "Kuarter", en: "Quaternary", top: 0, base: 2.58, color: "#F9F97F" },
  { id: "Neogen", en: "Neogene", top: 2.58, base: 23.03, color: "#FFE619" },
  { id: "Paleogen", en: "Paleogene", top: 23.03, base: 66.0, color: "#FD9A52" },
  { id: "Kapur", en: "Cretaceous", top: 66.0, base: 143.1, color: "#7FC64E" },
  { id: "Jura", en: "Jurassic", top: 143.1, base: 201.4, color: "#34B2C9" },
  { id: "Trias", en: "Triassic", top: 201.4, base: 251.9, color: "#812B92" },
  { id: "Perm", en: "Permian", top: 251.9, base: 298.9, color: "#F04028" },
  { id: "Karbon", en: "Carboniferous", top: 298.9, base: 358.9, color: "#67A599" },
  { id: "Devon", en: "Devonian", top: 358.9, base: 419.6, color: "#CB8C37" },
  { id: "Silur", en: "Silurian", top: 419.6, base: 443.1, color: "#B3E1B6" },
  { id: "Ordovisium", en: "Ordovician", top: 443.1, base: 486.9, color: "#009270" },
  { id: "Kambrium", en: "Cambrian", top: 486.9, base: 538.8, color: "#7FA056" },
  { id: "Prakambrium", en: "Precambrian", top: 538.8, base: 4567, color: "#F73563" },
] as const;

/**
 * Interval halus (epoch, atau period tanpa pembagian epoch di Paleozoikum-ke-bawah) untuk
 * legenda mode umur saat zoom dekat. Mengikuti persis reference/ics_intervals.csv — hanya baris
 * yang benar-benar bisa "menang" di pipeline/03_harmonize.py:ics_color (interval tersempit yang
 * memuat umur base), supaya legenda cocok dengan warna yang benar-benar tampil.
 */
export const EPOCHS = [
  { id: "Holosen", en: "Holocene", top: 0, base: 0.0117, color: "#FEF2E0" },
  { id: "Plistosen", en: "Pleistocene", top: 0.0117, base: 2.58, color: "#FFF2AE" },
  { id: "Pliosen", en: "Pliocene", top: 2.58, base: 5.333, color: "#FFFF99" },
  { id: "Miosen", en: "Miocene", top: 5.333, base: 23.03, color: "#FFFF00" },
  { id: "Oligosen", en: "Oligocene", top: 23.03, base: 33.9, color: "#FEC07A" },
  { id: "Eosen", en: "Eocene", top: 33.9, base: 56.0, color: "#FDB46C" },
  { id: "Paleosen", en: "Paleocene", top: 56.0, base: 66.0, color: "#FDA75F" },
  { id: "Kapur Akhir", en: "Late Cretaceous", top: 66.0, base: 100.5, color: "#A6D84A" },
  { id: "Kapur Awal", en: "Early Cretaceous", top: 100.5, base: 143.1, color: "#8CCD57" },
  { id: "Jura Akhir", en: "Late Jurassic", top: 143.1, base: 161.5, color: "#B3E3EE" },
  { id: "Jura Tengah", en: "Middle Jurassic", top: 161.5, base: 174.7, color: "#80CFD8" },
  { id: "Jura Awal", en: "Early Jurassic", top: 174.7, base: 201.4, color: "#42AED0" },
  { id: "Trias Akhir", en: "Late Triassic", top: 201.4, base: 237.0, color: "#BD8CC3" },
  { id: "Trias Tengah", en: "Middle Triassic", top: 237.0, base: 247.2, color: "#B168B1" },
  { id: "Trias Awal", en: "Early Triassic", top: 247.2, base: 251.902, color: "#983999" },
  { id: "Perm", en: "Permian", top: 251.902, base: 298.9, color: "#F04028" },
  { id: "Karbon", en: "Carboniferous", top: 298.9, base: 358.9, color: "#67A599" },
  { id: "Devon", en: "Devonian", top: 358.9, base: 419.62, color: "#CB8C37" },
  { id: "Silur", en: "Silurian", top: 419.62, base: 443.1, color: "#B3E1B6" },
  { id: "Ordovisium", en: "Ordovician", top: 443.1, base: 486.85, color: "#009270" },
  { id: "Kambrium", en: "Cambrian", top: 486.85, base: 538.8, color: "#7FA056" },
  { id: "Prakambrium", en: "Precambrian", top: 538.8, base: 4567, color: "#F73563" },
] as const;

export function periodName(ma: number | undefined, lang: "id" | "en"): string {
  if (ma === undefined || Number.isNaN(ma)) return "";
  const p = PERIODS.find((x) => ma >= x.top && ma <= x.base);
  return p ? (lang === "id" ? p.id : p.en) : "";
}
