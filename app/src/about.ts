// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
import { getLang } from "./i18n";

/** Halaman "Tentang & sumber": sumber data, lisensi, metodologi stratigrafi, cakupan 8 wilayah. */
const CONTENT = {
  id: `
    <h2 id="aboutTitle">Tentang Orebit GeoAtlas</h2>
    <p>GeoAtlas adalah atlas geologi interaktif untuk seluruh 8 wilayah kepulauan Indonesia (Sumatra, Bangka–Belitung, Jawa, Bali–Nusra, Kalimantan, Sulawesi, Maluku, dan Papua).
    Dikembangkan oleh <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a> untuk eksplorasi geologi, pengecekan wilayah, dan pembuatan penampang geologi regional.
    <a href="https://github.com/ghoziankarami/orebit-geoatlas" target="_blank" rel="noopener">Lihat kode sumber di GitHub ↗</a>.</p>

    <h3>Sumber data</h3>
    <table>
      <thead><tr><th>Sumber</th><th>Cakupan &amp; kegunaan</th><th>Lisensi</th></tr></thead>
      <tbody>
        <tr><td><a href="https://geologi.esdm.go.id/geomap" target="_blank" rel="noopener">Peta Geologi Bersistem Indonesia (P3G / PSG, Badan Geologi)</a></td><td>Kompilasi lembar peta geologi regional skala 1:250.000 &amp; 1:1.000.000 (formasi, litologi, sesar, lipatan, dan subduksi) untuk 8 wilayah Indonesia</td><td>Atribusi sumber P3G / Pusat Survei Geologi, Badan Geologi</td></tr>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a></td><td>Peta geologi tinjauan regional pada tingkat zoom global</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn Terrarium DTM</a> &amp; <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></td><td>Model elevasi digital (DEM/DTM) untuk penampang geologi bawah permukaan &amp; relief 3D, serta peta dasar OpenStreetMap</td><td>ODbL / OpenMapTiles</td></tr>
      </tbody>
    </table>

    <h3>Metodologi stratigrafi &amp; penampang geologi</h3>
    <ol>
      <li><strong>Standarisasi Skala Waktu (ICS):</strong> Setiap formasi dan satuan batuan diselaraskan ke rentang umur <em>International Chronostratigraphic Chart</em> (dalam jutaan tahun lalu / Ma) dari Kuarter hingga Prakambrium.</li>
      <li><strong>Klasifikasi Litologi &amp; Struktur:</strong> Satuan batuan dikelompokkan ke dalam 8 kelas litologi utama (Endapan Permukaan, Karbonat, Sedimen Klastik, Vulkanik, Plutonik Felsik, Plutonik Mafik–Ultramafik, Metamorf, dan Melange) beserta struktur sesar, lipatan, kelurusan, dan kontak geologi.</li>
      <li><strong>Penampang Geologi &amp; Cek Lokasi SHP:</strong> Menggabungkan profil topografi DTM, arsitektur perlapisan batuan berdasarkan hukum superposisi &amp; hubungan potong-memotong (<em>cross-cutting</em>), perpotongan bidang sesar, serta tumpang-susun (<em>overlay</em>) poligon SHP/GeoJSON/KML langsung di browser.</li>
    </ol>

    <h3>Batasan penggunaan</h3>
    <p>Peta ini merupakan kompilasi skala regional dan bukan peta resmi untuk keputusan rekayasa tapak detail.
    Selalu rujuk lembar peta geologi asli Badan Geologi untuk kajian teknis dan gunakan tombol <em>Lapor koreksi</em> bila menemukan ketidaksesuaian atribut.</p>
  `,
  en: `
    <h2 id="aboutTitle">About Orebit GeoAtlas</h2>
    <p>GeoAtlas is an interactive regional geologic atlas covering all 8 Indonesian archipelago regions (Sumatra, Bangka–Belitung, Java, Bali–Nusra, Kalimantan, Sulawesi, Maluku, and Papua).
    Built by <a href="https://orebit.id" target="_blank" rel="noopener">Orebit</a> for geological exploration, concession location checking, and regional geological cross-sections.
    <a href="https://github.com/ghoziankarami/orebit-geoatlas" target="_blank" rel="noopener">View source code on GitHub ↗</a>.</p>

    <h3>Data sources</h3>
    <table>
      <thead><tr><th>Source</th><th>Coverage &amp; usage</th><th>License</th></tr></thead>
      <tbody>
        <tr><td><a href="https://geologi.esdm.go.id/geomap" target="_blank" rel="noopener">Systematic Geological Map of Indonesia (P3G / PSG, Geological Agency)</a></td><td>1:250,000 &amp; 1:1,000,000 regional geological map compilation (formations, lithologies, faults, folds, and subduction zones) across all 8 regions</td><td>Attribution to P3G / Center for Geological Survey</td></tr>
        <tr><td><a href="https://macrostrat.org" target="_blank" rel="noopener">Macrostrat</a></td><td>Global-scale overview geology at low zoom levels</td><td>CC-BY 4.0</td></tr>
        <tr><td><a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn Terrarium DTM</a> &amp; <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a></td><td>Digital elevation model (DEM/DTM) for subsurface geological cross-sections &amp; 3D terrain, plus OpenStreetMap basemaps</td><td>ODbL / OpenMapTiles</td></tr>
      </tbody>
    </table>

    <h3>Stratigraphic methodology &amp; geological cross-sections</h3>
    <ol>
      <li><strong>ICS Chronostratigraphic Standardization:</strong> Every formation and rock unit is harmonized to the <em>International Chronostratigraphic Chart</em> age intervals (in Ma, from Quaternary to Precambrian).</li>
      <li><strong>Lithological &amp; Structural Classification:</strong> Rock units are organized into 8 primary lithology classes (Unconsolidated, Carbonate, Siliciclastic, Volcanic, Felsic Plutonic, Mafic–Ultramafic Plutonic, Metamorphic, and Melange) alongside fault, fold, lineament, and contact structures.</li>
      <li><strong>Geological Cross-Sections &amp; SHP Location Check:</strong> Combines DTM elevation profiles, subsurface stratigraphic superposition &amp; plutonic cross-cutting relationships, fault plane intersections, and client-side SHP/GeoJSON/KML polygon overlay.</li>
    </ol>

    <h3>Limitations</h3>
    <p>This compilation is intended for regional geological overview and preliminary exploration, not site-specific engineering design.
    Always consult original Geological Agency map sheets for technical decisions and use <em>Report correction</em> if you spot discrepancies.</p>
  `,
} as const;

export function renderAbout() {
  document.getElementById("aboutBody")!.innerHTML = CONTENT[getLang()];
}
