import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackButton } from '../components/screen-back-button';
import { listMembers, type MemberDirectoryEntry } from '../data/community-messages';
import { useInfoSheet } from '../hooks/use-info-sheet';
import { useAuth } from '../auth/auth-provider';
import { t } from '../i18n/i18n';

export default function ExploreScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { showInfo, infoSheet } = useInfoSheet();
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setError(null);
    if (!userId) {
      setMembers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const result = await listMembers();
      setMembers(result);
    } catch {
      setError(t('communityLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const refresh = () => {
    setRefreshing(true);
    void loadMembers();
  };

  const openMember = (member: MemberDirectoryEntry) => {
    const lines = [
      member.username ? `@${member.username}` : '',
      member.location || t('locationUnknown'),
    ].filter(Boolean);

    showInfo(
      member.displayName || t('wheeler'),
      `${lines.join('\n')}\n\n${t('communityMemberInfo')}`
    );
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <ScreenBackButton />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('communityTitle')}</Text>
              <Text style={styles.subtitle}>{t('communitySubtitle')}</Text>
            </View>

            <Pressable
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel={t('refreshMembers')}
              onPress={refresh}
            >
              <Ionicons name="refresh" size={24} color="#34d12f" />
            </Pressable>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="people" size={30} color="#0b1c24" />
            </View>
            <View style={styles.summaryContent}>
              <Text style={styles.summaryNumber}>{members.length}</Text>
              <Text style={styles.summaryLabel}>
                {members.length > 1 ? t('wheelersVisiblePlural') : t('wheelersVisibleSingle')}
              </Text>
            </View>
          </View>

          {!userId ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('communitySignInTitle')}</Text>
              <Text style={styles.emptyText}>{t('communitySignInText')}</Text>
            </View>
          ) : loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('loading')}</Text>
              <Text style={styles.emptyText}>{t('communityLoadingText')}</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('connectionFailed')}</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={refresh}>
                <Text style={styles.retryText}>{t('retry')}</Text>
              </Pressable>
            </View>
          ) : members.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('noOtherWheeler')}</Text>
              <Text style={styles.emptyText}>
                {t('newMembersAppearHere')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>{t('members')}</Text>

              {members.map((member) => (
                <Pressable
                  key={member.userId}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Voir ${member.displayName || t('thisWheeler')}`}
                  onPress={() => openMember(member)}
                >
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={28} color="#0b1c24" />
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={styles.name}>{member.displayName || t('wheeler')}</Text>
                    {!!member.username && <Text style={styles.username}>@{member.username}</Text>}
                    <Text style={styles.info}>
                      {member.location || t('locationUnknown')}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={24} color="#7e8b93" />
                </Pressable>
              ))}
            </>
          )}

          <Pressable style={styles.gpsCard} onPress={() => router.push('/parcours-gps')}>
            <View style={styles.gpsIcon}><Ionicons name="navigate" size={28} color="#071a23" /></View>
            <View style={styles.gpsContent}>
              <Text style={styles.gpsTitle}>Enregistrer un parcours</Text>
              <Text style={styles.gpsText}>Démarrer, mettre en pause et sauvegarder votre balade avec le GPS du téléphone.</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#34d12f" />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
      {infoSheet}
    </>
  );
}

const styles = StyleSheet.create({
  gpsCard: { backgroundColor: '#102c37', borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', marginTop: 22, gap: 12 },
  gpsIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#34d12f', alignItems: 'center', justifyContent: 'center' },
  gpsContent: { flex: 1 },
  gpsTitle: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  gpsText: { color: '#aab6bd', fontSize: 14, lineHeight: 19, marginTop: 3 },

  safeArea: {
    flex: 1,
    backgroundColor: '#071a23',
  },

  container: {
    padding: 24,
    paddingBottom: 120,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },

  headerText: {
    flex: 1,
    paddingRight: 12,
  },

  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },

  subtitle: {
    color: '#aab6bd',
    fontSize: 16,
    lineHeight: 21,
    marginTop: 4,
  },

  refreshButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#132a34',
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryCard: {
    backgroundColor: '#dff2d7',
    borderRadius: 26,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },

  summaryIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#34d12f',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },

  summaryContent: {
    flex: 1,
  },

  summaryNumber: {
    color: '#0b1c24',
    fontSize: 32,
    fontWeight: '900',
  },

  summaryLabel: {
    color: '#344b56',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },

  sectionTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 16,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  cardPressed: {
    opacity: 0.75,
  },

  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#34d12f',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  cardContent: {
    flex: 1,
  },

  name: {
    color: '#0b1c24',
    fontSize: 21,
    fontWeight: '900',
  },

  username: {
    color: '#2d8f2b',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },

  info: {
    color: '#65737b',
    fontSize: 15,
    marginTop: 4,
  },

  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 22,
    marginBottom: 24,
  },

  emptyTitle: {
    color: '#0b1c24',
    fontSize: 20,
    fontWeight: '900',
  },

  emptyText: {
    color: '#65737b',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },

  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#34d12f',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 16,
  },

  retryText: {
    color: '#0b1c24',
    fontWeight: '900',
  },

  noteCard: {
    backgroundColor: '#132a34',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 18,
  },

  noteText: {
    flex: 1,
    color: '#c9d3d8',
    fontSize: 14,
    lineHeight: 20,
  },
});
