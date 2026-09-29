import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { isDataBusy } from '../data/local-store';
import { getSupabase, getSupabaseConfigurationError } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  owner: string;
  dataEpoch: number;
  refreshData: () => void;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [dataEpoch, setDataEpoch] = useState(0);
  useEffect(() => {
    if (getSupabaseConfigurationError()) { setReady(true); return; }
    let active = true;
    let authEventReceived = false;
    setError(null);
    const client = getSupabase();
    // No async Supabase calls inside this callback: it runs within the auth lock.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authEventReceived = true;
      setSession(nextSession);
      setReady(true);
    });
    void client.auth.getSession().then(({ data, error: issue }) => {
      if (!active) return;
      if (issue) throw issue;
      if (!authEventReceived) setSession(data.session);
      setReady(true);
    }).catch(() => {
      if (active && !authEventReceived) setError('Impossible de restaurer la session. Vérifiez votre connexion puis réessayez.');
    });
    const updateRefresh = (state: string) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    };
    const appState = Platform.OS !== 'web' ? AppState.addEventListener('change', updateRefresh) : null;
    if (Platform.OS !== 'web') updateRefresh(AppState.currentState);
    return () => {
      active = false;
      subscription.unsubscribe();
      appState?.remove();
      if (Platform.OS !== 'web') void client.auth.stopAutoRefresh();
    };
  }, [attempt]);

  const owner = session?.user.id ?? '';
  const value: AuthContextValue = {
    session, owner, dataEpoch,
    refreshData: () => setDataEpoch(epoch => epoch + 1),
    async signOut() {
      if (isDataBusy(owner)) throw new Error('Attendez la fin de la sauvegarde ou synchronisation.');
      const { error } = await getSupabase().auth.signOut({ scope: 'local' });
      if (error) throw new Error('Déconnexion impossible. Réessayez.');
      setSession(null);
    },
  };
  return <AuthContext.Provider value={value}>
    {ready ? children : <View style={styles.loading}>
      <Text style={styles.text}>{error ?? 'Restauration de votre session…'}</Text>
      {error && <Pressable accessibilityRole="button" style={styles.button} onPress={() => setAttempt(value => value + 1)}><Text style={styles.text}>Réessayer</Text></Pressable>}
    </View>}
  </AuthContext.Provider>;
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider manquant.');
  return auth;
}
const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#0D1923', justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  button: { backgroundColor: '#32C93B', padding: 16, borderRadius: 18, marginTop: 20 },
});
