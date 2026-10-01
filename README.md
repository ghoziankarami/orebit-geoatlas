# Orebit GeoAtlas

Peta geologi multi-sumber Indonesia yang ringan di browser. Skala dan kelengkapan mengikuti sumber data yang tersedia.
Terinspirasi dari [Macrostrat](https://macrostrat.org): legenda diharmonisasi antar-lembar, lalu
disajikan sebagai vector tiles statis (PMTiles) yang dirender dengan MapLibre GL JS. Tanpa server peta.

## Cara kerja singkat

| Zoom | Sumber | Lisensi |
| --- | --- | --- |
| 0–14 (dasar) | Tile Macrostrat `carto` (untuk Indonesia: peta global GSC/Chorlton 2007) | CC-BY 4.0 |
| 8+ (di atasnya) | PMTiles Orebit dari layanan Geologi Litologi ESDM (status Mei 2018); saat ini cakupan Bangka-Belitung dan Sumatra | Lisensi Terbuka PSG: atribusi, dilarang dijual |
| Hillshade dan medan 3D | Tile elevasi Mapterhorn, Terrarium | Lihat [atribusi sumber terrain](https://mapterhorn.com/attribution) |

Layanan ESDM yang dipakai tidak menyatakan skala pada metadata pipeline ini; jangan anggap lapisan Orebit saat ini sebagai peta 1:100.000. Area lain, termasuk Jawa, Kalimantan, Sulawesi, dan Papua, tampil dari Macrostrat sampai data rinci tersedia.
Tombol **Topografi** menambahkan hillshade. Tombol **3D** memiringkan kamera dan menampilkan elevasi; **2D** kembali ke tampak atas.

Crosswalk Bangka-Belitung berisi 22 simbol tanpa unit otomatis. Di Sumatra, 470 dari 479 baris unit memakai pemetaan otomatis berbasis istilah umur sumber dan kata kunci nama/deskripsi litologi; hasilnya belum ditelaah geolog secara independen. Geometri yang lolos pipeline bukan bukti bahwa interpretasi umur dan litologinya sudah benar.

## Menjalankan aplikasi

```bash
cd app
npm install
npm run dev          # http://localhost:5173 — langsung jalan dengan data Macrostrat
```

Untuk menampilkan data Orebit, salin `app/.env.example` ke `app/.env`. Nilai awalnya menunjuk ke tile nasional di `https://atlas.orebit.id/tiles/all.pmtiles`; ganti dengan URL PMTiles milikmu jika memakai tile lain.

## Membangun data satu wilayah

Butuh Python 3.11+ dan [tippecanoe](https://github.com/felt/tippecanoe) ≥ 2.17.

```bash
pip install -r pipeline/requirements.txt
# Ambil data layanan ESDM untuk wilayah yang didukung pipeline
make inventory REGION=babel     # daftar simbol → reference/crosswalk.csv
# 2. Kurasi crosswalk.csv & units.csv (lihat docs/kurasi-crosswalk.md)
make validate
make tiles REGION=babel         # → data/out/babel/babel.pmtiles
```

Tahapan pipeline: `01_ingest` (baca & reproyeksi) → `02_validate` (perbaiki geometri, QA) →
`03_harmonize` (crosswalk → unit baku, umur Ma, warna ICS) → `04_edgematch` (gabung lintas lembar,
tandai sambungan bermasalah) → `05_export` (GeoJSONSeq) → `06_tile.sh` (PMTiles).

## Deploy

- **App**: Vercel atau Cloudflare Pages, root directory `app`, build `npm run build`, output `dist`,
  env `VITE_TILES_URL`. Domain yang disarankan: `atlas.orebit.id` (CNAME di DNS orebit.id).
- **Tile**: unggah `*.pmtiles` ke Cloudflare R2 (mis. `tiles.orebit.id`), aktifkan CORS untuk
  `GET, HEAD` dengan header `Range` dari origin `https://atlas.orebit.id`.
- **Situs Quarto orebit.id**: tautkan dari menu, atau embed:
  `<iframe src="https://atlas.orebit.id" width="100%" height="640" style="border:0"></iframe>`

## Atribusi & disclaimer

Bukan peta resmi. Data layanan Geologi Litologi ESDM (status Mei 2018), cakupan Bangka-Belitung dan Sumatra, © Pusat Survei Geologi, Badan Geologi, diolah Orebit. Skala sumber tidak dinyatakan pada metadata pipeline.
Tile dasar © Macrostrat (CC-BY 4.0) dan penyedia data aslinya. Basemap © OpenStreetMap contributors, OpenFreeMap.
Data mentah GeoMap tidak disimpan di repo ini.

## Status

MVP dalam pengembangan (M0 scaffold selesai). PRD: [docs/PRD.md](docs/PRD.md) · [versi lengkap](https://claude.ai/code/artifact/ad4fc269-8236-42dc-9846-63c9516de477) · [desain UI](https://claude.ai/artifact/6bmHZNaq7XYGdZ8T8E6CHn)
