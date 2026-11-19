from __future__ import annotations

import os
import re
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from flask import Flask, current_app, g, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = BASE_DIR / "workout.db"
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_USERS = [
    ("Test", "🌿", "#D8F26A"),
]


def create_app(database_path: str | Path | None = None) -> Flask:
    app = Flask(__name__)
    app.config["DATABASE"] = str(
        database_path or os.environ.get("WORKOUT_DB", DEFAULT_DB)
    )
    app.json.sort_keys = False

    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()
        seed_default_users()

    register_routes(app)
    return app


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(current_app.config["DATABASE"])
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        g.db = connection
    return g.db


def close_db(_error: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    connection = get_db()
    schema = (BASE_DIR / "schema.sql").read_text(encoding="utf-8")
    connection.executescript(schema)
    connection.commit()


def seed_default_users() -> None:
    connection = get_db()
    (count,) = connection.execute("SELECT COUNT(*) FROM users").fetchone()
    if count:
        return
    connection.executemany(
        "INSERT INTO users (name, emoji, color) VALUES (?, ?, ?)",
        DEFAULT_USERS,
    )
    connection.commit()


def register_routes(app: Flask) -> None:
    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/users")
    def list_users():
        selected_date = request_date(request.args.get("date"))
        rows = get_db().execute(
            """
            SELECT
                u.id,
                u.name,
                u.emoji,
                u.color,
                u.created_at,
                COUNT(DISTINCT e.id) AS exercise_count,
                SUM(CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END) AS done_count
            FROM users u
            LEFT JOIN exercises e ON e.user_id = u.id
            LEFT JOIN completions c
                ON c.exercise_id = e.id AND c.completed_on = ?
            GROUP BY u.id
            ORDER BY u.id
            """,
            (selected_date,),
        ).fetchall()
        users = []
        for row in rows:
            user = dict(row)
            user["done_count"] = user["done_count"] or 0
            users.append(user)
        return jsonify({"date": selected_date, "users": users})

    @app.post("/api/users")
    def create_user():
        data = json_payload()
        name = clean_name(data.get("name"))
        emoji = clean_emoji(data.get("emoji"))
        color = clean_color(data.get("color"))
        if not name:
            return api_error("Please give this person a name.")
        connection = get_db()
        cursor = connection.execute(
            "INSERT INTO users (name, emoji, color) VALUES (?, ?, ?)",
            (name, emoji, color),
        )
        connection.commit()
        user = fetch_user(cursor.lastrowid)
        return jsonify({"user": user}), 201

    @app.put("/api/users/<int:user_id>")
    def update_user(user_id: int):
        user = fetch_user(user_id)
        if user is None:
            return api_error("Person not found.", 404)

        data = json_payload()
        fields: list[str] = []
        values: list[object] = []

        if "name" in data:
            name = clean_name(data.get("name"))
            if not name:
                return api_error("Please give this person a name.")
            fields.append("name = ?")
            values.append(name)
        if "emoji" in data:
            fields.append("emoji = ?")
            values.append(clean_emoji(data.get("emoji")))
        if "color" in data:
            fields.append("color = ?")
            values.append(clean_color(data.get("color")))
        if not fields:
            return api_error("Nothing to update.")

        values.append(user_id)
        connection = get_db()
        connection.execute(
            f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values
        )
        connection.commit()
        return jsonify({"user": fetch_user(user_id)})

    @app.delete("/api/users/<int:user_id>")
    def delete_user(user_id: int):
        if fetch_user(user_id) is None:
            return api_error("Person not found.", 404)
        connection = get_db()
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        connection.commit()
        return jsonify({"deleted": user_id})

    @app.get("/api/users/<int:user_id>")
    def user_dashboard(user_id: int):
        user = fetch_user(user_id)
        if user is None:
            return api_error("Person not found.", 404)

        selected_date = request_date(request.args.get("date"))
        connection = get_db()
        exercises = [
            dict(row)
            for row in connection.execute(
                """
                SELECT
                    e.id,
                    e.name,
                    e.target,
                    e.sort_order,
                    CASE WHEN c.id IS NULL THEN 0 ELSE 1 END AS done
                FROM exercises e
                LEFT JOIN completions c
                    ON c.exercise_id = e.id AND c.completed_on = ?
                WHERE e.user_id = ?
                ORDER BY e.sort_order, e.id
                """,
                (selected_date, user_id),
            ).fetchall()
        ]
        for exercise in exercises:
            exercise["done"] = bool(exercise["done"])

        history_start = history_range_start(selected_date)
        history = build_history(
            connection, user_id, history_start, selected_date, len(exercises)
        )
        stats = build_stats(connection, user_id, selected_date, len(exercises))

        today_done = sum(1 for exercise in exercises if exercise["done"])
        return jsonify(
            {
                "user": user,
                "date": selected_date,
                "today": {
                    "total": len(exercises),
                    "done": today_done,
                    "percent": round(today_done / len(exercises) * 100)
                    if exercises
                    else 0,
                },
                "exercises": exercises,
                "history": {
                    "start": history_start,
                    "end": selected_date,
                    "days": history,
                },
                "stats": stats,
            }
        )

    @app.post("/api/users/<int:user_id>/exercises")
    def create_exercise(user_id: int):
        if fetch_user(user_id) is None:
            return api_error("Person not found.", 404)
        data = json_payload()
        name = clean_name(data.get("name"), max_length=80)
        target = clean_target(data.get("target"))
        if not name:
            return api_error("Please name the exercise.")

        connection = get_db()
        (next_order,) = connection.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM exercises WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        cursor = connection.execute(
            """
            INSERT INTO exercises (user_id, name, target, sort_order)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, name, target, next_order),
        )
        connection.commit()
        exercise = fetch_exercise(cursor.lastrowid)
        return jsonify({"exercise": exercise}), 201

    @app.put("/api/exercises/<int:exercise_id>")
    def update_exercise(exercise_id: int):
        exercise = fetch_exercise(exercise_id)
        if exercise is None:
            return api_error("Exercise not found.", 404)

        data = json_payload()
        fields: list[str] = []
        values: list[object] = []

        if "name" in data:
            name = clean_name(data.get("name"), max_length=80)
            if not name:
                return api_error("Please name the exercise.")
            fields.append("name = ?")
            values.append(name)
        if "target" in data:
            fields.append("target = ?")
            values.append(clean_target(data.get("target")))
        if not fields:
            return api_error("Nothing to update.")

        values.append(exercise_id)
        connection = get_db()
        connection.execute(
            f"UPDATE exercises SET {', '.join(fields)} WHERE id = ?", values
        )
        connection.commit()
        return jsonify({"exercise": fetch_exercise(exercise_id)})

    @app.delete("/api/exercises/<int:exercise_id>")
    def delete_exercise(exercise_id: int):
        if fetch_exercise(exercise_id) is None:
            return api_error("Exercise not found.", 404)
        connection = get_db()
        connection.execute("DELETE FROM exercises WHERE id = ?", (exercise_id,))
        connection.commit()
        return jsonify({"deleted": exercise_id})

    @app.put("/api/exercises/<int:exercise_id>/completion")
    def set_completion(exercise_id: int):
        exercise = fetch_exercise(exercise_id)
        if exercise is None:
            return api_error("Exercise not found.", 404)

        data = json_payload()
        completed_on = parse_date(data.get("date"), required=True)
        if completed_on is None:
            return api_error("A valid date is required.")

        completed = bool(data.get("completed"))
        connection = get_db()
        if completed:
            connection.execute(
                """
                INSERT INTO completions (exercise_id, completed_on)
                VALUES (?, ?)
                ON CONFLICT(exercise_id, completed_on) DO NOTHING
                """,
                (exercise_id, completed_on),
            )
        else:
            connection.execute(
                "DELETE FROM completions WHERE exercise_id = ? AND completed_on = ?",
                (exercise_id, completed_on),
            )
        connection.commit()

        (done_count,) = connection.execute(
            """
            SELECT COUNT(*)
            FROM completions c
            JOIN exercises e ON e.id = c.exercise_id
            WHERE e.user_id = ? AND c.completed_on = ?
            """,
            (exercise["user_id"], completed_on),
        ).fetchone()
        (total,) = connection.execute(
            "SELECT COUNT(*) FROM exercises WHERE user_id = ?",
            (exercise["user_id"],),
        ).fetchone()
        return jsonify(
            {
                "exercise_id": exercise_id,
                "date": completed_on,
                "completed": completed,
                "done": done_count,
                "total": total,
            }
        )

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found."}), 404
        return render_template("index.html"), 404


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def json_payload() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def clean_name(value: object, max_length: int = 60) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:max_length]


def clean_emoji(value: object) -> str:
    if not isinstance(value, str):
        return "🙂"
    cleaned = value.strip()[:8]
    return cleaned or "🙂"


def clean_color(value: object) -> str:
    if isinstance(value, str) and COLOR_RE.fullmatch(value.strip()):
        return value.strip().lower()
    return "#FFE5B4"


def clean_target(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:80]


def parse_date(value: object, required: bool = False) -> str | None:
    if value is None:
        return None if required else date.today().isoformat()
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None
    return parsed.isoformat()


def request_date(value: object) -> str:
    return parse_date(value) or date.today().isoformat()


def api_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def fetch_user(user_id: int) -> dict | None:
    row = get_db().execute(
        "SELECT id, name, emoji, color, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def fetch_exercise(exercise_id: int) -> dict | None:
    row = get_db().execute(
        """
        SELECT id, user_id, name, target, sort_order, created_at
        FROM exercises
        WHERE id = ?
        """,
        (exercise_id,),
    ).fetchone()
    return dict(row) if row else None


def history_range_start(today: str) -> str:
    end = date.fromisoformat(today)
    return (end - timedelta(days=end.weekday() + 7 * 51)).isoformat()


def build_history(
    connection: sqlite3.Connection,
    user_id: int,
    start: str,
    end: str,
    exercise_count: int,
) -> list[dict]:
    rows = connection.execute(
        """
        SELECT c.completed_on AS day, COUNT(*) AS done
        FROM completions c
        JOIN exercises e ON e.id = c.exercise_id
        WHERE e.user_id = ? AND c.completed_on BETWEEN ? AND ?
        GROUP BY c.completed_on
        """,
        (user_id, start, end),
    ).fetchall()
    done_by_day = {row["day"]: row["done"] for row in rows}

    days = []
    cursor = date.fromisoformat(start)
    final_day = date.fromisoformat(end)
    while cursor <= final_day:
        iso = cursor.isoformat()
        done = done_by_day.get(iso, 0)
        days.append(
            {
                "date": iso,
                "done": done,
                "total": exercise_count,
                "percent": round(done / exercise_count * 100)
                if exercise_count
                else 0,
            }
        )
        cursor += timedelta(days=1)
    return days


def build_stats(
    connection: sqlite3.Connection,
    user_id: int,
    today: str,
    exercise_count: int,
) -> dict:
    rows = connection.execute(
        """
        SELECT DISTINCT c.completed_on AS day
        FROM completions c
        JOIN exercises e ON e.id = c.exercise_id
        WHERE e.user_id = ?
        ORDER BY c.completed_on
        """,
        (user_id,),
    ).fetchall()
    active_dates = {date.fromisoformat(row["day"]) for row in rows}

    today_date = date.fromisoformat(today)
    streak_end = today_date if today_date in active_dates else today_date - timedelta(days=1)
    current_streak = 0
    cursor = streak_end
    while cursor in active_dates:
        current_streak += 1
        cursor -= timedelta(days=1)

    best_streak = 0
    running = 0
    previous: date | None = None
    for active_day in sorted(active_dates):
        if previous is not None and active_day - previous == timedelta(days=1):
            running += 1
        else:
            running = 1
        best_streak = max(best_streak, running)
        previous = active_day

    thirty_days_ago = today_date - timedelta(days=29)
    (thirty_day_completions,) = connection.execute(
        """
        SELECT COUNT(*)
        FROM completions c
        JOIN exercises e ON e.id = c.exercise_id
        WHERE e.user_id = ? AND c.completed_on BETWEEN ? AND ?
        """,
        (user_id, thirty_days_ago.isoformat(), today),
    ).fetchone()
    possible_completions = 30 * exercise_count
    completion_rate = (
        round(thirty_day_completions / possible_completions * 100)
        if possible_completions
        else 0
    )

    return {
        "current_streak": current_streak,
        "best_streak": best_streak,
        "active_days": len(active_dates),
        "completion_rate_30": min(completion_rate, 100),
    }


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=True)
