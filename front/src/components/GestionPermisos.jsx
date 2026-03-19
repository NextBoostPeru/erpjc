import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  Shield, Plus, Trash2, Save, XCircle, CheckCircle, Search, Edit2, ChevronLeft, ChevronRight 
} from 'lucide-react';

const GestionPermisos = () => {
  const [assignments, setAssignments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  // Roles CRUD state
  const [rolesData, setRolesData] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({ id: null, nombre: '', descripcion: '' });
  const [roleSearch, setRoleSearch] = useState('');
  
  // Permissions State
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  // Filters
  const [selectedRole, setSelectedRole] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);
  
  // Form State
  const [formData, setFormData] = useState({
    rol_id: '',
    modulo_id: '',
    permiso_lectura: 1,
    permiso_crear: 0,
    permiso_editar: 0,
    permiso_eliminacion: 0
  });
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const canWrite = canCreate || canEdit;

  const myRoleId = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      return Number(u?.rol_id || u?.rolId || u?.role_id || 0);
    } catch (e) {
      return 0;
    }
  })();

  const refreshMyModules = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}my_modules.php`, {
        headers: { Authorization: `Bearer ${token}` },
        _suppressForbiddenToast: true
      });
      const mods = Array.isArray(res.data) ? res.data : (res.data.modulos || []);
      if (!Array.isArray(mods)) return;
      if (mods.length === 0) return;
      localStorage.setItem('modulos', JSON.stringify(mods));
      window.dispatchEvent(new CustomEvent('erpjc:modules_updated', { detail: mods }));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const checkPermissions = async () => {
      const cacheKey = 'perms_permisos';

      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API_URL}check_my_permissions.php?code=permisos&token=${token}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setCanCreate(response.data.crear === 1);
        setCanEdit(response.data.editar === 1);
        setCanDelete(response.data.eliminacion === 1);
        sessionStorage.setItem(cacheKey, JSON.stringify(response.data));
      } catch (error) {
        console.error("Error checking permissions", error);
        const modulos = JSON.parse(localStorage.getItem('modulos')) || [];
        const currentModule = modulos.find(m => m.codigo === 'permisos');
        if (currentModule) {
          const canCreateLocal = Number(currentModule.permiso_crear) === 1;
          const canEditLocal = Number(currentModule.permiso_editar) === 1;
          const canWriteLocal = Number(currentModule.permiso_escritura) === 1;
          setCanCreate(canCreateLocal || canWriteLocal);
          setCanEdit(canEditLocal || canWriteLocal);
          setCanDelete(currentModule.permiso_eliminacion === 1);
        }
      }
    };

    checkPermissions();
  }, []);

  useEffect(() => {
    fetchData(page);
    fetchRolesData();
  }, [page, selectedRole]);

  const fetchData = async (currentPage = 1) => {
    try {
      const token = localStorage.getItem('token');
      // Enviamos token en URL también
      let url = `${API_URL}roles_modulos.php?page=${currentPage}&limit=${limit}&token=${token}`;
      if (selectedRole) {
        url += `&rol_id=${selectedRole}`;
      }
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAssignments(response.data.assignments || []);
      setRoles(response.data.roles || []);
      setModules(response.data.modules || []);
      if (response.data.pagination) {
          setTotalPages(response.data.pagination.totalPages);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const fetchRolesData = async () => {
    try {
      setRolesLoading(true);
      const token = localStorage.getItem('token');
      const params = [];
      if (roleSearch) params.push(`search=${encodeURIComponent(roleSearch)}`);
      if (token) params.push(`token=${encodeURIComponent(token)}`);
      const query = params.length ? `?${params.join('&')}` : '';
      const res = await axios.get(`${API_URL}roles.php${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRolesData(res.data || []);
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar roles");
    } finally {
      setRolesLoading(false);
    }
  };

  const openNewRole = () => {
    setRoleForm({ id: null, nombre: '', descripcion: '' });
    setRoleModalOpen(true);
  };

  const openEditRole = (role) => {
    setRoleForm({ id: role.id, nombre: role.nombre, descripcion: role.descripcion || '' });
    setRoleModalOpen(true);
  };

  const saveRole = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (!roleForm.nombre.trim()) {
        toast.error("El nombre es obligatorio");
        return;
      }
      if (roleForm.id) {
        await axios.put(`${API_URL}roles.php`, roleForm, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Rol actualizado");
      } else {
        await axios.post(`${API_URL}roles.php`, { nombre: roleForm.nombre, descripcion: roleForm.descripcion }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Rol creado");
      }
      setRoleModalOpen(false);
      fetchRolesData();
      // Sync roles for assignments select
      fetchData(page);
    } catch (error) {
      const msg = error.response?.data?.message || "Error al guardar rol";
      toast.error(msg);
    }
  };

  const deleteRole = async (id) => {
    if (!window.confirm('¿Eliminar este rol?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}roles.php?id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Rol eliminado");
      fetchRolesData();
      fetchData(page);
    } catch (error) {
      const msg = error.response?.data?.message || "No se pudo eliminar el rol";
      toast.error(msg);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const affectedRoleId = Number(formData.rol_id || 0);
      if (editingAssignmentId) {
        await axios.put(`${API_URL}roles_modulos.php?token=${token}`, { ...formData, id: editingAssignmentId }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Permisos actualizados");
      } else {
        await axios.post(`${API_URL}roles_modulos.php?token=${token}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Permiso asignado correctamente");
      }
      if (affectedRoleId && myRoleId && affectedRoleId === myRoleId) {
        await refreshMyModules();
      }
      setModalOpen(false);
      setEditingAssignmentId(null);
      fetchData(page);
      setFormData({
        rol_id: '',
        modulo_id: '',
        permiso_lectura: 1,
        permiso_crear: 0,
        permiso_editar: 0,
        permiso_eliminacion: 0
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al asignar permiso");
    }
  };

  const handleToggleAccess = async (item) => {
    const currentAccess = Number(item.permiso_lectura) === 1;
    const newValue = currentAccess ? 0 : 1;

    const updatedAssignments = assignments.map(a =>
      (a.modulo_id === item.modulo_id && a.rol_id === item.rol_id)
        ? { 
            ...a, 
            permiso_lectura: newValue,
            permiso_crear: newValue ? Number(a.permiso_crear || 0) : 0,
            permiso_editar: newValue ? Number(a.permiso_editar || 0) : 0,
            permiso_eliminacion: newValue ? Number(a.permiso_eliminacion || 0) : 0
          }
        : a
    );
    setAssignments(updatedAssignments);

    try {
      const token = localStorage.getItem('token');
      if (item.id) {
        await axios.put(`${API_URL}roles_modulos.php?token=${token}`, {
          id: item.id,
          permiso_lectura: newValue,
          permiso_crear: newValue ? Number(item.permiso_crear || 0) : 0,
          permiso_editar: newValue ? Number(item.permiso_editar || 0) : 0,
          permiso_eliminacion: newValue ? Number(item.permiso_eliminacion || 0) : 0
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Acceso actualizado");
        if (Number(item.rol_id || 0) && myRoleId && Number(item.rol_id || 0) === myRoleId) {
          await refreshMyModules();
        }
      } else {
        const payload = {
          rol_id: item.rol_id,
          modulo_id: item.modulo_id,
          permiso_lectura: newValue,
          permiso_crear: 0,
          permiso_editar: 0,
          permiso_eliminacion: 0
        };
        await axios.post(`${API_URL}roles_modulos.php?token=${token}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Acceso asignado");
        if (Number(item.rol_id || 0) && myRoleId && Number(item.rol_id || 0) === myRoleId) {
          await refreshMyModules();
        }
        fetchData(page);
      }
    } catch (error) {
      toast.error("Error al actualizar acceso");
      fetchData(page);
    }
  };

  const openAssignModal = (assignment = null) => {
    if (assignment) {
      setEditingAssignmentId(assignment.id || null);
      setFormData({
        rol_id: assignment.rol_id,
        modulo_id: assignment.modulo_id,
        permiso_lectura: Number(assignment.permiso_lectura) === 1 ? 1 : 0,
        permiso_crear: Number(assignment.permiso_crear) === 1 ? 1 : 0,
        permiso_editar: Number(assignment.permiso_editar) === 1 ? 1 : 0,
        permiso_eliminacion: Number(assignment.permiso_eliminacion) === 1 ? 1 : 0
      });
    } else {
      setEditingAssignmentId(null);
      setFormData({
        rol_id: '',
        modulo_id: '',
        permiso_lectura: 1,
        permiso_crear: 0,
        permiso_editar: 0,
        permiso_eliminacion: 0
      });
    }
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta asignación?')) return;
    try {
      const token = localStorage.getItem('token');
      const assignment = assignments.find(a => String(a.id) === String(id));
      await axios.delete(`${API_URL}roles_modulos.php?id=${id}&token=${token}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Asignación eliminada");
      if (Number(assignment?.rol_id || 0) && myRoleId && Number(assignment?.rol_id || 0) === myRoleId) {
        await refreshMyModules();
      }
      fetchData(page);
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Shield className="text-blue-600" size={32} />
            Gestión de Permisos
          </h1>
          <p className="text-gray-500 mt-1">Asigna módulos y define permisos por rol (ver/agregar/editar/eliminar)</p>
        </div>
        
        {canCreate && (
        <button 
          onClick={() => openAssignModal(null)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg transition-all"
        >
          <Plus size={20} />
          Asignar Módulo
        </button>
        )}
      </div>

      {/* Roles CRUD */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-700">
            <span className="font-semibold">Roles</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchRolesData(); }}
                placeholder="Buscar rol..."
                className="border border-gray-300 p-2 rounded-lg pr-10 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
              <button
                onClick={fetchRolesData}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                <Search size={18} />
              </button>
            </div>
            {canCreate && (
              <button
                onClick={openNewRole}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow"
              >
                <Plus size={18} />
                Nuevo Rol
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 border-b">Nombre</th>
                <th className="p-4 border-b">Descripción</th>
                <th className="p-4 border-b text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rolesLoading ? (
                <tr><td colSpan="3" className="p-6 text-center text-gray-500">Cargando...</td></tr>
              ) : rolesData.length === 0 ? (
                <tr><td colSpan="3" className="p-6 text-center text-gray-500">No hay roles</td></tr>
              ) : (
                rolesData.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-800">{r.nombre}</td>
                    <td className="p-4 text-gray-600">{r.descripcion || '-'}</td>
                    <td className="p-4 text-center">
                      {canEdit && (
                        <button
                          onClick={() => openEditRole(r)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg mr-2"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteRole(r.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Filter Section */}
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-4">
            <div className="flex items-center gap-2 text-gray-600">
                <Search size={20} />
                <span className="font-medium">Filtrar por Rol:</span>
            </div>
            <select 
                value={selectedRole}
                onChange={(e) => {
                    setSelectedRole(e.target.value);
                    setPage(1);
                }}
                className="border border-gray-300 p-2 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white min-w-[200px]"
            >
                <option value="">Todos los Roles</option>
                {roles && roles.map(role => (
                    <option key={role.id} value={role.id}>{role.nombre}</option>
                ))}
            </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 border-b">Rol</th>
                <th className="p-4 border-b">Módulo</th>
                <th className="p-4 border-b text-center">Ver</th>
                <th className="p-4 border-b text-center">Agregar</th>
                <th className="p-4 border-b text-center">Editar</th>
                <th className="p-4 border-b text-center">Eliminar</th>
                <th className="p-4 border-b text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="7" className="p-8 text-center text-gray-500">Cargando...</td></tr>
              ) : !assignments || assignments.length === 0 ? (
                <tr><td colSpan="7" className="p-8 text-center text-gray-500">No hay asignaciones.</td></tr>
              ) : (
                assignments.map(item => (
                  <tr key={item.id || `${item.rol_id}-${item.modulo_id}`} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-800">{item.rol_nombre}</td>
                    <td className="p-4 text-gray-600">
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm">
                        {item.modulo_nombre}
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      <button
                        onClick={() => canWrite && handleToggleAccess(item)}
                        disabled={!canWrite}
                        className={`p-1 rounded-full transition-colors ${
                          (Number(item.permiso_lectura) === 1)
                            ? 'text-green-600 bg-green-50 hover:bg-green-100'
                            : 'text-gray-300 hover:text-gray-500'
                        } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {(Number(item.permiso_lectura) === 1)
                          ? <CheckCircle size={20} />
                          : <XCircle size={20} />}
                      </button>
                    </td>

                    <td className="p-4 text-center">
                      {Number(item.permiso_crear) === 1 ? (
                        <CheckCircle size={18} className="inline text-green-600" />
                      ) : (
                        <XCircle size={18} className="inline text-gray-300" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {Number(item.permiso_editar) === 1 ? (
                        <CheckCircle size={18} className="inline text-green-600" />
                      ) : (
                        <XCircle size={18} className="inline text-gray-300" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {Number(item.permiso_eliminacion) === 1 ? (
                        <CheckCircle size={18} className="inline text-green-600" />
                      ) : (
                        <XCircle size={18} className="inline text-gray-300" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {canEdit && (
                        <button
                          onClick={() => openAssignModal(item)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-1"
                          title="Editar permisos"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      {canDelete && item.id && (
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar Asignación"
                      >
                        <Trash2 size={18} />
                      </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="flex justify-between items-center p-4 border-t border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">
                Página <span className="font-semibold text-gray-800">{page}</span> de <span className="font-semibold text-gray-800">{totalPages}</span>
            </span>
            <div className="flex gap-2">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600"
                    title="Anterior"
                >
                    <ChevronLeft size={20} />
                </button>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600"
                    title="Siguiente"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">{editingAssignmentId ? 'Editar Permisos' : 'Asignar Nuevo Permiso'}</h2>
              <button onClick={() => { setModalOpen(false); setEditingAssignmentId(null); }} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                    required
                    value={formData.rol_id}
                    onChange={(e) => setFormData({...formData, rol_id: e.target.value})}
                    disabled={!!editingAssignmentId}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="">Seleccionar Rol</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Módulo</label>
                <select
                    required
                    value={formData.modulo_id}
                    onChange={(e) => setFormData({...formData, modulo_id: e.target.value})}
                    disabled={!!editingAssignmentId}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="">Seleccionar Módulo</option>
                    {modules.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.permiso_lectura === 1}
                    onChange={(e) => {
                      const v = e.target.checked ? 1 : 0;
                      setFormData({
                        ...formData,
                        permiso_lectura: v,
                        permiso_crear: v ? formData.permiso_crear : 0,
                        permiso_editar: v ? formData.permiso_editar : 0,
                        permiso_eliminacion: v ? formData.permiso_eliminacion : 0
                      });
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Ver módulo</span>
                </label>

                <label className={`flex items-center gap-2 cursor-pointer ${formData.permiso_lectura !== 1 ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={formData.permiso_lectura !== 1}
                    checked={formData.permiso_crear === 1}
                    onChange={(e) => setFormData({ ...formData, permiso_crear: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Agregar</span>
                </label>

                <label className={`flex items-center gap-2 cursor-pointer ${formData.permiso_lectura !== 1 ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={formData.permiso_lectura !== 1}
                    checked={formData.permiso_editar === 1}
                    onChange={(e) => setFormData({ ...formData, permiso_editar: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Editar</span>
                </label>

                <label className={`flex items-center gap-2 cursor-pointer ${formData.permiso_lectura !== 1 ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={formData.permiso_lectura !== 1}
                    checked={formData.permiso_eliminacion === 1}
                    onChange={(e) => setFormData({ ...formData, permiso_eliminacion: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Eliminar</span>
                </label>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingAssignmentId(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Role Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">{roleForm.id ? 'Editar Rol' : 'Nuevo Rol'}</h2>
              <button onClick={() => setRoleModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
            <form onSubmit={saveRole} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  value={roleForm.nombre}
                  onChange={(e) => setRoleForm({ ...roleForm, nombre: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ej. ventas, admin, rrhh"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={roleForm.descripcion}
                  onChange={(e) => setRoleForm({ ...roleForm, descripcion: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                  placeholder="Descripción del rol (opcional)"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionPermisos;
