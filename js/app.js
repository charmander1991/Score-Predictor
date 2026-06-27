const API_BASE = 'https://api.openligadb.de';

const LEAGUES = [
  { shortcut: 'wm2026', name: 'World Cup 2026' },
  { shortcut: 'bl1', name: 'Bundesliga' },
  { shortcut: 'ucl', name: 'Champions League' },
  { shortcut: 'cwm', name: 'Club World Cup' }
];

let allMatches = [];
let teamCache = {};
let selectedTeam1 = null;
let selectedTeam2 = null;

async function init() {
  showLoading(true);
  try {
    const leaguePromises = LEAGUES.map(l => fetchLeagueMatches(l.shortcut));
    const results = await Promise.allSettled(leaguePromises);

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        allMatches = allMatches.concat(result.value);
      } else {
        console.warn(`Failed to load ${LEAGUES[i].name}:`, result.reason);
      }
    });

    buildTeamCache();
    setupSearch('team1-search', 'team1-suggestions', 1);
    setupSearch('team2-search', 'team2-suggestions', 2);
    document.getElementById('predict-btn').addEventListener('click', handlePredict);
  } catch (err) {
    showError('Failed to load data. Please refresh.');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

async function fetchLeagueMatches(shortcut) {
  const response = await fetch(`${API_BASE}/getmatchdata/${shortcut}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function buildTeamCache() {
  teamCache = {};

  allMatches.forEach(match => {
    const home = match.team1.teamName;
    const away = match.team2.teamName;

    if (!teamCache[home]) teamCache[home] = { name: home, matches: [], id: match.team1.teamId };
    if (!teamCache[away]) teamCache[away] = { name: away, matches: [], id: match.team2.teamId };

    const isFinished = match.matchIsFinished;

    if (isFinished) {
      const homeGoals = match.matchResults.find(r => r.resultTypeID === 2)?.pointsTeam1 || 0;
      const awayGoals = match.matchResults.find(r => r.resultTypeID === 2)?.pointsTeam2 || 0;

      teamCache[home].matches.push({
        opponent: away,
        goalsFor: homeGoals,
        goalsAgainst: awayGoals,
        result: homeGoals > awayGoals ? 'W' : homeGoals < awayGoals ? 'L' : 'D',
        date: match.matchDateTimeUTC,
        competition: match.leagueName
      });

      teamCache[away].matches.push({
        opponent: home,
        goalsFor: awayGoals,
        goalsAgainst: homeGoals,
        result: awayGoals > homeGoals ? 'W' : awayGoals < homeGoals ? 'L' : 'D',
        date: match.matchDateTimeUTC,
        competition: match.leagueName
      });
    }
  });
}

function setupSearch(inputId, suggestionsId, teamNum) {
  const input = document.getElementById(inputId);
  const suggestions = document.getElementById(suggestionsId);

  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();

    if (query.length < 2) {
      suggestions.classList.remove('active');
      suggestions.innerHTML = '';
      return;
    }

    const matches = Object.values(teamCache)
      .filter(t => t.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.toLowerCase().indexOf(query) - b.name.toLowerCase().indexOf(query))
      .slice(0, 10);

    suggestions.innerHTML = '';

    if (matches.length === 0) {
      suggestions.innerHTML = '<div class="suggestion-item">No teams found</div>';
      suggestions.classList.add('active');
      return;
    }

    matches.forEach(team => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.textContent = team.name;
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
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
    setTimeout(() => suggestions.classList.remove('active'), 300);
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
    const stats1 = calculateStats(selectedTeam1);
    const stats2 = calculateStats(selectedTeam2);

    displayResults(stats1, stats2);
  } catch (err) {
    showError('Failed to calculate stats.');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

function calculateStats(team) {
  const recentMatches = team.matches.slice(0, 10);

  const goalsScored = recentMatches.map(m => m.goalsFor);
  const goalsConceded = recentMatches.map(m => m.goalsAgainst);

  const avgScored = goalsScored.length > 0
    ? goalsScored.reduce((a, b) => a + b, 0) / goalsScored.length
    : 0;

  const avgConceded = goalsConceded.length > 0
    ? goalsConceded.reduce((a, b) => a + b, 0) / goalsConceded.length
    : 0;

  const wins = recentMatches.filter(m => m.result === 'W').length;
  const winRate = recentMatches.length > 0 ? (wins / recentMatches.length) * 100 : 0;

  const topScorer = getTopScorer(team);

  return {
    name: team.name,
    matches: recentMatches,
    form: recentMatches.slice(0, 5).map(m => m.result),
    avgScored: round(avgScored, 2),
    avgConceded: round(avgConceded, 2),
    matchesPlayed: recentMatches.length,
    winRate: round(winRate, 1),
    topScorer
  };
}

function getTopScorer(team) {
  const goals = {};

  team.matches.forEach(match => {
    const fullMatch = allMatches.find(m =>
      (m.team1.teamName === team.name && m.team2.teamName === match.opponent) ||
      (m.team2.teamName === team.name && m.team1.teamName === match.opponent)
    );

    if (!fullMatch || !fullMatch.goals) return;

    const isHome = fullMatch.team1.teamName === team.name;

    fullMatch.goals.forEach(g => {
      if (!g.goalGetterName) return;
      if (isHome && g.scoreTeam1 === g.scoreTeam2 + 1) {
        goals[g.goalGetterName] = (goals[g.goalGetterName] || 0) + 1;
      } else if (!isHome && g.scoreTeam2 === g.scoreTeam1 + 1) {
        goals[g.goalGetterName] = (goals[g.goalGetterName] || 0) + 1;
      }
    });
  });

  const sorted = Object.entries(goals).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    return `${sorted[0][0]} (${sorted[0][1]} goals)`;
  }

  return 'N/A';
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

  const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
  const poisson = (lambda, k) => (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);

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

  return {
    homeGoals: Math.min(Math.round(lambda1), 5),
    awayGoals: Math.min(Math.round(lambda2), 5),
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
