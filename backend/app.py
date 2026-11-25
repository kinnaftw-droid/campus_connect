import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from postgrest import APIError
from supabase import Client, create_client

load_dotenv()

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "app"
app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="/app")

# Set CORS_ORIGINS on Render to your Vercel URL (or a comma-separated list of
# allowed origins). The permissive local default keeps browser development easy.
cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]
CORS(app, resources={r"/api/*": {"origins": cors_origins}})

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
if not supabase_url or not supabase_key:
    raise RuntimeError(
        "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the environment."
    )

supabase: Client = create_client(supabase_url, supabase_key)


def error_response(message, status):
    return jsonify({"error": message}), status


def parse_uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def get_json_object():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


@app.get("/")
def index():
    return jsonify({"message": "Events API", "endpoints": [
        "GET /api/events",
        "GET /api/events/<id>",
        "POST /api/registrations",
        "GET /api/me/registrations?user_id=<uuid>",
        "GET /api/events/<id>/registrations?organizer_id=<uuid>",
    ]})


@app.get("/app/")
def frontend():
    """Serve the Gather SPA from the same origin as the API."""
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/events")
def list_events():
    try:
        response = (
            supabase.table("events")
            .select("id,organizer_id,title,capacity,status")
            .execute()
        )
        return jsonify(response.data), 200
    except APIError:
        app.logger.exception("Failed to load events")
        return error_response("Unable to load events.", 500)


@app.get("/api/events/<event_id>")
def get_event(event_id):
    event_id = parse_uuid(event_id)
    if event_id is None:
        return error_response("event id must be a valid UUID.", 400)

    try:
        response = (
            supabase.table("events")
            .select("id,organizer_id,title,capacity,status")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return error_response("Event not found.", 404)
        return jsonify(response.data[0]), 200
    except APIError:
        app.logger.exception("Failed to load event")
        return error_response("Unable to load event.", 500)


@app.post("/api/registrations")
def create_registration():
    data = get_json_object()
    if data is None:
        return error_response("A JSON object is required.", 400)

    user_id = parse_uuid(data.get("user_id"))
    event_id = parse_uuid(data.get("event_id"))
    if user_id is None or event_id is None:
        return error_response("user_id and event_id must be valid UUIDs.", 400)

    try:
        event_response = (
            supabase.table("events")
            .select("id,capacity")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        if not event_response.data:
            return error_response("Event not found.", 404)

        user_response = (
            supabase.table("users")
            .select("id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if not user_response.data:
            return error_response("User not found.", 404)

        registration_count = (
            supabase.table("registrations")
            .select("id", count="exact")
            .eq("event_id", event_id)
            .execute()
        )
        capacity = event_response.data[0].get("capacity")
        if capacity is not None and registration_count.count >= capacity:
            return error_response("Event is full.", 409)

        response = (
            supabase.table("registrations")
            .insert({"user_id": user_id, "event_id": event_id})
            .execute()
        )
        if not response.data:
            return error_response("Registration was not created.", 500)
        return jsonify(response.data[0]), 201
    except APIError as error:
        if getattr(error, "code", None) == "23505":
            return error_response("User is already registered for this event.", 409)
        app.logger.exception("Failed to create registration")
        return error_response("Unable to create registration.", 500)


@app.get("/api/me/registrations")
def list_user_registrations():
    user_id = parse_uuid(request.args.get("user_id"))
    if user_id is None:
        return error_response("A valid user_id query parameter is required.", 400)

    try:
        user_response = (
            supabase.table("users")
            .select("id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if not user_response.data:
            return error_response("User not found.", 404)

        response = (
            supabase.table("registrations")
            .select(
                "id,user_id,event_id,created_at,"
                "event:events(id,organizer_id,title,capacity,status)"
            )
            .eq("user_id", user_id)
            .execute()
        )
        return jsonify(response.data), 200
    except APIError:
        app.logger.exception("Failed to load user registrations")
        return error_response("Unable to load registrations.", 500)


@app.get("/api/events/<event_id>/registrations")
def list_event_registrations(event_id):
    event_id = parse_uuid(event_id)
    organizer_id = parse_uuid(request.args.get("organizer_id"))
    if event_id is None:
        return error_response("event id must be a valid UUID.", 400)
    if organizer_id is None:
        return error_response(
            "A valid organizer_id query parameter is required.", 400
        )

    try:
        event_response = (
            supabase.table("events")
            .select("id,organizer_id")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        if not event_response.data:
            return error_response("Event not found.", 404)
        if event_response.data[0]["organizer_id"] != organizer_id:
            return error_response("Organizer does not own this event.", 403)

        response = (
            supabase.table("registrations")
            .select("id,user_id,event_id,created_at,user:users(id,email,role)")
            .eq("event_id", event_id)
            .execute()
        )
        return jsonify(response.data), 200
    except APIError:
        app.logger.exception("Failed to load event registrations")
        return error_response("Unable to load registrations.", 500)


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
