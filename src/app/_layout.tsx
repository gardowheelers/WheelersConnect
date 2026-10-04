import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/auth-provider';
import { t } from '../i18n/i18n';
import { wcTheme } from '../theme/wheelers-theme';

type LaunchStage = 'checking' | 'safety' | 'app';

const SAFETY_ACK_KEY = 'wheelers-connect:safety-ack:v1';
const SAFETY_PREVIEW_RESET_KEY = 'wheelers-connect:safety-preview-reset:2026-10-04-recording-2';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppTabs />
    </AuthProvider>
  );
}

function AppTabs() {
  const insets = useSafeAreaInsets();
  const { owner } = useAuth();
  const [launchStage, setLaunchStage] = useState<LaunchStage>('checking');
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [safetyControlsVisible, setSafetyControlsVisible] = useState(false);
  const [savingSafety, setSavingSafety] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const url = await Linking.getInitialURL().catch(() => null);

      if (url?.includes('reset-password')) {
        if (active) setLaunchStage('app');
        return;
      }

      // Test ponctuel : fait réapparaître l'écran sécurité une seule fois
      // sur cet appareil, puis conserve le comportement normal.
      const previewResetDone = await AsyncStorage.getItem(SAFETY_PREVIEW_RESET_KEY).catch(() => null);
      if (previewResetDone !== 'done') {
        await AsyncStorage.removeItem(SAFETY_ACK_KEY).catch(() => undefined);
        await AsyncStorage.setItem(SAFETY_PREVIEW_RESET_KEY, 'done').catch(() => undefined);
      }

      const safetyAccepted = await AsyncStorage.getItem(SAFETY_ACK_KEY).catch(() => null);
      if (!active) return;

      setLaunchStage(safetyAccepted === 'accepted' ? 'app' : 'safety');
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (launchStage !== 'safety') {
      setSafetyControlsVisible(false);
      return;
    }

    setSafetyControlsVisible(false);
    const timer = setTimeout(() => setSafetyControlsVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [launchStage]);

  async function acceptSafety() {
    if (!safetyChecked || savingSafety) return;

    setSavingSafety(true);
    try {
      await AsyncStorage.setItem(SAFETY_ACK_KEY, 'accepted');
    } finally {
      setLaunchStage('app');
      setSavingSafety(false);
    }
  }

  if (launchStage === 'checking') {
    return <View style={styles.launchScreen} />;
  }

  if (launchStage === 'safety') {
    return (
      <View style={styles.launchScreen}>
        <Image
          source={require('../../assets/images/wheelers-securite-final.png')}
          style={styles.launchImage}
          resizeMode="cover"
        />

        {safetyControlsVisible ? (
          <View style={[styles.safetyPanel, { bottom: Math.max(18, insets.bottom + 10) }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: safetyChecked }}
              style={styles.safetyCheckRow}
              onPress={() => setSafetyChecked((value) => !value)}
            >
              <View style={[styles.checkbox, safetyChecked && styles.checkboxChecked]}>
                {safetyChecked ? (
                  <Ionicons name="checkmark" size={20} color="#061822" />
                ) : null}
              </View>
              <Text style={styles.safetyCheckText}>{t('safetyAcknowledgement')}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !safetyChecked || savingSafety }}
              disabled={!safetyChecked || savingSafety}
              style={[
                styles.safetyContinue,
                (!safetyChecked || savingSafety) && styles.safetyContinueDisabled,
              ]}
              onPress={() => void acceptSafety()}
            >
              <Text style={styles.safetyContinueText}>
                {savingSafety ? '…' : t('safetyContinue')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Tabs
      key={owner}
      initialRouteName="index"
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: wcTheme.colors.green,
        tabBarInactiveTintColor: wcTheme.colors.textSoft,
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 8,
          backgroundColor: wcTheme.colors.glassStrong,
          borderTopWidth: 1,
          borderTopColor: wcTheme.colors.border,
          borderWidth: 1,
          borderColor: wcTheme.colors.borderSoft,
          borderRadius: 26,
          height: Math.max(78, 54 + insets.bottom),
          paddingTop: 8,
          paddingBottom: Math.max(10, insets.bottom),
          shadowColor: wcTheme.colors.cyan,
          shadowOpacity: 0.22,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
          marginTop: 2,
        },
        tabBarItemStyle: {
          borderRadius: 18,
          marginHorizontal: 2,
        },
      }}
    >
      <Tabs.Screen name="account" options={{ href: null, title: t('account') }} />
      <Tabs.Screen name="admin" options={{ href: null, title: t('adminTitle') }} />
      <Tabs.Screen name="reset-password" options={{ href: null, title: t('resetPasswordTitle') }} />
      <Tabs.Screen name="search" options={{ href: null, title: t('searchTitle') }} />
      <Tabs.Screen name="parcours-gps" options={{ href: null, title: t('gpsRouteTitle') }} />
      <Tabs.Screen name="parcours-detail" options={{ href: null, title: t('routeDetailTitle') }} />

      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: t('map'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'map' : 'map-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="sorties"
        options={{
          title: t('rides'),
          href: '/sorties',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubble' : 'chatbubble-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profil"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  launchScreen: {
    flex: 1,
    backgroundColor: '#061822',
    overflow: 'hidden',
  },

  launchImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },

  safetyPanel: {
    position: 'absolute',
    left: 18,
    right: 18,
    padding: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(6, 24, 34, 0.92)',
    borderWidth: 1.2,
    borderColor: 'rgba(83, 213, 255, 0.72)',
    shadowColor: '#20D9FF',
    shadowOpacity: 0.20,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    gap: 12,
  },

  safetyCheckRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },

  checkbox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: wcTheme.colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 24, 34, 0.78)',
  },

  checkboxChecked: {
    backgroundColor: wcTheme.colors.green,
    borderColor: wcTheme.colors.green,
  },

  safetyCheckText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  safetyContinue: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: wcTheme.colors.green,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },

  safetyContinueDisabled: {
    opacity: 0.38,
  },

  safetyContinueText: {
    color: '#061822',
    fontSize: 17,
    fontWeight: '900',
  },
});
