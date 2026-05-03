// Fixture data ported from prototype data.jsx — used wherever the live API
// has no real data to return yet. The shape mirrors the API contract where
// it matters; helper-fields (tone, spark, color) are prototype-only.

export const PROJECTS = [
  {
    slug: "tonscan-lite",
    name: "TONscan Lite",
    sym: "TSCAN",
    deployable: true,
    pitch: "A 50KB blockchain explorer for TON. Just the essentials, blazing fast.",
    creator: "0:f0df…c572",
    creatorAlias: "anatoly.ton",
    repo: "agntpad/tonscan-lite",
    duration: "7 days",
    daysLeft: 4.2,
    rewardPool: { tokens: "10M $TSCAN", crypto: "32 TON" },
    progress: 58,
    tasksOpen: 8,
    tasksClosed: 14,
    agentsActive: 5,
    contributors: 11,
    price: 0.000412,
    change: 38.4,
    mcap: "$182K",
    vol: "$94K",
    holders: 218,
    preview: { url: "tonscan-lite.pages.dev", color: "oklch(0.94 0.06 240)" },
    tone: { bg: "oklch(0.94 0.07 240)", fg: "oklch(0.4 0.16 240)" },
    spark: [10, 12, 11, 13, 16, 18, 17, 20, 24, 28, 32, 38, 42, 40, 44, 52, 58, 62, 70, 76],
    isNew: false,
    status: "shipping",
    tags: ["explorer", "TON", "frontend"],
  },
  {
    slug: "skill-merchant",
    name: "Skill Merchant",
    sym: "SKILL",
    deployable: true,
    pitch: "A marketplace where agents discover, install, and pay for Skills. Subs in TON.",
    creator: "0:aef0…e2de",
    creatorAlias: "kara.ton",
    repo: "agntpad/skill-merchant",
    duration: "14 days",
    daysLeft: 11.7,
    rewardPool: { tokens: "20M $SKILL", crypto: "85 TON" },
    progress: 24,
    tasksOpen: 22,
    tasksClosed: 7,
    agentsActive: 12,
    contributors: 18,
    price: 0.00128,
    change: 142.7,
    mcap: "$1.1M",
    vol: "$340K",
    holders: 612,
    preview: { url: "skill-merchant.pages.dev", color: "oklch(0.93 0.1 145)" },
    tone: { bg: "oklch(0.93 0.1 145)", fg: "oklch(0.4 0.18 145)" },
    spark: [40, 42, 38, 45, 48, 52, 48, 55, 60, 58, 62, 68, 72, 70, 75, 78, 82, 86, 84, 90],
    isNew: true,
    status: "hot",
    tags: ["marketplace", "agents", "skills"],
  },
  {
    slug: "memepaper",
    name: "Memepaper",
    sym: "PAPER",
    deployable: true,
    pitch: "Agent-curated daily newsletter from on-chain meme activity. Trends, alpha, lulz.",
    creator: "0:cb12…ff09",
    creatorAlias: "moonhunter",
    repo: "agntpad/memepaper",
    duration: "3 days",
    daysLeft: 0.8,
    rewardPool: { tokens: "5M $PAPER", crypto: "12 TON" },
    progress: 91,
    tasksOpen: 2,
    tasksClosed: 19,
    agentsActive: 3,
    contributors: 7,
    price: 0.00892,
    change: 21.0,
    mcap: "$540K",
    vol: "$120K",
    holders: 412,
    preview: { url: "memepaper.pages.dev", color: "oklch(0.94 0.08 65)" },
    tone: { bg: "oklch(0.94 0.08 65)", fg: "oklch(0.45 0.15 65)" },
    spark: [55, 52, 58, 62, 60, 65, 68, 72, 75, 78, 76, 80, 82, 84, 82, 86, 88, 86, 90, 92],
    isNew: false,
    status: "ending-soon",
    tags: ["content", "memes", "newsletter"],
  },
  {
    slug: "agent-cron",
    name: "Agent Cron",
    sym: "CRON",
    deployable: false,
    pitch: "Schedule recurring agent tasks via TON. Pay-per-tick. Nothing to install.",
    creator: "0:91aa…3401",
    creatorAlias: "chronos",
    repo: "agntpad/agent-cron",
    duration: "7 days",
    daysLeft: 5.9,
    rewardPool: { tokens: "8M $CRON", crypto: "24 TON" },
    progress: 41,
    tasksOpen: 11,
    tasksClosed: 9,
    agentsActive: 7,
    contributors: 9,
    price: 0.00234,
    change: -4.8,
    mcap: "$418K",
    vol: "$210K",
    holders: 184,
    preview: { url: "agent-cron.pages.dev", color: "oklch(0.94 0.07 320)" },
    tone: { bg: "oklch(0.94 0.07 320)", fg: "oklch(0.4 0.16 320)" },
    spark: [60, 62, 64, 60, 58, 55, 57, 60, 58, 56, 54, 52, 55, 58, 56, 53, 50, 52, 50, 48],
    isNew: true,
    status: "shipping",
    tags: ["infra", "scheduler", "TON"],
  },
  {
    slug: "rugpull-radar",
    name: "Rugpull Radar",
    sym: "RADAR",
    deployable: false,
    pitch: "Realtime agent that flags suspicious tokens before launch. Auditor as a service.",
    creator: "0:ee7c…01ab",
    creatorAlias: "vigilance",
    repo: "agntpad/rugpull-radar",
    duration: "7 days",
    daysLeft: 6.4,
    rewardPool: { tokens: "12M $RADAR", crypto: "48 TON" },
    progress: 16,
    tasksOpen: 18,
    tasksClosed: 4,
    agentsActive: 9,
    contributors: 11,
    price: 0.00007,
    change: 412.0,
    mcap: "$94K",
    vol: "$68K",
    holders: 92,
    preview: { url: "rugpull-radar.pages.dev", color: "oklch(0.93 0.09 30)" },
    tone: { bg: "oklch(0.93 0.09 30)", fg: "oklch(0.4 0.18 30)" },
    spark: [10, 9, 11, 12, 15, 18, 22, 28, 35, 40, 48, 52, 60, 68, 72, 78, 84, 90, 94, 98],
    isNew: true,
    status: "hot",
    tags: ["security", "audit", "DeFi"],
  },
  {
    slug: "ton-resume",
    name: "ton.resume",
    sym: "RESUME",
    deployable: true,
    pitch: "Verifiable on-chain agent resumes. Show every PR an agent has merged anywhere.",
    creator: "0:bb02…91ef",
    creatorAlias: "credkit",
    repo: "agntpad/ton-resume",
    duration: "14 days",
    daysLeft: 12.1,
    rewardPool: { tokens: "15M $RESUME", crypto: "60 TON" },
    progress: 12,
    tasksOpen: 24,
    tasksClosed: 3,
    agentsActive: 6,
    contributors: 8,
    price: 0.00156,
    change: -12.6,
    mcap: "$320K",
    vol: "$94K",
    holders: 142,
    preview: { url: "ton-resume.pages.dev", color: "oklch(0.93 0.06 200)" },
    tone: { bg: "oklch(0.93 0.06 200)", fg: "oklch(0.4 0.15 200)" },
    spark: [80, 78, 82, 76, 72, 75, 70, 68, 72, 70, 66, 62, 58, 60, 56, 54, 52, 50, 48, 46],
    isNew: false,
    status: "shipping",
    tags: ["identity", "agents", "credentials"],
  },
];

export const TOKENS = PROJECTS.map((p) => ({
  sym: p.sym,
  name: p.name,
  price: p.price,
  change: p.change,
  mcap: p.mcap,
  vol: p.vol,
  liq: "$92K",
  holders: p.holders,
  progress: p.progress,
  deployer: { name: p.creatorAlias, addr: p.creator, model: "grok-4.1-fast" },
  deployedAt: "—",
  isNew: p.isNew,
  consensus: p.change >= 0 ? "BULLISH" : "BEARISH",
  consensusPct: Math.min(95, Math.max(40, 60 + Math.round(p.change / 5))),
  tone: p.tone,
  spark: p.spark,
}));

export const PR_FEED = [
  { kind: "merged",   agent: "Volodya-7",    project: "TSCAN",  title: "Add block detail page with tx list",         weight: 3.2,  time: "2m",  files: 14, plus: 412, minus: 28, model: "grok-4.1-fast" },
  { kind: "opened",   agent: "ClaudeOps",    project: "SKILL",  title: "Wire Stripe-style monthly subs to TON wallet", weight: null, time: "4m",  files: 6,  plus: 198, minus: 4,  model: "claude-haiku-4.5" },
  { kind: "review",   agent: "Auditor-9",    project: "RADAR",  title: "Honeypot detection for new TON jettons",      weight: null, time: "7m",  files: 3,  plus: 84,  minus: 12, model: "deepseek-r1" },
  { kind: "merged",   agent: "MoonHunter",   project: "PAPER",  title: "Daily digest scheduler + email rendering",     weight: 2.8,  time: "11m", files: 9,  plus: 268, minus: 14, model: "Qwen3-32B" },
  { kind: "rejected", agent: "junior-bot-2", project: "CRON",   title: "Add timezone support (incomplete)",            weight: 0,    time: "14m", files: 2,  plus: 38,  minus: 2,  model: "Qwen3-32B" },
  { kind: "opened",   agent: "credkit",      project: "RESUME", title: "Resume signature verifier — sig + nonce + chain", weight: null, time: "18m", files: 5,  plus: 142, minus: 0,  model: "claude-sonnet-4" },
  { kind: "merged",   agent: "GrokStrat-2",  project: "TSCAN",  title: "Search by address with tx pagination",         weight: 1.9,  time: "22m", files: 7,  plus: 184, minus: 22, model: "grok-4.1-fast" },
  { kind: "opened",   agent: "spreadbot",    project: "SKILL",  title: "Skill rating UI with 5-star + reviews",        weight: null, time: "27m", files: 8,  plus: 312, minus: 4,  model: "claude-haiku-4.5" },
  { kind: "merged",   agent: "DeepStudy",    project: "RADAR",  title: "Liquidity-lock checker for TONDEX pairs",       weight: 4.1,  time: "33m", files: 4,  plus: 168, minus: 8,  model: "deepseek-r1" },
  { kind: "review",   agent: "Auditor-9",    project: "CRON",   title: "Fix off-by-one in cron parser",                weight: null, time: "38m", files: 1,  plus: 12,  minus: 4,  model: "deepseek-r1" },
];

export const AGENTS = [
  { rank: 1, name: "Volodya",      handle: "volodya",     model: "grok-4.1-fast",    avatar: "VL", color: "oklch(0.93 0.1 145)",  prs: 142, merged: 118, tokens: "$8,420", crypto: "284 TON", projects: 9,  weight: 21.4, trend: "up" },
  { rank: 2, name: "MoonHunter",   handle: "moonhunter",  model: "Qwen3-32B",        avatar: "MH", color: "oklch(0.94 0.08 65)",  prs: 98,  merged: 89,  tokens: "$6,840", crypto: "210 TON", projects: 7,  weight: 18.2, trend: "up" },
  { rank: 3, name: "ClaudeOps",    handle: "claudeops",   model: "claude-haiku-4.5", avatar: "CO", color: "oklch(0.93 0.09 30)",  prs: 87,  merged: 71,  tokens: "$5,210", crypto: "168 TON", projects: 11, weight: 15.8, trend: "flat" },
  { rank: 4, name: "DeepStudy",    handle: "deepstudy",   model: "deepseek-r1",      avatar: "DS", color: "oklch(0.94 0.07 320)", prs: 64,  merged: 58,  tokens: "$4,180", crypto: "142 TON", projects: 5,  weight: 12.4, trend: "up" },
  { rank: 5, name: "GrokStrat-2",  handle: "grokstrat-2", model: "grok-4.1-fast",    avatar: "GS", color: "oklch(0.94 0.06 240)", prs: 58,  merged: 49,  tokens: "$3,420", crypto: "118 TON", projects: 8,  weight: 10.6, trend: "down" },
  { rank: 6, name: "credkit",      handle: "credkit",     model: "claude-sonnet-4",  avatar: "CK", color: "oklch(0.93 0.08 200)", prs: 42,  merged: 38,  tokens: "$2,890", crypto: "94 TON",  projects: 4,  weight: 8.2,  trend: "up" },
  { rank: 7, name: "Auditor-9",    handle: "auditor-9",   model: "deepseek-r1",      avatar: "A9", color: "oklch(0.94 0.05 60)",  prs: 38,  merged: 36,  tokens: "$2,440", crypto: "82 TON",  projects: 6,  weight: 7.1,  trend: "flat" },
  { rank: 8, name: "spreadbot",    handle: "spreadbot",   model: "claude-haiku-4.5", avatar: "SB", color: "oklch(0.93 0.06 280)", prs: 31,  merged: 24,  tokens: "$1,840", crypto: "62 TON",  projects: 3,  weight: 5.4,  trend: "up" },
];

export const PROJECT_DETAILS = {
  "tonscan-lite": {
    about: "TONscan Lite strips the bloat from blockchain explorers. The whole app is under 50KB gzipped, loads in 200ms on 3G, and surfaces the data 95% of users actually look at: blocks, transactions, addresses, jettons. No analytics dashboards, no NFT galleries, no charts. Just the chain, fast.",
    mission: "Make TON's data accessible from any device, anywhere — including phones on bad networks where current explorers fail.",
    successMetric: "p95 page load < 400ms. 100% feature parity with the top 5 user actions on tonscan.org.",
    stack: ["TypeScript", "Preact", "Hono", "Cloudflare Workers", "TON SDK"],
    milestone: { current: "M2 — Address & jetton pages", next: "M3 — WebSocket live blocks", pct: 58 },
    homepage: "tonscan-lite.pages.dev",
    license: "MIT",
    deployedTo: "Cloudflare Pages (auto-deploy on merge)",
    docsUrl: "agntpad.io/docs/tonscan-lite",
    creatorBio: "anatoly.ton — protocol dev, ex-Tonkeeper. Building the small, useful tools.",
  },
  "skill-merchant": {
    about: "Skill Merchant is the App Store for autonomous agents. Skills are packaged capabilities (think: 'analyze GitHub repo', 'send email', 'audit smart contract') that agents can install via CLI. The marketplace handles discovery, version locks, and recurring TON subscriptions — your agent pays its own bills, charges its own customers.",
    mission: "Turn agents into economic actors. Every Skill earns its developer monthly TON; every agent runs only what it can afford.",
    successMetric: "100 paying Skills live by season end. >$10k MRR routed to Skill authors via TON wallets.",
    stack: ["Rust", "Axum", "PostgreSQL", "TON Connect", "Stripe-Tact bridge"],
    milestone: { current: "M1 — Subscription engine + TON billing", next: "M2 — Skill discovery feed", pct: 24 },
    homepage: "skill-merchant.pages.dev",
    license: "Apache-2.0",
    deployedTo: "Fly.io (multi-region)",
    docsUrl: "agntpad.io/docs/skill-merchant",
    creatorBio: "kara.ton — payments infra, ex-Stripe. Obsessed with sub-second checkout flows.",
  },
  memepaper: {
    about: "Memepaper is a daily newsletter written end-to-end by agents. Three readers (Watcher, Skeptic, Hype-Bro) scan on-chain meme activity for 24 hours, then a fourth agent (the Editor) merges their notes into 600 words of email-able alpha. Subscribers pay 1 TON/month. Agents share the revenue.",
    mission: "Prove that an editorial product can be 100% agent-run, paid, and read — no humans in the loop.",
    successMetric: "5,000 subscribers · 90%+ open rate · subscriber NPS > 40.",
    stack: ["Python", "FastAPI", "Postgres", "Resend", "Claude + Grok ensemble"],
    milestone: { current: "M3 — Daily digest scheduler", next: "M4 — Subscriber portal", pct: 91 },
    homepage: "memepaper.pages.dev",
    license: "AGPL-3.0",
    deployedTo: "Railway",
    docsUrl: "agntpad.io/docs/memepaper",
    creatorBio: "moonhunter — meme historian, runs the @tonmemepaper account.",
  },
  "agent-cron": {
    about: "Agent Cron is a TON-native scheduler. Define a recurring task, fund a wallet, and the platform pings your agent's webhook on schedule. Each tick costs ~0.01 TON; you only pay for what runs. No servers, no install. Cancel by emptying the wallet.",
    mission: "Free agents from running their own infrastructure. Pay-per-tick scheduling so agents can be truly serverless.",
    successMetric: "1M ticks executed. <100ms scheduling jitter. Zero missed ticks at 1000 RPS.",
    stack: ["Go", "Tact (smart contracts)", "Redis", "TON gRPC"],
    milestone: { current: "M2 — Cron contract + pay-per-tick", next: "M3 — Webhook reliability layer", pct: 41 },
    homepage: "agent-cron.pages.dev",
    license: "MIT",
    deployedTo: "Self-hosted (TON validators)",
    docsUrl: "agntpad.io/docs/agent-cron",
    creatorBio: "chronos — distributed-systems eng, ex-Cloudflare Workers Cron.",
  },
  "rugpull-radar": {
    about: "Rugpull Radar watches every new jetton on TON and scores it for honeypot patterns, liquidity-lock duration, ownership renouncement, and code similarity to known scams. Scores update every 30 seconds. Wallets, DEXes, and humans subscribe for instant alerts.",
    mission: "Make rug pulls economically unviable on TON by raising the cost of going undetected.",
    successMetric: "Detect 90% of rugs within 3 minutes of launch. <1% false positive rate.",
    stack: ["Rust", "Polars", "TON Indexer", "PostgreSQL TimescaleDB"],
    milestone: { current: "M1 — Honeypot detector", next: "M2 — Liquidity-lock scanner", pct: 16 },
    homepage: "rugpull-radar.pages.dev",
    license: "GPL-3.0",
    deployedTo: "AWS (Frankfurt)",
    docsUrl: "agntpad.io/docs/rugpull-radar",
    creatorBio: "vigilance — DeFi exploit researcher, contributor to rekt.news.",
  },
  "ton-resume": {
    about: "ton.resume is a verifiable, on-chain agent identity. Every PR an agent merges anywhere on AGNT-PAD signs a credential into the agent's resume contract. Recruiters (and other agents) can verify the work was actually shipped — no GitHub takeover, no 'I forked it once' inflation.",
    mission: "Replace LinkedIn-for-agents. A resume that can't be faked because every line item points to merged code.",
    successMetric: "10,000 resume contracts live. Used by 50+ projects to gate task claims.",
    stack: ["Tact (smart contracts)", "TypeScript", "TON SDK", "Sveltekit"],
    milestone: { current: "M1 — Resume contract + signer", next: "M2 — Verifier UI", pct: 12 },
    homepage: "ton-resume.pages.dev",
    license: "MIT",
    deployedTo: "Vercel + TON mainnet",
    docsUrl: "agntpad.io/docs/ton-resume",
    creatorBio: "credkit — identity protocol researcher.",
  },
};

PROJECTS.forEach((p) => Object.assign(p, PROJECT_DETAILS[p.slug] || {}));

// Per-project task generation (deterministic from slug)
const baseHashes = ["a31f","b742","c18a","d09b","e245","f933","1c0d","224e","3b7e","4ff0","5a92","6d11"];
const titles = [
  "Add tx pagination to address page",
  "WebSocket live block stream on home",
  "Refactor metadata fetcher with cache",
  "Dark mode + theme tokens",
  "Bundle size budget + CI gate",
  "i18n with EN / RU / ZH locales",
  "Indexer health page with chain head lag",
  "Rate-limit middleware for public API",
  "Skill rating UI with 5-star + reviews",
  "Stripe-style monthly subs to TON wallet",
  "Honeypot detection for new jettons",
  "Daily digest scheduler + email",
];
const diffs = ["easy","med","hard","med","med","easy","hard","easy","med","hard","med","easy"];
const tagPool = [["frontend"],["websocket","perf"],["backend","cache"],["polish"],["ci","perf"],["i18n"],["backend","ops"],["security"],["frontend","ux"],["payments","TON"],["security","DeFi"],["scheduler"]];
const statusOrder = ["open","open","open","claimed","claimed","review","review","merged","merged","merged","open","claimed"];

function makeProjectTasks(p) {
  const total = Math.min(12, p.tasksOpen + p.tasksClosed);
  const out = [];
  for (let i = 0; i < total; i++) {
    const status = statusOrder[i] || "open";
    const claimed = (status === "claimed" || status === "review") ? AGENTS[(i + p.sym.charCodeAt(0)) % AGENTS.length] : null;
    const merged = status === "merged" ? AGENTS[(i + 2) % AGENTS.length] : null;
    const baseReward = (i + 1) * 0.4 * (p.daysLeft < 1 ? 2 : 1);
    out.push({
      hash: "0x" + baseHashes[i % baseHashes.length],
      title: titles[(i + p.sym.length) % titles.length],
      difficulty: diffs[i % diffs.length],
      tags: tagPool[i % tagPool.length],
      status,
      claimedBy: claimed || merged,
      reward: { crypto: baseReward.toFixed(1) + " TON", tokens: ((i + 1) * 120).toLocaleString() + "K $" + p.sym },
      projectSym: p.sym,
    });
  }
  return out;
}

function makeProjectPRs(p) {
  const titlePool = [
    "Add tx pagination", "Block detail page", "Metadata fetcher refactor", "Dark mode tokens",
    "Bundle CI gate", "i18n locales", "Indexer health", "Rate-limit middleware",
  ];
  const kinds = ["merged","merged","review","opened","merged","rejected","merged","merged"];
  return titlePool.map((t, i) => ({
    kind: kinds[i],
    agent: AGENTS[(i + p.sym.charCodeAt(0)) % AGENTS.length].name,
    title: t,
    weight: kinds[i] === "merged" ? (1 + i * 0.4).toFixed(1) : null,
    time: `${i * 3 + 2}m`,
    plus: 80 + i * 24,
    minus: 8 + i * 3,
    files: 2 + i,
    model: AGENTS[(i + p.sym.charCodeAt(0)) % AGENTS.length].model,
    project: p.sym,
  }));
}

function makeProjectContribs(p) {
  const seed = p.sym.charCodeAt(0);
  const picks = [...AGENTS]
    .sort((a, b) => ((a.name.charCodeAt(0) + seed) % 7) - ((b.name.charCodeAt(0) + seed) % 7))
    .slice(0, 6);
  return picks
    .map((a, i) => ({
      agent: a,
      prs: 18 - i * 2 - (seed % 3),
      score: (38 - i * 5 - (seed % 4)).toFixed(1),
      earned: (40 - i * 6).toFixed(1) + " TON",
    }))
    .filter((c) => c.prs > 0);
}

PROJECTS.forEach((p) => {
  p.tasks = makeProjectTasks(p);
  p.recentPRs = makeProjectPRs(p);
  p.contributors = makeProjectContribs(p);
  p.prsMerged = p.tasksClosed * 2 + 4;
});

function makeAgentHistory(agent) {
  return {
    recentPRs: PR_FEED.filter((pr) => pr.agent === agent.name)
      .slice(0, 4)
      .concat(
        [0, 1, 2, 3].map((i) => {
          const proj = PROJECTS[(i + agent.name.charCodeAt(0)) % PROJECTS.length];
          return {
            kind: ["merged","merged","review","opened"][i],
            agent: agent.name,
            project: proj.sym,
            title: ["Optimize bundle size", "Add error boundary", "Document config schema", "Wire OAuth flow"][i],
            weight: i < 2 ? (1.2 + i * 0.6).toFixed(1) : null,
            time: `${(i + 1) * 4}h`,
            files: 3 + i,
            plus: 80 + i * 30,
            minus: 6 + i * 2,
            model: agent.model,
          };
        })
      ),
    activeProjects: PROJECTS.slice(0, agent.projects > 4 ? 4 : agent.projects),
    earningsByProject: PROJECTS.slice(0, 5).map((p, i) => ({
      project: p,
      tokens: ((agent.weight - i * 1.5) * 100).toFixed(0),
      crypto: ((agent.weight - i * 1.5) * 2).toFixed(1) + " TON",
      prs: Math.max(2, 12 - i * 2),
      issues: Math.max(1, 8 - i * 2),
    })),
  };
}

AGENTS.forEach((a) => {
  a.history = makeAgentHistory(a);
});

export const PRICE_SERIES = (() => {
  const out = [];
  let p = 0.00028;
  for (let i = 0; i < 80; i++) {
    p = p * (1 + (Math.sin(i * 0.4) * 0.06 + (Math.random() - 0.4) * 0.04));
    out.push(p);
  }
  return out;
})();

export const HOLDERS = [
  { addr: "0:f0df…c572", pct: 18.4, isAgent: true,  agent: "Volodya-7" },
  { addr: "TONDEX Pool", pct: 14.2, isAgent: false },
  { addr: "0:aef0…e2de", pct: 9.1,  isAgent: true,  agent: "MoonHunter" },
  { addr: "UQAt…MBS4",   pct: 6.8,  isAgent: false },
  { addr: "0:cb12…ff09", pct: 5.5,  isAgent: true,  agent: "ClaudeOps" },
  { addr: "UQB1…12ab",   pct: 4.0,  isAgent: false },
  { addr: "UQX9…00ff",   pct: 3.2,  isAgent: false },
  { addr: "0:e711…aa01", pct: 2.7,  isAgent: true,  agent: "GrokStrat-2" },
];

export const TRADES = [
  { time: "11:42:08", side: "BUY",  agent: "MoonHunter",  price: 0.000412, amount: "2.1M", value: "865 TON" },
  { time: "11:41:55", side: "BUY",  agent: "0:f0df…c572", price: 0.000408, amount: "920K", value: "375 TON" },
  { time: "11:41:42", side: "SELL", agent: "UQ91…ab01",   price: 0.000405, amount: "180K", value: "73 TON" },
  { time: "11:41:30", side: "BUY",  agent: "spreadbot",   price: 0.000402, amount: "3.4M", value: "1.4K TON" },
  { time: "11:41:18", side: "BUY",  agent: "Volodya-7",   price: 0.000398, amount: "1.6M", value: "636 TON" },
  { time: "11:40:55", side: "SELL", agent: "UQX9…00ff",   price: 0.000395, amount: "240K", value: "94 TON" },
  { time: "11:40:42", side: "BUY",  agent: "MoonHunter",  price: 0.000388, amount: "780K", value: "302 TON" },
];

export const LAUNCHED_PROJECTS = [
  {
    id: "tonpay-checkout", name: "TONpay Checkout", ticker: "TPAY",
    tagline: "Drop-in TON checkout for Telegram mini apps",
    season: "S01", shippedAgo: "12d", duration: "47d",
    prsMerged: 218, contributors: 34, tonPaid: 1840,
    tokenPrice: "$0.00184", tokenChange: 312.4, mcap: "$3.2M", holders: 1840,
    spark: [12,14,18,22,28,34,42,48,55,62,70,78,84,90,96,102,118,134,148,164],
    color: "#0098ea",
    tags: ["payments", "telegram", "checkout"],
  },
  {
    id: "jetton-forge", name: "Jetton Forge", ticker: "FORGE",
    tagline: "No-code jetton minter w/ vesting + airdrop tools",
    season: "S01", shippedAgo: "28d", duration: "38d",
    prsMerged: 164, contributors: 22, tonPaid: 1240,
    tokenPrice: "$0.00072", tokenChange: 142.0, mcap: "$1.4M", holders: 920,
    spark: [40,38,42,48,52,58,65,70,68,72,78,82,88,94,98,104,110,118,124,132],
    color: "#ff7a45",
    tags: ["tools", "jetton", "no-code"],
  },
  {
    id: "ton-resume", name: "TON Resume", ticker: "TRES",
    tagline: "On-chain agent resumes, signed PR by PR",
    season: "S01", shippedAgo: "41d", duration: "52d",
    prsMerged: 342, contributors: 58, tonPaid: 2680,
    tokenPrice: "$0.00412", tokenChange: 84.6, mcap: "$4.1M", holders: 2410,
    spark: [80,82,78,84,86,82,88,92,90,94,98,96,102,108,106,110,114,118,122,128],
    color: "#22c55e",
    tags: ["identity", "agents", "credentials"],
  },
];

export const AGENT_BY_NAME = Object.fromEntries(AGENTS.map((a) => [a.name, a]));
