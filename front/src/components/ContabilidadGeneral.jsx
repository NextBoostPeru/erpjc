import React, { useState, useEffect } from 'react';
import { 
  Book, FileText, Calculator, PieChart, RefreshCw, ShieldCheck, 
  Plus, Search, Filter, Download, ChevronDown, Edit, Trash2, CheckCircle, X, Save 
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../api/config';

const ContabilidadGeneral = () => {
  const [activeTab, setActiveTab] = useState('pcge');
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [pcgeData, setPcgeData] = useState([]);
  const [asientosData, setAsientosData] = useState([]);
  const [reportData, setReportData] = useState([]);
  
  // Search/Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ 
    start: new Date().toISOString().slice(0, 8) + '01', 
    end: new Date().toISOString().slice(0, 10) 
  });
  const [reportType, setReportType] = useState('diario');
  const [selectedAccountForMayor, setSelectedAccountForMayor] = useState('');
  const [auditResults, setAuditResults] = useState([]);
  const [movementAccounts, setMovementAccounts] = useState([]);

  // Modal States
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  // Form States
  const [accountForm, setAccountForm] = useState({ codigo: '', nombre: '', tipo: 'Activo', padre_codigo: '', permite_movimiento: false });
  const [entryForm, setEntryForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    glosa: '',
    tipo_asiento: 'Diario',
    moneda: 'PEN',
    tipo_cambio: 1.0,
    detalles: [{ cuenta_codigo: '', debe: 0, haber: 0 }]
  });

  const tabs = [
    { id: 'pcge', label: 'Plan Contable (PCGE)', icon: Book },
    { id: 'asientos', label: 'Asientos Contables', icon: Edit },
    { id: 'libros', label: 'Libros Contables', icon: FileText },
    { id: 'balance', label: 'Balance Comprobación', icon: PieChart },
    { id: 'procesos', label: 'Apertura y Cierre', icon: RefreshCw },
    { id: 'auditoria', label: 'Auditoría', icon: ShieldCheck },
  ];

  // Fetch Data Effects
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (activeTab === 'pcge') {
        const res = await axios.get(`${API_URL}/contabilidad.php?action=get_pcge&search=${searchTerm}`, { headers });
        setPcgeData(Array.isArray(res.data) ? res.data : []);
      } else if (activeTab === 'asientos') {
        const res = await axios.get(`${API_URL}/contabilidad.php?action=get_asientos`, { headers });
        setAsientosData(Array.isArray(res.data) ? res.data : []);
      } else if (activeTab === 'auditoria') {
        const res = await axios.get(`${API_URL}/contabilidad.php?action=audit_asientos`, { headers });
        setAuditResults(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  // --- PCGE Logic ---
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/contabilidad.php?action=save_cuenta`, accountForm, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Cuenta guardada correctamente");
        setShowAccountModal(false);
        fetchData();
    } catch (error) {
        toast.error("Error al guardar cuenta");
    }
  };

  const handleDeleteAccount = async (codigo) => {
    if(!window.confirm('¿Eliminar cuenta?')) return;
    try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/contabilidad.php?action=delete_cuenta`, { codigo }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Cuenta eliminada");
        fetchData();
    } catch (error) {
        toast.error("Error al eliminar cuenta");
    }
  };

  // --- Entry Logic ---
  const handleAddEntryRow = () => {
    setEntryForm({
        ...entryForm,
        detalles: [...entryForm.detalles, { cuenta_codigo: '', debe: 0, haber: 0 }]
    });
  };

  const handleRemoveEntryRow = (index) => {
    const newDetalles = entryForm.detalles.filter((_, i) => i !== index);
    setEntryForm({ ...entryForm, detalles: newDetalles });
  };

  const updateEntryRow = (index, field, value) => {
    const newDetalles = [...entryForm.detalles];
    newDetalles[index][field] = value;
    setEntryForm({ ...entryForm, detalles: newDetalles });
  };

  const handleSaveEntry = async () => {
    // Validate Balance
    const totalDebe = entryForm.detalles.reduce((sum, item) => sum + Number(item.debe), 0);
    const totalHaber = entryForm.detalles.reduce((sum, item) => sum + Number(item.haber), 0);
    
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
        toast.error(`Asiento descuadrado. Diferencia: ${(totalDebe - totalHaber).toFixed(2)}`);
        return;
    }

    try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/contabilidad.php?action=save_asiento`, entryForm, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Asiento registrado");
        setShowEntryModal(false);
        if (activeTab === 'asientos') fetchData();
    } catch (error) {
        toast.error("Error al registrar asiento");
    }
  };

  const fetchTipoCambio = async (fecha) => {
    try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/facturacion.php?action=consulta_tc&fecha=${fecha}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data && res.data.venta) {
             setEntryForm(prev => ({
                ...prev,
                tipo_cambio: res.data.venta
             }));
             toast.success(`TC Actualizado: ${res.data.venta}`);
        } else {
             // If no rate found or error (e.g. weekend/holiday without published rate yet), maybe don't overwrite or warn
             console.log("No TC found for date");
        }
    } catch (error) {
        console.error("Error fetching TC", error);
    }
  };

  useEffect(() => {
    if (showEntryModal) {
        if (entryForm.fecha) fetchTipoCambio(entryForm.fecha);
        fetchMovementAccounts();
    }
  }, [entryForm.fecha, showEntryModal]);

  const fetchMovementAccounts = async () => {
      try {
          const token = localStorage.getItem('token');
          const res = await axios.get(`${API_URL}/contabilidad.php?action=get_pcge&movimiento=1`, {
              headers: { Authorization: `Bearer ${token}` }
          });
          setMovementAccounts(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
          console.error("Error fetching accounts", error);
      }
  };

  const applyTemplate = (type) => {
      let detalles = [];
      if (type === 'venta') {
          detalles = [
              { cuenta_codigo: '121', debe: 0, haber: 0 },
              { cuenta_codigo: '4011', debe: 0, haber: 0 },
              { cuenta_codigo: '701', debe: 0, haber: 0 }
          ];
      } else if (type === 'compra') {
           detalles = [
              { cuenta_codigo: '601', debe: 0, haber: 0 },
              { cuenta_codigo: '4011', debe: 0, haber: 0 },
              { cuenta_codigo: '421', debe: 0, haber: 0 }
          ];
      } else if (type === 'cobro') {
          detalles = [
              { cuenta_codigo: '101', debe: 0, haber: 0 },
              { cuenta_codigo: '121', debe: 0, haber: 0 }
          ];
      } else if (type === 'pago') {
          detalles = [
              { cuenta_codigo: '421', debe: 0, haber: 0 },
              { cuenta_codigo: '101', debe: 0, haber: 0 }
          ];
      }
      setEntryForm({ ...entryForm, detalles });
  };

  // --- Reports Logic ---
  const fetchReport = async () => {
    setLoading(true);
    try {
        const token = localStorage.getItem('token');
        let url = '';
        
        if (activeTab === 'libros') {
            if (reportType === 'diario') {
                url = `${API_URL}/contabilidad.php?action=get_libro_diario&start=${dateRange.start}&end=${dateRange.end}`;
            } else {
                if (!selectedAccountForMayor) { toast.error("Seleccione una cuenta"); setLoading(false); return; }
                url = `${API_URL}/contabilidad.php?action=get_libro_mayor&cuenta=${selectedAccountForMayor}&year=${dateRange.start.substring(0,4)}`;
            }
        } else if (activeTab === 'balance') {
             url = `${API_URL}/contabilidad.php?action=get_balance_comprobacion&year=${dateRange.start.substring(0,4)}`;
        }
        
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
        setReportData(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
        toast.error("Error al generar reporte");
    } finally {
        setLoading(false);
    }
  };

  // --- Process Logic ---
  const runProcess = async (action) => {
      if(!window.confirm("¿Está seguro de ejecutar este proceso?")) return;
      try {
          const token = localStorage.getItem('token');
          const year = new Date().getFullYear();
          await axios.post(`${API_URL}/contabilidad.php?action=` + action, { year }, {
               headers: { Authorization: `Bearer ${token}` }
          });
          toast.success("Proceso completado correctamente");
      } catch (error) {
          toast.error("Error al ejecutar proceso: " + (error.response?.data?.error || error.message));
      }
  };

  return (
    <div className="p-6 fade-in max-w-7xl mx-auto">
      <Toaster position="top-right" />
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
                <Book size={24} className="text-white" />
            </div>
            Contabilidad General
        </h1>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id} 
                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all duration-200 ${
                  isActive 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200 transform -translate-y-0.5' 
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800'
                }`}
                onClick={() => { setActiveTab(tab.id); setReportData([]); }}
              >
                <Icon size={16} /> 
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        
        {/* PCGE Tab */}
        {activeTab === 'pcge' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 fade-in overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Plan Contable General Empresarial</h3>
              <div className="flex gap-2">
                <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors text-sm" onClick={fetchData}><RefreshCw size={16}/> Actualizar</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2 transition-colors text-sm" onClick={() => { 
                    setEditingAccount(null); 
                    setAccountForm({ codigo: '', nombre: '', tipo: 'Activo', padre_codigo: '', permite_movimiento: false }); 
                    setShowAccountModal(true); 
                }}>
                    <Plus size={16}/> Nueva Cuenta
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <div className="relative max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"/>
                    <input 
                        type="text" 
                        placeholder="Buscar cuenta..." 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                    />
                </div>
              </div>
              
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3">Código</th>
                      <th className="px-6 py-3">Descripción</th>
                      <th className="px-6 py-3">Nivel</th>
                      <th className="px-6 py-3">Tipo</th>
                      <th className="px-6 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pcgeData.map(cuenta => (
                        <tr key={cuenta.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3"><span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-mono font-medium text-xs">{cuenta.codigo}</span></td>
                            <td className="px-6 py-3 text-gray-800 font-medium">{cuenta.nombre}</td>
                            <td className="px-6 py-3 text-gray-600">{cuenta.nivel}</td>
                            <td className="px-6 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    cuenta.tipo === 'Activo' ? 'bg-green-100 text-green-700' :
                                    cuenta.tipo === 'Pasivo' ? 'bg-red-100 text-red-700' :
                                    cuenta.tipo === 'Patrimonio' ? 'bg-purple-100 text-purple-700' :
                                    'bg-gray-100 text-gray-700'
                                }`}>
                                    {cuenta.tipo}
                                </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                                <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" onClick={() => handleDeleteAccount(cuenta.codigo)}>
                                    <Trash2 size={16}/>
                                </button>
                            </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Asientos Tab */}
        {activeTab === 'asientos' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 fade-in overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Gestión de Asientos</h3>
              <div className="flex gap-2">
                 <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">Automáticos</button>
                 <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2 transition-colors text-sm" onClick={() => {
                    setEntryForm({
                        fecha: new Date().toISOString().slice(0, 10),
                        glosa: '',
                        tipo_asiento: 'Diario',
                        moneda: 'PEN',
                        tipo_cambio: 1.0,
                        detalles: [{ cuenta_codigo: '', debe: 0, haber: 0 }]
                    });
                    setShowEntryModal(true);
                 }}>
                    <Plus size={16}/> Nuevo Asiento
                 </button>
              </div>
            </div>
            <div className="p-6">
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3">Fecha</th>
                                <th className="px-6 py-3">Glosa</th>
                                <th className="px-6 py-3">Tipo</th>
                                <th className="px-6 py-3">Total</th>
                                <th className="px-6 py-3">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {asientosData.map(asiento => (
                                <tr key={asiento.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-3 text-gray-800">{asiento.fecha}</td>
                                    <td className="px-6 py-3 text-gray-600">{asiento.glosa}</td>
                                    <td className="px-6 py-3">
                                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{asiento.tipo_asiento}</span>
                                    </td>
                                    <td className="px-6 py-3 font-mono font-medium">{Number(asiento.total).toFixed(2)}</td>
                                    <td className="px-6 py-3"><span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{asiento.estado}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
        )}

        {/* Libros Tab */}
        {activeTab === 'libros' && (
          <div className="fade-in space-y-6">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                 <div className="flex flex-wrap gap-4 items-end">
                    <div className="w-full sm:w-auto">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                        <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div className="w-full sm:w-auto">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                        <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors text-sm font-medium h-[42px]" onClick={() => fetchReport('get_libro_diario')}>Generar Libro Diario</button>
                 </div>
             </div>

             {reportData.length > 0 ? (
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-hidden">
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3">Fecha</th>
                                    <th className="px-6 py-3">Glosa</th>
                                    <th className="px-6 py-3">Cuenta</th>
                                    <th className="px-6 py-3">Descripción</th>
                                    <th className="px-6 py-3 text-right">Debe</th>
                                    <th className="px-6 py-3 text-right">Haber</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {reportData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-3 text-gray-800">{row.fecha}</td>
                                        <td className="px-6 py-3 text-gray-600">{row.glosa}</td>
                                        <td className="px-6 py-3 font-mono text-gray-700">{row.cuenta_codigo}</td>
                                        <td className="px-6 py-3 text-gray-600">{row.cuenta_nombre}</td>
                                        <td className="px-6 py-3 text-right font-mono font-medium">{Number(row.debe) > 0 ? Number(row.debe).toFixed(2) : '-'}</td>
                                        <td className="px-6 py-3 text-right font-mono font-medium">{Number(row.haber) > 0 ? Number(row.haber).toFixed(2) : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 </div>
             ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <div className="inline-flex p-4 bg-gray-50 rounded-full mb-4">
                        <FileText size={48} className="text-gray-400"/>
                    </div>
                    <p className="text-gray-500 text-lg">Seleccione un rango de fechas y genere el reporte.</p>
                </div>
             )}
          </div>
        )}

         {/* Balance Tab */}
         {activeTab === 'balance' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 fade-in overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800">Balance de Comprobación</h3>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors text-sm font-medium" onClick={() => fetchReport('get_balance_comprobacion')}>Generar Balance</button>
            </div>
            <div className="p-6">
                {reportData.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3">Cuenta</th>
                                    <th className="px-6 py-3">Descripción</th>
                                    <th className="px-6 py-3 text-right">Suma Debe</th>
                                    <th className="px-6 py-3 text-right">Suma Haber</th>
                                    <th className="px-6 py-3 text-right">Saldo Deudor</th>
                                    <th className="px-6 py-3 text-right">Saldo Acreedor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {reportData.map((row, idx) => {
                                    const saldo = Number(row.total_debe) - Number(row.total_haber);
                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-3 font-mono text-gray-700">{row.codigo}</td>
                                            <td className="px-6 py-3 text-gray-800">{row.nombre}</td>
                                            <td className="px-6 py-3 text-right font-mono">{Number(row.total_debe).toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right font-mono">{Number(row.total_haber).toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right font-mono text-green-600 font-medium">{saldo > 0 ? saldo.toFixed(2) : '-'}</td>
                                            <td className="px-6 py-3 text-right font-mono text-red-600 font-medium">{saldo < 0 ? Math.abs(saldo).toFixed(2) : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <div className="inline-flex p-4 bg-gray-50 rounded-full mb-4">
                            <PieChart size={48} className="text-gray-400"/>
                        </div>
                        <p className="text-gray-500 text-lg">Genere el reporte para ver el balance.</p>
                    </div>
                )}
            </div>
          </div>
        )}

        {/* Procesos Tab */}
        {activeTab === 'procesos' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 fade-in overflow-hidden">
             <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800">Procesos Contables</h3>
            </div>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="mb-4">
                            <h4 className="font-semibold text-gray-800 mb-2">Apertura Contable</h4>
                            <p className="text-gray-600 text-sm">Generar asiento de apertura basado en el cierre anterior.</p>
                        </div>
                        <button className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm" onClick={() => runProcess('apertura')}>Ejecutar Apertura</button>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="mb-4">
                            <h4 className="font-semibold text-gray-800 mb-2">Cierre Contable</h4>
                            <p className="text-gray-600 text-sm">Generar asientos de cierre y cancelar cuentas de resultados.</p>
                        </div>
                        <button className="w-full py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium shadow-sm" onClick={() => runProcess('cierre')}>Ejecutar Cierre</button>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="mb-4">
                            <h4 className="font-semibold text-gray-800 mb-2">Ajuste por Diferencia de Cambio</h4>
                            <p className="text-gray-600 text-sm">Generar asientos automáticos por diferencia de cambio.</p>
                        </div>
                        <button className="w-full py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium shadow-sm" onClick={() => runProcess('diferencia_cambio')}>Ejecutar Ajuste</button>
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* Auditoria Tab */}
        {activeTab === 'auditoria' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 fade-in overflow-hidden p-6">
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Auditoría de Asientos</h3>
                    <p className="text-gray-600 text-sm">Detecta inconsistencias en los asientos contables (descuadres, falta de glosas, etc).</p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3">Tipo</th>
                                <th className="px-6 py-3">ID</th>
                                <th className="px-6 py-3">Fecha</th>
                                <th className="px-6 py-3">Glosa</th>
                                <th className="px-6 py-3">Problema Detectado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {auditResults.length === 0 ? (
                                <tr><td colSpan="5" className="text-center py-8 text-gray-500">
                                    <div className="flex flex-col items-center">
                                        <CheckCircle size={32} className="text-green-500 mb-2"/>
                                        <span>No se encontraron problemas. Todo en orden.</span>
                                    </div>
                                </td></tr>
                            ) : (
                                auditResults.map((audit, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                audit.severity === 'high' ? 'bg-red-100 text-red-700' :
                                                audit.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {audit.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-gray-800 font-medium">{audit.id}</td>
                                        <td className="px-6 py-3 text-gray-800">{audit.fecha}</td>
                                        <td className="px-6 py-3 text-gray-600">{audit.glosa}</td>
                                        <td className="px-6 py-3 text-gray-700">{audit.issue}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

      </div>

      {/* Modal Nueva Cuenta */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">{editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}</h3>
              <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setShowAccountModal(false)}><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveAccount}>
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Código</label>
                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" value={accountForm.codigo} onChange={e => setAccountForm({...accountForm, codigo: e.target.value})} required maxLength="6"/>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Nombre / Descripción</label>
                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" value={accountForm.nombre} onChange={e => setAccountForm({...accountForm, nombre: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Tipo</label>
                        <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" value={accountForm.tipo} onChange={e => setAccountForm({...accountForm, tipo: e.target.value})}>
                            <option value="Activo">Activo</option>
                            <option value="Pasivo">Pasivo</option>
                            <option value="Patrimonio">Patrimonio</option>
                            <option value="Ingreso">Ingreso</option>
                            <option value="Gasto">Gasto</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" id="movimiento" checked={accountForm.permite_movimiento} onChange={e => setAccountForm({...accountForm, permite_movimiento: e.target.checked})} />
                        <label className="text-sm font-medium text-gray-700 cursor-pointer" htmlFor="movimiento">Permite Movimiento</label>
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button type="button" className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors" onClick={() => setShowAccountModal(false)}>Cancelar</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors">Guardar</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nuevo Asiento */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="text-lg font-bold text-gray-800">Nuevo Asiento Contable</h3>
                    <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setShowEntryModal(false)}><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto flex-grow">
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                        <button className="px-3 py-1.5 text-sm border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap" onClick={() => applyTemplate('venta')}>Plantilla Venta</button>
                        <button className="px-3 py-1.5 text-sm border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap" onClick={() => applyTemplate('compra')}>Plantilla Compra</button>
                        <button className="px-3 py-1.5 text-sm border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap" onClick={() => applyTemplate('cobro')}>Plantilla Cobro</button>
                        <button className="px-3 py-1.5 text-sm border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap" onClick={() => applyTemplate('pago')}>Plantilla Pago</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Fecha</label>
                            <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={entryForm.fecha} onChange={e => setEntryForm({...entryForm, fecha: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Tipo Asiento</label>
                            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" value={entryForm.tipo_asiento} onChange={e => setEntryForm({...entryForm, tipo_asiento: e.target.value})}>
                                <option value="Diario">Diario</option>
                                <option value="Ajuste">Ajuste</option>
                                <option value="Cierre">Cierre</option>
                                <option value="Apertura">Apertura</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Moneda</label>
                            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" value={entryForm.moneda} onChange={e => setEntryForm({...entryForm, moneda: e.target.value})}>
                                <option value="PEN">Soles</option>
                                <option value="USD">Dólares</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Tipo Cambio</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    step="0.001" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                                    value={entryForm.tipo_cambio} 
                                    onChange={e => setEntryForm({...entryForm, tipo_cambio: e.target.value})} 
                                />
                                <button 
                                    type="button" 
                                    onClick={() => fetchTipoCambio(entryForm.fecha)} 
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-blue-600 hover:text-blue-800 p-1" 
                                    title="Actualizar TC SUNAT"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2 mb-6">
                        <label className="text-sm font-medium text-gray-700">Glosa General</label>
                        <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={entryForm.glosa} onChange={e => setEntryForm({...entryForm, glosa: e.target.value})} placeholder="Descripción del asiento" />
                    </div>

                    <h4 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Detalles del Asiento</h4>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-2" width="40%">Cuenta</th>
                                    <th className="px-4 py-2" width="25%">Debe</th>
                                    <th className="px-4 py-2" width="25%">Haber</th>
                                    <th className="px-4 py-2" width="10%"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {entryForm.detalles.map((det, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2">
                                            <input 
                                                list="accounts-list"
                                                type="text" 
                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" 
                                                placeholder="Cta. Contable"
                                                value={det.cuenta_codigo}
                                                onChange={e => updateEntryRow(idx, 'cuenta_codigo', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-right font-mono text-sm" 
                                                value={det.debe}
                                                onChange={e => updateEntryRow(idx, 'debe', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-right font-mono text-sm" 
                                                value={det.haber}
                                                onChange={e => updateEntryRow(idx, 'haber', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors" onClick={() => handleRemoveEntryRow(idx)}>
                                                <Trash2 size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 font-bold border-t border-gray-200 sticky bottom-0 z-10">
                                <tr>
                                    <td className="px-4 py-2 text-right">Totales:</td>
                                    <td className="px-4 py-2 text-right font-mono">{entryForm.detalles.reduce((sum, i) => sum + Number(i.debe), 0).toFixed(2)}</td>
                                    <td className="px-4 py-2 text-right font-mono">{entryForm.detalles.reduce((sum, i) => sum + Number(i.haber), 0).toFixed(2)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium" onClick={handleAddEntryRow}>
                        <Plus size={16}/> Agregar Fila
                    </button>
                    <datalist id="accounts-list">
                        {movementAccounts.map(acc => (
                            <option key={acc.id} value={acc.codigo}>{acc.nombre}</option>
                        ))}
                    </datalist>
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                    <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors" onClick={() => setShowEntryModal(false)}>Cancelar</button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors" onClick={handleSaveEntry}>Guardar Asiento</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default ContabilidadGeneral;