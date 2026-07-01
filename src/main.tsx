import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTelegram } from './telegram';
import { LangProvider } from './i18n';

initTelegram();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
);
