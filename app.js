(() => {
  "use strict";

  const CUR = {
    USD: { label: "Dólar", symbol: "$", url: "https://ve.dolarapi.com/v1/historicos/dolares/oficial", official: true },
    EUR: { label: "Euro", symbol: "€", url: "https://ve.dolarapi.com/v1/historicos/euros/oficial", official: true },
    // Promedio USDT (mercado paralelo / P2P); se actualiza durante el día
    USDT: { label: "USDT", symbol: "₮", url: "https://ve.dolarapi.com/v1/historicos/dolares/paralelo", official: false },
  };
  const LIVE_URL = "https://ve.dolarapi.com/v1/dolares";
  const STORE = "cups.history.v1";
  const STORE_LIVE = "cups.usdtlive.v1";
  const STORE_SYNC = "cups.lastsync.v1";

  const $ = (id) => document.getElementById(id);
  const el = {
    refresh: $("refresh"), prev: $("prev"), next: $("next"), badge: $("badge"), goToday: $("goToday"),
    dateLabel: $("dateLabel"), dateValue: $("dateValue"), datePick: $("datePick"),
    foreignInput: $("foreignInput"), bsInput: $("bsInput"), foreignCoin: $("foreignCoin"), foreignName: $("foreignName"),
    copyForeign: $("copyForeign"), copyBs: $("copyBs"), copiedForeign: $("copiedForeign"), copiedBs: $("copiedBs"),
    ratePill: $("ratePill"), status: $("status"), clearConv: $("clearConv"),
    modeBtns: document.querySelectorAll(".mode-btn"), conv: $("conv"), pad: $("pad"),
    change: $("change"), changeTop: $("changeTop"), changeMain: $("changeMain"), changePct: $("changePct"), changeEmpty: $("changeEmpty"), changeBody: $("changeBody"),
    dir: $("dir"), padRate: $("padRate"), expr: $("expr"), converted: $("converted"), keys: $("keys"), modes: document.querySelector(".modes"),
  };

  const ICON_COPY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="12" height="12" rx="3.2"/><path d="M15.5 4.5h-7a4 4 0 0 0-4 4v7"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
  el.copyForeign.innerHTML = ICON_COPY;
  el.copyBs.innerHTML = ICON_COPY;

  /* ---------- Estado ---------- */
  const state = {
    history: { USD: [], EUR: [], USDT: [] }, // [[ "YYYY-MM-DD", valor ], ...] ascendente
    usdtLive: null, // [ fecha, valor ] del promedio USDT de ahora
    currency: "USD",
    pinned: null, // fecha elegida; null = seguir la tasa vigente de hoy
    lastEdited: "foreign",
    dir: 0, // sentido del último cambio de fecha: -1 atrás, 1 adelante
    mode: "convert", // convert | calc
    calcInBs: true, // la calculadora trabaja en bolívares y muestra la divisa; false: al revés
    expr: "",
    justEvaluated: false,
    loading: false,
    error: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && saved.USD && saved.EUR) state.history = { USDT: [], ...saved };
    const live = JSON.parse(localStorage.getItem(STORE_LIVE) || "null");
    if (Array.isArray(live) && live.length === 2) state.usdtLive = live;
  } catch (_) { /* sin almacenamiento: seguimos con memoria */ }

  /* ---------- Movimiento ---------- */
  let animReady = false; // la primera pintura no se anima (ya entra en escalera por CSS)
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function replay(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
  // Cambia el texto y, solo si realmente cambió, lo anima. dx > 0 entra desde la derecha, < 0 desde la izquierda.
  function setText(node, text, dx = 0) {
    if (node.textContent === text) return;
    node.textContent = text;
    if (!animReady || reduceMotion.matches) return;
    node.style.setProperty("--dx", dx + "px");
    replay(node, "tick");
  }

  /* ---------- Tema (claro / oscuro) ---------- */
  // Tres modos: auto (sigue al teléfono / navegador y cambia con él), claro u oscuro
  const themeBtn = $("theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const THEME_NAMES = { auto: "automático", light: "claro", dark: "oscuro" };
  let themeMode = "auto";
  try { const t = localStorage.getItem("cups.theme"); if (t === "light" || t === "dark") themeMode = t; } catch (_) {}
  function applyTheme() {
    const dark = themeMode === "dark" || (themeMode === "auto" && systemDark.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.mode = themeMode;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = dark ? "#0b1220" : "#ffffff";
    const label = "Tema: " + THEME_NAMES[themeMode];
    themeBtn.setAttribute("aria-label", label);
    themeBtn.title = label;
  }
  applyTheme();
  systemDark.addEventListener("change", () => { if (themeMode === "auto") applyTheme(); });
  themeBtn.addEventListener("click", () => {
    themeMode = themeMode === "auto" ? "light" : themeMode === "light" ? "dark" : "auto";
    try { if (themeMode === "auto") localStorage.removeItem("cups.theme"); else localStorage.setItem("cups.theme", themeMode); } catch (_) {}
    // Fundido entre temas con View Transitions (si el navegador lo soporta)
    if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(applyTheme);
    else applyTheme();
  });

  /* ---------- Fechas ---------- */
  const pad2 = (n) => String(n).padStart(2, "0");
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const toDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtLong = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtShort = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" });
  const clean = (s) => s.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  const longDate = (iso) => clean(fmtLong.format(toDate(iso)));
  const shortDate = (iso) => clean(fmtShort.format(toDate(iso)));

  // Fechas de publicación del BCV (el USDT no marca fechas de navegación)
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
    if (c === "USDT" && !state.pinned && state.usdtLive) return { date: state.usdtLive[0], value: state.usdtLive[1] };
    const s = selectedDate(), list = state.history[c];
    if (!s || !list.length) return null;
    for (let i = list.length - 1; i >= 0; i--) if (list[i][0] <= s) return { date: list[i][0], value: list[i][1] };
    return { date: list[0][0], value: list[0][1] };
  }

  // Cambio frente a la publicación anterior de la misma moneda
  function changeFor(c) {
    const r = rateFor(c);
    if (!r) return null;
    const list = state.history[c];
    let prev = null;
    for (let i = list.length - 1; i >= 0; i--) if (list[i][0] < r.date) { prev = list[i]; break; }
    if (!prev) return null;
    const diff = r.value - prev[1];
    return { diff, pct: (diff / prev[1]) * 100, since: prev[0] };
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
  let lastSync = 0; // momento de la última descarga exitosa
  try { lastSync = Number(localStorage.getItem(STORE_SYNC)) || 0; } catch (_) {}

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function fetchRates(c) {
    const arr = await getJSON(CUR[c].url);
    return arr
      .filter((o) => o.promedio != null && o.fecha)
      .map((o) => [String(o.fecha).slice(0, 10), Number(o.promedio)])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  async function fetchLive() {
    const o = (await getJSON(LIVE_URL)).find((x) => x.fuente === "paralelo" && x.promedio != null);
    return o ? [todayISO(), Number(o.promedio)] : null;
  }

  // silent: actualización automática, sin indicador de carga ni mensaje de error
  async function refresh(silent = false) {
    if (state.loading) return;
    state.loading = true;
    if (!silent) { state.error = null; render(); }
    const keys = Object.keys(CUR);
    const [fetched, live] = await Promise.all([
      Promise.all(keys.map((c) => fetchRates(c).catch(() => null))),
      fetchLive().catch(() => null),
    ]);
    const got = Object.fromEntries(keys.map((c, i) => [c, fetched[i]]));
    if (!got.USD && !got.EUR) {
      if (!silent) state.error = dates().length ? "Sin conexión, usando las tasas guardadas" : "Sin conexión y sin tasas guardadas";
    } else {
      state.history = Object.fromEntries(keys.map((c) => [c, got[c] || state.history[c]]));
      try { localStorage.setItem(STORE, JSON.stringify(state.history)); } catch (_) {}
      if (live) {
        state.usdtLive = live;
        try { localStorage.setItem(STORE_LIVE, JSON.stringify(live)); } catch (_) {}
      }
      recalc();
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
    setText(el.dateLabel, state.loading && !sel ? "Cargando…" : label, state.dir * 10);
    setText(el.dateValue, sel ? longDate(sel) : "—", state.dir * 14);
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
      setText($("rate" + c), r ? money.format(r.value) : "—");
      setText($("date" + c), !r ? "sin datos" : c === "USDT" && r.date === todayISO() ? "en vivo" : shortDate(r.date));
    }
    document.querySelectorAll(".tile").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.cur === cur)));

    renderChange(cur);

    // Calculadora
    el.foreignCoin.textContent = CUR[cur].symbol;
    el.foreignCoin.className = "coin coin-sm coin-" + cur.toLowerCase();
    el.foreignName.textContent = CUR[cur].label;
    el.copyForeign.setAttribute("aria-label", "Copiar " + CUR[cur].label);
    const r = rateFor(cur);
    setText(el.ratePill, r ? `1 ${CUR[cur].symbol} = Bs. ${money.format(r.value)}` : "—");
    syncCopyState();
    renderMode();

    state.dir = 0;
    el.refresh.classList.toggle("loading", state.loading);
    el.refresh.disabled = state.loading;
    el.status.hidden = !state.error;
    el.status.textContent = state.error || "";
  }

  function renderChange(cur) {
    const ch = changeFor(cur);
    el.changeEmpty.hidden = !!ch;
    el.changeBody.hidden = !ch;
    if (!ch) { el.change.dataset.tone = "flat"; return; }
    const up = ch.diff > 0.0049, down = ch.diff < -0.0049;
    el.change.dataset.tone = up ? "up" : down ? "down" : "flat";
    const verb = up ? "subió" : down ? "bajó" : "se mantuvo";
    setText(el.changeTop, `${CUR[cur].label} ${verb} vs. ${shortDate(ch.since)}`);
    setText(el.changeMain, `${up ? "▲ +" : down ? "▼ −" : "• "}${money.format(Math.abs(ch.diff))} Bs`);
    setText(el.changePct, `${up ? "+" : down ? "−" : ""}${money.format(Math.abs(ch.pct))}%`);
  }

  function syncCopyState() {
    el.copyForeign.disabled = !el.foreignInput.value;
    el.copyBs.disabled = !el.bsInput.value;
    el.foreignInput.classList.toggle("long", el.foreignInput.value.length > 10);
    el.bsInput.classList.toggle("long", el.bsInput.value.length > 10);
    el.clearConv.hidden = state.mode !== "convert" || !(el.foreignInput.value || el.bsInput.value);
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

  // Reiniciar a 0 de un solo toque
  el.clearConv.addEventListener("click", () => {
    el.foreignInput.value = "";
    el.bsInput.value = "";
    syncCopyState();
  });

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
  function pin(d) {
    const cur = selectedDate(), target = d || currentDate();
    state.dir = cur && target && target !== cur ? (target < cur ? -1 : 1) : 0;
    state.pinned = d === currentDate() ? null : d;
    recalc();
    render();
  }
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
  el.refresh.addEventListener("click", () => refresh());

  /* ---------- Modo calculadora ---------- */
  const OPS = "+−×÷";
  const isOp = (ch) => OPS.includes(ch);
  const lastNumber = () => (state.expr.match(/[\d,]*$/) || [""])[0];

  // Evalúa con + − × ÷, paréntesis y % (con precedencia). Ignora operadores finales y cierra los paréntesis que falten.
  // "%" divide entre 100; tras + o − (ej. 200+10%) es ese porcentaje del valor de la izquierda.
  function evalExpr(src) {
    let s = src.replace(/[+−×÷(]+$/, "");
    if (!s) return null;
    s += ")".repeat(Math.max(0, (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length));
    let i = 0, pct = false; // pct: el último término fue un número o grupo seguido de %
    const number = () => {
      const st = i;
      while (i < s.length && (/\d/.test(s[i]) || s[i] === ",")) i++;
      const n = parseFloat(s.slice(st, i).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const factor = () => {
      if (s[i] === "−") { i++; const v = factor(); return v === null ? null : -v; }
      let v;
      if (s[i] === "(") {
        i++;
        v = expr();
        if (v === null || s[i] !== ")") return null;
        i++;
      } else {
        v = number();
        if (v === null) return null;
      }
      pct = false;
      while (s[i] === "%") { i++; v /= 100; pct = true; }
      return v;
    };
    const term = () => {
      let v = factor();
      if (v === null) return null;
      let single = pct;
      while (i < s.length && "×÷(".includes(s[i])) {
        const op = s[i] === "(" ? "×" : s[i++];
        const r = factor();
        if (r === null) return null;
        v = op === "×" ? v * r : v / r;
        single = false;
      }
      pct = single;
      return v;
    };
    const expr = () => {
      let acc = term();
      if (acc === null) return null;
      while (i < s.length && "+−".includes(s[i])) {
        const op = s[i++];
        const r = term();
        if (r === null) return null;
        const d = pct ? acc * r : r;
        acc = op === "+" ? acc + d : acc - d;
      }
      pct = false;
      return acc;
    };
    const v = expr();
    return v !== null && i === s.length && Number.isFinite(v) ? v : null;
  }

  function press(k) {
    const st = state;
    if (k === "C") { st.expr = ""; st.justEvaluated = false; }
    else if (k === "⌫") { if (st.justEvaluated) { st.expr = ""; st.justEvaluated = false; } else st.expr = st.expr.slice(0, -1); }
    else if (k === "=") {
      const v = evalExpr(st.expr);
      if (v !== null) {
        st.expr = v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",").replace("-", "−");
        st.justEvaluated = true;
      }
    } else if (isOp(k)) {
      if (!st.expr) { if (k === "−") st.expr = k; }
      else {
        st.justEvaluated = false;
        const last = st.expr[st.expr.length - 1], before = st.expr[st.expr.length - 2];
        if (last === "(") { if (k === "−") st.expr += k; }
        else if (isOp(last)) { if (st.expr.length > 1 && before !== "(") st.expr = st.expr.slice(0, -1) + k; }
        else st.expr += k;
      }
    } else if (k === "(") {
      if (st.justEvaluated) { st.expr = ""; st.justEvaluated = false; }
      if (st.expr.length >= 40) return;
      st.expr += st.expr && /[\d,)%]$/.test(st.expr) ? "×(" : "(";
    } else if (k === ")") {
      const open = (st.expr.match(/\(/g) || []).length - (st.expr.match(/\)/g) || []).length;
      if (open > 0 && /[\d)%]$/.test(st.expr) && st.expr.length < 40) { st.justEvaluated = false; st.expr += ")"; }
    } else if (k === "%") {
      if (/[\d)]$/.test(st.expr) && st.expr.length < 40) { st.justEvaluated = false; st.expr += "%"; }
    } else if (k === ",") {
      if (st.justEvaluated) { st.expr = ""; st.justEvaluated = false; }
      const n = lastNumber();
      if (n.includes(",") || st.expr.length >= 40) return;
      st.expr += n ? "," : /[)%]$/.test(st.expr) ? "×0," : "0,";
    } else { // dígitos y "00"
      if (st.justEvaluated) { st.expr = ""; st.justEvaluated = false; }
      if (st.expr.length + k.length > 40) return;
      const n = lastNumber();
      if (n === "0" && /^0+$/.test(k)) return;
      st.expr = n === "0" ? st.expr.slice(0, -1) + (k.replace(/^0+/, "") || "0") : /[)%]$/.test(st.expr) ? st.expr + "×" + k : st.expr + k;
    }
    renderPad();
  }

  function renderPad() {
    const cur = state.currency, r = rateFor(cur), inBs = state.calcInBs;
    const fromSym = inBs ? "Bs" : CUR[cur].symbol, toSym = inBs ? CUR[cur].symbol : "Bs";
    const shown = state.expr || "0";
    el.expr.textContent = shown;
    el.expr.dataset.size = shown.length > 20 ? "xs" : shown.length > 13 ? "s" : shown.length > 8 ? "m" : "l";
    el.dir.textContent = `${fromSym} → ${toSym}`;
    el.padRate.textContent = r ? `1 ${CUR[cur].symbol} = ${money.format(r.value)}` : "";
    const v = evalExpr(state.expr);
    const conv = v !== null && r ? (inBs ? v / r.value : v * r.value) : 0;
    setText(el.converted, `${toSym} ${money.format(conv)}`);
    el.converted.dataset.to = inBs ? "foreign" : "bs";
  }

  function renderMode() {
    const calc = state.mode === "calc";
    el.conv.hidden = calc;
    el.pad.hidden = !calc;
    el.modeBtns.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === state.mode)));
    el.modes.dataset.mode = state.mode;
    el.clearConv.hidden = calc || !(el.foreignInput.value || el.bsInput.value);
    if (calc) renderPad();
  }

  el.modeBtns.forEach((b) => b.addEventListener("click", () => {
    if (state.mode === b.dataset.mode) return;
    state.mode = b.dataset.mode;
    render();
    if (!reduceMotion.matches) replay(state.mode === "calc" ? el.pad : el.conv, "enter");
  }));

  // Mantener pulsado ⌫ = reiniciar todo el monto de golpe
  let holdTimer = null, held = false;
  el.keys.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.k !== "⌫") return;
    held = false;
    holdTimer = setTimeout(() => { held = true; if (navigator.vibrate) navigator.vibrate(18); press("C"); }, 450);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
    el.keys.addEventListener(ev, () => clearTimeout(holdTimer));
  }
  el.keys.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.k === "⌫" && held) { held = false; return; }
    if (navigator.vibrate) navigator.vibrate(8);
    if (b.dataset.k === "⇄") { state.calcInBs = !state.calcInBs; renderPad(); }
    else press(b.dataset.k);
  });

  document.addEventListener("keydown", (e) => {
    if (state.mode !== "calc" || e.ctrlKey || e.metaKey || e.altKey) return;
    const map = { "*": "×", "/": "÷", x: "×", "-": "−", ".": ",", Enter: "=", Backspace: "⌫", Escape: "C", Delete: "C" };
    const k = map[e.key] || e.key;
    if (/^[0-9]$/.test(k) || [",", "+", "−", "×", "÷", "=", "⌫", "C", "(", ")", "%"].includes(k)) { e.preventDefault(); press(k); }
  });

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
  const appEl = document.querySelector(".app");
  [...appEl.children].forEach((c, i) => c.style.setProperty("--i", i));
  el.keys.querySelectorAll(".key").forEach((k, i) => k.style.setProperty("--i", i));
  if (!reduceMotion.matches) {
    appEl.classList.add("boot");
    setTimeout(() => appEl.classList.remove("boot"), 1100); // luego no se repite al mostrar/ocultar secciones
  }
  render();
  requestAnimationFrame(() => { animReady = true; });
  // Tasas al día: al abrir o volver al frente, y cada 5 min mientras la app está a la vista.
  // Si lo guardado tiene más de 10 min se actualiza en silencio (salvo la primera vez, sin datos).
  function refreshIfStale() {
    if (Date.now() - lastSync > 10 * 60 * 1000) refresh(dates().length > 0);
  }
  refreshIfStale();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshIfStale(); });
  setInterval(() => { if (document.visibilityState === "visible") refreshIfStale(); }, 5 * 60 * 1000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
