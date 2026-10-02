import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { isDataBusy, readSnapshot } from '../data/local-store';
import { LEGACY_LOCAL_ID } from '../data/models';
import { SyncConflictError, syncAccount } from '../data/remote-store';
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
  const autoSyncRunning = useRef(false);

  useEffect(() => {
    if (getSupabaseConfigurationError()) {
      setReady(true);
      return;
    }

    let active = true;
    let authEventReceived = false;
    setError(null);

    const client = getSupabase();

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;

      authEventReceived = true;
      setSession(nextSession);
      setReady(true);
    });

    void client.auth.getSession()
      .then(({ data, error: issue }) => {
        if (!active) return;
        if (issue) throw issue;

        if (!authEventReceived) setSession(data.session);
        setReady(true);
      })
      .catch(() => {
        if (active && !authEventReceived) {
          setError('Impossible de restaurer la session. Vérifiez votre connexion puis réessayez.');
        }
      });

    const updateRefresh = (state: string) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    };

    const appState = Platform.OS !== 'web'
      ? AppState.addEventListener('change', updateRefresh)
      : null;

    if (Platform.OS !== 'web') updateRefresh(AppState.currentState);

    return () => {
      active = false;
      subscription.unsubscribe();
      appState?.remove();

      if (Platform.OS !== 'web') void client.auth.stopAutoRefresh();
    };
  }, [attempt]);

  useEffect(() => {
    const currentUserId = session?.user.id;

    if (!currentUserId || getSupabaseConfigurationError()) return;

    const userId: string = currentUserId;

    let active = true;

    async function synchronize(force = false) {
      if (!active || autoSyncRunning.current || isDataBusy(userId)) return;

      autoSyncRunning.current = true;

      try {
        const snapshot = await readSnapshot(userId);

        if (!force && !snapshot.dirty) return;

        await syncAccount(userId);

        if (active) {
          setDataEpoch(epoch => epoch + 1);
        }
      } catch (issue) {
        if (issue instanceof SyncConflictError) return;
      } finally {
        autoSyncRunning.current = false;
      }
    }

    void synchronize(true);

    const interval = setInterval(() => {
      void synchronize(false);
    }, 5000);

    const foregroundSubscription = Platform.OS !== 'web'
      ? AppState.addEventListener('change', state => {
          if (state === 'active') void synchronize(true);
        })
      : null;

    return () => {
      active = false;
      clearInterval(interval);
      foregroundSubscription?.remove();
    };
  }, [session?.user.id]);


  useEffect(() => {
    const currentUserId = session?.user.id;

    if (!currentUserId || getSupabaseConfigurationError()) return;

    const userId: string = currentUserId;
    const client = getSupabase();
    let mounted = true;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    async function markOnline() {
      if (!mounted) return;

      const { error } = await client
        .from('user_presence')
        .upsert(
          { user_id: userId, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      // La présence est informative : une panne réseau ne doit jamais bloquer l'app.
      if (error) return;
    }

    async function markOffline() {
      await client
        .from('user_presence')
        .delete()
        .eq('user_id', userId);
    }

    function startHeartbeat() {
      if (heartbeat) clearInterval(heartbeat);
      void markOnline();

      heartbeat = setInterval(() => {
        void markOnline();
      }, 30000);
    }

    function stopHeartbeat(removePresence = true) {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }

      if (removePresence) void markOffline();
    }

    if (Platform.OS === 'web') {
      startHeartbeat();
    } else {
      if (AppState.currentState === 'active') startHeartbeat();

      const presenceSubscription = AppState.addEventListener('change', state => {
        if (state === 'active') startHeartbeat();
        else stopHeartbeat(true);
      });

      return () => {
        mounted = false;
        stopHeartbeat(false);
        presenceSubscription.remove();
        void markOffline();
      };
    }

    return () => {
      mounted = false;
      stopHeartbeat(false);
      void markOffline();
    };
  }, [session?.user.id]);

  const owner = session?.user.id ?? LEGACY_LOCAL_ID;

  const value: AuthContextValue = {
    session,
    owner,
    dataEpoch,
    refreshData: () => setDataEpoch(epoch => epoch + 1),

    async signOut() {
      if (isDataBusy(owner)) {
        throw new Error('Attendez la fin de la sauvegarde ou synchronisation.');
      }

      const client = getSupabase();

      if (session?.user.id) {
        await client
          .from('user_presence')
          .delete()
          .eq('user_id', session.user.id);
      }

      const { error } = await client.auth.signOut({ scope: 'local' });

      if (error) {
        throw new Error('Déconnexion impossible. Réessayez.');
      }

      setSession(null);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {ready ? children : (
        <View style={styles.loading}>
          <Text style={styles.text}>
            {error ?? 'Restauration de votre session…'}
          </Text>

          {error && (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => setAttempt(value => value + 1)}
            >
              <Text style={styles.text}>Réessayer</Text>
            </Pressable>
          )}
        </View>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);

  if (!auth) {
    throw new Error('AuthProvider manquant.');
  }

  return auth;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0D1923',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#32C93B',
    padding: 16,
    borderRadius: 18,
    marginTop: 20,
  },
});
