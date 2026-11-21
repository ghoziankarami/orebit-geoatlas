import { getLang } from "./i18n";

/** Halaman "Tentang & sumber" (PRD F10): sumber data, lisensi, metodologi, cakupan 8 wilayah. */
const CONTENT = {
  id: `
    <h2 id="aboutTitle">Tentang Orebit GeoAtlas</h2>
    <p>GeoAtlas adalah atlas geologi multi-sumber untuk seluruh 8 wilayah kepulauan Indonesia (Sumatra, Bangka-Belitung, Jawa, Bali–Nusra, Kalimantan, Sulawesi, Maluku, dan Papua).
    Proyek gratis dan terbuka dari <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a>, terinspirasi dari Macrostrat.
    <a href="https://github.com/ghoziankarami/orebit-geoatlas" target="_blank" rel="noopener">Lihat kode sumber di GitHub ↗</a>.</p>

    <h3>Sumber data</h3>
    <table>
      <thead><tr><th>Sumber</th><th>Dipakai untuk</th><th>Lisensi</th></tr></thead>
      <tbody>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a></td><td>Peta geologi dasar di semua zoom; sumber asli berbeda menurut unit dan ditampilkan pada detail unit</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer" target="_blank" rel="noopener">Layanan Geologi Litologi &amp; Struktur ESDM</a></td><td>Katalog &amp; harmonisasi 8 wilayah Indonesia (Pusat Survei Geologi, Badan Geologi)</td><td>Lisensi Terbuka PSG: wajib atribusi, tidak untuk diperjualbelikan</td></tr>
        <tr><td><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> via <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></td><td>Peta dasar (Terang/Gelap) dan pencarian lokasi Nominatim</td><td>ODbL / OpenMapTiles</td></tr>
      </tbody>
    </table>

    <h3>Transparansi tingkat kurasi (Confidence)</h3>
    <ol>
      <li><strong>Terkurasi Manual (<code>curated</code>):</strong> Diverifikasi terhadap lembar peta Badan Geologi dan Leksikon Stratigrafi Indonesia (termasuk koreksi Granit Klabat Trias–Jura dan metasedimen Belitung).</li>
      <li><strong>Pemetaan Otomatis (<code>auto</code>):</strong> Diturunkan secara deterministik oleh <code>auto_crosswalk.py</code> dari istilah umur dan kata kunci litologi sumber; tetap memerlukan tinjauan ahli geologi.</li>
      <li><strong>Catatan Audit Literatur (<code>flagged</code>):</strong> Terdapat perbedaan antara atribut peta sumber dan publikasi pembanding (mis. Formasi Kluet: Trias vs Karbon–Perm).</li>
    </ol>

    <h3>Batasan</h3>
    <p>Ini bukan peta resmi. Generalisasi dan harmonisasi bisa menggeser batas atau menyederhanakan unit.
    Untuk keputusan teknis, selalu rujuk lembar asli Badan Geologi dan gunakan tombol <em>Lapor koreksi</em> bila menemukan ketidakcocokan.</p>
  `,
  en: `
    <h2 id="aboutTitle">About Orebit GeoAtlas</h2>
    <p>GeoAtlas is a multi-source geologic atlas covering all 8 Indonesian archipelago regions (Sumatra, Bangka-Belitung, Java, Bali–Nusra, Kalimantan, Sulawesi, Maluku, and Papua).
    A free, open-source project by <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a>, inspired by Macrostrat.
    <a href="https://github.com/ghoziankarami/orebit-geoatlas" target="_blank" rel="noopener">View source code on GitHub ↗</a>.</p>

    <h3>Data sources</h3>
    <table>
      <thead><tr><th>Source</th><th>Used for</th><th>License</th></tr></thead>
      <tbody>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a></td><td>Base geology at every zoom; original sources vary by unit and are shown in unit details</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer" target="_blank" rel="noopener">ESDM Geology &amp; Structure service</a></td><td>8-region Indonesian national catalog &amp; harmonization (Center for Geological Survey)</td><td>PSG Open License: attribution required, not for sale</td></tr>
        <tr><td><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> via <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></td><td>Basemap (Light/Dark) and Nominatim place search</td><td>ODbL / OpenMapTiles</td></tr>
      </tbody>
    </table>

    <h3>Curation confidence levels</h3>
    <ol>
      <li><strong>Manually Curated (<code>curated</code>):</strong> Verified against Geological Agency map sheets and Indonesian Stratigraphic Lexicon (including Triassic–Jurassic Klabat Granite and Belitung metasediment corrections).</li>
      <li><strong>Automated Mapping (<code>auto</code>):</strong> Deterministically derived by <code>auto_crosswalk.py</code> from source age terms and lithology keywords; requires geologist review.</li>
      <li><strong>Literature Audit Note (<code>flagged</code>):</strong> Known conflict between source attributes and comparison publications (e.g. Kluet Formation: Triassic vs Carboniferous–Permian).</li>
    </ol>

    <h3>Limitations</h3>
    <p>This is not an official map. Generalization and harmonization can shift boundaries or simplify units.
    For technical decisions, always refer to original Geological Agency sheets and use <em>Report correction</em> if you spot discrepancies.</p>
  `,
} as const;

export function renderAbout() {
  document.getElementById("aboutBody")!.innerHTML = CONTENT[getLang()];
}
