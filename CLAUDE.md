# Orebit GeoAtlas: konteks untuk sesi Claude berikutnya

Peta geologi Indonesia berbasis web yang mulus dan ringan (gaya Macrostrat). Pemilik: GK (ghoziankarami).

## Dokumen acuan
- PRD (Claude Docs): https://claude.ai/code/artifact/ad4fc269-8236-42dc-9846-63c9516de477
- Desain UI (kanvas Design, 5 artboard: desktop mode umur/litologi, seluler peta/detail): https://claude.ai/artifact/6bmHZNaq7XYGdZ8T8E6CHn
- Ringkasan PRD tersimpan di `docs/PRD.md` supaya bisa dibaca tanpa akses artifact.

## Keputusan yang sudah diambil
- Stack: Vite + TypeScript + MapLibre GL JS + pmtiles (app), Python/GeoPandas + tippecanoe (pipeline). Tanpa tile server.
- Zoom 0–14 dasar dari tile Macrostrat `carto` (CC-BY 4.0); zoom 8–14 dari PMTiles Orebit.
- Sumber detail utama: layanan ArcGIS REST publik ESDM `BGS_PM/Geologi_Litologi/MapServer/0` (poligon Peta Geologi, © PSG, status Mei 2018, Query + GeoJSON, maxRecordCount 2000, notasi formasi di kolom `simobj`; Babel = 635 poligon). Ditarik dengan `pipeline/00_fetch_esdm.py` (`make fetch-esdm REGION=babel`) dari VPS, karena sandbox Claude tidak bisa menjangkau geoportal.esdm.go.id. SHP GeoMap 1:100k (butuh login SSO) jadi cadangan.
- Lisensi GeoMap: wajib atribusi PSG, DILARANG dijual → produk gratis, tidak masuk paket berbayar GeoSuite. Data mentah GeoMap tidak di-commit.
- Harmonisasi lewat `reference/crosswalk.csv` → `reference/units.csv` (umur Ma dari ICS, kelas litologi dari `lithology.csv`).
- Wilayah PoC: Bangka–Belitung (`REGION=babel`). Domain: `atlas.orebit.id` di VPS (nginx); PMTiles disajikan dari VPS yang sama di `/tiles/` (bukan R2).
- Gaya visual: Instrument Sans, aksen #2E6A86, ink #1F2B33, warna ICS; legenda umur digambar sebagai kolom stratigrafi.

## Status
- M0 scaffold selesai: app build OK; pipeline 01→06 teruji dengan data sintetis dua lembar (edge-match dan warna ICS jalan).
- UI disamakan dengan desain: kontrol peta kustom, isian slider umur, bottom sheet seluler (tinggi dinamis via --peek), tombol Buka sumber asli + Salin tautan di detail seluler. F6 (pencarian formasi di tile yang dimuat + lokasi Nominatim) dan F10 (dialog Tentang & sumber) sudah ada. Tata letak dicek lewat screenshot Playwright tanpa tile (jaringan sandbox memblokir tile).
- Deploy: VPS Ubuntu 24.04 + nginx, subdomain atlas.orebit.id (DNS sudah mengarah ke VPS). Repo di-clone ke /opt/orebit-geoatlas memakai deploy key read-only (core.sshCommand, tanpa ~/.ssh/config); update lewat /opt/orebit-geoatlas/deploy.sh.
- Pipeline menerima .shp/.geojson/.gpkg; unit belum dikurasi tetap tampil (abu-abu) dengan nama/simbol/keterangan asli di popup. Teruji end-to-end dengan server ArcGIS tiruan.
- Belum: tarik data ESDM Babel asli di VPS, kurasi crosswalk Babel, pasang PMTiles di /var/www/atlas.orebit.id/tiles/.

## Pertanyaan terbuka
- Repo dijadikan publik kapan (rencana PRD: publik, MIT)?

## Perintah
- `make fetch-esdm REGION=babel` · `make setup` · `make dev` · `make inventory REGION=babel` · `make validate` · `make tiles REGION=babel` · `make app`
