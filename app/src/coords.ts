// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
/**
 * Utilitas konversi koordinat WGS84 (lat, lon) ke UTM (Universal Transverse Mercator)
 * untuk seluruh kepulauan Indonesia (Zona 46N–54N dan 46M–54M).
 */

export interface UtmCoord {
  zone: number;
  band: string;
  hemisphere: "N" | "S";
  easting: number;
  northing: number;
  formatted: string;
}

const WGS84_A = 6378137.0;
const WGS84_E2 = 0.00669437999014;
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
const K0 = 0.9996;
const BANDS = "CDEFGHJKLMNPQRSTUVWXX";

export function utmBand(lat: number): string {
  if (lat < -80 || lat > 84) return "";
  const idx = Math.floor((lat + 80) / 8);
  return BANDS[Math.min(BANDS.length - 1, Math.max(0, idx))];
}

export function toUtm(lat: number, lon: number): UtmCoord {
  const clampedLat = Math.max(-80, Math.min(84, lat));
  const normLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const zone = Math.floor((normLon + 180) / 6) + 1;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);

  const phi = clampedLat * (Math.PI / 180);
  const lam = normLon * (Math.PI / 180);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const t = tanPhi * tanPhi;
  const c = WGS84_EP2 * cosPhi * cosPhi;
  const a = cosPhi * (lam - lon0);

  const m =
    WGS84_A *
    ((1 - WGS84_E2 / 4 - (3 * WGS84_E2 ** 2) / 64 - (5 * WGS84_E2 ** 3) / 256) * phi -
      ((3 * WGS84_E2) / 8 + (3 * WGS84_E2 ** 2) / 32 + (45 * WGS84_E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * WGS84_E2 ** 2) / 256 + (45 * WGS84_E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * WGS84_E2 ** 3) / 3072) * Math.sin(6 * phi));

  const easting =
    K0 *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * WGS84_EP2) * a ** 5) / 120) +
    500000.0;

  let northing =
    K0 *
    (m +
      n *
        tanPhi *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * WGS84_EP2) * a ** 6) / 720));

  const hemisphere: "N" | "S" = clampedLat >= 0 ? "N" : "S";
  if (clampedLat < 0) northing += 10000000.0;

  const band = utmBand(clampedLat);
  const eRound = Math.round(easting);
  const nRound = Math.round(northing);
  return {
    zone,
    band,
    hemisphere,
    easting: eRound,
    northing: nRound,
    formatted: `${zone}${band} ${eRound}mE ${nRound}mN`,
  };
}

export function formatCoordReadout(lat: number, lon: number, zoom: number): string {
  const utm = toUtm(lat, lon);
  return `${lat.toFixed(4)}°, ${lon.toFixed(4)}° · ${utm.formatted} · z${zoom.toFixed(1)}`;
}
