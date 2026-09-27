import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function useInfoSheet() {
  const [info, setInfo] = useState<{ title: string; message: string } | null>(null);
  const focused = useIsFocused();
  useEffect(() => { if (!focused) setInfo(null); }, [focused]);
  const close = () => setInfo(null);
  return {
    showInfo(title: string, message: string) {
      Keyboard.dismiss();
      setInfo({ title, message });
    },
    infoSheet: <Modal visible={focused && info !== null} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">{info?.title}</Text>
            <Text style={styles.message}>{info?.message}</Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={close}>
              <Text style={styles.buttonText}>Fermer</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>,
  };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13, 25, 35, 0.75)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 48 },
  card: { width: '100%', maxWidth: 480, maxHeight: '100%', backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' },
  content: { padding: 24 },
  title: { color: '#0D1923', fontSize: 20, fontWeight: '900' },
  message: { color: '#5E6973', fontSize: 16, lineHeight: 23, marginTop: 14 },
  button: { alignSelf: 'flex-start', borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#EAF8E9', marginTop: 24 },
  buttonText: { color: '#267332', fontWeight: '800' },
});
