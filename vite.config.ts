import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import { publicConfig } from "./src/planner/config.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_SUPABASE_");
  // Allow an unconfigured checkout to show its setup message, but fail a build
  // with partial/privileged configuration before a secret can be bundled.
  if (env.VITE_SUPABASE_URL || env.VITE_SUPABASE_ANON_KEY) {
    publicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  }
  return { plugins: [solid()] };
});
