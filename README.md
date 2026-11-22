# Orebit GeoAtlas

[![Buka atlas.orebit.id](https://img.shields.io/badge/Live-atlas.orebit.id-167f77?style=for-the-badge)](https://atlas.orebit.id)
[![Lisensi kode: GPL-3.0](https://img.shields.io/badge/Code-GPL--3.0-52616b?style=flat-square)](LICENSE)

Peta geologi Indonesia untuk lapangan dan kantor: unit geologi di bawah posisi GPS, waypoint dengan strike/dip, penampang geologi, dan ekspor PNG/GPX, langsung di browser HP maupun desktop.

![Orebit GeoAtlas di lapangan](app/public/og-geoatlas-2026-11.png)

**[Halaman pengantar](https://atlas.orebit.id) · [Buka peta](https://atlas.orebit.id/app/) · [Video cara pakai (72 dtk)](https://atlas.orebit.id/#video) · [Laporkan masalah](https://github.com/ghoziankarami/orebit-geoatlas/issues)**

<p>
  <img src="app/public/landing/m-gps.webp" alt="GPS: titik biru dan unit geologi di bawah posisi" width="180" />
  <img src="app/public/landing/m-waypoint-editor.webp" alt="Waypoint struktur dengan strike/dip" width="180" />
  <img src="app/public/landing/m-section.webp" alt="Penampang geologi dengan waypoint terproyeksi" width="180" />
</p>

## Fitur

**Di lapangan (HP)**
- GPS langsung dengan lingkar akurasi dan mode ikuti; kartu menyebut unit geologi di bawah posisi (ketuk untuk detail).
- Waypoint singkapan, sampel, struktur, foto, lainnya. Struktur diisi strike/dip (kaidah tangan kanan) dan digambar sebagai simbol strike/dip.
- Penampang geologi dari posisi Anda: topografi DEM, kontak dari peta, waypoint di dekat lintasan diproyeksikan, dip hasil ukur menggantikan dip asumsi.
- Pasang ke layar utama (PWA) tanpa app store; tile yang pernah dibuka tetap tampil saat sinyal lemah; sesi (tampilan, filter, lintasan) tersimpan otomatis.

**Peta dan data**
- Warna menurut umur (skala waktu ICS) atau litologi; filter rentang umur, preset era, legenda yang bisa diklik.
- Pencarian formasi, simbol peta, atau lokasi; lompat cepat ke 8 wilayah kepulauan.
- Detail unit (umur, litologi, simbol, luas, tautan katalog Badan Geologi); sesar dan kontak; opasitas geologi 0–100%.
- Peta dasar terang, gelap, topografi, satelit; relief bayangan; medan 3D.

**Ekspor dan integrasi**
- Peta PNG/PDF dengan legenda, skala, panah utara, dan tabel waypoint; penampang PNG/SVG.
- Waypoint GPX/CSV (QGIS, Avenza, GPS); unit sebagai GeoJSON; tautan berbagi tampilan.
- Impor SHP, GeoJSON, KML untuk mengecek formasi di area kerja; koordinat lat/lon dan UTM.
- Bahasa Indonesia dan Inggris.

Peta dirender di browser menggunakan MapLibre GL JS dan PMTiles. Legenda/harmonisasi menyatukan sumber yang berbeda; cakupan, skala, atribut, dan tingkat verifikasi tetap mengikuti tiap sumber. Ini bukan peta geologi resmi.

## Cakupan dan sumber data

| Zoom | Sumber | Lisensi |
| --- | --- | --- |
| 0–14 (dasar) | Tile Macrostrat `carto` (untuk Indonesia: peta global GSC/Chorlton 2007) | CC-BY 4.0 |
| 8+ (di atasnya) | PMTiles Orebit dari layanan Geologi Litologi ESDM (status Mei 2018); saat ini cakupan Bangka-Belitung dan Sumatra | Lisensi Terbuka PSG: atribusi, dilarang dijual |
| Hillshade dan medan 3D | Tile elevasi Mapterhorn, Terrarium | Lihat [atribusi sumber terrain](https://mapterhorn.com/attribution) |

Layanan ESDM yang dipakai tidak menyatakan skala pada metadata pipeline ini; jangan anggap lapisan Orebit saat ini sebagai peta 1:100.000. Area lain, termasuk Jawa, Kalimantan, Sulawesi, dan Papua, tampil dari Macrostrat sampai data rinci tersedia.
Topografi hillshade dan tampilan medan 3D menggunakan elevasi Mapterhorn. Kontrol 2D/3D, opasitas geologi, pencarian satuan/lokasi, detail unit, dan ekspor PNG/PDF tersedia di aplikasi.

Crosswalk Bangka-Belitung berisi 22 simbol tanpa unit otomatis. Di Sumatra, 470 dari 479 baris unit memakai pemetaan otomatis berbasis istilah umur sumber dan kata kunci nama/deskripsi litologi; hasilnya belum ditelaah geolog secara independen. Geometri yang lolos pipeline bukan bukti bahwa interpretasi umur dan litologinya sudah benar.

## Pengembangan lokal

Persyaratan: Node.js 22+ dan npm.

```bash
git clone https://github.com/ghoziankarami/orebit-geoatlas.git
cd orebit-geoatlas/app
npm ci
npm run dev          # http://localhost:5173
```

Server pengembangan memakai sumber konfigurasi aplikasi. Untuk mengarahkan overlay PMTiles ke tile lain, salin `app/.env.example` ke `app/.env` dan atur `VITE_TILES_URL`.

Build produksi:

```bash
cd app
npm run build          # hasil statis di app/dist
npm run preview        # cek build lokal
```

## Membangun data satu wilayah

Butuh Python 3.11+ dan [tippecanoe](https://github.com/felt/tippecanoe) ≥ 2.17.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r pipeline/requirements.txt
make fetch-esdm REGION=babel
make inventory REGION=babel     # daftar simbol → reference/crosswalk.csv
# 2. Kurasi crosswalk.csv & units.csv (lihat docs/kurasi-crosswalk.md)
make validate
make tiles REGION=babel         # → data/out/babel/babel.pmtiles
```

Tahapan pipeline: `01_ingest` (baca & reproyeksi) → `02_validate` (perbaiki geometri, QA) →
`03_harmonize` (crosswalk → unit baku, umur Ma, warna ICS) → `04_edgematch` (gabung lintas lembar,
tandai sambungan bermasalah) → `05_export` (GeoJSONSeq) → `06_tile.sh` (PMTiles).

## Publikasi dan data

- Halaman pengantar ada di **[atlas.orebit.id](https://atlas.orebit.id)** dan aplikasi peta di **[atlas.orebit.id/app](https://atlas.orebit.id/app/)**; build web statis (dua halaman) berada di `app/dist`. Tautan lama `atlas.orebit.id/#map=…` dialihkan otomatis ke `/app/`.
- Tile geologi PMTiles dapat di-host sebagai berkas statis yang mendukung HTTP Range. Saat mengganti host, atur `VITE_TILES_URL` dan pastikan CORS mengizinkan origin aplikasi.
- Situs Quarto orebit.id dapat menautkan atau menyematkan atlas:
  `<iframe src="https://atlas.orebit.id/app/" width="100%" height="640" style="border:0"></iframe>`

## Atribusi & disclaimer

Peta ini bukan peta resmi dan tidak dimaksudkan untuk keputusan teknis tanpa pemeriksaan lembar asli. Data layanan Geologi Litologi ESDM berstatus Mei 2018; cakupan rinci saat ini Bangka-Belitung dan Sumatra. Skala layanan tidak dinyatakan dalam metadata pipeline. Atribusi lengkap dan catatan pemrosesan tersedia di **Tentang & sumber** pada aplikasi. Data mentah GeoMap tidak disimpan di repo ini.

Tile Macrostrat berlisensi CC-BY 4.0 dan dapat mengandung sumber asli dengan ketentuan atribusinya sendiri. Basemap menggunakan OpenStreetMap/OpenFreeMap/OpenMapTiles; terrain mengikuti atribusi Mapterhorn. Kode repo ini berlisensi GNU GPL v3.0 (GPL-3.0-only): boleh dipakai, dipelajari, diubah, dan dibagikan; bila Anda mendistribusikan versi yang diubah, termasuk menyajikannya ke browser pengguna, kode sumber lengkapnya wajib ditawarkan dengan lisensi yang sama. Lisensi ini hanya berlaku untuk kode, bukan data pihak ketiga. Salinan dan turunan wajib menyertakan `LICENSE` dan [NOTICE](NOTICE). Rilis lama berlisensi MIT tetap tersedia dengan lisensi itu. Nama "Orebit" dan "GeoAtlas" serta logonya tidak dilisensikan untuk fork atau produk pesaing ([TRADEMARKS.md](TRADEMARKS.md)). Rincian lisensi komponen dan data: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Untuk sitasi, gunakan [CITATION.cff](CITATION.cff).

## Kontribusi

Bug report dan saran dapat dikirim lewat [GitHub Issues](https://github.com/ghoziankarami/orebit-geoatlas/issues). Untuk perubahan kode, buka pull request dengan ringkasan perubahan dan langkah uji. Jangan mengirim data geologi berlisensi tanpa memastikan izin dan atribusinya.

Panduan: [pengembangan](docs/DEVELOPMENT.md) · [kontribusi](CONTRIBUTING.md) · [PRD](docs/PRD.md).
