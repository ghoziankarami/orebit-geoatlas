import { getLang } from "./i18n";

/** Halaman "Tentang & sumber" (PRD F10): sumber data, lisensi, metodologi, disclaimer. */
const CONTENT = {
  id: `
    <h2 id="aboutTitle">Tentang GeoAtlas</h2>
    <p>GeoAtlas adalah peta geologi Indonesia yang bisa dijelajahi langsung di browser, dari skala global sampai 1:100.000.
    Proyek gratis dari <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a>, terinspirasi dari Macrostrat.</p>

    <h3>Sumber data</h3>
    <table>
      <thead><tr><th>Sumber</th><th>Dipakai untuk</th><th>Lisensi</th></tr></thead>
      <tbody>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a> (untuk Indonesia: peta global GSC, Chorlton 2007)</td><td>Peta dasar di semua zoom</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://geologi.esdm.go.id/geomap" target="_blank" rel="noopener">GeoMap, Pusat Survei Geologi, Badan Geologi</a></td><td>Peta 1:100.000 yang diharmonisasi (bertahap per wilayah)</td><td>Lisensi Terbuka PSG: wajib atribusi, tidak untuk diperjualbelikan</td></tr>
        <tr><td><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> via <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></td><td>Peta latar dan pencarian lokasi</td><td>ODbL</td></tr>
      </tbody>
    </table>

    <h3>Cara data diolah</h3>
    <ol>
      <li>Poligon tiap lembar dipetakan ke satu daftar unit baku (nama formasi mengikuti Leksikon Stratigrafi Indonesia).</li>
      <li>Umur disimpan sebagai rentang juta tahun lalu (jtl) mengikuti skala waktu ICS; warna mengikuti warna resmi ICS.</li>
      <li>Litologi dikelompokkan ke 8 kelas agar bisa dibandingkan antar-lembar.</li>
      <li>Poligon unit yang sama di batas lembar digabung; yang bertentangan ditandai untuk ditinjau.</li>
    </ol>
    <p>Unit yang belum dikurasi tetap tampil dengan warna abu-abu.</p>

    <h3>Batasan</h3>
    <p>Ini bukan peta resmi. Generalisasi dan harmonisasi bisa menggeser batas atau menyederhanakan unit.
    Untuk keputusan teknis, selalu rujuk lembar asli Badan Geologi yang ditautkan di setiap unit.</p>
  `,
  en: `
    <h2 id="aboutTitle">About GeoAtlas</h2>
    <p>GeoAtlas is a geologic map of Indonesia you can explore in the browser, from global scale down to 1:100,000.
    A free project by <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a>, inspired by Macrostrat.</p>

    <h3>Data sources</h3>
    <table>
      <thead><tr><th>Source</th><th>Used for</th><th>License</th></tr></thead>
      <tbody>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a> (for Indonesia: GSC global map, Chorlton 2007)</td><td>Base geology at every zoom</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://geologi.esdm.go.id/geomap" target="_blank" rel="noopener">GeoMap, Center for Geological Survey, Geological Agency</a></td><td>Harmonized 1:100,000 maps (rolled out by region)</td><td>PSG Open License: attribution required, not for sale</td></tr>
        <tr><td><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> via <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></td><td>Basemap and place search</td><td>ODbL</td></tr>
      </tbody>
    </table>

    <h3>How the data is processed</h3>
    <ol>
      <li>Polygons from each sheet are mapped to one list of standard units (formation names follow the Indonesian Stratigraphic Lexicon).</li>
      <li>Ages are stored as ranges in millions of years (Ma) on the ICS time scale; colors follow the official ICS colors.</li>
      <li>Lithology is grouped into 8 classes so sheets can be compared.</li>
      <li>Polygons of the same unit across sheet edges are merged; conflicting edges are flagged for review.</li>
    </ol>
    <p>Units not yet curated are still shown, in gray.</p>

    <h3>Limitations</h3>
    <p>This is not an official map. Generalization and harmonization can shift boundaries or simplify units.
    For technical decisions, always refer to the original Geological Agency sheet linked from each unit.</p>
  `,
} as const;

export function renderAbout() {
  document.getElementById("aboutBody")!.innerHTML = CONTENT[getLang()];
}
