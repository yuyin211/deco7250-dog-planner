// Readable prototype recommendation rules: cover selected activities, respect
// the time-based stop limit, then use dog preferences to rank coherent routes.
const TIME_STOP_LIMITS = {'45 min': 2, '60 min': 3, '90 min': 4, '2 hours': 5};
const RECOMMENDATION_WEIGHTS = {
  activityCoverage: 100,
  missingActivity: -90,
  unrelatedStop: -7,
  quietScore: 3,
  socialScore: 3,
  waterStop: 16,
  shorterDistance: -18,
  stopCount: -12
};

function distanceBetween(left, right) {
  return Math.hypot((left[0] - right[0]) * 111195, (left[1] - right[1]) * 98650);
}

function geometryDistance(coordinates) {
  return coordinates.slice(1).reduce((total, point, index) => total + distanceBetween(coordinates[index], point), 0);
}

function recommendationDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;
}

function placeScore(place, selectedActivities, preferences) {
  let score = place.activities.filter(activity => selectedActivities.includes(activity)).length * 12;
  if (preferences.includes('Prefers quieter areas')) score += place.quietScore * RECOMMENDATION_WEIGHTS.quietScore;
  if (preferences.includes('Enjoys meeting other dogs')) score += place.dogSocialScore * RECOMMENDATION_WEIGHTS.socialScore;
  if (preferences.includes('Needs regular water stops') && place.waterAvailable) score += RECOMMENDATION_WEIGHTS.waterStop;
  return score;
}

function routeScore(route) {
  const activities = state.selections.activities;
  const preferences = state.selections.preferences;
  const places = route.placeIds.map(id => PLACES[id]);
  const covered = new Set(places.flatMap(place => place.activities).filter(activity => activities.includes(activity)));
  const unrelated = places.filter(place => !place.activities.some(activity => activities.includes(activity))).length;
  let score = covered.size * RECOMMENDATION_WEIGHTS.activityCoverage;
  score += (activities.length - covered.size) * RECOMMENDATION_WEIGHTS.missingActivity;
  score += places.reduce((total, place) => total + placeScore(place, activities, preferences), 0);
  score += places.length * RECOMMENDATION_WEIGHTS.stopCount;
  score += unrelated * RECOMMENDATION_WEIGHTS.unrelatedStop;
  score -= route.distanceKm;
  if (preferences.includes('Shorter walks preferred')) score += route.distanceKm * RECOMMENDATION_WEIGHTS.shorterDistance;
  if (state.manualPlaceOverrides.cafe) {
    const hasCafe = places.some(place => place.activities.includes('Café or food'));
    if (hasCafe && !route.placeIds.includes(state.manualPlaceOverrides.cafe)) score -= 500;
  }
  return score;
}

function generateRecommendation() {
  const stopLimit = TIME_STOP_LIMITS[state.selections.time];
  const timeMinutes = state.selections.time === '2 hours' ? 120 : Number.parseInt(state.selections.time, 10);
  const candidates = Object.values(ROUTE_VARIANTS).filter(route =>
    !route.hidden && route.placeIds.length <= stopLimit && route.estimatedMinutes <= timeMinutes
  );
  const selected = candidates.sort((left, right) => routeScore(right) - routeScore(left))[0];
  state.selectedRouteVariant = selected.id;
  state.recommendedStops = [...selected.placeIds];
  renderSuggestedOuting();
}

function legDistance(route, legIndex) {
  const start = route.stopIndexes[legIndex];
  const end = route.stopIndexes[legIndex + 1];
  return geometryDistance(route.coordinates.slice(start, end + 1));
}

function routeSummary(route) {
  return [`${route.estimatedMinutes} min walk`, `${route.distanceKm.toFixed(1)} km`, `${route.placeIds.length} ${route.placeIds.length === 1 ? 'stop' : 'stops'}`];
}

function renderSuggestedOuting() {
  const route = ROUTE_VARIANTS[state.selectedRouteVariant];
  const chips = document.querySelectorAll('#suggested-screen .summary-chips span');
  routeSummary(route).forEach((text, index) => { chips[index].textContent = text; });
  document.querySelector('#itinerary').innerHTML = route.placeIds.map((placeId, index) => {
    const place = PLACES[placeId];
    const detail = `<article class="stop-row"><div class="stop-number">${index + 1}</div><button class="stop-card" type="button" data-place-id="${place.id}" aria-label="View details for ${place.name}"><div class="stop-title-line"><h2>${place.name}</h2><span>${place.suggestedDuration} min</span></div><p>${place.type}</p><div class="stop-meta"><span class="${place.quietScore >= 4 ? 'quiet-dot' : 'busy-dot'}"></span>${place.dogInfo[0]}</div></button></article>`;
    if (index === route.placeIds.length - 1) return detail;
    const meters = legDistance(route, index);
    return `${detail}<div class="walk-separator"><span>⌁</span><span>${Math.max(2, Math.round(meters / 60))} min walk</span><span class="distance">${recommendationDistance(meters)}</span></div>`;
  }).join('');
  document.querySelector('.suggested-weather span:last-child').textContent = `27°C · Good conditions for ${state.selections.time}`;
}

function alternativesFor(place) {
  if (!place.activities.includes('Café or food')) return [];
  const role = place.activities[0];
  return PLACE_LIST.filter(candidate => candidate.id !== place.id && candidate.activities.includes(role));
}

function placeComparison(place) {
  const traits = [];
  if (place.quietScore >= 4) traits.push('Quieter');
  if (place.dogSocialScore >= 4) traits.push('More social');
  if (place.waterAvailable) traits.push('Water available');
  if (place.facilities.includes('Outdoor seating')) traits.push('Outdoor seating');
  return traits.slice(0, 2).join(' · ');
}

function openPlaceDetails(placeId) {
  const place = PLACES[placeId];
  const alternatives = alternativesFor(place);
  document.querySelector('#place-type').textContent = place.type;
  document.querySelector('#place-title').textContent = place.name;
  const rating = document.querySelector('#place-rating');
  rating.textContent = place.prototypeRating ? `★ ${place.prototypeRating.toFixed(1)} · Prototype rating` : 'Prototype place information';
  document.querySelector('#place-description').textContent = place.shortDescription;
  document.querySelector('#dog-facts').innerHTML = place.dogInfo.slice(0, 3).map(fact => `<span>✓ ${fact}</span>`).join('');
  document.querySelector('#visit-duration').textContent = `Suggested visit · ${place.suggestedDuration} min`;
  document.querySelector('#google-maps-link').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.googleMapsQuery)}`;
  const changeButton = document.querySelector('#change-place');
  changeButton.hidden = alternatives.length === 0;
  changeButton.dataset.placeId = place.id;
  document.querySelector('#place-alternatives').hidden = true;
  document.querySelector('#alternative-list').innerHTML = alternatives.map(candidate => `<button type="button" class="alternative-place" data-place-id="${candidate.id}"><strong>${candidate.name}</strong><span>${placeComparison(candidate)}</span></button>`).join('');
  document.querySelector('#place-backdrop').classList.remove('is-hidden');
  document.querySelector('#close-place').focus();
}

function closePlaceDetails() {
  document.querySelector('#place-backdrop').classList.add('is-hidden');
}

function changePlace(placeId) {
  const place = PLACES[placeId];
  if (place.activities.includes('Café or food')) state.manualPlaceOverrides.cafe = place.id;
  generateRecommendation();
  closePlaceDetails();
  showToast(`${place.name} added to your outing.`);
}

document.querySelector('#itinerary').addEventListener('click', event => {
  const card = event.target.closest('[data-place-id]');
  if (card) openPlaceDetails(card.dataset.placeId);
});
document.querySelector('#close-place').addEventListener('click', closePlaceDetails);
document.querySelector('#dismiss-place').addEventListener('click', closePlaceDetails);
document.querySelector('#place-backdrop').addEventListener('click', event => { if (event.target.id === 'place-backdrop') closePlaceDetails(); });
document.querySelector('#change-place').addEventListener('click', () => { document.querySelector('#place-alternatives').hidden = false; });
document.querySelector('#alternative-list').addEventListener('click', event => {
  const alternative = event.target.closest('.alternative-place');
  if (alternative) changePlace(alternative.dataset.placeId);
});

generateRecommendation();
