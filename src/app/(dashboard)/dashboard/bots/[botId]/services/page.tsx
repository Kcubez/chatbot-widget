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

  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDesc, setFormDesc] = useState('');

  useEffect(() => {
    fetchServices();
  }, [botId]);

  async function fetchServices() {
    setLoading(true);
    const res = await fetch(`/api/bots/${botId}/services`);
    const data = await res.json();
    setServices(data);
    setLoading(false);
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

  async function handleSave() {
    if (!formName.trim()) {
      toast.error('Service name is required');
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
      toast.success(editingService ? 'Service updated!' : 'Service created!');
      resetForm();
      fetchServices();
    } catch {
      toast.error('Failed to save service');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this service?')) return;
    await fetch(`/api/bots/${botId}/services?id=${id}`, { method: 'DELETE' });
    toast.success('Service deleted');
    fetchServices();
  }

  async function handleToggleActive(s: Service) {
    await fetch(`/api/bots/${botId}/services`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
    });
    fetchServices();
  }

  const filtered = services.filter(
    (s: Service) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  // Unique categories (excluding 'General') for datalist autocomplete
  const categories = [...new Set(
    services.map((s: Service) => s.category).filter(c => c !== 'General')
  )];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/bots/${botId}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">Services</h2>
          <p className="text-zinc-500 text-sm font-medium">
            {services.length} services • {services.filter((s: Service) => s.isActive).length} active
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-full bg-zinc-900"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Service
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          placeholder="Search services..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="pl-10 rounded-full bg-zinc-50 border-zinc-100"
        />
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <Card className="border-none shadow-xl bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold">
              {editingService ? 'Edit Service' : 'New Service'}
            </CardTitle>
            <CardDescription>
              {editingService
                ? 'Update the service details below.'
                : 'Add a new service offering for your customers.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Name + Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Service Name *
                </Label>
                <Input
                  value={formName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormName(e.target.value)}
                  placeholder="e.g. Normal Shop, Premium Package"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Price (Ks) — 0 = Free / Inquiry
                </Label>
                <Input
                  type="number"
                  value={formPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormPrice(e.target.value)
                  }
                  placeholder="e.g. 50000"
                  min="0"
                />
              </div>
            </div>

            {/* Row 2: Category (optional) */}
            <div className="space-y-1">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Category{' '}
                <span className="text-zinc-300 font-medium normal-case tracking-normal">
                  (optional — leave blank if not needed)
                </span>
              </Label>
              <Input
                value={formCategory}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormCategory(e.target.value)
                }
                placeholder="e.g. Shop Setup, Consultation, Marketing..."
                list="svc-categories"
              />
              <datalist id="svc-categories">
                {categories.map((c: string) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {/* Row 3: Description */}
            <div className="space-y-1">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Description
              </Label>
              <Textarea
                value={formDesc}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setFormDesc(e.target.value)
                }
                placeholder="Describe what this service includes..."
                rows={3}
                className="rounded-xl border-zinc-100 bg-zinc-50/50 resize-none"
              />
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
                {editingService ? 'Update' : 'Create'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Services List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-none shadow-xl bg-white p-12 text-center">
          <Briefcase className="h-12 w-12 mx-auto text-zinc-300 mb-4" />
          <p className="text-zinc-500 font-medium">No services yet</p>
          <p className="text-zinc-400 text-sm mt-1">
            Add your first service offering using the button above.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s: Service) => (
            <Card
              key={s.id}
              className={`border-none shadow-md bg-white transition-all hover:shadow-lg ${!s.isActive ? 'opacity-50' : ''}`}
            >
              <CardContent className="p-4 flex items-center gap-4">
                {/* Icon */}
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Briefcase className="h-5 w-5 text-blue-500" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-zinc-900 truncate">{s.name}</h3>
                    {/* Show category only if it's not 'General' */}
                    {s.category && s.category !== 'General' && (
                      <span className="text-xs px-2 py-0.5 bg-zinc-100 rounded-full text-zinc-500 font-medium shrink-0 flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5" />
                        {s.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {/* Price badge */}
                    <span
                      className={`text-sm font-bold flex items-center gap-1 ${
                        s.price > 0 ? 'text-emerald-600' : 'text-zinc-400'
                      }`}
                    >
                      <BadgeDollarSign className="h-3.5 w-3.5" />
                      {s.price > 0 ? `${s.price.toLocaleString()} Ks` : 'Free / Inquiry'}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{s.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleToggleActive(s)}
                    title={s.isActive ? 'Deactivate' : 'Activate'}
                  >
                    <div
                      className={`h-3 w-3 rounded-full ${s.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="h-4 w-4 text-zinc-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleDelete(s.id)}
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
