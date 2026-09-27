import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenBackButton } from '../components/screen-back-button';
import { getSupabase, getSupabaseConfigurationError } from '../lib/supabase';
import { t } from '../i18n/i18n';

function parseRecoveryUrl(url: string) {
  const normalized = url.replace('#', '?');
  const query = normalized.includes('?') ? normalized.slice(normalized.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    code: params.get('code'),
    type: params.get('type'),
    errorDescription: params.get('error_description'),
  };
}

export default function ResetPasswordScreen() {
  const incomingUrl = Linking.useURL();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const configError = getSupabaseConfigurationError();
  const recoveryUrl = useMemo(() => incomingUrl ?? (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null), [incomingUrl]);

  useEffect(() => {
    let active = true;
    if (configError || !recoveryUrl) return;
    const parsed = parseRecoveryUrl(recoveryUrl);
    if (parsed.errorDescription) {
      setMessage(t('recoveryInvalid'));
      return;
    }
    const client = getSupabase();
    const restore = async () => {
      try {
        if (parsed.accessToken && parsed.refreshToken) {
          const { error } = await client.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
          if (error) throw error;
        } else if (parsed.code) {
          const { error } = await client.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
        } else {
          const { data } = await client.auth.getSession();
          if (!data.session) throw new Error('No recovery session');
        }
        if (active) setReady(true);
      } catch {
        if (active) setMessage(t('recoveryInvalid'));
      }
    };
    void restore();
    return () => { active = false; };
  }, [configError, recoveryUrl]);

  async function updatePassword() {
    if (busy) return;
    if (password.length < 8) { setMessage(t('passwordPlaceholder')); return; }
    if (password !== confirmPassword) { setMessage(t('confirmPasswordPlaceholder')); return; }
    setBusy(true); setMessage(null);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      setMessage(t('passwordUpdated'));
      setPassword(''); setConfirmPassword('');
      setTimeout(() => router.replace('/account'), 700);
    } catch {
      setMessage(t('recoveryInvalid'));
    } finally {
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenBackButton />
      <Text style={styles.title}>{t('resetPasswordTitle')}</Text>
      <Text style={styles.subtitle}>{t('resetPasswordSubtitle')}</Text>
      <View style={styles.card}>
        {configError ? <Text style={styles.warning}>{configError}</Text> : null}
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          placeholder={t('newPasswordPlaceholder')}
          placeholderTextColor="#82909B"
          editable={!busy && ready}
        />
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          placeholder={t('confirmPasswordPlaceholder')}
          placeholderTextColor="#82909B"
          editable={!busy && ready}
        />
        <Pressable disabled={busy || !ready || !!configError} style={[styles.button, (busy || !ready || !!configError) && styles.disabled]} onPress={updatePassword}>
          <Text style={styles.buttonText}>{t('updatePassword')}</Text>
        </Pressable>
      </View>
      {!ready && !message && !configError ? <Text style={styles.small}>{t('operationInProgress')}</Text> : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0D1923' },
  content: { padding: 20, paddingTop: 58, paddingBottom: 120 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 12 },
  subtitle: { color: '#9EACB7', fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 20 },
  card: { backgroundColor: '#152633', borderWidth: 1, borderColor: '#263A48', borderRadius: 22, padding: 18, gap: 12 },
  input: { backgroundColor: '#0D1923', borderColor: '#304554', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, color: '#FFFFFF', fontSize: 16 },
  button: { backgroundColor: '#32C93B', borderRadius: 15, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  warning: { color: '#FFD36A', fontSize: 15, fontWeight: '800' },
  small: { color: '#A8B4BD', fontSize: 13, lineHeight: 19 },
  message: { color: '#FFFFFF', backgroundColor: '#203746', padding: 14, borderRadius: 14, lineHeight: 20, marginTop: 16 },
});
