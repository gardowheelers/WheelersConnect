import { localStorage as AsyncStorage, storageKey } from '../data/local-store';
import { router } from 'expo-router';
import { useAuth } from '../auth/auth-provider';
import { LEGACY_LOCAL_ID, profileDefaults, wheelDefaults, legacyPreferences, rideTypes, isProfile, isWheel, type Profile, type Wheel, type WheelKey } from '../data/models';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenBackButton } from '../components/screen-back-button';
import { t } from '../i18n/i18n';

const preferenceOptions = rideTypes;
const profileFields = [
  { key: 'name', labelKey: 'profileFieldName' },
  { key: 'username', labelKey: 'profileFieldUsername' },
  { key: 'location', labelKey: 'profileFieldLocation' },
  { key: 'age', labelKey: 'profileFieldAge' },
  { key: 'practiceYears', labelKey: 'profileFieldPracticeYears' },
  { key: 'level', labelKey: 'profileFieldLevel' },
  { key: 'bio', labelKey: 'profileFieldBio' },
] as const;

const wheelFields = [
  { key: 'name', labelKey: 'wheelFieldName' },
  { key: 'battery', labelKey: 'wheelFieldBattery' },
  { key: 'range', labelKey: 'wheelFieldRange' },
  { key: 'terrain', labelKey: 'wheelFieldTerrain' },
] as const;

function LoadStatus({ ready, error, label, onRetry, inModal = false }: {
  ready: boolean;
  error: string | null;
  label: string;
  onRetry: () => void;
  inModal?: boolean;
}) {
  if (ready) return null;
  return <View>
    <Text style={inModal ? styles.wheelDetail : styles.preferencesMessage} accessibilityRole={error ? 'alert' : undefined}>
      {error ?? `${t('loading')} ${label}`}
    </Text>
    {error && <Pressable accessibilityRole="button" accessibilityLabel={`${t('retry')} ${label}`}
      style={[styles.actionButton, styles.closeButton, styles.retryButton]} onPress={onRetry}>
      <Text style={styles.tagText}>{t('retry')}</Text>
    </Pressable>}
  </View>;
}

export default function ProfilScreen() {
  const { owner, dataEpoch } = useAuth();
  return <ProfileContent key={owner + ':' + dataEpoch} />;
}

function ProfileContent() {
  const { owner, session } = useAuth();
  const local = owner === LEGACY_LOCAL_ID;
  const wheelsStorageKey = storageKey(owner, 'wheels');
  const profileStorageKey = storageKey(owner, 'profile');
  const preferencesStorageKey = storageKey(owner, 'ride-preferences');
  const defaultProfile = profileDefaults(local, typeof session?.user.user_metadata.display_name === 'string' ? session.user.user_metadata.display_name : '');
  const [preferences, setPreferences] = useState(local ? [...legacyPreferences] : []);
  const [preferencesDraft, setPreferencesDraft] = useState(local ? [...legacyPreferences] : []);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferencesLoadAttempt, setPreferencesLoadAttempt] = useState(0);
  const preferencesSaveInProgress = useRef(false);
  const preferencesChanged = preferenceOptions.some((option) => preferences.includes(option) !== preferencesDraft.includes(option));

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      setPreferencesError(null);
      try {
        const stored = await AsyncStorage.getItem(preferencesStorageKey);
        if (!active) return;
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string' && preferenceOptions.includes(item))) {
            throw new Error('Invalid stored preferences');
          }
          const selected = preferenceOptions.filter((option) => parsed.includes(option));
          setPreferences(selected);
          setPreferencesDraft(selected);
        }
        setPreferencesReady(true);
      } catch {
        if (active) setPreferencesError(t('preferencesLoadError'));
      }
    }
    void loadPreferences();
    return () => { active = false; };
  }, [preferencesLoadAttempt]);

  function togglePreference(option: string) {
    if (!preferencesReady || preferencesSaveInProgress.current) return;
    setPreferencesDraft((previous) => previous.includes(option)
      ? previous.filter((item) => item !== option) : [...previous, option]);
    setPreferencesError(null);
  }

  async function savePreferences() {
    if (!preferencesReady || !preferencesChanged || preferencesSaveInProgress.current) return;
    preferencesSaveInProgress.current = true;
    setPreferencesSaving(true);
    setPreferencesError(null);
    const selected = preferenceOptions.filter((option) => preferencesDraft.includes(option));
    try {
      await AsyncStorage.setItem(preferencesStorageKey, JSON.stringify(selected));
      setPreferences(selected);
      setPreferencesDraft(selected);
    } catch {
      setPreferencesError(t('preferencesSaveError'));
    } finally {
      preferencesSaveInProgress.current = false;
      setPreferencesSaving(false);
    }
  }

  const [profile, setProfile] = useState(defaultProfile);
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const profileSaveInProgress = useRef(false);
  const profileSaveDisabled = !profileReady || profileSaving || !isProfile(profileDraft);
  const nameParts = profile.name.trim().split(/\s+/);
  const initials = (nameParts.length > 1
    ? `${Array.from(nameParts[0])[0]}${Array.from(nameParts[nameParts.length - 1])[0]}`
    : Array.from(nameParts[0]).slice(0, 2).join('')).toLocaleUpperCase('fr');

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setProfileError(null);
      try {
        const stored = await AsyncStorage.getItem(profileStorageKey);
        if (!active) return;
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (!isProfile(parsed)) throw new Error('Invalid stored profile');
          setProfile(parsed);
          setProfileDraft((previous) => previous ? { ...parsed } : null);
        }
        setProfileReady(true);
      } catch {
        if (active) setProfileError(t('profileLoadError'));
      }
    }
    void loadProfile();
    return () => { active = false; };
  }, [profileLoadAttempt]);

  function openProfile() {
    if (profileSaveInProgress.current || saveInProgress.current || selectedWheel !== null) return;
    if (profileReady) setProfileError(null);
    setProfileDraft({ ...profile });
  }

  function closeProfile() {
    if (profileSaveInProgress.current) return;
    setProfileDraft(null);
    if (profileReady) setProfileError(null);
  }

  async function saveProfile() {
    if (profileSaveDisabled || !profileDraft || profileSaveInProgress.current) return;
    profileSaveInProgress.current = true;
    setProfileSaving(true);
    setProfileError(null);
    const updated: Profile = {
      name: profileDraft.name.trim(), username: profileDraft.username.trim(),
      location: profileDraft.location.trim(), age: profileDraft.age.trim(),
practiceYears: profileDraft.practiceYears.trim(),
      level: profileDraft.level.trim(), bio: profileDraft.bio.trim(),
    };
    try {
      await AsyncStorage.setItem(profileStorageKey, JSON.stringify(updated));
      setProfile(updated);
      setProfileDraft(null);
    } catch {
      setProfileError(t('profileSaveError'));
    } finally {
      profileSaveInProgress.current = false;
      setProfileSaving(false);
    }
  }

  const [wheels, setWheels] = useState(() => wheelDefaults(local));
  const [selectedWheel, setSelectedWheel] = useState<WheelKey | null>(null);
  const [draft, setDraft] = useState<Wheel | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [wheelsLoadAttempt, setWheelsLoadAttempt] = useState(0);
  const saveInProgress = useRef(false);
  const wheel = selectedWheel ? wheels[selectedWheel] : null;
  const canSave = draft !== null && wheelFields.every(({ key }) => draft[key].trim().length > 0);
  const actionDisabled = !storageReady || saving || (draft !== null && !canSave);

  useEffect(() => {
    let active = true;
    async function loadWheels() {
      setStorageError(null);
      try {
        const stored = await AsyncStorage.getItem(wheelsStorageKey);
        if (!active) return;
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (typeof parsed !== 'object' || parsed === null ||
              !('main' in parsed) || !('second' in parsed) ||
              !isWheel(parsed.main) || !isWheel(parsed.second)) {
            throw new Error('Invalid stored wheels');
          }
          setWheels({ main: parsed.main, second: parsed.second });
        }
        setStorageReady(true);
      } catch {
        if (active) setStorageError(t('wheelsLoadError'));
      }
    }
    void loadWheels();
    return () => { active = false; };
  }, [wheelsLoadAttempt]);

  function openWheel(key: WheelKey) {
    if (saveInProgress.current || profileSaveInProgress.current || profileDraft !== null) return;
    setDraft(null);
    if (storageReady) setStorageError(null);
    setSelectedWheel(key);
  }

  function cancelWheelEdit() {
    if (saveInProgress.current) return;
    setDraft(null);
    if (storageReady) setStorageError(null);
  }

  function closeWheel() {
    if (saveInProgress.current) return;
    setSelectedWheel(null);
    setDraft(null);
    if (storageReady) setStorageError(null);
  }

  async function saveWheel() {
    if (!selectedWheel || !draft || !canSave || !storageReady || saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setStorageError(null);
    const updated = {
      name: draft.name.trim(), battery: draft.battery.trim(),
      range: draft.range.trim(), terrain: draft.terrain.trim(),
    };
    const nextWheels = { ...wheels, [selectedWheel]: updated };
    try {
      await AsyncStorage.setItem(wheelsStorageKey, JSON.stringify(nextWheels));
      setWheels(nextWheels);
      setDraft(null);
    } catch {
      setStorageError(t('wheelsSaveError'));
    } finally {
      saveInProgress.current = false;
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
      <Text style={styles.title}>{t('myProfile')}</Text>
      <Text style={styles.subtitle}>
        {t('profileSubtitle')}
      </Text>
      <View style={styles.profileCard}>
        <Pressable style={styles.settingsButton} accessibilityRole="button" accessibilityLabel={t('editProfile')} onPress={openProfile}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '??'}</Text>
        </View>
<Text style={styles.name}>{profile.name || t('myProfile')}</Text>
<Text style={styles.username}>{profile.username}</Text>
<Text style={styles.location}>📍 {profile.location}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
           <Text style={styles.statNumber}>{profile.age}</Text>
            <Text style={styles.statLabel}>{t('years')}</Text>
          </View>

          <View style={styles.stat}>
<Text style={styles.statNumber}>{profile.practiceYears}</Text>
            <Text style={styles.statLabel}>{t('practice')}</Text>
          </View>

          <View style={styles.stat}>
           <Text style={styles.statNumber}>{Object.values(wheels).filter(item => item.name.trim()).length}</Text>
            <Text style={styles.statLabel}>{t('wheels')}</Text>
          </View>

          <View style={styles.stat}>
           <Text style={[styles.statNumber, styles.levelValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.50}>{profile.level}</Text>
            <Text style={styles.statLabel}>{t('level')}</Text>
          </View>
        </View>

        <Text style={styles.bio}>
{profile.bio}
        </Text>
      </View>
      <LoadStatus ready={profileReady} error={profileError} label={t('profileLoadingLabel')} onRetry={() => setProfileLoadAttempt((attempt) => attempt + 1)} />

      <Pressable accessibilityRole="button" style={[styles.actionButton, styles.editButton, { marginTop: 18 }]} onPress={() => router.navigate('/account')}>
        <Text style={styles.tagActiveText}>{session ? t('accountAndSync') : t('signInCreateAccount')}</Text>
      </Pressable>
      <Text style={styles.sectionTitle}>{t('myWheels')}</Text>
      <LoadStatus ready={storageReady} error={storageError} label={t('wheelsLoadingLabel')} onRetry={() => setWheelsLoadAttempt((attempt) => attempt + 1)} />

      <Pressable pointerEvents="box-only" style={({ pressed }) => [styles.wheelCard, pressed && styles.pressedCard]}
        accessibilityRole="button" accessibilityLabel={`Voir la fiche de ${wheels.main.name || t('mainWheel')}`} accessibilityHint={t('mainWheel')}
        onPress={() => openWheel('main')}>
        <View style={styles.wheelIcon}>
          <Text style={styles.wheelEmoji}>🛞</Text>
        </View>

        <View style={styles.wheelInfo}>
          <Text style={styles.wheelName}>{wheels.main.name || t('mainWheel')}</Text>
          <Text style={styles.primary}>{t('mainWheel')}</Text>
          <Text style={styles.wheelDetail}>⚡ {wheels.main.battery}</Text>
          <Text style={styles.wheelDetail}>🛣️ {wheels.main.range}</Text>
          <Text style={styles.wheelDetail}>⛰️ {wheels.main.terrain}</Text>
        </View>
      </Pressable>

      <Pressable pointerEvents="box-only" style={({ pressed }) => [styles.wheelCard, pressed && styles.pressedCard]}
        accessibilityRole="button" accessibilityLabel={`Voir la fiche de ${wheels.second.name || t('secondaryWheel')}`} accessibilityHint={t('secondaryWheel')}
        onPress={() => openWheel('second')}>
        <View style={styles.wheelIcon}>
          <Text style={styles.wheelEmoji}>🛞</Text>
        </View>

        <View style={styles.wheelInfo}>
          <Text style={styles.wheelName}>{wheels.second.name || t('secondaryWheel')}</Text>
          <Text style={styles.secondary}>{t('secondaryWheel')}</Text>
          <Text style={styles.wheelDetail}>⚡ {wheels.second.battery}</Text>
          <Text style={styles.wheelDetail}>🛣️ {wheels.second.range}</Text>
          <Text style={styles.wheelDetail}>🏙️ {wheels.second.terrain}</Text>
        </View>
      </Pressable>

      <Text style={styles.sectionTitle}>{t('ridePreferences')}</Text>

      <View style={styles.tags}>
        {preferenceOptions.map((option) => {
          const selected = preferencesDraft.includes(option);
          return (
            <Pressable key={option} hitSlop={4} accessibilityRole="checkbox" accessibilityLabel={option}
              accessibilityState={{ checked: selected, disabled: !preferencesReady || preferencesSaving }}
              disabled={!preferencesReady || preferencesSaving}
              style={selected ? styles.tagActive : styles.tag} onPress={() => togglePreference(option)}>
              <Text style={selected ? styles.tagActiveText : styles.tagText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <LoadStatus ready={preferencesReady} error={preferencesError} label={t('preferencesLoadingLabel')} onRetry={() => setPreferencesLoadAttempt((attempt) => attempt + 1)} />
      {preferencesReady && preferencesError && <Text style={styles.preferencesMessage} accessibilityRole="alert">{preferencesError}</Text>}
      {preferencesChanged && (
        <>
          <Text style={styles.preferencesMessage}>{t('savePreferencesHint')}</Text>
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: preferencesSaving, busy: preferencesSaving }} disabled={preferencesSaving}
              style={[styles.actionButton, styles.editButton, preferencesSaving && styles.disabledButton]} onPress={savePreferences}>
              <Text style={styles.tagActiveText}>{t('save')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={preferencesSaving} style={[styles.actionButton, styles.closeButton]}
              onPress={() => {
                if (preferencesSaveInProgress.current) return;
                setPreferencesDraft(preferences);
                setPreferencesError(null);
              }}>
              <Text style={styles.tagText}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </>
      )}
      
    </ScrollView>
    <Modal visible={profileDraft !== null} transparent animationType="fade" onRequestClose={closeProfile}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.modalContent}>
            <Text style={styles.wheelName} accessibilityRole="header">{t('editProfile')}</Text>
            {profileDraft && profileFields.map(({ key, labelKey }) => (
              (() => { const label = t(labelKey); return (
              <View key={key} style={styles.field}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  style={[styles.input, key === 'bio' && styles.bioInput]}
                  accessibilityLabel={label}
                  value={profileDraft[key]}
                  editable={profileReady && !profileSaving}
                  keyboardType={key === 'age' || key === 'practiceYears' ? 'number-pad' : 'default'}
                  autoCapitalize={key === 'username' ? 'none' : 'sentences'}
                  autoCorrect={key !== 'username'}
                  multiline={key === 'bio'}
                  onChangeText={(value) => setProfileDraft((previous) => previous ? { ...previous, [key]: value } : previous)}
                />
              </View>); })()
            ))}
            <Text style={styles.wheelDetail}>{t('profileFieldsHelp')}</Text>
            <LoadStatus ready={profileReady} error={profileError} label={t('profileLoadingLabel')} inModal onRetry={() => setProfileLoadAttempt((attempt) => attempt + 1)} />
            {profileReady && profileError && <Text style={styles.wheelDetail} accessibilityRole="alert">{profileError}</Text>}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: profileSaveDisabled, busy: profileSaving }} disabled={profileSaveDisabled} style={[styles.actionButton, styles.editButton, profileSaveDisabled && styles.disabledButton]} onPress={saveProfile}>
                <Text style={styles.tagActiveText}>{t('save')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={profileSaving} style={[styles.actionButton, styles.closeButton]} onPress={closeProfile}>
                <Text style={styles.tagText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={profileSaving} style={[styles.actionButton, styles.closeButton]} onPress={closeProfile}>
                <Text style={styles.tagText}>{t('close')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={wheel !== null} transparent animationType="fade" onRequestClose={closeWheel}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.modalContent}>
            {wheel && (
              <>
                <Text style={styles.wheelEmoji}>🛞</Text>
                <Text style={styles.wheelName} accessibilityRole="header">{draft ? t('editWheel') : wheel.name}</Text>
                <Text style={selectedWheel === 'main' ? styles.primary : styles.secondary}>
                  {selectedWheel === 'main' ? t('mainWheel') : t('secondaryWheel')}
                </Text>
                {wheelFields.map(({ key, labelKey }) => (
                  (() => { const label = t(labelKey); return (
                  <View key={key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    {draft ? (
                      <TextInput
                        style={styles.input}
                        accessibilityLabel={label}
                        value={draft[key]}
                        editable={!saving}
                        onChangeText={(value) => setDraft((previous) => previous ? { ...previous, [key]: value } : previous)}
                      />
                    ) : <Text style={styles.wheelDetail}>{wheel[key]}</Text>}
                  </View>); })()
                ))}
                {draft && <Text style={styles.wheelDetail}>{t('wheelFieldsHelp')}</Text>}
                <LoadStatus ready={storageReady} error={storageError} label={t('wheelsLoadingLabel')} inModal onRetry={() => setWheelsLoadAttempt((attempt) => attempt + 1)} />
                {storageReady && storageError && <Text style={styles.wheelDetail} accessibilityRole="alert">{storageError}</Text>}
                <View style={styles.modalActions}>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: actionDisabled, busy: saving }} disabled={actionDisabled} style={[styles.actionButton, styles.editButton, actionDisabled && styles.disabledButton]} onPress={() => {
                    if (!storageReady || saveInProgress.current) return;
                    if (draft) return saveWheel();
                    setStorageError(null);
                    setDraft({ ...wheel });
                  }}>
                    <Text style={styles.tagActiveText}>{draft ? t('save') : t('edit')}</Text>
                  </Pressable>
                  {draft && <Pressable accessibilityRole="button" disabled={saving} style={[styles.actionButton, styles.closeButton]} onPress={cancelWheelEdit}><Text style={styles.tagText}>{t('cancel')}</Text></Pressable>}
                  <Pressable accessibilityRole="button" disabled={saving} style={[styles.actionButton, styles.closeButton]} onPress={closeWheel}>
                    <Text style={styles.tagText}>{t('close')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pressedCard: { opacity: 0.75 },
  retryButton: { alignSelf: 'flex-start', marginTop: 10 },
  preferencesMessage: { color: '#AAB4BE', fontSize: 14, marginTop: 12 },
  settingsButton: { position: 'absolute', top: 16, right: 16, width: 44, height: 44, borderRadius: 14, backgroundColor: '#E8F2FF', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  settingsIcon: { fontSize: 24, color: '#2784E8' },
  bioInput: { minHeight: 110, textAlignVertical: 'top' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(13, 25, 35, 0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 48,
  },
  modalCard: { width: '100%', maxWidth: 480, maxHeight: '100%', backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' },
  modalContent: { padding: 24 },
  field: { marginTop: 14 },
  fieldLabel: { color: '#0D1923', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#AAB4BE', borderRadius: 12, padding: 12, color: '#0D1923', fontSize: 16 },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
  actionButton: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  editButton: { backgroundColor: '#32C93B' },
  closeButton: { backgroundColor: '#EAF8E9' },
  disabledButton: { opacity: 0.45 },
  container: {
    flex: 1,
    backgroundColor: '#0D1923',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 88,
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

  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
  },

  avatar: {
    width: 95,
    height: 95,
    borderRadius: 48,
    backgroundColor: '#32C93B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },

  name: {
    color: '#0D1923',
    fontSize: 28,
    fontWeight: '900',
  },

  username: {
    color: '#697681',
    fontSize: 16,
    marginTop: 2,
  },

  location: {
    color: '#3C4B57',
    fontSize: 16,
    marginTop: 8,
  },

  statsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 25,
    marginBottom: 20,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statNumber: {
    color: '#0D1923',
    fontSize: 17,
    fontWeight: '900',
  },

  levelValue: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: '100%',
  },

  statLabel: {
    color: '#7A8791',
    fontSize: 12,
    marginTop: 3,
    textAlign: 'center',
  },

  bio: {
    color: '#4F5D68',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 28,
    marginBottom: 15,
  },

  wheelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  wheelIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#EAF8E9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  wheelEmoji: {
    fontSize: 34,
  },

  wheelInfo: {
    flex: 1,
    marginLeft: 16,
  },

  wheelName: {
    color: '#0D1923',
    fontSize: 20,
    fontWeight: '900',
  },

  primary: {
    color: '#1FA82D',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 7,
  },

  secondary: {
    color: '#7D8B96',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 7,
  },

  wheelDetail: {
    color: '#5E6973',
    fontSize: 14,
    marginTop: 2,
  },

  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  tag: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  tagText: {
    color: '#44525D',
    fontWeight: '700',
  },

  tagActive: {
    backgroundColor: '#32C93B',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  tagActiveText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
