import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  Truck, Plus, Search, FileText, Printer, X, Save, 
  Calendar, MapPin, User, Package, ArrowLeft, Edit, Trash2, Eye, Copy, RefreshCw 
} from 'lucide-react';
import { API_URL } from '../api/config';
import SearchableSelect from './SearchableSelect';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const getBase64ImageFromURL = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', 'anonymous');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/png');
      resolve(dataURL);
    };
    img.onerror = error => {
      reject(error);
    };
    img.src = url;
  });
};

const GuiasRemision = () => {
  const [view, setView] = useState('list'); // list, create, details
  const [editingId, setEditingId] = useState(null);
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    fecha_inicio: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()).substring(0, 8) + '01',
    fecha_fin: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1
  });

  // Data for form
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  
  // Form State
  const initialFormState = {
    serie: 'TTT1',
    numero: '',
    fecha_emision: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
    fecha_traslado: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
    punto_partida: 'Almacén Principal', // Default
    almacen_id: '',
    punto_llegada: '',
    cliente_id: '',
    destinatario_nombre: '',
    destinatario_doc: '',
    transportista_nombre: '',
    transportista_doc: '',
    vehiculo_placa: '',
    conductor_licencia: '',
    conductor_nombre: '',
    motivo_traslado: 'Venta',
    modalidad_traslado: '02', // 01: Público, 02: Privado
    observaciones: '',
    detalles: []
  };
  const [formData, setFormData] = useState(initialFormState);
  const [detalleTemp, setDetalleTemp] = useState({
    producto_id: '',
    descripcion: '',
    unidad_medida: 'NIU',
    cantidad: 1,
    peso: 0
  });

  useEffect(() => {
    if (view === 'list') {
      fetchGuias();
      setEditingId(null);
      setFormData(initialFormState);
    } else if (view === 'create') {
      fetchClientes();
      fetchProductos();
      fetchAlmacenes();
      if (!editingId) {
          fetchNextNumber();
      }
    }
  }, [view, filters, pagination.page]);

  const fetchGuias = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}guias_remision.php`, {
                params: {
                  ...filters,
                  page: pagination.page,
                  limit: pagination.limit
                },
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            
            if (res.data.data) {
               setGuias(res.data.data);
               setPagination(prev => ({
                 ...prev,
                 total: res.data.total,
                 pages: res.data.pages
               }));
            } else {
               setGuias(Array.isArray(res.data) ? res.data : []);
            }
    } catch (error) {
      console.error(error);
      setGuias([]);
      toast.error('Error al cargar guías');
    } finally {
      setLoading(false);
    }
  };

  const fetchClientes = async () => {
    try {
      const res = await axios.get(`${API_URL}clientes_proveedores.php?type=cliente`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setClientes(res.data);
    } catch (error) { console.error(error); }
  };

  const fetchProductos = async () => {
        try {
            const res = await axios.get(`${API_URL}productos.php`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
      setProductos(res.data);
    } catch (error) { console.error(error); }
  };

  const fetchAlmacenes = async () => {
    try {
      const res = await axios.get(`${API_URL}almacenes.php`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setAlmacenes(res.data);
    } catch (error) { console.error(error); }
  };

  const fetchNextNumber = async () => {
        try {
            const res = await axios.get(`${API_URL}guias_remision.php?action=next_number&serie=${formData.serie}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
      setFormData(prev => ({ ...prev, numero: res.data.numero }));
    } catch (error) { console.error(error); }
  };

 

  const handleClienteSelect = (cliente) => {
    if (cliente) {
      setFormData(prev => ({
        ...prev,
        cliente_id: cliente.id,
        destinatario_nombre: cliente.razon_social,
        destinatario_doc: cliente.num_doc,
        punto_llegada: cliente.direccion || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        cliente_id: '',
        destinatario_nombre: '',
        destinatario_doc: '',
        punto_llegada: ''
      }));
    }
  };

  const handleProductoAdd = () => {
    if (!detalleTemp.descripcion || detalleTemp.cantidad <= 0) {
      toast.error('Complete los datos del producto');
      return;
    }
    setFormData(prev => ({
      ...prev,
      detalles: [...prev.detalles, { ...detalleTemp }]
    }));
    setDetalleTemp({
      producto_id: '',
      descripcion: '',
      unidad_medida: 'NIU',
      cantidad: 1,
      peso: 0
    });
  };

  const handleProductoSelectSmart = (prod) => {
    if (prod) {
      setDetalleTemp(prev => ({
        ...prev,
        producto_id: prod.id,
        descripcion: prod.nombre,
        unidad_medida: prod.unidad_medida || 'NIU',
        codigo_producto: prod.codigo_interno
      }));
    } else {
      setDetalleTemp(prev => ({
        ...prev,
        producto_id: '',
        descripcion: '',
        unidad_medida: 'NIU',
        codigo_producto: ''
      }));
    }
  };

  const handleProductSearch = useCallback(async (term) => {
    try {
      const res = await axios.get(`${API_URL}productos.php`, {
        params: { search: term },
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setProductos(res.data);
    } catch (error) { console.error(error); }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.detalles.length === 0) {
      toast.error('Agregue al menos un producto');
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        await axios.post(`${API_URL}guias_remision.php?action=editar`, { ...formData, id: editingId }, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        toast.success('Guía actualizada correctamente');
      } else {
        await axios.post(`${API_URL}guias_remision.php`, formData, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        toast.success('Guía de remisión emitida');
      }
      setView('list');
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLocal = async (guia) => {
    const toastId = toast.loading("Verificando PDF oficial...");
    try {
      // 1. Get full details
      const res = await axios.get(`${API_URL}guias_remision.php?id=${guia.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const fullGuia = res.data;
      
      // If official PDF link exists, open it
      if (fullGuia.enlace_pdf) {
          window.open(fullGuia.enlace_pdf, '_blank');
          toast.dismiss(toastId);
          toast.success("Abriendo PDF Oficial de SUNAT");
          return;
      } else {
          toast.dismiss(toastId);
          await sendToSunat(fullGuia);
          return;
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al procesar PDF oficial");
    } finally {
      toast.dismiss(toastId);
    }
  };

  const handleEdit = async (guia) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}guias_remision.php?id=${guia.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = res.data;
      
      setFormData({
        serie: data.serie,
        numero: data.numero,
        fecha_emision: data.fecha_emision,
        fecha_traslado: data.fecha_traslado,
        punto_partida: data.punto_partida,
        punto_llegada: data.punto_llegada,
        cliente_id: data.cliente_id || '',
        destinatario_nombre: data.destinatario_nombre,
        destinatario_doc: data.destinatario_doc,
        transportista_nombre: data.transportista_nombre,
        transportista_doc: data.transportista_doc,
        vehiculo_placa: data.vehiculo_placa,
        conductor_licencia: data.conductor_licencia,
        conductor_nombre: data.conductor_nombre || '',
        motivo_traslado: data.motivo_traslado,
        modalidad_traslado: data.transportista_doc ? '01' : '02',
        observaciones: data.observaciones || '',
        detalles: data.detalles.map(d => ({
          producto_id: d.producto_id,
          codigo_producto: d.codigo_producto || '', 
          descripcion: d.descripcion,
          unidad_medida: d.unidad_medida,
          cantidad: d.cantidad,
          peso: d.peso
        })),
        peso_bruto_total: data.peso_bruto_total,
        numero_bultos: data.numero_bultos,
        almacen_id: data.almacen_id || ''
      });
      setEditingId(guia.id);
      setView('create');
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar detalles de la guía');
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async (guia) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}guias_remision.php?id=${guia.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = res.data;
      
      // Fetch next number for the default serie
      const nextNumRes = await axios.get(`${API_URL}guias_remision.php?action=next_number&serie=TTT1`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      setFormData({
        serie: 'TTT1',
        numero: nextNumRes.data.numero,
        fecha_emision: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        fecha_traslado: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        punto_partida: data.punto_partida,
        punto_llegada: data.punto_llegada,
        cliente_id: data.cliente_id || '',
        destinatario_nombre: data.destinatario_nombre,
        destinatario_doc: data.destinatario_doc,
        transportista_nombre: data.transportista_nombre,
        transportista_doc: data.transportista_doc,
        vehiculo_placa: data.vehiculo_placa,
        conductor_licencia: data.conductor_licencia,
        motivo_traslado: data.motivo_traslado,
        modalidad_traslado: data.transportista_doc ? '01' : '02',
        observaciones: data.observaciones || '',
        detalles: data.detalles.map(d => ({
          producto_id: d.producto_id,
          codigo_producto: d.codigo_producto || '', 
          descripcion: d.descripcion,
          unidad_medida: d.unidad_medida,
          cantidad: d.cantidad,
          peso: d.peso
        })),
        peso_bruto_total: data.peso_bruto_total,
        numero_bultos: data.numero_bultos,
        almacen_id: data.almacen_id || ''
      });
      setEditingId(null); // Ensure we are creating new
      setView('create');
      toast.success('Guía clonada. Verifique los datos antes de guardar.');
    } catch (error) {
      console.error(error);
      toast.error('Error al clonar la guía');
    } finally {
      setLoading(false);
    }
  };

  const anularGuia = async (id) => {
    if (!window.confirm('¿Está seguro de anular esta guía?')) return;
    try {
      await axios.put(`${API_URL}guias_remision.php?id=${id}`, { action: 'anular' }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Guía anulada');
      fetchGuias();
    } catch (error) {
      toast.error('Error al anular');
    }
  };

  const deleteGuia = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar permanentemente esta guía?')) return;
    try {
      await axios.delete(`${API_URL}guias_remision.php?id=${id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Guía eliminada');
      fetchGuias();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error || 'Error al eliminar');
    }
  };

  const consultarStatus = async (guia) => {
    const toastId = toast.loading('Consultando estado en SUNAT...');
    try {
      await axios.post(`${API_URL}guias_remision.php?action=consultar_status`, { id: guia.id }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      toast.dismiss(toastId);
      toast.success('Estado actualizado correctamente');
      fetchGuias();
    } catch (error) {
      toast.dismiss(toastId);
      console.error(error);
      const msg = error.response?.data?.error || 'Error al consultar estado';
      toast.error(typeof msg === 'object' ? JSON.stringify(msg) : msg);
    }
  };

  const sendToSunat = async (guia) => {
    if (guia.estado === 'Aceptada') {
       toast.error('La guía ya fue aceptada por SUNAT');
       return;
    }
    if (!window.confirm(`¿Enviar Guía ${guia.serie}-${guia.numero} a SUNAT?`)) return;

    const toastId = toast.loading('Enviando a SUNAT...');
        try {
            await axios.post(`${API_URL}guias_remision.php?action=send_sunat`, { id: guia.id }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      toast.dismiss(toastId);
      toast.success('Guía aceptada por SUNAT');
      fetchGuias();
    } catch (error) {
      toast.dismiss(toastId);
      const msg = error.response?.data?.error || 'Error al enviar a SUNAT';
      toast.error(typeof msg === 'object' ? JSON.stringify(msg) : msg);
    }
  };

  // Render Helpers
  const renderList = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Truck size={24} className="text-blue-600" />
          Guías de Remisión
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData(initialFormState);
              setView('create');
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
          >
            <Plus size={20} /> Nueva Guía
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm flex gap-4">
        <input 
          type="date" 
          value={filters.fecha_inicio}
          onChange={e => setFilters({...filters, fecha_inicio: e.target.value})}
          className="border p-2 rounded"
        />
        <input 
          type="date" 
          value={filters.fecha_fin}
          onChange={e => setFilters({...filters, fecha_fin: e.target.value})}
          className="border p-2 rounded"
        />
        <button onClick={fetchGuias} className="bg-gray-100 p-2 rounded hover:bg-gray-200">
          <Search size={20} />
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emisión</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destinatario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Traslado</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.isArray(guias) && guias.map(guia => (
              <tr key={guia.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{guia.fecha_emision}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{guia.serie}-{guia.numero}</td>
                <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] break-words">{guia.destinatario_nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{guia.fecha_traslado}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${guia.estado === 'Emitida' ? 'bg-green-100 text-green-800' : 
                      guia.estado === 'Anulada' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                    {guia.estado}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {guia.estado === 'Emitida' && (
                      <>
                        <button onClick={() => sendToSunat(guia)} className="text-blue-600 hover:text-blue-900" title="Enviar a SUNAT">
                          <FileText size={18} />
                        </button>
                        <button onClick={() => handleEdit(guia)} className="text-yellow-600 hover:text-yellow-900" title="Editar">
                          <Edit size={18} />
                        </button>
                      </>
                    )}
                    {(guia.estado === 'Enviada' || guia.estado === 'Aceptada') && (
                      <button onClick={() => consultarStatus(guia)} className="text-indigo-600 hover:text-indigo-900" title="Consultar Estado SUNAT (Actualizar PDF)">
                        <RefreshCw size={18} />
                      </button>
                    )}
                    
                    {guia.enlace_pdf ? (
                      <a href={guia.enlace_pdf} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-900" title="Ver PDF Oficial">
                        <Eye size={18} />
                      </a>
                    ) : (
                      <button onClick={() => handlePrintLocal(guia)} className="text-blue-600 hover:text-blue-800" title="Enviar a SUNAT y ver PDF">
                        <Eye size={18} />
                      </button>
                    )}
                    
                    {guia.enlace_pdf ? (
                       <a href={guia.enlace_pdf} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-900" title="Imprimir PDF Oficial">
                          <Printer size={18} />
                       </a>
                    ) : (
                       <button onClick={() => handlePrintLocal(guia)} className="text-gray-500 hover:text-gray-800" title="Enviar a SUNAT y obtener PDF">
                          <Printer size={18} />
                       </button>
                    )}

                    <button onClick={() => handleClone(guia)} className="text-purple-600 hover:text-purple-900" title="Clonar Guía">
                      <Copy size={18} />
                    </button>

                    {(guia.estado === 'Emitida' || guia.estado === 'Aceptada') && (
                      <button onClick={() => anularGuia(guia.id)} className="text-orange-600 hover:text-orange-900" title="Anular">
                        <X size={18} />
                      </button>
                    )}
                    
                    {(guia.estado === 'Emitida' || guia.estado === 'Aceptada' || guia.estado === 'Anulada') && (
                      <button onClick={() => deleteGuia(guia.id)} className="text-red-600 hover:text-red-900" title="Eliminar">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(!Array.isArray(guias) || guias.length === 0) && (
              <tr><td colSpan="6" className="text-center py-8 text-gray-500">No hay guías registradas</td></tr>
            )}
          </tbody>
        </table>
        
        {/* Pagination Controls */}
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button 
              onClick={() => setPagination(prev => ({...prev, page: Math.max(prev.page - 1, 1)}))}
              disabled={pagination.page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <button 
              onClick={() => setPagination(prev => ({...prev, page: Math.min(prev.page + 1, pagination.pages)}))}
              disabled={pagination.page >= pagination.pages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Mostrando página <span className="font-medium">{pagination.page}</span> de <span className="font-medium">{pagination.pages}</span> ({pagination.total} resultados)
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setPagination(prev => ({...prev, page: Math.max(prev.page - 1, 1)}))}
                  disabled={pagination.page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Anterior</span>
                  Anterior
                </button>
                {/* Simple page numbers */}
                {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
                   // Logic to show window of pages around current
                   let p = i + 1;
                   if (pagination.pages > 5) {
                      if (pagination.page > 3) p = pagination.page - 2 + i;
                      if (p > pagination.pages) p = pagination.pages - (4 - i);
                   }
                   
                   return (
                    <button
                      key={p}
                      onClick={() => setPagination(prev => ({...prev, page: p}))}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        pagination.page === p
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                   );
                })}
                <button
                  onClick={() => setPagination(prev => ({...prev, page: Math.min(prev.page + 1, pagination.pages)}))}
                  disabled={pagination.page >= pagination.pages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Siguiente</span>
                  Siguiente
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCreate = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setView('list')} className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold text-gray-800">{editingId ? 'Editar Guía de Remisión' : 'Nueva Guía de Remisión'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Datos Generales */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600">
            <FileText size={20} /> Datos del Documento
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Serie</label>
              <input type="text" value={formData.serie} readOnly className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Número</label>
              <input type="text" value={formData.numero} readOnly className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha Emisión</label>
              <input type="date" value={formData.fecha_emision} onChange={e => setFormData({...formData, fecha_emision: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha Traslado</label>
              <input type="date" value={formData.fecha_traslado} onChange={e => setFormData({...formData, fecha_traslado: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
          </div>
        </div>

        {/* Datos de Traslado */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600">
            <MapPin size={20} /> Datos de Traslado
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Almacén de Origen</label>
              <select 
                value={formData.almacen_id} 
                onChange={e => {
                  const almId = e.target.value;
                  const alm = almacenes.find(a => a.id == almId);
                  setFormData(prev => ({
                    ...prev, 
                    almacen_id: almId,
                    punto_partida: alm ? (alm.direccion || alm.nombre) : prev.punto_partida
                  }));
                }} 
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 mb-2"
              >
                <option value="">-- Seleccionar Almacén (Opcional) --</option>
                {almacenes.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
              <label className="block text-sm font-medium text-gray-700">Dirección de Partida</label>
              <input type="text" value={formData.punto_partida} onChange={e => setFormData({...formData, punto_partida: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Punto de Llegada</label>
              <input type="text" value={formData.punto_llegada} onChange={e => setFormData({...formData, punto_llegada: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div>
              <label className="block text-sm font-medium text-gray-700">Motivo Traslado</label>
              <select value={formData.motivo_traslado} onChange={e => setFormData({...formData, motivo_traslado: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                <option value="Venta">Venta</option>
                <option value="Compra">Compra</option>
                <option value="Traslado entre establecimientos">Traslado entre establecimientos</option>
                <option value="Devolución">Devolución</option>
                <option value="Otros">Otros</option>
              </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Peso Bruto Total (KG)</label>
                <input type="number" step="0.01" value={formData.peso_bruto_total} onChange={e => setFormData({...formData, peso_bruto_total: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700">Número de Bultos</label>
                <input type="number" value={formData.numero_bultos} onChange={e => setFormData({...formData, numero_bultos: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
          </div>
        </div>

        {/* Destinatario y Transporte */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600">
              <User size={20} /> Destinatario
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Cliente (Opcional)</label>
                <div className="mt-1">
                  <SearchableSelect 
                    options={clientes}
                    value={formData.cliente_id}
                    onChange={handleClienteSelect}
                    placeholder="Buscar cliente..."
                    labelKey="razon_social"
                    valueKey="id"
                    secondaryKey="num_doc"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Razón Social / Nombre</label>
                <input type="text" value={formData.destinatario_nombre} onChange={e => setFormData({...formData, destinatario_nombre: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">RUC / DNI</label>
                <input type="text" value={formData.destinatario_doc} onChange={e => setFormData({...formData, destinatario_doc: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600">
              <Truck size={20} /> Transporte
            </h3>
             <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Modalidad de Traslado</label>
                <select 
                  value={formData.modalidad_traslado} 
                  onChange={e => {
                    const modalidad = e.target.value;
                    setFormData(prev => ({
                      ...prev, 
                      modalidad_traslado: modalidad,
                      // Clear fields not relevant to the selected mode
                      transportista_nombre: modalidad === '02' ? '' : prev.transportista_nombre,
                      transportista_doc: modalidad === '02' ? '' : prev.transportista_doc,
                      vehiculo_placa: modalidad === '01' ? '' : prev.vehiculo_placa, // Optional clearing
                      conductor_licencia: modalidad === '01' ? '' : prev.conductor_licencia // Optional clearing
                    }));
                  }} 
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                >
                  <option value="02">Transporte Privado (Vehículo Propio)</option>
                  <option value="01">Transporte Público (Tercero)</option>
                </select>
              </div>

              {formData.modalidad_traslado === '01' && (
                <>
                  <div className="p-3 bg-blue-50 text-blue-800 rounded-md text-sm mb-2">
                    Para Transporte Público, es obligatorio ingresar los datos de la empresa de transporte (RUC y Razón Social).
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">RUC Transportista <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      value={formData.transportista_doc} 
                      onChange={e => setFormData({...formData, transportista_doc: e.target.value})} 
                      placeholder="RUC de 11 dígitos"
                      maxLength={11}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Transportista Nombre <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.transportista_nombre} onChange={e => setFormData({...formData, transportista_nombre: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                  </div>
                </>
              )}

              {formData.modalidad_traslado === '02' && (
                <>
                  <div className="p-3 bg-blue-50 text-blue-800 rounded-md text-sm mb-2">
                     Para Transporte Privado, es obligatorio ingresar la Placa del Vehículo y Licencia del Conductor.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Placa Vehículo <span className="text-red-500">*</span></label>
                        <input type="text" value={formData.vehiculo_placa} onChange={e => setFormData({...formData, vehiculo_placa: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Licencia Conductor <span className="text-red-500">*</span></label>
                        <input type="text" value={formData.conductor_licencia} onChange={e => setFormData({...formData, conductor_licencia: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Nombre Conductor <span className="text-red-500">*</span></label>
                        <input type="text" value={formData.conductor_nombre} onChange={e => setFormData({...formData, conductor_nombre: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Detalles */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600">
            <Package size={20} /> Items
          </h3>
          
          <div className="flex flex-wrap gap-4 items-end mb-4 border-b pb-4">
             <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700">Producto</label>
                <div className="mt-1">
                  <SearchableSelect 
                    options={productos}
                    value={detalleTemp.producto_id}
                    onChange={handleProductoSelectSmart}
                    onSearch={handleProductSearch}
                    placeholder="Buscar producto..."
                    labelKey="nombre"
                    valueKey="id"
                    secondaryKey="codigo_interno"
                  />
                </div>
            </div>
            <div className="flex-[2] min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <input type="text" value={detalleTemp.descripcion} onChange={e => setDetalleTemp({...detalleTemp, descripcion: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
            <div className="w-24">
                <label className="block text-sm font-medium text-gray-700">U.M.</label>
                <input type="text" value={detalleTemp.unidad_medida} onChange={e => setDetalleTemp({...detalleTemp, unidad_medida: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
             <div className="w-24">
                <label className="block text-sm font-medium text-gray-700">Cant.</label>
                <input type="number" value={detalleTemp.cantidad} onChange={e => setDetalleTemp({...detalleTemp, cantidad: parseFloat(e.target.value)})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
            </div>
            <button type="button" onClick={handleProductoAdd} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 mb-[2px]">
              <Plus size={20} />
            </button>
          </div>

          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">U.M.</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {formData.detalles.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.descripcion}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unidad_medida}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold">{item.cantidad}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      type="button" 
                      onClick={() => {
                        setDetalleTemp({
                          producto_id: item.producto_id,
                          descripcion: item.descripcion,
                          unidad_medida: item.unidad_medida,
                          cantidad: item.cantidad,
                          peso: item.peso || 0,
                          codigo_producto: item.codigo_producto || ''
                        });
                        setFormData(prev => ({...prev, detalles: prev.detalles.filter((_, i) => i !== idx)}));
                      }} 
                      className="text-yellow-600 hover:text-yellow-900 mr-3"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button type="button" onClick={() => setFormData(prev => ({...prev, detalles: prev.detalles.filter((_, i) => i !== idx)}))} className="text-red-600 hover:text-red-900" title="Eliminar">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => setView('list')} className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300" disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className={`bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-lg ${loading ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={loading}>
            <Save size={20} /> {loading ? 'Guardando...' : 'Guardar Guía'}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {view === 'list' ? renderList() : renderCreate()}
    </div>
  );
};

export default GuiasRemision;
