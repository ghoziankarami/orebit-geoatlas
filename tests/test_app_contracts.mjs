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
const modulesToCompile = ["config", "i18n", "timescale", "lithology", "layers", "state", "coords", "search", "detail", "transect"];

for (const name of modulesToCompile) {
  let src = readFileSync(resolve(ROOT, `app/src/${name}.ts`), "utf-8");
  src = src.replace(/import\.meta\.env/g, "globalThis.importMetaEnv");
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

  console.log("✓ app contracts PASS (real module imports: UTM, i18n parity, searchNationalIndex, transect math, state roundtrip)");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
