import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
    Plus, Search, Edit, Trash, UserPlus, Phone, Mail, MessageSquare, 
    Building, User, LayoutGrid, Kanban, Calendar, ArrowRight, Download, 
    Settings, Copy, RefreshCw, DollarSign, Tag, Percent, Clock, 
    CheckCircle, XCircle, AlertCircle, FileText, Send 
} from 'lucide-react';

import { API_URL } from '../api/config';
import { generateCotizacionPDF } from '../utils/cotizacionPdf';

const Crm = () => {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [leadToDelete, setLeadToDelete] = useState(null);
    const [editingLead, setEditingLead] = useState(null);
    const [users, setUsers] = useState([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [viewMode, setViewMode] = useState('kanban'); // 'list' or 'kanban'
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [configData, setConfigData] = useState({ api_key: '', endpoint: '' });
    
    // Activity State
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'activities'
    const [activities, setActivities] = useState([]);
    const [newActivity, setNewActivity] = useState({ tipo: 'Nota', descripcion: '' });
    const [loadingActivities, setLoadingActivities] = useState(false);

    const user = JSON.parse(localStorage.getItem('user'));
    const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
    };

    const initialFormState = {
        nombre: '',
        email: '',
        telefono: '',
        empresa: '',
        mensaje: '',
        estado: 'Nuevo',
        assigned_to: '',
        valor: '',
        probabilidad: '',
        fecha_cierre_esperada: '',
        etiquetas: '',
        cotizaciones: []
    };

    const [formData, setFormData] = useState(initialFormState);
    
    // Cotizaciones Search State
    const [cotizacionSearch, setCotizacionSearch] = useState('');
    const [cotizacionResults, setCotizacionResults] = useState([]);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const delayDebounceFn = setTimeout(() => {
            if (cotizacionSearch.length >= 2) {
                performCotizacionSearch(signal);
            } else {
                setCotizacionResults([]);
            }
        }, 800); // Increased debounce to 800ms

        return () => {
            clearTimeout(delayDebounceFn);
            controller.abort();
        };
    }, [cotizacionSearch]);

    const performCotizacionSearch = async (signal) => {
        try {
            const res = await axios.get(`${API_URL}crm.php?action=search_cotizaciones&q=${cotizacionSearch}`, { 
                headers,
                signal // Pass abort signal
            });
            setCotizacionResults(res.data);
        } catch (error) {
            if (axios.isCancel(error)) {
                // Request cancelled, ignore
            } else {
                console.error("Error searching cotizaciones", error);
            }
        }
    };

    const addCotizacionToLead = (cot) => {
        if (!formData.cotizaciones.some(c => c.id === cot.id)) {
            setFormData({
                ...formData,
                cotizaciones: [...(formData.cotizaciones || []), cot]
            });
        }
        setCotizacionSearch('');
        setCotizacionResults([]);
    };

    const removeCotizacionFromLead = (cotId) => {
        setFormData({
            ...formData,
            cotizaciones: formData.cotizaciones.filter(c => c.id !== cotId)
        });
    };

    const handleDownloadPdf = async (e, cot) => {
        e.stopPropagation();
        e.preventDefault();

        let fullCotData = cot;
        if (!cot.items || !Array.isArray(cot.items)) {
             try {
                 const toastId = toast.loading("Obteniendo datos...");
                 const res = await axios.get(`${API_URL}cotizaciones.php?action=get&id=${cot.id}`, { headers });
                 fullCotData = res.data;
                 toast.dismiss(toastId);
             } catch (error) {
                 console.error("Error fetching full cotizacion details", error);
                 toast.error("Error al obtener detalles de la cotización");
                 return;
             }
        }
        
        await generateCotizacionPDF(fullCotData, headers, 'save');
    };

    useEffect(() => {
        fetchLeads();
        checkAdmin();
    }, []);

    const checkAdmin = () => {
        if (user && (user.rol_nombre === 'admin' || user.rol === 'admin' || user.rol_nombre === 'gerencia')) {
            setIsAdmin(true);
            fetchUsers();
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await axios.get(`${API_URL}crm.php?action=get_users`, { headers });
            setUsers(res.data);
        } catch (error) {
            console.error("Error fetching users", error);
        }
    };

    const fetchConfig = async () => {
        try {
            const res = await axios.get(`${API_URL}/crm.php?action=get_config`, { headers });
            setConfigData(res.data);
        } catch (error) {
            toast.error("Error al cargar configuración");
        }
    };

    const handleRegenerateKey = async () => {
        if(!window.confirm("¿Seguro? La clave anterior dejará de funcionar en todos los sitios conectados.")) return;
        try {
            const res = await axios.post(`${API_URL}crm.php?action=regenerate_key`, {}, { headers });
            setConfigData(prev => ({ ...prev, api_key: res.data.api_key }));
            toast.success("Clave regenerada");
        } catch (error) {
            toast.error("Error al regenerar clave");
        }
    };

    const fetchLeads = async () => {
        try {
            const res = await axios.get(`${API_URL}/crm.php?action=list`, { headers });
            if (Array.isArray(res.data)) {
                setLeads(res.data);
            } else {
                setLeads([]);
            }
        } catch (error) {
            console.error("Error cargando leads:", error);
            toast.error("Error al cargar leads");
            setLeads([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchActivities = async (leadId) => {
        setLoadingActivities(true);
        try {
            const res = await axios.get(`${API_URL}crm.php?action=get_activities&lead_id=${leadId}`, { headers });
            setActivities(res.data);
        } catch (error) {
            console.error("Error fetching activities", error);
        } finally {
            setLoadingActivities(false);
        }
    };

    const handleAddActivity = async (e) => {
        e.preventDefault();
        if (!editingLead) return;
        
        try {
            await axios.post(`${API_URL}crm.php?action=add_activity`, {
                lead_id: editingLead.id,
                ...newActivity
            }, { headers });
            
            setNewActivity({ tipo: 'Nota', descripcion: '' });
            fetchActivities(editingLead.id);
            toast.success("Actividad registrada");
            fetchLeads(); // Refresh to update last activity timestamp on card
        } catch (error) {
            toast.error("Error al registrar actividad");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const action = editingLead ? 'update' : 'create';
            const payload = editingLead ? { ...formData, id: editingLead.id } : formData;
            
            await axios.post(`${API_URL}crm.php?action=${action}`, payload, { headers });
            
            toast.success(editingLead ? "Lead actualizado" : "Lead creado");
            setShowModal(false);
            setEditingLead(null);
            resetForm();
            fetchLeads();
        } catch (error) {
            toast.error("Error al guardar lead");
        }
    };

    const handleDelete = (id) => {
        setLeadToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!leadToDelete) return;
        try {
            await axios.post(`${API_URL}/crm.php?action=delete&id=${leadToDelete}`, {}, { headers });
            toast.success("Lead eliminado");
            fetchLeads();
            setShowDeleteModal(false);
            setShowModal(false); // Close edit modal if open
            setLeadToDelete(null);
        } catch (error) {
            toast.error("Error al eliminar");
        }
    };

    const handleDragStart = (e, leadId) => {
        e.dataTransfer.setData('leadId', leadId);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = async (e, newStatus) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        if (!leadId) return;

        // Optimistic update
        const updatedLeads = leads.map(l => l.id === parseInt(leadId) ? { ...l, estado: newStatus } : l);
        setLeads(updatedLeads);

        try {
            await axios.post(`${API_URL}crm.php?action=update`, { id: leadId, estado: newStatus }, { headers });
            toast.success(`Movido a ${newStatus}`);
        } catch (error) {
            toast.error("Error al actualizar estado");
            fetchLeads(); // Revert on error
        }
    };

    const resetForm = () => {
        setFormData({ ...initialFormState, assigned_to: user.id });
        setActivities([]);
        setActiveTab('details');
    };

    const openEdit = (lead) => {
        setEditingLead(lead);
        setFormData({
            nombre: lead.nombre,
            email: lead.email,
            telefono: lead.telefono,
            empresa: lead.empresa,
            mensaje: lead.mensaje,
            estado: lead.estado,
            assigned_to: lead.assigned_to,
            valor: lead.valor || '',
            probabilidad: lead.probabilidad || '',
            fecha_cierre_esperada: lead.fecha_cierre_esperada || '',
            etiquetas: lead.etiquetas || '',
            cotizaciones: lead.cotizaciones || []
        });
        fetchActivities(lead.id);
        setShowModal(true);
    };

    const filteredLeads = Array.isArray(leads) ? leads.filter(l => 
        (l.nombre && l.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.email && l.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.empresa && l.empresa.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : [];

    const columns = [
        { id: 'Nuevo', title: 'Nuevos', color: 'bg-blue-50 text-blue-800', border: 'border-blue-200' },
        { id: 'Contactado', title: 'Contactados', color: 'bg-yellow-50 text-yellow-800', border: 'border-yellow-200' },
        { id: 'Interesado', title: 'Interesados', color: 'bg-orange-50 text-orange-800', border: 'border-orange-200' },
        { id: 'Cliente', title: 'Clientes Ganados', color: 'bg-green-50 text-green-800', border: 'border-green-200' },
        { id: 'Perdido', title: 'Perdidos', color: 'bg-red-50 text-red-800', border: 'border-red-200' },
    ];

    const getColumnTotal = (status) => {
        return filteredLeads
            .filter(l => l.estado === status)
            .reduce((sum, l) => sum + parseFloat(l.valor || 0), 0);
    };

    const KanbanCard = ({ lead }) => (
        <div 
            draggable 
            onDragStart={(e) => handleDragStart(e, lead.id)}
            className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all cursor-move mb-3 group"
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-800 truncate text-sm" title={lead.nombre}>{lead.nombre}</h4>
                <button onClick={(e) => { e.stopPropagation(); openEdit(lead); }} className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit size={14} />
                </button>
            </div>
            
            {lead.empresa && (
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-2 font-medium">
                    <Building size={12} /> {lead.empresa}
                </div>
            )}

            <div className="flex flex-wrap gap-1 mb-2">
                {lead.valor > 0 && (
                    <span className="bg-green-50 text-green-700 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 font-semibold">
                        <DollarSign size={10} /> {parseFloat(lead.valor).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </span>
                )}
                {lead.probabilidad > 0 && (
                    <span className="bg-purple-50 text-purple-700 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Percent size={10} /> {lead.probabilidad}%
                    </span>
                )}
            </div>

            {lead.etiquetas && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {lead.etiquetas.split(',').map((tag, idx) => (
                        <span key={idx} className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded border border-gray-200">
                            {tag.trim()}
                        </span>
                    ))}
                </div>
            )}
            
            <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-400">
                <span title="Fecha de creación">{new Date(lead.created_at).toLocaleDateString()}</span>
                {lead.ultima_actividad && (
                    <span className="flex items-center gap-1 text-blue-400" title="Última actividad">
                        <Clock size={10} /> {new Date(lead.ultima_actividad).toLocaleDateString()}
                    </span>
                )}
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-6 max-w-[1800px] mx-auto h-[calc(100vh-80px)] flex flex-col">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <UserPlus className="text-blue-600" /> CRM - Pipeline
                    </h1>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><User size={14}/> Total: <strong>{leads.length}</strong></span>
                        <span className="flex items-center gap-1 text-green-600"><DollarSign size={14}/> Valor Pipeline: <strong>S/ {leads.reduce((acc, l) => acc + parseFloat(l.valor || 0), 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong></span>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                     <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                        <input 
                            type="text"
                            placeholder="Buscar leads..."
                            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Kanban size={18} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                            <LayoutGrid size={18} />
                        </button>
                    </div>

                    {isAdmin && (
                        <button onClick={() => { fetchConfig(); setShowSettingsModal(true); }} className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                            <Settings size={18} />
                        </button>
                    )}

                    <button 
                        onClick={() => { resetForm(); setShowModal(true); }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium whitespace-nowrap shadow-sm"
                    >
                        <Plus size={18} /> Nuevo Lead
                    </button>
                </div>
            </div>

            {/* Kanban / List View */}
            <div className="flex-grow overflow-hidden relative">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : viewMode === 'kanban' ? (
                    <div className="h-full overflow-x-auto pb-4">
                        <div className="flex gap-4 h-full min-w-max px-1">
                            {columns.map(col => (
                                <div 
                                    key={col.id} 
                                    className="flex-shrink-0 w-80 bg-gray-50/80 rounded-xl flex flex-col h-full border border-gray-200"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, col.id)}
                                >
                                    {/* Column Header */}
                                    <div className={`p-3 border-b border-gray-100 rounded-t-xl ${col.color}`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <h3 className="font-bold text-sm">{col.title}</h3>
                                            <span className="bg-white/60 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">
                                                {filteredLeads.filter(l => l.estado === col.id).length}
                                            </span>
                                        </div>
                                        <div className="text-xs font-medium opacity-80">
                                            S/ {getColumnTotal(col.id).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    
                                    {/* Cards */}
                                    <div className="p-2 overflow-y-auto flex-grow scrollbar-thin scrollbar-thumb-gray-300">
                                        {filteredLeads.filter(l => l.estado === col.id).map(lead => (
                                            <KanbanCard key={lead.id} lead={lead} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto h-full pb-4">
                        {filteredLeads.map(lead => (
                            <div key={lead.id} className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-gray-800">{lead.nombre}</h3>
                                    <button onClick={() => openEdit(lead)} className="text-blue-600 hover:bg-blue-50 p-1 rounded">
                                        <Edit size={16} />
                                    </button>
                                </div>
                                <div className="space-y-1 text-sm text-gray-600 mb-3">
                                    <div className="flex items-center gap-2"><Building size={14}/> {lead.empresa || 'Sin empresa'}</div>
                                    <div className="flex items-center gap-2"><Mail size={14}/> {lead.email || '-'}</div>
                                    <div className="flex items-center gap-2"><DollarSign size={14} className="text-green-600"/> S/ {parseFloat(lead.valor || 0).toLocaleString()}</div>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                    <span className={`text-xs px-2 py-1 rounded-full ${columns.find(c => c.id === lead.estado)?.color || 'bg-gray-100'}`}>
                                        {lead.estado}
                                    </span>
                                    <span className="text-xs text-gray-400">{new Date(lead.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-bold text-gray-800">
                                {editingLead ? 'Detalles del Lead' : 'Nuevo Lead'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-red-500">
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Tabs */}
                        {editingLead && (
                            <div className="flex border-b bg-white px-4">
                                <button 
                                    onClick={() => setActiveTab('details')}
                                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    Información
                                </button>
                                <button 
                                    onClick={() => setActiveTab('activities')}
                                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'activities' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    Actividades y Notas
                                </button>
                            </div>
                        )}

                        <div className="flex-grow overflow-y-auto p-6 bg-gray-50">
                            {activeTab === 'details' ? (
                                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-gray-700 border-b pb-2">Información de Contacto</h3>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre Completo *</label>
                                            <input type="text" required className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Empresa</label>
                                            <input type="text" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.empresa} onChange={e => setFormData({...formData, empresa: e.target.value})} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                                                <input type="email" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                                                <input type="text" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-gray-700 border-b pb-2">Detalles del Negocio</h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Valor (S/)</label>
                                                <input type="number" step="0.01" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Probabilidad (%)</label>
                                                <input type="number" min="0" max="100" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.probabilidad} onChange={e => setFormData({...formData, probabilidad: e.target.value})} />
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                                                <select className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})}>
                                                    {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Cierre Esperado</label>
                                                <input type="date" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.fecha_cierre_esperada} onChange={e => setFormData({...formData, fecha_cierre_esperada: e.target.value})} />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Etiquetas (separadas por coma)</label>
                                            <input type="text" placeholder="Ej: Urgente, VIP, Referido" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.etiquetas} onChange={e => setFormData({...formData, etiquetas: e.target.value})} />
                                        </div>

                                        <div className="md:col-span-2 space-y-2">
                                            <label className="block text-xs font-medium text-gray-700">Cotizaciones Vinculadas</label>
                                            
                                            <div className="relative">
                                                <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                                                    <Search size={16} className="ml-2 text-gray-400" />
                                                    <input 
                                                        type="text" 
                                                        placeholder="Buscar por código, cliente o monto..." 
                                                        className="w-full p-2 outline-none text-sm"
                                                        value={cotizacionSearch}
                                                        onChange={e => setCotizacionSearch(e.target.value)}
                                                    />
                                                </div>
                                                
                                                {/* Results Dropdown */}
                                                {cotizacionResults.length > 0 && (
                                                    <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                                        {cotizacionResults.map(cot => (
                                                            <div 
                                                                key={cot.id} 
                                                                onClick={() => addCotizacionToLead(cot)}
                                                                className="p-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm group"
                                                            >
                                                                <div className="flex justify-between items-start">
                                                                    <div className="font-medium">
                                                                        {cot.correlativo && <span className="inline-block bg-gray-100 text-gray-600 text-xs px-1 rounded mr-2 border border-gray-200">{cot.serie ? `${cot.serie}-${cot.correlativo}` : `#${cot.correlativo}`}</span>}
                                                                        {cot.cliente_razon_social}
                                                                    </div>
                                                                    <button 
                                                                        onClick={(e) => handleDownloadPdf(e, cot)}
                                                                        className="text-gray-400 hover:text-blue-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        title="Descargar PDF"
                                                                    >
                                                                        <Download size={14} />
                                                                    </button>
                                                                </div>
                                                                <div className="text-xs text-gray-500 flex justify-between mt-1">
                                                                    <span>{new Date(cot.fecha_emision).toLocaleDateString()}</span>
                                                                    <span className="font-semibold text-green-600">{cot.moneda} {cot.total_importe}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Selected Cotizaciones */}
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {formData.cotizaciones && formData.cotizaciones.map(cot => (
                                                    <div key={cot.id} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs flex items-center gap-2 border border-blue-100">
                                                        <FileText size={12} />
                                                        <span>
                                                            {cot.correlativo ? <span className="font-mono font-semibold mr-1">{cot.serie ? `${cot.serie}-${cot.correlativo}` : `#${cot.correlativo}`}</span> : ''}
                                                            {cot.cliente_razon_social || `Cotización #${cot.id}`} - {cot.moneda} {cot.total_importe}
                                                        </span>
                                                        <div className="flex items-center border-l border-blue-200 pl-2 ml-1 gap-1">
                                                            <button type="button" onClick={(e) => handleDownloadPdf(e, cot)} className="hover:text-blue-900" title="Descargar PDF">
                                                                <Download size={12} />
                                                            </button>
                                                            <button type="button" onClick={() => removeCotizacionFromLead(cot.id)} className="hover:text-red-500" title="Quitar">
                                                                <XCircle size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {isAdmin && (
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Asignar a</label>
                                                <select className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})}>
                                                    {users.map(u => (
                                                        <option key={u.id} value={u.id}>{u.usuario}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Descripción / Mensaje Inicial</label>
                                        <textarea rows="3" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" value={formData.mensaje} onChange={e => setFormData({...formData, mensaje: e.target.value})}></textarea>
                                    </div>
                                    
                                    <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t">
                                        {editingLead && (
                                            <button type="button" onClick={() => handleDelete(editingLead.id)} className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium mr-auto">
                                                Eliminar Lead
                                            </button>
                                        )}
                                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancelar</button>
                                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium shadow-sm">
                                            {editingLead ? 'Guardar Cambios' : 'Crear Lead'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="space-y-6">
                                    {/* New Activity Form */}
                                    <form onSubmit={handleAddActivity} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Registrar Nueva Actividad</h3>
                                        <div className="flex gap-2 mb-3">
                                            {['Nota', 'Llamada', 'Reunion', 'Email'].map(type => (
                                                <button 
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setNewActivity({...newActivity, tipo: type})}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                                        newActivity.tipo === type 
                                                        ? 'bg-blue-600 text-white border-blue-600' 
                                                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Describe la actividad..." 
                                                className="flex-grow p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={newActivity.descripcion}
                                                onChange={e => setNewActivity({...newActivity, descripcion: e.target.value})}
                                                required
                                            />
                                            <button type="submit" className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                                <Send size={18} />
                                            </button>
                                        </div>
                                    </form>

                                    {/* Activity Timeline */}
                                    <div className="space-y-4">
                                        {loadingActivities ? (
                                            <div className="text-center text-gray-400 py-4">Cargando historial...</div>
                                        ) : activities.length === 0 ? (
                                            <div className="text-center text-gray-400 py-4 text-sm">No hay actividades registradas</div>
                                        ) : (
                                            activities.map(act => (
                                                <div key={act.id} className="flex gap-3">
                                                    <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white ${
                                                        act.tipo === 'Llamada' ? 'bg-green-500' :
                                                        act.tipo === 'Reunion' ? 'bg-purple-500' :
                                                        act.tipo === 'Email' ? 'bg-blue-500' : 'bg-gray-500'
                                                    }`}>
                                                        {act.tipo === 'Llamada' ? <Phone size={14} /> :
                                                         act.tipo === 'Reunion' ? <UserPlus size={14} /> :
                                                         act.tipo === 'Email' ? <Mail size={14} /> : <FileText size={14} />}
                                                    </div>
                                                    <div className="flex-grow bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                                        <div className="flex justify-between items-start">
                                                            <span className="text-sm font-semibold text-gray-800">{act.tipo}</span>
                                                            <span className="text-xs text-gray-400">{new Date(act.fecha).toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-sm text-gray-600 mt-1">{act.descripcion}</p>
                                                        <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                                                            <User size={10} /> {act.usuario_nombre}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                        <h2 className="text-xl font-bold mb-4">Configuración API (WordPress)</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Endpoint URL</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input type="text" readOnly value={configData.endpoint} className="w-full p-2 bg-gray-50 border rounded text-xs font-mono text-gray-600" />
                                    <button onClick={() => { navigator.clipboard.writeText(configData.endpoint); toast.success("Copiado"); }} className="p-2 hover:bg-gray-100 rounded"><Copy size={16}/></button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">API Key</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input type="text" readOnly value={configData.api_key} className="w-full p-2 bg-gray-50 border rounded text-xs font-mono text-gray-600" />
                                    <button onClick={() => { navigator.clipboard.writeText(configData.api_key); toast.success("Copiado"); }} className="p-2 hover:bg-gray-100 rounded"><Copy size={16}/></button>
                                    <button onClick={handleRegenerateKey} className="p-2 hover:bg-red-50 text-red-600 rounded" title="Regenerar"><RefreshCw size={16}/></button>
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end">
                                <button onClick={() => setShowSettingsModal(false)} className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900">Cerrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash size={24} className="text-red-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">¿Eliminar Lead?</h2>
                        <p className="text-gray-600 text-sm mb-6">Esta acción no se puede deshacer. ¿Estás seguro de que deseas eliminar este lead?</p>
                        <div className="flex gap-3 justify-center">
                            <button 
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-medium shadow-sm"
                            >
                                Sí, Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Crm;
