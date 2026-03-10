'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash,
  Pencil,
  X,
  Upload,
  Download,
  Package,
  Search,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';

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

export default function ProductsPage() {
  const { botId } = useParams<{ botId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formDesc, setFormDesc] = useState('');

  useEffect(() => {
    fetchProducts();
  }, [botId]);

  async function fetchProducts() {
    setLoading(true);
    const res = await fetch(`/api/bots/${botId}/products`);
    setProducts(await res.json());
    setLoading(false);
  }

  function resetForm() {
    setFormName('');
    setFormPrice('');
    setFormCategory('');
    setFormStock('');
    setFormImage('');
    setFormDesc('');
    setEditingProduct(null);
    setShowForm(false);
  }

  function openEdit(p: Product) {
    setFormName(p.name);
    setFormPrice(String(p.price));
    setFormCategory(p.category);
    setFormStock(String(p.stockCount));
    setFormImage(p.image || '');
    setFormDesc(p.description || '');
    setEditingProduct(p);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(editingProduct ? { id: editingProduct.id } : {}),
        name: formName,
        price: parseFloat(formPrice) || 0,
        category: formCategory || 'General',
        stockCount: parseInt(formStock) || 0,
        image: formImage || null,
        description: formDesc || null,
      };
      await fetch(`/api/bots/${botId}/products`, {
        method: editingProduct ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast.success(editingProduct ? 'Updated' : 'Created');
      resetForm();
      fetchProducts();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return;
    await fetch(`/api/bots/${botId}/products?id=${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    fetchProducts();
  }

  async function handleToggleActive(p: Product) {
    await fetch(`/api/bots/${botId}/products`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, isActive: !p.isActive }),
    });
    fetchProducts();
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) {
      toast.error('CSV must have header + data rows');
      return;
    }

    const hdrs = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
    const nameIdx = hdrs.findIndex((h: string) => h.includes('name'));
    const priceIdx = hdrs.findIndex((h: string) => h.includes('price'));
    const catIdx = hdrs.findIndex((h: string) => h.includes('category') || h.includes('cat'));
    const stockIdx = hdrs.findIndex((h: string) => h.includes('stock') || h.includes('qty'));
    const imgIdx = hdrs.findIndex((h: string) => h.includes('image'));
    const descIdx = hdrs.findIndex((h: string) => h.includes('desc'));

    if (nameIdx === -1) {
      toast.error('CSV must have a "name" column');
      return;
    }

    const prods = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c: string) => c.trim().replace(/^"|"$/g, ''));
      if (!cols[nameIdx]) continue;
      prods.push({
        name: cols[nameIdx],
        price: priceIdx >= 0 ? cols[priceIdx] : '0',
        category: catIdx >= 0 ? cols[catIdx] : 'General',
        stockCount: stockIdx >= 0 ? cols[stockIdx] : '0',
        image: imgIdx >= 0 ? cols[imgIdx] : '',
        description: descIdx >= 0 ? cols[descIdx] : '',
      });
    }
    if (prods.length === 0) {
      toast.error('No valid rows');
      return;
    }
    try {
      const res = await fetch(`/api/bots/${botId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prods),
      });
      const data = await res.json();
      toast.success(`${data.created} products imported!`);
      fetchProducts();
    } catch {
      toast.error('Import failed');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleCSVExport() {
    const csv =
      'name,price,category,stock_count,image,description\n' +
      products
        .map(
          (p: Product) =>
            `"${p.name}",${p.price},"${p.category}",${p.stockCount},"${p.image || ''}","${(p.description || '').replace(/"/g, '""')}"`
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
      });
      if (!res.ok) throw new Error('Failed to upload image');
      const data = await res.json();
      setFormImage(data.url);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  }

  const filtered = products.filter(
    (p: Product) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
  );
  const categories = [...new Set(products.map((p: Product) => p.category))];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/bots/${botId}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">Products</h2>
          <p className="text-zinc-500 text-sm font-medium">
            {products.length} products • {products.filter((p: Product) => p.isActive).length} active
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCSVImport}
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          {products.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={handleCSVExport}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
          <Button
            size="sm"
            className="rounded-full bg-zinc-900"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="pl-10 rounded-full bg-zinc-50 border-zinc-100"
        />
      </div>

      {showForm && (
        <Card className="border-none shadow-xl bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold">
              {editingProduct ? 'Edit Product' : 'New Product'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Name *
                </Label>
                <Input
                  value={formName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormName(e.target.value)}
                  placeholder="Product name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Price (Ks)
                </Label>
                <Input
                  type="number"
                  value={formPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormPrice(e.target.value)
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Category
                </Label>
                <Input
                  value={formCategory}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormCategory(e.target.value)
                  }
                  placeholder="General"
                  list="categories"
                />
                <datalist id="categories">
                  {categories.map((c: string) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Stock Count
                </Label>
                <Input
                  type="number"
                  value={formStock}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormStock(e.target.value)
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Product Image
              </Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                />
                <Input
                  value={formImage}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormImage(e.target.value)
                  }
                  placeholder="Or paste image URL https://..."
                  className="flex-1"
                />
              </div>
              {uploadingImage && (
                <p className="text-xs text-zinc-500 animate-pulse">Uploading...</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Description
              </Label>
              <Input
                value={formDesc}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormDesc(e.target.value)}
                placeholder="Product description"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="rounded-full" onClick={resetForm}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-zinc-900"
                onClick={handleSave}
                disabled={saving || uploadingImage}
              >
                {saving || uploadingImage ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                {editingProduct ? 'Update' : 'Create'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-none shadow-xl bg-white p-12 text-center">
          <Package className="h-12 w-12 mx-auto text-zinc-300 mb-4" />
          <p className="text-zinc-500 font-medium">No products yet</p>
          <p className="text-zinc-400 text-sm mt-1">Add products manually or import from CSV</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p: Product) => (
            <Card
              key={p.id}
              className={`border-none shadow-md bg-white transition-all hover:shadow-lg ${!p.isActive ? 'opacity-50' : ''}`}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-zinc-100 flex items-center justify-center overflow-hidden shrink-0">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-6 w-6 text-zinc-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-zinc-900 truncate">{p.name}</h3>
                    <span className="text-xs px-2 py-0.5 bg-zinc-100 rounded-full text-zinc-600 font-medium shrink-0">
                      {p.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm">
                    <span className="font-bold text-emerald-600">
                      {p.price.toLocaleString()} Ks
                    </span>
                    <span
                      className={`font-medium ${p.stockCount > 0 ? 'text-blue-600' : 'text-red-500'}`}
                    >
                      {p.stockCount > 0 ? `${p.stockCount} in stock` : 'Out of stock'}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-zinc-400 mt-1 truncate">{p.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleToggleActive(p)}
                  >
                    <div
                      className={`h-3 w-3 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-4 w-4 text-zinc-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleDelete(p.id)}
                  >
                    <Trash className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
