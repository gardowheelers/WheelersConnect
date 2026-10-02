import { getSupabase } from '../lib/supabase';
import { isUserData, type UserData } from './models';
import { archiveSnapshot, readSnapshot, withDataLock, writeSnapshot } from './local-store';

type RemoteSnapshot = { user_id: string; revision: number; data: UserData };
export class SyncConflictError extends Error {
  constructor() { super('Une autre version existe sur Supabase. Votre copie locale est conservée.'); }
}
async function requireOwner(owner: string) {
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== owner) throw new Error('Reconnectez-vous à ce compte avant de synchroniser.');
  return client;
}
export async function readRemoteSnapshot(owner: string): Promise<RemoteSnapshot> {
  const client = await requireOwner(owner);
  const { data, error } = await client.rpc('read_user_data', { p_user_id: owner });
  if (error) throw new Error('Lecture Supabase impossible. Vérifiez la connexion et l’installation de la base de données.');
  if (!data || data.user_id !== owner || !Number.isSafeInteger(data.revision) || data.revision < 0 || !isUserData(data.data)) {
    throw new Error('Données distantes invalides : votre copie locale est conservée.');
  }
  return data as RemoteSnapshot;
}
export async function syncAccount(owner: string, archiveAndDownload = false) {
  return withDataLock(owner, async () => {
    const local = await readSnapshot(owner);
    const remote = await readRemoteSnapshot(owner);
    if (archiveAndDownload) {
      await archiveSnapshot(owner, local);
      await requireOwner(owner);
      await writeSnapshot(owner, { ...local, data: remote.data, revision: remote.revision, dirty: false });
      return 'Copie locale archivée sur cet appareil ; données Supabase récupérées.';
    }
    if (!local.dirty) {
      await requireOwner(owner);
      await writeSnapshot(owner, { ...local, data: remote.data, revision: remote.revision, dirty: false });
      return 'Données Supabase récupérées sur cet appareil.';
    }
    if ((local.revision ?? 0) !== remote.revision) throw new SyncConflictError();
    const client = await requireOwner(owner);
    const { data: revision, error } = await client.rpc('write_user_data', {
      p_user_id: owner, p_expected_revision: remote.revision, p_data: local.data,
    });
    if (error?.code === '40001') throw new SyncConflictError();
    if (error) throw new Error('Synchronisation impossible. Toutes vos modifications locales sont conservées ; réessayez.');
    if (!Number.isSafeInteger(revision) || revision !== remote.revision + 1) throw new Error('Réponse Supabase inattendue. Votre copie locale est conservée.');
    await requireOwner(owner);
    await writeSnapshot(owner, { ...local, revision, dirty: false });
    return 'Profil, préférences, roues et sorties synchronisés.';
  });
}

export async function forceUploadLocal(owner: string) {
  return withDataLock(owner, async () => {
    const local = await readSnapshot(owner);

    // On relit toujours la révision distante juste avant l'écriture.
    // Cela permet de conserver la copie locale choisie par l'utilisateur
    // sans désactiver la protection transactionnelle de Supabase.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remote = await readRemoteSnapshot(owner);
      const client = await requireOwner(owner);
      const { data: revision, error } = await client.rpc('write_user_data', {
        p_user_id: owner,
        p_expected_revision: remote.revision,
        p_data: local.data,
      });

      if (error?.code === '40001') continue;
      if (error) {
        throw new Error('Impossible de remplacer la version cloud. Votre copie locale est conservée.');
      }
      if (!Number.isSafeInteger(revision) || revision !== remote.revision + 1) {
        throw new Error('Réponse Supabase inattendue. Votre copie locale est conservée.');
      }

      await requireOwner(owner);
      await writeSnapshot(owner, { ...local, revision, dirty: false });
      return 'Cet iPhone est maintenant la version de référence. Le cloud a été mis à jour.';
    }

    throw new SyncConflictError();
  });
}
