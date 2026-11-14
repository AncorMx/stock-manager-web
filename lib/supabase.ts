import { createClient } from '@supabase/supabase-js';

// URL de Supabase proporcionada
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ewiftupfcbpczunivyyn.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'TU_SUPABASE_ANON_KEY_AQUI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tipado estricto de las 4 tablas relacionales
export interface LocationRow {
  id: string;
  name: string;
}

export interface ProductRow {
  id: string;
  name: string;
  description: string;
  created_at?: string;
  image_url?: string;
}

export interface InventoryRow {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number;
}

export interface TransactionRow {
  id?: string;
  product_id: string;
  location_id: string;
  transaction_type: 'in' | 'out'; // 'in' = entrada/compra, 'out' = salida/venta
  quantity_changed: number;
  date?: string;
  // Campos para métricas financieras:
  sale_price?: number | null;
  purchase_cost?: number | null;
}

