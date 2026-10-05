# Pengembangan GeoAtlas

GeoAtlas terdiri dari aplikasi web statis dan pipeline pengolahan data.
README menjelaskan cakupan data yang tersedia; target pada PRD bukan bukti
bahwa cakupan atau kurasi tersebut sudah selesai.

## Komponen

| Path | Fungsi |
| --- | --- |
| `app/src/` | Antarmuka TypeScript dan layer MapLibre. |
| `app/public/` | Aset web. |
| `pipeline/` | Pengambilan, validasi, harmonisasi, ekspor, dan tiling data. |
| `reference/` | Crosswalk simbol, satuan umur, dan kelas litologi. |
| `data/` | Metadata dan lokasi kerja pipeline; data mentah bukan bagian distribusi kode. |
| `docs/` | Persyaratan produk dan catatan kurasi. |

## Aplikasi lokal

Gunakan Node.js 22+ dan npm.

```bash
git clone https://github.com/ghoziankarami/orebit-geoatlas.git
cd orebit-geoatlas/app
npm ci
npm run dev
```

Untuk mengganti lokasi PMTiles, salin `.env.example` menjadi `.env` dan atur
`VITE_TILES_URL`. Tile memerlukan dukungan HTTP Range dan CORS pada host tujuan.

```bash
npm run build
npm run preview
```

## Pipeline data

Dari root repository, buat virtual environment Python 3.11+, lalu pasang
`pipeline/requirements.txt`. Tiling memerlukan tippecanoe 2.17 atau lebih baru.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r pipeline/requirements.txt
make fetch-esdm REGION=babel
make inventory REGION=babel
make validate
make tiles REGION=babel
```

Di antara inventory dan tiling, tinjau `reference/crosswalk.csv` dan
`reference/units.csv` mengikuti [panduan kurasi](kurasi-crosswalk.md).
Validasi geometri tidak membuktikan kebenaran umur atau interpretasi litologi.

## Kontribusi

Perubahan UI harus menjaga dukungan ID/EN. Perubahan crosswalk harus menyebut
simbol, lembar/sumber asli, alasan perubahan, dan pemeriksaan yang dilakukan.
Sertakan atribusi dan ketentuan penggunaan data. Jangan mengirim data berlisensi
terbatas tanpa izin redistribusi.
