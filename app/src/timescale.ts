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

export function periodName(ma: number | undefined, lang: "id" | "en"): string {
  if (ma === undefined || Number.isNaN(ma)) return "";
  const p = PERIODS.find((x) => ma >= x.top && ma <= x.base);
  return p ? (lang === "id" ? p.id : p.en) : "";
}
