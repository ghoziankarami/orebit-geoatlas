import type { ColorMode } from "./layers";
import { getLang, t } from "./i18n";
import { LITH_CLASSES } from "./lithology";
import { PERIODS } from "./timescale";

export function renderLegend(mode: ColorMode) {
  const el = document.getElementById("legend")!;
  const lang = getLang();
  if (mode === "age") {
    el.innerHTML = `<h2>${t("legendAge")}</h2><ol class="timescale">${PERIODS.map(
      (p) => `<li><span class="chip" style="background:${p.color}"></span><span>${lang === "id" ? p.id : p.en}</span><span class="ma">${p.top.toLocaleString(lang)}</span></li>`,
    ).join("")}</ol>`;
  } else {
    el.innerHTML = `<h2>${t("legendLith")}</h2><ul class="liths">${LITH_CLASSES.map(
      (c) => `<li><span class="chip" style="background:${c.color}"></span><span>${lang === "id" ? c.id_label : c.en}</span></li>`,
    ).join("")}</ul>`;
  }
}
