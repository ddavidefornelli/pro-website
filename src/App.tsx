import { ErrorBoundary, Show } from "solid-js";
import { Session } from "./auth/Session";
import { DownloadPage } from "./components/DownloadPage";

export default function App() {
  return (
    <ErrorBoundary
      fallback={
        <p class="error" role="alert">
          prune could not start. Reload to try again. Do not clear browser
          storage if you have unsynced changes.
        </p>
      }
    >
      <Show
        when={/^\/download\/?$/.test(location.pathname)}
        fallback={<Session />}
      >
        <DownloadPage />
      </Show>
    </ErrorBoundary>
  );
}
