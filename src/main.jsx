import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import {
  init as initSDK,
  isTMA,
  backButton,
  themeParams,
  viewport,
  miniApp,
  retrieveLaunchParams,
} from "@tma.js/sdk-react";

import "./styles.css";
import App from "./App.jsx";
import { installTelegramDevMock } from "./lib/telegramDev.js";

// Dev-only: inject a minimal window.Telegram mock so Chrome can
// exercise the bot-creation flow without a real Telegram context.
// See src/lib/telegramDev.js for the contract. Skipped when
// import.meta.env.DEV is false (i.e. the production build) or when
// window.Telegram is already defined (i.e. we're inside real
// Telegram).
installTelegramDevMock();

const TONCONNECT_MANIFEST = "https://agnt-gm.ams3.digitaloceanspaces.com/tonconnect-manifest.json";

// ── Init Telegram Mini App SDK ──
try {
  // retrieveLaunchParams() throws outside Telegram, so its call lives
  // inside the try — we don't need the return value, just the side
  // effect of validating the launch context.
  retrieveLaunchParams();

  // Init the core SDK (must be called once before any components).
  initSDK();

  // Mount components + bind CSS vars when inside Telegram.
  // Outside Telegram (browser dev), this gracefully no-ops.
  if (isTMA()) {
    backButton.mount.ifAvailable();
    themeParams.mount.ifAvailable();
    miniApp.mount.ifAvailable();

    if (themeParams.bindCssVars.isAvailable()) {
      themeParams.bindCssVars();
    }
    if (miniApp.bindCssVars.isAvailable()) {
      miniApp.bindCssVars();
    }

    if (viewport.mount.isAvailable()) {
      viewport.mount().then(() => {
        if (viewport.bindCssVars.isAvailable()) {
          viewport.bindCssVars();
        }
        viewport.expand.ifAvailable();
      });
    }
  }
} catch {
  // Not in Telegram — just render normally.
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={TONCONNECT_MANIFEST}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TonConnectUIProvider>
  </StrictMode>,
);
