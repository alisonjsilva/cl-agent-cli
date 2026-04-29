# cl-agent landing page

Static landing page for [cl-agent-cli](https://github.com/alisonjsilva/cl-agent-cli),
deployed to GitHub Pages.

## Local preview

Open `index.html` directly for a quick check, or serve the folder to match the
GitHub Pages environment and enable browser features like clipboard writes:

```bash
npx serve docs
# or
python3 -m http.server 8080 --directory docs
```

## Stack

- Plain HTML / CSS / ES modules.
- `docs/release-meta.js` is generated from `package.json` by `scripts/generate-release-meta.mjs`.
- Lightweight 2D canvas hero animation with a pulsing dot-grid and pointer-reactive glow.
- Inter + JetBrains Mono via Google Fonts.
- Animated terminal demo in pure JS — no recordings, no images.

## Deployment

Pushed to `main` with changes under `docs/` triggers
`.github/workflows/pages.yml`, which uploads `docs/` as the GitHub Pages
artifact and deploys it. The workflow regenerates `docs/release-meta.js`
from `package.json` before upload so the published release badge stays in sync.

To enable Pages on the repository (one-time setup):

1. Repository **Settings → Pages**
2. **Source**: *GitHub Actions*

Once enabled, the site is published at
`https://<owner>.github.io/cl-agent-cli/`.
