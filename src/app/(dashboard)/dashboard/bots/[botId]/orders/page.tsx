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
  Mail,
  Check,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

interface Order {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerTownship: string | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: string;
  paymentMethod: string | null;
  paymentReceiptUrl: string | null;
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pendingStatusChange, setPendingStatusChange] = useState<{ id: string; status: string; customer: string } | null>(null);

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
      const res = await fetch(`/api/bots/${botId}/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`Order set to ${newStatus}`);
      fetchOrders();
    } catch {
      toast.error('Failed to update status');
    }
  }

  const filtered = orders.filter((o: Order) => {
    const s = search.toLowerCase();
    const matchesSearch = !s || (
      (o.customerName && o.customerName.toLowerCase().includes(s)) ||
      (o.customerEmail && o.customerEmail.toLowerCase().includes(s)) ||
      (o.customerPhone && o.customerPhone.includes(s)) ||
      o.id.toLowerCase().includes(s)
    );
    const orderDate = o.createdAt.slice(0, 10);
    return matchesSearch && (!dateFrom || orderDate >= dateFrom) && (!dateTo || orderDate <= dateTo);
  });

  const statuses = ['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

  function exportOrders() {
    const rows = ['order_id,customer,phone,status,total,created_at'];
    filtered.forEach(order => rows.push([order.id, order.customerName || '', order.customerPhone || '', order.status, order.total, order.createdAt].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'orders.csv'; link.click(); URL.revokeObjectURL(url);
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
            <h2 className="text-4xl font-black tracking-tight text-zinc-900">Orders</h2>
            <p className="text-zinc-500 font-medium text-lg">Manage your shop&apos;s transactions and delivery status.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="h-10 px-4 rounded-xl bg-zinc-100 text-zinc-500 font-black text-xs uppercase tracking-widest border-none">
            {orders.length} RECORDS
          </Badge>
          <Button variant="outline" className="rounded-xl" onClick={exportOrders} disabled={filtered.length === 0}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Pending review', value: orders.filter(order => order.status === 'pending').length, tone: 'bg-amber-50 text-amber-800' },
          { label: 'In progress', value: orders.filter(order => order.status === 'confirmed' || order.status === 'shipped').length, tone: 'bg-blue-50 text-blue-800' },
          { label: 'Delivered', value: orders.filter(order => order.status === 'delivered').length, tone: 'bg-emerald-50 text-emerald-800' },
          { label: 'Revenue', value: `${orders.filter(order => order.status !== 'cancelled').reduce((sum, order) => sum + order.total, 0).toLocaleString()} Ks`, tone: 'bg-zinc-50 text-zinc-800' },
        ].map(item => <Card key={item.label} className={`border-none shadow-sm ${item.tone}`}><CardContent className="p-4"><p className="text-xs font-medium">{item.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{item.value}</p></CardContent></Card>)}
      </div>

      {/* Filters & Search */}
      <Card className="border-zinc-100 shadow-xl rounded-[32px] bg-white p-8 space-y-5">
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
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:max-w-xl">
          <Input type="date" aria-label="Orders from date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
          <Input type="date" aria-label="Orders to date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
          {(dateFrom || dateTo) && <Button variant="ghost" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear dates</Button>}
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
                  <button
                    type="button"
                    className="w-full p-6 md:p-8 flex items-center justify-between gap-6 cursor-pointer text-left"
                    onClick={() => setExpandedId(isExpanded ? null : o.id)}
                    aria-expanded={isExpanded}
                    aria-label={`View order ${o.id.slice(-6).toUpperCase()} details`}
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
                  </button>

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
                            <Mail className="h-3 w-3" /> Email
                          </p>
                          <p className="font-bold text-zinc-900 break-all">{o.customerEmail || '-'}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <Phone className="h-3 w-3" /> Contact
                          </p>
                          <p className="font-bold text-zinc-900">{o.customerPhone || '-'}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <MapPin className="h-3 w-3" /> Shipping Address
                          </p>
                          <p className="font-bold text-zinc-900 leading-relaxed">{o.customerAddress || '-'}, {o.customerTownship || '-'}</p>
                        </div>
                      </div>

                      {o.paymentReceiptUrl && (
                        <div className="rounded-[24px] border border-amber-100 bg-amber-50/50 p-5">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div><p className="text-sm font-bold text-amber-900">Payment Screenshot</p><p className="text-xs text-amber-700">Review this receipt before confirming payment.</p></div>
                            <Badge className="border-amber-200 bg-amber-100 text-amber-800">Manual review</Badge>
                          </div>
                          <a href={o.paymentReceiptUrl} target="_blank" rel="noreferrer" className="block w-fit">
                            <img src={o.paymentReceiptUrl} alt={`Payment receipt for order ${o.id}`} className="max-h-72 rounded-xl border border-amber-100 object-contain bg-white" />
                          </a>
                        </div>
                      )}

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
                            onClick={() => setPendingStatusChange({ id: o.id, status: NEXT_STATUS[o.status], customer: o.customerName || 'this customer' })}
                          >
                            <Check className="mr-2 h-5 w-5" />
                            {o.status === 'pending' && o.paymentMethod === 'Bank Transfer/KPay'
                              ? 'CONFIRM PAYMENT'
                              : `SET TO ${NEXT_STATUS[o.status].toUpperCase()}`}
                          </Button>
                        )}
                        {o.status !== 'cancelled' && o.status !== 'delivered' && (
                          <Button 
                            variant="ghost" 
                            className="rounded-2xl h-14 px-8 font-black text-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
                            onClick={() => setPendingStatusChange({ id: o.id, status: 'cancelled', customer: o.customerName || 'this customer' })}
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
      <Dialog open={pendingStatusChange !== null} onOpenChange={open => !open && setPendingStatusChange(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{pendingStatusChange?.status === 'cancelled' ? 'Void this order?' : 'Confirm order update?'}</DialogTitle><DialogDescription>{pendingStatusChange?.status === 'cancelled' ? `This will cancel the order for ${pendingStatusChange.customer}.` : `Set the order for ${pendingStatusChange?.customer} to ${pendingStatusChange?.status}?`}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setPendingStatusChange(null)}>Cancel</Button><Button variant={pendingStatusChange?.status === 'cancelled' ? 'destructive' : 'default'} onClick={async () => { if (!pendingStatusChange) return; const change = pendingStatusChange; setPendingStatusChange(null); await updateStatus(change.id, change.status); }}>{pendingStatusChange?.status === 'cancelled' ? 'Void Order' : 'Confirm'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
