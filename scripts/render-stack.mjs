// Renders profile/stack.svg from:
//  - languages: aggregated across all non-fork repos of Genjuzu
//      (public only by default; include private repos by adding a GH_PAT
//       secret with repo read access)
//  - tools: curated list in profile/stack.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const stack = JSON.parse(
  readFileSync(join(repoRoot, "profile", "stack.json"), "utf8"),
);

const GH_TOKEN = process.env.GH_PAT || process.env.GH_TOKEN || "";
const USE_ALL_REPOS = Boolean(process.env.GH_PAT);

const LANG_COLORS = {
  "C#": "#178600", Python: "#3572A5", TypeScript: "#3178c6",
  JavaScript: "#f1e05a", Kotlin: "#A97BFF", Rust: "#dea584",
  "Jupyter Notebook": "#DA5B0B", Vue: "#41b883", PHP: "#4F5D95",
  HTML: "#e34c26", CSS: "#563d7c", Shell: "#89e051",
  "C++": "#f34b7d", C: "#555555", Go: "#00ADD8",
  Java: "#b07219", Markdown: "#083fa1", Dart: "#00B4AB",
  Swift: "#F05138", Ruby: "#701516", "C# ": "#178600",
};

function langColor(l) { return LANG_COLORS[l] || "#8b949e"; }

async function fetchJson(url, token) {
  const headers = token
    ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
    : { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${url} failed (${res.status})`);
  return res.json();
}

async function listRepos() {
  if (USE_ALL_REPOS && GH_TOKEN) {
    const url = "https://api.github.com/user/repos?affiliation=owner,collaborator&per_page=100&sort=updated";
    try {
      return await fetchJson(url, GH_TOKEN);
    } catch {
      // fall through to public list
    }
  }
  const url = "https://api.github.com/users/Genjuzu/repos?per_page=100&sort=updated";
  return fetchJson(url, "");
}

// ---- aggregate primary languages over non-fork repos ----
let repoCount = 0;
const langCount = {};
try {
  const repos = await listRepos();
  if (Array.isArray(repos)) {
    for (const r of repos) {
      if (r.fork) continue;
      repoCount += 1;
      if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
    }
  }
} catch (e) {
  console.error("Could not load repos:", e.message);
}

const langRows = Object.entries(langCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([lang, count]) => ({ lang, count }));

// ---- geometry ----
const CARD_W = 760;
const PAD = 36;
const TEXT = "#e6edf3";
const MUTED = "#8b949e";
const CYAN = "#22d3ee";
const VIOLET = "#a78bfa";
const BG1 = "#0b0f19";
const BG2 = "#111827";
const BAR_X = 200;
const BAR_W = 380;

const LANG_HEADER_Y = 88;
const LANG_ROW_H = 32;
const LANG_START_Y = LANG_HEADER_Y + 28;
const langEndY = LANG_START_Y + langRows.length * LANG_ROW_H;
const TOOLBOX_HEADER_Y = langEndY + 24;

const chipsW = 160;
const chipsH = 30;
const chipsGapX = 14;
const chipsGapY = 14;
const perRow = Math.max(1, Math.floor((CARD_W - PAD * 2 + chipsGapX) / (chipsW + chipsGapX)));
const chipRows = Math.max(1, Math.ceil(stack.tools.length / perRow));
const TOOLBOX_START_Y = TOOLBOX_HEADER_Y + 28;
const cardH = TOOLBOX_START_Y + chipRows * chipsH + (chipRows - 1) * chipsGapY + PAD;

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- language bars ----
const langBars = langRows
  .map((row, i) => {
    const y = LANG_START_Y + i * LANG_ROW_H;
    const pct = repoCount > 0 ? Math.round((row.count / repoCount) * 100) : 0;
    const w = Math.max(4, Math.round((BAR_W * pct) / 100));
    const color = langColor(row.lang);
    return `
  <g transform="translate(0,${y})">
    <text x="${PAD}" y="20" font-family="'JetBrains Mono',monospace" font-size="13" font-weight="600" fill="${TEXT}">${esc(row.lang)}</text>
    <text x="${PAD}" y="37" font-family="'Inter',sans-serif" font-size="11" fill="${MUTED}">${row.count} ${row.count === 1 ? "repo" : "repos"}</text>
    <rect x="${BAR_X}" y="12" width="${BAR_W}" height="10" rx="5" fill="#1c2536"/>
    <rect x="${BAR_X}" y="12" width="${w}" height="10" rx="5" fill="${color}">
      <animate attributeName="width" from="0" to="${w}" dur="0.9s" fill="freeze"/>
    </rect>
    <text x="${BAR_X + BAR_W + 16}" y="22" font-family="'JetBrains Mono',monospace" font-size="14" font-weight="700" fill="${color}">${pct}%</text>
  </g>`;
  })
  .join("\n");

// ---- tool chips ----
const chips = stack.tools
  .map((t, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = PAD + col * (chipsW + chipsGapX);
    const y = TOOLBOX_START_Y + row * (chipsH + chipsGapY);
    return `
  <g transform="translate(${x},${y})">
    <rect width="${chipsW}" height="${chipsH}" rx="15" fill="#1c2536" stroke="${t.color || CYAN}" stroke-opacity="0.45"/>
    <circle cx="16" cy="${chipsH / 2}" r="3.5" fill="${t.color || CYAN}"/>
    <text x="30" y="${chipsH / 2 + 4}" font-family="'JetBrains Mono',monospace" font-size="11" font-weight="600" fill="${TEXT}">${esc(t.label)}</text>
  </g>`;
  })
  .join("\n");

const noData =
  langRows.length === 0
    ? `<text x="${PAD}" y="${LANG_START_Y + 28}" font-family="'Inter',sans-serif" font-size="13" fill="${MUTED}">Could not load language data.</text>`
    : "";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${cardH}" viewBox="0 0 ${CARD_W} ${cardH}" role="img" aria-label="Stack and skills">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG1}"/>
      <stop offset="100%" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="100%" stop-color="${VIOLET}"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${CARD_W}" height="${cardH}" rx="18" fill="url(#bg)"/>
  <circle cx="60" cy="40" r="90" fill="${CYAN}" opacity="0.07"/>
  <circle cx="${CARD_W - 40}" cy="${cardH - 40}" r="110" fill="${VIOLET}" opacity="0.07"/>
  <text x="${PAD}" y="46" font-family="'JetBrains Mono',monospace" font-size="18" font-weight="800" fill="url(#accent)" filter="url(#glow)">STACK &amp; SKILLS</text>
  <line x1="${PAD}" y1="60" x2="${CARD_W - PAD}" y2="60" stroke="url(#accent)" stroke-opacity="0.35" stroke-width="1"/>
  <text x="${PAD}" y="${LANG_HEADER_Y}" font-family="'JetBrains Mono',monospace" font-size="12" font-weight="600" fill="${MUTED}">LANGUAGES — SHARE OF ${repoCount} REPOS</text>
  ${noData}
  ${langBars}
  <text x="${PAD}" y="${TOOLBOX_HEADER_Y}" font-family="'JetBrains Mono',monospace" font-size="12" font-weight="600" fill="${MUTED}">TOOLBOX</text>
  ${chips}
</svg>`;

mkdirSync(join(repoRoot, "profile"), { recursive: true });
writeFileSync(join(repoRoot, "profile", "stack.svg"), svg, "utf8");
console.log(`Wrote profile/stack.svg (${svg.length} bytes)`);
