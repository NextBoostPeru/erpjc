import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Search, Plus, Edit, Trash2, FileText, CheckCircle, X, ExternalLink, Download, Phone, MapPin, Mail, Filter, ChevronLeft, ChevronRight, Paperclip, Eye, Upload } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { API_URL } from '../api/config';
import * as XLSX from 'xlsx';

const ClientesProveedores = () => {
  const [activeTab, setActiveTab] = useState('clientes'); // clientes, proveedores
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  const [formData, setFormData] = useState({
    id: '',
    tipo_doc: '6',
    num_doc: '',
    razon_social: '',
    direccion: '',
    telefono: '',
    email: '',
    clasificacion: 'Regular',
    condicion_pago: 'Contado'
  });

  // Files State
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedSearch(searchTerm);
        setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, showInactive]);

  useEffect(() => {
    fetchData();
  }, [activeTab, debouncedSearch, showInactive, page]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const estadoParam = showInactive ? 'Todos' : 'Activo';
      const res = await axios.get(`${API_URL}/clientes_proveedores.php?action=listar&type=${activeTab}&search=${debouncedSearch}&estado=${estadoParam}&page=${page}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.pagination) {
        setData(res.data.data);
        setTotalPages(res.data.pagination.total_pages);
      } else {
        setData(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
      const msg = error.response?.data?.message || "Error al cargar datos. Verifique su conexión.";
      toast.error(msg);
      if (error.response?.status === 401) {
          // Token expirado o inválido
          toast.error("Sesión expirada. Por favor inicie sesión nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleConsultarDoc = async () => {
    if (formData.tipo_doc === '6' && formData.num_doc.length !== 11) {
      toast.error("El RUC debe tener 11 dígitos");
      return;
    }
    if (formData.tipo_doc === '1' && formData.num_doc.length !== 8) {
      toast.error("El DNI debe tener 8 dígitos");
      return;
    }

    const toastId = toast.loading("Consultando...");
    try {
      const res = await axios.get(`${API_URL}/clientes_proveedores.php?action=consulta_doc&doc=${formData.num_doc}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setFormData(prev => ({
          ...prev,
          razon_social: res.data.razon_social,
          direccion: res.data.direccion || '',
          // clasificacion: res.data.estado === 'ACTIVO' ? 'Regular' : 'Riesgo' 
        }));
        toast.success("Datos encontrados", { id: toastId });
      }
    } catch (error) {
      toast.error("Error en consulta", { id: toastId });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/clientes_proveedores.php?action=guardar&type=${activeTab}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(formData.id ? "Actualizado correctamente" : "Registrado correctamente");
      setShowModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al guardar");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este registro?")) return;
    try {
      await axios.get(`${API_URL}/clientes_proveedores.php?action=eliminar&type=${activeTab}&id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Eliminado correctamente");
      fetchData();
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const handleHistory = async (entity) => {
    setSelectedEntity(entity);
    setShowHistoryModal(true);
    setHistoryData([]);
    try {
      const res = await axios.get(`${API_URL}/clientes_proveedores.php?action=historial&type=${activeTab}&num_doc=${entity.num_doc}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistoryData(res.data);
    } catch (error) {
      toast.error("Error cargando historial");
    }
  };

  const handleExportExcel = async () => {
    try {
      const toastId = toast.loading("Generando Excel...");
      const estadoParam = showInactive ? 'Todos' : 'Activo';
      const res = await axios.get(`${API_URL}/clientes_proveedores.php?action=listar&type=${activeTab}&search=${debouncedSearch}&estado=${estadoParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let exportData = [];
      if (res.data.pagination) {
        // This shouldn't happen if we don't send page param, but just in case
        exportData = res.data.data;
      } else {
        exportData = Array.isArray(res.data) ? res.data : [];
      }

      if (!exportData.length) {
        toast.error("No hay datos para exportar", { id: toastId });
        return;
      }

      const ws = XLSX.utils.json_to_sheet(exportData.map(item => ({
        "Tipo Doc": item.tipo_doc === '6' ? 'RUC' : 'DNI',
        "Número": item.num_doc,
        "Razón Social": item.razon_social,
        "Dirección": item.direccion,
        "Teléfono": item.telefono,
        "Email": item.email,
        "Clasificación": item.clasificacion,
        "Cond. Pago": item.condicion_pago,
        "Estado": item.estado
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, activeTab === 'clientes' ? "Clientes" : "Proveedores");
      XLSX.writeFile(wb, `${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Excel generado correctamente", { id: toastId });
    } catch (error) {
      console.error("Error exportando:", error);
      toast.error("Error al exportar datos");
    }
  };

  // Files Functions
  const openFilesModal = async (entity) => {
    setSelectedEntity(entity);
    setShowFilesModal(true);
    loadFiles(entity.id);
  };

  const loadFiles = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/clientes_proveedores.php?action=listar_archivos&proveedor_id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(res.data);
    } catch (error) {
      console.error("Error cargando archivos:", error);
      toast.error("Error al cargar archivos");
    }
  };

  const handleFileUpload = async (e) => {
    const fileList = e.target.files;
    if (!fileList.length) return;

    setUploading(true);
    const uploadToast = toast.loading("Subiendo archivos...");

    try {
      // Support multiple files
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append('proveedor_id', selectedEntity.id);
        formData.append('archivo', file);

        await axios.post(`${API_URL}/clientes_proveedores.php?action=upload_archivo`, formData, {
            headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'multipart/form-data'
            }
        });
      }
      
      toast.success("Archivos subidos correctamente", { id: uploadToast });
      loadFiles(selectedEntity.id);
      e.target.value = null; // Reset input
    } catch (error) {
      console.error("Error subiendo archivo:", error);
      toast.error(error.response?.data?.message || "Error al subir archivo", { id: uploadToast });
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (id) => {
    if(!window.confirm("¿Seguro que desea eliminar este archivo?")) return;
    
    try {
      await axios.get(`${API_URL}/clientes_proveedores.php?action=eliminar_archivo&id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Archivo eliminado");
      loadFiles(selectedEntity.id);
    } catch (error) {
      toast.error("Error al eliminar archivo");
    }
  };

  const openModal = (entity = null) => {
    if (entity) {
      setFormData(entity);
    } else {
      setFormData({
        id: '',
        tipo_doc: '6',
        num_doc: '',
        razon_social: '',
        direccion: '',
        telefono: '',
        email: '',
        clasificacion: 'Regular',
        condicion_pago: 'Contado'
      });
    }
    setShowModal(true);
  };

  return (
    <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto">
      <Toaster position="top-right" />
      
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users size={32} className="text-blue-600" /> 
            <span className="hidden md:inline">Gestión de</span> {activeTab === 'clientes' ? 'Clientes' : 'Proveedores'}
        </h1>
        
        <div className="flex bg-gray-100 p-1 rounded-lg w-full md:w-auto">
            <button 
              className={`flex-1 md:flex-none px-6 py-2 rounded-md font-medium transition-all ${activeTab === 'clientes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('clientes')}
            >
              Clientes
            </button>
            <button 
              className={`flex-1 md:flex-none px-6 py-2 rounded-md font-medium transition-all ${activeTab === 'proveedores' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('proveedores')}
            >
              Proveedores
            </button>
          {/* Modal Archivos */}
      {showFilesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Paperclip className="text-purple-600" />
                  Archivos: {selectedEntity?.razon_social}
              </h3>
              <button className="text-gray-400 hover:text-gray-600 transition-colors p-1" onClick={() => setShowFilesModal(false)}><X size={24} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
                {/* Upload Section */}
                <div className="mb-6">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 mb-2 text-gray-500" />
                            <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click para subir</span> o arrastrar archivos</p>
                            <p className="text-xs text-gray-500">PDF, PNG, JPG (Max. 10MB)</p>
                        </div>
                        <input type="file" className="hidden" multiple onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png" disabled={uploading} />
                    </label>
                    {uploading && <div className="text-center mt-2 text-sm text-blue-600 font-medium animate-pulse">Subiendo archivos...</div>}
                </div>

                {/* Files List */}
                <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    Archivos Adjuntos ({files.length})
                </h4>
                
                {files.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-100">
                        No hay archivos adjuntos
                    </div>
                ) : (
                    <div className="space-y-2">
                        {files.map(file => (
                            <div key={file.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                        <FileText size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{file.nombre_archivo}</p>
                                        <p className="text-xs text-gray-500">{new Date(file.fecha_subida).toLocaleDateString()} - {file.tipo_archivo?.toUpperCase()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a 
                                        href={`${API_URL}${file.url}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Ver"
                                    >
                                        <Eye size={18} />
                                    </a>
                                    <button 
                                        onClick={() => deleteFile(file.id)}
                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button 
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium" 
                    onClick={() => setShowFilesModal(false)}
                >
                    Cerrar
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-100">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="relative w-full md:w-96">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
              placeholder="Buscar por RUC o Razón Social..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
             <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 whitespace-nowrap">
                <input 
                    type="checkbox" 
                    checked={showInactive} 
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Ver Inactivos</span>
             </label>

             <button 
                onClick={handleExportExcel}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium whitespace-nowrap"
             >
                <Download size={18} /> <span className="hidden md:inline">Exportar</span>
             </button>

             <button 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium whitespace-nowrap" 
                onClick={() => openModal()}
             >
                <Plus size={18} /> Nuevo
             </button>
          </div>
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Documento</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Razón Social</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Clasificación</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Cond. Pago</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Contacto</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr><td colSpan="6" className="text-center py-8 text-gray-500">Cargando...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-8 text-gray-500 italic">No se encontraron registros</td></tr>
            ) : (
              data.map(item => (
                <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${item.estado === 'Inactivo' ? 'bg-gray-50 opacity-60' : ''}`}>
                  <td className="px-6 py-4">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200 mb-1">{item.tipo_doc === '6' ? 'RUC' : 'DNI'}</span>
                    <div className="text-sm font-mono text-gray-600">{item.num_doc}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{item.razon_social}</div>
                    <small className="text-gray-500 block truncate max-w-xs flex items-center gap-1">
                        <MapPin size={10} /> {item.direccion || 'Sin dirección'}
                    </small>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.clasificacion === 'VIP' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                      {item.clasificacion}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{item.condicion_pago}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 flex items-center gap-1">
                        <Phone size={12} className="text-gray-400"/> {item.telefono || '-'}
                    </div>
                    <small className="text-gray-500 block truncate max-w-[150px] flex items-center gap-1">
                        <Mail size={10} className="text-gray-400"/> {item.email || '-'}
                    </small>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" onClick={() => handleHistory(item)} title="Historial">
                        <FileText size={18} />
                      </button>
                      {activeTab === 'proveedores' && (
                        <button className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors" onClick={() => openFilesModal(item)} title="Archivos">
                          <Paperclip size={18} />
                        </button>
                      )}
                      <button className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors" onClick={() => openModal(item)} title="Editar">
                        <Edit size={18} />
                      </button>
                      <button className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" onClick={() => handleDelete(item.id)} title="Eliminar">
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

    {/* Mobile View (Cards) */}
    <div className="md:hidden space-y-4">
        {loading ? (
             <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : data.length === 0 ? (
             <div className="text-center py-8 text-gray-500 italic">No se encontraron registros</div>
        ) : (
            data.map(item => (
                <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm border border-gray-100 ${item.estado === 'Inactivo' ? 'opacity-75 bg-gray-50' : ''}`}>
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                    {item.tipo_doc === '6' ? 'RUC' : 'DNI'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.clasificacion === 'VIP' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {item.clasificacion}
                                </span>
                            </div>
                            <h3 className="font-semibold text-gray-800">{item.razon_social}</h3>
                            <p className="text-sm text-gray-500 font-mono">{item.num_doc}</p>
                        </div>
                        <div className="flex gap-1">
                             <button className="p-2 text-amber-600 bg-amber-50 rounded-lg" onClick={() => openModal(item)}><Edit size={18} /></button>
                        </div>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div className="flex items-center gap-2">
                            <MapPin size={14} className="text-gray-400" />
                            <span className="truncate">{item.direccion || 'Sin dirección'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone size={14} className="text-gray-400" />
                            <span>{item.telefono || 'Sin teléfono'}</span>
                        </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex flex-wrap justify-between items-center gap-2">
                         <button 
                            className="text-blue-600 text-sm font-medium flex items-center gap-1"
                            onClick={() => handleHistory(item)}
                         >
                            <FileText size={16} /> Historial
                         </button>
                         {activeTab === 'proveedores' && (
                            <button 
                                className="text-purple-600 text-sm font-medium flex items-center gap-1"
                                onClick={() => openFilesModal(item)}
                            >
                                <Paperclip size={16} /> Archivos
                            </button>
                         )}
                         <button 
                            className="text-red-600 text-sm font-medium flex items-center gap-1"
                            onClick={() => handleDelete(item.id)}
                         >
                            <Trash2 size={16} /> Eliminar
                         </button>
                    </div>
                </div>
            ))
        )}
    </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
              <ChevronLeft size={20} /> <span className="hidden sm:inline">Anterior</span>
          </button>
          <span className="text-gray-600 font-medium">
              Página {page} de {totalPages}
          </span>
          <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
              <span className="hidden sm:inline">Siguiente</span> <ChevronRight size={20} />
          </button>
      </div>

      {/* Modal Formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-gray-800">{formData.id ? 'Editar' : 'Nuevo'} {activeTab === 'clientes' ? 'Cliente' : 'Proveedor'}</h3>
              <button className="text-gray-400 hover:text-gray-600 transition-colors p-1" onClick={() => setShowModal(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Tipo Doc.</label>
                  <select name="tipo_doc" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" value={formData.tipo_doc} onChange={handleInputChange}>
                    <option value="6">RUC</option>
                    <option value="1">DNI</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Número Doc.</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name="num_doc" 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                      value={formData.num_doc} 
                      onChange={handleInputChange} 
                      required 
                      maxLength={formData.tipo_doc === '6' ? 11 : 8}
                    />
                    <button type="button" className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors border border-gray-200" onClick={handleConsultarDoc} title="Consultar">
                        <ExternalLink size={20} />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Razón Social / Nombre</label>
                  <input type="text" name="razon_social" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={formData.razon_social} onChange={handleInputChange} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Teléfono</label>
                  <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" name="telefono" value={formData.telefono} onChange={handleInputChange} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Dirección</label>
                  <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" name="direccion" value={formData.direccion} onChange={handleInputChange} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" type="email" name="email" value={formData.email} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Clasificación</label>
                  <select name="clasificacion" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" value={formData.clasificacion} onChange={handleInputChange}>
                    <option value="Regular">Regular</option>
                    <option value="VIP">VIP</option>
                    <option value="Riesgo">Riesgo</option>
                    <option value="Nuevo">Nuevo</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Condición Pago</label>
                  <select name="condicion_pago" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" value={formData.condicion_pago} onChange={handleInputChange}>
                    <option value="Contado">Contado</option>
                    <option value="Credito 7 dias">Crédito 7 días</option>
                    <option value="Credito 15 dias">Crédito 15 días</option>
                    <option value="Credito 30 dias">Crédito 30 días</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 p-6 border-t border-gray-100 sticky bottom-0 bg-white z-10">
                <button type="button" className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-gray-800">Historial: {selectedEntity?.razon_social}</h3>
              <button className="text-gray-400 hover:text-gray-600 transition-colors p-1" onClick={() => setShowHistoryModal(false)}><X size={24} /></button>
            </div>
            <div className="p-6">
              {historyData.length === 0 ? (
                <p className="text-center text-gray-500 italic py-8">No hay operaciones registradas</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Documento</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Monto</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {historyData.map((op, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-700">{op.fecha}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 font-mono">{op.documento}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">S/ {parseFloat(op.monto).toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${op.estado === 'Aceptado' || op.estado === 'Registrado' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                  {op.estado}
                              </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 sticky bottom-0 bg-white z-10">
               <button className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium" onClick={() => setShowHistoryModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientesProveedores;
