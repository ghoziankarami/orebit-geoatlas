# Handover Operasional — Orebit GeoAtlas

Dokumen ini mencatat `ACTIVE CHECKPOINT` tunggal untuk kelanjutan sesi manusia maupun multi-agent (Eksekutor T1 & Reviewer T2/T3). Hanya boleh ada **satu** heading `## ACTIVE CHECKPOINT` di seluruh `docs/handover/`.

## ACTIVE CHECKPOINT

- **Tanggal:** 22 November 2026
- **Status Gelombang F & G (`WP-21` s/d `WP-27`) — SELESAI & LIVE di `https://atlas.orebit.id/` (commit `0bb9349`, `all-v3.pmtiles`):**
  - `WP-21`: sheet provenance P3G per poligon (`NM_LEMBAR`/`NO_LEMBAR` → `sheet_name`).
  - `WP-22`: 2.014 `lith_detail` kosong diisi (berbasis kata kunci nama formasi, `confidence` tetap `auto`); sub-kala Miosen ICS 2023 (`Tml`/`Tmm`/`Tmu`).
  - `WP-23`: penampang VE 1×–10×, hover sinkron peta, unduh SVG.
  - `WP-24`: impor SHP drag-and-drop + popup atribut `.dbf`.
  - `WP-25`: navigasi `Back`/`Northing Up`, jargon `[AUTO]` bersih dari detail/About, mobile.
  - `WP-26`: tes kontrak & E2E diperluas; reviewer independen read-only = PASS.
  - Rebuild 8 wilayah + `data/out/all/all.pmtiles` (320 MB) & index 2.130 entri SELESAI (lokal, di `data/out/`, gitignored).
- **Penghalang (STOP-TANYA):**
  - `HUM-01` (`WP-19`): menunggu sesi uji usability ≥5 peserta nyata.
- **Satu Langkah Berikutnya (Next Action):** Pilih arah berikutnya: rilis tile DAT/UI lanjutan atau penyelesaian `HUM-01`. Rollback: `current` ke `releases/20261121T160417Z-38e566e`.
