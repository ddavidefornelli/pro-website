import { onMount } from "solid-js";
import { startPlanner } from "./planner/main";
import { celebrateWithCrown } from "./planner/crown";

export default function App() {
  let planner!: HTMLDivElement;
  onMount(() => {
    if (import.meta.env.DEV) {
      const url = new URL(window.location.href);
      if (["crown", "diamonds"].includes(url.searchParams.get("preview") ?? "")) {
        url.searchParams.delete("preview");
        window.history.replaceState(window.history.state, "", url);
        window.setTimeout(celebrateWithCrown, 800);
      }
    }

    void startPlanner(planner, planner).catch(() => {
      const message = document.createElement("p");
      message.className = "error";
      message.setAttribute("role", "alert");
      message.textContent =
        "prune could not start. Reload to try again. Do not clear browser storage if you have unsynced changes.";
      planner.replaceChildren(message);
    });
  });

  return <div id="app" ref={planner} />;
}
