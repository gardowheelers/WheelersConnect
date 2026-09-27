import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export function getSupabaseConfigurationError(): string | null {
  if (!url && !key) return 'Supabase n’est pas encore configuré. Le mode local reste disponible.';
  if (!url || !key) return 'Renseignez l’URL et la clé publique Supabase dans les variables d’environnement.';
  try {
    if (new URL(url).protocol !== 'https:') return 'L’URL Supabase doit utiliser HTTPS.';
  } catch { return 'L’URL Supabase est invalide.'; }
  if (key.startsWith('sb_publishable_')) return null;
  // Older projects provide an anon JWT instead of a publishable key.
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role === 'anon') return null;
  } catch { /* Not an anon key. */ }
  return 'Utilisez uniquement une clé publique publishable ou anon, jamais une clé secrète.';
}

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  const error = getSupabaseConfigurationError();
  if (error) throw new Error(error);
  if (!client) client = createClient(url, key, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
