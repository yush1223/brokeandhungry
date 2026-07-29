from flask import Flask, request, render_template
from dotenv import load_dotenv
from groq import Groq
import os
import json
import requests

load_dotenv()

api_key = os.getenv("GROQ_API_KEY") #api key from .env file
google_api_key = os.getenv("GOOGLE_API_KEY")
client = Groq(api_key=api_key)
app = Flask(__name__)

@app.route("/")
def home():
    return render_template("home.html") #loads html


@app.route("/recipe")
def recipe():
    ingredients = request.args.get("ingredients")
    ingredients_list = ingredients.split(",")
    ingredients_text = ", ".join(ingredients_list)
    difficulty = request.args.get("difficulty")
    
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "I have " + ingredients_text + ". Give me a " + difficulty + " recipe using these as the main ingredients. You can assume I have basic pantry staples like salt, pepper, oil, and butter. Do not add any other main ingredients I haven't listed. IMPORTANT: If the ingredients listed cannot realistically make a proper meal that a person would actually eat, respond with this JSON: {\"error\": \"These ingredients don't work together\", \"suggestion\": \"try adding [one ingredient]\"}. Otherwise respond with ONLY a JSON object in this exact format, no other text: {\"name\": \"Recipe Name\", \"cook_time\": \"X mins\", \"difficulty\": \"beginner\", \"ingredients\": [\"ingredient 1\", \"ingredient 2\"], \"steps\": [\"step 1\", \"step 2\", \"step 3\"]}"
            }
        ],
        model="llama-3.3-70b-versatile",
    )
    
    response_text = chat_completion.choices[0].message.content
    recipe_data = json.loads(response_text)
    return recipe_data

@app.route("/restaurants")
def restaurants():
    budget = request.args.get("budget")
    lat = request.args.get("lat")
    lng = request.args.get("lng")
    
    url = "https://places.googleapis.com/v1/places:searchNearby"
    
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_api_key,
        "X-Goog-FieldMask": "places.displayName,places.priceLevel,places.rating,places.shortFormattedAddress,places.primaryTypeDisplayName"
    }
    
    body = {
        "includedTypes": ["restaurant"],
        "maxResultCount": 10,
        "locationRestriction": {
            "circle": {
                "center": {
                    "latitude": float(lat),
                    "longitude": float(lng)
                },
                "radius": float(request.args.get("radius", 5000))
            }
        }
    }
    
    response = requests.post(url, headers=headers, json=body)
    data = response.json()
    
    budget_map = {
        "10": ["PRICE_LEVEL_INEXPENSIVE"],
        "15": ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"],
        "20": ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE"]
    }
    
    allowed_levels = budget_map.get(budget, ["PRICE_LEVEL_INEXPENSIVE"])
    
    filtered = []
    for place in data["places"]:
        if "priceLevel" in place and place["priceLevel"] in allowed_levels:
            filtered.append(place)
    
    return {"places": filtered}

if __name__ == "__main__":
    app.run(debug=True, port=8080)