# StenoPro Integrated Full-Stack Starter

This build connects the Student Dashboard + Admin MP3 UI to the Express/SQLite backend.

## Features
- Student registration/login with bcrypt password hashing
- Admin role with protected MP3 upload/delete
- SQLite database for users, dictations and results
- Server-side scoring and WPM calculation
- Authenticated MP3 playback
- Student dashboard, dictation library, mock tests and history
- Admin dictation manager

## Run locally
1. Install Node.js 18+.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and change `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

The default admin values from `.env.example` are for development only. Change them before any real deployment.

## Production next step
Use PostgreSQL (or another managed SQL database), object storage such as S3-compatible storage for MP3s, HTTPS, secure environment secrets, rate limiting, and a managed hosting service.


## Production deployment

### Option A — Render
1. Put this project in a GitHub repository.
2. In Render, create a new Blueprint and select the repository.
3. Render will read `render.yaml`.
4. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `FRONTEND_ORIGIN` in the Render dashboard.
5. Deploy and open the generated HTTPS URL.
6. Visit `/health` to confirm the server is running.

The included persistent disk keeps the SQLite database and uploaded MP3 files across normal service restarts. For a larger production site, migrate to PostgreSQL + S3-compatible object storage.

### Option B — Docker
```bash
cp .env.example .env
# Edit .env and set all secrets
docker compose up -d --build
```

### Important
- Never commit `.env`.
- Use a strong unique `JWT_SECRET`.
- Change the default/demo admin credentials before deployment.
- HTTPS should be used in production.
- The current SQLite + local uploads setup is suitable for a small deployment. For many concurrent students, use PostgreSQL and object storage.
