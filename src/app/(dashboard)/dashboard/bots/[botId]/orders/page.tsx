'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Loader2, 
  Search, 
  ChevronDown, 
  ShoppingCart,
  MapPin,
  Phone,
  User,
  Calendar,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

interface Order {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerTownship: string | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: string;
  createdAt: string;
}

const NEXT_STATUS: Record<string, string> = {
  pending: 'confirmed',
  confirmed: 'shipped',
  shipped: 'delivered',
};

function getStatusStyles(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-600 border-amber-100',
    confirmed: 'bg-blue-50 text-blue-600 border-blue-100',
    shipped: 'bg-violet-50 text-violet-600 border-violet-100',
    delivered: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    cancelled: 'bg-rose-50 text-rose-500 border-rose-100',
  };
  return map[status] || 'bg-zinc-50 text-zinc-400 border-zinc-100';
}

export default function OrdersPage() {
  const { botId } = useParams<{ botId: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, botId]);

  async function fetchOrders() {
    setLoading(true);
    const url =
      statusFilter !== 'all'
        ? `/api/bots/${botId}/orders?status=${statusFilter}`
        : `/api/bots/${botId}/orders`;
    const res = await fetch(url);
    const data = await res.json();
    setOrders(data);
    setLoading(false);
  }

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      await fetch(`/api/bots/${botId}/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      toast.success(`Order set to ${newStatus}`);
      fetchOrders();
    } catch {
      toast.error('Failed to update status');
    }
  }

  const filtered = orders.filter((o: Order) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (o.customerName && o.customerName.toLowerCase().includes(s)) ||
      (o.customerPhone && o.customerPhone.includes(s)) ||
      o.id.toLowerCase().includes(s)
    );
  });

  const statuses = ['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

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
            <h2 className="text-4xl font-black tracking-tight text-zinc-900">Orders</h2>
            <p className="text-zinc-500 font-medium text-lg">Manage your shop&apos;s transactions and delivery status.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="h-10 px-4 rounded-xl bg-zinc-100 text-zinc-500 font-black text-xs uppercase tracking-widest border-none">
            {orders.length} RECORDS
          </Badge>
        </div>
      </div>

      {/* Filters & Search */}
      <Card className="border-zinc-100 shadow-xl rounded-[32px] bg-white p-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex gap-2 flex-wrap">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                  statusFilter === s
                    ? 'bg-zinc-900 text-white shadow-xl shadow-zinc-200'
                    : 'bg-zinc-50 text-zinc-400 hover:bg-zinc-100'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative group w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 group-focus-within:text-zinc-600 transition-colors" />
            <Input
              placeholder="Search orders..."
              className="pl-12 pr-6 h-12 rounded-2xl bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 transition-all font-bold text-zinc-900"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Main List */}
      {loading ? (
        <div className="flex flex-col justify-center items-center py-40 gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-zinc-100" />
            <div className="absolute inset-0 rounded-full border-4 border-zinc-900 border-t-transparent animate-spin" />
          </div>
          <p className="text-zinc-400 font-black text-[10px] uppercase tracking-widest">Loading Logistics...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-40 text-center bg-zinc-50/50 rounded-[40px] border border-dashed border-zinc-200">
          <ShoppingCart className="h-16 w-16 mx-auto text-zinc-200 mb-6" />
          <h3 className="text-xl font-bold text-zinc-900">No orders found</h3>
          <p className="text-zinc-400 font-medium mt-1">Orders from Messenger will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((o) => {
            const isExpanded = expandedId === o.id;
            const items = Array.isArray(o.items) ? o.items : [];
            return (
              <Card
                key={o.id}
                className={`border-none shadow-xl transition-all duration-500 overflow-hidden rounded-[32px] bg-white group ${isExpanded ? 'ring-2 ring-zinc-900 shadow-2xl' : 'hover:shadow-2xl hover:shadow-zinc-100/50'}`}
              >
                <CardContent className="p-0">
                  <div
                    className="p-6 md:p-8 flex items-center justify-between gap-6 cursor-pointer select-none"
                    onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  >
                    <div className="flex items-center gap-6 flex-1 min-w-0">
                      <div className="h-14 w-14 rounded-2xl bg-zinc-900 text-zinc-400 flex flex-col items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                        <span className="text-[10px] font-black opacity-40 leading-none mb-1">ID</span>
                        <span className="text-sm font-black text-white tracking-widest">{o.id.slice(-4).toUpperCase()}</span>
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h4 className="text-xl font-black text-zinc-900 tracking-tight truncate">{o.customerName || 'Customer'}</h4>
                          <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest border ${getStatusStyles(o.status)}`}>
                            {o.status}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
                           {o.customerTownship || 'Unknown'} <span className="opacity-20">•</span> {new Date(o.createdAt).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                       <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1">Total</p>
                        <p className="text-2xl font-black text-zinc-900 tracking-tighter">
                          {o.total.toLocaleString()} <span className="text-sm">Ks</span>
                        </p>
                      </div>
                      <div className={`h-10 w-10 rounded-xl bg-zinc-50 flex items-center justify-center transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`}>
                         <ChevronDown className="h-5 w-5 text-zinc-400" />
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-8 md:p-10 border-t border-zinc-50 bg-zinc-50/10 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <User className="h-3 w-3" /> Customer
                          </p>
                          <p className="font-bold text-zinc-900">{o.customerName || '-'}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <Phone className="h-3 w-3" /> Contact
                          </p>
                          <p className="font-bold text-zinc-900">{o.customerPhone || '-'}</p>
                        </div>
                        <div className="space-y-2 lg:col-span-2">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <MapPin className="h-3 w-3" /> Shipping Address
                          </p>
                          <p className="font-bold text-zinc-900 leading-relaxed">{o.customerAddress || '-'}, {o.customerTownship || '-'}</p>
                        </div>
                      </div>

                      <div className="rounded-[32px] border border-zinc-100 bg-white p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                           <ShoppingCart className="h-4 w-4 text-zinc-400" />
                           <p className="text-xs font-black text-zinc-900 uppercase tracking-widest">Inventory List</p>
                        </div>
                        <div className="space-y-2">
                          {items.map((item, i) => (
                            <div key={i} className="flex justify-between items-center bg-zinc-50/50 p-4 rounded-2xl">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white text-[10px] font-black">
                                  {item.qty}
                                </div>
                                <span className="font-bold text-zinc-700">{item.name}</span>
                              </div>
                              <span className="font-black text-zinc-900 tracking-tighter">{(item.price * item.qty).toLocaleString()} Ks</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-8 pt-8 border-t border-zinc-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                          <div className="p-4 bg-zinc-50 rounded-2xl">
                            <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1">Subtotal</p>
                            <p className="font-bold text-zinc-600">{o.subtotal.toLocaleString()} Ks</p>
                          </div>
                          <div className="p-4 bg-zinc-50 rounded-2xl">
                            <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1">Delivery</p>
                            <p className="font-bold text-zinc-600">{o.deliveryFee.toLocaleString()} Ks</p>
                          </div>
                          <div className="p-4 bg-zinc-900 rounded-2xl text-white shadow-xl flex flex-col justify-center">
                            <p className="text-[10px] font-black opacity-30 uppercase tracking-widest mb-1">Total</p>
                            <p className="text-xl font-black">{o.total.toLocaleString()} Ks</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-50">
                        {NEXT_STATUS[o.status] && (
                          <Button 
                            className="rounded-2xl bg-blue-600 hover:bg-blue-700 h-14 px-8 font-black shadow-xl shadow-blue-100 transition-all active:scale-95"
                            onClick={() => updateStatus(o.id, NEXT_STATUS[o.status])}
                          >
                            <Check className="mr-2 h-5 w-5" />
                            SET TO {NEXT_STATUS[o.status].toUpperCase()}
                          </Button>
                        )}
                        {o.status !== 'cancelled' && o.status !== 'delivered' && (
                          <Button 
                            variant="ghost" 
                            className="rounded-2xl h-14 px-8 font-black text-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
                            onClick={() => updateStatus(o.id, 'cancelled')}
                          >
                            VOID ORDER
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
