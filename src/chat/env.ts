// The env stage — pure helpers, no React, so they can be reasoned about (and
// checked) on their own.
//
// Some bots need a setting only their owner can give them: an API key, the
// admin chat to notify. The assistant asks for those one at a time, and while
// a question is open the owner's next message IS the value — the server stores
// it encrypted and keeps only a mask in the thread. See `env_request` in the
// chat API.
import { ChatMessage } from '../api/client';

export interface EnvAsk {
  // msgId of the question — so the thread can mark the OPEN ask and leave
  // already-answered ones alone.
  msgId: number;
  key: string;
  // secret: the value must never be shown back (an API key). False only for
  // values that are safe to echo — a channel @name, a currency code.
  secret: boolean;
}

// The open env question, if the chat is waiting on one. Same "last assistant
// turn with no owner reply after it" rule the quick replies use.
export function pendingEnvAsk(messages: ChatMessage[]): EnvAsk | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'owner') return null;
    if (m.role === 'assistant') {
      const d = m.data as { kind?: string; env_key?: string; env_secret?: boolean } | undefined;
      if (d?.kind !== 'env_request') return null;
      // Absent env_secret means secret — the fail-safe direction, since showing
      // a value that should have been hidden can't be taken back.
      return { msgId: m.id, key: d.env_key || '', secret: d.env_secret !== false };
    }
  }
  return null;
}

// maskSecret mirrors the server's MaskEnvValue: enough to recognise a paste-o,
// never enough to use. Counts CHARACTERS rather than UTF-16 units, so an emoji
// or a non-Latin value is never sliced through the middle.
export function maskSecret(value: string): string {
  const chars = [...value.trim()];
  return chars.length <= 8 ? '••••' : '••••' + chars.slice(-4).join('');
}
