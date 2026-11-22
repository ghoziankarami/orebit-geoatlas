// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Pelacakan GPS lapangan: titik + lingkar akurasi, mode ikuti, dan unit geologi di bawah posisi.
import maplibregl from "maplibre-gl";
import { t } from "./i18n";
import { styleReady } from "./layers";

const SRC = "gps-src";

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
  alt: number | null;
}

/** Poligon lingkaran akurasi (meter) di sekitar titik; cukup akurat untuk radius < beberapa km. */
export function accuracyRing(lng: number, lat: number, radiusM: number, steps = 48): [number, number][] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

export function createGps(
  map: maplibregl.Map,
  opts: {
    toast: (msg: string) => void;
    queryLayers: () => string[];
    onPickFeature: (f: maplibregl.MapGeoJSONFeature) => void;
    onFix: (fix: Fix) => void;
  },
) {
  const btn = document.getElementById("locateBtn") as HTMLButtonElement;
  const card = document.getElementById("gpsCard")!;
  const unitBtn = document.getElementById("gpsUnit") as HTMLButtonElement;
  const accEl = document.getElementById("gpsAcc")!;
  let watchId: number | null = null;
  let follow = false;
  let fix: Fix | null = null;
  let firstFix = true;
  let unitFeature: maplibregl.MapGeoJSONFeature | undefined;
  // Titik lokasi = DOM marker: selalu di atas kanvas, tidak bergantung urutan layer, ganti style, atau GPU.
  const dotEl = document.createElement("div");
  dotEl.className = "me-dot";
  dotEl.setAttribute("aria-hidden", "true");
  const marker = new maplibregl.Marker({ element: dotEl });

  const syncBtn = () => {
    const on = watchId !== null;
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("is-tracking", on);
    btn.classList.toggle("is-free", on && !follow);
    btn.setAttribute("aria-label", t(on && follow ? "gpsStop" : "gpsStart"));
    btn.title = btn.getAttribute("aria-label") ?? "";
    card.hidden = !on;
  };

  const ensureLayers = () => {
    if (!styleReady(map)) return false;
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    if (!map.getLayer("gps-acc")) {
      map.addLayer({ id: "gps-acc", type: "fill", source: SRC, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#1D7FE0", "fill-opacity": 0.14 } });
      map.addLayer({ id: "gps-acc-line", type: "line", source: SRC, filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#1D7FE0", "line-width": 1.2, "line-opacity": 0.6 } });
    } else {
      ["gps-acc", "gps-acc-line"].forEach((id) => map.moveLayer(id));
    }
    return true;
  };

  const draw = () => {
    if (fix) marker.setLngLat([fix.lng, fix.lat]).addTo(map);
    else marker.remove();
    try {
      if (!ensureLayers()) return;
      const features = fix
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [accuracyRing(fix.lng, fix.lat, fix.acc)] } }]
        : [];
      (map.getSource(SRC) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features });
    } catch {
      /* gaya peta sedang berganti */
    }
  };

  const updateUnit = () => {
    if (!fix) {
      unitBtn.textContent = t("gpsSearching");
      accEl.textContent = "";
      unitBtn.disabled = true;
      return;
    }
    accEl.textContent = `±${Math.round(fix.acc)} m`;
    accEl.title = t("gpsAccuracy");
    const pt = map.project([fix.lng, fix.lat]);
    const c = map.getCanvas();
    const inView = pt.x >= 0 && pt.y >= 0 && pt.x <= c.clientWidth && pt.y <= c.clientHeight;
    const layers = opts.queryLayers();
    unitFeature = inView && layers.length ? map.queryRenderedFeatures(pt, { layers })[0] : undefined;
    const p = (unitFeature?.properties ?? {}) as Record<string, unknown>;
    const name = String(p.formation || p.strat_name || p.name || "");
    const sym = String(p.symbol || "");
    unitBtn.textContent = unitFeature ? `${t("gpsHere")}: ${name || sym}${sym && name ? ` (${sym})` : ""}` : t("gpsNoUnit");
    unitBtn.disabled = !unitFeature;
  };

  const stop = () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    fix = null;
    follow = false;
    draw();
    syncBtn();
  };

  const start = () => {
    if (!window.isSecureContext) {
      opts.toast(t("gpsInsecure"));
      return;
    }
    if (!("geolocation" in navigator)) {
      opts.toast(t("locateFail"));
      return;
    }
    follow = true;
    firstFix = true;
    watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        fix = { lat: coords.latitude, lng: coords.longitude, acc: coords.accuracy, alt: coords.altitude ?? null };
        draw();
        opts.onFix(fix);
        if (follow) {
          if (firstFix) map.flyTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), 13), duration: 900 });
          else map.easeTo({ center: [fix.lng, fix.lat], duration: 500 });
        }
        firstFix = false;
        updateUnit();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          opts.toast(t("gpsDenied"));
          stop();
        } else if (!fix) unitBtn.textContent = t("gpsSearching");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    syncBtn();
    updateUnit();
  };

  btn.addEventListener("click", () => {
    if (watchId === null) start();
    else if (!follow) {
      follow = true;
      if (fix) map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 });
      syncBtn();
    } else stop();
  });
  // Geser peta manual = lepas mode ikuti, pelacakan tetap jalan.
  map.on("dragstart", () => {
    if (watchId !== null && follow) {
      follow = false;
      syncBtn();
    }
  });
  // "idle" bisa tertunda lama bila tile basemap lambat (mis. satelit); perbarui juga saat data geologi masuk.
  let dataTimer: number | undefined;
  const scheduleUnit = () => {
    if (watchId === null || dataTimer !== undefined) return;
    dataTimer = window.setTimeout(() => {
      dataTimer = undefined;
      draw();
      updateUnit();
    }, 600);
  };
  map.on("idle", scheduleUnit);
  map.on("moveend", scheduleUnit);
  map.on("sourcedata", (e) => {
    if (e.isSourceLoaded) scheduleUnit();
  });
  unitBtn.addEventListener("click", () => {
    if (unitFeature) opts.onPickFeature(unitFeature);
  });

  return {
    isTracking: () => watchId !== null && fix !== null,
    lastFix: () => fix,
    refresh: () => {
      draw();
      syncBtn();
      if (watchId !== null) updateUnit();
    },
  };
}
