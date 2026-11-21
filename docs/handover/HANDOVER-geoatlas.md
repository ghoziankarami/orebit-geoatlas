# Handover Operasional — Orebit GeoAtlas

Dokumen ini mencatat `ACTIVE CHECKPOINT` tunggal untuk kelanjutan sesi manusia maupun multi-agent (Eksekutor T1 & Reviewer T2/T3). Hanya boleh ada **satu** heading `## ACTIVE CHECKPOINT` di seluruh `docs/handover/`.

## ACTIVE CHECKPOINT

- **Tanggal:** 22 November 2026
- **Status Gelombang F & G (`WP-21` s/d `WP-26`) — kode & data SELESAI, belum dirilis:**
  - `WP-21`: sheet provenance P3G per poligon (`NM_LEMBAR`/`NO_LEMBAR` → `sheet_name`).
  - `WP-22`: 2.014 `lith_detail` kosong diisi (berbasis kata kunci nama formasi, `confidence` tetap `auto`); sub-kala Miosen ICS 2023 (`Tml`/`Tmm`/`Tmu`).
  - `WP-23`: penampang VE 1×–10×, hover sinkron peta, unduh SVG.
  - `WP-24`: impor SHP drag-and-drop + popup atribut `.dbf`.
  - `WP-25`: navigasi `Back`/`Northing Up`, jargon `[AUTO]` bersih dari detail/About, mobile.
  - `WP-26`: tes kontrak & E2E diperluas; reviewer independen read-only = PASS.
  - Rebuild 8 wilayah + `data/out/all/all.pmtiles` (320 MB) & index 2.130 entri SELESAI (lokal, di `data/out/`, gitignored).
- **Penghalang (STOP-TANYA):**
  - `REL-02` / `WP-27`: deploy produksi `atlas.orebit.id` MENUNGGU persetujuan eksplisit "ya" pemilik atas SHA256 artefak (`PIPELINE.md` §4) dan konfirmasi `git push origin main`.
  - `HUM-01` (`WP-19`): menunggu sesi uji usability ≥5 peserta nyata.
- **Satu Langkah Berikutnya (Next Action):** Commit perubahan (receipt CI butuh tree bersih), jalankan `bash ops/scripts/ci/local-ci.sh --full --write-receipt`, lalu minta "ya" pemilik sebelum push & deploy `all-v3.pmtiles` (nama file hasil lokal: `all.pmtiles`, perlu rename/publish sebagai `all-v3.pmtiles`).
