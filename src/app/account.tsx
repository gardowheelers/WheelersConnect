import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/auth-provider';
import { ScreenBackButton } from '../components/screen-back-button';
import { isCurrentUserAdmin } from '../data/admin';
import { importLegacyData } from '../data/local-store';
import { forceUploadLocal, SyncConflictError, syncAccount } from '../data/remote-store';
import { t } from '../i18n/i18n';
import { getSupabase, getSupabaseConfigurationError } from '../lib/supabase';

export default function AccountScreen() {
  const { session, owner, refreshData, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);
  const configError = getSupabaseConfigurationError();

  useEffect(() => {
    let active = true;
    if (!session || configError) { setIsAdmin(false); return () => { active = false; }; }
    void isCurrentUserAdmin().then(value => { if (active) setIsAdmin(value); }).catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [session?.user.id, configError]);

  async function run(action: () => Promise<string | void>) {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { setMessage((await action()) ?? null); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('genericRetryError')); }
    finally { setBusy(false); }
  }
  function credentialsOk() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMessage(t('validEmailRequired')); return false; }
    if (password.length < 8) { setMessage(t('passwordMin8')); return false; }
    return true;
  }
  async function signIn() {
    if (!credentialsOk()) return;
    await run(async () => {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(t('signInError'));
      return t('signInSuccess');
    });
  }
  async function resetPassword() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMessage(t('resetEmailRequired'));
      return;
    }
    await run(async () => {
const redirectTo = 'https://gardowheelers.fr/reset-password-wheelers-connect.html';
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw new Error(t('resetEmailError'));
      return t('resetEmailSent');
    });
  }

  async function signUp() {
    if (!credentialsOk()) return;
    await run(async () => {
      const { data, error } = await getSupabase().auth.signUp({
        email: email.trim(), password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) throw new Error(error.message.includes('already') ? t('accountAlreadyExists') : t('accountCreateError'));
      return data.session ? t('accountCreatedSignedIn') : t('accountCreatedConfirmEmail');
    });
  }

  async function deleteAccount() {
    if (busy) return;
    const confirmDeletion = () => run(async () => {
      const { error } = await getSupabase().rpc('delete_my_account');
      if (error) throw new Error(t('accountDeleteError'));
      await getSupabase().auth.signOut({ scope: 'local' });
      return t('accountDeletedSuccess');
    });

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(t('deleteAccountWebConfirm'))) {
        await confirmDeletion();
      }
      return;
    }

    Alert.alert(
      t('deleteAccountDialogTitle'),
      t('deleteAccountDialogText'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => { void confirmDeletion(); } },
      ],
    );
  }

  async function importLocal() {
    await run(async () => { await importLegacyData(owner); refreshData(); return t('localDataAttached'); });
  }
  async function synchronize(download = false) {
    if (busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const result = await syncAccount(owner, download);
      setSyncConflict(false);
      refreshData();
      setMessage(result);
    } catch (error) {
      if (error instanceof SyncConflictError && !download) {
        setSyncConflict(true);
        setMessage('Deux versions différentes existent. Votre copie locale est conservée. Si cet iPhone contient la bonne version, utilisez le bouton ci-dessous pour remplacer le cloud.');
      } else {
        setMessage(error instanceof Error ? error.message : t('genericRetryError'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function keepThisPhoneAsReference() {
    if (busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const result = await forceUploadLocal(owner);
      setSyncConflict(false);
      refreshData();
      setMessage(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('genericRetryError'));
    } finally {
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenBackButton />
      <Text style={styles.title}>{t('accountTitle')}</Text>
      <Text style={styles.subtitle}>{t('accountSubtitle')}</Text>

      {configError ? <View style={styles.card}><Text style={styles.warning}>{configError}</Text><Text style={styles.small}>{t('supabaseConfigHelp')}</Text></View> : null}

      {!session ? <View style={styles.card}>
        <Text style={styles.section}>{t('accountCreateOrLogin')}</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder={t('displayNamePlaceholder')} placeholderTextColor="#82909B" editable={!busy} />
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder={t('emailPlaceholder')} placeholderTextColor="#82909B" editable={!busy} />
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" placeholder={t('passwordPlaceholder')} placeholderTextColor="#82909B" editable={!busy} />
        <Pressable disabled={busy || !!configError} style={[styles.button, (busy || !!configError) && styles.disabled]} onPress={signIn}><Text style={styles.buttonText}>{t('signIn')}</Text></Pressable>
        <Pressable disabled={busy || !!configError} style={[styles.forgotButton, (busy || !!configError) && styles.disabled]} onPress={resetPassword}><Text style={styles.forgotText}>{t('forgotPassword')}</Text></Pressable>
        <Pressable disabled={busy || !!configError} style={[styles.button, styles.secondary, (busy || !!configError) && styles.disabled]} onPress={signUp}><Text style={styles.buttonText}>{t('createAccount')}</Text></Pressable>
      </View> : <View style={styles.card}>
        <Text style={styles.section}>{t('connectedAccount')}</Text>
        <Text style={styles.email}>{session.user.email ?? t('wheelersConnectAccount')}</Text>
        <Text style={styles.small}>{t('localDataStayDevice')}</Text>
        <Pressable disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={importLocal}><Text style={styles.buttonText}>{t('importData')}</Text></Pressable>
        <Pressable disabled={busy} style={[styles.button, styles.secondary, busy && styles.disabled]} onPress={() => synchronize(false)}><Text style={styles.buttonText}>{t('syncCloud')}</Text></Pressable>
        {syncConflict && (
          <Pressable disabled={busy} style={[styles.button, styles.localWins, busy && styles.disabled]} onPress={keepThisPhoneAsReference}>
            <Text style={styles.buttonText}>Garder cet iPhone et remplacer le cloud</Text>
          </Pressable>
        )}
        <Pressable disabled={busy} style={[styles.button, styles.caution, busy && styles.disabled]} onPress={() => synchronize(true)}><Text style={styles.buttonText}>{t('restoreCloud')}</Text></Pressable>
        <Pressable disabled={busy} style={[styles.button, styles.logout, busy && styles.disabled]} onPress={() => run(async () => { await signOut(); return t('signedOut'); })}><Text style={styles.buttonText}>{t('signOut')}</Text></Pressable>
        <Pressable disabled={busy} style={[styles.button, styles.delete, busy && styles.disabled]} onPress={deleteAccount}><Text style={styles.buttonText}>{t('deleteAccount')}</Text></Pressable>
      </View>}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      {busy ? <Text style={styles.small}>{t('operationInProgress')}</Text> : null}
      {session && isAdmin && <Pressable accessibilityRole="button" style={[styles.button, styles.secondary]} onPress={() => router.navigate('/admin')}>
        <Text style={styles.buttonText}>{t('adminSpace')}</Text>
      </Pressable>}
    </ScrollView>
  </KeyboardAvoidingView>;
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
  page: {
    flex: 1,
    backgroundColor: '#071A24',
  },

  content: {
    padding: 20,
    paddingTop: 58,
    paddingBottom: 120,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 12,
    textShadowColor: 'rgba(61, 213, 255, 0.18)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },

  subtitle: {
    color: '#AAB9C5',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 20,
  },

  card: {
    backgroundColor: 'rgba(16, 43, 58, 0.72)',
    borderWidth: 1.25,
    borderColor: 'rgba(88, 205, 255, 0.38)',
    borderRadius: 24,
    padding: 18,
    gap: 12,
    marginBottom: 16,
    shadowColor: '#24C8FF',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },

  section: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },

  email: {
    color: '#45F05A',
    fontSize: 16,
    fontWeight: '900',
    textShadowColor: 'rgba(69, 240, 90, 0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  input: {
    backgroundColor: 'rgba(5, 24, 34, 0.62)',
    borderColor: 'rgba(89, 210, 255, 0.38)',
    borderWidth: 1.2,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#FFFFFF',
    fontSize: 16,
    shadowColor: '#24C8FF',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },

  button: {
    borderRadius: 17,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    ...ACTION_GLASS,
  },

  secondary: {
    ...ACTION_GLASS,
  },

  caution: {
    ...ACTION_GLASS,
  },

  logout: {
    ...ACTION_GLASS,
  },

  delete: {
    ...ACTION_GLASS,
  },

  localWins: {
    ...ACTION_GLASS,
    backgroundColor: 'rgba(50, 201, 59, 0.16)',
    borderColor: 'rgba(74, 242, 91, 0.92)',
    shadowColor: '#32C93B',
  },

  disabled: {
    opacity: 0.45,
  },

  forgotButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    ...ACTION_GLASS,
  },

  forgotText: {
    fontSize: 14,
    textDecorationLine: 'none',
    textShadowColor: 'rgba(116, 217, 255, 0.20)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 7,
    ...ACTION_TEXT,
  },

  buttonText: {
    fontSize: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 255, 255, 0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    ...ACTION_TEXT,
  },

  warning: {
    color: '#FFD36A',
    fontSize: 15,
    fontWeight: '800',
  },

  small: {
    color: '#B5C1CA',
    fontSize: 13,
    lineHeight: 19,
  },

  message: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(34, 79, 101, 0.50)',
    borderWidth: 1,
    borderColor: 'rgba(91, 209, 255, 0.38)',
    padding: 14,
    borderRadius: 16,
    lineHeight: 20,
    shadowColor: '#24C8FF',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
});
