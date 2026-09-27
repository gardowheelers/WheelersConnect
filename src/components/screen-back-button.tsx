import { router, usePathname } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { Keyboard, Pressable, StyleSheet, Text } from 'react-native';

export function ScreenBackButton() {
  // Subscribe to tab history, including changes made through the bottom bar.
  useNavigationState((state) => state);
  const pathname = usePathname();
  const canGoBack = router.canGoBack();
  if (!canGoBack && pathname === '/') return null;

  return <Pressable accessibilityRole="button"
    accessibilityLabel={canGoBack ? 'Retour à l’écran précédent' : 'Retour à l’accueil'}
    style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    onPress={() => {
      Keyboard.dismiss();
      if (router.canGoBack()) router.back();
      else router.navigate('/');
    }}>
    <Text style={styles.label}>‹ {canGoBack ? 'Retour' : 'Accueil'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: 16, marginBottom: 8 },
  label: { color: '#32C93B', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
