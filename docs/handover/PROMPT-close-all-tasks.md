# Prompt Handover & Eksekusi Tunggal — Tutup Semua Tugas Orebit GeoAtlas Menuju Full Satu Indonesia & UI/UX 100/100

Dibuat 21 November 2026. **Ini adalah satu-satunya prompt eksekusi aktif untuk Orebit GeoAtlas.** Antrean tugas dan statusnya berada di [TASKS](../PLAN-geoatlas.md); pembagian ke branch, lane, risk, model Eksekutor T1 (`deepseek-flash` / `gpt-luna-6` / `flash`) dan Reviewer Read-Only T2/T3 (`claude-sonnet-5-5` / `claude-opus-5-5` / `gpt-sol-6-1` / `pro`) berada di [WORK-PACKAGES-geoatlas](WORK-PACKAGES-geoatlas.md) sesuai [standar work package](../runbooks/agent-work-packages.md).

Baca berurutan: [PIPELINE.md](../../PIPELINE.md) (menang bila bertentangan) → [AGENTS.md](../../AGENTS.md) → [CLAUDE.md](../../CLAUDE.md) → `ACTIVE CHECKPOINT` di [HANDOVER-geoatlas](HANDOVER-geoatlas.md) → berkas ini.

---

## 1. Tujuan Akhir ("Semua Done — Full Satu Indonesia & UI/UX 100/100")

1. **Full Satu Indonesia (8 Wilayah Nasional):** Seluruh 8 wilayah kepulauan (`sumatra`, `babel`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`) terharmonisasi di `reference/*.csv`, lolos `make validate`, memiliki indeks pencarian nasional `app/public/data/indonesia-units-index.json`, dan siap dikompilasi menjadi PMTiles nasional (`make tiles-all`).
2. **UI Optimized & UX 100/100:**
   - Bebas tabrakan panel (`Zero Overlap` antara `.panel`, `.map-ctrls`, `.detail`, `#transectPanel`, dan `.map-foot` pada desktop 1366×768 maupun seluler 375×812).
   - Pencarian nasional instan dari semua tingkat zoom (live typeahead, pencarian formasi/simbol/litologi/wilayah, navigasi keyboard, tombol clear).
   - *Island Quick-Jump Bar* 8 wilayah kepulauan Indonesia + bottom sheet seluler 3-snap-point (`peek`, `half`, `full`).
   - Kolom stratigrafi ICS dan daftar litologi interaktif (klik-untuk-filter) + chip preset era (*Semua*, *Kuarter*, *Kenozoikum*, *Mesozoikum*, *Paleozoikum*, *Prakambrium*) + badge filter aktif & tombol *Reset Filter*.
   - Alat kerja geolog lengkap: bar koordinat live (`Lat/Lon · Zona UTM · Zoom · Salin`), kartu detail dengan pita stratigrafi + luas `km²` + badge `confidence` + unduh GeoJSON + tombol *Laporkan Koreksi*, alat ukur jarak/azimuth & **Geological Transect Strip-Log**, basemap switcher (*Terang*, *Gelap*, *Topografi*), filter tingkat kurasi, serta ekspor PNG/PDF kualitas publikasi.
3. **Semua Tugas & WP Tertutup dengan Bukti:** Setiap baris terbuka di [TASKS](../PLAN-geoatlas.md) ditutup dengan bukti tes dan dipindahkan ke [arsip](../geoatlas-completed.md); `bash ops/scripts/ci/local-ci.sh --full --write-receipt` lulus penuh dengan receipt exact-SHA.

---

## 2. Otorisasi

Pemilik yang menempelkan prompt ini memberi izin kepada agent koordinator untuk:
- Menjalankan seluruh Work Packages `WP-01` s/d `WP-17` dan `WP-20` (serta menyiapkan paket `WP-18` dan kit `WP-19`), membuat branch/worktree, menjalankan eksekutor T1 dan reviewer independen T2/T3, mengintegrasikan perubahan yang sudah mendapat verdict `PASS` dan lulus `local-ci.sh` ke `main`, serta memperbarui TASKS/arsip/`ACTIVE CHECKPOINT`.
- **Deploy ke server produksi `atlas.orebit.id` (`WP-18`) dan penutupan uji peserta manusia nyata (`WP-19` / `HUM-01`) tetap wajib berhenti di `STOP-TANYA` menunggu konfirmasi eksplisit pemilik di chat.**
- **Dilarang:** melemahkan asersi tes, menghapus guard di `ops/scripts/guards/`, menyamarkan data `[AUTO]` sebagai kurasi geolog manual, atau memalsukan bukti uji manusia.

---

## 3. Gerbang Mutu G1–G8 (Adaptive Verification)

| Gerbang | Perintah / Bukti Wajib |
|---|---|
| **G1 Source & Guard** | Branch/perubahan bersih dari `main` mutakhir; satu tujuan per WP; lulus `python3 ops/scripts/guards/check-docs.py`, `python3 ops/scripts/guards/check-plan-registry.py`, dan `python3 ops/scripts/agents/wp.py check` |
| **G2 Build & Referensi** | `python3 pipeline/validate_reference.py` (`make validate`) dan `cd app && npm run build` lulus tanpa error |
| **G3 Tes Kontrak Terarah** | `python3 tests/test_pipeline_contracts.py` dan/atau `node tests/test_app_contracts.mjs` sesuai kartu WP |
| **G4 Browser & CI Lokal** | Perubahan aplikasi web (`app/`): `python3 tests/test_browser_uiux.py` (Playwright desktop 1366×768 & mobile 375×812, ID & EN, termasuk cek Zero-Overlap). Gerbang gelombang/rilis: `bash ops/scripts/ci/local-ci.sh --full --write-receipt` |
| **G5 Visual & Layout** | Verifikasi bounding box tanpa tabrakan (`.detail` di bawah `.map-ctrls`), bottom sheet seluler `peek` menampilkan search & chip pulau, tanpa `pageerror` atau overflow horizontal |
| **G6 Dokumentasi** | Seluruh berkas `docs/` terdaftar di `docs/README.md`, tautan relatif valid, hanya satu `## ACTIVE CHECKPOINT` |
| **G7 Review Independen** | Reviewer read-only pada model berbeda memeriksa diff, bukti DoD, dan hasil tes; mengeluarkan verdict `PASS` atau `NEEDS_FIX` |
| **G8 Penutupan Tugas** | Baris dan kartu tugas yang ditutup dipindah dari `docs/PLAN-geoatlas.md` ke `docs/geoatlas-completed.md` beserta satu baris bukti; `ACTIVE CHECKPOINT` di `docs/handover/HANDOVER-geoatlas.md` diperbarui |

---

## 4. Tabel Penutupan 28 Tugas Terbuka (Mapping Tugas → WP → Tes)

| ID Tugas | Ditutup oleh | Ringkasan Kriteria Selesai (Closing) | Tes Wajib |
|---|---|---|---|
| `DAT-01` | `WP-01` | Koreksi `TRJKG` (Trias–Jura), `PUK` (`flagged`), `PCKS1`/`PCTM`/`PCSV` + kolom `confidence` di `units.csv` & validator | `validate_reference.py`, `test_pipeline_contracts.py` |
| `DAT-02` | `WP-01` | `AGE_MAP` (≥30 istilah umur tunggal/rentang) & `LITH_RULES` Nusantara di `auto_crosswalk.py` + `confidence="auto"` | `test_pipeline_contracts.py` |
| `PIP-01` | `WP-02` | `REGION_BBOX` 8 wilayah nasional di `common.py` & dukungan layer struktur di `00_fetch_esdm.py` | `test_pipeline_contracts.py` |
| `PIP-02` | `WP-02` | Perhitungan luas Equal-Area `EPSG:6933` & kolom `area_km2` + `confidence` di pipeline 02–05 | `test_pipeline_contracts.py` |
| `PIP-03` | `WP-02` | Generator `pipeline/build_index.py` menghasilkan `app/public/data/indonesia-units-index.json` valid | `build_index.py`, `test_pipeline_contracts.py` |
| `UIX-01` | `WP-03` | `.detail` berada di bawah `.map-ctrls` (Zero Overlap di 1366×768) + `app/.env.example` tersedia | `npm run build`, `test_browser_uiux.py` |
| `TOOL-01` | `WP-03` | `app/src/coords.ts` menampilkan Lat/Lon + Zona UTM (`46N–54M`) + Zoom live & klik-salin koordinat | `test_app_contracts.mjs`, `test_browser_uiux.py` |
| `DOC-01` | `WP-04` | `docs/kurasi-crosswalk.md` & `README.md` memuat panduan 8 wilayah nasional & skema `confidence` | `check-docs.py`, `check-plan-registry.py` |
| `DAT-03` | `WP-05` | Katalog & harmonisasi unit geologi wilayah `jawa` dan `balinusra` di `reference/*.csv` & indeks | `validate_reference.py`, `test_pipeline_contracts.py` |
| `DAT-04` | `WP-06` | Katalog & harmonisasi unit geologi wilayah `kalimantan` dan `sulawesi` di `reference/*.csv` & indeks | `validate_reference.py`, `test_pipeline_contracts.py` |
| `DAT-05` | `WP-07` | Katalog & harmonisasi unit geologi wilayah `maluku` dan `papua` di `reference/*.csv` & indeks | `validate_reference.py`, `test_pipeline_contracts.py` |
| `PIP-04` | `WP-07` | Kompilasi penuh 8 wilayah nasional di `indonesia-units-index.json` & target `make combine` | `build_index.py`, `test_pipeline_contracts.py` |
| `SRC-01` | `WP-08` | Pencarian nasional instan dari semua zoom (`indonesia-units-index.json`) + live typeahead + keyboard nav | `test_app_contracts.mjs`, `test_browser_uiux.py` |
| `MAP-01` | `WP-09` | Basemap switcher (*Terang*, *Gelap*, *Topografi*) & filter tingkat kurasi (`confidence`) | `test_app_contracts.mjs`, `test_browser_uiux.py` |
| `MAP-02` | `WP-09` | Roundtrip penuh state URL hash (`mode`, `age`, `lith`, `conf`, `base`, `lines`, `topo`, `view`, `geo`, `lang`) & ketahanan tile | `test_app_contracts.mjs`, `test_browser_uiux.py` |
| `UIX-02` | `WP-10` | Kolom stratigrafi ICS & daftar litologi interaktif (klik-untuk-filter) + badge aktif & tombol Reset | `test_browser_uiux.py` |
| `UIX-03` | `WP-10` | Chip preset era (*Semua*, *Kuarter*, *Kenozoikum*, *Mesozoikum*, *Paleozoikum*, *Prakambrium*) tersinkronisasi | `test_app_contracts.mjs`, `test_browser_uiux.py` |
| `SRC-02` | `WP-11` | *Island Quick-Jump Bar* 8 wilayah kepulauan Indonesia + Nasional dengan `fitBounds` | `test_browser_uiux.py` |
| `UIX-04` | `WP-11` | Bottom sheet seluler 3-snap-point (`peek`, `half`, `full`) dengan search & chip pulau terlihat saat `peek` | `test_browser_uiux.py` |
| `TOOL-02` | `WP-12` | Kartu detail unit: pita posisi stratigrafi, luas `km²`, badge `confidence`, unduh GeoJSON, & Lapor Koreksi | `test_browser_uiux.py` |
| `TOOL-03` | `WP-13` | Alat ukur jarak (km), azimuth (°), & **Geological Transect Strip-Log** + ekspor lintasan | `test_app_contracts.mjs`, `test_browser_uiux.py` |
| `EXP-01` | `WP-14` | Ekspor PNG & PDF kualitas publikasi dengan kompas utara, skala bar grafis, filter aktif, & atribusi | `test_browser_uiux.py` |
| `UIX-05` | `WP-15` | Aksesibilitas WCAG 2.2 AA, fokus keyboard & `Escape`, target sentuh `≥44px`, & paritas kamus ID/EN 100% | `test_app_contracts.mjs`, `test_browser_uiux.py` |
| `TEST-01` | `WP-16` | Suite otomatis lengkap: `test_pipeline_contracts.py`, `test_app_contracts.mjs`, `test_browser_uiux.py` | `local-ci.sh --fast` |
| `TEST-02` | `WP-17` | Sertifikasi exact-source `local-ci.sh --full --write-receipt` & bukti mutasi data/layout | `local-ci.sh --full --write-receipt` |
| `REL-01` | `WP-18` | Runbook deploy VPS `atlas.orebit.id`, manifest SHA256 kandidat rilis, & deploy setelah persetujuan pemilik | `local-ci.sh --full` |
| `HUM-01` | `WP-19` | Kit uji usability `docs/audits/hum-1-geoatlas.md` & rekaman ≥5 peserta representatif | `check-docs.py` |
| `VAL-01` | `WP-20` | Audit akhir 45/45 cek SPEC §6 di `docs/audits/audit-full-indonesia-uiux-2026-11-21.md` | `local-ci.sh --full` |

---

## 5. Prompt Satu Kali Siap Tempel untuk Langsung Eksekusi (Copy-Paste)

Salin seluruh blok di bawah ini dan tempelkan ke sesi agent untuk langsung mengeksekusi seluruh gelombang dari awal sampai selesai:

```text
PERAN: Kamu adalah Koordinator Utama (Staff Geologist + Principal Frontend/GIS Architect) untuk repositori `orebit-geoatlas` di workspace ini. Kerjakan seluruh antrean Work Package (`WP-01` s/d `WP-20`) menuju sasaran **Full Satu Indonesia (8 Wilayah Kepulauan) & UI/UX 100/100** secara otonom tanpa berhenti di tengah gelombang, kecuali pada titik STOP-TANYA yang membutuhkan persetujuan produksi atau partisipasi manusia nyata.

BACA KONTRAK UTAMA (urut, hemat token):
1. `PIPELINE.md`, `AGENTS.md`, `CLAUDE.md`
2. `docs/handover/PROMPT-close-all-tasks.md` (gerbang G1–G8 dan tabel 28 tugas)
3. `ACTIVE CHECKPOINT` di `docs/handover/HANDOVER-geoatlas.md`
4. Gunakan `python3 ops/scripts/agents/wp.py brief WP-NN --role executor` untuk mengambil micro-brief tiap WP (~4 KB) tanpa membaca berulang berkas besar.

ALUR EKSEKUSI GELOMBANG (LOOP SAMPAI SEMUA WP SELESAI):
1. GELOMBANG A (Fondasi Pipeline 8 Wilayah, Koreksi Audit Geologi, Layout Anti-Tabrakan & Koordinat UTM):
   - Eksekusi `WP-01` (`DATA`), `WP-02` (`PIPE`), `WP-03` (`UIX`), dan `WP-04` (`DOCS`).
   - Pastikan `python3 pipeline/validate_reference.py`, `python3 pipeline/build_index.py`, dan `cd app && npm run build` lulus.
2. GELOMBANG B (Harmonisasi Data Geologi 8 Kepulauan Indonesia, Pencarian Nasional Instan & Basemap/State):
   - Eksekusi `WP-05` (`jawa` & `balinusra`), `WP-06` (`kalimantan` & `sulawesi`), `WP-07` (`maluku` & `papua` + kompilasi penuh `indonesia-units-index.json` 8 wilayah).
   - Eksekusi `WP-08` (`SEARCH`: mesin pencarian nasional instan dari semua zoom dengan live typeahead & navigasi keyboard) dan `WP-09` (`MAP`: basemap switcher Terang/Gelap/Topografi, filter `confidence`, ketahanan tile, dan state URL lengkap).
3. GELOMBANG C (Interaktivitas UI/UX 100/100 & Alat Kerja Geolog):
   - Eksekusi `WP-10` (`UIX`: kolom stratigrafi ICS & legenda litologi interaktif klik-untuk-filter + chip preset era + tombol Reset Filter).
   - Eksekusi `WP-11` (`UIX, SEARCH`: Island Quick-Jump Bar 8 wilayah Indonesia + bottom sheet seluler 3-snap-point `peek`/`half`/`full`).
   - Eksekusi `WP-12` (`TOOLS`: kartu detail unit generasi baru dengan pita posisi stratigrafi, luas km², badge `confidence`, unduh GeoJSON unit, dan tombol Laporkan Koreksi).
   - Eksekusi `WP-13` (`TOOLS`: alat ukur jarak km, azimuth °, dan profil lintasan geologi / Geological Transect Strip-Log + ekspor lintasan).
4. GELOMBANG D (Ekspor Publikasi, Aksesibilitas WCAG 2.2 AA & Suite Pengujian Otomatis):
   - Eksekusi `WP-14` (`TOOLS`: ekspor PNG & PDF kualitas publikasi dengan kompas utara, skala bar grafis, filter aktif, dan atribusi).
   - Eksekusi `WP-15` (`UIX`: aksesibilitas WCAG 2.2 AA, fokus keyboard & `Escape`, target sentuh ≥44px, dan paritas 100% kamus ID/EN).
   - Eksekusi `WP-16` (`TEST`: bangun dan jalankan `tests/test_pipeline_contracts.py`, `tests/test_app_contracts.mjs`, dan Playwright `tests/test_browser_uiux.py` pada viewport desktop 1366×768 & mobile 375×812 dalam bahasa ID & EN).
5. GELOMBANG E (Sertifikasi Exact-Source, Paket Rilis, Kit Usability & Audit 45/45 Cek):
   - Eksekusi `WP-17` (`TEST`: bukti mutasi + `bash ops/scripts/ci/local-ci.sh --full --write-receipt`).
   - Siapkan `WP-18` (runbook deploy VPS `docs/runbooks/deploy-atlas-vps.md` & manifest SHA256 build `app/dist`), `WP-19` (kit uji usability `docs/audits/hum-1-geoatlas.md`), dan `WP-20` (pembaruan matriks 45 cek di `docs/audits/audit-full-indonesia-uiux-2026-11-21.md`).
   - Pada setiap penutupan WP (G8): pindahkan tugas yang selesai dari `docs/PLAN-geoatlas.md` ke `docs/geoatlas-completed.md` dengan bukti commit/tes, perbarui `ACTIVE CHECKPOINT` di `docs/handover/HANDOVER-geoatlas.md`, dan pastikan `bash ops/scripts/ci/local-ci.sh --full --write-receipt` hijau.

PEMISAHAN EKSEKUTOR & REVIEWER PADA SETIAP WP:
- Eksekutor mengimplementasikan perubahan dan menjalankan tes (`local-ci.sh --fast` + tes terarah).
- Reviewer independen (subagent read-only `type_name="research"` atau pemeriksaan diff terpisah) memeriksa diff, pemenuhan DoD, keamanan DOM (`esc()`), serta paritas ID/EN, lalu mengeluarkan verdict `PASS` atau `NEEDS_FIX`.
- Jangan menutup tugas ke arsip sebelum tes lulus dan reviewer memberi `PASS`.

STOP-TANYA (berhenti hanya pada kondisi berikut):
- Setelah seluruh `WP-01` s/d `WP-17` dan `WP-20` selesai serta paket rilis `WP-18` dan kit `WP-19` siap: laporkan SHA commit, lokasi receipt `.tmp-tier-receipts/local-ci-<SHA>.json`, tabel 45/45 cek rubrik SPEC §6, serta minta persetujuan `"ya"` pemilik untuk deploy ke server produksi `atlas.orebit.id` (`WP-18`) dan pelaksanaan sesi peserta nyata `HUM-01` (`WP-19`).
```
