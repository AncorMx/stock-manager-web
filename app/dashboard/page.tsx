'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

// Instanciación única del cliente Supabase
const supabase = createClient();

// Interfaces de la base de datos
interface Location {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  created_at?: string;
  image_url?: string | null;
}

interface InventoryItem {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number;
}

export default function DashboardPage() {
  const router = useRouter();

  // Estados de datos
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // Estados de interfaz
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Modal Bottom Sheet: Movimientos (+ / - Vender)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [transactionType, setTransactionType] = useState<'in' | 'out'>('out');
  const [quantity, setQuantity] = useState<number>(1);
  const [transactionAmount, setTransactionAmount] = useState<string>('');

  // Modal Centrado: Nuevo Producto (FAB)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBrandDesc, setNewProductBrandDesc] = useState('');
  const [newProductLocationId, setNewProductLocationId] = useState('');
  const [newProductStock, setNewProductStock] = useState<number>(0);
  const [newProductFile, setNewProductFile] = useState<File | null>(null);
  const [newProductPreview, setNewProductPreview] = useState<string | null>(null);

  // Modal de Detalles del Producto
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);

  // CRUD en Modal de Detalles (Edición y Eliminación)
  const [isEditingInfo, setIsEditingInfo] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editBrand, setEditBrand] = useState<string>('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Modal: Nueva Ubicación
  const [isLocationModalOpen, setIsLocationModalOpen] = useState<boolean>(false);
  const [newLocationName, setNewLocationName] = useState<string>('');
  const [isCreatingLocation, setIsCreatingLocation] = useState<boolean>(false);

  // Helper para generar iniciales elegantes del perfume
  const getInitials = (name: string): string => {
    if (!name) return 'PF';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  // Verificar usuario autenticado
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email);
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Consulta de inventario y productos para la ubicación seleccionada
  const fetchInventoryAndProducts = async (locationId: string) => {
    if (!locationId) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // 1. Obtener productos con image_url
      const { data: prodsData, error: prodsError } = await supabase
        .from('products')
        .select('id, name, description, created_at, image_url')
        .order('name', { ascending: true });

      if (prodsError) throw prodsError;

      // 2. Obtener inventario de la ubicación activa
      const { data: invData, error: invError } = await supabase
        .from('inventory')
        .select('id, product_id, location_id, quantity')
        .eq('location_id', locationId);

      if (invError) throw invError;

      setProducts(prodsData || []);
      setInventory(invData || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al consultar inventario';
      console.error('Error fetching inventory:', msg);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar ubicaciones iniciales
  const fetchLocations = async () => {
    try {
      setErrorMessage(null);
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setLocations(data);
        setSelectedLocationId(data[0].id);
        setNewProductLocationId(data[0].id);
      } else {
        setLocations([]);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar ubicaciones';
      console.error('Error fetching locations:', msg);
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (selectedLocationId) {
      fetchInventoryAndProducts(selectedLocationId);
    }
  }, [selectedLocationId]);

  // Helper stock
  const getProductStock = (productId: string): number => {
    const item = inventory.find(
      (inv) => inv.product_id === productId && inv.location_id === selectedLocationId
    );
    return item ? item.quantity : 0;
  };

  // Abrir Bottom Sheet
  const handleOpenTransaction = (product: Product, type: 'in' | 'out') => {
    setActiveProduct(product);
    setTransactionType(type);
    setQuantity(1);
    setTransactionAmount('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setActiveProduct(null);
    setTransactionAmount('');
  };

  // Confirmar Transacción (Entrada o Venta)
  const handleConfirmTransaction = async () => {
    if (!activeProduct || !selectedLocationId || quantity <= 0) return;

    try {
      setIsSubmitting(true);
      const currentStock = getProductStock(activeProduct.id);
      const delta = transactionType === 'in' ? quantity : -quantity;
      const newStock = Math.max(0, currentStock + delta);

      // 1. Actualizar o insertar en inventory
      const existingInv = inventory.find(
        (inv) => inv.product_id === activeProduct.id && inv.location_id === selectedLocationId
      );

      if (existingInv) {
        const { error: invError } = await supabase
          .from('inventory')
          .update({ quantity: newStock })
          .eq('id', existingInv.id);

        if (invError) throw invError;

        setInventory((prev) =>
          prev.map((item) =>
            item.id === existingInv.id ? { ...item, quantity: newStock } : item
          )
        );
      } else {
        const { data: newInvItem, error: invError } = await supabase
          .from('inventory')
          .insert({
            product_id: activeProduct.id,
            location_id: selectedLocationId,
            quantity: newStock,
          })
          .select()
          .single();

        if (invError) throw invError;
        if (newInvItem) {
          setInventory((prev) => [...prev, newInvItem]);
        }
      }

      // 2. Registrar historial en transactions
      const parsedAmount =
        transactionAmount.trim() !== '' ? parseFloat(transactionAmount) : null;

      const transactionPayload = {
        product_id: activeProduct.id,
        location_id: selectedLocationId,
        transaction_type: transactionType,
        quantity_changed: quantity,
        date: new Date().toISOString(),
        purchase_cost: transactionType === 'in' ? parsedAmount : null,
        sale_price: transactionType === 'out' ? parsedAmount : null,
      };

      const { error: txError } = await supabase.from('transactions').insert(transactionPayload);

      if (txError) {
        console.warn('Aviso registrando transacción en Supabase:', txError);
      }

      handleCloseModal();
    } catch (err: unknown) {
      const errorObj = err as { message?: string; details?: string };
      const msg = errorObj?.message || errorObj?.details || 'Error al procesar movimiento';
      console.error('Error in handleConfirmTransaction:', err);
      alert(`No se pudo procesar la transacción: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Subir o cambiar foto en Supabase Storage
  const handleUploadProductImage = async (file: File, productId: string) => {
    try {
      setIsUploadingImage(true);
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${productId}-${Date.now()}.${fileExt}`;

      // 1. Subir al bucket
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 2. Obtener URL pública
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // 3. Actualizar BD
      const { error: dbError } = await supabase
        .from('products')
        .update({ image_url: publicUrl })
        .eq('id', productId);

      if (dbError) throw dbError;

      // 4. Actualizar estado local
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, image_url: publicUrl } : p))
      );

      setSelectedProductDetail((prev) =>
        prev && prev.id === productId ? { ...prev, image_url: publicUrl } : prev
      );
    } catch (err: unknown) {
      console.error('Error al subir imagen:', err);
      const msg = err instanceof Error ? err.message : 'Error al subir la imagen';
      alert(
        `No se pudo subir la foto: ${msg}\n\n(Asegúrate de haber habilitado la política pública en storage.objects para el bucket 'product-images').`
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Guardar edición de datos de producto (CRUD: Update)
  const handleSaveProductEdit = async () => {
    if (!selectedProductDetail) return;
    if (!editName.trim()) {
      alert('El nombre del perfume no puede estar vacío.');
      return;
    }

    try {
      setIsSubmitting(true);
      const updatedData = {
        name: editName.trim(),
        description: editBrand.trim(),
      };

      const { error } = await supabase
        .from('products')
        .update(updatedData)
        .eq('id', selectedProductDetail.id);

      if (error) throw error;

      // Actualizar estados
      setProducts((prev) =>
        prev.map((p) => (p.id === selectedProductDetail.id ? { ...p, ...updatedData } : p))
      );

      setSelectedProductDetail((prev) => (prev ? { ...prev, ...updatedData } : null));
      setIsEditingInfo(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al editar el producto';
      console.error('Error updating product:', msg);
      alert(`No se pudo actualizar: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Eliminar producto completamente (CRUD: Delete con doble confirmación)
  const handleDeleteProduct = async (productId: string) => {
    try {
      setIsDeleting(true);

      // 1. Eliminar relaciones en inventory
      await supabase.from('inventory').delete().eq('product_id', productId);

      // 2. Eliminar transacciones históricas relacionadas si las hubiera
      await supabase.from('transactions').delete().eq('product_id', productId);

      // 3. Eliminar producto
      const { error: prodError } = await supabase.from('products').delete().eq('id', productId);
      if (prodError) throw prodError;

      // 4. Actualizar estados locales
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setInventory((prev) => prev.filter((i) => i.product_id !== productId));

      setSelectedProductDetail(null);
      setIsConfirmingDelete(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar el producto';
      console.error('Error deleting product:', msg);
      alert(`No se pudo eliminar el producto: ${msg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Crear nueva ubicación en Supabase
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) {
      alert('Por favor ingresa un nombre para la ubicación.');
      return;
    }

    try {
      setIsCreatingLocation(true);
      const { data, error } = await supabase
        .from('locations')
        .insert({ name: newLocationName.trim() })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setLocations((prev) => [...prev, data]);
        setSelectedLocationId(data.id);
        setNewProductLocationId(data.id);
      } else {
        await fetchLocations();
      }

      setIsLocationModalOpen(false);
      setNewLocationName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear la ubicación';
      console.error('Error creating location:', msg);
      alert(`No se pudo crear la ubicación: ${msg}`);
    } finally {
      setIsCreatingLocation(false);
    }
  };

  // Crear producto desde el FAB (+)
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetLocationId = newProductLocationId || selectedLocationId;

    if (!newProductName.trim()) {
      alert('Por favor ingresa el nombre del producto.');
      return;
    }

    try {
      setIsSubmitting(true);

      let uploadedUrl: string | null = null;
      if (newProductFile) {
        const fileExt = newProductFile.name.split('.').pop() || 'jpg';
        const fileName = `new-${Date.now()}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('product-images')
          .upload(fileName, newProductFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName);
          uploadedUrl = urlData.publicUrl;
        } else {
          console.warn('Aviso al subir foto inicial:', uploadErr);
        }
      }

      // Insertar en products
      const { data: newProd, error: prodError } = await supabase
        .from('products')
        .insert({
          name: newProductName.trim(),
          description: newProductBrandDesc.trim(),
          image_url: uploadedUrl,
        })
        .select()
        .single();

      if (prodError) throw prodError;

      const initialQty = Math.max(0, Number(newProductStock) || 0);

      // Insertar en inventory
      if (newProd && targetLocationId) {
        const { data: newInv, error: invError } = await supabase
          .from('inventory')
          .insert({
            product_id: newProd.id,
            location_id: targetLocationId,
            quantity: initialQty,
          })
          .select()
          .single();

        if (invError) throw invError;

        if (initialQty > 0) {
          await supabase.from('transactions').insert({
            product_id: newProd.id,
            location_id: targetLocationId,
            transaction_type: 'in',
            quantity_changed: initialQty,
            date: new Date().toISOString(),
          });
        }

        setProducts((prev) => [newProd, ...prev]);
        if (newInv && targetLocationId === selectedLocationId) {
          setInventory((prev) => [...prev, newInv]);
        }
      }

      setIsNewProductModalOpen(false);
      setNewProductName('');
      setNewProductBrandDesc('');
      setNewProductFile(null);
      setNewProductPreview(null);
      setNewProductStock(0);
    } catch (err: unknown) {
      const errorObj = err as { message?: string; details?: string };
      const msg = errorObj?.message || errorObj?.details || 'Error al crear producto';
      console.error('Error creating product:', err);
      alert(`Error al registrar producto: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentLocation = locations.find((l) => l.id === selectedLocationId);
  const activeStock = activeProduct ? getProductStock(activeProduct.id) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans pb-28 selection:bg-zinc-800">
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-100">
                Inventario
              </h1>
              {userEmail && (
                <p className="text-xs text-zinc-400 mt-0.5">
                  Sesión activa: <span className="text-zinc-300 font-medium">{userEmail}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isLoading && (
                <span className="text-xs text-zinc-500 animate-pulse hidden sm:inline">
                  Sincronizando...
                </span>
              )}
              <Link
                href="/finances"
                className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-all shadow-sm"
              >
                <svg
                  className="w-4 h-4 text-emerald-400 stroke-current"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Finanzas
              </Link>

              {userEmail && (
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-zinc-700 transition-all"
                >
                  <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Selector de Ubicación y Botón de Nueva Ubicación */}
          <div className="flex items-center gap-2 max-w-sm">
            <div className="relative flex-1">
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                disabled={locations.length === 0}
                className="w-full appearance-none bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm font-medium rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-zinc-700 transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                {locations.length === 0 ? (
                  <option value="">Sin ubicaciones</option>
                ) : (
                  locations.map((loc) => (
                    <option key={loc.id} value={loc.id} className="bg-zinc-900 text-zinc-200">
                      {loc.name}
                    </option>
                  ))
                )}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-zinc-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setNewLocationName('');
                setIsLocationModalOpen(true);
              }}
              title="Añadir nueva ubicación"
              className="inline-flex items-center gap-1.5 px-3.5 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition active:scale-95 text-xs font-semibold shadow-sm shrink-0"
            >
              <svg className="w-4 h-4 text-emerald-400 stroke-current" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>+ Nueva</span>
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400">
              {errorMessage}
            </div>
          )}
        </header>

        {/* Grid de Productos */}
        {isLoading && products.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-4 h-44 animate-pulse flex flex-col justify-between"
              >
                <div className="flex justify-between items-start">
                  <div className="w-16 h-16 bg-zinc-800 rounded-xl" />
                  <div className="w-12 h-8 bg-zinc-800 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="w-3/4 h-4 bg-zinc-800 rounded" />
                  <div className="w-1/2 h-3 bg-zinc-800/60 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-9 bg-zinc-800 rounded-xl" />
                  <div className="h-9 bg-zinc-800 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 px-4 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl">
            <p className="text-zinc-300 font-medium">No hay productos registrados en el catálogo.</p>
            <p className="text-xs text-zinc-500 mt-1">Presiona el botón (+) para registrar el primero.</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
              const stock = getProductStock(product.id);
              const isOutOfStock = stock === 0;

              return (
                <article
                  key={product.id}
                  onClick={() => {
                    setSelectedProductDetail(product);
                    setIsEditingInfo(false);
                    setEditName(product.name);
                    setEditBrand(product.description || '');
                    setIsConfirmingDelete(false);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between hover:border-zinc-700/80 transition-all duration-200 shadow-sm cursor-pointer hover:bg-zinc-900/90 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Renderizado de Foto Real o Placeholder con Silueta e Iniciales */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center flex-shrink-0 relative shadow-inner">
                      {product.image_url && product.image_url.trim() !== '' ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling;
                            if (fallback) (fallback as HTMLElement).style.display = 'flex';
                          }}
                        />
                      ) : null}

                      <div
                        className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-850 to-zinc-900 ${
                          product.image_url && product.image_url.trim() !== '' ? 'hidden' : 'flex'
                        }`}
                      >
                        <svg
                          className="w-5 h-5 text-zinc-400 mb-0.5 stroke-current"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M10 3h4m-2 0v3m-4 3h8a2 2 0 012 2v8a3 3 0 01-3 3H9a3 3 0 01-3-3v-8a2 2 0 012-2z"
                          />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wider text-zinc-300 uppercase">
                          {getInitials(product.name)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-2xl sm:text-3xl font-extrabold leading-none ${
                          isOutOfStock ? 'text-rose-400' : 'text-zinc-100'
                        }`}
                      >
                        {stock}
                      </p>
                      <span
                        className={`text-xs font-medium block mt-1 ${
                          isOutOfStock ? 'text-rose-400/80' : 'text-zinc-400'
                        }`}
                      >
                        {isOutOfStock ? 'Agotado' : 'en stock'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 mb-4">
                    <h3 className="text-base font-semibold text-zinc-100 leading-snug">
                      {product.name}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                      {product.description || 'Sin marca especificada'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTransaction(product, 'in');
                      }}
                      className="flex items-center justify-center py-2 px-3 rounded-xl text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95 transition-all"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTransaction(product, 'out');
                      }}
                      className="flex items-center justify-center py-2 px-3 rounded-xl text-sm font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 active:scale-95 transition-all"
                    >
                      − Vender
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {/* FAB (+) */}
      <button
        type="button"
        onClick={() => {
          setNewProductName('');
          setNewProductBrandDesc('');
          setNewProductFile(null);
          setNewProductPreview(null);
          setNewProductStock(0);
          setIsNewProductModalOpen(true);
        }}
        aria-label="Añadir nuevo producto"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-zinc-100 text-zinc-900 flex items-center justify-center shadow-2xl hover:bg-white hover:scale-105 active:scale-95 transition-transform z-40"
      >
        <svg className="w-6 h-6 stroke-current" fill="none" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {/* ============================================================ */}
      {/* 1. MODAL DE TRANSACCIÓN REFINADO (Más espacioso y táctil)     */}
      {/* ============================================================ */}
      {isModalOpen && activeProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={handleCloseModal}
          />

          <div className="relative w-full max-w-lg bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-7 sm:p-9 shadow-2xl z-10 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            {/* Tirador móvil */}
            <div className="w-12 h-1.5 bg-zinc-700/60 rounded-full mx-auto mb-5 sm:hidden" />

            {/* Badge de tipo */}
            <div className="flex justify-center mb-4">
              <span
                className={`text-xs font-semibold px-4 py-1.5 rounded-full border tracking-wide uppercase ${
                  transactionType === 'in'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                {transactionType === 'in' ? 'Registrar Entrada' : 'Registrar Venta'}
              </span>
            </div>

            {/* Encabezado del producto */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700/70 mb-3 flex items-center justify-center relative shadow-md">
                {activeProduct.image_url && activeProduct.image_url.trim() !== '' ? (
                  <img
                    src={activeProduct.image_url}
                    alt={activeProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <span className="text-xs font-bold text-zinc-300 uppercase">
                      {getInitials(activeProduct.name)}
                    </span>
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold text-zinc-100">{activeProduct.name}</h2>
              <p className="text-xs text-zinc-400 mt-1">
                {currentLocation?.name} ·{' '}
                <span className={activeStock === 0 ? 'text-rose-400 font-medium' : 'text-zinc-300'}>
                  {activeStock} disponibles
                </span>
              </p>
            </div>

            {/* Selector de Cantidad Táctil Ampliado */}
            <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-800 rounded-2xl p-2.5 max-w-[270px] mx-auto shadow-inner">
              <button
                type="button"
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-xl bg-zinc-800/90 text-zinc-100 hover:bg-zinc-700 active:scale-90 transition text-2xl font-bold select-none"
              >
                −
              </button>

              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 bg-transparent text-center text-3xl sm:text-4xl font-extrabold text-zinc-100 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />

              <button
                type="button"
                onClick={() => setQuantity((prev) => prev + 1)}
                className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-xl bg-zinc-800/90 text-zinc-100 hover:bg-zinc-700 active:scale-90 transition text-2xl font-bold select-none"
              >
                +
              </button>
            </div>

            {/* Campo Financiero con Espaciado Generoso */}
            <div className="my-7 sm:my-8 max-w-sm mx-auto w-full">
              <label className="block text-xs font-semibold text-zinc-400 mb-2.5 text-center uppercase tracking-wider">
                {transactionType === 'in'
                  ? 'Costo de compra total (opcional)'
                  : 'Precio de venta total (opcional)'}
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-zinc-500 font-bold text-base pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={
                    transactionType === 'in'
                      ? 'Costo de compra total'
                      : 'Precio de venta total'
                  }
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3.5 pl-9 pr-4 text-center text-base font-semibold text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                />
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmTransaction}
                className={`w-full py-4 rounded-xl text-white font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 ${
                  transactionType === 'in'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/40'
                }`}
              >
                {isSubmitting
                  ? 'Guardando...'
                  : transactionType === 'in'
                  ? 'Confirmar Entrada'
                  : 'Confirmar Venta'}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCloseModal}
                className="w-full py-2.5 text-center text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. MODAL DE DETALLES DEL PERFUME REFINADO (Espacioso + CRUD) */}
      {/* ============================================================ */}
      {selectedProductDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={() => !isUploadingImage && !isDeleting && setSelectedProductDetail(null)}
          />

          <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl p-7 sm:p-9 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60 uppercase tracking-wider">
                Detalles del Perfume
              </span>
              <button
                type="button"
                onClick={() => setSelectedProductDetail(null)}
                className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 flex items-center justify-center transition text-sm"
              >
                ✕
              </button>
            </div>

            {/* Gran Contenedor de Foto con 'Aire' y Botón Flotante Sutil */}
            <div className="relative w-full h-64 sm:h-80 rounded-3xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-7 group shadow-2xl">
              {selectedProductDetail.image_url ? (
                <img
                  src={selectedProductDetail.image_url}
                  alt={selectedProductDetail.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900/60 via-zinc-950 to-zinc-950">
                  <svg className="w-16 h-16 text-zinc-600 mb-3 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.25"
                      d="M10 3h4m-2 0v3m-4 3h8a2 2 0 012 2v8a3 3 0 01-3 3H9a3 3 0 01-3-3v-8a2 2 0 012-2z"
                    />
                  </svg>
                  <span className="text-2xl font-black tracking-widest text-zinc-400 uppercase">
                    {getInitials(selectedProductDetail.name)}
                  </span>
                  <span className="text-xs text-zinc-600 mt-1">Sin fotografía cargada</span>
                </div>
              )}

              {/* Botón flotante sutil en la esquina inferior derecha */}
              <div className="absolute bottom-4 right-4 z-20">
                <label className="inline-flex items-center gap-2 py-2 px-3.5 rounded-xl bg-zinc-900/85 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/70 text-xs font-semibold cursor-pointer shadow-xl backdrop-blur-md transition-all active:scale-95 disabled:opacity-50">
                  <svg className="w-4 h-4 text-zinc-300 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>
                    {isUploadingImage
                      ? 'Subiendo...'
                      : selectedProductDetail.image_url
                      ? 'Cambiar foto'
                      : 'Subir foto'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isUploadingImage}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadProductImage(file, selectedProductDetail.id);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Sección de Información o Modo Edición */}
            <div className="space-y-6 mb-7">
              {isEditingInfo ? (
                /* Formulario de Edición de Nombre y Marca */
                <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-2xl space-y-3.5 animate-in fade-in duration-150">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Editar Información del Perfume
                  </h4>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Marca / Notas</label>
                    <input
                      type="text"
                      value={editBrand}
                      onChange={(e) => setEditBrand(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleSaveProductEdit}
                      className="py-2 px-4 rounded-xl text-xs font-bold bg-zinc-100 text-zinc-950 hover:bg-white active:scale-95 transition"
                    >
                      {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingInfo(false)}
                      className="py-2 px-3 text-xs text-zinc-400 hover:text-zinc-200 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* Vista de Información Normal con Espaciado Generoso */
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight leading-tight">
                      {selectedProductDetail.name}
                    </h3>
                    <p className="text-sm sm:text-base text-zinc-400 mt-1 font-medium">
                      {selectedProductDetail.description || 'Sin marca especificada'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditName(selectedProductDetail.name);
                      setEditBrand(selectedProductDetail.description || '');
                      setIsEditingInfo(true);
                    }}
                    className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold border border-zinc-700/60 active:scale-95 transition shrink-0"
                  >
                    <svg className="w-3.5 h-3.5 stroke-current" fill="none" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                    Editar
                  </button>
                </div>
              )}

              {/* Sección de Stock en la Ubicación */}
              <div className="p-4 bg-zinc-950/70 border border-zinc-800/80 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-xs text-zinc-400 block">Stock disponible en:</span>
                  <span className="text-sm font-semibold text-zinc-200">
                    {currentLocation?.name || 'Ubicación actual'}
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={`text-lg font-black ${
                      getProductStock(selectedProductDetail.id) === 0
                        ? 'text-rose-400'
                        : 'text-zinc-100'
                    }`}
                  >
                    {getProductStock(selectedProductDetail.id)}{' '}
                    <span className="text-xs font-medium text-zinc-400">
                      {getProductStock(selectedProductDetail.id) === 0 ? 'Agotado' : 'unidades'}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Acciones Rápidas (+ Añadir Stock y − Registrar Venta) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={() => {
                  const p = selectedProductDetail;
                  setSelectedProductDetail(null);
                  handleOpenTransaction(p, 'in');
                }}
                className="py-3.5 px-4 rounded-xl text-sm font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95 transition-all text-center shadow-sm"
              >
                + Añadir Stock
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = selectedProductDetail;
                  setSelectedProductDetail(null);
                  handleOpenTransaction(p, 'out');
                }}
                className="py-3.5 px-4 rounded-xl text-sm font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 active:scale-95 transition-all text-center shadow-sm"
              >
                − Registrar Venta
              </button>
            </div>

            {/* Zona de Peligro: Eliminar Producto (Doble Confirmación) */}
            <div className="pt-3 border-t border-zinc-800/80">
              {isConfirmingDelete ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-center space-y-3 animate-in fade-in duration-150">
                  <p className="text-xs font-semibold text-rose-300">
                    ¿Eliminar definitivamente este perfume? Se borrará de la base de datos y de todo el inventario.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDeleteProduct(selectedProductDetail.id)}
                      className="py-2 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg active:scale-95 transition"
                    >
                      {isDeleting ? 'Eliminando...' : 'Sí, eliminar definitivamente'}
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setIsConfirmingDelete(false)}
                      className="py-2 px-3 text-xs text-zinc-400 hover:text-zinc-200 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="w-full py-2.5 text-center text-xs font-semibold text-zinc-500 hover:text-rose-400 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Eliminar este perfume del catálogo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. MODAL CENTRADO: NUEVO PRODUCTO (FAB)                      */}
      {/* ============================================================ */}
      {isNewProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => !isSubmitting && setIsNewProductModalOpen(false)}
          />

          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">Nuevo Producto</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Registra un nuevo artículo en tu catálogo</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewProductModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 flex items-center justify-center transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Nombre del Perfume *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Club de Nuit Intense Man"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-700 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Marca / Notas</label>
                <input
                  type="text"
                  placeholder="Ej. Armaf · Amaderado Especiado"
                  value={newProductBrandDesc}
                  onChange={(e) => setNewProductBrandDesc(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-700 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Foto del Producto (Opcional)
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                    {newProductPreview ? (
                      <img
                        src={newProductPreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-zinc-500 uppercase">
                        {newProductName.trim() ? getInitials(newProductName) : 'PF'}
                      </span>
                    )}
                  </div>

                  <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700/60 hover:bg-zinc-700 hover:text-white transition shadow-sm">
                    <span>{newProductFile ? 'Cambiar imagen' : 'Seleccionar foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setNewProductFile(file);
                          setNewProductPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>

                  {newProductFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewProductFile(null);
                        setNewProductPreview(null);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 transition"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Ubicación Inicial *</label>
                <div className="relative">
                  <select
                    value={newProductLocationId}
                    onChange={(e) => setNewProductLocationId(e.target.value)}
                    required
                    disabled={locations.length === 0}
                    className="w-full appearance-none bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 pr-10 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-700 transition cursor-pointer disabled:opacity-50"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id} className="bg-zinc-900 text-zinc-200">
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Stock Inicial</label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="0"
                  value={newProductStock}
                  onChange={(e) => setNewProductStock(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-700 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="pt-3 space-y-2">
                <button
                  type="submit"
                  disabled={isSubmitting || locations.length === 0}
                  className="w-full py-3.5 rounded-xl bg-zinc-100 text-zinc-950 font-semibold hover:bg-white active:scale-[0.98] transition-all text-sm shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Producto'}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsNewProductModalOpen(false)}
                  className="w-full py-2.5 text-center text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. MODAL: NUEVA UBICACIÓN                                    */}
      {/* ============================================================ */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => !isCreatingLocation && setIsLocationModalOpen(false)}
          />

          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">Nueva Ubicación</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Añade un punto de venta o almacén</p>
              </div>
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 flex items-center justify-center transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLocation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                  Nombre de la Ubicación *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Tienda Centro, Bodega 2, etc."
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-700 transition"
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={isCreatingLocation || !newLocationName.trim()}
                  className="w-full py-3.5 rounded-xl bg-zinc-100 text-zinc-950 font-semibold hover:bg-white active:scale-[0.98] transition-all text-sm shadow-md disabled:opacity-50"
                >
                  {isCreatingLocation ? 'Creando...' : 'Crear Ubicación'}
                </button>
                <button
                  type="button"
                  disabled={isCreatingLocation}
                  onClick={() => setIsLocationModalOpen(false)}
                  className="w-full py-2.5 text-center text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
