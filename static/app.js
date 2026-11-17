function showScreen(screenId) {
    if (screenId === 'screen-home') {
        resetHomeState();
    }

    const current = document.querySelector('.screen.active');
    const next = document.getElementById(screenId);
    if (current === next) return;

    if (current) {
        current.classList.remove('fade-in');
    }

    setTimeout(() => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'fade-in'));
        next.classList.add('active');
        window.scrollTo(0, 0);
        requestAnimationFrame(() => next.classList.add('fade-in'));
    }, current ? 200 : 0);
}

// text from users, the AI and google goes into innerHTML, so escape it first
function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
}

let ingredients = [];
let selectedDifficulty = 'beginner';

const quickAddIngredients = ['eggs', 'rice', 'pasta', 'chicken', 'potatoes', 'canned beans', 'tortillas', 'cheese', 'onion', 'bread'];

function resetHomeState() {
    ingredients = [];
    recipeHistory = [];
    document.getElementById('ingredient-input').value = '';
    showInlineError('cook-error', '');
    renderTags();
    selectedDifficulty = 'beginner';
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    const beginnerBtn = document.querySelector('.diff-btn');
    if (beginnerBtn) beginnerBtn.classList.add('active');
}

document.addEventListener('DOMContentLoaded', function() {
    showScreen('screen-home');

    document.getElementById('ingredient-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            addIngredientsFromInput();
        }
    });
});

function selectDifficulty(level, btn) {
    selectedDifficulty = level;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function showInlineError(id, message) {
    const el = document.getElementById(id);
    el.innerText = message;
    el.classList.toggle('visible', Boolean(message));
}

// "eggs, rice" becomes two ingredients; repeats are skipped
function addIngredients(text) {
    text.split(',').map(s => s.trim()).filter(Boolean).forEach(item => {
        if (!ingredients.some(existing => existing.toLowerCase() === item.toLowerCase())) {
            ingredients.push(item);
        }
    });
    showInlineError('cook-error', '');
    renderTags();
}

function addIngredientsFromInput() {
    const input = document.getElementById('ingredient-input');
    addIngredients(input.value);
    input.value = '';
}

function removeTag(index) {
    ingredients.splice(index, 1);
    renderTags();
}

function renderTags() {
    document.getElementById('tags-container').innerHTML = ingredients.map((ing, i) =>
        `<span class="tag" onclick="removeTag(${i})">${escapeHTML(ing)} ×</span>`
    ).join('');
    renderQuickAdd();
}

// staples that aren't already in the list, one tap to add
function renderQuickAdd() {
    const added = ingredients.map(i => i.toLowerCase());
    document.getElementById('quick-add').innerHTML = quickAddIngredients
        .filter(item => !added.includes(item))
        .map(item => `<span class="quick-chip" onclick="addIngredients('${item}')">+ ${item}</span>`)
        .join('');
}

// recipe names already shown for these ingredients, so "try another" gets something new
let recipeHistory = [];
let recipeRequestId = 0;

// from the cook screen: start fresh with whatever's in the list (and the input box)
function getRecipe() {
    addIngredientsFromInput();
    if (ingredients.length === 0) {
        showInlineError('cook-error', 'Add at least one ingredient first.');
        return;
    }
    recipeHistory = [];
    showScreen('screen-recipe');
    requestRecipe();
}

function tryAnotherRecipe() {
    window.scrollTo(0, 0);
    requestRecipe();
}

function setRecipeLoading(loading) {
    document.getElementById('recipe-loading').style.display = loading ? 'flex' : 'none';
    document.getElementById('recipe-content').style.display = loading ? 'none' : 'block';
}

function requestRecipe() {
    const id = ++recipeRequestId;
    showInlineError('recipe-error', '');
    setRecipeLoading(true);

    const params = new URLSearchParams({ ingredients: ingredients.join(','), difficulty: selectedDifficulty });
    if (recipeHistory.length) params.set('exclude', recipeHistory.join('|'));

    fetch('/recipe?' + params.toString())
        .then(response => response.json())
        .then(data => {
            if (id !== recipeRequestId) return;
            if (data.error) {
                const err = new Error(data.error + (data.suggestion ? ' — ' + data.suggestion : '') + '.');
                err.fromServer = true;
                throw err;
            }
            recipeHistory.push(data.name);
            showRecipeResult(data);
            setRecipeLoading(false);
        })
        .catch(err => {
            if (id !== recipeRequestId) return;
            const message = err.fromServer ? err.message : 'Something went wrong finding a recipe. Try again.';
            if (recipeHistory.length) {
                // "try another" failed: keep the recipe we already have on screen
                setRecipeLoading(false);
                showInlineError('recipe-error', message);
            } else {
                showInlineError('cook-error', message);
                showScreen('screen-cook');
            }
        });
}

// google's "$" tier is mostly $10-20 a person, so that's what a cheap meal out costs
const EATING_OUT_LOW = 10;
const EATING_OUT_HIGH = 20;

function showRecipeResult(recipe) {
    document.getElementById('recipe-name').innerText = recipe.name;
    document.getElementById('recipe-difficulty').innerText = recipe.difficulty;
    document.getElementById('recipe-time').innerText = '⏱ ' + recipe.cook_time;
    document.getElementById('recipe-servings').innerText = recipe.servings ? 'serves ' + recipe.servings : '';

    const cost = recipe.cost_per_serving;
    document.getElementById('recipe-cost').style.display = cost ? 'block' : 'none';
    if (cost) {
        const savings = Math.floor(EATING_OUT_LOW - cost);
        document.getElementById('recipe-cost-amount').innerText = '~$' + cost.toFixed(2) + ' a serving';
        document.getElementById('recipe-cost-compare').innerText = savings >= 1
            ? `A cheap meal out runs $${EATING_OUT_LOW}–${EATING_OUT_HIGH}, so you save at least $${savings}.`
            : `About what a cheap meal out costs ($${EATING_OUT_LOW}–${EATING_OUT_HIGH}).`;
    }

    document.getElementById('recipe-ingredients').innerHTML = recipe.ingredients
        .map(i => `<li>✓ ${escapeHTML(i)}</li>`).join('');

    document.getElementById('recipe-steps').innerHTML = recipe.steps
        .map((s, i) => `<li><span class="step-num">${i + 1}</span>${escapeHTML(s)}</li>`).join('');
}

// max dollars per person; matches BUDGET_PRICE_LEVELS in app.py
const budgetSteps = ['10', '20', '30'];

// keys match CUISINE_QUERIES in app.py
const cuisines = [
    { key: 'all', label: 'All cuisines', emoji: '🍽️' },
    { key: 'pizza', label: 'Pizza', emoji: '🍕' },
    { key: 'burgers', label: 'Burgers', emoji: '🍔' },
    { key: 'chinese', label: 'Chinese', emoji: '🥡' },
    { key: 'mexican', label: 'Mexican', emoji: '🌮' },
    { key: 'halal', label: 'Halal', emoji: '🥙' },
    { key: 'thai', label: 'Thai', emoji: '🍜' },
    { key: 'japanese', label: 'Japanese', emoji: '🍣' },
    { key: 'indian', label: 'Indian', emoji: '🍛' },
    { key: 'korean', label: 'Korean', emoji: '🍲' }
];

const filters = { budget: '20', cuisine: 'all' };

// while dragging: move the label and fill without searching yet
function previewBudget(step) {
    const slider = document.getElementById('budget-slider');
    slider.style.setProperty('--fill', (step / (budgetSteps.length - 1)) * 100 + '%');
    document.getElementById('budget-value').innerText = 'under $' + budgetSteps[step];
}

// on release: search with the new budget
function setBudget(step) {
    previewBudget(step);
    if (filters.budget === budgetSteps[step]) return;
    filters.budget = budgetSteps[step];
    searchRestaurants();
}

function renderCuisineMenu() {
    const current = cuisines.find(c => c.key === filters.cuisine);
    document.getElementById('cuisine-current').innerText = current.emoji + ' ' + current.label;
    document.getElementById('cuisine-options').innerHTML = cuisines.map(c => {
        const selected = c.key === filters.cuisine;
        return `<button class="cuisine-option${selected ? ' active' : ''}" onclick="setCuisine('${c.key}')">
                    <span>${c.emoji} ${c.label}</span>${selected ? '<span class="check">✓</span>' : ''}
                </button>`;
    }).join('');
}

function openCuisineMenu() {
    renderCuisineMenu();
    document.getElementById('cuisine-sheet').classList.add('open');
}

function closeCuisineMenu() {
    document.getElementById('cuisine-sheet').classList.remove('open');
}

function setCuisine(key) {
    closeCuisineMenu();
    if (filters.cuisine === key) return;
    filters.cuisine = key;
    renderCuisineMenu();
    searchRestaurants();
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCuisineMenu();
});

const priceLevelLabels = {
    PRICE_LEVEL_FREE: 'Free',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
};

let userLocation = null;

function distanceMiles(place) {
    if (!userLocation || !place.location) return null;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(place.location.latitude - userLocation.lat);
    const dLng = toRad(place.location.longitude - userLocation.lng);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(userLocation.lat)) * Math.cos(toRad(place.location.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

// real per-person range like "$10–20" when google has one, otherwise "$"/"$$"
function priceLabelFor(place) {
    const range = place.priceRange;
    if (range?.startPrice && range?.endPrice) {
        return '$' + (range.startPrice.units || '0') + '–' + range.endPrice.units;
    }
    return priceLevelLabels[place.priceLevel];
}

function restaurantCardHTML(place) {
    const priceLabel = priceLabelFor(place);
    const miles = distanceMiles(place);
    const distanceLabel = miles === null ? '' : (miles < 0.1 ? '<0.1 mi' : miles.toFixed(1) + ' mi');
    return `
        <div class="restaurant-card">
            <h3>${escapeHTML(place.displayName.text)}</h3>
            <p class="cuisine">${escapeHTML(place.primaryTypeDisplayName?.text || 'Restaurant')}${priceLabel ? ' &middot; <span class="price-level">' + priceLabel + '</span>' : ''}${distanceLabel ? ' &middot; ' + distanceLabel : ''}</p>
            <div class="restaurant-meta">
                <span class="rating">★ ${place.rating || 'N/A'}</span>
                <span>${escapeHTML(place.shortFormattedAddress || '')}</span>
            </div>
        </div>
    `;
}

function restaurantsURL(pageToken) {
    const params = new URLSearchParams({
        budget: filters.budget,
        lat: userLocation.lat,
        lng: userLocation.lng
    });
    if (filters.cuisine !== 'all') params.set('cuisine', filters.cuisine);
    if (pageToken) params.set('pageToken', pageToken);
    return '/restaurants?' + params.toString();
}

function sortByDistance(places) {
    return places.sort((a, b) => (distanceMiles(a) ?? Infinity) - (distanceMiles(b) ?? Infinity));
}

function showRestaurantsMessage(text) {
    document.getElementById('restaurants-loading').style.display = 'none';
    document.getElementById('restaurant-cards').innerHTML =
        '<p style="color:#999;margin-top:24px;">' + text + '</p>';
}

// entry point from the home screen: grab a fresh location, then search
function findRestaurants() {
    document.getElementById('restaurant-cards').innerHTML = '';
    document.getElementById('restaurants-loading').style.display = 'flex';
    showScreen('screen-restaurants');

    navigator.geolocation.getCurrentPosition(function(position) {
        userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        searchRestaurants();
    }, function() {
        showRestaurantsMessage('Could not get your location. Please enable location access.');
    });
}

// bumped on every new search so a slow, older response can't overwrite a newer one
let searchId = 0;
let shownRestaurants = [];
let nextPageToken = null;
let loadingMore = false;

// fetches the next page of results. resolves to the new places, or null if a
// newer search has started. a page can come back empty just because nothing on
// it fit the budget, so it keeps going until it finds some or runs out.
function loadRestaurantPage(id, pageToken) {
    return fetch(restaurantsURL(pageToken))
        .then(response => response.json())
        .then(data => {
            if (id !== searchId) return null;
            if (data.error) {
                const err = new Error(data.error);
                err.fromServer = true;
                throw err;
            }
            nextPageToken = data.nextPageToken || null;

            const newPlaces = (data.places || []).filter(place =>
                !shownRestaurants.includes(place.displayName.text)
            );
            if (newPlaces.length === 0 && nextPageToken) {
                return loadRestaurantPage(id, nextPageToken);
            }
            return newPlaces;
        });
}

function appendRestaurants(places) {
    places.forEach(place => shownRestaurants.push(place.displayName.text));
    document.getElementById('restaurant-cards').innerHTML += sortByDistance(places).map(restaurantCardHTML).join('');
}

// runs the search with the current filters; called on load and whenever a filter changes
function searchRestaurants() {
    if (!userLocation) {
        findRestaurants();
        return;
    }

    const id = ++searchId;
    nextPageToken = null;
    shownRestaurants = [];
    loadingMore = false;
    document.getElementById('restaurant-cards').innerHTML = '';
    document.getElementById('restaurants-loading').style.display = 'flex';

    loadRestaurantPage(id, null)
        .then(places => {
            if (places === null) return;
            document.getElementById('restaurants-loading').style.display = 'none';

            if (places.length === 0) {
                showRestaurantsMessage('Nothing open nearby fits this budget and cuisine. Try raising your budget or picking another cuisine.');
                return;
            }
            appendRestaurants(places);
        })
        .catch(err => {
            if (id !== searchId) return;
            showRestaurantsMessage(err.fromServer
                ? err.message + '. Please try again later.'
                : 'Something went wrong. Please try again.');
        });
}

function showNoMoreResults() {
    document.getElementById('restaurant-cards').innerHTML +=
        '<p style="color:#999;margin-top:12px;">No more results nearby.</p>';
}

// each "find more?" loads the next page of the same search; google ranks by
// distance, so every page reaches a little further out
function findMore() {
    if (loadingMore || !userLocation) return;
    if (!nextPageToken) {
        showNoMoreResults();
        return;
    }

    const id = searchId;
    loadingMore = true;
    loadRestaurantPage(id, nextPageToken)
        .then(places => {
            if (places === null) return;
            loadingMore = false;
            if (places.length === 0) {
                showNoMoreResults();
                return;
            }
            appendRestaurants(places);
        })
        .catch(() => {
            if (id === searchId) loadingMore = false;
        });
}
