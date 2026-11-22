// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const ts = require(resolve(ROOT, "app/node_modules/typescript/lib/typescript.js"));

// Minimal browser globals for pure-function imports in Node
if (!globalThis.navigator) globalThis.navigator = { language: "id-ID" };
globalThis.location = { hash: "" };
globalThis.document = { documentElement: { lang: "id" } };
globalThis.importMetaEnv = {};

const tempDir = mkdtempSync(join(tmpdir(), "geoatlas-contracts-"));
const modulesToCompile = ["config", "i18n", "timescale", "lithology", "layers", "state", "coords", "search", "detail", "transect", "section_model", "shp_import", "gps", "photos", "waypoints", "zip", "field_package"];

for (const name of modulesToCompile) {
  let src = readFileSync(resolve(ROOT, `app/src/${name}.ts`), "utf-8");
  src = src.replace(/import\.meta\.env/g, "globalThis.importMetaEnv");
  src = src.replace(/import maplibregl from "maplibre-gl";/, "const maplibregl = globalThis.maplibregl ?? {};");
  src = src.replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  writeFileSync(join(tempDir, `${name}.mjs`), out, "utf-8");
}

try {
  // 1. Test UTM Coordinate Conversion across Indonesian archipelago
  const { toUtm } = await import(join(tempDir, "coords.mjs"));
  const aceh = toUtm(5.5483, 95.3238);
  assert.equal(aceh.zone, 46);
  assert.equal(aceh.hemisphere, "N");
  assert.equal(aceh.band, "N");

  const jkt = toUtm(-6.2088, 106.8456);
  assert.equal(jkt.zone, 48);
  assert.equal(jkt.hemisphere, "S");
  assert.equal(jkt.band, "M");
  assert.ok(jkt.easting > 690000 && jkt.easting < 720000);
  assert.ok(jkt.northing > 9300000 && jkt.northing < 9330000);

  const jyp = toUtm(-2.5337, 140.7181);
  assert.equal(jyp.zone, 54);
  assert.equal(jyp.hemisphere, "S");

  // 2. Test i18n ID vs EN 100% key parity & non-empty values
  const { dict } = await import(join(tempDir, "i18n.mjs"));
  const idKeys = Object.keys(dict.id).sort();
  const enKeys = Object.keys(dict.en).sort();
  assert.deepEqual(idKeys, enKeys, "i18n ID and EN keys must match 100%");
  for (const k of idKeys) {
    assert.ok(String(dict.id[k]).trim().length > 0, `Empty ID translation for ${k}`);
    assert.ok(String(dict.en[k]).trim().length > 0, `Empty EN translation for ${k}`);
  }

  // 3. Test actual searchNationalIndex() from app/src/search.ts across all 8 regions
  const { searchNationalIndex } = await import(join(tempDir, "search.mjs"));
  const indexRaw = JSON.parse(readFileSync(resolve(ROOT, "app/public/data/indonesia-units-index.json"), "utf-8"));
  const units = indexRaw.units;
  assert.ok(units.length >= 550);

  assert.equal(searchNationalIndex(units, "a").length, 0, "Queries < 2 chars must return []");
  const klabat = searchNationalIndex(units, "TRJkg", 5);
  assert.equal(klabat[0]?.unit_id, "TRJKG", "Exact symbol match must rank first");
  assert.ok(searchNationalIndex(units, "Muara Enim").length >= 1);
  assert.ok(searchNationalIndex(units, "Merapi").some((u) => u.region === "jawa"));
  assert.ok(searchNationalIndex(units, "Tonasa").some((u) => u.region === "sulawesi"));
  assert.ok(searchNationalIndex(units, "Grasberg").some((u) => u.region === "papua"));
  assert.ok(searchNationalIndex(units, "Balikpapan").some((u) => u.region === "kalimantan"));
  assert.ok(searchNationalIndex(units, "Halmahera").some((u) => u.region === "maluku"));
  assert.ok(searchNationalIndex(units, "Rinjani").some((u) => u.region === "balinusra"));

  // 4. Test actual transect math from app/src/transect.ts
  const { haversineKm, bearingDeg, computeTransectStats, samplePointsAlongLine } = await import(join(tempDir, "transect.mjs"));
  const a = { lat: -6.2, lng: 106.8 };
  const b = { lat: -6.9, lng: 107.6 };
  const km = haversineKm(a, b);
  assert.ok(km > 110 && km < 125, `Expected ~118 km, got ${km}`);
  const az = bearingDeg(a, b);
  assert.ok(az > 125 && az < 145, `Expected SE azimuth ~131 deg, got ${az}`);
  const stats = computeTransectStats([a, b]);
  assert.equal(stats.totalKm, km);
  assert.equal(stats.azimuthDeg, az);
  const samples = samplePointsAlongLine([a, b], 10);
  assert.equal(samples.length, 10);

  // 5. Test actual state URL hash roundtrip from app/src/state.ts
  const { readState, serializeState } = await import(join(tempDir, "state.mjs"));
  const initial = {
    mode: "lith",
    ageMin: 2.58,
    ageMax: 66,
    lithFilter: "volcanic",
    confFilter: "curated",
    basemap: "dark",
    region: "jawa",
    lines: false,
    lang: "en",
    topo: true,
    view3d: true,
    geologyOpacity: 60,
  };
  const hash = serializeState(initial, "#map=5/-7.2/110.4");
  const parsed = readState(hash);
  assert.equal(parsed.mode, "lith");
  assert.equal(parsed.ageMin, 2.58);
  assert.equal(parsed.ageMax, 66);
  assert.equal(parsed.lithFilter, "volcanic");
  assert.equal(parsed.confFilter, "curated");
  assert.equal(parsed.basemap, "dark");
  assert.equal(parsed.region, "jawa");
  assert.equal(parsed.lines, false);
  assert.equal(parsed.lang, "en");
  assert.equal(parsed.topo, true);
  assert.equal(parsed.view3d, true);
  assert.equal(parsed.geologyOpacity, 60);
  // Basemap satelit & opasitas 0 (geologi disembunyikan) bertahan di URL
  const sat = readState(serializeState({ ...initial, basemap: "satellite", geologyOpacity: 0 }, "#map=5/-7.2/110.4"));
  assert.equal(sat.basemap, "satellite");
  assert.equal(sat.geologyOpacity, 0);

  // 6. Lingkar akurasi GPS: radius meter -> derajat, tertutup, simetris
  const { accuracyRing } = await import(join(tempDir, "gps.mjs"));
  const ring = accuracyRing(119.87, -0.9, 100, 32);
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[32]);
  const dLatM = (ring[8][1] - -0.9) * 111320;
  assert.ok(Math.abs(dLatM - 100) < 0.5, `accuracy ring radius off: ${dLatM}`);

  // 7. Waypoint: penomoran berlanjut, GPX 1.1 valid & ter-escape, CSV ber-header
  const { nextName, toGpx, toCsv } = await import(join(tempDir, "waypoints.mjs"));
  const wps = [
    { id: "a", name: "WP-002", note: 'Singkapan <andesit> & "kekar"', lat: -0.9, lng: 119.87, elevM: 42.4, accM: 8.6, unit: "Formasi Pakuli", symbol: "Qp", time: "2026-11-22T06:00:00.000Z" },
    { id: "b", name: "Sampel A", note: "", lat: -0.91, lng: 119.88, elevM: null, accM: null, unit: "", symbol: "", time: "2026-11-22T06:05:00.000Z" },
  ];
  assert.equal(nextName(wps), "WP-003");
  assert.equal(nextName([]), "WP-001");
  const gpx = toGpx(wps);
  assert.ok(gpx.includes('<gpx version="1.1"') && gpx.includes('xmlns="http://www.topografix.com/GPX/1/1"'));
  assert.ok(gpx.includes('<wpt lat="-0.9000000" lon="119.8700000"><ele>42.4</ele>'));
  assert.ok(gpx.includes("&lt;andesit&gt; &amp; &quot;kekar&quot;"), "GPX must escape XML");
  assert.equal((gpx.match(/<wpt /g) || []).length, 2);
  const csv = toCsv(wps).trim().split("\n");
  assert.equal(csv[0], "name,kind,structure,strike,dip,lat,lon,elev_m,accuracy_m,unit,symbol,note,time");
  assert.equal(csv.length, 3);
  assert.ok(csv[1].includes('"Singkapan <andesit> & ""kekar"""'), "CSV must double quotes");
  const { attitudeText, hasAttitude, kindOf } = await import(join(tempDir, "waypoints.mjs"));
  const st = { ...wps[0], kind: "structure", structType: "bedding", strike: 30, dip: 45 };
  assert.equal(kindOf(wps[0]), "outcrop", "legacy waypoints default to outcrop");
  assert.equal(hasAttitude(st), true);
  assert.equal(attitudeText(st), "030/45");
  assert.equal(hasAttitude({ ...st, kind: "sample" }), false);

  // 7b. Validasi strike/dip (ditolak, bukan dipotong) dan arah foto
  const { parseAttitude, parseAzimuth } = await import(join(tempDir, "waypoints.mjs"));
  assert.deepEqual(parseAttitude("30", "45"), { ok: true, strike: 30, dip: 45 });
  assert.deepEqual(parseAttitude("-30", ""), { ok: false, field: "strike", key: "wpStrikeErr" }, "strike below 0 must be rejected, not wrapped");
  assert.deepEqual(parseAttitude("400", "45"), { ok: false, field: "strike", key: "wpStrikeErr" }, "strike above 360 must be rejected");
  assert.deepEqual(parseAttitude("360", "45"), { ok: true, strike: 0, dip: 45 }, "360 is accepted and stored as 0");
  assert.deepEqual(parseAttitude("0", ""), { ok: true, strike: 0, dip: null });
  assert.deepEqual(parseAttitude("", "90"), { ok: true, strike: null, dip: 90 });
  assert.deepEqual(parseAttitude("30", "120"), { ok: false, field: "dip", key: "wpDipErr" }, "dip above 90 must be rejected");
  assert.deepEqual(parseAttitude("30", "-1"), { ok: false, field: "dip", key: "wpDipErr" });
  assert.deepEqual(parseAttitude("abc", "45"), { ok: false, field: "strike", key: "wpStrikeErr" });
  assert.deepEqual(parseAzimuth(""), { ok: true, value: null });
  assert.deepEqual(parseAzimuth("360"), { ok: true, value: 360 });
  assert.equal(parseAzimuth("361").ok, false);

  // 7c. Foto: ukuran sisi terpanjang <= 1600 px tanpa memperbesar; berkas non-gambar dan > 25 MB ditolak
  const { fitSize, photoFileError, PHOTO_MAX_SRC_BYTES } = await import(join(tempDir, "photos.mjs"));
  assert.deepEqual(fitSize(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(3000, 4000), { w: 1200, h: 1600 });
  assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 }, "small images are not upscaled");
  assert.equal(photoFileError({ type: "image/jpeg", size: 1000 }), null);
  assert.equal(photoFileError({ type: "application/pdf", size: 1000 }), "wpPhotoNotImage");
  assert.equal(photoFileError({ type: "image/png", size: PHOTO_MAX_SRC_BYTES + 1 }), "wpPhotoTooLarge");
  assert.ok(toCsv([st]).split("\n")[1].startsWith('"WP-002",structure,bedding,30,45,'));
  assert.ok(toGpx([st]).includes("<type>structure</type>") && toGpx([st]).includes("bedding 030/45"));

  {
  // 8. Penampang: proyeksi waypoint ke garis, arah dip, dan prioritas ukuran lapangan
  const secW = await import(join(tempDir, "section_model.mjs"));
  const wline = [{ lng: 120, lat: 0 }, { lng: 120.01, lat: 0 }]; // ~1.11 km ke timur
  const wprj = secW.projectOntoLine(wline, { lng: 120.005, lat: 0.0009 }); // ~100 m utara, di tengah
  assert.ok(Math.abs(wprj.alongKm - wprj.totalKm / 2) < 0.002, `along ${wprj.alongKm}`);
  assert.ok(Math.abs(wprj.offsetM - 100) < 1, `offset ${wprj.offsetM}`);
  assert.equal(wprj.side, "L", "north of an eastward line is on the left");
  assert.equal(secW.projectOntoLine(wline, { lng: 120.005, lat: -0.0009 }).side, "R");
  // Strike 000 (dip ke timur) pada lintasan ke timur: miring ke A'; strike 180 (dip ke barat): ke A
  assert.equal(secW.dipTowardFromStrike(0, 90), "B");
  assert.equal(secW.dipTowardFromStrike(180, 90), "A");
  const mkS = (label, base, top, lith = "siliciclastic") => ({ elevM: 10, label, symbol: label, color: "#ccc", lithClass: lith, ageBaseMa: base, ageTopMa: top });
  const secSamples = [...Array(10)].map((_, i) => (i < 5 ? mkS("Muda", 5, 2.6) : mkS("Tua", 6, 5.2)));
  const fieldMeas = [{ frac: 0.47, strikeAz: 180, dipDeg: 30, target: "contact", name: "WP-007" }];
  const wm1 = secW.buildSectionModel(secSamples, [], 90, {}, fieldMeas, 0.05);
  assert.equal(wm1.boundaries.length, 1);
  assert.equal(wm1.boundaries[0].trueDipDeg, 30);
  assert.equal(wm1.boundaries[0].assumed, false);
  assert.equal(wm1.boundaries[0].source, "WP-007");
  assert.equal(wm1.boundaries[0].toward, "A");
  assert.ok(Math.abs(wm1.boundaries[0].apparentDipDeg - 30) < 0.01, "strike perpendicular to section: apparent = true dip");
  // Isian manual menang atas ukuran lapangan; ukuran di luar toleransi diabaikan
  const bid = wm1.boundaries[0].id;
  const wm2 = secW.buildSectionModel(secSamples, [], 90, { [bid]: { dipDeg: 70 } }, fieldMeas, 0.05);
  assert.equal(wm2.boundaries[0].trueDipDeg, 70);
  assert.equal(wm2.boundaries[0].source, undefined);
  const wm3 = secW.buildSectionModel(secSamples, [], 90, {}, [{ ...fieldMeas[0], frac: 0.9 }], 0.05);
  assert.equal(wm3.boundaries[0].assumed, true);
  // Ukuran sesar tidak dipakai untuk kontak biasa
  const wm4 = secW.buildSectionModel(secSamples, [], 90, {}, [{ ...fieldMeas[0], target: "fault" }], 0.05);
  assert.equal(wm4.boundaries[0].source, undefined);

  // 8. Impor SHP: reproyeksi UTM 48S ke WGS84 (known answer) dan deteksi .prj
  const shp = await import(join(tempDir, "shp_import.mjs"));
  const [lng0, lat0] = shp.utmToLngLat(500000, 10000000, 48, true);
  assert.ok(Math.abs(lng0 - 105) < 1e-6, `UTM 48S central meridian lng=${lng0}`);
  assert.ok(Math.abs(lat0) < 1e-6, `UTM 48S equator lat=${lat0}`);
  assert.equal(shp.detectPrjSpec('PROJCS["WGS_1984_UTM_Zone_48S"]', 50, false).mode, "utm");
  assert.equal(shp.detectPrjSpec('PROJCS["WGS_1984_UTM_Zone_48S"]', 50, false).zone, 48);
  assert.equal(shp.detectPrjSpec('PROJCS["WGS_1984_UTM_Zone_48S"]', 50, false).isSouth, true);
  assert.equal(shp.detectPrjSpec(null, 50, false).mode, "wgs84");
  }

  // 6. Geological section model: apparent dip, contact classification, projection to depth
  const secm = await import(join(tempDir, "section_model.mjs"));
  const near = (a, b, e = 0.05) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);
  near(secm.apparentDip(60, 90, 0), 60);                       // section perpendicular to strike: apparent = true
  near(secm.apparentDip(60, 45, 0), Math.atan(Math.tan(60 * Math.PI / 180) * Math.sin(45 * Math.PI / 180)) * 180 / Math.PI);
  assert.ok(secm.apparentDip(60, 0, 0) <= 1.01, "strike parallel to section -> ~0 apparent dip");
  assert.equal(secm.apparentDip(90, 10, 0), 90);
  const young = { lithClass: "siliciclastic", ageBaseMa: 5, ageTopMa: 2 };
  const oldU = { lithClass: "siliciclastic", ageBaseMa: 40, ageTopMa: 30 };
  assert.equal(secm.classifyContact(young, oldU, false).kind, "unconformity");   // 30 - 5 = 25 Ma hiatus
  assert.equal(secm.classifyContact(young, oldU, false).hiatusMa, 25);
  assert.equal(secm.classifyContact(young, { ...oldU, ageTopMa: 5 }, false).kind, "conformable");
  assert.equal(secm.classifyContact(young, oldU, true).kind, "fault");           // faults only when mapped
  assert.equal(secm.classifyContact({ ...young, lithClass: "plutonic_felsic" }, oldU, false).kind, "intrusive");
  const mk = (label, age) => ({ elevM: 100, label, symbol: label, color: "#ccc", lithClass: "siliciclastic", ageBaseMa: age, ageTopMa: age - 3 });
  const secSamples = [...Array(10).fill(0).map(() => mk("A", 10)), ...Array(10).fill(0).map(() => mk("B", 20))];
  const noFault = secm.buildSectionModel(secSamples, [], 90);
  assert.equal(noFault.boundaries.length, 1);
  assert.notEqual(noFault.boundaries[0].kind, "fault", "age jump alone must not create a fault");
  const withFault = secm.buildSectionModel(secSamples, [{ frac: 0.5, km: 5, type: "Sesar", strikeAz: 0 }], 90);
  assert.equal(withFault.boundaries[0].kind, "fault");
  assert.equal(withFault.boundaries[0].assumed, true);
  near(withFault.boundaries[0].apparentDipDeg, 60);
  const dipped = secm.buildSectionModel(secSamples, [], 90, { [noFault.boundaries[0].id]: { dipDeg: 45, toward: "B" } });
  assert.equal(dipped.boundaries[0].assumed, false);
  const geo = { padL: 0, plotW: 100, pxPerKm: 10, pxPerM: 0.01, yTop: 0, yFloor: 100, surfaceY: () => 0 };
  const lay = secm.layoutSection(dipped, geo, 10);
  const path = lay.boundaries[0].path;
  assert.ok(path[path.length - 1][0] > path[0][0], "dip toward B moves the contact to the right with depth");
  const vert = secm.layoutSection(noFault, geo, 10).boundaries[0].path;
  near(vert[vert.length - 1][0], vert[0][0], 0.01);                            // unknown dip = vertical

  // 9. Paket Lapangan: ZIP store + CRC32, pembaca bersama (CRC wajib cocok), parser pihak ketiga, gabung per id, skema ditolak
  const zipM = await import(join(tempDir, "zip.mjs"));
  const enc = (s) => new TextEncoder().encode(s);
  assert.equal(zipM.crc32(enc("123456789")), 0xcbf43926, "CRC32 check value");
  const { unzipEntries } = await import(join(tempDir, "shp_import.mjs"));
  const fpPhoto = Uint8Array.from({ length: 4096 }, (_, i) => (i * 37) & 0xff);
  const fpZip = zipM.buildZip([{ name: "a/ünï.txt", data: enc("halo") }, { name: "photos/WP-001_1.jpg", data: fpPhoto }], new Date(2026, 10, 23, 10, 30, 0));
  const fpEnts = await unzipEntries(fpZip.buffer);
  assert.equal(new TextDecoder().decode(fpEnts.get("a/ünï.txt")), "halo", "UTF-8 entry name round-trip");
  assert.deepEqual(new Uint8Array(fpEnts.get("photos/WP-001_1.jpg")), fpPhoto, "photo bytes identical after zip round-trip");
  const fpCorrupt = fpZip.slice();
  fpCorrupt[Buffer.from(fpZip).indexOf("halo")] ^= 0xff; // satu byte data rusak
  await assert.rejects(unzipEntries(fpCorrupt.buffer), /CRC mismatch/, "corrupt entry must be rejected, not read silently");

  const fp = await import(join(tempDir, "field_package.mjs"));
  const { mergeWaypoints, parseGpx, parseCsv, parseGeojson, readFieldFile, buildFieldPackage, FieldImportError, FIELD_SCHEMA } = fp;
  const fpBase = (id, time, extra = {}) => ({ id, name: `WP-${id}`, note: "", kind: "outcrop", lat: -0.9, lng: 119.87, elevM: null, accM: null, unit: "", symbol: "", time, ...extra });
  const fixture = (f) => readFileSync(resolve(ROOT, `tests/fixtures/${f}`), "utf-8");

  const gpxIn = parseGpx(fixture("garmin-style-waypoints.gpx"));
  assert.equal(gpxIn.length, 3, "GPX fixture: 3 wpt read");
  assert.equal(gpxIn[0].name, "GRM001");
  assert.equal(gpxIn[0].note, "Singkapan andesit & kekar", "GPX entities decoded");
  assert.equal(gpxIn[0].elevM, 42.5);
  assert.equal(gpxIn[1].name, "GRM002 - batu pasir", "GPX CDATA name");
  assert.equal(gpxIn[2].name, "", "unnamed wpt keeps empty name until merge");
  assert.equal(gpxIn[0].kind, "other", "third-party waypoints are kind other");
  const csvIn = parseCsv(fixture("avenza-style-points.csv"));
  assert.equal(csvIn.length, 2, "CSV fixture: row without coordinates skipped");
  assert.equal(csvIn[0].note, 'Batu gamping, "berlapis"', "CSV quoted field with escaped quotes");
  assert.throws(() => parseCsv("a,b\n1,2"), (e) => e instanceof FieldImportError && e.key === "wpImportErr", "CSV without lat/lon is rejected");
  const gjIn = parseGeojson(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [119.86, -0.895] }, properties: { name: "G1" } }, { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, properties: {} }] }));
  assert.equal(gjIn.length, 1, "GeoJSON: only Point features");
  assert.equal(gjIn[0].name, "G1");

  // Gabung paket: id sama + time lebih baru menang; isi identik dilewati; id baru ditambahkan
  const fpLocal = [fpBase("a", "2026-11-22T06:00:00.000Z"), fpBase("b", "2026-11-22T06:00:00.000Z")];
  const fpInc = [fpBase("a", "2026-11-22T06:00:00.000Z"), fpBase("b", "2026-11-23T06:00:00.000Z", { note: "baru" }), fpBase("c", "2026-11-22T07:00:00.000Z")];
  const fpPlan = mergeWaypoints(fpLocal, fpInc, "package");
  assert.deepEqual([fpPlan.added, fpPlan.updated, fpPlan.skipped], [1, 1, 1]);
  assert.equal(fpPlan.next.length, 3);
  assert.equal(fpPlan.next.find((w) => w.id === "b").note, "baru");
  assert.deepEqual([...fpPlan.touched].sort(), ["b", "c"]);
  const fpOlder = mergeWaypoints([fpBase("x", "2026-11-23T00:00:00.000Z", { note: "lokal" })], [fpBase("x", "2026-11-22T00:00:00.000Z", { note: "paket" })], "package");
  assert.equal(fpOlder.next[0].note, "lokal", "older package version must not overwrite local data");
  assert.deepEqual([fpOlder.updated, fpOlder.skipped], [0, 1]);
  // Pihak ketiga: nama+koordinat sama dilewati; nama kosong diberi nomor berikutnya
  const fpExt = mergeWaypoints([fpBase("p", "t", { name: "WP-001" })], [fpBase("q", "t", { name: "WP-001" }), fpBase("r", "t", { name: "", lat: -0.8, lng: 119.9 })], "external");
  assert.deepEqual([fpExt.added, fpExt.skipped], [1, 1]);
  assert.equal(fpExt.next[1].name, "WP-002", "unnamed third-party point gets next number");
  const fpExt2 = mergeWaypoints(fpExt.next, [fpBase("s", "t", { name: "", lat: -0.8, lng: 119.9 })], "external");
  assert.deepEqual([fpExt2.added, fpExt2.skipped], [0, 1], "re-importing an unnamed point at the same coordinates does not duplicate it");

  // Skema tidak dikenal ditolak; paket yang foto atau acuannya rusak ditolak seluruhnya
  const pkgFile = (project, extra = []) => new File([zipM.buildZip([{ name: "project.json", data: enc(JSON.stringify(project)) }, ...extra])], "p.zip", { type: "application/zip" });
  await assert.rejects(readFieldFile(pkgFile({ schema: "orebit-geoatlas-field-v0", waypoints: [], photos: [], transect: [] })), (e) => e instanceof FieldImportError && e.key === "wpImportSchemaErr");
  const fpPhotoMeta = { id: "ph1", wpId: "w1", caption: "", azimuth: null, takenAt: "2026-11-22T06:00:00.000Z", w: 10, h: 10, bytes: 4096, file: "photos/WP-001_1.jpg" };
  const fpGood = {
    schema: FIELD_SCHEMA,
    app_version: "test",
    exported_at: "2026-11-23T00:00:00.000Z",
    view_hash: "",
    waypoints: [fpBase("w1", "2026-11-22T06:00:00.000Z", { kind: "structure", structType: "bedding", strike: 30, dip: 45, photos: ["ph1"] })],
    photos: [fpPhotoMeta],
    transect: [{ lng: 119.8, lat: -0.9 }],
  };
  const fpWithPhoto = [{ name: "photos/WP-001_1.jpg", data: fpPhoto }];
  const fpRead = await readFieldFile(pkgFile(fpGood, fpWithPhoto));
  assert.equal(fpRead.kind, "package");
  assert.deepEqual(fpRead.waypoints[0], fpGood.waypoints[0], "package waypoint restored field by field");
  assert.equal(fpRead.photos.length, 1);
  assert.equal(fpRead.photos[0].meta.file, undefined, "file path is not kept in photo meta");
  await assert.rejects(readFieldFile(pkgFile(fpGood)), (e) => e.key === "wpImportErr", "missing photo file rejects the whole package");
  await assert.rejects(readFieldFile(pkgFile({ ...fpGood, photos: [{ ...fpPhotoMeta, wpId: "zz" }] }, fpWithPhoto)), (e) => e.key === "wpImportErr", "photo pointing to unknown waypoint rejects");
  await assert.rejects(readFieldFile(pkgFile({ ...fpGood, waypoints: [{ ...fpGood.waypoints[0], kind: "lava" }] }, fpWithPhoto)), (e) => e.key === "wpImportErr", "unknown waypoint kind rejects");
  await assert.rejects(readFieldFile(new File([enc("bukan zip")], "rusak.zip")), (e) => e.key === "wpImportErr", "corrupt zip gives message, not a crash");
  await assert.rejects(readFieldFile(new File([enc("x")], "lain.kml")), (e) => e.key === "wpImportFormatErr");

  // Round-trip ekspor -> impor tanpa foto: setiap field waypoint dan lintasan kembali identik
  const fpRt = [fpBase("s1", "2026-11-22T06:00:00.000Z", { kind: "structure", structType: "fault", strike: 0, dip: 90 }), fpBase("o2", "2026-11-22T06:01:00.000Z", { note: '<b>"q" & x</b> ]]>', elevM: 12.5, accM: 8 })];
  const fpBuilt = await buildFieldPackage(fpRt, [{ lng: 119.8, lat: -0.9 }], "#map=9/-0.9/119.8");
  assert.match(fpBuilt.filename, /^orebit-lapangan-\d{4}-\d{2}-\d{2}\.zip$/);
  const fpBack = await readFieldFile(new File([fpBuilt.zip], fpBuilt.filename));
  assert.deepEqual(fpBack.waypoints, fpRt, "round-trip waypoints identical");
  assert.deepEqual(fpBack.transect, [{ lng: 119.8, lat: -0.9 }], "round-trip transect identical");
  const fpEntsOut = await unzipEntries(fpBuilt.zip.buffer);
  const fpGeo = JSON.parse(new TextDecoder().decode(fpEntsOut.get("waypoints.geojson")));
  assert.equal(fpGeo.features.length, 2);
  assert.ok(fpGeo.features.every((f) => f.geometry.type === "Point"), "GeoJSON: 2 Point features");
  const fpGpxOut = parseGpx(new TextDecoder().decode(fpEntsOut.get("waypoints.gpx")));
  assert.equal(fpGpxOut.length, 2, "exported GPX parses back");
  const fpKmz = await unzipEntries(fpBuilt.kmz.buffer);
  assert.equal(new TextDecoder().decode(fpKmz.get("doc.kml")).split("<Placemark>").length - 1, 2, "KMZ: one Placemark per waypoint");

  console.log("✓ app contracts PASS (real module imports: UTM, i18n parity, searchNationalIndex, transect math, state roundtrip, field package round-trip)");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
