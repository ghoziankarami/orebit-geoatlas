# Fast Local CI & Multi-Agent Wave Orchestration — Orebit GeoAtlas

Panduan operasional cepat untuk menjalankan antrean Work Package (WP) di `orebit-geoatlas` dengan biaya token minimal, verifikasi CI lokal cepat (`local-ci.sh`), serta orkestrasi paralel Eksekutor T1 (`flash`) dan Reviewer Read-Only T2/T3 (`pro`).

## 1. Arsitektur Efisiensi Token & Kecepatan Verifikasi

| Komponen | Cara Kerja | Manfaat |
|---|---|---|
| **Micro-Brief (`wp.py brief WP-NN`)** | Mengekstrak hanya aturan inti, `ACTIVE CHECKPOINT`, kartu `WP-NN`, dan kartu `#rincian-<id>` terkait (~3–5 KB, 0 token LLM) | Menghemat >90% token konteks dibanding membaca seluruh dokumen repo di tiap subagent |
| **Fast Local CI (`local-ci.sh --fast`)** | Menjalankan guard dokumen, plan-registry, WP policy, validasi CSV referensi, kontrak pipeline, kontrak aplikasi, dan `npm run build` dalam ~8–15 detik | Umpan balik instan bagi eksekutor sebelum meminta review |
| **Full Local CI (`local-ci.sh --full --write-receipt`)** | Menambahkan suite Playwright E2E desktop (`1366×768`) & seluler (`375×812`) ID/EN serta menulis receipt `.tmp-tier-receipts/local-ci-<SHA>.json` ber-digest SHA256 | Sertifikasi exact-source di akhir gelombang dan kandidat rilis |
| **Wave Planner (`wp.py wave` & `wp.py workflow`)** | Memilih kumpulan WP `SIAP` yang memiliki lane berbeda (`DATA`, `PIPE`, `UIX`, `SEARCH`, `MAP`, `TOOLS`, `DOCS`, `TEST`) dan membangkitkan skrip Python `run_workflow` siap eksekusi | Menjalankan N eksekutor + N reviewer independen secara paralel dengan auto-fix terarah (maks 2 siklus) |

---

## 2. Perintah Harian

```bash
# 1. Validasi seluruh registry dokumen, plan, dan work packages
python3 ops/scripts/guards/check-plan-registry.py
python3 ops/scripts/guards/check-docs.py
python3 ops/scripts/agents/wp.py check

# 2. Lihat gelombang paralel yang siap dijalankan sekarang
python3 ops/scripts/agents/wp.py wave

# 3. Bangkitkan micro-brief hemat token untuk Eksekutor atau Reviewer
python3 ops/scripts/agents/wp.py brief WP-01 --role executor
python3 ops/scripts/agents/wp.py brief WP-01 --role reviewer --base main --head HEAD

# 4. Jalankan tes terarah milik satu WP saja
python3 ops/scripts/agents/wp.py fast-test WP-01 --list
python3 ops/scripts/agents/wp.py fast-test WP-01

# 5. Jalankan CI lokal cepat (~10 detik) atau sertifikasi penuh + receipt exact-SHA
bash ops/scripts/ci/local-ci.sh --fast
bash ops/scripts/ci/local-ci.sh --full --write-receipt

# 6. Bangkitkan skrip Antigravity run_workflow untuk satu gelombang paralel
python3 ops/scripts/agents/wp.py workflow WP-01 WP-02 WP-03 WP-04 --exec-model flash --review-model pro
```

---

## 3. Alur Orkestrasi 5 Gelombang (`WP-01` s/d `WP-20`)

1. **Gelombang A (Paralel 4 Lane — `DATA`, `PIPE`, `UIX`, `DOCS`):**
   `python3 ops/scripts/agents/wp.py workflow WP-01 WP-02 WP-03 WP-04 --exec-model flash --review-model pro`
2. **Gelombang B (Data Nasional 8 Wilayah + Pencarian & Peta — `DATA`, `SEARCH`, `MAP`):**
   - Paralel tahap B1: `WP-05` (`DATA`), `WP-08` (`SEARCH`), `WP-09` (`MAP`)
   - Tahap B2: `WP-06` (`DATA`: Kalimantan & Sulawesi) → `WP-07` (`DATA, PIPE`: Maluku, Papua & kompilasi 8 wilayah)
3. **Gelombang C (Interaktivitas UI/UX 100/100 & Alat Geolog — `UIX`, `TOOLS`):**
   - Paralel tahap C1: `WP-10` (`UIX`: Legenda interaktif & chip era) + `WP-12` (`TOOLS`: Detail unit generasi baru, GeoJSON, koreksi)
   - Paralel tahap C2: `WP-11` (`UIX, SEARCH`: Island Quick-Jump 8 wilayah & bottom sheet 3-snap) + `WP-13` (`TOOLS`: Alat ukur & Geological Transect Strip-Log)
4. **Gelombang D (Ekspor Publikasi, WCAG 2.2 AA & Suite Otomatis — `TOOLS`, `UIX`, `TEST`):**
   - Paralel tahap D1: `WP-14` (`TOOLS`: Ekspor PNG/PDF publikasi) + `WP-15` (`UIX`: WCAG 2.2 AA & paritas ID/EN)
   - Tahap D2: `WP-16` (`TEST`: Suite otomatis lengkap Python + Node + Playwright)
5. **Gelombang E (Sertifikasi Exact-Source, Rilis `atlas.orebit.id` & Penutupan 100/100):**
   - `WP-17` (`TEST`: Sertifikasi `local-ci.sh --full --write-receipt` & bukti mutasi)
   - `WP-18` (`REL`: Rilis produksi `atlas.orebit.id` — berhenti di `STOP-TANYA` menunggu `"ya"` pemilik)
   - `WP-19` (`HUMAN`: Kit & hasil uji usability `HUM-01` ≥5 peserta)
   - `WP-20` (`DOCS`: Audit final 45/45 cek SPEC §6 = 100/100)
