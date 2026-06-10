// AGNTDEV phase fetcher. Polls `GET /builder/projects/:id/phase`
// every 5s while non-terminal (general/design/details/dev/tests)
// and every 30s once the project is `published` or `failed`.
// Returns `null` while the first fetch is in flight.
//
// Shared by the project page (PhasePipeline) and the task browser
// page (Milestones) — both surfaces need the same polling cadence
// so the phase chip and the task list stay in lockstep.

import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export function useProjectPhase(slug) {
  const [phase, setPhase] = useState(null);
  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      const res = await api.getProjectPhase(slug);
      if (cancelled || !res) return;
      setPhase(res);
      const terminal =
        res.current_phase === "published" || res.current_phase === "failed";
      timer = setTimeout(tick, terminal ? 30000 : 5000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug]);
  return phase;
}
