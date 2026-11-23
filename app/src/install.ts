// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Orebit (Ghozian Islam Karami)
// Pemasangan PWA: klasifikasi konteks peramban, chip di sheet seluler, petunjuk iOS, banner in-app.
import { esc } from "./detail";
import { t } from "./i18n";

export type InstallContext = "installed" | "prompt" | "ios-safari" | "ios-other" | "in-app" | "unsupported";

const IN_APP = /LinkedInApp|FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)/;
const IOS = /iPhone|iPad|iPod/;
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS/;
const PROMPT_CAPABLE = /Android|Chrome|Edg\//;

/** Fungsi murni: konteks pemasangan dari User-Agent dan mode standalone. */
export function detectInstallContext(ua: string, standalone: boolean): InstallContext {
  if (standalone) return "installed";
  if (IN_APP.test(ua)) return "in-app";
  if (IOS.test(ua)) return IOS_OTHER_BROWSER.test(ua) ? "ios-other" : "ios-safari";
  return PROMPT_CAPABLE.test(ua) ? "prompt" : "unsupported";
}

const KEY = "geoatlas.ui.v1";
const DISMISS_MS = 14 * 24 * 3600 * 1000;
type Ui = { bannerDismissedAt?: number; persistAsked?: boolean };
const readUi = (): Ui => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Ui;
  } catch {
    return {};
  }
};
const writeUi = (patch: Ui) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readUi(), ...patch }));
  } catch {
    /* penyimpanan diblokir: abaikan */
  }
};
const el = (id: string) => document.getElementById(id) as HTMLElement;

type DeferredPrompt = Event & { prompt: () => Promise<void> };

export function initInstall(opts: { isMobile: () => boolean; toast: (msg: string) => void }): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  let standalone = matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  let installed = false;
  let deferred: DeferredPrompt | null = null;
  let ctx: InstallContext = "unsupported";

  const chip = el("installChip");
  const headerBtn = el("installBtn");
  const sheet = el("installSheet");
  const sheetTitle = el("installSheetTitle");
  const sheetSteps = el("installSteps");
  const sheetClose = el("installSheetClose");
  const banner = el("inAppBanner");
  const bannerText = el("inAppText");
  const bannerCopy = el("inAppCopy");
  const bannerClose = el("inAppClose");

  const isInstalled = () => standalone || installed;

  const fillSheet = () => {
    const steps = ctx === "ios-safari" ? [t("installIosStep1"), t("installIosStep2"), t("installIosStep3")] : [t("installIosOther")];
    sheetTitle.textContent = t("installIosTitle");
    sheetSteps.innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join("");
    sheetClose.textContent = t("close");
  };

  const render = () => {
    ctx = detectInstallContext(navigator.userAgent, isInstalled());
    const mobile = opts.isMobile();
    const canPrompt = ctx === "prompt" && deferred !== null;
    const iosHelp = ctx === "ios-safari" || ctx === "ios-other";
    const label = t("installApp");

    chip.hidden = !(mobile && (canPrompt || iosHelp));
    chip.textContent = label;
    headerBtn.hidden = mobile || !canPrompt;
    headerBtn.textContent = label;

    const dismissed = Date.now() - (readUi().bannerDismissedAt ?? 0) < DISMISS_MS;
    banner.hidden = ctx !== "in-app" || dismissed;
    bannerText.textContent = t("installInApp");
    bannerCopy.textContent = t("copyLink");
    bannerClose.textContent = t("close");

    if (!sheet.hidden) fillSheet();
  };

  const runPrompt = async () => {
    if (!deferred) return;
    const p = deferred;
    deferred = null;
    try {
      await p.prompt();
    } catch {
      /* dibatalkan pengguna */
    }
    render();
  };

  const persistOnce = () => {
    if (readUi().persistAsked) return;
    writeUi({ persistAsked: true });
    try {
      navigator.storage?.persist?.()?.catch(() => undefined);
    } catch {
      /* tidak didukung: abaikan */
    }
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as DeferredPrompt;
    render();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    persistOnce();
    render();
  });
  chip.addEventListener("click", () => {
    if (ctx === "prompt") void runPrompt();
    else {
      fillSheet();
      sheet.hidden = false;
    }
  });
  headerBtn.addEventListener("click", () => void runPrompt());
  sheetClose.addEventListener("click", () => {
    sheet.hidden = true;
  });
  bannerCopy.addEventListener("click", async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      opts.toast(t("copied"));
    } catch {
      window.prompt(t("copyLink"), url);
    }
  });
  bannerClose.addEventListener("click", () => {
    writeUi({ bannerDismissedAt: Date.now() });
    banner.hidden = true;
  });
  // Terdaftar setelah handler bahasa di main.ts, sehingga t() sudah memakai bahasa baru saat render.
  document.getElementById("langBtn")?.addEventListener("click", () => render());
  matchMedia("(max-width: 760px)").addEventListener("change", render);
  matchMedia("(display-mode: standalone)").addEventListener("change", (e) => {
    standalone = e.matches;
    render();
  });

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }

  if (isInstalled()) persistOnce();
  render();
}
