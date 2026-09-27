import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackButton } from '../components/screen-back-button';
import { router } from 'expo-router';

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
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <ScreenBackButton />
    <Text style={styles.versionBadge}>GPS 9 • PARCOURS PROPRES</Text>
    <Text style={styles.title}>Enregistrer un parcours</Text>
    <Text style={styles.subtitle}>Le GPS de votre téléphone trace votre balade uniquement quand vous le décidez.</Text>
    <View style={styles.live}><Ionicons name="navigate-circle" size={66} color="#34d12f" /><Text style={styles.state}>{status === 'recording' ? 'Enregistrement en cours' : status === 'paused' ? 'En pause' : 'Prêt à rouler'}</Text><Text style={styles.gpsSignal}>{gpsMessage}</Text>{status !== 'idle' ? <Text style={styles.gpsDebug}>Précision : {lastAccuracy == null ? '—' : `${Math.round(lastAccuracy)} m`}  •  Dernier déplacement : {lastStepM.toFixed(1)} m</Text> : null}</View>
    <View style={styles.stats}>
      <View style={styles.stat}><Text style={styles.value}>{(distanceM / 1000).toFixed(2)}</Text><Text style={styles.label}>km</Text></View>
      <View style={styles.stat}><Text style={styles.value}>{formatDuration(elapsed)}</Text><Text style={styles.label}>durée</Text></View>
      <View style={styles.stat}><Text style={styles.value}>{currentSpeed.toFixed(1)}</Text><Text style={styles.label}>km/h</Text></View>
    </View>
    {status === 'idle' ? <Pressable style={styles.primary} onPress={() => void start()}><Ionicons name="play" size={24} color="#071a23" /><Text style={styles.primaryText}>Démarrer</Text></Pressable> : <View style={styles.actions}>
      {status === 'recording' ? <Pressable style={styles.secondary} onPress={pause}><Ionicons name="pause" size={22} color="#fff" /><Text style={styles.secondaryText}>Pause</Text></Pressable> : <Pressable style={styles.secondary} onPress={() => void resume()}><Ionicons name="play" size={22} color="#fff" /><Text style={styles.secondaryText}>Reprendre</Text></Pressable>}
      <Pressable style={styles.stop} onPress={() => void stop()}><Ionicons name="stop" size={22} color="#fff" /><Text style={styles.secondaryText}>Terminer</Text></Pressable>
    </View>}
    <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={24} color="#34d12f" /><Text style={styles.noteText}>Aucun suivi ne démarre tout seul. Cette première version enregistre le GPS lorsque Wheelers Connect reste ouvert. Le suivi écran verrouillé sera activé dans la version installable finale.</Text></View>
    <View style={styles.history}>
      <Text style={styles.historyTitle}>Mes parcours</Text>
      <Text style={styles.historySubtitle}>{savedRides.length ? `${savedRides.length} parcours enregistré${savedRides.length > 1 ? 's' : ''} sur cet iPhone` : 'Aucun parcours enregistré pour le moment'}</Text>
      {savedRides.slice(0, 5).map((ride) => (
        <View key={ride.id} style={styles.rideCard}>
          <Pressable style={styles.rideOpen} onPress={() => {
            void AsyncStorage.setItem(SELECTED_RIDE_KEY, ride.id).then(() => {
              router.push({ pathname: '/parcours-detail', params: { id: ride.id } });
            });
          }}>
            <View style={styles.rideIcon}><Ionicons name="map-outline" size={24} color="#34d12f" /></View>
            <View style={styles.rideMain}>
              <Text style={styles.rideDate}>{new Date(ride.startedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
              <Text style={styles.rideMeta}>{(ride.distanceM / 1000).toFixed(2)} km  •  {formatDuration(ride.endedAt - ride.startedAt)}  •  {ride.points.length} points GPS</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#34d12f" />
          </Pressable>
          <Pressable accessibilityLabel="Supprimer ce parcours" style={styles.rideDelete} onPress={() => deleteRide(ride)}>
            <Ionicons name="trash-outline" size={22} color="#ff7777" />
          </Pressable>
        </View>
      ))}
    </View>
  </ScrollView></SafeAreaView>;
}

const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#071a23'},container:{padding:24,paddingBottom:120},versionBadge:{alignSelf:'flex-start',backgroundColor:'#34d12f',color:'#071a23',fontSize:13,fontWeight:'900',paddingHorizontal:12,paddingVertical:7,borderRadius:999,marginTop:18},title:{fontSize:38,fontWeight:'900',color:'#fff',marginTop:22},subtitle:{fontSize:18,lineHeight:25,color:'#aab6bd',marginTop:8,marginBottom:28},live:{alignItems:'center',backgroundColor:'#122936',borderRadius:28,padding:24},state:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:8},gpsSignal:{color:'#8fe68b',fontSize:13,fontWeight:'800',marginTop:8,textAlign:'center'},gpsDebug:{color:'#91a6b0',fontSize:12,fontWeight:'700',marginTop:6,textAlign:'center'},stats:{flexDirection:'row',gap:10,marginVertical:18},stat:{flex:1,backgroundColor:'#fff',borderRadius:20,paddingVertical:18,paddingHorizontal:8,alignItems:'center',justifyContent:'center'},value:{fontSize:20,fontWeight:'900',color:'#071a23',textAlign:'center'},label:{fontSize:13,fontWeight:'800',color:'#687781',marginTop:4},primary:{backgroundColor:'#34d12f',borderRadius:22,padding:20,flexDirection:'row',gap:10,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:22,fontWeight:'900',color:'#071a23'},actions:{flexDirection:'row',gap:12},secondary:{flex:1,backgroundColor:'#29424e',borderRadius:22,padding:18,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},stop:{flex:1,backgroundColor:'#a83232',borderRadius:22,padding:18,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:18,fontWeight:'900',color:'#fff'},note:{marginTop:24,backgroundColor:'#102c37',borderRadius:20,padding:18,flexDirection:'row',gap:12},noteText:{flex:1,color:'#c1cbd0',fontSize:15,lineHeight:22},history:{marginTop:24},historyTitle:{color:'#fff',fontSize:26,fontWeight:'900'},historySubtitle:{color:'#91a6b0',fontSize:14,fontWeight:'700',marginTop:5,marginBottom:12},rideCard:{backgroundColor:'#122936',borderRadius:18,marginBottom:10,flexDirection:'row',alignItems:'stretch',overflow:'hidden'},rideOpen:{flex:1,padding:14,flexDirection:'row',alignItems:'center',gap:12},rideDelete:{width:54,alignItems:'center',justifyContent:'center',borderLeftWidth:1,borderLeftColor:'#23414f'},rideIcon:{width:44,height:44,borderRadius:14,backgroundColor:'#0b202b',alignItems:'center',justifyContent:'center'},rideMain:{flex:1},rideDate:{color:'#fff',fontSize:16,fontWeight:'900'},rideMeta:{color:'#aab6bd',fontSize:13,fontWeight:'700',marginTop:4}});
