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

function renderOrebit(p: Record<string, unknown>) {
  const top = num(p.age_top_ma), base = num(p.age_base_ma);
  const lith = LITH_CLASSES.find((c) => c.id === p.lith_class);
  const lithLabel = lith ? (getLang() === "id" ? lith.id_label : lith.en) : "";
  const ageText = [p.interval_base, p.interval_top].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ")
    || periodName(base, getLang());
  return `
    <h2>${swatch(p.color_hex)}${esc(p.formation || p.name_orig || t("unnamed"))}</h2>
    ${p.symbol ? `<p class="symbol">${esc(p.symbol)}</p>` : ""}
    <dl>
      ${row(t("age"), `${esc(ageText)}<br><span class="muted">${esc(fmtMa(top, base))}</span>`)}
      ${row(t("lith"), esc([lithLabel, p.lith_detail].filter(Boolean).join(" — ")))}
      ${row(t("description"), esc(p.description))}
      ${row(t("source"), `${esc(p.sheet_name)}<br><span class="muted">Pusat Survei Geologi, Badan Geologi; diolah Orebit</span>${p.source_url ? `<br><a class="inline-src" href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(t("openSource"))}</a>` : ""}`)}
    </dl>`;
}

function renderMacrostrat(p: Record<string, unknown>) {
  const top = num(p.best_t_age), base = num(p.best_b_age);
  const ageText = [p.b_int_name, p.t_int_name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ") || String(p.age ?? "");
  return `
    <h2>${swatch(p.color)}${esc(p.strat_name || p.name || t("unnamed"))}</h2>
    <dl>
      ${row(t("age"), `${esc(ageText)}<br><span class="muted">${esc(fmtMa(top, base))}</span>`)}
      ${row(t("lith"), esc(p.lith))}
      ${row(t("description"), esc(p.descrip))}
      <div class="row"><dt>${esc(t("source"))}</dt><dd id="msSource" class="muted">${esc(t("loadingSource"))}</dd></div>
    </dl>`;
}

interface SourceRef { html: string; url?: string; }
const sourceCache = new Map<number, SourceRef>();
let currentToken = 0;

/** Tombol "Buka sumber asli" di panel detail (tampil sebagai tombol di seluler). */
function setSourceButton(url?: string) {
  const a = document.getElementById("detailSource") as HTMLAnchorElement;
  a.textContent = t("openSource");
  if (url) { a.href = url; a.hidden = false; } else { a.removeAttribute("href"); a.hidden = true; }
}

async function loadMacrostratSource(id: number, token: number) {
  if (!sourceCache.has(id)) {
    try {
      const res = await fetch(CONFIG.macrostratSourcesApi + id);
      const d = (await res.json())?.success?.data?.[0] ?? {};
      const ref = [d.authors, d.ref_year && `(${d.ref_year})`, d.ref_title].filter(Boolean).join(" ");
      const url = typeof d.url === "string" && /^https?:\/\//.test(d.url) ? d.url : undefined;
      const link = url ? `<br><a class="inline-src" href="${esc(url)}" target="_blank" rel="noopener">${esc(t("openSource"))}</a>` : "";
      sourceCache.set(id, { html: `${esc(ref || d.name || `Macrostrat source ${id}`)}<br><span class="muted">via Macrostrat</span>${link}`, url });
    } catch {
      sourceCache.set(id, { html: `Macrostrat source ${id}` });
    }
  }
  if (token !== currentToken) return; // pengguna sudah memilih unit lain
  const ref = sourceCache.get(id)!;
  const target = document.getElementById("msSource");
  if (target) { target.innerHTML = ref.html; target.classList.remove("muted"); }
  setSourceButton(ref.url);
}

export function showDetail(f: maplibregl.MapGeoJSONFeature) {
  const token = ++currentToken;
  const panel = document.getElementById("detail")!;
  const body = document.getElementById("detailBody")!;
  const p = f.properties as Record<string, unknown>;
  const isOrebit = f.source === "orebit";
  body.innerHTML = isOrebit ? renderOrebit(p) : renderMacrostrat(p);
  setSourceButton(isOrebit && typeof p.source_url === "string" ? p.source_url : undefined);
  panel.hidden = false;
  if (!isOrebit && p.source_id !== undefined) void loadMacrostratSource(Number(p.source_id), token);
}

export function hideDetail() {
  document.getElementById("detail")!.hidden = true;
}
