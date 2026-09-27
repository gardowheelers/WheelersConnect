import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/auth-provider';
import { getLanguage, t } from '../i18n/i18n';

type LaunchStage = 'intro' | 'safety' | 'app';

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
  const [launchStage, setLaunchStage] = useState<LaunchStage>('intro');

  useEffect(() => {
    let active = true;
    void Linking.getInitialURL().then((url) => {
      if (active && url?.includes('reset-password')) setLaunchStage('app');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (launchStage === 'intro') {
      const timer = setTimeout(() => setLaunchStage('safety'), 5000);
      return () => clearTimeout(timer);
    }

    if (launchStage === 'safety') {
      const timer = setTimeout(() => setLaunchStage('app'), 3000);
      return () => clearTimeout(timer);
    }
  }, [launchStage]);

  if (launchStage === 'intro') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Image
          source={require('../../assets/images/intro-wheelers.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (launchStage === 'safety') {
    return (
      <View style={styles.safetyPosterScreen}>
        <Image
          source={require('../../assets/images/safety-wheelers-new.png')}
          style={styles.safetyPosterImage}
          resizeMode="contain"
        />
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
        tabBarActiveTintColor: '#32C93B',
        tabBarInactiveTintColor: '#7D8B96',
        tabBarStyle: {
          backgroundColor: '#0D1923',
          borderTopColor: '#263746',
          height: Math.max(86, 58 + insets.bottom),
          paddingTop: 8,
          paddingBottom: Math.max(12, insets.bottom),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
      }}
    >
      <Tabs.Screen name="account" options={{ href: null, title: t('account') }} />
      <Tabs.Screen name="admin" options={{ href: null, title: 'Administration' }} />
      <Tabs.Screen name="reset-password" options={{ href: null, title: t('resetPasswordTitle') }} />
      <Tabs.Screen name="search" options={{ href: null, title: 'Recherche' }} />
      <Tabs.Screen name="parcours-gps" options={{ href: null, title: 'Parcours GPS' }} />
      <Tabs.Screen name="parcours-detail" options={{ href: null, title: 'Détail du parcours' }} />
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('map'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sorties"
        options={{
          title: t('rides'),
          href: '/sorties',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}


const styles = StyleSheet.create({
  safetyPosterScreen: { flex: 1, backgroundColor: '#061822' },
  safetyPosterImage: { width: '100%', height: '100%' },
  safetyScreen: {
    flex: 1,
    backgroundColor: '#07141E',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  safetyHeader: {
    alignItems: 'center',
    gap: 2,
  },
  safetyBrand: {
    color: '#FFFFFF',
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
  },
  safetyBrandAccent: { color: '#4BEA76' },
  safetyTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  safetySubtitle: {
    color: '#BFD1DC',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  safetyBody: {
    flex: 1,
    minHeight: 0,
    marginVertical: 8,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  safetyRider: {
    width: '48%',
    height: '100%',
    borderRadius: 22,
    backgroundColor: '#0B2230',
  },
  safetyGear: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  safetyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 9,
    backgroundColor: '#122936',
    borderWidth: 1,
    borderColor: '#2F4A58',
  },
  safetyCheck: {
    color: '#4BEA76',
    fontSize: 18,
    fontWeight: '900',
    marginRight: 7,
  },
  safetyGearText: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  safetyFooter: {
    color: '#FFFFFF',
    backgroundColor: '#122936',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
});
