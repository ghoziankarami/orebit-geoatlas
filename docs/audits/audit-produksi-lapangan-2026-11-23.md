# Audit Produksi & Lapangan — 23 November 2026

Audit setelah peluncuran publik (pos LinkedIn) terhadap `https://atlas.orebit.id/` (rilis `0e9fbcb`) dan `main` lokal yang sama. Sudut pandang: **pengguna baru** di desktop dan HP. Hasilnya menjadi Gelombang H (`WP-28` s/d `WP-35`) di [WORK-PACKAGES-geoatlas](../handover/WORK-PACKAGES-geoatlas.md).

## 1. Apa yang diuji

| Uji | Hasil |
|---|---|
| `bash ops/scripts/ci/local-ci.sh --full` (guard, referensi, kontrak, build, Playwright desktop/mobile ID/EN) | PASS 8/8 (123 dtk) |
| Produksi: HTTP `/`, `/app/`, `/manifest.json`, `/sw.js`, `/data/indonesia-units-index.json`, `/assets/*` | 200; gzip aktif (index 1,18 MB → 136 KB); `/assets/*` `immutable` + Cloudflare HIT |
| Chromium `Page.getInstallabilityErrors` (build produksi) | kosong = manifest + SW valid, aplikasi bisa dipasang |
| Offline setelah kunjungan pertama (Playwright `set_offline`) | app shell terbuka, waypoint tetap ada |
| `localStorage` rusak (`geoatlas.waypoints.v1='{bad'`) | aman, daftar kosong, tanpa crash |
| Isian strike `-30` / dip `120` | strike dinormalkan ke `330`; dip **diam-diam** dipotong ke `90` (perlu validasi terlihat) |
| HP (Pixel 7, 412×839): posisi `#installBtn` | **tidak terlihat** (lihat §3) |
| `navigator.storage.persisted()` | `false` = browser boleh menghapus data waypoint saat ruang penuh |

Catatan: uji Playwright langsung ke produksi tidak dipakai sebagai bukti karena jaringan mesin audit lambat (~20 KB/s, juga ke `speed.cloudflare.com`); server dan CDN sendiri sehat.

## 2. Cakupan tes (coverage) — baseline

Diukur dengan `node --test --experimental-test-coverage` atas modul hasil kompilasi `tests/test_app_contracts.mjs`:

| Modul | Line % | Catatan |
|---|---|---|
| `config`, `lithology` | 100 | |
| `i18n`, `coords`, `section_model`, `timescale` | 91–99 | |
| `state` | 80 | branch 16% |
| `layers`, `search`, `transect`, `waypoints` | 11–18 | logika murni (ekspor, parser, pencarian) sebagian besar belum diuji |
| `gps` | 9 | |
| `shp_import` | 8 | parser SHP/DBF/PRJ/KML berisiko tinggi, nyaris tanpa tes unit |
| `detail` | 5 | |
| **Total (14 modul)** | **29** | `main.ts` (1.470 baris), `session.ts`, `legend.ts`, `about.ts` tidak terukur sama sekali |

Belum ada perintah coverage di repo; angka di atas tidak bisa diulang tanpa skrip. Ini ditutup `WP-32`.

## 3. Instalasi: kenapa tidak ada pop-up di HP

GeoAtlas adalah **PWA** (aplikasi web yang bisa dipasang). Pengguna **tidak perlu** meng-clone kode atau memasang apa pun lewat terminal. Kode sumber hanya untuk developer yang ingin self-host atau berkontribusi.

Penyebab pop-up tidak muncul, terurut dari paling berpengaruh:

1. **Kode menekan pop-up bawaan Chrome.** `app/src/main.ts` memanggil `e.preventDefault()` pada `beforeinstallprompt`, sehingga mini-infobar "Tambahkan ke layar utama" Chrome Android tidak tampil. Gantinya tombol `#installBtn` dimunculkan.
2. **Tombol pengganti tidak terlihat di HP.** `#installBtn` ada di header panel (`.brand-actions`). Di HP panel berupa bottom sheet yang mulai di posisi `peek`, sehingga header berada di luar layar (bounding box `null`). Pengguna tidak pernah melihatnya.
3. **iPhone/iPad tidak pernah punya pop-up.** Safari iOS tidak mendukung `beforeinstallprompt`; satu-satunya cara adalah Bagikan → Tambahkan ke Layar Utama. Aplikasi belum memberi petunjuk ini.
4. **Pengunjung dari LinkedIn membuka in-app browser.** WebView LinkedIn/Instagram/Facebook/WhatsApp tidak bisa memasang PWA dan sering memblokir GPS. Perlu banner "Buka di Chrome/Safari".
5. Chrome juga baru menawarkan pemasangan setelah ada interaksi dengan halaman; ini wajar.

Cara memasang yang benar hari ini (ditulis ulang untuk pengguna di `WP-34`):

| Perangkat | Langkah |
|---|---|
| Desktop Chrome/Edge | Buka `atlas.orebit.id/app` → ikon "Instal" di ujung kanan address bar (atau menu ⋮ → Cast, simpan, dan bagikan → Instal halaman sebagai aplikasi) |
| Android Chrome | Buka di Chrome (bukan dari dalam LinkedIn) → menu ⋮ → Instal aplikasi / Tambahkan ke layar utama |
| iPhone/iPad | Buka di **Safari** → Bagikan → Tambahkan ke Layar Utama |
| Developer | `git clone` → `make dev` (lihat [DEVELOPMENT](../DEVELOPMENT.md)); hanya untuk self-host/kontribusi |

## 4. Dokumentasi lapangan pada waypoint (masukan pengguna)

Saat ini waypoint menyimpan nama, jenis, catatan, strike/dip, koordinat, elevasi, akurasi, unit geologi. **Belum ada foto**, dan ekspor hanya GPX/CSV tanpa lampiran. Rekomendasi:

- **Foto per waypoint** (beberapa per titik) dari kamera atau galeri lewat `<input type="file" accept="image/*" capture="environment">`. Ini membuka aplikasi kamera bawaan, sehingga tidak bertabrakan dengan header `Permissions-Policy: camera=()` di nginx dan tidak perlu izin kamera di browser.
- **Kompres di HP** ke JPEG sisi panjang 1600 px (~200–400 KB) lewat canvas. Foto asli 4–12 MB terlalu besar untuk penyimpanan browser dan untuk dibagikan.
- **Simpan foto di IndexedDB**, bukan `localStorage` (batas ~5 MB). Waypoint tetap di `geoatlas.waypoints.v1`, ditambah daftar `photos: [id]`.
- **Keterangan foto + arah** (azimuth opsional) dan waktu ambil, karena EXIF hilang saat dikompres.

## 5. Format ekspor yang disarankan: satu "Paket Lapangan" `.zip`

| Berkas dalam zip | Untuk apa |
|---|---|
| `project.json` (skema `orebit-geoatlas-field-v1`) | dibuka kembali di GeoAtlas: waypoint, foto, lintasan, tampilan peta |
| `waypoints.geojson` | QGIS/ArcGIS; atribut `photos` berisi path relatif |
| `waypoints.gpx` | GPS/Avenza/OsmAnd; `<link href="photos/…">` per foto |
| `waypoints.csv` | Excel/laporan |
| `photos/WP-001_1.jpg`, … | dokumentasi lapangan |
| `waypoints.kmz` (opsional, terpisah) | Google Earth, foto tampil di balon titik |

Zip ditulis tanpa dependensi baru (format *store* + CRC32, ±80 baris); `shp_import.ts` sudah punya pembaca zip. Di HP, tombol **Bagikan** memakai Web Share API (`navigator.share({ files })`) agar paket langsung terkirim ke WhatsApp/Drive/Email. Fallback: unduh berkas.

## 6. Menyimpan dan membuka kembali data

Data sekarang hanya ada di browser perangkat itu. Risiko: hapus data situs, ganti HP, mode privat, dan **Safari iOS menghapus penyimpanan situs yang tidak dibuka 7 hari** bila tidak dipasang ke layar utama.

Rekomendasi (tanpa server, sesuai arsitektur "tanpa backend"):

1. **Impor Paket Lapangan** `.zip` untuk memulihkan waypoint + foto + lintasan, digabung berdasarkan `id` tanpa duplikat.
2. **Impor GPX/CSV/GeoJSON** waypoint dari aplikasi lain (Garmin, Avenza, QGIS).
3. `navigator.storage.persist()` saat waypoint pertama dibuat atau setelah aplikasi dipasang.
4. **Pengingat cadangan**: tampilkan "Cadangan terakhir: N hari lalu" dan ajak ekspor bila ada waypoint baru sejak cadangan terakhir.
5. Sinkron awan (Google Drive/akun) **tidak** dikerjakan sekarang: butuh backend/OAuth dan kebijakan privasi. Paket `.zip` + Bagikan sudah menutup kebutuhan pindah perangkat.

## 7. Audit fitur tambahan

| Fitur | Nilai | Biaya | Keputusan |
|---|---|---|---|
| Foto waypoint + Paket Lapangan + impor kembali | Tinggi (permintaan pengguna) | Sedang | **Kerjakan** `WP-29`, `WP-30` |
| Perbaikan pemasangan (HP, iOS, in-app browser) | Tinggi (keluhan langsung) | Rendah | **Kerjakan** `WP-28` |
| Geologi offline: cache PMTiles + "Simpan area ini" | Tinggi di lapangan: kini SW melewatkan request `Range`, jadi **poligon geologi tidak tampil offline** walau basemap tampil | Sedang–tinggi | **Kerjakan** `WP-31` |
| Coverage + E2E pengguna baru + smoke produksi | Tinggi (sudah produksi) | Sedang | **Kerjakan** `WP-32`, `WP-33` |
| Panduan pemasangan & data untuk pengguna | Tinggi | Rendah | **Kerjakan** `WP-34` |
| Rekam tracklog GPS (jejak jalan) | Sedang | Sedang (baterai, layar mati menghentikan GPS web) | Backlog |
| Stereonet/rose diagram dari strike/dip waypoint | Sedang untuk geolog struktur | Sedang | Backlog |
| Beberapa proyek/kampanye lapangan terpisah | Sedang | Sedang | Backlog; Paket Lapangan per kampanye sudah menutup sebagian |
| Kompas/klinometer dari sensor HP | Rendah: akurasi sensor HP tidak layak untuk data struktur | Sedang | Tidak dikerjakan |
| Sinkron awan / akun | Sedang | Tinggi (backend, privasi) | Tidak dikerjakan sekarang |
