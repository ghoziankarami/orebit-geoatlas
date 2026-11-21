<!-- plan-status: open -->
# Orebit GeoAtlas TASKS — Antrean Kerja Tunggal Menuju Full Satu Indonesia & UI/UX 100/100

Status: OPEN · Diperbarui 21 November 2026. Seluruh 26 tugas teknis dan pengujian (`WP-01` s/d `WP-17` & `WP-20`) telah selesai (`DONE`) dan dipindahkan ke [arsip penyelesaian](geoatlas-completed.md) dengan bukti lulus `local-ci.sh --full` (8/8 checks, termasuk Playwright E2E desktop & seluler ID/EN). Tersisa 2 tugas gerbang manusia/produksi (`REL-01` / `WP-18` dan `HUM-01` / `WP-19`) yang menunggu otorisasi dan jadwal pemilik.

Satu-satunya antrean kerja terbuka Orebit GeoAtlas. Tugas yang telah selesai (`DONE`) dipindahkan ke [arsip penyelesaian](geoatlas-completed.md) beserta satu baris bukti. Kebutuhan produk ada di [PRD](PRD.md), kontrak teknis dan rubrik 45 cek di [SPEC](SPEC.md).

## Mulai di Sini

| Kebutuhan | Dokumen |
|---|---|
| Keadaan sekarang dan satu langkah berikutnya | `ACTIVE CHECKPOINT` di [handover](handover/HANDOVER-geoatlas.md) |
| Audit 45 cek SPEC §6 | [Audit 21 Nov 2026](audits/audit-full-indonesia-uiux-2026-11-21.md) |
| **Work Package (WP)** | [WORK-PACKAGES-geoatlas](handover/WORK-PACKAGES-geoatlas.md) · [Standar WP](runbooks/agent-work-packages.md) |
| **Prompt eksekusi satu kali** | [PROMPT-close-all-tasks](handover/PROMPT-close-all-tasks.md) |

---

## Antrean Tugas Terbuka (2 Tugas Menunggu Otorisasi/Manusia)

| ID | Prio | Status | Tugas | PRD/SPEC | Selesai bila |
|---|---|---|---|---|---|
| REL-01 | P0 | BLOCKED | Rilis produksi nasional `indonesia.pmtiles` & deploy `atlas.orebit.id` di VPS dengan receipt | SPEC §6 | Runbook [deploy-atlas-vps.md](runbooks/deploy-atlas-vps.md) dan build produksi `app/dist` siap; menunggu persetujuan `"ya"` eksplisit pemilik untuk deploy ke server produksi `atlas.orebit.id`. Lihat [kartu REL-01](#rincian-rel-01). |
| HUM-01 | P0 | BLOCKED | Uji usability representatif ≥5 peserta geolog/mahasiswa untuk 5 tugas utama GeoAtlas | PRD §9, SPEC §6 | Kit uji [hum-1-geoatlas.md](audits/hum-1-geoatlas.md) siap pakai; menunggu jadwal sesi peserta nyata oleh pemilik. Lihat [kartu HUM-01](#rincian-hum-01). |

---

## Rincian Kartu Tugas Terbuka

<a id="rincian-rel-01"></a>
### REL-01 — Rilis produksi nasional `indonesia.pmtiles` & deploy `atlas.orebit.id` di VPS dengan receipt
- **Penghalang:** Menunggu konfirmasi `"ya"` dari pemilik untuk commit SHA dan checksum SHA256 `app/dist/index.html` sebelum mengeksekusi deploy ke VPS `atlas.orebit.id`.
- **Selesai bila:**
  1. Artefak `app/dist` dan `indonesia.pmtiles` dipasang di `atlas.orebit.id` sesuai [deploy-atlas-vps.md](runbooks/deploy-atlas-vps.md) dengan dukungan HTTP Range, CORS, dan verifikasi hash live.

<a id="rincian-hum-01"></a>
### HUM-01 — Uji usability representatif ≥5 peserta geolog/mahasiswa untuk 5 tugas utama GeoAtlas
- **Penghalang:** Membutuhkan ≥5 peserta manusia nyata (mahasiswa geologi / geolog eksplorasi).
- **Selesai bila:**
  1. Hasil ≥5 peserta menyelesaikan skenario T1–T5 tercatat di [hum-1-geoatlas.md](audits/hum-1-geoatlas.md) dengan waktu ≤3 menit dan keberhasilan ≥90%.
