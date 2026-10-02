# PRD ringkas: Orebit GeoAtlas

Versi lengkap dan terbaru: https://claude.ai/code/artifact/ad4fc269-8236-42dc-9846-63c9516de477
Desain UI: https://claude.ai/artifact/6bmHZNaq7XYGdZ8T8E6CHn

## Tujuan
1. Peta geologi Indonesia mulus dari zoom 0 sampai 1:100k (zoom ~14), tanpa batas lembar terlihat.
2. Legenda terharmonisasi: umur numerik (Ma), kelas litologi baku, nama formasi konsisten.
3. Ringan di laptop dan HP kelas menengah (4G).
4. Kode terbuka, data siap dikontribusikan ke Macrostrat.

Non-tujuan: bukan peta resmi; tanpa editing; tidak dijual (lisensi GeoMap).

## Metrik MVP
| Metrik | Target |
| --- | --- |
| Tampil peta pertama (4G, HP menengah) | < 2,5 detik |
| Ukuran satu tile vektor | < 500 KB |
| PMTiles Bangka–Belitung | < 30 MB |
| Poligon lolos validasi | ≥ 98% |

## Sumber data
| Sumber | Zoom | Lisensi |
| --- | --- | --- |
| Macrostrat carto tiles | 0–14 (dasar) | CC-BY 4.0 |
| USGS OFR 97-470F (geo3bl) | cadangan regional | domain publik |
| GeoMap PSG, SHP 1:100k per kab/kota | 8–14 | atribusi PSG, dilarang dijual |
| GLiM | referensi litologi | cek CCGM |

**Catatan cakupan saat ini:** tile Orebit yang dipakai aplikasi berasal dari layanan Geologi Litologi ESDM berstatus Mei 2018 untuk Bangka-Belitung dan Sumatra; metadata pipeline tidak menyebut skala. Sumatra masih memakai pemetaan otomatis untuk 470/479 unit, sehingga belum memenuhi sasaran kurasi lintas lembar. Jawa, Kalimantan, Sulawesi, dan Papua saat ini memakai lapisan dasar Macrostrat, bukan data rinci Orebit. Target 1:100.000 di atas adalah sasaran produk dan memerlukan lembar GeoMap terverifikasi.

## Fitur MVP
F1 peta multi-skala · F2 popup unit (formasi, umur, litologi, sumber) · F3 mode warna umur/litologi ·
F4 filter umur (Ma) · F5 layer sesar/kontak · F6 pencarian lokasi · F7 URL bisa dibagikan ·
F8 responsif (bottom sheet ≤ 760 px) · F9 ID/EN · F10 halaman Tentang & Sumber ·
F11 hillshade/topografi · F12 tampilan terrain 3D dengan tombol kembali ke plan view 2D.

Fase 2: overlay fosil PBDB, kolom stratigrafi per cekungan, ekspor PNG/GeoJSON, ukur, laporan koreksi.

## Roadmap
| Milestone | Isi | Perkiraan |
| --- | --- | --- |
| M0 Scaffold | repo, app + Macrostrat, CI | Minggu 1 (selesai) |
| M1 PoC Babel | SHP, crosswalk, PMTiles, popup | Minggu 2–3 |
| M2 MVP publik | F1–F10, deploy atlas.orebit.id | Minggu 4 |
| M3 Sumatra & Jawa | kurasi lintas lembar | Bulan 2–3 |
| M4 Nasional + fase 2 | pulau lain, fosil, kolom | Bulan 4–6 |
| M5 Kontribusi Macrostrat | kirim dataset | setelah M4 |
