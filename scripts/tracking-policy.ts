// Detect executable integrations/endpoints, not tracker names in privacy prose.
// Keep build-time, source and hosted checks on the same denylist. This is a
// regression guard, not an exhaustive network audit or a substitute for CSP.
const integrations = [
  /(?:https?:)?\/\/(?:[\w-]+\.)*(?:googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|goatcounter\.com|gc\.zgo\.at|connect\.facebook\.net|static\.hotjar\.com|clarity\.ms)(?:[/:"'`\s]|$)/i,
  /\b(?:gtag|fbq)\s*\(/,
  /\b(?:window|globalThis)\.(?:dataLayer|goatcounter)\b/,
  // Vercel Web Analytics is explicitly enabled; Speed Insights remains disabled.
  /\/_vercel\/speed-insights(?:\/|["'`?\s]|$)/,
  /["']@vercel\/speed-insights(?:\/[^"']*)?["']/,
];

export function hasMarketingTracker(content: string): boolean {
  return integrations.some((integration) => integration.test(content));
}
