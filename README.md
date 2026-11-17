# Broke & Hungry

A mobile-optimized web app that helps broke college students in NYC either cook with what they've got or find a cheap place to eat nearby.

**Live app:** [brokeandhungry.onrender.com](https://brokeandhungry.onrender.com)

## What it does

- **Cook Something** — list the ingredients in your fridge and a difficulty level, and an LLM generates a recipe (name, cook time, ingredients, step-by-step instructions) using only what you have, plus an estimated cost per serving compared to eating out. Don't like it? Get a different recipe from the same ingredients in one tap.
- **Find Something** — uses your GPS location to find the closest cheap restaurants via Google Places, showing only places open right now, with a budget slider and cuisine filters.

## Tech stack

- **Backend:** Python + Flask (`app.py`)
- **Frontend:** Single-page app — one HTML file (`templates/home.html`), one CSS file (`static/style.css`), one JS file (`static/app.js`), no framework
- **Recipe generation:** [Groq API](https://groq.com/) (`openai/gpt-oss-120b`), returns structured JSON
- **Restaurant data:** Google Places API (Nearby Search)
- **Deployment:** Render

## Running locally

1. Clone the repo and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Create a `.env` file in the project root with your API keys:
   ```
   GROQ_API_KEY=your_groq_key
   GOOGLE_API_KEY=your_google_places_key
   ```
3. Start the server:
   ```bash
   python app.py
   ```
4. Open `http://localhost:8080`.

## Project structure

```
app.py                  Flask routes (/, /recipe, /restaurants)
templates/home.html     All 5 screens of the single-page app
static/app.js           Screen navigation, state, and API calls
static/style.css        Design system and layout
```
