// Refresh-safe autosave for the agntdev idea form. Mirrors `rawIdea`
// and `tonPool` to localStorage on every keystroke and restores them
// on mount. Cleared on a successful submit (the user got their
// bot — the draft is no longer needed); preserved on a failed submit
// so a 429/network blip doesn't burn a 2000-character idea.
//
// localStorage may be disabled (private browsing, quota); all
// access goes through safeGet/safeSet/safeRemove which no-op
// silently. The hook is a drop-in for two plain useState calls:
// `const [rawIdea, setRawIdea, tonPool, setTonPool, clearDraft] =
// useIdeaDraft();`

import { useEffect, useState } from "react";

const KEY_IDEA = "agntdev.draft.rawIdea";
const KEY_POOL = "agntdev.draft.tonPool";
const DEFAULT_POOL = "5";

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage may be disabled (private browsing, quota) —
    // the form still works, just without persistence.
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function useIdeaDraft() {
  // Lazy init: read on first render so the initial state is the
  // restored draft, not an empty string followed by a useEffect
  // that flips it.
  const [rawIdea, setRawIdea] = useState(() => safeGet(KEY_IDEA) ?? "");
  const [tonPool, setTonPool] = useState(
    () => safeGet(KEY_POOL) ?? DEFAULT_POOL,
  );

  useEffect(() => {
    safeSet(KEY_IDEA, rawIdea);
  }, [rawIdea]);

  useEffect(() => {
    safeSet(KEY_POOL, tonPool);
  }, [tonPool]);

  function clearDraft() {
    safeRemove(KEY_IDEA);
    safeRemove(KEY_POOL);
  }

  return [rawIdea, setRawIdea, tonPool, setTonPool, clearDraft];
}
