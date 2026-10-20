# prune

A minimal, single-screen landing page for the prune desktop app, built with Vite, SolidJS, and TypeScript. The centered layout stays vertical and fits the dynamic viewport without scrolling, including in landscape.

The hierarchy takes its cue from acq.com: a direct headline, one prominent install button, and a compact feature summary. Colors and native system typography follow `../pro`. No external fonts or UI libraries. Traffic insights use Vercel Web Analytics.

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

Deploy the generated `dist/` directory to any static host. The analytics setup below assumes deployment on Vercel.

## Web Analytics

Vercel Web Analytics is initialized once in `src/index.tsx` using `@vercel/analytics`. Production builds track page views; the development server uses debug mode and does not send analytics events.

To activate analytics for the deployed website:

1. Open the website's project in the Vercel dashboard.
2. Select **Analytics** and click **Enable** (if it is not already enabled).
3. Deploy these changes. For a Vite project, use `npm run build` as the build command and `dist` as the output directory.
4. Visit the deployed website, then check the project's **Analytics** tab. Data may take a few minutes to appear; ad blockers can prevent collection.

No API keys or environment variables are needed for this Vercel-hosted setup. The SDK loads the production script from `/_vercel/insights/script.js`, which Vercel serves after Web Analytics is enabled. Other static hosts need a separate self-hosted analytics configuration.

## Tests

```sh
npx playwright install chromium webkit
npm test
```

Checks the page in Chromium and WebKit, including full-viewport layouts in portrait and landscape, no scrolling, and the Mac installer download.

## Mac download

The **Install for Mac** link in `src/App.tsx` opens `/download`. That page displays a centered thank-you message and automatically downloads `/prune.dmg`. `vercel.json` rewrites direct visits to `/download` to the app entry point. The installer is stored in `public/prune.dmg` and included in `dist/` during builds. Replace that file to publish a new installer.
