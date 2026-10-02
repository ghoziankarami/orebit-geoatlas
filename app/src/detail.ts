import type maplibregl from "maplibre-gl";
import { CONFIG } from "./config";
import { getLang, t } from "./i18n";
import { LITH_CLASSES } from "./lithology";
import { periodName } from "./timescale";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fmtMa = (top?: number, base?: number) => {
  if (top === undefined && base === undefined) return "";
  const f = (n?: number) => (n === undefined || Number.isNaN(n) ? "?" : n.toLocaleString(getLang(), { maximumFractionDigits: 4 }));
  return `${f(top)}–${f(base)} ${t("ma")}`;
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : Number(v));

function row(label: string, value: string) {
  return value ? `<div class="row"><dt>${esc(label)}</dt><dd>${value}</dd></div>` : "";
}

function swatch(color: unknown) {
  return `<span class="swatch" style="background:${esc(color || "#D9DEE1")}"></span>`;
}

function references(name: unknown) {
  const title = String(name || t("unnamed"));
  const exactName = `"${title}"`;
  const q = encodeURIComponent(`${exactName} geology Indonesia`);
  const officialQ = encodeURIComponent(`${exactName} site:geologi.esdm.go.id OR site:psg.geologi.esdm.go.id`);
  return `<details class="detail-more">
    <summary>${esc(t("moreReferences"))}</summary>
    <p>${esc(t("referenceSearchNote"))}</p>
    <div class="reference-links">
      <a href="https://scholar.google.com/scholar?q=${q}" target="_blank" rel="noopener">${esc(t("searchScholar"))}<span aria-hidden="true">↗</span></a>
      <a href="https://search.crossref.org/?q=${q}" target="_blank" rel="noopener">${esc(t("searchCrossref"))}<span aria-hidden="true">↗</span></a>
      <a href="https://www.google.com/search?q=${officialQ}" target="_blank" rel="noopener">${esc(t("searchOfficial"))}<span aria-hidden="true">↗</span></a>
    </div>
  </details>`;
}

function nameKind(name: unknown) {
  return /\b(formasi|formation)\b/i.test(String(name ?? "")) ? t("formation") : t("geologicUnit");
}

type NearbyStructure = { type?: unknown; certainty?: unknown; source?: string };
function structures(lines?: NearbyStructure[]) {
  const unique = new Map<string, NearbyStructure>();
  (lines ?? []).forEach((line) => {
    const key = [line.type, line.certainty, line.source].map(String).join("|");
    unique.set(key, line);
  });
  const content = [...unique.values()].slice(0, 4);
  const entries = lines === undefined
    ? `<p class="muted">${esc(t("structureTapHint"))}</p>`
    : content.length
    ? `<ul>${content.map((line) => `<li><strong>${esc(line.type || t("mappedLine"))}</strong>${line.certainty ? ` · ${esc(line.certainty)}` : ""}<span>${esc(line.source === "orebit" ? t("sourceOrebit") : t("sourceMacrostrat"))}</span></li>`).join("")}</ul>`
    : `<p class="muted">${esc(t("noNearbyStructure"))}</p>`;
  return `<section class="detail-structure"><h3>${esc(t("nearbyStructure"))}</h3>${entries}<p class="detail-caveat">${esc(t("structureCaveat"))}</p></section>`;
}

function renderOrebit(p: Record<string, unknown>, lines?: NearbyStructure[]) {
  const top = num(p.age_top_ma), base = num(p.age_base_ma);
  const lith = LITH_CLASSES.find((c) => c.id === p.lith_class);
  const lithLabel = lith ? (getLang() === "id" ? lith.id_label : lith.en) : "";
  const ageText = [p.interval_base, p.interval_top].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ")
    || periodName(base, getLang());
  const name = p.formation || p.name_orig || t("unnamed");
  const rawDescription = String(p.description ?? "");
  const isAuto = /^\[AUTO\]/i.test(rawDescription);
  const description = rawDescription.replace(/^\[AUTO\]\s*/i, "");
  const qualityWarning = /klabat/i.test(String(name)) ? t("klabatWarning")
    : /kluet/i.test(String(name)) ? t("kluetWarning")
      : isAuto ? t("autoReview") : "";
  return `
    <p class="detail-kicker">${esc(nameKind(name))} · ${esc(t("sourceOrebit"))}</p>
    <h2>${swatch(p.color_hex)}${esc(name)}</h2>
    ${p.symbol ? `<p class="symbol">${esc(t("unitSymbol"))}: <code>${esc(p.symbol)}</code></p>` : ""}
    ${qualityWarning ? `<p class="detail-quality">${esc(qualityWarning)}</p>` : ""}
    <dl>
      ${row(t("age"), `${esc(ageText)}<br><span class="muted">${esc(fmtMa(top, base))}</span>`)}
      ${row(t("lith"), esc([lithLabel, p.lith_detail].filter(Boolean).join(" — ") || t("notInSource")))}
      ${row(t("unitCode"), esc(p.unit_id))}
      ${row(t("description"), esc(description || t("notInSource")))}
      ${row(t("source"), `${esc(p.sheet_name)}<br><span class="muted">Pusat Survei Geologi · Badan Geologi</span>${p.source_url ? `<br><a class="inline-src" href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(t("openSourceService"))}</a>` : ""}`)}
    </dl>
    ${structures(lines)}
    ${references(name)}`;
}

function renderMacrostrat(p: Record<string, unknown>, lines?: NearbyStructure[]) {
  const top = num(p.best_t_age), base = num(p.best_b_age);
  const ageText = [p.b_int_name, p.t_int_name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ") || String(p.age ?? "");
  const name = p.strat_name || p.name || t("unnamed");
  return `
    <p class="detail-kicker">${esc(t("stratigraphicUnit"))} · ${esc(t("sourceMacrostrat"))}</p>
    <h2>${swatch(p.color)}${esc(name)}</h2>
    <dl>
      ${row(t("age"), `${esc(ageText)}<br><span class="muted">${esc(fmtMa(top, base))}</span>`)}
      ${row(t("lith"), esc(p.lith || t("notInSource")))}
      ${row(t("description"), esc(p.descrip))}
      <div class="row"><dt>${esc(t("source"))}</dt><dd id="msSource" class="muted">${esc(t("loadingSource"))}</dd></div>
    </dl>
    ${structures(lines)}
    ${references(name)}`;
}

interface SourceRef { html: string; url?: string; }
const sourceCache = new Map<number, SourceRef>();
let currentToken = 0;

/** Tombol "Buka sumber asli" di panel detail (tampil sebagai tombol di seluler). */
function setSourceButton(url?: string, label = t("openSource")) {
  const a = document.getElementById("detailSource") as HTMLAnchorElement;
  a.textContent = label;
  if (url && /^https?:\/\//.test(url)) { a.href = url; a.hidden = false; } else { a.removeAttribute("href"); a.hidden = true; }
}

async function loadMacrostratSource(id: number, token: number) {
  if (!sourceCache.has(id)) {
    try {
      const res = await fetch(CONFIG.macrostratSourcesApi + id);
      const d = (await res.json())?.success?.data?.[0] ?? {};
      const ref = [d.authors, d.ref_year && `(${d.ref_year})`, d.ref_title].filter(Boolean).join(" ");
      const url = typeof d.url === "string" && /^https?:\/\//.test(d.url) ? d.url : "https://macrostrat.org/map/sources";
      const link = url ? `<br><a class="inline-src" href="${esc(url)}" target="_blank" rel="noopener">${esc(t("openSource"))}</a>` : "";
      sourceCache.set(id, { html: `${esc(ref || d.name || `Macrostrat source ${id}`)}<br><span class="muted">via Macrostrat</span>${link}`, url });
    } catch {
      sourceCache.set(id, { html: `Macrostrat source ${id}`, url: "https://macrostrat.org/map/sources" });
    }
  }
  if (token !== currentToken) return; // pengguna sudah memilih unit lain
  const ref = sourceCache.get(id)!;
  const target = document.getElementById("msSource");
  if (target) { target.innerHTML = ref.html; target.classList.remove("muted"); }
  setSourceButton(ref.url);
}

export function showDetail(f: maplibregl.MapGeoJSONFeature, nearbyLines?: NearbyStructure[]) {
  const token = ++currentToken;
  const panel = document.getElementById("detail")!;
  const body = document.getElementById("detailBody")!;
  const p = f.properties as Record<string, unknown>;
  const isOrebit = f.source === "orebit";
  body.innerHTML = isOrebit ? renderOrebit(p, nearbyLines) : renderMacrostrat(p, nearbyLines);
  panel.scrollTop = 0;
  setSourceButton(
    isOrebit && typeof p.source_url === "string" ? p.source_url : !isOrebit ? "https://macrostrat.org/map/sources" : undefined,
    isOrebit ? t("openSourceService") : t("openSource"),
  );
  panel.hidden = false;
  if (!isOrebit && p.source_id !== undefined) void loadMacrostratSource(Number(p.source_id), token);
}

export function hideDetail() {
  document.getElementById("detail")!.hidden = true;
}
