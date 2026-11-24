<!-- plan-status: open -->
# Orebit GeoAtlas TASKS — Antrean Kerja Tunggal Menuju Full Satu Indonesia & UI/UX 100/100

Status: OPEN · Diperbarui 23 November 2026. Gelombang H (`WP-28` s/d `WP-35`) dibuka dari [Audit Produksi & Lapangan 23 Nov 2026](audits/audit-produksi-lapangan-2026-11-23.md): pemasangan PWA di HP, foto lapangan pada waypoint, Paket Lapangan `.zip` yang bisa dibuka kembali, geologi offline, coverage tes, dan smoke produksi. Gelombang A–E (`WP-01` s/d `WP-18` & `WP-20`) telah selesai (`DONE`) dan diarsipkan di [geoatlas-completed.md](geoatlas-completed.md). Berdasarkan [Audit Komprehensif Senior Geologist & UI/UX 21 Nov 2026](audits/audit-senior-geologist-uiux-2026-11-21.md), dibuka **Gelombang F & G (`WP-21` s/d `WP-28`)** untuk menyempurnakan atribusi lembar P3G 1:250.000, rincian litologi 2.096 unit, workstation penampang geologi bawah permukaan panoramik, workstation impor SHP UTM/WGS84, navigasi `Back`/`Northing Up`, dan optimasi seluler.

Satu-satunya antrean kerja terbuka Orebit GeoAtlas. Tugas yang telah selesai (`DONE`) dipindahkan ke [arsip penyelesaian](geoatlas-completed.md) beserta bukti commit dan tes. Kebutuhan produk ada di [PRD](PRD.md), kontrak teknis di [SPEC](SPEC.md).

## Mulai di Sini

| Kebutuhan | Dokumen |
|---|---|
| Keadaan sekarang dan satu langkah berikutnya | `ACTIVE CHECKPOINT` di [handover](handover/HANDOVER-geoatlas.md) |
| **Audit Produksi & Lapangan (23 Nov 2026)** | [audit-produksi-lapangan-2026-11-23.md](audits/audit-produksi-lapangan-2026-11-23.md) |
| **Audit Senior Geologist & UI/UX (21 Nov 2026)** | [audit-senior-geologist-uiux-2026-11-21.md](audits/audit-senior-geologist-uiux-2026-11-21.md) |
| Audit 45 cek SPEC §6 | [Audit 21 Nov 2026](audits/audit-full-indonesia-uiux-2026-11-21.md) |
| **Work Package (WP-01..WP-35)** | [WORK-PACKAGES-geoatlas](handover/WORK-PACKAGES-geoatlas.md) · [Standar WP](runbooks/agent-work-packages.md) |
| **Orkestrasi cepat multi-agent** | [fast-local-orchestration.md](runbooks/fast-local-orchestration.md) |

---

## Antrean Tugas Terbuka (HUM-01 — 1 Tugas Manusia)

| ID | Prio | Status | Tugas | PRD/SPEC | Selesai bila |
|---|---|---|---|---|---|
| HUM-01 | P1 | BLOCKED | Uji usability representatif ≥5 peserta geolog/mahasiswa untuk skenario eksplorasi & penampang geologi GeoAtlas | PRD §2, SPEC §6 | Kit uji [hum-1-geoatlas.md](audits/hum-1-geoatlas.md) siap pakai; menunggu jadwal sesi peserta nyata oleh pemilik (`WP-19`). |
