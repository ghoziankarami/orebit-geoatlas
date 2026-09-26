# Panduan kurasi crosswalk

Tujuan: setiap simbol di setiap lembar menunjuk ke **satu unit baku** di `reference/units.csv`.

1. Jalankan `make inventory REGION=<wilayah>`. Simbol baru masuk ke `reference/crosswalk.csv` dengan `unit_id` kosong; kolom `note` berisi jumlah poligon dan luasnya (kurasi yang terluas dulu).
2. Buka lembar asli (PDF/raster di GeoMap) dan baca legenda serta keterangan unit.
3. Jika unit sudah ada di `units.csv`, isi `unit_id`. Jika belum, tambahkan baris baru di `units.csv`:
   - `formation` mengikuti Leksikon Stratigrafi Indonesia.
   - `age_top_ma` / `age_base_ma` dari umur yang disebut lembar, dikonversi dengan `ics_intervals.csv`.
   - `lith_class` wajib salah satu dari `lithology.csv`.
   - `color_hex` biasanya dikosongkan (otomatis dari umur base).
4. Satu formasi yang diberi simbol berbeda di dua lembar → dua baris crosswalk, **satu** `unit_id`.
5. Jalankan `make validate`, lalu `make tiles`. Tinjau `data/out/<wilayah>/edge_review.gpkg` di QGIS untuk poligon di sambungan lembar yang belum menyatu.

Unit yang belum dikurasi tetap tampil (abu-abu) sehingga peta tidak berlubang.
