// Renders profile/progress.svg from profile/progress.json
//
// Progress sources:
//  - "auto": true → computed from GitHub issues labeled `mission:<id>`:
//      progress = closed / (open + closed)
//    Without any issues, the manual "progress" value is used as a fallback.
//  - Otherwise the manual "progress" value is used as-is.
//
// Credentials:
//  - GH_PAT (if set) searches ALL repos the token can see (use a fine-grained
//    token with Issues read on the repos you track; the resulting percentages
//    become public on your profile page).
//  - Otherwise GH_TOKEN/GITHUB_TOKEN searches only this repository
//    (Genjuzu/Genjuzu).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const data = JSON.parse(
  readFileSync(join(repoRoot, "profile", "progress.json"), "utf8"),
);

const GH_TOKEN = process.env.GH_PAT || process.env.GH_TOKEN || "";
const USE_ALL_REPOS = Boolean(process.env.GH_PAT);
const REPO_QUAL = "repo:Genjuzu/Genjuzu";
const SEARCH_BASE = "https://api.github.com/search/issues";

async function countIssues(label) {
  if (!GH_TOKEN) return null;
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const baseQuery = `${USE_ALL_REPOS ? "" : REPO_QUAL + " "}label:"${label}" is:issue`;
  async function count(state) {
    const url = `${SEARCH_BASE}?q=${encodeURIComponent(baseQuery + " state:" + state)}&per_page=1`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub search failed (${res.status}) for ${label}/${state}`);
    const j = await res.json();
    return j.total_count ?? 0;
  }
  const [open, closed] = await Promise.all([count("open"), count("closed")]);
  return { open, closed };
}

for (const m of data.missions) {
  if (m.auto && m.label) {
    const c = await countIssues(m.label);
    if (c) {
      const total = c.open + c.closed;
      if (total > 0) {
        m.progress = Math.round((c.closed / total) * 100);
        console.log(`${m.label}: ${c.closed}/${total} closed → ${m.progress}%`);
      } else {
        console.log(`${m.label}: no issues yet → fallback ${m.progress}%`);
      }
    } else {
      console.log(`${m.label}: no token, fallback ${m.progress}%`);
    }
  }
}

const CARD_W = 760;
const PAD = 36;
const ROW_GAP = 30;
const HEADER_H = 84;
const ROW_H = 64;
const ACCENT = "#22d3ee";
const CYAN = "#22d3ee";
const VIOLET = "#a78bfa";
const TEXT = "#e6edf3";
const MUTED = "#8b949e";
const BG1 = "#0b0f19";
const BG2 = "#111827";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function row(y, m) {
  const barW = CARD_W - PAD * 2 - 200;
  const barH = 14;
  const pct = Math.max(0, Math.min(100, m.progress));
  const color = m.color || ACCENT;
  return `
  <g transform="translate(0,${y})">
    <text x="${PAD}" y="20" font-family="'JetBrains Mono',monospace" font-size="16" font-weight="700" fill="${TEXT}">${esc(m.title)}</text>
    <text x="${PAD}" y="40" font-family="'Inter',sans-serif" font-size="12" fill="${MUTED}">${esc(m.description)}</text>
    <rect x="${PAD}" y="52" width="${barW}" height="${barH}" rx="7" fill="#1c2536"/>
    <rect x="${PAD}" y="52" width="${Math.round((barW * pct) / 100)}" height="${barH}" rx="7" fill="${color}">
      <animate attributeName="width" from="0" to="${Math.round((barW * pct) / 100)}" dur="0.9s" fill="freeze"/>
    </rect>
    <text x="${PAD + barW - 200}" y="22" font-family="'JetBrains Mono',monospace" font-size="16" font-weight="700" fill="${color}">${pct}%</text>
  </g>`;
}

const rowsH = data.missions.length * ROW_H + (data.missions.length - 1) * ROW_GAP;
const cardH = HEADER_H + rowsH + PAD;

const bars = data.missions
  .map((m, i) => row(HEADER_H + i * (ROW_H + ROW_GAP), m))
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${cardH}" viewBox="0 0 ${CARD_W} ${cardH}" role="img" aria-label="Current missions progress">
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
  <text x="${PAD}" y="46" font-family="'JetBrains Mono',monospace" font-size="18" font-weight="800" fill="url(#accent)" filter="url(#glow)">CURRENT MISSIONS</text>
  <line x1="${PAD}" y1="60" x2="${CARD_W - PAD}" y2="60" stroke="url(#accent)" stroke-opacity="0.35" stroke-width="1"/>
  ${bars}
</svg>`;

mkdirSync(join(repoRoot, "profile"), { recursive: true });
writeFileSync(join(repoRoot, "profile", "progress.svg"), svg, "utf8");
console.log(`Wrote profile/progress.svg (${svg.length} bytes)`);
