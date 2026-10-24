import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { integrity, securityHeaders } from "./security-policy.ts";

/** Package immutable bytes + their headers together via Vercel Build Output API. */
export function buildVercel(source = "dist", destination = ".vercel/output"): void {
  const headers = JSON.parse(readFileSync(resolve(source, "security-headers.json"), "utf8"));
  const html = readFileSync(resolve(source, "index.html"), "utf8");
  const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
  if (!scriptTags.length) throw new Error("Refusing to package a build without entry scripts.");
  const verifyAsset = (tag: string, attribute: "src" | "href"): string => {
    const path = new RegExp(`\\b${attribute}="(/assets/[A-Za-z0-9_.-]+)"`).exec(tag)?.[1];
    const hash = /\bintegrity="(sha384-[A-Za-z0-9+/]{64})"/.exec(tag)?.[1];
    if (!path || !hash || integrity(readFileSync(resolve(source, path.slice(1)))) !== hash) {
      throw new Error("Refusing to package an asset with missing or mismatched integrity.");
    }
    return hash;
  };
  const scriptHashes = scriptTags.map((tag) => verifyAsset(tag, "src"));
  for (const tag of html.match(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi) ?? []) verifyAsset(tag, "href");
  const backend = /(?:^|; )connect-src (https:\/\/[^/\s;]+)\//.exec(headers["Content-Security-Policy"] ?? "")?.[1];
  const expected = backend && securityHeaders(backend, scriptHashes);
  if (!expected || Object.keys(headers).length !== Object.keys(expected).length
    || Object.entries(expected).some(([name, value]) => headers[name] !== value)) {
    throw new Error("Refusing to package a missing, weakened or mismatched HTTP security policy.");
  }
  const metaPolicy = expected["Content-Security-Policy"]!
    .replace("; frame-ancestors 'none'", "").replace("; upgrade-insecure-requests", "");
  if (!html.includes(`<meta http-equiv="Content-Security-Policy" content="${metaPolicy}"`)) {
    throw new Error("Refusing to package HTML whose meta policy does not match its headers.");
  }
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, resolve(destination, "static"), { recursive: true });
  // Security metadata belongs to the deployment, not the public document tree.
  rmSync(resolve(destination, "static/security-headers.json"));
  const config = {
    version: 3,
    routes: [
      { src: "/(.*)", headers, continue: true },
      // Never cache HTML independently from the deployment's hash policy.
      { src: "^/(?:index\\.html|download/?)?$", headers: { "Cache-Control": "no-store" }, continue: true },
      { src: "^/download/?$", dest: "/index.html" },
      { handle: "filesystem" },
    ],
  };
  writeFileSync(resolve(destination, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildVercel();
