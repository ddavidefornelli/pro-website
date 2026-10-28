import { render } from "solid-js/web";
import { inject } from "@vercel/analytics";
import App from "./App";
import { PRODUCTION_ORIGINS } from "./shared/site";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("The app root is missing.");

render(() => <App />, root);

// Track production page views only, never auth query strings/fragments or task data.
if (import.meta.env.PROD && PRODUCTION_ORIGINS.includes(location.origin)) {
  inject({
    mode: "production",
    beforeSend: (event) => {
      const url = new URL(event.url);
      url.search = "";
      url.hash = "";
      return { ...event, url: url.toString() };
    },
  });
}
