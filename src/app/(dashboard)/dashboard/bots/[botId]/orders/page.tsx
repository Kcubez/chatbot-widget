'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Search, ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  shipped: 'bg-violet-100 text-violet-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const NEXT_STATUS: Record<string, string> = {
  pending: 'confirmed',
  confirmed: 'shipped',
  shipped: 'delivered',
};

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
    setOrders(await res.json());
    setLoading(false);
  }

  async function updateStatus(orderId: string, newStatus: string) {
    await fetch(`/api/bots/${botId}/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId, status: newStatus }),
    });
    toast.success(`Status updated to ${newStatus}`);
    fetchOrders();
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/bots/${botId}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">Orders</h2>
          <p className="text-zinc-500 text-sm font-medium">{orders.length} orders</p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s: string) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all capitalize ${
              statusFilter === s
                ? 'bg-zinc-900 text-white shadow-lg'
                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          placeholder="Search by name, phone, or order ID..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="pl-10 rounded-full bg-zinc-50 border-zinc-100"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-none shadow-xl bg-white p-12 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto text-zinc-300 mb-4" />
          <p className="text-zinc-500 font-medium">No orders yet</p>
          <p className="text-zinc-400 text-sm mt-1">Orders from Messenger will appear here</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((o: Order) => {
            const isExpanded = expandedId === o.id;
            const items = Array.isArray(o.items) ? o.items : [];

            return (
              <Card
                key={o.id}
                className="border-none shadow-md bg-white hover:shadow-lg transition-all"
              >
                <CardContent className="p-4">
                  {/* Header row */}
                  <div
                    className="flex items-center gap-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-zinc-900">
                          #{o.id.slice(-6).toUpperCase()}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${STATUS_COLORS[o.status] || 'bg-zinc-100 text-zinc-600'}`}
                        >
                          {o.status}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 mt-0.5">
                        {o.customerName || 'Unknown'} •{' '}
                        {new Date(o.createdAt).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <span className="font-bold text-emerald-600 shrink-0">
                      {o.total.toLocaleString()} Ks
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-zinc-400 font-medium">👤 Name:</span>{' '}
                          <span className="text-zinc-800">{o.customerName || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">📱 Phone:</span>{' '}
                          <span className="text-zinc-800">{o.customerPhone || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">🏠 Address:</span>{' '}
                          <span className="text-zinc-800">{o.customerAddress || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">🏘️ Township:</span>{' '}
                          <span className="text-zinc-800">{o.customerTownship || '-'}</span>
                        </div>
                      </div>

                      <div className="bg-zinc-50 rounded-xl p-3 space-y-1">
                        <p className="font-bold text-zinc-700 text-sm mb-2">📦 Items</p>
                        {items.map((item: OrderItem, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-zinc-600">
                              {item.name} x{item.qty}
                            </span>
                            <span className="text-zinc-800 font-medium">
                              {(item.price * item.qty).toLocaleString()} Ks
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-zinc-200 mt-2 pt-2 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Subtotal</span>
                            <span className="text-zinc-700">{o.subtotal.toLocaleString()} Ks</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Delivery</span>
                            <span className="text-zinc-700">
                              {o.deliveryFee.toLocaleString()} Ks
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-bold">
                            <span className="text-zinc-900">Total</span>
                            <span className="text-emerald-600">{o.total.toLocaleString()} Ks</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 justify-end">
                        {NEXT_STATUS[o.status] && (
                          <Button
                            size="sm"
                            className="rounded-full bg-blue-600"
                            onClick={() => updateStatus(o.id, NEXT_STATUS[o.status])}
                          >
                            Mark as {NEXT_STATUS[o.status]}
                          </Button>
                        )}
                        {o.status !== 'cancelled' && o.status !== 'delivered' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => updateStatus(o.id, 'cancelled')}
                          >
                            Cancel
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
