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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
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
  items: any[];
}

export default function AppointmentsPage() {
  const { botId } = useParams<{ botId: string }>();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  async function handleDelete() {
    if (!appointmentToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/bots/${botId}/orders?id=${appointmentToDelete}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      setAppointments(prev => prev.filter(a => a.id !== appointmentToDelete));
      toast.success('Appointment deleted permanently');
      setAppointmentToDelete(null);
    } catch {
      toast.error('Failed to delete appointment');
    } finally {
      setDeleteLoading(false);
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
            <h2 className="text-4xl font-black tracking-tight text-zinc-900">Appointments</h2>
            <p className="text-zinc-500 font-medium text-lg">
              Monitor and manage your service requests.
            </p>
          </div>
        </div>
      </div>

      {/* Premium Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            label: 'Total Appointments',
            value: stats.total,
            icon: CalendarDays,
            theme: 'from-blue-600 to-indigo-600',
            bg: 'bg-blue-50/50',
            text: 'text-blue-600',
          },
        ].map((s, i) => (
          <div
            key={i}
            className="group relative h-32 rounded-[28px] bg-white border border-zinc-100 p-6 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 overflow-hidden"
          >
            <div
              className={`absolute top-0 right-0 w-24 h-24 bg-linear-to-br ${s.theme} opacity-[0.03] rounded-bl-[80px] group-hover:opacity-[0.08] transition-opacity`}
            />
            <div className="flex items-center justify-between">
              <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon className={`h-5 w-5 ${s.text}`} />
              </div>
              <div className="text-3xl font-black text-zinc-900 tracking-tighter">{s.value}</div>
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
              <CardTitle className="text-2xl font-black text-zinc-900">
                Appointment Overview
              </CardTitle>
              <CardDescription className="text-zinc-400 font-medium mt-1">
                Listing all upcoming service requests.
              </CardDescription>
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
              <Button
                variant="outline"
                className="h-14 w-14 rounded-2xl border-zinc-100 bg-zinc-50 hover:bg-white shrink-0"
              >
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
              <p className="text-zinc-400 font-black text-xs uppercase tracking-widest">
                Updating Schedule...
              </p>
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
                      <span className="text-[10px] font-black opacity-50 leading-none mb-0.5">
                        DAY
                      </span>
                      <span className="text-lg font-black tracking-tighter">
                        {item.appointmentDate?.includes('-')
                          ? item.appointmentDate.split('-')[2]
                          : item.appointmentDate?.includes('/')
                            ? item.appointmentDate.split('/')[0]
                            : '??'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-zinc-900 uppercase">
                        {item.appointmentDate?.includes('-')
                          ? new Date(item.appointmentDate).toLocaleString('default', {
                              month: 'short',
                            })
                          : item.appointmentDate?.includes('/')
                            ? new Date(
                                2026,
                                parseInt(item.appointmentDate.split('/')[1]) - 1
                              ).toLocaleString('default', { month: 'short' })
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
                      {item.items && item.items.length > 0 && (
                        <Badge
                          variant="outline"
                          className="rounded-lg bg-zinc-50 border-zinc-100 text-[10px] font-black text-zinc-600 px-2 py-0.5 uppercase tracking-wider"
                        >
                          {item.items[0].name}
                        </Badge>
                      )}
                      <div
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          item.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            : item.status === 'pending'
                              ? 'bg-amber-50 text-amber-600 border border-amber-100'
                              : 'bg-zinc-50 text-zinc-400 border border-zinc-100'
                        }`}
                      >
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
                      <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em] mb-1">
                        BOOKED ON
                      </p>
                      <p className="text-xs font-bold text-zinc-400">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSelectedAppointment(item)}
                        className="h-12 px-6 rounded-xl font-black text-xs border-zinc-100 bg-zinc-50/50 hover:bg-white hover:shadow-lg transition-all"
                      >
                        DETAILS
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 rounded-xl text-zinc-200 hover:text-rose-500 hover:bg-rose-50 transition-all"
                        onClick={() => setAppointmentToDelete(item.id)}
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
            <Button variant="ghost" className="h-10 w-10 rounded-xl">
              2
            </Button>
          </div>
        </div>
      </Card>

      {/* Appointment Detail Sheet */}
      <Sheet open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
        <SheetContent className="sm:max-w-md bg-white rounded-l-[40px] border-none shadow-2xl p-0 overflow-hidden">
          {selectedAppointment && (
            <div className="flex flex-col h-dvh">
              <div className="p-8 bg-zinc-900 text-white">
                <SheetHeader className="text-left space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black uppercase tracking-widest border-none px-3 py-1">
                      {selectedAppointment.status}
                    </Badge>
                  </div>
                  <SheetTitle className="text-3xl font-black tracking-tight text-white m-0">
                    Appointment Info
                  </SheetTitle>
                  <SheetDescription className="text-zinc-400 font-medium text-xs uppercase tracking-widest leading-none pt-1">
                    ID: #{selectedAppointment.id.slice(-8).toUpperCase()}
                  </SheetDescription>
                </SheetHeader>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Patient Info */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
                    Patient Details
                  </p>
                  <div className="p-6 rounded-3xl bg-zinc-50 border border-zinc-100 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shadow-sm">
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">
                          Full Name
                        </p>
                        <p className="text-base font-bold text-zinc-900 leading-none">
                          {selectedAppointment.customerName}
                        </p>
                      </div>
                    </div>
                    <Separator className="bg-zinc-100" />
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shadow-sm">
                        <Phone className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">
                          Phone Number
                        </p>
                        <p className="text-base font-bold text-zinc-900 leading-none">
                          {selectedAppointment.customerPhone}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Schedule Info */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
                    Session Schedule
                  </p>
                  <div className="p-6 rounded-3xl bg-indigo-50 border border-indigo-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white shadow-lg">
                          <CalendarDays className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 leading-none">
                            {selectedAppointment.appointmentDate}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">
                          <Clock className="h-3 w-3" />
                          {selectedAppointment.appointmentTime}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Doctor Info */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
                    Assigned Professional
                  </p>
                  {selectedAppointment.items &&
                    selectedAppointment.items.map((item: any, i: number) => (
                      <div
                        key={i}
                        className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm flex items-center gap-4"
                      >
                        <div className="h-12 w-12 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-600">
                          <Stethoscope className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <p className="text-lg font-black text-zinc-900 leading-tight">
                            {item.name}
                          </p>
                          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                            {item.category || 'Specialist'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-zinc-900 tracking-tighter">
                            {item.price.toLocaleString()} Ks
                          </p>
                          <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">
                            Consultation Fee
                          </p>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Metadata */}
                <div className="py-4 border-t border-zinc-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em] mb-1">
                      Booked on
                    </p>
                    <p className="text-xs font-bold text-zinc-400">
                      {new Date(selectedAppointment.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-zinc-50 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-zinc-200" />
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-zinc-50 bg-zinc-50/50 flex gap-3 mt-auto mb-5">
                <Button
                  className="flex-1 h-14 rounded-2xl bg-zinc-900 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:shadow-zinc-200"
                  onClick={() => setSelectedAppointment(null)}
                >
                  Close Detail
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!appointmentToDelete} onOpenChange={() => setAppointmentToDelete(null)}>
        <DialogContent className="sm:max-w-100 bg-white rounded-[32px] border-none shadow-2xl p-8 overflow-hidden">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 animate-bounce">
              <Trash className="h-10 w-10" />
            </div>

            <div className="space-y-2">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black text-zinc-900 tracking-tight text-center">
                  Delete Appointment?
                </DialogTitle>
                <DialogDescription className="text-zinc-500 font-medium text-center">
                  This action is permanent and cannot be undone. All patient data for this session
                  will be lost.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="flex gap-3 w-full pt-4">
              <Button
                variant="outline"
                className="flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest border-zinc-100 bg-zinc-50 hover:bg-white"
                onClick={() => setAppointmentToDelete(null)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-14 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-100"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
