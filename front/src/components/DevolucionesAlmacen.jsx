import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  RotateCcw, Plus, Search, CheckCircle, XCircle, 
  Package, FileText, AlertTriangle 
} from 'lucide-react';
import { API_URL } from '../api/config';

const DevolucionesAlmacen = () => {
  const [loading, setLoading] = useState(false);
  const [devoluciones, setDevoluciones] = useState([]);
  const [filterTipo, setFilterTipo] = useState(''); // '' = todos, 'venta', 'compra'
  const [showModal, setShowModal] = useState(false);

  // Datos maestros
  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);
  
  // Formulario
  const [formData, setFormData] = useState({
    tipo_origen: 'venta',
    almacen_id: '',
    referencia_id: '', // ID interno si existe
    documento_referencia: '', // Texto libre: "Factura F001-123"
    cliente_nombre: '',
    cliente_doc: '',
    motivo: '',
    descripcion: '',
    items: []
  });

  const [searchVentaTerm, setSearchVentaTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingVenta, setSearchingVenta] = useState(false);

  // Item en edición
  const [currentItem, setCurrentItem] = useState({
    producto_id: '',
    descripcion: '', // Nombre producto
    cantidad: 1,
    precio_unitario: 0,
    estado_producto: 'aprobado' // aprobado, observado, merma
  });

  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  };

  useEffect(() => {
    fetchDevoluciones();
    fetchMaestros();
  }, [filterTipo]);

  const fetchDevoluciones = async () => {
    setLoading(true);
    try {
      const url = filterTipo 
        ? `${API_URL}devoluciones.php?action=listar&tipo=${filterTipo}`
        : `${API_URL}devoluciones.php?action=listar`;
      
      const res = await axios.get(url, { headers });
      setDevoluciones(res.data);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar devoluciones');
    } finally {
      setLoading(false);
    }
  };

  const fetchMaestros = async () => {
    try {
      const [resAlm, resProd] = await Promise.all([
        axios.get(`${API_URL}almacenes.php`, { headers }),
        axios.get(`${API_URL}productos.php`, { headers })
      ]);
      setAlmacenes(resAlm.data);
      setProductos(resProd.data);
      
      // Pre-seleccionar primer almacén
      if (resAlm.data.length > 0) {
        setFormData(prev => ({ ...prev, almacen_id: resAlm.data[0].id }));
      }
    } catch (error) {
      console.error("Error cargando maestros", error);
    }
  };

  const searchVentas = async (term) => {
    if (term.length < 2) {
        setSearchResults([]);
        return;
    }
    setSearchingVenta(true);
    try {
        const res = await axios.get(`${API_URL}devoluciones.php?action=buscar_ventas&q=${term}`, { headers });
        setSearchResults(res.data);
    } catch (error) {
        console.error("Error buscando ventas", error);
    } finally {
        setSearchingVenta(false);
    }
  };

  const handleSelectVenta = async (venta) => {
    setSearchVentaTerm(`${venta.serie}-${venta.correlativo}`);
    setSearchResults([]);
    
    // Auto-fill form
    setFormData(prev => ({
        ...prev,
        tipo_origen: 'venta',
        cliente_nombre: venta.cliente_razon_social || '',
        cliente_doc: venta.cliente_num_doc || '',
        referencia_id: venta.id,
        documento_referencia: `${venta.serie}-${venta.correlativo}`,
        descripcion: `Devolución de venta ${venta.serie}-${venta.correlativo}`
    }));

    // Fetch details
    try {
        const res = await axios.get(`${API_URL}devoluciones.php?action=obtener_detalle_venta&id=${venta.id}`, { headers });
        const items = res.data.map(item => ({
            producto_id: item.producto_id,
            descripcion: item.descripcion,
            cantidad: parseFloat(item.cantidad),
            precio_unitario: parseFloat(item.precio_unitario),
            estado_producto: 'aprobado' // Default
        }));

        setFormData(prev => ({
            ...prev,
            items: items
        }));
        toast.success("Datos de venta cargados");
    } catch (error) {
        console.error(error);
        toast.error("Error al cargar detalles de la venta");
    }
  };

  const handleAddItem = () => {
    if (!currentItem.producto_id || currentItem.cantidad <= 0) {
      toast.error('Seleccione un producto y cantidad válida');
      return;
    }
    
    // Buscar nombre producto si no está set
    const prod = productos.find(p => p.id == currentItem.producto_id);
    const itemToAdd = {
      ...currentItem,
      descripcion: prod ? prod.nombre : 'Desconocido'
    };

    setFormData({
      ...formData,
      items: [...formData.items, itemToAdd]
    });

    // Reset current item
    setCurrentItem({
      producto_id: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      estado_producto: 'aprobado'
    });
  };

  const handleRemoveItem = (index) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      toast.error('Debe agregar al menos un ítem');
      return;
    }
    if (!formData.almacen_id) {
      toast.error('Seleccione un almacén');
      return;
    }

    try {
      await axios.post(`${API_URL}devoluciones.php?action=crear`, formData, { headers });
      toast.success('Devolución registrada');
      setShowModal(false);
      fetchDevoluciones();
      // Reset form
      setFormData({
        tipo_origen: 'venta',
        almacen_id: almacenes[0]?.id || '',
        referencia_id: '',
        cliente_nombre: '',
        cliente_doc: '',
        motivo: '',
        descripcion: '',
        items: []
      });
    } catch (error) {
      console.error(error);
      toast.error('Error al guardar devolución');
    }
  };

  const handleAprobar = async (id) => {
    if (!window.confirm('¿Aprobar devolución y actualizar stock?')) return;
    
    try {
      await axios.post(`${API_URL}devoluciones.php?action=aprobar`, { id }, { headers });
      toast.success('Devolución aprobada');
      fetchDevoluciones();
    } catch (error) {
      toast.error('Error al aprobar');
    }
  };

  const handleRechazar = async (id) => {
    if (!window.confirm('¿Rechazar devolución?')) return;
    
    try {
      await axios.post(`${API_URL}devoluciones.php?action=rechazar`, { id }, { headers });
      toast.success('Devolución rechazada');
      fetchDevoluciones();
    } catch (error) {
      toast.error('Error al rechazar');
    }
  };

  const getEstadoBadge = (estado) => {
    const classes = {
      pendiente: 'bg-yellow-100 text-yellow-800',
      aprobado: 'bg-green-100 text-green-800',
      rechazado: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${classes[estado] || 'bg-gray-100'}`}>
        {estado.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <RotateCcw className="w-8 h-8 text-blue-600" />
            Devoluciones de Almacén
          </h1>
          <p className="text-gray-600">Gestión de devoluciones de Ventas y Compras</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Nueva Devolución
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex gap-2">
        <button 
          onClick={() => setFilterTipo('')}
          className={`px-4 py-2 rounded-lg ${filterTipo === '' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border'}`}
        >
          Todas
        </button>
        <button 
          onClick={() => setFilterTipo('venta')}
          className={`px-4 py-2 rounded-lg ${filterTipo === 'venta' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
        >
          De Ventas
        </button>
        <button 
          onClick={() => setFilterTipo('compra')}
          className={`px-4 py-2 rounded-lg ${filterTipo === 'compra' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border'}`}
        >
          De Compras
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente/Prov</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {devoluciones.map((dev) => (
              <tr key={dev.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">#{dev.id}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${dev.tipo_origen === 'venta' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {dev.tipo_origen.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{dev.fecha_solicitud}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="font-medium">{dev.cliente_nombre || 'N/A'}</div>
                  <div className="text-gray-500 text-xs">{dev.cliente_doc}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{dev.motivo}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <ul className="list-disc pl-4">
                    {dev.items?.map((item, i) => (
                      <li key={i}>
                        {item.cantidad} x {item.producto_nombre || item.descripcion} 
                        <span className="text-xs ml-2 px-1 rounded bg-gray-200 text-gray-700">
                          {item.estado_producto}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getEstadoBadge(dev.estado)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {dev.estado === 'pendiente' && (
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleAprobar(dev.id)}
                        className="text-green-600 hover:text-green-900" 
                        title="Aprobar"
                      >
                        <CheckCircle size={18} />
                      </button>
                      <button 
                        onClick={() => handleRechazar(dev.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Rechazar"
                      >
                        <XCircle size={18} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {devoluciones.length === 0 && (
              <tr>
                <td colSpan="8" className="px-6 py-10 text-center text-gray-500">
                  No se encontraron devoluciones
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nueva Devolución */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Registrar Devolución</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Buscador de Comprobante */}
              <div className="mb-4 relative bg-blue-50 p-4 rounded-lg border border-blue-100">
                <label className="block text-sm font-medium text-blue-800 mb-1">Buscar Comprobante para Importar (Opcional)</label>
                <div className="flex">
                  <div className="relative w-full">
                    <input 
                        type="text"
                        className="w-full border rounded-lg p-2 pl-8 focus:ring-2 focus:ring-blue-500"
                        value={searchVentaTerm}
                        onChange={(e) => {
                            setSearchVentaTerm(e.target.value);
                            searchVentas(e.target.value);
                        }}
                        placeholder="Ingrese Serie-Correlativo, Cliente o RUC/DNI..."
                    />
                    <Search className="absolute left-2.5 top-2.5 text-gray-400" size={18} />
                  </div>
                </div>
                {/* Resultados Busqueda */}
                {searchResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                        {searchResults.map(venta => (
                            <div 
                                key={venta.id}
                                className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                                onClick={() => handleSelectVenta(venta)}
                            >
                                <div className="font-medium text-gray-800">
                                    {venta.tipo_comprobante === '01' ? 'Factura' : 'Boleta'} {venta.serie}-{venta.correlativo}
                                </div>
                                <div className="text-sm text-gray-600">
                                    {venta.cliente_razon_social} ({venta.cliente_num_doc})
                                </div>
                                <div className="text-xs text-gray-500 flex justify-between mt-1">
                                    <span>{venta.fecha_emision}</span>
                                    <span className="font-semibold">S/ {venta.total_importe}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Origen</label>
                  <select 
                    value={formData.tipo_origen}
                    onChange={(e) => setFormData({...formData, tipo_origen: e.target.value})}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="venta">De Venta (Cliente devuelve)</option>
                    <option value="compra">De Compra (Devolver a Prov.)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Almacén Afectado</label>
                  <select 
                    value={formData.almacen_id}
                    onChange={(e) => setFormData({...formData, almacen_id: e.target.value})}
                    className="w-full border rounded-lg p-2"
                    required
                  >
                    <option value="">Seleccione Almacén</option>
                    {almacenes.map(alm => (
                      <option key={alm.id} value={alm.id}>{alm.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Motivo</label>
                  <input 
                    type="text"
                    value={formData.motivo}
                    onChange={(e) => setFormData({...formData, motivo: e.target.value})}
                    className="w-full border rounded-lg p-2"
                    placeholder="Ej. Producto defectuoso"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nombre Cliente/Proveedor</label>
                  <input 
                    type="text"
                    value={formData.cliente_nombre}
                    onChange={(e) => setFormData({...formData, cliente_nombre: e.target.value})}
                    className="w-full border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Documento (RUC/DNI)</label>
                  <input 
                    type="text"
                    value={formData.cliente_doc}
                    onChange={(e) => setFormData({...formData, cliente_doc: e.target.value})}
                    className="w-full border rounded-lg p-2"
                  />
                </div>
              </div>

              {/* Sección Items */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Package size={20} />
                  Productos
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Producto</label>
                    <select 
                      value={currentItem.producto_id}
                      onChange={(e) => {
                        const prod = productos.find(p => p.id == e.target.value);
                        setCurrentItem({
                          ...currentItem, 
                          producto_id: e.target.value,
                          precio_unitario: prod ? prod.precio_venta : 0 // Default price
                        });
                      }}
                      className="w-full border rounded p-2 text-sm"
                    >
                      <option value="">Buscar producto...</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre} - Stock: {p.stock}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad</label>
                    <input 
                      type="number"
                      min="1"
                      value={currentItem.cantidad}
                      onChange={(e) => setCurrentItem({...currentItem, cantidad: parseFloat(e.target.value)})}
                      className="w-full border rounded p-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                    <select 
                      value={currentItem.estado_producto}
                      onChange={(e) => setCurrentItem({...currentItem, estado_producto: e.target.value})}
                      className="w-full border rounded p-2 text-sm"
                    >
                      <option value="aprobado">Apto (Buen Estado)</option>
                      <option value="observado">Observado</option>
                      <option value="merma">Merma (Dañado)</option>
                    </select>
                  </div>

                  <button 
                    type="button"
                    onClick={handleAddItem}
                    className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex justify-center items-center"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                {/* Lista Items Agregados */}
                {formData.items.length > 0 && (
                  <div className="bg-white rounded border overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Producto</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cant</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Estado</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {formData.items.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm">{item.descripcion}</td>
                            <td className="px-4 py-2 text-sm">{item.cantidad}</td>
                            <td className="px-4 py-2 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                item.estado_producto === 'merma' ? 'bg-red-100 text-red-800' : 
                                item.estado_producto === 'observado' ? 'bg-orange-100 text-orange-800' : 
                                'bg-green-100 text-green-800'
                              }`}>
                                {item.estado_producto}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <button 
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <XCircle size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Registrar Devolución
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevolucionesAlmacen;
