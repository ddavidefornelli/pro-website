import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// Match executable integrations/endpoints, not explanatory privacy-policy text.
const integrations = [
  /(?:https?:)?\/\/(?:[\w-]+\.)*(?:googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|goatcounter\.com|gc\.zgo\.at|connect\.facebook\.net|static\.hotjar\.com|clarity\.ms)(?:[/:"'`\s]|$)/i,
  /\b(?:gtag|fbq)\s*\(/,
  /\b(?:window|globalThis)\.(?:dataLayer|goatcounter)\b/,
  /\/_vercel\/(?:insights|speed-insights)(?:\/|["'`?\s]|$)/,
  /["']@vercel\/(?:analytics|speed-insights)(?:\/[^"']*)?["']/,
];
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, directory));
    return /\.(?:html|[cm]?js|tsx?|css|json)$/i.test(entry.name) ? [path] : [];
  });
}

test("web source and public text assets contain no marketing tracking integrations", () => {
  const files = [new URL("../index.html", import.meta.url), ...sourceFiles(new URL("../src/", import.meta.url)), ...sourceFiles(new URL("../public/", import.meta.url))];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const integration of integrations) {
      assert.ok(!integration.test(content), `Tracking integration found in ${file.pathname}`);
    }
  }
});

test("package dependencies do not install advertising or behavioural analytics SDKs", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(dependencies)) {
    assert.ok(!/^(?:@vercel\/(?:analytics|speed-insights)|@google-analytics\/|@segment\/|@hotjar\/|@microsoft\/clarity|posthog-js$|mixpanel-browser$|react-ga(?:4)?$|react-gtm-module$)/.test(name), `Tracking SDK found: ${name}`);
  }
});
