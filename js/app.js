const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const BASE_URL = 'https://www.worldfootball.net';

let teamsData = [];
let selectedTeam1 = null;
let selectedTeam2 = null;

async function init() {
  const response = await fetch('data/teams.json');
  const data = await response.json();
  teamsData = [
    ...data.premier_league,
    ...data.la_liga,
    ...data.bundesliga,
    ...data.serie_a,
    ...data.ligue_1,
    ...data.world_cup_nations
  ];

  setupSearch('team1-search', 'team1-suggestions', 1);
  setupSearch('team2-search', 'team2-suggestions', 2);

  document.getElementById('predict-btn').addEventListener('click', handlePredict);
}

function setupSearch(inputId, suggestionsId, teamNum) {
  const input = document.getElementById(inputId);
  const suggestions = document.getElementById(suggestionsId);

  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    suggestions.innerHTML = '';

    if (query.length < 2) {
      suggestions.classList.remove('active');
      return;
    }

    const matches = teamsData.filter(t =>
      t.name.toLowerCase().includes(query)
    ).slice(0, 8);

    if (matches.length === 0) {
      suggestions.classList.remove('active');
      return;
    }

    matches.forEach(team => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.textContent = team.name;
      div.addEventListener('click', () => {
        input.value = team.name;
        suggestions.classList.remove('active');
        if (teamNum === 1) selectedTeam1 = team;
        else selectedTeam2 = team;
        updatePredictButton();
      });
      suggestions.appendChild(div);
    });

    suggestions.classList.add('active');
  });

  input.addEventListener('blur', () => {
    setTimeout(() => suggestions.classList.remove('active'), 200);
  });
}

function updatePredictButton() {
  const btn = document.getElementById('predict-btn');
  btn.disabled = !(selectedTeam1 && selectedTeam2);
}

async function handlePredict() {
  showLoading(true);
  hideError();
  hideResults();

  try {
    const [stats1, stats2] = await Promise.all([
      fetchTeamStats(selectedTeam1),
      fetchTeamStats(selectedTeam2)
    ]);

    displayResults(stats1, stats2);
  } catch (err) {
    showError('Failed to fetch stats. Please try again.');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

async function fetchTeamStats(team) {
  const url = `${BASE_URL}/teams/${team.id}/${team.slug}/`;
  const proxyUrl = CORS_PROXY + encodeURIComponent(url);

  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  return parseTeamStats(html, team.name);
}

function parseTeamStats(html, teamName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const matches = parseRecentMatches(doc);
  const topScorer = parseTopScorer(doc);

  const goalsScored = matches.map(m => m.goalsFor);
  const goalsConceded = matches.map(m => m.goalsAgainst);

  const avgScored = goalsScored.length > 0
    ? goalsScored.reduce((a, b) => a + b, 0) / goalsScored.length
    : 0;

  const avgConceded = goalsConceded.length > 0
    ? goalsConceded.reduce((a, b) => a + b, 0) / goalsConceded.length
    : 0;

  const wins = matches.filter(m => m.result === 'W').length;
  const winRate = matches.length > 0 ? (wins / matches.length) * 100 : 0;

  return {
    name: teamName,
    matches,
    form: matches.slice(0, 5).map(m => m.result),
    avgScored: round(avgScored, 2),
    avgConceded: round(avgConceded, 2),
    matchesPlayed: matches.length,
    winRate: round(winRate, 1),
    topScorer
  };
}

function parseRecentMatches(doc) {
  const matchElements = doc.querySelectorAll('.module-gameplan .match');
  const matches = [];

  matchElements.forEach(el => {
    const isFinished = el.classList.contains('finished');
    if (!isFinished) return;

    const homeTeam = el.querySelector('.team-shortname-home')?.textContent?.trim() || '';
    const awayTeam = el.querySelector('.team-shortname-away')?.textContent?.trim() || '';

    const homeGoalsEl = el.querySelector('.match-result-home .match-result-0');
    const awayGoalsEl = el.querySelector('.match-result-away .match-result-0');

    const homeGoals = parseInt(homeGoalsEl?.textContent) || 0;
    const awayGoals = parseInt(awayGoalsEl?.textContent) || 0;

    matches.push({
      homeTeam,
      awayTeam,
      goalsFor: homeGoals,
      goalsAgainst: awayGoals,
      result: homeGoals > awayGoals ? 'W' : homeGoals < awayGoals ? 'L' : 'D'
    });
  });

  return matches.slice(0, 10);
}

function parseTopScorer(doc) {
  const firstScorerRow = doc.querySelector('.module-statistics tbody tr');
  if (!firstScorerRow) return 'N/A';

  const nameEl = firstScorerRow.querySelector('.person-shortname a, .person-name a');
  const goalsEl = firstScorerRow.querySelector('.person_stats-score');

  const name = nameEl?.textContent?.trim() || 'Unknown';
  const goals = goalsEl?.textContent?.trim() || '0';

  return `${name} (${goals})`;
}

function predictScore(stats1, stats2) {
  const homeAttack = stats1.avgScored || 1.2;
  const awayDefense = stats2.avgConceded || 1.2;
  const awayAttack = stats2.avgScored || 1.0;
  const homeDefense = stats1.avgConceded || 1.0;

  const lambda1 = Math.max(0.3, (homeAttack + awayDefense) / 2);
  const lambda2 = Math.max(0.3, (awayAttack + homeDefense) / 2);

  const maxGoals = 6;
  let probHome = 0;
  let probDraw = 0;
  let probAway = 0;

  const poisson = (lambda, k) => {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  };

  const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const prob = poisson(lambda1, i) * poisson(lambda2, j);
      if (i > j) probHome += prob;
      else if (i === j) probDraw += prob;
      else probAway += prob;
    }
  }

  const total = probHome + probDraw + probAway;
  probHome = (probHome / total) * 100;
  probDraw = (probDraw / total) * 100;
  probAway = (probAway / total) * 100;

  const predHome = Math.round(lambda1);
  const predAway = Math.round(lambda2);

  return {
    homeGoals: Math.min(predHome, 5),
    awayGoals: Math.min(predAway, 5),
    probHome: round(probHome, 1),
    probDraw: round(probDraw, 1),
    probAway: round(probAway, 1)
  };
}

function displayResults(stats1, stats2) {
  document.getElementById('team1-name').textContent = stats1.name;
  document.getElementById('team2-name').textContent = stats2.name;

  renderForm('team1-form', stats1.form);
  renderForm('team2-form', stats2.form);

  document.getElementById('team1-avg-scored').textContent = stats1.avgScored;
  document.getElementById('team1-avg-conceded').textContent = stats1.avgConceded;
  document.getElementById('team1-matches').textContent = stats1.matchesPlayed;
  document.getElementById('team1-win-rate').textContent = `${stats1.winRate}%`;

  document.getElementById('team2-avg-scored').textContent = stats2.avgScored;
  document.getElementById('team2-avg-conceded').textContent = stats2.avgConceded;
  document.getElementById('team2-matches').textContent = stats2.matchesPlayed;
  document.getElementById('team2-win-rate').textContent = `${stats2.winRate}%`;

  document.getElementById('team1-top-scorer').textContent = stats1.topScorer;
  document.getElementById('team2-top-scorer').textContent = stats2.topScorer;

  const prediction = predictScore(stats1, stats2);

  document.getElementById('pred-team1-name').textContent = stats1.name;
  document.getElementById('pred-team2-name').textContent = stats2.name;
  document.getElementById('pred-team1-goals').textContent = prediction.homeGoals;
  document.getElementById('pred-team2-goals').textContent = prediction.awayGoals;

  document.getElementById('prob-team1-label').textContent = stats1.name;
  document.getElementById('prob-team2-label').textContent = stats2.name;

  document.getElementById('prob-team1-value').textContent = `${prediction.probHome}%`;
  document.getElementById('prob-draw-value').textContent = `${prediction.probDraw}%`;
  document.getElementById('prob-team2-value').textContent = `${prediction.probAway}%`;

  document.getElementById('prob-team1-bar').style.width = `${prediction.probHome}%`;
  document.getElementById('prob-draw-bar').style.width = `${prediction.probDraw}%`;
  document.getElementById('prob-team2-bar').style.width = `${prediction.probAway}%`;

  showResults();
}

function renderForm(containerId, form) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  form.forEach(result => {
    const badge = document.createElement('span');
    badge.className = `form-badge ${result.toLowerCase()}`;
    badge.textContent = result;
    container.appendChild(badge);
  });
}

function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error').classList.add('hidden');
}

function showResults() {
  document.getElementById('results').classList.remove('hidden');
}

function hideResults() {
  document.getElementById('results').classList.add('hidden');
}

function round(num, decimals) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

document.addEventListener('DOMContentLoaded', init);
