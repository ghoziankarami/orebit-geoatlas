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
const modulesToCompile = ["config", "i18n", "timescale", "lithology", "layers", "state", "coords", "search", "detail", "transect", "section_model", "shp_import", "gps", "waypoints", "detail", "install"];

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

  // 10. PWA install context: pure UA + standalone classification (>= 8 UAs)
  const { detectInstallContext } = await import(join(tempDir, "install.mjs"));
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
  const installCases = [
    [`${IPHONE} Version/17.5 Mobile/15E148 Safari/604.1`, false, "ios-safari"],
    [`${IPHONE} Version/17.5 Mobile/15E148 CriOS/126.0.6478.153 Safari/604.1`, false, "ios-other"],
    [`${IPHONE} Mobile/15E148 FxiOS/127.0 Safari/605.1.15`, false, "ios-other"],
    [`${IPHONE} Mobile/15E148 EdgiOS/126.0 Safari/604.1`, false, "ios-other"],
    [`${IPHONE} Mobile/15E148 LinkedInApp`, false, "in-app"],
    [`${IPHONE} Mobile/15E148 Line/14.0.0`, false, "in-app"],
    [`${ANDROID} [FBAN/MessengerForiOS;FBAV/450]`, false, "in-app"],
    [`${ANDROID.replace("Pixel 7)", "Pixel 7; wv)").replace("Chrome/126.0.0.0 Mobile Safari/537.36", "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36")}`, false, "in-app"],
    [`${ANDROID} Instagram 320.0.0.33.109 Android`, false, "in-app"],
    [`${ANDROID} WhatsApp/2.24`, false, "in-app"],
    [ANDROID, false, "prompt"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", false, "prompt"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", false, "unsupported"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", false, "unsupported"],
    [`${IPHONE} Version/17.5 Mobile/15E148 Safari/604.1`, true, "installed"],
    [ANDROID, true, "installed"],
    [`${IPHONE} Mobile/15E148 LinkedInApp`, true, "installed"],
  ];
  assert.ok(installCases.length >= 8);
  for (const [ua, standalone, expected] of installCases) {
    assert.equal(detectInstallContext(ua, standalone), expected, `UA: ${ua}`);
  }

  console.log("✓ app contracts PASS (real module imports: UTM, i18n parity, searchNationalIndex, transect math, state roundtrip)");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
