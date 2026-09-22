import { API_BASE } from "./config.js";

const query = new URLSearchParams(location.search);
// Remove codes immediately, before making any requests or loading other pages.
history.replaceState(null, "", location.pathname);
const expected = sessionStorage.getItem("snail-oauth-state");
sessionStorage.removeItem("snail-oauth-state");
try {
  if (query.has("error"))
    throw new Error(
      "Sign-in was not completed. You can try again from office hours.",
    );
  if (!expected || expected !== query.get("state") || !query.get("code")) {
    throw new Error(
      "This sign-in did not start in this tab or has expired. Please start again.",
    );
  }
  const response = await fetch(`${API_BASE}/v1/auth/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: expected, code: query.get("code") }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Sign-in failed. Please try again.",
    );
  sessionStorage.setItem("snail-token", data.token);
  location.replace(data.calendar_connected ? "./#host-panel" : "./");
} catch (error) {
  document.querySelector("#status").textContent = error.message;
}
