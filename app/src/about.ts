import { getLang } from "./i18n";

/** Halaman "Tentang & sumber" (PRD F10): sumber data, lisensi, metodologi, disclaimer. */
const CONTENT = {
  id: `
    <h2 id="aboutTitle">Tentang GeoAtlas</h2>
    <p>GeoAtlas adalah peta geologi multi-sumber Indonesia. Skala dan kelengkapan mengikuti sumber yang tersedia.
    Proyek gratis dari <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a>, terinspirasi dari Macrostrat.
    <a href="https://github.com/ghoziankarami/orebit-geoatlas" target="_blank" rel="noopener">Lihat kode sumber dan README di GitHub ↗</a>.</p>

    <h3>Sumber data</h3>
    <table>
      <thead><tr><th>Sumber</th><th>Dipakai untuk</th><th>Lisensi</th></tr></thead>
      <tbody>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a></td><td>Peta geologi dasar di semua zoom; sumber asli berbeda menurut unit dan ditampilkan pada detail unit bila tersedia</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer" target="_blank" rel="noopener">Layanan Geologi Litologi ESDM (status Mei 2018)</a></td><td>Lapisan Orebit yang saat ini tersedia: Bangka-Belitung dan Sumatra; skala tidak dicantumkan pada metadata</td><td>Lisensi Terbuka PSG: wajib atribusi, tidak untuk diperjualbelikan</td></tr>
        <tr><td><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> via <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> / <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a></td><td>Peta latar dan pencarian lokasi</td><td>ODbL / OpenMapTiles</td></tr>
      </tbody>
    </table>

    <h3>Cara data diolah</h3>
    <ol>
      <li>Simbol sumber dipetakan ke unit baku. Bangka-Belitung memakai 22 simbol yang dipetakan manual; hasilnya tetap perlu dibandingkan dengan peta sumber.</li>
      <li>Di Sumatra, 470 dari 479 pemetaan simbol memakai aturan otomatis dari istilah umur dan kata kunci nama/deskripsi. Umur dibulatkan ke rentang skala ICS; kelas litologi diturunkan dari kata kunci, dan rincian litologi belum diisi.</li>
      <li>Geometri diperbaiki dan divalidasi secara teknis; proses ini tidak memverifikasi kebenaran interpretasi geologi.</li>
      <li>Poligon unit yang sama di batas lembar digabung; yang bertentangan ditandai untuk ditinjau.</li>
    </ol>
    <p>Hasil otomatis Sumatra bersifat sementara dan belum ditelaah geolog secara independen. Audit silang menemukan konflik umur pada Granit Klabat (ditampilkan Jura, publikasi menyebut Trias–Jura) dan Formasi Kluet (atribut sumber Trias, publikasi pembanding menyebut Karbon–Perm). Perlakukan umur kedua unit sebagai belum tervalidasi. Jawa, Kalimantan, Sulawesi, dan Papua belum ada di lapisan rinci Orebit dan menggunakan cakupan Macrostrat.</p>

    <h3>Batasan</h3>
    <p>Ini bukan peta resmi. Generalisasi dan harmonisasi bisa menggeser batas atau menyederhanakan unit.
    Untuk keputusan teknis, selalu rujuk lembar asli Badan Geologi yang ditautkan di setiap unit.</p>
  `,
  en: `
    <h2 id="aboutTitle">About GeoAtlas</h2>
    <p>GeoAtlas is a multi-source geologic map of Indonesia. Scale and completeness depend on the available sources.
    A free project by <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a>, inspired by Macrostrat.
    <a href="https://github.com/ghoziankarami/orebit-geoatlas" target="_blank" rel="noopener">View the source code and README on GitHub ↗</a>.</p>

    <h3>Data sources</h3>
    <table>
      <thead><tr><th>Source</th><th>Used for</th><th>License</th></tr></thead>
      <tbody>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a></td><td>Base geology at every zoom; original sources vary by unit and are shown in unit details when available</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer" target="_blank" rel="noopener">ESDM Geology and Lithology service (May 2018 status)</a></td><td>Current Orebit overlay: Bangka-Belitung and Sumatra; scale is not stated in its metadata</td><td>PSG Open License: attribution required, not for sale</td></tr>
        <tr><td><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> via <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> / <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a></td><td>Basemap and place search</td><td>ODbL / OpenMapTiles</td></tr>
      </tbody>
    </table>

    <h3>How the data is processed</h3>
    <ol>
      <li>Source symbols are mapped to standard units. Bangka-Belitung has 22 manually assigned symbols; those assignments still need comparison with the source map.</li>
      <li>In Sumatra, 470 of 479 symbol mappings use automated rules from source-age terms and name/description keywords. Ages are broadened to ICS intervals; lithology classes come from keywords, and lithology details are blank.</li>
      <li>Geometry is repaired and technically validated; this does not verify the geological interpretation.</li>
      <li>Polygons of the same unit across sheet edges are merged; conflicting edges are flagged for review.</li>
    </ol>
    <p>Automated Sumatra classifications are provisional and have not received independent geological review. A cross-check found age conflicts for Klabat Granite (shown as Jurassic; publications report Triassic–Jurassic) and Kluet Formation (source attribute says Triassic; comparison publications report Carboniferous–Permian). Treat both ages as unvalidated. Java, Kalimantan, Sulawesi, and Papua are not in the detailed Orebit layer and use Macrostrat coverage.</p>

    <h3>Limitations</h3>
    <p>This is not an official map. Generalization and harmonization can shift boundaries or simplify units.
    For technical decisions, always refer to the original Geological Agency sheet linked from each unit.</p>
  `,
} as const;

export function renderAbout() {
  document.getElementById("aboutBody")!.innerHTML = CONTENT[getLang()];
}
