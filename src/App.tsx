import { onMount } from "solid-js";
import Download from "./Download";
import { startPlanner } from "./planner/main";
import { rainDiamonds } from "./planner/diamonds";

export default function App() {
  if (/^\/download\/?$/.test(window.location.pathname)) return <Download />;
  let planner!: HTMLDivElement;
  onMount(() => {
    if (import.meta.env.DEV) {
      const url = new URL(window.location.href);
      if (url.searchParams.get("preview") === "diamonds") {
        url.searchParams.delete("preview");
        window.history.replaceState(window.history.state, "", url);
        window.setTimeout(rainDiamonds, 800);
      }
    }
    void startPlanner(planner, planner).catch(() => {
      const message = document.createElement("p");
      message.className = "error";
      message.setAttribute("role", "alert");
      message.textContent = "prune could not start. Reload to try again. Do not clear browser storage if you have unsynced changes.";
      planner.replaceChildren(message);
    });
  });

  return <div id="app" ref={planner} />;
}
