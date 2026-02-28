import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Building2, DollarSign, Calendar, FileText, Settings, CreditCard, 
  Landmark, Edit, Trash2, X, Check, AlertTriangle, Mail, Search, RefreshCw 
} from 'lucide-react';
import SmtpSettings from './SmtpSettings';

const ConfiguracionGeneral = () => {
  const [activeTab, setActiveTab] = useState('empresa');
  const [loading, setLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Modal de Confirmación
  const [confirmModal, setConfirmModal] = useState({ 
    isOpen: false, 
    title: '', 
    message: '', 
    onConfirm: null 
  });

  // --- Estados de Datos ---
  const [empresaData, setEmpresaData] = useState({
    ruc: '', razon_social: '', nombre_comercial: '', domicilio_fiscal: '',
    moneda_principal: 'PEN', anio_fiscal: new Date().getFullYear(),
    logo: '', // Add logo path state
    configuracion_sunat: { 
        sol_user: '', sol_pass: '', client_id: '', client_secret: '', certificado_path: '',
        nubefact_ruta: '', nubefact_token: '',
        apiperu_token: '', apiperu_url: 'https://apiperu.dev/api/'
    }
  });

  const [logoFile, setLogoFile] = useState(null); // State for the file to upload

  const [sedesList, setSedesList] = useState([]);
  const [showSedeModal, setShowSedeModal] = useState(false);
  const [currentSede, setCurrentSede] = useState({ id: null, codigo_sunat: '', nombre: '', direccion: '', es_principal: false });

  const [monedas, setMonedas] = useState([]);
  const [tipoCambioFecha, setTipoCambioFecha] = useState(new Date().toISOString().split('T')[0]);
  const [tipoCambio, setTipoCambio] = useState({ compra: '', venta: '' });

  const [periodos, setPeriodos] = useState([]);
  
  const [centrosCosto, setCentrosCosto] = useState([]);
  const [showCentroModal, setShowCentroModal] = useState(false);
  const [currentCentro, setCurrentCentro] = useState({ id: null, codigo: '', nombre: '' });

  const [seriesList, setSeriesList] = useState([]);
  const [showSerieModal, setShowSerieModal] = useState(false);
  const [selectedSedeForSeries, setSelectedSedeForSeries] = useState('');
  const [currentSerie, setCurrentSerie] = useState({ id: null, tipo_comprobante: '01', serie: '', correlativo_actual: 0 });

  const token = localStorage.getItem('token');
  const axiosConfig = { headers: { Authorization: `Bearer ${token}` } };
  // API_URL imported from config


  // --- Efectos ---
  useEffect(() => { fetchEmpresa(); }, []);

  useEffect(() => {
    const loadTabData = async () => {
      try {
        switch(activeTab) {
            case 'sedes': await fetchSedes(); break;
            case 'moneda': await fetchMonedas(); await fetchTipoCambio(); break;
            case 'fiscal': await fetchCentrosCosto(); break;
            case 'periodos': await fetchPeriodos(); break;
            case 'comprobantes': 
              await fetchSedes(); 
              if(sedesList.length > 0 && !selectedSedeForSeries) setSelectedSedeForSeries(sedesList[0].id); 
              break;
        }
      } catch (error) {
        console.error("Error loading tab data", error);
      }
    };
    loadTabData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'comprobantes' && selectedSedeForSeries) fetchSeries(selectedSedeForSeries);
  }, [selectedSedeForSeries, activeTab]);

  useEffect(() => {
    if (activeTab === 'moneda') fetchTipoCambio();
  }, [tipoCambioFecha]);

  // --- API Functions (Simplificadas con Toast) ---
  const handleApiError = (err, defaultMsg) => {
    console.error(err);
    const msg = err.response?.data?.message || err.message || defaultMsg;
    toast.error(msg);
  };

  const fetchEmpresa = async () => {
    try {
      const res = await axios.get(`${API_URL}empresa.php?t=${new Date().getTime()}`, axiosConfig);
      if (res.data && Object.keys(res.data).length > 0) {
        setEmpresaData(prev => ({ ...prev, ...res.data, configuracion_sunat: res.data.configuracion_sunat || prev.configuracion_sunat }));
      }
    } catch (err) { console.error(err); }
  };

  const saveEmpresa = async () => {
    setLoading(true);
    
    const formData = new FormData();
    formData.append('ruc', empresaData.ruc);
    formData.append('razon_social', empresaData.razon_social);
    formData.append('nombre_comercial', empresaData.nombre_comercial);
    formData.append('domicilio_fiscal', empresaData.domicilio_fiscal);
    formData.append('moneda_principal', empresaData.moneda_principal);
    formData.append('anio_fiscal', empresaData.anio_fiscal);
    
    // Append complex object as string
    formData.append('configuracion_sunat', JSON.stringify(empresaData.configuracion_sunat));

    if (logoFile) {
        formData.append('logo', logoFile);
    }

    const promise = axios.post(`${API_URL}empresa.php`, formData, {
        ...axiosConfig,
        headers: {
            ...axiosConfig.headers,
            'Content-Type': 'multipart/form-data'
        }
    });

    toast.promise(promise, {
      loading: 'Guardando datos...',
      success: 'Datos de empresa guardados',
      error: 'Error al guardar datos'
    });
    try { 
        const res = await promise; 
        if (res.data.logo) {
             setEmpresaData(prev => ({ ...prev, logo: res.data.logo }));
             setLogoFile(null); // Reset file input
        }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchSedes = async () => {
    try { 
        const res = await axios.get(`${API_URL}sedes.php`, axiosConfig); 
        if (Array.isArray(res.data)) {
            setSedesList(res.data); 
        } else {
            console.error("Respuesta inválida de sedes:", res.data);
            setSedesList([]);
            toast.error("Error al cargar lista de sedes");
        }
    } catch (err) { handleApiError(err, 'Error cargando sedes'); }
  };

  const saveSede = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (currentSede.id) await axios.put(`${API_URL}sedes.php`, currentSede, axiosConfig);
      else await axios.post(`${API_URL}sedes.php`, currentSede, axiosConfig);
      setShowSedeModal(false);
      fetchSedes();
      toast.success('Sede guardada correctamente');
    } catch (err) { handleApiError(err, 'Error al guardar sede'); } finally { setLoading(false); }
  };

  const confirmDeleteSede = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Sede',
      message: '¿Estás seguro de que deseas eliminar esta sede? Esta acción no se puede deshacer.',
      onConfirm: () => deleteSede(id)
    });
  };

  const deleteSede = async (id) => {
    try {
      await axios.delete(`${API_URL}sedes.php`, { ...axiosConfig, data: { id } });
      fetchSedes();
      toast.success('Sede eliminada');
    } catch (err) { handleApiError(err, 'Error al eliminar sede'); } finally { closeConfirmModal(); }
  };

  const handleSyncSedes = async () => {
    setLoading(true);
    const promise = axios.post(`${API_URL}sedes.php?action=sync_sunat`, {}, axiosConfig);
    
    toast.promise(promise, {
        loading: 'Sincronizando Sedes y Series desde SUNAT...',
        success: (res) => {
            fetchSedes();
            return res.data.message || 'Sedes y Series sincronizadas';
        },
        error: (err) => err.response?.data?.message || 'Error al sincronizar sedes'
    });
    
    try { await promise; } catch(err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchMonedas = async () => {
      try { const res = await axios.get(`${API_URL}monedas.php`, axiosConfig); setMonedas(res.data); } catch (err) { console.error(err); }
  };

  const fetchTipoCambio = async () => {
      try {
          const res = await axios.get(`${API_URL}monedas.php?tipo_cambio=1&fecha=${tipoCambioFecha}`, axiosConfig);
          if (res.data && res.data.length > 0) setTipoCambio({ compra: res.data[0].compra, venta: res.data[0].venta });
          else setTipoCambio({ compra: '', venta: '' });
      } catch (err) { console.error(err); }
  };

  const handleConsultarSunat = async () => {
      setLoading(true);
      try {
          const res = await axios.get(`${API_URL}monedas.php?action=consultar_sunat&fecha=${tipoCambioFecha}`, axiosConfig);
          if (res.data.success) {
              setTipoCambio({ compra: res.data.compra, venta: res.data.venta });
              toast.success('Tipo de cambio obtenido de SUNAT');
          } else {
              toast.error('No se encontró tipo de cambio para esta fecha');
          }
      } catch (err) { 
          console.error(err);
          toast.error('Error al consultar SUNAT');
      } finally {
          setLoading(false);
      }
  };

  const saveTipoCambio = async () => {
      setLoading(true);
      const promise = axios.post(`${API_URL}monedas.php`, { fecha: tipoCambioFecha, compra: tipoCambio.compra, venta: tipoCambio.venta }, axiosConfig);
      toast.promise(promise, { loading: 'Guardando TC...', success: 'Tipo de cambio actualizado', error: 'Error al guardar TC' });
      try { await promise; } catch(err){console.error(err);} finally { setLoading(false); }
  };

  const fetchPeriodos = async () => {
      try { const res = await axios.get(`${API_URL}periodos.php?anio=${empresaData.anio_fiscal}`, axiosConfig); setPeriodos(res.data); } catch (err) { console.error(err); }
  };

  const generatePeriodos = async () => {
      setLoading(true);
      try {
          await axios.post(`${API_URL}periodos.php`, { anio: empresaData.anio_fiscal }, axiosConfig);
          fetchPeriodos();
          toast.success('Periodos generados exitosamente');
      } catch (err) { handleApiError(err, 'Error generando periodos'); } finally { setLoading(false); }
  };

  const togglePeriodo = async (id, currentStatus) => {
      try {
          const newStatus = currentStatus === 'abierto' ? 'cerrado' : 'abierto';
          await axios.put(`${API_URL}periodos.php`, { id, estado: newStatus }, axiosConfig);
          fetchPeriodos();
          toast.success(`Periodo ${newStatus === 'abierto' ? 'abierto' : 'cerrado'}`);
      } catch (err) { handleApiError(err, 'Error al cambiar estado'); }
  };

  const fetchCentrosCosto = async () => {
      try { const res = await axios.get(`${API_URL}centros_costo.php`, axiosConfig); setCentrosCosto(res.data); } catch (err) { console.error(err); }
  };

  const saveCentro = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
          if (currentCentro.id) await axios.put(`${API_URL}centros_costo.php`, currentCentro, axiosConfig);
          else await axios.post(`${API_URL}centros_costo.php`, currentCentro, axiosConfig);
          setShowCentroModal(false);
          fetchCentrosCosto();
          toast.success('Centro de costo guardado');
      } catch (err) { handleApiError(err, 'Error al guardar centro'); } finally { setLoading(false); }
  };

  const confirmDeleteCentro = (id) => {
    setConfirmModal({
        isOpen: true,
        title: 'Eliminar Centro de Costo',
        message: '¿Estás seguro? Esto podría afectar registros contables.',
        onConfirm: () => deleteCentro(id)
    });
  };

  const deleteCentro = async (id) => {
      try {
          await axios.delete(`${API_URL}centros_costo.php`, { ...axiosConfig, data: { id } });
          fetchCentrosCosto();
          toast.success('Centro eliminado');
      } catch (err) { handleApiError(err, 'Error al eliminar'); } finally { closeConfirmModal(); }
  };

  const fetchSeries = async (sedeId) => {
      if(!sedeId) return;
      try { 
          const res = await axios.get(`${API_URL}series.php?sede_id=${sedeId}`, axiosConfig); 
          setSeriesList(Array.isArray(res.data) ? res.data : []); 
      } catch (err) { console.error(err); }
  };

  const saveSerie = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
          const payload = { ...currentSerie, sede_id: selectedSedeForSeries };
          if (currentSerie.id) await axios.put(`${API_URL}series.php`, payload, axiosConfig);
          else await axios.post(`${API_URL}series.php`, payload, axiosConfig);
          setShowSerieModal(false);
          fetchSeries(selectedSedeForSeries);
          toast.success('Serie guardada');
      } catch (err) { handleApiError(err, 'Error al guardar serie'); } finally { setLoading(false); }
  };

  const confirmDeleteSerie = (id) => {
      setConfirmModal({
          isOpen: true,
          title: 'Eliminar Serie',
          message: '¿Eliminar esta serie? No podrás emitir comprobantes con ella.',
          onConfirm: () => deleteSerie(id)
      });
  };

  const deleteSerie = async (id) => {
      try {
          await axios.delete(`${API_URL}series.php`, { ...axiosConfig, data: { id } });
          fetchSeries(selectedSedeForSeries);
          toast.success('Serie eliminada');
      } catch (err) { handleApiError(err, 'Error al eliminar'); } finally { closeConfirmModal(); }
  };

  const handleSyncNubefact = async () => {
    if (!seriesList.length) {
        toast.error("No hay series registradas en esta sede para sincronizar. Crea una serie primero.");
        return;
    }
    
    const seriesString = seriesList.map(s => s.serie).join(',');
    setLoading(true);
    
    // Use promise toast
    const promise = axios.get(`${API_URL}facturacion.php?action=sincronizar_nubefact&series=${seriesString}&rango=5`, axiosConfig);
    
    toast.promise(promise, {
        loading: 'Sincronizando con Nubefact... (esto puede tomar unos minutos)',
        success: (res) => {
            fetchSeries(selectedSedeForSeries);
            return res.data.message || 'Sincronización completada';
        },
        error: 'Error al sincronizar'
    });
    
    try {
        await promise;
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const closeConfirmModal = () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });

  // --- Render Helpers ---
  const tabs = [
    { id: 'empresa', label: 'Empresa', icon: Building2 },
    { id: 'sedes', label: 'Sedes', icon: Landmark },
    { id: 'moneda', label: 'Monedas', icon: DollarSign },
    { id: 'fiscal', label: 'Fiscal', icon: FileText },
    { id: 'periodos', label: 'Periodos', icon: Calendar },
    { id: 'sunat', label: 'SUNAT', icon: Settings },
    { id: 'comprobantes', label: 'Series', icon: CreditCard },
    { id: 'smtp', label: 'Correo (SMTP)', icon: Mail },
  ];

  const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
                <button 
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" 
                    onClick={onClose}
                >
                    <X size={20}/>
                </button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    </div>
  );

  const ConfirmationDialog = () => {
    if (!confirmModal.isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all">
                <div className="px-6 py-4 flex items-center gap-3 border-b border-gray-100 bg-red-50/50">
                    <div className="p-2 bg-red-100 text-red-600 rounded-full shrink-0">
                        <AlertTriangle size={24}/> 
                    </div>
                    <h3 className="font-bold text-gray-800 text-lg">{confirmModal.title}</h3>
                </div>
                <div className="p-6">
                    <p className="text-gray-600 leading-relaxed">{confirmModal.message}</p>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                    <button 
                        className="px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium rounded-lg transition-colors" 
                        onClick={closeConfirmModal}
                    >
                        Cancelar
                    </button>
                    <button 
                        className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 font-medium rounded-lg shadow-sm transition-colors" 
                        onClick={confirmModal.onConfirm}
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <ConfirmationDialog />
      
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Settings size={24} /> 
            </div>
            Configuración General
        </h1>
        <p className="text-gray-500 mt-1 ml-11">Administra los parámetros globales del sistema</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar / Navigation */}
        <div className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden sticky top-6">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Menú</h3>
                </div>
                <div className="p-2 space-y-1">
                  {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button 
                        key={tab.id} 
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                            isActive 
                            ? 'bg-blue-50 text-blue-700 shadow-sm' 
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`} 
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <Icon size={18} className={isActive ? 'text-blue-600' : 'text-gray-400'} /> 
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
            {activeTab === 'empresa' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/30">
                        <h3 className="font-bold text-gray-800 text-lg">Datos de la Empresa</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">RUC</label>
                            <input 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                value={empresaData.ruc} 
                                onChange={e => setEmpresaData({...empresaData, ruc: e.target.value})} 
                                placeholder="20123456789" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Razón Social</label>
                            <input 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                value={empresaData.razon_social} 
                                onChange={e => setEmpresaData({...empresaData, razon_social: e.target.value})} 
                                placeholder="Mi Empresa S.A.C." 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Nombre Comercial</label>
                            <input 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                value={empresaData.nombre_comercial} 
                                onChange={e => setEmpresaData({...empresaData, nombre_comercial: e.target.value})} 
                                placeholder="Mi Marca" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Domicilio Fiscal</label>
                            <input 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                value={empresaData.domicilio_fiscal} 
                                onChange={e => setEmpresaData({...empresaData, domicilio_fiscal: e.target.value})} 
                                placeholder="Av. Principal 123, Lima" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Moneda Principal</label>
                            <select 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" 
                                value={empresaData.moneda_principal} 
                                onChange={e => setEmpresaData({...empresaData, moneda_principal: e.target.value})}
                            >
                                <option value="PEN">Soles (PEN)</option>
                                <option value="USD">Dólares (USD)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Año Fiscal</label>
                            <input 
                                type="number" 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                value={empresaData.anio_fiscal} 
                                onChange={e => setEmpresaData({...empresaData, anio_fiscal: e.target.value})} 
                            />
                        </div>
                         {/* Logo Upload */}
                         <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-gray-700">Logo de la Empresa</label>
                            <div className="flex items-center gap-4">
                                {empresaData.logo && (
                                    <div className="w-16 h-16 border rounded overflow-hidden">
                                        <img src={`${API_URL}public_files.php?path=${encodeURIComponent(empresaData.logo)}`} alt="Logo" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <input 
                                    type="file" 
                                    accept="image/*"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    onChange={e => setLogoFile(e.target.files[0])}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="px-6 py-4 bg-gray-50 flex justify-end">
                        <button 
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2" 
                            onClick={saveEmpresa}
                            disabled={loading}
                        >
                            {loading ? <RefreshCw className="animate-spin" size={20}/> : <Check size={20}/>}
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'sedes' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-gray-800">Sedes de la Empresa</h2>
                        <div className="flex gap-2">
                            <button 
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                                onClick={handleSyncSedes}
                                disabled={loading}
                            >
                                <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
                                Sincronizar SUNAT
                            </button>
                            <button 
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                                onClick={() => { setCurrentSede({ id: null, codigo_sunat: '', nombre: '', direccion: '', es_principal: false }); setShowSedeModal(true); }}
                            >
                                + Nueva Sede
                            </button>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                                    <th className="px-6 py-4">Código</th>
                                    <th className="px-6 py-4">Nombre</th>
                                    <th className="px-6 py-4">Dirección</th>
                                    <th className="px-6 py-4 text-center">Principal</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sedesList.map(sede => (
                                    <tr key={sede.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 text-gray-600 font-mono text-sm">{sede.codigo_sunat}</td>
                                        <td className="px-6 py-4 font-medium text-gray-800">{sede.nombre}</td>
                                        <td className="px-6 py-4 text-gray-600">{sede.direccion}</td>
                                        <td className="px-6 py-4 text-center">
                                            {sede.es_principal ? (
                                                <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full">
                                                    <Check size={14} />
                                                </span>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" onClick={() => { setCurrentSede(sede); setShowSedeModal(true); }}><Edit size={16}/></button>
                                                <button className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" onClick={() => confirmDeleteSede(sede.id)}><Trash2 size={16}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {showSedeModal && (
                        <Modal title="Gestión de Sede" onClose={() => setShowSedeModal(false)}>
                            <form onSubmit={saveSede} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Código SUNAT</label>
                                    <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" required value={currentSede.codigo_sunat} onChange={e => setCurrentSede({...currentSede, codigo_sunat: e.target.value})} placeholder="0000" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Nombre Sede</label>
                                    <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" required value={currentSede.nombre} onChange={e => setCurrentSede({...currentSede, nombre: e.target.value})} placeholder="Sede Principal" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Dirección</label>
                                    <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={currentSede.direccion} onChange={e => setCurrentSede({...currentSede, direccion: e.target.value})} placeholder="Av. Siempre Viva 123" />
                                </div>
                                <div className="flex items-center gap-2 pt-2">
                                    <input type="checkbox" id="es_principal" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" checked={currentSede.es_principal} onChange={e => setCurrentSede({...currentSede, es_principal: e.target.checked})} />
                                    <label htmlFor="es_principal" className="text-sm font-medium text-gray-700">Es Sede Principal</label>
                                </div>
                                <div className="pt-4">
                                    <button type="submit" className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors">Guardar Sede</button>
                                </div>
                            </form>
                        </Modal>
                    )}
                </div>
            )}

            {activeTab === 'moneda' && (
                <div className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-bold text-gray-800">Tipo de Cambio</h2>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-6">
                        <div className="flex flex-col md:flex-row gap-4 items-end mb-6">
                            <div className="space-y-2 flex-1">
                                <label className="text-sm font-medium text-gray-700">Fecha</label>
                                <input 
                                    type="date" 
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    value={tipoCambioFecha} 
                                    onChange={e => setTipoCambioFecha(e.target.value)} 
                                />
                            </div>
                            <button 
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2 h-10"
                                onClick={handleConsultarSunat}
                                disabled={loading}
                            >
                                <Search size={18} /> Consultar SUNAT
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Compra</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-gray-400">S/</span>
                                    <input 
                                        type="number" step="0.001" 
                                        className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                        value={tipoCambio.compra} 
                                        onChange={e => setTipoCambio({...tipoCambio, compra: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Venta</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-gray-400">S/</span>
                                    <input 
                                        type="number" step="0.001" 
                                        className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                        value={tipoCambio.venta} 
                                        onChange={e => setTipoCambio({...tipoCambio, venta: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button 
                                className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2" 
                                onClick={saveTipoCambio}
                                disabled={loading}
                            >
                                <Check size={20}/> Guardar Tipo de Cambio
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'fiscal' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center">
                         <h2 className="text-xl font-bold text-gray-800">Centros de Costo</h2>
                         <button 
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors"
                            onClick={() => { setCurrentCentro({ id: null, codigo: '', nombre: '' }); setShowCentroModal(true); }}
                        >
                            + Nuevo Centro
                        </button>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                                    <th className="px-6 py-4">Código</th>
                                    <th className="px-6 py-4">Nombre</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {centrosCosto.map(centro => (
                                    <tr key={centro.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-gray-600">{centro.codigo}</td>
                                        <td className="px-6 py-4 text-gray-800 font-medium">{centro.nombre}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" onClick={() => { setCurrentCentro(centro); setShowCentroModal(true); }}><Edit size={16}/></button>
                                                <button className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" onClick={() => confirmDeleteCentro(centro.id)}><Trash2 size={16}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {showCentroModal && (
                        <Modal title="Centro de Costo" onClose={() => setShowCentroModal(false)}>
                            <form onSubmit={saveCentro} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Código</label>
                                    <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" required value={currentCentro.codigo} onChange={e => setCurrentCentro({...currentCentro, codigo: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Nombre</label>
                                    <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" required value={currentCentro.nombre} onChange={e => setCurrentCentro({...currentCentro, nombre: e.target.value})} />
                                </div>
                                <div className="pt-4">
                                    <button type="submit" className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors">Guardar Centro</button>
                                </div>
                            </form>
                        </Modal>
                    )}
                </div>
            )}

            {activeTab === 'periodos' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-gray-800">Periodos Contables</h2>
                        <button 
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                            onClick={generatePeriodos}
                            disabled={loading}
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                            Generar Periodos
                        </button>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                         <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                                    <th className="px-6 py-4">Mes</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {periodos.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-800">
                                            {new Date(p.fecha_inicio).toLocaleString('es-PE', { month: 'long', year: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                                p.estado === 'abierto' 
                                                ? 'bg-green-100 text-green-700 border border-green-200' 
                                                : 'bg-red-100 text-red-700 border border-red-200'
                                            }`}>
                                                {p.estado.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                                                    p.estado === 'abierto'
                                                    ? 'text-red-600 border-red-200 hover:bg-red-50'
                                                    : 'text-green-600 border-green-200 hover:bg-green-50'
                                                }`}
                                                onClick={() => togglePeriodo(p.id, p.estado)}
                                            >
                                                {p.estado === 'abierto' ? 'Cerrar Periodo' : 'Abrir Periodo'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'sunat' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/30">
                         <h3 className="font-bold text-gray-800 text-lg">Configuración SUNAT / Facturación</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Usuario SOL</label>
                                <input 
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    value={empresaData.configuracion_sunat.sol_user} 
                                    onChange={e => setEmpresaData({
                                        ...empresaData, 
                                        configuracion_sunat: { ...empresaData.configuracion_sunat, sol_user: e.target.value }
                                    })} 
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Clave SOL</label>
                                <input 
                                    type="password" 
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    value={empresaData.configuracion_sunat.sol_pass} 
                                    onChange={e => setEmpresaData({
                                        ...empresaData, 
                                        configuracion_sunat: { ...empresaData.configuracion_sunat, sol_pass: e.target.value }
                                    })} 
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-6">
                            <h4 className="font-semibold text-gray-800 mb-4">Integración Nubefact / PSE</h4>
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Ruta / URL</label>
                                    <input 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                        value={empresaData.configuracion_sunat.nubefact_ruta} 
                                        onChange={e => setEmpresaData({
                                            ...empresaData, 
                                            configuracion_sunat: { ...empresaData.configuracion_sunat, nubefact_ruta: e.target.value }
                                        })} 
                                        placeholder="https://api.pse.pe/api/v1/..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Token</label>
                                    <input 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                        value={empresaData.configuracion_sunat.nubefact_token} 
                                        onChange={e => setEmpresaData({
                                            ...empresaData, 
                                            configuracion_sunat: { ...empresaData.configuracion_sunat, nubefact_token: e.target.value }
                                        })} 
                                    />
                                </div>
                            </div>
                        </div>

                         <div className="border-t border-gray-100 pt-6">
                            <h4 className="font-semibold text-gray-800 mb-4">Consulta RUC/DNI (ApiPeru.dev)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Token ApiPeru</label>
                                    <input 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                        value={empresaData.configuracion_sunat.apiperu_token} 
                                        onChange={e => setEmpresaData({
                                            ...empresaData, 
                                            configuracion_sunat: { ...empresaData.configuracion_sunat, apiperu_token: e.target.value }
                                        })} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                             <button 
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2" 
                                onClick={saveEmpresa}
                                disabled={loading}
                            >
                                {loading ? <RefreshCw className="animate-spin" size={20}/> : <Check size={20}/>}
                                Guardar Configuración
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'comprobantes' && (
                 <div className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-bold text-gray-800">Series de Comprobantes</h2>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-6">
                        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
                            <div className="flex-1 space-y-2 w-full">
                                <label className="text-sm font-medium text-gray-700">Seleccionar Sede</label>
                                <select 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" 
                                    value={selectedSedeForSeries} 
                                    onChange={e => setSelectedSedeForSeries(e.target.value)}
                                >
                                    {sedesList.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                </select>
                            </div>
                            <button 
                                className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors ml-auto flex items-center justify-center gap-2" 
                                onClick={() => { setCurrentSerie({ id: null, tipo_comprobante: '01', serie: '', correlativo_actual: 0 }); setShowSerieModal(true); }}
                            >
                                + Nueva Serie
                            </button>
                            <button 
                                className="w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2" 
                                onClick={handleSyncNubefact}
                                disabled={loading}
                            >
                                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                                Sincronizar
                            </button>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                                        <th className="px-6 py-3">Tipo</th>
                                        <th className="px-6 py-3">Serie</th>
                                        <th className="px-6 py-3">Correlativo</th>
                                        <th className="px-6 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                            <tbody className="divide-y divide-gray-100">
                                {seriesList.map(s => (
                                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-md font-medium border ${
                                                s.tipo_comprobante === '01' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                s.tipo_comprobante === '03' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                'bg-gray-100 text-gray-700 border-gray-200'
                                            }`}>
                                                {s.tipo_comprobante === '01' ? 'Factura' : s.tipo_comprobante === '03' ? 'Boleta' : s.tipo_comprobante}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 font-mono font-bold text-gray-800">{s.serie}</td>
                                        <td className="px-6 py-3 text-gray-600">{s.correlativo_actual}</td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" onClick={() => { setCurrentSerie(s); setShowSerieModal(true); }}><Edit size={16}/></button>
                                                <button className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" onClick={() => confirmDeleteSerie(s.id)}><Trash2 size={16}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                    {showSerieModal && (
                        <Modal title="Gestión de Serie" onClose={() => setShowSerieModal(false)}>
                             <form onSubmit={saveSerie} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Tipo Comprobante</label>
                                    <select 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" 
                                        value={currentSerie.tipo_comprobante} 
                                        onChange={e => setCurrentSerie({...currentSerie, tipo_comprobante: e.target.value})}
                                    >
                                        <option value="01">Factura</option>
                                        <option value="03">Boleta</option>
                                        <option value="07">Nota de Crédito</option>
                                        <option value="08">Nota de Débito</option>
                                        <option value="09">Guía de Remisión</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Serie (Ej: F001)</label>
                                    <input 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono uppercase" 
                                        required 
                                        maxLength="4" 
                                        value={currentSerie.serie} 
                                        onChange={e => setCurrentSerie({...currentSerie, serie: e.target.value})} 
                                        placeholder="F001" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Correlativo Inicial</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                        value={currentSerie.correlativo_actual} 
                                        onChange={e => setCurrentSerie({...currentSerie, correlativo_actual: e.target.value})} 
                                    />
                                </div>
                                <div className="pt-4">
                                    <button 
                                        type="submit" 
                                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors"
                                    >
                                        Guardar Serie
                                    </button>
                                </div>
                            </form>
                        </Modal>
                    )}
                 </div>
            )}

            {activeTab === 'smtp' && <SmtpSettings />}
        </div>
      </div>
    </div>
  );
};

export default ConfiguracionGeneral;
