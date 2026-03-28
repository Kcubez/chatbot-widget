'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash,
  Pencil,
  X,
  Briefcase,
  Search,
  Check,
  Tag,
  BadgeDollarSign,
  UserRound,
  Stethoscope
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';

interface Service {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string | null;
  isActive: boolean;
}

export default function ServicesPage() {
  const { botId } = useParams<{ botId: string }>();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [bot, setBot] = useState<any>(null);

  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDesc, setFormDesc] = useState('');

  useEffect(() => {
    fetchBot();
    fetchServices();
  }, [botId]);

  async function fetchBot() {
    try {
      const res = await fetch(`/api/bots/${botId}`);
      const data = await res.json();
      setBot(data);
      console.log('Bot Data Fetched:', data);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchServices() {
    setLoading(true);
    try {
      const res = await fetch(`/api/bots/${botId}/services`);
      const data = await res.json();
      setServices(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormName('');
    setFormPrice('');
    setFormCategory('');
    setFormDesc('');
    setEditingService(null);
    setShowForm(false);
  }

  function openEdit(s: Service) {
    setFormName(s.name);
    setFormPrice(s.price > 0 ? String(s.price) : '');
    setFormCategory(s.category === 'General' ? '' : s.category);
    setFormDesc(s.description || '');
    setEditingService(s);
    setShowForm(true);
  }

  // FORCE LABELS BASED ON BOT TYPE
  const isAppointment = bot?.botType === 'appointment';
  const labelText = isAppointment ? 'Doctor / Staff' : 'Service';
  const pageTitle = isAppointment ? 'Doctors & Staff' : 'Services';
  const pageDesc = isAppointment ? 'Manage your clinic professionals and departments.' : 'Manage your offerings and pricing.';

  async function handleSave() {
    if (!formName.trim()) {
      toast.error(`${labelText} name is required`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(editingService ? { id: editingService.id } : {}),
        name: formName,
        price: parseFloat(formPrice) || 0,
        category: formCategory.trim() || 'General',
        description: formDesc.trim() || null,
      };
      await fetch(`/api/bots/${botId}/services`, {
        method: editingService ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast.success(editingService ? `${labelText} updated!` : `${labelText} created!`);
      resetForm();
      fetchServices();
    } catch (error) {
      toast.error('Operation failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(id: string) {
    if (!confirm(`Permanently delete this ${labelText.toLowerCase()}?`)) return;
    try {
      await fetch(`/api/bots/${botId}/services?id=${id}`, { method: 'DELETE' });
      setServices(services.filter(s => s.id !== id));
      toast.success(`${labelText} removed`);
    } catch (error) {
      toast.error('Delete failed');
    }
  }

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  if (loading || !bot) {
    return (
      <div className="flex flex-col justify-center items-center py-40 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-zinc-300" />
        <p className="text-zinc-400 font-medium">Loading {pageTitle}...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/bots/${botId}`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{pageTitle}</h2>
            <p className="text-zinc-500 text-sm">{pageDesc}</p>
          </div>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="rounded-full bg-zinc-900 font-bold"
          disabled={showForm}
        >
          <Plus className="h-4 w-4 mr-2" /> Add {labelText}
        </Button>
      </div>

      {showForm && (
        <Card className="border-none shadow-xl bg-zinc-50 overflow-hidden animate-in fade-in slide-in-from-top duration-300">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-bold">
                {editingService ? `Edit ${labelText}` : `New ${labelText}`}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={resetForm} className="rounded-full h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-zinc-500">{labelText} Name</Label>
                <Input
                  placeholder={isAppointment ? "e.g. Dr. Aung Kyaw" : "e.g. Doctor's Name / Staff / Service"}
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-zinc-500">{isAppointment ? 'Specialization / Dept' : 'Category / Dept'}</Label>
                <Input
                  placeholder={isAppointment ? "e.g. Cardiology" : "e.g. Health Department"}
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-zinc-500">{isAppointment ? 'Consultation Fee (MMK)' : 'Price (MMK)'}</Label>
                <div className="relative">
                  <BadgeDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    type="number"
                    placeholder="0 = Free"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    className="pl-10 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-zinc-500">{isAppointment ? 'Doctor Bio / Info' : 'Description'}</Label>
              <Textarea
                placeholder={isAppointment ? "Tell patients about this professional..." : "Describe it..."}
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                className="rounded-xl min-h-24"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={resetForm} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-zinc-900 px-8">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingService ? 'Update' : 'Save'} {labelText}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-xl bg-white overflow-hidden rounded-3xl">
        <CardHeader className="border-b border-zinc-50 bg-zinc-50/30">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder={`Search ${labelText.toLowerCase()}s...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-11 rounded-full bg-white border-none shadow-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <Briefcase className="h-10 w-10 text-zinc-100 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">No results found.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {filtered.map(s => (
                <div key={s.id} className="p-6 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
                      {isAppointment ? <UserRound className="h-6 w-6" /> : <Briefcase className="h-6 w-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-zinc-900">{s.name}</h4>
                        {s.category && (
                          <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 font-bold text-[10px] uppercase rounded-full">
                            {isAppointment ? <Stethoscope className="h-3 w-3 mr-1" /> : <Tag className="h-3 w-3 mr-1" />}
                            {s.category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 line-clamp-1">{s.description || 'No info added.'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-sm font-black text-zinc-900">{s.price > 0 ? `${s.price.toLocaleString()} MMK` : 'Free'}</p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{isAppointment ? 'Consult Fee' : 'Price'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)} className="rounded-xl h-10 w-10 text-zinc-400 hover:text-zinc-900">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteService(s.id)} className="rounded-xl h-10 w-10 text-zinc-300 hover:text-rose-500 hover:bg-rose-50">
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
