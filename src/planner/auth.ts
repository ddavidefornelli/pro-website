import { PlanningClient, type AuthStatus } from "./api";
import { element } from "./dom";
import { errorMessage } from "./errors";
import { webConfig } from "./config";
import { acknowledgePrivacy, hasPrivacyAcknowledgement } from "./privacy-state";
import { privacyPolicyButton } from "./privacy";
import { supportFooter } from "./support";

/** Password sign-in with device-local privacy acknowledgement. */
export async function authenticate(root: HTMLElement, client: PlanningClient): Promise<AuthStatus> {
  let acknowledged = false;
  try { acknowledged = hasPrivacyAcknowledgement(localStorage); } catch { /* Show a recoverable storage error on submit. */ }
  let configurationError = "";
  try { webConfig(); } catch (error) { configurationError = errorMessage(error); }
  let initialError = "";
  if (acknowledged && !configurationError) {
    const loading = element("div", undefined, "startup-loading");
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-label", "Loading prune");
    const ring = element("span", undefined, "startup-ring");
    ring.setAttribute("aria-hidden", "true");
    loading.append(ring);
    root.replaceChildren(loading, supportFooter());
    try {
      const status = await client.authStatus();
      if (status.email) { root.replaceChildren(); return status; }
    } catch (error) { initialError = errorMessage(error, "Could not restore your session. Sign in again when you are online. Your pending planner changes remain on this device."); }
  }

  return new Promise((resolve) => {
    const section = element("section", undefined, "auth-panel");
    section.setAttribute("aria-labelledby", "signup-title");
    const eyebrow = element("p", "LESS, BUT BETTER.", "auth-eyebrow");
    const heading = element("h1", "Make room for what matters.");
    heading.id = "signup-title";
    const description = element("p", "Sign in to plan three tasks, focus on one, and finish your day.", "auth-description");
    const form = element("form", undefined, "signup-form");
    const emailLabel = element("label", "Email address");
    const email = element("input");
    email.name = "email";
    email.type = "email";
    email.autocomplete = "email";
    email.inputMode = "email";
    email.autocapitalize = "none";
    email.spellcheck = false;
    email.required = true;
    email.maxLength = 254;
    email.placeholder = "you@example.com";
    emailLabel.append(email);
    const passwordLabel = element("label", "Password");
    const password = element("input");
    password.name = "password";
    password.type = "password";
    password.autocomplete = "current-password";
    password.required = true;
    passwordLabel.append(password);

    const privacy = element("label", undefined, "privacy-acknowledgement");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.name = "privacy";
    checkbox.required = !acknowledged;
    const privacyText = element("span");
    privacyText.append("I have read the ", privacyPolicyButton("Privacy Policy"), ".");
    privacy.append(checkbox, privacyText);
    privacy.hidden = acknowledged;
    const submit = element("button", "Sign in", "auth-submit");
    submit.type = "submit";
    const notice = element("p", "Use your existing account’s email and password. No sign-in emails or codes.", "auth-notice");
    notice.setAttribute("role", "status");
    const alert = element("p", configurationError || initialError, "error");
    alert.setAttribute("role", "alert");
    if (configurationError) submit.disabled = true;

    let busy = false;
    function setBusy(value: boolean): void {
      busy = value;
      form.setAttribute("aria-busy", String(value));
      submit.disabled = value || !!configurationError;
      email.disabled = value;
      password.disabled = value;
      checkbox.disabled = value;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || configurationError || !form.reportValidity()) return;
      setBusy(true);
      alert.textContent = "";
      try {
        if (!acknowledged) {
          try { acknowledgePrivacy(localStorage); }
          catch { throw new Error("Could not save your privacy acknowledgement. Allow browser storage and try again. No sign-in request was sent."); }
          acknowledged = true;
          privacy.hidden = true;
          checkbox.required = false;
        }
        const account = await client.signIn(email.value.trim(), password.value);
        if (!account.email) throw new Error("Sign-in did not return an account. Please try again.");
        password.value = "";
        root.replaceChildren();
        resolve(account);
      } catch (error) { alert.textContent = errorMessage(error); }
      finally { setBusy(false); }
    });
    form.append(emailLabel, passwordLabel, privacy, submit);
    section.append(eyebrow, heading, description, form, notice, alert,
      element("p", "Your planner syncs with the Mac app. Optional AI reviews stay off until you enable them.", "auth-footnote"));
    root.replaceChildren(section, supportFooter());
  });
}
