import { API_BASE } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const names = { dan: "Dan", klemen: "Klemen", both: "Dan + Klemen" };
const zone = "America/Los_Angeles";
const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  hour: "numeric",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  weekday: "long",
  month: "short",
  day: "numeric",
});
const shortDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
const parts = Object.fromEntries(
  new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .map((p) => [p.type, p.value]),
);
const today = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
const monday = new Date(today);
monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
let week = new Date(monday),
  selected = null,
  identity = null,
  settings = null;
let providers = { google: false, microsoft: false },
  generation = 0,
  refreshing = false,
  submitting = false;
let token = sessionStorage.getItem("snail-token");
let requestKey = null;
const action = document.createElement("div");
action.className = "notice";
action.setAttribute("role", "status");
action.hidden = true;
$("#booking").before(action);

function message(text, error = false) {
  action.textContent = text;
  action.classList.toggle("error", error);
  action.hidden = false;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api(path, options = {}) {
  if (!API_BASE) throw new Error("The backend address is not configured yet.");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      token = null;
      sessionStorage.removeItem("snail-token");
      identity = null;
      renderIdentity();
    }
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "That request could not be completed. Please try again.",
    );
  }
  return data;
}

const host = () => $("input[name=host]:checked").value;
const duration = () => Number($("input[name=duration]:checked").value);
const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

function renderIdentity() {
  $("#identity").hidden = Boolean(identity);
  $("#signed-in").hidden = !identity;
  $("#email").textContent = identity?.email || "";
  $("#my-bookings").hidden = !identity;
  $("#host-panel").hidden = !identity?.host;
  $("#bookings-title").textContent = identity?.host
    ? "Your office-hours schedule."
    : "Your upcoming conversations.";
  document
    .querySelectorAll("[data-login], [data-connect]")
    .forEach((button) => {
      button.disabled =
        !providers[button.dataset.login || button.dataset.connect];
    });
  renderSelection();
}

function renderSelection() {
  $("#confirmation").hidden = !selected;
  if (!selected) return;
  $("#selection").textContent =
    `${dateFormat.format(new Date(selected.start))} · ${timeFormat.format(new Date(selected.start))}`;
  $("#selection-detail").textContent =
    `${names[host()]} · ${duration()} minutes · Pacific time`;
  $("#book").disabled = !identity || submitting;
  $("#book").textContent = submitting
    ? "Checking & booking…"
    : identity
      ? "Confirm booking ↗"
      : "Sign in to confirm";
}

function renderDays(slots = []) {
  $("#days").replaceChildren();
  for (const offset of [0, 1, 3, 4]) {
    const day = new Date(week);
    day.setUTCDate(day.getUTCDate() + offset);
    const column = element("section", undefined, "day");
    column.setAttribute("aria-label", dateFormat.format(day));
    const heading = element("h3", undefined, "day-heading");
    heading.append(
      element("span", ["Mon", "Tue", "", "Thu", "Fri"][offset]),
      element("strong", String(day.getUTCDate())),
    );
    column.append(heading);
    const items = slots.filter(
      (slot) => dayKey(new Date(slot.start)) === dayKey(day),
    );
    if (!items.length)
      column.append(
        element("p", day < today ? "Past" : "No times", "day-empty"),
      );
    for (const slot of items) {
      const button = element(
        "button",
        timeFormat.format(new Date(slot.start)),
        "time-slot",
      );
      button.type = "button";
      button.disabled = !slot.available || submitting;
      button.setAttribute(
        "aria-pressed",
        String(selected?.start === slot.start),
      );
      button.setAttribute(
        "aria-label",
        `${dateFormat.format(day)}, ${timeFormat.format(new Date(slot.start))} Pacific, ${slot.available ? "available" : "unavailable"}`,
      );
      button.addEventListener("click", () => {
        selected = slot;
        requestKey = crypto.randomUUID();
        $("#days")
          .querySelectorAll("button")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        renderSelection();
      });
      column.append(button);
    }
    $("#days").append(column);
  }
}

async function refreshAvailability() {
  if (submitting) return;
  const ticket = ++generation;
  refreshing = true;
  const end = new Date(week);
  end.setUTCDate(end.getUTCDate() + 4);
  $("#week-label").textContent =
    `${shortDate.format(week)} – ${shortDate.format(end)}`;
  $("#previous").disabled = week <= monday;
  $("#next").disabled = (week - monday) / 86400000 >= 21;
  $("#days").setAttribute("aria-busy", "true");
  try {
    const data = await api(
      `/v1/availability?week=${week.toISOString().slice(0, 10)}&duration=${duration()}&host=${host()}`,
    );
    if (ticket !== generation) return;
    if (
      selected &&
      !data.slots.some((s) => s.start === selected.start && s.available)
    ) {
      selected = null;
      requestKey = null;
      message("Availability changed. Please choose a new time.");
    }
    renderDays(data.slots);
    renderSelection();
    const missing = Object.entries(data.hosts).filter(
      ([, state]) => state !== "ready",
    );
    $("#notice").hidden = missing.length === 0;
    if (missing.length)
      $("#notice").textContent =
        missing
          .map(
            ([h, state]) =>
              `${names[h]}: ${state === "not_connected" ? "calendar setup is not complete" : "calendar temporarily unavailable"}`,
          )
          .join(". ") +
        ". Slots open once the host’s calendars are connected and checked.";
    $("#checked").textContent =
      `Checked ${timeFormat.format(new Date(data.checked_at))} PT`;
  } catch (error) {
    if (ticket !== generation) return;
    selected = null;
    renderSelection();
    renderDays();
    $("#notice").hidden = false;
    $("#notice").textContent =
      "Availability could not be checked. No times are being offered until calendars can be reached.";
    $("#checked").textContent = "Calendar check unavailable";
    message(error.message, true);
  } finally {
    if (ticket === generation) {
      refreshing = false;
      $("#days").setAttribute("aria-busy", "false");
    }
  }
}

async function signIn(provider, connect) {
  try {
    const data = await api("/v1/auth/start", {
      method: "POST",
      body: JSON.stringify({ provider, connect }),
    });
    sessionStorage.setItem("snail-oauth-state", data.state);
    // Only navigate to the expected identity providers, never an arbitrary redirect.
    const target = new URL(data.url);
    if (
      target.protocol !== "https:" ||
      !["accounts.google.com", "login.microsoftonline.com"].includes(
        target.hostname,
      )
    )
      throw new Error("Unexpected sign-in address.");
    location.assign(target.href);
  } catch (error) {
    message(error.message, true);
  }
}

async function loadBookings() {
  if (!identity) return;
  try {
    const bookings = await api("/v1/bookings");
    const list = $("#booking-list");
    list.replaceChildren();
    if (!bookings.length)
      list.append(element("p", "No upcoming bookings yet.", "small-note"));
    for (const booking of bookings) {
      const row = element("article", undefined, "booking-row");
      const info = element("div");
      info.append(
        element(
          "strong",
          `${dateFormat.format(new Date(booking.start))} · ${timeFormat.format(new Date(booking.start))}–${timeFormat.format(new Date(booking.end))} PT`,
        ),
      );
      info.append(
        element(
          "p",
          `${booking.hosts.map((h) => names[h]).join(" + ")}${booking.email ? ` · ${booking.email}` : ""}`,
        ),
      );
      info.append(
        element(
          "p",
          {
            confirmed: "Confirmed · invitation sent",
            pending: "Pending calendar confirmation — not confirmed yet",
            cancelling: "Cancellation pending — calendars are being updated",
          }[booking.status] || booking.status,
          "status",
        ),
      );
      const cancel = element("button", "Cancel booking", "text-button");
      cancel.disabled = booking.status === "cancelling";
      cancel.addEventListener("click", async () => {
        if (!confirm("Cancel this office-hours booking and release the time?"))
          return;
        cancel.disabled = true;
        try {
          const result = await api(`/v1/bookings/${booking.id}`, {
            method: "DELETE",
          });
          message(
            result.status === "cancelled"
              ? "Booking cancelled. The time is available again."
              : "Cancellation is pending. We’ll keep trying to update the calendars; check this page for confirmation.",
          );
          await Promise.all([loadBookings(), refreshAvailability()]);
        } catch (error) {
          message(error.message, true);
          cancel.disabled = false;
        }
      });
      row.append(info, cancel);
      list.append(row);
    }
  } catch (error) {
    message(error.message, true);
  }
}

async function loadCalendars() {
  if (!identity?.host) return;
  const container = $("#calendar-settings");
  try {
    settings = await api("/v1/host/calendars");
    container.replaceChildren();
    if (!settings.connected) {
      container.append(
        element("p", "No calendar is connected yet. Choose a provider above."),
      );
      return;
    }
    container.append(
      element(
        "p",
        `Connected: ${settings.account} · ${settings.provider === "google" ? "Google" : "Outlook"}`,
      ),
    );
    const form = element("form");
    form.append(element("h3", "Calendars that block availability"));
    for (const calendar of settings.calendars) {
      const label = element("label");
      const input = element("input");
      input.type = "checkbox";
      input.name = "calendar";
      input.value = calendar.id;
      input.checked = settings.selected.includes(calendar.id);
      label.append(input, document.createTextNode(` ${calendar.name}`));
      form.append(label);
    }
    const writeLabel = element("label", "Put new bookings on");
    const select = element("select");
    select.name = "write_calendar";
    select.required = true;
    const placeholder = element("option", "Choose a calendar");
    placeholder.value = "";
    select.append(placeholder);
    for (const calendar of settings.calendars.filter((c) => c.writable)) {
      const option = element("option", calendar.name);
      option.value = calendar.id;
      option.selected = calendar.id === settings.write_calendar;
      select.append(option);
    }
    writeLabel.append(select);
    form.append(writeLabel);
    const save = element("button", "Save calendar choices", "button");
    save.type = "submit";
    form.append(save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        const calendars = Array.from(
          form.querySelectorAll("input:checked"),
          (input) => input.value,
        );
        // The destination calendar always blocks availability too.
        if (!calendars.includes(select.value)) calendars.push(select.value);
        await api("/v1/host/calendars", {
          method: "PUT",
          body: JSON.stringify({ calendars, write_calendar: select.value }),
        });
        message(
          "Calendar choices saved. New events on these calendars will block booking times.",
        );
        await Promise.all([loadCalendars(), refreshAvailability()]);
      } catch (error) {
        message(error.message, true);
        save.disabled = false;
      }
    });
    container.append(form);
    const disconnect = element(
      "button",
      "Disconnect this calendar account",
      "text-button",
    );
    disconnect.addEventListener("click", async () => {
      if (
        !confirm(
          "Disconnect your calendar? Your times will no longer be offered. Upcoming bookings must be cancelled first.",
        )
      )
        return;
      try {
        await api("/v1/host/calendars", { method: "DELETE" });
        await Promise.all([loadCalendars(), refreshAvailability()]);
      } catch (error) {
        message(error.message, true);
      }
    });
    container.append(disconnect);
  } catch (error) {
    container.replaceChildren(
      element(
        "p",
        `${error.message} Use the connect button to authorize again.`,
      ),
    );
  }
}

document
  .querySelectorAll("[data-login]")
  .forEach((b) =>
    b.addEventListener("click", () => signIn(b.dataset.login, false)),
  );
document
  .querySelectorAll("[data-connect]")
  .forEach((b) =>
    b.addEventListener("click", () => signIn(b.dataset.connect, true)),
  );
document
  .querySelectorAll("input[name=host], input[name=duration]")
  .forEach((input) =>
    input.addEventListener("change", () => {
      selected = null;
      requestKey = null;
      renderSelection();
      refreshAvailability();
    }),
  );
for (const [id, delta] of [
  ["previous", -7],
  ["next", 7],
])
  $("#" + id).addEventListener("click", () => {
    week.setUTCDate(week.getUTCDate() + delta);
    selected = null;
    requestKey = null;
    renderSelection();
    refreshAvailability();
  });
$("#refresh").addEventListener("click", refreshAvailability);
$("#refresh-bookings").addEventListener("click", loadBookings);
$("#logout").addEventListener("click", async () => {
  try {
    await api("/v1/auth/logout", { method: "POST" });
  } catch (_) {
    /* Always discard this tab's credential. */
  }
  token = null;
  identity = null;
  sessionStorage.removeItem("snail-token");
  $("#booking-list").replaceChildren();
  $("#calendar-settings").replaceChildren();
  renderIdentity();
});
$("#book").addEventListener("click", async () => {
  if (!identity || !selected || submitting) return;
  submitting = true;
  generation++;
  const payload = {
    host: host(),
    duration: duration(),
    start: selected.start,
    request_key: requestKey,
  };
  renderSelection();
  document
    .querySelectorAll("input[name=host], input[name=duration]")
    .forEach((input) => {
      input.disabled = true;
    });
  try {
    const booking = await api("/v1/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    message(
      booking.status === "confirmed"
        ? "You’re booked. Check your email for the calendar invitation."
        : "Your time is reserved, but calendar confirmation is still pending. Check your bookings below; please don’t make a duplicate booking.",
    );
    selected = null;
    requestKey = null;
  } catch (error) {
    message(
      `${error.message} If the request timed out, check your bookings before trying again.`,
      true,
    );
  } finally {
    submitting = false;
    document
      .querySelectorAll("input[name=host], input[name=duration]")
      .forEach((input) => {
        input.disabled = false;
      });
    renderSelection();
    await Promise.all([loadBookings(), refreshAvailability()]);
  }
});

renderDays();
renderIdentity();
try {
  const config = await api("/v1/config");
  providers = config.providers;
  if (token) {
    try {
      identity = await api("/v1/me");
    } catch (error) {
      message(error.message, true);
    }
  }
  renderIdentity();
  if (!Object.values(providers).some(Boolean))
    message(
      "Calendar app registration is in progress. This page is ready to preview, but sign-in and bookings are not open yet.",
    );
  await Promise.all([refreshAvailability(), loadBookings(), loadCalendars()]);
} catch (error) {
  message(error.message, true);
  $("#notice").textContent =
    "Booking is not available until the scheduling service can be reached.";
  $("#days").setAttribute("aria-busy", "false");
}

setInterval(() => {
  if (!document.hidden && !refreshing && !submitting) {
    refreshAvailability();
    loadBookings();
  }
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !refreshing && !submitting) refreshAvailability();
});
