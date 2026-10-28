import type { Dashboard } from "./types";

export const onboardingKey = (accountKey: string) =>
  `prune:onboarding:v1:${accountKey}`;

/** Remembered per account/device, not a new server-side account preference. */
export function shouldOfferOnboarding(
  data: Dashboard,
  accountKey: string,
  storage: Pick<Storage, "getItem">,
): boolean {
  try {
    if (storage.getItem(onboardingKey(accountKey))) return false;
  } catch {
    /* The flow remains usable without persistence. */
  }
  return (
    !data.activeTask &&
    data.todayTasks.length === 0 &&
    data.tomorrowTasks.length === 0 &&
    !data.completions.some((day) => day.count > 0)
  );
}
