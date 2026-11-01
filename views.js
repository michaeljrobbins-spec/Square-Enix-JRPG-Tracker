(() => {
  "use strict";

  const T = window.Tracker;
  const $ = (sel) => document.querySelector(sel);

  /* ---------- Tabs ---------- */

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  let activeView = "view-list";

  function selectTab(tab, focus) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
    activeView = tab.getAttribute("aria-controls");
    if (focus) tab.focus();
    renderActive();
  }

  tabs.forEach((tab, i) => {
    tab.tabIndex = i === 0 ? 0 : -1;
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      selectTab(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });

  /* ---------- Timeline ---------- */

  const timelineEl = $("#timeline");
  const detailEl = $("#year-detail");
  let selectedYear = null;

  /** Every release (version) of the games that pass the filters, limited to versions that fit the platform/decade filters. */
  function filteredReleases() {
    const f = T.currentFilters();
    return T.applyFilters(T.games, f, { ignoreStatus: true }).flatMap((g) =>
      g.versions.filter((v) => T.versionMatches(v, f))
    );
  }

  function renderTimeline() {
    const releases = filteredReleases();
    const dated = T.games.flatMap((g) => g.versions).filter((v) => v.year != null).map((v) => v.year);
    if (!dated.length) return;
    const minY = Math.min(...dated);
    const maxY = Math.max(...dated);

    const byYear = new Map();
    let tba = 0;
    for (const v of releases) {
      if (v.year == null) { tba++; continue; }
      const e = byYear.get(v.year) || { total: 0, done: 0, upcoming: 0 };
      e.total++;
      if (T.statusOf(v.game.id) === "done") e.done++;
      if (v.upcoming) e.upcoming++;
      byYear.set(v.year, e);
    }
    const max = Math.max(1, ...[...byYear.values()].map((e) => e.total));

    const frag = document.createDocumentFragment();
    for (let y = minY; y <= maxY; y++) {
      const e = byYear.get(y) || { total: 0, done: 0, upcoming: 0 };
      const col = document.createElement("button");
      col.type = "button";
      col.className = "tl-col" + (y % 10 === 0 ? " decade" : "") + (e.total ? "" : " empty");
      col.dataset.year = y;
      col.disabled = !e.total;
      col.setAttribute("aria-pressed", String(selectedYear === y));
      col.setAttribute("aria-label", `${y}: ${e.total} release${e.total === 1 ? "" : "s"}, ${e.done} finished`);
      col.title = `${y} — ${e.total} release${e.total === 1 ? "" : "s"}, ${e.done} finished`;

      const count = document.createElement("span");
      count.className = "tl-count";
      count.textContent = e.total || "";

      const bar = document.createElement("span");
      bar.className = "tl-bar" + (e.upcoming && e.upcoming === e.total ? " upcoming" : "");
      bar.style.height = e.total ? `${(e.total / max) * 170}px` : "2px";
      if (e.done) {
        const done = document.createElement("span");
        done.className = "tl-done";
        done.style.height = `${(e.done / e.total) * 100}%`;
        bar.appendChild(done);
      }

      const label = document.createElement("span");
      label.className = "tl-label";
      label.textContent = y;

      col.append(count, bar, label);
      frag.appendChild(col);
    }
    timelineEl.replaceChildren(frag);

    if (tba) {
      const note = document.createElement("p");
      note.className = "bar-label";
      note.textContent = `+ ${tba} announced release${tba === 1 ? "" : "s"} without a year.`;
      timelineEl.parentElement.querySelector(".bar-label")?.remove();
      timelineEl.parentElement.appendChild(note);
    } else {
      timelineEl.parentElement.querySelector(".bar-label")?.remove();
    }

    renderYearDetail(releases);
  }

  function renderYearDetail(releases) {
    if (selectedYear == null) { detailEl.hidden = true; return; }
    const items = releases
      .filter((v) => v.year === selectedYear)
      .sort((a, b) => a.game.title.localeCompare(b.game.title));
    if (!items.length) { detailEl.hidden = true; return; }
    const h = document.createElement("h2");
    h.textContent = `${selectedYear} · ${items.length} release${items.length === 1 ? "" : "s"}`;
    const ul = document.createElement("ul");
    for (const v of items) {
      const g = v.game;
      const li = document.createElement("li");
      const s = T.statusOf(g.id);
      if (s !== "none") li.className = s;
      const r = T.ratingOf(g.id);
      const isRerelease = g.year != null && v.year > g.year;
      li.textContent =
        g.title +
        (v.platforms.length ? ` (${v.platforms.join(", ")})` : "") +
        (isRerelease ? ` · first released ${g.year}` : "") +
        (r ? ` — ${r}/10` : "");
      ul.appendChild(li);
    }
    detailEl.replaceChildren(h, ul);
    detailEl.hidden = false;
  }

  timelineEl.addEventListener("click", (e) => {
    const col = e.target.closest(".tl-col");
    if (!col || col.disabled) return;
    const y = Number(col.dataset.year);
    selectedYear = selectedYear === y ? null : y;
    renderTimeline();
  });

  /* ---------- Records by franchise ---------- */

  function renderRecords() {
    const rows = new Map();
    for (const g of T.games) {
      const r = rows.get(g.franchise) || { total: 0, done: 0, sum: 0, rated: 0 };
      r.total++;
      if (T.statusOf(g.id) === "done") r.done++;
      const rating = T.ratingOf(g.id);
      if (rating) { r.sum += rating; r.rated++; }
      rows.set(g.franchise, r);
    }
    const sorted = [...rows.entries()].sort(
      (a, b) => (a[0] === T.STANDALONE) - (b[0] === T.STANDALONE) || b[1].total - a[1].total || a[0].localeCompare(b[0])
    );
    const tbody = $("#records tbody");
    tbody.replaceChildren(
      ...sorted.map(([name, r]) => {
        const tr = document.createElement("tr");
        const nameTd = document.createElement("td");
        nameTd.textContent = name;
        const mini = document.createElement("span");
        mini.className = "mini-bar";
        const fill = document.createElement("span");
        fill.style.width = `${(r.done / r.total) * 100}%`;
        mini.appendChild(fill);
        nameTd.appendChild(mini);
        const cells = [r.done, r.total, r.rated ? (r.sum / r.rated).toFixed(1) : "–"].map((v) => {
          const td = document.createElement("td");
          td.textContent = v;
          return td;
        });
        tr.append(nameTd, ...cells);
        return tr;
      })
    );
  }

  /* ---------- Save management ---------- */

  const msg = $("#save-msg");
  const say = (text) => { msg.textContent = text; };

  $("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(T.save, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `se-rpg-tracker-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say("Save exported.");
  });

  $("#import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not a save file");
      const clean = T.cleanSave(data); // also converts saves made per version to per game
      T.save = clean;
      T.refresh();
      say(`Save loaded: ${Object.keys(clean).length} games.`);
    } catch (err) {
      say(`Couldn't read that file (${err.message}).`);
    }
  });

  $("#wipe").addEventListener("click", () => {
    if (!confirm("Erase all statuses and ratings? This can't be undone.")) return;
    T.save = {};
    T.refresh();
    say("Save erased.");
  });

  /* ---------- Wiring ---------- */

  function renderActive() {
    if (!T.games.length) return;
    if (activeView === "view-timeline") renderTimeline();
    else if (activeView === "view-status") renderRecords();
  }

  document.addEventListener("tracker:ready", renderActive);
  document.addEventListener("tracker:change", renderActive);
  document.addEventListener("tracker:filter", renderActive);
})();
