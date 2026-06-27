# FIFA Stats Predictor

A static web app that scrapes live football stats to help predict match scores. Runs entirely on GitHub Pages.

## Features

- Search 150+ teams (club leagues + World Cup nations)
- View recent form, avg goals, win rate, top scorer
- Poisson-based score prediction with win probabilities
- Clean, minimal dark theme
- Fully responsive

## How It Works

1. User searches and selects two teams
2. App scrapes worldfootball.net via CORS proxy
3. Parses recent matches, goals, and top scorers
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

## Limitations

- CORS proxy (allorigins.win) may be slow or rate-limited
- Site structure changes could break parsing
- No live/in-progress match data

## Tech Stack

- Vanilla HTML/CSS/JS
- CORS proxy: allorigins.win
- Data source: worldfootball.net
- Prediction model: Poisson distribution
