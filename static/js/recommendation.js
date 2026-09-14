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
  const activityFit = state.selections.activities.reduce((score, activity) => {
    const best = route.placeIds.reduce((value, id) => Math.max(value, PLACES[id].activityFit?.[activity] || 0), 0);
    return score + best;
  }, 0);
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
    route, roles, durations, ...coverage, ...timing, dogScore, activityFit,
    overMinutes: Math.max(0, timing.totalMinutes - availableMinutes()),
    redundantStops: route.placeIds.length - needed,
    overridesKept: Object.values(state.manualPlaceOverrides).filter(id => route.placeIds.includes(id)).length,
    shortened: route.placeIds.some(id => durations[id] < defaults[id])
  };
}

function compareCandidates(a, b) {
  // 1 coverage; 2 time feasibility / least overrun; 3 explicit user choices;
  // 4 activity-specific fit; 5 dog suitability; 6 unnecessary stops; 7 distance.
  // All geometry has already been curated, so there is no straight-line routing.
  return b.coveredActivities.length - a.coveredActivities.length ||
    a.overMinutes - b.overMinutes ||
    b.overridesKept - a.overridesKept ||
    b.activityFit - a.activityFit ||
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
  if (state.planSignature !== null) {
    state.manualPlaceOverrides = {};
    state.manualDurations = {};
    state.manuallyAddedStops = [];
    state.manuallyRemovedStopIds = [];
  }
  const candidates = Object.values(ROUTE_VARIANTS).filter(route => !route.hidden && !route.manualEdit &&
    (!route.planningRequires || route.planningRequires.every(activity => state.selections.activities.includes(activity))))
    .map(candidateItinerary).sort(compareCandidates);
  const chosen = candidates[0];
  state.selectedRouteVariant = chosen.route.id;
  state.recommendedStops = [...chosen.route.placeIds];
  state.systemRecommendedStops = [...chosen.route.placeIds];
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
    const selectedRoles = place.activities.filter(activity => state.selections.activities.includes(activity));
    const roles = selectedRoles.length ? selectedRoles : [state.stopRoles[id]];
    const canChange = alternativesFor(place).length > 0;
    // Separate buttons avoid nested interactive controls: duration and Change
    // never bubble into the place-details action.
    const card = `<article class="stop-row"><div class="stop-number">${index + 1}</div>
      <div class="stop-card itinerary-card${canChange ? ' can-change' : ''}" data-card="${id}">
        <div class="stop-title-line"><button class="place-name" type="button" data-detail="${id}">${place.name}</button>
        <button class="duration-button" type="button" data-duration="${id}" aria-label="Change duration for ${place.name}">${state.stopDurations[id]} min <span aria-hidden="true">⌄</span></button></div>
        <button class="place-context" type="button" data-detail="${id}">${roles.join(' · ') || place.type}<span class="stop-meta">${placeComparison(place)}</span></button>
        <div class="stop-utilities">
          ${canChange ? `<button class="inline-change" type="button" data-change="${id}">↻ Change</button>` : '<span></span>'}
          ${route.placeIds.length > 1 ? `<button class="inline-remove" type="button" data-remove="${id}">Remove</button>` : ''}
        </div>
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

function exactRouteForStops(placeIds) {
  return Object.values(ROUTE_VARIANTS).filter(route => !route.hidden && !route.manualEdit &&
    route.placeIds.length === placeIds.length && route.placeIds.every((id, index) => id === placeIds[index]))
    .sort((a, b) => a.travelMinutes - b.travelMinutes)[0];
}

function editedSubsetRoute(placeIds) {
  const exact = exactRouteForStops(placeIds);
  if (exact) return exact;
  const source = ROUTE_VARIANTS[state.selectedRouteVariant];
  const positions = placeIds.map(id => source.placeIds.indexOf(id));
  if (positions.some(position => position < 0) || positions.some((position, index) => index && position <= positions[index - 1])) return null;
  const first = source.stopIndexes[positions[0]];
  const last = source.stopIndexes[positions[positions.length - 1]];
  const coordinates = source.coordinates.slice(first, last + 1);
  const id = `manual_${source.id}_${placeIds.join('_')}`;
  const route = {
    id, label: 'Manually edited outing', manualEdit: true, placeIds, coordinates,
    stopIndexes: positions.map(position => source.stopIndexes[position] - first),
    meters: Math.round(geometryDistance(coordinates))
  };
  route.estimatedMinutes = Math.ceil(route.meters / 60);
  route.travelMinutes = route.estimatedMinutes;
  route.distanceKm = Math.round(route.meters / 100) / 10;
  route.navigationSteps = buildNavigationSteps(route);
  const river = route.placeIds.indexOf('riverside_path');
  const park = route.placeIds.indexOf('orleigh_park');
  route.riversideTravelMinutes = river >= 0 && park === river + 1
    ? Math.min(route.travelMinutes, Math.round(geometryDistance(
      route.coordinates.slice(route.stopIndexes[river], route.stopIndexes[park] + 1)
    ) / 60)) : 0;
  ROUTE_VARIANTS[id] = route;
  attachCrowdAlternative(route);
  return route;
}

function setEditedRoute(route) {
  state.selectedRouteVariant = route.id;
  state.recommendedStops = [...route.placeIds];
  renderSuggestedOuting();
}

let removePlaceId = null;

function removeCoverageLoss(id) {
  const remaining = state.recommendedStops.filter(placeId => placeId !== id);
  return activityCoverage({placeIds: remaining}).uncoveredActivities;
}

function requestRemoveStop(id) {
  if (state.recommendedStops.length === 1) return;
  removePlaceId = id;
  const lost = removeCoverageLoss(id);
  if (!lost.length) return removeStop(id);
  document.querySelector('#remove-title').textContent = `Remove ${PLACES[id].name}?`;
  document.querySelector('#remove-message').textContent = `Your outing will no longer include: ${lost.join(', ')}.`;
  document.querySelector('#remove-backdrop').classList.remove('is-hidden');
  document.querySelector('#confirm-remove').focus();
}

function removeStop(id) {
  const remaining = state.recommendedStops.filter(placeId => placeId !== id);
  const route = editedSubsetRoute(remaining);
  if (!route) return showToast('This stop cannot be removed from the curated route.');
  const wasManuallyAdded = state.manuallyAddedStops.includes(id);
  if (!wasManuallyAdded && !state.manuallyRemovedStopIds.includes(id)) state.manuallyRemovedStopIds.push(id);
  state.manuallyAddedStops = state.manuallyAddedStops.filter(placeId => placeId !== id);
  delete state.stopDurations[id];
  delete state.stopRoles[id];
  delete state.manualDurations[id];
  Object.keys(state.manualPlaceOverrides).forEach(role => {
    if (state.manualPlaceOverrides[role] === id) delete state.manualPlaceOverrides[role];
  });
  document.querySelector('#remove-backdrop').classList.add('is-hidden');
  setEditedRoute(route);
  showToast(`${PLACES[id].name} removed.`);
}

function additionRoute(candidateId) {
  const current = state.recommendedStops;
  return Object.values(ROUTE_VARIANTS).filter(route => !route.hidden && !route.manualEdit &&
    route.placeIds.length === current.length + 1 && route.placeIds.includes(candidateId) &&
    route.placeIds.filter(id => id !== candidateId).every((id, index) => id === current[index]))
    .sort((a, b) => a.travelMinutes - b.travelMinutes)[0];
}

function placePreferenceScore(place) {
  let score = 0;
  if (state.selections.preferences.includes('Prefers quieter areas')) score += place.quietScore * DOG_WEIGHTS.quiet;
  if (state.selections.preferences.includes('Enjoys meeting other dogs')) score += place.dogSocialScore * DOG_WEIGHTS.social;
  if (state.selections.preferences.includes('Needs regular water stops') && place.waterAvailable) score += DOG_WEIGHTS.water;
  return score;
}

function additionCandidates(category) {
  const currentRoute = ROUTE_VARIANTS[state.selectedRouteVariant];
  const currentTotal = itineraryTiming(currentRoute).totalMinutes;
  return PLACE_LIST.filter(place => !state.recommendedStops.includes(place.id) && place.activities.includes(category))
    .map(place => {
      const route = additionRoute(place.id);
      if (!route) return null;
      const durations = {...state.stopDurations, [place.id]: ACTIVITY_DURATIONS[category].default};
      const total = itineraryTiming(route, durations).totalMinutes;
      return {
        place, route, duration: ACTIVITY_DURATIONS[category].default,
        addedMinutes: Math.max(0, total - currentTotal),
        overMinutes: Math.max(0, total - availableMinutes()),
        preferenceScore: placePreferenceScore(place),
        distanceImpact: Math.max(0, route.meters - currentRoute.meters)
      };
    }).filter(Boolean).sort((a, b) =>
      Boolean(a.overMinutes) - Boolean(b.overMinutes) ||
      a.addedMinutes - b.addedMinutes ||
      b.preferenceScore - a.preferenceScore ||
      a.distanceImpact - b.distanceImpact
    );
}

let addCategory = null;
let addOpener = null;

function supportedAddCategories() {
  return Object.keys(ACTIVITY_DURATIONS).filter(category => additionCandidates(category).length);
}

function openAddStop() {
  addOpener = document.activeElement;
  addCategory = null;
  document.querySelector('#add-stop-step').textContent = 'Add a stop';
  document.querySelector('#add-stop-title').textContent = 'What would you like to add?';
  document.querySelector('#add-stop-back').hidden = true;
  document.querySelector('#add-stop-options').innerHTML = supportedAddCategories().map(category =>
    `<button class="editor-option" type="button" data-add-category="${category}"><span>${category}</span><span aria-hidden="true">›</span></button>`
  ).join('') || '<p class="sheet-help">No more stops are supported by this curated route.</p>';
  document.querySelector('#add-stop-backdrop').classList.remove('is-hidden');
  document.querySelector('#add-stop-options button')?.focus();
}

function showAddCandidates(category) {
  addCategory = category;
  document.querySelector('#add-stop-step').textContent = category;
  document.querySelector('#add-stop-title').textContent = 'Recommended places';
  document.querySelector('#add-stop-back').hidden = false;
  document.querySelector('#add-stop-options').innerHTML = additionCandidates(category).map(({place, duration, addedMinutes}) =>
    `<button class="add-candidate" type="button" data-add-place="${place.id}"><strong>${place.name}</strong><span>${placeComparison(place)}</span><small>${duration} min stay · +${addedMinutes} min to outing</small></button>`
  ).join('');
  document.querySelector('#add-stop-options button')?.focus();
}

function closeAddStop() {
  document.querySelector('#add-stop-backdrop').classList.add('is-hidden');
  if (addOpener?.isConnected) addOpener.focus();
}

function addPlace(id) {
  const candidate = additionCandidates(addCategory).find(item => item.place.id === id);
  if (!candidate) return;
  state.stopRoles[id] = addCategory;
  state.stopDurations[id] = candidate.duration;
  if (!state.manuallyAddedStops.includes(id)) state.manuallyAddedStops.push(id);
  state.manuallyRemovedStopIds = state.manuallyRemovedStopIds.filter(placeId => placeId !== id);
  setEditedRoute(candidate.route);
  closeAddStop();
  showToast(`${PLACES[id].name} added.`);
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
  state.manuallyAddedStops = state.manuallyAddedStops.map(id => id === currentId ? replacementId : id);
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
  const remove = event.target.closest('[data-remove]');
  const detail = event.target.closest('[data-detail]');
  if (duration) openDuration(duration.dataset.duration);
  else if (change) openPlaceDetails(change.dataset.change, true);
  else if (remove) requestRemoveStop(remove.dataset.remove);
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
document.querySelector('#add-stop').onclick = openAddStop;
document.querySelector('#close-add-stop').onclick = closeAddStop;
document.querySelector('#add-stop-back').onclick = openAddStop;
document.querySelector('#add-stop-options').addEventListener('click', event => {
  const category = event.target.closest('[data-add-category]');
  const place = event.target.closest('[data-add-place]');
  if (category) showAddCandidates(category.dataset.addCategory);
  else if (place) addPlace(place.dataset.addPlace);
});
document.querySelector('#add-stop-backdrop').addEventListener('click', event => {
  if (event.target.id === 'add-stop-backdrop') closeAddStop();
});
document.querySelector('#confirm-remove').onclick = () => removeStop(removePlaceId);
document.querySelector('#cancel-remove').onclick = () => {
  document.querySelector('#remove-backdrop').classList.add('is-hidden');
  document.querySelector(`[data-remove="${removePlaceId}"]`)?.focus();
};
document.querySelector('#remove-backdrop').addEventListener('click', event => {
  if (event.target.id === 'remove-backdrop') document.querySelector('#cancel-remove').click();
});
document.querySelector('#increase-time').onclick = () => {
  const options = [45, 60, 90, 120];
  const total = itineraryTiming(ROUTE_VARIANTS[state.selectedRouteVariant]).totalMinutes;
  const current = availableMinutes();
  const next = options.find(minutes => minutes > current && minutes >= total) || options.find(minutes => minutes > current);
  if (!next) return;
  state.selections.time = next === 120 ? '2 hours' : `${next} min`;
  document.querySelector('#time-value').textContent = state.selections.time;
  state.planSignature = JSON.stringify({
    activities: [...state.selections.activities].sort(), time: state.selections.time,
    preferences: [...state.selections.preferences].sort()
  });
  renderSuggestedOuting();
  showToast(`Available time increased to ${state.selections.time}.`);
};

// Keep keyboard focus in either new sheet. Escape cancels a duration draft.
for (const [id, close] of [
  ['duration-backdrop', closeDuration], ['place-backdrop', closePlaceDetails],
  ['add-stop-backdrop', closeAddStop],
  ['remove-backdrop', () => document.querySelector('#cancel-remove').click()]
]) {
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
