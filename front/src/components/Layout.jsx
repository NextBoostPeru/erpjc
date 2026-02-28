import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Toaster } from 'react-hot-toast';
import Notifications from './Notifications';
import { LogOut, LayoutDashboard, Calculator, Users, FileText, Receipt, Settings, CreditCard, Menu, X, ChevronLeft, ChevronRight, BookOpen, ShoppingCart, DollarSign, Wallet, HandCoins, Briefcase, Landmark, Contact, PieChart, Shield, Clock, Palmtree, Gift, Folder, UserMinus, UserPlus, RotateCcw, Package, BarChart3, Warehouse, ClipboardList, Truck, TrendingUp, ShoppingBag, Activity, HelpCircle, Award, Calendar, Scale, Monitor, CheckCircle, UserCheck } from 'lucide-react';

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user'));
  const [serverModules, setServerModules] = useState([]);
  const rawModulos = JSON.parse(localStorage.getItem('modulos')) || [];

  useEffect(() => {
    const fetchModulesIfEmpty = async () => {
      if (rawModulos.length > 0) return;
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await axios.get(`${API_URL}my_modules.php`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const mods = Array.isArray(res.data) ? res.data : (res.data.modulos || []);
        setServerModules(mods);
        if (mods.length > 0) {
          localStorage.setItem('modulos', JSON.stringify(mods));
        }
      } catch (e) {
        // Silent fallback: no modules fetched
      }
    };
    fetchModulesIfEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseModules = rawModulos.length > 0 ? rawModulos : serverModules;

  const modulos = useMemo(() => {
    return baseModules.map(m => {
      if (m.codigo === 'kardex' && !m.ruta) return { ...m, ruta: '/kardex' };
      if (m.codigo === 'movimientos_inventario' && !m.ruta) return { ...m, ruta: '/movimientos-inventario' };
      if (m.codigo === 'gestion_almacenes' && !m.ruta) return { ...m, ruta: '/gestion-almacenes' };
      if (m.codigo === 'productos' && !m.ruta) return { ...m, ruta: '/productos' };
      if (m.codigo === 'permisos' && (!m.ruta || m.ruta === '/permisos')) return { ...m, ruta: '/gestion-permisos' };
      return m;
    });
  }, [baseModules]);

  // Add Instrucciones for Vendedor
  const isVendedor = user?.rol_nombre?.toLowerCase() === 'vendedor' || 
                     user?.rol?.toLowerCase() === 'vendedor' ||
                     user?.rol_nombre?.toLowerCase() === 'ventas';

  if (isVendedor && !modulos.some(m => m.codigo === 'dashboard_vendedor')) {
      modulos.unshift({
          codigo: 'dashboard_vendedor',
          nombre: 'Dashboard Ventas',
          ruta: '/dashboard-vendedor'
      });
  }

  if (isVendedor && !modulos.some(m => m.codigo === 'instrucciones_facturacion')) {
      modulos.push({
          codigo: 'instrucciones_facturacion',
          nombre: 'Instrucciones',
          ruta: '/instrucciones-facturacion'
      });
  }

  const roleName = user?.rol_nombre ? String(user.rol_nombre).toLowerCase() : '';
  const roleVal = user?.rol ? String(user.rol).toLowerCase() : '';

  // Ensure Órdenes de Trabajo for Gerencia even if localStorage is stale
  const isGerencia = roleName.includes('geren') || 
                     roleName.includes('direc') ||
                     roleVal === 'gerencia' ||
                     roleVal === '2';

  if (isGerencia && !modulos.some(m => m.codigo === 'ordenes_trabajo')) {
      modulos.push({
          codigo: 'ordenes_trabajo',
          nombre: 'Órdenes de Trabajo',
          ruta: '/ordenes-trabajo'
      });
  }

  const isAdmin = roleName.includes('admin') || 
                  roleVal === '1' || 
                  roleVal === 'admin';

  if ((isAdmin || isGerencia) && !modulos.some(m => m.codigo === 'areas')) {
      // Find where to insert it, maybe after users or in configuration
      modulos.push({
          codigo: 'areas',
          nombre: 'Áreas de Ventas',
          ruta: '/areas'
      });
  }

  // Asegurar que Reportes de Ventas esté disponible para Admin y Gerencia
  if ((isAdmin || isGerencia) && !modulos.some(m => m.codigo === 'reportes_ventas')) {
      modulos.push({
          codigo: 'reportes_ventas',
          nombre: 'Reportes de Ventas',
          ruta: '/reportes-ventas'
      });
  }

  if ((isAdmin || isGerencia || isVendedor) && !modulos.some(m => m.codigo === 'acreditaciones')) {
      modulos.push({
          codigo: 'acreditaciones',
          nombre: 'Logos Acreditaciones',
          ruta: '/acreditaciones'
      });
  }

  if (isGerencia && !modulos.some(m => m.codigo === 'dashboard')) {
      modulos.unshift({
          codigo: 'dashboard',
          nombre: 'Dashboard Gerencial',
          ruta: '/dashboard'
      });
  }

  // Ensure Dashboard for RRHH
  const isRRHH = user?.rol_nombre?.toLowerCase() === 'rrhh' || 
                 user?.rol === 'rrhh' || 
                 user?.rol?.toLowerCase() === 'rrhh' ||
                 user?.rol_nombre?.toLowerCase() === 'recursos humanos';
                 
  if (isRRHH && !modulos.some(m => m.codigo === 'dashboard')) {
      modulos.unshift({
          codigo: 'dashboard',
          nombre: 'Dashboard RRHH',
          ruta: '/dashboard'
      });
  }

  // Ensure Dashboard for Contador
  const isContador = user?.rol_nombre?.toLowerCase() === 'contador' || 
                     user?.rol === 'contador' || 
                     user?.rol?.toLowerCase() === 'contador';

  if (isContador && !modulos.some(m => m.codigo === 'dashboard')) {
      modulos.unshift({
          codigo: 'dashboard',
          nombre: 'Dashboard Contable',
          ruta: '/dashboard'
      });
  }

  // Ensure Centros de Costos is available
  if ((isAdmin || isContador || isGerencia) && !modulos.some(m => m.codigo === 'centros_costos')) {
      modulos.push({
          codigo: 'centros_costos',
          nombre: 'Centros de Costos',
          ruta: '/centros-costos'
      });
  }

  // Ensure ISO Module is available
  if ((isAdmin || isGerencia) && !modulos.some(m => m.codigo === 'gestion_iso')) {
      modulos.push({
          codigo: 'gestion_iso',
          nombre: 'Gestión ISO',
          ruta: '/gestion-iso'
      });
  }

  // Ensure Retenciones Module is available
  if ((isAdmin || isContador || isGerencia) && !modulos.some(m => m.codigo === 'retenciones')) {
      modulos.push({
          codigo: 'retenciones',
          nombre: 'Retenciones',
          ruta: '/retenciones'
      });
  }

  // Ensure Gestion Coordinaciones Module is available
  if ((isAdmin || isGerencia) && !modulos.some(m => m.codigo === 'gestion_coordinaciones')) {
      modulos.push({
          codigo: 'gestion_coordinaciones',
          nombre: 'Gestión Coordinaciones',
          ruta: '/gestion-coordinaciones'
      });
  }

  // Filter out 'comprobantes' as per previous request
  const displayModulos = modulos.filter(modulo => modulo.codigo !== 'comprobantes');
  
  // Sidebar states
  const [isCollapsed, setIsCollapsed] = useState(true); // Default closed as requested
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  const [empresa, setEmpresa] = useState({
    nombre: 'Empresa S.A.',
    logo: null
  });

  // Fetch company data
  useEffect(() => {
    const fetchEmpresa = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await axios.get(`${API_URL}empresa.php`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data) {
                const data = response.data;
                const nombre = data.nombre_comercial || data.razon_social || 'Empresa S.A.';
                setEmpresa({
                    nombre,
                    logo: data.logo ? `${API_URL}public_files.php?path=${encodeURIComponent(data.logo)}` : null
                });
            }
        } catch (error) {
            console.error("Error fetching company data:", error);
        }
    };

    fetchEmpresa();
  }, []);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine if sidebar content should be expanded (text visible)
  // Expanded if: (Desktop AND NOT Collapsed) OR (Mobile AND Open)
  const isSidebarExpanded = !isCollapsed || isMobileOpen;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('modulos');
    navigate('/');
  };

  const getIcon = (iconName) => {
    switch(iconName) {
      case 'dashboard': return <LayoutDashboard size={20} />;
      case 'dashboard_gerente': return <LayoutDashboard size={20} />;
      case 'dashboard_vendedor': return <TrendingUp size={20} />;
      case 'contabilidad': return <Calculator size={20} />;
      case 'centros_costos': return <PieChart size={20} />;
      case 'gestion_iso': return <ClipboardList size={20} />;
      case 'usuarios': return <Users size={20} />;
      case 'facturacion': return <Receipt size={20} />;
      case 'facturacion_electronica': return <Receipt size={20} />;
      case 'reportes': return <FileText size={20} />;
      case 'configuracion': return <Settings size={20} />;
      case 'comprobantes': return <CreditCard size={20} />;
      case 'registro_ventas': return <BookOpen size={20} />;
      case 'registro_compras': return <ShoppingCart size={20} />;
      case 'impuestos': return <DollarSign size={20} />;
      case 'caja': return <Wallet size={20} />;
      case 'bancos': return <Landmark size={20} />;
      case 'cobranzas': return <HandCoins size={20} />;
      case 'cuentas_pagar': return <Briefcase size={20} />;
      case 'clientes_proveedores': return <Contact size={20} />;
      case 'reportes_financieros': return <PieChart size={20} />;
      case 'AUDITORIA': return <Shield size={20} />;
      case 'permisos': return <Shield size={20} />;
      case 'gestion_permisos': return <Shield size={20} />;
      case 'gestion-colaboradores': return <Briefcase size={20} />;
      case 'gestion_colaboradores': return <Briefcase size={20} />;
      case 'gestion_contratos': return <FileText size={20} />;
      case 'control_asistencia': return <Clock size={20} />;
      case 'vacaciones_permisos': return <Palmtree size={20} />;
      case 'planillas': return <Calculator size={20} />;
      case 'beneficios': return <Gift size={20} />;
      case 'documentacion': return <Folder size={20} />;
      case 'file-badge': return <Award size={20} />;
      case 'certificados_constancias': return <Award size={20} />;
      case 'boletas_pago': return <Receipt size={20} />;
      case 'papeletas': return <FileText size={20} />;
      case 'ceses': return <UserMinus size={20} />;
      case 'gestion_clientes': return <Users size={20} />;
      case 'crm': return <UserPlus size={20} />;
      case 'cotizaciones': return <FileText size={20} />;
      case 'acreditaciones': return <Award size={20} />;
      case 'devoluciones': return <RotateCcw size={20} />;
      case 'productos': return <Package size={20} />;
      case 'gestion_almacenes': return <Warehouse size={20} />;
      case 'movimientos_inventario': return <ClipboardList size={20} />;
      case 'kardex': return <FileText size={20} />;
      case 'reportes_ventas': return <BarChart3 size={20} />;
      case 'supervision_ventas': return <TrendingUp size={20} />;
      case 'chart-line': return <TrendingUp size={20} />;
      case 'supervision_compras': return <ShoppingBag size={20} />;
      case 'shopping-bag': return <ShoppingBag size={20} />;
      case 'supervision_financiera': return <PieChart size={20} />;
      case 'pie-chart': return <PieChart size={20} />;
      case 'supervision_inventarios': return <ClipboardList size={20} />;
      case 'clipboard-list': return <ClipboardList size={20} />;
      case 'supervision_rrhh': return <Users size={20} />;
      case 'users': return <Users size={20} />;
      case 'guias_remision': return <Truck size={20} />;
      case 'truck': return <Truck size={20} />;
      case 'ordenes_trabajo': return <ClipboardList size={20} />;
      case 'reportes_logs': return <Activity size={20} />;
      case 'activity': return <Activity size={20} />;
      case 'instrucciones_facturacion': return <HelpCircle size={20} />;
      case 'PieChart': return <PieChart size={20} />;
      case 'Calendar': return <Calendar size={20} />;
      case 'Scale': return <Scale size={20} />;
      case 'Monitor': return <Monitor size={20} />;
      case 'CheckCircle': return <CheckCircle size={20} />;
      case 'UserCheck': return <UserCheck size={20} />;
      case 'gestion_iso': return <ClipboardList size={20} />;
      case 'retenciones': return <FileText size={20} />;
      case 'gestion_coordinaciones': return <Briefcase size={20} />;
      case 'Users': return <Users size={20} />;
      default: return <LayoutDashboard size={20} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Toaster position="top-right" />
      {/* Backdrop for Mobile */}
      {isMobileOpen && (
        <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-50 h-full bg-white border-r border-gray-200 shadow-xl md:shadow-none flex flex-col transition-all duration-300 ease-in-out
        w-72
        ${isCollapsed ? 'md:w-20' : 'md:w-72'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className={`h-16 flex items-center ${!isSidebarExpanded ? 'justify-center' : 'justify-between px-6'} border-b border-gray-100 bg-white`}>
          {isSidebarExpanded && (
             <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
               <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${empresa.logo ? '' : 'bg-blue-600 text-white font-bold text-sm'}`}>
                  {empresa.logo ? (
                      <img src={empresa.logo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                      "ERP"
                  )}
               </div>
               <div className="flex flex-col">
                 <h3 className="font-bold text-gray-800 leading-none truncate w-40" title={empresa.nombre}>{empresa.nombre}</h3>
                 <span className="text-xs text-gray-500">Panel de Control</span>
               </div>
             </div>
          )}
          {!isSidebarExpanded && (
             <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${empresa.logo ? '' : 'bg-blue-600 text-white font-bold text-sm'}`}>
                {empresa.logo ? (
                    <img src={empresa.logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                    "ERP"
                )}
             </div>
          )}
          
          {isSidebarExpanded && (
            <button 
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors hidden md:block"
            >
                <ChevronLeft size={20}/>
            </button>
          )}

            <button 
                className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg" 
                onClick={() => setIsMobileOpen(false)}
            >
                <X size={20}/>
            </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 scrollbar-hide">
          {!isSidebarExpanded && (
            <button 
                onClick={() => setIsCollapsed(false)}
                className="w-full flex justify-center p-2 mb-4 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors hidden md:flex"
            >
                <ChevronRight size={20}/>
            </button>
          )}

          {modulos
            .filter(modulo => modulo.codigo !== 'comprobantes')
            .map((modulo) => {
            const isActive = location.pathname.includes(modulo.ruta);
            return (
            <div 
              key={modulo.codigo}
              className={`
                group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 mb-1
                ${isActive 
                    ? 'bg-blue-50 text-blue-600 shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
                ${!isSidebarExpanded ? 'justify-center' : ''}
              `}
              onClick={() => {
                navigate(modulo.ruta);
                setIsMobileOpen(false);
              }}
              title={!isSidebarExpanded ? modulo.nombre : ''}
            >
              <div className={`
                ${isActive ? 'text-blue-600' : 'text-gray-500 group-hover:text-gray-700'}
                transition-colors
              `}>
                {getIcon(modulo.codigo)}
              </div>
              
              {isSidebarExpanded && (
                <span className={`font-medium whitespace-nowrap overflow-hidden text-sm ${isActive ? 'text-blue-700' : ''}`}>
                    {modulo.nombre}
                </span>
              )}
              
              {!isSidebarExpanded && (
                <div className="absolute left-full top-0 ml-2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                    {modulo.nombre}
                </div>
              )}
            </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          {isSidebarExpanded ? (
            <div className="flex items-center gap-3">
                <div 
                    className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold cursor-pointer hover:bg-blue-200 transition-colors"
                    onClick={() => navigate('/perfil')}
                    title="Mi Perfil"
                >
                    {user?.usuario?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate('/perfil')}>
                    <p className="text-sm font-semibold text-gray-900 truncate hover:text-blue-600 transition-colors">{user?.usuario}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.rol_nombre}</p>
                </div>
                <button 
                    onClick={handleLogout} 
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Cerrar Sesión"
                >
                    <LogOut size={18} />
                </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
                <div 
                    className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-blue-200 transition-colors"
                    onClick={() => navigate('/perfil')}
                    title="Mi Perfil"
                >
                    {user?.usuario?.charAt(0).toUpperCase()}
                </div>
                <button 
                    onClick={handleLogout} 
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Cerrar Sesión"
                >
                    <LogOut size={18} />
                </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
                <button 
                    className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg" 
                    onClick={() => setIsMobileOpen(true)}
                >
                    <Menu size={24} />
                </button>
                <span className="font-bold text-lg text-gray-800">ERP</span>
            </div>
            <div className="flex items-center gap-3">
                <Notifications />
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                    {user?.usuario?.charAt(0).toUpperCase()}
                </div>
            </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex bg-white border-b border-gray-200 h-16 items-center justify-end px-6 gap-4 shrink-0">
             <Notifications />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto h-full">
                {children}
            </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
