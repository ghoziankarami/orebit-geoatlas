# Indeks dan Registry Dokumen — Orebit GeoAtlas

Semua berkas di bawah `docs/` terdaftar pada tabel `docs-registry` di bawah ini dan diperiksa oleh `python3 ops/scripts/guards/check-docs.py`.

Kelas dokumen yang diizinkan:
- `operasional`: panduan kerja aktif, runbook, dan handover (`ACTIVE CHECKPOINT` tunggal).
- `rencana`: PRD, SPEC, antrean TASKS (`PLAN-*.md`), dan registry Work Packages.
- `log`: arsip penyelesaian tugas (`geoatlas-completed.md`).
- `desain`: dokumen kurasi dan spesifikasi desain.
- `bukti`: laporan audit geologi, audit UI/UX, dan hasil uji usability.

## Registry dokumen

<!-- BEGIN docs-registry -->
| Path | Kelas | Keterangan |
|---|---|---|
| `docs/README.md` | operasional | Indeks dan registry dokumen `docs/` yang divalidasi oleh `check-docs.py` |
| `docs/PRD.md` | rencana | Product Requirements Document Orebit GeoAtlas Full Satu Indonesia v2.0 |
| `docs/SPEC.md` | rencana | Spesifikasi Teknis, Kontrak Skema 8 Wilayah, Kontrak UI/UX, dan Rubrik Kualitas 45 Cek |
| `docs/PLAN-geoatlas.md` | rencana | Satu-satunya antrean tugas terbuka (`TASKS`) menuju Full Satu Indonesia & UI/UX 100/100 |
| `docs/geoatlas-completed.md` | log | Arsip tugas yang telah selesai (`DONE`) beserta bukti commit dan tes |
| `docs/DEVELOPMENT.md` | operasional | Panduan pengembangan & kontribusi publik |
| `docs/kurasi-crosswalk.md` | desain | Panduan kurasi crosswalk 8 wilayah nasional dan aturan tingkat kepercayaan (`confidence`) |
| `docs/audit-validasi-geologi.md` | bukti | Audit silang validasi sumber geologi dan publikasi pembanding (Granit Klabat, Kluet, Kelapa Kampit) |
| `docs/audits/` | bukti | Direktori laporan audit menyeluruh UI/UX, data nasional, dan rekaman uji usability (`HUM-01`) |
| `docs/handover/HANDOVER-geoatlas.md` | operasional | Dokumen handover operasional yang memuat satu-satunya `## ACTIVE CHECKPOINT` |
| `docs/handover/WORK-PACKAGES-geoatlas.md` | rencana | Registry dan kartu Work Package (`WP-01`..`WP-20`) untuk eksekutor T1 dan reviewer T2/T3 |
| `docs/handover/PROMPT-close-all-tasks.md` | operasional | Prompt eksekusi satu kali (gerbang G1–G8, tabel closing 28 tugas, dan loop multi-agent) |
| `docs/runbooks/agent-work-packages.md` | operasional | Standar kerja Work Package, pemisahan peran Eksekutor–Reviewer, lane, dan Definition of Done |
| `docs/runbooks/fast-local-orchestration.md` | operasional | Panduan CI lokal cepat (`local-ci.sh`), micro-brief hemat token (`wp.py brief`), dan wave paralel |
| `docs/runbooks/deploy-atlas-vps.md` | operasional | Runbook deploy produksi `atlas.orebit.id` dan verifikasi HTTP Range / SHA256 |
<!-- END docs-registry -->
