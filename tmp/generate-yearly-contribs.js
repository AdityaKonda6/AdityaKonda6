// tools/generate-yearly-contribs.js
// Fetch contribution data for each year using GitHub GraphQL and render a simple SVG calendar.
// Requirements: runs in Node 18+ (fetch available). Uses env vars:
//  - GITHUB_TOKEN (required)
//  - GITHUB_USERNAME (required)
//  - YEARS (comma-separated list, e.g. "2025,2024,2023")

const fs = require('fs');
const path = require('path');

const GH_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME;
const YEARS_ENV = process.env.YEARS || '';
if (!GH_TOKEN || !USERNAME || !YEARS_ENV) {
  console.error('Missing environment variables. Ensure GITHUB_TOKEN, GITHUB_USERNAME and YEARS are set.');
  process.exit(1);
}

const YEARS = YEARS_ENV.split(',').map(s => s.trim()).filter(Boolean);

const GRAPHQL_URL = 'https://api.github.com/graphql';

async function fetchYearContributions(year) {
  // contributionsCollection accepts from/to ISO datetimes
  const from = `${year}-01-01T00:00:00Z`;
  const to   = `${year}-12-31T23:59:59Z`;

  const query = `
    query($login:String!, $from:DateTime!, $to:DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                color
              }
            }
          }
        }
      }
    }
  `;

  const resp = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'generate-yearly-contribs-script'
    },
    body: JSON.stringify({ query, variables: { login: USERNAME, from, to } })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`GraphQL request failed: ${resp.status} ${resp.statusText}: ${txt}`);
  }

  const data = await resp.json();
  if (data.errors) {
    throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
  }
  return data.data.user.contributionsCollection.contributionCalendar;
}

function colorForCount(count) {
  // a simple color ramp (you can change colors)
  if (count <= 0) return '#ebedf0';
  if (count === 1) return '#c6e48b';
  if (count <= 3) return '#7bc96f';
  if (count <= 7) return '#239a3b';
  return '#196127';
}

function renderSVG(calendar, year) {
  // calendar.weeks is an array of weeks (each week has 7 days)
  // We'll render week columns left-to-right, each with 7 rects top-to-bottom (Sunday at top).
  const weeks = calendar.weeks || [];
  const w = weeks.length;
  const cellSize = 12;
  const cellSpacing = 2;
  const width = w * (cellSize + cellSpacing);
  const height = 7 * (cellSize + cellSpacing) + 30; // + title area

  const title = `${year} — ${calendar.totalContributions} contributions`;

  let svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">`);
  svg.push(`<style>text{font-family:system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;font-size:12px;fill:#444}</style>`);
  svg.push(`<text x="0" y="14">${title}</text>`);
  svg.push(`<g transform="translate(0,20)">`);

  weeks.forEach((week, i) => {
    week.contributionDays.forEach((day, dIdx) => {
      const x = i * (cellSize + cellSpacing);
      const y = dIdx * (cellSize + cellSpacing);
      const fill = colorForCount(day.contributionCount);
      const date = day.date;
      const count = day.contributionCount;
      const rect = `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${fill}">` +
                   ` <title>${date}: ${count} contribution${count === 1 ? '' : 's'}</title></rect>`;
      svg.push(rect);
    });
  });

  svg.push(`</g>`);
  svg.push(`</svg>`);
  return svg.join('\n');
}

(async () => {
  try {
    const outDir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const year of YEARS) {
      console.log('Fetching contributions for', year);
      const calendar = await fetchYearContributions(year);
      const svg = renderSVG(calendar, year);
      const filePath = path.join(outDir, `contrib-${year}.svg`);
      fs.writeFileSync(filePath, svg, 'utf8');
      console.log('Wrote', filePath);
    }
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(2);
  }
})();
