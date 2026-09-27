import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackButton } from '../components/screen-back-button';
import { useAuth } from '../auth/auth-provider';
import { t } from '../i18n/i18n';
import { listCommunityRides, type CommunityRide } from '../data/community-rides';
import { listMembers, type MemberDirectoryEntry } from '../data/community-messages';
import { rideDate } from '../data/models';
import { useInfoSheet } from '../hooks/use-info-sheet';

export default function HomeScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [query, setQuery] = useState('');
  const [rides, setRides] = useState<CommunityRide[]>([]);
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();
  const { showInfo, infoSheet } = useInfoSheet();
  const userId = session?.user.id ?? '';

  async function refreshHome() {
    if (!userId) { setRides([]); setMembers([]); return; }
    setLoading(true);
    try {
      const [rideRows, memberRows] = await Promise.all([listCommunityRides(userId), listMembers()]);
      setRides(rideRows);
      setMembers(memberRows);
    } catch {
      // L'accueil reste utilisable même si le réseau est momentanément indisponible.
    } finally { setLoading(false); }
  }

  useEffect(() => { void refreshHome(); }, [userId]);

  const nextRide = useMemo(() => rides
    .map(ride => ({ ride, when: rideDate(ride.date, ride.time) }))
    .filter(item => item.when && item.when.getTime() >= Date.now())
    .sort((a, b) => a.when!.getTime() - b.when!.getTime())[0]?.ride ?? null, [rides]);

  function navigate(path: '/explore' | '/sorties' | '/profil' | '/messages') {
    Keyboard.dismiss();
    router.navigate(path);
  }

  return (
    <>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.container}>
        <ScreenBackButton />

        <View style={styles.header}>
          <View>
            <Text style={styles.logoWhite}>Wheelers</Text>
            <Text style={styles.logoGreen}>Connect</Text>
            <Text style={styles.slogan}>{t('homeSlogan')}</Text>
          </View>

          <Pressable
            style={styles.notification}
            hitSlop={8}
            pointerEvents="box-only"
            accessibilityRole="button"
            accessibilityLabel={t('openMessages')}
            onPress={() => navigate('/messages')}
          >
            <Text style={styles.notificationIcon}>🔔</Text>
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            accessibilityLabel={t('searchAccessibilityHome')}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => { Keyboard.dismiss(); router.navigate({ pathname: '/search', params: { q: query.trim() } }); }}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor="#8794A1"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filters}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.filter, styles.filterActive]}
            onPress={() => {
              Keyboard.dismiss();
              setQuery('');
              void refreshHome();
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
          >
            <Text style={styles.filterActiveText}>{t('all')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.filter}
            onPress={() => navigate('/sorties')}
          >
            <Text style={styles.filterText}>{t('rides')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.filter}
            onPress={() => showInfo(
              t('routes'),
              t('routesUnavailableInfo')
            )}
          >
            <Text style={styles.filterText}>{t('routes')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.filter}
            onPress={() => navigate('/explore')}
          >
            <Text style={styles.filterText}>{t('members')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.filter}
            onPress={() => navigate('/explore')}
          >
            <Text style={styles.filterText}>{t('places')}</Text>
          </TouchableOpacity>
        </View>

        <Pressable
          style={styles.map}
          accessibilityRole="button"
          accessibilityLabel={t('seeMembers')}
          onPress={() => navigate('/explore')}
        >
          <Text style={styles.mapTitle}>{t('communityWheelersConnect')}</Text>
          <Text style={styles.communityNumber}>
            {userId ? members.length : '—'}
          </Text>
          <Text style={styles.communityText}>
            {userId
              ? (members.length > 1 ? t('otherWheelersVisiblePlural') : t('otherWheelerVisibleSingle'))
              : t('communityLoginShort')}
          </Text>
          <Text style={styles.communityLink}>{t('seeMembers')} ›</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('nextRide')}</Text>

        {nextRide ? (
          <Pressable
            style={styles.rideCard}
            accessibilityRole="button"
            accessibilityLabel={`${t('viewRideLabel')} ${nextRide.title}`}
            onPress={() => navigate('/sorties')}
          >
            <View style={styles.rideDate}>
              <Text style={styles.rideDay}>{nextRide.date.slice(0, 2)}</Text>
              <Text style={styles.rideMonth}>
                {nextRide.date.slice(3, 5)}/{nextRide.date.slice(8, 10)}
              </Text>
            </View>

            <View style={styles.rideInfo}>
              <Text style={styles.rideTitle}>{nextRide.title}</Text>
              <Text style={styles.rideText}>📍 {nextRide.departure}</Text>
              <Text style={styles.rideText}>
                🕙 {nextRide.time} · {nextRide.participantCount}/{nextRide.maxParticipants}
              </Text>
            </View>

            <View style={styles.joinButton}>
              <Text style={styles.joinText}>{t('view')}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={styles.rideCard}
            accessibilityRole="button"
            onPress={() => navigate('/sorties')}
          >
            <View style={styles.rideInfo}>
              <Text style={styles.rideTitle}>
                {loading ? t('loading') : t('noUpcomingPublishedRide')}
              </Text>
              <Text style={styles.rideText}>
                {t('tapToBrowseOrCreateRide')}
              </Text>
            </View>
          </Pressable>
        )}

        <View style={styles.supportCard}>
          <View style={styles.supportTextBlock}>
            <Text style={styles.supportTitle}>🛞 {t('wheelSupportName')}</Text>
            <Text style={styles.supportText}>
              {t('supportText')}
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.supportButton}
            onPress={() => showInfo(
              t('wheelSupportName'),
              t('supportUnavailableInfo')
            )}
          >
            <Text style={styles.supportButtonText}>{t('support')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.adSpace}>
          <Text style={styles.adLabel}>{t('partnerSpace')}</Text>
          <Text style={styles.adText}>
            {t('partnerAdPlaceholder')}
          </Text>
        </View>

        <Text style={styles.footer}>
          {t('footerTagline')}
        </Text>
      </ScrollView>
    </SafeAreaView>

    {infoSheet}
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D1923',
  },

  container: {
    padding: 18,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },

  logoWhite: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    fontStyle: 'italic',
    lineHeight: 40,
  },

  logoGreen: {
    color: '#42D435',
    fontSize: 40,
    fontWeight: '900',
    fontStyle: 'italic',
    lineHeight: 42,
  },

  slogan: {
    color: '#C8D1D8',
    fontSize: 16,
    marginTop: 7,
  },

  notification: {
    position: 'relative',
    marginTop: 5,
  },

  notificationIcon: {
    fontSize: 29,
  },

  badge: {
    position: 'absolute',
    right: -5,
    top: -5,
    backgroundColor: '#FF3B30',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  searchBox: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  searchIcon: {
    fontSize: 27,
    color: '#263746',
    marginRight: 9,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#17232D',
  },

  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingVertical: 16,
    paddingRight: 4,
  },

  filter: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },

  filterActive: {
    backgroundColor: '#31BF38',
  },

  filterText: {
    color: '#1F2933',
    fontWeight: '700',
  },

  filterActiveText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  map: {
    height: 310,
    backgroundColor: '#DDEFCF',
    borderRadius: 26,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },

  mapTitle: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    backgroundColor: '#FFFFFFEE',
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 15,
    fontWeight: '800',
    color: '#17232D',
  },

  marker: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#34C63B',
  },

  markerEmoji: {
    fontSize: 25,
  },

  youMarker: {
    position: 'absolute',
    top: 185,
    left: 105,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  youDot: {
    color: '#1677FF',
    fontSize: 24,
    marginRight: 5,
  },

  youText: {
    fontWeight: '800',
    color: '#16232D',
  },

  city: {
    position: 'absolute',
    color: '#33474F',
    fontWeight: '800',
    fontSize: 15,
  },

  communityNumber: {
    color: '#17232D',
    fontSize: 54,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 28,
  },

  communityText: {
    color: '#42515D',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },

  communityLink: {
    color: '#24A92F',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 24,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 25,
    marginBottom: 12,
  },

  rideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  rideDate: {
    backgroundColor: '#ECF8EB',
    width: 62,
    height: 70,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rideDay: {
    color: '#2EBB39',
    fontSize: 26,
    fontWeight: '900',
  },

  rideMonth: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5D6A73',
  },

  rideInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },

  rideTitle: {
    color: '#15212C',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 5,
  },

  rideText: {
    color: '#53606A',
    fontSize: 13,
    marginTop: 2,
  },

  joinButton: {
    backgroundColor: '#31C33A',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },

  joinText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  supportCard: {
    marginTop: 18,
    backgroundColor: '#182A37',
    borderRadius: 22,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D4656',
  },

  supportTextBlock: {
    flex: 1,
    paddingRight: 8,
  },

  supportTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
    marginBottom: 5,
  },

  supportText: {
    color: '#ADBBC5',
    lineHeight: 18,
    fontSize: 13,
  },

  supportButton: {
    backgroundColor: '#31C33A',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
  },

  supportButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  adSpace: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#637787',
    padding: 17,
    alignItems: 'center',
  },

  adLabel: {
    color: '#4BD448',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.5,
  },

  adText: {
    color: '#AAB8C2',
    marginTop: 5,
    fontSize: 13,
  },

  footer: {
    textAlign: 'center',
    color: '#728391',
    fontSize: 10,
    marginTop: 25,
    letterSpacing: 1,
  },
});
