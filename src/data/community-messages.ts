import { getSupabase } from '../lib/supabase';

export type MemberDirectoryEntry = {
  userId: string;
  displayName: string;
  username: string;
  location: string;
};

export type DirectMessage = {
  id: number;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
};

export async function listMembers(): Promise<MemberDirectoryEntry[]> {
  const db = getSupabase();
  const { data, error } = await db.rpc('list_message_members');
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    userId: String(row.user_id ?? ''),
    displayName: String(row.display_name ?? ''),
    username: String(row.username ?? ''),
    location: String(row.location ?? ''),
  }));
}

export async function listDirectMessages(userId: string): Promise<DirectMessage[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from('direct_messages')
    .select('id,sender_id,recipient_id,body,created_at')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    body: String(row.body),
    createdAt: String(row.created_at),
  }));
}

export async function sendDirectMessage(senderId: string, recipientId: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error('Message vide');
  if (text.length > 2000) throw new Error('Message trop long');
  if (senderId === recipientId) throw new Error('Destinataire invalide');
  const { error } = await getSupabase().from('direct_messages').insert({
    sender_id: senderId,
    recipient_id: recipientId,
    body: text,
  });
  if (error) throw error;
}
