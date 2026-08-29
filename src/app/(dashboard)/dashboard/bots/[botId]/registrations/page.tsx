'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function RegistrationsPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = use(params);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const load = async () => { setLoading(true); try { const res = await fetch(`/api/bots/${botId}/education-registrations`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setItems(data.registrations || []); } catch (e: any) { toast.error(e.message || 'Could not load registrations'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [botId]);
  const update = async (id: string, action: string) => { setSaving(id); try { const res = await fetch(`/api/bots/${botId}/education-registrations`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, scheduleText: schedule[id], adminNote: note[id] }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); toast.success(action === 'offer_schedule' ? 'Schedule sent to customer' : 'Customer notified'); await load(); } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setSaving(null); } };
  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-center gap-3"><Button variant="outline" size="icon" asChild><Link href={`/dashboard/bots/${botId}`}><ArrowLeft className="h-4 w-4" /></Link></Button><div><h1 className="text-2xl font-bold">Education registrations</h1><p className="text-sm text-zinc-500">Only an admin can offer a class schedule or confirm availability.</p></div></div>
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div> : items.length === 0 ? <Card><CardContent className="py-12 text-center text-zinc-500">No schedule requests yet.</CardContent></Card> : items.map(item => <Card key={item.id}><CardHeader><CardTitle className="flex justify-between gap-4 text-base"><span>{item.classType || 'Class'} · {item.learningMode || 'Mode'} {item.township ? `· ${item.township}` : ''}</span><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs">{item.status}</span></CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-zinc-500">Customer ID: {item.messengerSenderId}</p>{item.scheduleText && <p className="rounded-lg bg-emerald-50 p-3 text-sm">Schedule: {item.scheduleText}</p>}{item.status === 'pending_admin' || item.status === 'customer_requested_change' ? <><Input placeholder="Confirmed class schedule (required)" value={schedule[item.id] || ''} onChange={e => setSchedule({ ...schedule, [item.id]: e.target.value })} /><Textarea placeholder="Optional admin note / reason" value={note[item.id] || ''} onChange={e => setNote({ ...note, [item.id]: e.target.value })} /><div className="flex gap-2"><Button disabled={saving === item.id || !(schedule[item.id] || '').trim()} onClick={() => update(item.id, 'offer_schedule')}><Send className="mr-2 h-4 w-4" />Send schedule</Button><Button variant="outline" disabled={saving === item.id} onClick={() => update(item.id, 'mark_unavailable')}><XCircle className="mr-2 h-4 w-4" />Not available</Button></div></> : item.status === 'handed_to_human' ? <div className="rounded-lg bg-amber-50 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4" />Ready for human follow-up: {item.fullName} · {item.phone}</div> : null}</CardContent></Card>)}</div>;
}
