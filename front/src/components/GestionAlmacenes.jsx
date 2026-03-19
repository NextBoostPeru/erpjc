import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  Warehouse, 
  MapPin, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  X, 
  Save, 
  User, 
  Box,
  Layers,
  ArrowRight
} from 'lucide-react';

const GestionAlmacenes = () => {
  const [activeTab, setActiveTab] = useState('almacenes'); // almacenes, ubicaciones
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]); // Roles para crear usuario
  const [showUserModal, setShowUserModal] = useState(false); // Modal para crear usuario
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [currentAlmacen, setCurrentAlmacen] = useState(null);
  const [currentUbicacion, setCurrentUbicacion] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal de confirmación
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Headers con token
  const token = localStorage.getItem('token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  useEffect(() => {
    fetchData();
    fetchUsuarios();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'almacenes') {
        const res = await axios.get(`${API_URL}almacenes.php`, { headers });
        console.log('Almacenes response:', res.data);
        setAlmacenes(Array.isArray(res.data) ? res.data : []);
      } else {
        // Cargar ubicaciones y también almacenes para el select
        const [resUbic, resAlmac] = await Promise.all([
          axios.get(`${API_URL}almacenes.php?resource=ubicaciones`, { headers }),
          axios.get(`${API_URL}almacenes.php`, { headers })
        ]);
        console.log('Ubicaciones response:', resUbic.data);
        console.log('Almacenes for select:', resAlmac.data);
        setUbicaciones(Array.isArray(resUbic.data) ? resUbic.data : []);
        setAlmacenes(Array.isArray(resAlmac.data) ? resAlmac.data : []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
      setAlmacenes([]);
      setUbicaciones([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsuarios = async () => {
    try {
      // Asumiendo que existe un endpoint de usuarios o similar, o usamos una lista dummy si no hay acceso
      // Si el rol almacen no tiene acceso a usuarios, esto podría fallar.
      // Intentaremos obtener usuarios, si falla usaremos lista vacía.
      const res = await axios.get(`${API_URL}usuarios.php`, { headers });
      // El endpoint puede devolver un array directo o un objeto { users: [], roles: [] }
      if (res.data.users) {
        setUsuarios(res.data.users);
      } else if (Array.isArray(res.data)) {
        setUsuarios(res.data);
      }
      
      if (res.data.roles) {
        setRoles(res.data.roles);
      }
    } catch (error) {
      console.log("No se pudo cargar usuarios o no hay permisos");
    }
  };

  const handleSaveAlmacen = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      if (currentAlmacen) {
        await axios.put(`${API_URL}almacenes.php?id=${currentAlmacen.id}`, data, { headers });
        toast.success('Almacén actualizado');
      } else {
        await axios.post(`${API_URL}almacenes.php`, data, { headers });
        toast.success('Almacén creado');
      }
      setShowModal(false);
      fetchData();
    } catch (error) {
      toast.error('Error al guardar almacén');
    }
  };

  const handleDeleteAlmacen = (almacen) => {
    setItemToDelete({ type: 'almacen', data: almacen });
    setShowDeleteModal(true);
  };

  const handleDeleteUbicacion = (ubicacion) => {
    setItemToDelete({ type: 'ubicacion', data: ubicacion });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    setIsDeleting(true);
    try {
      if (itemToDelete.type === 'almacen') {
        await axios.delete(`${API_URL}almacenes.php?id=${itemToDelete.data.id}`, { headers });
        toast.success('Almacén eliminado');
      } else {
        await axios.delete(`${API_URL}almacenes.php?resource=ubicaciones&id=${itemToDelete.data.id}`, { headers });
        toast.success('Ubicación eliminada');
      }
      fetchData();
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      toast.error('Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };
  const handleSaveUbicacion = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      if (currentUbicacion) {
        await axios.put(`${API_URL}almacenes.php?resource=ubicaciones&id=${currentUbicacion.id}`, data, { headers });
        toast.success('Ubicación actualizada');
      } else {
        await axios.post(`${API_URL}almacenes.php?resource=ubicaciones`, data, { headers });
        toast.success('Ubicación creada');
      }
      setShowModal(false);
      fetchData();
    } catch (error) {
      toast.error('Error al guardar ubicación');
    }
  };

  // This function is no longer used, replaced by the unified confirmDelete flow. 
  // Keeping this comment or removing the block entirely. 
  /*
  const handleDeleteUbicacion = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta ubicación?')) return;
    try {
      await axios.delete(`${API_URL}almacenes.php?resource=ubicaciones&id=${id}`, { headers });
      toast.success('Ubicación eliminada');
      fetchData();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };
  */

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Buscar rol de almacén si no se seleccionó (aunque lo forzaremos en el form)
    if (!data.rol_id) {
        const almacenRol = roles.find(r => r.nombre.toLowerCase().includes('almacen') || r.nombre.toLowerCase().includes('almacén'));
        if (almacenRol) {
            data.rol_id = almacenRol.id;
        } else {
            toast.error("No se encontró el rol de Almacén automáticamente.");
            return;
        }
    }

    try {
      await axios.post(`${API_URL}usuarios.php`, data, { headers });
      toast.success('Usuario creado y asignado');
      setShowUserModal(false);
      fetchUsuarios(); // Recargar lista
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Error al crear usuario');
    }
  };

  const filteredAlmacenes = Array.isArray(almacenes) ? almacenes.filter(a => 
    a.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.tipo.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  const filteredUbicaciones = Array.isArray(ubicaciones) ? ubicaciones.filter(u => 
    u.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.almacen_nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Warehouse className="text-blue-600" />
            Gestión de Almacenes
          </h1>
          <p className="text-gray-500 text-sm mt-1">Administra almacenes centrales, sucursales y ubicaciones</p>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'almacenes') {
              setCurrentAlmacen(null);
            } else {
              setCurrentUbicacion(null);
            }
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={20} />
          {activeTab === 'almacenes' ? 'Nuevo Almacén' : 'Nueva Ubicación'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('almacenes')}
          className={`pb-3 px-4 font-medium transition-colors relative ${
            activeTab === 'almacenes' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Almacenes
        </button>
        <button
          onClick={() => setActiveTab('ubicaciones')}
          className={`pb-3 px-4 font-medium transition-colors relative ${
            activeTab === 'ubicaciones' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Ubicaciones Internas
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder={`Buscar ${activeTab === 'almacenes' ? 'almacenes' : 'ubicaciones'}...`}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Cargando datos...</p>
        </div>
      ) : (
        <>
          {activeTab === 'almacenes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAlmacenes.map(almacen => (
                <div key={almacen.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Warehouse size={24} />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { setCurrentAlmacen(almacen); setShowModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteAlmacen(almacen)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-bold text-gray-800 mb-1">{almacen.nombre}</h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    almacen.tipo === 'central' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {almacen.tipo.charAt(0).toUpperCase() + almacen.tipo.slice(1)}
                  </span>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin size={16} className="mt-0.5 shrink-0" />
                      <span>{almacen.direccion || 'Sin dirección'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <User size={16} className="shrink-0" />
                      <span>Resp: {almacen.responsable_nombre || 'No asignado'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'ubicaciones' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacidad</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsable</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUbicaciones.map(ubicacion => (
                    <tr key={ubicacion.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                            <Box size={18} />
                          </div>
                          <span className="font-medium text-gray-900">{ubicacion.codigo}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {ubicacion.almacen_nombre}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        <div className="flex flex-col">
                          <span>Pasillo: {ubicacion.pasillo || '-'}</span>
                          <span className="text-xs text-gray-400">Estantería: {ubicacion.estanteria || '-'} | Nivel: {ubicacion.nivel || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {ubicacion.capacidad} u.
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {ubicacion.responsable_nombre || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => { setCurrentUbicacion(ubicacion); setShowModal(true); }}
                            className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded-lg transition-colors"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUbicacion(ubicacion)}
                            className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar {itemToDelete?.type === 'almacen' ? 'Almacén' : 'Ubicación'}?</h3>
              <p className="text-gray-500 mb-6">
                Esta acción no se puede deshacer. Se eliminará permanentemente 
                <span className="font-semibold text-gray-800"> {itemToDelete?.data.nombre || itemToDelete?.data.codigo}</span>.
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex justify-center items-center gap-2"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      Eliminar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Principal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">
                {activeTab === 'almacenes' 
                  ? (currentAlmacen ? 'Editar Almacén' : 'Nuevo Almacén')
                  : (currentUbicacion ? 'Editar Ubicación' : 'Nueva Ubicación')
                }
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={activeTab === 'almacenes' ? handleSaveAlmacen : handleSaveUbicacion} className="p-6 space-y-4">
              {activeTab === 'almacenes' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Almacén</label>
                    <input 
                      name="nombre" 
                      defaultValue={currentAlmacen?.nombre}
                      required 
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                      <select 
                        name="tipo" 
                        defaultValue={currentAlmacen?.tipo || 'sucursal'}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      >
                        <option value="sucursal">Sucursal</option>
                        <option value="central">Central</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                      <div className="flex gap-2">
                        <select 
                          name="responsable_id" 
                          defaultValue={currentAlmacen?.responsable_id || ''}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        >
                          <option value="">Seleccionar...</option>
                          {usuarios
                            .filter(u => u.rol_nombre && (u.rol_nombre.toLowerCase().includes('almacen') || u.rol_nombre.toLowerCase().includes('almacén')))
                            .map(u => (
                            <option key={u.id} value={u.id}>{u.usuario}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowUserModal(true)}
                          className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                          title="Crear nuevo responsable"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <textarea 
                      name="direccion" 
                      defaultValue={currentAlmacen?.direccion}
                      rows="3"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                    ></textarea>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Almacén</label>
                    <select 
                      name="almacen_id" 
                      defaultValue={currentUbicacion?.almacen_id || ''}
                      required
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                      <option value="">Seleccionar Almacén...</option>
                      {almacenes.map(a => (
                        <option key={a.id} value={a.id}>{a.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Código Ubicación</label>
                      <input 
                        name="codigo" 
                        defaultValue={currentUbicacion?.codigo}
                        required 
                        placeholder="ej. A-01-01"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad</label>
                      <input 
                        type="number"
                        name="capacidad" 
                        defaultValue={currentUbicacion?.capacidad || 0}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pasillo</label>
                      <input 
                        name="pasillo" 
                        defaultValue={currentUbicacion?.pasillo}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estantería</label>
                      <input 
                        name="estanteria" 
                        defaultValue={currentUbicacion?.estanteria}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nivel</label>
                      <input 
                        name="nivel" 
                        defaultValue={currentUbicacion?.nivel}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                    <div className="flex gap-2">
                      <select 
                        name="responsable_id" 
                        defaultValue={currentUbicacion?.responsable_id || ''}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      >
                        <option value="">Seleccionar...</option>
                        {usuarios
                          .filter(u => u.rol_nombre && (u.rol_nombre.toLowerCase().includes('almacen') || u.rol_nombre.toLowerCase().includes('almacén')))
                          .map(u => (
                          <option key={u.id} value={u.id}>{u.usuario}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowUserModal(true)}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Crear nuevo responsable"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <textarea 
                      name="descripcion" 
                      defaultValue={currentUbicacion?.descripcion}
                      rows="2"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                    ></textarea>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex justify-center items-center gap-2"
                >
                  <Save size={20} />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear Usuario */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">
                Nuevo Responsable de Almacén
              </h2>
              <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <input type="hidden" name="status" value="activo" />
              {/* El rol se asigna automáticamente en el handler */}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Usuario</label>
                <input 
                  name="usuario" 
                  required 
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  placeholder="ej. jdoe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input 
                  type="email"
                  name="email" 
                  required 
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  placeholder="correo@empresa.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input 
                  type="password"
                  name="password" 
                  required 
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 flex items-start gap-2">
                <div className="mt-0.5"><User size={16} /></div>
                <p>Este usuario se creará automáticamente con el rol de <strong>Almacén</strong>.</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex justify-center items-center gap-2"
                >
                  <Plus size={20} />
                  Crear Responsable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionAlmacenes;
