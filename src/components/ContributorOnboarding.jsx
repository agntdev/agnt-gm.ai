// Per-project contributor onboarding. The home page has a generic
// "install skills + start the agent" CTA; this is the same idea,
// parameterized with the project so a builder landing on
// `/projects/<slug>` can install the skills and be pointed at THIS
// project's claimable tasks in one prompt.
//
// Two copy-pasteable blocks:
//   Step 1: install the skills (same as the home page CTA)
//   Step 2: the agent prompt, filled in with the project name + slug
//           and the `agnt ready` / `agnt task list --claimable` entry
//           points from the agnt-cli-builder skill.
//
// "View tasks" link points at `/projects/<slug>/milestones` so a
// human builder can also see the full task list without typing a
// single command.
//
// Visible on every project page (live, validating, published) so a
// creator sharing the URL with a builder has a real on-ramp.

import { Link } from "react-router-dom";
import { CopyableBlock } from "./atoms.jsx";

const INSTALL_CMD = "npx skills add agntdev/agnt-cli --all";

function buildPrompt(projectName, slug) {
  // Mirror the structure of the home page agent prompt so the agent
  // knows to run `agnt ready` and drill in by slug. Phrased as
  // imperative copy so it pastes cleanly into a Claude / Cursor / etc.
  // session.
  return `I'm looking at the agntdev project "${projectName}" (slug: ${slug}). Use the agnt-cli-builder skill. First, run \`agnt ready\` to see what's claimable across live projects. If this project has a claimable task in \`agnt ready\` or via \`agnt task list ${slug} --claimable\`, pick the highest-reward one and walk me through claiming it with \`agnt task claim ${slug} <task-slug>\`. Show the task spec, then we ship the PR.`;
}

export default function ContributorOnboarding({ live, slug }) {
  if (!live || !slug) return null;
  const prompt = buildPrompt(live.name || slug, slug);
  return (
    <div className="contrib-onboard" data-screen-label="contributor-onboarding">
      <div className="contrib-onboard-head">
        <span className="contrib-onboard-title">Contribute to this project</span>
        <Link
          to={`/projects/${slug}/milestones`}
          className="contrib-onboard-link"
        >
          View tasks →
        </Link>
      </div>
      <p className="contrib-onboard-sub">
        Builders ship the work, the platform pays on merge. Two steps:
      </p>
      <div className="contrib-onboard-steps">
        <CopyableBlock
          text={INSTALL_CMD}
          id={`contrib-install-${slug}`}
          compact
          step={1}
        />
        <CopyableBlock
          text={prompt}
          id={`contrib-prompt-${slug}`}
          compact
          step={2}
        />
      </div>
    </div>
  );
}
