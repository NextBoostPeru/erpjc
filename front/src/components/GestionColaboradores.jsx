import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import EmosModal from './EmosModal';
import * as XLSX from 'xlsx';
import { 
  Users, UserPlus, Edit2, Trash2, Search, ChevronLeft, ChevronRight, Briefcase, User, MapPin, Phone, Mail, FileText, Filter, HeartPulse, Download, Upload
} from 'lucide-react';

const GestionColaboradores = () => {
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedColabForEmos, setSelectedColabForEmos] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [areas, setAreas] = useState([]);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);

  // Form State
  const initialFormState = {
    nombres: '',
    apellidos: '',
    fecha_nacimiento: '',
    documento_tipo: 'DNI',
    documento_numero: '',
    direccion: '',
    telefono: '',
    email: '',
    estado_civil: 'Soltero',
    cargo: '',
    area: '',
    fecha_ingreso: '',
    tipo_contrato: '',
    regimen_laboral: '',
    estado: 'Activo',
    rol_id: '',
    turno_id: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);

  const [roles, setRoles] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Initial load (Roles & Areas)
  useEffect(() => {
    fetchRoles();
    fetchAreas();
  }, []);

  // Fetch data when params change
  useEffect(() => {
    fetchData(page, debouncedSearch, filterArea, filterStatus);
  }, [page, debouncedSearch, filterArea, filterStatus]);

  const fetchAreas = async () => {
    const cached = sessionStorage.getItem('areas_cache');
    if (cached) {
        setAreas(JSON.parse(cached));
        // We can optionally fetch in background to update cache
    }

    try {
        const response = await axios.get(`${API_URL}colaboradores.php?action=areas`);
        if (response.data.success) {
            setAreas(response.data.data);
            sessionStorage.setItem('areas_cache', JSON.stringify(response.data.data));
        }
    } catch (error) {
        console.error("Error fetching areas:", error);
    }
  };

  const fetchRoles = async () => {
    const cached = sessionStorage.getItem('roles_cache');
    if (cached) {
        setRoles(JSON.parse(cached));
    }

    try {
        const response = await axios.get(`${API_URL}usuarios.php?action=roles`);
        if (response.data.success) {
            setRoles(response.data.data);
            sessionStorage.setItem('roles_cache', JSON.stringify(response.data.data));
        }
    } catch (error) {
        console.error("Error fetching roles:", error);
    }
  };

  const fetchData = async (currentPage, search, area, status) => {
    try {
      const response = await axios.get(`${API_URL}colaboradores.php?page=${currentPage}&limit=${limit}&search=${search}&area=${area}&status=${status}`);
      setColaboradores(response.data.data);
      if (response.data.pagination) {
        setTotalPages(response.data.pagination.totalPages);
      }
    } catch (error) {
      console.error("Error fetching colaboradores:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchDNI = async (dniValue = null) => {
    const dniToSearch = dniValue || formData.documento_numero;
    if (!dniToSearch || dniToSearch.length !== 8) {
        toast.error("Ingrese un DNI válido de 8 dígitos");
        return;
    }

    const toastId = toast.loading("Consultando DNI...");
    try {
        const response = await axios.get(`${API_URL}/consulta_dni.php?dni=${dniToSearch}`);
        const data = response.data;
        
        if (data.success) {
            setFormData(prev => ({
                ...prev,
                documento_numero: dniToSearch,
                nombres: data.nombres,
                apellidos: (data.apellido_paterno || '') + ' ' + (data.apellido_materno || ''),
                direccion: data.direccion || prev.direccion
            }));
            toast.success("Datos encontrados", { id: toastId });
        } else {
            toast.error(data.message || "No se encontraron datos", { id: toastId });
        }
    } catch (error) {
        console.error(error);
        toast.error("Error al consultar DNI", { id: toastId });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`${API_URL}colaboradores.php`, { ...formData, id: editingId });
        toast.success("Colaborador actualizado");
      } else {
        if (!formData.rol_id) {
          toast.error("Seleccione un Área (Rol de Sistema) para crear el usuario");
          return;
        }
        if (!formData.email) {
          toast.error("Ingrese un email para crear el usuario de acceso");
          return;
        }
        await axios.post(`${API_URL}colaboradores.php`, formData);
        toast.success("Colaborador registrado");
      }
      setModalOpen(false);
      resetForm();
      fetchData(page, searchTerm, filterArea, filterStatus);
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al guardar");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este colaborador?')) return;
    try {
      await axios.delete(`${API_URL}/colaboradores.php?id=${id}`);
      toast.success("Colaborador eliminado");
      fetchData(page, searchTerm, filterArea, filterStatus);
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const handleEdit = (item) => {
    const cleaned = {
      ...item,
      nombres: item.nombres || '',
      apellidos: item.apellidos || '',
      fecha_nacimiento: item.fecha_nacimiento || '',
      documento_tipo: item.documento_tipo || 'DNI',
      documento_numero: item.documento_numero || '',
      direccion: item.direccion || '',
      telefono: item.telefono || '',
      email: item.email || '',
      estado_civil: item.estado_civil || 'Soltero',
      cargo: item.cargo || '',
      area: item.area || '',
      fecha_ingreso: item.fecha_ingreso || '',
      tipo_contrato: item.tipo_contrato || '',
      regimen_laboral: item.regimen_laboral || '',
      estado: item.estado || 'Activo',
      rol_id: item.rol_id || '',
      turno_id: item.turno_id || ''
    };

    setFormData({
      ...initialFormState,
      ...cleaned
    });
    setEditingId(item.id);
    setModalOpen(true);
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingId(null);
  };

  const handleExport = async () => {
    const toastId = toast.loading("Generando reporte...");
    try {
      const response = await axios.get(`${API_URL}colaboradores.php?export=true`);
      const data = response.data.data;
      
      const formattedData = data.map(item => ({
        'Nombres': item.nombres,
        'Apellidos': item.apellidos,
        'Tipo Doc': item.documento_tipo,
        'Número Doc': item.documento_numero,
        'Área': item.area,
        'Cargo': item.cargo,
        'Email': item.email,
        'Teléfono': item.telefono,
        'Fecha Ingreso': item.fecha_ingreso,
        'Estado': item.estado,
        'Usuario Vinculado': item.usuario_linked || 'No'
      }));

      const ws = XLSX.utils.json_to_sheet(formattedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
      XLSX.writeFile(wb, "Reporte_Colaboradores.xlsx");
      
      toast.success("Reporte descargado", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar", { id: toastId });
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const mappedData = data.map(row => ({
           nombres: row['Nombres'] || row['nombres'],
           apellidos: row['Apellidos'] || row['apellidos'],
           documento_numero: row['Número Doc'] || row['documento_numero'],
           area: row['Área'] || row['area'],
           cargo: row['Cargo'] || row['cargo'],
           email: row['Email'] || row['email'],
           telefono: row['Teléfono'] || row['telefono'],
           fecha_ingreso: row['Fecha Ingreso'] || row['fecha_ingreso'],
           estado: row['Estado'] || row['estado'],
           documento_tipo: row['Tipo Doc'] || row['documento_tipo'] || 'DNI', 
           fecha_nacimiento: null
        }));

        if (mappedData.length === 0) {
           toast.error("El archivo parece estar vacío");
           return;
        }

        const toastId = toast.loading(`Importando ${mappedData.length} registros...`);
        const response = await axios.post(`${API_URL}colaboradores.php?import=true`, mappedData);
        
        toast.success(`Importación: ${response.data.created} creados, ${response.data.updated} actualizados`, { id: toastId });
        fetchData(page, searchTerm, filterArea, filterStatus);
      } catch (error) {
        console.error(error);
        toast.error("Error al importar archivo");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const inferRoleIdFromArea = (areaName) => {
    if (!areaName) return null;
    const lowered = areaName.toString().trim().toLowerCase();
    const match = roles.find(r => r.nombre.toString().trim().toLowerCase() === lowered);
    return match ? match.id : null;
  };

  const handleCreateUserForColab = async (item) => {
    if (item.usuario_linked) {
      toast.success("Este colaborador ya tiene usuario");
      return;
    }
    if (!item.email) {
      toast.error("El colaborador no tiene email. Edítelo y registre un email primero.");
      return;
    }

    const roleId = item.rol_id || inferRoleIdFromArea(item.area);
    if (!roleId) {
      toast.error("No se pudo determinar el rol. Edite el colaborador y seleccione un Área (Rol de Sistema).");
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}colaboradores.php?action=create_user`,
        { id: item.id, rol_id: roleId }
      );
      if (response.data && response.data.success) {
        toast.success("Usuario creado y vinculado correctamente");
        fetchData(page, searchTerm, filterArea, filterStatus);
      } else {
        toast.error(response.data?.message || "No se pudo crear el usuario");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al crear usuario");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Users className="text-blue-600" size={32} />
            Gestión de Colaboradores
          </h1>
          <p className="text-gray-500 mt-1">Registro y administración de personal</p>
        </div>
        
        <div className="flex gap-2">
            <label className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg flex items-center gap-2 shadow-lg transition-all cursor-pointer">
              <Upload size={20} />
              <span className="hidden sm:inline">Importar</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleImport} className="hidden" />
            </label>
            <button 
              onClick={handleExport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-lg flex items-center gap-2 shadow-lg transition-all"
            >
              <Download size={20} />
              <span className="hidden sm:inline">Exportar</span>
            </button>
            <button 
              onClick={() => { resetForm(); setModalOpen(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg transition-all"
            >
              <UserPlus size={20} />
              <span className="hidden sm:inline">Nuevo</span>
            </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, apellido o documento..." 
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="relative w-full md:w-64">
          <select
            value={filterArea}
            onChange={(e) => { setFilterArea(e.target.value); setPage(1); }}
            className="w-full px-4 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 appearance-none bg-white"
          >
            <option value="">Todas las Áreas</option>
            {areas.map((area, index) => (
              <option key={index} value={area}>{area}</option>
            ))}
          </select>
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        </div>

        <div className="relative w-full md:w-48">
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="w-full px-4 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 appearance-none bg-white"
          >
            <option value="">Todos los Estados</option>
            <option value="Activo">Activo</option>
            <option value="Suspendido">Suspendido</option>
            <option value="Cesado">Cesado</option>
          </select>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-current opacity-50"></div>
          </div>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden mb-4">
        {loading ? (
           <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : colaboradores.length === 0 ? (
           <div className="text-center py-8 text-gray-500 bg-white rounded-lg shadow p-6">No se encontraron colaboradores.</div>
        ) : (
            colaboradores.map(item => (
                <div key={item.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">{item.apellidos}, {item.nombres}</h3>
                            <div className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{item.documento_tipo}: {item.documento_numero}</span>
                            </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                            item.estado === 'Activo' ? 'bg-green-50 text-green-700 border-green-100' :
                            item.estado === 'Suspendido' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                            'bg-red-50 text-red-700 border-red-100'
                        }`}>
                            {item.estado}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-gray-600">
                            <p className="text-xs text-gray-400">Cargo</p>
                            {item.cargo || '-'}
                        </div>
                        <div className="text-gray-600">
                            <p className="text-xs text-gray-400">Área</p>
                            {item.area || '-'}
                        </div>
                        <div className="text-gray-600 col-span-2">
                             <p className="text-xs text-gray-400">Email / Usuario</p>
                             <div className="flex items-center gap-2 flex-wrap">
                                {item.email || '-'}
                                {item.usuario_linked && (
                                    <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-0.5">
                                        <User size={10} /> {item.usuario_linked}
                                    </span>
                                )}
                             </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-50">
                        <button 
                          onClick={() => setSelectedColabForEmos(item)}
                          className="flex items-center gap-1 px-3 py-1.5 text-indigo-600 bg-indigo-50 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                        >
                          <HeartPulse size={16} /> EMOs
                        </button>
                        <button 
                          onClick={() => handleEdit(item)}
                          className="flex items-center gap-1 px-3 py-1.5 text-blue-600 bg-blue-50 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                        >
                          <Edit2 size={16} /> Editar
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-red-600 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={16} /> Eliminar
                        </button>
                    </div>
                </div>
            ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 border-b">Colaborador</th>
                <th className="p-4 border-b">Documento</th>
                <th className="p-4 border-b">Usuario</th>
                <th className="p-4 border-b">Cargo / Área</th>
                <th className="p-4 border-b">Estado</th>
                <th className="p-4 border-b text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Cargando...</td></tr>
              ) : colaboradores.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">No se encontraron colaboradores.</td></tr>
              ) : (
                colaboradores.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                        <div className="font-semibold text-gray-800">{item.apellidos}, {item.nombres}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Mail size={12} /> {item.email || '-'}
                        </div>
                    </td>
                    <td className="p-4">
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm font-medium">
                            {item.documento_tipo}: {item.documento_numero}
                        </span>
                    </td>
                    <td className="p-4">
                        {item.usuario_linked ? (
                             <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium w-fit">
                                <User size={12} /> {item.usuario_linked}
                             </span>
                        ) : (
                            <div className="flex flex-col gap-1">
                                <span className="text-gray-400 text-xs italic">Sin usuario</span>
                                <button
                                    type="button"
                                    onClick={() => handleCreateUserForColab(item)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 w-fit"
                                >
                                    <UserPlus size={12} />
                                    Crear usuario
                                </button>
                            </div>
                        )}
                    </td>
                    <td className="p-4">
                        <div className="text-gray-800">{item.cargo}</div>
                        <div className="text-sm text-gray-500">{item.area}</div>
                    </td>
                    <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                            item.estado === 'Activo' ? 'bg-green-50 text-green-700 border-green-100' :
                            item.estado === 'Suspendido' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                            'bg-red-50 text-red-700 border-red-100'
                        }`}>
                            {item.estado}
                        </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => setSelectedColabForEmos(item)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Gestionar EMOs"
                        >
                          <HeartPulse size={18} />
                        </button>
                        <button 
                          onClick={() => handleEdit(item)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mt-4">
        <div className="flex justify-between items-center p-4 bg-gray-50">
            <span className="text-sm text-gray-500">
                Página <span className="font-semibold text-gray-800">{page}</span> de <span className="font-semibold text-gray-800">{totalPages}</span>
            </span>
            <div className="flex gap-2">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600"
                >
                    <ChevronLeft size={20} />
                </button>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col my-8">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl shrink-0">
              <h2 className="text-xl font-bold text-gray-800">
                {editingId ? 'Editar Colaborador' : 'Nuevo Colaborador'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Datos Personales */}
                    <div className="col-span-full md:col-span-1 space-y-4">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2 border-b pb-2">
                            <User size={18} /> Datos Personales
                        </h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombres</label>
                                <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.nombres} onChange={e => setFormData({...formData, nombres: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
                                <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.apellidos} onChange={e => setFormData({...formData, apellidos: e.target.value})} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Nacimiento</label>
                            <input 
                                type="date" 
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.fecha_nacimiento || ''} 
                                onChange={e => setFormData({...formData, fecha_nacimiento: e.target.value})} 
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Doc.</label>
                                <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.documento_tipo || ''} onChange={e => setFormData({...formData, documento_tipo: e.target.value})}>
                                    <option value="DNI">DNI</option>
                                    <option value="CE">CE</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Número Doc.</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        required 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.documento_numero} 
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                                            setFormData(prev => ({...prev, documento_numero: val}));
                                            if (val.length === 8 && formData.documento_tipo === 'DNI') {
                                                handleSearchDNI(val);
                                            }
                                        }}
                                        maxLength={8}
                                    />
                                    {formData.documento_tipo === 'DNI' && (
                                        <button 
                                            type="button"
                                            onClick={() => handleSearchDNI()}
                                            className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
                                            title="Buscar DNI"
                                        >
                                            <Search size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Estado Civil</label>
                            <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.estado_civil || ''} onChange={e => setFormData({...formData, estado_civil: e.target.value})}>
                                <option value="Soltero">Soltero</option>
                                <option value="Casado">Casado</option>
                                <option value="Divorciado">Divorciado</option>
                                <option value="Viudo">Viudo</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                            <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.direccion || ''} onChange={e => setFormData({...formData, direccion: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                                <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.telefono || ''} onChange={e => setFormData({...formData, telefono: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input type="email" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* Datos Laborales */}
                    <div className="col-span-full md:col-span-1 space-y-4">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2 border-b pb-2">
                            <Briefcase size={18} /> Datos Laborales
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                                <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Área (Rol de Sistema)</label>
                                <select 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.rol_id || ''} 
                                    onChange={e => {
                                        const selectedRole = roles.find(r => r.id == e.target.value);
                                        setFormData({
                                            ...formData, 
                                            rol_id: e.target.value,
                                            area: selectedRole ? selectedRole.nombre.charAt(0).toUpperCase() + selectedRole.nombre.slice(1) : '' 
                                        });
                                    }}
                                >
                                    <option value="">Seleccionar Rol</option>
                                    {roles.map(rol => (
                                        <option key={rol.id} value={rol.id}>
                                            {rol.nombre.charAt(0).toUpperCase() + rol.nombre.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Ingreso</label>
                            <input type="date" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.fecha_ingreso || ''} onChange={e => setFormData({...formData, fecha_ingreso: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Contrato</label>
                                <select 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.tipo_contrato || ''} 
                                    onChange={e => setFormData({...formData, tipo_contrato: e.target.value})}
                                >
                                    <option value="Plazo Indeterminado">Plazo Indeterminado</option>
                                    <option value="Plazo Fijo">Plazo Fijo</option>
                                    <option value="Tiempo Parcial">Tiempo Parcial</option>
                                    <option value="Prácticas">Prácticas</option>
                                    <option value="Locación de Servicios">Locación de Servicios</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Régimen Laboral</label>
                                <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.regimen_laboral || ''} onChange={e => setFormData({...formData, regimen_laboral: e.target.value})}>
                                    <option value="">Seleccionar</option>
                                    <option value="General">General</option>
                                    <option value="MYPE">MYPE</option>
                                    <option value="CAS">CAS</option>
                                    <option value="Recibo por Honorarios">Recibo por Honorarios</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                            <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.estado || ''} onChange={e => setFormData({...formData, estado: e.target.value})}>
                                <option value="Activo">Activo</option>
                                <option value="Suspendido">Suspendido</option>
                                <option value="Cesado">Cesado</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="pt-6 flex flex-col-reverse sm:flex-row justify-end gap-3 mt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium w-full sm:w-auto text-center"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md font-medium w-full sm:w-auto text-center"
                    >
                        Guardar Colaborador
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {selectedColabForEmos && (
        <EmosModal 
            collaborator={selectedColabForEmos} 
            onClose={() => setSelectedColabForEmos(null)} 
        />
      )}
    </div>
  );
};

export default GestionColaboradores;
