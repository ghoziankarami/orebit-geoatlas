# Standar Kerja Agent — Work Package (WP), Pemisahan Eksekutor–Reviewer & Verifikasi Adaptif

Berlaku 21 November 2026 untuk seluruh sesi pengembangan di `orebit-geoatlas` (manusia maupun multi-agent). Standar ini mengatur **cara membagi, mengklaim, mengerjakan, membuktikan, me-review, dan menutup** pekerjaan menuju sasaran **Full Satu Indonesia (8 Wilayah) & UI/UX 100/100**. Aturan tertinggi tetap berada di [PIPELINE.md](../../PIPELINE.md) dan [AGENTS.md](../../AGENTS.md).

- Registry dan kartu WP GeoAtlas: [WORK-PACKAGES-geoatlas](../handover/WORK-PACKAGES-geoatlas.md)
- Gerbang G1–G8, otorisasi, dan prompt eksekusi satu kali: [PROMPT-close-all-tasks](../handover/PROMPT-close-all-tasks.md)
- Panduan CI lokal cepat & orkestrasi paralel: [fast-local-orchestration](fast-local-orchestration.md)
- CLI: `python3 ops/scripts/agents/wp.py {check|status|next|wave|brief|fast-test|workflow|prompt|review}`

---

## 1. Prinsip Utama

1. **Satu Sumber per Fakta:**
   - [PRD](../PRD.md) = apa dan mengapa.
   - [SPEC](../SPEC.md) = kontrak teknis, skema 8 wilayah, tata letak anti-tabrakan, dan rubrik kualitas 45 cek.
   - [TASKS](../PLAN-geoatlas.md) = daftar tugas terbuka dan kriteria penerimaannya.
   - [WORK-PACKAGES](../handover/WORK-PACKAGES-geoatlas.md) = pengelompokan tugas ke branch, lane, risk, model, dan DoD.
2. **Satu WP = Satu Branch = Satu Lane Bebas Konflik:** Setiap WP berukuran terfokus (≤ 5–8 berkas terkait) dengan Definition of Done (DoD) biner yang memiliki bukti bernama.
3. **Pemisahan Peran (Eksekutor T1 vs Reviewer Read-Only T2/T3 — Harness-Agnostic):**
   - **Eksekutor (`T1`):** Model cepat/ekonomis yang tersedia di harness aktif (Gemini, Claude, Codex, CommandCode, Antigravity, dll. — mis. `deepseek-flash` / `gpt-luna-6` / `flash`). Mengerjakan kode/data sesuai kartu WP, menjalankan `bash ops/scripts/ci/local-ci.sh --fast` dan `python3 ops/scripts/agents/wp.py fast-test WP-NN`, serta menutup G8 di branch WP.
   - **Reviewer (`T2/T3`):** **Model/sesi BERBEDA** dari eksekutor pada harness aktif (mis. `claude-sonnet-5-5` / `claude-opus-5-5` / `gpt-sol-6-1` / `pro`). Memeriksa diff (`git diff base..head`), bukti DoD, dan hasil tes secara **read-only** (tanpa mengedit berkas dan tanpa melakukan merge), lalu menulis verdict `PASS` atau `NEEDS_FIX` via tool `wp.py verdict` atau komentar PR (maksimal 2 siklus perbaikan sebelum eskalasi ke pemilik). **Reviewer BUKAN akun GitHub manusia baru dan BUKAN collaborator tambahan.**
   - **Anti Self-Approve:** Eksekutor **DILARANG** menulis verdict `PASS` untuk pekerjaannya sendiri. Verdict `PASS` **WAJIB** berasal dari reviewer (sesi/model berbeda). Kalau belum ada reviewer independen, WP tetap berstatus `review`, bukan `selesai`. Merge no-PR tetap mensyaratkan verdict `PASS` dari reviewer independen (bukan *self-declared*).
   - **Merger (`pemilik`):** Mengintegrasikan branch yang telah `PASS` ke `main` dan mengotorisasi deploy produksi ke `atlas.orebit.id`.

---

## 2. Pembagian Lane File di `orebit-geoatlas`

Dua WP yang berjalan secara paralel pada satu gelombang **tidak boleh berbagi lane yang sama** (kecuali `HUMAN`):

| Lane | Berkas Utama yang Dikuasai |
|---|---|
| `DATA` | `reference/sources.csv`, `reference/crosswalk.csv`, `reference/units.csv`, `reference/ics_intervals.csv`, `reference/lithology.csv` |
| `PIPE` | `pipeline/*.py`, `pipeline/06_tile.sh`, `Makefile` (bagian pipeline/index) |
| `SEARCH` | `app/src/search.ts`, bagian kotak pencarian di `app/index.html` & `app/src/style.css` |
| `MAP` | `app/src/layers.ts`, `app/src/state.ts`, `app/src/config.ts` (konfigurasi basemap/tile) |
| `UIX` | `app/src/legend.ts`, `app/src/timescale.ts`, `app/src/coords.ts`, `app/src/style.css`, `app/src/i18n.ts`, `app/src/about.ts` |
| `TOOLS` | `app/src/detail.ts`, `app/src/transect.ts`, fungsi ekspor PNG/PDF/GeoJSON di `app/src/main.ts` |
| `TEST` | `tests/**`, `ops/scripts/ci/local-ci.sh` |
| `DOCS` | `docs/**` (di luar baris bersama TASKS/arsip/checkpoint), `README.md` |
| `REL` | `.github/workflows/**`, `docs/runbooks/deploy-atlas-vps.md`, skrip rilis/deploy |
| `HUMAN` | Sesi uji usability peserta nyata (`HUM-01`); tidak mengunci berkas source |

Berkas bersama yang boleh diperbarui oleh setiap WP pada langkah penutupan G8: baris tugas milik WP tersebut di `docs/PLAN-geoatlas.md`, penambahan baris di akhir `docs/geoatlas-completed.md`, dan `## ACTIVE CHECKPOINT` di `docs/handover/HANDOVER-geoatlas.md`.

---

## 3. Klasifikasi Risiko, Verifikasi Minimum & Jejak Merge

| Risiko | Verifikasi Minimum | Integrasi |
|---|---|---|
| `LOW` | Guard dokumen & registry (`check-docs.py`, `check-plan-registry.py`, `wp.py check`) + cek terarah (`G6` / `G3`) | PR opsional (no-PR merge tetap cepat) |
| `MEDIUM` | Build aplikasi (`cd app && npm run build`), tes kontrak (`test_app_contracts.mjs`), dan tes browser Playwright terarah (`test_browser_uiux.py`) bila menyentuh UI | PR opsional (no-PR merge tetap cepat) |
| `HIGH` | `bash ops/scripts/ci/local-ci.sh --fast` + seluruh tes terarah di kartu WP (`test_pipeline_contracts.py`, `test_app_contracts.mjs`, `test_browser_uiux.py`) + review independen T2/T3 | PR disarankan / verdict reviewer wajib |
| `RELEASE` | `bash ops/scripts/ci/local-ci.sh --full --write-receipt` pada kandidat exact-SHA + persetujuan eksplisit pemilik (`pemilik`) | PR wajib |

**Jejak progres no-PR merge (terbaca mesin):**
- Setiap merge no-PR **WAJIB** menggunakan format commit message `Merge WP-NN: <judul>` agar terbaca mesin di riwayat `main`.
- Merge no-PR tetap mensyaratkan verdict `PASS` dari reviewer independen (model/sesi berbeda, bukan *self-declared*).
- Setiap WP yang selesai **WAJIB** memiliki satu baris bukti di [arsip penyelesaian](../geoatlas-completed.md) dan pembaruan `## ACTIVE CHECKPOINT` di [HANDOVER-geoatlas.md](../handover/HANDOVER-geoatlas.md).

---

## 4. Format Kartu WP Wajib

Setiap WP di [WORK-PACKAGES-geoatlas.md](../handover/WORK-PACKAGES-geoatlas.md) memiliki bagian `### WP-NN — <judul>` dengan 6 label wajib yang divalidasi oleh `python3 ops/scripts/agents/wp.py check`:
- `**Tujuan:**`
- `**Lingkup file:**` (wajib menyebut nama branch persis seperti di tabel registry)
- `**Langkah:**`
- `**Selesai bila (DoD):**`
- `**Tes:**`
- `**STOP-TANYA:**`
