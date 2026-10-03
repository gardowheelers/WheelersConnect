import { router } from 'expo-router';

import { useEffect, useRef, useState } from 'react';

import { Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import * as ImagePicker from 'expo-image-picker';

import NativeAsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../auth/auth-provider';

import { ScreenBackButton } from '../components/screen-back-button';

import { localStorage as AsyncStorage, storageKey } from '../data/local-store';

import { isProfile, isWheel, LEGACY_LOCAL_ID, legacyPreferences, profileDefaults, rideTypes, wheelDefaults, type Profile, type Wheel, type WheelKey } from '../data/models';

import { t } from '../i18n/i18n';

import { getSupabase } from '../lib/supabase';



const preferenceOptions = rideTypes;

function formatRangeKm(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /\bkm\b/i.test(trimmed) ? trimmed : `${trimmed} km`;
}

const preferenceIcons: Record<string, string> = {
  'Voie verte': '🍃',
  'Forêt': '🌲',
  'Chemins / VTT': '⛰️',
  'Route': '🛣️',
  'Urbain': '🏙️',
  'Tourisme': '📷',
  'Longue distance': '◎',
};

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

  const avatarStorageKey = `@wheelersconnect/${owner}/profile-avatar/v1`;

  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [avatarReady, setAvatarReady] = useState(false);

  const [avatarCloudBusy, setAvatarCloudBusy] = useState(false);

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

    async function loadAvatar() {

      try {

        let stored = await NativeAsyncStorage.getItem(avatarStorageKey);



        // Migrations des premières versions du correctif avatar.

        if (!stored && owner === LEGACY_LOCAL_ID) {

          const oldKey = '@wheelersconnect//profile-avatar/v1';

          const oldStored = await NativeAsyncStorage.getItem(oldKey);

          if (oldStored) {

            await NativeAsyncStorage.setItem(avatarStorageKey, oldStored);

            await NativeAsyncStorage.removeItem(oldKey);

            stored = oldStored;

          }

        }



        // Si l'utilisateur vient de connecter son compte après avoir choisi

        // une photo en mode local, on conserve automatiquement cette photo.

        if (!stored && owner !== LEGACY_LOCAL_ID) {

          const localKey = `@wheelersconnect/${LEGACY_LOCAL_ID}/profile-avatar/v1`;

          const localStored = await NativeAsyncStorage.getItem(localKey);

          if (localStored) {

            await NativeAsyncStorage.setItem(avatarStorageKey, localStored);

            stored = localStored;

          }

        }



        if (active) setAvatarUri(stored);

      } finally {

        if (active) setAvatarReady(true);

      }

    }

    void loadAvatar();

    return () => { active = false; };

  }, [avatarStorageKey]);



  async function persistAvatarUrl(avatarUrl: string) {
    const stored = await AsyncStorage.getItem(profileStorageKey);
    const current = stored
      ? JSON.parse(stored) as Profile
      : profileDefaults(
          local,
          typeof session?.user.user_metadata.display_name === 'string'
            ? session.user.user_metadata.display_name
            : ''
        );

    const updated: Profile = { ...current, avatarUrl };
    await AsyncStorage.setItem(profileStorageKey, JSON.stringify(updated));
    setProfile(updated);
  }

  async function uploadAvatarToCloud(asset: ImagePicker.ImagePickerAsset) {
    if (!session) return null;

    const supabase = getSupabase();
    const userId = session.user.id;
    const mimeType = asset.mimeType || 'image/jpeg';
    const extension = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
        ? 'webp'
        : mimeType.includes('heic')
          ? 'heic'
          : mimeType.includes('heif')
            ? 'heif'
            : 'jpg';
    const filePath = `${userId}/avatar.${extension}`;

    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, arrayBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

    // Le profil lui-même reste géré par le stockage local + remote-store.ts.
    // L'URL sera ajoutée au profil local, puis synchronisée avec la révision.
    return publicUrl;
  }

  async function pickAvatar() {
    if (!avatarReady || avatarCloudBusy) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Accès aux photos',
        'Autorisez Wheelers Connect à accéder à vos photos pour choisir une photo de profil ou un avatar.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.uri) return;

    try {
      await NativeAsyncStorage.setItem(avatarStorageKey, asset.uri);
      setAvatarUri(asset.uri);

      if (session) {
        setAvatarCloudBusy(true);
        try {
          const cloudUrl = await uploadAvatarToCloud(asset);
          if (cloudUrl) {
            await persistAvatarUrl(cloudUrl);
            await NativeAsyncStorage.setItem(avatarStorageKey, cloudUrl);
            setAvatarUri(cloudUrl);
          }
        } finally {
          setAvatarCloudBusy(false);
        }
      }
    } catch {
      Alert.alert(
        'Photo de profil',
        session
          ? "La photo est conservée sur ce téléphone, mais son envoi vers la communauté a échoué. Réessayez."
          : "Impossible d'enregistrer cette image pour le moment."
      );
    }
  }

  async function removeAvatar() {
    try {
      await NativeAsyncStorage.removeItem(avatarStorageKey);
      setAvatarUri(null);

      if (session) {
        setAvatarCloudBusy(true);
        try {
          const supabase = getSupabase();
          const userId = session.user.id;
          const possibleFiles = [
            `${userId}/avatar.jpg`,
            `${userId}/avatar.png`,
            `${userId}/avatar.webp`,
            `${userId}/avatar.heic`,
            `${userId}/avatar.heif`,
          ];

          const { error: removeError } = await supabase.storage
            .from('avatars')
            .remove(possibleFiles);

          if (removeError) throw removeError;

          // La suppression de l'URL est enregistrée localement puis
          // synchronisée par remote-store.ts avec le reste du compte.
          await persistAvatarUrl('');
        } finally {
          setAvatarCloudBusy(false);
        }
      }
    } catch {
      Alert.alert('Photo de profil', "Impossible de retirer l'image pour le moment.");
    }
  }

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

  const displayAvatarUri = avatarUri || profile.avatarUrl || null;



  useEffect(() => {

    let active = true;

    async function loadProfile() {

      setProfileError(null);

      try {

        // Le profil affiché vient toujours du snapshot local du compte.
        // AuthProvider + remote-store.ts se chargent de télécharger la version
        // Supabase à la connexion et de déclencher un nouveau rendu via dataEpoch.
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

  }, [profileLoadAttempt, profileStorageKey, session]);



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

      avatarUrl: profile.avatarUrl ?? '',

    };

    try {

      // Une seule source d'écriture : le snapshot local.
      // local-store le marque "dirty" et AuthProvider le synchronise ensuite
      // automatiquement via remote-store.ts.
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
  const isAddingSecondary = selectedWheel === 'second' && wheels.second.name.trim() === '' && draft !== null;

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

  function openSecondaryWheelFromPlus() {
    if (saveInProgress.current || profileSaveInProgress.current || profileDraft !== null) return;

    if (storageReady) setStorageError(null);
    setSelectedWheel('second');

    if (wheels.second.name.trim() === '') {
      setDraft({ name: '', battery: '', range: '', terrain: '' });
    } else {
      setDraft({ ...wheels.second });
    }
  }



  function cancelWheelEdit() {

    if (saveInProgress.current) return;

    if (isAddingSecondary) setSelectedWheel(null);
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

      const createdSecondary = selectedWheel === 'second' && wheels.second.name.trim() === '';
      setWheels(nextWheels);
      setDraft(null);
      if (createdSecondary) setSelectedWheel(null);

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

      <Text style={styles.subtitle}>{t('profileSubtitle')}</Text>



      <View style={styles.profileCard}>

        <Pressable style={styles.settingsButton} accessibilityRole="button" accessibilityLabel={t('editProfile')} onPress={openProfile}>

          <Text style={styles.settingsIcon}>✎</Text>

        </Pressable>



        <Pressable

          accessibilityRole="button"

          accessibilityLabel="Choisir une photo de profil ou un avatar"

          style={styles.avatarButton}

          onPress={pickAvatar}

        >

          {displayAvatarUri ? (

            <Image source={{ uri: displayAvatarUri }} style={styles.avatarImage} />

          ) : (

            <View style={styles.avatar}>

              <Text style={styles.avatarText}>{initials || '??'}</Text>

            </View>

          )}

          <View style={styles.avatarCamera}>

            <Text style={styles.avatarCameraText}>📷</Text>

          </View>

        </Pressable>



        <View style={styles.avatarActions}>

          <Pressable style={styles.avatarActionButton} onPress={pickAvatar}>

            <Text style={styles.avatarActionText}>

              {displayAvatarUri ? 'Changer la photo / avatar' : 'Ajouter une photo / avatar'}

            </Text>

          </Pressable>

          {displayAvatarUri && (

            <Pressable style={styles.avatarRemoveButton} onPress={removeAvatar}>

              <Text style={styles.avatarRemoveText}>Supprimer la photo</Text>

            </Pressable>

          )}

        </View>

        {session && avatarCloudBusy ? (

          <Text style={styles.avatarCloudStatus}>Enregistrement de la photo…</Text>

        ) : null}



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

            <Text style={styles.statLabel}>
              {Object.values(wheels).filter(item => item.name.trim()).length === 1
                ? t('wheels').replace(/s$/, '')
                : t('wheels')}
            </Text>

          </View>



          <View style={styles.stat}>

            <Text style={[styles.statNumber, styles.levelValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.50}>{profile.level}</Text>

            <Text style={styles.statLabel}>{t('level')}</Text>

          </View>

        </View>



        <Text style={styles.bio}>{profile.bio}</Text>

      </View>



      <LoadStatus ready={profileReady} error={profileError} label={t('profileLoadingLabel')} onRetry={() => setProfileLoadAttempt((attempt) => attempt + 1)} />



      <Pressable accessibilityRole="button" style={styles.accountButton} onPress={() => router.navigate('/account')}>
        <Text style={styles.accountIcon}>☁</Text>
        <Text style={styles.accountButtonText}>{session ? t('accountAndSync') : t('signInCreateAccount')}</Text>
        <Text style={styles.accountChevron}>›</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, styles.sectionTitleInHeader]}>{t('myWheels')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ajouter ou modifier la roue secondaire" style={styles.roundAction} onPress={openSecondaryWheelFromPlus}>
          <Text style={styles.roundActionText}>＋</Text>
        </Pressable>
      </View>

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
          <Text style={styles.wheelDetail}>🛣️ {formatRangeKm(wheels.main.range)}</Text>
          <Text style={styles.wheelDetail}>⛰️ {wheels.main.terrain}</Text>
        </View>
        <Text style={styles.wheelChevron}>›</Text>
      </Pressable>



      {wheels.second.name.trim() !== '' && (

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
            <Text style={styles.wheelDetail}>🛣️ {formatRangeKm(wheels.second.range)}</Text>
            <Text style={styles.wheelDetail}>🏙️ {wheels.second.terrain}</Text>
          </View>
          <Text style={styles.wheelChevron}>›</Text>
        </Pressable>

      )}



      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, styles.sectionTitleInHeader]}>{t('ridePreferences')}</Text>
      </View>

      <View style={styles.tags}>

        {preferenceOptions.map((option) => {

          const selected = preferencesDraft.includes(option);

          return (

            <Pressable key={option} hitSlop={4} accessibilityRole="checkbox" accessibilityLabel={option}

              accessibilityState={{ checked: selected, disabled: !preferencesReady || preferencesSaving }}

              disabled={!preferencesReady || preferencesSaving}

              style={selected ? styles.tagActive : styles.tag} onPress={() => togglePreference(option)}>

              <Text style={selected ? styles.tagActiveText : styles.tagText}>{preferenceIcons[option] ?? '✦'}  {option}</Text>

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

          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} onScrollBeginDrag={Keyboard.dismiss} contentContainerStyle={styles.modalContent}>

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
                {key === 'bio' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Masquer le clavier"
                    style={styles.keyboardDoneButton}
                    onPress={Keyboard.dismiss}
                  >
                    <Text style={styles.keyboardDoneText}>Terminé</Text>
                  </Pressable>
                )}

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

                <Text style={styles.wheelName} accessibilityRole="header">
                  {isAddingSecondary ? 'Ajouter une roue' : draft ? t('editWheel') : wheel.name}
                </Text>

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

                    ) : <Text style={styles.wheelDetail}>{key === 'range' ? formatRangeKm(wheel[key]) : wheel[key]}</Text>}

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

                    <Text style={styles.tagActiveText}>
                      {isAddingSecondary ? 'Ajouter la roue' : draft ? t('save') : t('edit')}
                    </Text>

                  </Pressable>

                  {draft && <Pressable accessibilityRole="button" disabled={saving} style={[styles.actionButton, styles.closeButton]} onPress={cancelWheelEdit}><Text style={styles.tagText}>{t('cancel')}</Text></Pressable>}

                  {!isAddingSecondary && (
                    <Pressable accessibilityRole="button" disabled={saving} style={[styles.actionButton, styles.closeButton]} onPress={closeWheel}>
                      <Text style={styles.tagText}>{t('close')}</Text>
                    </Pressable>
                  )}

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
  pressedCard: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  retryButton: { alignSelf: 'flex-start', marginTop: 10 },
  preferencesMessage: { color: '#AFC2CF', fontSize: 13, marginTop: 10 },

  settingsButton: {
    position: 'absolute', top: 14, right: 14, width: 42, height: 42, borderRadius: 15,
    backgroundColor: 'rgba(14, 76, 108, 0.55)', borderWidth: 1, borderColor: 'rgba(77, 211, 255, 0.70)',
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
    shadowColor: '#19C8FF', shadowOpacity: 0.32, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  settingsIcon: { fontSize: 20, color: '#9AE7FF' },

  avatarButton: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarImage: {
    width: 82, height: 82, borderRadius: 41, backgroundColor: '#102A36', borderWidth: 2, borderColor: '#31D9FF',
    shadowColor: '#23CFFF', shadowOpacity: 0.65, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  avatar: {
    width: 82, height: 82, borderRadius: 41, backgroundColor: 'rgba(15, 75, 99, 0.78)',
    borderWidth: 2, borderColor: '#31D9FF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#23CFFF', shadowOpacity: 0.65, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  avatarText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  avatarCamera: {
    position: 'absolute', right: -4, bottom: -2, width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#17D84B', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#8CFFAF',
    shadowColor: '#18F55A', shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  avatarCameraText: { fontSize: 13 },
  avatarActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 7 },
  avatarActionButton: {
    backgroundColor: 'rgba(18, 153, 78, 0.16)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(46, 245, 112, 0.82)',
    shadowColor: '#24F56A', shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  avatarActionText: { color: '#4AF27A', fontSize: 12, fontWeight: '900' },
  avatarRemoveButton: {
    backgroundColor: 'rgba(16, 96, 132, 0.28)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(69, 198, 255, 0.78)',
  },
  avatarRemoveText: { color: '#D9F5FF', fontSize: 12, fontWeight: '900' },
  avatarCloudStatus: { color: '#AFC2CF', fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 6 },

  bioInput: { minHeight: 96, textAlignVertical: 'top' },
  keyboardDoneButton: {
    alignSelf: 'flex-end', marginTop: 8, backgroundColor: 'rgba(30, 207, 82, 0.16)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(53, 239, 104, 0.70)', paddingHorizontal: 14, paddingVertical: 8,
  },
  keyboardDoneText: { color: '#52F27D', fontSize: 13, fontWeight: '800' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(1, 12, 18, 0.82)', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 36,
  },
  modalCard: {
    width: '100%', maxWidth: 480, maxHeight: '100%', backgroundColor: 'rgba(7, 31, 43, 0.98)',
    borderRadius: 22, borderWidth: 1, borderColor: 'rgba(65, 210, 255, 0.68)', overflow: 'hidden',
    shadowColor: '#19C8FF', shadowOpacity: 0.26, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  modalContent: { padding: 18 },
  field: { marginTop: 12 },
  fieldLabel: { color: '#DDF6FF', fontSize: 13, fontWeight: '800', marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: 'rgba(80, 194, 231, 0.48)', borderRadius: 12, padding: 10,
    color: '#FFFFFF', fontSize: 15, backgroundColor: 'rgba(17, 57, 73, 0.72)',
  },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  actionButton: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  editButton: {
    backgroundColor: 'rgba(28, 212, 76, 0.16)', borderWidth: 1, borderColor: 'rgba(64, 247, 112, 0.82)',
    shadowColor: '#24F56A', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  closeButton: { backgroundColor: 'rgba(21, 78, 102, 0.55)', borderWidth: 1, borderColor: 'rgba(74, 191, 235, 0.52)' },
  disabledButton: { opacity: 0.45 },

  container: { flex: 1, backgroundColor: '#061721' },
  content: { paddingHorizontal: 16, paddingTop: 64, paddingBottom: 110 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#AFC2CF', fontSize: 14, lineHeight: 20, marginTop: 5, marginBottom: 18 },

  profileCard: {
    backgroundColor: 'rgba(8, 46, 64, 0.78)', borderRadius: 24, padding: 18, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(57, 211, 255, 0.88)',
    shadowColor: '#20CFFF', shadowOpacity: 0.34, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  name: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  username: { color: '#AFC2CF', fontSize: 14, marginTop: 2 },
  location: { color: '#C9DDE8', fontSize: 14, marginTop: 6 },
  statsRow: {
    width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginBottom: 14,
    paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(11, 60, 81, 0.56)',
    borderWidth: 1, borderColor: 'rgba(53, 193, 237, 0.52)',
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  statNumber: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  levelValue: { fontSize: 12, textAlign: 'center', maxWidth: '100%' },
  statLabel: { color: '#AFC2CF', fontSize: 11, marginTop: 3, textAlign: 'center' },
  bio: {
    width: '100%', color: '#D3E6EF', fontSize: 14, lineHeight: 20, textAlign: 'center', fontStyle: 'italic',
    backgroundColor: 'rgba(12, 61, 80, 0.46)', borderRadius: 17, borderWidth: 1,
    borderColor: 'rgba(54, 194, 232, 0.44)', paddingHorizontal: 12, paddingVertical: 12,
  },

  accountButton: {
    marginTop: 14, minHeight: 58, borderRadius: 24, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(20, 152, 68, 0.14)', borderWidth: 1.5, borderColor: 'rgba(59, 255, 114, 0.92)',
    shadowColor: '#27F46A', shadowOpacity: 0.34, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  accountIcon: { color: '#43F276', fontSize: 24, marginRight: 12 },
  accountButtonText: { flex: 1, color: '#56F481', fontWeight: '900', fontSize: 17, textAlign: 'center' },
  accountChevron: { color: '#58F587', fontSize: 34, lineHeight: 34, marginLeft: 8 },

  sectionHeader: { marginTop: 22, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 22, marginBottom: 12 },
  sectionTitleInHeader: { marginTop: 0, marginBottom: 0 },
  roundAction: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10, 83, 114, 0.58)', borderWidth: 1, borderColor: 'rgba(57, 210, 255, 0.86)',
    shadowColor: '#23CBFF', shadowOpacity: 0.34, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  roundActionText: { color: '#B8F3FF', fontSize: 25, fontWeight: '500', marginTop: -2 },
  roundEditText: { color: '#B8F3FF', fontSize: 20, fontWeight: '800' },

  wheelCard: {
    backgroundColor: 'rgba(8, 48, 66, 0.76)', borderRadius: 22, padding: 14, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.3, borderColor: 'rgba(55, 208, 255, 0.78)',
    shadowColor: '#23CBFF', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  wheelIcon: {
    width: 72, height: 72, borderRadius: 18, backgroundColor: 'rgba(12, 73, 92, 0.72)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(91, 231, 255, 0.72)',
  },
  wheelEmoji: { fontSize: 31 },
  wheelInfo: { flex: 1, marginLeft: 14 },
  wheelName: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  primary: { color: '#43F15F', fontSize: 12, fontWeight: '900', marginTop: 4, marginBottom: 6 },
  secondary: { color: '#AFC2CF', fontSize: 12, fontWeight: '800', marginTop: 4, marginBottom: 6 },
  wheelDetail: { color: '#C4D7E0', fontSize: 13, marginTop: 2 },
  wheelChevron: { color: '#25D8FF', fontSize: 38, fontWeight: '300', marginLeft: 8 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: 'rgba(10, 55, 73, 0.72)', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(66, 191, 230, 0.62)',
  },
  tagText: { color: '#D5E9F2', fontWeight: '800' },
  tagActive: {
    backgroundColor: 'rgba(17, 151, 70, 0.16)', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(67, 244, 107, 0.88)',
    shadowColor: '#29F46C', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  tagActiveText: { color: '#FFFFFF', fontWeight: '900' },
});
