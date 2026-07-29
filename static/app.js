function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Show home screen on load
document.addEventListener('DOMContentLoaded', function() {
    showScreen('screen-home');
});

let ingredients = [];
let selectedDifficulty = 'beginner';

function selectDifficulty(level, btn) {
    selectedDifficulty = level;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

document.addEventListener('DOMContentLoaded', function() {
    showScreen('screen-home');
    
    document.getElementById('ingredient-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && this.value.trim()) {
            addTag(this.value.trim());
            this.value = '';
        }
    });
});

function addTag(ingredient) {
    ingredients.push(ingredient);
    renderTags();
}

function removeTag(index) {
    ingredients.splice(index, 1);
    renderTags();
}

function renderTags() {
    const container = document.getElementById('tags-container');
    container.innerHTML = ingredients.map((ing, i) => 
        `<span class="tag" onclick="removeTag(${i})">${ing} ×</span>`
    ).join('');
}

function getRecipe() {
    if (ingredients.length === 0) {
        alert("Add at least one ingredient first!");
        return;
    }

    const ingredientString = ingredients.join(",");
    
    fetch("/recipe?ingredients=" + ingredientString + "&difficulty=" + selectedDifficulty)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error + ". " + data.suggestion);
                return;
            }
            showRecipeResult(data);
        });
}

function showRecipeResult(recipe) {
    document.getElementById('recipe-name').innerText = recipe.name;
    document.getElementById('recipe-difficulty').innerText = recipe.difficulty;
    document.getElementById('recipe-time').innerText = '⏱ ' + recipe.cook_time;
    
    document.getElementById('recipe-ingredients').innerHTML = recipe.ingredients
        .map(i => `<li>✓ ${i}</li>`).join('');
    
    document.getElementById('recipe-steps').innerHTML = recipe.steps
        .map((s, i) => `<li><span class="step-num">${i+1}</span>${s}</li>`).join('');
    
    showScreen('screen-recipe');
}

let selectedBudget = '10';

function selectBudget(budget, el) {
    selectedBudget = budget;
    document.querySelectorAll('.budget-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
}

function findRestaurants() {
    searchRadius = 5000;
    document.getElementById('budget-badge').innerText = 'under $' + selectedBudget;
    showScreen('screen-restaurants');
    
    navigator.geolocation.getCurrentPosition(function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        document.getElementById('location-badge').innerText = 'near you';
        
        fetch("/restaurants?budget=" + selectedBudget + "&lat=" + lat + "&lng=" + lng)
            .then(response => response.json())
            .then(data => {
                if (!data.places || data.places.length === 0) {
                    document.getElementById('restaurant-cards').innerHTML = 
                        '<p style="color:#999;margin-top:24px;">No results found. Try a higher budget.</p>';
                    return;
                }
                
                document.getElementById('restaurant-cards').innerHTML = data.places.map(place => `
                    <div class="restaurant-card">
                        <h3>${place.displayName.text}</h3>
                        <p class="cuisine">${place.primaryTypeDisplayName?.text || 'Restaurant'}</p>
                        <div class="restaurant-meta">
                            <span class="rating">★ ${place.rating || 'N/A'}</span>
                            <span>${place.shortFormattedAddress}</span>
                        </div>
                    </div>
                `).join('');

                shownRestaurants = data.places.map(p => p.displayName.text);
            });
    }, function() {
        document.getElementById('location-badge').innerText = 'location unavailable';
        document.getElementById('restaurant-cards').innerHTML = 
            '<p style="color:#999;margin-top:24px;">Could not get your location. Please enable location access.</p>';
    });
}

let shownRestaurants = [];

let searchRadius = 5000;

function findMore() {
    searchRadius += 3000;
    
    navigator.geolocation.getCurrentPosition(function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        fetch("/restaurants?budget=" + selectedBudget + "&lat=" + lat + "&lng=" + lng + "&radius=" + searchRadius)
            .then(response => response.json())
            .then(data => {
                if (!data.places || data.places.length === 0) {
                    document.getElementById('restaurant-cards').innerHTML += 
                        '<p style="color:#999;margin-top:12px;">No more results nearby.</p>';
                    return;
                }

                const newPlaces = data.places.filter(place => 
                    !shownRestaurants.includes(place.displayName.text)
                );

                if (newPlaces.length === 0) {
                    document.getElementById('restaurant-cards').innerHTML += 
                        '<p style="color:#999;margin-top:12px;">No more results nearby.</p>';
                    return;
                }

                newPlaces.forEach(place => shownRestaurants.push(place.displayName.text));

                document.getElementById('restaurant-cards').innerHTML += newPlaces.map(place => `
                    <div class="restaurant-card">
                        <h3>${place.displayName.text}</h3>
                        <p class="cuisine">${place.primaryTypeDisplayName?.text || 'Restaurant'}</p>
                        <div class="restaurant-meta">
                            <span class="rating">★ ${place.rating || 'N/A'}</span>
                            <span>${place.shortFormattedAddress}</span>
                        </div>
                    </div>
                `).join('');
            });
    });
}