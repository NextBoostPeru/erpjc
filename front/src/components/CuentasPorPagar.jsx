import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Briefcase, Search, Filter, AlertCircle, CheckCircle, 
  Calendar, DollarSign, FileText, ArrowRight, Loader, 
  ChevronDown, ChevronUp, User, X, Clock, History,
  Edit, Trash2, Upload, File, Plus, Link
} from 'lucide-react';

const formatCurrency = (amount, currency = 'PEN') => {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(amount);
};

const formatCurrencyGroup = (value) => {
  if (value == null) return formatCurrency(0, 'PEN');
  if (typeof value === 'number') return formatCurrency(value, 'PEN');
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return formatCurrency(Number(value), 'PEN');
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v != null && !Number.isNaN(Number(v)));
    if (entries.length === 0) return formatCurrency(0, 'PEN');
    return entries
      .map(([cur, amt]) => formatCurrency(Number(amt), cur))
      .join(' | ');
  }
  return formatCurrency(0, 'PEN');
};

const currencySymbol = (currency) => {
  const c = String(currency || 'PEN').toUpperCase();
  if (c === 'USD') return '$';
  if (c === 'PEN') return 'S/';
  return c;
};

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const computeMontoAplicado = ({ montoInput, monedaPago, monedaComp, tipoCambio, allowConversion }) => {
  const m = toNumber(montoInput);
  const mp = String(monedaPago || '').toUpperCase();
  const mc = String(monedaComp || '').toUpperCase();
  const tc = toNumber(tipoCambio) || 1;
  if (!m || m <= 0) return { montoPago: 0, montoAplicado: 0 };
  if (mp === '' || mc === '' || mp === mc) return { montoPago: m, montoAplicado: m };
  if (!allowConversion || tc <= 0) return { montoPago: m, montoAplicado: NaN };
  if (mc === 'USD' && mp === 'PEN') return { montoPago: m, montoAplicado: Math.round((m / tc) * 100) / 100 };
  if (mc === 'PEN' && mp === 'USD') return { montoPago: m, montoAplicado: Math.round((m * tc) * 100) / 100 };
  return { montoPago: m, montoAplicado: Math.round((m * tc) * 100) / 100 };
};

const CuentasPorPagar = () => {
  const [view, setView] = useState('dashboard'); // dashboard, alertas, pendientes, programados, conciliacion, proveedor, planilla_secundaria, reportes, estado_cuenta
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState({ por_pagar: {}, vencido: {}, pagado_mes: {}, alertas: { hoy: 0, manana: 0, semana: 0, vencido: 0 } });
  const [pendientes, setPendientes] = useState([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos'); // todos, vencido, al_dia
  const [pendientesQ, setPendientesQ] = useState('');
  const [pendientesMoneda, setPendientesMoneda] = useState('');
  const [vencDesde, setVencDesde] = useState('');
  const [vencHasta, setVencHasta] = useState('');
  const [emiDesde, setEmiDesde] = useState('');
  const [emiHasta, setEmiHasta] = useState('');
  const [pendientesShowFiltros, setPendientesShowFiltros] = useState(false);
  const [pendientesPage, setPendientesPage] = useState(1);
  const [pendientesMeta, setPendientesMeta] = useState({ total: 0, page: 1, limit: 25, total_pages: 1 });
  const [selectedCompraIds, setSelectedCompraIds] = useState([]);
  
  // Modal Pago
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pagoForm, setPagoForm] = useState({
    monto: '',
    medio_pago: 'Efectivo',
    referencia: '',
    origen_id: '',
    observaciones: '',
    moneda_pago: '',
    tipo_cambio: '',
    allow_conversion: false
  });
  const [submittingPago, setSubmittingPago] = useState(false);
  
  // Modal Historial
  const [historialModalOpen, setHistorialModalOpen] = useState(false);
  const [historialPagos, setHistorialPagos] = useState([]);
  const [historialMeta, setHistorialMeta] = useState({ total: 0, page: 1, limit: 50, total_pages: 1 });
  const [historialPage, setHistorialPage] = useState(1);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPago, setEditingPago] = useState(null);
  
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [reporteVencimientos, setReporteVencimientos] = useState([]);
  const [estadoCuentaData, setEstadoCuentaData] = useState([]);
  const [proveedorSearch, setProveedorSearch] = useState('');

  const [alertasTipo, setAlertasTipo] = useState('vencido');
  const [alertasData, setAlertasData] = useState([]);
  const [alertasMeta, setAlertasMeta] = useState({ total: 0, page: 1, limit: 25, total_pages: 1 });
  const [alertasResumen, setAlertasResumen] = useState({ vencido: 0, hoy: 0, manana: 0, semana: 0 });
  const [alertasPage, setAlertasPage] = useState(1);

  const [programaciones, setProgramaciones] = useState([]);
  const [programacionesMeta, setProgramacionesMeta] = useState({ total: 0, page: 1, limit: 25, total_pages: 1 });
  const [programacionesEstado, setProgramacionesEstado] = useState('Programado');
  const [programacionesQ, setProgramacionesQ] = useState('');
  const [programacionesDesde, setProgramacionesDesde] = useState('');
  const [programacionesHasta, setProgramacionesHasta] = useState('');
  const [programacionesPage, setProgramacionesPage] = useState(1);
  const [programacionesLoading, setProgramacionesLoading] = useState(false);

  const [programarOpen, setProgramarOpen] = useState(false);
  const [programarTarget, setProgramarTarget] = useState(null);
  const [programarBulkIds, setProgramarBulkIds] = useState([]);
  const [programarForm, setProgramarForm] = useState({ fecha_programada: '', monto: '', prioridad: 3, responsable_usuario_id: '', notas: '' });
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);

  const [proveedorDoc, setProveedorDoc] = useState('');
  const [proveedorData, setProveedorData] = useState(null);
  const [proveedorLoading, setProveedorLoading] = useState(false);

  const [concCuentaId, setConcCuentaId] = useState('');
  const [concDesde, setConcDesde] = useState(new Date().toISOString().slice(0, 10));
  const [concHasta, setConcHasta] = useState(new Date().toISOString().slice(0, 10));
  const [concLoading, setConcLoading] = useState(false);
  const [concData, setConcData] = useState([]);

  const [planillaSecPendientes, setPlanillaSecPendientes] = useState([]);
  const [planillaSecYear, setPlanillaSecYear] = useState(new Date().getFullYear());
  const [planillaSecSearch, setPlanillaSecSearch] = useState('');
  const [planillaSecLoading, setPlanillaSecLoading] = useState(false);
  const [selectedPlanillaSec, setSelectedPlanillaSec] = useState(null);
  const [modalPlanillaSecOpen, setModalPlanillaSecOpen] = useState(false);
  const [historialPlanillaSecOpen, setHistorialPlanillaSecOpen] = useState(false);
  const [historialPlanillaSecPagos, setHistorialPlanillaSecPagos] = useState([]);
  const [planillaSecPagoForm, setPlanillaSecPagoForm] = useState({
    monto: '', medio_pago: 'Transferencia', referencia: '', observaciones: ''
  });

  // Planilla Principal
  const [planillaPendientes, setPlanillaPendientes] = useState([]);
  const [planillaYear, setPlanillaYear] = useState(new Date().getFullYear());
  const [planillaMes, setPlanillaMes] = useState('');
  const [planillaSearch, setPlanillaSearch] = useState('');
  const [planillaLoading, setPlanillaLoading] = useState(false);
  const [selectedPlanilla, setSelectedPlanilla] = useState(null);
  const [modalPlanillaOpen, setModalPlanillaOpen] = useState(false);
  const [historialPlanillaOpen, setHistorialPlanillaOpen] = useState(false);
  const [historialPlanillaPagos, setHistorialPlanillaPagos] = useState([]);
  const [planillaPagoForm, setPlanillaPagoForm] = useState({
    monto: '', medio_pago: 'Transferencia', referencia: '', observaciones: ''
  });

  // Aportes Planilla
  const [aportesPendientes, setAportesPendientes] = useState([]);
  const [aportesYear, setAportesYear] = useState(new Date().getFullYear());
  const [aportesMes, setAportesMes] = useState('');
  const [aportesLoading, setAportesLoading] = useState(false);
  const [selectedAporte, setSelectedAporte] = useState(null);
  const [modalAporteOpen, setModalAporteOpen] = useState(false);
  const [historialAporteOpen, setHistorialAporteOpen] = useState(false);
  const [historialAportePagos, setHistorialAportePagos] = useState([]);
  const [aportePagoForm, setAportePagoForm] = useState({
    monto: '', medio_pago: 'Transferencia', referencia: '', observaciones: ''
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    if (view === 'pendientes') fetchPendientes(1);
    if (view === 'alertas') fetchAlertas(1);
    if (view === 'programados') fetchProgramaciones(1);
    if (view === 'conciliacion') fetchCuentasBancarias();
    if (view === 'reportes') fetchReporteVencimientos();
    if (view === 'estado_cuenta') fetchEstadoCuenta();
  }, [view]);

  useEffect(() => {
    if (view !== 'pendientes') return;
    setPendientesPage(1);
    fetchPendientes(1);
  }, [search, filterEstado, pendientesQ, pendientesMoneda, vencDesde, vencHasta, emiDesde, emiHasta]);

  useEffect(() => {
    if (view !== 'alertas') return;
    setAlertasPage(1);
    fetchAlertas(1);
  }, [alertasTipo]);

  useEffect(() => {
    if (view !== 'programados') return;
    setProgramacionesPage(1);
    fetchProgramaciones(1);
  }, [programacionesEstado, programacionesQ, programacionesDesde, programacionesHasta]);

  useEffect(() => {
    if (view === 'planilla_secundaria') fetchPlanillaSecPendientes();
  }, [view]);

  useEffect(() => {
    if (view === 'planilla_secundaria') fetchPlanillaSecPendientes();
  }, [planillaSecYear, planillaSecSearch]);

  useEffect(() => {
    if (view === 'planilla') fetchPlanillaPendientes();
  }, [view]);

  useEffect(() => {
    if (view === 'planilla') fetchPlanillaPendientes();
  }, [planillaYear, planillaMes, planillaSearch]);

  useEffect(() => {
    if (view === 'aportes') fetchAportesPendientes();
  }, [view]);

  useEffect(() => {
    if (view === 'aportes') fetchAportesPendientes();
  }, [aportesYear, aportesMes]);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'dashboard' }
      });
      setDashboardData(res.data || { por_pagar: {}, vencido: {}, pagado_mes: {}, alertas: { hoy: 0, manana: 0, semana: 0, vencido: 0 } });
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPendientes = async (page = pendientesPage) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          action: 'listar_pendientes',
          proveedor: search,
          estado_filter: filterEstado,
          q: pendientesQ,
          moneda: pendientesMoneda,
          venc_desde: vencDesde,
          venc_hasta: vencHasta,
          emi_desde: emiDesde,
          emi_hasta: emiHasta,
          page,
          limit: pendientesMeta.limit
        }
      });
      setPendientes(Array.isArray(res.data?.data) ? res.data.data : []);
      setPendientesMeta(res.data?.meta || { total: 0, page, limit: pendientesMeta.limit, total_pages: 1 });
      setPendientesPage(page);
      setSelectedCompraIds([]);
    } catch (error) {
      toast.error('Error al cargar pendientes');
      setPendientes([]);
      setPendientesMeta({ total: 0, page: 1, limit: pendientesMeta.limit, total_pages: 1 });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectCompra = (id) => {
    const cid = Number(id);
    if (!Number.isFinite(cid) || cid <= 0) return;
    setSelectedCompraIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));
  };

  const toggleSelectAllPage = () => {
    setSelectedCompraIds((prev) => {
      const ids = (pendientes || []).map((p) => Number(p.id)).filter((x) => Number.isFinite(x) && x > 0);
      if (!ids.length) return [];
      const allSelected = ids.every((id) => prev.includes(id));
      return allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
    });
  };

  const clearSelection = () => setSelectedCompraIds([]);

  const fetchAlertas = async (page = alertasPage) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'alertas', tipo: alertasTipo, page, limit: alertasMeta.limit }
      });
      setAlertasResumen(res.data?.resumen || { vencido: 0, hoy: 0, manana: 0, semana: 0 });
      setAlertasData(Array.isArray(res.data?.data) ? res.data.data : []);
      setAlertasMeta(res.data?.meta || { total: 0, page, limit: alertasMeta.limit, total_pages: 1 });
      setAlertasPage(page);
    } catch {
      toast.error('Error al cargar alertas');
      setAlertasData([]);
      setAlertasMeta({ total: 0, page: 1, limit: alertasMeta.limit, total_pages: 1 });
    } finally {
      setLoading(false);
    }
  };

  const fetchProgramaciones = async (page = programacionesPage) => {
    setProgramacionesLoading(true);
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          action: 'listar_programaciones',
          estado: programacionesEstado,
          q: programacionesQ,
          desde: programacionesDesde,
          hasta: programacionesHasta,
          page,
          limit: programacionesMeta.limit
        }
      });
      setProgramaciones(Array.isArray(res.data?.data) ? res.data.data : []);
      setProgramacionesMeta(res.data?.meta || { total: 0, page, limit: programacionesMeta.limit, total_pages: 1 });
      setProgramacionesPage(page);
    } catch {
      toast.error('Error al cargar programaciones');
      setProgramaciones([]);
      setProgramacionesMeta({ total: 0, page: 1, limit: programacionesMeta.limit, total_pages: 1 });
    } finally {
      setProgramacionesLoading(false);
    }
  };

  const searchUsers = async (q) => {
    const query = String(q || '').trim();
    setUserSearch(query);
    if (query.length < 2) {
      setUserResults([]);
      return;
    }
    setUserSearching(true);
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'buscar_usuarios', q: query }
      });
      setUserResults(Array.isArray(res.data?.usuarios) ? res.data.usuarios : []);
    } catch {
      setUserResults([]);
    } finally {
      setUserSearching(false);
    }
  };

  const openProgramar = (invoice) => {
    setProgramarTarget(invoice);
    setProgramarBulkIds([]);
    setProgramarForm({
      fecha_programada: invoice?.fecha_vencimiento || new Date().toISOString().slice(0, 10),
      monto: invoice?.saldo_pendiente || '',
      prioridad: 3,
      responsable_usuario_id: '',
      notas: ''
    });
    setUserSearch('');
    setUserResults([]);
    setProgramarOpen(true);
  };

  const openProgramarBulk = () => {
    if (!selectedCompraIds.length) return;
    setProgramarTarget(null);
    setProgramarBulkIds(selectedCompraIds);
    setProgramarForm({
      fecha_programada: new Date().toISOString().slice(0, 10),
      monto: '',
      prioridad: 3,
      responsable_usuario_id: '',
      notas: ''
    });
    setUserSearch('');
    setUserResults([]);
    setProgramarOpen(true);
  };

  const crearProgramacion = async (e) => {
    e.preventDefault();
    const bulk = programarBulkIds.length > 0;
    if (!bulk && !programarTarget) return;
    try {
      if (bulk) {
        const ids = programarBulkIds.slice();
        for (const cid of ids) {
          const inv = pendientes.find((p) => p.id === cid);
          if (!inv) continue;
          await axios.post(`${API_URL}cuentas_pagar.php?action=crear_programacion`, {
            compra_id: inv.id,
            fecha_programada: programarForm.fecha_programada,
            monto: programarForm.monto ? toNumber(programarForm.monto) : toNumber(inv.saldo_pendiente),
            moneda: inv.moneda,
            prioridad: Number(programarForm.prioridad) || 3,
            responsable_usuario_id: programarForm.responsable_usuario_id ? Number(programarForm.responsable_usuario_id) : null,
            notas: programarForm.notas
          }, { headers: { Authorization: `Bearer ${token}` } });
        }
        toast.success('Programaciones creadas');
      } else {
        await axios.post(`${API_URL}cuentas_pagar.php?action=crear_programacion`, {
          compra_id: programarTarget.id,
          fecha_programada: programarForm.fecha_programada,
          monto: toNumber(programarForm.monto),
          moneda: programarTarget.moneda,
          prioridad: Number(programarForm.prioridad) || 3,
          responsable_usuario_id: programarForm.responsable_usuario_id ? Number(programarForm.responsable_usuario_id) : null,
          notas: programarForm.notas
        }, { headers: { Authorization: `Bearer ${token}` } });
        toast.success('Programación creada');
      }
      setProgramarOpen(false);
      if (view === 'programados') fetchProgramaciones(1);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al programar');
    }
  };

  const cancelarProgramacion = async (id) => {
    if (!id) return;
    if (!window.confirm('¿Cancelar esta programación?')) return;
    try {
      await axios.post(`${API_URL}cuentas_pagar.php?action=cancelar_programacion&id=${id}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Programación cancelada');
      fetchProgramaciones(programacionesPage);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al cancelar');
    }
  };

  const fetchConciliacion = async () => {
    if (!concCuentaId) return toast.error('Seleccione una cuenta');
    setConcLoading(true);
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'conciliacion_sugerencias', cuenta_id: concCuentaId, desde: concDesde, hasta: concHasta }
      });
      setConcData(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al cargar conciliación');
      setConcData([]);
    } finally {
      setConcLoading(false);
    }
  };

  const marcarConciliado = async (pagoId, bancoMovId) => {
    try {
      await axios.post(`${API_URL}cuentas_pagar.php?action=marcar_conciliado`, { pago_id: pagoId, banco_movimiento_id: bancoMovId }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Conciliado');
      fetchConciliacion();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al conciliar');
    }
  };

  const buscarProveedor = async () => {
    const doc = String(proveedorDoc || '').trim();
    if (!doc) return toast.error('Ingrese RUC');
    setProveedorLoading(true);
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'proveedor_resumen', doc, inv_page: 1, pay_page: 1 }
      });
      setProveedorData(res.data || null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al cargar proveedor');
      setProveedorData(null);
    } finally {
      setProveedorLoading(false);
    }
  };

  const fetchCuentasBancarias = async () => {
    try {
      const res = await axios.get(`${API_URL}bancos.php?action=listar_cuentas`, {
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
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'reporte_vencimientos' }
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
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'estado_cuenta', doc: proveedorSearch }
      });
      setEstadoCuentaData(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error('Error al cargar estado de cuenta');
      setEstadoCuentaData([]);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchHistorialPagos = async (invoiceId, page = historialPage) => {
    try {
        const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { action: 'historial_pagos', id: invoiceId, page, limit: historialMeta.limit }
        });
        setHistorialPagos(Array.isArray(res.data?.data) ? res.data.data : []);
        setHistorialMeta(res.data?.meta || { total: 0, page, limit: historialMeta.limit, total_pages: 1 });
        setHistorialPage(page);
    } catch (error) {
        toast.error('Error al cargar historial');
    }
  };

  const fetchPlanillaSecPendientes = async () => {
    setPlanillaSecLoading(true);
    try {
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { action: 'planilla_secundaria_pendientes', year: planillaSecYear, q: planillaSecSearch }
      });
      setPlanillaSecPendientes(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (error) {
      toast.error('Error al cargar planilla secundaria');
    } finally { setPlanillaSecLoading(false); }
  };

  const handleOpenModalPlanillaSec = (row) => {
    setSelectedPlanillaSec(row);
    setPlanillaSecPagoForm({ monto: row.monto_pendiente, medio_pago: 'Transferencia', referencia: '', observaciones: '' });
    setModalPlanillaSecOpen(true);
  };

  const handleOpenHistorialPlanillaSec = (row) => {
    setSelectedPlanillaSec(row);
    axios.get(`${API_URL}cuentas_pagar.php`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { action: 'historial_pagos_planilla_secundaria', planilla_secundaria_detalle_id: row.planilla_secundaria_detalle_id }
    }).then((res) => setHistorialPlanillaSecPagos(Array.isArray(res.data) ? res.data : []))
      .catch(() => {
        setHistorialPlanillaSecPagos([]);
        toast.error('Error al cargar historial');
      });
    setHistorialPlanillaSecOpen(true);
  };

  const handleRegistrarPagoPlanillaSec = async (e) => {
    e.preventDefault();
    if (!selectedPlanillaSec || !planillaSecPagoForm.monto || planillaSecPagoForm.monto <= 0) return toast.error('Monto invalido');
    try {
      await axios.post(`${API_URL}cuentas_pagar.php?action=registrar_pago_planilla_secundaria`, {
        planilla_secundaria_detalle_id: selectedPlanillaSec.planilla_secundaria_detalle_id,
        monto: parseFloat(planillaSecPagoForm.monto),
        medio_pago: planillaSecPagoForm.medio_pago,
        referencia: planillaSecPagoForm.referencia,
        observaciones: planillaSecPagoForm.observaciones
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Pago registrado');
      setModalPlanillaSecOpen(false);
      fetchPlanillaSecPendientes();
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al registrar pago');
    }
  };

  const fetchPlanillaPendientes = async () => {
    setPlanillaLoading(true);
    try {
      const params = { action: 'planilla_pendientes', year: planillaYear };
      if (planillaMes) params.mes = planillaMes;
      if (planillaSearch.trim()) params.q = planillaSearch.trim();
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setPlanillaPendientes(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (error) {
      toast.error('Error al cargar planilla');
      setPlanillaPendientes([]);
    } finally { setPlanillaLoading(false); }
  };

  const handleOpenModalPlanilla = (row) => {
    setSelectedPlanilla(row);
    setPlanillaPagoForm({ monto: row.monto_pendiente, medio_pago: 'Transferencia', referencia: '', observaciones: '' });
    setModalPlanillaOpen(true);
  };

  const handleOpenHistorialPlanilla = (row) => {
    setSelectedPlanilla(row);
    axios.get(`${API_URL}cuentas_pagar.php`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { action: 'historial_pagos_planilla', planilla_detalle_id: row.planilla_detalle_id }
    }).then((res) => setHistorialPlanillaPagos(Array.isArray(res.data) ? res.data : []))
      .catch(() => { setHistorialPlanillaPagos([]); toast.error('Error al cargar historial'); });
    setHistorialPlanillaOpen(true);
  };

  const handleRegistrarPagoPlanilla = async (e) => {
    e.preventDefault();
    if (!selectedPlanilla || !planillaPagoForm.monto || planillaPagoForm.monto <= 0) return toast.error('Monto invalido');
    try {
      await axios.post(`${API_URL}cuentas_pagar.php?action=registrar_pago_planilla`, {
        planilla_detalle_id: selectedPlanilla.planilla_detalle_id,
        monto: parseFloat(planillaPagoForm.monto),
        medio_pago: planillaPagoForm.medio_pago,
        referencia: planillaPagoForm.referencia,
        observaciones: planillaPagoForm.observaciones
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Pago registrado');
      setModalPlanillaOpen(false);
      fetchPlanillaPendientes();
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al registrar pago');
    }
  };

  const fetchAportesPendientes = async () => {
    setAportesLoading(true);
    try {
      const params = { action: 'planilla_aportes_pendientes', year: aportesYear };
      if (aportesMes) params.mes = aportesMes;
      const res = await axios.get(`${API_URL}cuentas_pagar.php`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setAportesPendientes(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (error) {
      toast.error('Error al cargar aportes');
      setAportesPendientes([]);
    } finally { setAportesLoading(false); }
  };

  const handleOpenModalAporte = (row, tipo) => {
    setSelectedAporte({ ...row, tipo_aporte: tipo });
    setAportePagoForm({ monto: row.monto_pendiente, medio_pago: 'Transferencia', referencia: '', observaciones: '' });
    setModalAporteOpen(true);
  };

  const handleOpenHistorialAporte = (row, tipo) => {
    setSelectedAporte({ ...row, tipo_aporte: tipo });
    axios.get(`${API_URL}cuentas_pagar.php`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { action: 'historial_pagos_aporte_planilla', planilla_detalle_id: row.planilla_detalle_id, tipo_aporte: tipo }
    }).then((res) => setHistorialAportePagos(Array.isArray(res.data) ? res.data : []))
      .catch(() => { setHistorialAportePagos([]); toast.error('Error al cargar historial'); });
    setHistorialAporteOpen(true);
  };

  const handleRegistrarPagoAporte = async (e) => {
    e.preventDefault();
    if (!selectedAporte || !aportePagoForm.monto || aportePagoForm.monto <= 0) return toast.error('Monto invalido');
    try {
      await axios.post(`${API_URL}cuentas_pagar.php?action=registrar_pago_aporte_planilla`, {
        planilla_detalle_id: selectedAporte.planilla_detalle_id,
        tipo_aporte: selectedAporte.tipo_aporte,
        monto: parseFloat(aportePagoForm.monto),
        medio_pago: aportePagoForm.medio_pago,
        referencia: aportePagoForm.referencia,
        observaciones: aportePagoForm.observaciones
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Pago registrado');
      setModalAporteOpen(false);
      fetchAportesPendientes();
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al registrar pago');
    }
  };

  const handleOpenModal = (invoice) => {
    setSelectedInvoice(invoice);
    setIsEditMode(false);
    setEditingPago(null);
    const monedaComp = String(invoice?.moneda || 'PEN').toUpperCase();
    const medioDefault = 'Efectivo';
    const monedaPagoDefault = medioDefault === 'Efectivo' ? 'PEN' : monedaComp;
    setPagoForm({
      monto: invoice.saldo_pendiente,
      medio_pago: medioDefault,
      referencia: '',
      origen_id: '',
      observaciones: '',
      archivo: null,
      moneda_pago: monedaPagoDefault,
      tipo_cambio: '',
      allow_conversion: monedaPagoDefault !== monedaComp
    });
    fetchCuentasBancarias();
    setModalOpen(true);
  };

  const handleEditPago = (pago) => {
    setIsEditMode(true);
    setEditingPago(pago);
    // Cerrar modal historial
    setHistorialModalOpen(false);
    
    const monedaComp = selectedInvoice?.moneda || 'PEN';
    const monedaPago = pago?.moneda_pago || monedaComp;
    setPagoForm({
      monto: pago?.monto_pago ?? pago.monto,
      medio_pago: pago.medio_pago,
      referencia: pago.referencia || '',
      origen_id: pago.origen_id || '',
      observaciones: pago.observaciones || '',
      archivo: null,
      moneda_pago: monedaPago,
      tipo_cambio: pago?.tipo_cambio ?? '',
      allow_conversion: monedaPago !== monedaComp
    });
    fetchCuentasBancarias();
    setModalOpen(true);
  };

  const handleDeletePago = async (pagoId) => {
    if (!window.confirm('¿Está seguro de eliminar este pago? Esta acción revertirá los saldos.')) return;
    
    try {
        await axios.post(`${API_URL}cuentas_pagar.php?action=eliminar_pago&id=${pagoId}`, {}, {
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
      setHistorialPage(1);
      fetchHistorialPagos(invoice.id, 1);
      setHistorialModalOpen(true);
  };

  const handleRegistrarPago = async (e) => {
    e.preventDefault();
    if (submittingPago) return;
    if (!pagoForm.monto || Number(pagoForm.monto) <= 0) return toast.error('Monto inválido');

    const monedaComp = selectedInvoice?.moneda || 'PEN';
    const monedaPago = pagoForm.moneda_pago || monedaComp;
    const tc = pagoForm.tipo_cambio ? Number(pagoForm.tipo_cambio) : 1;
    const calc = computeMontoAplicado({
      montoInput: pagoForm.monto,
      monedaPago,
      monedaComp,
      tipoCambio: tc,
      allowConversion: Boolean(pagoForm.allow_conversion)
    });

    if (!isEditMode) {
      if (!Number.isFinite(calc.montoAplicado)) return toast.error('Tipo de cambio requerido');
      if (calc.montoAplicado > Number(selectedInvoice.saldo_pendiente)) return toast.error('Monto excede saldo pendiente');
    }

    try {
      setSubmittingPago(true);
      const formData = new FormData();
      formData.append('compra_id', selectedInvoice.id);
      formData.append('monto', pagoForm.monto);
      formData.append('medio_pago', pagoForm.medio_pago);
      formData.append('referencia', pagoForm.referencia);
      formData.append('origen_id', pagoForm.origen_id);
      formData.append('observaciones', pagoForm.observaciones);
      formData.append('moneda_pago', monedaPago);
      if (pagoForm.allow_conversion) formData.append('allow_conversion', '1');
      if (pagoForm.tipo_cambio) formData.append('tipo_cambio', String(pagoForm.tipo_cambio));
      
      if (pagoForm.archivo) {
        formData.append('archivo', pagoForm.archivo);
      }

      let url = `${API_URL}cuentas_pagar.php?action=registrar_pago`;
      
      if (isEditMode) {
        url = `${API_URL}cuentas_pagar.php?action=editar_pago`;
        formData.append('id', editingPago.id);
      }

      await axios.post(url, formData, {
        headers: { 
            Authorization: `Bearer ${token}`
        }
      });

      toast.success(isEditMode ? 'Pago actualizado' : 'Pago registrado');
      setModalOpen(false);
      fetchPendientes(pendientesPage);
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al procesar pago');
    } finally {
      setSubmittingPago(false);
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
        <div className="w-full md:w-auto">
          <div className="bg-white p-1 rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
            <div className="flex flex-nowrap gap-1 min-w-max">
              {[
                { key: 'dashboard', label: 'Dashboard' },
                { key: 'alertas', label: 'Alertas' },
                { key: 'pendientes', label: 'Pendientes' },
                { key: 'programados', label: 'Programados' },
                { key: 'conciliacion', label: 'Conciliación' },
                { key: 'proveedor', label: 'Proveedor' },
                { key: 'planilla', label: 'Planilla' },
                { key: 'aportes', label: 'Aportes' },
                { key: 'planilla_secundaria', label: 'Planilla Sec.' },
                { key: 'estado_cuenta', label: 'Estado Cuenta' },
                { key: 'reportes', label: 'Reportes' }
              ].map((v) => (
                 <button 
                    key={v.key}
                    className={`shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-md font-medium text-sm transition-all whitespace-nowrap ${view === v.key ? 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`} 
                    onClick={() => setView(v.key)}
                 >
                    {v.label}
                 </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard View */}
      {view === 'dashboard' && (
        <div className="space-y-4 md:space-y-6 fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-blue-500 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <DollarSign size={64} />
            </div>
            <div className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Total por Pagar</div>
            <div className="text-3xl font-bold text-gray-800">{formatCurrencyGroup(dashboardData.por_pagar)}</div>
            <div className="mt-2 text-xs text-blue-600 font-medium">Deuda total activa</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-red-500 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <AlertCircle size={64} />
            </div>
            <div className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Vencido</div>
            <div className="text-3xl font-bold text-red-600">{formatCurrencyGroup(dashboardData.vencido)}</div>
             <div className="mt-2 text-xs text-red-600 font-medium">Requiere atención inmediata</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-green-500 relative overflow-hidden group">
             <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <CheckCircle size={64} />
            </div>
            <div className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Pagado este Mes</div>
            <div className="text-3xl font-bold text-green-600">{formatCurrencyGroup(dashboardData.pagado_mes)}</div>
             <div className="mt-2 text-xs text-green-600 font-medium">Flujo de salida actual</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { k: 'vencido', label: 'Vencido', color: 'text-red-700', bg: 'bg-red-50', v: dashboardData?.alertas?.vencido || 0 },
            { k: 'hoy', label: 'Vence hoy', color: 'text-orange-700', bg: 'bg-orange-50', v: dashboardData?.alertas?.hoy || 0 },
            { k: 'manana', label: 'Vence mañana', color: 'text-yellow-700', bg: 'bg-yellow-50', v: dashboardData?.alertas?.manana || 0 },
            { k: 'semana', label: 'Semana', color: 'text-blue-700', bg: 'bg-blue-50', v: dashboardData?.alertas?.semana || 0 }
          ].map((a) => (
            <button
              key={a.k}
              className={`rounded-xl border border-gray-100 p-4 text-left ${a.bg} hover:opacity-90 transition-opacity`}
              onClick={() => { setAlertasTipo(a.k); setView('alertas'); }}
            >
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{a.label}</div>
              <div className={`mt-1 text-2xl font-bold ${a.color}`}>{a.v}</div>
            </button>
          ))}
        </div>
        </div>
      )}

      {/* Alertas View */}
      {view === 'alertas' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 text-gray-800 font-bold">
              <AlertCircle size={20} className="text-red-500" />
              Alertas de Vencimiento
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {[
                { k: 'vencido', label: `Vencido (${alertasResumen.vencido})` },
                { k: 'hoy', label: `Hoy (${alertasResumen.hoy})` },
                { k: 'manana', label: `Mañana (${alertasResumen.manana})` },
                { k: 'semana', label: `Semana (${alertasResumen.semana})` }
              ].map((t) => (
                <button
                  key={t.k}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${alertasTipo === t.k ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setAlertasTipo(t.k)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader className="animate-spin text-blue-600" size={28} /></div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Vencimiento</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Comprobante</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proveedor</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Saldo</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {alertasData.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">{inv.fecha_vencimiento}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 font-mono text-xs">{inv.serie}-{inv.numero}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{inv.proveedor_razon_social}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-bold text-right">{formatCurrency(inv.saldo_pendiente, inv.moneda)}</td>
                        <td className="px-4 py-3 text-center">
                          <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs" onClick={() => { setView('pendientes'); setSearch(inv.proveedor_num_doc || ''); }}>
                            Ver en Pendientes
                          </button>
                        </td>
                      </tr>
                    ))}
                    {alertasData.length === 0 && <tr><td colSpan="5" className="text-center p-8 text-gray-500 italic">Sin registros</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
                <div>Página {alertasMeta.page} de {alertasMeta.total_pages} · {alertasMeta.total} registros</div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50" disabled={alertasMeta.page <= 1} onClick={() => fetchAlertas(alertasMeta.page - 1)}>Anterior</button>
                  <button className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50" disabled={alertasMeta.page >= alertasMeta.total_pages} onClick={() => fetchAlertas(alertasMeta.page + 1)}>Siguiente</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Programados View */}
      {view === 'programados' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 text-gray-800 font-bold">
              <Calendar size={20} className="text-orange-600" />
              Programación de Pagos
            </div>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm" onClick={() => setView('pendientes')}>
              <Plus size={16} /> Programar desde Pendientes
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <select className="border rounded-lg px-3 py-2 text-sm" value={programacionesEstado} onChange={(e) => setProgramacionesEstado(e.target.value)}>
              <option value="Programado">Programado</option>
              <option value="Ejecutado">Ejecutado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Buscar proveedor/serie..." value={programacionesQ} onChange={(e) => setProgramacionesQ(e.target.value)} />
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={programacionesDesde} onChange={(e) => setProgramacionesDesde(e.target.value)} />
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={programacionesHasta} onChange={(e) => setProgramacionesHasta(e.target.value)} />
          </div>

          {programacionesLoading ? (
            <div className="flex justify-center py-12"><Loader className="animate-spin text-blue-600" size={28} /></div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proveedor</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Comprobante</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Monto</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Estado</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {programaciones.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">{p.fecha_programada}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{p.proveedor_razon_social}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 font-mono text-xs">{p.serie}-{p.numero}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-bold text-right">{formatCurrency(p.monto, p.moneda_compra || p.moneda || 'PEN')}</td>
                        <td className="px-4 py-3 text-center"><span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-700">{p.estado}</span></td>
                        <td className="px-4 py-3 text-center">
                          {p.estado === 'Programado' ? (
                            <button className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs" onClick={() => cancelarProgramacion(p.id)}>Cancelar</button>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {programaciones.length === 0 && <tr><td colSpan="6" className="text-center p-8 text-gray-500 italic">Sin registros</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
                <div>Página {programacionesMeta.page} de {programacionesMeta.total_pages} · {programacionesMeta.total} registros</div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50" disabled={programacionesMeta.page <= 1} onClick={() => fetchProgramaciones(programacionesMeta.page - 1)}>Anterior</button>
                  <button className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50" disabled={programacionesMeta.page >= programacionesMeta.total_pages} onClick={() => fetchProgramaciones(programacionesMeta.page + 1)}>Siguiente</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Conciliación View */}
      {view === 'conciliacion' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in">
          <div className="flex items-center gap-2 text-gray-800 font-bold mb-4">
            <Link size={18} className="text-blue-600" />
            Conciliación Bancaria (sugerencias)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <select className="border rounded-lg px-3 py-2 text-sm" value={concCuentaId} onChange={(e) => setConcCuentaId(e.target.value)}>
              <option value="">Seleccione cuenta...</option>
              {cuentasBancarias.map((c) => <option key={c.id} value={c.id}>{c.nombre_banco} - {c.numero_cuenta} ({c.moneda})</option>)}
            </select>
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={concDesde} onChange={(e) => setConcDesde(e.target.value)} />
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={concHasta} onChange={(e) => setConcHasta(e.target.value)} />
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm" onClick={fetchConciliacion} disabled={concLoading}>
              {concLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {concLoading ? (
            <div className="flex justify-center py-12"><Loader className="animate-spin text-blue-600" size={28} /></div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Banco Mov</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Pago</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Monto</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {concData.map((r) => {
                    const cuenta = cuentasBancarias.find((c) => String(c.id) === String(concCuentaId));
                    const monedaCuenta = cuenta?.moneda || 'PEN';
                    const conciliado = Number(r?.conciliado) === 1;
                    return (
                      <tr key={`${r.banco_movimiento_id}-${r.pago_id || 0}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="font-medium">{r.fecha}</div>
                          <div className="text-xs text-gray-400">{r.referencia || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {r.pago_id ? (
                            <div>
                              <div className="font-mono text-xs">{r.serie}-{r.numero}</div>
                              <div className="text-xs text-gray-500">{r.proveedor_razon_social}</div>
                              <div className="text-xs text-gray-400">
                                Pago: {formatCurrency(r.monto_pago ?? r.monto, r.moneda_pago || monedaCuenta)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Sin match</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-bold text-right">{formatCurrency(r.monto, monedaCuenta)}</td>
                        <td className="px-4 py-3 text-center">
                          {r.pago_id ? (
                            conciliado ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                                Conciliado
                              </span>
                            ) : (
                              <button className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs" onClick={() => marcarConciliado(r.pago_id, r.banco_movimiento_id)}>
                                Marcar conciliado
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {concData.length === 0 && <tr><td colSpan="4" className="text-center p-8 text-gray-500 italic">Sin registros</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Proveedor View */}
      {view === 'proveedor' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in">
          <div className="flex items-center gap-2 text-gray-800 font-bold mb-4">
            <User size={18} className="text-blue-600" />
            Ficha de Proveedor
          </div>
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <input className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ingrese RUC..." value={proveedorDoc} onChange={(e) => setProveedorDoc(e.target.value)} />
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm" onClick={buscarProveedor} disabled={proveedorLoading}>
              {proveedorLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {!proveedorData ? (
            <div className="text-sm text-gray-500">Busca un proveedor para ver su deuda y pagos.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(proveedorData.totales || []).map((t) => (
                  <div key={t.moneda} className="rounded-xl border border-gray-100 p-4 bg-gray-50">
                    <div className="text-xs font-bold uppercase text-gray-500">Pendiente ({t.moneda})</div>
                    <div className="text-xl font-bold text-gray-800">{formatCurrency(t.total_pendiente, t.moneda)}</div>
                    <div className="text-xs text-red-600 mt-1">Vencido: {formatCurrency(t.total_vencido, t.moneda)}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 font-bold text-sm">Facturas</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                          <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Doc</th>
                          <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(proveedorData.facturas?.data || []).map((f) => (
                          <tr key={f.id}>
                            <td className="px-4 py-2 text-sm text-gray-600">{f.fecha_emision}</td>
                            <td className="px-4 py-2 text-sm font-mono text-xs">{f.serie}-{f.numero}</td>
                            <td className="px-4 py-2 text-sm font-bold text-right">{formatCurrency(f.saldo_pendiente, f.moneda)}</td>
                          </tr>
                        ))}
                        {(proveedorData.facturas?.data || []).length === 0 && <tr><td colSpan="3" className="text-center p-6 text-gray-400 text-sm">Sin registros</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 font-bold text-sm">Pagos</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                          <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Doc</th>
                          <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-right">Pago</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(proveedorData.pagos?.data || []).map((p) => (
                          <tr key={p.id}>
                            <td className="px-4 py-2 text-sm text-gray-600">{p.fecha}</td>
                            <td className="px-4 py-2 text-sm font-mono text-xs">{p.serie}-{p.numero}</td>
                            <td className="px-4 py-2 text-sm font-bold text-right">{formatCurrency(p.monto_pago ?? p.monto, p.moneda_pago || p.moneda_compra || 'PEN')}</td>
                          </tr>
                        ))}
                        {(proveedorData.pagos?.data || []).length === 0 && <tr><td colSpan="3" className="text-center p-6 text-gray-400 text-sm">Sin registros</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pendientes View */}
      {view === 'pendientes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in flex flex-col h-full">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex flex-col md:flex-row gap-2 w-full">
                <div className="relative w-full md:max-w-[420px]">
                  <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input
                    type="text"
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm bg-white"
                    placeholder="Proveedor (RUC / razón social)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {String(search || '').trim() !== '' && (
                    <button
                      type="button"
                      className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                      onClick={() => setSearch('')}
                      title="Limpiar"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                <select
                  className="w-full md:w-56 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="vencido">Vencidos</option>
                  <option value="al_dia">Al día</option>
                </select>

                <button
                  type="button"
                  className={`w-full md:w-auto px-4 py-2 rounded-lg border text-sm inline-flex items-center justify-center gap-2 ${pendientesShowFiltros ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setPendientesShowFiltros((v) => !v)}
                >
                  <Filter size={16} />
                  Filtros
                </button>
              </div>

              <div className="flex gap-2 w-full md:w-auto md:justify-end">
                <button
                  className="w-full md:w-auto px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
                  onClick={openProgramarBulk}
                  disabled={selectedCompraIds.length === 0}
                  type="button"
                  title={selectedCompraIds.length ? `Programar ${selectedCompraIds.length} seleccionados` : 'Seleccione al menos un comprobante'}
                >
                  <span className="inline-flex items-center gap-2"><Calendar size={16} /> Programar selección</span>
                </button>
                <button
                  className="w-full md:w-auto px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50"
                  onClick={clearSelection}
                  disabled={selectedCompraIds.length === 0}
                  type="button"
                >
                  Limpiar selección
                </button>
              </div>
            </div>

            {(String(pendientesQ || '').trim() !== '' || String(pendientesMoneda || '').trim() !== '' || vencDesde || vencHasta || emiDesde || emiHasta || selectedCompraIds.length > 0) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedCompraIds.length > 0 && (
                  <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    Seleccionados: {selectedCompraIds.length}
                  </span>
                )}
                {String(pendientesQ || '').trim() !== '' && (
                  <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
                    Búsqueda: {pendientesQ}
                  </span>
                )}
                {String(pendientesMoneda || '').trim() !== '' && (
                  <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
                    Moneda: {pendientesMoneda}
                  </span>
                )}
                {(vencDesde || vencHasta) && (
                  <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
                    Venc.: {vencDesde || '—'} → {vencHasta || '—'}
                  </span>
                )}
                {(emiDesde || emiHasta) && (
                  <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
                    Emisión: {emiDesde || '—'} → {emiHasta || '—'}
                  </span>
                )}
              </div>
            )}

            {pendientesShowFiltros && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 md:p-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <div className="relative md:col-span-2">
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white pr-10"
                      placeholder="Comprobante / referencia"
                      value={pendientesQ}
                      onChange={(e) => setPendientesQ(e.target.value)}
                    />
                    {String(pendientesQ || '').trim() !== '' && (
                      <button
                        type="button"
                        className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                        onClick={() => setPendientesQ('')}
                        title="Limpiar"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  <select
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    value={pendientesMoneda}
                    onChange={(e) => setPendientesMoneda(e.target.value)}
                  >
                    <option value="">Moneda (todas)</option>
                    <option value="PEN">PEN</option>
                    <option value="USD">USD</option>
                  </select>

                  <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={vencDesde} onChange={(e) => setVencDesde(e.target.value)} />
                  <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={vencHasta} onChange={(e) => setVencHasta(e.target.value)} />
                  <div className="text-xs text-gray-500 flex items-center md:justify-center">Vencimiento</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mt-2">
                  <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white md:col-start-4" value={emiDesde} onChange={(e) => setEmiDesde(e.target.value)} />
                  <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={emiHasta} onChange={(e) => setEmiHasta(e.target.value)} />
                  <div className="text-xs text-gray-500 flex items-center md:col-span-2">Emisión</div>
                  <div className="md:col-span-3"></div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-3">
                  <button
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-white bg-white"
                    onClick={() => { setPendientesQ(''); setPendientesMoneda(''); setVencDesde(''); setVencHasta(''); setEmiDesde(''); setEmiHasta(''); }}
                    type="button"
                  >
                    Limpiar filtros
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-white"
                    onClick={() => setPendientesShowFiltros(false)}
                  >
                    Ocultar filtros
                  </button>
                </div>
              </div>
            )}
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
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={(pendientes || []).length > 0 && (pendientes || []).every((p) => selectedCompraIds.includes(Number(p.id)))}
                            onChange={toggleSelectAllPage}
                          />
                        </th>
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
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={selectedCompraIds.includes(Number(inv.id))}
                              onChange={() => toggleSelectCompra(inv.id)}
                            />
                          </td>
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
                                    className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                    title="Programar Pago"
                                    onClick={() => openProgramar(inv)}
                                >
                                    <Calendar size={18}/>
                                </button>
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
                      {pendientes.length === 0 && <tr><td colSpan="8" className="text-center p-8 text-gray-500 italic">No hay facturas pendientes con estos filtros</td></tr>}
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
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300"
                                    checked={selectedCompraIds.includes(Number(inv.id))}
                                    onChange={() => toggleSelectCompra(inv.id)}
                                  />
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${inv.dias_retraso > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                      {inv.dias_retraso > 0 ? 'Vencido' : 'Al día'}
                                  </span>
                                </div>
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
                            
                            <div className="grid grid-cols-3 gap-2">
                                <button 
                                    className="flex items-center justify-center gap-1 py-2 bg-orange-100 text-orange-800 rounded-lg text-xs font-medium active:bg-orange-200"
                                    onClick={() => openProgramar(inv)}
                                >
                                    <Calendar size={14}/> Programar
                                </button>
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
                <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
                  <div>Página {pendientesMeta.page} de {pendientesMeta.total_pages} · {pendientesMeta.total} registros</div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50" disabled={pendientesMeta.page <= 1} onClick={() => fetchPendientes(pendientesMeta.page - 1)}>Anterior</button>
                    <button className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-50" disabled={pendientesMeta.page >= pendientesMeta.total_pages} onClick={() => fetchPendientes(pendientesMeta.page + 1)}>Siguiente</button>
                  </div>
                </div>
            </>
          )}
        </div>
      )}

      {/* Planilla Principal View */}
      {view === 'planilla' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold text-gray-800">
              <DollarSign size={18} className="text-blue-600" /> Planilla de Colaboradores
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={planillaYear} onChange={(e) => setPlanillaYear(+e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
                {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={planillaMes} onChange={(e) => setPlanillaMes(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
                <option value="">Todos los meses</option>
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
              </select>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                <input className="w-48 pl-9 pr-3 py-1.5 border rounded-md text-sm" placeholder="Buscar colaborador..." value={planillaSearch} onChange={(e) => setPlanillaSearch(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            {planillaLoading ? (
              <div className="p-8 text-center text-gray-500">Cargando...</div>
            ) : planillaPendientes.length === 0 ? (
              <div className="p-8 text-center text-gray-400"><p>No hay pagos pendientes de planilla</p></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3">Periodo</th>
                    <th className="text-left px-4 py-3">Colaborador</th>
                    <th className="text-left px-4 py-3">Documento</th>
                    <th className="text-right px-4 py-3">Sueldo Base</th>
                    <th className="text-right px-4 py-3">Total Bruto</th>
                    <th className="text-right px-4 py-3">Descuentos</th>
                    <th className="text-right px-4 py-3">Neto</th>
                    <th className="text-right px-4 py-3">Pendiente</th>
                    <th className="text-center px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {planillaPendientes.map(r => (
                    <tr key={r.planilla_detalle_id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">{r.periodo}</td>
                      <td className="px-4 py-3 font-medium">{r.colaborador}</td>
                      <td className="px-4 py-3 text-gray-500">{r.documento_numero}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.sueldo_base, 'PEN')}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.total_bruto, 'PEN')}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(r.total_descuentos, 'PEN')}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.monto, 'PEN')}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{formatCurrency(r.monto_pendiente, 'PEN')}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => handleOpenModalPlanilla(r)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Registrar Pago"><DollarSign size={16} /></button>
                          <button onClick={() => handleOpenHistorialPlanilla(r)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Historial"><Clock size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Aportes Planilla View */}
      {view === 'aportes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold text-gray-800">
              <DollarSign size={18} className="text-purple-600" /> Aportes de Planilla (ESSALUD, Vida Ley, SCTR)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={aportesYear} onChange={(e) => setAportesYear(+e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
                {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={aportesMes} onChange={(e) => setAportesMes(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
                <option value="">Todos los meses</option>
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            {aportesLoading ? (
              <div className="p-8 text-center text-gray-500">Cargando...</div>
            ) : aportesPendientes.length === 0 ? (
              <div className="p-8 text-center text-gray-400"><p>No hay aportes pendientes</p></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3">Periodo</th>
                    <th className="text-left px-4 py-3">Colaborador</th>
                    <th className="text-left px-4 py-3">Doc.</th>
                    <th className="text-right px-4 py-3">ESSALUD</th>
                    <th className="text-right px-4 py-3">Vida Ley</th>
                    <th className="text-right px-4 py-3">SCTR</th>
                    <th className="text-right px-4 py-3">Total Aporte</th>
                    <th className="text-right px-4 py-3">Pendiente</th>
                    <th className="text-center px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {aportesPendientes.map(r => (
                    <tr key={r.planilla_detalle_id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">{r.periodo}</td>
                      <td className="px-4 py-3 font-medium">{r.colaborador}</td>
                      <td className="px-4 py-3 text-gray-500">{r.documento_numero}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-700">{formatCurrency(r.essalud, 'PEN')}</span>
                        <button onClick={() => handleOpenModalAporte(r, 'essalud')} className="ml-1 p-0.5 text-green-600 hover:bg-green-50 rounded" title="Pagar ESSALUD"><DollarSign size={14} /></button>
                        <button onClick={() => handleOpenHistorialAporte(r, 'essalud')} className="ml-0.5 p-0.5 text-blue-600 hover:bg-blue-50 rounded" title="Historial ESSALUD"><Clock size={14} /></button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-700">{formatCurrency(r.vida_ley, 'PEN')}</span>
                        <button onClick={() => handleOpenModalAporte(r, 'vida_ley')} className="ml-1 p-0.5 text-green-600 hover:bg-green-50 rounded" title="Pagar Vida Ley"><DollarSign size={14} /></button>
                        <button onClick={() => handleOpenHistorialAporte(r, 'vida_ley')} className="ml-0.5 p-0.5 text-blue-600 hover:bg-blue-50 rounded" title="Historial Vida Ley"><Clock size={14} /></button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-700">{formatCurrency(r.sctr, 'PEN')}</span>
                        <button onClick={() => handleOpenModalAporte(r, 'sctr')} className="ml-1 p-0.5 text-green-600 hover:bg-green-50 rounded" title="Pagar SCTR"><DollarSign size={14} /></button>
                        <button onClick={() => handleOpenHistorialAporte(r, 'sctr')} className="ml-0.5 p-0.5 text-blue-600 hover:bg-blue-50 rounded" title="Historial SCTR"><Clock size={14} /></button>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.total_aporte, 'PEN')}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{formatCurrency(r.monto_pendiente, 'PEN')}</td>
                      <td className="px-4 py-3 text-center"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Planilla Secundaria View */}
      {view === 'planilla_secundaria' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 fade-in">
          <div className="mb-4 flex flex-col md:flex-row gap-4 justify-between">
            <div className="flex items-center gap-2 text-gray-800 font-bold">
              <Briefcase size={20} className="text-orange-600" />
              Planilla Secundaria (Sueldo Adicional)
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <select value={planillaSecYear} onChange={(e) => setPlanillaSecYear(+e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
                {Array.from({length:5}, (_,i) => new Date().getFullYear()-i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="relative w-full md:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-9 pr-3 py-1.5 border rounded-md text-sm" placeholder="Buscar colaborador..." value={planillaSecSearch} onChange={(e) => setPlanillaSecSearch(e.target.value)} />
              </div>
            </div>
          </div>
          {planillaSecLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : planillaSecPendientes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle size={48} className="mx-auto mb-2 text-green-300" />
              <p>No hay pagos pendientes de planilla secundaria</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Periodo</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Concepto</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Colaborador</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Cargo</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Neto</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Pendiente</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Vencimiento</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                </tr></thead>
                <tbody>
                  {planillaSecPendientes.map(r => (
                    <tr key={r.planilla_secundaria_detalle_id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">{r.periodo}</td>
                      <td className="px-3 py-2"><span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{r.concepto}</span></td>
                      <td className="px-3 py-2"><div className="font-medium">{r.colaborador}</div><div className="text-xs text-gray-400">{r.documento_numero}</div></td>
                      <td className="px-3 py-2 text-gray-500">{r.cargo || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.monto, 'PEN')}</td>
                      <td className="px-3 py-2 text-right font-bold text-orange-600">{formatCurrency(r.monto_pendiente, 'PEN')}</td>
                      <td className="px-3 py-2 text-gray-500">{r.fecha_vencimiento || '-'}</td>
                      <td className="px-3 py-2"><div className="flex justify-center gap-1">
                        <button onClick={() => handleOpenModalPlanillaSec(r)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Registrar Pago"><DollarSign size={16} /></button>
                        <button onClick={() => handleOpenHistorialPlanillaSec(r)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Historial"><Clock size={16} /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                      !proveedorSearch ? estadoCuentaData.map((c) => (
                        <tr key={`${c.proveedor_num_doc}-${c.moneda}`} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-700 font-medium">{c.proveedor_razon_social}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{c.proveedor_num_doc}</td>
                          <td className="px-4 py-3 text-sm text-gray-400 text-center">-</td>
                          <td className="px-4 py-3 text-sm text-red-600 font-bold text-right">{formatCurrency(c.deuda_total, c.moneda || 'PEN')}</td>
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
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Moneda</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Facturas Vencidas</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Max Días Atraso</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Total Deuda Vencida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {reporteVencimientos.map((row) => (
                    <tr key={`${row.proveedor_num_doc}-${row.moneda}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700 font-medium">{row.proveedor_razon_social}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{row.moneda || 'PEN'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-center">{row.cantidad_facturas}</td>
                      <td className="px-4 py-3 text-sm text-red-600 text-center font-bold">{row.max_dias_atraso}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-bold text-right">{formatCurrency(row.total_deuda, row.moneda || 'PEN')}</td>
                    </tr>
                  ))}
                  {reporteVencimientos.length === 0 && <tr><td colSpan="5" className="text-center p-8 text-gray-500 italic">No hay deudas vencidas</td></tr>}
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
              <h3 className="text-lg font-bold text-gray-800">{isEditMode ? 'Actualizar Pago' : 'Registrar Pago'}</h3>
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
                {(() => {
                  const monedaComp = String(selectedInvoice?.moneda || 'PEN').toUpperCase();
                  const monedaPago = String(pagoForm?.moneda_pago || monedaComp).toUpperCase();
                  const tc = pagoForm?.tipo_cambio ? Number(pagoForm.tipo_cambio) : 1;
                  const calc = computeMontoAplicado({
                    montoInput: pagoForm?.monto,
                    monedaPago,
                    monedaComp,
                    tipoCambio: tc,
                    allowConversion: Boolean(pagoForm?.allow_conversion)
                  });
                  const montoAplicado = calc?.montoAplicado;
                  const showConversion = monedaPago !== monedaComp;
                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Moneda del Pago</label>
                          <select
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white disabled:opacity-60"
                            value={monedaPago}
                            disabled={pagoForm.medio_pago === 'Efectivo'}
                            onChange={(e) => {
                              const mp = String(e.target.value || '').toUpperCase();
                              setPagoForm((prev) => ({
                                ...prev,
                                moneda_pago: mp,
                                allow_conversion: mp !== monedaComp,
                                tipo_cambio: mp !== monedaComp ? prev.tipo_cambio : ''
                              }));
                            }}
                          >
                            <option value="PEN">PEN</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>

                        {showConversion ? (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Tipo de Cambio</label>
                            <input
                              type="number"
                              step="0.000001"
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                              value={pagoForm.tipo_cambio}
                              onChange={(e) => setPagoForm((prev) => ({ ...prev, tipo_cambio: e.target.value }))}
                              placeholder="Ej: 3.75"
                              required={Boolean(pagoForm.allow_conversion)}
                            />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Monto aplicado</label>
                            <div className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
                              {formatCurrency(toNumber(pagoForm.monto), monedaComp)}
                            </div>
                          </div>
                        )}
                      </div>

                      {showConversion && (
                        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
                          <div className="text-sm text-gray-700">
                            <div className="font-semibold">Conversión {monedaPago} → {monedaComp}</div>
                            <div className="text-xs text-gray-500">Monto aplicado: {Number.isFinite(montoAplicado) ? formatCurrency(montoAplicado, monedaComp) : '—'}</div>
                          </div>
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={Boolean(pagoForm.allow_conversion)}
                              onChange={(e) => setPagoForm((prev) => ({ ...prev, allow_conversion: e.target.checked }))}
                            />
                            Permitir conversión
                          </label>
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Monto del Pago</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-500 text-sm">{currencySymbol(pagoForm.moneda_pago || selectedInvoice.moneda)}</span>
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
                      onChange={(e) => {
                        const medio = e.target.value;
                        const monedaComp = String(selectedInvoice?.moneda || 'PEN').toUpperCase();
                        setPagoForm((prev) => {
                          const next = { ...prev, medio_pago: medio };
                          if (medio === 'Efectivo') {
                            next.moneda_pago = 'PEN';
                            next.allow_conversion = 'PEN' !== monedaComp;
                          } else if (!next.moneda_pago) {
                            next.moneda_pago = monedaComp;
                            next.allow_conversion = false;
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="Efectivo">Efectivo (Caja)</option>
                      <option value="Transferencia">Transferencia Bancaria</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Deposito">Depósito</option>
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
                            <FileText size={12}/> Archivo actual:{' '}
                            <a
                              href={`${API_URL}cuentas_pagar.php?action=descargar_constancia&id=${editingPago.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              Ver documento
                            </a>
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
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-center">Const.</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-right">Monto</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase">Usuario</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {historialPagos.map((pago) => (
                                    <tr key={pago.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-600">{pago.fecha}</td>
                                        <td className="px-4 py-3 text-sm text-gray-800 font-medium">{pago.medio_pago}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{pago.referencia || '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            {pago.archivo_constancia ? (
                                                <a 
                                                    href={`${API_URL}cuentas_pagar.php?action=descargar_constancia&id=${pago.id}`}
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
                                        <td className="px-4 py-3 text-sm text-right">
                                          {(() => {
                                            const monedaComp = String(pago?.moneda_compra || selectedInvoice?.moneda || 'PEN').toUpperCase();
                                            const monedaPago = String(pago?.moneda_pago || monedaComp).toUpperCase();
                                            const montoPago = pago?.monto_pago ?? pago?.monto ?? 0;
                                            const aplicado = pago?.monto ?? 0;
                                            return (
                                              <div>
                                                <div className="text-green-600 font-bold">{formatCurrency(montoPago, monedaPago)}</div>
                                                {monedaPago !== monedaComp && (
                                                  <div className="text-xs text-gray-400">Aplica: {formatCurrency(aplicado, monedaComp)}</div>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-400">{pago.usuario}</td>
                                        <td className="px-4 py-3 text-center">
                                          <div className="flex justify-center gap-2">
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
                                          </div>
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

      {/* Modal Pago Planilla Principal */}
      {modalPlanillaOpen && selectedPlanilla && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">Registrar Pago - Planilla</h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setModalPlanillaOpen(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p><strong>Colaborador:</strong> {selectedPlanilla.colaborador}</p>
              <p><strong>Periodo:</strong> {selectedPlanilla.periodo}</p>
              <p><strong>Neto:</strong> {formatCurrency(selectedPlanilla.monto, 'PEN')}</p>
              <p><strong>Pendiente:</strong> {formatCurrency(selectedPlanilla.monto_pendiente, 'PEN')}</p>
            </div>
            <form onSubmit={handleRegistrarPagoPlanilla}>
              <div className="p-5 border-t space-y-4">
                <div><label className="block text-sm font-medium mb-1">Monto</label><input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={planillaPagoForm.monto} onChange={(e) => setPlanillaPagoForm({...planillaPagoForm, monto: e.target.value})} required /></div>
                <div><label className="block text-sm font-medium mb-1">Medio de Pago</label><select className="w-full border rounded-lg px-3 py-2 text-sm" value={planillaPagoForm.medio_pago} onChange={(e) => setPlanillaPagoForm({...planillaPagoForm, medio_pago: e.target.value})}><option>Efectivo</option><option>Transferencia</option><option>Cheque</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Referencia</label><input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" value={planillaPagoForm.referencia} onChange={(e) => setPlanillaPagoForm({...planillaPagoForm, referencia: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Observaciones</label><textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={planillaPagoForm.observaciones} onChange={(e) => setPlanillaPagoForm({...planillaPagoForm, observaciones: e.target.value})} /></div>
              </div>
              <div className="p-5 border-t flex justify-end gap-3">
                <button type="button" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg" onClick={() => setModalPlanillaOpen(false)}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Registrar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial Planilla */}
      {historialPlanillaOpen && selectedPlanilla && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-5 border-b flex justify-between items-center">
              <div><h2 className="text-lg font-bold">Historial de Pagos</h2><p className="text-sm text-gray-500">{selectedPlanilla.colaborador} - {selectedPlanilla.periodo}</p></div>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setHistorialPlanillaOpen(false)}><X size={20} /></button>
            </div>
            <div className="p-5 max-h-80 overflow-y-auto">
              {historialPlanillaPagos.length === 0 ? (
                <p className="text-center text-gray-400">Sin pagos registrados</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-gray-500"><th className="text-left py-2">Fecha</th><th className="text-right py-2">Monto</th><th className="text-left py-2">Medio</th><th className="text-left py-2">Usuario</th></tr></thead>
                  <tbody>{historialPlanillaPagos.map(h => (
                    <tr key={h.id} className="border-b hover:bg-gray-50">
                      <td className="py-2">{h.fecha}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(h.monto, 'PEN')}</td>
                      <td className="py-2">{h.medio_pago || '-'}</td>
                      <td className="py-2">{h.usuario || '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 text-right"><button className="px-4 py-2 bg-gray-200 rounded-lg" onClick={() => setHistorialPlanillaOpen(false)}>Cerrar</button></div>
          </div>
        </div>
      )}

      {/* Modal Pago Aporte Planilla */}
      {modalAporteOpen && selectedAporte && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">Registrar Pago - Aporte</h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setModalAporteOpen(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p><strong>Colaborador:</strong> {selectedAporte.colaborador}</p>
              <p><strong>Periodo:</strong> {selectedAporte.periodo}</p>
              <p><strong>Tipo Aporte:</strong> {selectedAporte.tipo_aporte === 'essalud' ? 'ESSALUD' : selectedAporte.tipo_aporte === 'vida_ley' ? 'Vida Ley' : 'SCTR'}</p>
              <p><strong>Pendiente:</strong> {formatCurrency(selectedAporte.monto_pendiente, 'PEN')}</p>
            </div>
            <form onSubmit={handleRegistrarPagoAporte}>
              <div className="p-5 border-t space-y-4">
                <div><label className="block text-sm font-medium mb-1">Monto</label><input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={aportePagoForm.monto} onChange={(e) => setAportePagoForm({...aportePagoForm, monto: e.target.value})} required /></div>
                <div><label className="block text-sm font-medium mb-1">Medio de Pago</label><select className="w-full border rounded-lg px-3 py-2 text-sm" value={aportePagoForm.medio_pago} onChange={(e) => setAportePagoForm({...aportePagoForm, medio_pago: e.target.value})}><option>Efectivo</option><option>Transferencia</option><option>Cheque</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Referencia</label><input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" value={aportePagoForm.referencia} onChange={(e) => setAportePagoForm({...aportePagoForm, referencia: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Observaciones</label><textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={aportePagoForm.observaciones} onChange={(e) => setAportePagoForm({...aportePagoForm, observaciones: e.target.value})} /></div>
              </div>
              <div className="p-5 border-t flex justify-end gap-3">
                <button type="button" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg" onClick={() => setModalAporteOpen(false)}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Registrar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial Aporte */}
      {historialAporteOpen && selectedAporte && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-5 border-b flex justify-between items-center">
              <div><h2 className="text-lg font-bold">Historial de Pagos - Aporte</h2><p className="text-sm text-gray-500">{selectedAporte.colaborador} - {selectedAporte.periodo} ({selectedAporte.tipo_aporte === 'essalud' ? 'ESSALUD' : selectedAporte.tipo_aporte === 'vida_ley' ? 'Vida Ley' : 'SCTR'})</p></div>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setHistorialAporteOpen(false)}><X size={20} /></button>
            </div>
            <div className="p-5 max-h-80 overflow-y-auto">
              {historialAportePagos.length === 0 ? (
                <p className="text-center text-gray-400">Sin pagos registrados</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-gray-500"><th className="text-left py-2">Fecha</th><th className="text-right py-2">Monto</th><th className="text-left py-2">Medio</th><th className="text-left py-2">Usuario</th></tr></thead>
                  <tbody>{historialAportePagos.map(h => (
                    <tr key={h.id} className="border-b hover:bg-gray-50">
                      <td className="py-2">{h.fecha}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(h.monto, 'PEN')}</td>
                      <td className="py-2">{h.medio_pago || '-'}</td>
                      <td className="py-2">{h.usuario || '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 text-right"><button className="px-4 py-2 bg-gray-200 rounded-lg" onClick={() => setHistorialAporteOpen(false)}>Cerrar</button></div>
          </div>
        </div>
      )}

      {/* Modal Pago Planilla Secundaria */}
      {modalPlanillaSecOpen && selectedPlanillaSec && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Registrar Pago - Planilla Secundaria</h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setModalPlanillaSecOpen(false)}><X size={20} /></button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <p><strong>Colaborador:</strong> {selectedPlanillaSec.colaborador}</p>
              <p><strong>Concepto:</strong> {selectedPlanillaSec.concepto}</p>
              <p><strong>Periodo:</strong> {selectedPlanillaSec.periodo}</p>
              <p><strong>Pendiente:</strong> {formatCurrency(selectedPlanillaSec.monto_pendiente, 'PEN')}</p>
            </div>
            <form onSubmit={handleRegistrarPagoPlanillaSec}>
              <div className="space-y-3">
                <div><label className="block text-sm font-medium mb-1">Monto</label><input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={planillaSecPagoForm.monto} onChange={(e) => setPlanillaSecPagoForm({...planillaSecPagoForm, monto: e.target.value})} required /></div>
                <div><label className="block text-sm font-medium mb-1">Medio de Pago</label><select className="w-full border rounded-lg px-3 py-2 text-sm" value={planillaSecPagoForm.medio_pago} onChange={(e) => setPlanillaSecPagoForm({...planillaSecPagoForm, medio_pago: e.target.value})}><option>Efectivo</option><option>Transferencia</option><option>Cheque</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Referencia</label><input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" value={planillaSecPagoForm.referencia} onChange={(e) => setPlanillaSecPagoForm({...planillaSecPagoForm, referencia: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Observaciones</label><textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={planillaSecPagoForm.observaciones} onChange={(e) => setPlanillaSecPagoForm({...planillaSecPagoForm, observaciones: e.target.value})} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg" onClick={() => setModalPlanillaSecOpen(false)}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">Registrar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {programarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
            <div className="flex justify-between items-center p-4 md:p-6 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Programar Pago</h3>
              <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setProgramarOpen(false)}>
                <X size={20}/>
              </button>
            </div>

            <div className="p-4 md:p-6">
              {programarBulkIds.length > 0 ? (
                <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                  Programación masiva: {programarBulkIds.length} comprobantes seleccionados.
                </div>
              ) : (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  <div className="font-semibold">{programarTarget?.proveedor_razon_social}</div>
                  <div className="text-xs text-gray-500 font-mono">{programarTarget?.serie}-{programarTarget?.numero}</div>
                  <div className="text-xs text-gray-500">Saldo: {formatCurrency(programarTarget?.saldo_pendiente || 0, programarTarget?.moneda || 'PEN')}</div>
                </div>
              )}

              <form onSubmit={crearProgramacion}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Fecha programada</label>
                    <input
                      type="date"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={programarForm.fecha_programada}
                      onChange={(e) => setProgramarForm((p) => ({ ...p, fecha_programada: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Prioridad</label>
                    <select
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                      value={programarForm.prioridad}
                      onChange={(e) => setProgramarForm((p) => ({ ...p, prioridad: Number(e.target.value) }))}
                    >
                      <option value={1}>1 (Alta)</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5 (Baja)</option>
                    </select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Monto (opcional en masivo)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={programarForm.monto}
                      onChange={(e) => setProgramarForm((p) => ({ ...p, monto: e.target.value }))}
                      placeholder={programarBulkIds.length > 0 ? 'Vacío = saldo pendiente de cada comprobante' : ''}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Responsable (opcional)</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={userSearch}
                        onChange={(e) => searchUsers(e.target.value)}
                        placeholder="Buscar usuario..."
                      />
                      {userSearching && (
                        <div className="absolute right-3 top-2.5 text-gray-400">
                          <Loader size={16} className="animate-spin" />
                        </div>
                      )}
                      {userResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-56 overflow-auto">
                          {userResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                setProgramarForm((p) => ({ ...p, responsable_usuario_id: String(u.id) }));
                                setUserSearch(u.usuario || u.nombre || '');
                                setUserResults([]);
                              }}
                            >
                              <div className="font-medium text-gray-800">{u.usuario || u.nombre}</div>
                              <div className="text-xs text-gray-400">{u.email || ''}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Notas</label>
                    <textarea
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-20"
                      value={programarForm.notas}
                      onChange={(e) => setProgramarForm((p) => ({ ...p, notas: e.target.value }))}
                      placeholder="Observaciones para programación..."
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" onClick={() => setProgramarOpen(false)}>Cancelar</button>
                  <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial Planilla Secundaria */}
      {historialPlanillaSecOpen && selectedPlanillaSec && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div><h2 className="text-lg font-bold">Historial de Pagos</h2><p className="text-sm text-gray-500">{selectedPlanillaSec.colaborador} - {selectedPlanillaSec.concepto}</p></div>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setHistorialPlanillaSecOpen(false)}><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {historialPlanillaSecPagos.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay pagos registrados</p>
              ) : (
                <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-2 py-2 text-xs font-semibold text-gray-500">Fecha</th><th className="px-2 py-2 text-xs font-semibold text-gray-500">Monto</th><th className="px-2 py-2 text-xs font-semibold text-gray-500">Medio</th><th className="px-2 py-2 text-xs font-semibold text-gray-500">Ref.</th><th className="px-2 py-2 text-xs font-semibold text-gray-500">Obs.</th><th className="px-2 py-2 text-xs font-semibold text-gray-500">Usuario</th></tr></thead>
                  <tbody>{historialPlanillaSecPagos.map(h => (
                    <tr key={h.id} className="border-b border-gray-50">
                      <td className="px-2 py-2">{h.fecha}</td><td className="px-2 py-2 font-medium">{formatCurrency(h.monto, 'PEN')}</td><td className="px-2 py-2">{h.medio_pago || '-'}</td><td className="px-2 py-2">{h.referencia || '-'}</td><td className="px-2 py-2 text-gray-500">{h.observaciones || '-'}</td><td className="px-2 py-2">{h.usuario || '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 text-right"><button className="px-4 py-2 bg-gray-200 rounded-lg" onClick={() => setHistorialPlanillaSecOpen(false)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CuentasPorPagar;
