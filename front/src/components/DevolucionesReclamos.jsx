import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  RotateCcw, MessageSquare, Plus, Search, CheckCircle, XCircle, 
  AlertTriangle, FileText, ChevronDown, ChevronUp, User, Edit, Trash 
} from 'lucide-react';
import { API_URL } from '../api/config';

const DevolucionesReclamos = () => {
  const [activeTab, setActiveTab] = useState('devoluciones');
  const [loading, setLoading] = useState(false);

  const [editingDevolucion, setEditingDevolucion] = useState(null);
  const [editingReclamo, setEditingReclamo] = useState(null);
  
  // Data States
  const [devoluciones, setDevoluciones] = useState([]);
  const [reclamos, setReclamos] = useState([]);
  
  // Modals
  const [showDevModal, setShowDevModal] = useState(false);
  const [showReclamoModal, setShowReclamoModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  
  // Forms
  const [selectedVenta, setSelectedVenta] = useState(null);
  const [searchVentaTerm, setSearchVentaTerm] = useState('');
  const [foundVentas, setFoundVentas] = useState([]);
  const [devItems, setDevItems] = useState([]); // Items to return
  const [devMotivo, setDevMotivo] = useState('Defectuoso');
  const [devDesc, setDevDesc] = useState('');
  
  const [reclamoForm, setReclamoForm] = useState({
    cliente_nombre: '',
    cliente_contacto: '',
    asunto: '',
    descripcion: '',
    prioridad: 'media',
    tipo_origen: 'venta'
  });
  
  const [resolveForm, setResolveForm] = useState({
    id: null,
    estado: '',
    resolucion: ''
  });

  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  };

  const [saleItemsEnabled, setSaleItemsEnabled] = useState(() => {
    const v = localStorage.getItem('dev_sale_items_enabled');
    return v === null ? true : v === 'true';
  });

  useEffect(() => {
    if (activeTab === 'devoluciones') fetchDevoluciones();
    else fetchReclamos();
  }, [activeTab]);

  // --- Devoluciones Logic ---

  const fetchDevoluciones = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}devoluciones.php?action=listar`, { headers });
      setDevoluciones(res.data);
    } catch (error) {
      toast.error('Error al cargar devoluciones');
    } finally {
      setLoading(false);
    }
  };

  const searchVentas = async (term) => {
    if (term.length < 2) return;
    try {
      const res = await axios.get(`${API_URL}devoluciones.php?action=buscar_ventas&q=${term}`, { headers });
      setFoundVentas(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectVenta = async (venta) => {
    setSelectedVenta(venta);
    setFoundVentas([]);
    setSearchVentaTerm(`${venta.serie}-${venta.correlativo} - ${venta.cliente_razon_social}`);
    
    if (!saleItemsEnabled) {
      setDevItems([{
        producto_id: null,
        descripcion: '',
        cantidad: 1,
        max_quantity: 1,
        precio_unitario: 0,
        selected: true
      }]);
      return;
    }

    try {
      const res = await axios.get(`${API_URL}devoluciones.php?action=obtener_detalle_venta&id=${venta.id}`, { headers });
      const items = res.data.map(item => ({
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: parseFloat(item.cantidad),
        max_quantity: parseFloat(item.cantidad),
        precio_unitario: parseFloat(item.precio_unitario),
        selected: false
      }));
      setDevItems(items);
    } catch (error) {
      toast.error("No se pudieron cargar los productos de la venta. Ingrese manualmente.");
      setSaleItemsEnabled(false);
      localStorage.setItem('dev_sale_items_enabled', 'false');
      setDevItems([{
        producto_id: null,
        descripcion: '',
        cantidad: 1,
        max_quantity: 1,
        precio_unitario: 0,
        selected: true
      }]);
    }
  };

  const handleCreateDevolucion = async () => {
    if (!selectedVenta && !editingDevolucion) return toast.error('Seleccione una venta');
    
    const itemsToReturn = devItems.filter(i => i.selected && i.cantidad > 0);

    if (itemsToReturn.length === 0) {
      return toast.error('Seleccione al menos un producto para devolver');
    }

    const payload = {
      comprobante_id: selectedVenta ? selectedVenta.id : (editingDevolucion ? editingDevolucion.referencia_id : null),
      cliente_nombre: selectedVenta ? selectedVenta.cliente_razon_social : (editingDevolucion ? editingDevolucion.cliente_nombre : ''),
      cliente_doc: selectedVenta ? (selectedVenta.cliente_num_doc || '') : (editingDevolucion ? editingDevolucion.cliente_doc : ''), 
      motivo: devMotivo,
      descripcion: devDesc,
      items: itemsToReturn.map(i => ({
        producto_id: i.producto_id,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        estado_producto: i.estado_producto || 'aprobado'
      }))
    };

    try {
      if (editingDevolucion) {
        await axios.put(`${API_URL}/devoluciones.php?action=editar`, { ...payload, id: editingDevolucion.id }, { headers });
        toast.success('Devolución actualizada');
      } else {
        await axios.post(`${API_URL}/devoluciones.php?action=crear`, payload, { headers });
        toast.success('Devolución registrada');
      }
      setShowDevModal(false);
      fetchDevoluciones();
      // Reset states
      setSelectedVenta(null);
      setEditingDevolucion(null);
      setSearchVentaTerm('');
      setDevItems([]);
      setDevDesc('');
    } catch (error) {
      toast.error('Error al registrar/actualizar');
    }
  };

  const handleEditDevolucion = (dev) => {
    setEditingDevolucion(dev);
    setDevMotivo(dev.motivo);
    setDevDesc(dev.descripcion || '');
    
    // Mock selected venta for display purposes
    setSelectedVenta({
        id: dev.referencia_id,
        serie: 'REF', 
        correlativo: dev.referencia_id, 
        cliente_razon_social: dev.cliente_nombre,
        cliente_num_doc: dev.cliente_doc
    });

    const items = dev.items.map(item => ({
        producto_id: item.producto_id,
        descripcion: item.descripcion || item.producto_nombre,
        cantidad: parseFloat(item.cantidad),
        max_quantity: 999999, // Allow editing without restriction based on original sale for now
        precio_unitario: parseFloat(item.precio_unitario),
        selected: true,
        estado_producto: item.estado_producto
    }));
    setDevItems(items);
    setShowDevModal(true);
  };

  const handleDeleteDevolucion = async (id) => {
      if(!confirm("¿Estás seguro de eliminar esta devolución?")) return;
      try {
          await axios.delete(`${API_URL}/devoluciones.php?action=eliminar&id=${id}`, { headers });
          toast.success("Devolución eliminada");
          fetchDevoluciones();
      } catch (error) {
          toast.error("Error al eliminar");
      }
  };

  const handleApproveDev = async (id, revertir) => {
    if(!confirm("¿Aprobar devolución y generar Nota de Crédito?")) return;
    try {
      await axios.put(`${API_URL}devoluciones.php?action=aprobar`, { id, revertir_stock: revertir }, { headers });
      toast.success('Aprobado con éxito');
      fetchDevoluciones();
    } catch (error) {
      toast.error('Error al aprobar');
    }
  };
  
  const handleRejectDev = async (id) => {
    if(!confirm("¿Rechazar devolución?")) return;
    try {
      await axios.put(`${API_URL}/devoluciones.php?action=rechazar`, { id }, { headers });
      toast.success('Rechazado');
      fetchDevoluciones();
    } catch (error) {
      toast.error('Error al rechazar');
    }
  };

  // --- Reclamos Logic ---

  const fetchReclamos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}reclamos.php?action=listar`, { headers });
      setReclamos(res.data);
    } catch (error) {
      toast.error('Error al cargar reclamos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReclamo = async () => {
    try {
      if (editingReclamo) {
          await axios.put(`${API_URL}/reclamos.php?action=editar`, { ...reclamoForm, id: editingReclamo }, { headers });
          toast.success('Reclamo actualizado');
      } else {
          await axios.post(`${API_URL}/reclamos.php?action=crear`, reclamoForm, { headers });
          toast.success('Reclamo registrado');
      }
      setShowReclamoModal(false);
      setEditingReclamo(null);
      fetchReclamos();
    } catch (error) {
      toast.error('Error al registrar/actualizar reclamo');
    }
  };

  const handleEditReclamo = (rec) => {
      setReclamoForm({
          cliente_nombre: rec.cliente_nombre,
          cliente_contacto: rec.cliente_contacto,
          asunto: rec.asunto,
          descripcion: rec.descripcion,
          prioridad: rec.prioridad,
          tipo_origen: rec.tipo_origen || 'venta'
      });
      setEditingReclamo(rec.id);
      setShowReclamoModal(true);
  };

  const handleDeleteReclamo = async (id) => {
      if(!confirm("¿Eliminar este reclamo?")) return;
      try {
          await axios.delete(`${API_URL}/reclamos.php?action=eliminar&id=${id}`, { headers });
          toast.success("Reclamo eliminado");
          fetchReclamos();
      } catch (error) {
          toast.error("Error al eliminar");
      }
  };

  const handleUpdateReclamo = async () => {
    try {
      await axios.put(`${API_URL}/reclamos.php?action=actualizar`, resolveForm, { headers });
      toast.success('Reclamo actualizado');
      setShowResolveModal(false);
      fetchReclamos();
    } catch (error) {
      toast.error('Error al actualizar');
    }
  };

  // --- Renders ---

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Devoluciones y Reclamos</h1>
        <div className="flex space-x-2">
          <button 
            onClick={() => setActiveTab('devoluciones')}
            className={`px-4 py-2 rounded-lg flex items-center ${activeTab === 'devoluciones' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
          >
            <RotateCcw size={18} className="mr-2" /> Devoluciones
          </button>
          <button 
            onClick={() => setActiveTab('reclamos')}
            className={`px-4 py-2 rounded-lg flex items-center ${activeTab === 'reclamos' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
          >
            <MessageSquare size={18} className="mr-2" /> Reclamos
          </button>
        </div>
      </div>

      {activeTab === 'devoluciones' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Registro de Devoluciones</h2>
            <button 
              onClick={() => {
                setEditingDevolucion(null);
                setDevItems([{
                    producto_id: null, descripcion: '', cantidad: 1, max_quantity: 1, precio_unitario: 0, selected: true
                }]);
                setDevDesc('');
                setDevMotivo('Defectuoso');
                setSelectedVenta(null);
                setShowDevModal(true);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-green-700"
            >
              <Plus size={18} className="mr-2" /> Nueva Devolución
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitud</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comprobante</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {devoluciones.map((dev) => (
                  <tr key={dev.id}>
                    <td className="px-6 py-4">{dev.fecha_solicitud}</td>
                    <td className="px-6 py-4">{dev.cliente_nombre}</td>
                    <td className="px-6 py-4">{dev.serie}-{dev.correlativo}</td>
                    <td className="px-6 py-4">{dev.motivo}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${dev.estado === 'aprobado' ? 'bg-green-100 text-green-800' : 
                          dev.estado === 'rechazado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {dev.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 space-x-2">
                      {dev.estado === 'pendiente' && (
                        <>
                          <button 
                            onClick={() => handleApproveDev(dev.id, true)}
                            className="text-green-600 hover:text-green-900" 
                            title="Aprobar y Revertir Stock"
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button 
                            onClick={() => handleRejectDev(dev.id)}
                            className="text-red-600 hover:text-red-900" 
                            title="Rechazar"
                          >
                            <XCircle size={18} />
                          </button>
                          <button 
                            onClick={() => handleEditDevolucion(dev)}
                            className="text-blue-600 hover:text-blue-900" 
                            title="Editar"
                          >
                            <Edit size={18} />
                          </button>
                        </>
                      )}
                      {(dev.estado === 'pendiente' || dev.estado === 'rechazado') && (
                          <button 
                            onClick={() => handleDeleteDevolucion(dev.id)}
                            className="text-gray-600 hover:text-gray-900" 
                            title="Eliminar"
                          >
                            <Trash size={18} />
                          </button>
                      )}
                      {dev.nota_credito_id && (
                         <span className="text-xs text-blue-600 border border-blue-600 px-1 rounded">NC Generada</span>
                      )}
                    </td>
                  </tr>
                ))}
                {devoluciones.length === 0 && (
                    <tr><td colSpan="6" className="text-center py-4 text-gray-500">No hay devoluciones registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reclamos' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Seguimiento de Reclamos</h2>
            <button 
              onClick={() => {
                setEditingReclamo(null);
                setReclamoForm({
                    cliente_nombre: '', cliente_contacto: '', asunto: '', descripcion: '', prioridad: 'media', tipo_origen: 'venta'
                });
                setShowReclamoModal(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700"
            >
              <Plus size={18} className="mr-2" /> Nuevo Reclamo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {reclamos.map(rec => (
                 <div key={rec.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                     <div className="flex justify-between items-start mb-2">
                         <span className={`px-2 py-1 text-xs rounded font-bold ${
                             rec.prioridad === 'alta' || rec.prioridad === 'urgente' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                         }`}>
                             {rec.prioridad.toUpperCase()}
                         </span>
                         <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">{rec.fecha_reclamo}</span>
                            <button onClick={() => handleEditReclamo(rec)} className="text-blue-500 hover:text-blue-700" title="Editar"><Edit size={14}/></button>
                            <button onClick={() => handleDeleteReclamo(rec.id)} className="text-gray-400 hover:text-red-600" title="Eliminar"><Trash size={14}/></button>
                         </div>
                     </div>
                     <h3 className="font-bold text-gray-800 mb-1">{rec.asunto}</h3>
                     <p className="text-sm text-gray-600 mb-2 line-clamp-2">{rec.descripcion}</p>
                     <div className="text-xs text-gray-500 mb-4">
                         <User size={12} className="inline mr-1"/> {rec.cliente_nombre}
                     </div>
                     <div className="flex justify-between items-center pt-2 border-t">
                         <span className={`text-sm font-medium ${
                             rec.estado === 'cerrado' ? 'text-gray-500' : 'text-green-600'
                         }`}>
                             {rec.estado.replace('_', ' ')}
                         </span>
                         <button 
                            onClick={() => {
                                setResolveForm({ id: rec.id, estado: rec.estado, resolucion: rec.resolucion || '' });
                                setShowResolveModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                         >
                             Atender
                         </button>
                     </div>
                 </div>
             ))}
             {reclamos.length === 0 && (
                 <div className="col-span-3 text-center py-10 text-gray-500">No hay reclamos registrados</div>
             )}
          </div>
        </div>
      )}

      {/* Modal Devolucion */}
      {showDevModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editingDevolucion ? 'Editar Devolución' : 'Registrar Nueva Devolución'}</h3>
            
            <div className="mb-4 relative">
              <label className="block text-sm font-medium text-gray-700">Buscar Comprobante (Serie, Cliente o RUC/DNI)</label>
              <div className="flex mt-1">
                <input 
                  type="text"
                  className="w-full border rounded-l-lg p-2"
                  value={searchVentaTerm}
                  onChange={(e) => {
                      setSearchVentaTerm(e.target.value);
                      searchVentas(e.target.value);
                  }}
                  placeholder="Ingrese Serie-Correlativo, Razón Social o RUC/DNI..."
                />
                <button className="bg-gray-100 border border-l-0 rounded-r-lg px-3">
                    <Search size={18} />
                </button>
              </div>
              {foundVentas.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border shadow-lg mt-1 rounded-lg max-h-48 overflow-y-auto">
                      {foundVentas.map(v => (
                          <div 
                            key={v.id} 
                            className="p-2 hover:bg-blue-50 cursor-pointer border-b"
                            onClick={() => handleSelectVenta(v)}
                          >
                              <div className="font-bold">{v.serie}-{v.correlativo}</div>
                              <div className="text-sm text-gray-600">{v.cliente_razon_social} - {v.total_importe}</div>
                          </div>
                      ))}
                  </div>
              )}
            </div>

            {selectedVenta && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-bold text-blue-800">Venta Seleccionada: {selectedVenta.serie}-{selectedVenta.correlativo}</p>
                    <p className="text-xs text-blue-600">{selectedVenta.cliente_razon_social}</p>
                    {!saleItemsEnabled && (
                      <div className="mt-2 text-xs text-red-600">No se pudieron cargar productos desde la venta. Ingrese manualmente.</div>
                    )}
                </div>
            )}

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Motivo</label>
                <select 
                    className="w-full border rounded-lg p-2 mt-1"
                    value={devMotivo}
                    onChange={e => setDevMotivo(e.target.value)}
                >
                    <option value="Defectuoso">Producto Defectuoso</option>
                    <option value="NoCorresponde">No corresponde al pedido</option>
                    <option value="CambioOpinion">Cambio de opinión</option>
                    <option value="Otro">Otro</option>
                </select>
            </div>
            
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Descripción / Detalles</label>
                <textarea 
                    className="w-full border rounded-lg p-2 mt-1"
                    rows="2"
                    value={devDesc}
                    onChange={e => setDevDesc(e.target.value)}
                ></textarea>
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Seleccionar Productos a Devolver</label>
                {devItems.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left w-10">
                            <input 
                              type="checkbox" 
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setDevItems(devItems.map(i => ({ ...i, selected: checked })));
                              }}
                            />
                          </th>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-center w-24">Cant. Max</th>
                          <th className="px-3 py-2 text-center w-24">A Devolver</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {devItems.map((item, idx) => (
                          <tr key={idx} className={item.selected ? 'bg-blue-50' : ''}>
                            <td className="px-3 py-2">
                              <input 
                                type="checkbox" 
                                checked={item.selected}
                                onChange={(e) => {
                                  const newItems = [...devItems];
                                  newItems[idx].selected = e.target.checked;
                                  setDevItems(newItems);
                                }}
                              />
                             </td>
                             <td className="px-3 py-2">
                               {item.producto_id ? (
                                 <>
                                   <div className="font-medium text-gray-800">{item.descripcion}</div>
                                   <div className="text-xs text-gray-500">ID: {item.producto_id}</div>
                                 </>
                               ) : (
                                 <input 
                                   className="w-full border rounded p-1 text-sm"
                                   value={item.descripcion}
                                   onChange={(e) => {
                                     const newItems = [...devItems];
                                     newItems[idx].descripcion = e.target.value;
                                     setDevItems(newItems);
                                   }}
                                   placeholder="Descripción del producto"
                                 />
                               )}
                             </td>
                            <td className="px-3 py-2 text-center text-gray-500">{item.max_quantity}</td>
                            <td className="px-3 py-2">
                              <input 
                                type="number" 
                                className={`w-20 border rounded p-1 text-center ${!item.selected ? 'bg-gray-100 text-gray-400' : ''}`}
                                value={item.cantidad}
                                disabled={!item.selected}
                                min="0.1"
                                max={item.max_quantity}
                                step="0.1"
                                onChange={(e) => {
                                  let val = parseFloat(e.target.value);
                                  if (isNaN(val) || val < 0) val = 0;
                                  if (val > item.max_quantity) val = item.max_quantity;
                                  
                                  const newItems = [...devItems];
                                  newItems[idx].cantidad = val;
                                  setDevItems(newItems);
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              S/ {item.precio_unitario.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg text-gray-400">
                    <p>Busque y seleccione una venta para ver sus productos</p>
                  </div>
                )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button 
                onClick={() => setShowDevModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateDevolucion}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingDevolucion ? 'Actualizar' : 'Registrar Devolución'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reclamo */}
      {showReclamoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">{editingReclamo ? 'Editar Reclamo' : 'Nuevo Reclamo'}</h3>
            
            <div className="space-y-3">
                <input 
                    className="w-full border rounded p-2"
                    placeholder="Nombre del Cliente"
                    value={reclamoForm.cliente_nombre}
                    onChange={e => setReclamoForm({...reclamoForm, cliente_nombre: e.target.value})}
                />
                <input 
                    className="w-full border rounded p-2"
                    placeholder="Contacto (Email/Teléfono)"
                    value={reclamoForm.cliente_contacto}
                    onChange={e => setReclamoForm({...reclamoForm, cliente_contacto: e.target.value})}
                />
                 <input 
                    className="w-full border rounded p-2"
                    placeholder="Asunto"
                    value={reclamoForm.asunto}
                    onChange={e => setReclamoForm({...reclamoForm, asunto: e.target.value})}
                />
                <select 
                    className="w-full border rounded p-2"
                    value={reclamoForm.prioridad}
                    onChange={e => setReclamoForm({...reclamoForm, prioridad: e.target.value})}
                >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                </select>
                <textarea 
                    className="w-full border rounded p-2"
                    rows="3"
                    placeholder="Descripción del problema"
                    value={reclamoForm.descripcion}
                    onChange={e => setReclamoForm({...reclamoForm, descripcion: e.target.value})}
                ></textarea>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button 
                onClick={() => setShowReclamoModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateReclamo}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingReclamo ? 'Actualizar' : 'Guardar Reclamo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resolver Reclamo */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">Atender Reclamo</h3>
            
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Estado</label>
                <select 
                    className="w-full border rounded p-2"
                    value={resolveForm.estado}
                    onChange={e => setResolveForm({...resolveForm, estado: e.target.value})}
                >
                    <option value="registrado">Registrado</option>
                    <option value="en_revision">En Revisión</option>
                    <option value="procedente">Procedente</option>
                    <option value="improcedente">Improcedente</option>
                    <option value="cerrado">Cerrado</option>
                </select>
            </div>
            
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Resolución / Respuesta</label>
                <textarea 
                    className="w-full border rounded p-2"
                    rows="4"
                    value={resolveForm.resolucion}
                    onChange={e => setResolveForm({...resolveForm, resolucion: e.target.value})}
                ></textarea>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button 
                onClick={() => setShowResolveModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleUpdateReclamo}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevolucionesReclamos;
