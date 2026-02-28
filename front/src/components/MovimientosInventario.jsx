import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { API_URL } from '../api/config';
import { 
  ArrowRightLeft, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Plus, 
  Search, 
  FileText, 
  CheckCircle, 
  XCircle,
  Eye,
  Download,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const MovimientosInventario = () => {
  const [activeTab, setActiveTab] = useState('list'); // list, create
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 20;

  // Form State
  const [formData, setFormData] = useState({
    tipo: 'entrada', // entrada, salida, transferencia
    motivo: 'compra',
    almacen_origen_id: '',
    almacen_destino_id: '',
    documento_referencia: '',
    observacion: '',
    detalles: [] // { producto_id, cantidad, costo_unitario }
  });

  const [detalleTemp, setDetalleTemp] = useState({
    producto_id: '',
    cantidad: '',
    costo_unitario: ''
  });

  const [productSearch, setProductSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const token = localStorage.getItem('token');

  // Debounce effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchMovimientos();
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchAlmacenes();
    fetchProductos();
  }, []);

  const fetchMovimientos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });
      if (debouncedSearch) params.append('search', debouncedSearch);

      const response = await axios.get(`${API_URL}movimientos.php?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.pagination) {
        setMovimientos(response.data.data);
        setTotalPages(response.data.pagination.total_pages);
      } else if (Array.isArray(response.data)) {
        setMovimientos(response.data);
      } else {
        console.error('La respuesta de la API no es un array:', response.data);
        setMovimientos([]);
      }
    } catch (error) {
      console.error('Error fetching movimientos:', error);
      toast.error('Error al cargar movimientos');
      setMovimientos([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlmacenes = async () => {
    try {
      const response = await axios.get(`${API_URL}almacenes.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlmacenes(response.data);
    } catch (error) {
      console.error('Error fetching almacenes:', error);
    }
  };

  const fetchProductos = async () => {
    try {
      const response = await axios.get(`${API_URL}productos.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProductos(response.data);
    } catch (error) {
      console.error('Error fetching productos:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDetalleChange = (e) => {
    const { name, value } = e.target;
    setDetalleTemp(prev => ({ ...prev, [name]: value }));
  };

  const addDetalle = () => {
    if (!detalleTemp.producto_id || !detalleTemp.cantidad) {
      toast.error('Seleccione producto y cantidad');
      return;
    }
    
    const producto = productos.find(p => p.id == detalleTemp.producto_id);
    
    setFormData(prev => ({
      ...prev,
      detalles: [...prev.detalles, { 
        ...detalleTemp, 
        producto_nombre: producto?.nombre,
        codigo_interno: producto?.codigo_interno
      }]
    }));
    
    setDetalleTemp({ producto_id: '', cantidad: '', costo_unitario: '' });
    setProductSearch('');
  };

  const removeDetalle = (index) => {
    setFormData(prev => ({
      ...prev,
      detalles: prev.detalles.filter((_, i) => i !== index)
    }));
  };

  const handleDetalleUpdate = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      detalles: prev.detalles.map((det, i) => 
        i === index ? { ...det, [field]: value } : det
      )
    }));
  };

  const resetForm = () => {
    setFormData({
      tipo: 'entrada',
      motivo: 'compra',
      almacen_origen_id: '',
      almacen_destino_id: '',
      documento_referencia: '',
      observacion: '',
      detalles: []
    });
    setIsEditing(false);
    setEditingId(null);
    setDetalleTemp({ producto_id: '', cantidad: '', costo_unitario: '' });
    setProductSearch('');
  };

  const handleEdit = (movimiento) => {
    setFormData({
      tipo: movimiento.tipo,
      motivo: movimiento.motivo,
      almacen_origen_id: movimiento.almacen_origen_id || '',
      almacen_destino_id: movimiento.almacen_destino_id || '',
      documento_referencia: movimiento.documento_referencia || '',
      observacion: movimiento.observacion || '',
      detalles: movimiento.detalles.map(d => ({
        producto_id: d.producto_id,
        producto_nombre: d.producto_nombre,
        codigo_interno: d.codigo_interno,
        cantidad: d.cantidad,
        costo_unitario: d.costo_unitario
      }))
    });
    setEditingId(movimiento.id);
    setIsEditing(true);
    setActiveTab('create');
    setSelectedMovimiento(null);
  };

  const handleDelete = (id) => {
    setDeleteId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      await axios.delete(`${API_URL}movimientos.php?id=${deleteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Movimiento eliminado');
      fetchMovimientos();
      if (selectedMovimiento?.id === deleteId) setSelectedMovimiento(null);
      setShowDeleteModal(false);
      setDeleteId(null);
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.detalles.length === 0) {
      toast.error('Debe agregar al menos un producto');
      return;
    }

    try {
      if (isEditing && editingId) {
        await axios.put(`${API_URL}movimientos.php?id=${editingId}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Movimiento actualizado');
      } else {
        await axios.post(`${API_URL}movimientos.php`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Movimiento registrado (Pendiente)');
      }
      
      fetchMovimientos();
      setActiveTab('list');
      resetForm();
    } catch (error) {
      console.error('Error saving movimiento:', error);
      toast.error(error.response?.data?.error || 'Error al guardar movimiento');
    }
  };

  const handleStatusChange = async (id, status) => {
    if (!confirm(`¿Está seguro de cambiar el estado a ${status}? Esto afectará el stock.`)) return;

    try {
      await axios.put(`${API_URL}movimientos.php?id=${id}`, { estado: status }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Movimiento ${status} exitosamente`);
      fetchMovimientos();
      if (selectedMovimiento) setSelectedMovimiento(null);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.response?.data?.error || 'Error al actualizar estado');
    }
  };

  const viewDetails = async (movimiento) => {
    try {
      const response = await axios.get(`${API_URL}movimientos.php?id=${movimiento.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedMovimiento(response.data);
    } catch (error) {
      console.error('Error details:', error);
      toast.error('Error al cargar detalles');
    }
  };

  const getTipoBadge = (tipo) => {
    switch (tipo) {
      case 'entrada': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs flex items-center gap-1"><ArrowDownCircle size={12}/> Entrada</span>;
      case 'salida': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs flex items-center gap-1"><ArrowUpCircle size={12}/> Salida</span>;
      case 'transferencia': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs flex items-center gap-1"><ArrowRightLeft size={12}/> Transferencia</span>;
      default: return tipo;
    }
  };

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'pendiente': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Pendiente</span>;
      case 'confirmado': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Confirmado</span>;
      case 'anulado': return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">Anulado</span>;
      default: return estado;
    }
  };

  const handleExportExcel = async () => {
    try {
      const toastId = toast.loading("Generando Excel...");
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);

      const response = await axios.get(`${API_URL}movimientos.php?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let exportData = [];
      if (response.data.pagination) {
          exportData = response.data.data;
      } else if (Array.isArray(response.data)) {
          exportData = response.data;
      }

      if (!exportData.length) {
          toast.error("No hay datos para exportar", { id: toastId });
          return;
      }

      const dataToExport = exportData.map(mov => ({
        "ID": mov.id,
        "Fecha": mov.fecha,
        "Tipo": mov.tipo,
        "Motivo": mov.motivo,
        "Origen": mov.almacen_origen_nombre || '-',
        "Destino": mov.almacen_destino_nombre || '-',
        "Documento Ref.": mov.documento_referencia || '-',
        "Usuario": mov.usuario_nombre,
        "Estado": mov.estado
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
      XLSX.writeFile(wb, `Movimientos_Inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast.success("Excel generado correctamente", { id: toastId });
    } catch (error) {
      console.error("Error exportando:", error);
      toast.error("Error al exportar datos");
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Movimientos de Inventario</h1>
        {activeTab === 'list' && (
          <div className="flex gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <button
                onClick={() => {
                resetForm();
                setActiveTab('create');
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 whitespace-nowrap"
            >
                <Plus size={20} />
                Nuevo Movimiento
            </button>
          </div>
        )}
      </div>

      {activeTab === 'list' ? (
        selectedMovimiento ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold mb-2">Detalle de Movimiento #{selectedMovimiento.id}</h2>
                <div className="flex gap-2">
                  {getTipoBadge(selectedMovimiento.tipo)}
                  {getEstadoBadge(selectedMovimiento.estado)}
                </div>
              </div>
              <button onClick={() => setSelectedMovimiento(null)} className="text-gray-500 hover:text-gray-700">
                <XCircle size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <p className="text-sm text-gray-500">Fecha</p>
                <p className="font-medium">{selectedMovimiento.fecha}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Motivo</p>
                <p className="font-medium capitalize">{selectedMovimiento.motivo?.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Usuario</p>
                <p className="font-medium">{selectedMovimiento.usuario_nombre}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Origen</p>
                <p className="font-medium">{selectedMovimiento.almacen_origen_nombre || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Destino</p>
                <p className="font-medium">{selectedMovimiento.almacen_destino_nombre || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Documento Ref.</p>
                <p className="font-medium">{selectedMovimiento.documento_referencia || '-'}</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden mb-6">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    {selectedMovimiento.tipo === 'entrada' && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {selectedMovimiento.detalles?.map((det, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{det.codigo_interno}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{det.producto_nombre}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{det.cantidad}</td>
                      {selectedMovimiento.tipo === 'entrada' && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">${det.costo_unitario}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedMovimiento.estado === 'pendiente' && (
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => handleEdit(selectedMovimiento)}
                  className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-2"
                >
                  <Edit size={18} /> Editar
                </button>
                <button
                  onClick={() => handleDelete(selectedMovimiento.id)}
                  className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 size={18} /> Eliminar
                </button>
                <button
                  onClick={() => handleStatusChange(selectedMovimiento.id, 'anulado')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Anular
                </button>
                <button
                  onClick={() => handleStatusChange(selectedMovimiento.id, 'confirmado')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <CheckCircle size={18} /> Confirmar Movimiento
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origen / Destino</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {movimientos.map((mov) => (
                    <tr key={mov.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{mov.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{mov.fecha}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{getTipoBadge(mov.tipo)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{mov.motivo?.replace('_', ' ')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {mov.tipo === 'entrada' && mov.almacen_destino_nombre}
                        {mov.tipo === 'salida' && mov.almacen_origen_nombre}
                        {mov.tipo === 'transferencia' && `${mov.almacen_origen_nombre} -> ${mov.almacen_destino_nombre}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getEstadoBadge(mov.estado)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => viewDetails(mov)} className="text-blue-600 hover:text-blue-900" title="Ver detalles">
                            <Eye size={18} />
                          </button>
                          {mov.estado === 'pendiente' && (
                            <>
                              <button onClick={() => handleEdit(mov)} className="text-indigo-600 hover:text-indigo-900" title="Editar">
                                <Edit size={18} />
                              </button>
                              <button onClick={() => handleDelete(mov.id)} className="text-red-600 hover:text-red-900" title="Eliminar">
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-between items-center bg-white p-4 border-t border-gray-200">
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
          </div>
        )
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between mb-6">
            <h2 className="text-xl font-bold">Nuevo Movimiento</h2>
            <button onClick={() => setActiveTab('list')} className="text-gray-500 hover:text-gray-700">
              <XCircle size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Movimiento</label>
                <select
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleInputChange}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="entrada">Entrada</option>
                  <option value="salida">Salida</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <select
                  name="motivo"
                  value={formData.motivo}
                  onChange={handleInputChange}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {formData.tipo === 'entrada' && (
                    <>
                      <option value="compra">Compra</option>
                      <option value="devolucion">Devolución</option>
                      <option value="ajuste">Ajuste de Inventario</option>
                      <option value="inicial">Inventario Inicial</option>
                      <option value="alquiler">Alquiler (Devolución)</option>
                    </>
                  )}
                  {formData.tipo === 'salida' && (
                    <>
                      <option value="venta">Venta</option>
                      <option value="consumo_interno">Consumo Interno</option>
                      <option value="merma">Merma / Desecho</option>
                      <option value="ajuste">Ajuste de Inventario</option>
                      <option value="alquiler">Alquiler (Salida)</option>
                    </>
                  )}
                  {formData.tipo === 'transferencia' && (
                    <option value="traslado">Traslado entre almacenes</option>
                  )}
                </select>
              </div>

              {(formData.tipo === 'salida' || formData.tipo === 'transferencia') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Almacén Origen</label>
                  <select
                    name="almacen_origen_id"
                    value={formData.almacen_origen_id}
                    onChange={handleInputChange}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">Seleccione Almacén</option>
                    {almacenes.map(alm => (
                      <option key={alm.id} value={alm.id}>{alm.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {(formData.tipo === 'entrada' || formData.tipo === 'transferencia') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Almacén Destino</label>
                  <select
                    name="almacen_destino_id"
                    value={formData.almacen_destino_id}
                    onChange={handleInputChange}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">Seleccione Almacén</option>
                    {almacenes.map(alm => (
                      <option key={alm.id} value={alm.id}>{alm.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Documento Referencia</label>
                <input
                  type="text"
                  name="documento_referencia"
                  value={formData.documento_referencia}
                  onChange={handleInputChange}
                  placeholder="Ej: FAC-1234, GR-001"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observación</label>
                <textarea
                  name="observacion"
                  value={formData.observacion}
                  onChange={handleInputChange}
                  rows="2"
                  className="w-full border rounded-lg px-3 py-2"
                ></textarea>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Detalle de Productos</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 items-end">
                <div className="md:col-span-2 relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowSuggestions(true);
                        if (detalleTemp.producto_id) {
                            setDetalleTemp(prev => ({ ...prev, producto_id: '' }));
                        }
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Buscar producto (min. 3 caracteres)..."
                      className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  {showSuggestions && productSearch.length >= 3 && (
                    <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                      {productos
                        .filter(p => 
                          p.nombre.toLowerCase().includes(productSearch.toLowerCase()) || 
                          p.codigo_interno.toLowerCase().includes(productSearch.toLowerCase())
                        )
                        .map(prod => (
                          <li
                            key={prod.id}
                            onClick={() => {
                              setDetalleTemp(prev => ({ 
                                ...prev, 
                                producto_id: prod.id,
                                costo_unitario: prod.precio || ''
                              }));
                              setProductSearch(`${prod.codigo_interno} - ${prod.nombre}`);
                              setShowSuggestions(false);
                            }}
                            className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b last:border-b-0"
                          >
                            <div className="font-medium">{prod.nombre}</div>
                            <div className="text-gray-500 text-xs">{prod.codigo_interno}</div>
                          </li>
                        ))}
                        {productos.filter(p => p.nombre.toLowerCase().includes(productSearch.toLowerCase()) || p.codigo_interno.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                            <li className="px-4 py-2 text-gray-500 text-sm">No se encontraron productos</li>
                        )}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    name="cantidad"
                    value={detalleTemp.cantidad}
                    onChange={handleDetalleChange}
                    className="w-full border rounded-lg px-3 py-2"
                    step="0.01"
                  />
                </div>
                {formData.tipo === 'entrada' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Costo Unit.</label>
                    <input
                      type="number"
                      name="costo_unitario"
                      value={detalleTemp.costo_unitario}
                      onChange={handleDetalleChange}
                      className="w-full border rounded-lg px-3 py-2"
                      step="0.01"
                    />
                  </div>
                )}
                <div className="md:col-span-4">
                  <button
                    type="button"
                    onClick={addDetalle}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    <Plus size={18} /> Agregar Producto
                  </button>
                </div>
              </div>

              {formData.detalles.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                        {formData.tipo === 'entrada' && (
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo</th>
                        )}
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {formData.detalles.map((det, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {det.codigo_interno} - {det.producto_nombre}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 text-right">
                            <input
                              type="number"
                              value={det.cantidad}
                              onChange={(e) => handleDetalleUpdate(idx, 'cantidad', e.target.value)}
                              className="w-24 border rounded px-2 py-1 text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              min="0.01"
                              step="0.01"
                            />
                          </td>
                          {formData.tipo === 'entrada' && (
                            <td className="px-6 py-4 text-sm text-gray-900 text-right">${det.costo_unitario}</td>
                          )}
                          <td className="px-6 py-4 text-sm text-right">
                            <button
                              type="button"
                              onClick={() => removeDetalle(idx)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <XCircle size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Guardar Movimiento
              </button>
            </div>
          </form>
        </div>
      )}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Confirmar Eliminación</h3>
            <p className="text-gray-600 mb-6">¿Está seguro de que desea eliminar este movimiento? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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

export default MovimientosInventario;
