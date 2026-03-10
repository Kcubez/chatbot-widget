'use client';

import { useChat } from 'ai/react';
import { Send, Bot as BotIcon, RefreshCw, ShoppingBag, Package, X, Info } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { use } from 'react';
import { getPublicBotById } from '@/lib/actions/bot';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stockCount: number;
  image: string | null;
  description: string | null;
  isActive: boolean;
}

type Segment = { type: 'text'; value: string } | { type: 'image'; url: string };

// ─── Message parsers ──────────────────────────────────────────────────────────

function parseMessage(content: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\[PRODUCT_IMAGE:([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'image', url: match[1].trim() });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        return (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {part}
          </span>
        );
      })}
    </>
  );
}

function MessageContent({ content }: { content: string }) {
  const segments = parseMessage(content);
  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.type === 'image' ? (
          <div key={i} className="rounded-xl overflow-hidden border border-zinc-100 shadow-sm">
            <img
              src={seg.url}
              alt="Product"
              className="w-full max-w-60 object-cover rounded-xl"
              style={{ maxHeight: '240px' }}
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div key={i} className="text-sm leading-relaxed">
            <RichText text={seg.value} />
          </div>
        )
      )}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  primaryColor,
  onOrder,
  onDetail,
}: {
  product: Product;
  primaryColor: string;
  onOrder: (p: Product) => void;
  onDetail: (p: Product) => void;
}) {
  const inStock = product.stockCount > 0;
  return (
    <div
      className="shrink-0 w-44 rounded-2xl overflow-hidden bg-white border border-zinc-100"
      style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}
    >
      {/* Image */}
      <div className="w-full h-40 bg-zinc-50 relative overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={e => {
              const el = e.currentTarget;
              el.style.display = 'none';
              (el.nextElementSibling as HTMLElement)!.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="absolute inset-0 flex items-center justify-center bg-zinc-100"
          style={{ display: product.image ? 'none' : 'flex' }}
        >
          <Package className="h-8 w-8 text-zinc-300" />
        </div>
        {!inStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-xs font-bold bg-red-500 px-2 py-0.5 rounded-full">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h4 className="text-xs font-bold text-zinc-900 leading-tight line-clamp-2 min-h-8">
          {product.name}
        </h4>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          {product.price.toLocaleString()} MMK ~ {product.price.toLocaleString()} MMK
        </p>

        {/* Buttons */}
        <div className="mt-3 flex flex-col gap-1.5">
          <button
            onClick={() => onOrder(product)}
            disabled={!inStock}
            className="w-full py-1.5 text-xs font-bold rounded-lg border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: primaryColor,
              color: primaryColor,
              backgroundColor: 'transparent',
            }}
            onMouseEnter={e => {
              if (inStock) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = primaryColor;
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = primaryColor;
            }}
          >
            Order
          </button>
          <button
            onClick={() => onDetail(product)}
            className="w-full py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 text-zinc-600 bg-zinc-50 transition-all hover:bg-zinc-100 active:scale-95"
          >
            View Detail
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Carousel ─────────────────────────────────────────────────────────

function ProductCarousel({
  products,
  primaryColor,
  onOrder,
  onDetail,
  onClose,
}: {
  products: Product[];
  primaryColor: string;
  onOrder: (p: Product) => void;
  onDetail: (p: Product) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col animate-in slide-in-from-bottom-3 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" style={{ color: primaryColor }} />
          <span className="text-xs font-bold text-zinc-700">Our Products</span>
          <span className="text-xs text-zinc-400">({products.length})</span>
        </div>
        <button
          onClick={onClose}
          className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors"
        >
          <X className="h-3 w-3 text-zinc-500" />
        </button>
      </div>

      {/* Horizontal scroll */}
      <div
        className="flex gap-3 overflow-x-auto pb-3 px-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {products
          .filter(p => p.isActive)
          .map(product => (
            <div key={product.id} className="snap-start">
              <ProductCard
                product={product}
                primaryColor={primaryColor}
                onOrder={onOrder}
                onDetail={onDetail}
              />
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function ProductDetailModal({
  product,
  primaryColor,
  onOrder,
  onClose,
}: {
  product: Product;
  primaryColor: string;
  onOrder: (p: Product) => void;
  onClose: () => void;
}) {
  const inStock = product.stockCount > 0;
  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shadow-sm"
        style={{ backgroundColor: primaryColor }}
      >
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center"
        >
          <X className="h-4 w-4 text-white" />
        </button>
        <span className="font-bold text-white text-sm">Product Detail</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Image */}
        <div className="w-full h-64 bg-zinc-50 flex items-center justify-center relative">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <Package className="h-16 w-16 text-zinc-200" />
          )}
          {!inStock && (
            <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              Out of Stock
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-5 space-y-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              {product.category}
            </span>
            <h2 className="text-xl font-black text-zinc-900 mt-1 leading-tight">{product.name}</h2>
            <p className="text-lg font-bold mt-2" style={{ color: primaryColor }}>
              {product.price.toLocaleString()} Ks
            </p>
          </div>

          {product.description && (
            <div className="bg-zinc-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Description
                </span>
              </div>
              <p className="text-sm text-zinc-700 leading-relaxed">{product.description}</p>
            </div>
          )}

          <div className="flex items-center gap-3 text-sm">
            <div className="flex-1 bg-zinc-50 rounded-xl p-3 text-center">
              <p className="text-xs text-zinc-400 font-medium">Stock</p>
              <p className={`font-bold mt-0.5 ${inStock ? 'text-emerald-600' : 'text-red-500'}`}>
                {inStock ? `${product.stockCount} left` : 'Sold out'}
              </p>
            </div>
            <div className="flex-1 bg-zinc-50 rounded-xl p-3 text-center">
              <p className="text-xs text-zinc-400 font-medium">Category</p>
              <p className="font-bold text-zinc-700 mt-0.5 truncate">{product.category}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Order CTA */}
      <div className="p-4 border-t border-zinc-100">
        <button
          onClick={() => {
            onOrder(product);
            onClose();
          }}
          disabled={!inStock}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: primaryColor }}
        >
          {inStock ? '🛒 Order Now' : 'Out of Stock'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function ChatWidget({
  params: paramsPromise,
}: {
  params: Promise<{ botId: string }>;
}) {
  const params = use(paramsPromise);
  const botId = params.botId;
  const [bot, setBot] = useState<any>(null);
  const [chatId] = useState(() => Math.random().toString(36).substring(7));
  const [products, setProducts] = useState<Product[]>([]);
  const [showCarousel, setShowCarousel] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [quickRepliesUsed, setQuickRepliesUsed] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
    api: '/api/chat',
    body: { botId, chatId },
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load bot
  useEffect(() => {
    getPublicBotById(botId).then(data => setBot(data));
  }, [botId]);

  // Load products (public endpoint — no auth needed)
  useEffect(() => {
    fetch(`/api/bots/${botId}/products`)
      .then(r => r.json())
      .then((data: Product[]) => setProducts(data.filter(p => p.isActive)))
      .catch(console.error);
  }, [botId]);

  // Auto-scroll
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, showCarousel]);

  // Handlers
  const handleOrderProduct = useCallback(
    (p: Product) => {
      setShowCarousel(false);
      append({
        role: 'user',
        content: `I want to order ${p.name} (${p.price.toLocaleString()} Ks)`,
      });
    },
    [append]
  );

  const handleDetailProduct = useCallback((p: Product) => {
    setDetailProduct(p);
  }, []);

  const handleProductsButton = () => {
    setShowCarousel(prev => !prev);
  };

  if (!bot) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-white font-sans overflow-hidden">
      {/* ── Detail Modal (overlay) ── */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          primaryColor={bot.primaryColor}
          onOrder={handleOrderProduct}
          onClose={() => setDetailProduct(null)}
        />
      )}

      {/* ── Header ── */}
      <div
        className="px-4 py-4 flex flex-row items-center justify-between shadow-md z-10 shrink-0"
        style={{ backgroundColor: bot.primaryColor, color: '#fff' }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
            <BotIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-base font-bold leading-tight">{bot.name}</CardTitle>
            <p className="text-[10px] opacity-80 uppercase tracking-wider font-medium">
              Online Assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9 rounded-full transition-all"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9 rounded-full transition-all"
            onClick={() => window.parent.postMessage('closeWidget', '*')}
          >
            <span className="text-xl font-light">✕</span>
          </Button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-hidden bg-zinc-50/50 flex flex-col min-h-0">
        <ScrollArea ref={scrollRef} className="h-full p-4">
          <div className="space-y-6 pb-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="h-20 w-20 rounded-3xl bg-white shadow-xl flex items-center justify-center border border-zinc-100 rotate-3">
                  <BotIcon className="h-10 w-10" style={{ color: bot.primaryColor }} />
                </div>
                <div className="space-y-2 px-6">
                  <h3 className="font-bold text-zinc-800 text-lg">Hello! I'm {bot.name}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    I'm here to help you. Tap <strong>New Products</strong> to browse, or ask me
                    anything!
                  </p>
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div
                key={m.id}
                className={`flex items-end gap-2 animate-in slide-in-from-bottom-2 duration-300 ${
                  m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <Avatar
                  className={`h-8 w-8 mb-1 shadow-sm shrink-0 ${m.role === 'user' ? 'hidden' : 'flex'}`}
                >
                  <AvatarFallback
                    style={{ backgroundColor: bot.primaryColor }}
                    className="text-white"
                  >
                    <BotIcon size={14} />
                  </AvatarFallback>
                </Avatar>

                <div
                  className={`max-w-[85%] px-4 py-3 shadow-sm ${
                    m.role === 'user'
                      ? 'bg-zinc-900 text-white rounded-2xl rounded-tr-none font-medium text-sm'
                      : 'bg-white text-zinc-800 rounded-2xl rounded-tl-none border border-zinc-100'
                  }`}
                >
                  {m.role === 'user' ? (
                    <span className="text-sm">{m.content}</span>
                  ) : (
                    <MessageContent content={m.content} />
                  )}
                </div>
              </div>
            ))}

            {/* ── Quick reply chips after first bot message ── */}
            {(() => {
              const firstBotIdx = messages.findIndex(m => m.role === 'assistant');
              const isLastBotMessage = firstBotIdx !== -1 && firstBotIdx === messages.length - 1;
              const showChips =
                !quickRepliesUsed && isLastBotMessage && !isLoading && products.length > 0;
              if (!showChips) return null;
              return (
                <div className="flex flex-wrap gap-2 pl-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <button
                    onClick={() => {
                      setQuickRepliesUsed(true);
                      setShowCarousel(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all active:scale-95 hover:text-white"
                    style={{
                      borderColor: bot.primaryColor,
                      color: bot.primaryColor,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        bot.primaryColor;
                      (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = bot.primaryColor;
                    }}
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    📦 Products
                  </button>
                </div>
              );
            })()}

            {isLoading && (
              <div className="flex items-end gap-2 animate-in fade-in duration-300">
                <Avatar className="h-8 w-8 mb-1 shadow-sm flex shrink-0">
                  <AvatarFallback
                    style={{ backgroundColor: bot.primaryColor }}
                    className="text-white"
                  >
                    <BotIcon size={14} />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-white rounded-2xl rounded-tl-none border border-zinc-100 px-4 py-3 shadow-sm flex gap-1 items-center h-10">
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Product Carousel (slides above input) ── */}
      {showCarousel && products.length > 0 && (
        <div className="shrink-0 border-t border-zinc-100 bg-white py-3">
          <ProductCarousel
            products={products}
            primaryColor={bot.primaryColor}
            onOrder={handleOrderProduct}
            onDetail={handleDetailProduct}
            onClose={() => setShowCarousel(false)}
          />
        </div>
      )}
      {/* ── Input Area ── */}
      <div className="shrink-0 bg-white border-t border-zinc-100 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <div className="p-4">
          <form onSubmit={handleSubmit} className="flex w-full items-center gap-3">
            <Input
              placeholder="Write a message..."
              value={input}
              onChange={handleInputChange}
              className="flex-1 rounded-2xl bg-zinc-50 border-zinc-200 focus-visible:ring-offset-0 h-12 px-5 text-sm transition-all focus-visible:ring-1"
              style={{ '--tw-ring-color': bot.primaryColor } as any}
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-2xl h-12 w-12 shrink-0 shadow-lg hover:shadow-xl transition-all active:scale-95"
              style={{ backgroundColor: bot.primaryColor }}
              disabled={isLoading || !input.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
