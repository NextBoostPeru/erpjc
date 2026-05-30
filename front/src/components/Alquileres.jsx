import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { 
  Calendar, Truck, AlertTriangle, Plus, Search, X, Save, Upload, CheckCircle, Clock, Package, Pencil, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

const TIPOS_ALQUILER = [
  { value: 'andamio', label: 'Andamio' },
  { value: 'prevencionista', label: 'Prevencionista' }
];

const Alquileres = () => {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState('list');
  const [list, setList] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [alertas, setAlertas] = useState([]);

  const [almacenes, setAlmacenes] = useState([]);
  const [productos, setProductos] = useState([]);

  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [alquilerToDelete, setAlquilerToDelete] = useState(null);
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteResultados, setClienteResultados] = useState([]);
  const [clienteCargando, setClienteCargando] = useState(false);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [form, setForm] = useState({
    cliente_tipo_doc: '6',
    cliente_num_doc: '',
    cliente_razon_social: '',
    tipo: 'andamio',
    fecha_inicio: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
    fecha_fin: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
    almacen_id: '',
    alert_days: 3,
    observaciones: '',
    detalles: []
  });

  const [detalleTemp, setDetalleTemp] = useState({
    item_tipo: 'andamio',
    producto_id: '',
    descripcion: '',
    cantidad: 1,
    tarifa_diaria: 0
  });

  const checkPermissions = async () => {
    let apiPermission = null;
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await axios.get(`${API_URL}check_my_permissions.php?code=alquileres`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data && response.data.success !== false) {
          const canCreateApi = response.data.crear === 1 || response.data.escritura === 1;
          const canEditApi = response.data.editar === 1 || response.data.escritura === 1;
          apiPermission = {
            create: canCreateApi,
            edit: canEditApi,
            delete: response.data.eliminacion === 1
          };
        }
      }
    } catch (error) {
      console.error('Error checking permissions for alquileres', error);
    }

    if (apiPermission) {
      setCanCreate(apiPermission.create);
      setCanEdit(apiPermission.edit);
      setCanDelete(apiPermission.delete);
      return;
    }

    setCanCreate(false);
    setCanEdit(false);
    setCanDelete(false);
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}alquileres.php?action=listar&page=${page}&limit=20&search=${encodeURIComponent(searchTerm)}`, { headers });
      if (res.data && res.data.pagination) {
        setList(res.data.data || []);
        setTotalPages(res.data.pagination.total_pages || 1);
      } else {
        setList(Array.isArray(res.data) ? res.data : []);
        setTotalPages(1);
      }
    } catch (error) {
      toast.error('Error cargando alquileres');
    } finally {
      setLoading(false);
    }
  };

  const fetchAlertas = async () => {
    try {
      const res = await axios.get(`${API_URL}alquileres.php?action=alertas`, { headers });
      setAlertas(res.data?.data || []);
    } catch (error) {
      setAlertas([]);
    }
  };

  const fetchAlmacenes = async () => {
    try {
      const res = await axios.get(`${API_URL}almacenes.php`, { headers });
      setAlmacenes(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      setAlmacenes([]);
    }
  };

  const fetchProductos = async () => {
    try {
      const res = await axios.get(`${API_URL}productos.php?page=1&limit=200&categoria=andamio`, { headers });
      const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setProductos(data);
    } catch (error) {
      console.error(error);
      setProductos([]);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    fetchList();
  }, [page, searchTerm]);

  useEffect(() => {
    if (tab === 'alerts') {
      fetchAlertas();
    }
  }, [tab]);

  useEffect(() => {
    fetchAlmacenes();
    fetchProductos();
    checkPermissions();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const q = clienteQuery.trim();
      if (q.length < 2) {
        setClienteResultados([]);
        setShowClienteDropdown(false);
        return;
      }
      try {
        setClienteCargando(true);
        setShowClienteDropdown(true);
        const res = await axios.get(`${API_URL}gestion_clientes.php?action=list&search=${encodeURIComponent(q)}`, {
          headers, signal: ctrl.signal
        });
        const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
        setClienteResultados(data);
      } catch (error) {
        if (!axios.isCancel(error)) {
          setClienteResultados([]);
        }
      } finally {
        setClienteCargando(false);
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [clienteQuery]);

  const seleccionarCliente = (cli) => {
    setForm(prev => ({
      ...prev,
      cliente_tipo_doc: cli.tipo_doc || '6',
      cliente_num_doc: cli.num_doc || '',
      cliente_razon_social: cli.razon_social || ''
    }));
    setClienteQuery(`${cli.num_doc} - ${cli.razon_social}`);
    setShowClienteDropdown(false);
  };

  const addDetalle = () => {
    if (!detalleTemp.producto_id && !(detalleTemp.descripcion && detalleTemp.descripcion.trim().length > 0)) {
      toast.error(form.tipo === 'andamio' ? 'Ingrese el componente de andamio' : 'Ingrese el detalle');
      return;
    }
    if (detalleTemp.cantidad <= 0) {
      toast.error('Cantidad inválida');
      return;
    }
    const itemToAdd = { ...detalleTemp, item_tipo: form.tipo };
    setForm(prev => ({ ...prev, detalles: [...prev.detalles, itemToAdd] }));
    setDetalleTemp({
      item_tipo: form.tipo,
      producto_id: '',
      descripcion: '',
      cantidad: 1,
      tarifa_diaria: 0
    });
  };

  const removeDetalle = (idx) => {
    setForm(prev => ({ ...prev, detalles: prev.detalles.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const di = new Date(form.fecha_inicio);
      const df = new Date(form.fecha_fin);
      if (df < di) {
        toast.error('La fecha fin debe ser posterior a la fecha inicio');
        return;
      }
      if (!form.cliente_num_doc || !form.cliente_razon_social) {
        toast.error('Complete datos del cliente');
        return;
      }
      if (form.tipo === 'andamio' && !form.almacen_id) {
        toast.error('Seleccione almacén');
        return;
      }
      if (!form.detalles || form.detalles.length === 0) {
        toast.error('Agregue al menos un detalle');
        return;
      }
      if (isEditing && editingId) {
        const payload = { ...form, id: editingId };
        const res = await axios.post(`${API_URL}alquileres.php?action=editar`, payload, { headers });
        toast.success(res.data?.message || 'Alquiler actualizado');
      } else {
        const res = await axios.post(`${API_URL}alquileres.php?action=crear`, form, { headers });
        toast.success(res.data?.message || 'Alquiler creado');
      }
      setShowModal(false);
      setIsEditing(false);
      setEditingId(null);
      setForm({
        cliente_tipo_doc: '6',
        cliente_num_doc: '',
        cliente_razon_social: '',
        tipo: 'andamio',
        fecha_inicio: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        fecha_fin: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        almacen_id: '',
        alert_days: 3,
        observaciones: '',
        detalles: []
      });
      fetchList();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al crear');
    }
  };

  const programarRecojo = async (alquiler) => {
    const fecha = prompt('Fecha de recojo (YYYY-MM-DD):', alquiler.fecha_fin);
    if (!fecha) return;
    try {
      const res = await axios.post(`${API_URL}alquileres.php?action=programar_recojo`, {
        alquiler_id: alquiler.id,
        pickup_date: fecha,
        notas: ''
      }, { headers });
      toast.success(res.data?.message || 'Recojo programado');
      fetchList();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error programando recojo');
    }
  };

  const confirmarRecojo = async (alquiler) => {
    try {
      const res = await axios.post(`${API_URL}alquileres.php?action=confirmar_recojo`, {
        alquiler_id: alquiler.id,
        pickup_date: alquiler.fecha_fin
      }, { headers });
      toast.success(res.data?.message || 'Recojo confirmado');
      fetchList();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error confirmando recojo');
    }
  };

  const openEdit = (alquiler) => {
    setIsEditing(true);
    setEditingId(alquiler.id);
    setForm({
      cliente_tipo_doc: alquiler.cliente_tipo_doc || '6',
      cliente_num_doc: alquiler.cliente_num_doc || '',
      cliente_razon_social: alquiler.cliente_razon_social || '',
      tipo: alquiler.tipo || 'andamio',
      fecha_inicio: alquiler.fecha_inicio,
      fecha_fin: alquiler.fecha_fin,
      almacen_id: alquiler.almacen_id || '',
      alert_days: alquiler.alert_days ?? 3,
      observaciones: alquiler.observaciones || '',
      detalles: alquiler.detalles || []
    });
    setShowModal(true);
  };

  const confirmDelete = (alquiler) => {
    setAlquilerToDelete(alquiler);
    setShowDeleteModal(true);
  };

  const doDelete = async () => {
    if (!alquilerToDelete) return;
    try {
      const res = await axios.post(`${API_URL}alquileres.php?action=eliminar`, { id: alquilerToDelete.id }, { headers });
      toast.success(res.data?.message || 'Alquiler eliminado');
      setShowDeleteModal(false);
      setAlquilerToDelete(null);
      fetchList();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error eliminando');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Alquileres
          </h1>
          <p className="text-gray-500 text-sm">Alquiler de andamios por rango de fechas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('list')} className={`px-3 py-2 rounded-lg border ${tab==='list'?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300'}`}>Listado</button>
          <button onClick={() => setTab('alerts')} className={`px-3 py-2 rounded-lg border ${tab==='alerts'?'bg-amber-500 text-white border-amber-500':'bg-white text-gray-700 border-gray-300'}`}>Alertas</button>
          {canCreate && (
            <button onClick={() => { setShowModal(true); setTab('list'); }} className="px-3 py-2 rounded-lg bg-green-600 text-white flex items-center gap-2"><Plus size={18}/> Nuevo</button>
          )}
        </div>
      </div>

      {tab === 'list' && (
        <div className="bg-white rounded-xl shadow border border-gray-100">
          <div className="p-4 border-b flex items-center gap-3">
            <Search size={18} className="text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por cliente o RUC" className="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-xs text-gray-700">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Inicio</th>
                  <th className="px-4 py-3">Fin</th>
                  <th className="px-4 py-3">Días</th>
                  <th className="px-4 py-3">Restantes</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
              {loading ? (
                <tr><td colSpan="8" className="px-4 py-6 text-center">Cargando...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-6 text-center text-gray-400">Sin resultados</td></tr>
              ) : list.map(a => (
                <tr key={a.id} className="border-b">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{a.cliente_razon_social}</div>
                    <div className="text-xs text-gray-400">{a.cliente_num_doc}</div>
                  </td>
                  <td className="px-4 py-3">{a.tipo}</td>
                  <td className="px-4 py-3">{new Date(a.fecha_inicio).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{new Date(a.fecha_fin).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{a.dias}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      a.dias_restantes <= 0 ? 'bg-red-100 text-red-700' :
                      a.dias_restantes <= (a.alert_days ?? 3) ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {a.dias_restantes}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs ${a.estado==='Activo'?'bg-green-100 text-green-700':a.estado==='Recojo Programado'?'bg-amber-100 text-amber-700':a.estado==='Recogido'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-700'}`}>{a.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      {canEdit && (
                        <button onClick={() => openEdit(a)} className="text-gray-600 hover:text-gray-800 p-1" title="Editar">
                          <Pencil size={18} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => confirmDelete(a)} className="text-red-600 hover:text-red-800 p-1" title="Eliminar">
                          <Trash2 size={18} />
                        </button>
                      )}
                      {a.estado === 'Activo' && (
                        <button onClick={() => programarRecojo(a)} className="text-amber-600 hover:text-amber-800 p-1" title="Programar Recojo">
                          <Calendar size={18} />
                        </button>
                      )}
                      {(a.estado === 'Activo' || a.estado === 'Recojo Programado') && (
                        <button onClick={() => confirmarRecojo(a)} className="text-blue-600 hover:text-blue-800 p-1" title="Confirmar Recojo">
                          <Truck size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center p-4 border-t bg-gray-50">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-3 py-2 border rounded-lg bg-white disabled:opacity-50">Anterior</button>
            <span className="text-gray-600">Página {page} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-3 py-2 border rounded-lg bg-white disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div className="bg-white rounded-xl shadow border border-gray-100">
          <div className="p-4 border-b flex items-center gap-2 text-amber-600">
            <AlertTriangle size={18}/> Alquileres próximos a finalizar
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-xs text-gray-700">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Fin</th>
                  <th className="px-4 py-3">Restantes</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {alertas.length === 0 ? (
                  <tr><td colSpan="5" className="px-4 py-6 text-center text-gray-400">Sin alertas</td></tr>
                ) : alertas.map(a => (
                  <tr key={a.id} className="border-b">
                    <td className="px-4 py-3">{a.cliente_razon_social}</td>
                    <td className="px-4 py-3">{a.tipo}</td>
                    <td className="px-4 py-3">{new Date(a.fecha_fin).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {Math.max(0, Math.ceil((new Date(a.fecha_fin) - new Date())/(1000*60*60*24)))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => programarRecojo(a)} className="text-amber-600 hover:text-amber-800 p-1" title="Programar Recojo">
                          <Calendar size={18}/>
                        </button>
                        <button onClick={() => confirmarRecojo(a)} className="text-blue-600 hover:text-blue-800 p-1" title="Confirmar Recojo">
                          <Truck size={18}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white md:rounded-xl rounded-none shadow-2xl w-full md:max-w-3xl md:my-8 h-full md:h-auto">
            <div className="bg-blue-600 px-6 py-4 rounded-t-xl flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-white font-bold text-lg">{isEditing ? 'Editar Alquiler' : 'Nuevo Alquiler'}</h3>
              <button onClick={() => setShowModal(false)} className="text-blue-100 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-9rem)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">Buscar cliente</label>
                  <div className="relative mt-1">
                    <input
                      value={clienteQuery}
                      onChange={e => setClienteQuery(e.target.value)}
                      onFocus={() => setShowClienteDropdown(true)}
                      placeholder="Escribe nombre, RUC o DNI"
                      className="w-full border rounded-lg px-3 py-2 text-sm md:text-base"
                    />
                    {showClienteDropdown && (
                      <div className="absolute z-20 mt-2 w-full bg-white border rounded-lg shadow max-h-60 overflow-auto">
                        {clienteCargando ? (
                          <div className="px-3 py-2 text-sm text-gray-500">Buscando...</div>
                        ) : clienteResultados.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-400">Sin resultados</div>
                        ) : (
                          clienteResultados.map(cli => (
                            <button
                              key={cli.id}
                              type="button"
                              onClick={() => seleccionarCliente(cli)}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50"
                            >
                              <div className="text-sm font-medium text-gray-800">{cli.razon_social}</div>
                              <div className="text-xs text-gray-500">{cli.num_doc} • {cli.tipo_doc === '6' ? 'RUC' : 'DNI'}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">RUC/DNI</label>
                  <input value={form.cliente_num_doc} onChange={e => setForm(prev => ({...prev, cliente_num_doc: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                </div>
                <div className="sm:col-span-2 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Razón Social</label>
                  <input value={form.cliente_razon_social} onChange={e => setForm(prev => ({...prev, cliente_razon_social: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={e => {
                      const nextTipo = e.target.value;
                      setForm(prev => ({
                        ...prev,
                        tipo: nextTipo,
                        almacen_id: nextTipo === 'andamio' ? prev.almacen_id : ''
                      }));
                      setDetalleTemp(prev => ({ ...prev, item_tipo: nextTipo }));
                    }}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"
                  >
                    {TIPOS_ALQUILER.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha Inicio</label>
                  <input type="date" value={form.fecha_inicio} onChange={e => setForm(prev => ({...prev, fecha_inicio: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha Fin</label>
                  <input type="date" value={form.fecha_fin} onChange={e => setForm(prev => ({...prev, fecha_fin: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                </div>
                {form.tipo === 'andamio' && (
                  <div className="sm:col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">Almacén</label>
                    <select value={form.almacen_id} onChange={e => setForm(prev => ({...prev, almacen_id: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base">
                      <option value="">Seleccione</option>
                      {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Alertar días antes</label>
                  <input type="number" min="1" value={form.alert_days} onChange={e => setForm(prev => ({...prev, alert_days: parseInt(e.target.value || 1)}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                </div>
                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">Observaciones</label>
                  <textarea value={form.observaciones} onChange={e => setForm(prev => ({...prev, observaciones: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                </div>
              </div>

              <div className="border rounded-lg p-3 md:p-4">
                <div className="font-semibold text-gray-800 mb-3">Detalle</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                  <div className="sm:col-span-2 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">{form.tipo === 'andamio' ? 'Componente de andamio' : 'Detalle'}</label>
                    {form.tipo === 'andamio' ? (
                      <select
                        value={detalleTemp.producto_id}
                        onChange={e => {
                          const prod = productos.find(p => p.id == e.target.value);
                          setDetalleTemp(prev => ({
                            ...prev,
                            producto_id: e.target.value,
                            descripcion: prod ? prod.nombre : ''
                          }));
                        }}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"
                      >
                        <option value="">Seleccione componente...</option>
                        {productos.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock})</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={detalleTemp.descripcion || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setDetalleTemp(prev => ({ ...prev, descripcion: val, producto_id: '' }));
                        }}
                        placeholder="Escribir detalle"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Cantidad</label>
                    <input type="number" min="1" value={detalleTemp.cantidad} onChange={e => setDetalleTemp(prev => ({...prev, cantidad: parseInt(e.target.value || 1)}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tarifa diaria</label>
                    <input type="number" min="0" step="0.01" value={detalleTemp.tarifa_diaria} onChange={e => setDetalleTemp(prev => ({...prev, tarifa_diaria: parseFloat(e.target.value || 0)}))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm md:text-base"/>
                  </div>
                  <div>
                    <button type="button" onClick={addDetalle} className="w-full px-3 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Agregar</button>
                  </div>
                </div>

                <div className="mt-4">
                  {form.detalles.length === 0 ? (
                    <div className="text-sm text-gray-400">Sin detalles</div>
                  ) : (
                    <div className="space-y-2">
                      {form.detalles.map((d, idx) => (
                        <div key={idx} className="flex items-center justify-between border rounded-lg p-2">
                          <div className="text-sm text-gray-700">
                            {d.descripcion || `Producto #${d.producto_id}`} • Cant: {d.cantidad} • Tarifa: {d.tarifa_diaria}
                          </div>
                          <button type="button" onClick={() => removeDetalle(idx)} className="text-red-600 hover:text-red-800 p-1">
                            <X size={16}/>
                          </button>
                        </div>
                      ))}
                      <div className="flex justify-end text-sm text-gray-600 pt-2">
                        <span className="px-2 py-1 bg-gray-50 rounded">
                          Total estimado: S/. {
                            (() => {
                              const dias = Math.max(1, Math.ceil((new Date(form.fecha_fin) - new Date(form.fecha_inicio))/(1000*60*60*24)) + 0);
                              return (form.detalles.reduce((acc, d) => acc + (d.tarifa_diaria || 0) * (d.cantidad || 0) * dias, 0)).toFixed(2);
                            })()
                          }
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t px-4 md:px-6 py-3 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{isEditing ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full md:max-w-md">
            <div className="px-6 py-4 border-b">
              <h3 className="font-bold text-lg text-gray-800">Eliminar alquiler</h3>
            </div>
            <div className="px-6 py-4 text-sm text-gray-700">
              ¿Deseas eliminar el alquiler de <span className="font-semibold">{alquilerToDelete?.cliente_razon_social}</span>? Esta acción es permanente.
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setAlquilerToDelete(null); }} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={doDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Alquileres;
