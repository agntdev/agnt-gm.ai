// TMA dev simulator: inject a minimal window.Telegram mock so the
// dev experience (in Chrome, no Telegram context) matches what
// real Telegram users see. Loaded only in dev (import.meta.env.DEV)
// or when a URL param opts in, so production TMAs inside real
// Telegram are never affected.
//
// What the mock provides (the only surfaces the TMA actually uses):
//
//   window.Telegram.WebApp.openLink(url)
//     — real Telegram opens an external link via the native UI
//       (bottom sheet with confirmation). In Chrome we just fall
//       through to window.open, which is what the BotInitiationBanner
//       already does. The mock is here for FUTURE TMA code that
//       switches from window.open to Telegram.WebApp.openLink, and
//       for symmetry with the real SDK shape.
//
//   window.Telegram.WebApp.ready()
//   window.Telegram.WebApp.expand()
//   window.Telegram.WebApp.close()
//     — no-ops. The real Telegram SDK fires these to signal the
//       mini app is ready / wants fullscreen / wants to close.
//       None of these matter in the mock — the TMA just calls them
//       and moves on.
//
//   window.Telegram.WebApp.initDataUnsafe.user
//     — mock user object. Real Telegram populates this with the
//       signed user data; the TMA doesn't read it directly today,
//       but if it does, the mock prevents a TypeError.
//
//   window.Telegram.WebApp.themeParams
//     — mock color tokens. The TMA's CSS uses design tokens
//       (--bg, --fg, --accent, etc.) rather than Telegram's
//       themeParams, so the mock is empty. Override here if a
//       future feature needs the Telegram palette.
//
// Where it loads:
//   - In dev: automatically, because main.jsx imports it
//     unconditionally. Build-time guard: import.meta.env.DEV.
//   - In production TMA inside real Telegram: skipped (real
//     window.Telegram is already there, and import.meta.env.DEV
//     is false in the prod build).
//   - In production TMA inside Chrome (rare, but happens during
//     testing): no mock injected. The TMA degrades gracefully —
//     BotInitiationBanner uses window.open which works in plain
//     Chrome. This is intentional: we don't want to silently
//     impersonate Telegram in production.

const TELEGRAM_DEV_FLAG = "agntDevTelegram";

export function installTelegramDevMock() {
  if (typeof window === "undefined") return;
  if (window.Telegram) return; // Real Telegram present; don't override.
  if (!import.meta.env.DEV) return; // Prod build: no mock.

  window.Telegram = {
    WebApp: {
      initData: "",
      initDataUnsafe: {
        user: {
          id: 0,
          first_name: "Dev",
          last_name: "",
          username: "dev",
          language_code: "en",
          is_premium: false,
        },
        chat_instance: "",
        chat_type: "private",
        auth_date: Math.floor(Date.now() / 1000),
        hash: "dev-mock",
        start_param: "",
      },
      version: "9.6",
      platform: "web",
      colorScheme: "light",
      themeParams: {
        bg_color: "#ffffff",
        text_color: "#000000",
        hint_color: "#999999",
        link_color: "#2481cc",
        button_color: "#2481cc",
        button_text_color: "#ffffff",
        secondary_bg_color: "#f4f4f5",
        header_bg_color: "#ffffff",
        accent_text_color: "#2481cc",
        section_bg_color: "#ffffff",
        section_header_text_color: "#6d6d71",
        subtitle_text_color: "#999999",
        destructive_text_color: "#d33939",
      },
      isExpanded: true,
      viewportHeight: window.innerHeight,
      viewportStableHeight: window.innerHeight,
      ready: () => {},
      expand: () => {},
      close: () => {},
      openLink: (url) => {
        if (typeof url !== "string" || !url) return false;
        window.open(url, "_blank", "noopener,noreferrer");
        return true;
      },
      openTelegramLink: (url) => {
        if (typeof url !== "string" || !url) return false;
        window.open(url, "_blank", "noopener,noreferrer");
        return true;
      },
      showAlert: (msg) => {
        // eslint-disable-next-line no-alert
        window.alert(typeof msg === "string" ? msg : String(msg));
      },
      showConfirm: (msg) => {
        // eslint-disable-next-line no-alert
        return window.confirm(typeof msg === "string" ? msg : String(msg));
      },
    },
  };

  // Mark on window so other dev tools / debug UIs can tell.
  window.__agntDevTelegramInstalled = true;
  if (typeof console !== "undefined" && import.meta.env.DEV) {
    console.info(
      "[agnt-tma] window.Telegram mock installed (dev only). " +
        "Disable by clearing this in DevTools: " +
        "delete window.Telegram; delete window.__agntDevTelegramInstalled;",
    );
  }
  // Also export a global flag for tests / debug.
  void TELEGRAM_DEV_FLAG;
}
