# Stock Manager Web

Sistema moderno de gestión de inventario, catálogo y finanzas con método contable FIFO, diseñado en modo oscuro **Zinc** con **Next.js (App Router)**, **Tailwind CSS** y **Supabase**.

## Características Principales

- **Gestión de Inventario (CRUD Total)**:
  - Catálogo de productos con fotografía en alta resolución o silueta estilizada con iniciales.
  - Modales táctiles para registro rápido de stock (+ Entrada y − Venta).
  - Modal amplio de detalles de producto con carga directa de imágenes a Supabase Storage (`product-images`).
  - Edición en tiempo real de nombres y marcas, y eliminación segura con doble confirmación.
- **Multisede y Ubicaciones**:
  - Selector de ubicaciones y botón modal de creación rápida para nuevas sucursales o bodegas.
- **Métricas y Finanzas con Algoritmo FIFO**:
  - Cálculo de ganancias netas descontando de los lotes de compra más antiguos (Primeras Entradas, Primeras Salidas).
  - Indicadores clave (KPIs): Ventas Totales, Ganancia Neta Real y Margen de Rentabilidad (%).
  - Historial detallado de ventas con desglose de ingreso, costo FIFO y ganancia individual.
- **Autenticación y Seguridad**:
  - Rutas protegidas mediante Middleware de Next.js y `@supabase/ssr`.
  - Pantalla de login y registro de administrador.

## Tecnologías Utilizadas

- **Framework**: [Next.js 14 (App Router)](https://nextjs.org/)
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/) (Dark Mode Zinc)
- **Base de Datos & Auth & Storage**: [Supabase](https://supabase.com/)
- **Lenguaje**: TypeScript

## Configuración y Despliegue

1. Clona el repositorio:
```bash
git clone https://github.com/AncorMx/stock-manager-web.git
cd stock-manager-web
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno en un archivo `.env.local` basado en `.env.example`:
```env
NEXT_PUBLIC_SUPABASE_URL=tu-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-supabase-anon-key
```

4. Inicia el servidor de desarrollo:
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador.
