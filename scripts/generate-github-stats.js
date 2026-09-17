// Self-hosted replacement for the (frequently-down) github-readme-stats widgets.
// Pulls exactly the numbers we want straight from the GitHub REST API and
// renders a single static SVG card, run daily by .github/workflows/metrics.yml.

const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GH_USERNAME || 'aysh-mzmdr';
const TOKEN = process.env.METRICS_TOKEN;
const OUT_FILE = path.join(__dirname, '..', 'metrics', 'github-metrics.svg');
const FONT_B64 = fs.readFileSync(path.join(__dirname, 'poppins-font-base64.txt'), 'utf8').trim();

if (!TOKEN) {
  console.error('Missing METRICS_TOKEN environment variable.');
  process.exit(1);
}

const API_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'github-profile-stats-script',
};

async function apiGet(url) {
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${url} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function getTotalCommits(username) {
  const url = `https://api.github.com/search/commits?q=author:${username}`;
  const data = await apiGet(url);
  return data.total_count || 0;
}

async function getAllOwnedRepos(username) {
  const repos = [];
  let page = 1;
  for (;;) {
    const url = `https://api.github.com/users/${username}/repos?type=owner&per_page=100&page=${page}`;
    const batch = await apiGet(url);
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}

async function getLanguageBytes(repo) {
  try {
    return await apiGet(repo.languages_url);
  } catch {
    return {};
  }
}

// The repo list endpoint returns a reduced schema where `watchers_count` is
// just an alias for stars; the true watch count (`subscribers_count`) only
// appears on each repo's own detail endpoint, so it needs a separate call.
async function getSubscriberCount(repo) {
  try {
    const detail = await apiGet(repo.url);
    return detail.subscribers_count ?? 0;
  } catch {
    return 0;
  }
}

// GitHub's linguist colors for the most common languages; unlisted -> gray fallback.
const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Solidity: '#AA6746',
  Shell: '#89e051',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Go: '#00ADD8',
  Rust: '#dea584',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Dart: '#00B4AB',
  Vue: '#41b883',
  EJS: '#a91e50',
  Dockerfile: '#384d54',
};
const FALLBACK_COLOR = '#8b949e';

async function main() {
  console.log(`Fetching GitHub stats for ${USERNAME}...`);

  const [totalCommits, repos] = await Promise.all([
    getTotalCommits(USERNAME),
    getAllOwnedRepos(USERNAME),
  ]);

  const totalRepos = repos.length;
  const subscriberCounts = await Promise.all(repos.map(getSubscriberCount));
  const totalWatchers = subscriberCounts.reduce((a, b) => a + b, 0);

  const languageBytes = {};
  const nonForkRepos = repos.filter((r) => !r.fork);
  const langResults = await Promise.all(nonForkRepos.map(getLanguageBytes));
  for (const langs of langResults) {
    for (const [lang, bytes] of Object.entries(langs)) {
      languageBytes[lang] = (languageBytes[lang] || 0) + bytes;
    }
  }

  const totalLanguages = Object.keys(languageBytes).length;
  const totalBytes = Object.values(languageBytes).reduce((a, b) => a + b, 0);
  const topLanguages = Object.entries(languageBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({
      name,
      pct: totalBytes ? (bytes / totalBytes) * 100 : 0,
      color: LANGUAGE_COLORS[name] || FALLBACK_COLOR,
    }));

  console.log({ totalCommits, totalRepos, totalWatchers, totalLanguages, topLanguages });

  const svg = renderCard({ totalCommits, totalRepos, totalWatchers, totalLanguages, topLanguages });
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, svg, 'utf8');
  console.log('Wrote', OUT_FILE);
}

function renderCard({ totalCommits, totalRepos, totalWatchers, totalLanguages, topLanguages }) {
  const WIDTH = 495;
  const BG = '#0d1117';
  const ACCENT = '#58a6ff';
  const TEXT = '#c9d1d9';
  const MUTED = '#6e7681';

  const stats = [
    { label: 'Total Commits', value: totalCommits },
    { label: 'Repositories', value: totalRepos },
    { label: 'Watchers', value: totalWatchers },
    { label: 'Languages', value: totalLanguages },
  ];

  const padX = 28;
  const titleY = 40;
  const statsY = 90;
  const dividerY = 122;
  const langTitleY = 152;
  const barY = 168;
  const barHeight = 10;
  const legendStartY = 200;
  const legendRowHeight = 24;
  const legendCols = 2;
  const legendRows = Math.ceil(topLanguages.length / legendCols);
  const HEIGHT = legendStartY + legendRows * legendRowHeight + 16;

  const colWidth = (WIDTH - padX * 2) / stats.length;
  const statBlocks = stats
    .map((s, i) => {
      const cx = padX + colWidth * i + colWidth / 2;
      return `
    <text x="${cx}" y="${statsY}" text-anchor="middle" class="stat-value">${s.value}</text>
    <text x="${cx}" y="${statsY + 20}" text-anchor="middle" class="stat-label">${s.label}</text>`;
    })
    .join('');

  let barX = padX;
  const barWidth = WIDTH - padX * 2;
  const barSegments = topLanguages
    .map((l) => {
      const w = Math.max((l.pct / 100) * barWidth, 2);
      const seg = `<rect x="${barX.toFixed(2)}" y="${barY}" width="${w.toFixed(2)}" height="${barHeight}" fill="${l.color}"/>`;
      barX += w;
      return seg;
    })
    .join('');

  const legendItems = topLanguages
    .map((l, i) => {
      const col = i % legendCols;
      const row = Math.floor(i / legendCols);
      const x = padX + col * ((WIDTH - padX * 2) / legendCols);
      const y = legendStartY + row * legendRowHeight;
      const pct = l.pct.toFixed(1);
      return `
    <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${l.color}"/>
    <text x="${x + 16}" y="${y}" class="legend-text">${l.name} <tspan fill="${MUTED}">${pct}%</tspan></text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <style>
      @font-face {
        font-family: 'PoppinsStats';
        src: url(data:font/woff2;base64,${FONT_B64}) format('woff2');
        font-weight: 500;
        font-style: normal;
      }
      text { font-family: 'PoppinsStats', 'Segoe UI', sans-serif; }
      .title { font-size: 16px; font-weight: 500; fill: ${ACCENT}; }
      .stat-value { font-size: 22px; font-weight: 500; fill: ${TEXT}; }
      .stat-label { font-size: 11px; font-weight: 500; fill: ${MUTED}; }
      .section-title { font-size: 13px; font-weight: 500; fill: ${ACCENT}; }
      .legend-text { font-size: 12px; font-weight: 500; fill: ${TEXT}; }
    </style>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="8" fill="${BG}" stroke="#30363d"/>
  <text x="${padX}" y="${titleY}" class="title">GitHub Stats</text>
  ${statBlocks}
  <line x1="${padX}" y1="${dividerY}" x2="${WIDTH - padX}" y2="${dividerY}" stroke="#30363d" stroke-width="1"/>
  <text x="${padX}" y="${langTitleY}" class="section-title">Most Used Languages</text>
  <rect x="${padX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5" fill="#161b22"/>
  ${barSegments}
  ${legendItems}
</svg>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
