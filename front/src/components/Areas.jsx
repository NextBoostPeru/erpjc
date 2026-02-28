import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  Briefcase, Plus, Edit2, Trash2, CheckCircle, XCircle, 
  Search, Shield, Layout
} from 'lucide-react';

const Areas = () => {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    status: 'activo'
  });

  useEffect(() => {
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await axios.get(`${API_URL}/areas.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && response.data.success) {
        setAreas(Array.isArray(response.data.data) ? response.data.data : []);
      } else {
        setAreas([]);
      }
    } catch (error) {
      console.error("Error fetching areas:", error);
      // Solo mostrar error si no es un 404 (posiblemente módulo no desplegado)
      if (error.response && error.response.status !== 404) {
        toast.error("Error al cargar áreas");
      }
      setAreas([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (editingArea) {
        // Edit Mode
        const payload = { ...formData, id: editingArea.id };
        await axios.put(`${API_URL}/areas.php`, payload, { headers });
        toast.success("Área actualizada correctamente");
      } else {
        // Create Mode
        await axios.post(`${API_URL}/areas.php`, formData, { headers });
        toast.success("Área creada correctamente");
      }
      
      setModalOpen(false);
      resetForm();
      fetchAreas();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al guardar área");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este área?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/areas.php?id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Área eliminada");
      fetchAreas();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al eliminar área");
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      descripcion: '',
      status: 'activo'
    });
    setEditingArea(null);
  };

  const handleEdit = (area) => {
    setEditingArea(area);
    setFormData({
      nombre: area.nombre,
      descripcion: area.descripcion || '',
      status: area.status
    });
    setModalOpen(true);
  };

  const filteredAreas = areas.filter(area => 
    area.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (area.descripcion && area.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Layout className="w-8 h-8 text-blue-600" />
            Gestión de Áreas de Ventas
          </h1>
          <p className="text-gray-500 mt-2">Administra los equipos y áreas de ventas</p>
        </div>
        <button
          onClick={() => { resetForm(); setModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-200 flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <Plus size={20} />
          Nueva Área
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Search Bar */}
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar áreas..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/80 text-gray-600 font-semibold text-sm uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Nombre del Área</th>
                <th className="px-6 py-4 text-left">Descripción</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      Cargando áreas...
                    </div>
                  </td>
                </tr>
              ) : filteredAreas.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                    No se encontraron áreas registradas
                  </td>
                </tr>
              ) : (
                filteredAreas.map((area) => (
                  <tr key={area.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-800">{area.nombre}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {area.descripcion || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        (area.status || 'inactivo') === 'activo' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {(area.status || 'inactivo') === 'activo' ? (
                          <CheckCircle size={14} className="mr-1" />
                        ) : (
                          <XCircle size={14} className="mr-1" />
                        )}
                        {((area.status || 'inactivo').charAt(0).toUpperCase() + (area.status || 'inactivo').slice(1))}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleEdit(area)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(area.id)}
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

      {/* Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                {editingArea ? <Edit2 className="text-blue-600" size={24} /> : <Briefcase className="text-blue-600" size={24} />}
                {editingArea ? 'Editar Área' : 'Nueva Área'}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Área</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={formData.nombre}
                  onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej. Ventas 01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                  placeholder="Descripción opcional..."
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                >
                  {editingArea ? 'Guardar Cambios' : 'Crear Área'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Areas;