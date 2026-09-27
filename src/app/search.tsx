import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';
import { ScreenBackButton } from '../components/screen-back-button';
import { listMembers, type MemberDirectoryEntry } from '../data/community-messages';
import { listCommunityRides, type CommunityRide } from '../data/community-rides';
import { matchesSearch } from '../data/search';
import { t } from '../i18n/i18n';

export default function SearchScreen() {
  const { owner } = useAuth();
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <SearchContent key={`${owner}:${q ?? ''}`} initialQuery={typeof q === 'string' ? q : ''} />;
}
function SearchContent({ initialQuery }: { initialQuery: string }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [query, setQuery] = useState(initialQuery);
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [rides, setRides] = useState<CommunityRide[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    setLoading(true); setError('');
    void Promise.all([listMembers(), listCommunityRides(userId)]).then(([people, outings]) => {
      if (active) { setMembers(people); setRides(outings); }
    }).catch(() => { if (active) setError(t('searchUnavailable')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, attempt]));
  const people = members.filter(member => matchesSearch(query, [member.displayName, member.username, member.location]));
  const outings = rides.filter(ride => matchesSearch(query, [ride.title, ride.departure, ride.description, ride.type, ride.level]));
  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenBackButton /><Text style={styles.title}>{t('searchTitle')}</Text>
      <TextInput accessibilityLabel={t('searchAccessibility')} style={styles.input} placeholderTextColor="#AABCC9"
        placeholder={t('searchInputPlaceholder')} value={query} onChangeText={setQuery} returnKeyType="search" />
      {!userId ? <Pressable style={styles.card} onPress={() => router.navigate('/account')}><Text style={styles.text}>{t('searchLoginPrompt')}</Text></Pressable> : <>
        {loading && <Text style={styles.muted}>{t('loading')}</Text>}
        {!!error && <View><Text accessibilityRole="alert" style={styles.muted}>{error}</Text><Pressable onPress={() => setAttempt(value => value + 1)}><Text style={styles.link}>{t('retry')}</Text></Pressable></View>}
        <Text style={styles.heading}>{t('members')} · {people.length}</Text>
        {people.map(member => <Pressable accessibilityRole="button" key={member.userId} style={styles.card}
          onPress={() => router.navigate({ pathname: '/messages', params: { memberId: member.userId } })}>
          <Text style={styles.text}>{member.displayName || member.username || 'Wheeler'}</Text>
          <Text style={styles.muted}>{member.location || t('locationUnknown')}</Text>
          <Text style={styles.link}>{t('writeMember')}</Text>
        </Pressable>)}
        <Text style={styles.heading}>{t('rides')} · {outings.length}</Text>
        {outings.map(ride => <Pressable accessibilityRole="button" key={ride.id} style={styles.card}
          onPress={() => router.navigate({ pathname: '/sorties', params: { rideId: ride.id } })}>
          <Text style={styles.text}>{ride.title}</Text><Text style={styles.muted}>{ride.departure} · {ride.date} · {ride.time}</Text>
          <Text style={styles.link}>{t('viewRide')}</Text>
        </Pressable>)}
        {!loading && !error && people.length + outings.length === 0 && <Text style={styles.muted}>{t('noSearchResults')}</Text>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0D1923' }, content: { padding: 20, paddingBottom: 40, gap: 14 },
  title: { color: '#FFF', fontSize: 32, fontWeight: '900' }, heading: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 12 },
  input: { backgroundColor: '#18303D', color: '#FFF', borderRadius: 15, padding: 16, fontSize: 16 },
  card: { backgroundColor: '#18303D', padding: 18, borderRadius: 18, gap: 8 }, text: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  muted: { color: '#AABCC9', lineHeight: 21 }, link: { color: '#4BEA76', fontWeight: '800', paddingVertical: 8 },
});
