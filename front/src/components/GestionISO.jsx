import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
    LayoutDashboard, Building, ClipboardList, FileText, 
    Plus, Edit, Trash2, Search, CheckCircle, AlertTriangle, 
    Clock, X, ChevronDown, ChevronUp, Upload, Download,
    File, Eye, Bell, User, Calendar, Timer, Filter
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';

const formatDate = (dateString) => {
    if (!dateString) return '';
    const isoString = dateString.replace(' ', 'T');
    const date = new Date(isoString);
    return isNaN(date.getTime()) ? dateString : date.toLocaleString();
};

const CertificadosDashboard = () => {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const days = 90;
    
    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}iso.php?action=dashboard_certificados&days=${days}`);
            setItems(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const stats = {
        total: items.length,
        retrasados: items.filter(i => i.estado === 'Retrasado').length,
        empresas: Array.from(new Set(items.map(i => i.empresa))).length
    };
    const grouped = items.reduce((acc, i) => {
        (acc[i.empresa] = acc[i.empresa] || []).push(i);
        return acc;
    }, {});
    
    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Timer className="text-red-600" /> Certificados por Vencer (Multi-Empresa)
                </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                    <p className="text-xs text-red-700 font-medium">Retrasados</p>
                    <p className="text-2xl font-bold text-red-700">{stats.retrasados}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                    <p className="text-xs text-yellow-700 font-medium">Próximos a vencer</p>
                    <p className="text-2xl font-bold text-yellow-700">{stats.total}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-xs text-blue-700 font-medium">Empresas afectadas</p>
                    <p className="text-2xl font-bold text-blue-700">{stats.empresas}</p>
                </div>
            </div>
            {loading ? (
                <div className="py-8 text-center text-gray-400">Cargando...</div>
            ) : items.length === 0 ? (
                <div className="py-8 text-center text-gray-400">No hay certificados próximos a vencer</div>
            ) : (
                <div className="space-y-6">
                    {Object.keys(grouped).sort().map((empresa) => (
                        <div key={empresa} className="bg-white border border-gray-100 rounded-lg">
                            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                                <h4 className="font-bold text-gray-800">{empresa}</h4>
                                <span className="text-xs px-2 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                                    {grouped[empresa].length} certificados
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Norma</th>
                                            <th className="px-3 py-2 text-left">Requisito</th>
                                            <th className="px-3 py-2 text-left">Estado</th>
                                            <th className="px-3 py-2 text-left">Fecha Límite</th>
                                            <th className="px-3 py-2 text-right">Días</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grouped[empresa]
                                            .sort((a, b) => new Date(a.fecha_limite) - new Date(b.fecha_limite))
                                            .map((i, idx) => (
                                            <tr key={idx} className="border-b hover:bg-gray-50">
                                                <td className="px-3 py-2">{i.norma}</td>
                                                <td className="px-3 py-2 max-w-md truncate" title={i.requisito}>{i.requisito}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                        i.estado === 'Retrasado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {i.estado}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-gray-600">
                                                    {new Date(i.fecha_limite + 'T12:00:00').toLocaleDateString()}
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold">{i.dias_restantes}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
// --- COMPONENTS ---

const EmpresasView = ({ onSelectEmpresa }) => {
    const [empresas, setEmpresas] = useState([]);
    const [normas, setNormas] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmpresa, setEditingEmpresa] = useState(null);
    const [formData, setFormData] = useState({ nombre: '', ruc: '', logo: '', normas: [] });

    useEffect(() => {
        fetchEmpresas();
        fetchNormas();
    }, []);

    const fetchEmpresas = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=list_empresas`);
            setEmpresas(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    const fetchNormas = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=list_normas`);
            setNormas(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}iso.php?action=save_empresa`, {
                ...formData,
                id: editingEmpresa ? editingEmpresa.id : null
            });
            toast.success('Empresa guardada');
            setIsModalOpen(false);
            fetchEmpresas();
        } catch (error) {
            toast.error('Error al guardar empresa');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Seguro que deseas eliminar esta empresa?')) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_empresa&id=${id}`);
            toast.success('Empresa eliminada');
            fetchEmpresas();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const openModal = (empresa = null) => {
        setEditingEmpresa(empresa);
        if (empresa) {
            setFormData({
                nombre: empresa.nombre,
                ruc: empresa.ruc,
                logo: empresa.logo,
                normas: empresa.normas.map(n => n.id)
            });
        } else {
            setFormData({ nombre: '', ruc: '', logo: '', normas: [] });
        }
        setIsModalOpen(true);
    };

    const toggleNorma = (id) => {
        setFormData(prev => ({
            ...prev,
            normas: prev.normas.includes(id) 
                ? prev.normas.filter(n => n !== id)
                : [...prev.normas, id]
        }));
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Gestión de Empresas ISO</h2>
                <button 
                    onClick={() => openModal()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
                >
                    <Plus size={20} /> Nueva Empresa
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {empresas.map(emp => (
                    <div key={emp.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                {emp.logo ? (
                                    <img src={emp.logo} alt={emp.nombre} className="w-full h-full object-cover" />
                                ) : (
                                    <Building className="text-gray-400" />
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => openModal(emp)} className="p-1 text-gray-500 hover:text-blue-600">
                                    <Edit size={18} />
                                </button>
                                <button onClick={() => handleDelete(emp.id)} className="p-1 text-gray-500 hover:text-red-600">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                        <h3 className="font-bold text-lg text-gray-800 mb-1">{emp.nombre}</h3>
                        <p className="text-sm text-gray-500 mb-4">RUC: {emp.ruc || 'N/A'}</p>
                        
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase">Normas Activas</p>
                            <div className="flex flex-wrap gap-2">
                                {emp.normas && emp.normas.map(n => (
                                    <span key={n.id} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full border border-blue-100">
                                        {n.codigo}
                                    </span>
                                ))}
                                {(!emp.normas || emp.normas.length === 0) && (
                                    <span className="text-xs text-gray-400 italic">Sin normas asignadas</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800">
                                {editingEmpresa ? 'Editar Empresa' : 'Nueva Empresa'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Comercial / Razón Social</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={formData.nombre}
                                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">RUC</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={formData.ruc}
                                    onChange={e => setFormData({...formData, ruc: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Normas ISO Aplicables</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {normas.map(norma => (
                                        <div 
                                            key={norma.id}
                                            onClick={() => toggleNorma(norma.id)}
                                            className={`
                                                cursor-pointer p-3 rounded-lg border text-sm flex items-center gap-2 transition-all
                                                ${formData.normas.includes(norma.id) 
                                                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}
                                            `}
                                        >
                                            <div className={`
                                                w-4 h-4 rounded border flex items-center justify-center
                                                ${formData.normas.includes(norma.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}
                                            `}>
                                                {formData.normas.includes(norma.id) && <CheckCircle size={12} className="text-white" />}
                                            </div>
                                            <span className="font-medium">{norma.codigo}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
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

const AlertsModal = ({ isOpen, onClose, items }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Bell className="text-yellow-600" /> Alertas de Vencimiento
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    {items.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">No hay alertas pendientes para los próximos 7 días.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3">Empresa</th>
                                        <th className="px-4 py-3">Norma</th>
                                        <th className="px-4 py-3">Requisito</th>
                                        <th className="px-4 py-3">Estado</th>
                                        <th className="px-4 py-3">Vencimiento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, i) => (
                                        <tr key={i} className="border-b hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium">{item.empresa}</td>
                                            <td className="px-4 py-3">{item.norma}</td>
                                            <td className="px-4 py-3 max-w-xs truncate" title={item.requisito}>{item.requisito}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                    item.estado === 'Retrasado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {item.estado}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">
                                                {new Date(item.fecha_limite + 'T12:00:00').toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

const HistoryModal = ({ isOpen, onClose, history }) => {
    if (!isOpen) return null;

    const getStatusColor = (status) => {
        switch(status) {
            case 'Ejecutado': return 'bg-green-100 text-green-700 border-green-200';
            case 'En proceso': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Retrasado': return 'bg-red-100 text-red-700 border-red-200';
            case 'No aplica': return 'bg-gray-100 text-gray-500 border-gray-200';
            default: return 'bg-yellow-50 text-yellow-700 border-yellow-200'; // Programado/Pendiente
        }
    };

    const renderStateTransition = (detalle) => {
        const match = detalle.match(/Estado: (.+) -> (.+)/);
        if (match) {
            const prev = match[1];
            const next = match[2];
            return (
                <div className="mt-2">
                    <div className="flex items-center gap-3">
                        <div className={`flex-1 p-2 rounded border text-center text-xs font-bold ${getStatusColor(prev)}`}>
                            {prev}
                        </div>
                        <div className="text-gray-400">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                        </div>
                        <div className={`flex-1 p-2 rounded border text-center text-xs font-bold ${getStatusColor(next)}`}>
                            {next}
                        </div>
                    </div>
                </div>
            );
        }
        return <p className="text-sm text-gray-600">{detalle}</p>;
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Clock className="text-blue-600" /> Historial de Cambios
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    {history.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">No hay historial registrado</div>
                    ) : (
                        <div className="space-y-4">
                            {history.map((h, i) => (
                                <div key={i} className="flex gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100 hover:shadow-sm transition-shadow">
                                    <div className="mt-1">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shadow-inner">
                                            {h.usuario_nombre ? h.usuario_nombre.substring(0, 2).toUpperCase() : 'US'}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <span className="font-semibold text-gray-800">{h.usuario_nombre || 'Usuario'}</span>
                                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                                {formatDate(h.created_at)}
                                            </span>
                                        </div>
                                        <p className="text-xs font-bold text-blue-600 mt-1 uppercase tracking-wide">{h.accion.replace('_', ' ')}</p>
                                        
                                        {h.accion === 'CAMBIO_ESTADO' ? renderStateTransition(h.detalle) : (
                                            <p className="text-sm text-gray-600 mt-1 bg-white p-2 rounded border border-gray-100">
                                                {h.detalle}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

const SubitemsModal = ({ isOpen, onClose, item, empresaId, normaId, onUpload, refreshTrigger }) => {
    if (!isOpen || !item) return null;

    const [activeTab, setActiveTab] = useState('config'); // config | grid
    const [subitems, setSubitems] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());
    
    // Config State
    const [newSubitem, setNewSubitem] = useState({ descripcion: '', literal: '' });
    const [editingSubitem, setEditingSubitem] = useState(null);

    useEffect(() => {
        if (item) {
            fetchSubitems();
        }
    }, [item, year, activeTab, refreshTrigger]);

    const fetchSubitems = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=get_subitems&item_id=${item.id}&empresa_id=${empresaId}&anio=${year}`);
            setSubitems(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSaveSubitem = async (e) => {
        e.preventDefault();
        const data = editingSubitem ? editingSubitem : newSubitem;
        if (!data.descripcion.trim()) return;

        try {
            if (editingSubitem) {
                 await axios.post(`${API_URL}iso.php?action=update_subitem`, {
                    id: editingSubitem.id,
                    descripcion: data.descripcion,
                    literal: data.literal
                });
                toast.success('Subpunto actualizado');
                setEditingSubitem(null);
            } else {
                await axios.post(`${API_URL}iso.php?action=create_subitem`, {
                    item_id: item.id,
                    descripcion: data.descripcion,
                    literal: data.literal
                });
                toast.success('Subpunto creado');
                setNewSubitem({ descripcion: '', literal: '' });
            }
            fetchSubitems();
        } catch (error) {
            toast.error('Error al guardar subpunto');
        }
    };

    const handleDeleteSubitem = async (id) => {
        if(!confirm('¿Eliminar subpunto?')) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_subitem&id=${id}`);
            toast.success('Subpunto eliminado');
            fetchSubitems();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const handleGridUpdate = async (subitemId, field, value) => {
        // Optimistic update
        setSubitems(prev => prev.map(s => {
            if (s.id === subitemId) {
                return { ...s, [field]: value };
            }
            return s;
        }));

        // Find the item to get all its data for save
        const currentItem = subitems.find(s => s.id === subitemId);
        const updatedItem = { ...currentItem, [field]: value };

        try {
            // Prepare payload
            const payload = {
                subitem_id: subitemId,
                empresa_id: empresaId,
                anio: year,
                hallazgos: updatedItem.hallazgos,
                estado: updatedItem.estado_anual || 'Pendiente'
            };

            // Add P/E fields
            ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].forEach(m => {
                payload[`${m}_p`] = updatedItem[`${m}_p`];
                payload[`${m}_e`] = updatedItem[`${m}_e`];
            });

            await axios.post(`${API_URL}iso.php?action=save_subitem_evaluation`, payload);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar cambios');
            fetchSubitems(); // Revert
        }
    };

    const handleDeleteDoc = async (docId) => {
        if (!confirm('¿Eliminar documento?')) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_document&id=${docId}`);
            toast.success('Documento eliminado');
            fetchSubitems();
        } catch (error) {
            toast.error('Error al eliminar documento');
        }
    };

    const months = [
        {k: 'ene', l: 'ENE'}, {k: 'feb', l: 'FEB'}, {k: 'mar', l: 'MAR'}, 
        {k: 'abr', l: 'ABR'}, {k: 'may', l: 'MAY'}, {k: 'jun', l: 'JUN'},
        {k: 'jul', l: 'JUL'}, {k: 'ago', l: 'AGO'}, {k: 'sep', l: 'SEP'},
        {k: 'oct', l: 'OCT'}, {k: 'nov', l: 'NOV'}, {k: 'dic', l: 'DIC'}
    ];

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-[95vw] shadow-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">Gestión de Subpuntos</h3>
                        <p className="text-sm text-gray-600 mt-1 max-w-3xl truncate" title={item.requisito}>{item.requisito}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex border-b border-gray-200">
                    <button 
                        className={`flex-1 py-3 font-medium text-sm ${activeTab === 'config' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => setActiveTab('config')}
                    >
                        Configurar Subpuntos
                    </button>
                    <button 
                        className={`flex-1 py-3 font-medium text-sm ${activeTab === 'grid' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => setActiveTab('grid')}
                    >
                        Cronograma Anual (P/E)
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 bg-gray-50">
                    {activeTab === 'config' && (
                        <div className="space-y-6 max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-sm">
                            <form onSubmit={handleSaveSubitem} className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-500">Literal (4.1.1)</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        value={editingSubitem ? editingSubitem.literal : newSubitem.literal}
                                        onChange={e => editingSubitem ? setEditingSubitem({...editingSubitem, literal: e.target.value}) : setNewSubitem({...newSubitem, literal: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-8">
                                    <label className="text-xs font-bold text-gray-500">Descripción del Subpunto</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Descripción..."
                                        value={editingSubitem ? editingSubitem.descripcion : newSubitem.descripcion}
                                        onChange={e => editingSubitem ? setEditingSubitem({...editingSubitem, descripcion: e.target.value}) : setNewSubitem({...newSubitem, descripcion: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2">
                                    {editingSubitem ? (
                                        <div className="flex gap-1">
                                            <button type="submit" className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm flex-1">OK</button>
                                            <button type="button" onClick={() => setEditingSubitem(null)} className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 text-sm">X</button>
                                        </div>
                                    ) : (
                                        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 w-full flex items-center justify-center gap-1">
                                            <Plus size={18}/> Agregar
                                        </button>
                                    )}
                                </div>
                            </form>

                            <div className="space-y-2">
                                {subitems.map(sub => (
                                    <div key={sub.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-white transition-colors">
                                        <div className="flex gap-3 items-center">
                                            <span className="font-mono text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">{sub.literal || '-'}</span>
                                            <span className="text-gray-700 text-sm">{sub.descripcion}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setEditingSubitem(sub)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16}/></button>
                                            <button onClick={() => handleDeleteSubitem(sub.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                ))}
                                {subitems.length === 0 && <p className="text-center text-gray-400 py-4">No hay subpuntos configurados</p>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'grid' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200">
                                <h4 className="font-bold text-gray-700">Programación y Ejecución Anual</h4>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-bold text-gray-500">Año:</label>
                                    <input 
                                        type="number" 
                                        value={year}
                                        onChange={e => setYear(parseInt(e.target.value))}
                                        className="w-20 p-1 border rounded text-center font-bold text-blue-600"
                                    />
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100 text-gray-600 uppercase font-bold tracking-wider text-[10px]">
                                                <th className="p-2 border-b border-r w-64 sticky left-0 bg-gray-100 z-10">Subpunto</th>
                                                <th className="p-2 border-b border-r w-48">Hallazgos</th>
                                                <th className="p-2 border-b border-r w-40">Evidencias</th>
                                                {months.map(m => (
                                                    <th key={m.k} className="p-1 border-b border-r text-center w-12" colSpan={2}>
                                                        {m.l}
                                                    </th>
                                                ))}
                                                <th className="p-2 border-b w-32 text-center">Estado</th>
                                            </tr>
                                            <tr className="bg-gray-50 text-gray-500 text-[9px]">
                                                <th className="border-b border-r sticky left-0 bg-gray-50 z-10"></th>
                                                <th className="border-b border-r"></th>
                                                <th className="border-b border-r"></th>
                                                {months.map(m => (
                                                    <React.Fragment key={m.k}>
                                                        <th className="border-b border-r text-center w-6 bg-blue-50 text-blue-600">P</th>
                                                        <th className="border-b border-r text-center w-6 bg-green-50 text-green-600">E</th>
                                                    </React.Fragment>
                                                ))}
                                                <th className="border-b"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {subitems.map(sub => (
                                                <tr key={sub.id} className="hover:bg-gray-50">
                                                    <td className="p-2 border-r align-middle sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                        <div className="flex flex-col gap-1">
                                                            {sub.literal && <span className="font-bold text-blue-600">{sub.literal}</span>}
                                                            <span className="text-gray-700 leading-tight">{sub.descripcion}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-1 border-r align-top">
                                                        <textarea 
                                                            className="w-full h-full min-h-[40px] p-1 text-[11px] border border-transparent hover:border-gray-300 focus:border-blue-400 rounded outline-none resize-none bg-transparent focus:bg-white transition-all"
                                                            placeholder="Ingrese hallazgos..."
                                                            value={sub.hallazgos || ''}
                                                            onChange={e => handleGridUpdate(sub.id, 'hallazgos', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r align-top">
                                                        <div className="flex flex-col gap-1">
                                                            {sub.documentos && sub.documentos.map(doc => (
                                                                <div key={doc.id} className="flex items-center gap-1 bg-white p-1 rounded border border-gray-200 hover:bg-blue-50 text-[10px] text-blue-600 truncate block group">
                                                                    <a 
                                                                        href={`${API_URL}${doc.ruta_archivo}`} 
                                                                        target="_blank" 
                                                                        rel="noreferrer"
                                                                        className="flex items-center gap-1 truncate flex-1"
                                                                        title={doc.nombre_archivo}
                                                                    >
                                                                        <FileText size={10} className="shrink-0"/>
                                                                        <span className="truncate">{doc.nombre_archivo}</span>
                                                                    </a>
                                                                    <button 
                                                                        onClick={() => handleDeleteDoc(doc.id)}
                                                                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        title="Eliminar documento"
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <button 
                                                                onClick={() => onUpload(item, sub.id)}
                                                                className="text-[10px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-1 rounded border border-dashed border-gray-300 hover:border-blue-300 w-full text-center transition-colors flex items-center justify-center gap-1"
                                                            >
                                                                <Upload size={10} /> Adjuntar
                                                            </button>
                                                        </div>
                                                    </td>
                                                    {months.map(m => (
                                                        <React.Fragment key={m.k}>
                                                            <td className="border-r text-center align-middle bg-blue-50/30 p-0">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={!!parseInt(sub[`${m.k}_p`])}
                                                                    onChange={e => handleGridUpdate(sub.id, `${m.k}_p`, e.target.checked ? 1 : 0)}
                                                                    className="w-3 h-3 cursor-pointer accent-blue-600"
                                                                />
                                                            </td>
                                                            <td className="border-r text-center align-middle bg-green-50/30 p-0">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={!!parseInt(sub[`${m.k}_e`])}
                                                                    onChange={e => handleGridUpdate(sub.id, `${m.k}_e`, e.target.checked ? 1 : 0)}
                                                                    className="w-3 h-3 cursor-pointer accent-green-600"
                                                                />
                                                            </td>
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="p-1 align-middle">
                                                        <select 
                                                            className={`w-full p-1 text-[10px] font-bold rounded border-none outline-none cursor-pointer ${
                                                                sub.estado_anual === 'Ejecutado' ? 'bg-green-100 text-green-700' :
                                                                sub.estado_anual === 'En Proceso' ? 'bg-blue-100 text-blue-700' :
                                                                sub.estado_anual === 'Retrasado' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-600'
                                                            }`}
                                                            value={sub.estado_anual || 'Pendiente'}
                                                            onChange={e => handleGridUpdate(sub.id, 'estado_anual', e.target.value)}
                                                        >
                                                            <option value="Pendiente">Pendiente</option>
                                                            <option value="En Proceso">En Proceso</option>
                                                            <option value="Ejecutado">Ejecutado</option>
                                                            <option value="Retrasado">Retrasado</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))}
                                            {subitems.length === 0 && (
                                                <tr>
                                                    <td colSpan={28} className="text-center py-8 text-gray-400">
                                                        No hay subpuntos. Configure primero en la pestaña "Configurar Subpuntos".
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-4 text-xs text-gray-500">
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-100 border border-blue-300"></div> P = Programado</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-100 border border-green-300"></div> E = Ejecutado</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TrackingView = ({ empresas }) => {
    const [selectedEmpresa, setSelectedEmpresa] = useState('');
    const [selectedNorma, setSelectedNorma] = useState('');
    const [normas, setNormas] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState({});
    
    // Report Modal State
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [dailyReportModalOpen, setDailyReportModalOpen] = useState(false);
    const [dailyReportDate, setDailyReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState({
        introduccion: '',
        objetivos: '',
        observaciones: '',
        recomendaciones: '',
        conclusiones: '',
        codigo_reporte: '',
        responsable: ''
    });

    // Upload Modal State
    const [uploadModal, setUploadModal] = useState({ open: false, item: null, subitem_id: null });
    const [uploadFiles, setUploadFiles] = useState([]);

    // New Item Modal State
    const [newItemModal, setNewItemModal] = useState(false);
    const [newItemData, setNewItemData] = useState({
        categoria: '',
        numeral: '',
        requisito: '',
        descripcion_requisito: ''
    });

    // History Modal State
    const [historyModal, setHistoryModal] = useState({ open: false, history: [] });

    // Alerts Modal State
    const [alertsModal, setAlertsModal] = useState({ open: false, items: [] });

    // Subitems Modal State
    const [subitemsModal, setSubitemsModal] = useState({ open: false, item: null });
    const [subitemsRefreshTrigger, setSubitemsRefreshTrigger] = useState(0);
    
    // Upload Modal State
    const [editCategoryModal, setEditCategoryModal] = useState({ open: false, oldCategory: '', newCategory: '' });

    // UI/UX States
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [savingSubitems, setSavingSubitems] = useState({});
    const trackingYear = new Date().getFullYear();

    const handleViewHistory = async (item) => {
        if (!item.tracking_id) {
            setHistoryModal({ open: true, history: [] });
            return;
        }
        try {
            const res = await axios.get(`${API_URL}iso.php?action=get_item_history&tracking_id=${item.tracking_id}`);
            setHistoryModal({ open: true, history: res.data });
        } catch (error) {
            toast.error('Error al cargar historial');
        }
    };

    useEffect(() => {
        if (selectedEmpresa) {
            const emp = empresas.find(e => e.id == selectedEmpresa);
            if (emp) setNormas(emp.normas || []);
        } else {
            setNormas([]);
            setItems([]);
        }
    }, [selectedEmpresa, empresas]);

    useEffect(() => {
        if (selectedEmpresa && selectedNorma) {
            fetchItems();
        }
    }, [selectedEmpresa, selectedNorma]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}iso.php?action=get_tracking&empresa_id=${selectedEmpresa}&norma_id=${selectedNorma}`);
            setItems(res.data);
            // Auto expand all groups initially
            const groups = {};
            res.data.forEach(item => groups[item.categoria] = true);
            setExpandedGroups(groups);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar checklist');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckAlerts = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=send_alerts`);
            if (res.data.success) {
                toast.success(res.data.message);
            } else {
                toast(res.data.message, { icon: 'ℹ️' });
            }
            
            // Always show modal if we get a response, even if empty or error (if items are present)
            if (res.data.items !== undefined) {
                setAlertsModal({ open: true, items: res.data.items });
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al verificar alertas');
        }
    };

    const handleDownloadZip = () => {
        if (!selectedEmpresa || !selectedNorma) return;
        window.open(`${API_URL}iso_zip.php?empresa_id=${selectedEmpresa}&norma_id=${selectedNorma}`, '_blank');
    };

    const handleGenerateReport = (e) => {
        e.preventDefault();
        // Use a hidden form to submit via POST to PDF generator to handle large text fields
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${API_URL}iso_pdf.php?type=tracking&empresa_id=${selectedEmpresa}&norma_id=${selectedNorma}`;
        form.target = '_blank';

        Object.entries(reportData).forEach(([key, value]) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value;
            form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
        setReportModalOpen(false);
    };

    const handleTrackingUpdate = async (item, field, value) => {
        try {
            const payload = {
                empresa_id: selectedEmpresa,
                norma_id: selectedNorma,
                item_id: item.id,
                estado: item.estado || 'Programado',
                fecha_programada: item.fecha_programada,
                fecha_limite: item.fecha_limite,
                fecha_ejecucion: item.fecha_ejecucion,
                observaciones_internas: item.observaciones_internas
            };
            
            payload[field] = value;

            if (field === 'estado' && value === 'Ejecutado' && !payload.fecha_ejecucion) {
                payload.fecha_ejecucion = new Date().toISOString().split('T')[0];
            }

            await axios.post(`${API_URL}iso.php?action=update_tracking_item`, payload);
            toast.success('Actualizado correctamente');
            fetchItems();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || 'Error al actualizar');
        }
    };
    
    const updateSubitemLocal = (itemId, subitemId, patch) => {
        setItems(prev => prev.map(it => {
            if (it.id !== itemId) return it;
            return {
                ...it,
                subitems: (it.subitems || []).map(s => s.id === subitemId ? { ...s, ...patch } : s)
            };
        }));
    };
    
    const saveSubitemEvaluation = async (sub) => {
        if (!sub?.id) return;
        const subitemId = sub.id;
        
        setSavingSubitems(prev => ({ ...prev, [subitemId]: true }));
        try {
            const payload = {
                subitem_id: subitemId,
                empresa_id: selectedEmpresa,
                anio: trackingYear,
                hallazgos: sub.hallazgos || '',
                estado: sub.estado_anual || 'Pendiente'
            };
            
            ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].forEach(m => {
                payload[`${m}_p`] = parseInt(sub[`${m}_p`]) ? 1 : 0;
                payload[`${m}_e`] = parseInt(sub[`${m}_e`]) ? 1 : 0;
            });
            
            await axios.post(`${API_URL}iso.php?action=save_subitem_evaluation`, payload);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar subpunto');
            fetchItems();
        } finally {
            setSavingSubitems(prev => ({ ...prev, [subitemId]: false }));
        }
    };

    const handleCreateItem = async (e) => {
        e.preventDefault();
        try {
            const action = newItemData.id ? 'update_item' : 'create_item';
            
            // Handle new category creation
            let finalCategory = newItemData.categoria;
            if (newItemData.categoria === 'new') {
                if (!newItemData.newCategoryName?.trim()) {
                    toast.error('Debe ingresar un nombre para la nueva sección');
                    return;
                }
                finalCategory = newItemData.newCategoryName.trim();
            }

            await axios.post(`${API_URL}iso.php?action=${action}`, {
                norma_id: selectedNorma,
                ...newItemData,
                categoria: finalCategory
            });
            toast.success(newItemData.id ? 'Punto actualizado' : 'Punto de evaluación creado');
            setNewItemModal(false);
            setNewItemData({ id: null, categoria: '', numeral: '', requisito: '', descripcion_requisito: '' });
            fetchItems();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al guardar punto');
        }
    };

    const handleEditItem = (item) => {
        setNewItemData({
            id: item.id,
            categoria: item.categoria,
            numeral: item.numeral,
            requisito: item.requisito,
            descripcion_requisito: item.descripcion_requisito || '',
            no_requiere_subitems: item.no_requiere_subitems == 1
        });
        setNewItemModal(true);
    };

    const handleDeleteItem = async (id) => {
        if (!confirm('¿Está seguro de eliminar este punto de evaluación? Esta acción no se puede deshacer.')) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_item&id=${id}`);
            toast.success('Punto eliminado correctamente');
            fetchItems();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al eliminar punto');
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (uploadFiles.length === 0) return;
        
        const formData = new FormData();
        uploadFiles.forEach(file => {
            formData.append('files[]', file);
        });
        formData.append('empresa_id', selectedEmpresa);
        formData.append('norma_id', selectedNorma);
        formData.append('item_id', uploadModal.item.id);
        if (uploadModal.subitem_id) {
            formData.append('subitem_id', uploadModal.subitem_id);
        }

        try {
            const res = await axios.post(`${API_URL}iso.php?action=upload_document`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            if (res.data.success) {
                toast.success(`Se subieron ${res.data.count} documentos correctamente`);
                if (res.data.errors && res.data.errors.length > 0) {
                    res.data.errors.forEach(err => toast.warning(err));
                }
            }

            setUploadModal({ open: false, item: null, subitem_id: null });
            setUploadFiles([]);
            fetchItems();
            if (uploadModal.subitem_id) {
                setSubitemsRefreshTrigger(prev => prev + 1);
            }
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || 'Error al subir documentos');
        }
    };

    const handleDeleteDoc = async (docId) => {
        if (!confirm('¿Eliminar documento?')) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_document&id=${docId}`);
            toast.success('Documento eliminado');
            fetchItems();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const toggleGroup = (group) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const handleRenameCategory = async (e) => {
        e.preventDefault();
        const { oldCategory, newCategory } = editCategoryModal;
        
        if (!newCategory.trim() || newCategory === oldCategory) {
            setEditCategoryModal({ open: false, oldCategory: '', newCategory: '' });
            return;
        }

        try {
            await axios.post(`${API_URL}iso.php?action=rename_category`, {
                norma_id: selectedNorma,
                old_category: oldCategory,
                new_category: newCategory
            });
            toast.success('Categoría renombrada correctamente');
            setEditCategoryModal({ open: false, oldCategory: '', newCategory: '' });
            fetchItems();
        } catch (error) {
            console.error(error);
            toast.error('Error al renombrar categoría');
        }
    };

    // Group items by category and filter
    const filteredItems = items.filter(item => {
        const matchesSearch = 
            (item.requisito && item.requisito.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.numeral && item.numeral.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.descripcion_requisito && item.descripcion_requisito.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesStatus = statusFilter === 'all' || 
            (statusFilter === 'Programado' && (!item.estado || item.estado === 'Programado')) ||
            item.estado === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const groupedItems = filteredItems.reduce((acc, item) => {
        const cat = item.categoria || 'General';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});

    const getStatusColor = (status) => {
        switch(status) {
            case 'Ejecutado': return 'bg-green-100 text-green-700 border-green-200';
            case 'En proceso': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Retrasado': return 'bg-red-100 text-red-700 border-red-200';
            case 'No aplica': return 'bg-gray-100 text-gray-500 border-gray-200';
            default: return 'bg-yellow-50 text-yellow-700 border-yellow-200'; // Programado
        }
    };

    // Filter buttons configuration
    const filterOptions = [
        { label: 'Todos', value: 'all', color: 'bg-gray-100 text-gray-700' },
        { label: 'Programado', value: 'Programado', color: 'bg-yellow-50 text-yellow-700' },
        { label: 'En proceso', value: 'En proceso', color: 'bg-blue-100 text-blue-700' },
        { label: 'Ejecutado', value: 'Ejecutado', color: 'bg-green-100 text-green-700' },
        { label: 'Retrasado', value: 'Retrasado', color: 'bg-red-100 text-red-700' },
        { label: 'No aplica', value: 'No aplica', color: 'bg-gray-100 text-gray-500' }
    ];

    return (
        <div className="p-6">
            {/* Dashboard Certificados por Vencer */}
            <CertificadosDashboard />
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-4 items-end">
                <div className="w-full md:w-64">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                    <select 
                        className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedEmpresa}
                        onChange={e => {
                            setSelectedEmpresa(e.target.value);
                            setSelectedNorma('');
                        }}
                    >
                        <option value="">Seleccione Empresa...</option>
                        {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                </div>
                
                <div className="w-full md:w-64">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Norma ISO</label>
                    <select 
                        className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedNorma}
                        onChange={e => setSelectedNorma(e.target.value)}
                        disabled={!selectedEmpresa}
                    >
                        <option value="">Seleccione Norma...</option>
                        {normas.map(n => <option key={n.id} value={n.id}>{n.codigo} - {n.nombre}</option>)}
                    </select>
                </div>

                {selectedNorma && (
                    <div className="flex gap-2 ml-auto flex-wrap">
                        <button 
                            onClick={handleCheckAlerts}
                            className="bg-yellow-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-yellow-700 shadow-sm transition-all hover:scale-105"
                            title="Verificar y enviar alertas de vencimiento"
                        >
                            <Bell size={18} /> <span className="hidden md:inline">Alertas</span>
                        </button>
                        <button 
                            onClick={handleDownloadZip}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all hover:scale-105"
                            title="Descargar toda la documentación en ZIP"
                        >
                            <Download size={18} /> <span className="hidden md:inline">ZIP</span>
                        </button>
                        <button 
                            onClick={() => setReportModalOpen(true)}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-700 shadow-sm transition-all hover:scale-105"
                            title="Generar Reporte Mensual PDF"
                        >
                            <FileText size={18} /> <span className="hidden md:inline">Mensual</span>
                        </button>
                        <button 
                            onClick={() => setDailyReportModalOpen(true)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 shadow-sm transition-all hover:scale-105"
                            title="Generar Reporte Diario de Actividades"
                        >
                            <Calendar size={18} /> <span className="hidden md:inline">Diario</span>
                        </button>
                        <button 
                            onClick={() => {
                                setNewItemData({ id: null, categoria: '', numeral: '', requisito: '', descripcion_requisito: '', no_requiere_subitems: false });
                                setNewItemModal(true);
                            }}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 shadow-sm transition-all hover:scale-105"
                        >
                            <Plus size={18} /> <span className="hidden md:inline">Agregar Punto</span>
                        </button>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
            ) : !selectedNorma ? (
                <div className="text-center py-12 text-gray-400">Seleccione una empresa y norma para ver el checklist</div>
            ) : (
                <div className="space-y-6">
                    {/* Charts Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80 flex flex-col">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center shrink-0">Distribución de Estados</h3>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Ejecutado', value: items.filter(i => i.estado === 'Ejecutado').length, fill: '#10B981' },
                                                { name: 'En proceso', value: items.filter(i => i.estado === 'En proceso').length, fill: '#3B82F6' },
                                                { name: 'Retrasado', value: items.filter(i => i.estado === 'Retrasado').length, fill: '#EF4444' },
                                                { name: 'No aplica', value: items.filter(i => i.estado === 'No aplica').length, fill: '#9CA3AF' },
                                                { name: 'Programado', value: items.filter(i => !i.estado || i.estado === 'Programado').length, fill: '#F59E0B' }
                                            ].filter(d => d.value > 0)}
                                            cx="50%" cy="50%" outerRadius={80} dataKey="value" label
                                        >
                                            <Cell fill="#10B981" />
                                            <Cell fill="#3B82F6" />
                                            <Cell fill="#EF4444" />
                                            <Cell fill="#9CA3AF" />
                                            <Cell fill="#F59E0B" />
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80 flex flex-col">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center shrink-0">Avance por Cantidad</h3>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={[
                                            { name: 'Ejecutado', cantidad: items.filter(i => i.estado === 'Ejecutado').length, fill: '#10B981' },
                                            { name: 'En proceso', cantidad: items.filter(i => i.estado === 'En proceso').length, fill: '#3B82F6' },
                                            { name: 'Retrasado', cantidad: items.filter(i => i.estado === 'Retrasado').length, fill: '#EF4444' },
                                            { name: 'Programado', cantidad: items.filter(i => !i.estado || i.estado === 'Programado').length, fill: '#F59E0B' }
                                        ]}
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                                            <Cell fill="#10B981" />
                                            <Cell fill="#3B82F6" />
                                            <Cell fill="#EF4444" />
                                            <Cell fill="#F59E0B" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Filters and Search Bar */}
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Buscar por numeral, requisito o descripción..." 
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                            {filterOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setStatusFilter(opt.value)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                                        statusFilter === opt.value 
                                            ? 'ring-2 ring-offset-1 ring-blue-500 border-transparent shadow-sm scale-105' 
                                            : 'border-transparent hover:bg-gray-100'
                                    } ${opt.color}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {Object.entries(groupedItems).map(([category, groupItems]) => {
                        // Calculate progress
                        const total = groupItems.length;
                        const executed = groupItems.filter(i => i.estado === 'Ejecutado').length;
                        const progress = total > 0 ? Math.round((executed / total) * 100) : 0;
                        
                        return (
                        <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="w-full px-6 py-4 bg-gray-50 flex justify-between items-center hover:bg-gray-100 transition-colors text-left border-b border-gray-100">
                                <div 
                                    className="flex items-center gap-4 flex-1 cursor-pointer"
                                    onClick={() => toggleGroup(category)}
                                >
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                            {category}
                                            <span className="text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{total} puntos</span>
                                        </h3>
                                        <div className="w-full max-w-xs bg-gray-200 rounded-full h-1.5 mt-2">
                                            <div 
                                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                                                style={{ width: `${progress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-blue-600 min-w-[3rem] text-right">{progress}%</div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditCategoryModal({ 
                                                open: true, 
                                                oldCategory: category, 
                                                newCategory: category 
                                            });
                                        }}
                                        className="p-2 text-gray-400 hover:text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                                        title="Renombrar Sección"
                                    >
                                        <Edit size={18} />
                                    </button>
                                    <button 
                                        onClick={() => toggleGroup(category)}
                                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                                    >
                                        {expandedGroups[category] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </button>
                                </div>
                            </div>
                            
                            {expandedGroups[category] && (
                                <div className="divide-y divide-gray-100">
                                    {groupItems.map(item => (
                                        <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors group">
                                            <div className="flex flex-col lg:flex-row gap-6">
                                                {/* Left Status Indicator */}
                                                <div className={`hidden lg:block w-1 self-stretch rounded-full ${
                                                    item.estado === 'Ejecutado' ? 'bg-green-500' :
                                                    item.estado === 'En proceso' ? 'bg-blue-500' :
                                                    item.estado === 'Retrasado' ? 'bg-red-500' :
                                                    item.estado === 'No aplica' ? 'bg-gray-400' : 'bg-yellow-500'
                                                }`}></div>

                                                <div className="flex-1 min-w-0">
                                                    {/* Header: Numeral + Title + Status (Mobile) */}
                                                    <div className="flex items-start justify-between gap-4 mb-3">
                                                        <div className="flex items-start gap-3">
                                                            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-md border border-gray-200 shrink-0 mt-0.5">
                                                                {item.numeral || '#'}
                                                            </span>
                                                            <div>
                                                                <h4 className="font-bold text-gray-800 text-base leading-snug whitespace-pre-wrap">{item.requisito}</h4>
                                                                {item.descripcion_requisito && (
                                                                    <p className="text-sm text-gray-500 mt-1 line-clamp-2 group-hover:line-clamp-none transition-all">
                                                                        {item.descripcion_requisito}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Documents & Subitems Chips */}
                                                    <div className="flex flex-wrap gap-2 mb-4">
                                                        {item.documentos && item.documentos.map(doc => {
                                                            const subitem = item.subitems?.find(s => s.id == doc.subitem_id);
                                                            return (
                                                                <div 
                                                                    key={doc.id} 
                                                                    className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
                                                                >
                                                                    {subitem && (
                                                                        <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 border border-purple-200" title={subitem.descripcion}>
                                                                            {subitem.literal || 'Sub'}
                                                                        </span>
                                                                    )}
                                                                    <div className="bg-blue-50 p-1 rounded text-blue-600">
                                                                        <File size={12} />
                                                                    </div>
                                                                    <a href={`${API_URL}${doc.ruta_archivo}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 truncate max-w-[150px]">
                                                                        {doc.nombre_archivo}
                                                                    </a>
                                                                    <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-400 hover:text-red-500 ml-1"><X size={12}/></button>
                                                                </div>
                                                            );
                                                        })}
                                                        
                                                        {(!item.documentos || item.documentos.length === 0) && (
                                                            <button 
                                                                onClick={() => setUploadModal({ open: true, item, subitem_id: null })}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all"
                                                            >
                                                                <Upload size={14} /> Adjuntar Evidencia
                                                            </button>
                                                        )}
                                                        
                                                        {item.documentos && item.documentos.length > 0 && (
                                                            <button 
                                                                onClick={() => setUploadModal({ open: true, item, subitem_id: null })}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all"
                                                            >
                                                                <Plus size={14} /> Agregar otro
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Action Toolbar */}
                                                    <div className="flex items-center gap-1 pt-2 border-t border-gray-50 lg:border-none lg:pt-0">
                                                        {!item.no_requiere_subitems && (
                                                            <button 
                                                                onClick={() => setSubitemsModal({ open: true, item })}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                <ClipboardList size={16} /> Subpuntos {item.subitems?.length > 0 && `(${item.subitems.length})`}
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => handleViewHistory(item)}
                                                            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            <Clock size={16} /> Historial
                                                        </button>
                                                        <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                                        <button 
                                                            onClick={() => handleEditItem(item)}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteItem(item.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>

                                                    {/* Subitems Preview Table */}
                                                    {item.subitems && item.subitems.length > 0 && (
                                                        <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                                            <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                                                                <h5 className="text-xs font-bold text-gray-600 uppercase">Detalle de Subpuntos</h5>
                                                                <span className="text-[10px] font-medium text-gray-400">Progreso Anual</span>
                                                            </div>
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="bg-white text-gray-500 font-medium">
                                                                        <tr>
                                                                            <th className="p-3 w-1/3">Descripción</th>
                                                                            <th className="p-3 w-40">Evidencias</th>
                                                                            {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map(m => (
                                                                                <th key={m} className="p-1 text-center w-8 text-[10px] uppercase tracking-wider">{m}</th>
                                                                            ))}
                                                                            <th className="p-3 text-right">Estado</th>
                                                                            <th className="p-3 w-1/4">Observaciones</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-100 bg-white">
                                                                        {item.subitems.map(sub => (
                                                                            <tr key={sub.id} className="hover:bg-gray-50">
                                                                                <td className="p-3">
                                                                                    <div className="flex gap-2 items-start">
                                                                                        {sub.literal && <span className="font-bold text-blue-600 shrink-0 bg-blue-50 px-1.5 rounded border border-blue-100">{sub.literal}</span>}
                                                                                        <span className="text-gray-700 leading-tight">{sub.descripcion}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-2 align-top">
                                                                                    <div className="flex flex-col gap-1">
                                                                                        {item.documentos?.filter(d => d.subitem_id == sub.id).map(doc => (
                                                                                            <div key={doc.id} className="flex items-center gap-1 bg-white p-1 rounded border border-gray-200 hover:bg-blue-50 text-[10px] text-blue-600 truncate block group">
                                                                                                <a href={`${API_URL}${doc.ruta_archivo}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate flex-1" title={doc.nombre_archivo}>
                                                                                                    <FileText size={10} className="shrink-0"/>
                                                                                                    <span className="truncate">{doc.nombre_archivo}</span>
                                                                                                </a>
                                                                                                <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Eliminar documento">
                                                                                                    <X size={10} />
                                                                                                </button>
                                                                                            </div>
                                                                                        ))}
                                                                                        <button 
                                                                                            onClick={() => setUploadModal({ open: true, item, subitem_id: sub.id })}
                                                                                            className="text-[10px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-1 rounded border border-dashed border-gray-300 hover:border-blue-300 w-full text-center transition-colors flex items-center justify-center gap-1"
                                                                                        >
                                                                                            <Upload size={10} /> Adjuntar Doc.
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                                {['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].map(m => {
                                                                                    const p = !!parseInt(sub[`${m}_p`]);
                                                                                    const e = !!parseInt(sub[`${m}_e`]);
                                                                                    return (
                                                                                        <td key={m} className="p-1 text-center align-middle">
                                                                                            <div className="flex justify-center flex-col items-center gap-0.5 h-full">
                                                                                                {p && <div className="w-1.5 h-1.5 rounded-full bg-blue-300" title="Programado"></div>}
                                                                                                {e && <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm" title="Ejecutado"></div>}
                                                                                            </div>
                                                                                        </td>
                                                                                    );
                                                                                })}
                                                                                <td className="p-3 text-right">
                                                                                    <select
                                                                                        className={`w-full p-1.5 text-[10px] font-bold rounded border outline-none cursor-pointer ${
                                                                                            sub.estado_anual === 'Ejecutado' ? 'bg-green-50 text-green-700 border-green-100' :
                                                                                            sub.estado_anual === 'En Proceso' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                                                            sub.estado_anual === 'Retrasado' ? 'bg-red-50 text-red-700 border-red-100' :
                                                                                            'bg-gray-50 text-gray-600 border-gray-200'
                                                                                        }`}
                                                                                        value={sub.estado_anual || 'Pendiente'}
                                                                                        disabled={!!savingSubitems[sub.id]}
                                                                                        onChange={async (e) => {
                                                                                            const next = { ...sub, estado_anual: e.target.value };
                                                                                            updateSubitemLocal(item.id, sub.id, { estado_anual: e.target.value });
                                                                                            await saveSubitemEvaluation(next);
                                                                                        }}
                                                                                    >
                                                                                        <option value="Pendiente">Pendiente</option>
                                                                                        <option value="En Proceso">En Proceso</option>
                                                                                        <option value="Ejecutado">Ejecutado</option>
                                                                                        <option value="Retrasado">Retrasado</option>
                                                                                    </select>
                                                                                </td>
                                                                                <td className="p-2 align-top">
                                                                                    <textarea
                                                                                        className="w-full min-h-[44px] p-2 text-[11px] border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                                                                        placeholder="Observaciones del subpunto..."
                                                                                        value={sub.hallazgos || ''}
                                                                                        disabled={!!savingSubitems[sub.id]}
                                                                                        onChange={(e) => updateSubitemLocal(item.id, sub.id, { hallazgos: e.target.value })}
                                                                                        onBlur={(e) => saveSubitemEvaluation({ ...sub, hallazgos: e.target.value })}
                                                                                    />
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Right Sidebar: Status & Dates */}
                                                <div className="w-full lg:w-72 bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-4 self-start">
                                                    <div>
                                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5 block">Estado Actual</label>
                                                        <select 
                                                            className={`w-full p-2.5 rounded-lg border text-sm font-bold outline-none cursor-pointer shadow-sm transition-all focus:ring-2 focus:ring-opacity-50 ${
                                                                item.estado === 'Ejecutado' ? 'bg-green-100 text-green-800 border-green-200 focus:ring-green-500' :
                                                                item.estado === 'En proceso' ? 'bg-blue-100 text-blue-800 border-blue-200 focus:ring-blue-500' :
                                                                item.estado === 'Retrasado' ? 'bg-red-100 text-red-800 border-red-200 focus:ring-red-500' :
                                                                item.estado === 'No aplica' ? 'bg-gray-100 text-gray-600 border-gray-200 focus:ring-gray-500' :
                                                                'bg-white text-yellow-700 border-yellow-200 focus:ring-yellow-500'
                                                            }`}
                                                            value={item.estado || 'Programado'}
                                                            onChange={(e) => handleTrackingUpdate(item, 'estado', e.target.value)}
                                                        >
                                                            <option value="Programado">Programado</option>
                                                            <option value="En proceso">En proceso</option>
                                                            <option value="Ejecutado">Ejecutado</option>
                                                            <option value="Retrasado">Retrasado</option>
                                                            <option value="No aplica">No aplica</option>
                                                        </select>
                                                    </div>
                                                    
                                                    <div className="space-y-3">
                                                        <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Clock size={14} className="text-blue-500" />
                                                                <span className="text-xs font-medium text-gray-500">Programado</span>
                                                            </div>
                                                            <input 
                                                                type="date" 
                                                                className="w-full text-sm font-semibold text-gray-800 border-none p-0 focus:ring-0 cursor-pointer hover:bg-gray-50 rounded px-1" 
                                                                value={item.fecha_programada || ''} 
                                                                onChange={(e) => handleTrackingUpdate(item, 'fecha_programada', e.target.value)}
                                                            />
                                                        </div>
                                                        
                                                        <div className={`bg-white p-2.5 rounded-lg border shadow-sm ${
                                                            item.estado === 'Retrasado' ? 'border-red-200 bg-red-50' : 'border-gray-200'
                                                        }`}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <AlertTriangle size={14} className={item.estado === 'Retrasado' ? 'text-red-500' : 'text-orange-500'} />
                                                                <span className="text-xs font-medium text-gray-500">Fecha Límite</span>
                                                            </div>
                                                            <input 
                                                                type="date" 
                                                                className={`w-full text-sm font-semibold border-none p-0 focus:ring-0 cursor-pointer hover:bg-gray-50 rounded px-1 ${item.estado === 'Retrasado' ? 'text-red-700 bg-red-50' : 'text-gray-800'}`} 
                                                                value={item.fecha_limite || ''} 
                                                                onChange={(e) => handleTrackingUpdate(item, 'fecha_limite', e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );})}
                </div>
            )}

            <SubitemsModal 
                isOpen={subitemsModal.open} 
                onClose={() => setSubitemsModal({ open: false, item: null })}
                item={subitemsModal.item}
                empresaId={selectedEmpresa}
                normaId={selectedNorma}
                onUpload={(item, subitemId) => setUploadModal({ open: true, item, subitem_id: subitemId })}
                refreshTrigger={subitemsRefreshTrigger}
            />

            {reportModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-bold text-gray-800">Generar Reporte Mensual</h3>
                            <button onClick={() => setReportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleGenerateReport} className="p-6 space-y-4">
                            <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-4">
                                Complete la información complementaria para el reporte PDF. Los datos estadísticos y de avance se calcularán automáticamente.
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Código de Reporte</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={reportData.codigo_reporte}
                                        onChange={e => setReportData({...reportData, codigo_reporte: e.target.value})}
                                        placeholder="Ej. REP-ISO-2024-01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={reportData.responsable}
                                        onChange={e => setReportData({...reportData, responsable: e.target.value})}
                                        placeholder="Nombre del responsable"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Introducción</label>
                                <textarea 
                                    rows="3"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    value={reportData.introduccion}
                                    onChange={e => setReportData({...reportData, introduccion: e.target.value})}
                                    placeholder="Breve introducción al reporte..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Objetivos</label>
                                <textarea 
                                    rows="3"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    value={reportData.objetivos}
                                    onChange={e => setReportData({...reportData, objetivos: e.target.value})}
                                    placeholder="Objetivos de la evaluación..."
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones Generales</label>
                                    <textarea 
                                        rows="3"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        value={reportData.observaciones}
                                        onChange={e => setReportData({...reportData, observaciones: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Recomendaciones</label>
                                    <textarea 
                                        rows="3"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        value={reportData.recomendaciones}
                                        onChange={e => setReportData({...reportData, recomendaciones: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Conclusiones</label>
                                <textarea 
                                    rows="3"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    value={reportData.conclusiones}
                                    onChange={e => setReportData({...reportData, conclusiones: e.target.value})}
                                    placeholder="Conclusiones finales..."
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t mt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setReportModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                                >
                                    <FileText size={18} /> Generar PDF
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {uploadModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Subir Documentos</h3>
                        <p className="text-sm text-gray-600 mb-4">{uploadModal.item.requisito}</p>
                        
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4 hover:bg-gray-50 transition-colors">
                            <input 
                                type="file" 
                                multiple
                                onChange={e => {
                                    if (e.target.files) {
                                        setUploadFiles(prev => [...prev, ...Array.from(e.target.files)]);
                                    }
                                }}
                                className="hidden" 
                                id="fileInput"
                            />
                            <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
                                <Upload size={32} className="text-gray-400 mb-2" />
                                <span className="text-sm text-blue-600 font-medium">Click para seleccionar uno o más archivos</span>
                                <span className="text-xs text-gray-400 mt-1">PDF, DOC, XLS, ZIP, RAR, IMG</span>
                            </label>
                        </div>

                        {uploadFiles.length > 0 && (
                            <div className="mb-4 max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-2 border border-gray-100">
                                <div className="flex justify-between items-center mb-2 px-1">
                                    <p className="text-xs font-semibold text-gray-500">Archivos seleccionados ({uploadFiles.length}):</p>
                                    <button 
                                        onClick={() => setUploadFiles([])}
                                        className="text-xs text-red-500 hover:text-red-700 underline"
                                    >
                                        Limpiar todo
                                    </button>
                                </div>
                                <ul className="space-y-1">
                                    {uploadFiles.map((file, idx) => (
                                        <li key={idx} className="text-xs text-gray-700 flex items-center gap-2 bg-white p-1.5 rounded border border-gray-200 shadow-sm">
                                            <FileText size={14} className="text-blue-500 flex-shrink-0" />
                                            <span className="truncate flex-1 font-medium">{file.name}</span>
                                            <span className="text-gray-400 text-[10px] flex-shrink-0">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                            <button 
                                                onClick={() => setUploadFiles(files => files.filter((_, i) => i !== idx))}
                                                className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors flex-shrink-0"
                                                title="Quitar archivo"
                                            >
                                                <X size={14} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                            <button 
                                onClick={() => {
                                    setUploadModal({ open: false, item: null, subitem_id: null });
                                    setUploadFiles([]);
                                }} 
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleUpload} 
                                disabled={uploadFiles.length === 0}
                                className={`px-4 py-2 rounded-lg text-white font-medium shadow-sm transition-all flex items-center gap-2
                                    ${uploadFiles.length > 0 
                                        ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-md transform hover:-translate-y-0.5' 
                                        : 'bg-gray-300 cursor-not-allowed'}`}
                            >
                                {uploadFiles.length > 0 ? (
                                    <>
                                        <Upload size={18} />
                                        <span>Subir {uploadFiles.length} {uploadFiles.length === 1 ? 'Archivo' : 'Archivos'}</span>
                                    </>
                                ) : (
                                    <span>Subir Archivo</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {newItemModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800">{newItemData.id ? 'Editar Punto' : 'Nuevo Punto'} de Evaluación</h3>
                            <button onClick={() => setNewItemModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateItem} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sección</label>
                                <div className="space-y-2">
                                    <select 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={newItemData.categoria}
                                        onChange={e => setNewItemData({...newItemData, categoria: e.target.value})}
                                    >
                                        <option value="">Seleccione una Sección...</option>
                                        {Object.keys(groupedItems).sort().map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        <option value="new">+ Nueva Sección</option>
                                    </select>
                                    
                                    {newItemData.categoria === 'new' && (
                                        <input 
                                            type="text" 
                                            required
                                            placeholder="Nombre de la nueva sección (Ej. 10. Mejora)"
                                            className="w-full px-3 py-2 border border-blue-300 bg-blue-50 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={newItemData.newCategoryName || ''}
                                            onChange={e => setNewItemData({...newItemData, newCategoryName: e.target.value})}
                                            autoFocus
                                        />
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Numeral / Código</label>
                                <input 
                                    type="text" 
                                    placeholder="Ej. 4.1"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={newItemData.numeral}
                                    onChange={e => setNewItemData({...newItemData, numeral: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Requisito (Título)</label>
                                <textarea 
                                    rows="4"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    value={newItemData.requisito}
                                    onChange={e => setNewItemData({...newItemData, requisito: e.target.value})}
                                    placeholder="Ingrese el requisito. Puede usar múltiples líneas para listas."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción del Requisito</label>
                                <textarea 
                                    rows="3"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    value={newItemData.descripcion_requisito}
                                    onChange={e => setNewItemData({...newItemData, descripcion_requisito: e.target.value})}
                                />
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setNewItemModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {historyModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800">Historial de Cambios</h3>
                            <button onClick={() => setHistoryModal({ ...historyModal, open: false })} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {historyModal.history.length === 0 ? (
                                <p className="text-gray-500 text-center py-4">No hay historial registrado para este punto.</p>
                            ) : (
                                <div className="space-y-4">
                                    {historyModal.history.map((h, i) => (
                                        <div key={i} className="flex gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <div className="mt-1">
                                                <div className="bg-blue-100 text-blue-600 rounded-full p-1.5">
                                                    <Clock size={16} />
                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-semibold text-gray-800 text-sm">{h.accion}</span>
                                                    <span className="text-xs text-gray-500">{new Date(h.fecha_registro).toLocaleString()}</span>
                                                </div>
                                                <p className="text-sm text-gray-600 mb-1">{h.detalle}</p>
                                                <div className="text-xs text-gray-400 flex items-center gap-1">
                                                    <User size={12} /> {h.username || 'Sistema'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editCategoryModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Renombrar Sección</h3>
                        <form onSubmit={handleRenameCategory}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Sección</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={editCategoryModal.newCategory}
                                    onChange={e => setEditCategoryModal({...editCategoryModal, newCategory: e.target.value})}
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setEditCategoryModal({ open: false, oldCategory: '', newCategory: '' })} 
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {dailyReportModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800">Generar Reporte Diario</h3>
                            <button onClick={() => setDailyReportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del Reporte</label>
                                <input 
                                    type="date" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={dailyReportDate}
                                    onChange={e => setDailyReportDate(e.target.value)}
                                />
                                <p className="text-xs text-gray-500 mt-1">Se mostrarán actividades programadas, límite o ejecutadas en esta fecha.</p>
                            </div>
                            
                            <div className="pt-4 flex justify-end gap-3 border-t mt-4">
                                <button 
                                    onClick={() => setDailyReportModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={() => {
                                        window.open(`${API_URL}iso_pdf.php?type=daily&empresa_id=${selectedEmpresa}&norma_id=${selectedNorma}&date=${dailyReportDate}`, '_blank');
                                        setDailyReportModalOpen(false);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                                >
                                    <FileText size={18} /> Generar PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <AlertsModal 
                isOpen={alertsModal.open} 
                onClose={() => setAlertsModal({ ...alertsModal, open: false })} 
                items={alertsModal.items} 
            />
        </div>
    );
};

const ReportBuilderView = () => {
    const [empresas, setEmpresas] = useState([]);
    const [normas, setNormas] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selEmpresas, setSelEmpresas] = useState([]);
    const [selNormas, setSelNormas] = useState([]);
    const [selUsuarios, setSelUsuarios] = useState([]);
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState({ total: 0, resumen: [] });
    const [searchEmp, setSearchEmp] = useState('');
    const [searchNorm, setSearchNorm] = useState('');
    const [searchUser, setSearchUser] = useState('');
    const [presets, setPresets] = useState([]);
    const [selectedPreset, setSelectedPreset] = useState('');
    
    useEffect(() => {
        const load = async () => {
            try {
                const [eRes, nRes, uRes] = await Promise.all([
                    axios.get(`${API_URL}iso.php?action=list_empresas`),
                    axios.get(`${API_URL}iso.php?action=list_normas`),
                    axios.get(`${API_URL}iso.php?action=list_iso_users`)
                ]);
                setEmpresas(eRes.data || []);
                setNormas(nRes.data || []);
                const ulist = Array.isArray(uRes.data) ? uRes.data : (uRes.data?.users || []);
                setUsuarios(ulist.map(u => ({ id: u.id, nombre: u.nombre_real || u.usuario })));
            } catch (e) {}
            try {
                const saved = JSON.parse(localStorage.getItem('iso_report_presets') || '[]');
                setPresets(saved);
            } catch {}
        };
        load();
    }, []);
    
    const toggleSel = (arr, setArr, id) => {
        if (arr.includes(id)) setArr(arr.filter(x => x !== id));
        else setArr([...arr, id]);
    };
    
    const availableNormas = React.useMemo(() => {
        if (selEmpresas.length === 0) return normas;
        const ids = new Set();
        empresas.forEach(e => {
            if (selEmpresas.includes(String(e.id))) {
                (e.normas || []).forEach(n => ids.add(String(n.id)));
            }
        });
        return normas.filter(n => ids.has(String(n.id)));
    }, [selEmpresas, empresas, normas]);
    
    useEffect(() => {
        if (selNormas.length > 0) {
            const validIds = new Set(availableNormas.map(n => String(n.id)));
            setSelNormas(prev => prev.filter(id => validIds.has(id)));
        }
    }, [availableNormas]);
    
    const fetchPreview = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            if (selEmpresas.length > 0) params.append('empresa_ids', selEmpresas.join(','));
            if (selNormas.length > 0) params.append('norma_ids', selNormas.join(','));
            if (selUsuarios.length > 0) params.append('usuario_ids', selUsuarios.join(','));
            const res = await axios.get(`${API_URL}iso.php?action=report_builder&${params.toString()}`);
            const rows = Array.isArray(res.data?.rows) ? res.data.rows : (Array.isArray(res.data) ? res.data : []);
            const total = rows.length;
            const byEmpresa = {};
            rows.forEach(r => {
                const k = r.empresa || 'Sin empresa';
                byEmpresa[k] = (byEmpresa[k] || 0) + 1;
            });
            const resumen = Object.entries(byEmpresa).map(([k,v]) => ({ empresa: k, total: v }));
            setPreview({ total, resumen });
        } catch (e) {
            toast.error('No se pudo obtener la vista previa');
        } finally {
            setLoading(false);
        }
    };
    
    const handleGeneratePDF = () => {
        if (preview.total === 0) {
            toast.error('Sin resultados. Ajuste filtros o vista previa antes de generar.');
            return;
        }
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${API_URL}iso_pdf.php?type=report_builder`;
        form.target = '_blank';
        const append = (name, value) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value;
            form.appendChild(input);
        };
        if (dateFrom) append('date_from', dateFrom);
        if (dateTo) append('date_to', dateTo);
        if (selEmpresas.length > 0) append('empresa_ids', selEmpresas.join(','));
        if (selNormas.length > 0) append('norma_ids', selNormas.join(','));
        if (selUsuarios.length > 0) append('usuario_ids', selUsuarios.join(','));
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    };
    
    const resetFilters = () => {
        setDateFrom('');
        setDateTo('');
        setSelEmpresas([]);
        setSelNormas([]);
        setSelUsuarios([]);
        setPreview({ total: 0, resumen: [] });
    };
    
    const savePreset = () => {
        const name = window.prompt('Nombre del preset:');
        if (!name) return;
        const preset = {
            name,
            dateFrom, dateTo,
            selEmpresas, selNormas, selUsuarios
        };
        const updated = [...presets.filter(p => p.name !== name), preset];
        setPresets(updated);
        localStorage.setItem('iso_report_presets', JSON.stringify(updated));
        setSelectedPreset(name);
        toast.success('Preset guardado');
    };
    
    const loadPreset = (name) => {
        const p = presets.find(pr => pr.name === name);
        if (!p) return;
        setDateFrom(p.dateFrom || '');
        setDateTo(p.dateTo || '');
        setSelEmpresas(p.selEmpresas || []);
        setSelNormas(p.selNormas || []);
        setSelUsuarios(p.selUsuarios || []);
        setSelectedPreset(name);
        toast.success('Preset cargado');
    };
    
    return (
        <div className="p-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <Filter size={18} className="text-blue-600" />
                    <h3 className="text-lg font-bold text-gray-800">Generador de Reportes</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                        <input type="date" className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                        <input type="date" className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresas</label>
                        <div className="flex items-center gap-2 mb-2">
                            <Search size={16} className="text-gray-400" />
                            <input type="text" placeholder="Buscar empresa..." className="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchEmp} onChange={e => setSearchEmp(e.target.value)} />
                            <span className="text-xs text-gray-500">Seleccionadas: {selEmpresas.length}</span>
                        </div>
                        <div className="border border-gray-200 rounded-lg max-h-48 overflow-auto divide-y">
                            {empresas.filter(e => e.nombre.toLowerCase().includes(searchEmp.toLowerCase())).map(e => {
                                const selected = selEmpresas.includes(String(e.id));
                                return (
                                    <label key={e.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                                        <input type="checkbox" checked={selected} onChange={() => toggleSel(selEmpresas, setSelEmpresas, String(e.id))} />
                                        <span className={`text-sm ${selected ? 'text-blue-700' : 'text-gray-700'}`}>
                                            <Building size={14} className="inline mr-1" /> {e.nombre}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Normas</label>
                        <div className="text-xs text-gray-500 mb-2">Seleccionadas: {selNormas.length}</div>
                        <div className="flex flex-wrap gap-2">
                            {[...availableNormas].sort((a, b) => {
                                const ac = String(a.codigo || '');
                                const bc = String(b.codigo || '');
                                const cmp = ac.localeCompare(bc);
                                return cmp !== 0 ? cmp : String(a.nombre || '').localeCompare(String(b.nombre || ''));
                            }).map(n => (
                                <button key={n.id} type="button" onClick={() => toggleSel(selNormas, setSelNormas, String(n.id))} className={`px-3 py-1.5 rounded-lg border text-sm ${selNormas.includes(String(n.id)) ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                                    <ClipboardList size={14} className="inline mr-1" /> {n.codigo} - {n.nombre}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Usuarios</label>
                        <div className="flex items-center gap-2 mb-2">
                            <Search size={16} className="text-gray-400" />
                            <input type="text" placeholder="Buscar usuario..." className="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchUser} onChange={e => setSearchUser(e.target.value)} />
                            <span className="text-xs text-gray-500">Seleccionados: {selUsuarios.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {usuarios.filter(u => (u.nombre || '').toLowerCase().includes(searchUser.toLowerCase())).map(u => (
                                <button key={u.id} type="button" onClick={() => toggleSel(selUsuarios, setSelUsuarios, String(u.id))} className={`px-3 py-1.5 rounded-lg border text-sm ${selUsuarios.includes(String(u.id)) ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                                    <User size={14} className="inline mr-1" /> {u.nombre}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button onClick={fetchPreview} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
                        <Eye size={18} /> Vista previa
                    </button>
                    <button onClick={handleGeneratePDF} disabled={preview.total === 0} className={`px-4 py-2 rounded-lg flex items-center gap-2 ${preview.total > 0 ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}>
                        <FileText size={18} /> Generar PDF
                    </button>
                    <button onClick={resetFilters} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                        Limpiar filtros
                    </button>
                    <div className="flex items-center gap-2">
                        <select value={selectedPreset} onChange={e => loadPreset(e.target.value)} className="p-2 border border-gray-300 rounded-lg text-sm">
                            <option value="">Seleccionar preset</option>
                            {presets.map(p => (<option key={p.name} value={p.name}>{p.name}</option>))}
                        </select>
                        <button onClick={savePreset} className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">Guardar preset</button>
                    </div>
                    {loading && <span className="text-sm text-gray-500">Procesando...</span>}
                    <span className="text-sm text-gray-600 ml-auto">Resultados: <strong>{preview.total}</strong></span>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h4 className="text-sm font-bold text-gray-700 mb-2">Resumen</h4>
                <div className="text-sm text-gray-700">Registros: {preview.total}</div>
                {preview.resumen.length > 0 ? (
                    <>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {preview.resumen.map(r => (
                                <div key={r.empresa} className="px-3 py-2 border rounded-lg bg-gray-50 text-sm flex justify-between">
                                    <span>{r.empresa}</span>
                                    <span className="font-bold">{r.total}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={preview.resumen}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="empresa" tick={{ fontSize: 10 }} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="total" fill="#3B82F6" name="Registros" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                ) : (
                    <div className="text-sm text-gray-500 mt-2">Use los filtros y la vista previa para ver el resumen.</div>
                )}
            </div>
        </div>
    );
};

const DashboardView = ({ empresas }) => {
    const [selectedEmpresa, setSelectedEmpresa] = useState('');
    const [stats, setStats] = useState([]);

    useEffect(() => {
        if (selectedEmpresa) {
            fetchStats();
        }
    }, [selectedEmpresa]);

    const fetchStats = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=get_dashboard_stats&empresa_id=${selectedEmpresa}`);
            setStats(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    const data = stats.map(s => ({ name: s.estado, value: s.count }));
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className="p-6">
            <div className="mb-6">
                 <select 
                    className="w-full md:w-64 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedEmpresa}
                    onChange={e => setSelectedEmpresa(e.target.value)}
                >
                    <option value="">Seleccione Empresa...</option>
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
            </div>

            {selectedEmpresa && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 shrink-0">Estado General de Cumplimiento</h3>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={true}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={70}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {data.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const NormasView = () => {
    const [normas, setNormas] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNorma, setEditingNorma] = useState(null);
    const [formData, setFormData] = useState({ codigo: '', nombre: '', descripcion: '' });

    useEffect(() => {
        fetchNormas();
    }, []);

    const fetchNormas = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=list_normas`);
            setNormas(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const action = editingNorma ? 'update_norma' : 'create_norma';
            await axios.post(`${API_URL}iso.php?action=${action}`, {
                ...formData,
                id: editingNorma ? editingNorma.id : null
            });
            toast.success('Norma guardada');
            setIsModalOpen(false);
            fetchNormas();
        } catch (error) {
            toast.error('Error al guardar norma');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Seguro que deseas eliminar esta norma?')) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_norma&id=${id}`);
            toast.success('Norma eliminada');
            fetchNormas();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al eliminar');
        }
    };

    const openModal = (norma = null) => {
        setEditingNorma(norma);
        if (norma) {
            setFormData({
                codigo: norma.codigo,
                nombre: norma.nombre,
                descripcion: norma.descripcion || ''
            });
        } else {
            setFormData({ codigo: '', nombre: '', descripcion: '' });
        }
        setIsModalOpen(true);
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Catálogo de Normas ISO</h2>
                <button 
                    onClick={() => openModal()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
                >
                    <Plus size={20} /> Nueva Norma
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {normas.map(norma => (
                    <div key={norma.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg font-bold text-sm">
                                {norma.codigo}
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => openModal(norma)}
                                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                                    title="Editar"
                                >
                                    <Edit size={18} />
                                </button>
                                <button 
                                    onClick={() => handleDelete(norma.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-2">{norma.nombre}</h3>
                        <p className="text-gray-600 text-sm line-clamp-3">{norma.descripcion}</p>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-800">{editingNorma ? 'Editar' : 'Nueva'} Norma ISO</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="Ej. ISO 9001:2015"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.codigo}
                                    onChange={e => setFormData({...formData, codigo: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="Ej. Gestión de la Calidad"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.nombre}
                                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                                <textarea 
                                    rows="3"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    value={formData.descripcion}
                                    onChange={e => setFormData({...formData, descripcion: e.target.value})}
                                />
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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

// --- MAIN COMPONENT ---

const GestionISO = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [empresas, setEmpresas] = useState([]);

    useEffect(() => {
        fetchEmpresas();
    }, []);

    const fetchEmpresas = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=list_empresas`);
            setEmpresas(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            {/* Sidebar ISO */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col z-10">
                <div className="p-6 border-b border-gray-100">
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <ClipboardList className="text-blue-600" />
                        Gestión ISO
                    </h1>
                </div>
                
                <nav className="flex-1 p-4 space-y-1">
                    <button 
                        onClick={() => setActiveTab('dashboard')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <LayoutDashboard size={20} /> Dashboard
                    </button>
                    <button 
                        onClick={() => setActiveTab('tracking')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'tracking' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <CheckCircle size={20} /> Checklists & Tracking
                    </button>
                    <button 
                        onClick={() => setActiveTab('reportes')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'reportes' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <FileText size={20} /> Reportes
                    </button>
                    <button 
                        onClick={() => setActiveTab('empresas')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'empresas' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Building size={20} /> Empresas
                    </button>
                    <button 
                        onClick={() => setActiveTab('normas')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'normas' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <FileText size={20} /> Normas
                    </button>
                </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto">
                <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-20 shadow-sm">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {activeTab === 'dashboard' && 'Panel de Control ISO'}
                        {activeTab === 'empresas' && 'Administración de Empresas'}
                        {activeTab === 'normas' && 'Catálogo de Normas'}
                        {activeTab === 'tracking' && 'Seguimiento de Normas'}
                    </h2>
                </header>

                <main>
                    {activeTab === 'dashboard' && <DashboardView empresas={empresas} />}
                    {activeTab === 'empresas' && <EmpresasView />}
                    {activeTab === 'normas' && <NormasView />}
                    {activeTab === 'tracking' && <TrackingView empresas={empresas} />}
                    {activeTab === 'reportes' && <ReportBuilderView />}
                </main>
            </div>
        </div>
    );
};

export default GestionISO;
