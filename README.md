# Gather

Gather is a static browser app backed by a Flask API and Supabase. Deploy the
Flask backend to Render and the static `frontend/app` directory to Vercel.

## Run locally

1. Copy `.env.example` to `backend/.env` and set your Supabase values.
2. Create and activate a virtual environment, then run `pip install -r requirements.txt`.
3. From the repository root, run `./run-local.ps1`. It starts Flask and bypasses a stale local proxy for this session only.
4. Open `http://127.0.0.1:5000/app/`.

## Deploy the frontend to Vercel

1. Import this repository into Vercel (the repository root must be the project root).
2. Deploy. `vercel.json` serves `frontend/app` as the site; no Vercel environment variables are needed.
3. Open the deployed site, select **Configure account**, and enter your Render backend URL as the API base URL (for example, `https://your-api.onrender.com`).

## Deploy the backend to Render

1. Create a Render Web Service using `backend` as the root directory.
2. Use build command `pip install -r requirements.txt` and start command `gunicorn app:app`.
3. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `CORS_ORIGINS`. Set `CORS_ORIGINS` to your Vercel URL, such as `https://your-project.vercel.app`.
