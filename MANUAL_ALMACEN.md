# Manual de Usuario - Rol Almacén

Este documento detalla las funcionalidades y el uso del sistema para el rol de **Almacén**. Este rol está encargado de la gestión logística, control de inventarios, movimientos de mercadería y emisión de documentos de transporte.

## Índice

1. [Dashboard de Almacén](#1-dashboard-de-almacén)
2. [Maestro de Productos](#2-maestro-de-productos)
3. [Movimientos de Inventario](#3-movimientos-de-inventario)
4. [Kardex Valorizado](#4-kardex-valorizado)
5. [Guías de Remisión](#5-guías-de-remisión)

---

## 1. Dashboard de Almacén

El **Dashboard** es la pantalla de inicio del módulo de almacén y proporciona una visión general del estado del inventario en tiempo real.

### Indicadores Clave (KPIs)
- **Total Productos**: Cantidad total de items únicos registrados en el sistema.
- **Valor Inventario**: Valor monetario total de la mercadería actual (Costo * Stock).
- **Alertas Stock Bajo**: Número de productos que se encuentran por debajo del stock mínimo configurado.
- **Devoluciones Pendientes**: Cantidad de devoluciones registradas que requieren atención.

### Secciones
- **Productos con Stock Crítico**: Lista de productos que necesitan reposición urgente. Muestra el stock actual frente al stock mínimo.
- **Últimos Movimientos**: Historial reciente de entradas y salidas de mercadería.
- **Top Salidas**: Gráfico de barras que muestra los productos con mayor rotación en los últimos 30 días.

---

## 2. Maestro de Productos

Este módulo permite administrar el catálogo completo de productos y servicios.

### Pestañas
1. **Productos**: Listado general.
   - **Nuevo Producto**: Haga clic en el botón "+ Nuevo Producto". Complete los datos obligatorios:
     - *Información General*: Nombre, Códigos (Interno/Barras), Categoría, Marca.
     - *Precios y Stock*: Precio de venta, Stock inicial, Stock Mínimo/Máximo.
     - *Contabilidad*: Cuentas contables de compra/venta (opcional).
   - **Editar/Eliminar**: Use los iconos de lápiz o basurero en cada fila.
2. **Categorías**: Clasificación de productos (ej. Electrónica, Ropa).
3. **Marcas**: Fabricantes o marcas comerciales.

### Características Especiales
- **Configuración de Stock**: Defina alertas de stock mínimo para que el sistema le avise cuándo reponer.
- **Tipos**: Puede registrar "Productos" (tangibles, controlan stock) o "Servicios" (intangibles).

---

## 3. Movimientos de Inventario

Gestione el flujo físico de la mercadería. Todos los cambios en el stock deben registrarse aquí.

### Tipos de Movimiento
- **Entrada**: Ingreso de mercadería (Compras, Devoluciones, Inventario Inicial). Aumenta el stock.
- **Salida**: Egreso de mercadería (Ventas, Consumo Interno, Mermas). Disminuye el stock.
- **Transferencia**: Movimiento entre dos almacenes (Origen -> Destino).

### Registrar un Nuevo Movimiento
1. Haga clic en **"+ Nuevo Movimiento"**.
2. Seleccione el **Tipo** (Entrada/Salida/Transferencia) y el **Motivo**.
3. Seleccione el **Almacén** (Origen y/o Destino según corresponda).
4. Agregue una referencia (ej. Número de Factura o Guía).
5. En la sección **Detalle de Productos**:
   - Busque el producto.
   - Ingrese la cantidad.
   - (Para Entradas) Ingrese el costo unitario.
   - Haga clic en "Agregar".
6. Guarde el movimiento.

### Estados
- **Pendiente**: El movimiento está registrado pero no ha afectado el stock oficial (Borrador).
- **Confirmado**: El movimiento ha sido procesado y el stock ha sido actualizado.
- **Anulado**: El movimiento ha sido cancelado y no afecta el stock.

---

## 4. Kardex Valorizado

Herramienta de control y auditoría que muestra el historial detallado de un producto específico.

### Cómo Generar el Reporte
1. Seleccione un **Producto** (Obligatorio).
2. (Opcional) Filtre por un **Almacén** específico.
3. (Opcional) Defina un rango de **Fechas**.
4. Haga clic en **"Consultar"**.

### Interpretación
La tabla muestra cronológicamente:
- **Entradas**: Cantidad y costo de lo que ingresó.
- **Salidas**: Cantidad y costo de lo que salió.
- **Saldos**: Stock remanente y su valorización actual.

Use el botón **"Exportar"** para imprimir o guardar el reporte en PDF.

---

## 5. Guías de Remisión

Emisión de documentos para el sustento del traslado de bienes (GRE - Guía de Remisión Electrónica).

### Crear Nueva Guía
1. Vaya a la vista de "Nueva Guía".
2. **Datos del Documento**: La serie y número se generan automáticamente (o según configuración). Ingrese fecha de emisión y traslado.
3. **Datos de Traslado**: Especifique punto de partida y llegada, motivo y peso bruto total.
4. **Destinatario**: Seleccione un cliente existente o ingrese manualmente los datos.
5. **Transporte**: Ingrese datos del transportista, vehículo y conductor.
6. **Items**: Agregue los productos que serán trasladados.
7. Guarde la guía.

### Acciones
- **Imprimir**: Genera el formato impreso de la guía.
- **Anular**: Cancela la guía en el sistema (solo si está en estado "Emitida").

---

**Nota**: Mantenga siempre actualizado el stock mínimo en el Maestro de Productos para aprovechar al máximo las alertas del Dashboard.
