'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Trash, Pencil, X, Search, Check, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';

interface DeliveryZone {
  id: string;
  township: string;
  city: string;
  fee: number;
  isActive: boolean;
}

export default function DeliveryZonesPage() {
  const { botId } = useParams<{ botId: string }>();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [saving, setSaving] = useState(false);

  const [formTownship, setFormTownship] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formFee, setFormFee] = useState('');

  useEffect(() => {
    fetchZones();
  }, [botId]);

  async function fetchZones() {
    setLoading(true);
    const res = await fetch(`/api/bots/${botId}/delivery-zones`);
    setZones(await res.json());
    setLoading(false);
  }

  function resetForm() {
    setFormTownship('');
    setFormCity('');
    setFormFee('');
    setEditing(null);
    setShowForm(false);
  }

  function openEdit(z: DeliveryZone) {
    setFormTownship(z.township);
    setFormCity(z.city);
    setFormFee(String(z.fee));
    setEditing(z);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formTownship.trim()) {
      toast.error('Township is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        township: formTownship,
        city: formCity || '',
        fee: parseFloat(formFee) || 0,
      };
      await fetch(`/api/bots/${botId}/delivery-zones`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast.success(editing ? 'Updated' : 'Created');
      resetForm();
      fetchZones();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this zone?')) return;
    await fetch(`/api/bots/${botId}/delivery-zones?id=${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    fetchZones();
  }

  const filtered = zones.filter(
    (z: DeliveryZone) =>
      z.township.toLowerCase().includes(search.toLowerCase()) ||
      z.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/bots/${botId}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">Delivery Zones</h2>
          <p className="text-zinc-500 text-sm font-medium">{zones.length} zones configured</p>
        </div>
        <Button
          size="sm"
          className="rounded-full bg-zinc-900"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Zone
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          placeholder="Search zones..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="pl-10 rounded-full bg-zinc-50 border-zinc-100"
        />
      </div>

      {showForm && (
        <Card className="border-none shadow-xl bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold">
              {editing ? 'Edit Zone' : 'New Zone'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Township *
                </Label>
                <Input
                  value={formTownship}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormTownship(e.target.value)
                  }
                  placeholder="လှိုင်"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  City
                </Label>
                <Input
                  value={formCity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormCity(e.target.value)}
                  placeholder="ရန်ကုန်"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Fee (Ks)
                </Label>
                <Input
                  type="number"
                  value={formFee}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormFee(e.target.value)}
                  placeholder="2000"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="rounded-full" onClick={resetForm}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-zinc-900"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-none shadow-xl bg-white p-12 text-center">
          <MapPin className="h-12 w-12 mx-auto text-zinc-300 mb-4" />
          <p className="text-zinc-500 font-medium">No delivery zones yet</p>
          <p className="text-zinc-400 text-sm mt-1">Add zones for township-based delivery fees</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((z: DeliveryZone) => (
            <Card
              key={z.id}
              className="border-none shadow-md bg-white hover:shadow-lg transition-all"
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900">{z.township}</h3>
                  <span className="text-sm text-zinc-400">{z.city || '-'}</span>
                </div>
                <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                  {z.fee.toLocaleString()} Ks
                </span>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => openEdit(z)}
                  >
                    <Pencil className="h-4 w-4 text-zinc-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleDelete(z.id)}
                  >
                    <Trash className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
