import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/auth-provider';
import { ScreenBackButton } from '../components/screen-back-button';
import { isCurrentUserAdmin } from '../data/admin';
import { importLegacyData } from '../data/local-store';
import { SyncConflictError, syncAccount } from '../data/remote-store';
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
    await run(async () => {
      try { const result = await syncAccount(owner, download); refreshData(); return result; }
      catch (error) {
        if (error instanceof SyncConflictError) throw error;
        throw error;
      }
    });
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0D1923' }, content: { padding: 20, paddingTop: 58, paddingBottom: 120 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 12 }, subtitle: { color: '#9EACB7', fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 20 },
  card: { backgroundColor: '#152633', borderWidth: 1, borderColor: '#263A48', borderRadius: 22, padding: 18, gap: 12, marginBottom: 16 },
  section: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' }, email: { color: '#32C93B', fontSize: 16, fontWeight: '800' },
  input: { backgroundColor: '#0D1923', borderColor: '#304554', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, color: '#FFFFFF', fontSize: 16 },
  button: { backgroundColor: '#32C93B', borderRadius: 15, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, secondary: { backgroundColor: '#245D78' }, caution: { backgroundColor: '#6C5A24' }, logout: { backgroundColor: '#75353A' }, delete: { backgroundColor: '#8B2229' }, disabled: { opacity: 0.45 },
  forgotButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center' }, forgotText: { color: '#74D9FF', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' }, warning: { color: '#FFD36A', fontSize: 15, fontWeight: '800' }, small: { color: '#A8B4BD', fontSize: 13, lineHeight: 19 }, message: { color: '#FFFFFF', backgroundColor: '#203746', padding: 14, borderRadius: 14, lineHeight: 20 },
});
