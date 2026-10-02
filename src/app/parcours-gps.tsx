import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackButton } from '../components/screen-back-button';
import { router } from 'expo-router';
import { wcTheme } from '../theme/wheelers-theme';

// expo-location est chargé au lancement de cet écran. Il fonctionne dans Expo Go en premier plan.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Location = require('expo-location') as any;

type Point = { latitude: number; longitude: number; timestamp: number; speed: number | null; accuracy: number | null };
type SavedRide = { id: string; startedAt: number; endedAt: number; distanceM: number; points: Point[] };

const STORAGE_KEY = 'wheelers-connect:gps-rides:v1';
const SELECTED_RIDE_KEY = 'wheelers-connect:gps-selected-ride:v1';
const toRad = (v: number) => (v * Math.PI) / 180;
function metersBetween(a: Point, b: Point) {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s).padStart(2, '0')} s`;
}

const MAP_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#081821' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ba5b3' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#081821' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#244553' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0b202a' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0c242f' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#17313d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#214958' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#122d38' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#041019' }] },
];

function smoothTrack(points: Point[]): LatLng[] {
  if (points.length <= 2) {
    return points.map(({ latitude, longitude }) => ({ latitude, longitude }));
  }

  return points.map((_, index) => {
    const from = Math.max(0, index - 2);
    const to = Math.min(points.length - 1, index + 2);
    const sample = points.slice(from, to + 1);
    return {
      latitude: sample.reduce((sum, p) => sum + p.latitude, 0) / sample.length,
      longitude: sample.reduce((sum, p) => sum + p.longitude, 0) / sample.length,
    };
  });
}

export default function ParcoursGpsScreen() {
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [points, setPoints] = useState<Point[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [gpsMessage, setGpsMessage] = useState('GPS prêt à être testé');
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [lastStepM, setLastStepM] = useState(0);
  const [savedRides, setSavedRides] = useState<SavedRide[]>([]);
  const watchRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAcceptedRef = useRef<Point | null>(null);
  const lastUpdateAtRef = useRef(0);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try { setSavedRides(JSON.parse(raw)); } catch { setSavedRides([]); }
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (startedAt && status !== 'idle') setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt, status]);

  useEffect(() => () => {
    watchRef.current?.remove?.();
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const acceptLocation = (loc: any) => {
    const p: Point = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      timestamp: loc.timestamp || Date.now(),
      speed: loc.coords.speed ?? null,
      accuracy: Number.isFinite(Number(loc.coords.accuracy)) ? Number(loc.coords.accuracy) : null,
    };

    // Ignore only obviously unusable fixes. A normal phone GPS fix is usually far better than 100 m.
    const accuracy = Number(loc.coords.accuracy ?? 9999);
    setLastAccuracy(Number.isFinite(accuracy) ? accuracy : null);
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) {
      setGpsMessage('Position GPS invalide');
      return;
    }
    // On reste tolérant pendant le diagnostic réel sur iPhone : une position imprécise
    // est affichée et comptée, plutôt que d'être silencieusement rejetée.
    if (accuracy > 300) {
      setGpsMessage(`Signal GPS trop imprécis (${Math.round(accuracy)} m)`);
      return;
    }

    const last = lastAcceptedRef.current;
    if (last) {
      const delta = metersBetween(last, p);
      const dt = Math.max(1, (p.timestamp - last.timestamp) / 1000);
      const impliedKmh = (delta / dt) * 3.6;
      setLastStepM(delta);
      // Rejette seulement les sauts GPS manifestement impossibles.
      // Les petits déplacements sont conservés pour que la marche soit visible au test.
      if (delta >= 0.25 && delta < 500 && impliedKmh < 140) {
        setDistanceM((d) => d + delta);
      }
      // Avoid storing a stream of identical stationary points.
      if (delta < 0.5 && p.timestamp - last.timestamp < 5000) {
        lastUpdateAtRef.current = Date.now();
        setGpsMessage('Signal GPS reçu • position stable');
        return;
      }
    }

    lastAcceptedRef.current = p;
    lastUpdateAtRef.current = Date.now();
    setPoints((current) => {
      const next = [...current, p];
      setGpsMessage(`Signal GPS reçu • ${next.length} point${next.length > 1 ? 's' : ''}`);
      return next;
    });
  };

  const stopLocationFeeds = () => {
    watchRef.current?.remove?.();
    watchRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const beginWatch = async () => {
    setGpsMessage('Demande d’autorisation GPS…');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setGpsMessage('Autorisation GPS refusée');
      Alert.alert('Position refusée', "Wheelers Connect ne peut pas enregistrer le parcours sans votre autorisation GPS.");
      return false;
    }

    stopLocationFeeds();

    setGpsMessage('Recherche du premier point GPS…');

    // Seed immediately with a real GPS fix. This makes the first point available even
    // if Expo Go is slow to emit the first watchPosition callback.
    try {
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      acceptLocation(first);
    } catch {
      setGpsMessage('Premier point non reçu • écoute GPS en cours…');
      // The watcher below can still recover, so do not fail the whole recording.
    }

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation ?? Location.Accuracy.Highest,
        distanceInterval: 1,
        timeInterval: 1000,
        mayShowUserSettingsDialog: true,
      },
      acceptLocation
    );

    // Expo Go on iOS can occasionally delay foreground watcher callbacks.
    // Poll only as a fallback when no fresh fix has arrived for a few seconds.
    pollRef.current = setInterval(() => {
      if (Date.now() - lastUpdateAtRef.current < 4000) return;
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest })
        .then(acceptLocation)
        .catch(() => undefined);
    }, 3000);

    return true;
  };

  const start = async () => {
    setPoints([]); setDistanceM(0); setElapsed(0); setLastStepM(0); setLastAccuracy(null); setGpsMessage('Initialisation du GPS…');
    lastAcceptedRef.current = null; lastUpdateAtRef.current = 0;
    const ok = await beginWatch();
    if (!ok) return;
    setStartedAt(Date.now());
    setStatus('recording');
  };
  const pause = () => { stopLocationFeeds(); setStatus('paused'); };
  const resume = async () => { if (await beginWatch()) setStatus('recording'); };
  const stop = async () => {
    stopLocationFeeds();
    if (!startedAt || points.length === 0) { setStatus('idle'); setStartedAt(null); return; }

    // Un essai inférieur à 5 m s'afficherait comme 0,00 km : on ne le garde pas dans l'historique.
    if (distanceM < 5) {
      setStatus('idle');
      setStartedAt(null);
      Alert.alert('Essai trop court', 'Moins de 5 mètres : ce test GPS n’a pas été ajouté à Mes parcours.');
      return;
    }

    const ride: SavedRide = { id: String(Date.now()), startedAt, endedAt: Date.now(), distanceM, points };
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const existing: SavedRide[] = raw ? JSON.parse(raw) : [];
    const updated = [ride, ...existing].slice(0, 50);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSavedRides(updated);
    setStatus('idle'); setStartedAt(null);
    Alert.alert('Parcours enregistré', `${(distanceM / 1000).toFixed(2)} km enregistrés sur cet iPhone.`);
  };

  const deleteRide = (ride: SavedRide) => {
    Alert.alert(
      'Supprimer ce parcours ?',
      `${(ride.distanceM / 1000).toFixed(2)} km • ${formatDuration(ride.endedAt - ride.startedAt)}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const updated = savedRides.filter((item) => item.id !== ride.id);
              await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              const selectedId = await AsyncStorage.getItem(SELECTED_RIDE_KEY);
              if (selectedId === ride.id) await AsyncStorage.removeItem(SELECTED_RIDE_KEY);
              setSavedRides(updated);
            })();
          },
        },
      ]
    );
  };


  const displayTrack = smoothTrack(points);
  const firstCoordinate = displayTrack[0] ?? null;
  const latestCoordinate = displayTrack[displayTrack.length - 1] ?? null;

  useEffect(() => {
    if (!latestCoordinate || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: latestCoordinate, zoom: 17 },
      { duration: 500 }
    );
  }, [latestCoordinate?.latitude, latestCoordinate?.longitude]);

  const currentSpeed = (() => {
    if (!points.length) return 0;
    const latest = points[points.length - 1];
    const nativeKmh = typeof latest.speed === 'number' && latest.speed > 0 ? latest.speed * 3.6 : 0;
    if (nativeKmh > 0) return nativeKmh;
    if (points.length < 2) return 0;
    const previous = points[points.length - 2];
    const dt = Math.max(1, (latest.timestamp - previous.timestamp) / 1000);
    const fallbackKmh = (metersBetween(previous, latest) / dt) * 3.6;
    return fallbackKmh < 120 ? fallbackKmh : 0;
  })();
  const stateLabel =
    status === 'recording'
      ? 'Enregistrement en cours'
      : status === 'paused'
      ? 'En pause'
      : 'Prêt à rouler';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenBackButton />

        <View style={styles.badge}>
          <Ionicons name="navigate" size={15} color={wcTheme.colors.green} />
          <Text style={styles.badgeText}>GPS • NIGHT RIDE</Text>
        </View>

        <Text style={styles.title}>Enregistrer un parcours</Text>
        <Text style={styles.subtitle}>
          Les points GPS sont conservés, mais la carte affiche une trace fluide et propre.
        </Text>

        <View style={styles.mapCard}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            customMapStyle={MAP_DARK_STYLE}
            mapType="standard"
            showsUserLocation={status !== 'idle'}
            showsMyLocationButton={false}
            showsCompass={false}
            showsScale={false}
            showsBuildings={false}
            toolbarEnabled={false}
            initialRegion={{
              latitude: 43.88,
              longitude: 4.56,
              latitudeDelta: 0.035,
              longitudeDelta: 0.035,
            }}
          >
            {displayTrack.length >= 2 ? (
              <>
                <Polyline
                  coordinates={displayTrack}
                  strokeColor="rgba(56,231,255,0.28)"
                  strokeWidth={11}
                  lineCap="round"
                  lineJoin="round"
                />
                <Polyline
                  coordinates={displayTrack}
                  strokeColor={wcTheme.colors.cyan}
                  strokeWidth={5}
                  lineCap="round"
                  lineJoin="round"
                />
              </>
            ) : null}

            {firstCoordinate ? (
              <Marker coordinate={firstCoordinate} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.startMarker}>
                  <Ionicons name="flag" size={15} color={wcTheme.colors.bg} />
                </View>
              </Marker>
            ) : null}

            {latestCoordinate ? (
              <Marker coordinate={latestCoordinate} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.currentMarker}>
                  <View style={styles.currentMarkerInner} />
                </View>
              </Marker>
            ) : null}
          </MapView>

          <View style={styles.mapTop}>
            <View style={styles.mapPill}>
              <View
                style={[
                  styles.statusDot,
                  status === 'recording' && styles.statusDotOn,
                  status === 'paused' && styles.statusDotPause,
                ]}
              />
              <Text style={styles.mapPillText}>{stateLabel}</Text>
            </View>

            <View style={styles.mapPill}>
              <Ionicons name="locate-outline" size={15} color={wcTheme.colors.cyan} />
              <Text style={styles.mapPillText}>
                {lastAccuracy == null ? 'GPS' : `± ${Math.round(lastAccuracy)} m`}
              </Text>
            </View>
          </View>

          {!latestCoordinate ? (
            <View style={styles.mapEmpty}>
              <View style={styles.mapEmptyIcon}>
                <Ionicons name="navigate" size={31} color={wcTheme.colors.cyan} />
              </View>
              <Text style={styles.mapEmptyTitle}>Carte prête</Text>
              <Text style={styles.mapEmptyText}>
                Démarre pour voir ta position et ta trace apparaître en direct.
              </Text>
            </View>
          ) : null}

          <View style={styles.mapBottom}>
            <Text style={styles.gpsSignal}>{gpsMessage}</Text>
          </View>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="map-outline" size={20} color={wcTheme.colors.cyan} />
            <Text style={styles.value}>{(distanceM / 1000).toFixed(2)}</Text>
            <Text style={styles.label}>km</Text>
          </View>

          <View style={styles.stat}>
            <Ionicons name="time-outline" size={20} color={wcTheme.colors.green} />
            <Text style={styles.valueDuration}>{formatDuration(elapsed)}</Text>
            <Text style={styles.label}>durée</Text>
          </View>

          <View style={styles.stat}>
            <Ionicons name="speedometer-outline" size={20} color={wcTheme.colors.cyan} />
            <Text style={styles.value}>{currentSpeed.toFixed(1)}</Text>
            <Text style={styles.label}>km/h</Text>
          </View>
        </View>

        {status === 'idle' ? (
          <Pressable style={styles.primary} onPress={() => void start()}>
            <View style={styles.primaryIcon}>
              <Ionicons name="play" size={24} color={ACTION_CYAN} />
            </View>
            <Text style={styles.primaryText}>Démarrer le parcours</Text>
          </Pressable>
        ) : (
          <View style={styles.actions}>
            {status === 'recording' ? (
              <Pressable style={styles.secondary} onPress={pause}>
                <Ionicons name="pause" size={22} color={ACTION_CYAN} />
                <Text style={styles.secondaryText}>Pause</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.secondary} onPress={() => void resume()}>
                <Ionicons name="play" size={22} color={ACTION_CYAN} />
                <Text style={styles.secondaryText}>Reprendre</Text>
              </Pressable>
            )}

            <Pressable style={styles.stop} onPress={() => void stop()}>
              <Ionicons name="stop" size={22} color={ACTION_CYAN} />
              <Text style={styles.secondaryText}>Terminer</Text>
            </Pressable>
          </View>
        )}

        {status !== 'idle' ? (
          <View style={styles.debugGlass}>
            <Ionicons name="pulse-outline" size={18} color={wcTheme.colors.cyan} />
            <Text style={styles.debugText}>
              Précision : {lastAccuracy == null ? '—' : `${Math.round(lastAccuracy)} m`}
              {'  •  '}Dernier déplacement : {lastStepM.toFixed(1)} m
              {'  •  '}{points.length} point{points.length > 1 ? 's' : ''} conservé
              {points.length > 1 ? 's' : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={24} color={wcTheme.colors.green} />
          <Text style={styles.noteText}>
            Les points GPS bruts restent enregistrés pour préserver la précision du parcours
            et permettre plus tard l’export GPX. Seul l’affichage de la trace est lissé.
          </Text>
        </View>

        <View style={styles.history}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyTitle}>Mes parcours</Text>
              <Text style={styles.historySubtitle}>
                {savedRides.length
                  ? `${savedRides.length} parcours enregistré${savedRides.length > 1 ? 's' : ''} sur cet iPhone`
                  : 'Aucun parcours enregistré pour le moment'}
              </Text>
            </View>
            <Ionicons name="trail-sign-outline" size={25} color={wcTheme.colors.cyan} />
          </View>

          {savedRides.slice(0, 5).map((ride) => (
            <View key={ride.id} style={styles.rideCard}>
              <Pressable
                style={styles.rideOpen}
                onPress={() => {
                  void AsyncStorage.setItem(SELECTED_RIDE_KEY, ride.id).then(() => {
                    router.push({ pathname: '/parcours-detail', params: { id: ride.id } });
                  });
                }}
              >
                <View style={styles.rideIcon}>
                  <Ionicons name="map-outline" size={23} color={wcTheme.colors.cyan} />
                </View>

                <View style={styles.rideMain}>
                  <Text style={styles.rideDate}>
                    {new Date(ride.startedAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.rideMeta}>
                    {(ride.distanceM / 1000).toFixed(2)} km • {formatDuration(ride.endedAt - ride.startedAt)}
                  </Text>
                  <Text style={styles.ridePoints}>{ride.points.length} points GPS conservés</Text>
                </View>

                <Ionicons name="chevron-forward" size={23} color={wcTheme.colors.green} />
              </Pressable>

              <Pressable
                accessibilityLabel="Supprimer ce parcours"
                style={styles.rideDelete}
                onPress={() => deleteRide(ride)}
              >
                <Ionicons name="trash-outline" size={22} color={wcTheme.colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  safe: { flex: 1, backgroundColor: wcTheme.colors.bg },
  container: { padding: 18, paddingBottom: 130 },

  badge: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(87,243,107,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(87,243,107,0.40)',
  },
  badgeText: { color: wcTheme.colors.green, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },

  title: { color: wcTheme.colors.text, fontSize: 36, lineHeight: 41, fontWeight: '900', marginTop: 18 },
  subtitle: { color: wcTheme.colors.textMuted, fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 20 },

  mapCard: {
    height: 390,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: wcTheme.colors.panelStrong,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    ...wcTheme.shadow.glow,
  },
  mapTop: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  mapPill: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(4,17,26,0.84)',
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
  },
  mapPillText: { color: wcTheme.colors.text, fontSize: 12, fontWeight: '900' },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: wcTheme.colors.textSoft },
  statusDotOn: { backgroundColor: wcTheme.colors.green },
  statusDotPause: { backgroundColor: wcTheme.colors.warning },

  mapEmpty: {
    position: 'absolute',
    top: 120,
    left: 28,
    right: 28,
    alignItems: 'center',
    padding: 20,
    borderRadius: 26,
    backgroundColor: 'rgba(5,22,31,0.72)',
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
  },
  mapEmptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56,231,255,0.12)',
    borderWidth: 1,
    borderColor: wcTheme.colors.cyan,
  },
  mapEmptyTitle: { color: wcTheme.colors.text, fontSize: 20, fontWeight: '900', marginTop: 12 },
  mapEmptyText: { color: wcTheme.colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },

  mapBottom: { position: 'absolute', bottom: 14, left: 14, right: 14, alignItems: 'center' },
  gpsSignal: {
    color: wcTheme.colors.greenSoft,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(4,17,26,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(87,243,107,0.25)',
  },

  startMarker: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: wcTheme.colors.green,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.86)',
  },
  currentMarker: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(56,231,255,0.20)',
    borderWidth: 2, borderColor: wcTheme.colors.cyan,
  },
  currentMarkerInner: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: wcTheme.colors.cyan,
  },

  stats: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  stat: {
    flex: 1,
    minHeight: 118,
    borderRadius: 24,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: wcTheme.colors.glass,
    borderWidth: 1,
    borderColor: wcTheme.colors.border,
    ...wcTheme.shadow.soft,
  },
  value: { color: wcTheme.colors.text, fontSize: 25, fontWeight: '900', textAlign: 'center', marginTop: 5 },
  valueDuration: { color: wcTheme.colors.text, fontSize: 17, lineHeight: 20, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  label: { color: wcTheme.colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 3 },

  primary: {
    minHeight: 64,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    ...wcTheme.shadow.greenGlow,
    ...ACTION_GLASS,
  },
  primaryIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: wcTheme.colors.green,
  },
  primaryText: { fontSize: 19,
    ...ACTION_TEXT, },

  actions: { flexDirection: 'row', gap: 12 },
  secondary: {
    flex: 1,
    minHeight: 60,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...ACTION_GLASS,
  },
  stop: {
    flex: 1,
    minHeight: 60,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...ACTION_GLASS,
  },
  secondaryText: { fontSize: 16,
    ...ACTION_TEXT, },

  debugGlass: {
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: wcTheme.colors.panelSoft,
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
  },
  debugText: { flex: 1, color: wcTheme.colors.textSoft, fontSize: 11, lineHeight: 16, fontWeight: '700' },

  note: {
    marginTop: 20,
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: wcTheme.colors.glass,
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
  },
  noteText: { flex: 1, color: wcTheme.colors.textMuted, fontSize: 13, lineHeight: 20 },

  history: { marginTop: 26 },
  historyHeader: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  historyTitle: { color: wcTheme.colors.text, fontSize: 25, fontWeight: '900' },
  historySubtitle: { color: wcTheme.colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 5 },

  rideCard: {
    marginBottom: 11,
    borderRadius: 20,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: wcTheme.colors.glass,
    borderWidth: 1,
    borderColor: wcTheme.colors.borderSoft,
  },
  rideOpen: { flex: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rideDelete: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    ...ACTION_GLASS,
    backgroundColor: 'rgba(255, 68, 84, 0.10)',
    borderColor: 'rgba(255, 68, 84, 0.58)',
    borderLeftColor: 'rgba(255, 68, 84, 0.78)',
  },
  rideIcon: {
    width: 44, height: 44, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(56,231,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(56,231,255,0.22)',
  },
  rideMain: { flex: 1 },
  rideDate: { color: wcTheme.colors.text, fontSize: 15, fontWeight: '900' },
  rideMeta: { color: wcTheme.colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  ridePoints: { color: wcTheme.colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 3 },
});
