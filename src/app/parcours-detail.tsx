import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackButton } from '../components/screen-back-button';

type Point = { latitude: number; longitude: number; timestamp: number; speed: number | null; accuracy: number | null };
type SavedRide = { id: string; startedAt: number; endedAt: number; distanceM: number; points: Point[] };
const STORAGE_KEY = 'wheelers-connect:gps-rides:v1';
const SELECTED_RIDE_KEY = 'wheelers-connect:gps-selected-ride:v1';

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s).padStart(2, '0')} s`;
}

export default function ParcoursDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const [ride, setRide] = useState<SavedRide | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapView>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
        const fallbackId = await AsyncStorage.getItem(SELECTED_RIDE_KEY);
        const targetId = routeId || fallbackId || '';
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const rides: SavedRide[] = raw ? JSON.parse(raw) : [];
        if (active) setRide(rides.find((r) => String(r.id) === String(targetId)) ?? null);
      } catch { if (active) setRide(null); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [params.id]);

  const coordinates = useMemo(() => (ride?.points ?? []).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map((p) => ({ latitude: p.latitude, longitude: p.longitude })), [ride]);
  const avgKmh = useMemo(() => !ride || ride.endedAt <= ride.startedAt ? 0 : (ride.distanceM / ((ride.endedAt - ride.startedAt) / 1000)) * 3.6, [ride]);
  const maxKmh = useMemo(() => ride ? Math.max(0, ...ride.points.map((p) => typeof p.speed === 'number' && p.speed > 0 ? p.speed * 3.6 : 0)) : 0, [ride]);
  useEffect(() => {
    if (coordinates.length > 1) {
      const timer = setTimeout(() => mapRef.current?.fitToCoordinates(coordinates, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: false }), 350);
      return () => clearTimeout(timer);
    }
  }, [coordinates]);

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <ScreenBackButton />
    <Text style={styles.badge}>GPS 8 • CARTE DU PARCOURS</Text>
    <Text style={styles.title}>Détail du parcours</Text>
    {loading ? <View style={styles.card}><Text style={styles.empty}>Chargement du parcours…</Text></View> : !ride ? <View style={styles.card}><Text style={styles.empty}>Parcours introuvable.</Text></View> : <>
      <Text style={styles.date}>{new Date(ride.startedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</Text>
      {coordinates.length > 0 ? <View style={styles.mapShell}>
        <MapView ref={mapRef} style={styles.map} mapType="standard" showsCompass showsScale initialRegion={{ latitude: coordinates[0].latitude, longitude: coordinates[0].longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }}>
          {coordinates.length > 1 && <Polyline coordinates={coordinates} strokeColor="#24d52d" strokeWidth={6} />}
          <Marker coordinate={coordinates[0]} title="Départ" pinColor="#24d52d" />
          {coordinates.length > 1 && <Marker coordinate={coordinates[coordinates.length - 1]} title="Arrivée" />}
        </MapView>
        <View pointerEvents="none" style={styles.mapLabel}><Ionicons name="navigate" size={17} color="#071a23" /><Text style={styles.mapLabelText}>{coordinates.length} points GPS</Text></View>
      </View> : <View style={styles.mapPreview}><Ionicons name="map-outline" size={54} color="#34d12f" /><Text style={styles.mapTitle}>Aucun point GPS exploitable</Text></View>}
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.value}>{(ride.distanceM / 1000).toFixed(2)}</Text><Text style={styles.label}>km</Text></View>
        <View style={styles.stat}><Text style={styles.value}>{formatDuration(ride.endedAt - ride.startedAt)}</Text><Text style={styles.label}>durée</Text></View>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.value}>{avgKmh.toFixed(1)}</Text><Text style={styles.label}>km/h moyen</Text></View>
        <View style={styles.stat}><Text style={styles.value}>{maxKmh.toFixed(1)}</Text><Text style={styles.label}>km/h max GPS</Text></View>
      </View>
      <View style={styles.info}><Ionicons name="checkmark-circle-outline" size={24} color="#34d12f" /><View style={{flex:1}}><Text style={styles.infoTitle}>Tracé affiché sur la carte</Text><Text style={styles.infoText}>La ligne verte relie les {coordinates.length} points GPS enregistrés. Vous pouvez déplacer et zoomer la carte avec les doigts.</Text></View></View>
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({safe:{flex:1,backgroundColor:'#071a23'},container:{padding:24,paddingBottom:120},badge:{alignSelf:'flex-start',backgroundColor:'#34d12f',color:'#071a23',fontSize:13,fontWeight:'900',paddingHorizontal:12,paddingVertical:7,borderRadius:999,marginTop:18},title:{fontSize:38,fontWeight:'900',color:'#fff',marginTop:22},date:{fontSize:17,color:'#aab6bd',marginTop:8,marginBottom:22},card:{backgroundColor:'#122936',borderRadius:24,padding:24,marginTop:24},empty:{color:'#fff',fontSize:18,fontWeight:'800'},mapShell:{height:330,borderRadius:28,overflow:'hidden',marginBottom:18,borderWidth:2,borderColor:'#1c4656',backgroundColor:'#122936'},map:{width:'100%',height:'100%'},mapLabel:{position:'absolute',left:14,top:14,backgroundColor:'#34d12f',borderRadius:999,paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:6},mapLabelText:{fontSize:13,fontWeight:'900',color:'#071a23'},mapPreview:{backgroundColor:'#122936',borderRadius:28,padding:28,alignItems:'center',marginBottom:18},mapTitle:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:10},stats:{flexDirection:'row',gap:12,marginBottom:12},stat:{flex:1,backgroundColor:'#fff',borderRadius:20,padding:18,alignItems:'center',justifyContent:'center',minHeight:112},value:{fontSize:22,fontWeight:'900',color:'#071a23',textAlign:'center'},label:{fontSize:13,fontWeight:'800',color:'#687781',marginTop:5,textAlign:'center'},info:{marginTop:10,backgroundColor:'#102c37',borderRadius:20,padding:18,flexDirection:'row',gap:12},infoTitle:{color:'#fff',fontSize:17,fontWeight:'900'},infoText:{color:'#c1cbd0',fontSize:14,lineHeight:21,marginTop:5}});
