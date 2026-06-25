// telegram.ts — thin wrapper over the Telegram WebApp bridge.
// The app renders its own header/MainButton (per the design), so this only
// handles lifecycle, theme and viewport.

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  openLink?(url: string): void;
  openTelegramLink?(url: string): void;
  openInvoice?(url: string, callback?: (status: InvoiceStatus) => void): void;
  initData?: string;
  platform?: string;
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string; photo_url?: string } };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
}

// Telegram.WebApp.openInvoice callback statuses.
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const webApp: TelegramWebApp | undefined = window.Telegram?.WebApp;

// telegram-web-app.js defines WebApp even in a plain browser; only trust it
// when we're actually running inside a Telegram container.
export const insideTelegram: boolean =
  !!webApp && (webApp.platform ?? 'unknown') !== 'unknown' && !!webApp.initData;

export function initTelegram(): void {
  if (!insideTelegram || !webApp) return;
  webApp.ready();
  webApp.expand();
}

export function telegramColorScheme(): 'light' | 'dark' | null {
  return insideTelegram ? webApp?.colorScheme ?? null : null;
}

export function onThemeChanged(cb: () => void): () => void {
  if (!insideTelegram || !webApp) return () => {};
  webApp.onEvent('themeChanged', cb);
  return () => webApp.offEvent('themeChanged', cb);
}

export function syncChrome(headerColor: string, bgColor: string): void {
  if (!insideTelegram) return;
  webApp?.setHeaderColor?.(headerColor);
  webApp?.setBackgroundColor?.(bgColor);
}

// ── native BackButton (replaces the mocked in-app header inside Telegram) ──
export function backButtonOnClick(cb: () => void): () => void {
  const bb = insideTelegram ? webApp?.BackButton : undefined;
  if (!bb) return () => {};
  bb.onClick(cb);
  return () => bb.offClick(cb);
}

export function backButtonVisible(visible: boolean): void {
  const bb = insideTelegram ? webApp?.BackButton : undefined;
  if (!bb) return;
  if (visible) bb.show(); else bb.hide();
}

export function telegramInitData(): string | null {
  return insideTelegram ? webApp?.initData || null : null;
}

export function telegramUserName(): string | null {
  return insideTelegram ? webApp?.initDataUnsafe?.user?.first_name || null : null;
}

export interface TgUser { initials: string; photoUrl: string | null }

export function telegramUser(): TgUser | null {
  if (!insideTelegram) return null;
  const u = webApp?.initDataUnsafe?.user;
  if (!u) return null;
  const initials = `${(u.first_name || '')[0] || ''}${(u.last_name || '')[0] || ''}`.toUpperCase() || '?';
  return { initials, photoUrl: u.photo_url || null };
}

export function openExternal(url: string): void {
  if (webApp?.openLink) webApp.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

// Open a Telegram Stars invoice (from createInvoiceLink on the backend) and
// resolve with the payment outcome. Rejects when not running inside Telegram or
// the client is too old to support openInvoice — callers should surface that as
// "open in Telegram to pay".
export function openInvoice(invoiceLink: string): Promise<InvoiceStatus> {
  return new Promise((resolve, reject) => {
    if (!insideTelegram || !webApp?.openInvoice) {
      reject(new Error('openInvoice unavailable — open this bot inside Telegram to pay'));
      return;
    }
    webApp.openInvoice(invoiceLink, (status) => resolve(status));
  });
}

// t.me links stay inside Telegram (bot chats, the manager-bot deep link,
// share sheets). openTelegramLink is the mini-app API for this; openLink is
// the in-app fallback for older clients; window.open only outside Telegram.
export function openTgLink(url: string): void {
  if (insideTelegram && webApp?.openTelegramLink) { webApp.openTelegramLink(url); return; }
  if (insideTelegram && webApp?.openLink) { webApp.openLink(url); return; }
  window.open(url, '_blank', 'noopener');
}
