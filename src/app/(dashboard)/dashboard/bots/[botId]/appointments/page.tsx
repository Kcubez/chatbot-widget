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
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/bots/${botId}`}>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-white shadow-sm border border-zinc-100 hover:bg-zinc-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-zinc-900">Appointments</h2>
            <p className="text-zinc-500 text-sm font-medium">
              Manage your clinic schedules and patient bookings.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-full font-bold text-zinc-600 bg-white shadow-sm"
          >
            <Filter className="h-4 w-4 mr-2" /> Filter
          </Button>
          <Button className="rounded-full bg-zinc-900 font-bold px-8 shadow-xl shadow-zinc-200">
            <CalendarCheck className="h-4 w-4 mr-2" /> Add Appointment
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[
          {
            label: 'Total Bookings',
            value: stats.total,
            icon: CalendarDays,
            color: 'text-zinc-900',
            bg: 'bg-zinc-100',
          },
          {
            label: "Today's",
            value: stats.today,
            icon: Clock3,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Pending Approval',
            value: stats.pending,
            icon: AlertCircle,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Confirmed Patients',
            value: stats.confirmed,
            icon: Users,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
        ].map((s, i) => (
          <Card
            key={i}
            className="border-none shadow-xl bg-white overflow-hidden group hover:scale-[1.02] transition-transform"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`h-12 w-12 rounded-2xl ${s.bg} flex items-center justify-center transition-transform group-hover:rotate-12`}
                >
                  <s.icon className={`h-6 w-6 ${s.color}`} />
                </div>
                <Badge variant="secondary" className="bg-zinc-50 font-bold text-[10px] uppercase">
                  This Month
                </Badge>
              </div>
              <p className="text-4xl font-black tracking-tighter text-zinc-900 mb-1">{s.value}</p>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Table/List Card */}
      <Card className="border-none shadow-2xl bg-white overflow-hidden rounded-[32px]">
        <CardHeader className="p-8 border-b border-zinc-50">
          <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Booking List</CardTitle>
              <CardDescription>Recent appointments and patient information.</CardDescription>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search name or phone..."
                className="pl-11 rounded-full bg-zinc-50 border-zinc-100 font-medium"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-20 bg-zinc-50/50">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
                <CalendarDays className="h-8 w-8 text-zinc-200" />
              </div>
              <p className="text-zinc-400 font-bold uppercase tracking-widest text-xs">
                No Appointments Found
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {filtered.map(item => (
                <div
                  key={item.id}
                  className="p-6 flex flex-col md:flex-row md:items-center gap-6 hover:bg-zinc-50/50 transition-colors group"
                >
                  {/* Date & Time Slot */}
                  <div className="flex md:flex-col items-center md:items-start gap-3 min-w-30">
                    <div className="bg-zinc-900 text-white rounded-2xl p-3 text-center min-w-15 shadow-lg shadow-zinc-200">
                      <p className="text-[10px] font-black uppercase opacity-60 leading-none mb-1">
                        Date
                      </p>
                      <p className="text-sm font-black">
                        {item.appointmentDate && item.appointmentDate.includes('/') 
                          ? `${item.appointmentDate.split('/')[0]}/${item.appointmentDate.split('/')[1]}` 
                          : 'TBD'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500 font-bold text-xs">
                      <Clock className="h-3 w-3" />
                      {item.appointmentTime || 'N/A'}
                    </div>
                  </div>

                  {/* Patient Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-black text-zinc-900 truncate text-lg">
                        {item.customerName}
                      </h4>
                      <Badge
                        className={`rounded-full shadow-sm text-[10px] font-black uppercase ${
                          item.status === 'confirmed'
                            ? 'bg-emerald-500 hover:bg-emerald-600'
                            : item.status === 'pending'
                              ? 'bg-amber-500 hover:bg-amber-600'
                              : 'bg-zinc-400'
                        }`}
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-500 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-4 w-4 opacity-40" /> {item.customerPhone}
                      </span>
                      {item.customerAddress && (
                        <span className="flex items-center gap-1.5">
                          <Stethoscope className="h-4 w-4 opacity-40" /> {item.customerAddress}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Meta & Actions */}
                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto mt-4 md:mt-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest leading-none mb-1">
                        Submitting
                      </p>
                      <p className="text-xs font-bold text-zinc-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        className="rounded-xl font-bold text-xs bg-zinc-50 hover:bg-zinc-100 h-10 px-4"
                      >
                        View Details
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl hover:bg-rose-50 text-zinc-300 hover:text-rose-500 transition-colors"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <div className="p-6 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between">
          <p className="text-xs font-bold text-zinc-400">
            Total {filtered.length} patients displayed
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-lg h-8 w-8 p-0" disabled>
              1
            </Button>
            <Button variant="ghost" size="sm" className="rounded-lg h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
