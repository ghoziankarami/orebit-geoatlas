# Orebit GeoAtlas — Source, Pipeline, and Publishing Workflow

Diperbarui 21 November 2026. Dokumen ini menetapkan peta sumber kanonik, alur pipeline data geologi nasional (8 wilayah), gerbang verifikasi CI lokal, dan batas publikasi `atlas.orebit.id`. Bila terjadi pertentangan aturan, **PIPELINE.md menang**, diikuti oleh [AGENTS.md](AGENTS.md) dan [CLAUDE.md](CLAUDE.md). Gunakan [indeks dokumen](docs/README.md).

## 1. Pilih Sumber Kanonik

| Pekerjaan | Edit di | Bangun atau Verifikasi dengan |
|---|---|---|
| Tabel referensi geologi nasional (sumber, crosswalk, unit, litologi, ICS) | `reference/*.csv` | `python3 pipeline/validate_reference.py` (`make validate`) & `python3 pipeline/build_index.py` (`make index`) |
| Pipeline akuisisi, validasi, harmonisasi, edge-match, tiling, indeks | `pipeline/*.py`, `pipeline/06_tile.sh` | `python3 tests/test_pipeline_contracts.py` |
| Indeks pencarian formasi nasional | `app/public/data/indonesia-units-index.json` (dibangkitkan oleh `pipeline/build_index.py`) | Jangan diedit manual tanpa memperbarui `reference/*.csv`; jalankan `make index` |
| Aplikasi web peta interaktif (UI/UX, layer, pencarian, detail, transek, ekspor) | `app/index.html`, `app/src/*.ts`, `app/src/style.css` | `cd app && npm run build`, `node tests/test_app_contracts.mjs`, `python3 tests/test_browser_uiux.py` |
| Kontrak produk & teknis | `docs/PRD.md`, `docs/SPEC.md` | `python3 ops/scripts/guards/check-docs.py` |
| Antrean kerja tunggal & Work Packages | `docs/PLAN-geoatlas.md`, `docs/handover/WORK-PACKAGES-geoatlas.md` | `python3 ops/scripts/guards/check-plan-registry.py`, `python3 ops/scripts/agents/wp.py check` |

Jangan mengedit berkas hasil build di `app/dist/` atau direktori webroot `/var/www/atlas.orebit.id` secara langsung.

## 2. Batas Lisensi & Data Publik

- **Kode Sumber (`app/`, `pipeline/`, `ops/`, `tests/`):** Berlisensi **MIT** (`LICENSE`).
- **Data Geologi Layanan ESDM / GeoMap PSG:** Berlisensi Terbuka Pusat Survei Geologi, Badan Geologi, Kementerian ESDM — **wajib atribusi PSG dan dilarang diperjualbelikan**. Oleh karena itu, Orebit GeoAtlas adalah produk publik gratis dan tidak pernah dijual atau dimasukkan ke dalam paket komersial.
- **Data mentah (`data/raw/`):** Tidak di-commit ke repositori Git; yang disimpan di Git adalah tabel harmonisasi `reference/*.csv`, kode pipeline, dan katalog indeks ringkas `app/public/data/indonesia-units-index.json`.
- **Macrostrat (`carto`):** CC-BY 4.0. **OpenStreetMap / OpenFreeMap:** ODbL. **Terrain Mapterhorn:** mengikuti atribusi sumber DEM Mapterhorn.

## 3. Alur Edit, Verifikasi Lokal & Integrasi Work Package

Setiap perubahan dikerjakan sebagai Work Package (WP) terisolasi menurut [standar work package](docs/runbooks/agent-work-packages.md) dan [orkestrasi cepat lokal](docs/runbooks/fast-local-orchestration.md):

1. **Pilih & Klaim WP:** Gunakan `python3 ops/scripts/agents/wp.py next` atau `wp.py wave` untuk memilih WP `SIAP` yang lane-nya bebas.
2. **Gerbang CI Lokal (`local-ci.sh`):**
   - Iterasi cepat (~10 detik): `bash ops/scripts/ci/local-ci.sh --fast` (menjalankan `check-docs.py`, `check-plan-registry.py`, `wp.py check`, `validate_reference.py`, `test_pipeline_contracts.py`, `test_app_contracts.mjs`, dan `npm run build`).
   - Sertifikasi penuh + Playwright browser desktop & mobile + receipt exact-SHA: `bash ops/scripts/ci/local-ci.sh --full --write-receipt`.
3. **Pemisahan Eksekutor & Reviewer:**
   - Eksekutor T1 (`deepseek-flash` / `gpt-luna-6` / `flash`) mengimplementasikan perubahan di branch WP dan menjalankan tes.
   - Reviewer T2/T3 (`claude-sonnet-5-5` / `claude-opus-5-5` / `gpt-sol-6-1` / `pro`) memeriksa diff dan bukti secara **read-only** lalu memberikan verdict `PASS` atau `NEEDS_FIX`.
   - Pemilik melakukan integrasi ke `main` setelah syarat terpenuhi.

## 4. Publikasi ke `atlas.orebit.id`

- Aplikasi produksi disajikan dari VPS (`atlas.orebit.id`) melalui Nginx dari build statis `app/dist`, sedangkan berkas PMTiles disajikan dari `/var/www/atlas.orebit.id/tiles/` dengan dukungan `HTTP Range` dan header `Access-Control-Allow-Origin`.
- Setiap kandidat rilis produksi (`WP-18`) wajib lulus `bash ops/scripts/ci/local-ci.sh --full --write-receipt` pada commit `main` yang bersih dan mendapatkan persetujuan eksplisit `"ya"` dari pemilik untuk hash SHA256 artefak sebelum dipasang ke server produksi.
