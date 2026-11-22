// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Landing page: Indonesian text lives in the HTML, English in data-en; the toggle swaps them.
const KEY = "geoatlas.lang";
const nodes = [...document.querySelectorAll<HTMLElement>("[data-en]")];
nodes.forEach((n) => (n.dataset.id = n.textContent?.trim() ?? ""));
const btn = document.getElementById("langBtn") as HTMLButtonElement;

function apply(lang: "id" | "en") {
  document.documentElement.lang = lang;
  nodes.forEach((n) => (n.textContent = (lang === "en" ? n.dataset.en : n.dataset.id) ?? ""));
  btn.textContent = lang === "en" ? "ID" : "EN";
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked: language just isn't remembered */
  }
}

let saved: string | null = null;
try {
  saved = localStorage.getItem(KEY);
} catch {
  saved = null;
}
let lang: "id" | "en" = saved === "en" || saved === "id" ? saved : navigator.language.startsWith("id") ? "id" : "en";
apply(lang);
btn.addEventListener("click", () => {
  lang = lang === "en" ? "id" : "en";
  apply(lang);
});
