# Orebit GeoAtlas: konteks untuk sesi Claude berikutnya

Peta geologi Indonesia berbasis web yang mulus dan ringan (gaya Macrostrat). Pemilik: GK (ghoziankarami).

## Dokumen acuan
- PRD (Claude Docs): https://claude.ai/code/artifact/ad4fc269-8236-42dc-9846-63c9516de477
- Desain UI (kanvas Design, 5 artboard: desktop mode umur/litologi, seluler peta/detail): https://claude.ai/artifact/6bmHZNaq7XYGdZ8T8E6CHn
- Ringkasan PRD tersimpan di `docs/PRD.md` supaya bisa dibaca tanpa akses artifact.

## Keputusan yang sudah diambil
- Stack: Vite + TypeScript + MapLibre GL JS + pmtiles (app), Python/GeoPandas + tippecanoe (pipeline). Tanpa tile server.
- Zoom 0–14 dasar dari tile Macrostrat `carto` (CC-BY 4.0); zoom 8–14 dari PMTiles Orebit (SHP GeoMap PSG 1:100k yang diharmonisasi).
- Lisensi GeoMap: wajib atribusi PSG, DILARANG dijual → produk gratis, tidak masuk paket berbayar GeoSuite. Data mentah GeoMap tidak di-commit.
- Harmonisasi lewat `reference/crosswalk.csv` → `reference/units.csv` (umur Ma dari ICS, kelas litologi dari `lithology.csv`).
- Wilayah PoC: Bangka–Belitung (`REGION=babel`). Target domain: `atlas.orebit.id`, tile di Cloudflare R2 `tiles.orebit.id`.
- Gaya visual: Instrument Sans, aksen #2E6A86, ink #1F2B33, warna ICS; legenda umur digambar sebagai kolom stratigrafi.

## Status
- M0 scaffold selesai: app build OK; pipeline 01→06 teruji dengan data sintetis dua lembar (edge-match dan warna ICS jalan).
- Belum: uji visual peta di browser, unduh SHP Babel asli, kurasi crosswalk, deploy.

## Pertanyaan terbuka
- orebit.id di-host di mana dan DNS-nya dikelola di mana?
- Repo dijadikan publik kapan (rencana PRD: publik, MIT)?

## Perintah
- `make setup` · `make dev` · `make inventory REGION=babel` · `make validate` · `make tiles REGION=babel` · `make app`
