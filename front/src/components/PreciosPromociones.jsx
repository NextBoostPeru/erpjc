import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  Tags, Percent, Settings, Plus, Trash, Save, Search, 
  Calendar, AlertTriangle, CheckCircle 
} from 'lucide-react';
import { API_URL } from '../api/config';

const PreciosPromociones = () => {
  const [activeTab, setActiveTab] = useState('listas'); // listas, promociones, config
  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Tags className="text-blue-600" />
            Precios y Promociones
        </h1>
        <div className="flex bg-white rounded-lg shadow-sm p-1">
            <button 
                onClick={() => setActiveTab('listas')}
                className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'listas' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
                Listas de Precios
            </button>
            <button 
                onClick={() => setActiveTab('promociones')}
                className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'promociones' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
                Promociones
            </button>
            <button 
                onClick={() => setActiveTab('config')}
                className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'config' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
                Configuración
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm min-h-[500px]">
        {activeTab === 'listas' && <ListasPreciosTab headers={headers} />}
        {activeTab === 'promociones' && <PromocionesTab headers={headers} />}
        {activeTab === 'config' && <ConfigTab headers={headers} />}
      </div>
    </div>
  );
};

// --- SUB COMPONENTS ---

const ListasPreciosTab = ({ headers }) => {
    const [listas, setListas] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ nombre: '', tipo: 'base', items: [] });
    const [searchTerm, setSearchTerm] = useState('');
    const [productsFound, setProductsFound] = useState([]);

    useEffect(() => {
        fetchListas();
    }, []);

    const fetchListas = async () => {
        try {
            const res = await axios.get(`${API_URL}/precios_promociones.php?action=listar_listas`, { headers });
            setListas(res.data);
        } catch (error) { console.error(error); }
    };

    const handleEdit = async (lista) => {
        setEditingId(lista.id);
        // Fetch details
        try {
            const res = await axios.get(`${API_URL}/precios_promociones.php?action=obtener_lista&id=${lista.id}`, { headers });
            setFormData(res.data);
        } catch (error) { toast.error("Error al cargar detalles"); }
    };

    const handleCreate = () => {
        setEditingId('new');
        setFormData({ nombre: '', tipo: 'base', moneda: 'PEN', items: [] });
    };

    const searchProducts = async (term) => {
        if(term.length < 2) return;
        try {
            const res = await axios.get(`${API_URL}/precios_promociones.php?action=buscar_productos&q=${term}`, { headers });
            setProductsFound(res.data);
        } catch (error) { console.error(error); }
    };

    const addProductToList = (prod) => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { 
                producto_id: prod.id, 
                producto_nombre: prod.nombre, 
                producto_codigo: prod.codigo,
                precio: prod.precio || 0,
                costo_ref: prod.precio_compra, // For margin calc
                min_cantidad: 1 
            }]
        }));
        setSearchTerm('');
        setProductsFound([]);
    };

    const handleSave = async () => {
        try {
            await axios.post(`${API_URL}/precios_promociones.php?action=guardar_lista`, formData, { headers });
            toast.success("Lista guardada");
            setEditingId(null);
            fetchListas();
        } catch (error) { toast.error("Error al guardar"); }
    };

    const handleDelete = async (id) => {
        if(!confirm("¿Eliminar esta lista?")) return;
        try {
            await axios.post(`${API_URL}/precios_promociones.php?action=eliminar_lista`, { id }, { headers });
            fetchListas();
        } catch (error) { toast.error("Error al eliminar"); }
    };

    if (editingId) {
        return (
            <div className="p-6">
                <div className="flex justify-between mb-4">
                    <h2 className="text-xl font-bold">{editingId === 'new' ? 'Nueva Lista' : 'Editar Lista'}</h2>
                    <button onClick={() => setEditingId(null)} className="text-gray-500">Cancelar</button>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium">Nombre</label>
                        <input className="w-full border rounded p-2" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Tipo</label>
                        <select className="w-full border rounded p-2" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                            <option value="base">Base</option>
                            <option value="cliente">Por Cliente</option>
                            <option value="temporada">Temporada</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Moneda</label>
                        <select className="w-full border rounded p-2" value={formData.moneda} onChange={e => setFormData({...formData, moneda: e.target.value})}>
                            <option value="PEN">Soles (PEN)</option>
                            <option value="USD">Dólares (USD)</option>
                        </select>
                    </div>
                </div>

                <div className="mb-4">
                    <h3 className="font-bold mb-2">Items de la lista</h3>
                    <div className="relative mb-2">
                        <input 
                            placeholder="Buscar producto para agregar..." 
                            className="w-full border rounded p-2"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); searchProducts(e.target.value); }}
                        />
                        {productsFound.length > 0 && (
                            <div className="absolute z-10 bg-white border shadow-lg w-full max-h-40 overflow-y-auto">
                                {productsFound.map(p => (
                                    <div key={p.id} className="p-2 hover:bg-blue-50 cursor-pointer" onClick={() => addProductToList(p)}>
                                        {p.codigo} - {p.nombre}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <table className="w-full border-collapse">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>
                                <th className="p-2 text-left">Producto</th>
                                <th className="p-2 text-right">Min. Cantidad</th>
                                <th className="p-2 text-right">Precio Lista</th>
                                <th className="p-2 text-right">Margen Est.</th>
                                <th className="p-2 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.items.map((item, idx) => {
                                const margen = item.costo_ref > 0 ? ((item.precio - item.costo_ref) / item.precio * 100) : 100;
                                return (
                                    <tr key={idx} className="border-b">
                                        <td className="p-2">{item.producto_codigo} - {item.producto_nombre}</td>
                                        <td className="p-2 text-right">
                                            <input type="number" className="w-20 border rounded p-1 text-right" value={item.min_cantidad} 
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    newItems[idx].min_cantidad = e.target.value;
                                                    setFormData({...formData, items: newItems});
                                                }}
                                            />
                                        </td>
                                        <td className="p-2 text-right">
                                            <input type="number" className="w-24 border rounded p-1 text-right" value={item.precio} 
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    newItems[idx].precio = e.target.value;
                                                    setFormData({...formData, items: newItems});
                                                }}
                                            />
                                        </td>
                                        <td className="p-2 text-right">
                                            <span className={margen < 15 ? 'text-red-500 font-bold' : 'text-green-600'}>
                                                {margen.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="p-2 text-center">
                                            <button onClick={() => {
                                                const newItems = formData.items.filter((_, i) => i !== idx);
                                                setFormData({...formData, items: newItems});
                                            }} className="text-red-500 hover:text-red-700">
                                                <Trash size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end mt-6">
                    <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">
                        <Save size={18} /> Guardar Lista
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex justify-between mb-4">
                <h2 className="text-lg font-bold">Listas Configuradas</h2>
                <button onClick={handleCreate} className="bg-green-600 text-white px-3 py-2 rounded flex items-center gap-2">
                    <Plus size={18} /> Nueva Lista
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {listas.map(lista => (
                    <div key={lista.id} className="border p-4 rounded-lg hover:shadow-md">
                        <div className="flex justify-between items-start">
                            <h3 className="font-bold text-lg">{lista.nombre}</h3>
                            <span className={`px-2 py-1 text-xs rounded ${lista.estado === 'activa' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                                {lista.estado}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 mb-2">{lista.descripcion}</p>
                        <div className="text-xs bg-gray-50 p-2 rounded mb-3">
                            <p>Tipo: {lista.tipo.toUpperCase()}</p>
                            <p>Moneda: {lista.moneda}</p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => handleDelete(lista.id)} className="text-red-500 text-sm">Eliminar</button>
                            <button onClick={() => handleEdit(lista)} className="text-blue-600 text-sm font-bold">Editar</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const PromocionesTab = ({ headers }) => {
    const [promos, setPromos] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({});

    useEffect(() => {
        fetchPromos();
    }, []);

    const fetchPromos = async () => {
        try {
            const res = await axios.get(`${API_URL}/precios_promociones.php?action=listar_promociones`, { headers });
            setPromos(res.data);
        } catch (error) { console.error(error); }
    };

    const handleSave = async () => {
        try {
            await axios.post(`${API_URL}/precios_promociones.php?action=guardar_promocion`, form, { headers });
            toast.success("Promoción guardada");
            setShowModal(false);
            fetchPromos();
        } catch (error) { toast.error("Error al guardar"); }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between mb-4">
                <h2 className="text-lg font-bold">Promociones Activas y Programadas</h2>
                <button onClick={() => { setForm({ tipo_descuento: 'porcentaje', alcance: 'todos', estado: 'programada' }); setShowModal(true); }} className="bg-blue-600 text-white px-3 py-2 rounded flex items-center gap-2">
                    <Plus size={18} /> Nueva Promoción
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left">Nombre</th>
                            <th className="px-4 py-2 text-left">Vigencia</th>
                            <th className="px-4 py-2 text-left">Descuento</th>
                            <th className="px-4 py-2 text-left">Alcance</th>
                            <th className="px-4 py-2 text-left">Estado</th>
                            <th className="px-4 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {promos.map(p => (
                            <tr key={p.id} className="border-b">
                                <td className="px-4 py-2 font-medium">{p.nombre}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{p.fecha_inicio} al {p.fecha_fin}</td>
                                <td className="px-4 py-2 font-bold text-green-600">
                                    {p.tipo_descuento === 'porcentaje' ? `${p.valor}%` : `S/ ${p.valor}`}
                                </td>
                                <td className="px-4 py-2 text-sm capitalize">{p.alcance}</td>
                                <td className="px-4 py-2">
                                    <span className={`px-2 py-1 text-xs rounded-full ${p.estado === 'activa' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {p.estado}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-right">
                                    <button onClick={() => { setForm(p); setShowModal(true); }} className="text-blue-600 text-sm mr-2">Editar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4">{form.id ? 'Editar' : 'Nueva'} Promoción</h3>
                        <div className="space-y-3">
                            <input className="w-full border rounded p-2" placeholder="Nombre Promoción" value={form.nombre || ''} onChange={e => setForm({...form, nombre: e.target.value})} />
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-xs text-gray-500">Inicio</label>
                                    <input type="date" className="w-full border rounded p-2" value={form.fecha_inicio || ''} onChange={e => setForm({...form, fecha_inicio: e.target.value})} />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-gray-500">Fin</label>
                                    <input type="date" className="w-full border rounded p-2" value={form.fecha_fin || ''} onChange={e => setForm({...form, fecha_fin: e.target.value})} />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <select className="border rounded p-2" value={form.tipo_descuento} onChange={e => setForm({...form, tipo_descuento: e.target.value})}>
                                    <option value="porcentaje">Porcentaje (%)</option>
                                    <option value="monto_fijo">Monto Fijo (S/)</option>
                                </select>
                                <input type="number" className="flex-1 border rounded p-2" placeholder="Valor" value={form.valor || ''} onChange={e => setForm({...form, valor: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-sm text-gray-500">Alcance</label>
                                <select className="w-full border rounded p-2" value={form.alcance} onChange={e => setForm({...form, alcance: e.target.value})}>
                                    <option value="todos">Todos los productos</option>
                                    <option value="seleccion">Selección Manual (WIP)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-500">Estado</label>
                                <select className="w-full border rounded p-2" value={form.estado} onChange={e => setForm({...form, estado: e.target.value})}>
                                    <option value="programada">Programada</option>
                                    <option value="activa">Activa</option>
                                    <option value="finalizada">Finalizada</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end mt-4 gap-2">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded">Cancelar</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ConfigTab = ({ headers }) => {
    const [config, setConfig] = useState({ max_descuento_autorizado: 0, margen_minimo_alerta: 0 });

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await axios.get(`${API_URL}/precios_promociones.php?action=get_politicas`, { headers });
                if(res.data) setConfig(res.data);
            } catch (error) { console.error(error); }
        };
        fetchConfig();
    }, []);

    const handleSave = async () => {
        try {
            await axios.post(`${API_URL}/precios_promociones.php?action=save_politicas`, config, { headers });
            toast.success("Configuración actualizada");
        } catch (error) { toast.error("Error al guardar"); }
    };

    return (
        <div className="p-6 max-w-lg">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="text-orange-500" />
                Políticas Comerciales (Rol Ventas)
            </h2>
            <div className="bg-orange-50 border border-orange-200 rounded p-4 mb-6 text-sm text-orange-800">
                Estas configuraciones definen los límites para el equipo de ventas.
            </div>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Descuento Máximo Autorizado (%)</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            className="w-full border rounded p-2"
                            value={config.max_descuento_autorizado}
                            onChange={e => setConfig({...config, max_descuento_autorizado: e.target.value})}
                        />
                        <Percent size={16} className="text-gray-500" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Descuentos superiores requerirán aprobación de gerencia (futuro).</p>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Margen Mínimo de Alerta (%)</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            className="w-full border rounded p-2"
                            value={config.margen_minimo_alerta}
                            onChange={e => setConfig({...config, margen_minimo_alerta: e.target.value})}
                        />
                        <Percent size={16} className="text-gray-500" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Se mostrará una alerta si el precio configurado genera un margen inferior a este valor.</p>
                </div>

                <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 mt-4">
                    <Save size={18} /> Guardar Cambios
                </button>
            </div>
        </div>
    );
};

export default PreciosPromociones;
