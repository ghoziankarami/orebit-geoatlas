import type { ColorMode } from "./layers";
import type { Lang } from "./i18n";
import { CONFIG } from "./config";

export interface AppState {
  mode: ColorMode;
  ageMin: number;
  ageMax: number;
  lines: boolean;
  lang?: Lang;
  topo?: boolean;
  view3d?: boolean;
  geologyOpacity: number;
}

/** Status aplikasi disimpan di hash URL bersama posisi peta (#map=…) agar bisa dibagikan. */
export function readState(): AppState {
  const p = new URLSearchParams(location.hash.slice(1));
  const [a, b] = (p.get("age") ?? "").split("-").map(Number);
  const lang = p.get("lang");
  return {
    mode: p.get("mode") === "lith" ? "lith" : "age",
    ageMin: Number.isFinite(a) ? a : 0,
    ageMax: Number.isFinite(b) ? b : CONFIG.ageMaxMa,
    lines: p.get("lines") !== "0",
    lang: lang === "en" || lang === "id" ? lang : undefined,
    topo: p.get("topo") === "1",
    view3d: p.get("view") === "3d",
    geologyOpacity: Math.min(100, Math.max(15, Number(p.get("geo") ?? 75) || 75)),
  };
}

export function writeState(s: AppState) {
  const p = new URLSearchParams(location.hash.slice(1));
  p.set("mode", s.mode);
  if (s.ageMin === 0 && s.ageMax === CONFIG.ageMaxMa) p.delete("age");
  else p.set("age", `${s.ageMin}-${s.ageMax}`);
  if (s.lines) p.delete("lines"); else p.set("lines", "0");
  if (s.lang) p.set("lang", s.lang);
  if (s.topo) p.set("topo", "1"); else p.delete("topo");
  if (s.view3d) p.set("view", "3d"); else p.delete("view");
  if (s.geologyOpacity === 75) p.delete("geo"); else p.set("geo", String(s.geologyOpacity));
  history.replaceState(null, "", `#${decodeURIComponent(p.toString())}`);
}
