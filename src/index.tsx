import { inject } from "@vercel/analytics";
import { render } from "solid-js/web";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("The app root is missing.");

render(() => <App />, root);

inject({ mode: import.meta.env.PROD ? "production" : "development" });
