// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Paket Lapangan: satu zip (project.json sebagai sumber impor, GeoJSON, GPX, CSV, foto, README) dan KMZ untuk Google Earth.
// Impor: paket dengan skema orebit-geoatlas-field-v1 (gabung per id, konfirmasi bila menimpa), atau GPX/CSV/GeoJSON pihak ketiga
// (waypoint baru; baris yang sama persis dengan yang sudah ada dilewati). Skema lain ditolak; tidak ada data yang berubah bila galat.
import { esc } from "./detail";
import { t, type Key } from "./i18n";
import { deletePhotos, getPhoto, listPhotoMeta, putPhoto, type PhotoMeta } from "./photos";
import { csvRow, CSV_HEADER, hasAttitude, kindOf, nextName, STRUCT_TYPES, WP_KINDS, attitudeText, toGpx, type StructType, type Waypoint, type WpKind } from "./waypoints";
import type { TransectPoint } from "./transect";
import { unzipEntries } from "./shp_import";
import { buildZip, type ZipEntry } from "./zip";

export const FIELD_SCHEMA = "orebit-geoatlas-field-v1";
const APP_VERSION = "orebit-geoatlas-app/0.1.0";
const BACKUP_KEY = "geoatlas.backup.v1";

export interface PackagePhoto extends PhotoMeta {
  /** Path di dalam zip, mis. photos/WP-001_1.jpg. */
  file: string;
}

export class FieldImportError extends Error {
  constructor(readonly key: Key) {
    super(key);
  }
}

// ---------- Ekspor ----------

interface PhotoItem {
  meta: PhotoMeta;
  blob: Blob;
  file: string;
}

const safeBase = (name: string) => name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "WP";
const htmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xmlEsc = htmlEsc;

/** Foto yang benar-benar terbaca dari IndexedDB; yang hilang dihitung, tidak diekspor. */
async function collectPhotos(wps: readonly Waypoint[]): Promise<{ items: Map<string, PhotoItem[]>; missing: number }> {
  const items = new Map<string, PhotoItem[]>();
  const used = new Set<string>();
  let missing = 0;
  for (const w of wps) {
    if (!w.photos?.length) continue;
    const metas = new Map((await listPhotoMeta(w.id)).map((m) => [m.id, m] as const));
    const list: PhotoItem[] = [];
    for (const pid of w.photos) {
      const meta = metas.get(pid);
      const blob = meta ? await getPhoto(pid) : null;
      if (!meta || !blob) {
        missing++;
        continue;
      }
      const base = `${safeBase(w.name)}_${list.length + 1}`;
      let file = `${base}.jpg`;
      for (let k = 2; used.has(file); k++) file = `${base}-${k}.jpg`;
      used.add(file);
      list.push({ meta, blob, file });
    }
    items.set(w.id, list);
  }
  return { items, missing };
}

function toGeojson(wps: readonly Waypoint[], paths: ReadonlyMap<string, readonly string[]>): string {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      name: "orebit-waypoints",
      features: wps.map((w) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [w.lng, w.lat] },
        properties: {
          id: w.id,
          name: w.name,
          kind: kindOf(w),
          structType: hasAttitude(w) ? w.structType ?? "bedding" : null,
          strike: hasAttitude(w) ? w.strike : null,
          dip: hasAttitude(w) ? w.dip : null,
          note: w.note,
          unit: w.unit,
          symbol: w.symbol,
          elev_m: w.elevM,
          accuracy_m: w.accM,
          time: w.time,
          photos: paths.get(w.id) ?? [],
        },
      })),
    },
    null,
    2,
  );
}

function toPackageCsv(wps: readonly Waypoint[], paths: ReadonlyMap<string, readonly string[]>): string {
  return CSV_HEADER + ",photos\n" + wps.map((w) => `${csvRow(w)},"${(paths.get(w.id) ?? []).join(";")}"`).join("\n") + "\n";
}

function readme(exportedAt: string): string {
  return [
    "Paket Lapangan Orebit GeoAtlas",
    `Dibuat: ${exportedAt}`,
    `Skema: ${FIELD_SCHEMA}`,
    "",
    "Isi:",
    "- project.json      data lengkap; dipakai untuk membuka kembali di GeoAtlas",
    "- waypoints.geojson titik untuk QGIS atau ogrinfo",
    "- waypoints.gpx     titik GPX 1.1; foto tertaut lewat <link>",
    "- waypoints.csv     tabel titik; kolom photos dipisah ';'",
    "- photos/           foto lapangan (JPEG, sisi terpanjang maks. 1600 px)",
    "- waypoints.kmz     diunduh terpisah untuk Google Earth",
    "",
    "Sumber data geologi: Peta Geologi, Pusat Survei Geologi (PSG), Badan Geologi, Kementerian ESDM.",
    "Data mengikuti Lisensi Terbuka PSG: wajib mencantumkan atribusi dan dilarang dijual.",
    "Pengolahan: Orebit GeoAtlas (GPL-3.0-only).",
    "",
  ].join("\n");
}

function buildKml(wps: readonly Waypoint[], items: ReadonlyMap<string, PhotoItem[]>): string {
  const placemarks = wps
    .map((w) => {
      const photos = (items.get(w.id) ?? []).map((p) => `<p><img src="files/${htmlEsc(p.file)}" width="260"/></p>`).join("");
      const att = attitudeText(w);
      const lines = [att && `${w.structType ?? "bedding"} ${att}`, w.note, w.unit && `${w.unit}${w.symbol ? ` (${w.symbol})` : ""}`, w.accM !== null ? `±${Math.round(w.accM)} m` : ""]
        .filter(Boolean)
        .map((l) => esc(l))
        .join("<br/>");
      // Teks pengguna di-escape lalu dibungkus CDATA; "]]>" dipecah agar CDATA tidak tertutup lebih awal.
      const html = `${lines}${photos}`.replace(/]]>/g, "]]]]><![CDATA[>");
      return `<Placemark><name>${xmlEsc(w.name)}</name><description><![CDATA[${html}]]></description><Point><coordinates>${w.lng.toFixed(7)},${w.lat.toFixed(7)},0</coordinates></Point></Placemark>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Orebit GeoAtlas - Waypoint lapangan</name>${placemarks}</Document></kml>\n`;
}

export interface BuiltPackage {
  zip: Uint8Array<ArrayBuffer>;
  kmz: Uint8Array<ArrayBuffer>;
  filename: string;
  kmzFilename: string;
  /** Foto yang tercatat di waypoint tetapi tidak ditemukan di perangkat; tidak ikut diekspor. */
  missing: number;
}

export async function buildFieldPackage(wps: readonly Waypoint[], transect: readonly TransectPoint[], viewHash: string, now: Date = new Date()): Promise<BuiltPackage> {
  const { items, missing } = await collectPhotos(wps);
  const paths = new Map<string, string[]>();
  for (const [wid, list] of items) paths.set(wid, list.map((p) => `photos/${p.file}`));
  // Waypoint yang diekspor hanya merujuk foto yang benar-benar ada di paket.
  const exported: Waypoint[] = wps.map((w) => (w.photos ? { ...w, photos: (items.get(w.id) ?? []).map((p) => p.meta.id) } : { ...w }));
  const flat = [...items.values()].flat();
  const exportedAt = now.toISOString();
  const project = {
    schema: FIELD_SCHEMA,
    app_version: APP_VERSION,
    exported_at: exportedAt,
    view_hash: viewHash,
    waypoints: exported,
    photos: flat.map((p): PackagePhoto => ({ ...p.meta, file: `photos/${p.file}` })),
    transect: transect.map((p) => ({ lng: p.lng, lat: p.lat })),
  };
  const photoBytes = await Promise.all(flat.map(async (p) => new Uint8Array(await p.blob.arrayBuffer())));
  const entries: ZipEntry[] = [
    { name: "project.json", data: enc(JSON.stringify(project, null, 2)) },
    { name: "waypoints.geojson", data: enc(toGeojson(exported, paths)) },
    { name: "waypoints.gpx", data: enc(toGpx(exported, paths)) },
    { name: "waypoints.csv", data: enc(toPackageCsv(exported, paths)) },
    { name: "README.txt", data: enc(readme(exportedAt)) },
    ...flat.map((p, i): ZipEntry => ({ name: `photos/${p.file}`, data: photoBytes[i] })),
  ];
  const kmzEntries: ZipEntry[] = [{ name: "doc.kml", data: enc(buildKml(exported, items)) }, ...flat.map((p, i): ZipEntry => ({ name: `files/${p.file}`, data: photoBytes[i] }))];
  const stamp = exportedAt.slice(0, 10);
  return {
    zip: buildZip(entries, now),
    kmz: buildZip(kmzEntries, now),
    filename: `orebit-lapangan-${stamp}.zip`,
    kmzFilename: `orebit-lapangan-${stamp}.kmz`,
    missing,
  };
}

const enc = (s: string) => new TextEncoder().encode(s);

// ---------- Pembacaan ----------

export interface Incoming {
  kind: "package" | "external";
  waypoints: Waypoint[];
  photos: Array<{ meta: PhotoMeta; blob: Blob }>;
  transect: TransectPoint[];
}

const KNOWN_WP_KEYS = new Set(["id", "name", "note", "kind", "structType", "strike", "dip", "lat", "lng", "elevM", "accM", "unit", "symbol", "time", "photos"]);
const bad = (): never => {
  throw new FieldImportError("wpImportErr");
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finiteOrNull = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) return bad();
  return v;
};
const str = (v: unknown): string => (typeof v === "string" ? v : bad());
const validTime = (v: unknown): string => {
  const s = str(v);
  if (!Number.isFinite(Date.parse(s))) bad();
  return s;
};

/** Validasi ketat satu waypoint dari paket. Field yang tidak dikenal dibuang; urutan field asli dipertahankan. */
function parseWaypoint(raw: unknown): Waypoint {
  if (!isObj(raw)) return bad();
  const clean: Record<string, unknown> = {
    id: str(raw.id),
    name: str(raw.name),
    note: str(raw.note),
    lat: finiteOrNull(raw.lat, -90, 90) ?? bad(),
    lng: finiteOrNull(raw.lng, -180, 180) ?? bad(),
    elevM: finiteOrNull(raw.elevM, -1000, 10000),
    accM: finiteOrNull(raw.accM, 0, 100000),
    unit: str(raw.unit),
    symbol: str(raw.symbol),
    time: validTime(raw.time),
  };
  if (raw.kind !== undefined) {
    if (!WP_KINDS.includes(raw.kind as WpKind)) bad();
    clean.kind = raw.kind;
  }
  if (raw.structType !== undefined) {
    if (!STRUCT_TYPES.includes(raw.structType as StructType)) bad();
    clean.structType = raw.structType;
  }
  if (raw.strike !== undefined) clean.strike = finiteOrNull(raw.strike, 0, 360);
  if (raw.dip !== undefined) clean.dip = finiteOrNull(raw.dip, 0, 90);
  if (raw.photos !== undefined) {
    if (!Array.isArray(raw.photos) || !raw.photos.every((p) => typeof p === "string" && p.length > 0)) bad();
    clean.photos = raw.photos;
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) if (KNOWN_WP_KEYS.has(k) && clean[k] !== undefined) out[k] = clean[k];
  return out as unknown as Waypoint;
}

function parsePhotoMeta(raw: unknown): PackagePhoto {
  if (!isObj(raw)) return bad();
  const azimuth = finiteOrNull(raw.azimuth, 0, 360);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : bad());
  return {
    id: str(raw.id),
    wpId: str(raw.wpId),
    caption: str(raw.caption),
    azimuth,
    takenAt: validTime(raw.takenAt),
    w: num(raw.w),
    h: num(raw.h),
    bytes: num(raw.bytes),
    file: str(raw.file),
  };
}

async function readPackage(buf: ArrayBuffer): Promise<Incoming> {
  let entries: Map<string, ArrayBuffer>;
  try {
    entries = await unzipEntries(buf);
  } catch {
    return bad();
  }
  const pj = entries.get("project.json");
  if (!pj) return bad();
  let project: unknown;
  try {
    project = JSON.parse(new TextDecoder().decode(pj));
  } catch {
    return bad();
  }
  if (!isObj(project)) return bad();
  if (project.schema !== FIELD_SCHEMA) throw new FieldImportError("wpImportSchemaErr");
  if (!Array.isArray(project.waypoints) || !Array.isArray(project.photos)) return bad();
  const waypoints = project.waypoints.map(parseWaypoint);
  const metas = project.photos.map(parsePhotoMeta);
  const wpPhotos = new Map(waypoints.map((w) => [w.id, new Set(w.photos ?? [])] as const));
  const referenced = new Set<string>();
  for (const w of waypoints) for (const pid of w.photos ?? []) referenced.add(pid);

  const photos: Array<{ meta: PhotoMeta; blob: Blob }> = [];
  for (const m of metas) {
    const refs = wpPhotos.get(m.wpId);
    if (!refs || !refs.has(m.id)) return bad();
    if (!/^photos\/[^/]+$/.test(m.file) || m.file.includes("..")) return bad();
    const data = entries.get(m.file);
    if (!data) return bad();
    const { file: _file, ...meta } = m;
    photos.push({ meta, blob: new Blob([data], { type: "image/jpeg" }) });
  }
  const haveMeta = new Set(metas.map((m) => m.id));
  for (const pid of referenced) if (!haveMeta.has(pid)) return bad();

  const transect: TransectPoint[] = [];
  if (Array.isArray(project.transect)) {
    for (const p of project.transect) {
      if (!isObj(p) || typeof p.lng !== "number" || typeof p.lat !== "number" || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return bad();
      transect.push({ lng: p.lng, lat: p.lat });
    }
  }
  return { kind: "package", waypoints, photos, transect };
}

const unxml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
const childText = (body: string, tag: string): string => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(body);
  return m ? unxml(m[1]) : "";
};

/** GPX: <wpt lat lon> dengan <name>, <ele>, <time>, <desc>/<cmt>. Jejak (<trk>) tidak diimpor. */
export function parseGpx(text: string): Waypoint[] {
  if (!/<gpx[\s>]/.test(text)) return bad();
  const out: Waypoint[] = [];
  const re = /<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const lat = Number(/\blat\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1]);
    const lng = Number(/\blon\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const ele = Number(childText(body, "ele"));
    const time = Date.parse(childText(body, "time"));
    out.push(externalWaypoint({
      name: childText(body, "name"),
      note: childText(body, "desc") || childText(body, "cmt"),
      lat,
      lng,
      elevM: childText(body, "ele") !== "" && Number.isFinite(ele) ? ele : null,
      time: Number.isFinite(time) ? new Date(time).toISOString() : undefined,
    }));
  }
  return out;
}

/** CSV dengan baris judul. Kolom dikenali dari nama header (lat/lon wajib); baris tanpa koordinat valid dilewati. */
export function parseCsv(text: string): Waypoint[] {
  const rows = parseCsvRows(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return bad();
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const cName = col("name", "nama", "waypoint", "title");
  const cLat = col("lat", "latitude", "y");
  const cLon = col("lon", "lng", "long", "longitude", "x");
  const cEle = col("elev_m", "elevation", "ele", "altitude", "alt");
  const cNote = col("note", "notes", "description", "desc", "catatan");
  const cTime = col("time", "timestamp", "date");
  if (cLat < 0 || cLon < 0) return bad();
  const out: Waypoint[] = [];
  for (const r of rows.slice(1)) {
    const lat = Number(r[cLat]);
    const lng = Number(r[cLon]);
    if (r[cLat]?.trim() === "" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const ele = cEle >= 0 && r[cEle]?.trim() !== "" ? Number(r[cEle]) : NaN;
    const time = cTime >= 0 ? Date.parse(r[cTime] ?? "") : NaN;
    out.push(
      externalWaypoint({
        name: cName >= 0 ? (r[cName] ?? "").trim() : "",
        note: cNote >= 0 ? (r[cNote] ?? "").trim() : "",
        lat,
        lng,
        elevM: Number.isFinite(ele) ? ele : null,
        time: Number.isFinite(time) ? new Date(time).toISOString() : undefined,
      }),
    );
  }
  return out;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** GeoJSON: hanya Point; properti name/title dan note/description dibaca bila ada. */
export function parseGeojson(text: string): Waypoint[] {
  let fc: unknown;
  try {
    fc = JSON.parse(text);
  } catch {
    return bad();
  }
  if (!isObj(fc) || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) return bad();
  const out: Waypoint[] = [];
  for (const f of fc.features) {
    if (!isObj(f) || !isObj(f.geometry) || f.geometry.type !== "Point" || !Array.isArray(f.geometry.coordinates)) continue;
    const [lng, lat, alt] = f.geometry.coordinates as unknown[];
    if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const p = isObj(f.properties) ? f.properties : {};
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    out.push(
      externalWaypoint({
        name: s(p.name) || s(p.title),
        note: s(p.note) || s(p.description),
        lat,
        lng,
        elevM: typeof alt === "number" && Number.isFinite(alt) ? alt : null,
        time: typeof p.time === "string" && Number.isFinite(Date.parse(p.time)) ? new Date(Date.parse(p.time)).toISOString() : undefined,
      }),
    );
  }
  return out;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Waypoint pihak ketiga: jenis "other", nama kosong dibiarkan dan diberi nomor saat digabung. */
function externalWaypoint(v: { name: string; note: string; lat: number; lng: number; elevM: number | null; time?: string }): Waypoint {
  return {
    id: newId(),
    name: v.name,
    note: v.note,
    kind: "other",
    lat: v.lat,
    lng: v.lng,
    elevM: v.elevM,
    accM: null,
    unit: "",
    symbol: "",
    time: v.time ?? new Date().toISOString(),
  };
}

/** Membaca berkas impor menurut ekstensinya. Galat dilempar sebagai FieldImportError dengan kunci pesan. */
export async function readFieldFile(file: File): Promise<Incoming> {
  const name = file.name.toLowerCase();
  const external = (waypoints: Waypoint[]): Incoming => ({ kind: "external", waypoints, photos: [], transect: [] });
  if (name.endsWith(".zip")) return readPackage(await file.arrayBuffer());
  let text: string;
  try {
    text = await file.text();
  } catch {
    return bad();
  }
  if (name.endsWith(".gpx")) return external(parseGpx(text));
  if (name.endsWith(".csv")) return external(parseCsv(text));
  if (name.endsWith(".geojson") || name.endsWith(".json")) return external(parseGeojson(text));
  throw new FieldImportError("wpImportFormatErr");
}

// ---------- Penggabungan ----------

/** Kanonik untuk membandingkan dua waypoint tanpa terpengaruh urutan field. */
const canon = (w: Waypoint) => JSON.stringify(Object.keys(w).sort().map((k) => [k, (w as unknown as Record<string, unknown>)[k]]));

export interface MergePlan {
  next: Waypoint[];
  added: number;
  updated: number;
  skipped: number;
  /** Id waypoint yang ditambahkan atau diganti; hanya foto mereka yang perlu ditulis. */
  touched: Set<string>;
  /** Versi lokal yang diganti oleh paket; fotonya dibersihkan bila tidak lagi dipakai. */
  replaced: Waypoint[];
}

/**
 * Paket: id sama -> versi dengan `time` lebih baru menang (isi identik dilewati); id baru ditambahkan.
 * Pihak ketiga: ditambahkan sebagai waypoint baru, kecuali sudah ada dengan nama dan koordinat yang sama persis.
 */
export function mergeWaypoints(local: readonly Waypoint[], incoming: readonly Waypoint[], kind: "package" | "external"): MergePlan {
  const next = local.slice();
  const byId = new Map(next.map((w, i) => [w.id, i] as const));
  const dupKeys = new Set(local.map((w) => `${w.name}|${w.lat.toFixed(7)}|${w.lng.toFixed(7)}`));
  // Titik tanpa nama dicocokkan lewat koordinat saja: nama barunya dibuat saat digabung, jadi impor ulang tidak menggandakannya.
  const coordKeys = new Set(local.map((w) => `${w.lat.toFixed(7)}|${w.lng.toFixed(7)}`));
  const plan: MergePlan = { next, added: 0, updated: 0, skipped: 0, touched: new Set(), replaced: [] };
  for (const inc of incoming) {
    if (kind === "package") {
      const i = byId.get(inc.id);
      if (i === undefined) {
        next.push(inc);
        byId.set(inc.id, next.length - 1);
        plan.added++;
        plan.touched.add(inc.id);
      } else if (Date.parse(inc.time) > Date.parse(next[i].time) && canon(inc) !== canon(next[i])) {
        plan.replaced.push(next[i]);
        next[i] = inc;
        plan.updated++;
        plan.touched.add(inc.id);
      } else plan.skipped++;
      continue;
    }
    const coord = `${inc.lat.toFixed(7)}|${inc.lng.toFixed(7)}`;
    const key = `${inc.name}|${coord}`;
    if (inc.name === "" ? coordKeys.has(coord) : dupKeys.has(key)) {
      plan.skipped++;
      continue;
    }
    dupKeys.add(key);
    coordKeys.add(coord);
    const w = { ...inc, name: inc.name || nextName(next) };
    dupKeys.add(`${w.name}|${coord}`);
    next.push(w);
    plan.added++;
    plan.touched.add(w.id);
  }
  return plan;
}

// ---------- Pengendali UI ----------

export interface FieldPkgHost {
  all(): readonly Waypoint[];
  commit(next: Waypoint[]): void;
  close(): void;
}

export interface FieldPkgOpts {
  host: FieldPkgHost;
  transect: { points(): TransectPoint[]; set(pts: TransectPoint[]): void };
  toast(msg: string): void;
  saveBlob(blob: Blob, filename: string): void;
  confirm?: (msg: string) => boolean;
}

const samePts = (a: readonly TransectPoint[], b: readonly TransectPoint[]) => a.length === b.length && a.every((p, i) => p.lng === b[i].lng && p.lat === b[i].lat);

function loadBackupAt(): string | null {
  try {
    const v = (JSON.parse(localStorage.getItem(BACKUP_KEY) || "{}") as { lastBackupAt?: unknown }).lastBackupAt;
    return typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

function markBackup() {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ lastBackupAt: new Date().toISOString() }));
  } catch {
    /* penyimpanan diblokir: pengingat cadangan tidak tersimpan */
  }
}

/** Menghubungkan tombol Paket Lapangan di panel waypoint. Tidak menyentuh tombol GPX/CSV yang lama. */
export function createFieldPackage(opts: FieldPkgOpts) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const pkgBtn = $<HTMLButtonElement>("wpExportPkg");
  const kmzBtn = $<HTMLButtonElement>("wpExportKmz");
  const shareBtn = $<HTMLButtonElement>("wpShare");
  const importBtn = $<HTMLButtonElement>("wpImport");
  const importIn = $<HTMLInputElement>("wpImportFile");
  const note = $<HTMLElement>("wpBackupNote");
  const confirm = opts.confirm ?? ((m: string) => window.confirm(m));

  const canShareFiles = (() => {
    try {
      return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([new Blob(["x"])], "x.zip", { type: "application/zip" })] });
    } catch {
      return false;
    }
  })();
  shareBtn.hidden = !canShareFiles;

  const build = async () => {
    const built = await buildFieldPackage(opts.host.all(), opts.transect.points(), location.hash);
    if (built.missing) opts.toast(t("wpPkgMissingPhotos").replace("{n}", String(built.missing)));
    return built;
  };

  pkgBtn.addEventListener("click", async () => {
    try {
      const b = await build();
      opts.saveBlob(new Blob([b.zip], { type: "application/zip" }), b.filename);
      markBackup();
      refresh();
    } catch {
      opts.toast(t("wpPkgFailed"));
    }
  });
  kmzBtn.addEventListener("click", async () => {
    try {
      const b = await build();
      opts.saveBlob(new Blob([b.kmz], { type: "application/vnd.google-earth.kmz" }), b.kmzFilename);
    } catch {
      opts.toast(t("wpPkgFailed"));
    }
  });
  // Bagikan: bila gagal atau tidak didukung saat diklik, berkas diunduh; pembatalan pengguna bukan galat.
  shareBtn.addEventListener("click", async () => {
    try {
      const b = await build();
      const file = new File([b.zip], b.filename, { type: "application/zip" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: b.filename });
          markBackup();
          refresh();
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      opts.saveBlob(file, b.filename);
      markBackup();
      refresh();
    } catch {
      opts.toast(t("wpPkgFailed"));
    }
  });

  importBtn.addEventListener("click", () => importIn.click());
  importIn.addEventListener("change", async () => {
    const f = importIn.files?.[0];
    importIn.value = "";
    if (!f) return;
    try {
      await importFile(f);
    } catch (e) {
      opts.toast(t(e instanceof FieldImportError ? e.key : "wpImportErr"));
    }
  });

  async function importFile(f: File) {
    const incoming = await readFieldFile(f);
    if (!incoming.waypoints.length && !incoming.transect.length) return opts.toast(t("wpImportNone"));
    const local = opts.host.all();
    const plan = mergeWaypoints(local, incoming.waypoints, incoming.kind);
    const localPts = opts.transect.points();
    const transectOverwrite = incoming.transect.length > 0 && localPts.length > 0 && !samePts(localPts, incoming.transect);
    if (plan.updated > 0 || transectOverwrite) {
      const parts: string[] = [];
      if (plan.updated > 0) parts.push(t("wpImportConfirmWp").replace("{u}", String(plan.updated)));
      if (transectOverwrite) parts.push(t("wpImportConfirmTr"));
      if (!confirm(parts.join(" "))) return;
    }

    // Foto ditulis lebih dulu; bila satu gagal, yang sudah tersimpan dihapus dan data waypoint tidak diubah.
    const stored: string[] = [];
    for (const p of incoming.photos) {
      if (!plan.touched.has(p.meta.wpId)) continue;
      if (!(await putPhoto(p.blob, p.meta))) {
        await deletePhotos(stored);
        return;
      }
      stored.push(p.meta.id);
    }
    opts.host.close();
    opts.host.commit(plan.next);
    const keep = new Set(plan.next.flatMap((w) => w.photos ?? []));
    const orphans = plan.replaced.flatMap((w) => w.photos ?? []).filter((id) => !keep.has(id));
    if (orphans.length) await deletePhotos(orphans);
    if (incoming.transect.length) opts.transect.set(incoming.transect);
    opts.toast(t("wpImportDone").replace("{a}", String(plan.added)).replace("{u}", String(plan.updated)).replace("{s}", String(plan.skipped)));
    refresh();
  }

  /** Label, status tombol, dan pengingat cadangan. Dipanggil setiap daftar waypoint berubah atau bahasa berganti. */
  function refresh() {
    const wps = opts.host.all();
    const last = loadBackupAt();
    const due = wps.length > 0 && (last === null || wps.some((w) => Date.parse(w.time) > Date.parse(last)));
    pkgBtn.textContent = t("wpExportPkg");
    kmzBtn.textContent = t("wpExportKmz");
    shareBtn.textContent = t("wpShare");
    importBtn.textContent = t("wpImport");
    pkgBtn.toggleAttribute("disabled", wps.length === 0);
    kmzBtn.toggleAttribute("disabled", wps.length === 0);
    shareBtn.toggleAttribute("disabled", wps.length === 0);
    pkgBtn.classList.toggle("wp-due", due);
    note.hidden = wps.length === 0;
    note.textContent = last ? `${t("wpBackupLast").replace("{d}", new Date(last).toLocaleString())}${due ? ` · ${t("wpBackupDue")}` : ""}` : `${t("wpBackupNone")} ${t("wpBackupDue")}`;
  }

  refresh();
  return { refresh };
}
