// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
import type { ColorMode } from "./layers";
import { getLang, t } from "./i18n";
import { LITH_CLASSES, LITH_PARENT_GROUPS } from "./lithology";
import { EPOCHS, PERIODS } from "./timescale";

export interface LegendOptions {
  mode: ColorMode;
  fine: boolean;
  activeAgeMin: number;
  activeAgeMax: number;
  activeLith?: string;
  onSelectAge: (top: number, base: number) => void;
  onSelectLith: (id: string) => void;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderLegend(opts: LegendOptions) {
  const el = document.getElementById("legend")!;
  const lang = getLang();
  const { mode, fine, activeAgeMin, activeAgeMax, activeLith, onSelectAge, onSelectLith } = opts;

  if (mode === "age") {
    const items = fine ? EPOCHS : PERIODS;
    el.innerHTML = `<h2>${esc(t("legendAge"))}</h2><p class="legend-hint">${esc(t("legendHint"))}</p><ol class="timescale">${items
      .map((p) => {
        const isActive = Math.abs(activeAgeMin - p.top) < 0.05 && Math.abs(activeAgeMax - p.base) < 0.05;
        return `<li>
          <button type="button" class="legend-btn" data-top="${p.top}" data-base="${p.base}" aria-pressed="${isActive}">
            <span class="chip" style="background:${p.color}"></span>
            <span class="legend-label">${esc(lang === "id" ? p.id : p.en)}</span>
            <span class="ma">${esc(p.top.toLocaleString(lang))}</span>
          </button>
        </li>`;
      })
      .join("")}</ol>`;
    el.querySelectorAll<HTMLButtonElement>(".legend-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const top = Number(btn.dataset.top);
        const base = Number(btn.dataset.base);
        onSelectAge(top, base);
      });
    });
  } else {
    const items: readonly { id: string; id_label: string; en: string; color: string }[] = fine
      ? LITH_CLASSES
      : LITH_PARENT_GROUPS;
    el.innerHTML = `<h2>${esc(t("legendLith"))}</h2><p class="legend-hint">${esc(t("legendHint"))}</p><ul class="liths">${items
      .map((c) => {
        const isActive = activeLith === c.id;
        return `<li>
          <button type="button" class="legend-btn" data-lith="${esc(c.id)}" aria-pressed="${isActive}">
            <span class="chip" style="background:${c.color}"></span>
            <span class="legend-label">${esc(lang === "id" ? c.id_label : c.en)}</span>
          </button>
        </li>`;
      })
      .join("")}</ul>`;
    el.querySelectorAll<HTMLButtonElement>(".legend-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.lith ?? "";
        onSelectLith(id);
      });
    });
  }
}
