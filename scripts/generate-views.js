// Self-hosted replacement for the komarev.com view-counter badge.
// GitHub's own traffic API only retains 14 days of daily view counts, so
// this script keeps a running total in metrics/views-state.json, adding
// each newly-completed day exactly once as it ages out of that window.

const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GH_USERNAME || 'aysh-mzmdr';
const TOKEN = process.env.METRICS_TOKEN;
const STATE_FILE = path.join(__dirname, '..', 'metrics', 'views-state.json');
const OUT_FILE = path.join(__dirname, '..', 'metrics', 'total-views.svg');
const OUT_FILE_RECENT = path.join(__dirname, '..', 'metrics', 'recent-views.svg');
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

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { total: 0, lastCountedDate: null };
  }
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Fetching repository traffic for ${USERNAME}/${USERNAME}...`);

  const data = await apiGet(`https://api.github.com/repos/${USERNAME}/${USERNAME}/traffic/views?per=day`);
  const state = loadState();

  // Only count days that are fully finished — GitHub's "today" entry is
  // still accumulating, so counting it now and again tomorrow would double it.
  const todayStr = isoDate(new Date());
  const days = (data.views || [])
    .map((v) => ({ date: v.timestamp.slice(0, 10), count: v.count }))
    .filter((v) => v.date < todayStr)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  let added = 0;
  let newestCounted = state.lastCountedDate;
  for (const day of days) {
    if (!state.lastCountedDate || day.date > state.lastCountedDate) {
      state.total += day.count;
      added += day.count;
      if (!newestCounted || day.date > newestCounted) newestCounted = day.date;
    }
  }
  state.lastCountedDate = newestCounted;

  console.log(`Added ${added} views from ${days.length} completed day(s) in range. Running total: ${state.total}`);

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');

  // GitHub's own `count` field is already the sum over whatever window the
  // API just returned (its trailing 14 days), no accumulation needed.
  const recentTotal = data.count || 0;
  console.log(`Views in the last 14 days (per GitHub): ${recentTotal}`);

  fs.writeFileSync(OUT_FILE, renderBadge({ value: state.total, suffix: 'Total Public Views', suffixWidth: 120.7, icon: EYE_PATH, bg: '#E07A5F' }), 'utf8');
  console.log('Wrote', OUT_FILE);

  fs.writeFileSync(OUT_FILE_RECENT, renderBadge({ value: recentTotal, suffix: 'Views in Last 14 Days', suffixWidth: 138.78, icon: CALENDAR_PATH, bg: '#58a6ff' }), 'utf8');
  console.log('Wrote', OUT_FILE_RECENT);
}

// Material Icons glyphs, 24x24 viewBox, Apache-2.0.
const EYE_PATH =
  'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
const CALENDAR_PATH =
  'M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM5 7V6h14v1H5z';

function renderBadge({ value, suffix, suffixWidth, icon, bg, fg = '#FFFFFF' }) {
  const HEIGHT = 32;
  const ICON_SIZE = 16;
  const PAD_LEFT = 12;
  const GAP = 8;
  const PAD_RIGHT = 14;
  const RADIUS = 6;
  const FONT_SIZE = 13;

  const numberStr = value.toLocaleString();
  const label = `${numberStr} ${suffix}`;
  // Exact Poppins Medium @13px glyph widths (measured offline, since opentype.js
  // isn't worth adding as a runtime dependency just to re-measure this every run):
  // digit ~8.35px, comma ~2.95px, each label's fixed suffix measured separately.
  // A few px of slack is added on top since combined-string kerning shaves a
  // little off the sum of individually-measured glyphs — safe to overshoot
  // (a little empty padding) but not to undershoot (clipped text).
  const digitCount = (numberStr.match(/[0-9]/g) || []).length;
  const commaCount = (numberStr.match(/,/g) || []).length;
  const textWidth = digitCount * 8.35 + commaCount * 2.95 + suffixWidth + 4;
  const width = Math.ceil(PAD_LEFT + ICON_SIZE + GAP + textWidth + PAD_RIGHT);

  const iconY = (HEIGHT - ICON_SIZE) / 2;
  const textX = PAD_LEFT + ICON_SIZE + GAP;
  const textY = HEIGHT / 2;
  const scale = ICON_SIZE / 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">
  <defs>
    <style>
      @font-face {
        font-family: 'PoppinsBadge';
        src: url(data:font/woff2;base64,${FONT_B64}) format('woff2');
        font-weight: 500;
        font-style: normal;
      }
      .lbl {
        font-family: 'PoppinsBadge', 'Segoe UI', sans-serif;
        font-weight: 500;
        font-size: ${FONT_SIZE}px;
        fill: ${fg};
      }
    </style>
  </defs>
  <rect width="${width}" height="${HEIGHT}" rx="${RADIUS}" fill="${bg}"/>
  <g transform="translate(${PAD_LEFT}, ${iconY}) scale(${scale})">
    <path d="${icon}" fill="${fg}"/>
  </g>
  <text x="${textX}" y="${textY}" class="lbl" dominant-baseline="central">${label}</text>
</svg>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
