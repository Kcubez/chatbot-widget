'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, Send, Trash2, UserRound, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Registration = { id: string; messengerSenderId: string; customerName: string | null; classType: string | null; learningMode: string | null; township: string | null; status: string; scheduleText: string | null };
type Filter = 'all' | 'needs_review' | 'active' | 'completed';

const statusMeta: Record<string, { label: string; tone: string; dot: string }> = {
  pending_admin: { label: 'Needs review', tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  customer_requested_change: { label: 'Change requested', tone: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  schedule_offered: { label: 'Awaiting customer', tone: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  handed_to_human: { label: 'Handed to admin', tone: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  cancelled_by_customer: { label: 'Cancelled by customer', tone: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  not_available: { label: 'Not available', tone: 'bg-zinc-100 text-zinc-700', dot: 'bg-zinc-400' },
};

async function readResponse(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { error: 'The server returned an invalid response.' }; }
}

export default function RegistrationsPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = use(params);
  const [items, setItems] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [schedule, setSchedule] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Registration | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch(`/api/bots/${botId}/education-registrations`);
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load schedule requests');
      setItems(data.registrations || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load schedule requests');
    } finally { setLoading(false); setRefreshing(false); }
  }, [botId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    review: items.filter(item => item.status === 'pending_admin' || item.status === 'customer_requested_change').length,
    active: items.filter(item => item.status === 'schedule_offered').length,
    complete: items.filter(item => item.status === 'handed_to_human' || item.status === 'cancelled_by_customer').length,
  }), [items]);
  const shown = items.filter(item => filter === 'all' || (filter === 'needs_review' && (item.status === 'pending_admin' || item.status === 'customer_requested_change')) || (filter === 'active' && item.status === 'schedule_offered') || (filter === 'completed' && (item.status === 'handed_to_human' || item.status === 'not_available' || item.status === 'cancelled_by_customer')));

  const update = async (id: string, action: 'offer_schedule' | 'mark_unavailable') => {
    setSaving(id);
    try {
      const response = await fetch(`/api/bots/${botId}/education-registrations`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, scheduleText: schedule[id], adminNote: note[id] }) });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error || 'Update failed');
      toast.success(action === 'offer_schedule' ? 'Schedule sent to customer' : 'Customer notified');
      await load(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Update failed'); } finally { setSaving(null); }
  };

  const remove = async (id: string) => {
    setSaving(id);
    try {
      const response = await fetch(`/api/bots/${botId}/education-registrations?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not delete request');
      setItems(current => current.filter(item => item.id !== id));
      toast.success('Schedule request deleted');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete request'); } finally { setSaving(null); }
  };

  return <div className="mx-auto max-w-5xl space-y-7 pb-12">
    <header className="flex flex-col gap-4 border-b border-zinc-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4"><Button variant="outline" size="icon" asChild className="h-11 w-11 rounded-xl border-zinc-200 shadow-sm"><Link href={`/dashboard/bots/${botId}`} aria-label="Back to bot settings"><ArrowLeft className="h-4 w-4" /></Link></Button><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Admin workspace</p><h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-900">Schedule requests</h1><p className="mt-1 text-sm text-zinc-500">Offer a schedule here. After the customer agrees, continue in Messenger Page Inbox.</p></div></div>
      <Button variant="outline" onClick={() => load(true)} disabled={refreshing} className="rounded-xl border-zinc-200 bg-white"><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</Button>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      {[{ label: 'Needs review', value: counts.review, icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700' }, { label: 'Awaiting customer', value: counts.active, icon: CalendarClock, tone: 'bg-blue-50 text-blue-700' }, { label: 'Finished / cancelled', value: counts.complete, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' }].map(stat => <Card key={stat.label} className="border-zinc-100 shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon className="h-5 w-5" /></div><div><p className="text-2xl font-black text-zinc-900">{stat.value}</p><p className="text-xs font-medium text-zinc-500">{stat.label}</p></div></CardContent></Card>)}
    </section>

    <div className="flex flex-wrap gap-2">{([['all', `All (${items.length})`], ['needs_review', `Needs review (${counts.review})`], ['active', `Awaiting customer (${counts.active})`], ['completed', `Completed (${counts.complete})`]] as [Filter, string][]).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${filter === key ? 'bg-zinc-900 text-white shadow-md' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{label}</button>)}</div>

    {loading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-zinc-400" /></div> : shown.length === 0 ? <Card className="border-dashed border-zinc-200 bg-zinc-50/60"><CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="mb-4 rounded-2xl bg-white p-4 shadow-sm"><CalendarClock className="h-7 w-7 text-zinc-400" /></div><h2 className="font-bold text-zinc-800">No requests in this view</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">New class-schedule enquiries appear here after customers finish the button flow.</p></CardContent></Card> : <div className="space-y-4">{shown.map(item => {
      const status = statusMeta[item.status] || { label: item.status.replaceAll('_', ' '), tone: 'bg-zinc-100 text-zinc-700', dot: 'bg-zinc-400' };
      const needsAction = item.status === 'pending_admin' || item.status === 'customer_requested_change';
      return <Card key={item.id} className="overflow-hidden border-zinc-100 shadow-sm transition-shadow hover:shadow-md"><CardContent className="p-0"><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="mb-3 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} /><span className={`rounded-full px-3 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span></div><h2 className="text-lg font-black text-zinc-900">{item.classType || 'Class not selected'}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600"><span>{item.learningMode || 'Learning mode pending'}</span>{item.township && <span>📍 {item.township}</span>}</div><div className="mt-3 flex items-center gap-2 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600"><UserRound className="h-3.5 w-3.5" /></span><div><p className="font-semibold text-zinc-800">{item.customerName || 'Messenger customer'}</p><p className="text-xs text-zinc-400">Customer ID: {item.messengerSenderId}</p></div></div></div><div className="flex items-start gap-2">{item.scheduleText && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:max-w-xs"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Schedule sent</p><p className="mt-1 whitespace-pre-wrap">{item.scheduleText}</p></div>}<Button variant="ghost" size="icon" disabled={saving === item.id} onClick={() => setDeleteCandidate(item)} className="shrink-0 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete schedule request"><Trash2 className="h-4 w-4" /></Button></div></div>{needsAction && <div className="border-t border-zinc-100 bg-zinc-50/70 p-5"><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Input value={schedule[item.id] || ''} onChange={event => setSchedule({ ...schedule, [item.id]: event.target.value })} placeholder="Confirmed schedule, e.g. Mon–Thu, 6:00–7:30 PM" className="h-11 bg-white" /><Textarea value={note[item.id] || ''} onChange={event => setNote({ ...note, [item.id]: event.target.value })} placeholder="Optional note or unavailable reason" rows={1} className="min-h-11 bg-white" /><div className="flex gap-2"><Button disabled={saving === item.id || !(schedule[item.id] || '').trim()} onClick={() => update(item.id, 'offer_schedule')} className="flex-1 bg-zinc-900 hover:bg-zinc-800"><Send className="mr-2 h-4 w-4" />Send</Button><Button variant="outline" disabled={saving === item.id} onClick={() => update(item.id, 'mark_unavailable')} className="border-rose-200 text-rose-700 hover:bg-rose-50"><XCircle className="h-4 w-4" /><span className="sr-only">Mark unavailable</span></Button></div></div></div>}{item.status === 'handed_to_human' && <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />Bot paused for this customer — continue registration in Messenger Page Inbox.</div>}{item.status === 'cancelled_by_customer' && <div className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800"><XCircle className="mr-2 inline h-4 w-4" />Customer cancelled this schedule request. The bot has returned them to the regular menu.</div>}</CardContent></Card>;
    })}</div>}
    <Dialog open={!!deleteCandidate} onOpenChange={open => { if (!open && saving === null) setDeleteCandidate(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete schedule request?</DialogTitle>
          <DialogDescription>
            This permanently removes the {deleteCandidate?.classType || 'selected'} request. If the customer is still waiting on it, their bot flow will be reset.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setDeleteCandidate(null)} disabled={saving !== null}>Cancel</Button>
          <Button variant="destructive" disabled={!deleteCandidate || saving !== null} onClick={async () => { if (!deleteCandidate) return; await remove(deleteCandidate.id); setDeleteCandidate(null); }}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
