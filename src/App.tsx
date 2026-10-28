import {
  createSignal,
  ErrorBoundary,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { SignIn } from "./auth/SignIn";
import { LoadingIndicator } from "./components/LoadingIndicator";
import PixelBackground from "./components/PixelBackground";
import { MAC_DOWNLOAD } from "./shared/site";
import { PlanningClient } from "./planner/api";
import { webConfig } from "./planner/config";
import { errorMessage } from "./planner/errors";
import { Planner } from "./planner/Planner";
import { hasPrivacyAcknowledgement } from "./planner/privacy-state";
import { isAccount, type Account } from "./planner/types";

function DownloadPage() {
  let download!: HTMLAnchorElement;
  onMount(() => download.click());
  return (
    <main class="download-page">
      <h1>THANK YOU FOR INSTALLING</h1>
      <p>Your Mac download should start automatically.</p>
      <a
        ref={(element) => {
          download = element;
        }}
        href={MAC_DOWNLOAD.href}
        download={MAC_DOWNLOAD.filename}
      >
        Download again
      </a>
    </main>
  );
}

function Session() {
  const client = new PlanningClient();
  const [account, setAccount] = createSignal<Account>();
  const [loading, setLoading] = createSignal(true);
  const [initialError, setInitialError] = createSignal("");
  let configurationError = "";
  let disposed = false;
  try {
    webConfig();
  } catch (cause) {
    configurationError = errorMessage(cause);
  }

  onCleanup(() => {
    disposed = true;
    void client.dispose();
  });
  onMount(() => {
    async function restore(): Promise<void> {
      try {
        // Constructing the SDK may refresh a session; gate even that access.
        if (!configurationError && hasPrivacyAcknowledgement(localStorage)) {
          const status = await client.authStatus();
          if (!disposed && isAccount(status)) setAccount(status);
        }
      } catch (cause) {
        if (!disposed)
          setInitialError(
            errorMessage(
              cause,
              "Could not restore your session. Sign in again when you are online. Your pending planner changes remain on this device.",
            ),
          );
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void restore();
  });

  return (
    <Show
      when={account()}
      fallback={
        <>
          <PixelBackground completionLevel={0} />
          <div id="app">
            <Show when={!loading()} fallback={<LoadingIndicator />}>
              <SignIn
                client={client}
                initialError={initialError()}
                configurationError={configurationError}
                onAuthenticated={(status) => {
                  if (!disposed) setAccount(status);
                }}
              />
            </Show>
          </div>
        </>
      }
    >
      {(current) => <Planner client={client} account={current()} />}
    </Show>
  );
}

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
