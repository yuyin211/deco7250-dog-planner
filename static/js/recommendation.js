// Compare complete curated itineraries. Coverage is a separate ranking tier:
// dog scores can never compensate for a missing selected activity.
const DOG_WEIGHTS = {quiet: 3, social: 3, water: 16, shorterKm: 18};

function geometryDistance(coordinates) {
  return routeDistanceFromCoordinates(coordinates);
}

function recommendationDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;
}

function availableMinutes() {
  return state.selections.time === '2 hours' ? 120 : Number.parseInt(state.selections.time, 10);
}

function activityCoverage(route, activities = state.selections.activities) {
  const supported = new Set(route.placeIds.flatMap(id => PLACES[id].activities));
  return {
    coveredActivities: activities.filter(activity => supported.has(activity)),
    uncoveredActivities: activities.filter(activity => !supported.has(activity))
  };
}

function stopRole(placeId) {
  const place = PLACES[placeId];
  const matches = place.activities.filter(activity => state.selections.activities.includes(activity));
  // One place can cover multiple roles simultaneously. Use the longest visit.
  return (matches.length ? matches : [place.activities[0]])
    .sort((a, b) => ACTIVITY_DURATIONS[b].default - ACTIVITY_DURATIONS[a].default)[0];
}

function itineraryTiming(route, durations = state.stopDurations) {
  const plannedActivityMinutes = route.placeIds.reduce((sum, id) => sum + durations[id], 0);
  const riverCredit = Math.min(route.riversideTravelMinutes, durations.riverside_path || 0);
  const activityMinutes = plannedActivityMinutes - riverCredit;
  return {
    travelMinutes: route.travelMinutes, activityMinutes, riverCredit,
    totalMinutes: route.travelMinutes + activityMinutes
  };
}

function candidateItinerary(route) {
  const roles = {};
  const durations = {};
  route.placeIds.forEach(id => {
    roles[id] = stopRole(id);
    const saved = state.manualDurations[id];
    durations[id] = saved && saved.role === roles[id]
      ? saved.minutes : ACTIVITY_DURATIONS[roles[id]].default;
  });
  const defaults = {...durations};
  // Only flexible visits shrink. Explicit user duration edits are never reset
  // merely to make a candidate fit the budget.
  while (itineraryTiming(route, durations).totalMinutes > availableMinutes()) {
    const flexible = route.placeIds.filter(id =>
      !state.manualDurations[id] || state.manualDurations[id].role !== roles[id]
    ).filter(id => durations[id] > ACTIVITY_DURATIONS[roles[id]].minimum);
    if (!flexible.length) break;
    flexible.sort((a, b) =>
      (durations[b] - ACTIVITY_DURATIONS[roles[b]].minimum) -
      (durations[a] - ACTIVITY_DURATIONS[roles[a]].minimum)
    );
    durations[flexible[0]] -= 1;
  }
  const coverage = activityCoverage(route);
  const relevant = route.placeIds.filter(id => PLACES[id].activities.some(a => state.selections.activities.includes(a)));
  // Average suitability: extra stops do not manufacture extra preference points.
  let dogScore = relevant.reduce((score, id) => {
    const place = PLACES[id];
    if (state.selections.preferences.includes('Prefers quieter areas')) score += place.quietScore * DOG_WEIGHTS.quiet;
    if (state.selections.preferences.includes('Enjoys meeting other dogs')) score += place.dogSocialScore * DOG_WEIGHTS.social;
    if (state.selections.preferences.includes('Needs regular water stops') && place.waterAvailable) score += DOG_WEIGHTS.water;
    return score;
  }, 0) / Math.max(1, relevant.length);
  if (state.selections.preferences.includes('Shorter walks preferred')) dogScore -= route.distanceKm * DOG_WEIGHTS.shorterKm;
  // Count stops beyond the smallest subset of THIS route needed for coverage.
  // At most five curated stops: this small subset check is easy to inspect.
  let needed = route.placeIds.length;
  for (let mask = 1; mask < 2 ** route.placeIds.length; mask += 1) {
    const subset = route.placeIds.filter((id, index) => mask & (1 << index));
    if (activityCoverage({placeIds: subset}).coveredActivities.length === coverage.coveredActivities.length) {
      needed = Math.min(needed, subset.length);
    }
  }
  const timing = itineraryTiming(route, durations);
  return {
    route, roles, durations, ...coverage, ...timing, dogScore,
    overMinutes: Math.max(0, timing.totalMinutes - availableMinutes()),
    redundantStops: route.placeIds.length - needed,
    overridesKept: Object.values(state.manualPlaceOverrides).filter(id => route.placeIds.includes(id)).length,
    shortened: route.placeIds.some(id => durations[id] < defaults[id])
  };
}

function compareCandidates(a, b) {
  // 1 coverage; 2 time feasibility / least overrun; 3 explicit user choices;
  // 4 dog suitability; 5 unnecessary stops; 6 distance.
  // All geometry has already been curated, so there is no straight-line routing.
  return b.coveredActivities.length - a.coveredActivities.length ||
    a.overMinutes - b.overMinutes ||
    b.overridesKept - a.overridesKept ||
    b.dogScore - a.dogScore ||
    a.redundantStops - b.redundantStops ||
    a.route.placeIds.length - b.route.placeIds.length ||
    a.route.meters - b.route.meters;
}

function generateRecommendation() {
  const signature = JSON.stringify({
    activities: [...state.selections.activities].sort(), time: state.selections.time,
    preferences: [...state.selections.preferences].sort()
  });
  // Viewing details/map or pressing Generate again is not a new plan.
  if (signature === state.planSignature && state.recommendedStops.length) {
    renderSuggestedOuting();
    return;
  }
  const candidates = Object.values(ROUTE_VARIANTS).filter(route => !route.hidden)
    .map(candidateItinerary).sort(compareCandidates);
  const chosen = candidates[0];
  state.selectedRouteVariant = chosen.route.id;
  state.recommendedStops = [...chosen.route.placeIds];
  state.stopRoles = chosen.roles;
  state.stopDurations = chosen.durations;
  state.planSignature = signature;
  // Remove only overrides no longer applicable to the newly selected outing.
  for (const [role, id] of Object.entries(state.manualPlaceOverrides)) {
    if (!chosen.route.placeIds.includes(id) || !state.selections.activities.includes(role)) {
      delete state.manualPlaceOverrides[role];
    }
  }
  for (const [id, edit] of Object.entries(state.manualDurations)) {
    if (!chosen.route.placeIds.includes(id) || edit.role !== chosen.roles[id]) delete state.manualDurations[id];
  }
  renderSuggestedOuting();
}

function legDistance(route, index) {
  return geometryDistance(route.coordinates.slice(route.stopIndexes[index], route.stopIndexes[index + 1] + 1));
}

function routeSummary(route) {
  return [`${itineraryTiming(route).totalMinutes} min total`, `${route.distanceKm.toFixed(1)} km`,
    `${route.placeIds.length} ${route.placeIds.length === 1 ? 'stop' : 'stops'}`];
}

function timeMessage(route) {
  const timing = itineraryTiming(route);
  const {uncoveredActivities} = activityCoverage(route);
  const messages = [];
  if (uncoveredActivities.length) messages.push(`Not included: ${uncoveredActivities.join(', ')}.`);
  const over = timing.totalMinutes - availableMinutes();
  if (over > 0) {
    messages.push(`${over} min over your planned time. ${state.selections.time} is a little tight for this outing.`);
  } else if (route.placeIds.some(id => !state.manualDurations[id] &&
    state.stopDurations[id] < ACTIVITY_DURATIONS[state.stopRoles[id]].default)) {
    messages.push('Shorter visits to fit your time.');
  }
  return messages.join(' ');
}

function renderSuggestedOuting() {
  const route = ROUTE_VARIANTS[state.selectedRouteVariant];
  const timing = itineraryTiming(route);
  document.querySelectorAll('#suggested-screen .summary-chips span').forEach((chip, index) => {
    chip.textContent = routeSummary(route)[index];
  });
  document.querySelector('#time-breakdown').textContent =
    `${timing.travelMinutes} min travel + ${timing.activityMinutes} min visits / leisure` +
    (timing.riverCredit ? ` · ${timing.riverCredit} min of riverside activity is already on the route.` : '');
  document.querySelector('#plan-time-message').textContent = timeMessage(route);
  document.querySelector('#plan-time-message').hidden = !timeMessage(route);
  document.querySelector('#increase-time').hidden = timing.totalMinutes <= availableMinutes();
  document.querySelector('#itinerary').innerHTML = route.placeIds.map((id, index) => {
    const place = PLACES[id];
    const roles = place.activities.filter(activity => state.selections.activities.includes(activity));
    const canChange = alternativesFor(place).length > 0;
    // Separate buttons avoid nested interactive controls: duration and Change
    // never bubble into the place-details action.
    const card = `<article class="stop-row"><div class="stop-number">${index + 1}</div>
      <div class="stop-card itinerary-card${canChange ? ' can-change' : ''}" data-card="${id}">
        <div class="stop-title-line"><button class="place-name" type="button" data-detail="${id}">${place.name}</button>
        <button class="duration-button" type="button" data-duration="${id}" aria-label="Change duration for ${place.name}">${state.stopDurations[id]} min <span aria-hidden="true">⌄</span></button></div>
        <button class="place-context" type="button" data-detail="${id}">${roles.join(' · ') || place.type}<span class="stop-meta">${placeComparison(place)}</span></button>
        ${canChange ? `<button class="inline-change" type="button" data-change="${id}">↻ Change</button>` : ''}
      </div></article>`;
    if (index === route.placeIds.length - 1) return card;
    const meters = legDistance(route, index);
    const minutes = Math.round(meters / route.meters * route.travelMinutes);
    return `${card}<div class="walk-separator"><span>⌁</span><span>${minutes} min walk</span><span class="distance">${recommendationDistance(meters)}</span></div>`;
  }).join('');
  document.querySelector('.suggested-weather span:last-child').textContent = '27°C · Partly cloudy · Good for a walk';
}

function replacementRoute(currentId, replacementId) {
  const current = ROUTE_VARIANTS[state.selectedRouteVariant];
  const desired = current.placeIds.map(id => id === currentId ? replacementId : id);
  return Object.values(ROUTE_VARIANTS).find(route => !route.hidden &&
    route.placeIds.length === desired.length && route.placeIds.every((id, index) => id === desired[index]));
}

function alternativesFor(place) {
  // An alternative must preserve every selected activity assigned to this stop,
  // its current role, the other stops AND their order on a supported route.
  const required = place.activities.filter(activity => state.selections.activities.includes(activity));
  const role = state.stopRoles[place.id] || stopRole(place.id);
  return PLACE_LIST.filter(candidate => candidate.id !== place.id &&
    candidate.activities.includes(role) && required.every(a => candidate.activities.includes(a)) &&
    replacementRoute(place.id, candidate.id));
}

function placeComparison(place) {
  const traits = [];
  if (place.quietScore >= 4) traits.push('Quieter');
  if (place.dogSocialScore >= 4) traits.push('More social');
  if (place.waterAvailable) traits.push('Water available');
  if (place.facilities.includes('Outdoor seating')) traits.push('Outdoor seating');
  return traits.slice(0, 2).join(' · ') || place.dogInfo[0];
}

let detailPlaceId = null;
let detailOpener = null;

function openPlaceDetails(id, showAlternatives = false) {
  const place = PLACES[id];
  detailPlaceId = id;
  detailOpener = document.activeElement;
  document.querySelector('#place-type').textContent = place.type;
  document.querySelector('#place-title').textContent = place.name;
  document.querySelector('#place-rating').textContent = place.prototypeRating
    ? `★ ${place.prototypeRating.toFixed(1)} · Prototype rating` : 'Prototype place information';
  document.querySelector('#place-description').textContent = place.shortDescription;
  document.querySelector('#dog-facts').innerHTML = place.dogInfo.slice(0, 3).map(fact => `<span>✓ ${fact}</span>`).join('');
  document.querySelector('#visit-duration').textContent = `Planned duration · ${state.stopDurations[id]} min`;
  document.querySelector('#google-maps-link').href =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.googleMapsQuery)}`;
  const alternatives = alternativesFor(place);
  document.querySelector('#change-place').hidden = alternatives.length === 0;
  document.querySelector('#place-alternatives').hidden = !showAlternatives;
  document.querySelector('#alternative-list').innerHTML = alternatives.map(candidate =>
    `<button type="button" class="alternative-place" data-place-id="${candidate.id}"><strong>${candidate.name}</strong><span>${placeComparison(candidate)} · ${state.stopDurations[id]} min</span></button>`
  ).join('');
  document.querySelector('#place-backdrop').classList.remove('is-hidden');
  document.querySelector('#close-place').focus();
}

function closePlaceDetails() {
  document.querySelector('#place-backdrop').classList.add('is-hidden');
  if (detailOpener?.isConnected) detailOpener.focus();
}

function changePlace(replacementId) {
  const currentId = detailPlaceId;
  if (!alternativesFor(PLACES[currentId]).some(place => place.id === replacementId)) return;
  const route = replacementRoute(currentId, replacementId);
  const role = state.stopRoles[currentId];
  state.stopDurations[replacementId] = state.stopDurations[currentId];
  state.stopRoles[replacementId] = role;
  if (state.manualDurations[currentId]) state.manualDurations[replacementId] = {...state.manualDurations[currentId]};
  delete state.stopDurations[currentId];
  delete state.stopRoles[currentId];
  delete state.manualDurations[currentId];
  state.manualPlaceOverrides[role] = replacementId;
  state.selectedRouteVariant = route.id;
  state.recommendedStops = [...route.placeIds];
  // Replacement is a direct role swap, never a new recommendation run.
  renderSuggestedOuting();
  closePlaceDetails();
  document.querySelector(`[data-change="${replacementId}"]`)?.focus();
  showToast(`${PLACES[replacementId].name} added to your outing.`);
}

let durationPlaceId = null;
let durationDraft = null;

function openDuration(id) {
  durationPlaceId = id;
  durationDraft = state.stopDurations[id];
  const config = ACTIVITY_DURATIONS[state.stopRoles[id]];
  const choices = [...new Set([...config.options, durationDraft])].sort((a, b) => a - b);
  document.querySelector('#duration-title').textContent = PLACES[id].name;
  document.querySelector('#duration-options').innerHTML = choices.map(minutes =>
    `<button type="button" class="editor-option${minutes === durationDraft ? ' selected' : ''}" aria-pressed="${minutes === durationDraft}" data-minutes="${minutes}"><span>${minutes} min</span><span class="check" aria-hidden="true">✓</span></button>`
  ).join('');
  document.querySelector('#duration-backdrop').classList.remove('is-hidden');
  document.querySelector('#duration-options .selected').focus();
}

function closeDuration() {
  document.querySelector('#duration-backdrop').classList.add('is-hidden');
  document.querySelector(`[data-duration="${durationPlaceId}"]`)?.focus();
}

document.querySelector('#itinerary').addEventListener('click', event => {
  const duration = event.target.closest('[data-duration]');
  const change = event.target.closest('[data-change]');
  const detail = event.target.closest('[data-detail]');
  if (duration) openDuration(duration.dataset.duration);
  else if (change) openPlaceDetails(change.dataset.change, true);
  else if (detail) openPlaceDetails(detail.dataset.detail);
  else if (event.target.closest('[data-card]')) openPlaceDetails(event.target.closest('[data-card]').dataset.card);
});
document.querySelector('#duration-options').addEventListener('click', event => {
  const option = event.target.closest('[data-minutes]');
  if (!option) return;
  durationDraft = Number(option.dataset.minutes);
  document.querySelectorAll('#duration-options button').forEach(button => {
    const selected = Number(button.dataset.minutes) === durationDraft;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
});
document.querySelector('#save-duration').onclick = () => {
  state.stopDurations[durationPlaceId] = durationDraft;
  state.manualDurations[durationPlaceId] = {role: state.stopRoles[durationPlaceId], minutes: durationDraft};
  renderSuggestedOuting();
  closeDuration();
};
document.querySelector('#close-duration').onclick = closeDuration;
document.querySelector('#duration-backdrop').addEventListener('click', event => {
  if (event.target.id === 'duration-backdrop') closeDuration();
});
document.querySelector('#close-place').onclick = closePlaceDetails;
document.querySelector('#dismiss-place').onclick = closePlaceDetails;
document.querySelector('#place-backdrop').addEventListener('click', event => {
  if (event.target.id === 'place-backdrop') closePlaceDetails();
});
document.querySelector('#change-place').onclick = () => { document.querySelector('#place-alternatives').hidden = false; };
document.querySelector('#alternative-list').addEventListener('click', event => {
  const alternative = event.target.closest('.alternative-place');
  if (alternative) changePlace(alternative.dataset.placeId);
});
document.querySelector('#increase-time').onclick = () => {
  // Open the existing time picker; no forced regeneration or lost manual edits.
  showScreen('plan');
  openEditor('time');
};

// Keep keyboard focus in either new sheet. Escape cancels a duration draft.
for (const [id, close] of [['duration-backdrop', closeDuration], ['place-backdrop', closePlaceDetails]]) {
  document.getElementById(id).addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll('button, a[href]')]
      .filter(element => !element.hidden && !element.closest('[hidden]'));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

generateRecommendation();
