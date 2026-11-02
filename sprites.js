(() => {
  "use strict";

  /*
   * Original 16-bit-style pixel art, drawn in code.
   *
   * Each sprite is a grid of characters; every character is one pixel and
   * maps to a colour in the palette ("." is transparent). Sprites are
   * rendered as inline SVG with crisp edges, one <rect> per horizontal run
   * of same-coloured pixels.
   *
   * Use in HTML:  <span class="sprite" data-sprite="crystal" data-scale="4"></span>
   */

  const PALETTE = {
    k: "#0a0f3a", // outline
    w: "#ffffff",
    // crystal / ice
    c: "#a8f4ff",
    b: "#3cc8ff",
    d: "#1f6fd6",
    n: "#123a8c",
    // steel
    s: "#d4dae8",
    g: "#7a84a0",
    // gold
    y: "#ffd84a",
    o: "#b07a10",
    // fire
    R: "#8a1a00",
    r: "#e8461e",
    f: "#ff9a1e",
    // misc
    h: "#6b3a1a", // leather / wood
    H: "#4a2408",
    e: "#e03a3a", // ruby
    p: "#3fe07a", // potion green
    P: "#1c9e4f",
    v: "#9fb4ff", // glass tint
  };

  const SPRITES = {
    crystal: [
      ".....k.....",
      "....kwk....",
      "...kwcbk...",
      "...kwcbk...",
      "..kwccbdk..",
      "..kwcbbdk..",
      ".kwccbbddk.",
      ".kwcbbbddk.",
      "kwccbbbdddk",
      "kccbbbbdddk",
      "kcbbbbddddk",
      ".kcbbbdddk.",
      ".kcbbbddnk.",
      "..kbbddnk..",
      "..kbbdnnk..",
      "...kbdnk...",
      "...kbdnk...",
      "....kdk....",
      ".....k.....",
    ],
    sword: [
      "....k....",
      "...kwk...",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      "..kwsgk..",
      ".kkkkkkk.",
      "kyyyeyyyk",
      "koooooook",
      ".kkkhkkk.",
      "...khk...",
      "...kHk...",
      "..kyyyk..",
      "...kkk...",
    ],
    flame: [
      "....R....",
      "...RrR...",
      "...RrfR..",
      "..RrffR..",
      "..RrfyfR.",
      ".RrffyfR.",
      ".RrfyyfrR",
      "RrfywyfrR",
      "RrfywwyfR",
      "RrffyyfrR",
      ".RrrffrR.",
      "..RRRRR..",
    ],
    frost: [
      "....w....",
      "....c....",
      ".w..c..w.",
      "..c.c.c..",
      "...cwc...",
      "wccwwwccw",
      "...cwc...",
      "..c.c.c..",
      ".w..c..w.",
      "....c....",
      "....w....",
    ],
    sparkle: [
      "..w..",
      "..w..",
      "wwyww",
      "..w..",
      "..w..",
    ],
    potion: [
      "...kkk...",
      "...khk...",
      "...kvk...",
      "..kkvkk..",
      ".kwppppk.",
      "kwppppppk",
      "kpwppppPk",
      "kppppppPk",
      "kpppppPPk",
      ".kpPPPPk.",
      "..kkkkk..",
    ],
    hourglass: [
      "khhhhhhhk",
      ".kvyyyyk.",
      ".kvyyyyk.",
      "..kvyyk..",
      "...kyk...",
      "...kyk...",
      "..kvvyk..",
      ".kvvvyvk.",
      ".kvyyyyk.",
      "khhhhhhhk",
    ],
    shield: [
      "kkkkkkkkk",
      "kwdddddnk",
      "kwddyddnk",
      "kwdyyydnk",
      "kwddyddnk",
      "kwddyddnk",
      ".kwdddnk.",
      ".kwdddnk.",
      "..kwdnk..",
      "...knk...",
      "....k....",
    ],
    orb: [
      "..kkkkk..",
      ".kwwccbk.",
      "kwcccccbk",
      "kcccccbbk",
      "kccccbbbk",
      ".kcbbbbk.",
      "..kkkkk..",
      ".koyyyok.",
      "koooooook",
      ".kkkkkkk.",
    ],
    chest: [
      ".kkkkkkkkkk.",
      "khhhhhhhhhhk",
      "kHhhhhhhhhHk",
      "kyyyyyyyyyyk",
      "kHhhhoohhhHk",
      "kkkkkyykkkkk",
      "khhhhoohhhhk",
      "kHhhhhhhhhHk",
      "kyyyyyyyyyyk",
      "kkkkkkkkkkkk",
    ],
  };

  /** A sparse field of sparkles and single stars, used as a tiled background. */
  function starfield(size, stars, dots) {
    const grid = Array.from({ length: size }, () => Array(size).fill("."));
    for (const [x, y] of stars) {
      SPRITES.sparkle.forEach((row, dy) => [...row].forEach((ch, dx) => {
        if (ch !== ".") grid[(y + dy) % size][(x + dx) % size] = ch;
      }));
    }
    for (const [x, y, ch] of dots) grid[y][x] = ch;
    return grid.map((r) => r.join(""));
  }
  /** Scatter sparkles and dots with a fixed seed, so the field looks random but is the same every visit. */
  function scatter(size, sparkles, dots, seed) {
    let t = seed;
    const rnd = () => ((t = (t * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (n) => Array.from({ length: n }, () => [Math.floor(rnd() * size), Math.floor(rnd() * size)]);
    return starfield(size, pick(sparkles), pick(dots).map(([x, y]) => [x, y, "wwcy"[Math.floor(rnd() * 4)]]));
  }
  // Large tiles of different sizes, so repeats are hard to spot and the two layers rarely line up.
  SPRITES["starfield-a"] = scatter(173, 3, 14, 7);
  SPRITES["starfield-b"] = scatter(131, 2, 10, 42);

  // Palette swaps: same drawing, different colours.
  const VARIANTS = {
    "crystal-green": { base: "crystal", swap: { c: "#c4ffd4", b: "#3fe07a", d: "#1c9e4f", n: "#0d5a2c" } },
    "crystal-red": { base: "crystal", swap: { c: "#ffc4c4", b: "#ff5a5a", d: "#c42a2a", n: "#6a0f0f" } },
    "orb-violet": { base: "orb", swap: { c: "#e6c4ff", b: "#9a5ae0" } },
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  function resolve(name) {
    if (SPRITES[name]) return { rows: SPRITES[name], colors: PALETTE };
    const v = VARIANTS[name];
    if (v) return { rows: SPRITES[v.base], colors: { ...PALETTE, ...v.swap } };
    return null;
  }

  /** Build an inline SVG for a sprite. `scale` is the size of one pixel in CSS px. */
  function render(name, scale = 2) {
    const sprite = resolve(name);
    if (!sprite) {
      console.warn(`Unknown sprite "${name}"`);
      return document.createElementNS(SVG_NS, "svg");
    }
    const { rows, colors } = sprite;
    const w = Math.max(...rows.map((r) => r.length));
    const h = rows.length;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", w * scale);
    svg.setAttribute("height", h * scale);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let run = 1;
        while (row[x + run] === ch) run++;
        if (ch !== "." && ch !== " " && colors[ch]) {
          const rect = document.createElementNS(SVG_NS, "rect");
          rect.setAttribute("x", x);
          rect.setAttribute("y", y);
          rect.setAttribute("width", run);
          rect.setAttribute("height", 1);
          rect.setAttribute("fill", colors[ch]);
          svg.appendChild(rect);
        }
        x += run;
      }
    });
    return svg;
  }

  /** Same sprite as a CSS url() value, for backgrounds. */
  function dataUri(name, scale = 1) {
    const svg = render(name, scale);
    svg.setAttribute("xmlns", SVG_NS);
    return `url("data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}")`;
  }

  function hydrate(root = document) {
    for (const el of root.querySelectorAll("[data-sprite]:not([data-drawn])")) {
      el.appendChild(render(el.dataset.sprite, Number(el.dataset.scale) || 2));
      el.setAttribute("aria-hidden", "true");
      el.dataset.drawn = "";
    }
  }

  hydrate();
  // Two faint fields of sparkles behind everything, twinkling out of step.
  document.documentElement.style.setProperty("--starfield-a", dataUri("starfield-a", 2));
  document.documentElement.style.setProperty("--starfield-b", dataUri("starfield-b", 2));
  // Empty-state art should only appear once the catalog has loaded.
  document.addEventListener("tracker:ready", () => document.body.classList.add("ready"));

  window.Sprites = { render, dataUri, hydrate, names: [...Object.keys(SPRITES), ...Object.keys(VARIANTS)] };
})();
