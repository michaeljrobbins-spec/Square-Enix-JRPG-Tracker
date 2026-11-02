# The Lifestream

The Lifestream is a tracker for Square, Enix and Square Enix RPGs, hosted on GitHub Pages.

An exercise for ENG6806, where I take the Claude Artifact I created last week and update it to a GitHub hosted site.

## The site

`index.html` is a static page (plain HTML, CSS and JavaScript, no build step) that reads `catalog.json` and lets you:

- browse and search the catalog, filtering by franchise, platform, decade and status
- mark each game Not started, In progress or Finished, and rate finished games 1–10
- see a timeline of releases by year, and per-franchise completion records
- ask the Sage for three games you haven't started, picked from the franchises and developers of games you rated 7/10 or higher

Statuses and ratings are saved in your browser's `localStorage`; use **Status → Export save** to back them up.

### Publishing on GitHub Pages

Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`.

### Running locally

The page fetches `catalog.json`, so serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server
```

Then open http://localhost:8000.
