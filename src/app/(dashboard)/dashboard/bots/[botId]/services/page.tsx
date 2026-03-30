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
  availableSlots: string | null;
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
  const [formSlots, setFormSlots] = useState('');

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
    setFormSlots('');
    setEditingService(null);
    setShowForm(false);
  }

  function openEdit(s: Service) {
    setFormName(s.name);
    setFormPrice(s.price > 0 ? String(s.price) : '');
    setFormCategory(s.category === 'General' ? '' : s.category);
    setFormDesc(s.description || '');
    setFormSlots(s.availableSlots || '');
    setEditingService(s);
    setShowForm(true);
  }

  // FORCE LABELS BASED ON BOT TYPE
  const isAppointment = bot?.botType === 'appointment';
  const labelText = isAppointment ? 'Doctor / Staff' : 'Service';
  const pageTitle = isAppointment ? 'Doctors & Staff' : 'Services';
  const pageDesc = isAppointment ? 'Manage your clinic professionals and departments.' : 'Manage your offerings and pricing.';
  const showSchedules = isAppointment;

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
        availableSlots: formSlots.trim() || null,
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
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-4">
          <Link href={`/dashboard/bots/${botId}`}>
            <Button
              variant="ghost"
              size="sm"
              className="group -ml-2 text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tight text-zinc-900">{pageTitle}</h2>
            <p className="text-zinc-500 font-medium text-lg">{pageDesc}</p>
          </div>
        </div>
        
        {!showForm && (
          <div className="relative group">
            <div className="absolute inset-0 bg-zinc-900 blur-xl opacity-0 group-hover:opacity-20 transition-opacity" />
            <Button 
              onClick={() => setShowForm(true)}
              className="relative rounded-2xl bg-zinc-900 border-zinc-800 text-white h-14 px-8 font-black shadow-2xl hover:bg-zinc-800 transition-all active:scale-95"
            >
              <Plus className="mr-2 h-5 w-5 text-zinc-400" />
              Add {labelText}
            </Button>
          </div>
        )}
      </div>

      {showForm && (
        <Card className="border-zinc-100 shadow-2xl rounded-[32px] bg-zinc-50/50 overflow-hidden animate-in fade-in zoom-in duration-500">
          <CardHeader className="p-8 border-b border-zinc-100/50">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-black text-zinc-900">
                  {editingService ? `Update ${labelText}` : `Register ${labelText}`}
                </CardTitle>
                <CardDescription className="font-medium text-zinc-400">Fill in the professional details below.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={resetForm} className="rounded-full h-10 w-10 bg-white shadow-sm border border-zinc-100">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-1">{labelText} Name</Label>
                <Input
                  placeholder={isAppointment ? "e.g. Dr. Aung Kyaw" : "e.g. Service Name"}
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="rounded-2xl h-14 bg-white border-zinc-100 px-6 font-bold text-zinc-900 placeholder:text-zinc-300 transition-all focus:border-zinc-900 focus:ring-0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-1">
                  {isAppointment ? 'Specialization / Dept' : 'Category'}
                </Label>
                <Input
                  placeholder={isAppointment ? "e.g. Cardiology" : "e.g. General"}
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="rounded-2xl h-14 bg-white border-zinc-100 px-6 font-bold text-zinc-900 placeholder:text-zinc-300 transition-all focus:border-zinc-900 focus:ring-0"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-1">
                {isAppointment ? 'Consultation Fee (MMK)' : 'Price (MMK)'}
              </Label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10">
                   <BadgeDollarSign className="h-6 w-6 text-zinc-300 group-focus-within:text-zinc-900 transition-colors" />
                </div>
                <Input
                  type="number"
                  placeholder="Enter amount (0 for free)"
                  value={formPrice}
                  onChange={e => setFormPrice(e.target.value)}
                  className="pl-14 rounded-2xl h-14 bg-white border-zinc-100 pr-6 font-bold text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 transition-all"
                />
              </div>
            </div>

            {showSchedules && (
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-1">Work Schedule (Next 7 Days)</Label>
                <div className="grid grid-cols-1 gap-4">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() + i + 1);
                    const dateKey = date.toISOString().split('T')[0];
                    const dateLabel = date.toLocaleDateString('en-GB', { 
                      weekday: 'short', 
                      day: 'numeric', 
                      month: 'short' 
                    });
                    
                    // Parse current slots if they are JSON
                    let selectedForDate: string[] = [];
                    try {
                      if (formSlots && typeof formSlots === 'string' && formSlots.startsWith('{')) {
                        const parsed = JSON.parse(formSlots);
                        selectedForDate = parsed[dateKey] || [];
                      } else if (formSlots && typeof formSlots === 'string') {
                         // Carry over old logic if it was just a string (not ideal but safe)
                         selectedForDate = formSlots.split(',').map(s => s.trim()).filter(Boolean);
                      }
                    } catch (e) {
                      console.error('Failed to parse slots', e);
                    }

                    const timeOptions = ["09:00 AM - 11:00 AM", "11:00 AM - 01:00 PM", "02:00 PM - 04:00 PM", "05:00 PM - 07:00 PM"];

                    return (
                      <div key={dateKey} className="p-5 rounded-[24px] bg-white border border-zinc-100/50 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-zinc-900 text-sm tracking-tight">{dateLabel}</span>
                          <Badge variant="outline" className="rounded-lg border-zinc-100 bg-zinc-50 text-[9px] font-black py-1">AVAILABLE</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {timeOptions.map(t => {
                            const isSelected = selectedForDate.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  let newSlots = {};
                                  try {
                                    if (formSlots && typeof formSlots === 'string' && formSlots.startsWith('{')) {
                                      newSlots = JSON.parse(formSlots);
                                    }
                                  } catch (e) {}
                                  
                                  let current = (newSlots as any)[dateKey] || [];
                                  if (isSelected) {
                                    current = current.filter((x: string) => x !== t);
                                  } else {
                                    current = [...current, t];
                                  }
                                  if (current.length === 0) delete (newSlots as any)[dateKey];
                                  else (newSlots as any)[dateKey] = current;
                                  setFormSlots(JSON.stringify(newSlots));
                                }}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${
                                  isSelected 
                                    ? 'bg-zinc-900 text-white shadow-lg' 
                                    : 'bg-zinc-50 text-zinc-400 hover:bg-zinc-100'
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] font-bold text-zinc-400 mt-2 italic">* User can only book for the dates and times you select here.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-1">Description / Bio</Label>
              <Textarea
                placeholder={isAppointment ? "Describe the doctor's experience..." : "Provide details about this service..."}
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                className="rounded-2xl min-h-32 bg-white border-zinc-100 p-6 font-bold text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 transition-all resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-zinc-100/50">
              <Button variant="ghost" onClick={resetForm} className="rounded-2xl h-14 px-8 font-bold text-zinc-400 hover:text-zinc-900">Discard</Button>
              <Button onClick={handleSave} disabled={saving} className="rounded-2xl bg-zinc-900 px-12 h-14 font-black shadow-xl shadow-zinc-200">
                {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
                {editingService ? 'Push Updates' : `Register ${labelText}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-zinc-100 shadow-2xl rounded-[40px] overflow-hidden bg-white/80 backdrop-blur-xl">
        <CardHeader className="p-10 border-b border-zinc-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <CardTitle className="text-2xl font-black text-zinc-900">Internal Directory</CardTitle>
              <CardDescription className="text-zinc-400 font-medium mt-1">
                A list of all active {labelText.toLowerCase()}s in your bot.
              </CardDescription>
            </div>
            
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 group-focus-within:text-zinc-600 transition-colors" />
              <Input
                placeholder={`Search ${labelText.toLowerCase()}...`}
                className="pl-12 pr-6 h-14 w-full md:w-80 rounded-2xl bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 transition-all font-medium text-zinc-900"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4">
          {filtered.length === 0 ? (
            <div className="py-32 text-center">
              <div className="h-20 w-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-6">
                 <Briefcase className="h-10 w-10 text-zinc-200" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">No {labelText.toLowerCase()}s added</h3>
              <p className="text-zinc-400 font-medium mt-1">Get started by creating your first listing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filtered.map(s => (
                <div key={s.id} className="group relative flex flex-col md:flex-row md:items-center p-6 rounded-[28px] bg-white border border-transparent hover:border-zinc-100 hover:shadow-xl hover:shadow-zinc-100/50 transition-all duration-300 gap-6">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-16 w-16 rounded-3xl bg-zinc-900 text-white flex items-center justify-center shadow-2xl shadow-zinc-200 group-hover:scale-110 transition-transform duration-500">
                      {isAppointment ? <UserRound className="h-8 w-8 text-zinc-400" /> : <Briefcase className="h-8 w-8 text-zinc-400" />}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h4 className="text-xl font-black text-zinc-900 tracking-tight">{s.name}</h4>
                        {s.category && (
                          <div className="px-3 py-1 rounded-full bg-zinc-50 border border-zinc-100 text-[10px] font-black uppercase text-zinc-400 tracking-widest flex items-center">
                            {isAppointment ? <Stethoscope className="h-3 w-3 mr-1.5" /> : <Tag className="h-3 w-3 mr-1.5" />}
                            {s.category}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 font-medium line-clamp-1">
                        {showSchedules && s.availableSlots && (
                          <span className="text-zinc-900 font-bold mr-2">
                             [{s.availableSlots.startsWith('{') ? 'Scheduled' : s.availableSlots}]
                          </span>
                        )}
                        {s.description || 'No additional information provided.'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-x-12 w-full md:w-auto pt-4 md:pt-0 border-t md:border-none border-zinc-50">
                    <div className="text-right">
                      <p className="text-xl font-black text-zinc-900 tracking-tight">
                        {s.price > 0 ? `${s.price.toLocaleString()} MMK` : 'FREE'}
                      </p>
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mt-0.5">
                        {isAppointment ? 'Consultation' : 'Standard Rate'}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openEdit(s)} 
                        className="h-12 w-12 rounded-xl text-zinc-300 hover:text-zinc-900 hover:bg-zinc-50 transition-all"
                      >
                        <Pencil className="h-5 w-5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteService(s.id)} 
                        className="h-12 w-12 rounded-xl text-zinc-200 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <Trash className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <div className="p-10 bg-zinc-50/30 border-t border-zinc-50/50">
           <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Total of {filtered.length} active listings recorded</p>
        </div>
      </Card>
    </div>
  );
}
