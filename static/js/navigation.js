// Deterministic client-side navigation state. The recommended route supplies
// geometry, stops, demo steps and (for the default scenario) crowd adaptation.
const navigation = {route: 'default_quiet', step: 0, active: false, busy: false, decided: false, alert: false};
const mapScreen = document.querySelector('#map-screen');
const navigationSheet = document.querySelector('#navigation-sheet');
const crowdOverlay = document.querySelector('#crowd-overlay');

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;
}

function geoDistance(a, b) {
  return Math.hypot((a[0] - b[0]) * 111195, (a[1] - b[1]) * 98650);
}

function routeDistance(coordinates) {
  return coordinates.slice(1).reduce((sum, point, index) => sum + geoDistance(coordinates[index], point), 0);
}

function selectedRoute() {
  return ROUTE_VARIANTS[state.selectedRouteVariant];
}

function activeRoute() {
  return ROUTE_VARIANTS[navigation.route];
}

function enterMap() {
  [planScreen, suggestedScreen, planActions, suggestedActions].forEach(element => element.classList.add('is-hidden'));
  mapScreen.classList.remove('is-hidden');
  document.querySelector('.app-frame').classList.add('map-mode');
  document.querySelector('.screen-dots').classList.add('is-hidden');
  document.querySelector('.prototype-hint').textContent = 'West End · Simulated outing';
  state.screen = 'map';
}

function closeMap() {
  navigation.active = false;
  closeCrowdAlert();
  mapScreen.classList.add('is-hidden');
  document.querySelector('.app-frame').classList.remove('map-mode', 'navigating');
  document.querySelector('.screen-dots').classList.remove('is-hidden');
  document.querySelector('.prototype-hint').textContent = 'Tap dots to jump between key screens';
  showScreen('suggested');
}

function reviewRoute() {
  const route = selectedRoute();
  enterMap();
  navigation.active = false;
  document.querySelector('.app-frame').classList.remove('navigating');
  navigationSheet.hidden = true;
  document.querySelector('#review-actions').hidden = false;
  document.querySelector('#route-badge').hidden = true;
  document.querySelector('#map-title').textContent = 'Route map';
  document.querySelector('#map-context').textContent = `West End, Brisbane · ${route.distanceKm.toFixed(1)} km`;
  document.querySelector('#review-summary').textContent = routeSummary(route).join(' · ');
  requestAnimationFrame(() => outingMap.review(route));
}

function startNavigation() {
  const route = selectedRoute();
  enterMap();
  Object.assign(navigation, {route: route.id, step: 0, active: true, busy: false, decided: false, alert: false});
  document.querySelector('.app-frame').classList.add('navigating');
  document.querySelector('#review-actions').hidden = true;
  navigationSheet.hidden = false;
  document.querySelector('#navigation-details').hidden = true;
  document.querySelector('#expand-navigation').setAttribute('aria-expanded', 'false');
  document.querySelector('#expand-navigation').textContent = '⌃ More';
  document.querySelector('#route-confirmation').hidden = true;
  requestAnimationFrame(() => {
    outingMap.init();
    renderNavigation();
  });
}

function renderNavigation() {
  const route = activeRoute();
  const coordinateIndex = route.navigationSteps[navigation.step];
  const point = route.coordinates[coordinateIndex];
  const remainingMeters = routeDistance(route.coordinates.slice(coordinateIndex));
  const remainingMinutes = Math.ceil(remainingMeters / routeDistance(route.coordinates) * route.travelMinutes);
  const upcomingIndex = route.stopIndexes.findIndex(stopIndex => stopIndex > coordinateIndex);
  const nextStop = upcomingIndex < 0 ? route.placeIds.length - 1 : upcomingIndex;
  const finished = coordinateIndex === route.coordinates.length - 1;
  const lastPlace = PLACES[route.placeIds[route.placeIds.length - 1]];
  document.querySelector('#map-title').textContent = finished ? 'Outing complete' : PLACES[route.placeIds[nextStop]].name;
  const toStop = finished ? 0 : upcomingIndex < 0 ? remainingMeters : routeDistance(route.coordinates.slice(coordinateIndex, route.stopIndexes[nextStop] + 1));
  document.querySelector('#map-context').textContent = finished ? `You’ve reached ${lastPlace.name}` : `${formatDistance(toStop)} · Follow the ${route.isPlanB ? 'quieter route' : 'highlighted route'}`;
  document.querySelector('#route-badge').hidden = !route.isPlanB;
  document.querySelector('#remaining-time').textContent = `${remainingMinutes} min`;
  document.querySelector('#remaining-distance').textContent = formatDistance(remainingMeters);
  OUTING_FACILITIES.forEach(facility => {
    document.querySelector(`#${facility.kind.toLowerCase()}-distance`).textContent = formatDistance(geoDistance(point, facility.position));
  });
  document.querySelector('#upcoming-stops').innerHTML = route.placeIds.map((placeId, index) => {
    if (route.stopIndexes[index] <= coordinateIndex) return '';
    const place = PLACES[placeId];
    return `<li><span class="stop-number">${index + 1}</span><div><strong>${place.name}</strong><p>${place.type}</p></div></li>`;
  }).join('') || `<li>All ${route.placeIds.length} ${route.placeIds.length === 1 ? 'stop' : 'stops'} completed</li>`;
  const preference = state.selections.preferences.join(', ').toLowerCase();
  document.querySelector('#dog-context').textContent = `Milo · ${preference}. ${route.isPlanB ? 'Quieter route selected.' : navigation.busy ? 'Busy corridor ahead.' : 'Route is currently quiet to moderate.'}`;
  document.querySelector('#next-step').disabled = finished || navigation.alert;
  document.querySelector('#next-step').textContent = finished ? 'All stops reached' : 'Next demo step →';
  const comparisonRoute = navigation.alert && route.planB ? ROUTE_VARIANTS[route.planB] : null;
  outingMap.draw(route, navigation.busy, comparisonRoute);
  outingMap.focus(route, coordinateIndex, comparisonRoute);
}

function advanceNavigation() {
  if (!navigation.active || navigation.alert) return;
  const route = activeRoute();
  if (navigation.step >= route.navigationSteps.length - 1) return;
  navigation.step += 1;
  if (route.crowdTriggerStep === navigation.step && !navigation.decided) {
    navigation.busy = true;
    navigation.alert = true;
    mapScreen.classList.add('alert-open');
    crowdOverlay.hidden = false;
    document.querySelector('#crowd-title-text').textContent = route.crowdAlertLabel || 'Busy area ahead';
    document.querySelector('#alternative-time').textContent = route.alternativeMinutesText;
    document.querySelector('#alternative-distance').textContent = route.alternativeDistanceText;
    document.querySelector('#crowd-dog-context').textContent = state.selections.preferences.includes('Prefers quieter areas') ? 'Milo prefers quieter areas.' : 'A quieter option is available for Milo.';
    navigationSheet.inert = true;
    document.querySelector('.map-heading').inert = true;
    document.querySelector('.map-area').style.flexBasis = '260px';
    document.querySelector('#switch-route').focus();
  }
  renderNavigation();
}

function closeCrowdAlert() {
  navigation.alert = false;
  mapScreen.classList.remove('alert-open');
  crowdOverlay.hidden = true;
  navigationSheet.inert = false;
  document.querySelector('.map-heading').inert = false;
  document.querySelector('.map-area').style.flexBasis = '';
}

function decideRoute(switchRoute) {
  if (!navigation.alert) return;
  const current = activeRoute();
  navigation.decided = true;
  if (switchRoute && current.planB) {
    const currentPoint = current.coordinates[current.navigationSteps[navigation.step]];
    const alternative = ROUTE_VARIANTS[current.planB];
    const nearestCoordinate = alternative.coordinates.reduce((best, point, index) =>
      geoDistance(currentPoint, point) < best.distance
        ? {index, distance: geoDistance(currentPoint, point)} : best,
    {index: 0, distance: Infinity}).index;
    navigation.route = current.planB;
    navigation.step = alternative.navigationSteps.reduce((best, coordinateIndex, index) =>
      Math.abs(coordinateIndex - nearestCoordinate) < best.distance
        ? {index, distance: Math.abs(coordinateIndex - nearestCoordinate)} : best,
    {index: 0, distance: Infinity}).index;
  }
  closeCrowdAlert();
  document.querySelector('#route-confirmation').hidden = !switchRoute;
  renderNavigation();
  document.querySelector('#next-step').focus();
}

document.querySelector('#map-button').onclick = reviewRoute;
document.querySelector('#start-button').onclick = startNavigation;
document.querySelector('#review-start').onclick = startNavigation;
document.querySelector('#map-back').onclick = closeMap;
document.querySelector('#end-outing').onclick = closeMap;
document.querySelector('#next-step').onclick = advanceNavigation;
document.querySelector('#switch-route').onclick = () => decideRoute(true);
document.querySelector('#keep-route').onclick = () => decideRoute(false);
document.querySelector('#expand-navigation').onclick = () => {
  const details = document.querySelector('#navigation-details');
  details.hidden = !details.hidden;
  document.querySelector('#expand-navigation').setAttribute('aria-expanded', String(!details.hidden));
  document.querySelector('#expand-navigation').textContent = details.hidden ? '⌃ More' : '⌄ Less';
  requestAnimationFrame(() => outingMap.focus(activeRoute(), activeRoute().navigationSteps[navigation.step]));
};
document.querySelector('#recenter-map').onclick = () => navigation.active ? renderNavigation() : outingMap.review(selectedRoute());
crowdOverlay.addEventListener('keydown', event => {
  if (event.key === 'Escape') decideRoute(false);
  if (event.key === 'Tab') {
    event.preventDefault();
    (document.activeElement.id === 'switch-route' ? document.querySelector('#keep-route') : document.querySelector('#switch-route')).focus();
  }
});
