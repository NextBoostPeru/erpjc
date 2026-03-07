import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  Users, UserPlus, Edit2, Trash2, CheckCircle, XCircle, 
  Search, Shield, Key, Mail, Lock 
} from 'lucide-react';

const Usuarios = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Form State
  const [formData, setFormData] = useState({
    usuario: '',
    email: '',
    nombre_real: '',
    telefono: '',
    area: '',
    area_id: '',
    password: '',
    rol_id: '',
    status: 'activo'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

    const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await axios.get(`${API_URL}/usuarios.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data.users);
      setRoles(response.data.roles);

      // Fetch Areas
      const areasResponse = await axios.get(`${API_URL}/areas.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (areasResponse.data.success) {
        setAreas(areasResponse.data.data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        // Edit Mode
        const payload = { ...formData, id: editingUser.id };
        if (!payload.password) delete payload.password; // Don't send empty password
        
        await axios.put(`${API_URL}/usuarios.php`, payload);
        toast.success("Usuario actualizado correctamente");
      } else {
        // Create Mode
        await axios.post(`${API_URL}/usuarios.php`, formData);
        toast.success("Usuario creado correctamente");
      }
      
      setModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al guardar usuario");
    }
  };

  const confirmDelete = (user) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!userToDelete) return;
    
    try {
      await axios.delete(`${API_URL}/usuarios.php?id=${userToDelete.id}`);
      toast.success("Usuario eliminado");
      fetchUsers();
      setDeleteModalOpen(false);
      setUserToDelete(null);
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al eliminar usuario");
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      usuario: user.usuario,
      email: user.email,
      nombre_real: user.nombre_real || '',
      telefono: user.telefono || '',
      area: user.area || '',
      area_id: user.area_id || '',
      password: '',
      rol_id: user.rol_id,
      status: user.status
    });
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    handleEdit(user);
  };

  const resetForm = () => {
    setEditingUser(null);
    setFormData({
      usuario: '',
      email: '',
      nombre_real: '',
      telefono: '',
      area: '',
      password: '',
      rol_id: '',
      status: 'activo'
    });
  };

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'activo' ? 'inactivo' : 'activo';
    try {
      await axios.put(`${API_URL}/usuarios.php`, { id: user.id, status: newStatus });
      toast.success(`Usuario ${newStatus === 'activo' ? 'activado' : 'desactivado'}`);
      fetchUsers();
    } catch (error) {
      toast.error("Error al cambiar estado");
    }
  };

  const filteredUsers = users
    .filter(user => {
      const rolName = String(user.rol_nombre || user.rol || '').toLowerCase();
      if (rolName === 'user') return false;
      return true;
    })
    .filter(user => 
      user.usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.nombre_real && user.nombre_real.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  
  const totalItems = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIdx = (safePage - 1) * limit;
  const endIdx = startIdx + limit;
  const paginatedUsers = filteredUsers.slice(startIdx, endIdx);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Users className="text-blue-600" size={32} />
            Gestión de Usuarios
          </h1>
          <p className="text-gray-500 mt-1">Administra el acceso y roles del sistema</p>
        </div>
        
        <button 
          onClick={() => { resetForm(); setModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg transition-all transform hover:-translate-y-0.5"
        >
          <UserPlus size={20} />
          Nuevo Usuario
        </button>
      </div>

      {/* Search and Stats */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-sm text-gray-500">
          Total: <span className="font-bold text-gray-800">{users.length}</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 border-b w-16 text-center">#</th>
                <th className="p-4 border-b">Usuario / Nombre</th>
                <th className="p-4 border-b">Contacto</th>
                <th className="p-4 border-b">Rol / Área</th>
                <th className="p-4 border-b">Estado</th>
                <th className="p-4 border-b">Último Acceso</th>
                <th className="p-4 border-b text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Cargando usuarios...</td></tr>
              ) : paginatedUsers.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">No se encontraron usuarios.</td></tr>
              ) : (
                paginatedUsers.map((user, idx) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-center text-sm text-gray-500 font-medium">
                      {(safePage - 1) * limit + idx + 1}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800">{user.usuario}</span>
                        <span className="text-sm text-gray-500">{user.nombre_real || '-'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-gray-400" />
                          {user.email}
                        </div>
                        {user.telefono && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">Tel:</span>
                            {user.telefono}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          <Shield size={12} />
                          {user.rol_nombre || 'Sin Rol'}
                        </span>
                        {user.area && (
                          <span className="text-xs text-gray-500 font-medium px-2 py-0.5 bg-gray-100 rounded border border-gray-200">
                            {user.area}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <button 
                        onClick={() => handleToggleStatus(user)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                          user.status === 'activo' 
                            ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100' 
                            : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                        }`}
                      >
                        {user.status === 'activo' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {user.status === 'activo' ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {user.ultimo_acceso || 'Nunca'}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => openEditModal(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => confirmDelete(user)}
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
        <div className="p-4 border-t flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-sm text-gray-500">
            {totalItems > 0
              ? `Mostrando ${startIdx + 1}–${Math.min(endIdx, totalItems)} de ${totalItems} usuarios`
              : 'Sin resultados'}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <button
              type="button"
              onClick={() => setPage(Math.max(safePage - 1, 1))}
              disabled={safePage === 1}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(safePage + 1, totalPages))}
              disabled={safePage === totalPages}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Usuario</label>
                <input
                  type="text"
                  required
                  value={formData.usuario}
                  onChange={(e) => setFormData({...formData, usuario: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="ej. jdoe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Real</label>
                <input
                  type="text"
                  value={formData.nombre_real}
                  onChange={(e) => setFormData({...formData, nombre_real: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Nombre y Apellidos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="correo@empresa.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={formData.telefono}
                    onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="999888777"
                  />
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Área / Equipo</label>
                <select
                  value={formData.area_id}
                  onChange={(e) => setFormData({...formData, area_id: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Seleccionar Área</option>
                  {areas.map(area => (
                    <option key={area.id} value={area.id}>
                      {area.nombre}
                    </option>
                  ))}
                </select>
              </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingUser ? 'Contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    required
                    value={formData.rol_id}
                    onChange={(e) => setFormData({...formData, rol_id: e.target.value})}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none bg-white"
                  >
                    <option value="">Seleccionar Rol</option>
                    {roles.map(rol => (
                      <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 p-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">¿Eliminar Usuario?</h3>
            <p className="text-gray-500 mb-6">
              ¿Estás seguro de que deseas eliminar a <strong>{userToDelete?.usuario}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={executeDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-200 font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Usuarios;
