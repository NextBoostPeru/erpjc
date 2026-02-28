import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { Plus, Printer, Edit, Trash, Save, ArrowLeft, CheckSquare, AlertTriangle, Check, Search } from 'lucide-react';

const IsoChecklists = () => {
    const [view, setView] = useState('list'); // list, form
    const [audits, setAudits] = useState([]);
    const [currentAudit, setCurrentAudit] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadAudits();
    }, []);

    const loadAudits = async () => {
        try {
            const res = await axios.get(`${API_URL}iso.php?action=list_audits`);
            setAudits(res.data);
        } catch (error) {
            toast.error("Error cargando auditorías");
            console.error(error);
        }
    };

    const handleCreate = async () => {
        setLoading(true);
        try {
            const resList = await axios.get(`${API_URL}iso.php?action=list_checklists`);
            const iso26000 = resList.data.find(c => c.codigo === 'ISO26000');
            
            if (!iso26000) {
                toast.error("Plantilla ISO 26000 no encontrada. Ejecute el setup.");
                setLoading(false);
                return;
            }

            const resItems = await axios.get(`${API_URL}iso.php?action=get_checklist&id=${iso26000.id}`);
            
            setCurrentAudit({
                checklist_id: iso26000.id,
                checklist_nombre: iso26000.nombre,
                cliente_nombre: '',
                n_contrato: '',
                direccion: '',
                representante_direccion: '',
                fecha_auditoria: new Date().toISOString().split('T')[0],
                juicio_final: 'SI',
                observaciones_finales: '',
                estado: 'borrador',
                details: resItems.data.items.map(item => ({
                    item_id: item.id,
                    categoria: item.categoria,
                    requisito: item.requisito,
                    hallazgos: '',
                    es_nc: false,
                    es_obs: false,
                    verificado: false
                }))
            });
            setView('form');
        } catch (error) {
            toast.error("Error iniciando auditoría");
            console.error(error);
        }
        setLoading(false);
    };

    const handleEdit = async (id) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}iso.php?action=get_audit&id=${id}`);
            // Ensure details are mapped correctly if coming from DB
            // The API returns details joined with item info, so we just need to make sure structure matches
            // API returns: item_id, hallazgos, es_nc, etc. and requisito, categoria
            const auditData = res.data;
            
            // Boolean conversion for checkboxes
            auditData.details = auditData.details.map(d => ({
                ...d,
                es_nc: !!d.es_nc,
                es_obs: !!d.es_obs,
                verificado: !!d.verificado
            }));

            setCurrentAudit(auditData);
            setView('form');
        } catch (error) {
            toast.error("Error cargando auditoría");
            console.error(error);
        }
        setLoading(false);
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Seguro de eliminar esta auditoría?')) return;
        try {
            await axios.post(`${API_URL}iso.php?action=delete_audit&id=${id}`);
            toast.success("Eliminado correctamente");
            loadAudits();
        } catch (error) {
            toast.error("Error eliminando");
        }
    };

    const handleSave = async () => {
        try {
            const res = await axios.post(`${API_URL}iso.php?action=save_audit`, currentAudit);
            if (res.data.success) {
                toast.success("Guardado correctamente");
                setView('list');
                loadAudits();
            }
        } catch (error) {
            toast.error("Error guardando auditoría");
            console.error(error);
        }
    };

    const handleDetailChange = (index, field, value) => {
        const newDetails = [...currentAudit.details];
        newDetails[index][field] = value;
        setCurrentAudit({ ...currentAudit, details: newDetails });
    };

    // Group details by category for rendering
    const groupedDetails = currentAudit?.details?.reduce((acc, item) => {
        const cat = item.categoria || 'General';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push({ ...item, originalIndex: currentAudit.details.indexOf(item) });
        return acc;
    }, {});

    const filteredAudits = audits.filter(a => 
        a.cliente_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.n_contrato?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8 text-center">Cargando...</div>;

    if (view === 'list') {
        return (
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">Gestión ISO 26000</h1>
                    <button 
                        onClick={handleCreate}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
                    >
                        <Plus size={20} /> Nueva Auditoría
                    </button>
                </div>

                <div className="bg-white rounded-lg shadow p-4 mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                        <input 
                            type="text"
                            placeholder="Buscar por cliente o contrato..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contrato</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Checklist</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredAudits.map((audit) => (
                                <tr key={audit.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{audit.fecha_auditoria}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{audit.cliente_nombre}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{audit.n_contrato}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{audit.checklist_nombre}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            audit.estado === 'finalizado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {audit.estado}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={() => handleEdit(audit.id)} className="text-blue-600 hover:text-blue-900 mr-3">
                                            <Edit size={18} />
                                        </button>
                                        <button onClick={() => window.open(`${API_URL}iso_pdf.php?id=${audit.id}`, '_blank')} className="text-gray-600 hover:text-gray-900 mr-3">
                                            <Printer size={18} />
                                        </button>
                                        <button onClick={() => handleDelete(audit.id)} className="text-red-600 hover:text-red-900">
                                            <Trash size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredAudits.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-4 text-center text-gray-500">No se encontraron auditorías</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-gray-100 z-10 py-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => setView('list')} className="text-gray-600 hover:text-gray-900">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {currentAudit.id ? 'Editar Auditoría' : 'Nueva Auditoría'}
                    </h1>
                </div>
                <div className="flex gap-2">
                    {currentAudit.id && (
                        <>
                            <button 
                                onClick={() => window.open(`${API_URL}iso_pdf.php?id=${currentAudit.id}`, '_blank')}
                                className="bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-700"
                            >
                                <Printer size={20} /> PDF
                            </button>
                            <button 
                                onClick={() => window.open(`${API_URL}iso_word.php?id=${currentAudit.id}`, '_blank')}
                                className="bg-blue-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-900"
                            >
                                <Printer size={20} /> Word
                            </button>
                        </>
                    )}
                    <button 
                        onClick={handleSave}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
                    >
                        <Save size={20} /> Guardar
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4 border-b pb-2">Datos Generales</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Cliente</label>
                        <input 
                            type="text" 
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.cliente_nombre}
                            onChange={(e) => setCurrentAudit({...currentAudit, cliente_nombre: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">N° Contrato</label>
                        <input 
                            type="text" 
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.n_contrato}
                            onChange={(e) => setCurrentAudit({...currentAudit, n_contrato: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Fecha Auditoría</label>
                        <input 
                            type="date" 
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.fecha_auditoria}
                            onChange={(e) => setCurrentAudit({...currentAudit, fecha_auditoria: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Dirección</label>
                        <input 
                            type="text" 
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.direccion}
                            onChange={(e) => setCurrentAudit({...currentAudit, direccion: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Representante</label>
                        <input 
                            type="text" 
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.representante_direccion}
                            onChange={(e) => setCurrentAudit({...currentAudit, representante_direccion: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Estado</label>
                        <select 
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.estado}
                            onChange={(e) => setCurrentAudit({...currentAudit, estado: e.target.value})}
                        >
                            <option value="borrador">Borrador</option>
                            <option value="finalizado">Finalizado</option>
                        </select>
                    </div>
                    <div className="col-span-1 md:col-span-2 lg:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Alcance de la Auditoría</label>
                        <textarea 
                            rows="2"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.alcance || ''}
                            onChange={(e) => setCurrentAudit({...currentAudit, alcance: e.target.value})}
                            placeholder="Describa el alcance..."
                        />
                    </div>
                    <div className="col-span-1 md:col-span-2 lg:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Objetivo</label>
                        <textarea 
                            rows="2"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            value={currentAudit.objetivo || ''}
                            onChange={(e) => setCurrentAudit({...currentAudit, objetivo: e.target.value})}
                            placeholder="Describa el objetivo..."
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4 border-b pb-2">Checklist - {currentAudit.checklist_nombre}</h2>
                
                {Object.keys(groupedDetails || {}).map((category, catIndex) => (
                    <div key={catIndex} className="mb-8">
                        <h3 className="bg-gray-100 p-2 font-bold text-gray-700 rounded mb-4">{category}</h3>
                        <div className="space-y-4">
                            {groupedDetails[category].map((item, index) => {
                                const realIndex = item.originalIndex;
                                return (
                                    <div key={item.item_id} className="border-b pb-4 last:border-0">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="md:w-1/3">
                                                <p className="text-sm font-medium text-gray-800">{item.requisito}</p>
                                            </div>
                                            <div className="md:w-2/3 space-y-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500">Hallazgos / Evidencias</label>
                                                    <textarea 
                                                        rows="2"
                                                        className="w-full border rounded p-2 text-sm"
                                                        value={item.hallazgos}
                                                        onChange={(e) => handleDetailChange(realIndex, 'hallazgos', e.target.value)}
                                                        placeholder="Describir hallazgos..."
                                                    />
                                                </div>
                                                <div className="flex gap-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={item.es_nc}
                                                            onChange={(e) => handleDetailChange(realIndex, 'es_nc', e.target.checked)}
                                                            className="w-4 h-4 text-red-600 rounded"
                                                        />
                                                        <span className="text-sm text-gray-700 font-medium">No Conformidad (NC)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={item.es_obs}
                                                            onChange={(e) => handleDetailChange(realIndex, 'es_obs', e.target.checked)}
                                                            className="w-4 h-4 text-yellow-600 rounded"
                                                        />
                                                        <span className="text-sm text-gray-700 font-medium">Observación (OBS)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={item.verificado}
                                                            onChange={(e) => handleDetailChange(realIndex, 'verificado', e.target.checked)}
                                                            className="w-4 h-4 text-green-600 rounded"
                                                        />
                                                        <span className="text-sm text-gray-700 font-medium">Verificado</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4 border-b pb-2">Conclusiones</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones Finales</label>
                        <textarea 
                            rows="4"
                            className="w-full border rounded p-2"
                            value={currentAudit.observaciones_finales}
                            onChange={(e) => setCurrentAudit({...currentAudit, observaciones_finales: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Juicio Final (¿Cumple?)</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="juicio"
                                    value="SI"
                                    checked={currentAudit.juicio_final === 'SI'}
                                    onChange={(e) => setCurrentAudit({...currentAudit, juicio_final: e.target.value})}
                                    className="w-5 h-5 text-blue-600"
                                />
                                <span className="font-bold text-green-700">SI</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="juicio"
                                    value="NO"
                                    checked={currentAudit.juicio_final === 'NO'}
                                    onChange={(e) => setCurrentAudit({...currentAudit, juicio_final: e.target.value})}
                                    className="w-5 h-5 text-blue-600"
                                />
                                <span className="font-bold text-red-700">NO</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IsoChecklists;
