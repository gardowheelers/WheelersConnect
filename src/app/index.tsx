import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';

import { listCommunityRides, type CommunityRide } from '../data/community-rides';
import { rideDate } from '../data/models';
import { t } from '../i18n/i18n';
import { getSupabase } from '../lib/supabase';
import { wcTheme } from '../theme/wheelers-theme';

export default function HomeScreen() {
  const [rides, setRides] = useState<CommunityRide[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const refreshHome = useCallback(async () => {
    if (!userId) {
      setRides([]);
      setOnlineCount(0);
      return;
    }


    try {
      // Un utilisateur est considéré en ligne si son heartbeat date de moins de 90 secondes.
      // Cela couvre aussi le cas où l'app est fermée brutalement sans pouvoir supprimer sa présence.
      const presenceCutoff = new Date(Date.now() - 90000).toISOString();

      const [rideRows, presenceResult] = await Promise.all([
        listCommunityRides(userId),
        getSupabase()
          .from('user_presence')
          .select('user_id')
          .gte('updated_at', presenceCutoff),
      ]);

      if (presenceResult.error) throw presenceResult.error;

      setRides(rideRows);
      setOnlineCount(presenceResult.data?.length ?? 0);
    } catch {
      // L'accueil reste utilisable même si le réseau est momentanément indisponible.
    } finally {
      // Rien à faire : l'accueil conserve les dernières données valides.
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refreshHome();

      const interval = setInterval(() => {
        void refreshHome();
      }, 15000);

      return () => clearInterval(interval);
    }, [refreshHome])
  );

  const upcomingRideCount = useMemo(() => rides.reduce((count, ride) => {
    const when = rideDate(ride.date, ride.time);
    return when && when.getTime() >= Date.now() ? count + 1 : count;
  }, 0), [rides]);

  function navigate(path: '/explore' | '/sorties' | '/profil' | '/messages') {
    Keyboard.dismiss();
    router.navigate(path);
  }

  return (
    <>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.container}>


        <View style={styles.header}>
          <View style={styles.brandGlass}>
            <Text style={styles.logoWhite}>Wheelers</Text>
            <Text style={styles.logoGreen}>Connect</Text>
          </View>

          <Text style={styles.slogan}>{t('homeSlogan')}</Text>
        </View>

        <Pressable
          style={styles.map}
          accessibilityRole="button"
          accessibilityLabel={t('seeMembers')}
          onPress={() => navigate('/explore')}
        >
          <View style={styles.mapTopRow}>
            <Image
              source={require('../../assets/images/wheelers-connect-logo.png')}
              style={styles.mapLogo}
              resizeMode="cover"
            />
            <Text style={styles.mapTitle}>Ils sont connectés</Text>
          </View>

          <View style={styles.communityCountRow}>
            <Text style={styles.communityNumber}>
              {userId ? onlineCount : '—'}
            </Text>
            <View style={styles.communityCopy}>
              <Text style={styles.communityText}>
                {userId
                  ? (onlineCount > 1 ? 'membres connectés' : 'membre connecté')
                  : t('communityLoginShort')}
              </Text>
              <Text style={styles.communityLink}>{t('seeMembers')} ›</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.featureRow}>
          <View style={[styles.featureCard, styles.rideFeatureCard]}>
            <Text style={[styles.featureEyebrow, styles.rideFeatureEyebrow]}>SORTIE(S)</Text>

            <View style={styles.rideCountBody}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Voir les sorties programmées : ${upcomingRideCount}`}
                onPress={() => navigate('/sorties')}
                style={({ pressed }) => [
                  styles.rideCountButton,
                  pressed && styles.rideCountButtonPressed,
                ]}
              >
                <Text style={styles.rideCountNumber}>{upcomingRideCount}</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.featureCard, styles.creatorFeatureCard]}
            accessibilityRole="link"
            accessibilityLabel="Ouvrir la chaîne YouTube Happy Wheels"
            onPress={() => void Linking.openURL('https://www.youtube.com/@HappyWheels-euc')}
          >
            <Text style={[styles.featureEyebrow, styles.creatorFeatureEyebrow]}>À DÉCOUVRIR</Text>

            <View style={styles.creatorFeatureBody}>
              <View style={styles.youtubeMark}>
                <Text style={styles.youtubePlay}>▶</Text>
              </View>
            </View>

            <Text numberOfLines={1} style={styles.creatorFeatureTitle}>Happy Wheels</Text>
          </Pressable>
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

    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: wcTheme.colors.bg,
  },

  container: {
    padding: 16,
    paddingBottom: 110,
  },

  header: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 6,
  },

  brandGlass: {
    minWidth: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: wcTheme.colors.glass,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    ...wcTheme.shadow.glow,
  },

  logoWhite: {
    color: wcTheme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    fontStyle: 'italic',
    lineHeight: 31,
  },

  logoGreen: {
    color: wcTheme.colors.green,
    fontSize: 30,
    fontWeight: '900',
    fontStyle: 'italic',
    lineHeight: 32,
  },

  slogan: {
    color: wcTheme.colors.textMuted,
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },

  searchBox: {
    minHeight: 54,
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: wcTheme.colors.glass,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    ...wcTheme.shadow.soft,
  },

  searchIcon: {
    fontSize: 28,
    color: wcTheme.colors.cyan,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: wcTheme.colors.text,
    paddingVertical: 12,
  },

  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 9,
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },

  filter: {
    paddingHorizontal: 15,
    height: 38,
    borderRadius: 19,
    backgroundColor: wcTheme.colors.panelSoft,
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
    justifyContent: 'center',
  },

  filterActive: {
    backgroundColor: 'rgba(87, 243, 107, 0.16)',
    borderColor: wcTheme.colors.green,
    ...wcTheme.shadow.greenGlow,
  },

  filterText: {
    color: wcTheme.colors.textMuted,
    fontWeight: '800',
  },

  filterActiveText: {
    color: wcTheme.colors.green,
    fontWeight: '900',
  },

  map: {
    minHeight: 150,
    marginTop: 0,
    backgroundColor: wcTheme.colors.glassStrong,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    padding: 16,
    ...wcTheme.shadow.glow,
  },

  mapTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  mapLogo: {
    width: 48,
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
  },

  mapTitle: {
    flex: 1,
    color: wcTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },

  marker: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: wcTheme.colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: wcTheme.colors.green,
  },

  markerEmoji: {
    fontSize: 25,
  },

  youMarker: {
    position: 'absolute',
    top: 185,
    left: 105,
    backgroundColor: wcTheme.colors.glassStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  youDot: {
    color: wcTheme.colors.cyan,
    fontSize: 24,
    marginRight: 5,
  },

  youText: {
    fontWeight: '800',
    color: wcTheme.colors.text,
  },

  city: {
    position: 'absolute',
    color: wcTheme.colors.textMuted,
    fontWeight: '800',
    fontSize: 15,
  },

  communityCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },

  communityNumber: {
    color: wcTheme.colors.text,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '900',
    minWidth: 66,
  },

  communityCopy: {
    flex: 1,
    paddingLeft: 8,
  },

  communityText: {
    color: wcTheme.colors.cyanSoft,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },

  communityLink: {
    color: wcTheme.colors.green,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 10,
  },

  sectionTitle: {
    color: wcTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },

  rideCard: {
    backgroundColor: wcTheme.colors.glass,
    borderRadius: 24,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
    ...wcTheme.shadow.soft,
  },

  rideDate: {
    backgroundColor: 'rgba(87, 243, 107, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(87, 243, 107, 0.40)',
    width: 58,
    height: 64,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rideDay: {
    color: wcTheme.colors.green,
    fontSize: 23,
    fontWeight: '900',
  },

  rideMonth: {
    fontSize: 11,
    fontWeight: '800',
    color: wcTheme.colors.textMuted,
  },

  rideInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },

  rideTitle: {
    color: wcTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },

  rideText: {
    color: wcTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

  joinButton: {
    backgroundColor: 'rgba(87, 243, 107, 0.16)',
    borderWidth: 1,
    borderColor: wcTheme.colors.green,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  joinText: {
    color: wcTheme.colors.green,
    fontWeight: '900',
  },

  featureRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    alignItems: 'stretch',
  },

  featureCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: 22,
    padding: 13,
    borderWidth: 1.2,
    borderColor: 'rgba(83, 213, 255, 0.72)',
    backgroundColor: 'rgba(14, 43, 57, 0.76)',
    shadowColor: '#20D9FF',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },

  rideFeatureCard: {
    justifyContent: 'space-between',
  },

  creatorFeatureCard: {
    justifyContent: 'space-between',
  },

  featureEyebrow: {
    color: wcTheme.colors.cyanSoft,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.65,
  },

  rideFeatureEyebrow: {
    width: '100%',
    textAlign: 'center',
  },

  rideCountBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rideCountButton: {
    minWidth: 86,
    minHeight: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(87, 243, 107, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(87, 243, 107, 0.46)',
  },

  rideCountButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },

  rideCountNumber: {
    color: wcTheme.colors.green,
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '900',
    textAlign: 'center',
  },

  creatorFeatureBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },

  creatorFeatureEyebrow: {
    width: '100%',
    textAlign: 'center',
  },

  youtubeMark: {
    width: 48,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF0000',
    shadowColor: '#FF0000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  youtubePlay: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginLeft: 2,
  },

  creatorFeatureTitle: {
    color: wcTheme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },

  adSpace: {
    marginTop: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: wcTheme.colors.border,
    backgroundColor: wcTheme.colors.panelSoft,
    padding: 17,
    alignItems: 'center',
  },

  adLabel: {
    color: wcTheme.colors.green,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.5,
  },

  adText: {
    color: wcTheme.colors.textMuted,
    marginTop: 5,
    fontSize: 13,
    textAlign: 'center',
  },

  footer: {
    textAlign: 'center',
    color: wcTheme.colors.textSoft,
    fontSize: 10,
    marginTop: 25,
    letterSpacing: 1,
  },
});
