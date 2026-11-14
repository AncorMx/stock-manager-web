'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

interface ProductInfo {
  id?: string;
  name?: string;
  description?: string;
  image_url?: string | null;
}

interface RawTransaction {
  id: string;
  product_id: string;
  location_id?: string;
  transaction_type: 'in' | 'out';
  quantity_changed: number;
  sale_price: number | null;
  purchase_cost: number | null;
  date: string;
  products: ProductInfo | ProductInfo[] | null;
}

interface ProcessedSale extends RawTransaction {
  cogs: number;
  profit: number;
  resolvedProduct: ProductInfo;
}

interface FIFOQueueItem {
  remainingQty: number;
  unitCost: number;
}

export default function FinancesPage() {
  const [sales, setSales] = useState<ProcessedSale[]>([]);
  const [totalSales, setTotalSales] = useState<number>(0);
  const [netProfit, setNetProfit] = useState<number>(0);
  const [totalCogs, setTotalCogs] = useState<number>(0);
  const [profitMargin, setProfitMargin] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Formateadores
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  // 1. Carga de datos completos ('in' y 'out') y cálculo FIFO
  const fetchAndProcessTransactions = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // Traer todas las transacciones ordenadas cronológicamente para el algoritmo FIFO
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          product_id,
          location_id,
          transaction_type,
          quantity_changed,
          sale_price,
          purchase_cost,
          date,
          products (
            id,
            name,
            description,
            image_url
          )
        `)
        .order('date', { ascending: true });

      if (error) throw error;

      const rawTransactions = (data as unknown as RawTransaction[]) || [];

      // 2. Algoritmo FIFO (Primeras Entradas, Primeras Salidas)
      const queuesByProduct: Record<string, FIFOQueueItem[]> = {};
      const processedSalesList: ProcessedSale[] = [];

      for (const tx of rawTransactions) {
        const prodId = tx.product_id;
        if (!queuesByProduct[prodId]) {
          queuesByProduct[prodId] = [];
        }

        if (tx.transaction_type === 'in') {
          // Registrar lote en la cola FIFO del producto
          const qty = Number(tx.quantity_changed) || 0;
          const totalCost = Number(tx.purchase_cost) || 0;
          const unitCost = qty > 0 ? totalCost / qty : 0;

          queuesByProduct[prodId].push({
            remainingQty: qty,
            unitCost,
          });
        } else if (tx.transaction_type === 'out') {
          // Descontar iterativamente de los lotes más antiguos (FIFO)
          let qtyToFulfill = Number(tx.quantity_changed) || 0;
          let cogs = 0;

          while (qtyToFulfill > 0 && queuesByProduct[prodId].length > 0) {
            const oldestBatch = queuesByProduct[prodId][0];
            const takeQty = Math.min(oldestBatch.remainingQty, qtyToFulfill);

            cogs += takeQty * oldestBatch.unitCost;
            oldestBatch.remainingQty -= takeQty;
            qtyToFulfill -= takeQty;

            // Si el lote se consume completamente, se remueve de la cola
            if (oldestBatch.remainingQty <= 0) {
              queuesByProduct[prodId].shift();
            }
          }

          const saleRevenue = Number(tx.sale_price) || 0;
          const itemProfit = saleRevenue - cogs;

          // Normalizar el producto asociado
          let resolved: ProductInfo = { name: 'Perfume sin nombre', description: '' };
          if (tx.products) {
            if (Array.isArray(tx.products) && tx.products.length > 0) {
              resolved = tx.products[0];
            } else if (!Array.isArray(tx.products)) {
              resolved = tx.products;
            }
          }

          processedSalesList.push({
            ...tx,
            cogs,
            profit: itemProfit,
            resolvedProduct: resolved,
          });
        }
      }

      // 3. Cálculo de KPIs
      const calculatedTotalSales = processedSalesList.reduce(
        (acc, curr) => acc + (Number(curr.sale_price) || 0),
        0
      );

      const calculatedCogs = processedSalesList.reduce(
        (acc, curr) => acc + curr.cogs,
        0
      );

      const calculatedNetProfit = processedSalesList.reduce(
        (acc, curr) => acc + curr.profit,
        0
      );

      const calculatedMargin =
        calculatedTotalSales > 0
          ? (calculatedNetProfit / calculatedTotalSales) * 100
          : 0;

      // Ordenar ventas de más reciente a más antigua para la vista
      setSales([...processedSalesList].reverse());
      setTotalSales(calculatedTotalSales);
      setTotalCogs(calculatedCogs);
      setNetProfit(calculatedNetProfit);
      setProfitMargin(calculatedMargin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el cálculo FIFO';
      console.error('Error in fetchAndProcessTransactions:', msg);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAndProcessTransactions();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 pb-24">
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        {/* Header con Navegación al Inventario */}
        <header className="mb-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-medium"
                >
                  <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Volver al Inventario
                </Link>
                <span className="text-zinc-700">·</span>
                <span className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Método FIFO
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-100">
                Finanzas y Ganancias
              </h1>
            </div>

            <button
              onClick={fetchAndProcessTransactions}
              disabled={isLoading}
              className="inline-flex items-center gap-2 self-start sm:self-auto px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition active:scale-95 shadow-sm disabled:opacity-50"
            >
              <svg
                className={`w-3.5 h-3.5 stroke-current ${isLoading ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{isLoading ? 'Recalculando...' : 'Actualizar'}</span>
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400">
              {errorMessage}
            </div>
          )}
        </header>

        {/* ============================================================ */}
        {/* TARJETAS KPI (Ventas Totales, Ganancia Neta FIFO, Margen)     */}
        {/* ============================================================ */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-10">
          {/* Tarjeta 1: Ventas Totales */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Ventas Totales
                </span>
                <span className="w-8 h-8 rounded-xl bg-zinc-800/80 flex items-center justify-center text-zinc-300 text-xs font-bold">
                  $
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
                {formatCurrency(totalSales)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
              <span>{sales.length} {sales.length === 1 ? 'venta realizada' : 'ventas realizadas'}</span>
              <span>Ingreso bruto</span>
            </div>
          </div>

          {/* Tarjeta 2: Ganancia Neta Real (FIFO) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Ganancia Neta Real
                </span>
                <span className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                  ✓
                </span>
              </div>
              <p
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {netProfit >= 0 ? '+' : ''}
                {formatCurrency(netProfit)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
              <span>Costo FIFO: {formatCurrency(totalCogs)}</span>
              <span className="text-emerald-400/80 font-medium">Margen real</span>
            </div>
          </div>

          {/* Tarjeta 3: Margen de Ganancia */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Margen de Ganancia
                </span>
                <span className="w-8 h-8 rounded-xl bg-zinc-800/80 flex items-center justify-center text-zinc-300 text-xs font-bold">
                  %
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
                {profitMargin.toFixed(1)}%
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
              <span>Eficiencia de rentabilidad</span>
              <span className={profitMargin >= 30 ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
                {profitMargin >= 30 ? 'Excelente' : profitMargin > 0 ? 'Saludable' : 'Neutro'}
              </span>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* LISTA DE VENTAS RECIENTES CON DESGLOSE FIFO                   */}
        {/* ============================================================ */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                Historial de Ventas Desglosadas
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Costo calculado según los lotes de compra más antiguos registrados (FIFO)
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-800 text-zinc-300">
              {sales.length} registros
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-zinc-500 text-sm animate-pulse">
              Calculando costos FIFO y ganancias...
            </div>
          ) : sales.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 mx-auto mb-3 flex items-center justify-center text-zinc-500">
                <svg className="w-7 h-7 stroke-current" fill="none" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className="text-zinc-300 font-semibold text-sm">
                Aún no hay ventas para calcular ganancias
              </p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Registra ventas en el Inventario para que el algoritmo FIFO calcule los costos y márgenes de inmediato.
              </p>
              <Link
                href="/dashboard"
                className="mt-5 inline-block py-2.5 px-5 rounded-xl text-xs font-bold bg-zinc-100 text-zinc-950 hover:bg-white active:scale-95 transition-all shadow-md"
              >
                Ir al Inventario
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {sales.map((sale) => (
                <div
                  key={sale.id}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-800/25 transition-colors"
                >
                  {/* Info de Producto y Fecha */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0 text-rose-400 mt-0.5">
                      <svg className="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                    </div>

                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                        {sale.resolvedProduct.name}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {sale.resolvedProduct.description || 'Sin marca'}
                      </p>
                      <span className="text-[11px] text-zinc-500 mt-1 block font-mono">
                        {formatDate(sale.date)}
                      </span>
                    </div>
                  </div>

                  {/* Desglose: Cantidad, Venta, Costo FIFO y Ganancia */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 pl-14 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                        Cantidad
                      </span>
                      <span className="text-sm font-semibold text-zinc-200">
                        {sale.quantity_changed} {sale.quantity_changed === 1 ? 'ud.' : 'uds.'}
                      </span>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                        Venta
                      </span>
                      <span className="text-sm font-semibold text-zinc-200">
                        {sale.sale_price !== null ? formatCurrency(Number(sale.sale_price)) : '—'}
                      </span>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                        Costo FIFO
                      </span>
                      <span className="text-sm font-medium text-zinc-400">
                        {formatCurrency(sale.cogs)}
                      </span>
                    </div>

                    <div className="text-right min-w-[100px]">
                      <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                        Ganancia
                      </span>
                      <span
                        className={`text-sm sm:text-base font-black ${
                          sale.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {sale.profit >= 0 ? '+' : ''}
                        {formatCurrency(sale.profit)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
