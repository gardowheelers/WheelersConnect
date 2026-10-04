import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackButton } from '../components/screen-back-button';

type Point = { latitude: number; longitude: number; timestamp: number; speed: number | null; accuracy: number | null };
type RechargeStatus = 'allowed' | 'ask' | 'refused';
type RechargeStop = { id: string; latitude: number; longitude: number; timestamp: number; name: string; placeType: string; status: RechargeStatus; note: string };
type SavedRide = { id: string; startedAt: number; endedAt: number; distanceM: number; points: Point[]; rechargeStops?: RechargeStop[] };
const STORAGE_KEY = 'wheelers-connect:gps-rides:v1';
const SELECTED_RIDE_KEY = 'wheelers-connect:gps-selected-ride:v1';

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
          {(ride.rechargeStops ?? []).map((stop) => (
            <Marker
              key={stop.id}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              title={stop.name}
              description={stop.status === 'allowed' ? 'Recharge autorisée' : stop.status === 'ask' ? 'Demander avant' : 'Recharge refusée'}
            >
              <View style={styles.rechargeMarker}><Ionicons name="flash" size={16} color="#071a23" /></View>
            </Marker>
          ))}
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
      {(ride.rechargeStops?.length ?? 0) > 0 ? <View style={styles.rechargeSection}>
        <View style={styles.rechargeHeader}><Ionicons name="flash" size={24} color="#34d12f" /><View style={{flex:1}}><Text style={styles.rechargeTitle}>Recharge sur le parcours</Text><Text style={styles.rechargeSubtitle}>{ride.rechargeStops!.length} adresse{ride.rechargeStops!.length > 1 ? 's' : ''} notée{ride.rechargeStops!.length > 1 ? 's' : ''}</Text></View></View>
        {ride.rechargeStops!.map((stop) => <View key={stop.id} style={styles.rechargeCard}>
          <View style={styles.rechargeIcon}><Ionicons name="flash" size={20} color="#071a23" /></View>
          <View style={{flex:1}}><Text style={styles.rechargeName}>{stop.name}</Text><Text style={styles.rechargeMeta}>{stop.placeType} • {stop.status === 'allowed' ? 'Recharge autorisée' : stop.status === 'ask' ? 'Demander avant' : 'Recharge refusée'}</Text>{!!stop.note && <Text style={styles.rechargeNote}>{stop.note}</Text>}</View>
        </View>)}
      </View> : null}
      <View style={styles.info}><Ionicons name="checkmark-circle-outline" size={24} color="#34d12f" /><View style={{flex:1}}><Text style={styles.infoTitle}>Tracé affiché sur la carte</Text><Text style={styles.infoText}>La ligne verte relie les {coordinates.length} points GPS enregistrés. Vous pouvez déplacer et zoomer la carte avec les doigts.</Text></View></View>
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({safe:{flex:1,backgroundColor:'#071a23'},container:{padding:24,paddingBottom:120},badge:{alignSelf:'flex-start',backgroundColor:'#34d12f',color:'#071a23',fontSize:13,fontWeight:'900',paddingHorizontal:12,paddingVertical:7,borderRadius:999,marginTop:18},title:{fontSize:38,fontWeight:'900',color:'#fff',marginTop:22},date:{fontSize:17,color:'#aab6bd',marginTop:8,marginBottom:22},card:{backgroundColor:'#122936',borderRadius:24,padding:24,marginTop:24},empty:{color:'#fff',fontSize:18,fontWeight:'800'},mapShell:{height:330,borderRadius:28,overflow:'hidden',marginBottom:18,borderWidth:2,borderColor:'#1c4656',backgroundColor:'#122936'},map:{width:'100%',height:'100%'},mapLabel:{position:'absolute',left:14,top:14,backgroundColor:'#34d12f',borderRadius:999,paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:6},mapLabelText:{fontSize:13,fontWeight:'900',color:'#071a23'},mapPreview:{backgroundColor:'#122936',borderRadius:28,padding:28,alignItems:'center',marginBottom:18},mapTitle:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:10},stats:{flexDirection:'row',gap:12,marginBottom:12},stat:{flex:1,backgroundColor:'#fff',borderRadius:20,padding:18,alignItems:'center',justifyContent:'center',minHeight:112},value:{fontSize:22,fontWeight:'900',color:'#071a23',textAlign:'center'},label:{fontSize:13,fontWeight:'800',color:'#687781',marginTop:5,textAlign:'center'},rechargeMarker:{width:34,height:34,borderRadius:17,backgroundColor:'#34d12f',borderWidth:3,borderColor:'#fff',alignItems:'center',justifyContent:'center'},rechargeSection:{marginTop:8,marginBottom:10,backgroundColor:'#102c37',borderRadius:22,padding:16},rechargeHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:12},rechargeTitle:{color:'#fff',fontSize:19,fontWeight:'900'},rechargeSubtitle:{color:'#aab6bd',fontSize:12,fontWeight:'700',marginTop:2},rechargeCard:{flexDirection:'row',gap:11,alignItems:'flex-start',backgroundColor:'#0b202a',borderRadius:17,padding:13,marginTop:8,borderWidth:1,borderColor:'#1c4656'},rechargeIcon:{width:38,height:38,borderRadius:19,backgroundColor:'#34d12f',alignItems:'center',justifyContent:'center'},rechargeName:{color:'#fff',fontSize:15,fontWeight:'900'},rechargeMeta:{color:'#34d12f',fontSize:12,fontWeight:'800',marginTop:3},rechargeNote:{color:'#c1cbd0',fontSize:12,lineHeight:18,marginTop:5},info:{marginTop:10,backgroundColor:'#102c37',borderRadius:20,padding:18,flexDirection:'row',gap:12},infoTitle:{color:'#fff',fontSize:17,fontWeight:'900'},infoText:{color:'#c1cbd0',fontSize:14,lineHeight:21,marginTop:5}});
