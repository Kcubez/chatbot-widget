'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  ShoppingBag,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Link from 'next/link';

interface Order {
  id: string;
  messengerSenderId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerTownship: string | null;
  items: any[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: string;
  sheetSynced: boolean;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  shipped: { label: 'Shipped', color: 'bg-violet-100 text-violet-700', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-700', icon: Package },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const STATUS_FLOW = ['pending', 'confirmed', 'shipped', 'delivered'];

export default function OrdersPage() {
  const { botId } = useParams<{ botId: string }>();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [botId]);

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

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      await fetch(`/api/bots/${botId}/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      toast.success(`Status → ${newStatus}`);
      fetchOrders();
    } catch {
      toast.error('Failed to update');
    }
  }

  const filtered = orders.filter(
    o =>
      (o.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.customerPhone || '').includes(search) ||
      o.id.includes(search)
  );

  const statusCounts = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

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
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">Orders</h2>
          <p className="text-zinc-500 text-sm font-medium">{orders.length} orders total</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'All' },
          ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k, label: v.label })),
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
              statusFilter === tab.key
                ? 'bg-zinc-900 text-white shadow-lg'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {tab.label}{' '}
            {tab.key !== 'all' && statusCounts[tab.key] ? `(${statusCounts[tab.key]})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          placeholder="Search by name, phone, or order ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 rounded-full bg-zinc-50 border-zinc-100"
        />
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-none shadow-xl bg-white p-12 text-center">
          <ShoppingBag className="h-12 w-12 mx-auto text-zinc-300 mb-4" />
          <p className="text-zinc-500 font-medium">No orders yet</p>
          <p className="text-zinc-400 text-sm mt-1">Orders from Messenger will appear here</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(order => {
            const statusConf = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConf.icon;
            const isExpanded = expandedId === order.id;
            const items = Array.isArray(order.items) ? order.items : [];

            return (
              <Card
                key={order.id}
                className="border-none shadow-md bg-white hover:shadow-lg transition-all cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
              >
                <CardContent className="p-4">
                  {/* Summary row */}
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${statusConf.color}`}
                    >
                      <StatusIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-zinc-900 text-sm">
                          #{order.id.slice(-6).toUpperCase()}
                        </h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold ${statusConf.color}`}
                        >
                          {statusConf.label}
                        </span>
                        {order.sheetSynced && (
                          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium">
                            📊 Synced
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {order.customerName || 'Unknown'} • {order.customerPhone || '-'} •{' '}
                        {new Date(order.createdAt).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <span className="font-black text-zinc-900 shrink-0">
                      {order.total.toLocaleString()} Ks
                    </span>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-zinc-400">👤 Name:</span>{' '}
                          <span className="font-medium">{order.customerName || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">📱 Phone:</span>{' '}
                          <span className="font-medium">{order.customerPhone || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">🏠 Address:</span>{' '}
                          <span className="font-medium">{order.customerAddress || '-'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">🏘️ Township:</span>{' '}
                          <span className="font-medium">{order.customerTownship || '-'}</span>
                        </div>
                      </div>

                      <div className="bg-zinc-50 rounded-xl p-3">
                        <p className="text-xs text-zinc-400 font-bold uppercase mb-2">Items</p>
                        {items.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm py-1">
                            <span>
                              {item.name} x{item.qty}
                            </span>
                            <span className="font-medium">
                              {(item.price * item.qty).toLocaleString()} Ks
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-zinc-200 mt-2 pt-2 space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Subtotal</span>
                            <span>{order.subtotal.toLocaleString()} Ks</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Delivery</span>
                            <span>{order.deliveryFee.toLocaleString()} Ks</span>
                          </div>
                          <div className="flex justify-between font-black text-base">
                            <span>Total</span>
                            <span>{order.total.toLocaleString()} Ks</span>
                          </div>
                        </div>
                      </div>

                      {/* Status actions */}
                      <div className="flex gap-2 flex-wrap">
                        {STATUS_FLOW.map(s => {
                          if (s === order.status) return null;
                          const conf = STATUS_CONFIG[s];
                          return (
                            <Button
                              key={s}
                              size="sm"
                              variant="outline"
                              className={`rounded-full text-xs ${conf.color} border-0`}
                              onClick={e => {
                                e.stopPropagation();
                                updateStatus(order.id, s);
                              }}
                            >
                              → {conf.label}
                            </Button>
                          );
                        })}
                        {order.status !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full text-xs bg-red-50 text-red-600 border-0"
                            onClick={e => {
                              e.stopPropagation();
                              updateStatus(order.id, 'cancelled');
                            }}
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
