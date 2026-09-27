import { currentUser, ridePreferences, wheelSpecs } from '../constants/data';

export const LEGACY_LOCAL_ID = 'user-001';
export const rideTypes = ['Voie verte', 'Forêt', 'Chemins / VTT', 'Route', 'Urbain', 'Tourisme', 'Longue distance'];
export type Profile = { name: string; username: string; location: string; age: string; practiceYears: string; level: string; bio: string };
export type Wheel = { name: string; battery: string; range: string; terrain: string };
export type WheelKey = 'main' | 'second';
export type Wheels = Record<WheelKey, Wheel>;
export const emptyDraft = { title: '', date: '', time: '', departure: '', type: 'Voie verte', distance: '', level: 'Tous niveaux', maxParticipants: '', description: '' };
export type RideDraft = typeof emptyDraft;
export type Ride = RideDraft & { id: string };
export type UserData = { profile: Profile | null; preferences: string[] | null; wheels: Wheels | null; rides: Ride[] };

export const legacyProfile: Profile = {
  name: currentUser.firstName, username: currentUser.username,
  location: `${currentUser.city} · ${currentUser.department} (30)`,
  age: String(currentUser.age), practiceYears: String(currentUser.practiceYears),
  level: currentUser.level, bio: currentUser.bio,
};
export function profileDefaults(local: boolean, name = ''): Profile {
  return local ? { ...legacyProfile } : { name, username: '', location: '', age: '', practiceYears: '0', level: 'Tous niveaux', bio: '' };
}
export function wheelDefaults(local: boolean): Wheels {
  return local ? { main: { ...wheelSpecs.main }, second: { ...wheelSpecs.second } }
    : { main: { name: '', battery: '', range: '', terrain: '' }, second: { name: '', battery: '', range: '', terrain: '' } };
}
export const legacyPreferences = ridePreferences.slice(0, 2);
export const emptyUserData = (): UserData => ({ profile: null, preferences: null, wheels: null, rides: [] });
function strings(value: unknown, keys: string[]): value is Record<string, string> {
  return !!value && typeof value === 'object' && keys.every(key => typeof (value as Record<string, unknown>)[key] === 'string');
}
export function isProfile(value: unknown): value is Profile {
  if (!strings(value, ['name', 'username', 'location', 'age', 'practiceYears', 'level', 'bio'])) return false;
  const age = value.age.trim();
  const practiceYears = value.practiceYears.trim();
  if (age && (!/^\d+$/.test(age) || Number(age) < 1 || Number(age) > 120)) return false;
  if (practiceYears && (!/^\d+$/.test(practiceYears) || Number(practiceYears) < 0)) return false;
  if (age && practiceYears && Number(practiceYears) > Number(age)) return false;
  return true;
}
export function isWheel(value: unknown): value is Wheel {
  const keys = ['name', 'battery', 'range', 'terrain'];
  return strings(value, keys) && (keys.every(key => value[key].trim().length > 0) || keys.every(key => value[key] === ''));
}
export function rideDate(date: string, time: string): Date | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [day, month, year] = date.split('/').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const result = new Date(year, month - 1, day, hour, minute);
  return year >= 2000 && result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day && result.getHours() === hour && result.getMinutes() === minute ? result : null;
}
export function validationError(draft: RideDraft): string | null {
  if (Object.keys(emptyDraft).some(key => !draft[key as keyof RideDraft].trim())) return 'Remplissez tous les champs pour créer votre sortie.';
  if (!rideDate(draft.date, draft.time)) return 'Indiquez une date valide au format JJ/MM/AAAA et une heure au format HH:MM.';
  if (!rideTypes.includes(draft.type)) return 'Sélectionnez un type de balade.';
  if (!/^\d+([.,]\d+)?$/.test(draft.distance) || !Number.isFinite(Number(draft.distance.replace(',', '.'))) || Number(draft.distance.replace(',', '.')) <= 0) return 'La distance doit être un nombre supérieur à zéro (exemple : 12,5).';
  if (!/^\d+$/.test(draft.maxParticipants) || !Number.isSafeInteger(Number(draft.maxParticipants)) || Number(draft.maxParticipants) < 1) return 'Le nombre maximum de participants doit être un entier supérieur à zéro.';
  return null;
}
export function isRide(value: unknown): value is Ride {
  return strings(value, ['id', ...Object.keys(emptyDraft)]) && value.id.length > 0 && validationError(value as Ride) === null;
}
export function isUserData(value: unknown): value is UserData {
  if (!value || typeof value !== 'object') return false;
  const data = value as UserData;
  return (data.profile === null || isProfile(data.profile)) &&
    (data.preferences === null || (Array.isArray(data.preferences) && data.preferences.every(item => rideTypes.includes(item)) && new Set(data.preferences).size === data.preferences.length)) &&
    (data.wheels === null || (!!data.wheels && isWheel(data.wheels.main) && isWheel(data.wheels.second))) &&
    Array.isArray(data.rides) && data.rides.every(isRide) && new Set(data.rides.map(ride => ride.id)).size === data.rides.length;
}
