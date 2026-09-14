// Curated prototype place pool. Coordinates and established place names are
// geographic; suitability, facilities, scores and durations are simulated.
const PLACES = {
  davies_market: {
    id: 'davies_market',
    name: 'Davies Park / West End Markets',
    type: 'Market and park',
    activities: ['Market', 'Park', 'Shopping'],
    latitude: -27.4779401,
    longitude: 153.0052478,
    shortDescription: 'A market and park stop beside the Brisbane River.',
    dogInfo: ['Shared outdoor area', 'Open space nearby'],
    facilities: ['Open space'],
    prototypeRating: 4.6,
    quietScore: 3,
    dogSocialScore: 4,
    waterAvailable: false,
    googleMapsQuery: 'Davies Park West End Brisbane'
  },
  cafe_quiet: {
    id: 'cafe_quiet',
    name: 'Quiet courtyard café',
    type: 'Prototype café stop',
    activities: ['Café or food'],
    latitude: -27.4836044,
    longitude: 153.0029929,
    shortDescription: 'A calm prototype café stop near the riverside route.',
    dogInfo: ['Outdoor seating', 'Usually quieter', 'Water available'],
    facilities: ['Outdoor seating', 'Sample water point'],
    prototypeRating: 4.6,
    quietScore: 5,
    dogSocialScore: 2,
    waterAvailable: true,
    googleMapsQuery: 'dog friendly cafe West End Brisbane Montague Road'
  },
  cafe_social: {
    id: 'cafe_social',
    name: 'Lively terrace café',
    type: 'Prototype café stop',
    activities: ['Café or food'],
    latitude: -27.4808733,
    longitude: 153.0121694,
    shortDescription: 'A livelier prototype café stop near Boundary Street.',
    dogInfo: ['Outdoor seating', 'More social atmosphere'],
    facilities: ['Outdoor seating'],
    prototypeRating: 4.5,
    quietScore: 2,
    dogSocialScore: 5,
    waterAvailable: false,
    googleMapsQuery: 'dog friendly cafe Boundary Street West End Brisbane'
  },
  riverside_path: {
    id: 'riverside_path',
    name: 'West End Riverside Path',
    type: 'Riverside walk',
    activities: ['Riverside walk'],
    latitude: -27.487076,
    longitude: 152.9972702,
    shortDescription: 'A riverside walking section through West End.',
    dogInfo: ['Open-air path', 'Good space for a steady walk'],
    facilities: ['Sample water point nearby'],
    quietScore: 4,
    dogSocialScore: 2,
    waterAvailable: true,
    googleMapsQuery: 'West End Riverside Path Brisbane'
  },
  orleigh_park: {
    id: 'orleigh_park',
    name: 'Orleigh Park',
    type: 'Park and rest stop',
    activities: ['Park', 'Dog social time'],
    latitude: -27.4898301,
    longitude: 153.0012397,
    shortDescription: 'A riverside park for a rest at the end of the outing.',
    dogInfo: ['Open park space', 'Good space for a rest', 'Dogs may be nearby'],
    facilities: ['Sample bin point nearby'],
    prototypeRating: 4.7,
    quietScore: 3,
    dogSocialScore: 5,
    waterAvailable: false,
    googleMapsQuery: 'Orleigh Park West End Brisbane'
  },
  boundary_precinct: {
    id: 'boundary_precinct',
    name: 'Boundary Street precinct',
    type: 'Shopping precinct',
    activities: ['Shopping'],
    latitude: -27.4815807,
    longitude: 153.0116593,
    shortDescription: 'A compact browsing stop in central West End.',
    dogInfo: ['Street-front activity', 'Can feel lively at busy times'],
    facilities: [],
    quietScore: 2,
    dogSocialScore: 3,
    waterAvailable: false,
    googleMapsQuery: 'Boundary Street West End Brisbane shops'
  }
};

const PLACE_LIST = Object.values(PLACES);

// Planning estimates, not venue requirements. A combined stop uses the longest
// relevant activity duration, rather than adding Market + Park + Shopping.
const ACTIVITY_DURATIONS = {
  'Café or food': {default: 30, minimum: 15, options: [15, 20, 30, 45, 60]},
  'Market': {default: 25, minimum: 15, options: [15, 20, 25, 30, 45, 60]},
  'Park': {default: 20, minimum: 10, options: [10, 15, 20, 30, 45]},
  'Dog social time': {default: 20, minimum: 10, options: [10, 15, 20, 30, 45]},
  'Shopping': {default: 20, minimum: 10, options: [10, 15, 20, 30, 45, 60]},
  'Riverside walk': {default: 20, minimum: 10, options: [10, 15, 20, 30, 45]}
};
