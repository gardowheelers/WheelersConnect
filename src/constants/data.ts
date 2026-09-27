// Legacy offline seed only. Real account identity comes from Supabase Auth.
// Keep this seed and its storage identifier for the non-destructive migration.
export const currentUser = {
  id: 'user-001',
  firstName: 'Stéphane',
  username: '@StefWheel',
  city: 'Meynes',
  department: 'Gard',
  country: 'France',
  age: 56,
  practiceYears: 3,
  level: 'Confirmé',
  bio: 'Passionné de balades, de découverte et de belles rencontres. Toujours partant pour explorer de nouveaux spots !',
  mainWheel: 'KingSong S19 Pro',
  secondWheel: 'InMotion V12 HT',
  wheels: ['KingSong S19 Pro', 'InMotion V12 HT'],
};

export const wheelSpecs = {
  main: {
    name: 'KingSong S19 Pro',
    battery: '1776 Wh',
    range: '120 km',
    terrain: 'Tout-terrain',
  },
  second: {
    name: 'InMotion V12 HT',
    battery: '1750 Wh',
    range: 'env. 120 km',
    terrain: 'Mixte / urbain',
  },
};

export const ridePreferences = [
  'Voie verte',
  'Forêt',
  'Chemins / VTT',
  'Route',
];

export const wheelers = [
  currentUser,
];

export const rides = [];
