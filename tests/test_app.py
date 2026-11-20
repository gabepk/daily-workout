import tempfile
import unittest
from pathlib import Path

from app import DEFAULT_USERS, create_app


class WorkoutAppTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database = Path(self.temp_dir.name) / "test.db"
        self.app = create_app(database)
        self.app.config.update(TESTING=True)
        self.client = self.app.test_client()
        self.today = "2026-11-19"

    def tearDown(self):
        self.temp_dir.cleanup()

    def users(self):
        response = self.client.get(f"/api/users?date={self.today}")
        self.assertEqual(response.status_code, 200)
        return response.get_json()["users"]

    def test_seeded_household(self):
        users = self.users()
        self.assertEqual(len(users), len(DEFAULT_USERS))
        self.assertEqual(users[0]["name"], DEFAULT_USERS[0][0])
        self.assertEqual(users[0]["exercise_count"], 0)

    def test_user_crud(self):
        response = self.client.post(
            "/api/users",
            json={"name": "Gabriella", "emoji": "🌻", "color": "#afd6ff"},
        )
        self.assertEqual(response.status_code, 201)
        user = response.get_json()["user"]
        self.assertEqual(user["name"], "Gabriella")

        response = self.client.put(
            f"/api/users/{user['id']}",
            json={"name": "Gabi", "color": "#ffd0a8"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["user"]["name"], "Gabi")

        response = self.client.delete(f"/api/users/{user['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(
            user["id"], [existing_user["id"] for existing_user in self.users()]
        )

    def test_exercise_crud_and_completion(self):
        user_id = self.users()[0]["id"]
        response = self.client.post(
            f"/api/users/{user_id}/exercises",
            json={"name": "Push-ups", "target": "3 sets of 10"},
        )
        self.assertEqual(response.status_code, 201)
        exercise = response.get_json()["exercise"]

        response = self.client.put(
            f"/api/exercises/{exercise['id']}",
            json={"name": "Incline push-ups", "target": "3 sets of 12"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["exercise"]["name"], "Incline push-ups"
        )

        response = self.client.put(
            f"/api/exercises/{exercise['id']}/completion",
            json={"date": self.today, "completed": True},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["done"], 1)

        # Checking the same exercise and date twice stays idempotent.
        response = self.client.put(
            f"/api/exercises/{exercise['id']}/completion",
            json={"date": self.today, "completed": True},
        )
        self.assertEqual(response.get_json()["done"], 1)

        response = self.client.get(f"/api/users/{user_id}?date={self.today}")
        dashboard = response.get_json()
        self.assertEqual(dashboard["today"]["done"], 1)
        self.assertEqual(dashboard["today"]["percent"], 100)
        self.assertEqual(dashboard["stats"]["current_streak"], 1)
        self.assertEqual(dashboard["stats"]["active_days"], 1)
        self.assertEqual(dashboard["history"]["days"][-1]["done"], 1)
        self.assertGreaterEqual(len(dashboard["history"]["days"]), 360)

        response = self.client.put(
            f"/api/exercises/{exercise['id']}/completion",
            json={"date": self.today, "completed": False},
        )
        self.assertEqual(response.get_json()["done"], 0)

        response = self.client.delete(f"/api/exercises/{exercise['id']}")
        self.assertEqual(response.status_code, 200)
        dashboard = self.client.get(
            f"/api/users/{user_id}?date={self.today}"
        ).get_json()
        self.assertEqual(dashboard["exercises"], [])

    def test_deleting_a_user_cascades(self):
        user_id = self.client.post(
            "/api/users", json={"name": "Cascade"}
        ).get_json()["user"]["id"]
        exercise = self.client.post(
            f"/api/users/{user_id}/exercises",
            json={"name": "Squats"},
        ).get_json()["exercise"]
        self.client.put(
            f"/api/exercises/{exercise['id']}/completion",
            json={"date": self.today, "completed": True},
        )

        self.client.delete(f"/api/users/{user_id}")
        response = self.client.get(f"/api/users/{user_id}?date={self.today}")
        self.assertEqual(response.status_code, 404)

    def test_validation_and_fallbacks(self):
        response = self.client.post("/api/users", json={"name": "   "})
        self.assertEqual(response.status_code, 400)

        user_id = self.users()[0]["id"]
        response = self.client.post(
            f"/api/users/{user_id}/exercises", json={"name": ""}
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.put(
            "/api/exercises/999/completion",
            json={"date": self.today, "completed": True},
        )
        self.assertEqual(response.status_code, 404)

        # Invalid optional dates fall back to today instead of breaking the page.
        response = self.client.get("/api/users?date=not-a-date")
        self.assertEqual(response.status_code, 200)
        self.assertRegex(response.get_json()["date"], r"^\d{4}-\d{2}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
