import { PlanningClient, type AuthStatus } from "./api";
import { element } from "./dom";
import { errorMessage } from "./errors";
import { webConfig } from "./config";
import { acknowledgePrivacy, hasPrivacyAcknowledgement } from "./privacy-state";
import { privacyPolicyButton } from "./privacy";

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
    root.replaceChildren(loading);
    try {
      const status = await client.authStatus();
      if (status.email) { root.replaceChildren(); return status; }
    } catch (error) { initialError = errorMessage(error, "Could not restore your session. Sign in again when you are online. Your pending planner changes remain on this device."); }
  }

  return new Promise((resolve) => {
    const section = element("section", undefined, "auth-panel");
    section.setAttribute("aria-labelledby", "signup-title");
    const heading = element("h1", "Just Fucking Win.");
    heading.id = "signup-title";
    const description = element("p", "Plan three tasks, execute and win today.", "auth-description");
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
    code.setAttribute("aria-label", "Email code");
    code.type = "text";
    code.autocomplete = "one-time-code";
    code.inputMode = "numeric";
    code.pattern = "[0-9]{8}";
    code.minLength = 8;
    code.maxLength = 8;
    const codeBoxes = element("div", undefined, "email-code-boxes");
    const digits = Array.from({ length: 8 }, () => {
      const digit = element("span", undefined, "email-code-digit");
      digit.setAttribute("aria-hidden", "true");
      return digit;
    });
    function updateCodeBoxes(): void {
      const active = Math.min(code.selectionStart ?? code.value.length, 7);
      digits.forEach((digit, index) => {
        digit.textContent = code.value[index] ?? "";
        digit.classList.toggle("is-active", index === active);
      });
    }
    code.addEventListener("input", () => {
      const sanitized = code.value.replace(/\D/g, "").slice(0, 8);
      if (code.value !== sanitized) code.value = sanitized;
      updateCodeBoxes();
    });
    for (const event of ["focus", "click", "keyup", "select"]) code.addEventListener(event, updateCodeBoxes);
    codeBoxes.append(code, ...digits);
    codeLabel.append(codeBoxes);
    codeLabel.hidden = true;
    let sentTo = "";
    const changeEmail = element("button", "Use a different email");
    changeEmail.type = "button";
    changeEmail.hidden = true;
    changeEmail.addEventListener("click", () => {
      sentTo = "";
      email.readOnly = false;
      code.value = "";
      updateCodeBoxes();
      code.required = false;
      codeLabel.hidden = true;
      heading.hidden = false;
      description.hidden = false;
      changeEmail.hidden = true;
      submit.textContent = "Send code";
      alert.textContent = "";
      email.focus();
    });

    const privacy = element("label", undefined, "privacy-acknowledgement");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.name = "privacy";
    checkbox.required = !acknowledged;
    const privacyText = element("span");
    privacyText.append("I accept the ", privacyPolicyButton("Terms & Privacy"), ".");
    privacy.append(checkbox, privacyText);
    privacy.hidden = acknowledged;
    const submit = element("button", "Send code", "auth-submit");
    submit.type = "submit";
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
          catch { throw new Error("Could not save your terms acceptance. Allow browser storage and try again. No sign-in request was sent."); }
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
          heading.hidden = true;
          description.hidden = true;
          code.required = true;
          changeEmail.hidden = false;
          submit.textContent = "Verify code";
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
    section.append(heading, description, form, alert);
    root.replaceChildren(section);
  });
}
