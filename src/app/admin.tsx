import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';
import { ScreenBackButton } from '../components/screen-back-button';
import { readAdminDashboard, type AdminDashboard } from '../data/admin';
import { t } from '../i18n/i18n';

function eventLabel(kind: string) {
  const labels: Record<string, ReturnType<typeof t>> = {
    account_created: t('eventAccountCreated'),
    account_deleted: t('eventAccountDeleted'),
    account_signed_in: t('eventAccountSignedIn'),
    ride_published: t('eventRidePublished'),
    ride_updated: t('eventRideUpdated'),
    ride_removed: t('eventRideRemoved'),
    ride_joined: t('eventRideJoined'),
    ride_left: t('eventRideLeft'),
    data_synced: t('eventDataSynced'),
  };
  return labels[kind] ?? t('adminActivity');
}


export default function AdminScreen() {
  const { owner } = useAuth();
  return <AdminContent key={owner} />;
}
function AdminContent() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [snapshot, setSnapshot] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    let busy = false;
    async function refresh() {
      if (busy || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      busy = true;
      setLoading(true);
      try {
        const next = await readAdminDashboard();
        if (active) { setSnapshot(next); setError(''); }
      } catch (issue) {
        if (active) { setSnapshot(null); setError(issue instanceof Error ? issue.message : t('messagingUnavailable')); }
      } finally { busy = false; if (active) setLoading(false); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [userId, attempt]));
  const counters = snapshot ? [
    [t('accounts'), snapshot.accounts], [t('syncedProfiles'), snapshot.profiles],
    [t('publishedRides'), snapshot.rides], [t('participations'), snapshot.participants],
    [t('signedIn7Days'), snapshot.signedInLast7Days],
  ] as const : [];
  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenBackButton />
      <Text style={styles.title}>{t('adminTitle')}</Text>
      <Text style={styles.muted}>Wheelers Connect · Gard Ô Wheelers</Text>
      {!userId ? <Pressable style={styles.button} onPress={() => router.navigate('/account')}>
        <Text style={styles.buttonText}>{t('adminSignIn')}</Text>
      </Pressable> : <>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={loading} style={styles.button} onPress={() => setAttempt(value => value + 1)}>
          <Text style={styles.buttonText}>{loading ? t('refreshing') : t('refresh')}</Text>
        </Pressable>
        {snapshot && <>
          <Text style={styles.muted}>{t('lastRead')} : {new Date(snapshot.generatedAt).toLocaleString()}</Text>
          <View style={styles.grid}>{counters.map(([label, count]) => <View key={label} style={styles.card}>
            <Text style={styles.number}>{count}</Text><Text style={styles.text}>{label}</Text>
          </View>)}</View>
          <Text style={styles.heading}>{t('recentActivity')}</Text>
          <Text style={styles.muted}>{t('recentActivityHelp')}</Text>
          {!snapshot.events.length && <Text style={styles.text}>{t('noAdminEvents')}</Text>}
          {snapshot.events.map(event => <View key={event.id} style={styles.event}>
            <Text style={styles.text}>{eventLabel(event.kind)}</Text>
            <Text style={styles.muted}>{new Date(event.created_at).toLocaleString()}</Text>
          </View>)}
        </>}
      </>}
      <Text style={styles.note}>{t('adminRefreshNote')}</Text>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0D1923' }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { color: '#FFF', fontSize: 30, fontWeight: '900' }, heading: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  muted: { color: '#AABCC9', fontSize: 13, lineHeight: 20 }, text: { color: '#FFF', fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { flexGrow: 1, flexBasis: '44%', backgroundColor: '#162D3A', borderRadius: 18, padding: 18, gap: 8 },
  number: { color: '#4BEA76', fontSize: 36, fontWeight: '900' }, event: { borderBottomWidth: 1, borderBottomColor: '#29414F', paddingVertical: 12, gap: 5 },
  button: { backgroundColor: '#4BEA76', padding: 16, borderRadius: 14 }, buttonText: { color: '#07141E', fontWeight: '800', textAlign: 'center' },
  error: { color: '#FFD166', lineHeight: 22 }, note: { color: '#AABCC9', lineHeight: 21, paddingTop: 15 },
});
