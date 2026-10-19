# prune

A minimal, single-screen landing page for the prune desktop app, built with Vite, SolidJS, and TypeScript. The centered layout stays vertical and fits the dynamic viewport without scrolling, including in landscape.

The hierarchy takes its cue from acq.com: a direct headline, one prominent install button, and a compact feature summary. Colors and native system typography follow `../pro`. No external fonts, analytics, or UI libraries.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

## Production

```sh
npm run build
npm run preview
```

Deploy the generated `dist/` directory to any static host.

## Tests

```sh
npx playwright install chromium webkit
npm test
```

Checks the page in Chromium and WebKit, including full-viewport layouts in portrait and landscape, no scrolling, and the inactive install button.

## Mac download

The **Install for Mac** button in `src/App.tsx` is intentionally disabled, with no URL or click handler. When the DMG is ready, replace it with a download link to the real package and update the availability note and test.
