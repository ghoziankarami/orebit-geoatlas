import type maplibregl from "maplibre-gl";
import { t } from "./i18n";

interface Place { display_name: string; lat: string; lon: string; boundingbox: [string, string, string, string]; }

/** Geocoding OSM Nominatim, dibatasi ke Indonesia. Hormati kebijakan pemakaian: 1 permintaan/detik. */
export function initSearch(map: maplibregl.Map) {
  const form = document.getElementById("searchForm") as HTMLFormElement;
  const input = document.getElementById("searchInput") as HTMLInputElement;
  const list = document.getElementById("searchResults") as HTMLUListElement;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(q)}`;
    let places: Place[] = [];
    try { places = await (await fetch(url, { headers: { "Accept-Language": document.documentElement.lang } })).json(); } catch { /* jaringan gagal: tampilkan pesan kosong */ }
    list.innerHTML = "";
    if (!places.length) {
      list.innerHTML = `<li class="empty">${t("noResult")}</li>`;
    } else {
      for (const p of places) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = p.display_name;
        btn.addEventListener("click", () => {
          const [s, n, w, e2] = p.boundingbox.map(Number);
          map.fitBounds([[w, s], [e2, n]], { maxZoom: 12, padding: 40 });
          list.hidden = true;
        });
        li.append(btn);
        list.append(li);
      }
    }
    list.hidden = false;
  });

  input.addEventListener("input", () => { if (!input.value) list.hidden = true; });
}
