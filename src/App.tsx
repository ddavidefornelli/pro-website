import { onMount } from "solid-js";
import Download from "./Download";
import { startPlanner } from "./planner/main";

export default function App() {
  if (/^\/download\/?$/.test(window.location.pathname)) return <Download />;
  let planner!: HTMLDivElement;
  let accountActions!: HTMLDivElement;
  onMount(() => {
    void startPlanner(planner, accountActions).catch(() => {
      const message = document.createElement("p");
      message.className = "error";
      message.setAttribute("role", "alert");
      message.textContent = "prune could not start. Reload to try again. Do not clear browser storage if you have unsynced changes. If this continues, contact fornelli.dv@gmail.com.";
      planner.replaceChildren(message);
    });
  });

  return (
    <>
      <header class="site-header">
        <a class="wordmark" href="/" aria-label="prune home">
          <img src="/prune-logo.png" alt="prune" width="120" height="48" />
        </a>
        <div class="site-actions">
          <div ref={accountActions} />
          <a class="install-button" href="/prune.dmg" download="prune.dmg" aria-label="Install for Mac">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.6 7.59 9.14 7.31c1.35.07 2.29.75 3.08.81 1.18-.24 2.31-.94 3.57-.85 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.63 4.09l.01-.01ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25Z" />
            </svg>
            Install for Mac
          </a>
        </div>
      </header>
      <div id="app" ref={planner} />
    </>
  );
}
