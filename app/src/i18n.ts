export type Lang = "id" | "en";

const dict = {
  id: {
    tagline: "Peta geologi Indonesia, dari skala global sampai 1:100.000.",
    searchLabel: "Cari lokasi",
    searchPlaceholder: "Cari lokasi, mis. Pangkalpinang",
    noResult: "Lokasi tidak ditemukan. Coba nama kota atau kabupaten.",
    colorBy: "Warnai berdasarkan",
    modeAge: "Umur",
    modeLith: "Litologi",
    ageFilter: "Rentang umur",
    lines: "Tampilkan sesar dan kontak",
    legendAge: "Skala waktu (ICS)",
    legendLith: "Kelas litologi",
    disclaimer: "Bukan peta resmi. Selalu rujuk lembar asli Badan Geologi untuk keputusan teknis.",
    formation: "Formasi",
    age: "Umur",
    lith: "Litologi",
    description: "Deskripsi",
    source: "Sumber",
    openSource: "Buka sumber asli",
    loadingSource: "Memuat referensi sumber…",
    unnamed: "Unit tanpa nama",
    ma: "jtl",
  },
  en: {
    tagline: "Geologic map of Indonesia, from global scale down to 1:100,000.",
    searchLabel: "Search places",
    searchPlaceholder: "Search a place, e.g. Pangkalpinang",
    noResult: "No place found. Try a city or regency name.",
    colorBy: "Color by",
    modeAge: "Age",
    modeLith: "Lithology",
    ageFilter: "Age range",
    lines: "Show faults and contacts",
    legendAge: "Time scale (ICS)",
    legendLith: "Lithology class",
    disclaimer: "Not an official map. Always refer to the original Geological Agency sheets for technical decisions.",
    formation: "Formation",
    age: "Age",
    lith: "Lithology",
    description: "Description",
    source: "Source",
    openSource: "Open original source",
    loadingSource: "Loading source reference…",
    unnamed: "Unnamed unit",
    ma: "Ma",
  },
} as const;

export type Key = keyof (typeof dict)["id"];
let current: Lang = (navigator.language || "id").startsWith("id") ? "id" : "en";

export const getLang = () => current;
export const setLang = (l: Lang) => {
  current = l;
  document.documentElement.lang = l;
};
export const t = (k: Key) => dict[current][k];
