import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
      {conversations.map(({ member, last }) => <Pressable key={member.userId} style={({ pressed }) => [styles.conversation, pressed && styles.glassPressed]} onPress={() => setSelected(member)}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}><Text style={styles.avatarText}>👤</Text></View>
          <View style={styles.onlineDot} />
        </View>
        <View style={styles.messageInfo}>
          <Text style={styles.name}>{label(member)}</Text>
          <Text style={styles.preview} numberOfLines={1}>{last.body}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>)}

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>{t('availableWheelers')}</Text>
      {members.length === 0 && !loading ? <Text style={styles.muted}>{t('noAvailableWheelers')}</Text> : null}
      {members.map((member) => <Pressable key={member.userId} style={({ pressed }) => [styles.memberCard, pressed && styles.glassPressed]} onPress={() => setSelected(member)}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}><Text style={styles.avatarText}>👤</Text></View>
          <View style={styles.onlineDot} />
        </View>
        <View style={styles.memberText}>
          <Text style={styles.name}>{label(member)}</Text>
          <Text style={styles.preview}>{[member.username ? `@${member.username}` : '', member.location].filter(Boolean).join(' • ') || t('wheelerProfile')}</Text>
        </View>
        <View style={styles.openPill}><Text style={styles.openText}>{t('write')}</Text></View>
      </Pressable>)}

      <Pressable style={({ pressed }) => [styles.refreshButton, pressed && styles.glassPressed]} onPress={() => void refresh()}>
        <Text style={styles.refreshIcon}>↻</Text>
        <Text style={styles.refreshText}>{t('refresh')}</Text>
      </Pressable>
    </ScrollView>

    <Modal visible={selected !== null} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View><Text style={styles.modalTitle}>{selected ? label(selected) : ''}</Text><Text style={styles.modalSubtitle}>{t('privateConversation')}</Text></View>
            <Pressable style={styles.smallActionButton} onPress={() => setSelected(null)}><Text style={styles.closeText}>{t('close')}</Text></Pressable>
          </View>
          <ScrollView
            ref={threadRef}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onContentSizeChange={() => threadRef.current?.scrollToEnd({ animated: true })}
          >
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
  container: { flex: 1, backgroundColor: '#071822' },
  content: { paddingHorizontal: 16, paddingTop: 64, paddingBottom: 110 },

  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(42, 208, 255, 0.12)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: { color: '#AFC1CC', fontSize: 15, marginTop: 5, marginBottom: 22 },
  sectionTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 14, letterSpacing: -0.3 },
  status: { color: '#FFD166', marginBottom: 16, fontWeight: '700' },
  muted: { color: '#AFC1CC', fontSize: 15, marginBottom: 16 },

  conversation: {
    backgroundColor: 'rgba(14, 43, 57, 0.78)',
    borderWidth: 1.4,
    borderColor: 'rgba(83, 213, 255, 0.92)',
    borderRadius: 22,
    padding: 15,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#18C8FF',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  glassPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },

  avatarWrap: { width: 54, height: 54, marginRight: 13, justifyContent: 'center', alignItems: 'center' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(15, 111, 138, 0.42)',
    borderWidth: 2,
    borderColor: '#2FE8FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2FE8FF',
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  avatarText: { fontSize: 23 },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#39E64D',
    borderWidth: 2,
    borderColor: '#0A2530',
    shadowColor: '#39E64D',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  messageInfo: { flex: 1 },
  name: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  preview: { color: '#AFC1CC', fontSize: 14, marginTop: 4 },
  chevron: { color: '#22D7FF', fontSize: 34, lineHeight: 36, fontWeight: '400', marginLeft: 8 },

  memberCard: {
    backgroundColor: 'rgba(14, 43, 57, 0.78)',
    borderWidth: 1.4,
    borderColor: 'rgba(83, 213, 255, 0.88)',
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#18C8FF',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  memberText: { flex: 1 },
  openPill: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginLeft: 10,
    ...ACTION_GLASS,
  },
  openText: { fontSize: 15,
    ...ACTION_TEXT,
  },

  refreshButton: {
    minHeight: 48,
    borderRadius: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    ...ACTION_GLASS,
  },
  refreshIcon: { position: 'absolute', left: 20, color: '#2FE8FF', fontSize: 27, fontWeight: '700' },
  refreshText: { fontSize: 15,
    ...ACTION_TEXT,
  },

  infoCard: {
    backgroundColor: 'rgba(14, 43, 57, 0.74)',
    borderWidth: 1.2,
    borderColor: 'rgba(83, 213, 255, 0.65)',
    borderRadius: 20,
    padding: 16,
    marginTop: 20,
  },
  infoText: { color: '#D8E5EC', fontSize: 14, lineHeight: 20 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 10, 16, 0.76)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#0B202B',
    height: '82%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 20,
    borderWidth: 1.3,
    borderBottomWidth: 0,
    borderColor: 'rgba(83, 213, 255, 0.72)',
    shadowColor: '#18C8FF',
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(83, 213, 255, 0.34)',
  },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  modalSubtitle: { color: '#91AAB7', fontSize: 13, marginTop: 2 },
  smallActionButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...ACTION_GLASS },
  closeText: { fontSize: 14,
    ...ACTION_TEXT,
  },
  thread: { flex: 1 },
  threadContent: { padding: 16, gap: 9 },
  emptyThread: { color: '#91AAB7', textAlign: 'center', marginTop: 35 },
  bubble: { maxWidth: '82%', borderRadius: 17, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1 },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(50, 201, 59, 0.20)',
    borderColor: 'rgba(74, 242, 91, 0.78)',
  },
  theirBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(17, 54, 70, 0.82)',
    borderColor: 'rgba(83, 213, 255, 0.55)',
  },
  bubbleText: { color: '#E8F1F5', fontSize: 15, lineHeight: 20 },
  myBubbleText: { color: '#F3FFF4' },
  composer: {
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(83, 213, 255, 0.28)',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: 'rgba(13, 39, 52, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(83, 213, 255, 0.48)',
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  sendButton: {
    borderRadius: 15,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...ACTION_GLASS,
  },
  sendDisabled: { opacity: 0.45 },
  sendText: {
    ...ACTION_TEXT,
  },
});
