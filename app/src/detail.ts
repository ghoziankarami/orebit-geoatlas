import type maplibregl from "maplibre-gl";
import { CONFIG } from "./config";
import { getLang, t } from "./i18n";
import { LITH_CLASSES } from "./lithology";
import type { NationalUnit } from "./search";
import { periodName } from "./timescale";

export const esc = (v: unknown) =>
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

function confidenceBadge(conf: string | undefined, isAutoDesc: boolean) {
  const status = conf || (isAutoDesc ? "auto" : "curated");
  if (status === "flagged") {
    return `<span class="conf-badge is-flagged">${esc(t("confBadgeFlagged"))}</span>`;
  }
  if (status === "auto") {
    return `<span class="conf-badge is-auto">${esc(t("confBadgeAuto"))}</span>`;
  }
  return `<span class="conf-badge is-curated">${esc(t("confBadgeCurated"))}</span>`;
}

function stratPositionBar(top?: number, base?: number, color?: string) {
  if (top === undefined || base === undefined || Number.isNaN(top) || Number.isNaN(base)) return "";
  const maxMa = 600;
  const leftPct = Math.max(0, Math.min(100, (top / maxMa) * 100));
  const rightPct = Math.max(leftPct + 2, Math.min(100, (base / maxMa) * 100));
  const widthPct = Math.max(2, rightPct - leftPct);
  return `<div class="strat-bar" aria-hidden="true" title="0–600 Ma">
    <div class="strat-bar-fill" style="left:${leftPct.toFixed(1)}%;width:${widthPct.toFixed(1)}%;background:${esc(color || "#2E6A86")}"></div>
  </div>`;
}

function references(name: unknown) {
  const title = String(name || t("unnamed"));
  const q = encodeURIComponent(`${title} geology Indonesia`);
  const officialQ = encodeURIComponent(`"${title}" site:geologi.esdm.go.id OR site:psg.geologi.esdm.go.id`);
  return `<details class="detail-more">
    <summary data-reference-name="${esc(title)}">${esc(t("moreReferences"))}</summary>
    <p class="reference-caveat">${esc(t("referenceSearchNote"))}</p>
    <div class="reference-results" aria-live="polite"><p class="muted">${esc(t("referencesLoading"))}</p></div>
    <div class="reference-links">
      <a href="https://scholar.google.com/scholar?q=${q}" target="_blank" rel="noopener">${esc(t("searchScholar"))}<span aria-hidden="true">↗</span></a>
      <a href="https://www.google.com/search?q=${officialQ}" target="_blank" rel="noopener">${esc(t("searchOfficial"))}<span aria-hidden="true">↗</span></a>
    </div>
  </details>`;
}

const referenceCache = new Map<string, Promise<string>>();
function loadReferences(name: string): Promise<string> {
  const nameKey = name.trim().toLowerCase();
  const cacheKey = `${getLang()}:${nameKey}`;
  if (!referenceCache.has(cacheKey)) {
    const request = fetch(
      `https://api.crossref.org/works?query.title=${encodeURIComponent(name)}&query.bibliographic=${encodeURIComponent(`${name} geology Indonesia`)}&rows=12&select=title,author,published-print,published-online,DOI,URL`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Crossref ${response.status}`);
        const works = (await response.json())?.message?.items ?? [];
        const nameWords = nameKey
          .split(/[^\p{L}\p{N}]+/u)
          .filter((word) => word.length > 2 && !["formation", "group", "member", "complex", "granite", "volcanics"].includes(word));
        const entries = works
          .map((work: Record<string, unknown>) => {
            const titles = Array.isArray(work.title) ? work.title : [];
            const title = String(titles[0] ?? "").trim();
            const normalizedTitle = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const titleWords = normalizedTitle.split(/[^\p{L}\p{N}]+/u);
            const hasUnitName = nameWords.length > 0 && nameWords.every((word) => titleWords.includes(word));
            const hasGeologyContext = /\b(geolog|formation|stratigraph|litholog|tecton|volcan|sediment|basin)\w*/i.test(title);
            if (!title || !hasUnitName || !hasGeologyContext) return "";
            const authors = Array.isArray(work.author) ? work.author : [];
            const firstAuthor = authors[0] as Record<string, unknown> | undefined;
            const authorName = firstAuthor ? [firstAuthor.given, firstAuthor.family].filter(Boolean).join(" ") : "";
            const date = (work["published-print"] ?? work["published-online"]) as Record<string, unknown> | undefined;
            const dateParts = date?.["date-parts"] as unknown[][] | undefined;
            const year = dateParts?.[0]?.[0] ? String(dateParts[0][0]) : "";
            const doi = typeof work.DOI === "string" ? work.DOI : "";
            const href = doi ? `https://doi.org/${encodeURIComponent(doi)}` : typeof work.URL === "string" ? work.URL : "";
            if (!href || !/^https:\/\//.test(href)) return "";
            return `<li><a href="${esc(href)}" target="_blank" rel="noopener">${esc(title)} <span aria-hidden="true">↗</span></a><span class="reference-meta">${esc([authorName, year].filter(Boolean).join(" · ") || "Crossref")}</span></li>`;
          })
          .filter(Boolean)
          .slice(0, 2);
        return entries.length
          ? `<ul>${entries.join("")}</ul><p class="reference-source">${esc(t("referencesCaveat"))} · <a href="https://www.crossref.org/" target="_blank" rel="noopener">Crossref</a></p>`
          : `<p class="muted">${esc(t("referencesEmpty"))}</p>`;
      })
      .catch(() => `<p class="muted">${esc(t("referencesError"))}</p>`);
    referenceCache.set(cacheKey, request);
  }
  return referenceCache.get(cacheKey)!;
}

function wireReferences() {
  document.querySelectorAll<HTMLDetailsElement>(".detail-more").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open || details.dataset.loaded === "true") return;
      details.dataset.loaded = "true";
      const name = details.querySelector<HTMLElement>("summary")?.dataset.referenceName || "";
      const results = details.querySelector<HTMLElement>(".reference-results");
      if (results) void loadReferences(name).then((html) => { results.innerHTML = html; });
    });
  });
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
  const entries =
    lines === undefined
      ? `<p class="muted">${esc(t("structureTapHint"))}</p>`
      : content.length
        ? `<ul>${content
            .map(
              (line) =>
                `<li><strong>${esc(line.type || t("mappedLine"))}</strong>${line.certainty ? ` · ${esc(line.certainty)}` : ""}<span>${esc(line.source === "orebit" ? t("sourceOrebit") : t("sourceMacrostrat"))}</span></li>`,
            )
            .join("")}</ul>`
        : `<p class="muted">${esc(t("noNearbyStructure"))}</p>`;
  return `<section class="detail-structure"><h3>${esc(t("nearbyStructure"))}</h3>${entries}<p class="detail-caveat">${esc(t("structureCaveat"))}</p></section>`;
}

function renderOrebit(p: Record<string, unknown>, lines?: NearbyStructure[]) {
  const top = num(p.age_top_ma);
  const base = num(p.age_base_ma);
  const area = num(p.area_km2);
  const lith = LITH_CLASSES.find((c) => c.id === p.lith_class);
  const lithLabel = lith ? (getLang() === "id" ? lith.id_label : lith.en) : "";
  const ageText =
    [p.interval_base, p.interval_top].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ") ||
    periodName(base, getLang());
  const name = p.formation || p.name_orig || t("unnamed");
  const rawDescription = String(p.description ?? "");
  const isAuto = /^\[AUTO\]/i.test(rawDescription);
  const description = rawDescription.replace(/^\[AUTO\](\[KONFLIK\])?\s*/i, "");
  const conf = typeof p.confidence === "string" ? p.confidence : isAuto ? "auto" : "curated";
  const qualityWarning = /klabat/i.test(String(name))
    ? t("klabatWarning")
    : /kluet/i.test(String(name))
      ? t("kluetWarning")
      : isAuto
        ? t("autoReview")
        : "";
  return `
    <p class="detail-kicker">${esc(nameKind(name))} · ${esc(t("sourceOrebit"))}</p>
    <h2>${swatch(p.color_hex)}${esc(name)}</h2>
    ${p.symbol ? `<p class="symbol">${esc(t("unitSymbol"))}: <code>${esc(p.symbol)}</code></p>` : ""}
    <div class="detail-badges">${confidenceBadge(conf, isAuto)}</div>
    ${qualityWarning ? `<p class="detail-quality">${esc(qualityWarning)}</p>` : ""}
    <dl>
      ${row(t("age"), `${esc(ageText)}<br><span class="muted">${esc(fmtMa(top, base))}</span>${stratPositionBar(top, base, String(p.color_hex || ""))}`)}
      ${row(t("lith"), esc([lithLabel, p.lith_detail].filter(Boolean).join(" — ") || t("notInSource")))}
      ${area !== undefined && area > 0 ? row(t("areaLabel"), `${area.toLocaleString(getLang(), { maximumFractionDigits: 1 })} km²`) : ""}
      ${p.region ? row(t("regionLabel"), esc(String(p.region).toUpperCase())) : ""}
      ${row(t("unitCode"), esc(p.unit_id))}
      ${row(t("description"), esc(description || t("notInSource")))}
      ${row(t("source"), `${esc(p.sheet_name)}<br><span class="muted">Pusat Survei Geologi · Badan Geologi</span>${p.source_url ? `<br><a class="inline-src" href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(t("openSourceService"))}</a>` : ""}`)}
    </dl>
    ${structures(lines)}
    ${references(name)}`;
}

function renderMacrostrat(p: Record<string, unknown>, lines?: NearbyStructure[]) {
  const top = num(p.best_t_age);
  const base = num(p.best_b_age);
  const ageText = [p.b_int_name, p.t_int_name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ") || String(p.age ?? "");
  const name = p.strat_name || p.name || t("unnamed");
  return `
    <p class="detail-kicker">${esc(t("stratigraphicUnit"))} · ${esc(t("sourceMacrostrat"))}</p>
    <h2>${swatch(p.color)}${esc(name)}</h2>
    <dl>
      ${row(t("age"), `${esc(ageText)}<br><span class="muted">${esc(fmtMa(top, base))}</span>${stratPositionBar(top, base, String(p.color || ""))}`)}
      ${row(t("lith"), esc(p.lith || t("notInSource")))}
      ${row(t("description"), esc(p.descrip))}
      <div class="row"><dt>${esc(t("source"))}</dt><dd id="msSource" class="muted">${esc(t("loadingSource"))}</dd></div>
    </dl>
    ${structures(lines)}
    ${references(name)}`;
}

interface SourceRef {
  html: string;
  url?: string;
}
const sourceCache = new Map<number, SourceRef>();
let currentToken = 0;

function setSourceButton(url?: string, label = t("openSource")) {
  const a = document.getElementById("detailSource") as HTMLAnchorElement;
  a.textContent = label;
  if (url && /^https?:\/\//.test(url)) {
    a.href = url;
    a.hidden = false;
  } else {
    a.removeAttribute("href");
    a.hidden = true;
  }
}

function setReportButton(unitName: string, unitId: string, symbol: string) {
  const reportLink = document.getElementById("detailReport") as HTMLAnchorElement | null;
  if (!reportLink) return;
  reportLink.textContent = t("reportIssue");
  const title = encodeURIComponent(`[Koreksi Unit] ${unitName} (${symbol || unitId})`);
  const body = encodeURIComponent(
    `Unit ID: ${unitId || "-"}\nSimbol: ${symbol || "-"}\nFormasi: ${unitName}\nURL Peta: ${location.href}\n\nCatatan koreksi geologi/umur/litologi:\n`,
  );
  reportLink.href = `${CONFIG.githubRepo}/issues/new?title=${title}&body=${body}`;
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
  if (token !== currentToken) return;
  const ref = sourceCache.get(id)!;
  const target = document.getElementById("msSource");
  if (target) {
    target.innerHTML = ref.html;
    target.classList.remove("muted");
  }
  setSourceButton(ref.url);
}

export function showDetail(f: maplibregl.MapGeoJSONFeature, nearbyLines?: NearbyStructure[]) {
  const token = ++currentToken;
  const panel = document.getElementById("detail")!;
  const body = document.getElementById("detailBody")!;
  const p = f.properties as Record<string, unknown>;
  const isOrebit = f.source === "orebit";
  body.innerHTML = isOrebit ? renderOrebit(p, nearbyLines) : renderMacrostrat(p, nearbyLines);
  wireReferences();
  panel.scrollTop = 0;
  setSourceButton(
    isOrebit && typeof p.source_url === "string" ? p.source_url : !isOrebit ? "https://macrostrat.org/map/sources" : undefined,
    isOrebit ? t("openSourceService") : t("openSource"),
  );
  const unitName = String(p.formation || p.strat_name || p.name_orig || p.name || t("unnamed"));
  setReportButton(unitName, String(p.unit_id || p.map_id || ""), String(p.symbol || ""));
  panel.hidden = false;
  if (!isOrebit && p.source_id !== undefined) void loadMacrostratSource(Number(p.source_id), token);
}

export function showIndexUnitDetail(u: NationalUnit) {
  ++currentToken;
  const panel = document.getElementById("detail")!;
  const body = document.getElementById("detailBody")!;
  const p: Record<string, unknown> = {
    unit_id: u.unit_id,
    symbol: u.symbol,
    formation: u.formation,
    region: u.region,
    lith_class: u.lith_class,
    lith_detail: u.lith_detail,
    age_top_ma: u.age_top_ma,
    age_base_ma: u.age_base_ma,
    interval_top: u.interval_top,
    interval_base: u.interval_base,
    color_hex: u.color_hex,
    confidence: u.confidence,
    area_km2: u.area_km2,
    sheet_name: u.sheet_name || `Katalog Nasional (${u.region.toUpperCase()})`,
    source_url: u.source_url || "https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer",
    description: u.description || "",
  };
  body.innerHTML = renderOrebit(p, undefined);
  wireReferences();
  panel.scrollTop = 0;
  setSourceButton(String(p.source_url), t("openSourceService"));
  setReportButton(u.formation, u.unit_id, u.symbol);
  panel.hidden = false;
}

export function hideDetail() {
  document.getElementById("detail")!.hidden = true;
}
