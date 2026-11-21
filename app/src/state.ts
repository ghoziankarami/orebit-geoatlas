import type { ColorMode } from "./layers";
import type { Lang } from "./i18n";
import { CONFIG, type BasemapId } from "./config";

export type ConfidenceFilter = "all" | "curated" | "review";

export interface AppState {
  mode: ColorMode;
  ageMin: number;
  ageMax: number;
  lithFilter?: string;
  confFilter: ConfidenceFilter;
  basemap: BasemapId;
  region?: string;
  lines: boolean;
  lang?: Lang;
  topo?: boolean;
  view3d?: boolean;
  geologyOpacity: number;
}

/** Status aplikasi disimpan di hash URL bersama posisi peta (#map=…) agar bisa dibagikan. */
export function readState(hashStr = location.hash): AppState {
  const p = new URLSearchParams(hashStr.startsWith("#") ? hashStr.slice(1) : hashStr);
  const [a, b] = (p.get("age") ?? "").split("-").map(Number);
  const lang = p.get("lang");
  const conf = p.get("conf");
  const base = p.get("base");
  const lith = p.get("lith") ?? undefined;
  const region = p.get("reg") ?? undefined;
  return {
    mode: p.get("mode") === "lith" ? "lith" : "age",
    ageMin: Number.isFinite(a) ? Math.max(0, a) : 0,
    ageMax: Number.isFinite(b) ? Math.min(CONFIG.ageMaxMa, b) : CONFIG.ageMaxMa,
    lithFilter: lith || undefined,
    confFilter: conf === "curated" || conf === "review" ? conf : "all",
    basemap: base === "dark" || base === "topo" ? base : "light",
    region: region || undefined,
    lines: p.get("lines") !== "0",
    lang: lang === "en" || lang === "id" ? lang : undefined,
    topo: p.get("topo") === "1" || base === "topo",
    view3d: p.get("view") === "3d",
    geologyOpacity: Math.min(100, Math.max(15, Number(p.get("geo") ?? 75) || 75)),
  };
}

export function serializeState(s: AppState, currentHash = location.hash): string {
  const p = new URLSearchParams(currentHash.startsWith("#") ? currentHash.slice(1) : currentHash);
  p.set("mode", s.mode);
  if (s.ageMin === 0 && s.ageMax === CONFIG.ageMaxMa) p.delete("age");
  else p.set("age", `${s.ageMin}-${s.ageMax}`);
  if (s.lithFilter) p.set("lith", s.lithFilter);
  else p.delete("lith");
  if (s.confFilter && s.confFilter !== "all") p.set("conf", s.confFilter);
  else p.delete("conf");
  if (s.basemap && s.basemap !== "light") p.set("base", s.basemap);
  else p.delete("base");
  if (s.region && s.region !== "all") p.set("reg", s.region);
  else p.delete("reg");
  if (s.lines) p.delete("lines");
  else p.set("lines", "0");
  if (s.lang) p.set("lang", s.lang);
  if (s.topo) p.set("topo", "1");
  else p.delete("topo");
  if (s.view3d) p.set("view", "3d");
  else p.delete("view");
  if (s.geologyOpacity === 75) p.delete("geo");
  else p.set("geo", String(s.geologyOpacity));
  return `#${decodeURIComponent(p.toString())}`;
}

export function writeState(s: AppState) {
  history.replaceState(null, "", serializeState(s));
}
