// Deterministic demo state. Starting again always resets the one-time crowd event.
const navigation = {route: 'A', step: 0, active: false, busy: false, decided: false, alert: false};
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
  return coordinates.slice(1).reduce((sum, point, i) => sum + geoDistance(coordinates[i], point), 0);
}

function enterMap() {
  [planScreen, suggestedScreen, planActions, suggestedActions].forEach(el => el.classList.add('is-hidden'));
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
  enterMap();
  navigation.active = false;
  document.querySelector('.app-frame').classList.remove('navigating');
  navigationSheet.hidden = true;
  document.querySelector('#review-actions').hidden = false;
  document.querySelector('#route-badge').hidden = true;
  document.querySelector('#map-title').textContent = 'Route map';
  document.querySelector('#map-context').textContent = `West End, Brisbane · ${formatDistance(OUTING_ROUTES.A.meters)}`;
  document.querySelector('#review-summary').textContent = `43 min walk · 2.6 km · 4 stops`;
  requestAnimationFrame(() => outingMap.review());
}

function startNavigation() {
  enterMap();
  Object.assign(navigation, {route: 'A', step: 0, active: true, busy: false, decided: false, alert: false});
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
  const route = OUTING_ROUTES[navigation.route];
  const index = route.steps[navigation.step];
  const point = route.coordinates[index];
  const remainingMeters = routeDistance(route.coordinates.slice(index));
  const remainingMinutes = Math.ceil(remainingMeters / route.meters * route.minutes);
  const nextStop = route.stopIndexes.findIndex(stopIndex => stopIndex > index);
  const finished = index === route.coordinates.length - 1;
  document.querySelector('#map-title').textContent = finished ? 'Outing complete' : OUTING_STOPS[nextStop].short;
  const toStop = finished ? 0 : routeDistance(route.coordinates.slice(index, route.stopIndexes[nextStop] + 1));
  document.querySelector('#map-context').textContent = finished ? 'You’ve reached Orleigh Park' : `${formatDistance(toStop)} · Follow the ${navigation.route === 'B' && nextStop === 2 ? 'quieter inland route' : 'highlighted route'}`;
  document.querySelector('#route-badge').hidden = navigation.route !== 'B';
  document.querySelector('#remaining-time').textContent = `${remainingMinutes} min`;
  document.querySelector('#remaining-distance').textContent = formatDistance(remainingMeters);
  OUTING_FACILITIES.forEach(facility => {
    document.querySelector(`#${facility.kind.toLowerCase()}-distance`).textContent = formatDistance(geoDistance(point, facility.position));
  });
  document.querySelector('#upcoming-stops').innerHTML = OUTING_STOPS.map((stop, i) => {
    if (route.stopIndexes[i] <= index) return '';
    return `<li><span class="stop-number">${i + 1}</span><div><strong>${stop.short}</strong><p>${stop.note}</p></div></li>`;
  }).join('') || '<li>All four stops completed</li>';
  const preference = String(state.selections.preferences).toLowerCase();
  document.querySelector('#dog-context').textContent = `Milo · ${preference}. ${navigation.route === 'B' ? 'Quieter route selected.' : navigation.busy ? 'Busy corridor ahead.' : 'Route is currently quiet to moderate.'}`;
  document.querySelector('#next-step').disabled = finished || navigation.alert;
  document.querySelector('#next-step').textContent = finished ? 'All stops reached' : `Next demo step →`;
  outingMap.draw(navigation.route, navigation.busy, navigation.alert);
  outingMap.focus(navigation.route, index, navigation.alert);
}

function advanceNavigation() {
  if (!navigation.active || navigation.alert) return;
  const route = OUTING_ROUTES[navigation.route];
  if (navigation.step >= route.steps.length - 1) return;
  navigation.step += 1;
  // The crowd change happens once per outing, at the common café departure node.
  if (navigation.step === CROWD_TRIGGER_STEP && !navigation.decided) {
    navigation.busy = true;
    navigation.alert = true;
    mapScreen.classList.add('alert-open');
    crowdOverlay.hidden = false;
    document.querySelector('#crowd-dog-context').textContent = String(state.selections.preferences).includes('quieter') ? 'Milo prefers quieter areas.' : 'A quieter option is available for Milo.';
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
  // Both routes share steps 0–2 exactly, so switching cannot teleport the walker.
  navigation.decided = true;
  if (switchRoute) navigation.route = 'B';
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
  requestAnimationFrame(() => outingMap.focus(navigation.route, OUTING_ROUTES[navigation.route].steps[navigation.step]));
};
document.querySelector('#recenter-map').onclick = () => navigation.active ? renderNavigation() : outingMap.review();
crowdOverlay.addEventListener('keydown', event => {
  if (event.key === 'Escape') decideRoute(false);
  if (event.key === 'Tab') {
    event.preventDefault();
    (document.activeElement.id === 'switch-route' ? document.querySelector('#keep-route') : document.querySelector('#switch-route')).focus();
  }
});

// Keep the existing suggestion layout, but align its route summary with real geometry.
const summaryChips = document.querySelectorAll('#suggested-screen .summary-chips span');
summaryChips[0].textContent = '43 min walk';
summaryChips[1].textContent = '2.6 km';
const walkRows = document.querySelectorAll('.walk-separator');
walkRows.forEach((row, i) => {
  const route = OUTING_ROUTES.A;
  const meters = routeDistance(route.coordinates.slice(route.stopIndexes[i], route.stopIndexes[i + 1] + 1));
  row.children[1].textContent = `${Math.round(meters / 60)} min walk`;
  row.children[2].textContent = formatDistance(meters);
});
