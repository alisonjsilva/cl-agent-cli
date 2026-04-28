# cl-agent landing page

Static landing page for [cl-agent-cli](https://github.com/alisonjsilva/cl-agent-cli),
deployed to GitHub Pages.

## Local preview

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve docs
# or
python3 -m http.server 8080 --directory docs
```

## Stack

- Plain HTML / CSS / ES modules — no build step.
- [Three.js](https://threejs.org) loaded from a CDN via an import map for the
  3D hero animation (glowing wireframe icosahedron, orbiting torus knot,
  drifting particle field, parallax on pointer move).
- Inter + JetBrains Mono via Google Fonts.
- Animated terminal demo in pure JS — no recordings, no images.

## Deployment

Pushed to `main` with changes under `docs/` triggers
`.github/workflows/pages.yml`, which uploads `docs/` as the GitHub Pages
artifact and deploys it.

To enable Pages on the repository (one-time setup):

1. Repository **Settings → Pages**
2. **Source**: *GitHub Actions*

Once enabled, the site is published at
`https://<owner>.github.io/cl-agent-cli/`.
