import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/auth-provider';
import { ScreenBackButton } from '../components/screen-back-button';
import { listDirectMessages, listMembers, sendDirectMessage, type DirectMessage, type MemberDirectoryEntry } from '../data/community-messages';
import { t } from '../i18n/i18n';

export default function MessagesScreen() {
  const { owner } = useAuth();
  return <MessagesContent key={owner} />;
}
function MessagesContent() {
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selected, setSelected] = useState<MemberDirectoryEntry | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = selected ? drafts[selected.userId] ?? '' : '';
  const setDraft = (value: string) => { if (selected) setDrafts(previous => ({ ...previous, [selected.userId]: value })); };
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const sendingRef = useRef(false);
  const requestVersion = useRef(0);
  const openedParam = useRef<string | undefined>(undefined);
  const threadRef = useRef<ScrollView>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setStatus('');
    try {
      const [memberRows, messageRows] = await Promise.all([listMembers(), listDirectMessages(userId)]);
      if (version !== requestVersion.current) return;
      setMembers(memberRows);
      setMessages(messageRows);
    } catch {
      if (version === requestVersion.current) setStatus(t('messagingUnavailable'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let busy = false;
    const poll = async () => {
      if (busy || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      busy = true;
      try { await refresh(); } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void poll(); });
    return () => { clearInterval(timer); listener.remove(); requestVersion.current++; };
  }, [userId, refresh]));

  useEffect(() => {
    if (!memberId) { openedParam.current = undefined; return; }
    if (typeof memberId !== 'string' || openedParam.current === memberId) return;
    const member = members.find(person => person.userId === memberId);
    if (member) { openedParam.current = memberId; setSelected(member); router.setParams({ memberId: undefined }); }
  }, [memberId, members]);

  const conversations = useMemo(() => {
    return members
      .map((member) => {
        const related = messages.filter((message) =>
          (message.senderId === userId && message.recipientId === member.userId) ||
          (message.senderId === member.userId && message.recipientId === userId));
        return { member, related, last: related[related.length - 1] };
      })
      .filter((item) => item.last)
      .sort((a, b) => Date.parse(b.last.createdAt) - Date.parse(a.last.createdAt));
  }, [members, messages, userId]);

  const selectedMessages = selected
    ? messages.filter((message) =>
        (message.senderId === userId && message.recipientId === selected.userId) ||
        (message.senderId === selected.userId && message.recipientId === userId))
    : [];

  async function send() {
    if (!selected || !userId || !draft.trim() || sendingRef.current) return;
    const recipientId = selected.userId;
    const text = draft;
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    try {
      await sendDirectMessage(userId, recipientId, text);
      setDrafts(previous => previous[recipientId] === text ? { ...previous, [recipientId]: '' } : previous);
      await refresh();
    } catch {
      setSendError(t('sendNotConfirmed'));
    } finally { sendingRef.current = false; setSending(false); }
  }

  function label(member: MemberDirectoryEntry) {
    return member.displayName.trim() || member.username.trim() || 'Wheeler';
  }

  if (!userId) {
    return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenBackButton />
      <Text style={styles.title}>{t('messages')}</Text>
      <View style={styles.infoCard}><Text style={styles.infoText}>{t('messagesLoginPrompt')}</Text></View>
    </ScrollView>;
  }

  return <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenBackButton />
      <Text style={styles.title}>{t('messages')}</Text>
      <Text style={styles.subtitle}>{t('messagesSubtitle')}</Text>

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {loading && members.length === 0 ? <Text style={styles.muted}>{t('loading')}</Text> : null}

      <Text style={styles.sectionTitle}>{t('conversations')}</Text>
      {conversations.length === 0 ? <Text style={styles.muted}>{t('noConversations')}</Text> : null}
      {conversations.map(({ member, last }) => <Pressable key={member.userId} style={styles.conversation} onPress={() => setSelected(member)}>
        <View style={styles.avatar}><Text style={styles.avatarText}>👤</Text></View>
        <View style={styles.messageInfo}>
          <Text style={styles.name}>{label(member)}</Text>
          <Text style={styles.preview} numberOfLines={1}>{last.body}</Text>
        </View>
      </Pressable>)}

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>{t('availableWheelers')}</Text>
      {members.length === 0 && !loading ? <Text style={styles.muted}>{t('noAvailableWheelers')}</Text> : null}
      {members.map((member) => <Pressable key={member.userId} style={styles.memberCard} onPress={() => setSelected(member)}>
        <View style={styles.memberText}>
          <Text style={styles.name}>{label(member)}</Text>
          <Text style={styles.preview}>{[member.username ? `@${member.username}` : '', member.location].filter(Boolean).join(' • ') || t('wheelerProfile')}</Text>
        </View>
        <Text style={styles.openText}>{t('write')}</Text>
      </Pressable>)}

      <Pressable style={styles.refreshButton} onPress={() => void refresh()}><Text style={styles.refreshText}>{t('refresh')}</Text></Pressable>
    </ScrollView>

    <Modal visible={selected !== null} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View><Text style={styles.modalTitle}>{selected ? label(selected) : ''}</Text><Text style={styles.modalSubtitle}>{t('privateConversation')}</Text></View>
            <Pressable onPress={() => setSelected(null)}><Text style={styles.closeText}>{t('close')}</Text></Pressable>
          </View>
          <ScrollView ref={threadRef} style={styles.thread} contentContainerStyle={styles.threadContent} onContentSizeChange={() => threadRef.current?.scrollToEnd({ animated: true })}>
            {selectedMessages.length === 0 ? <Text style={styles.emptyThread}>{t('startConversation')}</Text> : null}
            {selectedMessages.map((message) => {
              const mine = message.senderId === userId;
              return <View key={message.id} style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
                <Text style={[styles.bubbleText, mine ? styles.myBubbleText : undefined]}>{message.body}</Text>
              </View>;
            })}
          </ScrollView>
          {!!sendError && <Text accessibilityRole="alert" style={{ color: '#9A3412', paddingHorizontal: 16 }}>{sendError}</Text>}
          {!!status && <Text accessibilityRole="alert" style={{ color: '#9A3412', paddingHorizontal: 16 }}>{status}</Text>}
          <View style={styles.composer}>
            <TextInput accessibilityLabel={t('messagePlaceholder')} editable={!sending} value={draft} onChangeText={setDraft} placeholder={t('messagePlaceholder')} placeholderTextColor="#78858E" style={styles.input} multiline maxLength={2000} />
            <Pressable accessibilityRole="button" style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]} disabled={!draft.trim() || sending} onPress={() => void send()}>
              <Text style={styles.sendText}>{sending ? t('sending') : t('send')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1923' },
  content: { paddingHorizontal: 20, paddingTop: 88, paddingBottom: 130 },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: '900' },
  subtitle: { color: '#AAB4BE', fontSize: 20, marginTop: 5, marginBottom: 25 },
  sectionTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginBottom: 13 },
  status: { color: '#FFD166', marginBottom: 16, fontWeight: '700' },
  muted: { color: '#AAB4BE', fontSize: 15, marginBottom: 16 },
  conversation: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EAF8E9', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 25 },
  messageInfo: { flex: 1, marginLeft: 13 },
  name: { color: '#0D1923', fontSize: 17, fontWeight: '900' },
  preview: { color: '#697681', fontSize: 14, marginTop: 4 },
  memberCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  memberText: { flex: 1 },
  openText: { color: '#1F9F2A', fontSize: 15, fontWeight: '900' },
  refreshButton: { borderWidth: 1, borderColor: '#3B4D5A', borderRadius: 18, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  refreshText: { color: '#FFFFFF', fontWeight: '800' },
  infoCard: { backgroundColor: '#162530', borderRadius: 22, padding: 22, marginTop: 20 },
  infoText: { color: '#D3DCE2', fontSize: 16, lineHeight: 23 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#F4F6F7', height: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20 },
  modalHeader: { paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#CAD1D6' },
  modalTitle: { color: '#0D1923', fontSize: 23, fontWeight: '900' },
  modalSubtitle: { color: '#697681', fontSize: 13, marginTop: 2 },
  closeText: { color: '#1F9F2A', fontWeight: '900', fontSize: 16 },
  thread: { flex: 1 },
  threadContent: { padding: 16, gap: 9 },
  emptyThread: { color: '#697681', textAlign: 'center', marginTop: 35 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#32C93B' },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF' },
  bubbleText: { color: '#0D1923', fontSize: 16, lineHeight: 21 },
  myBubbleText: { color: '#FFFFFF' },
  composer: { padding: 12, paddingBottom: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#CAD1D6', flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 46, maxHeight: 110, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, color: '#0D1923', fontSize: 16 },
  sendButton: { backgroundColor: '#32C93B', borderRadius: 18, minHeight: 46, justifyContent: 'center', paddingHorizontal: 16 },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontWeight: '900' },
});
