'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  User,
  Phone,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Search,
  ArrowLeft,
  ChevronRight,
  Filter,
  MoreVertical,
  CalendarDays,
  Users,
  CalendarCheck,
  Stethoscope,
  Loader2,
  Trash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Link from 'next/link';

interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  status: string; // pending, confirmed, cancelled, completed
  total: number;
  deliveryFee: number;
  subtotal: number;
  createdAt: string;
  // Metadata fields for appointments
  appointmentDate: string;
  appointmentTime: string;
}

export default function AppointmentsPage() {
  const { botId } = useParams<{ botId: string }>();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchAppointments();
  }, [botId]);

  async function fetchAppointments() {
    setLoading(true);
    try {
      const res = await fetch(`/api/bots/${botId}/orders?type=appointment`);
      const data = await res.json();
      setAppointments(data);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }

  const filtered = appointments.filter(a => {
    const matchesSearch =
      a.customerName.toLowerCase().includes(search.toLowerCase()) ||
      a.customerPhone.includes(search);
    const matchesFilter = filter === 'all' || a.status === filter;
    return matchesSearch && matchesFilter;
  });

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    try {
      const res = await fetch(`/api/bots/${botId}/orders?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setAppointments(prev => prev.filter(a => a.id !== id));
      toast.success('Appointment deleted permanently');
    } catch {
      toast.error('Failed to delete appointment');
    }
  }

  const stats = {
    total: appointments.length,
    pending: appointments.filter(a => a.status === 'pending').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    today: appointments.filter(a => {
      const today = new Date().toLocaleDateString('en-GB');
      return a.appointmentDate === today;
    }).length,
  };

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
            <h2 className="text-4xl font-black tracking-tight text-zinc-900">
              Appointments
            </h2>
            <p className="text-zinc-500 font-medium text-lg">
              Monitor and manage your service requests.
            </p>
          </div>
        </div>
      </div>

      {/* Premium Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: 'Total Appointments',
            value: stats.total,
            icon: CalendarDays,
            theme: 'from-blue-600 to-indigo-600',
            bg: 'bg-blue-50/50',
            text: 'text-blue-600',
          },
          {
            label: "Recent Activity",
            value: stats.today,
            icon: Clock3,
            theme: 'from-emerald-500 to-teal-600',
            bg: 'bg-emerald-50/50',
            text: 'text-emerald-600',
          },
          {
            label: 'Pending Approval',
            value: stats.pending,
            icon: AlertCircle,
            theme: 'from-amber-400 to-orange-500',
            bg: 'bg-amber-50/50',
            text: 'text-amber-600',
          },
          {
            label: 'Confirmed',
            value: stats.confirmed,
            icon: Users,
            theme: 'from-violet-600 to-purple-600',
            bg: 'bg-violet-50/50',
            text: 'text-violet-600',
          },
        ].map((s, i) => (
          <div
            key={i}
            className="group relative h-32 rounded-[28px] bg-white border border-zinc-100 p-6 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-linear-to-br ${s.theme} opacity-[0.03] rounded-bl-[80px] group-hover:opacity-[0.08] transition-opacity`} />
            <div className="flex items-center justify-between">
              <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon className={`h-5 w-5 ${s.text}`} />
              </div>
              <div className="text-3xl font-black text-zinc-900 tracking-tighter">
                {s.value}
              </div>
            </div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Main List Container */}
      <Card className="border-zinc-100 shadow-2xl rounded-[40px] overflow-hidden bg-white/80 backdrop-blur-xl">
        <CardHeader className="p-10 border-b border-zinc-50/50 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <CardTitle className="text-2xl font-black text-zinc-900">Appointment Overview</CardTitle>
              <CardDescription className="text-zinc-400 font-medium mt-1">Listing all upcoming service requests.</CardDescription>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 group-focus-within:text-zinc-600 transition-colors" />
                <Input
                  placeholder="Find patient..."
                  className="pl-12 pr-6 h-14 w-full md:w-72 rounded-2xl bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 transition-all font-medium text-zinc-900"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" className="h-14 w-14 rounded-2xl border-zinc-100 bg-zinc-50 hover:bg-white shrink-0">
                <Filter className="h-5 w-5 text-zinc-500" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-32 gap-4">
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 rounded-full border-4 border-zinc-100" />
                <div className="absolute inset-0 rounded-full border-4 border-zinc-900 border-t-transparent animate-spin" />
              </div>
              <p className="text-zinc-400 font-black text-xs uppercase tracking-widest">Updating Schedule...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-32 text-center">
              <div className="h-20 w-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-6">
                 <CalendarDays className="h-10 w-10 text-zinc-200" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">No orders found</h3>
              <p className="text-zinc-500 font-medium">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filtered.map(item => (
                <div
                  key={item.id}
                  className="group relative flex flex-col lg:flex-row lg:items-center p-6 rounded-[28px] bg-white border border-transparent hover:border-zinc-100 hover:shadow-xl hover:shadow-zinc-100/50 transition-all duration-300 gap-6"
                >
                  {/* Date Chip */}
                  <div className="flex lg:flex-col items-center lg:items-start gap-4 min-w-30">
                    <div className="h-14 w-14 rounded-2xl bg-zinc-900 flex flex-col items-center justify-center text-white shadow-xl shadow-zinc-200 group-hover:scale-105 transition-transform">
                      <span className="text-[10px] font-black opacity-50 leading-none mb-0.5">DAY</span>
                      <span className="text-lg font-black tracking-tighter">
                        {item.appointmentDate && item.appointmentDate.includes('/') 
                          ? item.appointmentDate.split('/')[0] 
                          : '??'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-zinc-900">
                        {item.appointmentDate && item.appointmentDate.includes('/') 
                          ? new Date(2026, parseInt(item.appointmentDate.split('/')[1])-1).toLocaleString('default', { month: 'short' }).toUpperCase()
                          : 'TIME'}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        <Clock className="h-3 w-3" />
                        {item.appointmentTime || 'ANY TIME'}
                      </div>
                    </div>
                  </div>

                  {/* Order Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h4 className="text-xl font-black text-zinc-900 tracking-tight">
                        {item.customerName}
                      </h4>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        item.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : item.status === 'pending'
                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                            : 'bg-zinc-50 text-zinc-400 border border-zinc-100'
                      }`}>
                        {item.status}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-y-2 gap-x-6">
                      <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                        <div className="h-6 w-6 rounded-lg bg-zinc-50 flex items-center justify-center border border-zinc-100">
                          <Phone className="h-3 w-3" />
                        </div>
                        {item.customerPhone}
                      </div>
                      {item.customerAddress && (
                        <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                          <div className="h-6 w-6 rounded-lg bg-zinc-50 flex items-center justify-center border border-zinc-100">
                            <Stethoscope className="h-3 w-3" />
                          </div>
                          {item.customerAddress}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center justify-between lg:justify-end gap-x-8 w-full lg:w-auto pt-4 lg:pt-0 border-t lg:border-none border-zinc-50">
                    <div className="text-right hidden xl:block">
                      <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em] mb-1">BOOKED ON</p>
                      <p className="text-xs font-bold text-zinc-400">{new Date(item.createdAt).toLocaleDateString()}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       <Button
                        variant="outline"
                        className="h-12 px-6 rounded-xl font-black text-xs border-zinc-100 bg-zinc-50/50 hover:bg-white hover:shadow-lg transition-all"
                      >
                        DETAILS
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 rounded-xl text-zinc-200 hover:text-rose-500 hover:bg-rose-50 transition-all"
                        onClick={() => handleDelete(item.id)}
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
        
        <div className="p-10 bg-zinc-50/30 border-t border-zinc-50/50 flex items-center justify-between">
          <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">
            {filtered.length} records in current view
          </p>
          <div className="flex gap-1">
            <Button className="h-10 w-10 rounded-xl bg-zinc-900 border-none shadow-lg">1</Button>
            <Button variant="ghost" className="h-10 w-10 rounded-xl">2</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
