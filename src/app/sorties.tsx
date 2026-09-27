import { localStorage as AsyncStorage, storageKey as scopedStorageKey } from '../data/local-store';
import { useAuth } from '../auth/auth-provider';
import { listCommunityRides, publishCommunityRide, unpublishCommunityRide, joinCommunityRide, leaveCommunityRide, type CommunityRide } from '../data/community-rides';
import { rideTypes, emptyDraft, rideDate, validationError, isRide, type RideDraft, type Ride } from '../data/models';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { ScreenBackButton } from '../components/screen-back-button';
import { router, useLocalSearchParams } from 'expo-router';
import { t } from '../i18n/i18n';

// These previews have no organizer or registration service yet.
const upcomingRides = [
  { title: 'Balade du dimanche', day: '14', departure: 'Meynes (30)', time: '🕙 10h00', detail: 'Tous niveaux' },
  { title: 'Pont du Gard Ride', day: '20', departure: 'Remoulins (30)', time: '🕑 14h00', detail: '35 km' },
];
const fields = [
  { key: 'title', labelKey: 'rideFieldTitle', placeholderKey: 'ridePlaceholderTitle' },
  { key: 'date', labelKey: 'rideFieldDate', placeholderKey: 'ridePlaceholderDate' },
  { key: 'time', labelKey: 'rideFieldTime', placeholderKey: 'ridePlaceholderTime' },
  { key: 'departure', labelKey: 'rideFieldDeparture', placeholderKey: 'ridePlaceholderDeparture' },
  { key: 'distance', labelKey: 'rideFieldDistance', placeholderKey: 'ridePlaceholderDistance' },
  { key: 'level', labelKey: 'rideFieldLevel', placeholderKey: 'ridePlaceholderLevel' },
  { key: 'maxParticipants', labelKey: 'rideFieldMaxParticipants', placeholderKey: 'ridePlaceholderMaxParticipants' },
  { key: 'description', labelKey: 'rideFieldDescription', placeholderKey: 'ridePlaceholderDescription' },
] as const;

export default function SortiesScreen() {
  const { owner, dataEpoch } = useAuth();
  return <SortiesContent key={owner + ':' + dataEpoch} />;
}

function SortiesContent() {
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const openedParam = useRef<string | undefined>(undefined);
  const { owner, session } = useAuth();
  const userId = session?.user.id ?? null;
  const storageKey = scopedStorageKey(owner, 'rides');
  const [rides, setRides] = useState<Ride[]>([]);
  const [draft, setDraft] = useState<RideDraft | null>(null);
  const [selection, setSelection] = useState<{ id: string; source: 'local' | 'community' } | null>(null);
  const [preview, setPreview] = useState<typeof upcomingRides[number] | null>(null);
  const [communityRides, setCommunityRides] = useState<CommunityRide[]>([]);
  const [communityBusy, setCommunityBusy] = useState(false);
  const [communityMessage, setCommunityMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedLocalRide = selection?.source === 'local'
    ? rides.find((ride) => ride.id === selection.id)
    : undefined;
  const selectedCommunityRide = selection?.source === 'community'
    ? communityRides.find((ride) => ride.id === selection.id)
    : undefined;
  const selectedRide = selectedLocalRide ?? selectedCommunityRide;
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (typeof rideId === 'string' && openedParam.current !== rideId && communityRides.some(ride => ride.id === rideId)) {
      openedParam.current = rideId;
      openDetails(rideId, 'community');
      router.setParams({ rideId: undefined });
    } else if (!rideId) {
      openedParam.current = undefined;
    }
  }, [rideId, communityRides]);

  useEffect(() => {
    let active = true;
    async function loadRides() {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (!active) return;
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (!Array.isArray(parsed) || !parsed.every(isRide) || new Set(parsed.map((ride) => ride.id)).size !== parsed.length) throw new Error('Invalid stored rides');
          setRides(parsed);
        }
        setReady(true);
      } catch {
        if (active) setLoadError(t('ridesLoadError'));
      }
    }
    void loadRides();
    return () => { active = false; };
  }, []);

  async function refreshCommunity() {
    if (!userId) { setCommunityRides([]); return; }
    try { setCommunityMessage(null); setCommunityRides(await listCommunityRides(userId)); }
    catch { setCommunityMessage(t('communityRidesLoadError')); }
  }

  useEffect(() => { void refreshCommunity(); }, [userId]);

  async function publishSelected() {
    if (!userId || !selectedLocalRide || communityBusy) return;
    setCommunityBusy(true);
    try { await publishCommunityRide(userId, selectedLocalRide); await refreshCommunity(); setCommunityMessage(t('ridePublishedCommunity')); }
    catch { setCommunityMessage(t('ridePublishError')); }
    finally { setCommunityBusy(false); }
  }

  async function toggleCommunityRegistration(ride: CommunityRide) {
    if (!userId || communityBusy || ride.organizerId === userId) return;
    setCommunityBusy(true);
    setCommunityMessage(null);
    try {
      ride.joined ? await leaveCommunityRide(userId, ride.id) : await joinCommunityRide(userId, ride.id);
      await refreshCommunity();
      setCommunityMessage(ride.joined ? t('rideLeft') : t('rideJoined'));
    } catch {
      setCommunityMessage(t('rideRegistrationError'));
    } finally { setCommunityBusy(false); }
  }

  async function removeCommunityRide(ride: CommunityRide) {
    if (!userId || communityBusy || ride.organizerId !== userId) return;
    setCommunityBusy(true);
    setCommunityMessage(null);
    try {
      await unpublishCommunityRide(userId, ride.id);
      await refreshCommunity();
      if (selection?.source === 'community' && selection.id === ride.id) setSelection(null);
      setCommunityMessage(t('rideRemovedCommunity'));
    } catch {
      setCommunityMessage(t('rideRemoveError'));
    } finally { setCommunityBusy(false); }
  }

  function cancel() {
    if (savingRef.current) return;
    setDraft(null);
    setError(null);
  }

  function closeDetails() {
    if (savingRef.current) return;
    setPreview(null);
    setSelection(null);
    setConfirmDelete(false);
    setError(null);
  }

  function openDetails(id: string, source: 'local' | 'community') {
    if (savingRef.current) return;
    setPreview(null);
    setDraft(null);
    setError(null);
    setConfirmDelete(false);
    setSelection({ id, source });
  }

  async function deleteRide() {
    if (!selectedLocalRide || !confirmDelete || !ready || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const next = rides.filter((ride) => ride.id !== selectedLocalRide.id);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setRides(next);
      setSelection(null);
      setConfirmDelete(false);
    } catch {
      setError(t('rideDeleteError'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function createRide() {
    if (!draft || !ready || savingRef.current) return;
    const cleaned = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as RideDraft;
    const issue = validationError(cleaned);
    if (issue) { setError(issue); return; }
    const scheduleChanged = !selectedLocalRide || cleaned.date !== selectedLocalRide.date || cleaned.time !== selectedLocalRide.time;
    if (scheduleChanged && rideDate(cleaned.date, cleaned.time)!.getTime() <= Date.now()) { setError(t('rideFutureError')); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const ride: Ride = { ...cleaned, distance: cleaned.distance.replace(',', '.'), id: selectedLocalRide?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    const next = (selectedLocalRide ? rides.map((item) => item.id === ride.id ? ride : item) : [...rides, ride])
      .sort((a, b) => rideDate(a.date, a.time)!.getTime() - rideDate(b.date, b.time)!.getTime());
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setRides(next);
      setDraft(null);
    } catch {
      setError(t('rideSaveError'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenBackButton />
      <Text style={styles.title}>{t('rides')}</Text>
      <Text style={styles.subtitle}>
        {t('ridesSubtitle')}
      </Text>

      <Pressable style={styles.createButton} accessibilityRole="button" onPress={() => { setPreview(null); setSelection(null); setConfirmDelete(false); setError(null); setDraft({ ...emptyDraft }); }}>
        <Text style={styles.createButtonText}>＋ {t('createRide')}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>{t('upcomingRides')}</Text>

      {!userId && <Text style={styles.status}>{t('ridesLoginPrompt')}</Text>}
      {communityMessage && <Text style={styles.status}>{communityMessage}</Text>}
      {userId && communityRides.length === 0 && <Text style={styles.status}>{t('noCommunityRides')}</Text>}
      {communityRides.map((ride) => (
        <View key={ride.id} style={styles.createdCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('viewRideLabel')} ${ride.title}`}
            style={({ pressed }) => [styles.cardTouchArea, pressed && styles.pressedCard]}
            onPress={() => openDetails(ride.id, 'community')}
          >
          <View style={styles.cardHeader}>
            <View style={styles.date}><Text style={styles.day}>{ride.date.slice(0,2)}</Text><Text style={styles.month}>{['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'][Number(ride.date.slice(3,5))-1]}</Text></View>
            <View style={styles.info}><Text style={styles.rideTitle}>{ride.title}</Text><Text style={styles.details}>📍 {ride.departure}</Text><Text style={styles.details}>🕙 {ride.date} · {ride.time}</Text><Text style={styles.details}>👥 {ride.participantCount}/{ride.maxParticipants}</Text></View>
          </View>
          <Text style={styles.description}>{ride.description}</Text>
          </Pressable>
          {ride.organizerId === userId ?
            <Pressable disabled={communityBusy} style={[styles.formButton,styles.typeOption,{marginTop:12}]} onPress={() => void removeCommunityRide(ride)}><Text style={styles.typeBadgeText}>{t('removeFromCommunity')}</Text></Pressable> :
            <Pressable disabled={communityBusy || (!ride.joined && ride.participantCount >= Number(ride.maxParticipants))} style={[styles.formButton,styles.selectedType,{marginTop:12}]} onPress={() => void toggleCommunityRegistration(ride)}><Text style={styles.joinText}>{ride.joined ? t('leaveRide') : ride.participantCount >= Number(ride.maxParticipants) ? t('rideFull') : t('joinRide')}</Text></Pressable>}
        </View>
      ))}

      <Text style={styles.sectionTitle}>{t('myRides')}</Text>

      {loadError && <Text style={styles.status} accessibilityRole="alert">{loadError}</Text>}
      {!ready && !loadError && <Text style={styles.status}>{t('loadingRides')}</Text>}
      {rides.map((ride) => (
        // Keep the entire padded card as one touch target; never move it during a press.
        <Pressable key={ride.id} pointerEvents="box-only"
          style={({ pressed }) => [styles.createdCard, pressed && styles.pressedCard]}
          accessibilityRole="button" accessibilityLabel={`${t('viewRideLabel')} ${ride.title}`}
          onPress={() => openDetails(ride.id, 'local')}>
          <View pointerEvents="none">
          <View style={styles.cardHeader}>
            <View style={styles.date}>
              <Text style={styles.day}>{ride.date.slice(0, 2)}</Text>
              <Text style={styles.month}>{['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'][Number(ride.date.slice(3, 5)) - 1]}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.rideTitle}>{ride.title}</Text>
              <Text style={styles.details}>📍 {ride.departure}</Text>
              <Text style={styles.details}>🕙 {ride.date} · {ride.time}</Text>
            </View>
          </View>
          <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{ride.type}</Text></View>
          <Text style={styles.details}>🛞 {ride.distance.replace('.', ',')} km · {ride.level}</Text>
          <Text style={styles.details}>👥 {ride.maxParticipants} {t('participantsMaximum')}</Text>
          <Text style={styles.description}>{ride.description}</Text>
          </View>
        </Pressable>
      ))}
      {ready && rides.length === 0 && <View style={styles.emptyCard}>
        <Text style={styles.wheel}>🛞</Text>
        <Text style={styles.emptyTitle}>{t('emptyRidesTitle')}</Text>
        <Text style={styles.emptyText}>
          {t('emptyRidesText')}
        </Text>
      </View>}
    </ScrollView>
    <Modal visible={draft !== null || selection !== null || preview !== null} transparent animationType="fade" onRequestClose={draft ? cancel : closeDetails}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {draft ? <>
            <Text style={styles.rideTitle} accessibilityRole="header">{selectedLocalRide ? t('editRide') : t('createRide')}</Text>
            {draft && fields.map(({ key, labelKey, placeholderKey }) => (
              (() => { const label = t(labelKey); const placeholder = t(placeholderKey); return (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput accessibilityLabel={label} style={[styles.input, key === 'description' && styles.descriptionInput]}
                  value={draft[key]} placeholder={placeholder} placeholderTextColor="#7D8B96" editable={!saving}
                  multiline={key === 'description'} keyboardType={key === 'distance' ? 'decimal-pad' : key === 'maxParticipants' ? 'number-pad' : 'default'}
                  autoCorrect={key !== 'date' && key !== 'time'}
                  onChangeText={(value) => setDraft((previous) => previous ? { ...previous, [key]: value } : previous)} />
              </View>); })()
            ))}
            <Text style={styles.label}>{t('rideType')}</Text>
            <View style={styles.typeOptions}>
              {rideTypes.map((type) => (
                <Pressable key={type} accessibilityRole="radio" accessibilityLabel={type} accessibilityState={{ checked: draft?.type === type, disabled: saving }} disabled={saving}
                  style={[styles.typeOption, draft?.type === type && styles.selectedType]} onPress={() => setDraft((previous) => previous ? { ...previous, type } : previous)}>
                  <Text style={draft?.type === type ? styles.joinText : styles.typeBadgeText}>{type}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.details}>{t('rideFieldsRequired')}</Text>
            {(!ready || error) && <Text style={styles.formError} accessibilityRole="alert">{loadError ?? error ?? t('loadingRides')}</Text>}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready || saving, busy: saving }} disabled={!ready || saving}
                style={[styles.formButton, styles.selectedType, (!ready || saving) && styles.disabled]} onPress={createRide}>
                <Text style={styles.joinText}>{saving ? t('saving') : selectedLocalRide ? t('save') : t('createRide')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} style={[styles.formButton, styles.typeOption]} onPress={cancel}><Text style={styles.typeBadgeText}>{t('cancel')}</Text></Pressable>
            </View>
            </> : preview ? <>
              <Text style={styles.rideTitle} accessibilityRole="header">{preview.title}</Text>
              <Text style={styles.details}>{preview.day} · {preview.time}</Text>
              <Text style={styles.details}>📍 {preview.departure}</Text>
              <Text style={styles.details}>🛞 {preview.detail}</Text>
              <Text style={styles.description}>{t('previewRideNotice')}</Text>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" style={[styles.formButton, styles.typeOption]} onPress={closeDetails}><Text style={styles.typeBadgeText}>{t('close')}</Text></Pressable>
              </View>
            </> : selectedRide && <>
              <Text style={styles.rideTitle} accessibilityRole="header">{selectedRide.title}</Text>
              {fields.map(({ key, labelKey }) => (
                (() => { const label = t(labelKey); return (
                <View key={key} style={styles.field}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.details}>{key === 'distance' ? selectedRide[key].replace('.', ',') : selectedRide[key]}</Text>
                </View>); })()
              ))}
              <Text style={styles.label}>{t('rideType')}</Text>
              <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{selectedRide.type}</Text></View>
              {selectedLocalRide && (userId ? <View style={styles.actions}><Pressable accessibilityRole="button" disabled={communityBusy} style={[styles.formButton,styles.selectedType,communityBusy&&styles.disabled]} onPress={publishSelected}><Text style={styles.joinText}>{communityBusy ? t('publishing') : t('publishCommunity')}</Text></Pressable></View> : <Text style={styles.status}>{t('publishLoginPrompt')}</Text>)}
              {selectedCommunityRide && selectedCommunityRide.organizerId !== userId && <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={communityBusy || (!selectedCommunityRide.joined && selectedCommunityRide.participantCount >= Number(selectedCommunityRide.maxParticipants))}
                  style={[styles.formButton, styles.selectedType, communityBusy && styles.disabled]}
                  onPress={() => void toggleCommunityRegistration(selectedCommunityRide)}
                >
                  <Text style={styles.joinText}>{selectedCommunityRide.joined ? t('leaveRide') : selectedCommunityRide.participantCount >= Number(selectedCommunityRide.maxParticipants) ? t('rideFull') : t('joinRide')}</Text>
                </Pressable>
              </View>}
              {selectedCommunityRide && selectedCommunityRide.organizerId === userId && <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={communityBusy} style={[styles.formButton, styles.typeOption, communityBusy && styles.disabled]} onPress={() => void removeCommunityRide(selectedCommunityRide)}>
                  <Text style={styles.typeBadgeText}>{t('removeFromCommunity')}</Text>
                </Pressable>
              </View>}
              {communityMessage && <Text style={styles.status}>{communityMessage}</Text>}
              {error && <Text style={styles.formError} accessibilityRole="alert">{error}</Text>}
              {selectedLocalRide && (confirmDelete ? <>
                <Text style={styles.formError} accessibilityRole="alert">{t('deleteRideConfirm')} « {selectedRide.title} » ?</Text>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" disabled={saving} accessibilityState={{ disabled: saving, busy: saving }} style={[styles.formButton, styles.deleteButton, saving && styles.disabled]} onPress={deleteRide}>
                    <Text style={styles.joinText}>{t('confirmDelete')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={saving} style={[styles.formButton, styles.typeOption]} onPress={() => { if (savingRef.current) return; setConfirmDelete(false); setError(null); }}><Text style={styles.typeBadgeText}>{t('cancel')}</Text></Pressable>
                </View>
              </> : <View style={styles.actions}>
                <Pressable accessibilityRole="button" style={[styles.formButton, styles.selectedType]} onPress={() => { setError(null); const { id, ...values } = selectedRide; setDraft(values); }}><Text style={styles.joinText}>{t('edit')}</Text></Pressable>
                <Pressable accessibilityRole="button" style={[styles.formButton, styles.deleteButton]} onPress={() => { setError(null); setConfirmDelete(true); }}><Text style={styles.joinText}>{t('delete')}</Text></Pressable>
              </View>)}
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={saving} style={[styles.formButton, styles.typeOption]} onPress={closeDetails}><Text style={styles.typeBadgeText}>{t('close')}</Text></Pressable>
              </View>
            </>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pressedCard: { opacity: 0.75 },
  deleteButton: { backgroundColor: '#B42318' },
  createdCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 16, overflow: 'hidden' },
  cardTouchArea: { width: '100%' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  typeBadge: { alignSelf: 'flex-start', backgroundColor: '#EAF8E9', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, marginVertical: 12 },
  typeBadgeText: { color: '#267332', fontWeight: '800' },
  description: { color: '#4F5D68', fontSize: 15, lineHeight: 22, marginTop: 12 },
  status: { color: '#AAB4BE', marginBottom: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(13, 25, 35, 0.75)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 48 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 24, width: '100%', maxWidth: 520, maxHeight: '100%', overflow: 'hidden' },
  form: { padding: 24 },
  field: { marginBottom: 14 },
  label: { color: '#0D1923', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#AAB4BE', borderRadius: 12, padding: 12, color: '#0D1923', fontSize: 16 },
  descriptionInput: { minHeight: 110, textAlignVertical: 'top' },
  typeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  typeOption: { backgroundColor: '#EAF8E9', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  selectedType: { backgroundColor: '#32C93B' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  formButton: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'center' },
  formError: { color: '#B42318', marginTop: 12, fontSize: 14 },
  disabled: { opacity: 0.45 },
  container: {
    flex: 1,
    backgroundColor: '#0D1923',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 92,
    paddingBottom: 130,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },

  subtitle: {
    color: '#AAB4BE',
    fontSize: 17,
    lineHeight: 23,
    marginTop: 5,
    marginBottom: 25,
  },

  createButton: {
    backgroundColor: '#32C93B',
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 35,
  },

  createButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 15,
    marginTop: 5,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  date: {
    width: 68,
    height: 78,
    borderRadius: 18,
    backgroundColor: '#EAF8E9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  day: {
    color: '#32C93B',
    fontSize: 32,
    fontWeight: '900',
  },

  month: {
    color: '#5E6973',
    fontSize: 13,
    fontWeight: '800',
  },

  info: {
    flex: 1,
    marginLeft: 14,
  },

  rideTitle: {
    color: '#0D1923',
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 5,
  },

  details: {
    color: '#5E6973',
    fontSize: 14,
    marginTop: 2,
  },

  joinButton: {
    backgroundColor: '#32C93B',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
  },

  joinText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },

  emptyCard: {
    backgroundColor: '#162530',
    borderRadius: 24,
    padding: 25,
    alignItems: 'center',
  },

  wheel: {
    fontSize: 34,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 10,
  },

  emptyText: {
    color: '#AAB4BE',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 23,
    marginTop: 8,
  },
});
