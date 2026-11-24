# Runbook Deploy Produksi — `atlas.orebit.id` (`WP-18`)

Runbook ini mengatur publikasi build produksi Orebit GeoAtlas (`app/dist`) dan PMTiles nasional ke server produksi `atlas.orebit.id` setelah seluruh gerbang `local-ci.sh --full --write-receipt` lulus dan pemilik memberikan persetujuan eksplisit.

## 1. Prasyarat Rilis (`REL-01`)

1. Working tree bersih pada commit `main` terbaru.
2. Receipt CI lokal exact-SHA tersedia di `.tmp-tier-receipts/local-ci-<SHA>.json` dengan seluruh cek `PASS` (termasuk `browser-uiux` Playwright desktop & seluler).
3. Berkas indeks nasional `app/public/data/indonesia-units-index.json` mencakup seluruh 8 wilayah (`sumatra`, `babel`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`).
4. Persetujuan eksplisit `"ya"` dari pemilik untuk SHA commit kandidat dan checksum SHA256 `app/dist/index.html`.

## 2. Langkah Deploy di VPS (`atlas.orebit.id`)

```bash
# 1. Di lokal / server build: pastikan build & indeks mutakhir
make validate && make index && make app
shasum -a 256 app/dist/index.html app/dist/data/indonesia-units-index.json

# 2. Di VPS (/opt/orebit-geoatlas): tarik commit terverifikasi dan sinkronkan webroot
cd /opt/orebit-geoatlas
git fetch origin && git pull --ff-only origin main
cd app && npm ci && npm run build
sudo rsync -av --delete dist/ /var/www/atlas.orebit.id/html/

# 3. Pasang PMTiles nasional (bila diperbarui dari pipeline) ke direktori tiles Nginx
# Pastikan header HTTP Range (Accept-Ranges: bytes) dan CORS aktif pada /tiles/*.pmtiles
sudo ls -lh /var/www/atlas.orebit.id/tiles/
```

## 3. Verifikasi Pasca-Deploy

1. Wajib jalankan `python3 ops/scripts/ci/prod-smoke.py https://atlas.orebit.id` segera setelah symlink `current` dialihkan; bila ada cek `FAIL`, segera kembalikan `current` ke rilis sebelumnya (rollback).
2. Pastikan seluruh 7 cek `prod-smoke.py` berstatus `PASS` (`/`, `/app/` HTTP 200 + `Permissions-Policy: geolocation=(self)`, `/assets/*.js` `immutable`, `/manifest.json`, `/sw.js`, `/data/indonesia-units-index.json` gzip + 8 wilayah + ≥ 2.000 unit, dan `/tiles/*.pmtiles` `206 Partial Content` + `Accept-Ranges: bytes` + CORS).
3. Catat tanggal deploy, commit SHA, dan hasil verifikasi di `ACTIVE CHECKPOINT` pada [HANDOVER-geoatlas.md](../handover/HANDOVER-geoatlas.md).
