# Gather

Gather is a static browser app backed by a Flask API and Supabase. On Vercel,
the frontend and API are served from the same deployment, so the frontend uses
relative `/api/...` requests automatically.

## Run locally

1. Copy `.env.example` to `backend/.env` and set your Supabase values.
2. Create and activate a virtual environment, then run `pip install -r requirements.txt`.
3. From the repository root, run `./run-local.ps1`. It starts Flask and bypasses a stale local proxy for this session only.
4. Open `http://127.0.0.1:5000/app/`.

## Deploy to Vercel

1. Import this repository into Vercel (the repository root must be the project root).
2. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in **Project Settings → Environment Variables** for Production, Preview, and Development as appropriate.
3. Deploy. Vercel serves `frontend/app` as the site and sends API requests to the Flask serverless function in `api/index.py`.

Do not set an API base URL in the web app after deployment: leave it blank so it calls the same Vercel domain.
