(() => {
  "use strict";

  const API = {
    USD: "https://ve.dolarapi.com/v1/historicos/dolares/oficial",
    EUR: "https://ve.dolarapi.com/v1/historicos/euros/oficial",
  };
  const CUR = {
    USD: { label: "Dólar", symbol: "$" },
    EUR: { label: "Euro", symbol: "€" },
  };
  const STORE = "cups.history.v1";

  const $ = (id) => document.getElementById(id);
  const el = {
    refresh: $("refresh"), prev: $("prev"), next: $("next"), badge: $("badge"), goToday: $("goToday"),
    dateLabel: $("dateLabel"), dateValue: $("dateValue"), datePick: $("datePick"),
    foreignInput: $("foreignInput"), bsInput: $("bsInput"), foreignCoin: $("foreignCoin"), foreignName: $("foreignName"),
    copyForeign: $("copyForeign"), copyBs: $("copyBs"), copiedForeign: $("copiedForeign"), copiedBs: $("copiedBs"),
    ratePill: $("ratePill"), status: $("status"),
  };

  const ICON_COPY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="12" height="12" rx="3.2"/><path d="M15.5 4.5h-7a4 4 0 0 0-4 4v7"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
  el.copyForeign.innerHTML = ICON_COPY;
  el.copyBs.innerHTML = ICON_COPY;

  /* ---------- Estado ---------- */
  const state = {
    history: { USD: [], EUR: [] }, // [[ "YYYY-MM-DD", valor ], ...] ascendente
    currency: "USD",
    pinned: null, // fecha elegida; null = seguir la tasa vigente de hoy
    lastEdited: "foreign",
    loading: false,
    error: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && saved.USD && saved.EUR) state.history = saved;
  } catch (_) { /* sin almacenamiento: seguimos con memoria */ }

  /* ---------- Fechas ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtLong = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtShort = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" });
  const clean = (s) => s.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  const longDate = (iso) => clean(fmtLong.format(toDate(iso)));
  const shortDate = (iso) => clean(fmtShort.format(toDate(iso)));

  const dates = () => [...new Set([...state.history.USD, ...state.history.EUR].map((e) => e[0]))].sort();
  const currentDate = () => {
    const d = dates(), t = todayISO();
    for (let i = d.length - 1; i >= 0; i--) if (d[i] <= t) return d[i];
    return d[0] || null;
  };
  const selectedDate = () => state.pinned || currentDate();
  const prevDate = () => { const s = selectedDate(); return s ? [...dates()].reverse().find((d) => d < s) || null : null; };
  const nextDate = () => { const s = selectedDate(); return s ? dates().find((d) => d > s) || null : null; };

  function rateFor(c) {
    const s = selectedDate(), list = state.history[c];
    if (!s || !list.length) return null;
    for (let i = list.length - 1; i >= 0; i--) if (list[i][0] <= s) return { date: list[i][0], value: list[i][1] };
    return { date: list[0][0], value: list[0][1] };
  }

  /* ---------- Números ---------- */
  const money = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parse = (s) => { const v = parseFloat(s.replace(",", ".")); return Number.isFinite(v) ? v : null; };
  const fmt = (v) => v.toFixed(2).replace(".", ",");

  function recalc() {
    const r = rateFor(state.currency);
    if (!r) return;
    if (state.lastEdited === "foreign") {
      const f = parse(el.foreignInput.value);
      el.bsInput.value = f === null ? "" : fmt(f * r.value);
    } else {
      const b = parse(el.bsInput.value);
      el.foreignInput.value = b === null ? "" : fmt(b / r.value);
    }
  }

  /* ---------- Datos ---------- */
  async function fetchRates(c) {
    const res = await fetch(API[c], { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const arr = await res.json();
    return arr
      .filter((o) => o.promedio != null && o.fecha)
      .map((o) => [String(o.fecha).slice(0, 10), Number(o.promedio)])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    render();
    try {
      const [usd, eur] = await Promise.all([fetchRates("USD"), fetchRates("EUR")]);
      state.history = { USD: usd, EUR: eur };
      try { localStorage.setItem(STORE, JSON.stringify(state.history)); } catch (_) {}
      recalc();
    } catch (_) {
      state.error = dates().length ? "Sin conexión, usando las tasas guardadas" : "Sin conexión y sin tasas guardadas";
    }
    state.loading = false;
    render();
  }

  /* ---------- Render ---------- */
  function render() {
    const cur = state.currency;
    document.body.dataset.cur = cur;
    const sel = selectedDate(), current = currentDate();

    // Barra de fecha
    let label = "Sin tasas";
    if (sel) {
      if (sel > current) label = "Próxima tasa";
      else if (sel === current) label = sel === todayISO() ? "Tasa de hoy" : "Tasa vigente";
      else label = "Tasa anterior";
    }
    el.dateLabel.textContent = state.loading && !sel ? "Cargando…" : label;
    el.dateValue.textContent = sel ? longDate(sel) : "—";
    el.prev.disabled = !prevDate();
    el.next.disabled = !nextDate();
    el.badge.hidden = !(nextDate() && sel === current);
    el.goToday.hidden = !(sel && sel !== current);
    const all = dates();
    if (all.length) {
      el.datePick.min = all[0];
      el.datePick.max = all[all.length - 1];
      el.datePick.value = sel || "";
    }

    // Tarjetas
    for (const c of Object.keys(CUR)) {
      const r = rateFor(c);
      $("rate" + c).textContent = r ? money.format(r.value) : "—";
      $("date" + c).textContent = r ? shortDate(r.date) : "sin datos";
    }
    document.querySelectorAll(".tile").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.cur === cur)));

    // Calculadora
    el.foreignCoin.textContent = CUR[cur].symbol;
    el.foreignCoin.className = "coin coin-sm " + (cur === "USD" ? "coin-usd" : "coin-eur");
    el.foreignName.textContent = CUR[cur].label;
    el.copyForeign.setAttribute("aria-label", "Copiar " + CUR[cur].label);
    const r = rateFor(cur);
    el.ratePill.textContent = r ? `1 ${CUR[cur].symbol} = Bs. ${money.format(r.value)}` : "—";
    syncCopyState();

    el.refresh.classList.toggle("loading", state.loading);
    el.refresh.disabled = state.loading;
    el.status.hidden = !state.error;
    el.status.textContent = state.error || "";
  }

  function syncCopyState() {
    el.copyForeign.disabled = !el.foreignInput.value;
    el.copyBs.disabled = !el.bsInput.value;
    el.foreignInput.classList.toggle("long", el.foreignInput.value.length > 10);
    el.bsInput.classList.toggle("long", el.bsInput.value.length > 10);
  }

  /* ---------- Entradas ---------- */
  function sanitize(input) {
    const v = input.value.replace(/[^0-9.,]/g, "");
    if (v !== input.value) input.value = v;
  }
  el.foreignInput.addEventListener("input", () => { sanitize(el.foreignInput); state.lastEdited = "foreign"; recalc(); syncCopyState(); });
  el.bsInput.addEventListener("input", () => { sanitize(el.bsInput); state.lastEdited = "bs"; recalc(); syncCopyState(); });
  for (const i of [el.foreignInput, el.bsInput]) {
    i.addEventListener("keydown", (e) => { if (e.key === "Enter") i.blur(); });
  }

  // Cambiar de moneda mantiene los bolívares y recalcula la divisa
  document.querySelectorAll(".tile").forEach((t) =>
    t.addEventListener("click", () => {
      state.currency = t.dataset.cur;
      state.lastEdited = "bs";
      recalc();
      render();
    })
  );

  /* ---------- Fechas: navegación ---------- */
  function pin(d) { state.pinned = d === currentDate() ? null : d; recalc(); render(); }
  el.prev.addEventListener("click", () => pin(prevDate()));
  el.next.addEventListener("click", () => pin(nextDate()));
  el.goToday.addEventListener("click", () => pin(null));
  // Un día del calendario usa la tasa vigente ese día (fines de semana → la del viernes)
  el.datePick.addEventListener("change", () => {
    const day = el.datePick.value;
    if (!day) return;
    const d = dates();
    pin([...d].reverse().find((x) => x <= day) || d[0]);
  });
  el.refresh.addEventListener("click", refresh);

  /* ---------- Copiar ---------- */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      return ok;
    }
  }
  function wireCopy(btn, input, tag) {
    let timer;
    btn.addEventListener("click", async () => {
      if (!input.value || !(await copyText(input.value))) return;
      if (navigator.vibrate) navigator.vibrate(12);
      btn.innerHTML = ICON_CHECK;
      btn.classList.add("done");
      tag.textContent = "· Copiado";
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.innerHTML = ICON_COPY;
        btn.classList.remove("done");
        tag.textContent = "";
      }, 1600);
    });
  }
  wireCopy(el.copyForeign, el.foreignInput, el.copiedForeign);
  wireCopy(el.copyBs, el.bsInput, el.copiedBs);

  /* ---------- Instalación (PWA) ---------- */
  const installBox = $("install"), installBody = $("installBody"), installBtn = $("installBtn");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const hintDismissed = () => { try { return localStorage.getItem("cups.installHint") === "1"; } catch (_) { return false; } };
  let deferredPrompt = null;

  function showInstall() {
    if (standalone || hintDismissed()) return;
    installBox.hidden = false;
  }
  if (isIOS && !standalone) {
    installBody.innerHTML = 'En Safari toca <svg class="share-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Compartir"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg> y luego <b>Añadir a pantalla de inicio</b>.';
    showInstall();
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBody.textContent = "Úsala como una app, también sin conexión.";
    installBtn.hidden = false;
    showInstall();
  });
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBox.hidden = true;
  });
  $("installClose").addEventListener("click", () => {
    installBox.hidden = true;
    try { localStorage.setItem("cups.installHint", "1"); } catch (_) {}
  });
  window.addEventListener("appinstalled", () => { installBox.hidden = true; });

  /* ---------- Arranque ---------- */
  render();
  refresh();
  // Al volver a la app (p. ej. al día siguiente) se vuelven a pedir las tasas
  let lastFetch = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastFetch > 10 * 60 * 1000) {
      lastFetch = Date.now();
      refresh();
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
