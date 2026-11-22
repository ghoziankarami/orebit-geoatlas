// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
/**
 * Geological cross-section model (pure functions, no DOM).
 *
 * Construction follows standard map-to-section practice:
 *  - surface units come from the geology sampled along the line (youngest/oldest by age);
 *  - a contact between two units is classified from the data: a MAPPED fault, an intrusive
 *    contact, an unconformity (age hiatus) or a conformable (depositional) contact;
 *  - planes are projected to depth with their APPARENT dip in the section plane,
 *    tan(apparent) = tan(true dip) * |sin(beta)|, beta = angle between plane strike and section azimuth;
 *  - where no dip is measured the plane is drawn vertical (contacts) or with a stated assumed dip
 *    (faults, intrusions), and flagged as assumed. Nothing about depth is invented beyond that.
 */

export type ContactKind = "fault" | "intrusive" | "unconformity" | "conformable";
export type DipToward = "A" | "B";

export interface SectionSample {
  elevM: number | null;
  label: string;
  symbol: string;
  color: string;
  lithClass: string;
  ageBaseMa: number;
  ageTopMa: number;
}

export interface MappedStructure {
  frac: number;
  km: number;
  type: string;
  /** Strike azimuth of the mapped trace at the crossing (0..360), if known. */
  strikeAz?: number | null;
}

export interface AttitudeOverride {
  kind?: ContactKind;
  dipDeg?: number;
  toward?: DipToward;
  strikeAz?: number | null;
}

export interface Boundary {
  id: string;
  fracX: number;
  kind: ContactKind;
  trueDipDeg: number;
  apparentDipDeg: number;
  toward: DipToward;
  /** true when the dip is a default, not a measurement */
  assumed: boolean;
  strikeAz: number | null;
  hiatusMa: number | null;
  mapped: boolean;
  /** younger unit label first, for the attitude table */
  between: [string, string];
}

export interface SectionUnitRun {
  startIdx: number;
  endIdx: number;
  label: string;
  symbol: string;
  color: string;
  lithClass: string;
  ageBaseMa: number;
  ageTopMa: number;
}

export interface SectionModel {
  runs: SectionUnitRun[];
  boundaries: Boundary[];
  /** run index for each slot (boundaries.length + 1 slots, left to right) */
  slotRun: number[];
}

export const DEFAULT_DIP: Record<ContactKind, number> = {
  fault: 60,
  intrusive: 75,
  unconformity: 90,
  conformable: 90,
};

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const isSea = (s: { label: string }) => /laut|sea|unmapped|offshore/i.test(s.label);
const isPlutonic = (lith: string) => lith.startsWith("plutonic");

/** Apparent dip (deg) in a vertical section for a plane of given true dip and strike. */
export function apparentDip(trueDipDeg: number, strikeAz: number | null, sectionAz: number): number {
  const d = Math.max(0, Math.min(90, trueDipDeg));
  if (d >= 89.999) return 90;
  if (strikeAz === null || !Number.isFinite(strikeAz)) return d; // strike unknown: assume section is perpendicular to strike
  const beta = toRad(strikeAz - sectionAz);
  const ap = toDeg(Math.atan(Math.tan(toRad(d)) * Math.abs(Math.sin(beta))));
  return Math.max(1, ap);
}

/** Azimuth (deg, 0..360) of the direction from point a to b on a map (lng/lat, small distances). */
export function lineAzimuth(ax: number, ay: number, bx: number, by: number): number {
  const dx = (bx - ax) * Math.cos(toRad((ay + by) / 2));
  const dy = by - ay;
  return (toDeg(Math.atan2(dx, dy)) + 360) % 360;
}

export function classifyContact(
  a: Pick<SectionUnitRun, "lithClass" | "ageBaseMa" | "ageTopMa">,
  b: Pick<SectionUnitRun, "lithClass" | "ageBaseMa" | "ageTopMa">,
  mappedFault: boolean,
): { kind: ContactKind; hiatusMa: number | null } {
  if (mappedFault) return { kind: "fault", hiatusMa: null };
  if (isPlutonic(a.lithClass) !== isPlutonic(b.lithClass)) return { kind: "intrusive", hiatusMa: null };
  const younger = a.ageBaseMa <= b.ageBaseMa ? a : b;
  const older = younger === a ? b : a;
  // Hiatus = gap between the top of the older unit and the base of the younger unit.
  const gap = older.ageTopMa - younger.ageBaseMa;
  if (gap >= 2) return { kind: "unconformity", hiatusMa: Number(gap.toFixed(1)) };
  return { kind: "conformable", hiatusMa: null };
}

export function buildRuns(samples: readonly SectionSample[]): SectionUnitRun[] {
  const runs: SectionUnitRun[] = [];
  samples.forEach((s, i) => {
    const last = runs[runs.length - 1];
    if (last && last.label === s.label && last.symbol === s.symbol) last.endIdx = i;
    else
      runs.push({
        startIdx: i, endIdx: i, label: s.label, symbol: s.symbol, color: s.color,
        lithClass: s.lithClass, ageBaseMa: s.ageBaseMa, ageTopMa: s.ageTopMa,
      });
  });
  return runs;
}

/**
 * Build the contact list. Faults come only from structures mapped on the map layers
 * (never inferred from an age jump); an age jump without a mapped fault is an unconformity or contact.
 */
export function buildSectionModel(
  samples: readonly SectionSample[],
  structures: readonly MappedStructure[],
  sectionAz: number,
  overrides: Readonly<Record<string, AttitudeOverride>> = {},
): SectionModel {
  const runs = buildRuns(samples);
  const n = Math.max(1, samples.length - 1);
  const tol = 1.6 / n;
  const faults = structures.filter((s) => !/lipat|fold|anti|syn/i.test(s.type));
  const used = new Set<number>();
  const draft: Array<{ frac: number; kind: ContactKind; hiatus: number | null; mapped: boolean; strike: number | null; between: [string, string] }> = [];

  for (let i = 1; i < runs.length; i++) {
    const a = runs[i - 1];
    const b = runs[i];
    if (isSea(a) || isSea(b)) continue;
    const frac = (a.endIdx + b.startIdx) / 2 / n;
    const fi = faults.findIndex((f, idx) => !used.has(idx) && Math.abs(f.frac - frac) <= tol);
    if (fi >= 0) used.add(fi);
    const c = classifyContact(a, b, fi >= 0);
    const younger = a.ageBaseMa <= b.ageBaseMa ? a : b;
    const older = younger === a ? b : a;
    draft.push({
      frac, kind: c.kind, hiatus: c.hiatusMa, mapped: fi >= 0,
      strike: fi >= 0 ? faults[fi].strikeAz ?? null : null,
      between: [younger.label, older.label],
    });
  }
  // Mapped faults that do not coincide with a unit change (they cut through one unit).
  faults.forEach((f, idx) => {
    if (used.has(idx)) return;
    const run = runs.find((r) => f.frac * n >= r.startIdx && f.frac * n <= r.endIdx);
    if (run && isSea(run)) return;
    draft.push({ frac: f.frac, kind: "fault", hiatus: null, mapped: true, strike: f.strikeAz ?? null, between: [run?.label ?? "", run?.label ?? ""] });
  });
  draft.sort((p, q) => p.frac - q.frac);

  const boundaries: Boundary[] = draft.map((d, idx) => {
    const id = `c${Math.round(d.frac * 1000)}`;
    const ov = overrides[id] ?? {};
    const kind = ov.kind ?? d.kind;
    const strikeAz = ov.strikeAz !== undefined ? ov.strikeAz : d.strike;
    const dipSet = typeof ov.dipDeg === "number" && Number.isFinite(ov.dipDeg);
    const trueDip = dipSet ? Math.max(1, Math.min(90, ov.dipDeg as number)) : DEFAULT_DIP[kind];
    // Default dip direction: a dipping depositional contact dips toward the younger unit (older beds lie beneath it);
    // otherwise toward the end of the section.
    const toward: DipToward = ov.toward ?? "B";
    return {
      id, fracX: d.frac, kind, trueDipDeg: trueDip,
      apparentDipDeg: apparentDip(trueDip, strikeAz, sectionAz), toward,
      assumed: !dipSet, strikeAz, hiatusMa: d.hiatus, mapped: d.mapped, between: d.between,
    };
  });

  const slotRun: number[] = [];
  const edges = [0, ...boundaries.map((b) => b.fracX), 1];
  for (let s = 0; s < edges.length - 1; s++) {
    const mid = ((edges[s] + edges[s + 1]) / 2) * n;
    const k = runs.findIndex((r) => mid >= r.startIdx - 0.5 && mid <= r.endIdx + 0.5);
    slotRun.push(k >= 0 ? k : 0);
  }
  return { runs, boundaries, slotRun };
}

export interface LayoutGeometry {
  padL: number;
  plotW: number;
  pxPerKm: number;
  pxPerM: number;
  yTop: number;
  yFloor: number;
  /** pixel y of the topographic surface at a section fraction 0..1 */
  surfaceY: (frac: number) => number;
}

export interface LayoutSlot {
  slotIndex: number;
  run: number;
  left: Array<[number, number]>;
  right: Array<[number, number]>;
}

export interface LayoutBoundary {
  id: string;
  index: number;
  path: Array<[number, number]>;
}

const PRIORITY: Record<ContactKind, number> = { fault: 3, intrusive: 2, unconformity: 1, conformable: 0 };

/**
 * Project every contact to depth along its apparent dip and resolve crossings:
 * when two neighbouring planes meet, the unit between them pinches out and the
 * higher-priority plane (fault > intrusive > unconformity > conformable) continues.
 */
export function layoutSection(model: SectionModel, geo: LayoutGeometry, levels = 56): { slots: LayoutSlot[]; boundaries: LayoutBoundary[] } {
  const { boundaries, slotRun } = model;
  const xMin = geo.padL;
  const xMax = geo.padL + geo.plotW;
  const info = boundaries.map((b) => {
    const x0 = geo.padL + b.fracX * geo.plotW;
    const y0 = geo.surfaceY(b.fracX);
    const dir = b.toward === "B" ? 1 : -1;
    const cot = 1 / Math.tan(toRad(Math.min(89.9, b.apparentDipDeg)));
    // horizontal px moved per vertical px of depth
    const slope = b.apparentDipDeg >= 89.5 ? 0 : (dir * cot * (geo.pxPerKm / 1000)) / geo.pxPerM;
    return { x0, y0, slope };
  });
  const slots: LayoutSlot[] = slotRun.map((run, slotIndex) => ({ slotIndex, run, left: [], right: [] }));
  const paths: LayoutBoundary[] = boundaries.map((b, index) => ({ id: b.id, index, path: [] }));
  let liveB = boundaries.map((_, i) => i);
  let liveS = slots.map((_, i) => i); // slot i lies left of liveB[i]
  for (let l = 0; l <= levels; l++) {
    const y = geo.yTop + ((geo.yFloor - geo.yTop) * l) / levels;
    const xs = (): number[] => liveB.map((bi) => Math.max(xMin, Math.min(xMax, info[bi].x0 + info[bi].slope * (y - info[bi].y0))));
    let x = xs();
    let guard = 0;
    for (let i = 1; i < liveB.length && guard < 200; guard++) {
      if (x[i] <= x[i - 1] + 0.01) {
        // slot liveS[i] (between boundary i-1 and i) pinches out here
        const dropLeft = PRIORITY[boundaries[liveB[i - 1]].kind] < PRIORITY[boundaries[liveB[i]].kind];
        const dropIdx = dropLeft ? i - 1 : i;
        liveB.splice(dropIdx, 1);
        liveS.splice(i, 1);
        x = xs();
        i = Math.max(1, i - 1);
      } else i++;
    }
    liveS.forEach((si, k) => {
      const L = k === 0 ? xMin : x[k - 1];
      const R = k === liveB.length ? xMax : x[k];
      slots[si].left.push([L, y]);
      slots[si].right.push([R, y]);
    });
    liveB.forEach((bi, k) => paths[bi].path.push([x[k], y]));
  }
  return { slots, boundaries: paths };
}
