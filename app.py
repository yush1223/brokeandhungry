from flask import Flask, request, render_template
from dotenv import load_dotenv
from groq import Groq
import os
import json
import math
import requests

load_dotenv()

api_key = os.getenv("GROQ_API_KEY") #api key from .env file
google_api_key = os.getenv("GOOGLE_API_KEY")
client = Groq(api_key=api_key)
app = Flask(__name__)

@app.route("/")
def home():
    return render_template("home.html") #loads html


MAX_INGREDIENTS = 15


def recipe_prompt(ingredients, difficulty, exclude):
    prompt = (
        "I have these ingredients: " + ", ".join(ingredients) + ". "
        "Give me one " + difficulty + "-level recipe that uses them as the main ingredients. "
        "You can assume I have basic pantry staples like salt, pepper, oil, butter, and common dried spices. "
        "Do not add any other main ingredients I haven't listed. "
    )
    if exclude:
        prompt += "I've already seen these recipes, so suggest something different: " + ", ".join(exclude) + ". "
    prompt += (
        "Estimate the cost per serving in US dollars at typical US grocery store prices, counting only "
        "the amount of each ingredient the recipe actually uses (not whole packages); pantry staples cost about nothing. "
        "IMPORTANT: If the ingredients cannot realistically make a proper meal a person would actually eat, "
        "respond with this JSON: {\"error\": \"These ingredients don't work together\", \"suggestion\": \"try adding X\"}, "
        "replacing X with the one cheap ingredient that would best turn what I have into a real meal. "
        "Otherwise respond with ONLY a JSON object in this exact format: "
        "{\"name\": \"Recipe Name\", \"cook_time\": \"X mins\", \"difficulty\": \"" + difficulty + "\", "
        "\"servings\": 2, \"cost_per_serving\": 1.75, "
        "\"ingredients\": [\"2 eggs\", \"1 cup rice\"], \"steps\": [\"step 1\", \"step 2\", \"step 3\"]}"
    )
    return prompt


@app.route("/recipe")
def recipe():
    ingredients = [i.strip()[:40] for i in request.args.get("ingredients", "").split(",") if i.strip()]
    difficulty = request.args.get("difficulty")
    # names of recipes already shown for these ingredients, for "try another"
    exclude = [n.strip()[:80] for n in request.args.get("exclude", "").split("|") if n.strip()][:10]

    if not ingredients or difficulty not in ("beginner", "intermediate"):
        return {"error": "Missing ingredients or difficulty", "suggestion": "add at least one ingredient"}, 400

    try:
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": recipe_prompt(ingredients[:MAX_INGREDIENTS], difficulty, exclude)}],
            model="openai/gpt-oss-120b",
            # json mode: the model can't wrap the answer in extra text that breaks parsing
            response_format={"type": "json_object"},
        )
        recipe_data = json.loads(chat_completion.choices[0].message.content)
    except Exception:
        return {"error": "Couldn't generate a recipe right now", "suggestion": "try again in a moment"}, 502

    if "error" in recipe_data:
        return {"error": recipe_data["error"], "suggestion": recipe_data.get("suggestion", "")}, 422

    if not recipe_data.get("name") or not isinstance(recipe_data.get("ingredients"), list) or not isinstance(recipe_data.get("steps"), list):
        return {"error": "Couldn't generate a recipe right now", "suggestion": "try again in a moment"}, 502

    # cost and servings are nice-to-haves; drop them rather than show nonsense
    try:
        recipe_data["cost_per_serving"] = round(float(recipe_data.get("cost_per_serving")), 2)
        if recipe_data["cost_per_serving"] <= 0:
            raise ValueError
    except (TypeError, ValueError):
        recipe_data.pop("cost_per_serving", None)
    try:
        recipe_data["servings"] = int(recipe_data.get("servings"))
    except (TypeError, ValueError):
        recipe_data.pop("servings", None)

    return recipe_data


# what we search google for under each cuisine filter. searching the cuisine by
# name returns far more matches than google's cuisine place types do.
# ("burgers" oddly returns nothing in some suburbs, "burger" works.)
CUISINE_QUERIES = {
    "all": "restaurants",
    "pizza": "pizza",
    "burgers": "burger",
    "chinese": "chinese food",
    "mexican": "mexican food",
    "halal": "halal food",
    "thai": "thai food",
    "japanese": "japanese food",
    "indian": "indian food",
    "korean": "korean food",
}

# slider step (max dollars per person) -> which of google's price tiers to ask for.
# google's "$" tier is mostly $10-20 a person (a few $1-10) and "$$" is $20-30 or
# $20-50, so the tiers only narrow the search; fits_budget() checks real prices.
BUDGET_PRICE_LEVELS = {
    "10": ["PRICE_LEVEL_INEXPENSIVE"],
    "20": ["PRICE_LEVEL_INEXPENSIVE"],
    "30": ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"]
}

# google treats the search area as a preference, not a limit, so a rare cuisine
# can come back hundreds of miles away. nobody broke is going further than this.
MAX_DISTANCE_MILES = 10


def fits_budget(place, max_dollars):
    price_range = place.get("priceRange")
    if price_range:
        end_price = price_range.get("endPrice")
        if not end_price:
            return False  # open-ended range like "$50+"
        return int(end_price.get("units", 0)) <= max_dollars
    # no dollar range listed: a "$" place is usually $10-20, anything else is a guess
    return place.get("priceLevel") == "PRICE_LEVEL_INEXPENSIVE" and max_dollars >= 20


def miles_between(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(math.radians, (lat1, lng1, lat2, lng2))
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(a))


@app.route("/restaurants")
def restaurants():
    lat = request.args.get("lat")
    lng = request.args.get("lng")

    if not lat or not lng:
        return {"error": "Missing location"}, 400

    try:
        latitude = float(lat)
        longitude = float(lng)
    except ValueError:
        return {"error": "Invalid location"}, 400

    budget = request.args.get("budget")
    if budget not in BUDGET_PRICE_LEVELS:
        budget = "20"
    allowed_levels = BUDGET_PRICE_LEVELS[budget]
    max_dollars = int(budget)
    query = CUISINE_QUERIES.get(request.args.get("cuisine"), CUISINE_QUERIES["all"])

    url = "https://places.googleapis.com/v1/places:searchText"

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_api_key,
        "X-Goog-FieldMask": "places.displayName,places.priceLevel,places.rating,places.shortFormattedAddress,places.primaryTypeDisplayName,places.location,places.priceRange,nextPageToken"
    }

    # closest matching places first, with no fixed radius: in a city the nearest
    # 20 are a few blocks away, in the suburbs the search stretches out miles.
    # google filters by price and opening hours itself, so pages stay full.
    body = {
        "textQuery": query,
        "includedType": "restaurant",
        "priceLevels": allowed_levels,
        "openNow": True,
        "rankPreference": "DISTANCE",
        "pageSize": 20,
        "locationBias": {
            "circle": {
                "center": {
                    "latitude": latitude,
                    "longitude": longitude
                },
                "radius": 50000
            }
        }
    }

    page_token = request.args.get("pageToken")
    if page_token:
        body["pageToken"] = page_token

    try:
        response = requests.post(url, headers=headers, json=body, timeout=10)
        data = response.json()
    except requests.RequestException:
        return {"error": "Couldn't reach restaurant search right now"}, 502

    if "error" in data:
        if data["error"].get("status") == "RESOURCE_EXHAUSTED":
            return {"error": "Restaurant search is maxed out for today"}, 503
        return {"error": "Couldn't fetch restaurants right now"}, 502

    filtered = []
    any_in_range = False
    for place in data.get("places", []):
        if "location" not in place:
            continue
        distance = miles_between(latitude, longitude, place["location"]["latitude"], place["location"]["longitude"])
        if distance > MAX_DISTANCE_MILES:
            continue
        any_in_range = True
        if fits_budget(place, max_dollars):
            filtered.append(place)

    # a page can be empty just because nothing on it fit the budget, so keep
    # paging; stop once a whole page is too far away, since later pages will be too
    next_page_token = data.get("nextPageToken") if any_in_range else None

    return {"places": filtered, "nextPageToken": next_page_token}

if __name__ == "__main__":
    app.run(debug=True, port=8080)