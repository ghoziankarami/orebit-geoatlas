# Handover Operasional — Orebit GeoAtlas

Dokumen ini mencatat `ACTIVE CHECKPOINT` tunggal untuk kelanjutan sesi manusia maupun multi-agent (Eksekutor T1 & Reviewer T2/T3). Hanya boleh ada **satu** heading `## ACTIVE CHECKPOINT` di seluruh `docs/handover/`.

## ACTIVE CHECKPOINT

- **Tanggal:** 21 November 2026
- **Status Kualitas & Cakupan:**
  - **Gelombang A–D & E (`WP-01` s/d `WP-17` dan `WP-20`) SELESAI:** Seluruh 8 wilayah kepulauan Indonesia (`sumatra`, `babel`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`) terharmonisasi di `reference/*.csv` (553 unit, 563 crosswalk, 0 uncurated) dan `app/public/data/indonesia-units-index.json` (562 entri terindeks).
  - **UI/UX & Alat Kerja Geolog:** Tabrakan `.detail` vs `.map-ctrls` teratasi (`Zero Overlap`), pencarian instan nasional dari semua zoom, *Island Quick-Jump Bar* 8 wilayah, legenda stratigrafi & litologi interaktif klik-untuk-filter, chip preset era, bottom sheet seluler 3-snap (`peek`/`half`/`full`), bar koordinat UTM live, kartu detail dengan pita stratigrafi/luas `km²`/badge `confidence`/unduh GeoJSON/lapor koreksi, alat ukur & **Geological Transect Strip-Log**, basemap switcher, serta ekspor PNG/PDF dengan kompas & skala bar.
  - **Verifikasi Exact-Source:** `bash ops/scripts/ci/local-ci.sh --full --write-receipt` lulus penuh (8/8 checks: `docs-guard`, `plan-registry`, `wp-policy`, `reference-validate`, `pipeline-contracts`, `app-contracts`, `app-build`, `browser-uiux` Playwright desktop & seluler ID/EN).
- **Penghalang (Blocker / STOP-TANYA):**
  - `REL-01` (`WP-18`): Menunggu persetujuan eksplisit `"ya"` dari pemilik untuk deploy build produksi `app/dist` ke server `atlas.orebit.id` sesuai [deploy-atlas-vps.md](../runbooks/deploy-atlas-vps.md).
  - `HUM-01` (`WP-19`): Menunggu jadwal sesi uji usability dengan ≥5 peserta nyata (mahasiswa geologi / geolog) menggunakan kit [hum-1-geoatlas.md](../audits/hum-1-geoatlas.md).
- **Satu Langkah Berikutnya (Next Action):** Pemilik memberikan persetujuan `"ya"` untuk deploy produksi `atlas.orebit.id` (`WP-18`) dan menjadwalkan putaran uji usability `HUM-01` (`WP-19`).
