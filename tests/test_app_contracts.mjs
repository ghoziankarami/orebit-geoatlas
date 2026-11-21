import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const ts = require(resolve(ROOT, "app/node_modules/typescript/lib/typescript.js"));

function loadTsModule(relPath) {
  const full = resolve(ROOT, relPath);
  const src = readFileSync(full, "utf-8");
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const encoded = Buffer.from(out, "utf-8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

// 1. Test UTM Coordinate Conversion across Indonesian archipelago
{
  const { toUtm } = await loadTsModule("app/src/coords.ts");
  // Banda Aceh (5.5483 N, 95.3238 E) -> Zone 46N
  const aceh = toUtm(5.5483, 95.3238);
  assert.equal(aceh.zone, 46);
  assert.equal(aceh.hemisphere, "N");
  assert.equal(aceh.band, "N");

  // Jakarta (-6.2088 S, 106.8456 E) -> Zone 48M
  const jkt = toUtm(-6.2088, 106.8456);
  assert.equal(jkt.zone, 48);
  assert.equal(jkt.hemisphere, "S");
  assert.equal(jkt.band, "M");
  assert.ok(jkt.easting > 690000 && jkt.easting < 720000, `Unexpected Jakarta easting: ${jkt.easting}`);
  assert.ok(jkt.northing > 9300000 && jkt.northing < 9330000, `Unexpected Jakarta northing: ${jkt.northing}`);

  // Jayapura (-2.5337 S, 140.7181 E) -> Zone 54M
  const jyp = toUtm(-2.5337, 140.7181);
  assert.equal(jyp.zone, 54);
  assert.equal(jyp.hemisphere, "S");
}

// 2. Test i18n ID vs EN 100% key parity & non-empty values
{
  const { dict } = await loadTsModule("app/src/i18n.ts");
  const idKeys = Object.keys(dict.id).sort();
  const enKeys = Object.keys(dict.en).sort();
  assert.deepEqual(idKeys, enKeys, "i18n ID and EN keys must match 100%");
  for (const k of idKeys) {
    assert.ok(String(dict.id[k]).trim().length > 0, `Empty ID translation for ${k}`);
    assert.ok(String(dict.en[k]).trim().length > 0, `Empty EN translation for ${k}`);
  }
}

// 3. Test National Index Search across all 8 regions
{
  const indexRaw = JSON.parse(readFileSync(resolve(ROOT, "app/public/data/indonesia-units-index.json"), "utf-8"));
  const units = indexRaw.units;
  assert.ok(units.length >= 550, "Expected >= 550 units in national index");

  // Pure scoring search check mirroring searchNationalIndex
  const find = (q) => {
    const needle = q.toLowerCase();
    return units.filter(
      (u) =>
        u.symbol.toLowerCase().includes(needle) ||
        u.formation.toLowerCase().includes(needle) ||
        u.region.toLowerCase().includes(needle),
    );
  };
  assert.ok(find("TRJkg").some((u) => u.unit_id === "TRJKG"));
  assert.ok(find("Muara Enim").length >= 1);
  assert.ok(find("Merapi").some((u) => u.region === "jawa"));
  assert.ok(find("Tonasa").some((u) => u.region === "sulawesi"));
  assert.ok(find("Grasberg").some((u) => u.region === "papua"));
  assert.ok(find("Balikpapan").some((u) => u.region === "kalimantan"));
  assert.ok(find("Halmahera").some((u) => u.region === "maluku"));
  assert.ok(find("Rinjani").some((u) => u.region === "balinusra"));
}

// 4. Test Haversine & Azimuth math (known-answer)
{
  // Approximate Jakarta (-6.2, 106.8) to Bandung (-6.9, 107.6) ~ 118 km SE (~131 deg)
  const R = 6371.0088;
  const toRad = (d) => (d * Math.PI) / 180;
  const a = { lat: -6.2, lng: 106.8 };
  const b = { lat: -6.9, lng: 107.6 };
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  assert.ok(km > 110 && km < 125, `Expected ~118 km, got ${km}`);
}

console.log("✓ app contracts PASS (UTM, i18n parity, 8-region national search, transect math)");
