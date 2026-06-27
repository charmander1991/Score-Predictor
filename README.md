# FIFA Stats Predictor

A static web app that fetches live football stats to help predict match scores. Runs entirely on GitHub Pages.

## Features

- Search any team (World Cup 2026 + club leagues)
- View recent form, avg goals, win rate, top scorer
- Poisson-based score prediction with win probabilities
- Clean, minimal dark theme
- Fully responsive
- No API key needed

## How It Works

1. App loads match data from OpenLigaDB API on page load
2. User searches and selects two teams
3. App calculates stats from match data
4. Calculates predicted score using Poisson distribution
5. Displays comparison + probabilities

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings > Pages**
3. Set source to `main` branch, `/ (root)`
4. Your site will be live at `https://<username>.github.io/<repo>/`

## Local Development

Open `index.html` in a browser, or run:

```bash
npx serve .
```

## Data Sources

- **OpenLigaDB API** (api.openligadb.de) — free, CORS-enabled
- World Cup 2026
- Bundesliga 2025/2026
- Champions League 2025/2026
- Club World Cup 2025

## Tech Stack

- Vanilla HTML/CSS/JS
- OpenLigaDB API
- Prediction model: Poisson distribution
