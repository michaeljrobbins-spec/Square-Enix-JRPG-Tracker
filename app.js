(() => {
  "use strict";

  const STORAGE_KEY = "se-rpg-tracker:v1";
  const STANDALONE = "Standalone titles";
  const STATUSES = [
    { value: "none", label: "Not started" },
    { value: "playing", label: "In progress" },
    { value: "done", label: "Finished" },
  ];
  const PLATFORM_ALIASES = { "Microsoft Windows": "Windows" };
  const STORES = {
    steam: { label: "Steam", url: (t) => `https://store.steampowered.com/search/?term=${encodeURIComponent(t)}` },
    playstation: { label: "PlayStation Store", url: (t) => `https://store.playstation.com/en-us/search/${encodeURIComponent(t)}` },
    nintendo: { label: "Nintendo eShop", url: (t) => `https://www.nintendo.com/us/search/#q=${encodeURIComponent(t)}` },
    xbox: { label: "Xbox Store", url: (t) => `https://www.xbox.com/en-US/search/results/games?q=${encodeURIComponent(t)}` },
  };

  const $ = (sel) => document.querySelector(sel);
  const els = {
    q: $("#q"),
    franchise: $("#f-franchise"),
    platform: $("#f-platform"),
    decade: $("#f-decade"),
    status: $("#f-status"),
    sort: $("#sort"),
    reset: $("#reset"),
    list: $("#game-list"),
    count: $("#result-count"),
    tpl: $("#game-tpl"),
  };

  let games = [];

  /* ---------- Save data (localStorage) ---------- */

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  let save = loadSave();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      /* storage unavailable (private mode, quota) — keep working in memory */
    }
  }

  const statusOf = (id) => (save[id] && save[id].s) || "none";
  const ratingOf = (id) => (save[id] && save[id].r) || null;

  function setStatus(id, status) {
    const entry = { ...(save[id] || {}) };
    if (status === "none") delete entry.s;
    else entry.s = status;
    if (status !== "done") delete entry.r; // ratings are only for finished games
    if (Object.keys(entry).length) save[id] = entry;
    else delete save[id];
    persist();
  }

  function setRating(id, rating) {
    const entry = { ...(save[id] || {}) };
    if (rating) entry.r = rating;
    else delete entry.r;
    save[id] = entry;
    persist();
  }

  /* ---------- Catalog ---------- */

  function normalize(raw) {
    const platforms = [...new Set((raw.p || []).map((p) => PLATFORM_ALIASES[p] || p))];
    return {
      id: raw.id,
      title: raw.t,
      year: typeof raw.y === "number" ? raw.y : null,
      platforms,
      franchise: raw.f || STANDALONE,
      genres: raw.g || [],
      developer: raw.c || "Unknown",
      upcoming: !!raw.u,
      stores: (raw.s || []).filter((s) => STORES[s]),
      search: [raw.t, raw.f, raw.c, ...(raw.g || []), ...platforms].join(" ").toLowerCase(),
    };
  }

  const decadeOf = (year) => (year == null ? "tba" : String(Math.floor(year / 10) * 10));

  function fillSelect(select, values, labelFn = (v) => v) {
    const frag = document.createDocumentFragment();
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = labelFn(v);
      frag.appendChild(opt);
    }
    select.appendChild(frag);
  }

  function countBy(list, keyFn) {
    const m = new Map();
    for (const g of list) for (const k of [].concat(keyFn(g))) m.set(k, (m.get(k) || 0) + 1);
    return m;
  }

  function buildFilters() {
    const fr = countBy(games, (g) => g.franchise);
    const franchises = [...fr.keys()].filter((f) => f !== STANDALONE).sort((a, b) => a.localeCompare(b));
    if (fr.has(STANDALONE)) franchises.push(STANDALONE);
    fillSelect(els.franchise, franchises, (f) => `${f} (${fr.get(f)})`);

    const pl = countBy(games, (g) => g.platforms);
    const platforms = [...pl.keys()].sort((a, b) => pl.get(b) - pl.get(a) || a.localeCompare(b));
    fillSelect(els.platform, platforms, (p) => `${p} (${pl.get(p)})`);

    const dc = countBy(games, (g) => decadeOf(g.year));
    const decades = [...dc.keys()].sort((a, b) => (a === "tba") - (b === "tba") || a.localeCompare(b));
    fillSelect(els.decade, decades, (d) => `${d === "tba" ? "Not yet dated" : d + "s"} (${dc.get(d)})`);
  }

  /* ---------- Filtering ---------- */

  function currentFilters() {
    return {
      q: els.q.value.trim().toLowerCase(),
      franchise: els.franchise.value,
      platform: els.platform.value,
      decade: els.decade.value,
      status: els.status.value,
      sort: els.sort.value,
    };
  }

  function applyFilters(list, f, { ignoreStatus = false } = {}) {
    const terms = f.q ? f.q.split(/\s+/) : [];
    return list.filter(
      (g) =>
        (!f.franchise || g.franchise === f.franchise) &&
        (!f.platform || g.platforms.includes(f.platform)) &&
        (!f.decade || decadeOf(g.year) === f.decade) &&
        (ignoreStatus || !f.status || statusOf(g.id) === f.status) &&
        terms.every((t) => g.search.includes(t))
    );
  }

  const byYear = (a, b) =>
    (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title);

  function sortGames(list, sort) {
    const out = [...list];
    if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title) || byYear(a, b));
    else if (sort === "rating") out.sort((a, b) => (ratingOf(b.id) || 0) - (ratingOf(a.id) || 0) || byYear(a, b));
    else out.sort(byYear);
    return out;
  }

  /* ---------- Rendering: list ---------- */

  function renderCard(g) {
    const node = els.tpl.content.firstElementChild.cloneNode(true);
    const status = statusOf(g.id);
    node.dataset.id = g.id;
    node.dataset.status = status;

    const title = node.querySelector(".game-title");
    title.textContent = g.title;
    if (g.upcoming) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = "Upcoming";
      title.appendChild(b);
    }

    const year = node.querySelector(".game-year");
    year.textContent = g.year ?? "TBA";
    year.classList.toggle("tba", g.year == null);

    node.querySelector(".game-meta").textContent =
      [g.franchise === STANDALONE ? null : g.franchise, g.developer, g.genres.join(", ")]
        .filter(Boolean)
        .join(" · ");
    node.querySelector(".game-platforms").textContent = g.platforms.length
      ? g.platforms.join(", ")
      : "Platforms not listed";

    const group = node.querySelector(".status-group");
    const name = `status-${g.id}`;
    for (const s of STATUSES) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = s.value;
      input.checked = s.value === status;
      const span = document.createElement("span");
      span.textContent = s.label;
      label.append(input, span);
      group.appendChild(label);
    }

    const ratingWrap = node.querySelector(".rating");
    const sel = node.querySelector(".rating-select");
    sel.setAttribute("aria-label", `Rating for ${g.title}`);
    fillSelect(sel, ["", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (v) => (v === "" ? "–" : `${v}/10`));
    sel.value = ratingOf(g.id) ?? "";
    ratingWrap.hidden = status !== "done";

    const stores = node.querySelector(".game-stores");
    for (const s of g.stores) {
      const a = document.createElement("a");
      a.href = STORES[s].url(g.title);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = STORES[s].label;
      stores.appendChild(a);
    }
    return node;
  }

  function renderList() {
    const f = currentFilters();
    const shown = sortGames(applyFilters(games, f), f.sort);
    els.list.replaceChildren(...shown.map(renderCard));
    els.count.textContent = shown.length
      ? `${shown.length} of ${games.length} games found.`
      : "No games match. Try loosening the filters.";
  }

  /* ---------- Summary ---------- */

  function renderSummary() {
    let done = 0, playing = 0, sum = 0, rated = 0;
    for (const g of games) {
      const s = statusOf(g.id);
      if (s === "done") done++;
      else if (s === "playing") playing++;
      const r = ratingOf(g.id);
      if (r) { sum += r; rated++; }
    }
    const pct = games.length ? Math.round((done / games.length) * 100) : 0;
    $("#sum-total").textContent = games.length;
    $("#sum-done").textContent = done;
    $("#sum-playing").textContent = playing;
    $("#sum-avg").textContent = rated ? (sum / rated).toFixed(1) : "–";
    $("#sum-bar").style.width = pct + "%";
    $("#sum-pct").textContent = `${pct}% complete`;
  }

  /* ---------- Events ---------- */

  els.list.addEventListener("change", (e) => {
    const card = e.target.closest(".game");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.type === "radio") {
      setStatus(id, e.target.value);
      card.dataset.status = e.target.value;
      const wrap = card.querySelector(".rating");
      wrap.hidden = e.target.value !== "done";
      if (wrap.hidden) card.querySelector(".rating-select").value = "";
    } else if (e.target.classList.contains("rating-select")) {
      setRating(id, Number(e.target.value) || null);
    }
    renderSummary();
    document.dispatchEvent(new CustomEvent("tracker:change"));
  });

  for (const el of [els.franchise, els.platform, els.decade, els.status, els.sort]) {
    el.addEventListener("change", () => document.dispatchEvent(new CustomEvent("tracker:filter")));
  }
  let qTimer;
  els.q.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => document.dispatchEvent(new CustomEvent("tracker:filter")), 120);
  });
  els.reset.addEventListener("click", () => {
    els.q.value = "";
    for (const el of [els.franchise, els.platform, els.decade, els.status]) el.value = "";
    els.sort.value = "year";
    document.dispatchEvent(new CustomEvent("tracker:filter"));
  });

  document.addEventListener("tracker:filter", renderList);

  /* ---------- Boot ---------- */

  fetch("catalog.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      games = (data.games || []).map(normalize);
      buildFilters();
      renderSummary();
      renderList();
      document.dispatchEvent(new CustomEvent("tracker:ready"));
    })
    .catch((err) => {
      els.count.textContent =
        `Couldn't load catalog.json (${err.message}). If you opened this file directly, ` +
        "serve the folder over HTTP instead, e.g. python3 -m http.server.";
    });

  // Shared with the timeline and records views.
  window.Tracker = {
    get games() { return games; },
    get save() { return save; },
    set save(v) { save = v; persist(); },
    statusOf, ratingOf, currentFilters, applyFilters, decadeOf, STANDALONE, STORAGE_KEY,
    refresh() { renderSummary(); renderList(); document.dispatchEvent(new CustomEvent("tracker:change")); },
  };
})();
