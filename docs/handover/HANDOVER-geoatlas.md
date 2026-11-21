# Handover Operasional — Orebit GeoAtlas

Dokumen ini mencatat `ACTIVE CHECKPOINT` tunggal untuk kelanjutan sesi manusia maupun multi-agent (Eksekutor T1 & Reviewer T2/T3). Hanya boleh ada **satu** heading `## ACTIVE CHECKPOINT` di seluruh `docs/handover/`.

## ACTIVE CHECKPOINT

- **Tanggal:** 21 November 2026
- **Status Kualitas, Cakupan & Rencana Gelombang F–G:**
  - **Gelombang A–E (`WP-01` s/d `WP-18` & `WP-20`) SELESAI & LIVE:** Seluruh 8 wilayah kepulauan Indonesia (`sumatra`, `babel`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`) telah dibangun dari dataset vektor lokal P3G/PSG 1:250.000 menjadi `all-v2.pmtiles` (287 MB) dan `indonesia-units-index.json` (2.130 entri), serta telah di-deploy ke `https://atlas.orebit.id/`.
  - **Audit Senior Geologist & UI/UX (21 Nov 2026):** Telah didokumentasikan secara komprehensif di [audit-senior-geologist-uiux-2026-11-21.md](../audits/audit-senior-geologist-uiux-2026-11-21.md) dan diturunkan menjadi **Gelombang F (`WP-21` s/d `WP-25`)** serta **Gelombang G (`WP-26` s/d `WP-27`)** di [TASKS](../PLAN-geoatlas.md) dan [WORK-PACKAGES](WORK-PACKAGES-geoatlas.md).
  - **Implementasi Awal Gelombang F (`WP-23`, `WP-24`, `WP-25`):** Penampang geologi bawah permukaan panoramik (`820×268` SVG, 3 horizon stratigrafi, arsiran litologi USGS, patahan miring + *throw* `↑↓`), impor SHP dengan konversi otomatis UTM 46N–54S → WGS84 + pin lokasi (`📍`), navigasi `Back` (`#navBack`) + `Northing Up` (`#compassNorthBtn`), serta pembersihan penuh jargon internal (`auto_crosswalk.py`, `[AUTO]`) dari UI/About telah diimplementasikan dan lulus `local-ci.sh --full` (8/8 checks).
- **Penghalang (Blocker / STOP-TANYA):**
  - `HUM-01` (`WP-19`): Menunggu jadwal sesi uji usability dengan ≥5 peserta nyata (mahasiswa geologi / geolog eksplorasi).
- **Satu Langkah Berikutnya (Next Action):** Jalankan eksekusi **Gelombang F & G (`WP-21` s/d `WP-27`)** menggunakan `python3 ops/scripts/agents/wp.py wave` / `wp.py brief` untuk mengekstrak `NM_LEMBAR` per poligon (`WP-21`), menyintesis `lith_detail` 2.096 unit (`WP-22`), memperluas fitur `VE` & ekspor SVG penampang (`WP-23`) + *drag-and-drop* SHP (`WP-24`), memperluas tes E2E (`WP-26`), dan merilis `all-v3.pmtiles` ke produksi (`WP-27`).
