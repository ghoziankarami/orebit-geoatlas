import type { ColorMode } from "./layers";
import { getLang, t } from "./i18n";
import { LITH_CLASSES, LITH_PARENT_GROUPS } from "./lithology";
import { EPOCHS, PERIODS } from "./timescale";

export function renderLegend(mode: ColorMode, fine: boolean) {
  const el = document.getElementById("legend")!;
  const lang = getLang();
  if (mode === "age") {
    const items = fine ? EPOCHS : PERIODS;
    el.innerHTML = `<h2>${t("legendAge")}</h2><ol class="timescale">${items.map(
      (p) => `<li><span class="chip" style="background:${p.color}"></span><span>${lang === "id" ? p.id : p.en}</span><span class="ma">${p.top.toLocaleString(lang)}</span></li>`,
    ).join("")}</ol>`;
  } else {
    const items: readonly { id: string; id_label: string; en: string; color: string }[] = fine ? LITH_CLASSES : LITH_PARENT_GROUPS;
    el.innerHTML = `<h2>${t("legendLith")}</h2><ul class="liths">${items.map(
      (c) => `<li><span class="chip" style="background:${c.color}"></span><span>${lang === "id" ? c.id_label : c.en}</span></li>`,
    ).join("")}</ul>`;
  }
}
