import { PlanningClient, type AuthStatus } from "./api";
import { element } from "./dom";
import { errorMessage } from "./errors";
import { webConfig } from "./config";
import { acknowledgePrivacy, hasPrivacyAcknowledgement } from "./privacy-state";
import { privacyPolicyButton } from "./privacy";
import { supportFooter } from "./support";

/** Email-code sign-in with device-local privacy acknowledgement. */
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
    const codeLabel = element("label", "Email code");
    const code = element("input", undefined, "otp-input");
    code.name = "code";
    code.type = "text";
    code.autocomplete = "one-time-code";
    code.inputMode = "numeric";
    code.pattern = "[0-9]+";
    code.maxLength = 10;
    codeLabel.append(code);
    codeLabel.hidden = true;
    let sentTo = "";
    const changeEmail = element("button", "Use a different email");
    changeEmail.type = "button";
    changeEmail.hidden = true;
    changeEmail.addEventListener("click", () => {
      sentTo = "";
      email.readOnly = false;
      code.value = "";
      code.required = false;
      codeLabel.hidden = true;
      changeEmail.hidden = true;
      submit.textContent = "Send code";
      notice.textContent = "";
      alert.textContent = "";
      email.focus();
    });

    const privacy = element("label", undefined, "privacy-acknowledgement");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.name = "privacy";
    checkbox.required = !acknowledged;
    const privacyText = element("span");
    privacyText.append("I have read the ", privacyPolicyButton("Privacy Policy"), ".");
    privacy.append(checkbox, privacyText);
    privacy.hidden = acknowledged;
    const submit = element("button", "Send code", "auth-submit");
    submit.type = "submit";
    const notice = element("p", undefined, "auth-notice");
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
      code.disabled = value;
      changeEmail.disabled = value;
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
        if (!sentTo) {
          const address = email.value.trim();
          await client.sendCode(address);
          sentTo = address;
          email.readOnly = true;
          codeLabel.hidden = false;
          code.required = true;
          changeEmail.hidden = false;
          submit.textContent = "Verify code";
          notice.textContent = `Enter the code sent to ${sentTo}. Check your spam folder too. To request another code, choose “Use a different email” and submit again.`;
          return;
        }
        const account = await client.verifyCode(sentTo, code.value.trim());
        if (!account.email) throw new Error("Sign-in did not return an account. Please try again.");
        code.value = "";
        root.replaceChildren();
        resolve(account);
      } catch (error) { alert.textContent = errorMessage(error); }
      finally {
        setBusy(false);
        if (sentTo && code.isConnected) code.focus();
      }
    });
    form.append(emailLabel, codeLabel, privacy, submit, changeEmail);
    section.append(heading, description, form, notice, alert);
    root.replaceChildren(section, supportFooter());
  });
}
