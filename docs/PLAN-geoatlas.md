<!-- plan-status: open -->
# Orebit GeoAtlas TASKS — Antrean Kerja Tunggal Menuju Full Satu Indonesia & UI/UX 100/100

Status: OPEN · Diperbarui 21 November 2026. Gelombang A–E (`WP-01` s/d `WP-18` & `WP-20`) telah selesai (`DONE`) dan diarsipkan di [geoatlas-completed.md](geoatlas-completed.md). Berdasarkan [Audit Komprehensif Senior Geologist & UI/UX 21 Nov 2026](audits/audit-senior-geologist-uiux-2026-11-21.md), dibuka **Gelombang F & G (`WP-21` s/d `WP-28`)** untuk menyempurnakan atribusi lembar P3G 1:250.000, rincian litologi 2.096 unit, workstation penampang geologi bawah permukaan panoramik, workstation impor SHP UTM/WGS84, navigasi `Back`/`Northing Up`, dan optimasi seluler.

Satu-satunya antrean kerja terbuka Orebit GeoAtlas. Tugas yang telah selesai (`DONE`) dipindahkan ke [arsip penyelesaian](geoatlas-completed.md) beserta bukti commit dan tes. Kebutuhan produk ada di [PRD](PRD.md), kontrak teknis di [SPEC](SPEC.md).

## Mulai di Sini

| Kebutuhan | Dokumen |
|---|---|
| Keadaan sekarang dan satu langkah berikutnya | `ACTIVE CHECKPOINT` di [handover](handover/HANDOVER-geoatlas.md) |
| **Audit Senior Geologist & UI/UX (21 Nov 2026)** | [audit-senior-geologist-uiux-2026-11-21.md](audits/audit-senior-geologist-uiux-2026-11-21.md) |
| Audit 45 cek SPEC §6 | [Audit 21 Nov 2026](audits/audit-full-indonesia-uiux-2026-11-21.md) |
| **Work Package (WP-01..WP-28)** | [WORK-PACKAGES-geoatlas](handover/WORK-PACKAGES-geoatlas.md) · [Standar WP](runbooks/agent-work-packages.md) |
| **Orkestrasi cepat multi-agent** | [fast-local-orchestration.md](runbooks/fast-local-orchestration.md) |

---

## Antrean Tugas Terbuka (Gelombang F & G — 9 Tugas)

| ID | Prio | Status | Tugas | PRD/SPEC | Selesai bila |
|---|---|---|---|---|---|
| PIP-05 | P0 | OPEN | Ekstraksi `NM_LEMBAR`/`NAME_OF_SH` & `NO_LEMBAR` per poligon serta atribut mineral/lingkungan P3G 1:250.000 di pipeline | PRD §2, SPEC §2 | `01_ingest.py` → `04_edgematch.py` → `05_export.py` mempertahankan `sheet_name` lembar P3G per poligon dan `sources.csv` merujuk kompilasi P3G/PSG 1:250.000 (`WP-21`). |
| DAT-06 | P0 | OPEN | Pengisian `lith_detail` geologis baku untuk seluruh 2.096 unit nasional di `reference/units.csv` | PRD §2, SPEC §2.2 | `0` baris `units.csv` dengan `lith_detail` kosong; setiap unit menampilkan komposisi batuan spesifik (`WP-22`). |
| DAT-07 | P0 | OPEN | Penajaman presisi sub-kala stratigrafi ICS pada unit kompilasi 8 wilayah di `reference/units.csv` | PRD §2, SPEC §2.2 | Notasi sub-kala (`Tml`, `Tmm`, `Tmu`, `Tpl`, `Tol`, `Tel`, `TRJ`, `PTR`, `TQ`, `PC`) terpetakan ke rentang Ma spesifik dan lulus `validate_reference.py` (`WP-22`). |
| TOOL-04 | P0 | OPEN | Workstation Penampang Geologi Bawah Permukaan Panoramik (`A — A'`) dengan 3 horizon, patahan + *throw*, kontrol `VE (1×–10×)`, hover sinkron peta, dan ekspor `SVG`/`CSV` | PRD §2, SPEC §1 | `#transectPanel` merender penampang panoramik berlapis dengan arsiran litologi USGS, sesar miring, pemilih `VE`, marker hover sinkron di peta, dan tombol unduh `SVG` & `CSV` (`WP-23`). |
| TOOL-05 | P0 | OPEN | Workstation Impor SHP/GeoJSON/KML dengan reproyeksi otomatis UTM 46N–54S → WGS84, *drag-and-drop*, pin lokasi (`📍`), popup atribut `.dbf`, dan audit formasi | PRD §2, SPEC §1 | Impor `.zip`/`.shp` berkoordinat UTM maupun WGS84 langsung memindahkan kamera ke lokasi, menampilkan poligon + pin + atribut `.dbf`, dan merangkum formasi terpotong (`WP-24`). |
| UIX-06 | P0 | OPEN | Navigasi kamera `Back` (`#navBack`) & `Northing Up` (`#compassNorthBtn`) 2D/3D, pembersihan jargon internal (`auto_crosswalk.py`/`[AUTO]`), dan optimasi seluler | PRD §2, SPEC §3 | Tombol `Back` & `Northing Up` aktif di 2D/3D, tidak ada jargon `auto_crosswalk.py`/`[AUTO]` di DOM/About/Detail, dan layout seluler `375×812` optimal (`WP-25`). |
| TEST-03 | P0 | OPEN | Suite pengujian otomatis kontrak & Playwright E2E untuk reproyeksi UTM SHP, penampang geologi `VE`/SVG, bebas jargon internal, dan navigasi `Back`/`Northing Up` | PRD §2, SPEC §5 | `test_pipeline_contracts.py`, `test_app_contracts.mjs`, dan `test_browser_uiux.py` memverifikasi seluruh fitur Gelombang F dan lulus `local-ci.sh --full` (`WP-26`). |
| REL-02 | P0 | OPEN | Rebuild `all-v3.pmtiles` & `indonesia-units-index.json` 8 wilayah serta deploy produksi terverifikasi ke `https://atlas.orebit.id/` | PRD §2, SPEC §6 | `all-v3.pmtiles` dan `app/dist` terpasang di `orebit-vps2` dengan respons `HTTP/2 200` dan `HTTP/2 206` terverifikasi live (`WP-27`). |
| HUM-01 | P1 | BLOCKED | Uji usability representatif ≥5 peserta geolog/mahasiswa untuk skenario eksplorasi & penampang geologi GeoAtlas | PRD §2, SPEC §6 | Kit uji [hum-1-geoatlas.md](audits/hum-1-geoatlas.md) siap pakai; menunggu jadwal sesi peserta nyata oleh pemilik (`WP-19`). |
