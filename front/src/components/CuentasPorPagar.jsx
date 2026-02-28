import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Briefcase, Search, Filter, AlertCircle, CheckCircle, 
  Calendar, DollarSign, FileText, ArrowRight, Loader, 
  ChevronDown, ChevronUp, User, X, Clock, History,
  Edit, Trash2, Upload, File
} from 'lucide-react';

const formatCurrency = (amount, currency = 'PEN') => {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(amount);
};

const CuentasPorPagar = () => {
  const [view, setView] = useState('dashboard'); // dashboard, pendientes, reportes, estado_cuenta
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState({ por_pagar: 0, vencido: 0, pagado_mes: 0 });
  const [pendientes, setPendientes] = useState([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos'); // todos, vencido, al_dia
  
  // Modal Pago
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pagoForm, setPagoForm] = useState({
    monto: '',
    medio_pago: 'Efectivo',
    referencia: '',
    origen_id: '',
    observaciones: ''
  });
  
  // Modal Historial
  const [historialModalOpen, setHistorialModalOpen] = useState(false);
  const [historialPagos, setHistorialPagos] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPago, setEditingPago] = useState(null);
  
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [reporteVencimientos, setReporteVencimientos] = useState([]);
  const [estadoCuentaData, setEstadoCuentaData] = useState([]);
  const [proveedorSearch, setProveedorSearch] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    if (view === 'pendientes') fetchPendientes();
    if (view === 'reportes') fetchReporteVencimientos();
    if (view === 'estado_cuenta') fetchEstadoCuenta();
  }, [view]);

  useEffect(() => {
    if (view === 'pendientes') fetchPendientes();
  }, [search, filterEstado]);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${API_URL}/cuentas_pagar.php?action=dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboardData(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPendientes = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/cuentas_pagar.php?action=listar_pendientes&proveedor=${search}&estado_filter=${filterEstado}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendientes(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error('Error al cargar pendientes');
      setPendientes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCuentasBancarias = async () => {
    try {
      const res = await axios.get(`${API_URL}/bancos.php?action=listar_cuentas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCuentasBancarias(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchReporteVencimientos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/cuentas_pagar.php?action=reporte_vencimientos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReporteVencimientos(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error('Error al cargar reporte');
      setReporteVencimientos([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEstadoCuenta = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/cuentas_pagar.php?action=estado_cuenta&doc=${proveedorSearch}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEstadoCuentaData(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error('Error al cargar estado de cuenta');
      setEstadoCuentaData([]);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchHistorialPagos = async (invoiceId) => {
    try {
        const res = await axios.get(`${API_URL}/cuentas_pagar.php?action=historial_pagos&id=${invoiceId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setHistorialPagos(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
        toast.error('Error al cargar historial');
    }
  };

  const handleOpenModal = (invoice) => {
    setSelectedInvoice(invoice);
    setIsEditMode(false);
    setEditingPago(null);
    setPagoForm({
      monto: invoice.saldo_pendiente,
      medio_pago: 'Efectivo',
      referencia: '',
      origen_id: '',
      observaciones: '',
      archivo: null,
    });
    fetchCuentasBancarias();
    setModalOpen(true);
  };

  const handleEditPago = (pago) => {
    setIsEditMode(true);
    setEditingPago(pago);
    // Cerrar modal historial
    setHistorialModalOpen(false);
    
    setPagoForm({
      monto: pago.monto,
      medio_pago: pago.medio_pago,
      referencia: pago.referencia || '',
      origen_id: pago.origen_id || '',
      observaciones: pago.observaciones || '',
      archivo: null // No cargamos el archivo existente al input file
    });
    fetchCuentasBancarias();
    setModalOpen(true);
  };

  const handleDeletePago = async (pagoId) => {
    if (!window.confirm('¿Está seguro de eliminar este pago? Esta acción revertirá los saldos.')) return;
    
    try {
        await axios.post(`${API_URL}/cuentas_pagar.php?action=eliminar_pago&id=${pagoId}`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Pago eliminado correctamente');
        fetchHistorialPagos(selectedInvoice.id);
        fetchPendientes();
        fetchDashboard();
    } catch (error) {
        toast.error('Error al eliminar pago');
        console.error(error);
    }
  };
  
  const handleOpenHistorial = (invoice) => {
      setSelectedInvoice(invoice);
      fetchHistorialPagos(invoice.id);
      setHistorialModalOpen(true);
  };

  const handleRegistrarPago = async (e) => {
    e.preventDefault();
    if (!pagoForm.monto || pagoForm.monto <= 0) return toast.error('Monto inválido');
    
    // Validación de saldo (solo en creación, en edición lo maneja el backend al revertir primero)
    if (!isEditMode && parseFloat(pagoForm.monto) > parseFloat(selectedInvoice.saldo_pendiente)) {
        return toast.error('Monto excede saldo pendiente');
    }

    try {
      const formData = new FormData();
      formData.append('compra_id', selectedInvoice.id);
      formData.append('monto', pagoForm.monto);
      formData.append('medio_pago', pagoForm.medio_pago);
      formData.append('referencia', pagoForm.referencia);
      formData.append('origen_id', pagoForm.origen_id);
      formData.append('observaciones', pagoForm.observaciones);
      
      if (pagoForm.archivo) {
        formData.append('archivo', pagoForm.archivo);
      }

      let url = `${API_URL}/cuentas_pagar.php?action=registrar_pago`;
      
      if (isEditMode) {
        url = `${API_URL}/cuentas_pagar.php?action=editar_pago`;
        formData.append('id', editingPago.id);
      }

      await axios.post(url, formData, {
        headers: { 
            Authorization: `Bearer ${token}`
        }
      });

      toast.success(isEditMode ? 'Pago actualizado' : 'Pago registrado');
      setModalOpen(false);
      fetchPendientes();
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al procesar pago');
    }
  };

  return (
    <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Briefcase size={28} className="text-blue-600" /> 
          <span className="hidden md:inline">Cuentas por Pagar</span>
          <span className="md:hidden">CxP</span>
        </h1>
        <div className="flex flex-wrap gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-200 w-full md:w-auto overflow-x-auto">
          {['dashboard', 'pendientes', 'estado_cuenta', 'reportes'].map((v) => (
             <button 
                key={v}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-md font-medium text-sm transition-all whitespace-nowrap ${view === v ? 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`} 
                onClick={() => setView(v)}
             >
                {v.charAt(0).toUpperCase() + v.slice(1).replace('_', ' ')}
             </button>
          ))}
        </div>
      </div>

      {/* Dashboard View */}
      {view === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 fade-in">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-blue-500 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <DollarSign size={64} />
            </div>
            <div className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Total por Pagar</div>
            <div className="text-3xl font-bold text-gray-800">{formatCurrency(dashboardData.por_pagar)}</div>
            <div className="mt-2 text-xs text-blue-600 font-medium">Deuda total activa</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-red-500 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <AlertCircle size={64} />
            </div>
            <div className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Vencido</div>
            <div className="text-3xl font-bold text-red-600">{formatCurrency(dashboardData.vencido)}</div>
             <div className="mt-2 text-xs text-red-600 font-medium">Requiere atención inmediata</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-green-500 relative overflow-hidden group">
             <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <CheckCircle size={64} />
            </div>
            <div className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Pagado este Mes</div>
            <div className="text-3xl font-bold text-green-600">{formatCurrency(dashboardData.pagado_mes)}</div>
             <div className="mt-2 text-xs text-green-600 font-medium">Flujo de salida actual</div>
          </div>
        </div>
      )}

      {/* Pendientes View */}
      {view === 'pendientes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in flex flex-col h-full">
          <div className="mb-4 flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" 
                  placeholder="Buscar proveedor..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            
            <div className="flex gap-2 w-full md:w-auto">
                 <select 
                    className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                    value={filterEstado}
                    onChange={(e) => setFilterEstado(e.target.value)}
                 >
                     <option value="todos">Todos los estados</option>
                     <option value="vencido">Solo Vencidos</option>
                     <option value="al_dia">Al día</option>
                 </select>
            </div>
          </div>
          
          {loading ? (
            <div className="flex-1 flex justify-center items-center p-12">
                <Loader className="animate-spin text-blue-600" size={32}/>
            </div>
          ) : (
            <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Vencimiento</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Comprobante</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proveedor</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Saldo</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Estado</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {pendientes.map(inv => (
                        <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-4 py-3 text-sm">
                             <div className={`font-medium ${inv.dias_retraso > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                {inv.fecha_vencimiento}
                             </div>
                             <div className="text-xs text-gray-400">
                                {inv.dias_retraso > 0 ? `${inv.dias_retraso} días atraso` : 'Al día'}
                             </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 font-mono text-xs">{inv.serie}-{inv.numero}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={inv.proveedor_razon_social}>
                              {inv.proveedor_razon_social}
                              <div className="text-xs text-gray-400">{inv.proveedor_num_doc}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">{formatCurrency(inv.importe_total, inv.moneda)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-bold text-right">{formatCurrency(inv.saldo_pendiente, inv.moneda)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${inv.dias_retraso > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${inv.dias_retraso > 0 ? 'bg-red-500' : 'bg-green-500'}`}></span>
                              {inv.dias_retraso > 0 ? 'Vencido' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <div className="flex justify-center gap-2">
                                <button 
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Registrar Pago"
                                    onClick={() => handleOpenModal(inv)}
                                >
                                    <DollarSign size={18}/>
                                </button>
                                <button 
                                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Ver Historial"
                                    onClick={() => handleOpenHistorial(inv)}
                                >
                                    <History size={18}/>
                                </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pendientes.length === 0 && <tr><td colSpan="7" className="text-center p-8 text-gray-500 italic">No hay facturas pendientes con estos filtros</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                    {pendientes.map(inv => (
                        <div key={inv.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-sm">{inv.proveedor_razon_social}</h3>
                                    <p className="text-xs text-gray-500">{inv.serie}-{inv.numero}</p>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${inv.dias_retraso > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    {inv.dias_retraso > 0 ? 'Vencido' : 'Al día'}
                                </span>
                            </div>
                            
                            <div className="flex justify-between items-center mb-3 text-sm">
                                <div className="text-gray-500">
                                    <p>Vence: {inv.fecha_vencimiento}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400">Saldo</p>
                                    <p className="font-bold text-gray-900">{formatCurrency(inv.saldo_pendiente, inv.moneda)}</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    className="flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium active:bg-blue-700"
                                    onClick={() => handleOpenModal(inv)}
                                >
                                    <DollarSign size={14}/> Registrar Pago
                                </button>
                                <button 
                                    className="flex items-center justify-center gap-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium active:bg-gray-200"
                                    onClick={() => handleOpenHistorial(inv)}
                                >
                                    <History size={14}/> Historial
                                </button>
                            </div>
                        </div>
                    ))}
                    {pendientes.length === 0 && <div className="text-center p-8 text-gray-500 italic bg-gray-50 rounded-lg border border-dashed border-gray-300">No hay facturas pendientes</div>}
                </div>
            </>
          )}
        </div>
      )}

      {/* Estado de Cuenta View */}
      {view === 'estado_cuenta' && (
         <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in">
           <div className="mb-4 flex gap-2">
             <input 
               type="text" 
               className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm" 
               placeholder="Ingrese RUC del proveedor para ver detalle..." 
               value={proveedorSearch}
               onChange={(e) => setProveedorSearch(e.target.value)}
             />
             <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" onClick={fetchEstadoCuenta}><Search size={18}/></button>
           </div>

           {loading ? <div className="text-center p-8"><Loader className="animate-spin mx-auto text-blue-600"/></div> : (
             <div className="overflow-x-auto rounded-lg border border-gray-200">
               <table className="w-full text-left border-collapse">
                 <thead className="bg-gray-50">
                   <tr>
                     <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Proveedor</th>
                     <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Documento</th>
                     <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Ref</th>
                     <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Total Deuda</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-200 bg-white">
                   {estadoCuentaData.length === 0 ? (
                     <tr><td colSpan="4" className="text-center p-8 text-gray-500 italic">No se encontraron resultados</td></tr>
                   ) : (
                      !proveedorSearch ? estadoCuentaData.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-700 font-medium">{c.proveedor_razon_social}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{c.proveedor_num_doc}</td>
                          <td className="px-4 py-3 text-sm text-gray-400 text-center">-</td>
                          <td className="px-4 py-3 text-sm text-red-600 font-bold text-right">{formatCurrency(c.deuda_total)}</td>
                        </tr>
                      )) : 
                      estadoCuentaData.map(inv => (
                        <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                           <td className="px-4 py-3 text-sm text-gray-700">{inv.proveedor_razon_social}</td>
                           <td className="px-4 py-3 text-sm text-gray-700">{inv.serie}-{inv.numero}</td>
                           <td className="px-4 py-3 text-sm text-gray-500 text-center">{inv.fecha_emision}</td>
                           <td className="px-4 py-3 text-sm text-red-600 text-right font-medium">{formatCurrency(inv.saldo_pendiente, inv.moneda)}</td>
                        </tr>
                      ))
                   )}
                 </tbody>
               </table>
             </div>
           )}
         </div>
      )}

      {/* Reportes View */}
      {view === 'reportes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in">
          <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500"/> Reporte de Vencimientos
          </h4>
          {loading ? <div className="text-center p-8"><Loader className="animate-spin mx-auto text-blue-600"/></div> : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Proveedor</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Facturas Vencidas</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Max Días Atraso</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Total Deuda Vencida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {reporteVencimientos.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700 font-medium">{row.proveedor_razon_social}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.cantidad_facturas}</td>
                      <td className="px-4 py-3 text-sm text-red-600 text-center font-bold">{row.max_dias_atraso}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-bold text-right">{formatCurrency(row.total_deuda)}</td>
                    </tr>
                  ))}
                  {reporteVencimientos.length === 0 && <tr><td colSpan="4" className="text-center p-8 text-gray-500 italic">No hay deudas vencidas</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de Pago */}
      {modalOpen && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
            <div className="flex justify-between items-center p-4 md:p-6 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Registrar Pago</h3>
              <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setModalOpen(false)}>
                <X size={20}/>
              </button>
            </div>
            
            <div className="p-4 md:p-6">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-6 border border-blue-100 flex justify-between items-center">
                <div>
                    <div className="text-xs text-blue-500 uppercase font-bold">Saldo Pendiente</div>
                    <div className="text-lg font-bold">{formatCurrency(selectedInvoice.saldo_pendiente, selectedInvoice.moneda)}</div>
                </div>
                <div className="text-right text-xs">
                    <div>{selectedInvoice.serie}-{selectedInvoice.numero}</div>
                    <div>{selectedInvoice.proveedor_razon_social}</div>
                </div>
              </div>
              
              <form onSubmit={handleRegistrarPago}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Monto a Pagar</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
                        <input 
                        type="number" 
                        step="0.01" 
                        className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                        required
                        value={pagoForm.monto}
                        onChange={(e) => setPagoForm({...pagoForm, monto: e.target.value})}
                        />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Medio de Pago</label>
                    <select 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white" 
                      value={pagoForm.medio_pago}
                      onChange={(e) => setPagoForm({...pagoForm, medio_pago: e.target.value})}
                    >
                      <option value="Efectivo">Efectivo (Caja)</option>
                      <option value="Transferencia">Transferencia Bancaria</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  {pagoForm.medio_pago !== 'Efectivo' && (

                  <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-gray-700">Cuenta Origen</label>
                      <select 
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white" 
                        required
                        value={pagoForm.origen_id}
                        onChange={(e) => setPagoForm({...pagoForm, origen_id: e.target.value})}
                      >
                        <option value="">Seleccione Cuenta...</option>
                        {cuentasBancarias.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre_banco} - {c.numero_cuenta} ({c.moneda})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Referencia (Opcional)</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                      placeholder="Nro Operación / Cheque"
                      value={pagoForm.referencia}
                      onChange={(e) => setPagoForm({...pagoForm, referencia: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Constancia (Opcional)</label>
                    <div className="relative border border-gray-300 rounded-lg p-2 bg-white flex items-center gap-2">
                         <Upload size={20} className="text-gray-400"/>
                         <input 
                           type="file" 
                           className="w-full text-sm text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                           onChange={(e) => setPagoForm({...pagoForm, archivo: e.target.files[0]})}
                           accept="image/*,.pdf"
                         />
                    </div>
                    {isEditMode && editingPago?.archivo_constancia && (
                        <div className="text-xs text-blue-600 flex items-center gap-1">
                            <FileText size={12}/> Archivo actual: <a href={`${API_URL}/${editingPago.archivo_constancia.replace('../', '')}`} target="_blank" rel="noopener noreferrer" className="underline">Ver documento</a>
                        </div>
                    )}
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Observaciones</label>
                    <textarea 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-20" 
                      placeholder="Nota interna..."
                      value={pagoForm.observaciones}
                      onChange={(e) => setPagoForm({...pagoForm, observaciones: e.target.value})}
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" onClick={() => setModalOpen(false)}>Cancelar</button>
                  <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                    {isEditMode ? 'Actualizar Pago' : 'Registrar Pago'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Historial */}
      {historialModalOpen && selectedInvoice && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Historial de Pagos</h3>
                        <p className="text-xs text-gray-500">{selectedInvoice.serie}-{selectedInvoice.numero} | {selectedInvoice.proveedor_razon_social}</p>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setHistorialModalOpen(false)}>
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="p-0 overflow-y-auto flex-1">
                    {historialPagos.length === 0 ? (
                        <div className="text-center p-12 text-gray-500">
                            <History size={48} className="mx-auto mb-2 text-gray-300"/>
                            <p>No hay pagos registrados para esta factura</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Medio</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Ref</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-right">Monto</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Usuario</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {historialPagos.map((pago, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-600">{pago.fecha}</td>
                                        <td className="px-4 py-3 text-sm text-gray-800 font-medium">{pago.medio_pago}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{pago.referencia || '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            {pago.archivo_constancia ? (
                                                <a 
                                                    href={`${API_URL}/${pago.archivo_constancia.replace('../', '')}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800"
                                                    title="Ver constancia"
                                                >
                                                    <FileText size={18} className="mx-auto"/>
                                                </a>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-green-600 font-bold text-right">{formatCurrency(pago.monto)}</td>
                                        <td className="px-4 py-3 text-xs text-gray-400">{pago.usuario}</td>
                                        <td className="px-4 py-3 text-center flex justify-center gap-2">
                                            <button 
                                                onClick={() => handleEditPago(pago)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                title="Editar"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeletePago(pago.id)}
                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                <div className="p-4 border-t border-gray-100 bg-gray-50 text-right">
                    <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium" onClick={() => setHistorialModalOpen(false)}>Cerrar</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default CuentasPorPagar;
