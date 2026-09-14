// Leaflet owns only geographic rendering. Navigation state lives in navigation.js.
const outingMap = {
  map: null,
  routeLayer: null,
  position: null,

  init() {
    if (this.map) return;
    if (!window.L) {
      document.querySelector('#map-unavailable').hidden = false;
      return; // The rest of the prototype still works when the CDN is offline.
    }
    this.map = L.map('outing-map', {zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.5});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).on('tileerror', () => {
      document.querySelector('#map-unavailable').hidden = false;
    }).on('tileload', () => {
      document.querySelector('#map-unavailable').hidden = true;
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    OUTING_STOPS.forEach((stop, i) => {
      const marker = L.marker(stop.position, {
        icon: L.divIcon({className: 'numbered-marker', html: String(i + 1), iconSize: [27, 27]}),
        title: `${i + 1}. ${stop.name}`, keyboard: true
      }).bindPopup(`<strong>${i + 1}. ${stop.name}</strong><br>${stop.note}`).addTo(this.map);
      if (i === 0 || i === OUTING_STOPS.length - 1) {
        marker.bindTooltip(i === 0 ? 'Start' : 'Finish', {permanent: true, direction: 'right', offset: [12, 0]});
      }
    });
    OUTING_FACILITIES.forEach(facility => {
      L.marker(facility.position, {
        icon: L.divIcon({className: 'facility-marker', html: facility.symbol, iconSize: [20, 20]}),
        title: `${facility.kind} · sample facility`
      }).bindPopup(`${facility.kind} · simulated facility`).addTo(this.map);
    });
    this.position = L.circleMarker(OUTING_STOPS[0].position, {
      radius: 8, color: '#fff', weight: 3, fillColor: '#386f65', fillOpacity: 1
    });
  },

  draw(routeKey, busy = false, compare = false) {
    if (!this.map) return;
    this.routeLayer.clearLayers();
    const route = OUTING_ROUTES[routeKey];
    L.polyline(route.coordinates, {color: '#fff', weight: 8, opacity: 0.9}).addTo(this.routeLayer);
    L.polyline(route.coordinates, {color: routeKey === 'B' ? '#397d70' : '#72ac8a', weight: 5}).addTo(this.routeLayer);
    if (routeKey === 'A') {
      const [start, end] = route.busySegment;
      L.polyline(route.coordinates.slice(start, end + 1), {
        color: busy ? '#dc705c' : '#d7ae62', weight: 5
      }).addTo(this.routeLayer);
    }
    if (compare) {
      // Only the remaining alternative is shown; the shared start is already travelled.
      L.polyline(OUTING_ROUTES.B.coordinates.slice(43), {
        color: '#326b63', weight: 5, dashArray: '8 7'
      }).addTo(this.routeLayer);
    }
  },

  review() {
    this.init();
    if (!this.map) return;
    this.map.invalidateSize();
    this.draw('A');
    this.position.remove();
    this.map.fitBounds(OUTING_ROUTES.A.coordinates, {padding: [27, 30], animate: false});
  },

  focus(routeKey, index, compare = false) {
    if (!this.map) return;
    this.map.invalidateSize();
    const route = OUTING_ROUTES[routeKey];
    const point = route.coordinates[index];
    this.position.setLatLng(point).addTo(this.map).bringToFront();
    if (compare) {
      this.map.fitBounds([
        ...OUTING_ROUTES.A.coordinates.slice(43, 120),
        ...OUTING_ROUTES.B.coordinates.slice(43, 136)
      ], {padding: [25, 25], animate: false});
    } else {
      // Retain a stable zoom. Offset the centre a little ahead of the walker.
      const ahead = route.coordinates[Math.min(index + 8, route.coordinates.length - 1)];
      this.map.setView([(point[0] + ahead[0]) / 2, (point[1] + ahead[1]) / 2], 16, {animate: false});
    }
  }
};
