import React, { useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ContabilidadGeneral from './components/ContabilidadGeneral';
import CentrosCostos from './components/CentrosCostos';
import ConfiguracionGeneral from './components/ConfiguracionGeneral';
import FacturacionElectronica from './components/FacturacionElectronica';
import RegistroVentas from './components/RegistroVentas';
import RegistroCompras from './components/RegistroCompras';
import ImpuestosTributos from './components/ImpuestosTributos';
import Caja from './components/Caja';
import Bancos from './components/Bancos';
import Cobranzas from './components/Cobranzas';
import CuentasPorPagar from './components/CuentasPorPagar';
import ClientesProveedores from './components/ClientesProveedores';
import ReportesFinancieros from './components/ReportesFinancieros';
import Auditoria from './components/Auditoria';
import DashboardContabilidad from './components/DashboardContabilidad';
import DashboardAlmacen from './components/DashboardAlmacen';
import DashboardRRHH from './components/DashboardRRHH';
import DashboardGerente from './components/DashboardGerente';
import DashboardVendedor from './components/DashboardVendedor';
import Usuarios from './components/Usuarios';
import Areas from './components/Areas';
import GestionPermisos from './components/GestionPermisos';
import GestionColaboradores from './components/GestionColaboradores';
import GestionContratos from './components/GestionContratos';
import ControlAsistencia from './components/ControlAsistencia';
import VacacionesPermisos from './components/VacacionesPermisos';
import GestionPlanillas from './components/GestionPlanillas';
import BeneficiosCompensaciones from './components/BeneficiosCompensaciones';
import DocumentacionLaboral from './components/DocumentacionLaboral';
import CertificadosConstancias from './components/CertificadosConstancias';
import BoletasPago from './components/BoletasPago';
import PapeletasServicio from './components/PapeletasServicio';
import CesesLiquidaciones from './components/CesesLiquidaciones';
import GestionClientes from './components/GestionClientes';
import Cotizaciones from './components/Cotizaciones';
import Crm from './components/Crm';
import DevolucionesReclamos from './components/DevolucionesReclamos';
import DevolucionesAlmacen from './components/DevolucionesAlmacen';
import ReportesAlmacen from './components/ReportesAlmacen';
import ReportesVentas from './components/ReportesVentas';
import PreciosPromociones from './components/PreciosPromociones';
import MaestroProductos from './components/MaestroProductos';
import GestionAlmacenes from './components/GestionAlmacenes';
import MovimientosInventario from './components/MovimientosInventario';
import GuiasRemision from './components/GuiasRemision';
import OrdenesTrabajo from './components/OrdenesTrabajo';
import Kardex from './components/Kardex';
import SupervisionVentas from './components/SupervisionVentas';
import SupervisionCompras from './components/SupervisionCompras';
import SupervisionFinanciera from './components/SupervisionFinanciera';
import SupervisionInventarios from './components/SupervisionInventarios';
import SupervisionRRHH from './components/SupervisionRRHH';
import ReportesEjecutivos from './components/ReportesEjecutivos';
import ReportesLogs from './components/ReportesLogs';
import Perfil from './components/Perfil';
import InstruccionesFacturacion from './components/InstruccionesFacturacion';
import AgendaCorporativa from './components/AgendaCorporativa';
import ConciliacionBancaria from './components/ConciliacionBancaria';
import ActivosFijos from './components/ActivosFijos';
import CierreContable from './components/CierreContable';
import CentroDeCostosAvanzado from './components/CentroDeCostosAvanzado';
import PortalEmpleado from './components/PortalEmpleado';
import Reclutamiento from './components/Reclutamiento';
import Acreditaciones from './components/Acreditaciones';
import GestionISO from './components/GestionISO';
import GestionRetenciones from './components/GestionRetenciones';
import GestionCoordinaciones from './components/GestionCoordinaciones';

// Componente para interceptar respuestas 401 y añadir token
const AxiosInterceptor = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Interceptor de Request para añadir token
    const reqInterceptor = axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Interceptor de Response para manejar 401
    const resInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const url = error?.config?.url || '';
        if (error.response && error.response.status === 401) {
          if (!url.includes('iso.php')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('modulos');
            navigate('/');
          }
          return Promise.reject(error);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(reqInterceptor);
      axios.interceptors.response.eject(resInterceptor);
    };
  }, [navigate]);

  return null;
};

// Componente para proteger rutas
const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/" />;
  }
  return <Layout>{children}</Layout>;
};

// Componente Placeholder para Dashboard General
const DashboardGeneral = () => (
  <div className="flex items-center justify-center min-h-[calc(100vh-theme(spacing.16))] animate-fade-in p-6">
    <div className="bg-white rounded-2xl shadow-xl p-10 max-w-2xl w-full text-center border border-gray-100">
        <div className="bg-blue-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">👋</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Bienvenido al ERP</h1>
        <p className="text-gray-500 text-lg leading-relaxed">
            Selecciona un módulo del menú lateral para comenzar a gestionar tu negocio de manera eficiente.
        </p>
    </div>
  </div>
);

const DashboardWrapper = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isContador = user?.rol_nombre?.toLowerCase() === 'contador' || 
                     user?.rol === 'contador' || 
                     user?.rol?.toLowerCase() === 'contador';
  
  const isAlmacen = user?.rol_nombre?.toLowerCase() === 'almacen' || 
                    user?.rol === 'almacen' || 
                    user?.rol?.toLowerCase() === 'almacen' ||
                    user?.usuario === 'almacen';

  const isRRHH = user?.rol_nombre?.toLowerCase() === 'rrhh' || 
                 user?.rol === 'rrhh' || 
                 user?.rol?.toLowerCase() === 'rrhh' ||
                 user?.rol_nombre?.toLowerCase() === 'recursos humanos';

  const isGerente = user?.rol_nombre?.toLowerCase() === 'gerente' || 
                    user?.rol === 'gerente' || 
                    user?.rol?.toLowerCase() === 'gerente' || 
                    user?.usuario === 'gerente';

  const isVendedor = user?.rol_nombre?.toLowerCase() === 'ventas' || 
                     user?.rol === 'ventas' || 
                     user?.rol?.toLowerCase() === 'ventas';

  if (isGerente) {
    return <DashboardGerente />;
  }
  if (isContador) {
    return <DashboardContabilidad />;
  }
  if (isAlmacen) {
    return <DashboardAlmacen />;
  }
  if (isRRHH) {
    return <DashboardRRHH />;
  }
  if (isVendedor) {
    return <DashboardVendedor />;
  }
  return <DashboardGeneral />;
};

function App() {
  return (
    <Router>
      <AxiosInterceptor />
      <ErrorBoundary>
        <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/recuperar-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Rutas Protegidas */}
        <Route path="/dashboard" element={
          <PrivateRoute>
            <DashboardWrapper />
          </PrivateRoute>
        } />

        <Route path="/dashboard-gerente" element={
          <PrivateRoute>
            <DashboardGerente />
          </PrivateRoute>
        } />

        <Route path="/dashboard-vendedor" element={
          <PrivateRoute>
            <DashboardVendedor />
          </PrivateRoute>
        } />

        <Route path="/usuarios" element={
          <PrivateRoute>
            <Usuarios />
          </PrivateRoute>
        } />

        <Route path="/areas" element={
          <PrivateRoute>
            <Areas />
          </PrivateRoute>
        } />

        <Route path="/gestion-permisos" element={
          <PrivateRoute>
            <GestionPermisos />
          </PrivateRoute>
        } />

        <Route path="/gestion-colaboradores" element={
          <PrivateRoute>
            <GestionColaboradores />
          </PrivateRoute>
        } />

        <Route path="/gestion-contratos" element={
          <PrivateRoute>
            <GestionContratos />
          </PrivateRoute>
        } />

        <Route path="/control-asistencia" element={
          <PrivateRoute>
            <ControlAsistencia />
          </PrivateRoute>
        } />

        <Route path="/vacaciones" element={
          <PrivateRoute>
            <VacacionesPermisos />
          </PrivateRoute>
        } />

        <Route path="/planillas" element={
          <PrivateRoute>
            <GestionPlanillas />
          </PrivateRoute>
        } />

        <Route path="/beneficios" element={
          <PrivateRoute>
            <BeneficiosCompensaciones />
          </PrivateRoute>
        } />

        <Route path="/documentacion" element={
          <PrivateRoute>
            <DocumentacionLaboral />
          </PrivateRoute>
        } />

        <Route path="/certificados-constancias" element={
          <PrivateRoute>
            <CertificadosConstancias />
          </PrivateRoute>
        } />

        <Route path="/boletas-pago" element={
          <PrivateRoute>
            <BoletasPago />
          </PrivateRoute>
        } />

        <Route path="/papeletas" element={
          <PrivateRoute>
            <PapeletasServicio />
          </PrivateRoute>
        } />

        <Route path="/ceses" element={
          <PrivateRoute>
            <CesesLiquidaciones />
          </PrivateRoute>
        } />

        <Route path="/gestion-clientes" element={
          <PrivateRoute>
            <GestionClientes />
          </PrivateRoute>
        } />

        <Route path="/cotizaciones" element={
          <PrivateRoute>
            <Cotizaciones />
          </PrivateRoute>
        } />

        <Route path="/acreditaciones" element={
          <PrivateRoute>
            <Acreditaciones />
          </PrivateRoute>
        } />

        <Route path="/gestion-iso" element={
          <PrivateRoute>
            <GestionISO />
          </PrivateRoute>
        } />

        <Route path="/retenciones" element={
          <PrivateRoute>
            <GestionRetenciones />
          </PrivateRoute>
        } />

        <Route path="/crm" element={
          <PrivateRoute>
            <Crm />
          </PrivateRoute>
        } />

        <Route path="/devoluciones" element={
          <PrivateRoute>
            <DevolucionesReclamos />
          </PrivateRoute>
        } />

        <Route path="/devoluciones-almacen" element={
          <PrivateRoute>
            <DevolucionesAlmacen />
          </PrivateRoute>
        } />

        <Route path="/reportes-almacen" element={
          <PrivateRoute>
            <ReportesAlmacen />
          </PrivateRoute>
        } />

        <Route path="/guias-remision" element={
          <PrivateRoute>
            <GuiasRemision />
          </PrivateRoute>
        } />
        <Route path="/ordenes-trabajo" element={
          <PrivateRoute>
            <OrdenesTrabajo />
          </PrivateRoute>
        } />

        <Route path="/reportes-ventas" element={
          <PrivateRoute>
            <ReportesVentas />
          </PrivateRoute>
        } />

        <Route path="/precios-promociones" element={
          <PrivateRoute>
            <PreciosPromociones />
          </PrivateRoute>
        } />

        <Route path="/productos" element={
          <PrivateRoute>
            <MaestroProductos />
          </PrivateRoute>
        } />

        <Route path="/gestion-almacenes" element={
          <PrivateRoute>
            <GestionAlmacenes />
          </PrivateRoute>
        } />

        <Route path="/movimientos-inventario" element={
          <PrivateRoute>
            <MovimientosInventario />
          </PrivateRoute>
        } />

        <Route path="/kardex" element={
          <PrivateRoute>
            <Kardex />
          </PrivateRoute>
        } />

        <Route path="/perfil" element={
          <PrivateRoute>
            <Perfil />
          </PrivateRoute>
        } />
        
        <Route path="/contabilidad" element={
          <PrivateRoute>
            <ContabilidadGeneral />
          </PrivateRoute>
        } />

        <Route path="/centros-costos" element={
          <PrivateRoute>
            <CentrosCostos />
          </PrivateRoute>
        } />

        <Route path="/configuracion" element={
          <PrivateRoute>
            <ConfiguracionGeneral />
          </PrivateRoute>
        } />


        <Route path="/facturacion-electronica" element={
          <PrivateRoute>
            <FacturacionElectronica />
          </PrivateRoute>
        } />

        <Route path="/instrucciones-facturacion" element={
          <PrivateRoute>
            <InstruccionesFacturacion />
          </PrivateRoute>
        } />

        <Route path="/registro-ventas" element={
          <PrivateRoute>
            <RegistroVentas />
          </PrivateRoute>
        } />

        <Route path="/registro-compras" element={
          <PrivateRoute>
            <RegistroCompras />
          </PrivateRoute>
        } />

        <Route path="/impuestos" element={
          <PrivateRoute>
            <ImpuestosTributos />
          </PrivateRoute>
        } />

        <Route path="/caja" element={
          <PrivateRoute>
            <Caja />
          </PrivateRoute>
        } />

        <Route path="/bancos" element={
          <PrivateRoute>
            <Bancos />
          </PrivateRoute>
        } />

        <Route path="/cobranzas" element={
          <PrivateRoute>
            <Cobranzas />
          </PrivateRoute>
        } />

        <Route path="/cuentas-pagar" element={
          <PrivateRoute>
            <CuentasPorPagar />
          </PrivateRoute>
        } />

        <Route path="/clientes-proveedores" element={
          <PrivateRoute>
            <ClientesProveedores />
          </PrivateRoute>
        } />

        <Route path="/reportes-financieros" element={
          <PrivateRoute>
            <ReportesFinancieros />
          </PrivateRoute>
        } />

        <Route path="/auditoria" element={
          <PrivateRoute>
            <Auditoria />
          </PrivateRoute>
        } />

        <Route path="/supervision-ventas" element={
          <PrivateRoute>
            <SupervisionVentas />
          </PrivateRoute>
        } />

        <Route path="/supervision-compras" element={
          <PrivateRoute>
            <SupervisionCompras />
          </PrivateRoute>
        } />

        <Route path="/supervision-financiera" element={
          <PrivateRoute>
            <SupervisionFinanciera />
          </PrivateRoute>
        } />

        <Route path="/supervision-inventarios" element={
          <PrivateRoute>
            <SupervisionInventarios />
          </PrivateRoute>
        } />

        <Route path="/supervision-rrhh" element={
          <PrivateRoute>
            <SupervisionRRHH />
          </PrivateRoute>
        } />

        <Route path="/reportes-ejecutivos" element={
          <PrivateRoute>
            <ReportesEjecutivos />
          </PrivateRoute>
        } />

        <Route path="/reportes-logs" element={
          <PrivateRoute>
            <ReportesLogs />
          </PrivateRoute>
        } />

        <Route path="/agenda-corporativa" element={
          <PrivateRoute>
            <AgendaCorporativa />
          </PrivateRoute>
        } />

        <Route path="/conciliacion-bancaria" element={
          <PrivateRoute>
            <ConciliacionBancaria />
          </PrivateRoute>
        } />

        <Route path="/activos-fijos" element={
          <PrivateRoute>
            <ActivosFijos />
          </PrivateRoute>
        } />

        <Route path="/cierre-contable" element={
          <PrivateRoute>
            <CierreContable />
          </PrivateRoute>
        } />

        <Route path="/centro-costos-avanzado" element={
          <PrivateRoute>
            <CentroDeCostosAvanzado />
          </PrivateRoute>
        } />

        <Route path="/portal-empleado" element={
          <PrivateRoute>
            <PortalEmpleado />
          </PrivateRoute>
        } />

        <Route path="/reclutamiento" element={
          <PrivateRoute>
            <Reclutamiento />
          </PrivateRoute>
        } />


        <Route path="/gestion-coordinaciones" element={
          <PrivateRoute>
            <GestionCoordinaciones />
          </PrivateRoute>
        } />

        {/* Catch all para rutas no definidas */}
        <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
