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

Checks the page in Chromium and WebKit, including full-viewport layouts in portrait and landscape, no scrolling, and the Mac installer download.

## Mac download

The **Install for Mac** link in `src/App.tsx` downloads `/prune.dmg`. The installer is stored in `public/prune.dmg` and included in `dist/` during builds. Replace that file to publish a new installer.
