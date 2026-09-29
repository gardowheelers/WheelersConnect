import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyUserData, isUserData, LEGACY_LOCAL_ID, type UserData } from './models';

export type LocalSnapshot = { version: 1; revision: number | null; dirty: boolean; imported: boolean; data: UserData };
const locks = new Set<string>();
export function storageKey(owner: string, section: 'profile' | 'wheels' | 'rides' | 'ride-preferences') {
  return `@wheelersconnect/${owner}/${section}/v1`;
}
const accountKey = (owner: string) => `@wheelersconnect/accounts/${owner}/data/v1`;
export function isDataBusy(owner: string) { return locks.has(owner); }
export async function withDataLock<T>(owner: string, operation: () => Promise<T>): Promise<T> {
  if (locks.has(owner)) throw new Error('Une sauvegarde ou synchronisation est en cours. Réessayez dans un instant.');
  locks.add(owner);
  try { return await operation(); } finally { locks.delete(owner); }
}
export async function readSnapshot(owner: string): Promise<LocalSnapshot> {
  const raw = await AsyncStorage.getItem(accountKey(owner));
  if (!raw) return { version: 1, revision: null, dirty: false, imported: false, data: emptyUserData() };
  const parsed = JSON.parse(raw) as LocalSnapshot;
  if (parsed.version !== 1 || (parsed.revision !== null && (!Number.isSafeInteger(parsed.revision) || parsed.revision < 0)) ||
    typeof parsed.dirty !== 'boolean' || typeof parsed.imported !== 'boolean' || !isUserData(parsed.data)) {
    throw new Error('Les données locales sont illisibles. Elles ont été conservées.');
  }
  return parsed;
}
export async function writeSnapshot(owner: string, snapshot: LocalSnapshot) {
  if (!isUserData(snapshot.data)) throw new Error('Données invalides : aucune sauvegarde effectuée.');
  // One write for the whole account avoids partially imported/downloaded sections.
  await AsyncStorage.setItem(accountKey(owner), JSON.stringify(snapshot));
}
function parseKey(key: string) {
  const match = /^@wheelersconnect\/([^/]+)\/(profile|wheels|rides|ride-preferences)\/v1$/.exec(key);
  if (!match) throw new Error('Clé de stockage inconnue.');
  return { owner: match[1], section: (match[2] === 'ride-preferences' ? 'preferences' : match[2]) as keyof UserData };
}
export const localStorage = {
  async getItem(key: string): Promise<string | null> {
    const { owner, section } = parseKey(key);
    if (owner === LEGACY_LOCAL_ID) return AsyncStorage.getItem(key);
    const value = (await readSnapshot(owner)).data[section];
    return value === null ? null : JSON.stringify(value);
  },
  async setItem(key: string, value: string) {
    const { owner, section } = parseKey(key);
    return withDataLock(owner, async () => {
      if (owner === LEGACY_LOCAL_ID) return AsyncStorage.setItem(key, value);
      const snapshot = await readSnapshot(owner);
      const data = { ...snapshot.data, [section]: JSON.parse(value) };
      await writeSnapshot(owner, { ...snapshot, data, dirty: true });
    });
  },
};

export async function importLegacyData(owner: string) {
  if (owner === LEGACY_LOCAL_ID) throw new Error('Connectez-vous avant d’importer.');
  return withDataLock(owner, async () => {
    const markerKey = '@wheelersconnect/legacy-import-owner/v1';
    const previousOwner = await AsyncStorage.getItem(markerKey);
    if (previousOwner && previousOwner !== owner) throw new Error('Les anciennes données ont déjà été attribuées à un autre compte sur cet appareil.');
    const snapshot = await readSnapshot(owner);
    if (snapshot.imported) return;
    if (snapshot.dirty || (snapshot.revision ?? 0) > 0 || JSON.stringify(snapshot.data) !== JSON.stringify(emptyUserData())) {
      throw new Error('Ce compte contient déjà des données. L’import automatique est bloqué pour les préserver.');
    }
    const sections = ['profile', 'ride-preferences', 'wheels', 'rides'] as const;
    const raw = await Promise.all(sections.map(section => AsyncStorage.getItem(storageKey(LEGACY_LOCAL_ID, section))));

    if (raw.every(value => value === null)) {
      throw new Error('Aucune ancienne donnée locale à importer.');
    }

    const empty = emptyUserData();
    const data: UserData = {
      profile: raw[0] === null ? empty.profile : JSON.parse(raw[0]),
      preferences: raw[1] === null ? empty.preferences : JSON.parse(raw[1]),
      wheels: raw[2] === null ? empty.wheels : JSON.parse(raw[2]),
      rides: raw[3] === null ? empty.rides : JSON.parse(raw[3]),
    };
    if (!isUserData(data)) throw new Error('Anciennes données invalides : aucun import effectué, originaux conservés.');
    // Reserve ownership first; a failed write can be retried by the same account.
    await AsyncStorage.setItem(markerKey, owner);
    await writeSnapshot(owner, { ...snapshot, data, imported: true, dirty: true });
  });
}
export async function archiveSnapshot(owner: string, snapshot: LocalSnapshot) {
  const key = `@wheelersconnect/accounts/${owner}/archives/${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(key, JSON.stringify(snapshot));
  return key;
}
