import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, Edit2, Trash2, PieChart, Save, X, Filter, DollarSign, User, Tag, Power, AlertTriangle, Layers, BarChart3, ArrowUpRight, ArrowDownLeft, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_URL } from '../api/config';

const CentrosCostos = () => {
  const [activeTab, setActiveTab] = useState('centros'); // centros, servicios, movimientos, reportes
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [centros, setCentros] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [reporteData, setReporteData] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  
  // Filters & UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCentroId, setSelectedCentroId] = useState(''); // For Servicios tab filter
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [reportGroupBy, setReportGroupBy] = useState('centro_costo');

  // Modals
  const [modalType, setModalType] = useState(null); // 'centro', 'servicio', 'movimiento'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentData, setCurrentData] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteData, setDeleteData] = useState({ id: null, type: '', entity: '' }); // entity: 'centro', 'servicio', 'movimiento'

  // Permissions
  const [canWrite, setCanWrite] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  // Forms
  const [centroForm, setCentroForm] = useState({
    codigo: '', nombre: '', tipo: 'Administrativo', area: '', presupuesto: '', responsable: '', estado: 'Activo'
  });
  const [servicioForm, setServicioForm] = useState({
    centro_costo_id: '', nombre: '', descripcion: '', estado: 'Activo'
  });
  const [movimientoForm, setMovimientoForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'Egreso',
    centro_costo_id: '',
    servicio_id: '',
    monto: '',
    responsable: '',
    periodo: '',
    descripcion: '',
    cliente_nombre: '',
    comprobante_referencia: ''
  });

  const tiposCentro = ['Administrativo', 'Operativo', 'Ventas', 'Produccion', 'Financiero'];

  useEffect(() => {
    fetchCentros();
    fetchColaboradores();
    checkPermissions();
  }, []);

  useEffect(() => {
    if (activeTab === 'servicios' && selectedCentroId) {
      fetchServicios(selectedCentroId);
    } else if (activeTab === 'movimientos') {
      fetchMovimientos();
    } else if (activeTab === 'reportes') {
      fetchReportes();
    }
  }, [activeTab, selectedCentroId, dateRange, reportGroupBy]);

  // --- Data Fetching ---
  const checkPermissions = async () => {
    let apiPermission = null;
    
    // 1. Try API check
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await axios.get(`${API_URL}/check_my_permissions.php?code=centros_costos`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data && response.data.success !== false) {
             apiPermission = {
                 write: response.data.escritura === 1,
                 delete: response.data.eliminacion === 1
             };
        }
      }
    } catch (error) {
      console.error("Error checking permissions", error);
    }

    // 2. Check local user role (Admin override)
    const user = JSON.parse(localStorage.getItem('user'));
    let isAdminOrManager = false;
    
    if (user) {
        const role = (user.rol_nombre || user.rol || '').toString().toLowerCase();
        const allowedRoles = ['administrador', 'admin', 'gerencia', 'gerente', 'contador', 'finanzas'];
        isAdminOrManager = allowedRoles.some(r => role.includes(r)) || user.rol === 1;
    }

    // 3. Final decision: Admin override OR API permission
    if (isAdminOrManager) {
        setCanWrite(true);
        setCanDelete(true);
    } else if (apiPermission) {
        setCanWrite(apiPermission.write);
        setCanDelete(apiPermission.delete);
    } else {
        // Default strict if unknown
        setCanWrite(false);
        setCanDelete(false);
    }
  };

  const fetchColaboradores = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/colaboradores.php?limit=1000&status=Activo`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && response.data.data) setColaboradores(response.data.data);
    } catch (error) { console.error(error); }
  };

  const fetchCentros = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/centros_costos.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setCentros(response.data.data);
        if (response.data.data.length > 0 && !selectedCentroId) {
            setSelectedCentroId(response.data.data[0].id);
        }
      }
    } catch (error) { toast.error('Error al cargar centros'); } finally { setLoading(false); }
  };

  const fetchServicios = async (centroId) => {
    if (!centroId) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/centros_costos.php?action=servicio&centro_id=${centroId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) setServicios(response.data.data);
    } catch (error) { toast.error('Error al cargar servicios'); } finally { setLoading(false); }
  };

  const fetchMovimientos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/movimientos_financieros.php?limit=100&fecha_inicio=${dateRange.start}&fecha_fin=${dateRange.end}&search=${searchTerm}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) setMovimientos(response.data.data);
    } catch (error) { toast.error('Error al cargar movimientos'); } finally { setLoading(false); }
  };

  const fetchReportes = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/movimientos_financieros.php?action=reporte&group_by=${reportGroupBy}&fecha_inicio=${dateRange.start}&fecha_fin=${dateRange.end}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) setReporteData(response.data.data);
    } catch (error) { toast.error('Error al generar reporte'); } finally { setLoading(false); }
  };

  // --- Handlers ---
  const handleOpenModal = (type, data = null) => {
    setModalType(type);
    setCurrentData(data);
    if (type === 'centro') {
      setCentroForm(data ? { ...data } : { codigo: '', nombre: '', tipo: 'Administrativo', presupuesto: '', responsable: '', estado: 'Activo' });
    } else if (type === 'servicio') {
      setServicioForm(data ? { ...data } : { centro_costo_id: selectedCentroId, nombre: '', descripcion: '', estado: 'Activo' });
    } else if (type === 'movimiento') {
        if (data) {
            // Cargar servicios del centro del movimiento para editar
            fetchServicios(data.centro_costo_id);
            setMovimientoForm({ ...data });
        } else {
            setMovimientoForm({
                fecha: new Date().toISOString().split('T')[0],
                tipo: 'Egreso',
                centro_costo_id: selectedCentroId || '',
                servicio_id: '',
                monto: '',
                responsable: '',
                periodo: new Date().toISOString().slice(0, 7), // YYYY-MM
                descripcion: '',
                cliente_nombre: '',
                comprobante_referencia: ''
            });
            if (selectedCentroId) fetchServicios(selectedCentroId);
        }
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      let url = '', data = {}, method = currentData ? 'put' : 'post';

      if (modalType === 'centro') {
        url = `${API_URL}/centros_costos.php`;
        data = currentData ? { ...centroForm, id: currentData.id } : centroForm;
        if (data.codigo.includes('|') || data.nombre.includes('|')) {
             toast.error('Carácter "|" no permitido'); return;
        }
      } else if (modalType === 'servicio') {
        url = `${API_URL}/centros_costos.php?action=servicio`;
        data = currentData ? { ...servicioForm, id: currentData.id } : servicioForm;
      } else if (modalType === 'movimiento') {
        url = `${API_URL}/movimientos_financieros.php`;
        data = currentData ? { ...movimientoForm, id: currentData.id } : movimientoForm;
      }

      const response = await axios[method](url, data, { headers: { Authorization: `Bearer ${token}` } });

      if (response.data.success) {
        toast.success(currentData ? 'Actualizado correctamente' : 'Creado correctamente');
        setIsModalOpen(false);
        if (modalType === 'centro') fetchCentros();
        else if (modalType === 'servicio') fetchServicios(selectedCentroId);
        else if (modalType === 'movimiento') fetchMovimientos();
      } else {
          toast.error(response.data.message);
      }
    } catch (error) { toast.error('Error al guardar'); }
  };

  const handleDelete = (type, data, deleteType = 'soft') => {
    setDeleteData({ id: data.id, type: deleteType, entity: type });
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = '';
      
      if (deleteData.entity === 'centro') url = `${API_URL}/centros_costos.php?type=hard`;
      else if (deleteData.entity === 'servicio') url = `${API_URL}/centros_costos.php?action=servicio&type=hard`;
      else if (deleteData.entity === 'movimiento') url = `${API_URL}/movimientos_financieros.php`;

      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
        data: { id: deleteData.id }
      });
      
      toast.success('Eliminado correctamente');
      setIsDeleteModalOpen(false);
      if (deleteData.entity === 'centro') fetchCentros();
      else if (deleteData.entity === 'servicio') fetchServicios(selectedCentroId);
      else if (deleteData.entity === 'movimiento') fetchMovimientos();
    } catch (error) { toast.error('Error al eliminar'); }
  };

  // --- Render Helpers ---
  const formatCurrency = (val) => Number(val).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <PieChart className="text-blue-600" />
                    Gestión Financiera y Costos
                </h1>
                <p className="text-gray-500 text-sm">Control de centros de costos, servicios y movimientos</p>
            </div>
            {activeTab !== 'reportes' && canWrite && (
                <button
                onClick={() => handleOpenModal(activeTab === 'centros' ? 'centro' : activeTab === 'servicios' ? 'servicio' : 'movimiento')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                >
                <Plus size={20} />
                Nuevo {activeTab === 'centros' ? 'Centro' : activeTab === 'servicios' ? 'Servicio' : 'Movimiento'}
                </button>
            )}
        </div>
        
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-1">
            {['centros', 'servicios', 'movimientos', 'reportes'].map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                        activeTab === tab 
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
            ))}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'centros' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar centros..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-3 text-left">Código</th>
                            <th className="px-6 py-3 text-left">Nombre</th>
                            <th className="px-6 py-3 text-left">Tipo</th>
                            <th className="px-6 py-3 text-right">Presupuesto</th>
                            <th className="px-6 py-3 text-left">Responsable</th>
                            <th className="px-6 py-3 text-center">Estado</th>
                            <th className="px-6 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {centros.filter(c => c.nombre.toLowerCase().includes(searchTerm.toLowerCase())).map(centro => (
                            <tr key={centro.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium">{centro.codigo}</td>
                                <td className="px-6 py-4">{centro.nombre}</td>
                                <td className="px-6 py-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{centro.tipo}</span></td>
                                <td className="px-6 py-4 text-right font-mono">{formatCurrency(centro.presupuesto)}</td>
                                <td className="px-6 py-4">{centro.responsable || '-'}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${centro.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {centro.estado}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    {canWrite && <button onClick={() => handleOpenModal('centro', centro)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>}
                                    {canDelete && <button onClick={() => handleDelete('centro', centro)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {activeTab === 'servicios' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-4">
                <label className="font-medium text-gray-700">Seleccionar Centro de Costos:</label>
                <select 
                    value={selectedCentroId} 
                    onChange={(e) => setSelectedCentroId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">-- Seleccionar --</option>
                    {centros.filter(c => c.estado === 'Activo').map(c => (
                        <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                    ))}
                </select>
            </div>
            
            {selectedCentroId ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servicios.length > 0 ? servicios.map(servicio => (
                        <div key={servicio.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative group bg-white">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-gray-800">{servicio.nombre}</h3>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    {canWrite && <button onClick={() => handleOpenModal('servicio', servicio)} className="p-1 hover:bg-gray-100 rounded text-blue-600"><Edit2 size={14}/></button>}
                                    {canDelete && <button onClick={() => handleDelete('servicio', servicio)} className="p-1 hover:bg-gray-100 rounded text-red-600"><Trash2 size={14}/></button>}
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 mb-3">{servicio.descripcion || 'Sin descripción'}</p>
                            <span className={`text-xs px-2 py-1 rounded-full ${servicio.estado === 'Activo' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {servicio.estado}
                            </span>
                        </div>
                    )) : (
                        <div className="col-span-full text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                            No hay servicios registrados para este centro.
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-10 text-gray-500">Seleccione un centro de costos para ver sus servicios.</div>
            )}
        </div>
      )}

      {activeTab === 'movimientos' && (
        <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-gray-500" />
                    <input 
                        type="date" 
                        value={dateRange.start} 
                        onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                    <span className="text-gray-400">-</span>
                    <input 
                        type="date" 
                        value={dateRange.end} 
                        onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                </div>
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar movimientos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button onClick={fetchMovimientos} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 text-sm font-medium">
                    Filtrar
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-3 text-left">Fecha</th>
                                <th className="px-6 py-3 text-left">Tipo</th>
                                <th className="px-6 py-3 text-left">Centro / Servicio</th>
                                <th className="px-6 py-3 text-left">Descripción</th>
                                <th className="px-6 py-3 text-left">Responsable</th>
                                <th className="px-6 py-3 text-right">Monto</th>
                                <th className="px-6 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {movimientos.map(mov => (
                                <tr key={mov.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">{mov.fecha}</td>
                                    <td className="px-6 py-4">
                                        <span className={`flex items-center gap-1 font-medium ${mov.tipo === 'Ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                                            {mov.tipo === 'Ingreso' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                                            {mov.tipo}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{mov.centro_costo_nombre}</div>
                                        <div className="text-xs text-gray-500">{mov.servicio_nombre || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-gray-900 max-w-xs truncate" title={mov.descripcion}>{mov.descripcion}</div>
                                        {(mov.cliente_nombre || mov.comprobante_referencia) && (
                                            <div className="text-xs text-gray-500 mt-1 flex gap-2">
                                                {mov.cliente_nombre && <span className="flex items-center gap-1"><User size={10} /> {mov.cliente_nombre}</span>}
                                                {mov.comprobante_referencia && <span className="flex items-center gap-1"><Tag size={10} /> {mov.comprobante_referencia}</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">{mov.responsable}</td>
                                    <td className={`px-6 py-4 text-right font-mono font-medium ${mov.tipo === 'Ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                                        {mov.tipo === 'Egreso' ? '-' : '+'}{formatCurrency(mov.monto)}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        {canWrite && <button onClick={() => handleOpenModal('movimiento', mov)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>}
                                        {canDelete && <button onClick={() => handleDelete('movimiento', mov)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'reportes' && (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-4 items-center">
                    <label className="text-sm font-medium text-gray-700">Agrupar por:</label>
                    <select 
                        value={reportGroupBy} 
                        onChange={(e) => setReportGroupBy(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="centro_costo">Centro de Costos</option>
                        <option value="area">Área</option>
                        <option value="servicio">Servicio</option>
                        <option value="responsable">Responsable</option>
                        <option value="periodo">Periodo</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="border border-gray-300 rounded px-2 py-1 text-sm"/>
                    <span>-</span>
                    <input type="date" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="border border-gray-300 rounded px-2 py-1 text-sm"/>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
                    <div className="text-sm text-gray-500">Total Ingresos</div>
                    <div className="text-2xl font-bold text-gray-800">{formatCurrency(reporteData.reduce((acc, curr) => acc + curr.ingresos, 0))}</div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500">
                    <div className="text-sm text-gray-500">Total Egresos</div>
                    <div className="text-2xl font-bold text-gray-800">{formatCurrency(reporteData.reduce((acc, curr) => acc + curr.egresos, 0))}</div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <div className="text-sm text-gray-500">Utilidad Neta</div>
                    <div className="text-2xl font-bold text-gray-800">{formatCurrency(reporteData.reduce((acc, curr) => acc + curr.utilidad, 0))}</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-3 text-left">{reportGroupBy.replace('_', ' ')}</th>
                            <th className="px-6 py-3 text-right text-green-600">Ingresos</th>
                            <th className="px-6 py-3 text-right text-red-600">Egresos</th>
                            <th className="px-6 py-3 text-right text-blue-600">Utilidad</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {reporteData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium">{row.label || 'Sin asignar'}</td>
                                <td className="px-6 py-4 text-right text-green-600">{formatCurrency(row.ingresos)}</td>
                                <td className="px-6 py-4 text-right text-red-600">{formatCurrency(row.egresos)}</td>
                                <td className="px-6 py-4 text-right font-bold text-gray-800">{formatCurrency(row.utilidad)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Modal Genérico */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                    {currentData ? 'Editar' : 'Nuevo'} {modalType === 'centro' ? 'Centro' : modalType === 'servicio' ? 'Servicio' : 'Movimiento'}
                </h3>
                <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                {modalType === 'centro' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Código</label>
                                <input type="text" required value={centroForm.codigo} onChange={e => setCentroForm({...centroForm, codigo: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Tipo</label>
                                <select value={centroForm.tipo} onChange={e => setCentroForm({...centroForm, tipo: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                    {tiposCentro.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Nombre</label>
                            <input type="text" required value={centroForm.nombre} onChange={e => setCentroForm({...centroForm, nombre: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Área</label>
                            <select value={centroForm.area} onChange={e => setCentroForm({...centroForm, area: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                <option value="">-- Seleccionar --</option>
                                <option value="Área de Gestión">Área de Gestión</option>
                                <option value="Supervisión de Obra">Supervisión de Obra</option>
                                <option value="Alquileres de Andamios">Alquileres de Andamios</option>
                                <option value="Ejecución de Obras">Ejecución de Obras</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Presupuesto</label>
                                <input type="number" step="0.01" value={centroForm.presupuesto} onChange={e => setCentroForm({...centroForm, presupuesto: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Estado</label>
                                <select value={centroForm.estado} onChange={e => setCentroForm({...centroForm, estado: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                    <option value="Activo">Activo</option>
                                    <option value="Inactivo">Inactivo</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Responsable</label>
                            <select value={centroForm.responsable} onChange={e => setCentroForm({...centroForm, responsable: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                <option value="">-- Seleccionar --</option>
                                {colaboradores.map(c => <option key={c.id} value={`${c.nombres} ${c.apellidos}`}>{c.nombres} {c.apellidos}</option>)}
                            </select>
                        </div>
                    </>
                )}

                {modalType === 'servicio' && (
                    <>
                         <div>
                            <label className="block text-sm font-medium mb-1">Centro de Costo</label>
                            <select required value={servicioForm.centro_costo_id} onChange={e => setServicioForm({...servicioForm, centro_costo_id: e.target.value})} className="w-full border rounded-lg px-3 py-2" disabled={!!currentData}>
                                <option value="">-- Seleccionar --</option>
                                {centros.filter(c => c.estado === 'Activo').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Nombre del Servicio</label>
                            <input type="text" required value={servicioForm.nombre} onChange={e => setServicioForm({...servicioForm, nombre: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Descripción</label>
                            <textarea value={servicioForm.descripcion} onChange={e => setServicioForm({...servicioForm, descripcion: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" rows="3"></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Estado</label>
                            <select value={servicioForm.estado} onChange={e => setServicioForm({...servicioForm, estado: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                            </select>
                        </div>
                    </>
                )}

                {modalType === 'movimiento' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Fecha</label>
                                <input type="date" required value={movimientoForm.fecha} onChange={e => setMovimientoForm({...movimientoForm, fecha: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Tipo</label>
                                <select value={movimientoForm.tipo} onChange={e => setMovimientoForm({...movimientoForm, tipo: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                    <option value="Ingreso">Ingreso</option>
                                    <option value="Egreso">Egreso</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Centro de Costo</label>
                                <select required value={movimientoForm.centro_costo_id} 
                                    onChange={e => {
                                        setMovimientoForm({...movimientoForm, centro_costo_id: e.target.value, servicio_id: ''});
                                        fetchServicios(e.target.value);
                                    }} 
                                    className="w-full border rounded-lg px-3 py-2"
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {centros.filter(c => c.estado === 'Activo').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Servicio</label>
                                <select value={movimientoForm.servicio_id} onChange={e => setMovimientoForm({...movimientoForm, servicio_id: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                    <option value="">-- General --</option>
                                    {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Descripción</label>
                            <input type="text" required value={movimientoForm.descripcion} onChange={e => setMovimientoForm({...movimientoForm, descripcion: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Cliente / Proveedor (Opcional)</label>
                                <input type="text" value={movimientoForm.cliente_nombre} onChange={e => setMovimientoForm({...movimientoForm, cliente_nombre: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej. Juan Pérez"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Comprobante (Opcional)</label>
                                <input type="text" value={movimientoForm.comprobante_referencia} onChange={e => setMovimientoForm({...movimientoForm, comprobante_referencia: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej. F001-123"/>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Monto</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">S/</span>
                                    <input type="number" step="0.01" min="0.01" required value={movimientoForm.monto} onChange={e => setMovimientoForm({...movimientoForm, monto: e.target.value})} className="w-full border rounded-lg pl-8 pr-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Periodo</label>
                                <input type="month" required value={movimientoForm.periodo} onChange={e => setMovimientoForm({...movimientoForm, periodo: e.target.value})} className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Responsable</label>
                            <select value={movimientoForm.responsable} onChange={e => setMovimientoForm({...movimientoForm, responsable: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                                <option value="">-- Seleccionar --</option>
                                {colaboradores.map(c => <option key={c.id} value={`${c.nombres} ${c.apellidos}`}>{c.nombres} {c.apellidos}</option>)}
                            </select>
                        </div>
                    </>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm">Guardar</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center animate-fade-in">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">¿Estás seguro?</h3>
                <p className="text-sm text-gray-500 mb-6">Esta acción no se puede deshacer.</p>
                <div className="flex justify-center gap-3">
                    <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
                    <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm">Sí, eliminar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default CentrosCostos;
