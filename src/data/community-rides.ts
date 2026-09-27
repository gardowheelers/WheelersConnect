import { getSupabase } from '../lib/supabase';
import type { Ride } from './models';

export type CommunityRide = Ride & { organizerId: string; participantCount: number; joined: boolean };
type Row = { id:string; organizer_id:string; title:string; ride_date:string; ride_time:string; departure:string; ride_type:string; distance:string; level:string; max_participants:number; description:string };
type Participant = { ride_id:string; user_id:string };

export async function listCommunityRides(userId:string):Promise<CommunityRide[]> {
  const db=getSupabase();
  const r=await db.from('community_rides').select('*').order('created_at',{ascending:false});
  if(r.error) throw r.error;
  const rows=(r.data??[]) as Row[]; const ids=rows.map(x=>x.id); let ps:Participant[]=[];
  if(ids.length){ const p=await db.from('ride_participants').select('ride_id,user_id').in('ride_id',ids); if(p.error) throw p.error; ps=(p.data??[]) as Participant[]; }
  return rows.map(x=>{ const mine=ps.filter(p=>p.ride_id===x.id); return { id:x.id,title:x.title,date:x.ride_date,time:x.ride_time,departure:x.departure,type:x.ride_type,distance:x.distance,level:x.level,maxParticipants:String(x.max_participants),description:x.description,organizerId:x.organizer_id,participantCount:mine.length,joined:mine.some(p=>p.user_id===userId) }; });
}
export async function publishCommunityRide(userId:string,ride:Ride){ const max=Number(ride.maxParticipants); if(!Number.isInteger(max)||max<=0) throw new Error('Participants invalides'); const r=await getSupabase().from('community_rides').upsert({id:ride.id,organizer_id:userId,title:ride.title,ride_date:ride.date,ride_time:ride.time,departure:ride.departure,ride_type:ride.type,distance:ride.distance,level:ride.level,max_participants:max,description:ride.description},{onConflict:'id'}); if(r.error) throw r.error; }
export async function unpublishCommunityRide(userId:string,id:string){ const r=await getSupabase().from('community_rides').delete().eq('id',id).eq('organizer_id',userId); if(r.error) throw r.error; }
export async function joinCommunityRide(userId:string,id:string){ const r=await getSupabase().from('ride_participants').insert({ride_id:id,user_id:userId}); if(r.error&&r.error.code!=='23505') throw r.error; }
export async function leaveCommunityRide(userId:string,id:string){ const r=await getSupabase().from('ride_participants').delete().eq('ride_id',id).eq('user_id',userId); if(r.error) throw r.error; }
