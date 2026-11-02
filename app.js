(() => {
  "use strict";

  // Key predates the Lifestream name; kept so existing saves still load.
  const STORAGE_KEY = "se-rpg-tracker:v1";
  const GAME_PREFIX = "game:";
  const STANDALONE = "Standalone titles";
  const STATUSES = [
    { value: "none", label: "Not started" },
    { value: "playing", label: "In progress" },
    { value: "done", label: "Finished" },
  ];
  const STATUS_RANK = { none: 0, playing: 1, done: 2 };
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

  /** Games: one per title, each holding its versions (original release, ports, remakes). */
  let games = [];
  /** Catalog version id -> game id, used to migrate saves made per version. */
  const versionToGame = new Map();

  /* ---------- Save data (localStorage) ---------- */
  // Shape: { "game:<slug>": { s: "playing" | "done", r: 1..10 } }

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
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

  /** Validate entries and fold any per-version entries (older saves) into their game. */
  function cleanSave(data) {
    const out = {};
    for (const [key, v] of Object.entries(data || {})) {
      if (!v || typeof v !== "object") continue;
      const s = v.s === "playing" || v.s === "done" ? v.s : null;
      const r = Number(v.r);
      const rating = s === "done" && Number.isInteger(r) && r >= 1 && r <= 10 ? r : null;
      if (!s) continue;
      const id = key.startsWith(GAME_PREFIX) ? key : versionToGame.get(key) || key;
      const prev = out[id];
      // When several versions of one game were tracked, keep the furthest status and the best rating.
      const status = prev && STATUS_RANK[prev.s] > STATUS_RANK[s] ? prev.s : s;
      const best = Math.max((prev && prev.r) || 0, rating || 0);
      out[id] = status === "done" && best ? { s: status, r: best } : { s: status };
    }
    return out;
  }

  const statusOf = (id) => (save[id] && save[id].s) || "none";
  const ratingOf = (id) => (save[id] && save[id].r) || null;

  function setStatus(id, status) {
    if (status === "none") delete save[id];
    else if (status === "done") save[id] = { ...save[id], s: "done" };
    else save[id] = { s: status }; // ratings are only for finished games
    persist();
  }

  function setRating(id, rating) {
    save[id] = rating ? { s: "done", r: rating } : { s: "done" };
    persist();
  }

  /* ---------- Catalog ---------- */

  // Keeps non-Latin letters so e.g. "Kingdom Hearts χ" stays distinct from "Kingdom Hearts".
  const slug = (title) =>
    title.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

  const decadeOf = (year) => (year == null ? "tba" : String(Math.floor(year / 10) * 10));
  const uniq = (arr) => [...new Set(arr)];
  const byVersionYear = (a, b) => (a.year ?? 9999) - (b.year ?? 9999);

  function buildGames(rawList) {
    const groups = new Map();
    for (const raw of rawList) {
      const key = slug(raw.t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(raw);
    }

    return [...groups.entries()].map(([key, raws]) => {
      const id = GAME_PREFIX + key;
      const versions = raws
        .map((raw) => {
          versionToGame.set(raw.id, id);
          return {
            id: raw.id,
            year: typeof raw.y === "number" ? raw.y : null,
            platforms: uniq((raw.p || []).map((p) => PLATFORM_ALIASES[p] || p)),
            developer: raw.c || "Unknown",
            upcoming: !!raw.u,
          };
        })
        .sort(byVersionYear);
      const dated = versions.filter((v) => v.year != null);
      const game = {
        id,
        title: raws[0].t,
        franchise: raws.find((r) => r.f)?.f || STANDALONE,
        genres: uniq(raws.flatMap((r) => r.g || [])),
        developers: uniq(versions.map((v) => v.developer)),
        versions,
        year: dated.length ? dated[0].year : null,
        platforms: uniq(versions.flatMap((v) => v.platforms)),
        decades: uniq(versions.map((v) => decadeOf(v.year))),
        upcoming: versions.every((v) => v.upcoming),
        stores: uniq(raws.flatMap((r) => r.s || [])).filter((s) => STORES[s]),
      };
      for (const v of versions) v.game = game;
      game.search = [game.title, game.franchise, ...game.developers, ...game.genres, ...game.platforms]
        .join(" ")
        .toLowerCase();
      return game;
    });
  }

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

  // Counts in the filter menus are games, not versions.
  function buildFilters() {
    const fr = countBy(games, (g) => g.franchise);
    const franchises = [...fr.keys()].filter((f) => f !== STANDALONE).sort((a, b) => a.localeCompare(b));
    if (fr.has(STANDALONE)) franchises.push(STANDALONE);
    fillSelect(els.franchise, franchises, (f) => `${f} (${fr.get(f)})`);

    const pl = countBy(games, (g) => g.platforms);
    const platforms = [...pl.keys()].sort((a, b) => pl.get(b) - pl.get(a) || a.localeCompare(b));
    fillSelect(els.platform, platforms, (p) => `${p} (${pl.get(p)})`);

    const dc = countBy(games, (g) => g.decades);
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

  /** Does a single version satisfy the platform and decade filters? */
  const versionMatches = (v, f) =>
    (!f.platform || v.platforms.includes(f.platform)) && (!f.decade || decadeOf(v.year) === f.decade);

  /** A game matches when at least one of its versions fits the platform and decade filters together. */
  function applyFilters(list, f, { ignoreStatus = false } = {}) {
    const terms = f.q ? f.q.split(/\s+/) : [];
    return list.filter(
      (g) =>
        (!f.franchise || g.franchise === f.franchise) &&
        g.versions.some((v) => versionMatches(v, f)) &&
        (ignoreStatus || !f.status || statusOf(g.id) === f.status) &&
        terms.every((t) => g.search.includes(t))
    );
  }

  const byYear = (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title);

  function sortGames(list, sort) {
    const out = [...list];
    if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title) || byYear(a, b));
    else if (sort === "rating") out.sort((a, b) => (ratingOf(b.id) || 0) - (ratingOf(a.id) || 0) || byYear(a, b));
    else out.sort(byYear);
    return out;
  }

  /* ---------- Rendering: list ---------- */

  function badge(text) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = text;
    return b;
  }

  function renderVersion(v, g, f) {
    const li = document.createElement("li");
    if ((f.platform || f.decade) && !versionMatches(v, f)) li.className = "dim";

    const year = document.createElement("span");
    year.className = "v-year" + (v.year == null ? " tba" : "");
    year.textContent = v.year ?? "TBA";

    const info = document.createElement("span");
    info.textContent = v.platforms.length ? v.platforms.join(", ") : "Platforms not listed";
    if (g.developers.length > 1) {
      const dev = document.createElement("span");
      dev.className = "v-dev";
      dev.textContent = ` · ${v.developer}`;
      info.appendChild(dev);
    }
    if (v.upcoming && !g.upcoming) info.appendChild(badge("Upcoming"));

    li.append(year, info);
    return li;
  }

  function renderCard(g, f) {
    const node = els.tpl.content.firstElementChild.cloneNode(true);
    const status = statusOf(g.id);
    node.dataset.id = g.id;
    node.dataset.status = status;

    const title = node.querySelector(".game-title");
    title.textContent = g.title;
    if (g.upcoming) title.appendChild(badge("Upcoming"));

    const year = node.querySelector(".game-year");
    year.textContent = g.year ?? "TBA";
    year.classList.toggle("tba", g.year == null);
    if (g.versions.length > 1) year.title = `First released ${g.year}; ${g.versions.length} versions`;

    node.querySelector(".game-meta").textContent = [
      g.franchise === STANDALONE ? null : g.franchise,
      g.developers.length > 1 ? null : g.developers[0],
      g.genres.join(", "),
      g.versions.length > 1 ? `${g.versions.length} versions` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    node.querySelector(".versions").replaceChildren(...g.versions.map((v) => renderVersion(v, g, f)));

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
    els.list.replaceChildren(...shown.map((g) => renderCard(g, f)));
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
      games = buildGames(data.games || []);
      const migrated = cleanSave(save);
      if (JSON.stringify(migrated) !== JSON.stringify(save)) {
        save = migrated;
        persist();
      }
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
    statusOf, ratingOf, currentFilters, applyFilters, versionMatches, cleanSave, decadeOf, STANDALONE, STORAGE_KEY,
    refresh() { renderSummary(); renderList(); document.dispatchEvent(new CustomEvent("tracker:change")); },
  };
})();
