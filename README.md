# Daily Movement

A small, local workout tracker for the whole household. Everyone gets their own daily exercise set, check-offs are tracked per day, and each person has a 12-month history view.

## Features

- Add, edit and remove people
- Add, edit and remove exercises for each person
- Check off today's exercises independently
- Automatic progress ring and daily summary
- History for each person: current streak, best streak, active days, 30-day rate, a 14-day chart and a 52-week heatmap
- Data stored locally in SQLite (`workout.db`)
- Responsive layout for desktop and mobile


## Run it

A virtual environment already exists in this folder. From the project root:

```bash
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Then open <http://127.0.0.1:5000>.

The SQLite database is created automatically on first run.

## Tests

```bash
source .venv/bin/activate
python -m unittest discover -s tests -v
```

## Project structure

```
app.py                  Flask app and JSON API
schema.sql              SQLite schema
templates/index.html    App shell and dialogs
static/css/styles.css   Styling
static/js/app.js        Frontend behaviour
tests/test_app.py       API tests
workout.db              Created on first run (ignored by git)
```

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/users?date=YYYY-MM-DD` | List people with today's progress |
| `POST` | `/api/users` | Create a person |
| `PUT` | `/api/users/<id>` | Update a person |
| `DELETE` | `/api/users/<id>` | Delete a person and their data |
| `GET` | `/api/users/<id>?date=YYYY-MM-DD` | Person dashboard, exercises, history and stats |
| `POST` | `/api/users/<id>/exercises` | Create an exercise |
| `PUT` | `/api/exercises/<id>` | Update an exercise |
| `DELETE` | `/api/exercises/<id>` | Delete an exercise and its history |
| `PUT` | `/api/exercises/<id>/completion` | Set a check-off (`date`, `completed`) |
