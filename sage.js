(() => {
  "use strict";

  /*
   * The Sage recommends three games you haven't started, based on the
   * franchises and developers of the games you've rated highly.
   *
   * Scoring, for each unstarted game:
   *   - same franchise as a highly rated game: + weight of that game
   *   - same developer:                        + 0.3 × weight
   *   - shares a genre:                        + 0.15 × weight (tie-breaker)
   * where weight = rating − 6 (7/10 → 1 … 10/10 → 4).
   * Picks are spread across franchises: each repeat of a franchise
   * already chosen multiplies a game's score by 0.35.
   * The reason cites the liked game closest to the suggestion (same genre,
   * nearby release year), not always the top-rated one.
   */

  const T = window.Tracker;
  const $ = (sel) => document.querySelector(sel);

  const LIKED_MIN = 7;
  const PICKS = 3;
  const DEV_FACTOR = 0.3;
  const GENRE_FACTOR = 0.15;
  const REPEAT_PENALTY = 0.35;

  const panel = $("#view-sage");
  const listEl = $("#sage-list");
  const introEl = $("#sage-intro");
  const againBtn = $("#sage-again");

  // Games already offered in this visit, so "Consult again" shows new ones.
  const offered = new Set();
  let current = [];

  // Works with one entry per release or with grouped games (one entry, several versions).
  const developersOf = (g) => g.developers || [g.developer];
  const titleKey = (g) => g.title.trim().toLowerCase();

  /** Highly rated games, one per title (best rating wins). */
  function likedGames() {
    const byTitle = new Map();
    for (const g of T.games) {
      const r = T.ratingOf(g.id);
      if (!r || r < LIKED_MIN) continue;
      const prev = byTitle.get(titleKey(g));
      if (!prev || r > prev.rating) byTitle.set(titleKey(g), { game: g, rating: r, weight: r - 6 });
    }
    return [...byTitle.values()];
  }

  /** Unstarted, released games, one per title. A title counts as started if any of its entries is. */
  function candidates() {
    const started = new Set(T.games.filter((g) => T.statusOf(g.id) !== "none").map(titleKey));
    const byTitle = new Map();
    for (const g of T.games) {
      const key = titleKey(g);
      if (started.has(key) || g.upcoming || g.year == null) continue;
      if (!byTitle.has(key) || g.year < byTitle.get(key).year) byTitle.set(key, g);
    }
    return [...byTitle.values()];
  }

  /** How good a liked game is as the example in a reason: rating, shared genre, close release year. */
  const affinity = (L, game, sharesGenre) =>
    L.weight + (sharesGenre ? 1.5 : 0) - Math.abs((L.game.year ?? game.year) - game.year) / 20;

  function score(game, liked) {
    let total = 0;
    let bestFranchise = null;
    let bestDeveloper = null;
    const devs = developersOf(game);
    for (const L of liked) {
      const lg = L.game;
      const sharesGenre = lg.genres.some((x) => game.genres.includes(x));
      const a = affinity(L, game, sharesGenre);
      if (game.franchise !== T.STANDALONE && lg.franchise === game.franchise) {
        total += L.weight;
        if (!bestFranchise || a > bestFranchise.affinity) bestFranchise = { ...L, affinity: a };
      }
      const sharedDev = developersOf(lg).find((d) => devs.includes(d) && d !== "Other" && d !== "Unknown");
      if (sharedDev) {
        total += L.weight * DEV_FACTOR;
        if (!bestDeveloper || a > bestDeveloper.affinity) bestDeveloper = { ...L, affinity: a, developer: sharedDev };
      }
      if (sharesGenre) total += L.weight * GENRE_FACTOR;
    }
    return { game, total, bestFranchise, bestDeveloper };
  }

  function reasonFor(pick) {
    const { game, bestFranchise: F, bestDeveloper: D } = pick;
    if (F && D && F.game === D.game) {
      return `More ${game.franchise} from ${D.developer}, like ${F.game.title}, which you rated ${F.rating}/10.`;
    }
    if (F) return `Another ${game.franchise} journey, because you gave ${F.game.title} ${F.rating}/10.`;
    return `From ${D.developer}, the team behind ${D.game.title}, which you rated ${D.rating}/10.`;
  }

  /** Fill up to three picks, keeping any in `keep`. */
  function choose(liked, keep = []) {
    const kept = new Set(keep.map((p) => p.game.id));
    const pool = candidates()
      .filter((g) => !offered.has(g.id) && !kept.has(g.id))
      .map((g) => score(g, liked))
      .filter((p) => p.total > 0 && (p.bestFranchise || p.bestDeveloper));
    const picks = [...keep];
    const franchiseCount = new Map();
    for (const p of keep) {
      if (p.game.franchise !== T.STANDALONE) franchiseCount.set(p.game.franchise, (franchiseCount.get(p.game.franchise) || 0) + 1);
    }
    while (picks.length < PICKS && pool.length) {
      let bestIdx = 0;
      let bestVal = -Infinity;
      pool.forEach((p, i) => {
        const repeats = franchiseCount.get(p.game.franchise) || 0;
        const val = p.total * Math.pow(REPEAT_PENALTY, repeats);
        const better =
          val > bestVal ||
          (val === bestVal && (p.game.year - pool[bestIdx].game.year || p.game.title.localeCompare(pool[bestIdx].game.title)) < 0);
        if (better) { bestVal = val; bestIdx = i; }
      });
      const [pick] = pool.splice(bestIdx, 1);
      picks.push(pick);
      if (pick.game.franchise !== T.STANDALONE) {
        franchiseCount.set(pick.game.franchise, (franchiseCount.get(pick.game.franchise) || 0) + 1);
      }
    }
    return picks;
  }

  function render({ fresh = false } = {}) {
    if (!T.games.length) return;
    const liked = likedGames();
    const rated = T.games.some((g) => T.ratingOf(g.id));

    if (!liked.length) {
      introEl.textContent = rated
        ? `None of your ratings reach ${LIKED_MIN}/10 yet. Rate a favourite ${LIKED_MIN} or higher and the Sage will have something to go on.`
        : `The Sage needs to know your tastes. Finish a game and rate it ${LIKED_MIN}/10 or higher, then return.`;
      listEl.replaceChildren();
      againBtn.hidden = true;
      current = [];
      return;
    }

    // Keep picks that are still unstarted (re-scored, in case ratings changed); replace the rest.
    // "Consult again" replaces all three.
    const keep = fresh ? [] : current.filter((p) => T.statusOf(p.game.id) === "none").map((p) => score(p.game, liked));
    if (fresh || keep.length < PICKS) {
      for (const p of current) offered.add(p.game.id);
      current = choose(liked, keep);
      if (current.length < PICKS && offered.size) {
        offered.clear(); // ran out of new suggestions: start the cycle again
        current = choose(liked, keep);
      }
    } else {
      current = keep;
    }

    const names = liked
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3)
      .map((L) => L.game.title);
    introEl.textContent = `The Sage gazes into the crystal, guided by ${names.join(", ")}${liked.length > 3 ? " and more" : ""}…`;

    listEl.replaceChildren(
      ...current.map((p) => {
        const li = document.createElement("li");
        li.className = "sage-pick";
        const h = document.createElement("h3");
        h.textContent = p.game.title;
        const meta = document.createElement("p");
        meta.className = "sage-meta";
        meta.textContent = [p.game.year, p.game.franchise === T.STANDALONE ? null : p.game.franchise, developersOf(p.game).join(" / ")]
          .filter(Boolean)
          .join(" · ");
        const reason = document.createElement("p");
        reason.className = "sage-reason";
        reason.textContent = reasonFor(p);
        li.append(h, meta, reason);
        return li;
      })
    );
    if (!current.length) {
      introEl.textContent = "The Sage has nothing left to suggest: you've started every related game. Impressive.";
    }
    againBtn.hidden = !current.length;
  }

  againBtn.addEventListener("click", () => render({ fresh: true }));

  const renderIfVisible = () => { if (!panel.hidden) render(); };
  document.addEventListener("tracker:ready", renderIfVisible);
  document.addEventListener("tracker:change", renderIfVisible);
  // Render whenever the Sage panel is shown, by click or keyboard.
  new MutationObserver(renderIfVisible).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
})();
