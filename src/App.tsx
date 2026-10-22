import Download from "./Download";

export default function App() {
  const isDownload = /^\/download\/?$/.test(window.location.pathname);
  if (isDownload) return <Download />;

  return (
    <>
      <header class="site-header">
        <a class="wordmark" href="/" aria-label="prune home">
          <img src="/prunelogo.png" alt="prune" width="40" height="40" style={{ display: "block" }} />
        </a>
        <a class="contact-link" href="mailto:fornelli.dv@gmail.com">
          Any Problems? Contact me at: fornelli.dv@gmail.com
        </a>
      </header>

      <main>
        <section class="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">
            Plan 3 tasks.{" "}
            <br />
            Finish what matters.
          </h1>
          <p class="hero-description">
            Work on one task at a time.
            <br />
            Weekly AI reviews help you cut distractions.
          </p>

          <div class="install-area">
            <a
              class="install-button"
              href="/download"
              aria-describedby="release-note"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.6 7.59 9.14 7.31c1.35.07 2.29.75 3.08.81 1.18-.24 2.31-.94 3.57-.85 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.63 4.09l.01-.01ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25Z" />
              </svg>
              Install for Mac
            </a>
            <p id="release-note" class="release-note">
              Download for macOS.
            </p>
          </div>
        </section>

        <dl class="product-facts" aria-label="Inside prune">
          <div>
            <dt>Daily tasks</dt>
            <dd>3</dd>
          </div>
          <div>
            <dt>Focus timer</dt>
            <dd>1</dd>
          </div>
          <div>
            <dt>Weekly review</dt>
            <dd>AI</dd>
          </div>
        </dl>
      </main>
    </>
  );
}
