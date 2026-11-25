# Gather frontend

The frontend in `app/` is a Vite single-page client for the Flask API in `../backend/app.py`.

## Vite development

From `frontend/`, run `npm install` once and then `npm run dev`. Vite serves the
app from `app/` and proxies `/api` requests to `http://127.0.0.1:5000` by default.
Set `VITE_API_PROXY_TARGET` to point the development proxy to a different API.

Run `npm run build` to produce the deployable `dist/` directory, or `npm run preview`
to check that build locally.

## Run it with the backend

1. Set the backend environment variables required by `backend/app.py` (`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`).
2. From `backend/`, run `flask --app app run --debug`.
3. In another terminal, from `frontend/`, run `npm run dev` and open the displayed URL.

The account chip lets a user enter their UUID (and, if needed, a separate organizer UUID). Those values are stored in browser local storage because the current backend accepts IDs but has no authentication/session endpoint.

## API mapping

| Screen | API calls |
| --- | --- |
| Events | `GET /api/events`, `GET /api/events/<id>` |
| Event detail / register | `GET /api/events/<id>`, `POST /api/registrations` |
| My registrations | `GET /api/me/registrations?user_id=…` |
| Organizer dashboard / attendees | `GET /api/events`, `GET /api/events/<id>/registrations?organizer_id=…` |

The design does not add an event-creation control because the backend does not currently expose a create-event endpoint.
