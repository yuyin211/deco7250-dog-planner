// Leaflet owns geographic rendering. Recommendations choose a curated route;
// navigation.js owns progression along it.
const outingMap = {
  map: null,
  activeRouteLayer: null,
  alternativeRouteLayer: null,
  busySegmentLayer: null,
  activePolyline: null,
  alternativePolyline: null,
  stopLayer: null,
  facilityLayer: null,
  position: null,

  init() {
    if (this.map) return;
    if (!window.L) {
      document.querySelector('#map-unavailable').hidden = false;
      return;
    }
    this.map = L.map('outing-map', {zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.5});
    // Initialise a viewport before adding vector layers (also on direct Start).
    this.map.setView([PLACES.davies_market.latitude, PLACES.davies_market.longitude], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).on('tileerror', () => {
      document.querySelector('#map-unavailable').hidden = false;
    }).on('tileload', () => {
      document.querySelector('#map-unavailable').hidden = true;
    }).addTo(this.map);
    this.activeRouteLayer = L.layerGroup().addTo(this.map);
    this.alternativeRouteLayer = L.layerGroup().addTo(this.map);
    this.busySegmentLayer = L.layerGroup().addTo(this.map);
    this.stopLayer = L.layerGroup().addTo(this.map);
    this.facilityLayer = L.layerGroup().addTo(this.map);
    this.position = L.circleMarker([PLACES.davies_market.latitude, PLACES.davies_market.longitude], {
      radius: 8, color: '#fff', weight: 3, fillColor: '#386f65', fillOpacity: 1
    });
  },

  renderStops(route) {
    if (!this.map) return;
    this.stopLayer.clearLayers();
    this.facilityLayer.clearLayers();
    routeFacilities(route).filter((facility,index,all) =>
      all.findIndex(other => other.kind === facility.kind) === index).forEach(facility => {
      L.marker(facility.position, {
        icon: L.divIcon({className: 'facility-marker', html: facility.symbol, iconSize: [20, 20]}),
        title: `${facility.kind} · sample waypoint`
      }).bindPopup(`${facility.kind} · simulated waypoint on this route`).addTo(this.facilityLayer);
    });
    route.placeIds.forEach((placeId, index) => {
      const place = PLACES[placeId];
      const marker = L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({className: 'numbered-marker', html: String(index + 1), iconSize: [27, 27]}),
        title: `${index + 1}. ${place.name}`,
        keyboard: true
      }).bindPopup(`<strong>${index + 1}. ${place.name}</strong><br>${place.type}`).addTo(this.stopLayer);
      if (index === 0 || index === route.placeIds.length - 1) {
        marker.bindTooltip(index === 0 ? 'Start' : 'Finish', {permanent: true, direction: 'right', offset: [12, 0]});
      }
    });
  },

  draw(route, busy = false, comparisonRoute = null) {
    if (!this.map) return;
    // Rebuild each owned layer explicitly: no old solid, dashed or busy path
    // survives a switch. The supplied active route is the only rendering source.
    this.activeRouteLayer.clearLayers();
    this.alternativeRouteLayer.clearLayers();
    this.busySegmentLayer.clearLayers();
    this.activeRouteId = route.id;
    this.alternativePolyline = null;
    L.polyline(route.coordinates, {color: '#fff', weight: 8, opacity: 0.9}).addTo(this.activeRouteLayer);
    this.activePolyline = L.polyline(route.coordinates, {color: route.isPlanB ? '#397d70' : '#508b7e', weight: 5, lineCap:'round', lineJoin:'round', dashArray: null}).addTo(this.activeRouteLayer);
    if (route.busySegment) {
      const [start, end] = route.busySegment;
      L.polyline(route.coordinates.slice(start, end + 1), {color: busy ? '#dc705c' : '#d7ae62', weight: 6}).addTo(this.busySegmentLayer);
    }
    if (comparisonRoute) {
      const sharedIndex = route.navigationSteps[navigation.step];
      const alternativeIndex = comparisonRoute.navigationSteps[route.planBSwitchStep];
      this.alternativePolyline = L.polyline(comparisonRoute.coordinates.slice(alternativeIndex), {color: '#326b63', weight: 5, dashArray: '8 7'}).addTo(this.alternativeRouteLayer);
      this.map.fitBounds([
        ...route.coordinates.slice(sharedIndex),
        ...comparisonRoute.coordinates.slice(alternativeIndex)
      ], {padding: [25, 25], animate: false});
    }
  },

  review(route) {
    this.init();
    if (!this.map) return;
    this.map.invalidateSize();
    this.renderStops(route);
    this.draw(route);
    this.position.remove();
    this.map.fitBounds(route.coordinates, {padding: [27, 30], animate: false});
  },

  focus(route, coordinateIndex, comparisonRoute = null) {
    if (!this.map) return;
    this.map.invalidateSize();
    this.renderStops(route);
    const point = route.coordinates[coordinateIndex];
    this.position.setLatLng(point).addTo(this.map).bringToFront();
    if (comparisonRoute) return;
    const ahead = route.coordinates[Math.min(coordinateIndex + 8, route.coordinates.length - 1)];
    this.map.setView([(point[0] + ahead[0]) / 2, (point[1] + ahead[1]) / 2], 16, {animate: false});
  }
};
