# Manual de Usuario - Sistema ERP

Bienvenido al manual de usuario del Sistema de Gestión Empresarial (ERP). Este documento detalla las funciones principales y los módulos disponibles para cada rol dentro de la organización.

## 1. Acceso al Sistema

Para ingresar al sistema, diríjase a la pantalla de inicio de sesión e introduzca sus credenciales:

*   **Usuario o Correo Electrónico**: Puede usar su nombre de usuario asignado o su correo corporativo.
*   **Contraseña**: Su clave personal.

> **Nota**: Si olvidó su contraseña, utilice la opción "¿Olvidaste tu contraseña?" para iniciar el proceso de recuperación.

---

## 2. Módulos del Administrador (Admin)

El rol de **Administrador** tiene la responsabilidad de la gestión integral del sistema, la seguridad, la configuración de la empresa y la auditoría de acciones. A continuación se detallan sus módulos exclusivos:

### 2.1. Gestión de Usuarios
**Ubicación**: Menú lateral > **Usuarios**

Este módulo permite administrar las cuentas de acceso de todo el personal.

*   **Listado de Usuarios**: Visualice una tabla con todos los usuarios, sus correos, roles asignados y estado actual. Use el buscador superior para encontrar usuarios por nombre o email.
*   **Crear Nuevo Usuario**:
    1.  Haga clic en el botón **"Nuevo Usuario"**.
    2.  Complete los campos: Usuario, Email, Contraseña y seleccione el Rol apropiado.
    3.  El estado por defecto será "Activo".
*   **Editar Usuario**: Haga clic en el ícono de lápiz (✏️) para modificar datos. Si deja el campo contraseña en blanco, se mantendrá la actual.
*   **Cambiar Estado**: Puede desactivar un usuario temporalmente sin eliminarlo, impidiendo su acceso al sistema.
*   **Eliminar Usuario**: Haga clic en el ícono de basura (🗑️) para borrar permanentemente (requiere confirmación).

### 2.2. Gestión de Permisos
**Ubicación**: Menú lateral > **Gestión Permisos**

Control granular sobre qué puede ver y hacer cada rol dentro del sistema.

*   **Asignar Módulo a Rol**:
    1.  Haga clic en **"Asignar Módulo"**.
    2.  Seleccione el **Rol** (ej. Ventas, Almacén) y el **Módulo** deseado.
    3.  Defina los permisos iniciales.
*   **Configurar Niveles de Acceso**: En la tabla principal, use los interruptores (checkboxes) para activar/desactivar:
    *   **👁️ Lectura**: Permite visualizar el módulo en el menú y acceder a él.
    *   **✏️ Escritura**: Permite crear y editar registros dentro del módulo.
    *   **❌ Eliminación**: Autoriza el borrado de información sensible.
*   **Revocar Acceso**: Elimine la asignación completa para ocultar el módulo a ese rol.

### 2.3. Configuración General
**Ubicación**: Menú lateral > **Configuración**

El centro de control para los datos fiscales y operativos de la empresa. Organizado en pestañas:

*   **Empresa**: Actualice RUC, Razón Social, Nombre Comercial, Dirección Fiscal y Año Fiscal. Configure aquí las credenciales **SUNAT** (Usuario SOL, Clave, Certificado Digital) para la facturación electrónica.
*   **Sedes**: Administre múltiples sucursales. Cada sede puede tener su propia dirección y código SUNAT.
*   **Moneda**:
    *   Gestione las monedas aceptadas (Soles, Dólares).
    *   **Tipo de Cambio**: Registre diariamente el tipo de cambio (Compra/Venta) para asegurar la precisión contable.
*   **Fiscal / Periodos**:
    *   **Periodos**: Abra o cierre meses contables para evitar modificaciones en periodos ya declarados.
    *   **Centros de Costo**: Defina unidades de negocio para imputación de gastos.
*   **Comprobantes**: Configure las **Series** y **Correlativos** para sus facturas, boletas y notas, asignándolas a sedes específicas.

### 2.4. Reportes de Logs (Auditoría)
**Ubicación**: Menú lateral > **Reportes Logs**

Herramienta de seguridad y trazabilidad. Permite ver "quién hizo qué" en el sistema.

*   **Filtros de Búsqueda**:
    *   **Rango de Fechas**: Desde / Hasta.
    *   **ID Usuario**: Filtre acciones de un empleado específico.
    *   **Módulo**: Filtre por área (Login, Ventas, Usuarios, etc.).
*   **Información Detallada**:
    *   **Fecha/Hora**: Momento exacto de la acción.
    *   **Usuario**: Nombre de quien realizó la acción.
    *   **Acción**: Tipo de evento (LOGIN, INSERT, UPDATE, DELETE).
    *   **Detalle**: Descripción técnica del cambio.
    *   **IP**: Dirección IP desde donde se conectó el usuario.

---

## 3. Módulos Operativos (Ventas, Contabilidad, etc.)

El administrador puede tener acceso a estos módulos si se auto-asigna los permisos, aunque su uso principal corresponde a otros roles.

### 💼 Ventas
*   **Dashboard de Ventas**: Resumen de ventas diarias y metas.
*   **Facturación Electrónica**: Emisión de comprobantes (Facturas, Boletas).
*   **Clientes y CRM**: Gestión de cartera de clientes y oportunidades.
*   **Caja y Cobranzas**: Control de efectivo y cuentas por cobrar.

### 📊 Contabilidad
*   **Libros Electrónicos**: Registro de Compras/Ventas.
*   **Impuestos**: Cálculo de IGV y Renta.
*   **Reportes Financieros**: Balance y Estado de Resultados.

### � Almacén y Logística
*   **Inventarios**: Control de stock y kardex valorizado.
*   **Maestro de Productos**: Precios, códigos y categorías.
*   **Guías de Remisión**: Traslados de mercadería.

### 👥 Recursos Humanos
*   **Colaboradores**: Gestión de legajos y contratos.
*   **Asistencia**: Control de horarios.
*   **Planillas**: Cálculo de remuneraciones y beneficios.

---

## 4. Instrucciones Generales

### Navegación y Uso
*   **Menú Lateral**: Use el menú izquierdo para navegar. Puede contraerlo para más espacio.
*   **Búsquedas**: Casi todas las tablas incluyen barras de búsqueda y filtros avanzados.
*   **Exportación**: Busque los botones de "Exportar a Excel/PDF" en los reportes para descargar información.
*   **Seguridad**: Cierre siempre su sesión al terminar de usar el sistema desde el menú de perfil (esquina superior derecha).
