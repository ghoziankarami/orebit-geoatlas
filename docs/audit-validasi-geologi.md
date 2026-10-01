# Audit validasi sumber geologi GeoAtlas

Tanggal pemeriksaan: 1 Oktober 2026. Area yang diperiksa: detail Orebit yang saat ini terbit untuk Bangka-Belitung dan Sumatra. Ini adalah audit silang desktop berbasis metadata sumber, kode unit, dan publikasi pembanding; bukan verifikasi lapangan atau validasi seluruh Indonesia.

## Kesimpulan

Data geometri detail berasal dari layanan Geologi Litologi Pusat Survei Geologi (ESDM; metadata layanan menyatakan status Mei 2018). Ini memberi provenance yang dapat ditelusuri, tetapi bukan bukti bahwa setiap umur/litologi hasil harmonisasi benar. Peta layanan tidak mencantumkan skala pada metadata yang diperiksa.

Pemeriksaan menemukan ketidaksesuaian nyata antara umur yang dipakai produk dan publikasi geologi. Karena itu data saat ini **belum layak disebut tervalidasi penuh**. Basis sumbernya kredibel; sebagian interpretasi/normalisasi atribut, khususnya umur otomatis Sumatra, perlu ditinjau.

## Pembanding dan temuan

| Unit yang tampil | Nilai GeoAtlas saat ini | Bukti pembanding terbit | Penilaian |
|---|---|---|---|
| Granit Klabat, Bangka (`TRJkg`) | Umur Jurassic saja (201.4–143.1 Ma) | Publikasi Badan Geologi menyebut Granit Klabat `TRJkg` berumur Trias–Jura. Studi lain menyebut Kelompok Granit Klabat Trias Akhir. | Umur produk terlalu sempit; setidaknya perlu rentang Trias–Jura atau nilai periode sumber, bukan Jura saja. |
| Formasi Kluet, Sumatra (`Puk`, `Pukl`) | Auto-crosswalk memberi Trias (251.9–201.4 Ma), mengikuti teks umur di record layanan | Kajian geologi Sumatra Utara mengelompokkan Kluet di Tapanuli Group berumur Karbon–Perm; studi fosil melaporkan umur Karbon–Permo-Karbon untuk Kluet. Ada ketidakpastian dan variasi antarbagian/terminologi. | Konflik material. Umur Trias tidak boleh diperlakukan pasti; pertahankan sebagai “perlu tinjauan” sampai kode lembar dan unit sumber diperiksa langsung. |
| Formasi Kelapakampit, Belitung (`PCks1`) | Permo-Karbon; kelas metamorf dan rincian filit/sekis diberi penanda inferensi | Leksikon Stratigrafi Indonesia ESDM mengidentifikasi unit `Pcks`, merujuk Baharudin & Sidarto (1995), skala 1:250.000, dan mendeskripsikan metasandstone, slate, mudstone, shale, tuffaceous siltstone, chert; umur leksikon kosong. Publikasi regional menyebut Permo-Karbon. | Umur didukung publikasi regional; kelas metamorf terlalu spesifik/diturunkan, sedangkan batuan campuran sebaiknya tidak disederhanakan menjadi filit/sekis. |
| Formasi Tanjunggenting (`TRt`) | Trias; klastik | Publikasi Badan Geologi menyebut Trias dan menjelaskan batupasir, batupasir malih, batupasir lempungan, batulempung serta lensa batugamping. | Cocok pada tingkat umur dan kelas umum. |

## Cakupan pemeriksaan

- Sumber utama: [layanan Geologi Litologi ESDM](https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer). Metadata service tidak memberi skala maupun keterangan hak cipta pada layer yang diperiksa; atribusi PSG/ESDM dan batas lisensinya perlu dipertahankan sesuai sumber proyek.
- Pembanding lembar: [Peta Geologi Lembar Belitung, Sumatera, 1:250.000 (Baharuddin & Sidarto, 1995)](https://search.worldcat.org/title/Peta-Geologi-Lembar-Belitung-Sumatera-1%3A250000-Geological-Map-of-the-Belitung-Sheet-Sumatera/oclc/502157077) dan [leksikon stratigrafi ESDM untuk Kelapakampit](https://geologi.esdm.go.id/geolindolexicon/index/665). Ini cocok untuk cek nama/kode unit dan gambaran geologi regional, tetapi layanan dan lembar pemerintah dapat berbagi sumber dasar; pembanding tersebut bukan observasi yang sepenuhnya independen.
- Pembanding Bangka: artikel Badan Geologi [Geologi Kuarter Teluk Klabat](https://jgsm.geologi.esdm.go.id/index.php/JGSM/article/download/191/183) menyatakan kode `TRJkg` Trias–Jura, serta mengingatkan skala 1:250.000 dapat melewatkan aluvium lokal. Artikel Badan Geologi [Identifikasi mineral ikutan di Bangka](https://buletinsdg.geologi.esdm.go.id/index.php/bsdg/article/download/BSDG_VOL_17_NO_2_2022_3/310/) menyebut Kelompok Granit Klabat Trias Akhir dan Tanjung Genting Trias.
- Pembanding Sumatra: [JICA, Geological Outline of Northern Sumatra](https://openjicareport.jica.go.jp/pdf/10344281_01.pdf) menjelaskan Kluet sebagai bagian Tapanuli berumur Permian–Carboniferous. Artikel Metcalfe 1983 [Conodont faunas, age and correlation of the Alas Formation](https://www.researchgate.net/publication/231882559_Conodont_faunas_age_and_correlation_of_the_Alas_Formation_Carboniferous_Sumatra) menyatakan fosil calcarenite dekat bagian atas Kluet menunjukkan umur Carbo-Permian. Literatur tersebut mendukung adanya konflik dengan Trias, tetapi tidak menggantikan pemeriksaan atribut pada lembar sumber yang tepat.

## Apa yang dapat dan belum dapat diklaim

1. Dapat diklaim: geometri layer lokal berasal dari layanan resmi ESDM dan unit dapat ditautkan ke kode/nama sumber.
2. Belum dapat diklaim: semua umur dan litologi hasil harmonisasi telah diverifikasi independen. Sebagian besar mapping Sumatra dibuat otomatis dari teks atribut, lalu umur dibulatkan ke rentang ICS dan litologi diturunkan dari kata kunci.
3. Peta regional berskala kecil menggeneralisasi batas. Contoh publikasi Klabat mencatat aluvium lokal yang tidak tergambar pada peta 1:250.000.
4. Cakupan tile Orebit aktif yang diperiksa terbatas pada Bangka-Belitung dan Sumatra; wilayah lain menggunakan layer Macrostrat dan harus menyebut provenance Macrostrat serta sumber unitnya bila tersedia.

## Langkah koreksi yang direkomendasikan

- Tandai `TRJkg` sebagai Trias–Jura (bukan Jura saja), setelah memastikan rentang umur yang dipilih konsisten pada seluruh poligon.
- Hapus label kepastian “Trias” dari `Kluet Formation` (`Puk`, `Pukl`) dan tampilkan sebagai perlu tinjauan; jangan menggantinya dengan rentang baru tanpa memeriksa lembar peta/legenda sumber yang bersangkutan.
- Tinjau kelas/litologi `PCks1` dan unit auto Sumatra lainnya terhadap deskripsi sumber, bukan hanya nama formasi atau kelas default.
- Simpan audit crosswalk per simbol, referensi publikasi, aturan harmonisasi, dan status review agar ekspor peta dapat membawa sumber serta tingkat kepastian secara transparan.
