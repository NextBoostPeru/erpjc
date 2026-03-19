import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
    LayoutDashboard, Building, ClipboardList, FileText, 
    Plus, Edit, Trash2, Search, CheckCircle, AlertTriangle, 
    Clock, X, ChevronDown, ChevronUp, Upload, Download,
    File, Eye, Bell, User, Calendar, Timer, Filter, GripVertical
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
    const [scheduleModal, setScheduleModal] = useState({ open: false, item: null });
    const [scheduleData, setScheduleData] = useState({ fecha_programada: '', fecha_limite: '' });
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
    }, []);

    const openScheduleModal = (row) => {
        setScheduleModal({ open: true, item: row });
        setScheduleData({
            fecha_programada: row?.fecha_programada || new Date().toISOString().split('T')[0],
            fecha_limite: row?.fecha_limite || ''
        });
    };

    const saveSchedule = async () => {
        const row = scheduleModal.item;
        if (!row) return;
        try {
            await axios.post(`${API_URL}iso.php?action=update_tracking_item`, {
                empresa_id: row.empresa_id,
                norma_id: row.norma_id,
                item_id: row.item_id,
                estado: row.estado || 'Programado',
                fecha_programada: scheduleData.fecha_programada || null,
                fecha_limite: scheduleData.fecha_limite || null,
                fecha_ejecucion: row.fecha_ejecucion || null,
                observaciones_internas: row.observaciones_internas || ''
            });
            toast.success('Fechas programadas');
            setScheduleModal({ open: false, item: null });
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al programar fechas');
        }
    };
    
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
                                            <th className="px-3 py-2 text-left">Programado</th>
                                            <th className="px-3 py-2 text-left">Fecha Límite</th>
                                            <th className="px-3 py-2 text-right">Días</th>
                                            <th className="px-3 py-2 text-center">Acción</th>
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
                                                    {i.fecha_programada ? new Date(i.fecha_programada + 'T12:00:00').toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-600">
                                                    {new Date(i.fecha_limite + 'T12:00:00').toLocaleDateString()}
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold">{i.dias_restantes}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <button
                                                        onClick={() => openScheduleModal(i)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                                                        title="Programar fechas"
                                                    >
                                                        <Calendar size={14} />
                                                        Programar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {scheduleModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Programar fechas</h3>
                                <p className="text-xs text-gray-500 mt-1 max-w-md truncate" title={scheduleModal.item?.requisito}>
                                    {scheduleModal.item?.empresa} · {scheduleModal.item?.norma} · {scheduleModal.item?.requisito}
                                </p>
                            </div>
                            <button
                                onClick={() => setScheduleModal({ open: false, item: null })}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha programada</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        value={scheduleData.fecha_programada}
                                        onChange={(e) => setScheduleData((prev) => ({ ...prev, fecha_programada: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        value={scheduleData.fecha_limite}
                                        onChange={(e) => setScheduleData((prev) => ({ ...prev, fecha_limite: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
                            <button
                                onClick={() => setScheduleModal({ open: false, item: null })}
                                className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-100"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={saveSchedule}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
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
        if(!confirm('¿Eliminar subpunto? Se eliminarán también sus evidencias y su historial de programación.')) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_subitem&id=${id}`);
            toast.success('Subpunto eliminado');
            fetchSubitems();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al eliminar');
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
                fecha_programada: updatedItem.fecha_programada || null,
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
                                                <th className="p-2 border-b border-r w-40 text-center">F. Prog</th>
                                                {months.map(m => (
                                                    <th key={m.k} className="p-1 border-b border-r text-center w-12" colSpan={3}>
                                                        {m.l}
                                                    </th>
                                                ))}
                                                <th className="p-2 border-b w-32 text-center">Estado</th>
                                            </tr>
                                            <tr className="bg-gray-50 text-gray-500 text-[9px]">
                                                <th className="border-b border-r sticky left-0 bg-gray-50 z-10"></th>
                                                <th className="border-b border-r"></th>
                                                <th className="border-b border-r"></th>
                                                <th className="border-b border-r"></th>
                                                {months.map(m => (
                                                    <React.Fragment key={m.k}>
                                                        <th className="border-b border-r text-center w-6 bg-blue-50 text-blue-600">P</th>
                                                        <th className="border-b border-r text-center w-6 bg-green-50 text-green-600">E</th>
                                                        <th className="border-b border-r text-center w-6 bg-yellow-50 text-yellow-700">D</th>
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
                                                            {sub.documentos && sub.documentos
                                                                .slice()
                                                                .sort((a, b) => String(a.mes || '').localeCompare(String(b.mes || '')))
                                                                .map(doc => (
                                                                <div key={doc.id} className="flex items-center gap-1 bg-white p-1 rounded border border-gray-200 hover:bg-blue-50 text-[10px] text-blue-600 truncate block group">
                                                                    <a 
                                                                        href={`${API_URL}${doc.ruta_archivo}`} 
                                                                        target="_blank" 
                                                                        rel="noreferrer"
                                                                        className="flex items-center gap-1 truncate flex-1"
                                                                        title={doc.nombre_archivo}
                                                                    >
                                                                        <FileText size={10} className="shrink-0"/>
                                                                        <span className="truncate">{doc.mes ? `${doc.mes} - ` : ''}{doc.nombre_archivo}</span>
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
                                                                onClick={() => onUpload(item, sub.id, `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)}
                                                                className="text-[10px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-1 rounded border border-dashed border-gray-300 hover:border-blue-300 w-full text-center transition-colors flex items-center justify-center gap-1"
                                                            >
                                                                <Upload size={10} /> Adjuntar
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="p-1 border-r align-middle text-center">
                                                        <input
                                                            type="date"
                                                            value={sub.fecha_programada || ''}
                                                            onChange={e => handleGridUpdate(sub.id, 'fecha_programada', e.target.value)}
                                                            className="w-full p-1 text-[11px] border border-gray-200 rounded bg-white"
                                                        />
                                                    </td>
                                                    {months.map((m, idx) => {
                                                        const mes = `${year}-${String(idx + 1).padStart(2, '0')}`;
                                                        const doc = (sub.documentos || []).find(d => String(d.mes || '') === mes);
                                                        return (
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
                                                            <td className="border-r text-center align-middle bg-yellow-50/30 p-0">
                                                                {doc ? (
                                                                    <div className="flex items-center justify-center gap-1 py-0.5 group">
                                                                        <a
                                                                            href={`${API_URL}${doc.ruta_archivo}`}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            title={doc.nombre_archivo}
                                                                            className="text-yellow-700 hover:text-yellow-900"
                                                                        >
                                                                            <FileText size={12} />
                                                                        </a>
                                                                        <button
                                                                            onClick={() => handleDeleteDoc(doc.id)}
                                                                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                            title="Eliminar documento"
                                                                        >
                                                                            <X size={10} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => onUpload(item, sub.id, mes)}
                                                                        className="w-full h-full py-1 flex items-center justify-center text-yellow-700 hover:text-yellow-900 hover:bg-yellow-100/60 transition-colors"
                                                                        title={`Adjuntar documento ${mes}`}
                                                                    >
                                                                        <Upload size={12} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </React.Fragment>
                                                        );
                                                    })}
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
                                                    <td colSpan={41} className="text-center py-8 text-gray-400">
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
    const [uploadModal, setUploadModal] = useState({ open: false, item: null, subitem_id: null, mes: null });
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

    useEffect(() => {
        if (uploadModal.open) {
            setUploadFiles([]);
        }
    }, [uploadModal.open]);
    
    // Upload Modal State
    const [editCategoryModal, setEditCategoryModal] = useState({ open: false, oldCategory: '', newCategory: '' });

    // UI/UX States
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [savingSubitems, setSavingSubitems] = useState({});
    const [noEvidenceModal, setNoEvidenceModal] = useState({ open: false, item: null });
    const [dragState, setDragState] = useState({ draggingId: null, overId: null });
    const trackingYear = new Date().getFullYear();
    const NO_EVID_TAG = '[NO_EVIDENCIA]';
    const isReorderMode = !searchTerm.trim() && statusFilter === 'all';

    const hasNoEvidencia = (it) => {
        if (!it) return false;
        if (parseInt(it.no_requiere_evidencia) === 1) return true;
        return (it.observaciones_internas || '').includes(NO_EVID_TAG);
    };

    const normalizeObservaciones = (obs, noEvid) => {
        const text = (obs || '').replace(NO_EVID_TAG, '').trim();
        return noEvid ? `${NO_EVID_TAG} ${text}`.trim() : text;
    };

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
        const token = localStorage.getItem('token') || '';
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${API_URL}iso_zip.php`;
        form.target = '_blank';
        const append = (name, value) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value;
            form.appendChild(input);
        };
        append('empresa_id', selectedEmpresa);
        append('norma_id', selectedNorma);
        if (token) append('token', token);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    };

    const handleGenerateReport = (e) => {
        e.preventDefault();
        // Use a hidden form to submit via POST to PDF generator to handle large text fields
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${API_URL}iso_pdf.php?type=tracking&empresa_id=${selectedEmpresa}&norma_id=${selectedNorma}`;
        form.target = '_blank';

        const token = localStorage.getItem('token') || '';
        if (token) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'token';
            input.value = token;
            form.appendChild(input);
        }

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
            const currentNoEvid = hasNoEvidencia(item);
            if (
                currentNoEvid &&
                field !== 'no_requiere_evidencia' &&
                ['estado', 'fecha_programada', 'fecha_limite', 'fecha_ejecucion'].includes(field)
            ) {
                toast('Este punto no requiere programación', { icon: 'ℹ️' });
                return;
            }
            const payload = {
                empresa_id: selectedEmpresa,
                norma_id: selectedNorma,
                item_id: item.id,
                estado: item.estado || 'Programado',
                fecha_programada: item.fecha_programada,
                fecha_limite: item.fecha_limite,
                fecha_ejecucion: item.fecha_ejecucion,
                observaciones_internas: normalizeObservaciones(item.observaciones_internas, currentNoEvid),
                no_requiere_evidencia: currentNoEvid ? 1 : 0
            };
            
            if (field === 'no_requiere_evidencia') {
                const nextNoEvid = !!value;
                payload.no_requiere_evidencia = nextNoEvid ? 1 : 0;
                payload.observaciones_internas = normalizeObservaciones(item.observaciones_internas, nextNoEvid);
                if (nextNoEvid) {
                    payload.estado = 'No aplica';
                    payload.fecha_programada = null;
                    payload.fecha_limite = null;
                    payload.fecha_ejecucion = null;
                } else {
                    payload.estado = (item.estado === 'No aplica' ? 'Programado' : (item.estado || 'Programado'));
                }
            } else if (field === 'observaciones_internas') {
                payload.observaciones_internas = normalizeObservaciones(value, currentNoEvid);
            } else {
                payload[field] = value;
            }

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

    const handleEstadoChange = (item, nextEstado) => {
        const docCount = item.documentos?.length || 0;
        if (nextEstado === 'Ejecutado' && docCount === 0 && !hasNoEvidencia(item)) {
            setNoEvidenceModal({ open: true, item });
            return;
        }
        handleTrackingUpdate(item, 'estado', nextEstado);
    };

    const ejecutarSinEvidencia = async (item) => {
        try {
            await handleTrackingUpdate(item, 'no_requiere_evidencia', 1);
            toast.success('Marcado como No requiere evidencias');
            setNoEvidenceModal({ open: false, item: null });
            fetchItems();
        } catch (error) {
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
                fecha_programada: sub.fecha_programada || null,
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
        if (uploadModal.mes) {
            formData.append('mes', uploadModal.mes);
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

            setUploadModal({ open: false, item: null, subitem_id: null, mes: null });
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

    const handleDragStartItem = (e, itemId) => {
        if (!isReorderMode) return;
        setDragState({ draggingId: itemId, overId: itemId });
        try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(itemId));
        } catch (error) {
            console.error(error);
        }
    };

    const handleDragOverItem = (e, itemId) => {
        if (!isReorderMode) return;
        e.preventDefault();
        setDragState(prev => (prev.overId === itemId ? prev : { ...prev, overId: itemId }));
    };

    const handleDragEndItem = () => {
        setDragState({ draggingId: null, overId: null });
    };

    const handleDropItem = async (e, targetItemId, category) => {
        if (!isReorderMode) return;
        e.preventDefault();
        const raw = e.dataTransfer?.getData?.('text/plain');
        const sourceItemId = parseInt(raw, 10);
        if (!sourceItemId || sourceItemId === targetItemId) {
            handleDragEndItem();
            return;
        }

        const orderVal = (it) => {
            const v = parseInt(it.orden, 10);
            return Number.isFinite(v) ? v : 0;
        };

        const sortedAll = [...items].sort((a, b) => {
            const da = orderVal(a);
            const db = orderVal(b);
            if (da !== db) return da - db;
            return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
        });

        const sourceItem = sortedAll.find(it => parseInt(it.id, 10) === sourceItemId);
        const targetItem = sortedAll.find(it => parseInt(it.id, 10) === parseInt(targetItemId, 10));
        if (!sourceItem || !targetItem) {
            handleDragEndItem();
            return;
        }

        const sourceCat = sourceItem.categoria || 'General';
        const targetCat = targetItem.categoria || 'General';
        if (sourceCat !== targetCat || targetCat !== category) {
            toast('Solo se puede ordenar dentro de la misma sección', { icon: 'ℹ️' });
            handleDragEndItem();
            return;
        }

        const groupPositions = [];
        const groupOrdered = [];
        sortedAll.forEach((it, idx) => {
            if ((it.categoria || 'General') === category) {
                groupPositions.push(idx);
                groupOrdered.push(it);
            }
        });

        const srcIdx = groupOrdered.findIndex(it => parseInt(it.id, 10) === sourceItemId);
        const tgtIdx = groupOrdered.findIndex(it => parseInt(it.id, 10) === parseInt(targetItemId, 10));
        if (srcIdx < 0 || tgtIdx < 0) {
            handleDragEndItem();
            return;
        }

        const nextGroup = [...groupOrdered];
        const [moved] = nextGroup.splice(srcIdx, 1);
        nextGroup.splice(tgtIdx, 0, moved);

        const nextAll = [...sortedAll];
        groupPositions.forEach((pos, i) => {
            nextAll[pos] = nextGroup[i];
        });

        const nextAllWithOrden = nextAll.map((it, idx) => ({ ...it, orden: idx + 1 }));
        setItems(nextAllWithOrden);
        handleDragEndItem();

        try {
            await axios.post(`${API_URL}iso.php?action=reorder_items`, {
                norma_id: selectedNorma,
                ordered_ids: nextAllWithOrden.map(it => it.id)
            });
            toast.success('Orden actualizado');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al guardar orden');
            fetchItems();
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
    const searchTermNorm = searchTerm.trim().toLowerCase();
    const matchesSearchText = (v) => String(v || '').toLowerCase().includes(searchTermNorm);
    const itemHasSubpoints = (item) => !item?.no_requiere_subitems && (item?.subitems || []).length > 0;
    const getItemDisplayEstado = (item) => {
        if (hasNoEvidencia(item)) return 'No aplica';
        if (!itemHasSubpoints(item)) return item?.estado || 'Programado';
        
        const estados = (item.subitems || []).map(s => s?.estado_anual || 'Pendiente');
        if (estados.length === 0) return item?.estado || 'Programado';
        if (estados.every(e => e === 'Ejecutado')) return 'Ejecutado';
        if (estados.some(e => e === 'Retrasado')) return 'Retrasado';
        if (estados.some(e => e === 'En Proceso')) return 'En proceso';
        return 'Programado';
    };
    const filteredItems = items.filter(item => {
        const matchesSearch =
            searchTermNorm === '' ||
            matchesSearchText(item.requisito) ||
            matchesSearchText(item.numeral) ||
            matchesSearchText(item.descripcion_requisito) ||
            (item.subitems || []).some(sub => matchesSearchText(sub.descripcion) || matchesSearchText(sub.literal));
        
        const estado = getItemDisplayEstado(item);
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'Programado' && estado === 'Programado') || estado === statusFilter;

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

    const subMonths = [
        { k: 'ene', l: 'Ene', idx: 0 },
        { k: 'feb', l: 'Feb', idx: 1 },
        { k: 'mar', l: 'Mar', idx: 2 },
        { k: 'abr', l: 'Abr', idx: 3 },
        { k: 'may', l: 'May', idx: 4 },
        { k: 'jun', l: 'Jun', idx: 5 },
        { k: 'jul', l: 'Jul', idx: 6 },
        { k: 'ago', l: 'Ago', idx: 7 },
        { k: 'sep', l: 'Sep', idx: 8 },
        { k: 'oct', l: 'Oct', idx: 9 },
        { k: 'nov', l: 'Nov', idx: 10 },
        { k: 'dic', l: 'Dic', idx: 11 }
    ];

    const getSubStatusColor = (status) => {
        switch(status) {
            case 'Ejecutado': return 'bg-green-50 text-green-700 border-green-100';
            case 'En Proceso': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'Retrasado': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-200';
        }
    };

    const getSubStatusBar = (status) => {
        switch(status) {
            case 'Ejecutado': return 'bg-green-500';
            case 'En Proceso': return 'bg-blue-500';
            case 'Retrasado': return 'bg-red-500';
            default: return 'bg-gray-300';
        }
    };

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
                                            { name: 'Ejecutado', cantidad: items.filter(i => getItemDisplayEstado(i) === 'Ejecutado').length, fill: '#10B981' },
                                            { name: 'En proceso', cantidad: items.filter(i => getItemDisplayEstado(i) === 'En proceso').length, fill: '#3B82F6' },
                                            { name: 'Retrasado', cantidad: items.filter(i => getItemDisplayEstado(i) === 'Retrasado').length, fill: '#EF4444' },
                                            { name: 'Programado', cantidad: items.filter(i => getItemDisplayEstado(i) === 'Programado').length, fill: '#F59E0B' }
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
                                placeholder="Buscar por numeral, requisito, descripción o subpunto..." 
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
                        const totalSubpuntos = groupItems.reduce((sum, it) => sum + ((it.subitems || []).length), 0);
                        const executed = groupItems.filter(i => getItemDisplayEstado(i) === 'Ejecutado').length;
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
                                            <span className="text-xs font-normal text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">{totalSubpuntos} subpuntos</span>
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
                                        <React.Fragment key={item.id}>
                                        <div
                                            onDragOver={(e) => handleDragOverItem(e, item.id)}
                                            onDrop={(e) => handleDropItem(e, item.id, category)}
                                            className={`p-6 hover:bg-gray-50 transition-colors group ${
                                                dragState.draggingId && dragState.overId === item.id ? 'bg-blue-50' : ''
                                            }`}
                                        >
                                            <div className="flex flex-col lg:flex-row gap-6">
                                                {/* Left Status Indicator */}
                                                <div className={`hidden lg:block w-1 self-stretch rounded-full ${
                                                    getItemDisplayEstado(item) === 'Ejecutado' ? 'bg-green-500' :
                                                    getItemDisplayEstado(item) === 'En proceso' ? 'bg-blue-500' :
                                                    getItemDisplayEstado(item) === 'Retrasado' ? 'bg-red-500' :
                                                    getItemDisplayEstado(item) === 'No aplica' ? 'bg-gray-400' : 'bg-yellow-500'
                                                }`}></div>

                                                <div className="flex-1 min-w-0">
                                                    {/* Header: Numeral + Title + Status (Mobile) */}
                                                    <div className="flex items-start justify-between gap-4 mb-3">
                                                        <div className="flex items-start gap-3">
                                                            <button
                                                                type="button"
                                                                draggable={isReorderMode}
                                                                onDragStart={(e) => handleDragStartItem(e, item.id)}
                                                                onDragEnd={handleDragEndItem}
                                                                onClick={() => {
                                                                    if (!isReorderMode) toast('Desactive filtros/búsqueda para ordenar', { icon: 'ℹ️' });
                                                                }}
                                                                className={`p-1 rounded-lg border transition-colors mt-0.5 ${
                                                                    isReorderMode
                                                                        ? 'cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-transparent'
                                                                        : 'cursor-not-allowed text-gray-300 border-transparent'
                                                                }`}
                                                                title={isReorderMode ? 'Arrastrar para ordenar' : 'Desactive filtros/búsqueda para ordenar'}
                                                            >
                                                                <GripVertical size={16} />
                                                            </button>
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
                                                        
                                                        {hasNoEvidencia(item) && (
                                                            <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                                                                <CheckCircle size={14} />
                                                                Sin evidencias
                                                            </div>
                                                        )}
                                                        
                                                        {(!item.documentos || item.documentos.length === 0) && (
                                                            <button 
                                                                onClick={() => setUploadModal({ open: true, item, subitem_id: null, mes: null })}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all"
                                                            >
                                                                <Upload size={14} /> Adjuntar Evidencia
                                                            </button>
                                                        )}

                                                        {(!item.documentos || item.documentos.length === 0) && !hasNoEvidencia(item) && (
                                                            <button
                                                                onClick={() => handleTrackingUpdate(item, 'no_requiere_evidencia', 1)}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-50 transition-all"
                                                            >
                                                                <CheckCircle size={14} /> No requiere evidencias
                                                            </button>
                                                        )}
                                                        
                                                        {item.documentos && item.documentos.length > 0 && (
                                                            <button 
                                                                onClick={() => setUploadModal({ open: true, item, subitem_id: null, mes: null })}
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
                                                                <ClipboardList size={16} /> Configurar Subpuntos {item.subitems?.length > 0 && `(${item.subitems.length})`}
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
                                                </div>

                                                {/* Right Sidebar: Status & Dates */}
                                                {!itemHasSubpoints(item) ? (
                                                    <div className="w-full lg:w-72 bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-4 self-start">
                                                        <div>
                                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5 block">Estado Actual</label>
                                                            <select 
                                                                className={`w-full p-2.5 rounded-lg border text-sm font-bold outline-none shadow-sm transition-all focus:ring-2 focus:ring-opacity-50 ${
                                                                    item.estado === 'Ejecutado' ? 'bg-green-100 text-green-800 border-green-200 focus:ring-green-500' :
                                                                    item.estado === 'En proceso' ? 'bg-blue-100 text-blue-800 border-blue-200 focus:ring-blue-500' :
                                                                    item.estado === 'Retrasado' ? 'bg-red-100 text-red-800 border-red-200 focus:ring-red-500' :
                                                                    item.estado === 'No aplica' ? 'bg-gray-100 text-gray-600 border-gray-200 focus:ring-gray-500' :
                                                                    'bg-white text-yellow-700 border-yellow-200 focus:ring-yellow-500'
                                                                }`}
                                                                value={item.estado || 'Programado'}
                                                                onChange={(e) => handleEstadoChange(item, e.target.value)}
                                                                disabled={hasNoEvidencia(item)}
                                                            >
                                                                <option value="Programado">Programado</option>
                                                                <option value="En proceso">En proceso</option>
                                                                <option value="Ejecutado">Ejecutado</option>
                                                                <option value="Retrasado">Retrasado</option>
                                                                <option value="No aplica">No aplica</option>
                                                            </select>
                                                            {(item.documentos?.length || 0) === 0 && !hasNoEvidencia(item) && (
                                                                <div className="mt-2 text-[11px] text-gray-500 leading-snug">
                                                                    Para marcar Ejecutado: adjunta evidencia o activa “No requiere evidencias”.
                                                                </div>
                                                            )}
                                                        </div>
                                                        
                                                        <div className="space-y-3">
                                                            <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <Clock size={14} className="text-blue-500" />
                                                                    <span className="text-xs font-medium text-gray-500">Programado</span>
                                                                </div>
                                                                <input 
                                                                    type="date" 
                                                                    className={`w-full text-sm font-semibold border-none p-0 focus:ring-0 rounded px-1 ${
                                                                        hasNoEvidencia(item) ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-800 cursor-pointer hover:bg-gray-50'
                                                                    }`} 
                                                                    value={hasNoEvidencia(item) ? '' : (item.fecha_programada || '')} 
                                                                    onChange={(e) => handleTrackingUpdate(item, 'fecha_programada', e.target.value)}
                                                                    disabled={hasNoEvidencia(item)}
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
                                                                    className={`w-full text-sm font-semibold border-none p-0 focus:ring-0 rounded px-1 ${
                                                                        hasNoEvidencia(item)
                                                                            ? 'text-gray-400 bg-gray-50 cursor-not-allowed'
                                                                            : (item.estado === 'Retrasado' ? 'text-red-700 bg-red-50 cursor-pointer hover:bg-gray-50' : 'text-gray-800 cursor-pointer hover:bg-gray-50')
                                                                    }`} 
                                                                    value={hasNoEvidencia(item) ? '' : (item.fecha_limite || '')} 
                                                                    onChange={(e) => handleTrackingUpdate(item, 'fecha_limite', e.target.value)}
                                                                    disabled={hasNoEvidencia(item)}
                                                                />
                                                            </div>

                                                            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                                                <label className="flex items-start gap-2 cursor-pointer select-none">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="mt-1"
                                                                        checked={hasNoEvidencia(item)}
                                                                        onChange={(e) => handleTrackingUpdate(item, 'no_requiere_evidencia', e.target.checked ? 1 : 0)}
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="text-xs font-semibold text-gray-700">No requiere evidencias</div>
                                                                        <div className="text-[11px] text-gray-500 leading-snug">
                                                                            Este punto se considera No aplica y no requiere fechas.
                                                                        </div>
                                                                        <div className="text-[11px] text-gray-400 mt-1">
                                                                            Docs adjuntos: {item.documentos?.length || 0}
                                                                        </div>
                                                                    </div>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="w-full lg:w-72 bg-gray-50 p-4 rounded-xl border border-purple-100 flex flex-col gap-3 self-start">
                                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">Gestión por subpuntos</div>
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-sm font-semibold text-gray-700">Estado (derivado)</div>
                                                            <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${getStatusColor(getItemDisplayEstado(item))}`}>
                                                                {getItemDisplayEstado(item)}
                                                            </span>
                                                        </div>
                                                        <div className="text-[11px] text-gray-500 leading-snug">
                                                            La fecha programada y el estado se registran en cada subpunto.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {item.subitems && item.subitems.length > 0 && (
                                            <div className="px-6 pb-6 bg-white">
                                                <div className="space-y-3">
                                                    {item.subitems.map(sub => {
                                                        const subDocs = (item.documentos || []).filter(d => d.subitem_id == sub.id);
                                                        const subEstado = sub.estado_anual || 'Pendiente';
                                                        return (
                                                            <div key={sub.id} className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                                                                <div className="p-5 hover:bg-gray-50/60 transition-colors">
                                                                    <div className="flex flex-col lg:flex-row gap-5">
                                                                        <div className={`hidden lg:block w-1 self-stretch rounded-full ${getSubStatusBar(subEstado)}`}></div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-start justify-between gap-4">
                                                                                <div className="flex items-start gap-3 min-w-0">
                                                                                    <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-md border border-gray-200 shrink-0 mt-0.5">
                                                                                        {item.numeral || '#'}
                                                                                    </span>
                                                                                    {sub.literal ? (
                                                                                        <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-md border border-purple-200 shrink-0 mt-0.5">
                                                                                            {sub.literal}
                                                                                        </span>
                                                                                    ) : null}
                                                                                    <div className="min-w-0">
                                                                                        <div className="font-bold text-gray-800 text-sm leading-snug whitespace-pre-wrap">
                                                                                            {sub.descripcion}
                                                                                        </div>
                                                                                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                                                            {item.requisito}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold shrink-0 ${getSubStatusColor(subEstado)}`}>
                                                                                    {subEstado}
                                                                                </span>
                                                                            </div>

                                                                            <div className="flex flex-wrap gap-2 mt-3">
                                                                                {subDocs.map(doc => (
                                                                                    <div key={doc.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                                                                        <div className="bg-blue-50 p-1 rounded text-blue-600">
                                                                                            <File size={12} />
                                                                                        </div>
                                                                                        <a
                                                                                            href={`${API_URL}${doc.ruta_archivo}`}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            className="hover:text-blue-600 truncate max-w-[220px]"
                                                                                            title={doc.nombre_archivo}
                                                                                        >
                                                                                            {doc.mes ? `${doc.mes} - ` : ''}{doc.nombre_archivo}
                                                                                        </a>
                                                                                        <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-400 hover:text-red-500 ml-1">
                                                                                            <X size={12}/>
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                                <button
                                                                                    onClick={() => setUploadModal({ open: true, item, subitem_id: sub.id, mes: `${trackingYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}` })}
                                                                                    className="flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900 px-3 py-1.5 rounded-lg border border-dashed border-purple-200 hover:bg-purple-50 transition-all"
                                                                                >
                                                                                    <Upload size={14} /> Adjuntar Doc.
                                                                                </button>
                                                                            </div>

                                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                                                                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">F. Programada</div>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={sub.fecha_programada || ''}
                                                                                        disabled={!!savingSubitems[sub.id]}
                                                                                        onChange={(e) => updateSubitemLocal(item.id, sub.id, { fecha_programada: e.target.value })}
                                                                                        onBlur={(e) => saveSubitemEvaluation({ ...sub, fecha_programada: e.target.value })}
                                                                                        className="w-full p-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                                                                    />
                                                                                </div>
                                                                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Estado</div>
                                                                                    <select
                                                                                        className={`w-full p-2 text-sm font-bold rounded-lg border outline-none cursor-pointer bg-white ${getSubStatusColor(subEstado)}`}
                                                                                        value={subEstado}
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
                                                                                </div>
                                                                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Observaciones</div>
                                                                                    <textarea
                                                                                        className="w-full min-h-[42px] p-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                                                                        placeholder="Observaciones del subpunto..."
                                                                                        value={sub.hallazgos || ''}
                                                                                        disabled={!!savingSubitems[sub.id]}
                                                                                        onChange={(e) => updateSubitemLocal(item.id, sub.id, { hallazgos: e.target.value })}
                                                                                        onBlur={(e) => saveSubitemEvaluation({ ...sub, hallazgos: e.target.value })}
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                                                                <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                                                                                    <div className="text-[10px] font-bold text-gray-600 uppercase">Meses</div>
                                                                                    <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                                                                        <span>P=Programado</span>
                                                                                        <span>E=Ejecutado</span>
                                                                                        <span>D=Documento</span>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="overflow-x-auto">
                                                                                    <table className="w-full text-[10px]">
                                                                                        <thead className="bg-white text-gray-500">
                                                                                            <tr>
                                                                                                {subMonths.map(m => (
                                                                                                    <th key={m.k} className="p-2 border-b border-r text-center" colSpan={3}>{m.l}</th>
                                                                                                ))}
                                                                                            </tr>
                                                                                            <tr className="bg-gray-50 text-gray-500">
                                                                                                {subMonths.map(m => (
                                                                                                    <React.Fragment key={m.k}>
                                                                                                        <th className="p-1 border-b border-r text-center bg-blue-50 text-blue-600">P</th>
                                                                                                        <th className="p-1 border-b border-r text-center bg-green-50 text-green-600">E</th>
                                                                                                        <th className="p-1 border-b border-r text-center bg-yellow-50 text-yellow-700">D</th>
                                                                                                    </React.Fragment>
                                                                                                ))}
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody className="bg-white">
                                                                                            <tr>
                                                                                                {subMonths.map(m => {
                                                                                                    const mes = `${trackingYear}-${String(m.idx + 1).padStart(2, '0')}`;
                                                                                                    const doc = (item.documentos || []).find(d => d.subitem_id == sub.id && String(d.mes || '') === mes);
                                                                                                    return (
                                                                                                        <React.Fragment key={m.k}>
                                                                                                            <td className="border-r text-center align-middle bg-blue-50/30 p-0">
                                                                                                                <input
                                                                                                                    type="checkbox"
                                                                                                                    checked={!!parseInt(sub[`${m.k}_p`])}
                                                                                                                    disabled={!!savingSubitems[sub.id]}
                                                                                                                    onChange={async (e) => {
                                                                                                                        const nextVal = e.target.checked ? 1 : 0;
                                                                                                                        const next = { ...sub, [`${m.k}_p`]: nextVal };
                                                                                                                        updateSubitemLocal(item.id, sub.id, { [`${m.k}_p`]: nextVal });
                                                                                                                        await saveSubitemEvaluation(next);
                                                                                                                    }}
                                                                                                                    className="w-3 h-3 cursor-pointer accent-blue-600"
                                                                                                                />
                                                                                                            </td>
                                                                                                            <td className="border-r text-center align-middle bg-green-50/30 p-0">
                                                                                                                <input
                                                                                                                    type="checkbox"
                                                                                                                    checked={!!parseInt(sub[`${m.k}_e`])}
                                                                                                                    disabled={!!savingSubitems[sub.id]}
                                                                                                                    onChange={async (e) => {
                                                                                                                        const nextVal = e.target.checked ? 1 : 0;
                                                                                                                        const next = { ...sub, [`${m.k}_e`]: nextVal };
                                                                                                                        updateSubitemLocal(item.id, sub.id, { [`${m.k}_e`]: nextVal });
                                                                                                                        await saveSubitemEvaluation(next);
                                                                                                                    }}
                                                                                                                    className="w-3 h-3 cursor-pointer accent-green-600"
                                                                                                                />
                                                                                                            </td>
                                                                                                            <td className="border-r text-center align-middle bg-yellow-50/30 p-0">
                                                                                                                {doc ? (
                                                                                                                    <div className="flex items-center justify-center gap-1 py-0.5 group">
                                                                                                                        <a
                                                                                                                            href={`${API_URL}${doc.ruta_archivo}`}
                                                                                                                            target="_blank"
                                                                                                                            rel="noreferrer"
                                                                                                                            title={doc.nombre_archivo}
                                                                                                                            className="text-yellow-700 hover:text-yellow-900"
                                                                                                                        >
                                                                                                                            <FileText size={12} />
                                                                                                                        </a>
                                                                                                                        <button
                                                                                                                            onClick={() => handleDeleteDoc(doc.id)}
                                                                                                                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                                                            title="Eliminar documento"
                                                                                                                        >
                                                                                                                            <X size={10} />
                                                                                                                        </button>
                                                                                                                    </div>
                                                                                                                ) : (
                                                                                                                    <button
                                                                                                                        onClick={() => setUploadModal({ open: true, item, subitem_id: sub.id, mes })}
                                                                                                                        className="w-full h-full py-1 flex items-center justify-center text-yellow-700 hover:text-yellow-900 hover:bg-yellow-100/60 transition-colors"
                                                                                                                        title={`Adjuntar documento ${mes}`}
                                                                                                                    >
                                                                                                                        <Upload size={12} />
                                                                                                                    </button>
                                                                                                                )}
                                                                                                            </td>
                                                                                                        </React.Fragment>
                                                                                                    );
                                                                                                })}
                                                                                            </tr>
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        </React.Fragment>
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
                onUpload={(item, subitemId, mes) => setUploadModal({ open: true, item, subitem_id: subitemId, mes: mes || null })}
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

            {noEvidenceModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">No hay evidencias adjuntas</h3>
                                <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                                    {noEvidenceModal.item?.requisito}
                                </p>
                            </div>
                            <button
                                onClick={() => setNoEvidenceModal({ open: false, item: null })}
                                className="text-gray-400 hover:text-gray-600"
                                title="Cerrar"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-sm text-yellow-800">
                            Para marcar como Ejecutado debes adjuntar al menos un documento. Si este punto no requiere evidencias, se marcará como No aplica y se quitarán fechas.
                        </div>

                        <div className="mt-4 flex flex-col gap-2">
                            <button
                                onClick={() => {
                                    const item = noEvidenceModal.item;
                                    setNoEvidenceModal({ open: false, item: null });
                                    if (item) setUploadModal({ open: true, item, subitem_id: null, mes: null });
                                }}
                                className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
                            >
                                <Upload size={18} /> Adjuntar evidencia
                            </button>
                            <button
                                onClick={() => noEvidenceModal.item && ejecutarSinEvidencia(noEvidenceModal.item)}
                                className="w-full px-4 py-2 rounded-lg bg-white border border-green-200 text-green-700 font-bold hover:bg-green-50 flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={18} /> Marcar sin evidencias
                            </button>
                            <button
                                onClick={() => setNoEvidenceModal({ open: false, item: null })}
                                className="w-full px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {uploadModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">
                            {uploadModal.mes ? `Subir Documento (${uploadModal.mes})` : 'Subir Documentos'}
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">{uploadModal.item.requisito}</p>
                        
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4 hover:bg-gray-50 transition-colors">
                            <input 
                                type="file" 
                                multiple={!uploadModal.mes}
                                onChange={e => {
                                    if (e.target.files) {
                                        const next = Array.from(e.target.files);
                                        if (uploadModal.mes) {
                                            setUploadFiles(next.slice(0, 1));
                                        } else {
                                            setUploadFiles(prev => [...prev, ...next]);
                                        }
                                    }
                                }}
                                className="hidden" 
                                id="fileInput"
                            />
                            <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
                                <Upload size={32} className="text-gray-400 mb-2" />
                                <span className="text-sm text-blue-600 font-medium">
                                    {uploadModal.mes ? 'Click para seleccionar un archivo' : 'Click para seleccionar uno o más archivos'}
                                </span>
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
                                    setUploadModal({ open: false, item: null, subitem_id: null, mes: null });
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
            } catch (e) {
                console.error(e);
            }
            try {
                const saved = JSON.parse(localStorage.getItem('iso_report_presets') || '[]');
                setPresets(saved);
            } catch (e) {
                console.error(e);
            }
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
        const token = localStorage.getItem('token') || '';
        if (token) append('token', token);
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

const CalendarioAlarmasView = ({ empresas }) => {
    const [selectedEmpresaId, setSelectedEmpresaId] = useState(() => localStorage.getItem('iso_calendar_empresa_id') || '');
    const [calendarCursor, setCalendarCursor] = useState(() => new Date());
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(false);

    const monthKey = `${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = (() => {
        const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        return `${months[calendarCursor.getMonth()]} ${calendarCursor.getFullYear()}`;
    })();

    const fetchEventos = useCallback(async () => {
        setLoading(true);
        try {
            const params = { action: 'list_pending_meetings', month: monthKey };
            if (selectedEmpresaId) params.empresa_id = selectedEmpresaId;
            const res = await axios.get(`${API_URL}iso.php`, { params });
            setEventos(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setEventos([]);
        } finally {
            setLoading(false);
        }
    }, [monthKey, selectedEmpresaId]);

    useEffect(() => {
        fetchEventos();
    }, [fetchEventos]);

    const eventosByDay = useMemo(() => {
        return eventos.reduce((acc, m) => {
            const key = String(m.fecha || '').slice(0, 10);
            if (!key) return acc;
            if (!acc[key]) acc[key] = [];
            acc[key].push(m);
            return acc;
        }, {});
    }, [eventos]);

    const calendarCells = useMemo(() => {
        const year = calendarCursor.getFullYear();
        const monthIdx = calendarCursor.getMonth();
        const firstDay = new Date(year, monthIdx, 1);
        const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
        const mondayStart = (firstDay.getDay() + 6) % 7;
        const totalCells = Math.ceil((mondayStart + daysInMonth) / 7) * 7;

        return Array.from({ length: totalCells }).map((_, idx) => {
            const dayNumber = idx - mondayStart + 1;
            if (dayNumber < 1 || dayNumber > daysInMonth) return null;
            const date = new Date(year, monthIdx, dayNumber);
            const yyyy = String(date.getFullYear());
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return { dayNumber, iso: `${yyyy}-${mm}-${dd}` };
        });
    }, [calendarCursor]);

    return (
        <div className="p-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-4">
                    <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Calendario</div>
                        <div className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Bell size={18} className="text-purple-600" />
                            {monthLabel}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{eventos.length} pendientes en el mes</div>
                    </div>

                    <div className="w-full lg:w-[360px]">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa (opcional)</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedEmpresaId}
                            onChange={e => {
                                const next = e.target.value;
                                setSelectedEmpresaId(next);
                                localStorage.setItem('iso_calendar_empresa_id', String(next));
                            }}
                        >
                            <option value="">Todas las empresas</option>
                            {empresas.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.nombre}{e.ruc ? ` (${e.ruc})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                            onClick={() => setCalendarCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                        >
                            Mes anterior
                        </button>
                        <button
                            type="button"
                            className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                            onClick={() => setCalendarCursor(new Date())}
                        >
                            Hoy
                        </button>
                        <button
                            type="button"
                            className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                            onClick={() => setCalendarCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                        >
                            Mes siguiente
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-2 text-[11px] font-semibold text-gray-500 mb-2">
                    {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                        <div key={d} className="px-2 py-1">{d}</div>
                    ))}
                </div>

                {loading ? (
                    <div className="py-10 text-center text-gray-500">Cargando calendario...</div>
                ) : (
                    <div className="grid grid-cols-7 gap-2">
                        {calendarCells.map((cell, idx) => {
                            const meetings = cell ? (eventosByDay[cell.iso] || []) : [];
                            const visible = meetings.slice(0, 3);
                            const extra = meetings.length - visible.length;
                            const isToday = cell ? (cell.iso === new Date().toISOString().slice(0, 10)) : false;
                            return (
                                <div
                                    key={idx}
                                    className={`min-h-[92px] rounded-lg border p-2 overflow-hidden ${
                                        cell ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                                    }`}
                                >
                                    {cell ? (
                                        <>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className={`text-xs font-bold ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                                                    {cell.dayNumber}
                                                </div>
                                                {meetings.length > 0 && (
                                                    <div className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded">
                                                        {meetings.length}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                {visible.map(m => {
                                                    const time = String(m.fecha || '').slice(11, 16);
                                                    const showTime = time && time !== '00:00' ? time : '';
                                                    const empresa = m.empresa_nombre || 'Empresa';
                                                    const tipo = m.tipo || '';
                                                    const title = `${empresa}${tipo ? ` · ${tipo}` : ''}${showTime ? ` · ${showTime}` : ''}${m.detalle ? ` · ${m.detalle}` : ''}`;
                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className="text-[10px] leading-snug px-2 py-1 rounded bg-yellow-50 border border-yellow-100 text-yellow-900 truncate"
                                                            title={title}
                                                        >
                                                            {showTime ? `${showTime} · ` : ''}{tipo ? `${tipo} · ` : ''}{empresa}
                                                        </div>
                                                    );
                                                })}
                                                {extra > 0 && (
                                                    <div className="text-[10px] text-gray-500 px-1">
                                                        +{extra} más
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

const CertificadosISOView = ({ empresas }) => {
    const [selectedEmpresaId, setSelectedEmpresaId] = useState(() => localStorage.getItem('iso_cert_empresa_id') || '');
    const [selectedNormaId, setSelectedNormaId] = useState(() => localStorage.getItem('iso_cert_norma_id') || '');
    const [certificado, setCertificado] = useState(null);
    const [certificados, setCertificados] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [file, setFile] = useState(null);
    const [form, setForm] = useState({
        fecha_inicio: '',
        fecha_mantenimiento: '',
        fecha_vencimiento: '',
        alerta_dias: 30
    });

    const empresaSelected = useMemo(() => {
        return (empresas || []).find(e => String(e.id) === String(selectedEmpresaId)) || null;
    }, [empresas, selectedEmpresaId]);

    const normasDisponibles = useMemo(() => {
        return Array.isArray(empresaSelected?.normas) ? empresaSelected.normas : [];
    }, [empresaSelected]);

    useEffect(() => {
        if (selectedEmpresaId) return;
        if (!Array.isArray(empresas) || empresas.length === 0) return;
        const first = empresas[0];
        if (!first?.id) return;
        setSelectedEmpresaId(String(first.id));
        localStorage.setItem('iso_cert_empresa_id', String(first.id));
    }, [empresas, selectedEmpresaId]);

    useEffect(() => {
        if (!selectedEmpresaId) return;
        if (selectedNormaId) return;
        if (!Array.isArray(normasDisponibles) || normasDisponibles.length === 0) return;
        const first = normasDisponibles[0];
        if (!first?.id) return;
        setSelectedNormaId(String(first.id));
        localStorage.setItem('iso_cert_norma_id', String(first.id));
    }, [normasDisponibles, selectedEmpresaId, selectedNormaId]);

    const calcDias = (dateStr) => {
        if (!dateStr) return null;
        const today = new Date();
        const d = new Date(`${dateStr}T12:00:00`);
        if (isNaN(d.getTime())) return null;
        const diff = Math.floor((d.getTime() - new Date(today.toISOString().slice(0, 10) + 'T12:00:00').getTime()) / 86400000);
        return diff;
    };

    const fetchListado = useCallback(async () => {
        if (!selectedEmpresaId) {
            setCertificados([]);
            return;
        }
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}iso.php`, {
                params: { action: 'list_certificados', empresa_id: selectedEmpresaId }
            });
            setCertificados(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setCertificados([]);
        } finally {
            setLoading(false);
        }
    }, [selectedEmpresaId]);

    const fetchCertificado = useCallback(async () => {
        if (!selectedEmpresaId || !selectedNormaId) {
            setCertificado(null);
            setForm({ fecha_inicio: '', fecha_mantenimiento: '', fecha_vencimiento: '', alerta_dias: 30 });
            setFile(null);
            return;
        }
        try {
            const res = await axios.get(`${API_URL}iso.php`, {
                params: { action: 'get_certificado', empresa_id: selectedEmpresaId, norma_id: selectedNormaId }
            });
            const row = res.data || null;
            setCertificado(row);
            setForm({
                fecha_inicio: row?.fecha_inicio || '',
                fecha_mantenimiento: row?.fecha_mantenimiento || '',
                fecha_vencimiento: row?.fecha_vencimiento || '',
                alerta_dias: Number(row?.alerta_dias || 30) || 30
            });
            setFile(null);
        } catch (e) {
            setCertificado(null);
            setForm({ fecha_inicio: '', fecha_mantenimiento: '', fecha_vencimiento: '', alerta_dias: 30 });
            setFile(null);
        }
    }, [selectedEmpresaId, selectedNormaId]);

    useEffect(() => {
        fetchListado();
    }, [fetchListado]);

    useEffect(() => {
        fetchCertificado();
    }, [fetchCertificado]);

    const handleSave = async () => {
        if (!selectedEmpresaId || !selectedNormaId) {
            toast.error('Seleccione empresa y norma');
            return;
        }
        setSaving(true);
        try {
            if (file) {
                const fd = new FormData();
                fd.append('empresa_id', selectedEmpresaId);
                fd.append('norma_id', selectedNormaId);
                fd.append('fecha_inicio', form.fecha_inicio || '');
                fd.append('fecha_mantenimiento', form.fecha_mantenimiento || '');
                fd.append('fecha_vencimiento', form.fecha_vencimiento || '');
                fd.append('alerta_dias', String(form.alerta_dias || 30));
                fd.append('file', file);
                await axios.post(`${API_URL}iso.php?action=upsert_certificado`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                await axios.post(`${API_URL}iso.php?action=upsert_certificado`, {
                    empresa_id: selectedEmpresaId,
                    norma_id: selectedNormaId,
                    fecha_inicio: form.fecha_inicio || null,
                    fecha_mantenimiento: form.fecha_mantenimiento || null,
                    fecha_vencimiento: form.fecha_vencimiento || null,
                    alerta_dias: Number(form.alerta_dias || 30) || 30
                });
            }
            toast.success('Certificado guardado');
            await fetchListado();
            await fetchCertificado();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Error al guardar certificado');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!certificado?.id) return;
        const ok = window.confirm('¿Eliminar el certificado de esta norma?');
        if (!ok) return;
        try {
            await axios.get(`${API_URL}iso.php`, { params: { action: 'delete_certificado', id: certificado.id } });
            toast.success('Certificado eliminado');
            await fetchListado();
            await fetchCertificado();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Error al eliminar');
        }
    };

    const selectedNormaLabel = useMemo(() => {
        const n = normasDisponibles.find(x => String(x.id) === String(selectedNormaId));
        if (!n) return '';
        return `${n.codigo || ''} ${n.nombre || ''}`.trim();
    }, [normasDisponibles, selectedNormaId]);

    const alertas = useMemo(() => {
        return (certificados || []).map(c => {
            const alertaDias = Number(c.alerta_dias || 30) || 30;
            const diasV = calcDias(c.fecha_vencimiento);
            const diasM = calcDias(c.fecha_mantenimiento);
            const alertaV = diasV !== null && diasV <= alertaDias;
            const alertaM = diasM !== null && diasM <= alertaDias;
            return { ...c, dias_vencimiento: diasV, dias_mantenimiento: diasM, alertaV, alertaM };
        }).sort((a, b) => {
            const av = a.dias_vencimiento ?? 999999;
            const bv = b.dias_vencimiento ?? 999999;
            return av - bv;
        });
    }, [certificados]);

    return (
        <div className="p-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 mb-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Certificados</div>
                        <div className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
                            <File size={18} className="text-blue-600" />
                            Subir certificado por empresa y norma
                        </div>
                    </div>
                    <button
                        type="button"
                        className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                        onClick={fetchListado}
                        disabled={loading}
                    >
                        Actualizar
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedEmpresaId}
                            onChange={e => {
                                const next = e.target.value;
                                setSelectedEmpresaId(next);
                                localStorage.setItem('iso_cert_empresa_id', String(next));
                                setSelectedNormaId('');
                                localStorage.setItem('iso_cert_norma_id', '');
                            }}
                        >
                            <option value="">Seleccione...</option>
                            {empresas.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.nombre}{e.ruc ? ` (${e.ruc})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Norma</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedNormaId}
                            onChange={e => {
                                const next = e.target.value;
                                setSelectedNormaId(next);
                                localStorage.setItem('iso_cert_norma_id', String(next));
                            }}
                            disabled={!selectedEmpresaId}
                        >
                            <option value="">Seleccione...</option>
                            {normasDisponibles.map(n => (
                                <option key={n.id} value={n.id}>
                                    {n.codigo} - {n.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col justify-end gap-2">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                                onClick={handleSave}
                                disabled={!selectedEmpresaId || !selectedNormaId || saving}
                            >
                                Guardar
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                onClick={() => {
                                    setForm({ fecha_inicio: '', fecha_mantenimiento: '', fecha_vencimiento: '', alerta_dias: 30 });
                                    setFile(null);
                                }}
                                disabled={saving}
                            >
                                Limpiar
                            </button>
                        </div>
                        <div className="text-xs text-gray-500 truncate" title={selectedNormaLabel}>
                            {selectedNormaLabel || 'Seleccione una norma para registrar fechas y archivo'}
                        </div>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.fecha_inicio}
                            onChange={e => setForm(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha mantenimiento</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.fecha_mantenimiento}
                            onChange={e => setForm(prev => ({ ...prev, fecha_mantenimiento: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha vencimiento</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.fecha_vencimiento}
                            onChange={e => setForm(prev => ({ ...prev, fecha_vencimiento: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Alerta anticipada (días)</label>
                        <input
                            type="number"
                            min="1"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.alerta_dias}
                            onChange={e => setForm(prev => ({ ...prev, alerta_dias: Number(e.target.value || 0) }))}
                        />
                    </div>
                </div>

                <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Archivo (PDF/JPG/PNG)</label>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={e => setFile(e.target.files?.[0] || null)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        {certificado?.nombre_archivo && !file && (
                            <div className="text-xs text-gray-500 mt-1 truncate" title={certificado.nombre_archivo}>
                                Actual: {certificado.nombre_archivo}
                            </div>
                        )}
                        {file && (
                            <div className="text-xs text-gray-500 mt-1 truncate" title={file.name}>
                                Seleccionado: {file.name}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 md:justify-end">
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60 flex items-center gap-2"
                            onClick={() => {
                                if (certificado?.ruta_archivo) {
                                    window.open(`${API_URL}${certificado.ruta_archivo}`, '_blank', 'noopener,noreferrer');
                                }
                            }}
                            disabled={!certificado?.ruta_archivo}
                        >
                            <Eye size={16} /> Ver archivo
                        </button>
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
                            onClick={handleDelete}
                            disabled={!certificado?.id}
                        >
                            <Trash2 size={16} /> Eliminar
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                        <Timer size={18} className="text-red-600" /> Alertas por empresa
                    </h3>
                    <div className="text-xs text-gray-500">
                        {loading ? 'Cargando...' : `${alertas.length} registros`}
                    </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Norma</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Inicio</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Mantenimiento</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Vencimiento</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Días</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Archivo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500">Cargando...</td>
                                </tr>
                            ) : alertas.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500">No hay certificados registrados</td>
                                </tr>
                            ) : (
                                alertas.map(c => {
                                    const norma = `${c.norma_codigo || ''} ${c.norma_nombre || ''}`.trim();
                                    const dias = c.dias_vencimiento ?? c.dias_mantenimiento ?? null;
                                    const overdue = typeof dias === 'number' && dias < 0;
                                    const alert = c.alertaV || c.alertaM;
                                    const badge = overdue ? 'bg-red-100 text-red-700' : alert ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700';
                                    const badgeText = overdue ? 'Vencido' : alert ? 'Alerta' : 'OK';
                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-700">{norma || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{c.fecha_inicio || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{c.fecha_mantenimiento || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{c.fecha_vencimiento || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${badge}`}>{badgeText}</span>
                                                <span className="ml-2 font-bold text-gray-700">{typeof dias === 'number' ? dias : '-'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {c.ruta_archivo ? (
                                                    <a
                                                        href={`${API_URL}${c.ruta_archivo}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        title={c.nombre_archivo || 'Ver'}
                                                    >
                                                        <Download size={14} /> Ver
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-gray-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const CoordinacionesView = ({ empresas }) => {
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [coordinaciones, setCoordinaciones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [canManage, setCanManage] = useState(false);
    const [currentUserId] = useState(() => {
        try {
            const u = JSON.parse(localStorage.getItem('user') || '{}') || {};
            return Number(u.id || u.user_id || u.usuario_id || 0) || 0;
        } catch (e) {
            return 0;
        }
    });

    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        fecha: new Date().toISOString().split('T')[0],
        tipo: 'Reunión',
        detalle: '',
        estado: 'Completado'
    });

    useEffect(() => {
        const loadPerms = async () => {
            try {
                const token = localStorage.getItem('token') || '';
                if (!token) {
                    setCanManage(false);
                    return;
                }
                const res = await axios.get(`${API_URL}check_my_permissions.php?code=gestion_iso&token=${encodeURIComponent(token)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    _suppressForbiddenToast: true
                });
                const p = res?.data || {};
                const manage = Number(p.editar || 0) === 1 || Number(p.escritura || 0) === 1 || Number(p.crear || 0) === 1;
                setCanManage(manage);
            } catch (e) {
                try {
                    const mods = JSON.parse(localStorage.getItem('modulos') || '[]') || [];
                    const m = mods.find(x => String(x.codigo || '') === 'gestion_iso');
                    const manage = m ? (Number(m.permiso_crear || 0) === 1 || Number(m.permiso_editar || 0) === 1 || Number(m.permiso_escritura || 0) === 1) : false;
                    setCanManage(manage);
                } catch (e2) {
                    setCanManage(false);
                }
            }
        };
        loadPerms();
    }, []);

    useEffect(() => {
        if (selectedEmpresaId) return;
        if (!Array.isArray(empresas) || empresas.length === 0) return;

        const saved = localStorage.getItem('iso_selected_empresa_id') || '';
        const exists = saved && empresas.some(e => String(e.id) === String(saved));

        setSelectedEmpresaId(exists ? String(saved) : String(empresas[0].id));
    }, [empresas, selectedEmpresaId]);

    const fetchCoordinaciones = useCallback(async (empresaId) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}iso.php`, {
                params: { action: 'list_coordinaciones', empresa_id: empresaId }
            });
            setCoordinaciones(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setCoordinaciones([]);
            toast.error(e?.response?.data?.message || 'Error al cargar coordinaciones');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedEmpresaId) {
            fetchCoordinaciones(selectedEmpresaId);
        } else {
            setCoordinaciones([]);
        }
    }, [selectedEmpresaId, fetchCoordinaciones]);

    const openModal = (coord = null) => {
        const canEditRow = coord ? (canManage || String(coord.usuario_id) === String(currentUserId)) : canManage;
        if (!canEditRow) {
            toast.error('No tienes permiso para esta acción');
            return;
        }
        if (coord) {
            setIsEditing(true);
            setEditingId(coord.id);
            setForm({
                fecha: String(coord.fecha || '').slice(0, 10) || new Date().toISOString().split('T')[0],
                tipo: coord.tipo || 'Reunión',
                detalle: coord.detalle || '',
                estado: coord.estado || 'Completado'
            });
        } else {
            setIsEditing(false);
            setEditingId(null);
            setForm({
                fecha: new Date().toISOString().split('T')[0],
                tipo: 'Reunión',
                detalle: '',
                estado: 'Completado'
            });
        }
        setShowModal(true);
    };

    const handleSubmitCoordinacion = async (e) => {
        e.preventDefault();
        if (!canManage) {
            toast.error('No tienes permiso para esta acción');
            return;
        }
        if (!selectedEmpresaId) {
            toast.error('Seleccione una empresa válida');
            return;
        }
        try {
            if (isEditing && editingId) {
                await axios.post(`${API_URL}iso.php?action=update_coordinacion`, {
                    id: editingId,
                    fecha: form.fecha,
                    tipo: form.tipo,
                    detalle: form.detalle,
                    estado: form.estado
                });
                toast.success('Coordinación actualizada');
            } else {
                await axios.post(`${API_URL}iso.php?action=create_coordinacion`, {
                    empresa_id: selectedEmpresaId,
                    fecha: form.fecha,
                    tipo: form.tipo,
                    detalle: form.detalle,
                    estado: form.estado
                });
                toast.success('Coordinación registrada');
            }
            setShowModal(false);
            await fetchCoordinaciones(selectedEmpresaId);
        } catch (error) {
            toast.error(error.response?.data?.message || (isEditing ? 'Error al actualizar coordinación' : 'Error al registrar coordinación'));
        }
    };

    const handleDelete = async (coord) => {
        if (!selectedEmpresaId) return;
        if (!(canManage || String(coord.usuario_id) === String(currentUserId))) {
            toast.error('No tienes permiso para esta acción');
            return;
        }
        const ok = window.confirm('¿Desea eliminar esta coordinación?');
        if (!ok) return;
        try {
            await axios.get(`${API_URL}iso.php?action=delete_coordinacion&id=${coord.id}`);
            toast.success('Coordinación eliminada');
            await fetchCoordinaciones(selectedEmpresaId);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error al eliminar coordinación');
        }
    };

    return (
        <div className="p-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between mb-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa (ISO)</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedEmpresaId}
                            onChange={e => {
                                const next = e.target.value;
                                setSelectedEmpresaId(next);
                                if (next) localStorage.setItem('iso_selected_empresa_id', String(next));
                            }}
                        >
                            <option value="">Seleccione Empresa...</option>
                            {empresas.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.nombre}{e.ruc ? ` (${e.ruc})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                            onClick={() => {
                                if (selectedEmpresaId) fetchCoordinaciones(selectedEmpresaId);
                            }}
                            disabled={!selectedEmpresaId || loading}
                        >
                            Actualizar
                        </button>
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60"
                            onClick={() => openModal(null)}
                            disabled={!selectedEmpresaId || !canManage}
                        >
                            <Plus size={18} /> Nueva coordinación
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Usuario</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Tipo</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Detalle</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500">Cargando...</td>
                                </tr>
                            ) : coordinaciones.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500">No hay coordinaciones registradas</td>
                                </tr>
                            ) : (
                                coordinaciones.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{String(c.fecha || '').slice(0, 10)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{c.usuario_nombre || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{c.tipo || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xl truncate" title={c.detalle || ''}>{c.detalle || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{c.estado || '-'}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-center gap-2">
                                                {(canManage || String(c.usuario_id) === String(currentUserId)) ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                                                            title="Editar"
                                                            onClick={() => openModal(c)}
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                                            title="Eliminar"
                                                            onClick={() => handleDelete(c)}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-gray-400 px-2 py-2">-</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Calendar size={18} className="text-blue-600" />
                                {isEditing ? 'Editar coordinación' : 'Nueva coordinación'}
                            </h2>
                            <button
                                type="button"
                                className="text-gray-500 hover:text-gray-700"
                                onClick={() => setShowModal(false)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitCoordinacion} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        value={form.fecha}
                                        onChange={e => setForm({ ...form, fecha: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                        value={form.tipo}
                                        onChange={e => setForm({ ...form, tipo: e.target.value })}
                                    >
                                        <option value="Reunión">Reunión</option>
                                        <option value="Llamada">Llamada</option>
                                        <option value="Visita">Visita</option>
                                        <option value="Correo">Correo</option>
                                        <option value="Otro">Otro</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Detalle</label>
                                <textarea
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 h-28"
                                    value={form.detalle}
                                    onChange={e => setForm({ ...form, detalle: e.target.value })}
                                    placeholder="Detalles de la coordinación..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                    value={form.estado}
                                    onChange={e => setForm({ ...form, estado: e.target.value })}
                                >
                                    <option value="Completado">Completado</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Cancelado">Cancelado</option>
                                </select>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                    type="button"
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    {isEditing ? 'Actualizar' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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
        const prevAuth = axios.defaults.headers?.common?.Authorization;
        const token = localStorage.getItem('token');
        if (token) {
            axios.defaults.headers.common.Authorization = `Bearer ${token}`;
        }
        return () => {
            if (typeof prevAuth === 'undefined') {
                delete axios.defaults.headers.common.Authorization;
            } else {
                axios.defaults.headers.common.Authorization = prevAuth;
            }
        };
    }, []);

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
                        onClick={() => setActiveTab('coordinaciones')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'coordinaciones' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Calendar size={20} /> Coordinaciones
                    </button>
                    <button 
                        onClick={() => setActiveTab('calendario_alarmas')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'calendario_alarmas' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Bell size={20} /> Calendario (alarma)
                    </button>
                    <button 
                        onClick={() => setActiveTab('certificados')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'certificados' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <File size={20} /> Certificados
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
                        {activeTab === 'coordinaciones' && 'Coordinaciones con Clientes'}
                        {activeTab === 'calendario_alarmas' && 'Calendario de Reuniones / Visitas'}
                        {activeTab === 'certificados' && 'Certificados ISO'}
                    </h2>
                </header>

                <main>
                    {activeTab === 'dashboard' && <DashboardView empresas={empresas} />}
                    {activeTab === 'empresas' && <EmpresasView />}
                    {activeTab === 'normas' && <NormasView />}
                    {activeTab === 'tracking' && <TrackingView empresas={empresas} />}
                    {activeTab === 'coordinaciones' && <CoordinacionesView empresas={empresas} />}
                    {activeTab === 'calendario_alarmas' && <CalendarioAlarmasView empresas={empresas} />}
                    {activeTab === 'certificados' && <CertificadosISOView empresas={empresas} />}
                    {activeTab === 'reportes' && <ReportBuilderView />}
                </main>
            </div>
        </div>
    );
};

export default GestionISO;
