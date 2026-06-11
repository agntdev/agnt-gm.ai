// Telegram Mini App native integrations that aren't wrapped by
// @tma.js/sdk-react. Centralized here so call sites don't need
// to know which Telegram SDK functions exist or how to no-op
// outside TMA.
//
// Every function is a no-op when not running inside Telegram,
// so the call sites can be wired unconditionally.

import {
  hapticFeedback,
  isTMA as sdkIsTMA,
  openLink,
  popup,
} from "@tma.js/sdk-react";

// ── Haptics ────────────────────────────────────────────────

/**
 * Trigger a haptic tap. Pass a style for the kind of interaction
 * (light = button press, medium = tab change, heavy = destructive
 * action) or a notification type (success / error / warning) for
 * the outcome of an action. No-op outside Telegram.
 *
 * We don't pre-check sdkIsTMA() because the SDK already does
 * that internally — every method is wrapped in WithChecks which
 * returns an Either<Error, void> instead of throwing. The check
 * chain inside the SDK is: in TMA? → SDK init'd? → version
 * supports this method? → component mounted (or no mount
 * required)? Each failure returns a clean Either, never throws.
 * So a try/catch here would be a no-op.
 */
function haptic(kind, payload) {
  if (kind === "impact") {
    hapticFeedback.impactOccurred.ifAvailable(payload || "light");
  } else if (kind === "notification") {
    hapticFeedback.notificationOccurred.ifAvailable(payload || "success");
  } else if (kind === "selection") {
    hapticFeedback.selectionChanged.ifAvailable();
  }
}

export const hapticClick = () => haptic("impact", "light");
export const hapticMedium = () => haptic("impact", "medium");
export const hapticSuccess = () => haptic("notification", "success");
export const hapticError = () => haptic("notification", "error");
export const hapticWarning = () => haptic("notification", "warning");
export const hapticSelect = () => haptic("selection");

// ── Open links ─────────────────────────────────────────────

/**
 * Open a URL in Telegram's preferred target (in-app browser, or
 * external if the user prefers). Falls back to window.open on web
 * so the call site doesn't need to know.
 */
export function openExternal(url, options) {
  if (sdkIsTMA()) {
    try {
      openLink.ifAvailable(url, options);
      return;
    } catch {
      // Fall through to window.open.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// ── Native dialogs ─────────────────────────────────────────

/**
 * Replace window.alert with Telegram's themed dialog. No-op to
 * window.alert on web.
 */
export function tmaAlert(message) {
  if (sdkIsTMA()) {
    try {
      // Telegram's popup API doesn't have a 1-arg alert shortcut;
      // we build a single-OK dialog. The .ifAvailable() guard
      // returns undefined on web and old clients — we fall
      // through to window.alert.
      popup.show
        .ifAvailable({
          title: "Notice",
          message: String(message),
          buttons: [{ id: "ok", type: "default", text: "OK" }],
        })
        .catch(() => {});
      return;
    } catch {
      // Fall through.
    }
  }
  window.alert(message);
}

/**
 * Replace window.confirm with Telegram's themed dialog. Returns
 * a Promise<boolean> that resolves true on OK, false on Cancel.
 * On web falls back to window.confirm.
 */
export async function tmaConfirm(message) {
  if (sdkIsTMA()) {
    try {
      const id = await popup.show.ifAvailable({
        title: "Confirm",
        message: String(message),
        buttons: [
          { id: "ok", type: "default", text: "OK" },
          { id: "cancel", type: "cancel", text: "Cancel" },
        ],
      });
      return id === "ok";
    } catch {
      // Fall through.
    }
  }
  return window.confirm(message);
}
