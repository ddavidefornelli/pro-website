import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runProductionChecks } from "./check-production.mjs";
import { hasMarketingTracker } from "./tracking-policy.ts";

const site = "https://deployment.invalid";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function inspectPublicFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Public deployment files must not be symbolic links.");
    if (entry.isDirectory()) inspectPublicFiles(path);
    else if (/\.(?:html|[cm]?js|css|json|svg)$/i.test(entry.name) && hasMarketingTracker(readFileSync(path, "utf8"))) {
      throw new Error(`Marketing tracker integration in public deployment file: ${entry.name}`);
    }
  }
}

/**
 * Exercise the packaged headers, rewrites and bytes with the same assertions as
 * the live checker. This interprets ONLY our small Build Output route vocabulary,
 * not all of Vercel. Unknown routing fails closed. It is an artifact check, never
 * proof of dashboard settings, CDN behavior or a successful hosted deployment.
 */
export async function checkDeployment(output = ".vercel/output", onResult = () => {}) {
  const config = JSON.parse(readFileSync(resolve(output, "config.json"), "utf8"));
  const root = resolve(output, "static");
  if (config.version !== 3 || !Array.isArray(config.routes) || Object.keys(config).some((key) => !["version", "routes"].includes(key))) {
    throw new Error("Expected the generated Vercel Build Output v3 route configuration.");
  }
  const routes = config.routes.map((route) => {
    if (route.handle === "filesystem" && Object.keys(route).length === 1) return route;
    if (typeof route.src !== "string" || Object.keys(route).some((key) => !["src", "headers", "continue", "dest"].includes(key))
      || (route.continue !== undefined && route.continue !== true)
      || (route.dest !== undefined && route.dest !== "/index.html")
      || (route.headers !== undefined && (!route.headers || typeof route.headers !== "object" || Array.isArray(route.headers) || Object.values(route.headers).some((value) => typeof value !== "string")))) {
      throw new Error("Unsupported deployment route; review its security semantics before publishing.");
    }
    return { ...route, pattern: new RegExp(`^(?:${route.src})$`) };
  });
  if (routes.at(-1)?.handle !== "filesystem") throw new Error("Deployment must end with the static filesystem handler.");
  if (existsSync(resolve(root, "security-headers.json"))) throw new Error("Security deployment metadata must not be published as a static file.");
  inspectPublicFiles(root);

  const fetcher = async (input, init) => {
    const url = new URL(input);
    if (url.origin !== site || !["GET", "HEAD"].includes(init.method ?? "GET")) {
      throw new Error("Artifact checks must never contact an external service or send mutations.");
    }
    const headers = new Headers();
    let target = url.pathname;
    for (const route of routes) {
      if (route.handle === "filesystem") break;
      if (!route.pattern.test(target)) continue;
      for (const [name, value] of Object.entries(route.headers ?? {})) headers.set(name, value);
      if (route.dest) target = route.dest;
      if (!route.continue) break;
    }
    if (target === "/") target = "/index.html";
    const file = resolve(root, `.${target}`);
    const local = relative(root, file);
    if (local.startsWith(`..${sep}`) || local === ".." || !existsSync(file)) return new Response(null, { status: 404, headers });
    headers.set("Content-Type", mime[extname(file)] ?? "application/octet-stream");
    return new Response(init.method === "HEAD" ? null : readFileSync(file), { headers });
  };
  return runProductionChecks({ site, websiteOnly: true, fetcher }, onResult);
}

export function printDeploymentResult(item) {
  if (item.status !== "SKIP") console.log(`[${item.status}] ${item.label}${item.detail ? ` — ${item.detail}` : ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("Checking local Vercel output (not the live website):\n");
  try {
    const report = await checkDeployment(undefined, printDeploymentResult);
    console.log(`\nArtifact checks: ${report.counts.PASS} passed, ${report.counts.FAIL} failed, ${report.counts.ERROR} errors. Hosted verification is still required.`);
    process.exitCode = report.exitCode;
  } catch (error) {
    console.error(`Deployment verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
