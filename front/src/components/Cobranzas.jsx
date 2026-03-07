import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { API_URL } from '../api/config';
import toast, { Toaster } from 'react-hot-toast';
import { 
  HandCoins, Search, Filter, AlertCircle, CheckCircle, 
  Calendar, DollarSign, FileText, ArrowRight, Loader, 
  ChevronDown, ChevronUp, User, X, History, Clock, Edit, Trash2, Upload, FileSpreadsheet
} from 'lucide-react';

const formatCurrency = (amount, currency = 'PEN') => {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(amount);
};

const Cobranzas = () => {
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState({ por_cobrar: 0, vencido: 0, cobrado_mes: 0 });
  
  // Pendientes states
  const [pendientes, setPendientes] = useState([]);
  const [pendPage, setPendPage] = useState(1);
  const [pendTotalPages, setPendTotalPages] = useState(1);
  const [pendTotalItems, setPendTotalItems] = useState(0);
  const pendLimit = 20;
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');

  const [transacciones, setTransacciones] = useState([]);
  const [transPage, setTransPage] = useState(1);
  const [transTotalPages, setTransTotalPages] = useState(1);
  const [transTotalItems, setTransTotalItems] = useState(0);
  const transLimit = 20;
  const [transSearchCliente, setTransSearchCliente] = useState('');
  const [transMedioPago, setTransMedioPago] = useState('todos');
  const [transFechaDesde, setTransFechaDesde] = useState('');
  const [transFechaHasta, setTransFechaHasta] = useState('');
  
  // Modal states
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [historialModalOpen, setHistorialModalOpen] = useState(false);
  const [historialPagos, setHistorialPagos] = useState([]);
  const [exporting, setExporting] = useState(false);

  const [pagoForm, setPagoForm] = useState({
    monto: '',
    medio_pago: 'Efectivo',
    referencia: '',
    destino_id: '',
    observaciones: ''
  });
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPago, setEditingPago] = useState(null);
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [reporteMorosidad, setReporteMorosidad] = useState([]);
  const [estadoCuentaData, setEstadoCuentaData] = useState([]);
  const [clienteSearch, setClienteSearch] = useState('');

  const [estadoPage, setEstadoPage] = useState(1);
  const [estadoTotalPages, setEstadoTotalPages] = useState(1);
  const [estadoTotalItems, setEstadoTotalItems] = useState(0);
  const estadoLimit = 20;

  const [reportePage, setReportePage] = useState(1);
  const [reporteTotalPages, setReporteTotalPages] = useState(1);
  const [reporteTotalItems, setReporteTotalItems] = useState(0);
  const reporteLimit = 20;

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    if (view === 'pendientes') fetchPendientes();
    if (view === 'transacciones') fetchTransacciones();
    if (view === 'reportes') fetchReporteMorosidad();
    if (view === 'estado_cuenta') fetchEstadoCuenta();
  }, [view]);

  useEffect(() => {
    if (view === 'pendientes') {
      setPendPage(1);
      fetchPendientes(1);
    }
  }, [search, filterEstado]);

  useEffect(() => {
    if (view === 'transacciones') {
      setTransPage(1);
      fetchTransacciones(1);
    }
  }, [transSearchCliente, transMedioPago, transFechaDesde, transFechaHasta]);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${API_URL}/cobranzas.php?action=dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboardData(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPendientes = async (page = pendPage) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/cobranzas.php`, {
        params: {
          action: 'listar_pendientes',
          cliente: search,
          estado_filter: filterEstado,
          page,
          limit: pendLimit,
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.pagination) {
        const rows = res.data.data || [];
        const total = res.data.pagination.total || rows.length;
        const totalPages = res.data.pagination.total_pages || Math.max(1, Math.ceil(total / pendLimit));
        setPendientes(rows);
        setPendTotalPages(totalPages);
        setPendPage(res.data.pagination.page || page);
        setPendTotalItems(total);
      } else {
        const all = Array.isArray(res.data) ? res.data : [];
        const total = all.length;
        const totalPages = Math.max(1, Math.ceil(total / pendLimit));
        const safePage = Math.min(Math.max(page, 1), totalPages);
        const start = (safePage - 1) * pendLimit;
        const end = start + pendLimit;
        setPendientes(all.slice(start, end));
        setPendTotalPages(totalPages);
        setPendPage(safePage);
        setPendTotalItems(total);
      }
    } catch (error) {
      toast.error('Error al cargar pendientes');
      setPendientes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransacciones = async (page = transPage) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/cobranzas.php`, {
        params: {
          action: 'listar_pagos',
          cliente: transSearchCliente,
          medio_pago: transMedioPago,
          fecha_desde: transFechaDesde,
          fecha_hasta: transFechaHasta,
          page,
          limit: transLimit
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.pagination) {
        const rows = res.data.data || [];
        const total = res.data.pagination.total || rows.length;
        const totalPages = res.data.pagination.total_pages || Math.max(1, Math.ceil(total / transLimit));
        setTransacciones(rows);
        setTransTotalPages(totalPages);
        setTransPage(res.data.pagination.page || page);
        setTransTotalItems(total);
      } else {
        const all = Array.isArray(res.data) ? res.data : [];
        const total = all.length;
        const totalPages = Math.max(1, Math.ceil(total / transLimit));
        const safePage = Math.min(Math.max(page, 1), totalPages);
        const start = (safePage - 1) * transLimit;
        const end = start + transLimit;
        setTransacciones(all.slice(start, end));
        setTransTotalPages(totalPages);
        setTransPage(safePage);
        setTransTotalItems(total);
      }
    } catch (error) {
      toast.error('Error al cargar transacciones');
      setTransacciones([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCuentasBancarias = async () => {
    try {
      const res = await axios.get(`${API_URL}/bancos.php?action=listar_cuentas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCuentasBancarias(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchReporteMorosidad = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/cobranzas.php`, {
        params: {
          action: 'reporte_morosidad',
          page: reportePage,
          limit: reporteLimit
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.pagination) {
        const rows = res.data.data || [];
        const total = res.data.pagination.total || rows.length;
        const totalPages = res.data.pagination.total_pages || Math.max(1, Math.ceil(total / reporteLimit));
        setReporteMorosidad(rows);
        setReporteTotalPages(totalPages);
        setReportePage(res.data.pagination.page || reportePage);
        setReporteTotalItems(total);
      } else {
        const all = Array.isArray(res.data) ? res.data : [];
        const total = all.length;
        const totalPages = Math.max(1, Math.ceil(total / reporteLimit));
        const safePage = Math.min(Math.max(reportePage, 1), totalPages);
        const start = (safePage - 1) * reporteLimit;
        const end = start + reporteLimit;
        setReporteMorosidad(all.slice(start, end));
        setReporteTotalPages(totalPages);
        setReportePage(safePage);
        setReporteTotalItems(total);
      }
    } catch (error) {
      toast.error('Error al cargar reporte');
      setReporteMorosidad([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEstadoCuenta = async (page = estadoPage) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/cobranzas.php`, {
        params: {
          action: 'estado_cuenta',
          doc: clienteSearch,
          page,
          limit: estadoLimit
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.pagination) {
        const rows = res.data.data || [];
        const total = res.data.pagination.total || rows.length;
        const totalPages = res.data.pagination.total_pages || Math.max(1, Math.ceil(total / estadoLimit));
        setEstadoCuentaData(rows);
        setEstadoTotalPages(totalPages);
        setEstadoPage(res.data.pagination.page || page);
        setEstadoTotalItems(total);
      } else {
        const all = Array.isArray(res.data) ? res.data : [];
        const total = all.length;
        const totalPages = Math.max(1, Math.ceil(total / estadoLimit));
        const safePage = Math.min(Math.max(page, 1), totalPages);
        const start = (safePage - 1) * estadoLimit;
        const end = start + estadoLimit;
        setEstadoCuentaData(all.slice(start, end));
        setEstadoTotalPages(totalPages);
        setEstadoPage(safePage);
        setEstadoTotalItems(total);
      }
    } catch (error) {
      toast.error('Error al cargar estado de cuenta');
      setEstadoCuentaData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistorialPagos = async (invoiceId) => {
    try {
        const res = await axios.get(`${API_URL}/cobranzas.php?action=historial_pagos&id=${invoiceId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setHistorialPagos(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
        toast.error('Error al cargar historial');
        setHistorialPagos([]);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      let data = [];
      let sheetName = 'Export';

      const fetchAllPages = async (params) => {
        const limit = 500;
        let page = 1;
        let out = [];
        while (true) {
          const res = await axios.get(`${API_URL}/cobranzas.php`, {
            params: { ...params, page, limit },
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.data && res.data.pagination) {
            const rows = res.data.data || [];
            out = out.concat(rows);
            const totalPages = res.data.pagination.total_pages || 1;
            if (page >= totalPages) break;
            page += 1;
          } else {
            const all = Array.isArray(res.data) ? res.data : [];
            out = all;
            break;
          }
        }
        return out;
      };

      if (view === 'pendientes') {
        sheetName = 'Pendientes';
        const rows = await fetchAllPages({
          action: 'listar_pendientes',
          cliente: search,
          estado_filter: filterEstado
        });
        data = rows.map(inv => ({
          Vencimiento: inv.fecha_vencimiento,
          Comprobante: `${inv.serie}-${inv.correlativo}`,
          Cliente: inv.cliente_razon_social,
          Total: inv.total_importe,
          Saldo: inv.saldo_pendiente,
          Moneda: inv.moneda,
          Estado: inv.dias_retraso > 0 ? 'Vencido' : 'Pendiente',
          DiasAtraso: inv.dias_retraso || 0
        }));
      } else if (view === 'transacciones') {
        sheetName = 'Transacciones';
        const rows = await fetchAllPages({
          action: 'listar_pagos',
          cliente: transSearchCliente,
          medio_pago: transMedioPago,
          fecha_desde: transFechaDesde,
          fecha_hasta: transFechaHasta
        });
        data = rows.map(pago => ({
          Fecha: pago.fecha,
          Comprobante: `${pago.serie}-${pago.correlativo}`,
          Cliente: pago.cliente_razon_social,
          Medio: pago.medio_pago,
          Referencia: pago.referencia || '',
          Monto: pago.monto,
          Moneda: pago.moneda
        }));
      } else if (view === 'estado_cuenta') {
        sheetName = 'EstadoCuenta';
        const rows = await fetchAllPages({
          action: 'estado_cuenta',
          doc: clienteSearch
        });
        if (!clienteSearch) {
          data = rows.map(c => ({
            Cliente: c.cliente_razon_social,
            Documento: c.cliente_num_doc,
            DeudaTotal: c.deuda_total
          }));
        } else {
          data = rows.map(inv => ({
            Cliente: inv.cliente_razon_social,
            Comprobante: `${inv.serie}-${inv.correlativo}`,
            Emision: inv.fecha_emision,
            SaldoPendiente: inv.saldo_pendiente,
            Moneda: inv.moneda
          }));
        }
      } else if (view === 'reportes') {
        sheetName = 'Morosidad';
        const rows = await fetchAllPages({
          action: 'reporte_morosidad'
        });
        data = rows.map(row => ({
          Cliente: row.cliente_razon_social,
          FacturasVencidas: row.cantidad_facturas,
          MaxDiasAtraso: row.max_dias_atraso,
          TotalDeudaVencida: row.total_deuda
        }));
      }

      if (data.length === 0) {
        if (view === 'pendientes' && pendientes.length > 0) {
          sheetName = 'Pendientes';
          data = pendientes.map(inv => ({
            Vencimiento: inv.fecha_vencimiento,
            Comprobante: `${inv.serie}-${inv.correlativo}`,
            Cliente: inv.cliente_razon_social,
            Total: inv.total_importe,
            Saldo: inv.saldo_pendiente,
            Moneda: inv.moneda,
            Estado: inv.dias_retraso > 0 ? 'Vencido' : 'Pendiente',
            DiasAtraso: inv.dias_retraso || 0
          }));
        } else if (view === 'transacciones' && transacciones.length > 0) {
          sheetName = 'Transacciones';
          data = transacciones.map(pago => ({
            Fecha: pago.fecha,
            Comprobante: `${pago.serie}-${pago.correlativo}`,
            Cliente: pago.cliente_razon_social,
            Medio: pago.medio_pago,
            Referencia: pago.referencia || '',
            Monto: pago.monto,
            Moneda: pago.moneda
          }));
        } else if (view === 'estado_cuenta' && estadoCuentaData.length > 0) {
          sheetName = 'EstadoCuenta';
          if (!clienteSearch) {
            data = estadoCuentaData.map(c => ({
              Cliente: c.cliente_razon_social,
              Documento: c.cliente_num_doc,
              DeudaTotal: c.deuda_total
            }));
          } else {
            data = estadoCuentaData.map(inv => ({
              Cliente: inv.cliente_razon_social,
              Comprobante: `${inv.serie}-${inv.correlativo}`,
              Emision: inv.fecha_emision,
              SaldoPendiente: inv.saldo_pendiente,
              Moneda: inv.moneda
            }));
          }
        } else if (view === 'reportes' && reporteMorosidad.length > 0) {
          sheetName = 'Morosidad';
          data = reporteMorosidad.map(row => ({
            Cliente: row.cliente_razon_social,
            FacturasVencidas: row.cantidad_facturas,
            MaxDiasAtraso: row.max_dias_atraso,
            TotalDeudaVencida: row.total_deuda
          }));
        }
      }

      if (data.length === 0) {
        toast.error('No hay registros para exportar con los filtros actuales');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `CuentasPorCobrar_${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      toast.error('No se pudo exportar');
    } finally {
      setExporting(false);
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
      destino_id: '',
      observaciones: ''
    });
    fetchCuentasBancarias();
    setModalOpen(true);
  };

  const handleOpenHistorial = (invoice) => {
    setSelectedInvoice(invoice);
    fetchHistorialPagos(invoice.id);
    setHistorialModalOpen(true);
  };

  const handleEditPago = (pago) => {
    setIsEditMode(true);
    setEditingPago(pago);
    setHistorialModalOpen(false);
    
    setPagoForm({
      monto: pago.monto,
      medio_pago: pago.medio_pago,
      referencia: pago.referencia || '',
      destino_id: pago.destino_id || '', 
      observaciones: pago.observaciones || '',
      archivo: null
    });
    fetchCuentasBancarias();
    setModalOpen(true);
  };

  const handleDeletePago = async (pagoId) => {
    if (!window.confirm('¿Está seguro de eliminar este cobro? Esta acción revertirá los saldos.')) return;
    
    try {
        await axios.post(`${API_URL}/cobranzas.php?action=eliminar_pago&id=${pagoId}`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Cobro eliminado correctamente');
        if (selectedInvoice) {
            fetchHistorialPagos(selectedInvoice.id);
            if (view === 'pendientes') fetchPendientes();
            fetchDashboard();
        }
    } catch (error) {
        toast.error('Error al eliminar cobro');
        console.error(error);
    }
  };

  const handleRegistrarPago = async (e) => {
    e.preventDefault();
    if (!pagoForm.monto || parseFloat(pagoForm.monto) <= 0) return toast.error('Monto inválido');
    
    // En edición, validamos en backend. En creación, validamos aquí.
    if (!isEditMode && parseFloat(pagoForm.monto) > parseFloat(selectedInvoice.saldo_pendiente)) return toast.error('Monto excede saldo');

    try {
      const formData = new FormData();
      formData.append('comprobante_id', selectedInvoice.id);
      formData.append('monto', pagoForm.monto);
      formData.append('medio_pago', pagoForm.medio_pago);
      formData.append('referencia', pagoForm.referencia);
      formData.append('destino_id', pagoForm.destino_id);
      formData.append('observaciones', pagoForm.observaciones);
      
      if (pagoForm.archivo) {
        formData.append('archivo', pagoForm.archivo);
      }

      let url = `${API_URL}/cobranzas.php?action=registrar_pago`;
      if (isEditMode) {
        url = `${API_URL}/cobranzas.php?action=editar_pago`;
        formData.append('id', editingPago.id);
      }

      await axios.post(url, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(isEditMode ? 'Cobro actualizado' : 'Cobro registrado');
      setModalOpen(false);
      fetchPendientes();
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al procesar el cobro');
    }
  };

  return (
    <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             <HandCoins className="w-8 h-8 text-blue-600" /> Cuentas por Cobrar
           </h2>
           <p className="text-gray-500 text-sm mt-1">Gestión de cobros y estados de cuenta de clientes</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto bg-white p-1 rounded-lg shadow-sm border border-gray-200">
          <button 
            type="button" 
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button 
            type="button" 
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-all ${view === 'pendientes' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setView('pendientes')}
          >
            Pendientes
          </button>
          <button 
            type="button" 
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-all ${view === 'transacciones' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setView('transacciones')}
          >
            Transacciones
          </button>
          <button 
            type="button" 
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-all ${view === 'estado_cuenta' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setView('estado_cuenta')}
          >
            Estado Cuenta
          </button>
          <button 
            type="button" 
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-all ${view === 'reportes' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setView('reportes')}
          >
            Reportes
          </button>
          <button
            type="button"
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-all ${exporting ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'} text-white shadow-sm flex items-center gap-2 disabled:opacity-60`}
            onClick={handleExportExcel}
            disabled={exporting}
          >
            {exporting ? <Loader className="animate-spin" size={16}/> : <FileSpreadsheet size={16}/>} {exporting ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </div>

      {view === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 fade-in">
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
                <div className="text-gray-500 text-xs uppercase tracking-wider font-bold">Total por Cobrar</div>
                <DollarSign className="text-blue-200" size={20}/>
            </div>
            <div className="text-3xl font-bold text-gray-800">{formatCurrency(dashboardData.por_cobrar)}</div>
            <div className="text-xs text-blue-600 mt-1 font-medium">Deuda total activa</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
                <div className="text-gray-500 text-xs uppercase tracking-wider font-bold">Vencido</div>
                <AlertCircle className="text-red-200" size={20}/>
            </div>
            <div className="text-3xl font-bold text-gray-800">{formatCurrency(dashboardData.vencido)}</div>
            <div className="text-xs text-red-600 mt-1 font-medium">Requiere gestión inmediata</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
                <div className="text-gray-500 text-xs uppercase tracking-wider font-bold">Cobrado este Mes</div>
                <CheckCircle className="text-green-200" size={20}/>
            </div>
            <div className="text-3xl font-bold text-gray-800">{formatCurrency(dashboardData.cobrado_mes)}</div>
            <div className="text-xs text-green-600 mt-1 font-medium">Ingresos del periodo</div>
          </div>
        </div>
      )}

      {view === 'pendientes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in flex flex-col h-full">
          <div className="mb-4 flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all" 
                  placeholder="Buscar cliente, RUC..." 
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
             <div className="flex justify-center items-center py-20">
               <Loader className="w-10 h-10 text-blue-600 animate-spin"/>
             </div>
          ) : (
            <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Vencimiento</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Comprobante</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Total</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Saldo</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {pendientes.length === 0 ? (
                         <tr>
                           <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                             <div className="flex flex-col items-center justify-center">
                               <FileText size={48} className="text-gray-300 mb-2"/>
                               <p>No se encontraron facturas pendientes</p>
                             </div>
                           </td>
                         </tr>
                      ) : (
                        pendientes.map(inv => (
                          <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className={`text-sm font-medium ${inv.dias_retraso > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                  {inv.fecha_vencimiento}
                              </div>
                              {inv.dias_retraso > 0 ? (
                                  <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                                      <Clock size={12}/> {inv.dias_retraso} días
                                  </span>
                              ) : (
                                  <span className="text-xs text-green-600">Al día</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                {inv.serie}-{inv.correlativo}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={inv.cliente_razon_social}>
                                {inv.cliente_razon_social}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                {formatCurrency(inv.total_importe, inv.moneda)}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                                {formatCurrency(inv.saldo_pendiente, inv.moneda)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${inv.dias_retraso > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                {inv.dias_retraso > 0 ? 'Vencido' : 'Pendiente'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <div className="flex justify-center gap-2">
                                  <button 
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Registrar Cobro"
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {pendientes.length === 0 ? (
                     <div className="text-center p-8 bg-gray-50 rounded-lg text-gray-500">
                         No hay facturas pendientes
                     </div>
                  ) : (
                     pendientes.map(inv => (
                        <div key={inv.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                          <div className="flex justify-between items-start mb-2">
                              <div>
                                  <span className="text-xs font-bold text-gray-500 block">FACTURA</span>
                                  <span className="font-bold text-gray-800">{inv.serie}-{inv.correlativo}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${inv.dias_retraso > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                  {inv.dias_retraso > 0 ? 'Vencido' : 'Al día'}
                              </span>
                          </div>
                          
                          <div className="mb-3">
                              <p className="text-sm text-gray-700 font-medium line-clamp-1">{inv.cliente_razon_social}</p>
                              <p className="text-xs text-gray-500">Vence: {inv.fecha_vencimiento}</p>
                          </div>
                          
                          <div className="flex justify-between items-center mb-3 p-2 bg-gray-50 rounded">
                              <div className="text-xs text-gray-500">Saldo Pendiente</div>
                              <div className="text-lg font-bold text-blue-700">{formatCurrency(inv.saldo_pendiente, inv.moneda)}</div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                              <button 
                                  className="flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium active:bg-blue-700"
                                  onClick={() => handleOpenModal(inv)}
                              >
                                  <DollarSign size={14}/> Cobrar
                              </button>
                              <button 
                                  className="flex items-center justify-center gap-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium active:bg-gray-200"
                                  onClick={() => handleOpenHistorial(inv)}
                              >
                                  <History size={14}/> Historial
                              </button>
                          </div>
                        </div>
                     ))
                  )}
                </div>

                {/* Pagination */}
                <div className="mt-4 pt-4 border-t flex flex-col md:flex-row items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">
                    {pendTotalItems > 0
                      ? `Mostrando ${(pendPage - 1) * pendLimit + 1}–${Math.min(pendPage * pendLimit, pendTotalItems)} de ${pendTotalItems} facturas`
                      : 'Sin resultados'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => pendPage > 1 && fetchPendientes(pendPage - 1)}
                      disabled={pendPage === 1}
                      className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 flex items-center gap-1 hover:bg-gray-50"
                    >
                      <span>Anterior</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => pendPage < pendTotalPages && fetchPendientes(pendPage + 1)}
                      disabled={pendPage === pendTotalPages}
                      className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 flex items-center gap-1 hover:bg-gray-50"
                    >
                      <span>Siguiente</span>
                    </button>
                  </div>
                </div>
            </>
          )}
        </div>
      )}

      {view === 'transacciones' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in flex flex-col h-full">
          <div className="mb-4 flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all" 
                placeholder="Buscar cliente, RUC..." 
                value={transSearchCliente}
                onChange={(e) => setTransSearchCliente(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <select
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                value={transMedioPago}
                onChange={(e) => setTransMedioPago(e.target.value)}
              >
                <option value="todos">Todos los medios</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Cheque">Cheque</option>
                <option value="Deposito">Depósito</option>
              </select>
              <input
                type="date"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                value={transFechaDesde}
                onChange={(e) => setTransFechaDesde(e.target.value)}
              />
              <input
                type="date"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                value={transFechaHasta}
                onChange={(e) => setTransFechaHasta(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Comprobante</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Medio</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Referencia</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Monto</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Constancia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {transacciones.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                          <div className="flex flex-col items-center justify-center">
                            <FileText size={48} className="text-gray-300 mb-2" />
                            <p>No se encontraron cobros registrados</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      transacciones.map(pago => (
                        <tr key={pago.id} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                            {pago.fecha}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">
                            {pago.serie}-{pago.correlativo}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={pago.cliente_razon_social}>
                            {pago.cliente_razon_social}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                            {pago.medio_pago}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={pago.referencia || ''}>
                            {pago.referencia || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-green-700 text-right whitespace-nowrap">
                            {formatCurrency(pago.monto, pago.moneda)}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {pago.archivo_constancia ? (
                              <a
                                href={`${API_URL}/${pago.archivo_constancia.replace('../', '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800"
                              >
                                <FileText size={18} />
                              </a>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {transacciones.length === 0 ? (
                  <div className="text-center p-8 bg-gray-50 rounded-lg text-gray-500">
                    No hay cobros registrados
                  </div>
                ) : (
                  transacciones.map(pago => (
                    <div key={pago.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-xs font-bold text-gray-500 block">COBRO</span>
                          <span className="font-bold text-gray-800">{pago.serie}-{pago.correlativo}</span>
                        </div>
                        <span className="text-xs text-gray-500">{pago.fecha}</span>
                      </div>
                      <div className="mb-2">
                        <p className="text-sm text-gray-700 font-medium line-clamp-1">{pago.cliente_razon_social}</p>
                        <p className="text-xs text-gray-500">{pago.medio_pago} · {pago.referencia || 'Sin referencia'}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-500">Monto cobrado</div>
                        <div className="text-lg font-bold text-green-700">{formatCurrency(pago.monto, pago.moneda)}</div>
                      </div>
                      {pago.archivo_constancia && (
                        <div className="mt-2">
                          <a
                            href={`${API_URL}/${pago.archivo_constancia.replace('../', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <FileText size={14} /> Ver constancia
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 pt-4 border-t flex flex-col md:flex-row items-center justify-between gap-3">
                <span className="text-sm text-gray-500">
                  {transTotalItems > 0
                    ? `Mostrando ${(transPage - 1) * transLimit + 1}–${Math.min(transPage * transLimit, transTotalItems)} de ${transTotalItems} cobros`
                    : 'Sin resultados'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => transPage > 1 && fetchTransacciones(transPage - 1)}
                    disabled={transPage === 1}
                    className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 flex items-center gap-1 hover:bg-gray-50"
                  >
                    <span>Anterior</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => transPage < transTotalPages && fetchTransacciones(transPage + 1)}
                    disabled={transPage === transTotalPages}
                    className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 flex items-center gap-1 hover:bg-gray-50"
                  >
                    <span>Siguiente</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {view === 'estado_cuenta' && (
         <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 fade-in">
           <div className="mb-6 flex flex-col md:flex-row gap-2">
             <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                  placeholder="Ingrese DNI/RUC del cliente..." 
                  value={clienteSearch}
                  onChange={(e) => setClienteSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchEstadoCuenta(1)}
                />
             </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors" onClick={() => { setEstadoPage(1); fetchEstadoCuenta(1); }}>
               <Search size={18}/> Buscar
             </button>
           </div>

           {loading ? (
              <div className="flex justify-center p-12">
                <Loader className="w-8 h-8 text-blue-600 animate-spin"/>
              </div>
           ) : (
             <div className="overflow-x-auto rounded-lg border border-gray-200">
               <table className="min-w-full divide-y divide-gray-200">
                 <thead className="bg-gray-50">
                   <tr>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalle</th>
                     <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Deuda Total</th>
                   </tr>
                 </thead>
                 <tbody className="bg-white divide-y divide-gray-200">
                   {estadoCuentaData.length === 0 ? (
                     <tr><td colSpan="4" className="px-6 py-12 text-center text-gray-500">Ingrese un documento para buscar o vea el resumen general</td></tr>
                   ) : (
                      // Si es lista general (resumen)
                      !clienteSearch ? estadoCuentaData.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{c.cliente_razon_social}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.cliente_num_doc}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">-</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold text-right">{formatCurrency(c.deuda_total)}</td>
                        </tr>
                      )) : 
                      // Si es detalle de cliente
                      estadoCuentaData.map(inv => (
                        <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{inv.cliente_razon_social}</td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{inv.serie}-{inv.correlativo}</td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Emisión: {inv.fecha_emision}</td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold text-right">{formatCurrency(inv.saldo_pendiente, inv.moneda)}</td>
                        </tr>
                      ))
                   )}
                 </tbody>
               </table>
             </div>
           )}
         </div>
      )}

      {view === 'reportes' && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 fade-in">
          <div className="flex items-center gap-2 mb-6">
              <FileText className="text-blue-600" size={24}/>
              <h4 className="text-xl font-bold text-gray-800">Reporte de Morosidad</h4>
          </div>
          
          {loading ? (
             <div className="flex justify-center p-12">
               <Loader className="w-8 h-8 text-blue-600 animate-spin"/>
             </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Facturas Vencidas</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Max Días Atraso</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Deuda Vencida</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reporteMorosidad.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.cliente_razon_social}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">{row.cantidad_facturas}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold text-center">{row.max_dias_atraso}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">{formatCurrency(row.total_deuda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 pt-4 border-t flex flex-col md:flex-row items-center justify-between gap-3">
            <span className="text-sm text-gray-500">
              {estadoTotalItems > 0
                ? `Mostrando ${(estadoPage - 1) * estadoLimit + 1}–${Math.min(estadoPage * estadoLimit, estadoTotalItems)} de ${estadoTotalItems} registros`
                : 'Sin resultados'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => estadoPage > 1 && fetchEstadoCuenta(estadoPage - 1)}
                disabled={estadoPage === 1}
                className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 flex items-center gap-1 hover:bg-gray-50"
              >
                <span>Anterior</span>
              </button>
              <button
                type="button"
                onClick={() => estadoPage < estadoTotalPages && fetchEstadoCuenta(estadoPage + 1)}
                disabled={estadoPage === estadoTotalPages}
                className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 flex items-center gap-1 hover:bg-gray-50"
              >
                <span>Siguiente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cobro */}
      {modalOpen && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">{isEditMode ? 'Editar Cobro' : 'Registrar Cobro'}</h3>
              <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setModalOpen(false)}>
                <X size={20}/>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Factura</p>
                        <p className="text-lg font-bold text-blue-900">{selectedInvoice.serie}-{selectedInvoice.correlativo}</p>
                        <p className="text-sm text-blue-700">{selectedInvoice.cliente_razon_social}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Saldo Pendiente</p>
                        <p className="text-2xl font-bold text-blue-900">{formatCurrency(selectedInvoice.saldo_pendiente, selectedInvoice.moneda)}</p>
                    </div>
                </div>
              </div>
              
              <form onSubmit={handleRegistrarPago}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto a Cobrar</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors" 
                          required
                          value={pagoForm.monto}
                          onChange={(e) => setPagoForm({...pagoForm, monto: e.target.value})}
                        />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medio de Pago</label>
                    <select 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors" 
                      value={pagoForm.medio_pago}
                      onChange={(e) => setPagoForm({...pagoForm, medio_pago: e.target.value})}
                    >
                      <option value="Efectivo">Efectivo</option>
                      <option value="Transferencia">Transferencia Bancaria</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Deposito">Depósito</option>
                    </select>
                  </div>

                  {pagoForm.medio_pago !== 'Efectivo' && (
                    <div className="form-group md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Destino</label>
                      <select 
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                        required
                        value={pagoForm.destino_id}
                        onChange={(e) => setPagoForm({...pagoForm, destino_id: e.target.value})}
                      >
                        <option value="">Seleccione cuenta...</option>
                        {cuentasBancarias.map(cuenta => (
                          <option key={cuenta.id} value={cuenta.id}>
                            {cuenta.banco} - {cuenta.numero_cuenta} ({cuenta.moneda})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Referencia / Nro Operación</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors" 
                      placeholder="Ej: OP-123456"
                      value={pagoForm.referencia}
                      onChange={(e) => setPagoForm({...pagoForm, referencia: e.target.value})}
                    />
                  </div>
                  
                  <div className="form-group md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Constancia (Opcional)</label>
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
                        <div className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                            <FileText size={12}/> Archivo actual: <a href={`${API_URL}/${editingPago.archivo_constancia.replace('../', '')}`} target="_blank" rel="noopener noreferrer" className="underline">Ver documento</a>
                        </div>
                    )}
                  </div>
                  
                  <div className="form-group md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                    <textarea 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors" 
                      rows="2"
                      placeholder="Notas adicionales..."
                      value={pagoForm.observaciones}
                      onChange={(e) => setPagoForm({...pagoForm, observaciones: e.target.value})}
                    ></textarea>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button 
                        type="button"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                        onClick={() => setModalOpen(false)}
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit"
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                    >
                        {isEditMode ? 'Actualizar Cobro' : 'Registrar Cobro'}
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
                        <h3 className="text-lg font-bold text-gray-800">Historial de Cobros</h3>
                        <p className="text-xs text-gray-500">{selectedInvoice.serie}-{selectedInvoice.correlativo} | {selectedInvoice.cliente_razon_social}</p>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setHistorialModalOpen(false)}>
                        <X size={20}/>
                    </button>
                </div>

                <div className="p-0 overflow-y-auto flex-1">
                    {historialPagos.length === 0 ? (
                        <div className="text-center p-12 text-gray-500">
                            <History size={48} className="mx-auto mb-2 text-gray-300"/>
                            <p>No hay cobros registrados para esta factura</p>
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
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {pago.referencia || '-'}
                                            {pago.archivo_constancia && (
                                                <a 
                                                    href={`${API_URL}/${pago.archivo_constancia.replace('../', '')}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="ml-2 inline-flex items-center text-blue-600 hover:text-blue-800"
                                                    title="Ver constancia"
                                                >
                                                    <FileText size={14}/>
                                                </a>
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

export default Cobranzas;
