import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
// @ton/core (used inside OwnerPaymentScreen to build the TEP-74 text
// comment BoC payload) depends on Node's Buffer global. Browsers don't
// ship one — without this polyfill the whole bundle white-screens the
// moment `import('@ton/core')` runs at module-eval time. Install once,
// at the entry, before any module that might import @ton/core executes.
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;

import "./styles.css";
import App from "./App.jsx";

const TONCONNECT_MANIFEST = "https://agnt-gm.ams3.digitaloceanspaces.com/tonconnect-manifest.json";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={TONCONNECT_MANIFEST}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TonConnectUIProvider>
  </StrictMode>
);
