import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/auth-provider';
import { t } from '../i18n/i18n';

type LaunchStage = 'evolution' | 'safety' | 'app';

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
  const [launchStage, setLaunchStage] = useState<LaunchStage>('evolution');

  useEffect(() => {
    let active = true;

    void Linking.getInitialURL().then((url) => {
      if (active && url?.includes('reset-password')) {
        setLaunchStage('app');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (launchStage === 'evolution') {
      const timer = setTimeout(() => setLaunchStage('safety'), 5000);
      return () => clearTimeout(timer);
    }

    if (launchStage === 'safety') {
      const timer = setTimeout(() => setLaunchStage('app'), 8000);
      return () => clearTimeout(timer);
    }
  }, [launchStage]);

  if (launchStage === 'evolution') {
    return (
      <View style={styles.launchScreen}>
        <Image
          source={require('../../assets/images/wheelers-evolution-final.png')}
          style={styles.launchImage}
          resizeMode="cover"
        />
      </View>
    );
  }

  if (launchStage === 'safety') {
    return (
      <View style={styles.launchScreen}>
        <Image
          source={require('../../assets/images/wheelers-securite-final.png')}
          style={styles.launchImage}
          resizeMode="cover"
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
          height: Math.max(74, 50 + insets.bottom),
          paddingTop: 6,
          paddingBottom: Math.max(8, insets.bottom),
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
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
});
