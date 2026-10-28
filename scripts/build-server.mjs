import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Bundle server code separately. No server environment values enter static assets. */
export async function buildServer(destination = '.vercel/output') {
  const output = resolve(destination, 'functions/api/planner.func');
  mkdirSync(output, { recursive: true });
  await build({
    entryPoints: ['api/planner.ts'], outfile: resolve(output, 'index.mjs'),
    bundle: true, platform: 'node', target: 'node22', format: 'esm',
    // Some dependencies contain optional CommonJS branches referencing builtins.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    sourcemap: false, minify: true,
  });
  writeFileSync(resolve(output, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration: 120,
  }, null, 2) + '\n');
}
