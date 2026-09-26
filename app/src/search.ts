import type maplibregl from "maplibre-gl";
import { t } from "./i18n";

interface Place { display_name: string; boundingbox: [string, string, string, string]; }

interface SearchHooks {
  /** Dipanggil saat hasil muncul (seluler: buka bottom sheet). */
  onResults: () => void;
  /** Dipanggil saat formasi dipilih: tampilkan detail unit pertamanya. */
  onPickFeature: (f: maplibregl.MapGeoJSONFeature) => void;
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
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    return;
  }
  for (const c of coords) extendBbox(b, c);
}

interface FormationHit { name: string; features: maplibregl.MapGeoJSONFeature[]; }

/**
 * Cari nama formasi di tile yang sedang dimuat (keterbatasan vector tiles: tanpa indeks global).
 * Hasil dikelompokkan per nama unik.
 */
function findFormations(map: maplibregl.Map, q: string): FormationHit[] {
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
  return [...hits.values()].sort((a, b) => b.features.length - a.features.length).slice(0, 5);
}

/** Geocoding OSM Nominatim, dibatasi ke Indonesia. Hanya dipanggil saat submit (maks. 1 permintaan/detik). */
async function findPlaces(q: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(q)}`;
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

function resultButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

export function initSearch(map: maplibregl.Map, hooks: SearchHooks) {
  const form = document.getElementById("searchForm") as HTMLFormElement;
  const input = document.getElementById("searchInput") as HTMLInputElement;
  const box = document.getElementById("searchResults") as HTMLDivElement;

  const close = () => { box.hidden = true; };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return;

    const formations = findFormations(map, q);
    const places = await findPlaces(q);
    box.innerHTML = "";

    if (formations.length) {
      box.append(group(t("resultsFormation"), formations.map((h) => resultButton(h.name, () => {
        const b: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
        for (const f of h.features) extendBbox(b, (f.geometry as { coordinates?: unknown }).coordinates);
        if (Number.isFinite(b[0])) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { maxZoom: 11, padding: 60 });
        hooks.onPickFeature(h.features[0]);
        close();
      }))));
    }
    if (places.length) {
      box.append(group(t("resultsPlace"), places.map((p) => resultButton(p.display_name, () => {
        const [s, n, w, e2] = p.boundingbox.map(Number);
        map.fitBounds([[w, s], [e2, n]], { maxZoom: 12, padding: 40 });
        close();
      }))));
    }
    if (!formations.length && !places.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = t("noResult");
      box.append(empty);
    }
    box.hidden = false;
    hooks.onResults();
  });

  input.addEventListener("input", () => { if (!input.value) close(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
