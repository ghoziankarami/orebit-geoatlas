import type maplibregl from "maplibre-gl";
import { CONFIG } from "./config";
import { t } from "./i18n";

export interface NationalUnit {
  unit_id: string;
  symbol: string;
  formation: string;
  region: string;
  lith_class: string;
  lith_detail: string;
  age_top_ma: number;
  age_base_ma: number;
  interval_top: string;
  interval_base: string;
  color_hex: string;
  confidence: "curated" | "auto" | "flagged";
  polygons: number;
  area_km2: number;
  bbox: [number, number, number, number];
  sheet_name?: string;
  source_url?: string;
  description?: string;
}

interface Place {
  display_name: string;
  boundingbox: [string, string, string, string];
}

interface SearchHooks {
  onResults: () => void;
  onPickFeature: (f: maplibregl.MapGeoJSONFeature) => void;
  onPickIndexUnit: (u: NationalUnit) => void;
}

const UNIT_SOURCES: { source: string; nameFields: string[] }[] = [
  { source: "orebit", nameFields: ["formation"] },
  { source: "macrostrat", nameFields: ["strat_name", "name"] },
];

type Bbox = [number, number, number, number];

function extendBbox(b: Bbox, coords: unknown): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    const [x, y] = coords as number[];
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
    return;
  }
  for (const c of coords) extendBbox(b, c);
}

interface FormationHit {
  name: string;
  features: maplibregl.MapGeoJSONFeature[];
}

/** Cari unit di indeks nasional 8 wilayah secara deterministik (dapat dites langsung di Node). */
export function searchNationalIndex(units: readonly NationalUnit[], query: string, limit = 8): NationalUnit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const scored: { score: number; unit: NationalUnit }[] = [];
  for (const u of units) {
    const sym = (u.symbol || "").toLowerCase();
    const form = (u.formation || "").toLowerCase();
    const lith = `${u.lith_class} ${u.lith_detail}`.toLowerCase();
    const reg = (u.region || "").toLowerCase();
    const age = `${u.interval_top} ${u.interval_base}`.toLowerCase();
    let score = 0;
    if (sym === needle) score = 100;
    else if (form === needle) score = 95;
    else if (sym.startsWith(needle)) score = 80;
    else if (form.startsWith(needle)) score = 75;
    else if (form.includes(needle)) score = 60;
    else if (sym.includes(needle)) score = 55;
    else if (lith.includes(needle)) score = 40;
    else if (reg.includes(needle) || age.includes(needle)) score = 30;
    if (score > 0) {
      if (u.confidence === "curated") score += 5;
      scored.push({ score, unit: u });
    }
  }
  scored.sort((a, b) => b.score - a.score || b.unit.area_km2 - a.unit.area_km2);
  return scored.slice(0, limit).map((x) => x.unit);
}

let cachedIndex: NationalUnit[] | null = null;
let indexPromise: Promise<NationalUnit[]> | null = null;

export async function loadNationalIndex(): Promise<NationalUnit[]> {
  if (cachedIndex) return cachedIndex;
  if (!indexPromise) {
    indexPromise = fetch(CONFIG.nationalIndexUrl)
      .then((res) => (res.ok ? res.json() : { units: [] }))
      .then((data) => {
        cachedIndex = Array.isArray(data?.units) ? (data.units as NationalUnit[]) : [];
        return cachedIndex;
      })
      .catch(() => {
        cachedIndex = [];
        return [];
      });
  }
  return indexPromise;
}

function findViewportFormations(map: maplibregl.Map, q: string): FormationHit[] {
  const needle = q.toLowerCase();
  const hits = new Map<string, FormationHit>();
  for (const { source, nameFields } of UNIT_SOURCES) {
    if (!map.getSource(source)) continue;
    const feats = map.querySourceFeatures(source, { sourceLayer: "units" }) as maplibregl.MapGeoJSONFeature[];
    for (const f of feats) {
      const name = nameFields.map((k) => f.properties?.[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
      if (!name || !name.toLowerCase().includes(needle)) continue;
      const key = name.trim();
      if (!hits.has(key)) hits.set(key, { name: key, features: [] });
      hits.get(key)!.features.push(f);
    }
  }
  return [...hits.values()].sort((a, b) => b.features.length - a.features.length).slice(0, 4);
}

async function findPlaces(q: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=4&countrycodes=id&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "Accept-Language": document.documentElement.lang } });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

function group(title: string, items: HTMLButtonElement[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "result-group";
  const h = document.createElement("p");
  h.className = "result-title";
  h.textContent = title;
  const ul = document.createElement("ul");
  for (const btn of items) {
    const li = document.createElement("li");
    li.append(btn);
    ul.append(li);
  }
  wrap.append(h, ul);
  return wrap;
}

function resultButton(mainText: string, metaText: string | undefined, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "search-item";
  const titleSpan = document.createElement("span");
  titleSpan.className = "search-item-main";
  titleSpan.textContent = mainText;
  btn.append(titleSpan);
  if (metaText) {
    const metaSpan = document.createElement("span");
    metaSpan.className = "search-item-meta";
    metaSpan.textContent = metaText;
    btn.append(metaSpan);
  }
  btn.addEventListener("click", onClick);
  return btn;
}

export function initSearch(map: maplibregl.Map, hooks: SearchHooks) {
  const form = document.getElementById("searchForm") as HTMLFormElement;
  const input = document.getElementById("searchInput") as HTMLInputElement;
  const clearBtn = document.getElementById("searchClear") as HTMLButtonElement | null;
  const box = document.getElementById("searchResults") as HTMLDivElement;

  let activeIdx = -1;
  let localTimer: number | undefined;
  let placeTimer: number | undefined;
  let latestQuery = "";

  // Mulai preload indeks nasional secara senyap di latar
  void loadNationalIndex();

  const close = () => {
    box.hidden = true;
    activeIdx = -1;
  };

  const syncClear = () => {
    if (clearBtn) clearBtn.hidden = input.value.length === 0;
  };

  const renderResults = (
    nationalHits: NationalUnit[],
    viewportHits: FormationHit[],
    places: Place[],
    showEmpty: boolean,
  ) => {
    box.innerHTML = "";
    activeIdx = -1;

    if (nationalHits.length) {
      box.append(
        group(
          t("resultsNational"),
          nationalHits.map((u) =>
            resultButton(
              `${u.formation} (${u.symbol})`,
              `${u.region.toUpperCase()} · ${u.interval_base || ""}`,
              () => {
                const [w, s, e, n] = u.bbox;
                if ([w, s, e, n].every(Number.isFinite)) {
                  map.fitBounds([[w, s], [e, n]], { maxZoom: 11, padding: 60, duration: 900 });
                }
                hooks.onPickIndexUnit(u);
                close();
              },
            ),
          ),
        ),
      );
    }

    if (viewportHits.length) {
      box.append(
        group(
          t("resultsFormation"),
          viewportHits.map((h) =>
            resultButton(h.name, undefined, () => {
              const b: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
              for (const f of h.features) extendBbox(b, (f.geometry as { coordinates?: unknown }).coordinates);
              if (Number.isFinite(b[0])) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { maxZoom: 11, padding: 60 });
              hooks.onPickFeature(h.features[0]);
              close();
            }),
          ),
        ),
      );
    }

    if (places.length) {
      box.append(
        group(
          t("resultsPlace"),
          places.map((p) =>
            resultButton(p.display_name, undefined, () => {
              const [s, n, w, e2] = p.boundingbox.map(Number);
              map.fitBounds([[w, s], [e2, n]], { maxZoom: 12, padding: 40 });
              close();
            }),
          ),
        ),
      );
    }

    if (!nationalHits.length && !viewportHits.length && !places.length) {
      if (!showEmpty) {
        close();
        return;
      }
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = t("noResult");
      box.append(empty);
    }

    box.hidden = false;
    hooks.onResults();
  };

  const runSearch = async (q: string, includePlaces: boolean) => {
    latestQuery = q;
    if (q.length < 2) {
      close();
      return;
    }
    const units = await loadNationalIndex();
    if (q !== latestQuery) return;
    const nat = searchNationalIndex(units, q, 6);
    const vp = findViewportFormations(map, q);
    renderResults(nat, vp, [], !includePlaces && !nat.length && !vp.length);

    if (includePlaces) {
      const places = await findPlaces(q);
      if (q !== latestQuery) return;
      renderResults(nat, vp, places, true);
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    window.clearTimeout(localTimer);
    window.clearTimeout(placeTimer);
    void runSearch(q, true);
  });

  input.addEventListener("input", () => {
    syncClear();
    const q = input.value.trim();
    window.clearTimeout(localTimer);
    window.clearTimeout(placeTimer);
    if (q.length < 2) {
      close();
      return;
    }
    localTimer = window.setTimeout(() => void runSearch(q, false), 150);
    placeTimer = window.setTimeout(() => void runSearch(q, true), 450);
  });

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    syncClear();
    close();
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    const items = [...box.querySelectorAll<HTMLButtonElement>("button.search-item")];
    if (e.key === "Escape") {
      close();
      return;
    }
    if (!items.length || box.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % items.length;
      items.forEach((b, i) => b.classList.toggle("is-active", i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      items.forEach((b, i) => b.classList.toggle("is-active", i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      items[activeIdx]?.click();
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (!form.contains(e.target as Node)) close();
  });

  syncClear();
}
