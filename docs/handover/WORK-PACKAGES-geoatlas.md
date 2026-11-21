# Orebit GeoAtlas — Registry & Kartu Work Package (WP) Menuju Full Satu Indonesia & UI/UX 100/100

Dibuat 21 November 2026 dari `main` (`faed4d7`). Mengikuti [standar work package](../runbooks/agent-work-packages.md) dan [orkestrasi cepat lokal](../runbooks/fast-local-orchestration.md). Antrean tugas dan statusnya berada di [TASKS](../PLAN-geoatlas.md); gerbang G1–G8, otorisasi, dan loop eksekusi satu kali berada di [PROMPT-close-all-tasks](PROMPT-close-all-tasks.md). Berkas ini **tidak menyimpan status manual**: jalankan `python3 ops/scripts/agents/wp.py status` atau `python3 ops/scripts/agents/wp.py wave`.

## Cara Pakai Singkat

1. **Cek gelombang paralel siap jalan:** `python3 ops/scripts/agents/wp.py wave`
2. **Cek micro-brief hemat token (~4 KB) untuk Eksekutor atau Reviewer:**
   - `python3 ops/scripts/agents/wp.py brief WP-01 --role executor`
   - `python3 ops/scripts/agents/wp.py brief WP-01 --role reviewer --base main --head HEAD`
3. **Bangkitkan skrip multi-agent paralel Antigravity (`run_workflow`):**
   - `python3 ops/scripts/agents/wp.py workflow WP-01 WP-02 WP-03 WP-04 --exec-model flash --review-model pro`
4. **Pemisahan peran (harness-agnostic):** Eksekutor T1 (model cepat di harness aktif: Gemini, Claude, Codex, CommandCode, Antigravity, dll.) mengimplementasikan perubahan dan menjalankan `local-ci.sh --fast` + tes terarah (`wp.py fast-test`). Reviewer T2/T3 adalah **model/sesi BERBEDA** dari eksekutor (bukan akun GitHub manusia baru dan bukan collaborator tambahan) yang memeriksa diff dan bukti secara **read-only** lalu menulis verdict `PASS` / `NEEDS_FIX` via `wp.py verdict` atau komentar PR. Eksekutor **DILARANG** menulis verdict `PASS` untuk pekerjaannya sendiri; bila belum ada reviewer independen, WP tetap berstatus `review`, bukan `selesai`. Pemilik mengintegrasikan hasil ke `main`.

## Cara Melacak Progres

- **Sumber kebenaran progres:** Progres dibaca dari riwayat commit `main` (`git log main --grep="Merge WP-" --oneline`) dan registry (`python3 ops/scripts/agents/wp.py status`), **BUKAN** hanya dari daftar PR GitHub.
- **No-PR merge tetap cepat dan terbaca mesin:** PR bersifat opsional untuk risiko `LOW`/`MEDIUM` sehingga tidak memperlambat kerja. Setiap merge no-PR **WAJIB** menggunakan format commit message `Merge WP-NN: <judul>` dan tetap mensyaratkan verdict `PASS` dari reviewer independen (bukan *self-declared*).
- **Bukti penutupan wajib:** Setiap WP yang selesai **WAJIB** memiliki satu baris bukti di [arsip penyelesaian](../geoatlas-completed.md) dan pembaruan `## ACTIVE CHECKPOINT` di [HANDOVER-geoatlas.md](HANDOVER-geoatlas.md).

## Rencana Gelombang Paralel (Wave A–E)

| Gelombang | Work Packages | Bisa Paralel? | Lane yang Dipakai | Fokus Utama |
|---|---|---|---|---|
| **Gelombang A — Fondasi Nasional & Layout** | `WP-01`, `WP-02`, `WP-03`, `WP-04` | **Ya (4 lane disjoint)** | `DATA`, `PIPE`, `UIX`, `DOCS` | Koreksi audit geologi + kolom `confidence` + kamus `AGE_MAP`; pipeline 8 wilayah + Equal-Area CRS + generator indeks nasional; perbaiki tabrakan `.detail` vs `.map-ctrls` + bar koordinat UTM live; panduan kurasi 8 wilayah |
| **Gelombang B — Data 8 Kepulauan & Search Nasional** | `WP-05`, `WP-06`, `WP-07`, `WP-08`, `WP-09` | **Sebagian (`SEARCH` & `MAP` paralel dengan rantai `DATA`)** | `DATA` (`05→06→07`), `SEARCH` (`08`), `MAP` (`09`) | Harmonisasi geologi Jawa, Bali–Nusra, Kalimantan, Sulawesi, Maluku, Papua + kompilasi indeks 8 wilayah; pencarian instan nasional semua zoom; basemap switcher + filter kurasi + URL state lengkap |
| **Gelombang C — UI/UX 100/100 & Alat Geolog** | `WP-10`, `WP-11`, `WP-12`, `WP-13` | **Sebagian (`UIX` `10→11` paralel dengan `TOOLS` `12→13`)** | `UIX`, `TOOLS` | Legenda stratigrafi & litologi interaktif klik-untuk-filter + chip preset era; Island Quick-Jump Bar 8 pulau + bottom sheet 3-snap seluler; kartu detail generasi baru + unduh GeoJSON + lapor koreksi; alat ukur jarak & profil lintasan geologi (strip-log) |
| **Gelombang D — Ekspor Publikasi, A11y & Suite Tes** | `WP-14`, `WP-15`, `WP-16` | **Ya (3 lane disjoint)** | `TOOLS`, `UIX`, `TEST` | Ekspor PNG/PDF kualitas publikasi (kompas, skala bar, filter aktif); aksesibilitas WCAG 2.2 AA & paritas ID/EN 100%; suite otomatis Python + Node + Playwright desktop/mobile |
| **Gelombang E — Sertifikasi, Deploy & Audit 100/100** | `WP-17`, `WP-18`, `WP-19`, `WP-20` | **Berurutan (Gate Rilis)** | `TEST`, `REL`, `HUMAN`, `DOCS` | Sertifikasi `local-ci.sh --full --write-receipt`; deploy VPS `atlas.orebit.id`; uji usability `HUM-01` ≥5 peserta; audit final 45/45 cek (100/100) |
| **Gelombang F — Senior Geologist Workstation & Data P3G** | `WP-21`, `WP-22`, `WP-23`, `WP-24`, `WP-25` | **Ya (`PIPE→DATA` paralel dengan `TOOLS`, `MAP`, `UIX`)** | `PIPE`, `DATA`, `TOOLS`, `MAP`, `UIX` | Ekstraksi `NM_LEMBAR`/`NO_LEMBAR` P3G 1:250k per poligon; sintesis `lith_detail` 2.096 unit & presisi sub-kala ICS; penampang geologi bawah permukaan panoramik (`VE`, 3 horizon, patahan + *throw*, ekspor SVG); impor SHP UTM 46N–54S + *drag-drop* + atribut `.dbf`; navigasi `Back`/`Northing Up` + pembersihan jargon internal + optimasi seluler |
| **Gelombang G — Sertifikasi Workstation & Rilis Produksi v3** | `WP-26`, `WP-27` | **Berurutan (Gate Rilis)** | `TEST`, `REL` | Suite kontrak & Playwright E2E untuk penampang geologi, SHP UTM, & navigasi; rebuild `all-v3.pmtiles` & deploy produksi `atlas.orebit.id` |

---

## Registry Work Package

Urutan baris adalah urutan prioritas dan topologis (setiap dependensi selalu berada di baris yang lebih atas). Setiap tugas terbuka di [TASKS](../PLAN-geoatlas.md) muncul di kolom `Tugas` dan ditutup tepat oleh satu WP di kolom `Menutup`.

<!-- BEGIN wp-registry -->
| WP | Judul | Branch | Lane | Tugas | Menutup | Bergantung | Gerbang | Exec | Review | Mulai bila | Risk | Verification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Koreksi audit geologi, kolom confidence, dan perluasan kamus auto-crosswalk | `data/audit-confidence-lexicon` | DATA | DAT-01, DAT-02 | DAT-01, DAT-02 | — | G3 | deepseek-flash | claude-sonnet-5-5 | — | HIGH | targeted |
| WP-02 | Pipeline 8 wilayah nasional, Equal-Area CRS, struktur ESDM, dan generator indeks | `feat/pipeline-national-index` | PIPE | PIP-01, PIP-02, PIP-03 | PIP-01, PIP-02, PIP-03 | — | G3 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | targeted |
| WP-03 | Layout desktop anti-tabrakan, env example, dan bar koordinat UTM live | `fix/layout-coords-utm` | UIX | UIX-01, TOOL-01 | UIX-01, TOOL-01 | — | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | MEDIUM | browser |
| WP-04 | Dokumentasi kurasi 8 wilayah nasional dan transparansi provenance | `docs/curation-national-guide` | DOCS | DOC-01 | DOC-01 | — | G6 | deepseek-flash | claude-sonnet-5-5 | — | LOW | targeted |
| WP-05 | Harmonisasi dan katalog geologi wilayah Jawa-Madura dan Bali-Nusa Tenggara | `data/region-jawa-balinusra` | DATA | DAT-03 | DAT-03 | WP-01, WP-02 | G3 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | targeted |
| WP-06 | Harmonisasi dan katalog geologi wilayah Kalimantan dan Sulawesi | `data/region-kalimantan-sulawesi` | DATA | DAT-04 | DAT-04 | WP-05 | G3 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | targeted |
| WP-07 | Harmonisasi wilayah Maluku dan Papua serta kompilasi indeks penuh 8 wilayah | `data/region-maluku-papua-all` | DATA, PIPE | DAT-05, PIP-04 | DAT-05, PIP-04 | WP-06 | G3 | gpt-luna-6 | claude-opus-5-5 | — | HIGH | targeted |
| WP-08 | Mesin pencarian nasional instan semua zoom dengan live typeahead dan keyboard | `feat/national-instant-search` | SEARCH | SRC-01 | SRC-01 | WP-02, WP-03 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | browser |
| WP-09 | Basemap switcher, filter tingkat kurasi, ketahanan tile, dan state URL lengkap | `feat/basemap-confidence-state` | MAP | MAP-01, MAP-02 | MAP-01, MAP-02 | WP-01, WP-03 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | browser |
| WP-10 | Kolom stratigrafi dan litologi interaktif klik-untuk-filter serta chip preset era | `feat/interactive-legend-eras` | UIX | UIX-02, UIX-03 | UIX-02, UIX-03 | WP-03, WP-09 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | browser |
| WP-11 | Island Quick-Jump Bar 8 wilayah dan bottom sheet seluler 3-snap-point | `ux/island-jump-mobile-sheet` | UIX, SEARCH | SRC-02, UIX-04 | SRC-02, UIX-04 | WP-07, WP-08, WP-10 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | browser |
| WP-12 | Kartu detail unit generasi baru, pita stratigrafi, luas km2, GeoJSON, dan koreksi | `feat/detail-provenance-geojson` | TOOLS | TOOL-02 | TOOL-02 | WP-07, WP-08 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | browser |
| WP-13 | Alat ukur jarak, azimuth, dan profil lintasan geologi (Geological Transect Strip) | `feat/geological-transect-tool` | TOOLS | TOOL-03 | TOOL-03 | WP-12 | G4 | gpt-luna-6 | claude-opus-5-5 | — | HIGH | browser |
| WP-14 | Ekspor PNG dan PDF kualitas publikasi dengan kompas, skala bar, dan filter aktif | `feat/publication-export-png-pdf` | TOOLS | EXP-01 | EXP-01 | WP-10, WP-13 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | MEDIUM | browser |
| WP-15 | Aksesibilitas WCAG 2.2 AA, navigasi keyboard menyeluruh, dan paritas ID/EN 100% | `ux/a11y-keyboard-i18n-parity` | UIX | UIX-05 | UIX-05 | WP-11, WP-13 | G4 | deepseek-flash | claude-sonnet-5-5 | — | HIGH | browser |
| WP-16 | Suite pengujian otomatis kontrak pipeline, known-answer aplikasi, dan Playwright E2E | `test/full-automated-suites` | TEST | TEST-01 | TEST-01 | WP-14, WP-15 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | full |
| WP-17 | Sertifikasi exact-source local-ci penuh dan bukti mutasi data serta layout | `test/exact-source-certification` | TEST | TEST-02 | TEST-02 | WP-16 | G4 | deepseek-flash | claude-opus-5-5 | — | HIGH | full |
| WP-18 | Paket rilis nasional indonesia.pmtiles dan deploy produksi atlas.orebit.id | `release/national-atlas-deploy` | REL | REL-01 | REL-01 | WP-04, WP-17 | G4 | gpt-luna-6 | gpt-sol-6-1, pemilik | pemilik: setujui deploy kandidat ke atlas.orebit.id | RELEASE | full |
| WP-19 | Uji usability representatif HUM-01 minimal 5 peserta geolog dan mahasiswa | `docs/hum-01-usability-round` | HUMAN | HUM-01 | HUM-01 | WP-18 | manusia | deepseek-flash | pemilik | pemilik: jadwal peserta uji usability | MEDIUM | targeted |
| WP-20 | Audit akhir 45 cek SPEC §6 dan penutupan target Full Satu Indonesia 100/100 | `docs/val-01-final-100-audit` | DOCS | VAL-01 | VAL-01 | WP-18, WP-19 | G3 | gpt-luna-6 | gpt-sol-6-1, pemilik | — | HIGH | targeted |
| WP-21 | Ekstraksi atribut lembar P3G 1:250.000 NM_LEMBAR dan NO_LEMBAR per poligon di pipeline | `feat/pipeline-sheet-provenance` | PIPE | PIP-05 | PIP-05 | WP-07 | G3 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | targeted |
| WP-22 | Sintesis lith_detail 2096 unit nasional dan penajaman presisi sub-kala stratigrafi ICS | `data/national-lith-detail-subepoch` | DATA | DAT-06, DAT-07 | DAT-06, DAT-07 | WP-21 | G3 | gpt-luna-6 | claude-opus-5-5 | — | HIGH | targeted |
| WP-23 | Workstation penampang geologi bawah permukaan panoramik dengan VE, patahan, dan ekspor SVG | `feat/panoramic-geological-section` | TOOLS | TOOL-04 | TOOL-04 | WP-13 | G4 | gpt-luna-6 | claude-opus-5-5 | — | HIGH | browser |
| WP-24 | Workstation impor SHP UTM 46N-54S dan WGS84 dengan pin lokasi, drag-drop, dan atribut DBF | `feat/shp-utm-workstation` | MAP, TOOLS | TOOL-05 | TOOL-05 | WP-12 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | browser |
| WP-25 | Navigasi kamera Back dan Northing Up 2D/3D, pembersihan jargon internal, dan optimasi seluler | `ux/navigation-clean-about-mobile` | UIX | UIX-06 | UIX-06 | WP-15 | G4 | deepseek-flash | claude-sonnet-5-5 | — | MEDIUM | browser |
| WP-26 | Suite pengujian kontrak dan Playwright E2E untuk penampang geologi, SHP UTM, dan navigasi | `test/geologist-workstation-e2e` | TEST | TEST-03 | TEST-03 | WP-22, WP-23, WP-24, WP-25 | G4 | gpt-luna-6 | claude-sonnet-5-5 | — | HIGH | full |
| WP-27 | Rebuild nasional all-v3.pmtiles dengan provenance lembar P3G dan deploy produksi atlas.orebit.id | `release/national-atlas-v3` | REL | REL-02 | REL-02 | WP-26 | G4 | gpt-luna-6 | gpt-sol-6-1, pemilik | — | RELEASE | full |
<!-- END wp-registry -->

---

### WP-01 — Koreksi audit geologi, kolom confidence, dan perluasan kamus auto-crosswalk

Branch `data/audit-confidence-lexicon` · Lane `DATA` · Gerbang `G3` · Exec `deepseek-flash` · Review `claude-sonnet-5-5`

**Tujuan:** Memperbaiki ketidakakuratan geologi yang ditemukan di audit validasi (`TRJKG`, `PUK`, `PCKS1`, `PCTM`, `PCSV`), menambahkan kolom `confidence` (`curated` | `auto` | `flagged`) pada `reference/units.csv`, dan memperluas `AGE_MAP` + `LITH_RULES` di `pipeline/auto_crosswalk.py` agar mencakup seluruh terminologi stratigrafi Indonesia.

**Lingkup file:** `reference/units.csv`, `pipeline/validate_reference.py`, `pipeline/auto_crosswalk.py`; baris `DAT-01` dan `DAT-02` di `docs/PLAN-geoatlas.md`. Tidak menyentuh `app/src/`.

**Langkah:**
1. Tambahkan kolom `confidence` pada `reference/units.csv`. Isi `curated` untuk 22 unit manual Bangka-Belitung (kecuali yang memiliki catatan konflik), `auto` untuk unit hasil `auto_crosswalk.py` (`[AUTO]`), dan `flagged` untuk unit yang memiliki konflik literatur (`PUK`).
2. Koreksi `TRJKG` (Granit Klabat) di `reference/units.csv` menjadi `age_top_ma=143.1`, `age_base_ma=251.902`, `interval_top=Jura`, `interval_base=Trias`, `confidence=curated`, dan perbarui `PCKS1`/`PCTM`/`PCSV` dengan deskripsi metasedimen/klastik campuran sesuai Leksikon Stratigrafi.
3. Perbarui `pipeline/validate_reference.py` untuk memvalidasi keberadaan dan nilai kolom `confidence` (`curated`, `auto`, `flagged`).
4. Perluas `AGE_MAP`, fungsi parser rentang umur (`age_for`), dan `LITH_RULES` di `pipeline/auto_crosswalk.py` untuk mengenali ≥30 istilah umur tunggal maupun gabungan serta litologi khas seluruh kepulauan Indonesia, dan pastikan `auto_crosswalk.py` menulis kolom `confidence="auto"`.

**Selesai bila (DoD):**
- [ ] `python3 pipeline/validate_reference.py` lulus tanpa error dan memvalidasi kolom `confidence` (`DAT-01`).
- [ ] `TRJKG` memiliki rentang `143.1–251.902 Ma` (Trias–Jura), `PUK` berstatus `flagged`, dan `PCKS1`/`PCTM`/`PCSV` terkoreksi (`DAT-01`).
- [ ] `age_for()` dan `lith_for()` di `pipeline/auto_crosswalk.py` lulus minimal 25 kasus uji stratigrafi Indonesia (`DAT-02`).

**Tes:** `python3 pipeline/validate_reference.py`, `tests/test_pipeline_contracts.py`

**STOP-TANYA:** tidak ada.

### WP-02 — Pipeline 8 wilayah nasional, Equal-Area CRS, struktur ESDM, dan generator indeks

Branch `feat/pipeline-national-index` · Lane `PIPE` · Gerbang `G3` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Memperluas pipeline agar mendukung seluruh 8 wilayah kepulauan Indonesia (`sumatra`, `babel`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`), menghitung luas poligon secara akurat lintas zona UTM dengan proyeksi Equal-Area `EPSG:6933`, mendukung layer garis struktur, dan menghasilkan katalog indeks pencarian nasional `app/public/data/indonesia-units-index.json`.

**Lingkup file:** `pipeline/common.py`, `pipeline/00_fetch_esdm.py`, `pipeline/02_validate.py`, `pipeline/03_harmonize.py`, `pipeline/04_edgematch.py`, `pipeline/05_export.py`, `pipeline/inventory.py`, `pipeline/build_index.py`, `Makefile`; baris `PIP-01`, `PIP-02`, `PIP-03` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Definisikan `REGION_BBOX` dan `REGION_NAMES` untuk 8 wilayah nasional di `pipeline/common.py` dan gunakan di `00_fetch_esdm.py`.
2. Tambahkan dukungan penarikan layer struktur/garis pada `00_fetch_esdm.py` serta utilitas `pipeline/build_index.py` yang membangun `app/public/data/indonesia-units-index.json` dari `reference/` dan geometri wilayah yang tersedia.
3. Ganti perhitungan luas `estimate_utm_crs()` pada `02_validate.py`, `04_edgematch.py`, dan `inventory.py` menjadi proyeksi Equal-Area `EPSG:6933`, serta teruskan kolom `confidence` dan `area_km2` ke `03_harmonize.py`, `04_edgematch.py`, dan `05_export.py`.
4. Tambahkan target `make index` di `Makefile` dan panggil di `make combine`.

**Selesai bila (DoD):**
- [ ] `REGION_BBOX` memuat tepat 8 wilayah nasional (`sumatra`, `babel`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`) (`PIP-01`).
- [ ] Perhitungan luas memakai `EPSG:6933` dan `05_export.py` menyertakan `confidence` serta `area_km2` (`PIP-02`).
- [ ] `python3 pipeline/build_index.py` menghasilkan `app/public/data/indonesia-units-index.json` valid sesuai skema `orebit-geoatlas-index-v1` (`PIP-03`).

**Tes:** `python3 pipeline/validate_reference.py`, `python3 pipeline/build_index.py`, `tests/test_pipeline_contracts.py`

**STOP-TANYA:** tidak ada.

### WP-03 — Layout desktop anti-tabrakan, env example, dan bar koordinat UTM live

Branch `fix/layout-coords-utm` · Lane `UIX` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Menghilangkan tabrakan antara drawer detail unit (`.detail`) dan tombol kontrol peta (`.map-ctrls`) di layar desktop, menyediakan `app/.env.example`, serta menambahkan bar pembacaan koordinat kursor live (Lat/Lon + Zona UTM + Zoom + klik-salin).

**Lingkup file:** `app/.env.example`, `app/index.html`, `app/src/style.css`, `app/src/coords.ts`, `app/src/main.ts`, `app/src/i18n.ts`; baris `UIX-01` dan `TOOL-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Buat `app/src/coords.ts` dengan fungsi konversi WGS84 `(lat, lon)` ke format derajat desimal dan koordinat UTM (`zone`, `band`, `easting`, `northing`) yang akurat untuk seluruh zona UTM Indonesia (`46N–54N` dan `46M–54M`).
2. Tambahkan elemen bar koordinat (`#coordBar`) di `app/index.html` (di dalam `.map-foot`) dengan kemampuan klik untuk menyalin koordinat pusat/titik terakhir.
3. Perbaiki posisi `.detail` di `app/src/style.css` menjadi `right: 14px; top: var(--detail-top, 64px)` (dan `104px` saat `.map-ctrls.is-3d` aktif) sehingga `.detail` selalu berada rapi di bawah `.map-ctrls` tanpa tumpang-tindih.

**Selesai bila (DoD):**
- [ ] Di desktop (`1366×768`), `boundingBox(.detail)` tidak beririsan sama sekali dengan `boundingBox(.map-ctrls)` baik pada mode 2D maupun 3D (`UIX-01`).
- [ ] `app/.env.example` tersedia di repo (`UIX-01`).
- [ ] Bar koordinat menampilkan Lat/Lon, Zona UTM (`46–54`), Easting/Northing, dan Zoom secara real-time, serta dapat disalin dengan klik (`TOOL-01`).

**Tes:** `cd app && npm run build`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-04 — Dokumentasi kurasi 8 wilayah nasional dan transparansi provenance

Branch `docs/curation-national-guide` · Lane `DOCS` · Gerbang `G6` · Exec `deepseek-flash` · Review `claude-sonnet-5-5`

**Tujuan:** Memperbarui dokumentasi kurasi crosswalk dan README agar mencerminkan arsitektur 8 wilayah nasional, skema tingkat kepercayaan (`curated`, `auto`, `flagged`), dan prosedur build indeks nasional.

**Lingkup file:** `docs/kurasi-crosswalk.md`, `README.md`; baris `DOC-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Perbarui `docs/kurasi-crosswalk.md` dengan tabel 8 wilayah nasional, panduan pengisian kolom `confidence`, dan langkah menjalankan `make index` / `make tiles-all`.
2. Perbarui `README.md` agar menjelaskan cakupan 8 wilayah kepulauan Indonesia, alat kerja geolog baru, dan struktur WP/PRD/SPEC.

**Selesai bila (DoD):**
- [ ] `docs/kurasi-crosswalk.md` dan `README.md` akurat, seluruh tautan relatif valid, dan lulus `python3 ops/scripts/guards/check-docs.py` (`DOC-01`).

**Tes:** `python3 ops/scripts/guards/check-docs.py`, `python3 ops/scripts/guards/check-plan-registry.py`

**STOP-TANYA:** tidak ada.

### WP-05 — Harmonisasi dan katalog geologi wilayah Jawa-Madura dan Bali-Nusa Tenggara

Branch `data/region-jawa-balinusra` · Lane `DATA` · Gerbang `G3` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Menambahkan sumber, crosswalk, dan unit geologi terharmonisasi untuk wilayah **Jawa & Madura (`jawa`)** serta **Bali & Nusa Tenggara (`balinusra`)** ke dalam `reference/` sehingga formasi-formasi kunci Jawa, Madura, Bali, Lombok, Sumbawa, Sumba, Flores, dan Timor terwakili secara akurat.

**Lingkup file:** `reference/sources.csv`, `reference/crosswalk.csv`, `reference/units.csv`, `app/public/data/indonesia-units-index.json`; baris `DAT-03` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tambahkan entri sumber `jawa` dan `balinusra` di `reference/sources.csv`.
2. Integrasikan formasi-formasi regional utama Jawa–Madura (mis. Formasi Parigi, Cibulakan, Cisubuh, Jatiluhur, Halang, Kerek, Wonosari, Nanggulan, Semilir, Kebo-Butak, Pacitan, Karangsambung Melange, Gunungapi Kuarter Merapi/Bromo/Semeru/Slamet/Gede, Aluvium Pantura) dan Bali–Nusa Tenggara (mis. Formasi Selatan Bali, Gunungapi Agung/Batur/Rinjani/Tambora/Kelimutu, Formasi Batuasih, Kompleks Mutis, Formasi Bobonaro, Formasi Noele, Batugamping Koral Sumba/Timor) ke `reference/units.csv` dan `reference/crosswalk.csv` beserta sub-bbox regionalnya.
3. Jalankan `python3 pipeline/validate_reference.py` dan `python3 pipeline/build_index.py`.

**Selesai bila (DoD):**
- [ ] Wilayah `jawa` dan `balinusra` memiliki sumber, crosswalk, dan unit geologi lengkap di `reference/*.csv` dan lulus `python3 pipeline/validate_reference.py` (`DAT-03`).
- [ ] `indonesia-units-index.json` memuat unit-unit `jawa` dan `balinusra` dengan bbox akurat di dalam batas wilayahnya (`DAT-03`).

**Tes:** `python3 pipeline/validate_reference.py`, `python3 pipeline/build_index.py`, `tests/test_pipeline_contracts.py`

**STOP-TANYA:** tidak ada.

### WP-06 — Harmonisasi dan katalog geologi wilayah Kalimantan dan Sulawesi

Branch `data/region-kalimantan-sulawesi` · Lane `DATA` · Gerbang `G3` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Menambahkan sumber, crosswalk, dan unit geologi terharmonisasi untuk wilayah **Kalimantan (`kalimantan`)** dan **Sulawesi (`sulawesi`)** ke dalam `reference/`.

**Lingkup file:** `reference/sources.csv`, `reference/crosswalk.csv`, `reference/units.csv`, `app/public/data/indonesia-units-index.json`; baris `DAT-04` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tambahkan entri sumber `kalimantan` dan `sulawesi` di `reference/sources.csv`.
2. Integrasikan satuan geologi utama Kalimantan (mis. Formasi Balikpapan, Pulaubalang, Pamaluan, Kampungbaru, Tanjung, Warukin, Dahor, Kelompok Ketungau/Melawi, Granit Schwaner, Kompleks Meratus/Ofiolit, Batuan Gunungapi Muller/Nyaan, Endapan Gambut & Aluvium Mahakam/Kapuas/Barito) dan Sulawesi (mis. Kompleks Ultramafik Sulawesi Timur / Sorowako–Bahodopi, Kompleks Metamorf Latimojong/Pompangeo, Formasi Tonasa, Camba, Toraja, Mallawa, Matano, Tokala, Molasa Sulawesi, Gunungapi Minahasa/Lokon/Soputan) ke `reference/units.csv` dan `reference/crosswalk.csv`.
3. Jalankan `python3 pipeline/validate_reference.py` dan `python3 pipeline/build_index.py`.

**Selesai bila (DoD):**
- [ ] Wilayah `kalimantan` dan `sulawesi` memiliki sumber, crosswalk, dan unit geologi lengkap di `reference/*.csv` dan lulus `python3 pipeline/validate_reference.py` (`DAT-04`).
- [ ] `indonesia-units-index.json` memuat unit-unit `kalimantan` dan `sulawesi` dengan bbox akurat (`DAT-04`).

**Tes:** `python3 pipeline/validate_reference.py`, `python3 pipeline/build_index.py`, `tests/test_pipeline_contracts.py`

**STOP-TANYA:** tidak ada.

### WP-07 — Harmonisasi wilayah Maluku dan Papua serta kompilasi indeks penuh 8 wilayah

Branch `data/region-maluku-papua-all` · Lane `DATA, PIPE` · Gerbang `G3` · Exec `gpt-luna-6` · Review `claude-opus-5-5`

**Tujuan:** Menambahkan sumber, crosswalk, dan unit geologi terharmonisasi untuk **Kepulauan Maluku (`maluku`)** dan **Papua (`papua`)**, serta memverifikasi kompilasi indeks nasional penuh 8 wilayah Indonesia.

**Lingkup file:** `reference/sources.csv`, `reference/crosswalk.csv`, `reference/units.csv`, `pipeline/build_index.py`, `app/public/data/indonesia-units-index.json`; baris `DAT-05` dan `PIP-04` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tambahkan entri sumber `maluku` dan `papua` di `reference/sources.csv`.
2. Integrasikan satuan geologi utama Kepulauan Maluku (mis. Kompleks Ofiolit Halmahera/Obi/Gebe, Formasi Weda, Subaim, Bacan Volcanics, Gunungapi Gamalama/Dukono, Kompleks Metamorf Taipan/Seram, Formasi Kanikeh, Manusela, Wahai, Fufa) dan Papua (mis. Kelompok Batugamping New Guinea / Formasi Kais, Yawee, Sirga, Faumai, Kelompok Kembelangan, Formasi Ekmai, Jass, Tipuma, Aiduna, Kompleks Intrusif Grasberg/Ertzberg Diorit, Sabuk Ofiolit Papua & Metamorf Derewo, Formasi Mamberamo, Endapan Aluvial Digul/Lorentz) ke `reference/units.csv` dan `reference/crosswalk.csv`.
3. Jalankan `python3 pipeline/validate_reference.py` dan `python3 pipeline/build_index.py` sehingga `app/public/data/indonesia-units-index.json` mencakup seluruh 8 wilayah Indonesia.

**Selesai bila (DoD):**
- [ ] Kedelapan wilayah nasional (`babel`, `sumatra`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`) hadir lengkap di `reference/sources.csv`, `crosswalk.csv`, `units.csv`, dan `app/public/data/indonesia-units-index.json` (`DAT-05`, `PIP-04`).
- [ ] `python3 pipeline/validate_reference.py` dan `tests/test_pipeline_contracts.py` lulus 100% (`PIP-04`).

**Tes:** `python3 pipeline/validate_reference.py`, `python3 pipeline/build_index.py`, `tests/test_pipeline_contracts.py`

**STOP-TANYA:** tidak ada.

### WP-08 — Mesin pencarian nasional instan semua zoom dengan live typeahead dan keyboard

Branch `feat/national-instant-search` · Lane `SEARCH` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Mengganti pencarian lama yang hanya membaca tile di viewport menjadi mesin pencarian nasional instan berbasis `indonesia-units-index.json` + tile aktif + Nominatim, lengkap dengan *live typeahead* saat mengetik, tombol clear (`×`), dan navigasi keyboard (`ArrowDown`/`ArrowUp`/`Enter`/`Escape`).

**Lingkup file:** `app/src/search.ts`, `app/index.html`, `app/src/style.css`, `app/src/i18n.ts`; baris `SRC-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Muat `/data/indonesia-units-index.json` secara asinkron dengan cache di `app/src/search.ts`.
2. Implementasikan pencocokan skor berperingkat (exact symbol match → prefix symbol/formation → substring formation/lithology/region/interval) sehingga pencarian seperti `"TRJkg"`, `"Muara Enim"`, `"Tonasa"`, `"Kais"`, `"Grasberg"`, `"Ofiolit"`, atau `"Kalimantan"` langsung menampilkan unit yang cocok beserta badge wilayah, simbol, dan umur dari zoom berapa pun.
3. Tambahkan live typeahead (debounce 150ms untuk unit lokal, 320ms untuk Nominatim), tombol clear (`#searchClear`), dan navigasi keyboard (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`).
4. Saat hasil unit diklik, terbangkan peta ke `bbox` unit tersebut dan buka kartu detail unitnya.

**Selesai bila (DoD):**
- [ ] Pencarian formasi atau simbol peta dari zoom awal Indonesia (`z=4.2`) mengembalikan hasil instan dari seluruh 8 wilayah tanpa harus zoom in dulu (`SRC-01`).
- [ ] Live typeahead, tombol clear (`×`), dan navigasi keyboard (`ArrowDown`/`ArrowUp`/`Enter`/`Escape`) berfungsi penuh (`SRC-01`).

**Tes:** `cd app && npm run build`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-09 — Basemap switcher, filter tingkat kurasi, ketahanan tile, dan state URL lengkap

Branch `feat/basemap-confidence-state` · Lane `MAP` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Menambahkan pemilih peta dasar (*Terang / Positron*, *Gelap / Dark*, *Topografi / Relief*), filter tingkat kepercayaan data (`confidence`: *Semua*, *Terkurasi*, *Otomatis/Tinjauan*), filter litologi di layer peta, penanganan error tile yang anggun, dan sinkronisasi penuh parameter URL hash.

**Lingkup file:** `app/src/config.ts`, `app/src/state.ts`, `app/src/layers.ts`, `app/src/main.ts`, `app/index.html`, `app/src/style.css`, `app/src/i18n.ts`; baris `MAP-01` dan `MAP-02` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Perluas `AppState` di `app/src/state.ts` dengan `lithFilter?: string`, `confFilter?: "all" | "curated" | "review"`, `basemap?: "light" | "dark" | "topo"`, dan `region?: string`, beserta fungsi `readState()` / `writeState()` yang bersih.
2. Perbarui `app/src/layers.ts` agar `setAgeFilter` / `applyGeologyFilters` menggabungkan filter rentang umur (`ageMin`–`ageMax`), filter kelas/kelompok litologi (`lithFilter`), dan filter tingkat kepercayaan (`confFilter`) pada opasitas poligon.
3. Tambahkan kontrol Basemap Switcher di menu Tools / panel dan filter tingkat kurasi di panel kontrol.

**Selesai bila (DoD):**
- [ ] Pengguna dapat mengganti basemap (*Terang*, *Gelap*, *Topografi*) dan memfilter tingkat kurasi tanpa kehilangan state layer geologi (`MAP-01`).
- [ ] Seluruh parameter state (`mode`, `age`, `lith`, `conf`, `base`, `lines`, `topo`, `view`, `geo`, `lang`) tersimpan dan dipulihkan dengan benar dari URL hash (`MAP-02`).

**Tes:** `cd app && npm run build`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-10 — Kolom stratigrafi dan litologi interaktif klik-untuk-filter serta chip preset era

Branch `feat/interactive-legend-eras` · Lane `UIX` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Mengubah legenda kolom stratigrafi ICS dan daftar litologi yang tadinya pasif menjadi filter peta interaktif (klik-untuk-filter), serta menambahkan bar chip preset era geologi (*Semua*, *Kuarter*, *Kenozoikum*, *Mesozoikum*, *Paleozoikum*, *Prakambrium*) dan tombol *Reset Filter*.

**Lingkup file:** `app/src/legend.ts`, `app/src/timescale.ts`, `app/src/main.ts`, `app/index.html`, `app/src/style.css`, `app/src/i18n.ts`; baris `UIX-02` dan `UIX-03` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tambahkan `ERA_PRESETS` di `app/src/timescale.ts` (`all`, `quaternary`, `cenozoic`, `mesozoic`, `paleozoic`, `precambrian`) dan render chip preset era di bagian filter umur.
2. Ubah item di `app/src/legend.ts` menjadi tombol interaktif dengan `data-top`/`data-base` (untuk mode umur) dan `data-lith` (untuk mode litologi), lengkap dengan atribut `aria-pressed` dan highlight visual saat aktif.
3. Tambahkan bar badge filter aktif + tombol *Reset Filter* (`#resetFiltersBtn`) yang mengembalikan filter umur, litologi, dan tingkat kurasi ke kondisi semua tampil.

**Selesai bila (DoD):**
- [ ] Mengklik periode/epoch di kolom stratigrafi ICS langsung menyaring peta ke rentang umur tersebut; mengklik kelas litologi langsung menyaring peta ke litologi tersebut (`UIX-02`).
- [ ] Chip preset era (*Semua*, *Kuarter*, *Kenozoikum*, *Mesozoikum*, *Paleozoikum*, *Prakambrium*) dan tombol *Reset Filter* bekerja penuh dan tersinkronisasi dengan slider (`UIX-03`).

**Tes:** `cd app && npm run build`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-11 — Island Quick-Jump Bar 8 wilayah dan bottom sheet seluler 3-snap-point

Branch `ux/island-jump-mobile-sheet` · Lane `UIX, SEARCH` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Menghadirkan bar navigasi cepat 8 kepulauan Indonesia (*Island Quick-Jump Bar*) untuk terbang langsung ke pulau sasaran, serta menyempurnakan bottom sheet seluler menjadi 3-snap-point (`peek`, `half`, `full`) yang tetap memperlihatkan kotak pencarian dan chip pulau saat `peek`.

**Lingkup file:** `app/src/config.ts`, `app/index.html`, `app/src/main.ts`, `app/src/style.css`, `app/src/i18n.ts`; baris `SRC-02` dan `UIX-04` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Definisikan metadata `REGIONS` (kode, label ID/EN, bbox `[minLon, minLat, maxLon, maxLat]`, pusat) untuk *Nasional* + 8 wilayah di `app/src/config.ts`.
2. Render strip chip *Island Quick-Jump* (`#regionBar`) di bawah kotak pencarian pada panel kontrol. Saat diklik, panggil `map.fitBounds(region.bbox)` dan tandai chip aktif.
3. Perbarui CSS dan logika bottom sheet seluler (`≤ 760px`) agar mendukung state `peek` (tinggi ~124px: menampilkan handle, judul ringkas, kotak pencarian, dan strip chip pulau), `half` (~50vh), dan `full` (~82vh).

**Selesai bila (DoD):**
- [ ] Bar chip 8 wilayah + Nasional berfungsi menerbangkan kamera peta ke pulau sasaran di desktop maupun seluler (`SRC-02`).
- [ ] Pada viewport seluler `375×812`, state `peek` tetap menampilkan `#searchInput` dan `#regionBar` tanpa menutupi peta utama (`UIX-04`).

**Tes:** `cd app && npm run build`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-12 — Kartu detail unit generasi baru, pita stratigrafi, luas km2, GeoJSON, dan koreksi

Branch `feat/detail-provenance-geojson` · Lane `TOOLS` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Meningkatkan kartu detail unit (`app/src/detail.ts`) agar menampilkan badge tingkat kurasi (`curated` / `auto` / `flagged`), pita visual posisi umur pada skala waktu ICS, luas unit (`km²`), dukungan detail dari entri indeks nasional, tombol *Unduh GeoJSON Unit*, dan tombol *Laporkan Koreksi*.

**Lingkup file:** `app/src/detail.ts`, `app/index.html`, `app/src/main.ts`, `app/src/style.css`, `app/src/i18n.ts`; baris `TOOL-02` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Perbarui `app/src/detail.ts` untuk merender badge kepercayaan data (`Terkurasi Manual`, `Pemetaan Otomatis`, `Catatan Audit`), bar horizontal posisi umur pada skala waktu geologi (0–540 Ma), serta baris luas poligon/unit (`area_km2`).
2. Tambahkan fungsi `showIndexUnitDetail(unit)` sehingga saat pengguna memilih formasi dari pencarian nasional pada zoom rendah (ketika tile vektor detail belum dimuat), kartu detail tetap terbuka lengkap dengan data dari `indonesia-units-index.json` sambil kamera terbang ke lokasi unit.
3. Tambahkan tombol *Unduh GeoJSON* (`#detailGeoJSON`) dan tombol *Laporkan Koreksi* (`#detailReport` yang membuka link GitHub Issue terisi otomatis dengan kode unit, simbol, formasi, dan URL peta).

**Selesai bila (DoD):**
- [ ] Kartu detail menampilkan badge `confidence`, pita stratigrafi visual, dan luas `km²`, baik saat klik poligon di peta maupun saat memilih unit dari pencarian nasional (`TOOL-02`).
- [ ] Tombol *Unduh GeoJSON* mengunduh berkas `.geojson` valid dan tombol *Laporkan Koreksi* memiliki URL GitHub Issue terisi otomatis (`TOOL-02`).

**Tes:** `cd app && npm run build`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-13 — Alat ukur jarak, azimuth, dan profil lintasan geologi (Geological Transect Strip)

Branch `feat/geological-transect-tool` · Lane `TOOLS` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-opus-5-5`

**Tujuan:** Membangun alat kerja geolog interaktif untuk mengukur jarak (km) dan azimuth (°) antar-titik di peta sekaligus menghasilkan pita **Profil Lintasan Geologi (Geological Transect Strip-Log)** yang memperlihatkan urutan dan proporsi formasi batuan yang dipotong oleh garis lintasan.

**Lingkup file:** `app/src/transect.ts`, `app/index.html`, `app/src/main.ts`, `app/src/style.css`, `app/src/i18n.ts`; baris `TOOL-03` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Buat `app/src/transect.ts` dengan fungsi murni perhitungan jarak Haversine (`km`), azimuth (`0°–360°`), interpolasi titik sampel sepanjang polyline, dan pencuplikan unit geologi dari layer peta (`queryRenderedFeatures`) maupun fallback indeks `bbox`.
2. Tambahkan tombol *Ukur & Lintasan* (`#transectBtn`) di toolbar peta dan panel mengambang hasil lintasan (`#transectPanel`) di bawah toolbar kanan.
3. Render pita warna proporsional (**Strip-Log**) beserta daftar segmen formasi (jarak `km`, `%`, simbol, nama formasi, umur, litologi) dan tombol *Hapus Lintasan* serta *Unduh CSV/GeoJSON Lintasan*.

**Selesai bila (DoD):**
- [ ] Fungsi perhitungan jarak Haversine dan azimuth di `app/src/transect.ts` lulus known-answer oracle (`TOOL-03`).
- [ ] Pengguna dapat mengaktifkan mode Lintasan, mengklik ≥2 titik di peta, melihat total jarak (km), azimuth (°), pita strip-log formasi yang terpotong, dan mengunduh data lintasan (`TOOL-03`).

**Tes:** `cd app && npm run build`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-14 — Ekspor PNG dan PDF kualitas publikasi dengan kompas, skala bar, dan filter aktif

Branch `feat/publication-export-png-pdf` · Lane `TOOLS` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Menyempurnakan kanvas ekspor peta PNG dan PDF (`composeExport()`) agar layak masuk laporan ilmiah/eksplorasi dengan kompas arah utara, skala bar grafis dalam km, informasi filter aktif, koordinat tengah, dan atribusi lengkap.

**Lingkup file:** `app/src/main.ts`, `app/src/i18n.ts`; baris `EXP-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Perbarui `composeExport()` di `app/src/main.ts` untuk menggambar simbol kompas utara (berotasi sesuai `map.getBearing()`) dan skala bar grafis terkalibrasi (`km` per piksel pada lintang tengah peta).
2. Cantumkan ringkasan filter aktif (mode warna, rentang umur Ma, filter litologi/kurasi bila aktif) pada sub-header ekspor serta atribusi sumber yang lengkap di footer.

**Selesai bila (DoD):**
- [ ] Ekspor PNG dan PDF berhasil menghasilkan berkas valid tanpa error dan memuat kompas utara, skala bar grafis, ringkasan filter aktif, legenda, serta atribusi (`EXP-01`).

**Tes:** `cd app && npm run build`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-15 — Aksesibilitas WCAG 2.2 AA, navigasi keyboard menyeluruh, dan paritas ID/EN 100%

Branch `ux/a11y-keyboard-i18n-parity` · Lane `UIX` · Gerbang `G4` · Exec `deepseek-flash` · Review `claude-sonnet-5-5`

**Tujuan:** Memastikan seluruh antarmuka GeoAtlas memenuhi standar aksesibilitas WCAG 2.2 AA (kontras warna, navigasi keyboard, `Escape` handler, target sentuh `≥44px`) dan paritas 100% antara Bahasa Indonesia (`id`) dan Bahasa Inggris (`en`).

**Lingkup file:** `app/src/i18n.ts`, `app/src/about.ts`, `app/src/style.css`, `app/src/main.ts`, `app/index.html`; baris `UIX-05` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Audit dan lengkapi seluruh key di `app/src/i18n.ts` serta konten dialog Tentang di `app/src/about.ts` untuk Bahasa Indonesia dan Inggris.
2. Pastikan tombol `Escape` menutup hasil pencarian, popover Tools, drawer detail unit, atau mode ukur lintasan secara berurutan dan mengembalikan fokus ke pemicunya.
3. Pastikan seluruh tombol dan chip pada tampilan seluler (`≤760px`) memiliki target sentuh efektif minimal `44×44 px` atau padding sentuh yang memadai, serta kontras teks memenuhi rasio ≥ 4.5:1.

**Selesai bila (DoD):**
- [ ] Paritas key `dict.id` dan `dict.en` di `app/src/i18n.ts` 100% identik dan bebas string kosong (`UIX-05`).
- [ ] Navigasi keyboard, penutupan dengan `Escape`, dan kontras warna lulus pengujian otomatis (`UIX-05`).

**Tes:** `cd app && npm run build`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-16 — Suite pengujian otomatis kontrak pipeline, known-answer aplikasi, dan Playwright E2E

Branch `test/full-automated-suites` · Lane `TEST` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Membangun tiga lapis suite pengujian otomatis (`tests/test_pipeline_contracts.py`, `tests/test_app_contracts.mjs`, dan `tests/test_browser_uiux.py`) yang membuktikan kebenaran data 8 wilayah, algoritma ilmiah (UTM, transek, pencarian), serta tata letak UI/UX desktop & seluler dalam bahasa ID dan EN.

**Lingkup file:** `tests/test_pipeline_contracts.py`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`, `ops/scripts/ci/local-ci.sh`; baris `TEST-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tulis `tests/test_pipeline_contracts.py` untuk menguji validasi CSV referensi, keberadaan 8 wilayah nasional di `REGION_BBOX` dan `indonesia-units-index.json`, koreksi audit geologi (`TRJKG`, `PUK`, `PCKS1`), serta known-answer `age_for()` dan `lith_for()`.
2. Tulis `tests/test_app_contracts.mjs` untuk menguji konversi koordinat UTM, jarak/azimuth lintasan geologi, pencarian indeks nasional, roundtrip state URL, dan paritas kamus ID/EN.
3. Tulis `tests/test_browser_uiux.py` menggunakan Playwright untuk menguji aplikasi di viewport desktop (`1366×768`) dan seluler (`375×812`), termasuk asersi **Zero Overlap** `.detail` vs `.map-ctrls`, pencarian instan nasional, klik chip pulau, klik legenda stratigrafi/litologi, chip era, alat ukur lintasan, dan ganti bahasa ID/EN tanpa `pageerror`.

**Selesai bila (DoD):**
- [ ] `python3 tests/test_pipeline_contracts.py` lulus 100% (`TEST-01`).
- [ ] `node tests/test_app_contracts.mjs` lulus 100% (`TEST-01`).
- [ ] `python3 tests/test_browser_uiux.py` lulus 100% pada desktop dan seluler dalam bahasa ID & EN (`TEST-01`).

**Tes:** `python3 tests/test_pipeline_contracts.py`, `node tests/test_app_contracts.mjs`, `python3 tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-17 — Sertifikasi exact-source local-ci penuh dan bukti mutasi data serta layout

Branch `test/exact-source-certification` · Lane `TEST` · Gerbang `G4` · Exec `deepseek-flash` · Review `claude-opus-5-5`

**Tujuan:** Menjalankan gerbang CI lokal penuh (`bash ops/scripts/ci/local-ci.sh --full --write-receipt`) pada working tree bersih dan memverifikasi bukti mutasi (tes gagal bila koreksi layout atau data dilepas).

**Lingkup file:** `tests/test_pipeline_contracts.py`, `tests/test_browser_uiux.py`, `docs/audits/audit-full-indonesia-uiux-2026-11-21.md`; baris `TEST-02` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tambahkan pengujian mutasi terisolasi di dalam `tests/test_pipeline_contracts.py` dan `tests/test_browser_uiux.py` yang memastikan detektor tabrakan layout dan validator referensi benar-benar menangkap pelanggaran simulasi.
2. Jalankan `bash ops/scripts/ci/local-ci.sh --full --write-receipt` dan verifikasi receipt `.tmp-tier-receipts/local-ci-<SHA>.json`.

**Selesai bila (DoD):**
- [ ] Bukti mutasi terverifikasi otomatis di dalam suite tes (`TEST-02`).
- [ ] `bash ops/scripts/ci/local-ci.sh --full --write-receipt` lulus penuh dan menghasilkan receipt exact-SHA yang valid (`TEST-02`).

**Tes:** `bash ops/scripts/ci/local-ci.sh --full --write-receipt`

**STOP-TANYA:** tidak ada.

### WP-18 — Paket rilis nasional indonesia.pmtiles dan deploy produksi atlas.orebit.id

Branch `release/national-atlas-deploy` · Lane `REL` · Gerbang `G4` · Exec `gpt-luna-6` · Review `gpt-sol-6-1, pemilik`

**Tujuan:** Menyiapkan paket rilis produksi `app/dist` beserta `indonesia-units-index.json` dan skrip/instruksi deploy VPS `atlas.orebit.id`, lalu mempublikasikan setelah persetujuan pemilik.

**Lingkup file:** `Makefile`, `docs/runbooks/deploy-atlas-vps.md`; baris `REL-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Dokumentasikan prosedur deploy terverifikasi ke VPS `atlas.orebit.id` (`/opt/orebit-geoatlas/deploy.sh`, konfigurasi HTTP Range & CORS untuk `/tiles/*.pmtiles`, dan verifikasi SHA256 aset `app/dist`) di `docs/runbooks/deploy-atlas-vps.md`.
2. Bangun artefak produksi bersih (`make app` dan `make index`) serta catat manifest SHA256.

**Selesai bila (DoD):**
- [ ] Runbook deploy VPS dan manifest checksum kandidat rilis tercatat dan terverifikasi (`REL-01`).
- [ ] Deploy produksi ke `atlas.orebit.id` tereksekusi setelah pemilik memberikan persetujuan eksplisit (`REL-01`).

**Tes:** `bash ops/scripts/ci/local-ci.sh --full`

**STOP-TANYA:** Sebutkan commit SHA kandidat dan SHA256 artefak build; tunggu persetujuan `"ya"` dari pemilik sebelum mengubah server produksi `atlas.orebit.id`.

### WP-19 — Uji usability representatif HUM-01 minimal 5 peserta geolog dan mahasiswa

Branch `docs/hum-01-usability-round` · Lane `HUMAN` · Gerbang `manusia` · Exec `deepseek-flash` · Review `pemilik`

**Tujuan:** Menyiapkan dan merekam hasil uji usability `HUM-01` dengan minimal 5 peserta representatif (mahasiswa geologi / geolog eksplorasi) untuk 5 tugas utama PRD §9.

**Lingkup file:** `docs/audits/hum-1-geoatlas.md`; baris `HUM-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Siapkan kit uji usability (skenario tugas T1–T5, lembar observasi waktu penyelesaian, skor SEQ/SUS, dan catatan hambatan) di `docs/audits/hum-1-geoatlas.md`.
2. Rekam hasil sesi peserta nyata ketika dijadwalkan oleh pemilik.

**Selesai bila (DoD):**
- [ ] Kit uji `docs/audits/hum-1-geoatlas.md` siap pakai dan hasil ≥5 peserta tercatat memenuhi target waktu ≤3 menit dan keberhasilan ≥90% (`HUM-01`).

**Tes:** `python3 ops/scripts/guards/check-docs.py`

**STOP-TANYA:** Membutuhkan peserta manusia nyata; agent menyiapkan kit lengkap dan berhenti menunggu jadwal/data peserta dari pemilik.

### WP-20 — Audit akhir 45 cek SPEC §6 dan penutupan target Full Satu Indonesia 100/100

Branch `docs/val-01-final-100-audit` · Lane `DOCS` · Gerbang `G3` · Exec `gpt-luna-6` · Review `gpt-sol-6-1, pemilik`

**Tujuan:** Mengaudit ulang seluruh 45 cek biner pada 9 dimensi kualitas di SPEC §6 terhadap bukti commit, tes, dan receipt terbaru untuk menutup target Full Satu Indonesia & UI/UX 100/100.

**Lingkup file:** `docs/audits/audit-full-indonesia-uiux-2026-11-21.md`; baris `VAL-01` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Periksa setiap cek `(1.1)` s/d `(9.5)` di SPEC §6 terhadap bukti tes (`test_pipeline_contracts.py`, `test_app_contracts.mjs`, `test_browser_uiux.py`, `local-ci` receipt, dan `HUM-01`).
2. Perbarui tabel matriks 45 cek di `docs/audits/audit-full-indonesia-uiux-2026-11-21.md` dengan tautan bukti exact-SHA.

**Selesai bila (DoD):**
- [ ] Seluruh 45 cek SPEC §6 memiliki status terverifikasi dan rujukan bukti konkret (`VAL-01`).

**Tes:** `bash ops/scripts/ci/local-ci.sh --full`

**STOP-TANYA:** tidak ada.

### WP-21 — Ekstraksi atribut lembar P3G 1:250.000 NM_LEMBAR dan NO_LEMBAR per poligon di pipeline

Branch `feat/pipeline-sheet-provenance` · Lane `PIPE` · Gerbang `G3` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Mengekstrak nama dan nomor lembar peta geologi asli (`NM_LEMBAR` / `NAME_OF_SH` dan `NO_LEMBAR` / `NUMBER_OF_`) serta atribut pembawa mineral (`PEMBAWA`, `MINERAL`, `CLASS_LITH`) dari berkas `.TAB`/`.shp` di `pipeline/01_ingest.py` dan meneruskannya ke `04_edgematch.py`, `05_export.py`, dan `reference/sources.csv`.

**Lingkup file:** `pipeline/common.py`, `pipeline/01_ingest.py`, `pipeline/03_harmonize.py`, `pipeline/04_edgematch.py`, `pipeline/05_export.py`, `reference/sources.csv`; baris `PIP-05` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Perbarui `reference/sources.csv` agar seluruh sumber wilayah merujuk pada **Kompilasi Peta Geologi Bersistem Indonesia Skala 1:250.000 (Puslitbang Geologi / P3G & Pusat Survei Geologi, Badan Geologi)**.
2. Tambahkan ekstraksi kolom lembar (`NM_LEMBAR`, `NAME_OF_SH`, `SHEET`, `NO_LEMBAR`, `NUMBER_OF_`) pada `pipeline/01_ingest.py` menjadi kolom `sheet_orig`, lalu gabungkan di `04_edgematch.py` dan gunakan sebagai `sheet_name` spesifik lembar di `05_export.py` (mis. `Peta Geologi Lembar Tanjung Pandan (1213), Skala 1:250.000 — P3G`).

**Selesai bila (DoD):**
- [ ] `reference/sources.csv` dan `05_export.py` menyajikan atribusi lembar P3G/PSG 1:250.000 yang akurat (`PIP-05`).
- [ ] `python3 pipeline/validate_reference.py` dan `python3 tests/test_pipeline_contracts.py` lulus (`PIP-05`).

**Tes:** `python3 pipeline/validate_reference.py`, `python3 tests/test_pipeline_contracts.py`

**STOP-TANYA:** tidak ada.

### WP-22 — Sintesis lith_detail 2096 unit nasional dan penajaman presisi sub-kala stratigrafi ICS

Branch `data/national-lith-detail-subepoch` · Lane `DATA` · Gerbang `G3` · Exec `gpt-luna-6` · Review `claude-opus-5-5`

**Tujuan:** Mengisi kolom `lith_detail` dengan komposisi batuan geologis yang akurat untuk seluruh 2.096 unit di `reference/units.csv`, serta menajamkan presisi umur sub-kala ICS (`Miosen Awal/Tengah/Akhir`, `Pliosen`, `Oligosen`, `Eosen`, `Kapur`, `Jura`, `Trias`, `Permo-Karbon`) pada unit kompilasi 8 wilayah.

**Lingkup file:** `reference/units.csv`, `pipeline/auto_crosswalk.py`, `app/public/data/indonesia-units-index.json`; baris `DAT-06` dan `DAT-07` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Sintesis `lith_detail` geologis baku untuk seluruh 2.014 unit yang masih kosong di `reference/units.csv` berdasarkan nama satuan/formasi, kata kunci batuan (batupasir, batulempung, batugamping terumbu, tuf, breksi gunungapi, andesit, basal, granit biotit, granodiorit, diorit, gabro, peridotit/ofiolit, sekis, filit, kuarsit, bancuh/melange, aluvium), dan atribut lembar sumber.
2. Perluas parser sub-kala notasi P3G (`Tml`, `Tmm`, `Tmu`, `Tpl`, `Tpu`, `Tol`, `Tou`, `Tel`, `Tem`, `Teu`, `Kl`, `Ku`, `Jl`, `Jm`, `Ju`, `TRl`, `TRm`, `TRu`, `PC`, `CP`, `TRJ`, `PTR`, `TQ`, `QT`) agar setiap unit memiliki rentang `age_top_ma` dan `age_base_ma` yang presisi.
3. Jalankan `python3 pipeline/validate_reference.py` dan `python3 pipeline/build_index.py`.

**Selesai bila (DoD):**
- [ ] `0` baris di `reference/units.csv` memiliki `lith_detail` kosong (`DAT-06`).
- [ ] Unit dengan simbol sub-kala P3G memiliki rentang umur ICS spesifik dan lulus `python3 pipeline/validate_reference.py` (`DAT-07`).
- [ ] `app/public/data/indonesia-units-index.json` terbangun ulang secara deterministik (`DAT-06`, `DAT-07`).

**Tes:** `python3 pipeline/validate_reference.py`, `python3 pipeline/build_index.py`, `python3 tests/test_pipeline_contracts.py`

**STOP-TANYA:** tidak ada.

### WP-23 — Workstation penampang geologi bawah permukaan panoramik dengan VE, patahan, dan ekspor SVG

Branch `feat/panoramic-geological-section` · Lane `TOOLS` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-opus-5-5`

**Tujuan:** Mengembangkan `#transectPanel` menjadi Workstation Penampang Geologi Bawah Permukaan Panoramik (`Penampang Geologi A — A'`, lebar hingga `740px–880px` di desktop) dengan 3 horizon stratigrafi bertingkat menurut kedalaman, arsiran litologi standar USGS/FGDC, bidang patahan/sesar miring dengan pergeseran blok (*throw* `↑`/`↓`), kontrol Perbesaran Vertikal (`VE: 1×, 2×, 5×, 10×`), hover sinkron peta–penampang, dan ekspor `SVG` serta `CSV`.

**Lingkup file:** `app/src/transect.ts`, `app/src/style.css`, `app/src/i18n.ts`, `app/index.html`; baris `TOOL-04` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Bangun generator SVG penampang geologi panoramik (`viewBox="0 0 820 268"`) di `app/src/transect.ts` yang menggambar lapisan *basement* terpatahkan, lapisan stratigrafi miring/terlipat dengan 3 garis perlapisan internal (`bedding planes`), intrusi batolit plutonik memotong dari bawah, lapisan Kuarter di atas ketidakselarasan, serta arsiran litologi USGS (`pat-carbonate`, `pat-siliciclastic`, `pat-volcanic`, `pat-plutonic_felsic`, `pat-plutonic_mafic`, `pat-metamorphic`, `pat-unconsolidated`, `pat-melange`).
2. Gambar bidang sesar/patahan miring (`#DC2626`, kemiringan ~68°) lengkap dengan panah pergeseran *hanging-wall / footwall* (`↑` / `↓`), pergeseran vertikal lapisan (*fault throw*), dan label `F1`, `F2`, serta fallback resolusi unit dari `getLoadedNationalUnits()`.
3. Tambahkan kontrol Perbesaran Vertikal (`VE: 1×, 2×, 5×, 10×`), kursor hover interaktif pada SVG yang menampilkan titik posisi di peta, serta tombol unduh `SVG` di samping `CSV`.

**Selesai bila (DoD):**
- [ ] Penampang geologi menampilkan lapisan bawah permukaan bertingkat, arsiran litologi USGS, label simbol formasi di penampang, dan bidang patahan miring dengan panah pergeseran (`TOOL-04`).
- [ ] Pemilih `VE`, hover sinkron peta, dan ekspor `SVG`/`CSV` berfungsi tanpa menabrak `.panel`, `.map-ctrls`, atau `.map-foot` (`TOOL-04`).

**Tes:** `cd app && npm run build`, `node tests/test_app_contracts.mjs`, `python3 tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-24 — Workstation impor SHP UTM 46N-54S dan WGS84 dengan pin lokasi, drag-drop, dan atribut DBF

Branch `feat/shp-utm-workstation` · Lane `MAP, TOOLS` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Memastikan berkas `.zip` (SHP), `.shp`+`.dbf`+`.prj`, `.geojson`, dan `.kml` dalam sistem koordinat **UTM Zona 46N–54S** maupun **WGS84** langsung terkonversi akurat ke `[lng, lat]`, terlihat mencolok di peta dengan pin marker (`📍`) dan garis tepi berhalo putih, mendukung *drag-and-drop* ke peta, klik-untuk-inspeksi atribut `.dbf`, dan merangkum formasi geologi yang terpotong.

**Lingkup file:** `app/src/shp_import.ts`, `app/src/style.css`, `app/src/i18n.ts`; baris `TOOL-05` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Implementasikan `utmToLngLat(easting, northing, zone, isSouth)` dan parser `.prj` (`detectPrjSpec`) di `app/src/shp_import.ts`, dilengkapi deteksi otomatis koordinat meter UTM serta pemilih dropdown `CRS (WGS84 / UTM 46S..54N)` untuk berganti zona UTM dengan satu klik bila berkas `.shp` diunggah tanpa `.prj`.
2. Render poligon/garis/titik SHP di bagian paling atas stack layer MapLibre dengan *white halo* (`5.5px`) + garis tepi `#E11D48` (`3px`) + pin marker HTML (`📍 <nama file>`) di titik tengah lokasi, serta otomatis `fitBounds`/`flyTo` ke lokasi SHP.
3. Tambahkan dukungan *drag-and-drop* berkas `.zip`/`.shp`/`.geojson`/`.kml` langsung ke kanvas peta dan tampilkan ringkasan formasi & litologi yang berada di bawah area SHP.

**Selesai bila (DoD):**
- [ ] Impor SHP berkoordinat UTM (46N–54S) maupun WGS84 langsung memindahkan kamera ke lokasi yang tepat di Indonesia dan menampilkan poligon + pin marker `📍` (`TOOL-05`).
- [ ] Pemilih zona UTM interaktif dan daftar formasi/litologi terpotong berfungsi dengan benar (`TOOL-05`).

**Tes:** `cd app && npm run build`, `node tests/test_app_contracts.mjs`, `python3 tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-25 — Navigasi kamera Back dan Northing Up 2D/3D, pembersihan jargon internal, dan optimasi seluler

Branch `ux/navigation-clean-about-mobile` · Lane `UIX` · Gerbang `G4` · Exec `deepseek-flash` · Review `claude-sonnet-5-5`

**Tujuan:** Menambahkan tombol riwayat navigasi kamera (`#navBack` `←`) dan tombol kompas `Northing Up` (`#compassNorthBtn` `N▲`) yang selalu aktif di mode 2D maupun 3D, menghapus seluruh jargon skrip/otomatis (`auto_crosswalk.py`, `[AUTO]`, `Curation confidence levels`) dari dialog Tentang & Detail Unit, serta mengoptimalkan ergonomi tampilan seluler (`≤ 760px`).

**Lingkup file:** `app/index.html`, `app/src/main.ts`, `app/src/about.ts`, `app/src/detail.ts`, `app/src/i18n.ts`, `app/src/style.css`; baris `UIX-06` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tambahkan `#navBack` (riwayat hingga 25 posisi kamera sebelum pan/zoom/lompat pulau/cari unit) dan `#compassNorthBtn` (reset instan `bearing: 0, pitch: 0` dengan jarum kompas yang berputar real-time) di `#mapControls`.
2. Bersihkan `app/src/about.ts`, `app/src/detail.ts`, dan `app/src/i18n.ts` dari istilah `auto_crosswalk.py`, `[AUTO]`, `Automated Mapping`, dan `Curation confidence levels`; tampilkan informasi sumber **Peta Geologi Bersistem Indonesia Skala 1:250.000 (P3G / PSG, Badan Geologi)** serta metodologi harmonisasi ICS.
3. Optimalkan layout seluler di `app/src/style.css` (`-webkit-overflow-scrolling: touch`, `overscroll-behavior: contain`, scroll horizontal penampang geologi panoramik, dan auto-snap ke `peek` saat detail atau penampang dibuka).

**Selesai bila (DoD):**
- [ ] `#navBack` dan `#compassNorthBtn` berfungsi di mode 2D & 3D tanpa tabrakan layout (`UIX-06`).
- [ ] Tidak ada teks `auto_crosswalk.py` atau `[AUTO]` yang tampil pada dialog Tentang maupun kartu Detail Unit (`UIX-06`).
- [ ] Tampilan seluler (`375×812`) lulus uji zero-overlap dan zero-horizontal-overflow (`UIX-06`).

**Tes:** `cd app && npm run build`, `node tests/test_app_contracts.mjs`, `python3 tests/test_browser_uiux.py`

**STOP-TANYA:** tidak ada.

### WP-26 — Suite pengujian kontrak dan Playwright E2E untuk penampang geologi, SHP UTM, dan navigasi

Branch `test/geologist-workstation-e2e` · Lane `TEST` · Gerbang `G4` · Exec `gpt-luna-6` · Review `claude-sonnet-5-5`

**Tujuan:** Memperluas suite pengujian otomatis (`test_pipeline_contracts.py`, `test_app_contracts.mjs`, `test_browser_uiux.py`) agar menguji konversi UTM→WGS84 `shp_import.ts`, penampang geologi multi-horizon + patahan, ketiadaan jargon internal di DOM, serta tombol navigasi `#navBack` dan `#compassNorthBtn`.

**Lingkup file:** `tests/test_pipeline_contracts.py`, `tests/test_app_contracts.mjs`, `tests/test_browser_uiux.py`; baris `TEST-03` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Tambahkan pengujian `utmToLngLat` dan `detectPrjSpec` di `tests/test_app_contracts.mjs` untuk memverifikasi akurasi konversi koordinat UTM Zona 48S (Bangka-Belitung) dan 50S (Kalimantan) ke WGS84 (< 5 meter toleransi).
2. Tambahkan pengujian di `tests/test_browser_uiux.py` untuk memverifikasi tombol `#navBack`, `#compassNorthBtn`, `#shpImportBtn`, penampang geologi panoramik (`svg` dengan `<pattern id="pat-`), dan memastikan dialog `#aboutDialog` bebas dari string `auto_crosswalk.py`.

**Selesai bila (DoD):**
- [ ] `bash ops/scripts/ci/local-ci.sh --full` lulus penuh 8/8 pemeriksaan (`TEST-03`).

**Tes:** `bash ops/scripts/ci/local-ci.sh --full`

**STOP-TANYA:** tidak ada.

### WP-27 — Rebuild nasional all-v3.pmtiles dengan provenance lembar P3G dan deploy produksi atlas.orebit.id

Branch `release/national-atlas-v3` · Lane `REL` · Gerbang `G4` · Exec `gpt-luna-6` · Review `gpt-sol-6-1, pemilik`

**Tujuan:** Membangun ulang `all-v3.pmtiles` dan `app/public/data/indonesia-units-index.json` dengan atribusi lembar P3G 1:250.000 per poligon serta `lith_detail` lengkap untuk 2.096 unit, menulis receipt `local-ci.sh --full --write-receipt`, dan men-deploy ke `https://atlas.orebit.id/`.

**Lingkup file:** `app/public/data/indonesia-units-index.json`, `docs/runbooks/deploy-atlas-vps.md`; baris `REL-02` di `docs/PLAN-geoatlas.md`.

**Langkah:**
1. Jalankan pipeline penuh 8 wilayah (`babel`, `sumatra`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`) → `data/out/all/all.pmtiles` dan `python3 pipeline/build_index.py`.
2. Jalankan `bash ops/scripts/ci/local-ci.sh --full --write-receipt`, bangun `app/dist` produksi, dan sinkronkan ke `orebit-vps2` (`/var/www/atlas.orebit.id/tiles/all-v3.pmtiles` & `/var/www/atlas.orebit.id/current`).

**Selesai bila (DoD):**
- [ ] `https://atlas.orebit.id/` merespons `HTTP/2 200` dan `/tiles/all-v3.pmtiles` merespons `HTTP/2 206` dengan atribut `lith_detail` dan `sheet_name` lembar P3G lengkap (`REL-02`).

**Tes:** `bash ops/scripts/ci/local-ci.sh --full --write-receipt`

**STOP-TANYA:** tidak ada.
