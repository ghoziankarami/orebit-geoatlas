# Orebit GeoAtlas

Peta geologi Indonesia yang mulus dan ringan di browser, dari skala global sampai 1:100.000.
Terinspirasi dari [Macrostrat](https://macrostrat.org): legenda diharmonisasi antar-lembar, lalu
disajikan sebagai vector tiles statis (PMTiles) yang dirender dengan MapLibre GL JS. Tanpa server peta.

## Cara kerja singkat

| Zoom | Sumber | Lisensi |
| --- | --- | --- |
| 0–14 (dasar) | Tile Macrostrat `carto` (untuk Indonesia: peta global GSC/Chorlton 2007) | CC-BY 4.0 |
| 6–14 (di atasnya) | PMTiles Orebit dari layer ESDM PSG yang sudah diharmonisasi | Lisensi Terbuka PSG: atribusi, dilarang dijual |

Area yang belum punya PMTiles Orebit tetap tampil dari Macrostrat.

## Menjalankan aplikasi

```bash
cd app
npm install
npm run dev          # http://localhost:5173 — langsung jalan dengan data Macrostrat
```

Untuk menampilkan data Orebit, salin `app/.env.example` ke `app/.env` dan isi `VITE_TILES_URL`
dengan URL PMTiles (lokal atau R2).

## Membangun data satu wilayah

Butuh Python 3.11+ dan [tippecanoe](https://github.com/felt/tippecanoe) ≥ 2.17.

```bash
pip install -r pipeline/requirements.txt
# 1. Unduh SHP kabupaten dari https://geologi.esdm.go.id/geomap ke data/raw/babel/<nama-lembar>/
make inventory REGION=babel     # daftar simbol baru → reference/crosswalk.csv
# 2. Kurasi crosswalk.csv & units.csv (lihat docs/kurasi-crosswalk.md)
make validate
make tiles REGION=babel         # → data/out/babel/babel.pmtiles
```

Tahapan pipeline: `01_ingest` (baca & reproyeksi) → `02_validate` (perbaiki geometri, QA) →
`03_harmonize` (crosswalk → unit baku, umur Ma, warna ICS) → `04_edgematch` (gabung lintas lembar,
tandai sambungan bermasalah) → `05_export` (GeoJSONSeq) → `06_tile.sh` (PMTiles).

## Deploy

Untuk satu build nasional dari layanan ESDM, lihat
[panduan build nasional](docs/national-build.md). Kode penarikan dan kurasi
otomatis tersedia; hasil 36.078 poligon dan garis sesar belum dapat dinyatakan
selesai sebelum manifest, QA, dan PMTiles asli diverifikasi.

- **App**: Vercel atau Cloudflare Pages, root directory `app`, build `npm run build`, output `dist`,
  env `VITE_TILES_URL`. Domain yang disarankan: `atlas.orebit.id` (CNAME di DNS orebit.id).
- **Tile**: unggah `*.pmtiles` ke Cloudflare R2 (mis. `tiles.orebit.id`), aktifkan CORS untuk
  `GET, HEAD` dengan header `Range` dari origin `https://atlas.orebit.id`.
- **Situs Quarto orebit.id**: tautkan dari menu, atau embed:
  `<iframe src="https://atlas.orebit.id" width="100%" height="640" style="border:0"></iframe>`

## Atribusi & disclaimer

Bukan peta resmi. Data 1:100k © Pusat Survei Geologi, Badan Geologi, diolah Orebit.
Tile dasar © Macrostrat (CC-BY 4.0) dan penyedia data aslinya. Basemap © OpenStreetMap contributors, OpenFreeMap.
Data mentah GeoMap tidak disimpan di repo ini.

## Status

MVP dalam pengembangan. PRD: [docs/PRD.md](docs/PRD.md).
