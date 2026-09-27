import { getSupabase } from '../lib/supabase';

export type AdminDashboard = {
  accounts: number; profiles: number; rides: number; participants: number;
  signedInLast7Days: number; generatedAt: string;
  events: { id: string; kind: string; created_at: string }[];
};
export async function readAdminDashboard(): Promise<AdminDashboard> {
  const { data, error } = await getSupabase().rpc('admin_dashboard');
  if (error) {
    if (error.code === '42501') throw new Error('Cet espace est réservé au compte administrateur autorisé.');
    if (error.code === 'PGRST202') throw new Error('Le tableau de bord doit encore être activé sur le serveur.');
    throw new Error('Impossible de joindre le tableau de bord. Vérifiez votre connexion et réessayez.');
  }
  if (!data || !Array.isArray(data.events) ||
    !['accounts', 'profiles', 'rides', 'participants', 'signedInLast7Days'].every(key =>
      Number.isSafeInteger(data[key]) && data[key] >= 0)) {
    throw new Error('Réponse du serveur invalide. Aucun compteur estimé n’est affiché.');
  }
  return data as AdminDashboard;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('is_app_admin');
  if (error) return false;
  return data === true;
}
