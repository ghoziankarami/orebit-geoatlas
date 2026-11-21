# Panduan Kurasi Crosswalk Nasional (8 Wilayah Indonesia)

Tujuan: setiap simbol di setiap lembar menunjuk ke **satu unit baku** di [reference/units.csv](../reference/units.csv) dengan status tingkat kepercayaan (`confidence`) yang jujur dan transparan.

## 1. Pembagian 8 Wilayah Nasional

| Kode `region` | Wilayah | BBox (`lon_min, lat_min, lon_max, lat_max`) |
|---|---|---|
| `sumatra` | Sumatra | `95.0, -6.5, 105.0, 6.5` |
| `babel` | Bangka-Belitung & Kep. Riau | `105.0, -3.6, 109.0, 4.8` |
| `jawa` | Jawa & Madura | `105.0, -9.0, 114.6, -5.0` |
| `balinusra` | Bali & Nusa Tenggara | `114.4, -11.2, 125.5, -8.0` |
| `kalimantan` | Kalimantan | `108.5, -4.5, 119.2, 4.6` |
| `sulawesi` | Sulawesi | `118.8, -6.8, 125.8, 5.8` |
| `maluku` | Kepulauan Maluku | `124.0, -9.2, 135.0, 2.8` |
| `papua` | Papua | `129.5, -9.5, 141.2, 1.0` |

## 2. Alur Kurasi & Pembuatan Indeks Nasional

1. Tarik data wilayah atau siapkan shapefile: `make fetch-esdm REGION=<wilayah>` lalu `make inventory REGION=<wilayah>`. Simbol baru masuk ke `reference/crosswalk.csv` dengan `unit_id` kosong dan catatan luas (`km²`, dihitung dalam proyeksi Equal-Area `EPSG:6933`).
2. Buka lembar asli (GeoMap / Leksikon Stratigrafi Indonesia) dan baca legenda serta keterangan unit.
3. Jika unit sudah ada di `units.csv`, isi `unit_id`. Jika belum, tambahkan baris baru di `units.csv`:
   - `formation` mengikuti Leksikon Stratigrafi Indonesia.
   - `age_top_ma` / `age_base_ma` dari umur yang disebut lembar, dikonversi dengan `ics_intervals.csv`.
   - `lith_class` wajib salah satu dari `lithology.csv`.
   - `confidence` wajib diisi salah satu dari:
     - `curated` — diverifikasi manual terhadap lembar peta/leksikon;
     - `auto` — diturunkan secara deterministik oleh `pipeline/auto_crosswalk.py` (wajib mempertahankan awalan `[AUTO]` di `description`);
     - `flagged` — terdapat konflik antara atribut sumber dan publikasi pembanding (mis. Formasi Kluet `PUK`).
4. Jalankan `make validate` untuk memeriksa integritas referensial, lalu `make index` untuk memperbarui katalog pencarian nasional (`app/public/data/indonesia-units-index.json`), dan `make tiles REGION=<wilayah>` / `make tiles-all` untuk membangun PMTiles.

Unit yang belum dikurasi tetap tampil (abu-abu) sehingga peta tidak berlubang.
