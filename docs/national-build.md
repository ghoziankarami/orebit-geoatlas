# Build nasional ESDM

Jalankan di mesin yang dapat menjangkau geoportal.esdm.go.id dan memiliki ruang
untuk GeoJSON mentah, Parquet, GeoJSONSeq, serta PMTiles. Layer mentah tidak
disimpan di Git.

1. Pasang dependensi dengan make setup dan tippecanoe 2.17 atau lebih baru.
2. Jalankan make fetch-all. Mode all meminta seluruh object ID langsung dari
   satu layer nasional; hasil yang kurang lengkap atau duplikat dihentikan.
3. Mode nasional mengambil dua layer Patahan Aktif ESDM (overview dan detail)
   yang terdaftar dalam folder BGS_PM. Masing-masing memiliki manifest dan
   diverifikasi berdasarkan object ID. Untuk menggantinya dengan layer
   tertentu, jalankan make fetch-all FAULT_LAYER_URL=URL. Gunakan
   make fetch-all FETCH_ARGS=--skip-faults hanya bila sengaja membangun
   poligon tanpa sesar.
4. Jalankan make tiles-all. Hasilnya data/out/all/all.pmtiles.
5. Bandingkan esdm_manifest.json, qa_report.csv, dan jumlah fitur pada
   units.geojsonl. Periksa unit bertanda [AUTO] bersama geolog.
6. Sajikan PMTiles dengan HTTP Range dan CORS. Set VITE_TILES_URL ke URL file
   tersebut lalu build aplikasi.

Mode all menghindari duplikasi akibat bbox regional yang tumpang tindih.
Jumlah ID yang diambil adalah cakupan layer layanan, bukan bukti bahwa setiap
lembar geologi Indonesia telah terbit atau mempunyai kualitas kurasi setara
Bangka. File mentah dan tile terabaikan oleh Git.
