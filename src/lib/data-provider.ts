/**
 * Data Provider — Unified abstraction for reading Products & Delivery Zones
 *
 * Depending on `bot.inventorySource`:
 *   - "system"       → reads from Prisma DB (default, existing behavior)
 *   - "google_sheet"  → reads from the business owner's Google Sheet
 *
 * Used exclusively by the Agentic Sale Bot (agentic-sale.ts).
 */

import { prisma } from '@/lib/prisma';
import {
  readProductsFromSheet,
  readDeliveryZonesFromSheet,
  type SheetProduct,
  type SheetDeliveryZone,
} from '@/lib/sheets';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
  stockCount: number;
  image: string | null;
  description: string | null;
  isActive: boolean;
  productType: string;
};

export type ProviderDeliveryZone = {
  id: string;
  township: string;
  city: string;
  fee: number;
  isActive: boolean;
};

type BotConfig = {
  id: string;
  inventorySource?: string | null;
  googleSheetId?: string | null;
};

// ─── Products ─────────────────────────────────────────────────────────────────

/**
 * Get all active products for the bot.
 * Reads from Google Sheet or DB depending on bot.inventorySource.
 */
export async function getProducts(bot: BotConfig): Promise<ProviderProduct[]> {
  if (bot.inventorySource === 'google_sheet' && bot.googleSheetId) {
    return readProductsFromSheet(bot.googleSheetId);
  }

  const products = await prisma.product.findMany({
    where: { botId: bot.id, isActive: true, productType: 'product' },
    orderBy: { category: 'asc' },
  });

  return products.map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
    stockCount: p.stockCount,
    image: p.image,
    description: p.description,
    isActive: p.isActive,
    productType: p.productType,
  }));
}

/**
 * Get a single product by ID.
 * For Google Sheet mode, re-reads the sheet and finds by sheet_<index> ID.
 */
export async function getProductById(
  bot: BotConfig,
  productId: string
): Promise<ProviderProduct | null> {
  if (bot.inventorySource === 'google_sheet' && bot.googleSheetId) {
    const allProducts = await readProductsFromSheet(bot.googleSheetId);
    return allProducts.find(p => p.id === productId) || null;
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    price: product.price,
    category: product.category,
    stockCount: product.stockCount,
    image: product.image,
    description: product.description,
    isActive: product.isActive,
    productType: product.productType,
  };
}

/**
 * Search products by keywords (name/category match).
 * Falls back to showing all products if few matches found.
 */
export async function searchProducts(
  bot: BotConfig,
  keywords: string[]
): Promise<ProviderProduct[]> {
  if (bot.inventorySource === 'google_sheet' && bot.googleSheetId) {
    const allProducts = await readProductsFromSheet(bot.googleSheetId);
    if (keywords.length === 0) return allProducts.slice(0, 15);

    const matched = allProducts.filter(p =>
      keywords.some(
        kw =>
          p.name.toLowerCase().includes(kw) ||
          p.category.toLowerCase().includes(kw) ||
          (p.description || '').toLowerCase().includes(kw)
      )
    );

    // If few matches, add general products to fill out the list
    if (matched.length < 5) {
      const matchedIds = new Set(matched.map(m => m.id));
      const additional = allProducts.filter(p => !matchedIds.has(p.id)).slice(0, 10);
      return [...matched, ...additional];
    }

    return matched.slice(0, 15);
  }

  // ── DB mode — use Prisma with keyword search ──
  let relevantProducts: any[] = [];

  if (keywords.length > 0) {
    relevantProducts = await prisma.product.findMany({
      where: {
        botId: bot.id,
        isActive: true,
        OR: [
          ...keywords.map(kw => ({ name: { contains: kw, mode: 'insensitive' as const } })),
          ...keywords.map(kw => ({
            category: { contains: kw, mode: 'insensitive' as const },
          })),
        ],
      },
      take: 15,
    });
  }

  if (relevantProducts.length < 5) {
    const generalProducts = await prisma.product.findMany({
      where: {
        botId: bot.id,
        isActive: true,
        NOT: { id: { in: relevantProducts.map((p: any) => p.id) } },
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    });
    relevantProducts = [...relevantProducts, ...generalProducts];
  }

  return relevantProducts.map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
    stockCount: p.stockCount,
    image: p.image,
    description: p.description,
    isActive: p.isActive,
    productType: p.productType,
  }));
}

// ─── Delivery Zones ───────────────────────────────────────────────────────────

/**
 * Get all active delivery zones for the bot.
 */
export async function getDeliveryZones(bot: BotConfig): Promise<ProviderDeliveryZone[]> {
  if (bot.inventorySource === 'google_sheet' && bot.googleSheetId) {
    return readDeliveryZonesFromSheet(bot.googleSheetId);
  }

  const zones = await prisma.deliveryZone.findMany({
    where: { botId: bot.id, isActive: true },
    orderBy: { township: 'asc' },
  });

  return zones.map(z => ({
    id: z.id,
    township: z.township,
    city: z.city,
    fee: z.fee,
    isActive: z.isActive,
  }));
}
