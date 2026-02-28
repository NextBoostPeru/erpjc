import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Search, 
  Calendar, 
  User, 
  Building, 
  FileText, 
  CheckCircle,
  X,
  Filter,
  Briefcase,
  History,
  Send,
  Edit,
  Trash2
} from 'lucide-react';

const GestionCoordinaciones = () => {
  const [activeTab, setActiveTab] = useState('coordinaciones'); // coordinaciones, asignaciones
  const [coordinaciones, setCoordinaciones] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // History States
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyForm, setHistoryForm] = useState({ detalle: '' });
  const [selectedCoordForHistory, setSelectedCoordForHistory] = useState(null);

  // States for filters
  const [filterFecha, setFilterFecha] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterUsuario, setFilterUsuario] = useState('');

  // States for Modals
  const [showCoordModal, setShowCoordModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form states
  const [coordForm, setCoordForm] = useState({
    cliente_id: '',
    usuario_id: '',
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'Reunión',
    detalle: '',
    estado: 'Completado'
  });

  const [assignForm, setAssignForm] = useState({
    usuario_id: '',
    cliente_id: ''
  });

  const [showAssignUserModal, setShowAssignUserModal] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState(null);
  const [assignUserForm, setAssignUserForm] = useState({
    usuario_id: ''
  });
  
  // Client Search State
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [filteredClients, setFilteredClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const user = JSON.parse(localStorage.getItem('user'));
  // Robust check for admin/gerencia roles supporting multiple property names (rol, rol_id, rol_nombre)
  const isAdminOrGerencia = [1, 2, '1', '2', 'admin', 'gerencia', 'administrador', 'gerente'].some(val => 
    [user?.rol, user?.rol_id, user?.rol_nombre].map(v => String(v).toLowerCase()).includes(String(val).toLowerCase())
  );

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      // Always search in backend to ensure all clients are findable
      // Role restrictions should be handled by backend if needed
      searchClients(clientSearch || '');
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [clientSearch]);

  const searchClients = async (query) => {
    setLoadingClients(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error("Sesión no válida");
        return;
      }
      const res = await axios.get(`${API_URL}clientes_proveedores.php?type=cliente&search=${encodeURIComponent(query)}&limit=20&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
      setFilteredClients(data);
    } catch (error) {
      console.error("Error searching clients:", error);
      if (error.response?.status === 401) {
        toast.error("Sesión expirada");
      }
      // Fail silently for other errors to avoid spamming user
    } finally {
      setLoadingClients(false);
    }
  };

  useEffect(() => {
    if (showCoordModal) {
      if (!isEditing) {
        setClientSearch('');
        setCoordForm({
          cliente_id: '',
          usuario_id: '',
          fecha: new Date().toISOString().split('T')[0],
          tipo: 'Reunión',
          detalle: '',
          estado: 'Completado'
        });
        searchClients('');
      } else {
        // When editing, ensure we have the client in the list
        searchClients(clientSearch);
      }
    } else if (showAssignModal) {
      setClientSearch('');
      searchClients('');
    }
  }, [showCoordModal, showAssignModal]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [coordRes, assignRes, usuariosRes] = await Promise.all([
        axios.get(`${API_URL}gestion.php?action=get_coordinaciones`, config),
        axios.get(`${API_URL}gestion.php?action=get_asignaciones`, config),
        axios.get(`${API_URL}usuarios.php`, config)
      ]);

      setCoordinaciones(coordRes.data);
      setAsignaciones(assignRes.data);
      // setClientes removed to optimize performance - using search instead
      // Fix: Handle object response for users (data.users)
      setUsuarios(Array.isArray(usuariosRes.data) ? usuariosRes.data : (usuariosRes.data.users || []));
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCoordinacion = async (e) => {
    e.preventDefault();
    if (!coordForm.cliente_id) {
      toast.error("Debe seleccionar un cliente de la lista");
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const endpoint = isEditing ? 'update_coordinacion' : 'create_coordinacion';
      const payload = isEditing ? { ...coordForm, id: editingId } : coordForm;

      await axios.post(`${API_URL}gestion.php?action=${endpoint}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(isEditing ? "Coordinación actualizada exitosamente" : "Coordinación registrada exitosamente");
      setShowCoordModal(false);
      resetCoordForm();
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Error creating/updating coordination:", error);
      toast.error(isEditing ? "Error al actualizar coordinación" : "Error al registrar coordinación");
    }
  };

  const resetCoordForm = () => {
    setCoordForm({
      cliente_id: '',
      usuario_id: '',
      fecha: new Date().toISOString().split('T')[0],
      tipo: 'Reunión',
      detalle: '',
      estado: 'Completado'
    });
    setClientSearch('');
    setIsEditing(false);
    setEditingId(null);
  };

  const handleEditCoordinacion = (coord) => {
    setEditingId(coord.id);
    setIsEditing(true);
    
    // Format date correctly
    const formattedDate = coord.fecha ? coord.fecha.split(' ')[0] : new Date().toISOString().split('T')[0];

    setCoordForm({
      cliente_id: coord.cliente_id,
      usuario_id: coord.usuario_id || '',
      fecha: formattedDate,
      tipo: coord.tipo,
      detalle: coord.detalle || '',
      estado: coord.estado
    });

    const clientName = coord.cliente_razon_social || coord.cliente_nombre || '';
    setClientSearch(clientName);
    setShowCoordModal(true);
    
    // Trigger search to populate dropdown with this client
    searchClients(clientName);
  };

  const handleDeleteCoordinacion = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar esta coordinación?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.get(`${API_URL}gestion.php?action=delete_coordinacion&id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Coordinación eliminada");
      fetchData();
    } catch (error) {
      console.error("Error deleting coordination:", error);
      toast.error("Error al eliminar coordinación");
    }
  };

  const handleCreateAsignacion = async (e) => {
    e.preventDefault();
    if (!assignForm.cliente_id) {
      toast.error("Debe seleccionar un cliente");
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}gestion.php?action=assign_cliente`, assignForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Asignación creada exitosamente");
      setShowAssignModal(false);
      setAssignForm({ usuario_id: '', cliente_id: '' });
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Error creating assignment:", error);
      toast.error(error.response?.data?.error || "Error al asignar cliente");
    }
  };

  const handleDeleteAsignacion = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar esta asignación?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}gestion.php?action=delete_asignacion`, { id }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Asignación eliminada");
      fetchData();
    } catch (error) {
      console.error("Error deleting assignment:", error);
      toast.error("Error al eliminar asignación");
    }
  };

  const handleAssignUser = async (e) => {
    e.preventDefault();
    if (!selectedCoord) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}gestion.php?action=update_coordinacion`, {
        ...selectedCoord,
        usuario_id: assignUserForm.usuario_id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Usuario asignado exitosamente");
      setShowAssignUserModal(false);
      setAssignUserForm({ usuario_id: '' });
      setSelectedCoord(null);
      fetchData();
    } catch (error) {
      console.error("Error assigning user:", error);
      toast.error("Error al asignar usuario");
    }
  };

  const fetchHistory = async (coordId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}gestion.php?action=get_historial&coordinacion_id=${coordId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistoryList(res.data);
    } catch (error) {
      console.error("Error loading history:", error);
      toast.error("Error al cargar historial");
    }
  };

  const handleCreateHistory = async (e) => {
    e.preventDefault();
    if (!selectedCoordForHistory || !historyForm.detalle.trim()) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}gestion.php?action=create_historial_entry`, {
        coordinacion_id: selectedCoordForHistory.id,
        detalle: historyForm.detalle
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Entrada agregada al historial");
      setHistoryForm({ detalle: '' });
      fetchHistory(selectedCoordForHistory.id);
    } catch (error) {
      console.error("Error creating history entry:", error);
      toast.error("Error al agregar entrada");
    }
  };

  const openHistoryModal = (coord) => {
    setSelectedCoordForHistory(coord);
    setHistoryForm({ detalle: '' });
    setHistoryList([]);
    setShowHistoryModal(true);
    fetchHistory(coord.id);
  };

  const openAssignUserModal = (coord) => {
    setSelectedCoord(coord);
    setAssignUserForm({ usuario_id: coord.usuario_id || '' });
    setShowAssignUserModal(true);
  };

  // Filter logic
  const filteredCoordinaciones = coordinaciones.filter(c => {
    const matchFecha = filterFecha ? c.fecha === filterFecha : true;
    const matchCliente = filterCliente ? 
      (c.cliente_nombre?.toLowerCase().includes(filterCliente.toLowerCase()) || 
       c.cliente_razon_social?.toLowerCase().includes(filterCliente.toLowerCase())) : true;
    const matchUsuario = filterUsuario ? 
      c.usuario_nombre?.toLowerCase().includes(filterUsuario.toLowerCase()) : true;
    return matchFecha && matchCliente && matchUsuario;
  });

  const getClientName = (id) => {
    const client = clientes.find(c => c.id === id);
    return client ? (client.razon_social || client.nombre_comercial) : 'Cliente desconocido';
  };

  const getUserName = (id) => {
    const u = usuarios.find(us => us.id === id);
    return u ? u.nombre_completo : 'Usuario desconocido';
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'coordinaciones') {
      fetchData();
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Briefcase className="w-8 h-8 text-blue-600" />
          Gestión de Coordinaciones
        </h1>
        <div className="flex gap-2">
          {isAdminOrGerencia ? (
            <>
              <button 
                onClick={() => handleTabChange('coordinaciones')}
                className={`px-4 py-2 rounded-lg ${activeTab === 'coordinaciones' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Coordinaciones
              </button>
              <button 
                onClick={() => handleTabChange('asignaciones')}
                className={`px-4 py-2 rounded-lg ${activeTab === 'asignaciones' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Asignaciones
              </button>
            </>
          ) : (
            <div className="px-4 py-2 bg-blue-50 text-blue-800 rounded-lg font-medium">
              Mis Coordinaciones
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        
        {/* Coordinaciones Tab */}
        {activeTab === 'coordinaciones' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div className="flex gap-4 flex-1">
                <input 
                  type="date" 
                  value={filterFecha}
                  onChange={(e) => setFilterFecha(e.target.value)}
                  className="border rounded-lg px-3 py-2"
                />
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Buscar cliente..." 
                    value={filterCliente}
                    onChange={(e) => setFilterCliente(e.target.value)}
                    className="pl-10 border rounded-lg px-3 py-2 w-full"
                  />
                </div>
                {isAdminOrGerencia && (
                  <div className="relative flex-1 max-w-xs">
                    <User className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
                    <input 
                      type="text" 
                      placeholder="Filtrar por usuario..." 
                      value={filterUsuario}
                      onChange={(e) => setFilterUsuario(e.target.value)}
                      className="pl-10 border rounded-lg px-3 py-2 w-full"
                    />
                  </div>
                )}
              </div>
              <button 
                onClick={() => {
                  resetCoordForm();
                  setShowCoordModal(true);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"
              >
                <Plus size={20} />
                Nueva Coordinación
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="p-3 font-semibold text-gray-600">Fecha</th>
                    <th className="p-3 font-semibold text-gray-600">Usuario</th>
                    <th className="p-3 font-semibold text-gray-600">Cliente</th>
                    <th className="p-3 font-semibold text-gray-600">Tipo</th>
                    <th className="p-3 font-semibold text-gray-600">Detalle</th>
                    <th className="p-3 font-semibold text-gray-600">Estado</th>
                    <th className="p-3 font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="7" className="p-4 text-center">Cargando...</td></tr>
                  ) : filteredCoordinaciones.length === 0 ? (
                    <tr><td colSpan="7" className="p-4 text-center text-gray-500">No hay coordinaciones registradas</td></tr>
                  ) : (
                    filteredCoordinaciones.map((coord) => (
                      <tr key={coord.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{coord.fecha}</td>
                        <td className="p-3">{coord.usuario_nombre}</td>
                        <td className="p-3">{coord.cliente_razon_social || coord.cliente_nombre}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            coord.tipo === 'Visita' ? 'bg-purple-100 text-purple-800' :
                            coord.tipo === 'Llamada' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {coord.tipo}
                          </span>
                        </td>
                        <td className="p-3 max-w-xs truncate" title={coord.detalle}>{coord.detalle}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            coord.estado === 'Completado' ? 'bg-green-100 text-green-800' :
                            coord.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {coord.estado}
                          </span>
                        </td>
                        <td className="p-3 flex gap-2">
                          {isAdminOrGerencia && (
                            <button 
                              onClick={() => openAssignUserModal(coord)}
                              className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                              title="Asignar Usuario"
                            >
                              <User size={16} />
                            </button>
                          )}
                          {(isAdminOrGerencia || String(coord.usuario_id) === String(user.id)) && (
                            <>
                              <button 
                                onClick={() => handleEditCoordinacion(coord)}
                                className="text-green-600 hover:text-green-800 text-sm flex items-center gap-1"
                                title="Editar Coordinación"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteCoordinacion(coord.id)}
                                className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                                title="Eliminar Coordinación"
                              >
                                <Trash2 size={16} />
                              </button>
                              <button 
                                onClick={() => openHistoryModal(coord)}
                                className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1"
                                title="Ver Historial"
                              >
                                <History size={16} />
                                Historial
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Asignaciones Tab */}
        {activeTab === 'asignaciones' && isAdminOrGerencia && (
          <div>
            <div className="flex justify-end mb-4">
               <button 
                onClick={() => setShowAssignModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"
              >
                <Plus size={20} />
                Nueva Asignación
              </button>
            </div>
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b">
                      <th className="p-3 font-semibold text-gray-600">Cliente</th>
                      <th className="p-3 font-semibold text-gray-600">Asignado A</th>
                      <th className="p-3 font-semibold text-gray-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan="3" className="p-4 text-center">Cargando...</td></tr>
                    ) : asignaciones.length === 0 ? (
                      <tr><td colSpan="3" className="p-4 text-center text-gray-500">No hay asignaciones registradas</td></tr>
                    ) : (
                      asignaciones.map((asign) => (
                        <tr key={asign.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">{asign.cliente_razon_social || asign.cliente_nombre}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs">
                                <User size={12} />
                              </div>
                              <span className="font-medium text-gray-700">{asign.usuario_nombre}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <button 
                              onClick={() => handleDeleteAsignacion(asign.id)}
                              className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                              title="Eliminar Asignación"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nueva Coordinación */}
      {showCoordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold mb-4">{isEditing ? 'Editar Coordinación' : 'Nueva Coordinación'}</h2>
            <form onSubmit={handleCreateCoordinacion} className="space-y-4">
              
              {isAdminOrGerencia && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usuario (Opcional)</label>
                  <select 
                    value={coordForm.usuario_id}
                    onChange={(e) => setCoordForm({...coordForm, usuario_id: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Asignar a mí mismo</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.nombre_completo || u.usuario}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                    <input 
                      type="text" 
                      placeholder={isAdminOrGerencia ? "Buscar cliente por nombre o RUC..." : "Buscar entre mis clientes asignados..."}
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        if (coordForm.cliente_id) setCoordForm({...coordForm, cliente_id: ''});
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      onClick={() => setShowClientDropdown(true)}
                      autoComplete="off"
                      className={`pl-10 w-full border rounded-lg px-3 py-2 ${coordForm.cliente_id ? 'border-green-500 ring-1 ring-green-500' : ''}`}
                    />
                    {coordForm.cliente_id && (
                      <div className="absolute right-3 top-2.5 text-green-600">
                        <CheckCircle size={20} />
                      </div>
                    )}
                    {loadingClients && (
                      <div className="absolute right-10 top-2.5">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                  </div>
                  
                  {showClientDropdown && (
                    <div className="absolute z-[100] w-full bg-white border rounded-lg shadow-xl max-h-60 overflow-y-auto mt-1 left-0">
                      {loadingClients ? (
                        <div className="p-3 text-center text-gray-500 flex items-center justify-center gap-2">
                          <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                          Buscando...
                        </div>
                      ) : filteredClients.length > 0 ? (
                        filteredClients.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setCoordForm({...coordForm, cliente_id: c.id});
                              setClientSearch(c.razon_social || c.nombre_comercial);
                              setShowClientDropdown(false);
                            }}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          >
                            <div className="font-medium">{c.razon_social || c.nombre_comercial}</div>
                            <div className="text-xs text-gray-500">{c.num_doc}</div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-center text-gray-500">
                          {clientSearch ? "No se encontraron clientes" : "Escriba para buscar clientes"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input 
                    type="date" 
                    value={coordForm.fecha}
                    onChange={(e) => setCoordForm({...coordForm, fecha: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select 
                    value={coordForm.tipo}
                    onChange={(e) => setCoordForm({...coordForm, tipo: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="Reunión">Reunión</option>
                    <option value="Llamada">Llamada</option>
                    <option value="Visita">Visita</option>
                    <option value="Correo">Correo</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Detalle</label>
                <textarea 
                  value={coordForm.detalle}
                  onChange={(e) => setCoordForm({...coordForm, detalle: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 h-24"
                  placeholder="Detalles de la coordinación..."
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select 
                  value={coordForm.estado}
                  onChange={(e) => setCoordForm({...coordForm, estado: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Completado">Completado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button 
                  type="button" 
                  onClick={() => setShowCoordModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {isEditing ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asignar Usuario a Coordinación */}
      {showAssignUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-xl font-bold mb-4">Asignar Responsable</h2>
            <form onSubmit={handleAssignUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                <select 
                  value={assignUserForm.usuario_id}
                  onChange={(e) => setAssignUserForm({...assignUserForm, usuario_id: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Seleccione un usuario...</option>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre_completo || u.usuario}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button 
                  type="button" 
                  onClick={() => setShowAssignUserModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {showHistoryModal && selectedCoordForHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="text-indigo-600" />
                Historial de Coordinación
              </h2>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-semibold text-gray-700">{selectedCoordForHistory.cliente_razon_social || selectedCoordForHistory.cliente_nombre}</p>
              <p className="text-sm text-gray-600">{selectedCoordForHistory.detalle}</p>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 pr-2">
              {historyList.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No hay historial registrado</p>
              ) : (
                <div className="space-y-4">
                  {historyList.map((entry) => (
                    <div key={entry.id} className="bg-white border rounded-lg p-3 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-sm text-indigo-600">{entry.usuario_nombre}</span>
                        <span className="text-xs text-gray-500">{entry.fecha_registro}</span>
                      </div>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">{entry.detalle}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleCreateHistory} className="border-t pt-4">
              <div className="flex gap-2">
                <textarea
                  value={historyForm.detalle}
                  onChange={(e) => setHistoryForm({ detalle: e.target.value })}
                  placeholder="Escriba un nuevo comentario o actualización..."
                  className="flex-1 border rounded-lg px-3 py-2 h-20 resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                ></textarea>
                <button 
                  type="submit" 
                  className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 flex items-center justify-center"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asignar Cliente */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Asignar Cliente</h2>
            <form onSubmit={handleCreateAsignacion} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario (Gestor)</label>
                <select 
                  value={assignForm.usuario_id}
                  onChange={(e) => setAssignForm({...assignForm, usuario_id: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Seleccione un usuario...</option>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre_completo}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                    <input 
                      type="text" 
                      placeholder="Buscar cliente por nombre o RUC..." 
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        if (assignForm.cliente_id) setAssignForm({...assignForm, cliente_id: ''});
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      onClick={() => setShowClientDropdown(true)}
                      autoComplete="off"
                      className={`pl-10 w-full border rounded-lg px-3 py-2 ${assignForm.cliente_id ? 'border-green-500 ring-1 ring-green-500' : ''}`}
                    />
                    {assignForm.cliente_id && (
                      <div className="absolute right-3 top-2.5 text-green-600">
                        <CheckCircle size={20} />
                      </div>
                    )}
                    {loadingClients && (
                      <div className="absolute right-10 top-2.5">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                  </div>
                  
                  {showClientDropdown && (
                    <div className="absolute z-[100] w-full bg-white border rounded-lg shadow-xl max-h-60 overflow-y-auto mt-1 left-0">
                      {loadingClients ? (
                        <div className="p-3 text-center text-gray-500 flex items-center justify-center gap-2">
                          <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                          Buscando...
                        </div>
                      ) : filteredClients.length > 0 ? (
                        filteredClients.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setAssignForm({...assignForm, cliente_id: c.id});
                              setClientSearch(c.razon_social || c.nombre_comercial);
                              setShowClientDropdown(false);
                            }}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          >
                            <div className="font-medium">{c.razon_social || c.nombre_comercial}</div>
                            <div className="text-xs text-gray-500">{c.num_doc}</div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-center text-gray-500">
                          {clientSearch ? "No se encontraron clientes" : "Escriba para buscar clientes"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button 
                  type="button" 
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Asignar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionCoordinaciones;
