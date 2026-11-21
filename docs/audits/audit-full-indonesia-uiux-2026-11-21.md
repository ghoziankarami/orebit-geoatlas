# Audit Menyeluruh Orebit GeoAtlas — Menuju Aplikasi Penuh Satu Indonesia & UI/UX 100/100

| Metadata Audit | |
|---|---|
| Tanggal | 21 November 2026 |
| Repositori | `ghoziankarami/orebit-geoatlas` (`HEAD: faed4d7`) |
| Lingkup | Pipeline data geologi nasional (`pipeline/`, `reference/`), aplikasi web interaktif (`app/`), arsitektur UI/UX desktop & seluler, pengujian otomatis, dan sistem tata kelola WP/PRD/SPEC |
| Pemilik | Ghozian Islam Karami / Orebit |
| Status Awal | Prototype regional (Bangka-Belitung + auto-Sumatra), skor kualitas indikatif **36/100** (17/45 cek) |
| Status Terkini (21 Nov 2026) | **Full Satu Indonesia (8 Wilayah, 562 unit terindeks)** — **43/45 cek teknis & otomatis LULUS** (`local-ci.sh --full --write-receipt` PASS); tersisa 2 cek gerbang pemilik (`REL-01` deploy produksi & `HUM-01` uji peserta manusia) |
| Target | **Aplikasi Geologi Nasional Full Satu Indonesia (8 Wilayah) + UI/UX 100/100 (45/45 cek rubrik SPEC §6)** |

---

## 1. Ringkasan Eksekutif: Mengapa GeoAtlas Saat Ini Masih Terasa "Prototype / Inti Tanggung"

Berdasarkan pemeriksaan kode sumber (`app/src/*.ts`, `app/src/style.css`, `pipeline/*.py`, `reference/*.csv`), Orebit GeoAtlas memiliki fondasi arsitektur yang tepat (MapLibre GL JS + PMTiles tanpa server + pipeline Python/GeoPandas/tippecanoe), tetapi **berhenti di tengah jalan antara proof-of-concept (PoC) dan aplikasi geologi produksi**:

1. **Cakupan Data Baru 2 dari 8 Wilayah Indonesia & Kualitas Atribut Belum Terkontrol**:
   - `pipeline/00_fetch_esdm.py` hanya mendefinisikan `REGION_BBOX` untuk `babel` dan `sumatra`. Enam wilayah utama lainnya — **Jawa & Madura (`jawa`)**, **Bali & Nusa Tenggara (`balinusra`)**, **Kalimantan (`kalimantan`)**, **Sulawesi (`sulawesi`)**, **Kepulauan Maluku (`maluku`)**, dan **Papua (`papua`)** — belum ada di pipeline maupun `reference/`.
   - Di Sumatra, 470 dari 479 unit dibuat oleh `auto_crosswalk.py` dengan deskripsi `[AUTO]` tanpa kolom `confidence` / `review_status` terstruktur di `units.csv`, dan `AGE_MAP` belum mengenali istilah umur penting ESDM (epoch Kenozoikum seperti *Miosen*, *Pliosen*, *Oligosen*, *Eosen*, *Paleosen*, *Plistosen*, *Holosen*, maupun *Tersier*, *Kapur Akhir/Awal*, *Devon*, *Silur*, *Prakambrium*).
   - Tiga konflik geologi nyata yang sudah ditemukan di `docs/audit-validasi-geologi.md` (`TRJKG` Granit Klabat masih tertulis Jura saja `143.1–201.4 Ma` padahal Trias–Jura; `PUK` Formasi Kluet tertulis Trias tanpa status konflik; `PCKS1`/`PCTM`/`PCSV` Belitung disempitkan jadi `metamorphic` filit/sekis) **belum diperbaiki di `reference/units.csv`**.
   - Layer garis struktur (`lines.geojsonl`: sesar, antiklin, sinklin, kontak) **sama sekali tidak ditarik** oleh `00_fetch_esdm.py` dari layanan ESDM, sehingga toggle *"Tampilkan sesar dan kontak"* pada layer Orebit kosong kecuali ada shapefile lokal.
   - `02_validate.py`, `04_edgematch.py`, dan `inventory.py` memakai `u.to_crs(u.estimate_utm_crs())` untuk menghitung luas dan buffer sambungan. Untuk pulau besar lintas banyak zona UTM (Sumatra, Kalimantan, Papua, atau gabungan `all` satu Indonesia 95°BT–141°BT), satu zona UTM tunggal mendistorsi luas dan buffer secara signifikan.

2. **Pencarian & Eksplorasi Peta Lumpuh di Zoom Nasional**:
   - `app/src/search.ts` mencari formasi dengan `map.querySourceFeatures("orebit", { sourceLayer: "units" })`. Karena layer `ob-units` baru dimuat pada `minzoom: 7.5`, **pencarian formasi dari tampilan awal Indonesia (zoom 4.2) selalu mengembalikan 0 hasil untuk data ESDM/Orebit**!
   - Pengguna tidak bisa mencari berdasarkan simbol peta (mis. `Tmpm1`, `TRJkg`, `Qvt`), litologi, umur, atau pulau.
   - Input pencarian hanya merespons tombol `Enter` (`submit`), tanpa *live typeahead/autocomplete*, tanpa tombol hapus (`×`), dan tanpa navigasi keyboard (`ArrowUp`/`ArrowDown`/`Enter`).
   - Tidak ada **Navigasi Cepat Pulau/Wilayah (Island Quick-Jump)** atau indikator cakupan wilayah di layar awal.

3. **Bug Layout Kritis (Tabrakan Panel) & Kontrol Pasif**:
   - **Tabrakan Desktop (`style.css:126` vs `style.css:173`)**: Panel detail unit `.detail` ditempatkan di `top: 12px; right: 64px; width: 340px` (area `64px` s/d `404px` dari tepi kanan), sedangkan grup kontrol peta `.map-ctrls` berada di `top: 14px; right: 14px` dengan lebar `74+40+104+48+18 = 284px` (area `14px` s/d `298px` dari tepi kanan). Akibatnya, **setiap kali pengguna mengklik unit geologi di desktop, panel detail bertabrakan langsung dengan tombol Zoom, Locate, 2D/3D, dan Tools**!
   - **Legenda & Kolom Stratigrafi Pasif (`legend.ts`)**: Kolom stratigrafi ICS dan daftar kelas litologi hanya merender `<li>` statis. Pengguna tidak bisa mengklik periode/epoch (mis. *Neogen* atau *Kapur*) atau kelas litologi (mis. *Vulkanik* atau *Karbonat*) untuk memfilter peta secara interaktif.
   - **Slider Umur Linear 0–600 Ma Sulit Dipakai (`main.ts:414`)**: Lebih dari 70% batuan permukaan Indonesia berumur Kenozoikum (0–66 Ma), yang hanya menempati **11% lebar slider** (sekitar 30 piksel). Menggeser 1 piksel melompat 2–3 juta tahun, sehingga mustahil memilih Holosen, Plistosen, Miosen, atau Paleogen secara presisi tanpa **chip preset era** (*Semua*, *Kuarter*, *Kenozoikum*, *Mesozoikum*, *Paleozoikum*) atau skala non-linear/input angka.
   - **Bottom Sheet Seluler Terlalu Minim Saat Tertutup (`style.css:257`)**: Saat `panel.collapsed` (tinggi 48px), seluruh nama aplikasi, kotak pencarian, dan status filter hilang; pengguna hanya melihat garis abu-abu di bawah layar.

4. **Absennya Alat Kerja Geolog (Workstation Tools)**:
   - Tidak ada **pembacaan koordinat kursor & elevasi live** (Lat/Lon, Zona UTM, Zoom, skala, tombol salin titik/pin lokasi).
   - Tidak ada **alat ukur jarak & penampang/transek geologi cepat (Measure & Geological Strip Transect)** yang menampilkan urutan formasi yang dipotong oleh garis ukur.
   - Tidak ada **pemilih peta dasar (Basemap Switcher)** (Terang/Positron, Gelap/Dark Matter, Topografi/Relief) yang mudah diakses, serta tidak ada filter visual berdasarkan tingkat kurasi (*Terverifikasi*, *Auto-harmonisasi*, *Macrostrat*).
   - Tidak ada fitur **Unduh GeoJSON Unit**, **hitungan luas unit (km²)**, **bar posisi stratigrafi visual**, maupun **tombol Laporkan Koreksi Unit** di kartu detail.

5. **Belum Ada Sistem Pengujian Otomatis & Tata Kelola WP/Eksekutor-Reviewer**:
   - `app/package.json` tidak memiliki satupun unit test atau Playwright browser test.
   - `README.md` menyebut `cp app/.env.example app/.env`, namun file `app/.env.example` tidak ada di repositori.
   - Belum memiliki sistem `AGENTS.md`, `PIPELINE.md`, `docs/PRD.md` lengkap, `docs/SPEC.md` (kontrak + rubrik 45 cek), `docs/PLAN-geoatlas.md` (antrean tunggal TASKS), `docs/handover/WORK-PACKAGES-geoatlas.md`, dan CLI `ops/scripts/agents/wp.py` + `ops/scripts/ci/local-ci.sh` seperti `orebit-ops`.

---

## 2. Penilaian Baseline 9 Dimensi Rubrik Kualitas (45 Cek Biner)

Mengikuti standar rubrik kualitas Orebit (`SPEC §10`: 9 dimensi × 5 cek biner, parsial = 0):

| Dimensi | Bobot | Lulus Saat Ini | Skor Dimensi | Gap Utama yang Harus Ditutup Menuju 100/100 |
|---|---:|---:|---:|---|
| 1. UI/UX & Tata Letak | 20 | 1/5 | 20 | Tabrakan `.detail` vs `.map-ctrls` di desktop; bottom sheet 3-snap seluler; chip pulau quick-jump; legenda klik-untuk-filter; preset era pada filter umur |
| 2. Cakupan & Kualitas Data Nasional | 15 | 1/5 | 20 | Baru 2/8 region; 6 region baru (`jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`); perbaikan `TRJKG`/`PUK`/`PCKS1`; kolom `confidence`; layer struktur ESDM |
| 3. Pencarian & Eksplorasi Geologi | 15 | 1/5 | 20 | Indeks statis nasional (`indonesia-units-index.json`) agar bisa cari dari zoom 4; live typeahead + keyboard nav; cari simbol/formasi/litologi/umur |
| 4. Alat Geolog & Ekspor | 10 | 2/5 | 40 | Koordinat/UTM bar; alat ukur jarak + profil lintasan formasi (transect strip); ekspor GeoJSON unit; tombol laporan koreksi terisi otomatis |
| 5. Stabilitas & State Peta | 10 | 3/5 | 60 | Penanganan tile offline/gagal muat (`pmtiles` error state); sinkronisasi URL hash lengkap (termasuk filter litologi, basemap, unit terpilih, pin koordinat) |
| 6. Arsitektur & Pipeline | 10 | 3/5 | 60 | CRS Equal-Area (`EPSG:6933`) untuk luas nasional; generator indeks pencarian di `05_export.py` / `combine`; orkestrasi `make tiles-indonesia` |
| 7. Performa | 10 | 3/5 | 60 | Lazy load indeks pencarian; batas ukuran tile `<500 KB`; debounce pencarian & filter peta; optimasi render canvas ekspor resolusi tinggi |
| 8. Pengujian & Verifikasi | 5 | 1/5 | 20 | Suite known-answer pipeline + suite Playwright desktop (1366×768) & mobile (375×812) EN/ID + `local-ci.sh` exact-SHA receipt |
| 9. Aksesibilitas & Keamanan | 5 | 2/5 | 40 | Navigasi keyboard penuh pada legenda, pencarian, dan kontrol peta; fokus dialog; kontras WCAG 2.2 AA; CSP & sanitasi atribut |
| **Total Terbobot** | **100** | **17/45** | **36/100** | **Target: 45/45 cek lulus (100/100)** |

---

## 3. Rencana Transformasi Menuju Full Satu Indonesia & UI/UX 100/100

Transformasi dibagi menjadi **20 Work Packages (`WP-01` s/d `WP-20`)** yang menutup **26 Tugas (`TASKS`)** dalam **5 Gelombang Paralel (Wave A–E)**:

1. **Gelombang A — Fondasi Pipeline Nasional, Perbaikan Audit Geologi & Tata Letak Anti-Tabrakan**:
   - `WP-01` (`DATA`): Koreksi audit geologi (`TRJKG`, `PUK`, `PCKS1`, `PCTM`, `PCSV`), perluas skema `units.csv` & `crosswalk.csv` dengan kolom `confidence` (`curated`, `auto`, `flagged`), dan perluas `AGE_MAP` + `LITH_RULES` di `auto_crosswalk.py` untuk seluruh terminologi stratigrafi Indonesia.
   - `WP-02` (`PIPE`): Dukungan 8 wilayah nasional di `00_fetch_esdm.py` (`sumatra`, `babel`, `jawa`, `balinusra`, `kalimantan`, `sulawesi`, `maluku`, `papua`) + penarikan layer struktur/sesar ESDM + perhitungan luas Equal-Area (`EPSG:6933`) lintas zona UTM + generator katalog indeks unit nasional (`indonesia-units-index.json`).
   - `WP-03` (`UIX`): Perbaiki tabrakan layout desktop (`.detail` vs `.map-ctrls`), tata ulang topbar/toolbar kanan dan drawer detail, tambahkan `app/.env.example`, dan hadirkan bar pembacaan koordinat live (Lat/Lon, Zona UTM, Zoom, skala).
   - `WP-04` (`DOCS`): Dokumentasi panduan kurasi nasional 8 wilayah dan metodologi tingkat kepercayaan (`curated` vs `auto` vs `flagged`).

2. **Gelombang B — Akuisisi & Harmonisasi Data Geologi 8 Wilayah Indonesia + Pencarian Nasional**:
   - `WP-05` (`DATA`): Akuisisi, inventarisasi, dan harmonisasi data geologi wilayah **Jawa & Madura (`jawa`)** serta **Bali & Nusa Tenggara (`balinusra`)**.
   - `WP-06` (`DATA`, setelah `WP-05` di lane `DATA` atau digabung per pulau): Akuisisi, inventarisasi, dan harmonisasi wilayah **Kalimantan (`kalimantan`)** dan **Sulawesi (`sulawesi`)**.
   - `WP-07` (`DATA`): Akuisisi, inventarisasi, dan harmonisasi wilayah **Maluku (`maluku`)** dan **Papua (`papua`)**, serta build gabungan `indonesia.pmtiles` + `indonesia-units-index.json`.
   - `WP-08` (`SEARCH`): Mesin pencarian nasional instan (live debounced typeahead, pencarian formasi/simbol/litologi/umur di seluruh Indonesia dari zoom berapapun memakai `indonesia-units-index.json` + fallback viewport + Nominatim, navigasi keyboard `ArrowUp`/`ArrowDown`/`Enter`/`Escape`, tombol clear).
   - `WP-09` (`MAP`): Basemap switcher (*Positron Terang*, *Dark Gelap*, *Relief Topografi*), filter tingkat kurasi (*Semua*, *Terkurasi*, *Perlu Tinjauan*), dan penanganan status muat PMTiles/offline yang tangguh.

3. **Gelombang C — Interaktivitas UI/UX 100/100 & Alat Kerja Geolog**:
   - `WP-10` (`UIX`): Kolom stratigrafi & legenda litologi interaktif (klik periode/epoch untuk memfilter rentang umur, klik kelas litologi untuk memfilter litologi di peta, badge filter aktif + tombol *Reset Filter*), ditambah **chip preset era** (*Semua*, *Kuarter*, *Kenozoikum*, *Mesozoikum*, *Paleozoikum*, *Prakambrium*) & input numerik pendamping slider umur.
   - `WP-11` (`UIX`): Navigasi cepat 8 Kepulauan Indonesia (*Island Quick-Jump Bar*: Sumatra, Babel, Jawa, Bali–Nusra, Kalimantan, Sulawesi, Maluku, Papua) dengan indikator status data & fly-to mulus + bottom sheet seluler 3-snap-point (*Peek*, *Half*, *Full*) yang tetap menampilkan pencarian dan chip aktif saat tertutup.
   - `WP-12` (`TOOLS`): Panel detail unit generasi baru — bar posisi stratigrafi visual, estimasi luas poligon (km²), badge tingkat kepercayaan data (`Terkurasi`, `Otomatis`, `Catatan Audit`), tombol **Unduh GeoJSON Unit**, tombol **Salin Koordinat/Tautan Spesifik Unit**, dan tombol **Laporkan Koreksi Unit** (membuka template GitHub Issue terisi otomatis).
   - `WP-13` (`TOOLS`): Alat **Ukur Jarak, Azimuth & Profil Lintasan Geologi (Geological Transect Strip)** — klik 2+ titik di peta untuk mengukur jarak (km) dan melihat pita urutan formasi/umur/litologi yang dipotong sepanjang garis lintasan.

4. **Gelombang D — Ekspor Publikasi, Aksesibilitas WCAG 2.2 AA, Performa & Suite Tes Otomatis**:
   - `WP-14` (`TOOLS`): Peningkatan ekspor PNG & PDF kualitas publikasi (kompas arah utara, skala bar grafis, koordinat bounding box, daftar filter aktif, atribusi sumber per wilayah yang tampil).
   - `WP-15` (`UIX`): Aksesibilitas penuh WCAG 2.2 AA (navigasi keyboard seluruh kontrol, fokus dialog, `aria-live`, `prefers-reduced-motion`, kontras warna, target sentuh `≥44×44 px` di ponsel) dan paritas lokalisasi ID/EN 100%.
   - `WP-16` (`TEST`): Suite pengujian otomatis lengkap — tes unit pipeline & skema (`tests/test_pipeline_contracts.py`), tes unit state/search/timescale (`tests/test_app_contracts.mjs`), dan suite Playwright browser E2E desktop (1366×768) & mobile (375×812) EN/ID (`tests/test_browser_uiux.py`) yang terintegrasi ke `ops/scripts/ci/local-ci.sh`.

5. **Gelombang E — Sertifikasi Exact-Source, Deploy Nasional `atlas.orebit.id` & Penutupan 100/100**:
   - `WP-17` (`TEST`): Sertifikasi exact-source `local-ci.sh --full --write-receipt` + bukti mutasi data & regresi visual desktop/mobile.
   - `WP-18` (`REL`): Paket rilis nasional `indonesia.pmtiles` + deploy produksi ke VPS `atlas.orebit.id` dengan verifikasi HTTP Range, CORS, dan hash receipt.
   - `WP-19` (`HUMAN`): Uji usability representatif (`HUM-1` ≥5 peserta geolog/mahasiswa menyelesaikan 5 tugas pencarian, filter stratigrafi, lintasan transek, dan ekspor PDF dalam ≤3 menit).
   - `WP-20` (`DOCS`): Audit akhir 45 cek SPEC §10 (100/100) dan penutupan parent `UX-ATLAS-100`.
