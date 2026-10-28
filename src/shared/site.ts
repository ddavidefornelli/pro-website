/** Shared with deployment policy generation to keep the production allowlist exact. */
export const PRODUCTION_ORIGINS: readonly string[] = [
  "https://www.prune.win",
  "https://prune.win",
];

export const MAC_DOWNLOAD = {
  href: "/prune.dmg",
  filename: "prune.dmg",
} as const;
