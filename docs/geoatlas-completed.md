# Arsip Penyelesaian Tugas — Orebit GeoAtlas

Berkas ini menyimpan riwayat tugas yang telah berstatus `DONE` beserta satu baris bukti (commit SHA, tes, dan artefak). Jangan menjadikan berkas ini antrean kerja kedua; antrean aktif berada di [PLAN-geoatlas.md](PLAN-geoatlas.md).

## Baseline Historis (Pra-21 November 2026)

| ID | Prio | Status | Tugas | PRD/SPEC | Bukti Penyelesaian |
|---|---|---|---|---|---|
| M0-01 | P0 | DONE | Scaffold aplikasi MapLibre GL JS + PMTiles + pipeline harmonisasi 01–06 | PRD v1 M0 | Commit `c4aebd4`, `5500623`, `8f7ea68`; build Vite + TypeScript dan pipeline sintetis lulus |
| M1-01 | P0 | DONE | Penarik data ArcGIS REST ESDM + kurasi manual Bangka-Belitung (22 simbol) + auto-crosswalk awal Sumatra (479 simbol) | PRD v1 M1 | Commit `b244c5d`, `5aba419`, `6d243fc`, `8989637`; `reference/units.csv` (492 unit) & `reference/crosswalk.csv` (502 baris) |
| M2-01 | P1 | DONE | Kontrol 2D/3D terrain Mapterhorn, opasitas geologi, detail struktur sekitar, referensi Crossref, dan ekspor dasar PNG/PDF | PRD v1 F1–F12 | Commit `4b28b9b`, `8405ce1`, `1e1e277`, `2e8dcb2`, `51a64ec`, `faed4d7` |

## Gelombang Transformasi Full Satu Indonesia & UI/UX 100/100 (21 November 2026)

| ID | Prio | Status | Tugas | PRD/SPEC | Bukti Penyelesaian |
|---|---|---|---|---|---|
| DAT-01 | P0 | DONE | Koreksi audit geologi Babel & Sumatra + skema kolom `confidence` di `units.csv` | DAT-2, DAT-3, SPEC §2.2 | `WP-01`: `TRJKG` Trias–Jura (`143.1–251.902`), `PUK` `flagged`, `PCKS1`/`PCTM`/`PCSV` metasedimen; `validate_reference.py` & `test_pipeline_contracts.py` PASS |
| DAT-02 | P0 | DONE | Perluasan kamus `AGE_MAP` & `LITH_RULES` di `auto_crosswalk.py` untuk seluruh stratigrafi Indonesia | DAT-4, SPEC §1 | `WP-01`: ≥30 istilah umur & rentang gabungan + `LITH_RULES` Nusantara + `confidence="auto"`; `test_pipeline_contracts.py` PASS |
| PIP-01 | P0 | DONE | Konfigurasi `REGION_BBOX` 8 wilayah nasional & penarikan layer struktur ESDM di `00_fetch_esdm.py` | DAT-1, DAT-5, SPEC §2.1 | `WP-02`: `REGION_BBOX` 8 wilayah di `pipeline/common.py` + `--include-lines` di `00_fetch_esdm.py`; `test_pipeline_contracts.py` PASS |
| PIP-02 | P0 | DONE | Perhitungan luas Equal-Area `EPSG:6933` & edge-matching aman lintas zona UTM | PIP-1, PIP-2, SPEC §1 | `WP-02`: `EQUAL_AREA_CRS = "EPSG:6933"` di `02_validate.py`, `04_edgematch.py`, `inventory.py` + `area_km2` & `confidence` di `05_export.py` |
| PIP-03 | P0 | DONE | Generator katalog indeks unit nasional `indonesia-units-index.json` di pipeline | DAT-6, PIP-3, SPEC §2.3 | `WP-02`: `pipeline/build_index.py` & target `make index` menghasilkan `app/public/data/indonesia-units-index.json` |
| UIX-01 | P0 | DONE | Tata letak anti-tabrakan desktop (`.detail` vs `.map-ctrls`) & berkas `app/.env.example` | UIX-1, SPEC §3.1 | `WP-03`: `.detail` di bawah `.map-ctrls` (`--detail-top: 64px/106px`); dibuktikan Zero-Overlap via Playwright `test_browser_uiux.py` PASS |
| TOOL-01 | P0 | DONE | Bar pembacaan koordinat kursor live (Lat/Lon + Zona UTM + Zoom) & fitur salin titik | TOOL-1, SPEC §4 | `WP-03`: `app/src/coords.ts` (`toUtm`, `formatCoordReadout`) + `#coordBar`; diuji di `test_app_contracts.mjs` & `test_browser_uiux.py` PASS |
| DOC-01 | P1 | DONE | Panduan kurasi nasional 8 wilayah & transparansi tingkat kepercayaan di docs dan dialog Tentang | G2, UIX-6, SPEC §1 | `WP-04`: `docs/kurasi-crosswalk.md`, `README.md`, `app/src/about.ts` diperbarui; `check-docs.py` PASS |
| DAT-03 | P0 | DONE | Akuisisi, inventarisasi, dan harmonisasi data geologi wilayah Jawa–Madura (`jawa`) & Bali–Nusra (`balinusra`) | DAT-1, SPEC §2.1 | `WP-05`: Formasi Jawa–Madura & Bali–Nusra masuk `reference/*.csv` dan indeks nasional; `validate_reference.py` PASS |
| DAT-04 | P0 | DONE | Akuisisi, inventarisasi, dan harmonisasi data geologi wilayah Kalimantan (`kalimantan`) & Sulawesi (`sulawesi`) | DAT-1, SPEC §2.1 | `WP-06`: Formasi Kalimantan & Sulawesi masuk `reference/*.csv` dan indeks nasional; `validate_reference.py` PASS |
| DAT-05 | P0 | DONE | Akuisisi, inventarisasi, dan harmonisasi data geologi wilayah Maluku (`maluku`) & Papua (`papua`) | DAT-1, SPEC §2.1 | `WP-07`: Formasi Maluku & Papua masuk `reference/*.csv` dan indeks nasional; `validate_reference.py` PASS |
| PIP-04 | P0 | DONE | Kompilasi gabungan penuh Satu Indonesia & indeks 8 wilayah | PIP-3, PIP-4, SPEC §2.3 | `WP-07`: `app/public/data/indonesia-units-index.json` memuat 562 entri across 8 wilayah; `test_pipeline_contracts.py` PASS |
| SRC-01 | P0 | DONE | Mesin pencarian nasional instan dari semua zoom (`indonesia-units-index.json` + live typeahead + keyboard) | SRC-1, SRC-2, SPEC §1 | `WP-08`: `app/src/search.ts` live typeahead, clear button, keyboard nav, fallback detail dari zoom 4.2; `test_browser_uiux.py` PASS |
| MAP-01 | P0 | DONE | Basemap switcher (Terang / Gelap / Topografi) & filter tingkat kurasi (`confidence`) | MAP-2, MAP-3, SPEC §1 | `WP-09`: `#basemapGroup` & `#confGroup` terhubung ke `layers.ts`; `npm run build` & `test_browser_uiux.py` PASS |
| MAP-02 | P0 | DONE | Ketahanan pemuatan PMTiles/DEM offline-degraded & sinkronisasi penuh parameter URL hash | MAP-4, NFR-4, SPEC §3.3 | `WP-09`: `app/src/state.ts` & `map.on("error")` handler non-blocking; `npm run build` PASS |
| UIX-02 | P0 | DONE | Kolom stratigrafi ICS & daftar litologi interaktif (klik-untuk-filter) + badge filter aktif & tombol Reset | UIX-2, UIX-5, SPEC §3.3 | `WP-10`: `app/src/legend.ts` tombol interaktif + `#activeFilterBar` + `#resetFiltersBtn`; `test_browser_uiux.py` PASS |
| UIX-03 | P0 | DONE | Chip preset era geologi & kontrol rentang umur presisi (Kenozoikum–Prakambrium) | UIX-3, SPEC §3.3 | `WP-10`: `ERA_PRESETS` di `app/src/timescale.ts` & `#eraBar` di `main.ts`; `test_browser_uiux.py` PASS |
| SRC-02 | P0 | DONE | Island Quick-Jump Bar 8 kepulauan Indonesia dengan fly-to & indikator cakupan | SRC-3, SPEC §2.1 | `WP-11`: `REGIONS` & `#regionBar` (Nasional + 8 wilayah); `test_browser_uiux.py` PASS |
| UIX-04 | P0 | DONE | Bottom sheet seluler 3-snap-point (`peek` / `half` / `full`) yang mempertahankan search & chip pulau | UIX-4, SPEC §3.2 | `WP-11`: `#panel[data-snap]` + `#sheetSnapBtns`; `test_browser_uiux.py` (375×812) PASS |
| TOOL-02 | P0 | DONE | Kartu detail unit generasi baru: pita posisi stratigrafi, luas `km²`, badge `confidence`, unduh GeoJSON, & Lapor Koreksi | TOOL-2, EXP-2, EXP-3, SPEC §1 | `WP-12`: `app/src/detail.ts` + `#detailGeoJSON` + `#detailReport`; `test_browser_uiux.py` PASS |
| TOOL-03 | P1 | DONE | Alat ukur jarak, azimuth & profil lintasan geologi (Geological Transect Strip-Log) | TOOL-3, EXP-2, SPEC §4 | `WP-13`: `app/src/transect.ts` + `#transectPanel` strip-log + ekspor CSV; `test_app_contracts.mjs` & `test_browser_uiux.py` PASS |
| EXP-01 | P1 | DONE | Ekspor PNG & PDF kualitas publikasi dengan kompas utara, skala bar grafis, filter aktif, & atribusi | EXP-1, SPEC §6 | `WP-14`: `composeExport()` di `app/src/main.ts` dengan kompas utara, skala bar km, filter aktif, dan atribusi |
| UIX-05 | P0 | DONE | Aksesibilitas WCAG 2.2 AA, navigasi keyboard menyeluruh, target sentuh `≥44px`, & paritas penuh ID/EN | UIX-6, NFR-3, SPEC §6 | `WP-15`: `test_app_contracts.mjs` (100% paritas ID/EN) & `test_browser_uiux.py` (`Escape` & mobile layout) PASS |
| TEST-01 | P0 | DONE | Suite pengujian otomatis: kontrak pipeline Python, known-answer aplikasi Node, & E2E Playwright desktop/mobile | SPEC §5, §6 | `WP-16`: `tests/test_pipeline_contracts.py`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py` semua PASS |
| TEST-02 | P0 | DONE | Sertifikasi exact-source `local-ci.sh --full --write-receipt` & bukti mutasi data/layout | SPEC §5, §6 | `WP-17`: `local-ci.sh --full --write-receipt` lulus penuh (8/8 checks) dengan receipt SHA256 exact-SHA |
| VAL-01 | P0 | DONE | Audit akhir 45 cek SPEC §6 dan penutupan target Full Satu Indonesia & UI/UX 100/100 | PRD §9, SPEC §6 | `WP-20`: 43/45 cek teknis/otomatis terverifikasi PASS di `docs/audits/audit-full-indonesia-uiux-2026-11-21.md`; tersisa 2 cek gerbang pemilik (`REL-01` deploy VPS & `HUM-01` peserta manusia) |
