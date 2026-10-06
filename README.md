# Ewise – Daily Time Tracking Form

Static HTML/CSS/JS version of the monday Vibe app. No build step.

## Setup
Edit `js/config.js`:
- `TIME_TRACKING_BOARD_ID`, `PROJECTS_BOARD_ID` – from the board URLs.
- `MONDAY_TOKEN` – leave empty (recommended) so each user pastes their own token once; it's kept in their browser only. A token committed here is publicly visible.
- `COLUMNS` – optional; columns are auto-detected by type/title if left empty.

## Deploy to GitHub Pages
Push the contents of this folder to a repo, then Settings → Pages → Deploy from branch → `main` / root.

## Local preview
`npx serve .` (or any static server — ES modules don't load from `file://`).
