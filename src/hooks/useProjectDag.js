// AGNTDEV task DAG fetcher. Polls `GET /builder/projects/:id/dag`
// every 30s. Returns the full task graph (foundation / feature /
// integration / doc / fix tasks with their `claimable` verdicts and
// `depends_on` lists) so the TMA task browser can render a real
// list. Reuses the same endpoint as the DagSummary panel on the
// project page — the difference is just that this hook keeps the
// raw tasks around, not the count summary.
//
// `null` while the first fetch is in flight. Empty array means
// either the LLM planner hasn't materialized tasks yet (404) or
// the project isn't in a phase that has a DAG.

import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const POLL_INTERVAL_MS = 30000;

export function useProjectDag(slug) {
  const [dag, setDag] = useState(null);
  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      const res = await api.getProjectDag(slug);
      if (cancelled) return;
      // 404s and shape mismatches are expected pre-Design — keep state
      // as empty array so the UI can render its "no tasks yet" state.
      if (res && Array.isArray(res.tasks)) {
        setDag(res);
      } else {
        setDag({ tasks: [], current_phase: null, phase_status: null });
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug]);
  return dag;
}
