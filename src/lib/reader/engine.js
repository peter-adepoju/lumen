/* Lumen book reader: paginated like a printed book, with highlights, notes and export.
   Mounted into one element by mountReader(); everything it saves goes through the callbacks it is given. */

export function createReader() {
  "use strict";
  /* ---------------- Constants ---------------- */
  const COLORS = { yellow: "#F6D55C", green: "#8ED081", blue: "#8EC5F0", pink: "#F4A3C8", orange: "#F7B267", purple: "#C3A6F2", teal: "#7FD6CB", red: "#F28B82" };
  const COLOR_NAME = { yellow: "Yellow", green: "Green", blue: "Blue", pink: "Pink", orange: "Orange", purple: "Purple", teal: "Teal", red: "Red" };
  const FONTS = {
    garamond: ['"EB Garamond", Garamond, "Times New Roman", serif', "Garamond"],
    literata: ['Literata, Georgia, serif', "Literata"],
    atkinson: ['"Atkinson Hyperlegible", Verdana, sans-serif', "Hyperlegible"]
  };
  const THEMES = {
    paper: { name: "Paper", bg: "#F7F1E3", fg: "#2A241C", muted: "#8A7F6C", desk: "#3A2F27" },
    cream: { name: "Cream", bg: "#FBF7EE", fg: "#1F1B16", muted: "#8E8576", desk: "#2E2A26" },
    sepia: { name: "Sepia", bg: "#EADBBE", fg: "#3B2C1B", muted: "#8A7458", desk: "#2F241A" },
    night: { name: "Night", bg: "#1E1C19", fg: "#D8CFBF", muted: "#7C7365", desk: "#0D0C0B" }
  };
  const DEFAULTS = { font: "garamond", size: 19, lh: 1.6, margin: "normal", justify: true, theme: "paper", bright: 100, warm: 10, turn: "flip", sound: true, spread: "auto", pagesPerDay: 5 };
  const WPM = 230;

  let book = null, S = null, ui = {}, layout = null, pageCounts = [], opts = {}, open = false, measureKey = "";
  let speaking = false, rootEl = null, cleanup = [];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const chName = ci => { const c = book.chapters[ci]; return c.sub && c.sub !== c.title ? `${c.title} \u00b7 ${c.sub}` : c.title; };
  const fmtDate = t => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function blankState() { return { ch: 0, p: 0, settings: Object.assign({}, DEFAULTS), hl: [], notes: [], bookmarks: [], day: null, todayFrom: null, readToday: [], minutes: {} }; }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (opts.onSave && book && S) { const { settings, ...state } = S; opts.onSave(book.id, JSON.parse(JSON.stringify(state)), { ...settings }); } }, 600);
  }

  /* ---------------- Book loading ---------------- */
  function load(o) {
    book = o.book;
    book.chapters.forEach(c => { c.words = c.paras.join(" ").split(/\s+/).length; c.sub = c.sub || c.title; });
    S = Object.assign(blankState(), o.state || {});
    S.settings = Object.assign({}, DEFAULTS, o.settings || {});
    if (S.settings.turn === "curl") S.settings.turn = "flip";
    pageCounts = []; measureKey = ""; curPage = 0;
    rollDay();
  }
  function rollDay() {
    if (S.day !== today()) { S.day = today(); S.todayFrom = null; S.readToday = []; }
  }

  /* ---------------- DOM ---------------- */
  function build() {
    const root = rootEl;
    root.innerHTML = `
      <div class="rd-desk">
        <div class="rd-book" id="rd-book">
          <div class="rd-stack" aria-hidden="true"></div>
          <div class="rd-page rd-paper rd-left"></div><div class="rd-page rd-paper rd-right"></div>
          <div class="rd-gutter" aria-hidden="true"></div>
          <div class="rd-head rd-head-l" aria-hidden="true"></div><div class="rd-head rd-head-r" aria-hidden="true"></div>
          <div class="rd-viewport" id="rd-viewport"><div class="rd-flow" id="rd-flow" lang="en"></div></div>
          <div class="rd-folio rd-folio-l" aria-hidden="true"></div><div class="rd-folio rd-folio-r" aria-hidden="true"></div>
          <div class="rd-ribbon" aria-hidden="true"></div>
          <div class="rd-curl" aria-hidden="true"></div>
          <button class="rd-zone rd-zone-prev" data-r="prev" aria-label="Previous page"></button>
          <button class="rd-zone rd-zone-next" data-r="next" aria-label="Next page"></button>
        </div>
        <div class="rd-shade" aria-hidden="true"></div><div class="rd-warm" aria-hidden="true"></div>
      </div>
      <header class="rd-top rd-chrome">
        <button class="rd-ib" data-r="close" aria-label="Back to library">${ic("back")}</button>
        <div class="rd-title"><strong>${esc(book.title)}</strong><span id="rd-sub"></span></div>
        <button class="rd-ib" data-r="search" aria-label="Search the book">${ic("search")}</button>
        <button class="rd-ib" data-r="contents" aria-label="Contents and bookmarks">${ic("list")}</button>
        <button class="rd-ib" data-r="notes" aria-label="Notes and highlights">${ic("note")}<span class="rd-count" id="rd-count"></span></button>
        <button class="rd-ib" data-r="type" aria-label="Text and page settings">${ic("aa")}</button>
        <button class="rd-ib" data-r="bookmark" id="rd-bm" aria-label="Bookmark this page">${ic("bookmark")}</button>
      </header>
      <footer class="rd-bottom rd-chrome">
        <div class="rd-scrub"><label class="sr" for="rd-range">Page</label><input type="range" id="rd-range" min="1" max="1" value="1"></div>
        <div class="rd-meta"><span id="rd-pageinfo"></span><span id="rd-left"></span></div>
        <div class="rd-actions">
          <button class="rd-pill" data-r="aloud" id="rd-aloud">${ic("speaker")}<span>Read aloud</span></button>
          <button class="rd-pill" data-r="pagenote">${ic("plus")}<span>Note on this page</span></button>
          <button class="rd-pill" data-r="export">${ic("download")}<span>Export notes</span></button>
        </div>
      </footer>
      <div class="rd-pop" id="rd-pop" role="dialog" aria-label="Highlight" hidden></div>
      <div class="rd-sheet-wrap" id="rd-sheet-wrap" hidden><div class="rd-sheet-bg" data-r="sheet-close"></div><section class="rd-sheet" id="rd-sheet" role="dialog" aria-modal="true"></section></div>
      <div class="rd-toast" id="rd-toast" role="status" hidden></div>
      <div class="rd-measure" id="rd-measure" aria-hidden="true"><div class="rd-flow" id="rd-mflow"></div></div>`;
    ui = {
      root, book: root.querySelector("#rd-book"), viewport: root.querySelector("#rd-viewport"), flow: root.querySelector("#rd-flow"),
      pop: root.querySelector("#rd-pop"), sheetWrap: root.querySelector("#rd-sheet-wrap"), sheet: root.querySelector("#rd-sheet"),
      range: root.querySelector("#rd-range"), pageinfo: root.querySelector("#rd-pageinfo"), left: root.querySelector("#rd-left"),
      sub: root.querySelector("#rd-sub"), bm: root.querySelector("#rd-bm"), count: root.querySelector("#rd-count"),
      headL: root.querySelector(".rd-head-l"), headR: root.querySelector(".rd-head-r"), folioL: root.querySelector(".rd-folio-l"), folioR: root.querySelector(".rd-folio-r"),
      curl: root.querySelector(".rd-curl"), ribbon: root.querySelector(".rd-ribbon"), toast: root.querySelector("#rd-toast"),
      measure: root.querySelector("#rd-measure"), mflow: root.querySelector("#rd-mflow"), aloud: root.querySelector("#rd-aloud")
    };
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    ui.flow.addEventListener("pointerup", () => setTimeout(onSelect, 10));
    ui.flow.addEventListener("keyup", () => setTimeout(onSelect, 10));
    ui.range.addEventListener("change", () => gotoGlobal(+ui.range.value - 1));
    let sx = null;
    ui.book.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
    ui.book.addEventListener("touchend", e => {
      if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50 && window.getSelection().isCollapsed) turn(dx < 0 ? 1 : -1);
    }, { passive: true });
    const paper = makePaper(); if (paper) root.style.setProperty("--paper-img", `url(${paper})`);
    const onResize = () => { if (open) { measureKey = ""; relayout(true); } };
    const onKey = e => {
      if (!open || /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); turn(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(-1); }
      else if (e.key === "Escape") { if (!ui.sheetWrap.hidden) closeSheet(); else if (!ui.pop.hidden) hidePop(); else close(); }
    };
    window.addEventListener("resize", onResize); document.addEventListener("keydown", onKey);
    cleanup.push(() => { window.removeEventListener("resize", onResize); document.removeEventListener("keydown", onKey); });
  }

  function makePaper() {
    try {
      const W = 900, H = 1300, c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) { const gx = r() * W, gy = r() * H, rad = 80 + r() * 380, g = x.createRadialGradient(gx, gy, 0, gx, gy, rad); g.addColorStop(0, `rgba(${120 + r() * 40},${90 + r() * 30},${45 + r() * 20},${0.018 + r() * 0.03})`); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H); }
      for (let i = 0; i < 1600; i++) { x.strokeStyle = r() > 0.5 ? `rgba(105,80,45,${0.04 + r() * 0.06})` : `rgba(255,255,255,${0.15 + r() * 0.2})`; x.lineWidth = 0.4 + r() * 0.8; x.beginPath(); const sx = r() * W, sy = r() * H, a = r() * Math.PI, l = 6 + r() * 34; x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, sy + Math.sin(a) * l * 0.5 + (r() - 0.5) * 6, sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }
      for (let i = 0; i < 9; i++) { const gx = r() * W, gy = r() * H, rad = 3 + r() * 14, g = x.createRadialGradient(gx, gy, 0, gx, gy, rad); g.addColorStop(0, `rgba(150,95,35,${0.08 + r() * 0.1})`); g.addColorStop(1, "rgba(150,95,35,0)"); x.fillStyle = g; x.beginPath(); x.arc(gx, gy, rad, 0, 7); x.fill(); }
      const img = x.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9; }
      x.putImageData(img, 0, 0);
      const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(110,75,30,0.16)"); x.fillStyle = v; x.fillRect(0, 0, W, H);
      return c.toDataURL("image/jpeg", 0.82);
    } catch { return ""; }
  }
  function ic(n) {
    const p = {
      back: '<path d="M15 6l-6 6 6 6"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
      list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8" fill="currentColor"/><circle cx="4" cy="12" r=".8" fill="currentColor"/><circle cx="4" cy="18" r=".8" fill="currentColor"/>',
      note: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 12h8M8 16h6"/>',
      aa: '<path d="M3 18l5-12 5 12M5 14h6"/><path d="M14 18l3.5-8 3.5 8M15.2 15.5h4.6"/>',
      bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>', speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
      stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', plus: '<path d="M12 5v14M5 12h14"/>',
      download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>'
    }[n];
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /* ---------------- Theme + layout ---------------- */
  function applyTheme() {
    const s = S.settings, t = THEMES[s.theme], r = ui.root.style;
    r.setProperty("--pg-bg", t.bg); r.setProperty("--pg-fg", t.fg); r.setProperty("--pg-muted", t.muted); r.setProperty("--desk", t.desk);
    r.setProperty("--pg-font", FONTS[s.font][0]); r.setProperty("--pg-size", s.size + "px"); r.setProperty("--pg-lh", s.lh);
    r.setProperty("--pg-align", s.justify ? "justify" : "left");
    r.setProperty("--shade", String((100 - s.bright) / 100 * 0.7)); r.setProperty("--warm", String(s.warm / 100 * 0.35));
    ui.root.dataset.theme = s.theme;
  }

  function computeLayout() {
    const s = S.settings, vw = window.innerWidth, vh = window.innerHeight;
    const spread = s.spread === "two" ? vw >= 700 : s.spread === "one" ? false : vw >= 900;
    const mx = { narrow: 0.75, normal: 1, wide: 1.35 }[s.margin];
    const deskPad = vw < 520 ? 0 : 24;
    let bookW = spread ? Math.min(vw - 2 * deskPad, 1180) : Math.min(vw - 2 * deskPad, 640);
    let bookH = Math.min(vh - 2 * deskPad - (vw < 520 ? 0 : 8), spread ? bookW * 0.7 : 980);
    if (!spread && vw >= 520) bookH = Math.min(bookH, bookW * 1.5);
    const padX = Math.round((spread ? 52 : vw < 520 ? 26 : 44) * mx), padTop = vw < 520 ? 58 : 62, padBot = vw < 520 ? 58 : 60;
    const pageW = spread ? bookW / 2 : bookW;
    const tw = Math.floor(pageW - 2 * padX), th = Math.floor(bookH - padTop - padBot);
    const gap = 2 * padX;
    return { spread, bookW, bookH, padX, padTop, padBot, tw, th, gap, step: spread ? 2 : 1, colW: tw + gap };
  }

  function styleFlow(flow, L) {
    flow.style.columnWidth = L.tw + "px";
    flow.style.columnGap = L.gap + "px";
    flow.style.height = L.th + "px";
    flow.style.width = (L.spread ? 2 * L.tw + L.gap : L.tw) + "px";
  }

  function chapterHTML(ci) {
    const c = book.chapters[ci];
    const marks = S.hl.filter(h => h.ch === ci);
    const pnotes = S.notes.filter(n => n.ch === ci);
    return `<div class="rd-opener"><div class="rd-num">${esc(c.title)}</div><h2>${esc(c.sub)}</h2><div class="rd-orn">❦</div></div>` +
      c.paras.map((t, i) => `<p data-p="${i}" class="${i === 0 ? "rd-drop" : ""}">${paraHTML(t, marks.filter(h => h.p === i))}${pnotes.some(n => n.p === i) ? `<button class="rd-pnote" data-r="notes" aria-label="This page has a note">✎</button>` : ""}</p>`).join("") +
      (ci === book.chapters.length - 1 ? `<div class="rd-end">❦<br><span>The end</span></div>` : "");
  }
  function paraHTML(text, marks) {
    if (!marks.length) return esc(text);
    marks = marks.slice().sort((a, b) => a.s - b.s);
    let out = "", at = 0;
    for (const m of marks) {
      if (m.s < at) continue;
      out += esc(text.slice(at, m.s)) + `<mark data-h="${m.id}" class="rd-hl ${m.note ? "has-note" : ""}" style="--hc:${COLORS[m.color]}">${esc(text.slice(m.s, m.e))}</mark>`;
      at = m.e;
    }
    return out + esc(text.slice(at));
  }

  function measureAll() {
    const L = layout, key = [L.tw, L.th, L.gap, S.settings.font, S.settings.size, S.settings.lh, S.settings.justify].join("|");
    if (key === measureKey && pageCounts.length) return;
    measureKey = key;
    styleFlow(ui.mflow, L);
    ui.mflow.style.width = L.tw + "px";
    pageCounts = book.chapters.map((_, i) => {
      ui.mflow.innerHTML = chapterHTML(i);
      return Math.max(1, Math.round(ui.mflow.scrollWidth / L.colW + 0.49));
    });
    ui.mflow.innerHTML = "";
  }
  const totalPages = () => pageCounts.reduce((a, b) => a + b, 0);
  const chStart = ci => pageCounts.slice(0, ci).reduce((a, b) => a + b, 0);
  function localPages() { return Math.max(1, Math.round(ui.flow.scrollWidth / layout.colW + 0.49)); }

  let curPage = 0; /* local page index in the current chapter (left page in a spread) */
  function relayout(keepPlace) {
    applyTheme();
    layout = computeLayout();
    const L = layout, b = ui.book.style;
    b.width = L.bookW + "px"; b.height = L.bookH + "px";
    ui.root.classList.toggle("is-spread", L.spread);
    ui.root.style.setProperty("--zone", Math.max(28, L.padX) + "px");
    const vp = ui.viewport.style;
    vp.left = L.padX + "px"; vp.top = L.padTop + "px"; vp.width = (L.spread ? 2 * L.tw + L.gap : L.tw) + "px"; vp.height = L.th + "px";
    styleFlow(ui.flow, L);
    measureAll();
    renderChapter(keepPlace ? S.p : null);
  }

  function renderChapter(anchorP, atEnd) {
    ui.flow.style.transition = "none";
    ui.flow.innerHTML = chapterHTML(S.ch);
    const n = localPages();
    if (atEnd) curPage = Math.max(0, n - 1);
    else if (anchorP != null) curPage = pageOfPara(anchorP);
    else curPage = 0;
    if (layout.spread) curPage -= curPage % 2;
    position(false);
  }
  function pageOfPara(p) {
    const el = ui.flow.querySelector(`[data-p="${p}"]`);
    if (!el) return 0;
    const flowLeft = ui.flow.getBoundingClientRect().left;
    const rects = el.getClientRects();
    const x = rects.length ? rects[0].left - flowLeft + curPage * layout.colW : el.offsetLeft;
    return Math.max(0, Math.floor((x + 2) / layout.colW));
  }
  function firstVisiblePara() {
    const vpR = ui.viewport.getBoundingClientRect();
    for (const el of ui.flow.querySelectorAll("p[data-p]")) {
      for (const r of el.getClientRects()) if (r.right > vpR.left + 4 && r.left < vpR.right - 4) return +el.dataset.p;
    }
    return 0;
  }

  function position() {
    const L = layout, x = -curPage * L.colW;
    ui.flow.style.transition = "none";
    ui.flow.style.transform = `translateX(${x}px)`;
    requestAnimationFrame(() => { S.p = firstVisiblePara(); afterMove(); });
  }

  function globalPage() { return chStart(S.ch) + curPage; }
  function afterMove() {
    const g = globalPage(), tot = totalPages(), c = book.chapters[S.ch], L = layout;
    ui.headL.textContent = L.spread ? book.title : c.sub;
    ui.headR.textContent = c.sub;
    const isOpener = curPage === 0;
    ui.headL.style.visibility = isOpener ? "hidden" : "visible";
    ui.headR.style.visibility = "visible";
    ui.folioL.textContent = g + 1;
    ui.folioR.textContent = L.spread && g + 2 <= tot ? g + 2 : "";
    ui.range.max = tot; ui.range.value = g + 1;
    ui.pageinfo.textContent = `Page ${g + 1}${L.spread && g + 2 <= tot ? "–" + (g + 2) : ""} of ${tot} · ${c.title}`;
    const wordsLeftCh = Math.round(c.words * (1 - (curPage + L.step) / Math.max(1, pageCounts[S.ch])));
    const wordsLeftBook = book.chapters.slice(S.ch + 1).reduce((a, x) => a + x.words, 0) + Math.max(0, wordsLeftCh);
    ui.left.textContent = `${Math.max(1, Math.round(Math.max(0, wordsLeftCh) / WPM))} min left in ${c.title} · ${Math.round(wordsLeftBook / WPM / 60 * 10) / 10} h in book`;
    ui.sub.textContent = `${c.title} · ${Math.round((g + 1) / tot * 100)}%`;
    const marked = isBookmarked();
    ui.bm.classList.toggle("on", marked); ui.bm.setAttribute("aria-pressed", marked);
    ui.ribbon.classList.toggle("on", marked);
    const left = 1 - (g + 1) / tot;
    ui.root.style.setProperty("--stack-r", Math.max(1, Math.round(left * 7)) + "px");
    ui.root.style.setProperty("--stack-l", Math.max(1, Math.round((1 - left) * 7)) + "px");
    ui.count.textContent = (S.hl.length + S.notes.length) || "";
    S.at = { page: g + 1, total: tot, pct: Math.round((g + 1) / tot * 100), chapter: c.title };
    rollDay();
    if (S.todayFrom == null) S.todayFrom = g;
    for (let k = 0; k < L.step; k++) if (!S.readToday.includes(g + k) && g + k < tot) S.readToday.push(g + k);
    save();
    if (opts.onChange) opts.onChange();
  }

  /* ---------------- Turning pages ---------------- */
  let audioCtx = null;
  function rustle() {
    if (!S.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const len = audioCtx.sampleRate * 0.28, buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (0.6 + 0.4 * Math.sin(t * 40)); }
      const src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
      f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 0.7; g.gain.value = 0.18;
      src.buffer = buf; src.connect(f).connect(g).connect(audioCtx.destination); src.start();
    } catch {}
  }
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function face(src, idx, side) {
    const L = layout, el = document.createElement("div");
    el.className = "rd-face rd-paper" + (side === "l" ? " rd-face-l" : side === "r" ? " rd-face-r" : "");
    el.style.width = (L.spread ? L.bookW / 2 : L.bookW) + "px"; el.style.height = L.bookH + "px";
    if (idx >= 0 && idx < src.n) {
      const clip = document.createElement("div"); clip.className = "rd-faceclip";
      Object.assign(clip.style, { left: L.padX + "px", top: L.padTop + "px", width: L.tw + "px", height: L.th + "px" });
      const f = src.flow.cloneNode(true); f.removeAttribute("id"); f.style.transition = "none"; f.style.width = L.tw + "px"; f.style.transform = `translateX(${-idx * L.colW}px)`;
      clip.appendChild(f); el.appendChild(clip);
      const head = document.createElement("div"); head.className = "rd-facehead"; head.textContent = idx === 0 ? "" : side === "l" ? book.title : book.chapters[src.ch].sub; el.appendChild(head);
      const fol = document.createElement("div"); fol.className = "rd-facefolio"; fol.textContent = chStart(src.ch) + idx + 1; el.appendChild(fol);
    }
    return el;
  }
  let flipLayer = null;
  function endFlip() { if (flipLayer) { flipLayer.getAnimations({ subtree: true }).forEach(a => a.finish()); if (flipLayer) flipLayer.remove(); flipLayer = null; } }
  function flip(dir, old, nw) {
    endFlip();
    const L = layout, half = L.bookW / 2, layer = document.createElement("div"); layer.className = "rd-fliplayer"; flipLayer = layer;
    const place = (el, left) => { el.style.left = left + "px"; return el; };
    let under = null, leaf = document.createElement("div"), front, back, from, to, origin, leafLeft, reveal = null;
    leaf.className = "rd-leaf";
    if (L.spread) {
      if (dir > 0) { under = place(face(old, old.cur, "l"), 0); front = face(old, old.cur + 1, "r"); back = face(nw, nw.cur, "l"); from = 0; to = -180; origin = "left center"; leafLeft = half; reveal = half; }
      else { under = place(face(old, old.cur + 1, "r"), half); front = face(old, old.cur, "l"); back = face(nw, nw.cur + 1, "r"); from = 0; to = 180; origin = "right center"; leafLeft = 0; reveal = 0; }
      leaf.style.width = half + "px";
    } else {
      leaf.style.width = L.bookW + "px"; origin = "left center"; leafLeft = 0;
      if (dir > 0) { front = face(old, old.cur, "s"); back = face(old, -1, "s"); from = 0; to = -180; }
      else { under = place(face(old, old.cur, "s"), 0); front = face(nw, nw.cur, "s"); back = face(nw, -1, "s"); from = -180; to = 0; }
      reveal = 0;
    }
    leaf.style.left = leafLeft + "px"; leaf.style.height = L.bookH + "px"; leaf.style.transformOrigin = origin;
    front.classList.add("rd-leaf-front"); back.classList.add("rd-leaf-back");
    const sf = document.createElement("div"); sf.className = "rd-leafshade"; front.appendChild(sf);
    const sb = document.createElement("div"); sb.className = "rd-leafshade"; back.appendChild(sb);
    leaf.append(front, back);
    const cast = document.createElement("div"); cast.className = "rd-cast"; cast.style.left = reveal + "px"; cast.style.width = (L.spread ? half : L.bookW) + "px";
    if (under) layer.appendChild(under);
    layer.append(cast, leaf);
    ui.book.appendChild(layer);
    const dur = 760, ease = "cubic-bezier(.45,.05,.25,1)";
    const lift = dir > 0 ? -1 : 1;
    leaf.animate([
      { transform: `rotateY(${from}deg) translateZ(0)` },
      { transform: `rotateY(${(from + to) / 2}deg) translateZ(30px) skewY(${lift * 1.2}deg)`, offset: 0.5 },
      { transform: `rotateY(${to}deg) translateZ(0)` }], { duration: dur, easing: ease, fill: "forwards" });
    const fwd = from === 0;
    sf.animate([{ opacity: 0 }, { opacity: 0.55 }], { duration: dur, easing: ease, fill: "forwards", direction: fwd ? "normal" : "reverse" });
    sb.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: dur, easing: ease, fill: "forwards", direction: fwd ? "normal" : "reverse" });
    cast.animate([{ opacity: fwd ? 0.5 : 0 }, { opacity: 0.35, offset: 0.5 }, { opacity: fwd ? 0 : 0.5 }], { duration: dur, easing: ease, fill: "forwards" });
        setTimeout(() => { if (flipLayer === layer) { layer.remove(); flipLayer = null; } }, dur + 30);
  }
  function snapshot() { return { flow: ui.flow.cloneNode(true), ch: S.ch, cur: curPage, n: localPages() }; }
  function turn(dir) {
    hidePop(); endFlip();
    const n = localPages(), step = layout.step, old = snapshot();
    let moved = true;
    if (dir > 0) {
      if (curPage + step < n) { curPage += step; position(false); }
      else if (S.ch < book.chapters.length - 1) { S.ch++; renderChapter(null); }
      else { moved = false; flash("You've reached the end of the book."); }
    } else {
      if (curPage - step >= 0) { curPage -= step; position(false); }
      else if (S.ch > 0) { S.ch--; renderChapter(null, true); }
      else moved = false;
    }
    if (!moved) return;
    rustle();
    const mode = reduced() ? "none" : S.settings.turn;
    if (mode === "flip") flip(dir, old, { flow: ui.flow, ch: S.ch, cur: curPage, n: localPages() });
    else if (mode === "slide") { const x = -curPage * layout.colW, w = layout.colW * step; ui.flow.animate([{ transform: `translateX(${x + dir * w}px)`, opacity: 0.4 }, { transform: `translateX(${x}px)`, opacity: 1 }], { duration: 380, easing: "cubic-bezier(.3,.7,.2,1)" }); }
  }
  function fadeIn() { ui.flow.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 320, easing: "ease-out" }); }
  function gotoGlobal(g) {
    let ci = 0; while (ci < pageCounts.length - 1 && g >= chStart(ci + 1)) ci++;
    S.ch = ci; renderChapter(null);
    curPage = Math.min(localPages() - 1, g - chStart(ci)); if (layout.spread) curPage -= curPage % 2;
    position(false);
  }
  function gotoPara(ci, p, flashP) {
    S.ch = ci; renderChapter(p);
    if (flashP) requestAnimationFrame(() => { const el = ui.flow.querySelector(`[data-p="${p}"]`); if (el) el.animate([{ backgroundColor: "rgba(246,213,92,.55)" }, { backgroundColor: "transparent" }], { duration: 1600 }); });
  }

  /* ---------------- Bookmarks ---------------- */
  function visibleParas() {
    const vpR = ui.viewport.getBoundingClientRect(), out = [];
    for (const el of ui.flow.querySelectorAll("p[data-p]")) for (const r of el.getClientRects()) if (r.right > vpR.left + 4 && r.left < vpR.right - 4) { out.push(+el.dataset.p); break; }
    return out;
  }
  function isBookmarked() { const v = visibleParas(); return S.bookmarks.some(b => b.ch === S.ch && v.includes(b.p)); }
  function toggleBookmark() {
    const v = visibleParas();
    const i = S.bookmarks.findIndex(b => b.ch === S.ch && v.includes(b.p));
    if (i >= 0) { S.bookmarks.splice(i, 1); flash("Bookmark removed"); }
    else { S.bookmarks.push({ id: uid(), ch: S.ch, p: v[0] || 0, at: Date.now(), text: book.chapters[S.ch].paras[v[0] || 0].slice(0, 90) }); flash("Page bookmarked"); }
    save(); afterMove();
  }

  /* ---------------- Selection → highlight ---------------- */
  function textOffset(pEl, node, off) {
    const w = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT);
    let n = 0, t;
    while ((t = w.nextNode())) {
      if (t.parentElement.closest(".rd-pnote")) continue;
      if (t === node) return n + off;
      n += t.length;
    }
    return n;
  }
  function segmentsFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!ui.flow.contains(r.commonAncestorContainer)) return null;
    const segs = [];
    for (const pEl of ui.flow.querySelectorAll("p[data-p]")) {
      if (!r.intersectsNode(pEl)) continue;
      const len = book.chapters[S.ch].paras[+pEl.dataset.p].length;
      const s = pEl.contains(r.startContainer) ? textOffset(pEl, r.startContainer, r.startOffset) : 0;
      const e = pEl.contains(r.endContainer) ? textOffset(pEl, r.endContainer, r.endOffset) : len;
      let a = Math.max(0, Math.min(s, len)), b = Math.max(0, Math.min(e, len));
      const txt = book.chapters[S.ch].paras[+pEl.dataset.p];
      while (a < b && /\s/.test(txt[a])) a++; while (b > a && /\s/.test(txt[b - 1])) b--;
      if (b > a) segs.push({ p: +pEl.dataset.p, s: a, e: b });
    }
    return segs.length ? { segs, rect: r.getBoundingClientRect() } : null;
  }
  let pending = null;
  function onSelect() {
    const got = segmentsFromSelection();
    if (!got) return;
    pending = got.segs;
    const text = pending.map(g => book.chapters[S.ch].paras[g.p].slice(g.s, g.e)).join(" … ");
    showPop(got.rect, `
      <div class="rd-swatches">${Object.keys(COLORS).map(c => `<button class="rd-sw" style="--hc:${COLORS[c]}" data-r="hl" data-c="${c}" aria-label="Highlight ${COLOR_NAME[c]}"></button>`).join("")}</div>
      <div class="rd-popacts">
        <button data-r="hlnote">${ic("note")}<span>Note</span></button>
        <button data-r="copy">Copy</button>
        <button data-r="define">Define</button>
        <button data-r="explain">Explain</button>
      </div>`, text);
  }
  function addHighlight(color, note) {
    if (!pending) return null;
    const group = uid(), made = [];
    for (const g of pending) {
      S.hl = S.hl.filter(h => !(h.ch === S.ch && h.p === g.p && h.s < g.e && h.e > g.s));
      const h = { id: uid(), group, ch: S.ch, p: g.p, s: g.s, e: g.e, color, note: note || "", text: book.chapters[S.ch].paras[g.p].slice(g.s, g.e), at: Date.now(), page: globalPage() + 1 };
      S.hl.push(h); made.push(h);
    }
    pending = null; window.getSelection().removeAllRanges();
    refreshText(); save();
    return made[0];
  }
  function refreshText() {
    const keep = curPage;
    ui.flow.innerHTML = chapterHTML(S.ch); curPage = keep; position(false);
    measureKey = ""; measureAll();
  }

  /* ---------------- Popover ---------------- */
  let popText = "";
  function showPop(rect, html, text) {
    popText = text || "";
    const p = ui.pop; p.innerHTML = html; p.hidden = false;
    const pw = p.offsetWidth, ph = p.offsetHeight, vw = window.innerWidth;
    let x = Math.min(Math.max(8, rect.left + rect.width / 2 - pw / 2), vw - pw - 8);
    let y = rect.top - ph - 10; if (y < 60) y = rect.bottom + 10;
    p.style.left = x + "px"; p.style.top = y + "px";
  }
  function hidePop() { ui.pop.hidden = true; }
  function markPop(h, rect) {
    showPop(rect, `
      <div class="rd-swatches">${Object.keys(COLORS).map(c => `<button class="rd-sw ${h.color === c ? "on" : ""}" style="--hc:${COLORS[c]}" data-r="recolor" data-c="${c}" data-h="${h.id}" aria-label="${COLOR_NAME[c]}"></button>`).join("")}</div>
      ${h.note ? `<p class="rd-popnote">${esc(h.note)}</p>` : ""}
      <div class="rd-popacts">
        <button data-r="editnote" data-h="${h.id}">${ic("note")}<span>${h.note ? "Edit note" : "Add note"}</span></button>
        <button data-r="copyh" data-h="${h.id}">Copy</button>
        <button data-r="explainh" data-h="${h.id}">Explain</button>
        <button data-r="delh" data-h="${h.id}" class="rd-danger">Remove</button>
      </div>`, h.text);
  }
  function noteEditor(rect, title, value, onSave) {
    showPop(rect, `<form class="rd-noteform"><label for="rd-note-in">${esc(title)}</label><textarea id="rd-note-in" rows="4" placeholder="Your thoughts, a question, how you'll use this…">${esc(value || "")}</textarea><div class="rd-popacts"><button type="button" data-r="pop-cancel">Cancel</button><button type="submit" class="rd-primary">Save note</button></div></form>`);
    const f = ui.pop.querySelector("form"), ta = f.querySelector("textarea");
    ta.focus();
    f.addEventListener("submit", e => { e.preventDefault(); onSave(ta.value.trim()); hidePop(); });
  }

  /* ---------------- AI: explain, with the person's own Gemini key ---------------- */
  async function explain(text, rect) {
    showPop(rect, `<div class="rd-ai"><strong>Explain</strong><p id="rd-ai-out">Thinking\u2026</p></div>`);
    const out = ui.pop.querySelector("#rd-ai-out");
    if (!opts.explain) { out.textContent = "Connect your free Gemini key under You to get explanations."; return; }
    try {
      out.textContent = await opts.explain(`You help a reader understand a passage from "${book.title}" by ${book.author}. In 2 or 3 short, plain sentences, explain what it means in modern English and one way to apply it today. Passage: """${text.slice(0, 1500)}"""`);
    } catch { out.textContent = e && e.message === "quota" ? "Your Gemini key has used today's free allowance." : "Couldn't explain this right now. Try again in a moment."; }
  }

  /* ---------------- Read aloud ---------------- */
  async function readAloud() {
    if (speaking) { stopAloud(); return; }
    const vpR = ui.viewport.getBoundingClientRect();
    const words = [];
    for (const el of ui.flow.querySelectorAll("p[data-p]")) for (const r of el.getClientRects()) if (r.right > vpR.left + 4 && r.left < vpR.right - 4) { words.push(book.chapters[S.ch].paras[+el.dataset.p]); break; }
    const text = words.join(" ").slice(0, 1900) || book.chapters[S.ch].sub;
    speaking = true; ui.aloud.classList.add("on"); ui.aloud.querySelector("span").textContent = "Stop";
    try {
      await new Promise((res, rej) => { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.onend = res; u.onerror = rej; speechSynthesis.cancel(); speechSynthesis.speak(u); });
    } catch {}
    speaking = false; ui.aloud.classList.remove("on"); ui.aloud.querySelector("span").textContent = "Read aloud";
  }
  function stopAloud() { try { speechSynthesis.cancel(); } catch {} speaking = false; ui.aloud.classList.remove("on"); ui.aloud.querySelector("span").textContent = "Read aloud"; }

  /* ---------------- Sheets ---------------- */
  function openSheet(kind) {
    hidePop(); ui.sheetWrap.hidden = false; ui.sheet.dataset.kind = kind;
    ({ type: sheetType, contents: sheetContents, notes: sheetNotes, search: sheetSearch, export: sheetExport })[kind]();
    const f = ui.sheet.querySelector("input,button"); if (f) f.focus({ preventScroll: true });
  }
  function closeSheet() { ui.sheetWrap.hidden = true; }
  const sheetHead = (t, extra) => `<div class="rd-sh-head"><h3>${t}</h3>${extra || ""}<button class="rd-ib" data-r="sheet-close" aria-label="Close">${ic("close")}</button></div>`;

  function sheetType() {
    const s = S.settings, seg = (name, list, cur) => `<div class="rd-seg">${list.map(([v, l]) => `<button data-set="${name}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</div>`;
    ui.sheet.innerHTML = sheetHead("Text and page") + `
      <div class="rd-row"><span>Page</span><div class="rd-themes">${Object.entries(THEMES).map(([k, t]) => `<button class="rd-theme ${s.theme === k ? "on" : ""}" data-set="theme" data-v="${k}" style="background:${t.bg};color:${t.fg}" aria-pressed="${s.theme === k}">${t.name}</button>`).join("")}</div></div>
      <div class="rd-row"><span>Typeface</span>${seg("font", Object.entries(FONTS).map(([k, f]) => [k, `<span style="font-family:${f[0].replace(/"/g, "&quot;")}">${f[1]}</span>`]), s.font)}</div>
      <div class="rd-row"><label for="rd-size">Text size</label><div class="rd-slide"><span style="font-size:13px">A</span><input id="rd-size" type="range" min="14" max="28" step="1" value="${s.size}" data-set="size"><span style="font-size:20px">A</span></div></div>
      <div class="rd-row"><span>Line spacing</span>${seg("lh", [[1.4, "Tight"], [1.6, "Normal"], [1.85, "Loose"]], s.lh)}</div>
      <div class="rd-row"><span>Margins</span>${seg("margin", [["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"]], s.margin)}</div>
      <div class="rd-row"><span>Alignment</span>${seg("justify", [[true, "Justified"], [false, "Left"]], s.justify)}</div>
      <div class="rd-row"><span>Layout</span>${seg("spread", [["auto", "Auto"], ["one", "One page"], ["two", "Two pages"]], s.spread)}</div>
      <div class="rd-row"><span>Page turn</span>${seg("turn", [["flip", "Page flip"], ["slide", "Slide"], ["none", "Instant"]], s.turn)}</div>
      <div class="rd-row"><label for="rd-bright">Brightness</label><input id="rd-bright" type="range" min="40" max="100" value="${s.bright}" data-set="bright"></div>
      <div class="rd-row"><label for="rd-warm">Warmth</label><input id="rd-warm" type="range" min="0" max="100" value="${s.warm}" data-set="warm"></div>
      <div class="rd-row"><label for="rd-sound">Page sound</label><input id="rd-sound" type="checkbox" class="rd-switch" data-set="sound" ${s.sound ? "checked" : ""}></div>
      <div class="rd-row"><span>Daily pages</span>${seg("pagesPerDay", [[3, "3"], [5, "5"], [10, "10"], [20, "20"]], s.pagesPerDay)}</div>`;
  }
  async function fontsReady(f) {
    try { await Promise.race([document.fonts.load(`400 19px ${FONTS[f][0].split(",")[0]}`), new Promise(r => setTimeout(r, 1500))]); await document.fonts.ready; } catch {}
  }
  async function setSetting(k, v) {
    const s = S.settings;
    if (k === "size" || k === "bright" || k === "warm" || k === "pagesPerDay") v = +v;
    else if (k === "lh") v = +v; else if (k === "justify") v = v === true || v === "true"; else if (k === "sound") v = !!v;
    s[k] = v; save();
    if (k === "bright" || k === "warm" || k === "theme") { applyTheme(); }
    if (k === "font") await fontsReady(v);
    if (["font", "size", "lh", "margin", "justify", "spread"].includes(k)) { measureKey = ""; relayout(true); }
    if (opts.onChange) opts.onChange();
  }

  function sheetContents() {
    const tot = totalPages(), g = globalPage();
    ui.sheet.innerHTML = sheetHead("Contents") + `
      <ol class="rd-toc">${book.chapters.map((c, i) => { const st = chStart(i), here = i === S.ch; const done = Math.min(1, Math.max(0, (g - st + 1) / pageCounts[i])); return `<li><button data-r="toc" data-ch="${i}" class="${here ? "here" : ""}"><span class="rd-toc-t"><strong>${esc(c.title)}</strong> ${esc(c.sub.replace(/^The /, ""))}</span><span class="rd-toc-p">${st + 1}</span></button><span class="rd-toc-bar"><span style="width:${done * 100}%"></span></span></li>`; }).join("")}</ol>
      <h4 class="rd-sh-sub">Bookmarks</h4>
      ${S.bookmarks.length ? `<ul class="rd-list">${S.bookmarks.slice().sort((a, b) => a.ch - b.ch || a.p - b.p).map(b => `<li><button data-r="jump" data-ch="${b.ch}" data-p="${b.p}"><strong>${esc(book.chapters[b.ch].title)}</strong><span>${esc(b.text)}…</span></button><button class="rd-x" data-r="delbm" data-id="${b.id}" aria-label="Remove bookmark">${ic("close")}</button></li>`).join("")}</ul>` : `<p class="rd-empty">No bookmarks yet. Tap the ribbon at the top to mark a page.</p>`}
      <p class="rd-credit">${esc(book.title)}, by ${esc(book.author)}.${book.note ? " " + esc(book.note) + "." : ""} ${tot} pages at your current settings.</p>`;
  }

  let noteFilter = { kind: "all", color: null, q: "" };
  function allItems() {
    const items = [];
    const groups = {};
    S.hl.forEach(h => { (groups[h.group || h.id] = groups[h.group || h.id] || []).push(h); });
    Object.values(groups).forEach(list => {
      list.sort((a, b) => a.p - b.p);
      const f = list[0];
      items.push({ kind: "highlight", id: f.id, ids: list.map(x => x.id), ch: f.ch, p: f.p, s: f.s, color: f.color, text: list.map(x => x.text).join(" … "), note: list.map(x => x.note).filter(Boolean)[0] || "", at: f.at, page: f.page });
    });
    S.notes.forEach(n => items.push({ kind: "note", id: n.id, ch: n.ch, p: n.p, s: 0, text: n.text, at: n.at, page: n.page, context: book.chapters[n.ch].paras[n.p].slice(0, 80) }));
    return items.sort((a, b) => a.ch - b.ch || a.p - b.p || a.s - b.s);
  }
  function filtered() {
    const q = noteFilter.q.toLowerCase();
    return allItems().filter(it => (noteFilter.kind === "all" || it.kind === noteFilter.kind) && (!noteFilter.color || it.color === noteFilter.color) && (!q || (it.text + " " + (it.note || "")).toLowerCase().includes(q)));
  }
  function sheetNotes() {
    const items = filtered(), all = allItems();
    let lastCh = -1;
    ui.sheet.innerHTML = sheetHead(`Notes and highlights <span class="rd-badge">${all.length}</span>`, `<button class="rd-pill rd-primary" data-r="export">${ic("download")}<span>Export</span></button>`) + `
      <div class="rd-filters">
        <div class="rd-seg">${[["all", "All"], ["highlight", "Highlights"], ["note", "Notes"]].map(([k, l]) => `<button data-nf="${k}" aria-pressed="${noteFilter.kind === k}">${l}</button>`).join("")}</div>
        <div class="rd-cfilter">${Object.keys(COLORS).map(c => `<button class="rd-sw sm ${noteFilter.color === c ? "on" : ""}" style="--hc:${COLORS[c]}" data-ncf="${c}" aria-label="Only ${COLOR_NAME[c]}" aria-pressed="${noteFilter.color === c}"></button>`).join("")}</div>
        <label class="sr" for="rd-nq">Search notes</label><input id="rd-nq" type="search" placeholder="Search your notes" value="${esc(noteFilter.q)}">
      </div>
      <button class="rd-newnote" data-r="pagenote">${ic("plus")}<span>New note on this page</span></button>
      ${items.length ? `<div class="rd-notes">${items.map(it => {
        const head = it.ch !== lastCh ? `<h4 class="rd-sh-sub">${esc(chName(it.ch))}</h4>` : ""; lastCh = it.ch;
        return head + (it.kind === "highlight" ? `
          <article class="rd-item" style="--hc:${COLORS[it.color]}">
            <blockquote>${esc(it.text)}</blockquote>
            ${it.note ? `<p class="rd-itnote">${esc(it.note)}</p>` : ""}
            <div class="rd-itmeta"><span>Page ${it.page} · ${COLOR_NAME[it.color]} · ${fmtDate(it.at)}</span>
              <span><button data-r="jump" data-ch="${it.ch}" data-p="${it.p}">Go to</button><button data-r="noteitem" data-id="${it.id}">${it.note ? "Edit note" : "Add note"}</button><button data-r="delitem" data-ids="${it.ids.join(",")}" class="rd-danger">Remove</button></span></div>
          </article>` : `
          <article class="rd-item rd-pnoteitem">
            <p class="rd-itnote">${esc(it.text)}</p>
            <p class="rd-ctx">On: “${esc(it.context)}…”</p>
            <div class="rd-itmeta"><span>Page ${it.page} · Note · ${fmtDate(it.at)}</span>
              <span><button data-r="jump" data-ch="${it.ch}" data-p="${it.p}">Go to</button><button data-r="editpnote" data-id="${it.id}">Edit</button><button data-r="delpnote" data-id="${it.id}" class="rd-danger">Remove</button></span></div>
          </article>`);
      }).join("")}</div>` : `<p class="rd-empty">${all.length ? "Nothing matches these filters." : "Select any words on the page to highlight them in one of 8 colours, or add a note to a page. Everything is saved and can be exported."}</p>`}`;
    const q = ui.sheet.querySelector("#rd-nq");
    q.addEventListener("input", () => { noteFilter.q = q.value; const pos = q.selectionStart; sheetNotes(); const nq = ui.sheet.querySelector("#rd-nq"); nq.focus(); nq.setSelectionRange(pos, pos); });
  }

  function sheetSearch() {
    ui.sheet.innerHTML = sheetHead("Search") + `<form class="rd-searchform"><label class="sr" for="rd-q">Search the book</label><input id="rd-q" type="search" placeholder="A word or phrase, e.g. patience" autocomplete="off"></form><div id="rd-results"></div>`;
    const inp = ui.sheet.querySelector("#rd-q"), out = ui.sheet.querySelector("#rd-results");
    const run = () => {
      const q = inp.value.trim(); if (q.length < 2) { out.innerHTML = ""; return; }
      const ql = q.toLowerCase(), res = [];
      book.chapters.forEach((c, ci) => c.paras.forEach((t, p) => { let i = t.toLowerCase().indexOf(ql); if (i >= 0) res.push({ ci, p, i, t }); }));
      out.innerHTML = `<p class="rd-empty">${res.length} result${res.length === 1 ? "" : "s"}</p><ul class="rd-list">${res.slice(0, 80).map(r => { const a = Math.max(0, r.i - 50); return `<li><button data-r="jump" data-ch="${r.ci}" data-p="${r.p}"><strong>${esc(book.chapters[r.ci].title)}</strong><span>${a ? "…" : ""}${esc(r.t.slice(a, r.i))}<mark>${esc(r.t.slice(r.i, r.i + q.length))}</mark>${esc(r.t.slice(r.i + q.length, r.i + q.length + 70))}…</span></button></li>`; }).join("")}</ul>`;
    };
    inp.addEventListener("input", run);
    ui.sheet.querySelector("form").addEventListener("submit", e => { e.preventDefault(); run(); });
  }

  /* ---------------- Export ---------------- */
  let exp = { fmt: "docx", colors: true, notes: true, pages: true, dates: true, group: true };
  const FORMATS = [["docx", "Word", ".docx"], ["pdf", "PDF", ".pdf"], ["md", "Markdown", ".md"], ["txt", "Plain text", ".txt"], ["html", "Web page", ".html"], ["csv", "Spreadsheet", ".csv"]];
  function sheetExport() {
    const items = filtered(), n = items.length;
    ui.sheet.innerHTML = sheetHead("Export notes and highlights") + `
      <p class="rd-empty" style="margin-top:0">${n} item${n === 1 ? "" : "s"} from <em>${esc(book.title)}</em>${noteFilter.kind !== "all" || noteFilter.color || noteFilter.q ? " (your current filters apply)" : ""}.</p>
      <div class="rd-formats">${FORMATS.map(([k, l, e]) => `<button data-fmt="${k}" aria-pressed="${exp.fmt === k}"><strong>${l}</strong><span>${e}</span></button>`).join("")}</div>
      <div class="rd-checks">${[["notes", "Include my notes"], ["colors", "Show highlight colours"], ["pages", "Page numbers"], ["dates", "Dates"], ["group", "Group by chapter"]].map(([k, l]) => `<label><input type="checkbox" data-exp="${k}" ${exp[k] ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <div class="rd-preview" aria-label="Preview">${previewHTML(items)}</div>
      <div class="rd-exp-acts"><button class="rd-pill" data-r="copy-md">Copy as text</button><button class="rd-pill rd-primary" data-r="do-export" ${n ? "" : "disabled"}>${ic("download")}<span>Download ${FORMATS.find(f => f[0] === exp.fmt)[2]}</span></button></div>
      <p class="rd-credit" id="rd-exp-msg"></p>`;
  }
  function docModel(items) {
    const chs = [];
    items.forEach(it => { let g = chs.find(c => c.ch === it.ch); if (!g || !exp.group) { if (!exp.group && chs.length) g = chs[0]; else { g = { ch: it.ch, title: exp.group ? chName(it.ch) : "All notes", items: [] }; chs.push(g); } } g.items.push(it); });
    return { title: `${book.title}: notes and highlights`, meta: `${book.author}${book.note ? " · " + book.note : ""} · exported from Lumen on ${fmtDate(Date.now())}`, count: items.length, chapters: chs };
  }
  const metaLine = it => [exp.pages ? `Page ${it.page}` : "", it.kind === "highlight" && exp.colors ? COLOR_NAME[it.color] + " highlight" : it.kind === "note" ? "Note" : "", exp.dates ? fmtDate(it.at) : ""].filter(Boolean).join(" · ");
  function previewHTML(items) {
    const m = docModel(items.slice(0, 6));
    return `<div class="rd-doc"><h1>${esc(m.title)}</h1><p class="rd-doc-meta">${esc(m.meta)}</p>${m.chapters.map(c => `<h2>${esc(c.title)}</h2>${c.items.map(it => `<div class="rd-doc-it">${it.kind === "highlight" ? `<blockquote style="border-color:${exp.colors ? COLORS[it.color] : "#bbb"}">${esc(it.text)}</blockquote>` : ""}${(exp.notes || it.kind === "note") && (it.note || it.kind === "note") ? `<p><strong>${it.kind === "note" ? "Note" : "My note"}:</strong> ${esc(it.kind === "note" ? it.text : it.note)}</p>` : ""}<p class="rd-doc-meta">${esc(metaLine(it))}</p></div>`).join("")}`).join("")}${items.length > 6 ? `<p class="rd-doc-meta">…and ${items.length - 6} more</p>` : ""}</div>`;
  }
  function asMarkdown(items) {
    const m = docModel(items); let s = `# ${m.title}\n\n_${m.meta}_\n\n`;
    m.chapters.forEach(c => { s += `## ${c.title}\n\n`; c.items.forEach(it => {
      if (it.kind === "highlight") s += `> ${it.text}\n\n`;
      if (it.kind === "note") s += `**Note:** ${it.text}\n\n`; else if (exp.notes && it.note) s += `**My note:** ${it.note}\n\n`;
      const ml = metaLine(it); if (ml) s += `_${ml}_\n\n`;
    }); });
    return s;
  }
  function asText(items) {
    const m = docModel(items); let s = `${m.title}\n${m.meta}\n\n`;
    m.chapters.forEach(c => { s += `${c.title.toUpperCase()}\n\n`; c.items.forEach(it => {
      if (it.kind === "highlight") s += `“${it.text}”\n`;
      if (it.kind === "note") s += `Note: ${it.text}\n`; else if (exp.notes && it.note) s += `My note: ${it.note}\n`;
      const ml = metaLine(it); if (ml) s += `(${ml})\n`; s += "\n";
    }); });
    return s;
  }
  function asHTML(items) {
    const m = docModel(items);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(m.title)}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:48px auto;padding:0 20px;color:#222;line-height:1.6}h1{font-size:28px;margin-bottom:4px}h2{font-size:19px;margin-top:36px;border-bottom:1px solid #ddd;padding-bottom:6px}blockquote{margin:16px 0 4px;padding:6px 14px;border-left:5px solid #ccc;background:#fafafa}.meta{color:#777;font-size:13px;font-family:system-ui,sans-serif}</style></head><body><h1>${esc(m.title)}</h1><p class="meta">${esc(m.meta)}</p>${m.chapters.map(c => `<h2>${esc(c.title)}</h2>${c.items.map(it => `${it.kind === "highlight" ? `<blockquote style="border-color:${exp.colors ? COLORS[it.color] : "#ccc"}">${esc(it.text)}</blockquote>` : ""}${it.kind === "note" ? `<p><strong>Note:</strong> ${esc(it.text)}</p>` : exp.notes && it.note ? `<p><strong>My note:</strong> ${esc(it.note)}</p>` : ""}<p class="meta">${esc(metaLine(it))}</p>`).join("")}`).join("")}</body></html>`;
  }
  function asCSV(items) {
    const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = [["Book", "Chapter", "Page", "Type", "Colour", "Text", "Note", "Created"]];
    items.forEach(it => rows.push([book.title, book.chapters[it.ch].title, it.page, it.kind === "note" ? "Note" : "Highlight", it.kind === "highlight" ? COLOR_NAME[it.color] : "", it.kind === "note" ? "" : it.text, it.kind === "note" ? it.text : it.note, new Date(it.at).toISOString()]));
    return "﻿" + rows.map(r => r.map(q).join(",")).join("\r\n");
  }
  const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  async function asDocx(items) {
    const JSZip = (await import("jszip")).default;
    const m = docModel(items), W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const run = (t, rpr) => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
    const para = (inner, ppr) => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
    let body = para(run(m.title), `<w:pStyle w:val="Title"/>`) + para(run(m.meta, `<w:color w:val="777777"/><w:sz w:val="18"/>`));
    m.chapters.forEach(c => {
      body += para(run(c.title), `<w:pStyle w:val="Heading1"/>`);
      c.items.forEach(it => {
        if (it.kind === "highlight") {
          const col = exp.colors ? COLORS[it.color].slice(1) : "BBBBBB";
          body += para(run(it.text, `<w:i/>`), `<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${col}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F7F5F0"/><w:spacing w:before="200" w:after="60"/><w:ind w:left="240"/>`);
        }
        const note = it.kind === "note" ? it.text : exp.notes ? it.note : "";
        if (note) body += para(run(it.kind === "note" ? "Note: " : "My note: ", "<w:b/>") + run(note), `<w:spacing w:after="40"/><w:ind w:left="240"/>`);
        const ml = metaLine(it); if (ml) body += para(run(ml, `<w:color w:val="888888"/><w:sz w:val="16"/>`), `<w:spacing w:after="160"/><w:ind w:left="240"/>`);
      });
    });
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1300" w:bottom="1300" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(m.title)}</dc:title><dc:creator>Lumen</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
    zip.file("word/document.xml", doc);
    zip.file("word/styles.xml", styles);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  async function asPdf(items) {
    const { jsPDF } = await import("jspdf");
    const d = new jsPDF({ unit: "pt", format: "a4" });
    const latin = s => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/·/g, "-").replace(/[^\x00-\xFF]/g, "?");
    const m = docModel(items), PW = 595, PH = 842, M = 64, TW = PW - 2 * M;
    let y = M;
    const need = h => { if (y + h > PH - M) { d.addPage(); y = M; } };
    const text = (s, font, style, size, color, x, w) => { d.setFont(font, style); d.setFontSize(size); d.setTextColor(color); const lines = d.splitTextToSize(latin(s), w); const lh = size * 1.4; lines.forEach(l => { need(lh); d.text(l, x, y + size); y += lh; }); return lines.length * lh; };
    text(m.title, "times", "bold", 22, 30, M, TW); y += 4;
    text(m.meta, "helvetica", "normal", 9, 120, M, TW); y += 14;
    m.chapters.forEach(c => {
      need(48); y += 10; text(c.title, "times", "bold", 15, 30, M, TW);
      d.setDrawColor(210); d.line(M, y + 2, PW - M, y + 2); y += 12;
      c.items.forEach(it => {
        if (it.kind === "highlight") {
          const y0 = y; const hex = exp.colors ? COLORS[it.color] : "#BBBBBB";
          const h = text(it.text, "times", "italic", 12, 40, M + 14, TW - 14);
          d.setFillColor(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
          if (y > y0) d.rect(M, y0 + 2, 4, Math.min(h, y - y0) - 2, "F");
        }
        const note = it.kind === "note" ? it.text : exp.notes ? it.note : "";
        if (note) { y += 2; text((it.kind === "note" ? "Note: " : "My note: ") + note, "helvetica", "normal", 10.5, 50, M + 14, TW - 14); }
        const ml = metaLine(it); if (ml) text(ml, "helvetica", "normal", 8.5, 140, M + 14, TW - 14);
        y += 12;
      });
    });
    const n = d.getNumberOfPages();
    for (let i = 1; i <= n; i++) { d.setPage(i); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(150); d.text(`${latin(book.title)} - ${i} / ${n}`, PW / 2, PH - 32, { align: "center" }); }
    return d.output("blob");
  }
  async function doExport() {
    const items = filtered(), msg = ui.sheet.querySelector("#rd-exp-msg"), btn = ui.sheet.querySelector('[data-r="do-export"]');
    const f = FORMATS.find(x => x[0] === exp.fmt), name = `${book.title} - notes and highlights${f[2]}`;
    btn.disabled = true; msg.textContent = "Preparing your file…";
    try {
      let data;
      if (exp.fmt === "md") data = asMarkdown(items); else if (exp.fmt === "txt") data = asText(items); else if (exp.fmt === "html") data = asHTML(items);
      else if (exp.fmt === "csv") data = asCSV(items); else if (exp.fmt === "docx") data = await asDocx(items); else data = await asPdf(items);
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = name.replace(/[\\/:*?"<>|]+/g, " "); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      msg.textContent = `Saved \u201c${name}\u201d to your downloads.`;
    } catch {
      msg.textContent = "Couldn't create the file. Try another format, or Copy as text.";
    }
    btn.disabled = false;
  }

  /* ---------------- Events ---------------- */
  function flash(t) { ui.toast.textContent = t; ui.toast.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { ui.toast.hidden = true; }, 2200); }
  function toggleChrome(force) { ui.root.classList.toggle("chrome-off", force != null ? !force : !ui.root.classList.contains("chrome-off")); }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.set && (t.type === "range" || t.type === "checkbox")) setSetting(t.dataset.set, t.type === "checkbox" ? t.checked : t.value);
    if (t.dataset.exp) { exp[t.dataset.exp] = t.checked; sheetExport(); }
  }
  function findH(id) { return S.hl.find(h => h.id === id); }
  function onClick(e) {
    const mk = e.target.closest("mark[data-h]");
    if (mk && window.getSelection().isCollapsed) { const h = findH(mk.dataset.h); if (h) { markPop(h, mk.getBoundingClientRect()); return; } }
    const set = e.target.closest("[data-set]");
    if (set && set.tagName === "BUTTON") { setSetting(set.dataset.set, set.dataset.v); sheetType(); return; }
    const fmt = e.target.closest("[data-fmt]"); if (fmt) { exp.fmt = fmt.dataset.fmt; sheetExport(); return; }
    const nf = e.target.closest("[data-nf]"); if (nf) { noteFilter.kind = nf.dataset.nf; sheetNotes(); return; }
    const ncf = e.target.closest("[data-ncf]"); if (ncf) { noteFilter.color = noteFilter.color === ncf.dataset.ncf ? null : ncf.dataset.ncf; sheetNotes(); return; }
    const b = e.target.closest("[data-r]");
    if (!b) {
      if (e.target.closest(".rd-book") && window.getSelection().isCollapsed && ui.pop.hidden) toggleChrome();
      else if (!e.target.closest(".rd-pop")) hidePop();
      return;
    }
    const a = b.dataset.r, r = b.getBoundingClientRect();
    switch (a) {
      case "close": close(); break;
      case "prev": if (window.getSelection().isCollapsed) turn(-1); break;
      case "next": if (window.getSelection().isCollapsed) turn(1); break;
      case "type": case "contents": case "notes": case "search": case "export": openSheet(a); break;
      case "sheet-close": closeSheet(); break;
      case "bookmark": toggleBookmark(); break;
      case "aloud": readAloud(); break;
      case "hl": { const h = addHighlight(b.dataset.c); hidePop(); if (h) flash(`Highlighted in ${COLOR_NAME[h.color].toLowerCase()}`); break; }
      case "hlnote": { const segs = pending; noteEditor(r, "Note on this highlight", "", v => { pending = segs; const h = addHighlight("yellow", v); if (h) flash("Highlight and note saved"); }); break; }
      case "copy": copy(popText); hidePop(); window.getSelection().removeAllRanges(); break;
      case "define": { const w = popText.trim().split(/\s+/)[0].replace(/[^A-Za-z'-]/g, ""); window.open("https://www.merriam-webster.com/dictionary/" + encodeURIComponent(w.toLowerCase()), "_blank", "noopener"); hidePop(); break; }
      case "explain": explain(popText, r); break;
      case "recolor": { const h = findH(b.dataset.h); S.hl.filter(x => x.group === h.group || x.id === h.id).forEach(x => { x.color = b.dataset.c; }); save(); refreshText(); hidePop(); break; }
      case "editnote": case "noteitem": { const h = findH(b.dataset.h || b.dataset.id); noteEditor(r, "Note on this highlight", h.note, v => { S.hl.filter(x => x.group === h.group || x.id === h.id).forEach((x, i) => { x.note = i === 0 ? v : ""; }); save(); refreshText(); if (!ui.sheetWrap.hidden) sheetNotes(); flash(v ? "Note saved" : "Note removed"); }); break; }
      case "copyh": copy(findH(b.dataset.h).text); hidePop(); break;
      case "explainh": explain(findH(b.dataset.h).text, r); break;
      case "delh": { const h = findH(b.dataset.h); S.hl = S.hl.filter(x => !(x.group && x.group === h.group) && x.id !== h.id); save(); refreshText(); hidePop(); flash("Highlight removed"); break; }
      case "delitem": { const ids = b.dataset.ids.split(","); S.hl = S.hl.filter(x => !ids.includes(x.id)); save(); refreshText(); sheetNotes(); break; }
      case "pagenote": { const p = visibleParas()[0] || 0; noteEditor(r, "Note on this page", "", v => { if (!v) return; S.notes.push({ id: uid(), ch: S.ch, p, text: v, at: Date.now(), page: globalPage() + 1 }); save(); refreshText(); if (!ui.sheetWrap.hidden) sheetNotes(); flash("Note saved"); }); break; }
      case "editpnote": { const n = S.notes.find(x => x.id === b.dataset.id); noteEditor(r, "Edit note", n.text, v => { if (v) n.text = v; else S.notes = S.notes.filter(x => x !== n); save(); sheetNotes(); }); break; }
      case "delpnote": S.notes = S.notes.filter(x => x.id !== b.dataset.id); save(); refreshText(); sheetNotes(); break;
      case "pop-cancel": hidePop(); break;
      case "toc": closeSheet(); S.ch = +b.dataset.ch; renderChapter(null); fadeIn(); break;
      case "jump": closeSheet(); gotoPara(+b.dataset.ch, +b.dataset.p, true); break;
      case "delbm": S.bookmarks = S.bookmarks.filter(x => x.id !== b.dataset.id); save(); sheetContents(); afterMove(); break;
      case "do-export": doExport(); break;
      case "copy-md": copy(asText(filtered())); ui.sheet.querySelector("#rd-exp-msg").textContent = "Copied. Paste it anywhere."; break;
    }
  }
  function copy(t) {
    const done = () => flash("Copied");
    try { navigator.clipboard.writeText(t).then(done, () => fallback()); } catch { fallback(); }
    function fallback() { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch {} ta.remove(); }
  }

  /* ---------------- Public API ---------------- */
  function close() {
    stopAloud(); hidePop(); closeSheet();
    open = false; save();
    if (opts.onClose) opts.onClose(globalPage() + 1, totalPages());
  }

  return {
    async open(o) {
      opts = o;
      rootEl = o.root;
      load(o);
      build();
      await fontsReady(S.settings.font);
      open = true; document.body.classList.add("reading");
      ui.root.classList.remove("chrome-off");
      relayout(true);
      if (o.sheet) openSheet(o.sheet);
      const t = setTimeout(() => { if (open && ui.pop.hidden && ui.sheetWrap.hidden) toggleChrome(false); }, 2600);
      cleanup.push(() => clearTimeout(t));
    },
    close,
    destroy() {
      stopAloud(); clearTimeout(saveTimer);
      if (open && opts.onSave && book && S) { const { settings, ...state } = S; opts.onSave(book.id, JSON.parse(JSON.stringify(state)), { ...settings }); }
      open = false; endFlip(); cleanup.forEach(f => f()); cleanup = [];
      document.body.classList.remove("reading");
      if (rootEl) rootEl.innerHTML = "";
    },
  };
}
