import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackButton } from '../components/screen-back-button';
import { listMembers, type MemberDirectoryEntry } from '../data/community-messages';
import { useAuth } from '../auth/auth-provider';
import { t } from '../i18n/i18n';
import { getSupabase } from '../lib/supabase';
import { wcTheme } from '../theme/wheelers-theme';

export default function ExploreScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberDirectoryEntry | null>(null);

  const loadMembers = useCallback(async () => {
    setError(null);

    if (!userId) {
      setMembers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // Seuls les profils ayant une présence récente sont affichés comme connectés.
      // La marge de 90 s couvre un arrêt brutal de l'app ou une coupure réseau.
      const presenceCutoff = new Date(Date.now() - 90000).toISOString();

      const [allMembers, presenceResult] = await Promise.all([
        listMembers(true),
        getSupabase()
          .from('user_presence')
          .select('user_id')
          .gte('updated_at', presenceCutoff),
      ]);

      if (presenceResult.error) throw presenceResult.error;

      const onlineIds = new Set(
        (presenceResult.data ?? []).map(row => row.user_id)
      );

      const onlineMembers = allMembers.filter(member => onlineIds.has(member.userId));
      setMembers(onlineMembers);

      // Si le membre dont la fiche est ouverte se déconnecte, on ferme sa fiche.
      setSelectedMember(current =>
        current && onlineIds.has(current.userId) ? current : null
      );
    } catch {
      setError(t('communityLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadMembers();

    // Actualisation régulière pendant que l'écran Explore est ouvert.
    const interval = setInterval(() => {
      void loadMembers();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadMembers]);

  const refresh = () => {
    setRefreshing(true);
    void loadMembers();
  };

  const wheelNames = useMemo(() => {
    if (!selectedMember) return [];
    return Object.values(selectedMember.wheels ?? {})
      .map((wheel) => wheel?.name?.trim())
      .filter((name): name is string => Boolean(name));
  }, [selectedMember]);

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
              <Text style={styles.subtitle}>Les wheelers actuellement connectés</Text>
            </View>

            <Pressable
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel={t('refreshMembers')}
              onPress={refresh}
            >
              <Ionicons name="refresh" size={24} color={ACTION_CYAN} />
            </Pressable>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryLogoWrap}>
              <Ionicons name="people" size={34} color={wcTheme.colors.green} />
            </View>

            <View style={styles.summaryContent}>
              <Text style={styles.summaryNumber}>{members.length}</Text>
              <Text style={styles.summaryLabel}>
                {members.length > 1 ? 'membres connectés' : 'membre connecté'}
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
              <Text style={styles.emptyText}>{t('newMembersAppearHere')}</Text>
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
                  onPress={() => setSelectedMember(member)}
                >
                  <View style={styles.avatar}>
                    {member.avatarUrl ? (
                      <Image source={{ uri: member.avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="person" size={28} color="#0b1c24" />
                    )}
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
            <View style={styles.gpsIcon}>
              <Ionicons name="navigate" size={28} color="#071a23" />
            </View>

            <View style={styles.gpsContent}>
              <Text style={styles.gpsTitle}>Enregistrer un parcours</Text>
              <Text style={styles.gpsText}>
                Démarrer, mettre en pause et sauvegarder votre balade avec le GPS du téléphone.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={24} color={ACTION_CYAN} />
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={selectedMember !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMember(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.memberModal}>
            {selectedMember && (
              <>
                <View style={styles.modalAvatarWrap}>
                  {selectedMember.avatarUrl ? (
                    <Image
                      source={{ uri: selectedMember.avatarUrl }}
                      style={styles.modalAvatarImage}
                    />
                  ) : (
                    <View style={styles.modalAvatarFallback}>
                      <Ionicons name="person" size={42} color="#0b1c24" />
                    </View>
                  )}
                </View>

                <Text style={styles.modalName}>
                  {selectedMember.displayName || t('wheeler')}
                </Text>

                {!!selectedMember.username && (
                  <Text style={styles.modalUsername}>@{selectedMember.username}</Text>
                )}

                <Text style={styles.modalInfo}>
                  {selectedMember.location || t('locationUnknown')}
                </Text>

                <View style={styles.modalStats}>
                  {!!selectedMember.age && (
                    <View style={styles.modalStat}>
                      <Text style={styles.modalStatValue}>{selectedMember.age}</Text>
                      <Text style={styles.modalStatLabel}>ans</Text>
                    </View>
                  )}

                  {!!selectedMember.practiceYears && (
                    <View style={styles.modalStat}>
                      <Text style={styles.modalStatValue}>{selectedMember.practiceYears}</Text>
                      <Text style={styles.modalStatLabel}>
                        an{selectedMember.practiceYears === '1' ? '' : 's'} de pratique
                      </Text>
                    </View>
                  )}

                  {!!selectedMember.level && (
                    <View style={styles.modalStat}>
                      <Text style={styles.modalStatValue}>{selectedMember.level}</Text>
                      <Text style={styles.modalStatLabel}>niveau</Text>
                    </View>
                  )}
                </View>

                {!!selectedMember.bio && (
                  <Text style={styles.modalBio}>{selectedMember.bio}</Text>
                )}

                {wheelNames.length > 0 && (
                  <Text style={styles.modalWheels}>
                    Roue{wheelNames.length > 1 ? 's' : ''} : {wheelNames.join(' · ')}
                  </Text>
                )}

                <Text style={styles.modalContact}>
                  Vous pouvez contacter ce membre depuis l'onglet Messages.
                </Text>

                <Pressable
                  style={styles.closeModalButton}
                  accessibilityRole="button"
                  accessibilityLabel="Fermer"
                  onPress={() => setSelectedMember(null)}
                >
                  <Text style={styles.closeModalText}>Fermer</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}


const ACTION_GLASS = {
  backgroundColor: 'rgba(14, 43, 57, 0.68)',
  borderWidth: 1.4,
  borderColor: 'rgba(83, 213, 255, 0.82)',
  shadowColor: '#20D9FF',
  shadowOpacity: 0.18,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 7,
};

const ACTION_GLASS_SELECTED = {
  ...ACTION_GLASS,
  backgroundColor: 'rgba(18, 58, 76, 0.92)',
};

const ACTION_TEXT = {
  color: '#FFFFFF',
  fontWeight: '900' as const,
};

const ACTION_CYAN = '#2FE8FF';

const styles = StyleSheet.create({
  gpsCard: {
    backgroundColor: wcTheme.colors.glassStrong,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 12,
  },

  gpsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: wcTheme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },

  gpsContent: {
    flex: 1,
  },

  gpsTitle: {
    color: wcTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },

  gpsText: {
    color: wcTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  safeArea: {
    flex: 1,
    backgroundColor: wcTheme.colors.bg,
  },

  container: {
    padding: 16,
    paddingBottom: 110,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },

  headerText: {
    flex: 1,
    paddingRight: 12,
  },

  title: {
    color: wcTheme.colors.text,
    fontSize: 26,
    fontWeight: '900',
  },

  subtitle: {
    color: wcTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 4,
  },

  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: wcTheme.colors.glass,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...wcTheme.shadow.glow,
    ...ACTION_GLASS,
  },

  summaryCard: {
    backgroundColor: wcTheme.colors.glassStrong,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    ...wcTheme.shadow.glow,
  },

  summaryLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: wcTheme.colors.panelStrong,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...wcTheme.shadow.greenGlow,
  },

  summaryLogo: {
    width: '100%',
    height: '100%',
  },

  summaryContent: {
    flex: 1,
  },

  summaryNumber: {
    color: wcTheme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },

  summaryLabel: {
    color: wcTheme.colors.cyanSoft,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },

  sectionTitle: {
    color: wcTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
  },

  card: {
    backgroundColor: wcTheme.colors.glass,
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    ...wcTheme.shadow.soft,
  },

  cardPressed: {
    opacity: 0.75,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: wcTheme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },

  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 23,
  },

  cardContent: {
    flex: 1,
  },

  name: {
    color: wcTheme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },

  username: {
    color: wcTheme.colors.green,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  info: {
    color: wcTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },

  emptyCard: {
    backgroundColor: wcTheme.colors.glassStrong,
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    ...wcTheme.shadow.soft,
  },

  emptyTitle: {
    color: wcTheme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },

  emptyText: {
    color: wcTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 8,
  },

  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: wcTheme.colors.green,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 16,
    ...ACTION_GLASS,
  },

  retryText: {
    color: wcTheme.colors.text,
    fontWeight: '900',
    ...ACTION_TEXT,
  },

  noteCard: {
    backgroundColor: wcTheme.colors.glass,
    borderRadius: 18,
    padding: 14,
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  memberModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: wcTheme.colors.panelStrong,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    borderRadius: 28,
    padding: 22,
    ...wcTheme.shadow.glow,
    alignItems: 'center',
  },

  modalAvatarWrap: {
    marginBottom: 12,
  },

  modalAvatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#eaf8e9',
  },

  modalAvatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: wcTheme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalName: {
    color: wcTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },

  modalUsername: {
    color: wcTheme.colors.green,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },

  modalInfo: {
    color: wcTheme.colors.textMuted,
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },

  modalStats: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 18,
    marginBottom: 14,
  },

  modalStat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },

  modalStatValue: {
    color: wcTheme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },

  modalStatLabel: {
    color: '#7a8791',
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },

  modalBio: {
    width: '100%',
    color: '#4f5d68',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5eaed',
    paddingTop: 14,
    marginTop: 2,
  },

  modalWheels: {
    width: '100%',
    color: '#344b56',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
    fontWeight: '700',
  },

  modalContact: {
    width: '100%',
    color: '#7a8791',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
  },

  closeModalButton: {
    marginTop: 18,
    backgroundColor: '#dff2d7',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    ...ACTION_GLASS,
  },

  closeModalText: {
    color: wcTheme.colors.green,
    fontSize: 14,
    fontWeight: '900',
    ...ACTION_TEXT,
  },
});
