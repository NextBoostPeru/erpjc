import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { X, Plus, Trash2, Calendar, AlertTriangle } from 'lucide-react';

const EmosModal = ({ collaborator, onClose }) => {
    const [emos, setEmos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        fecha_examen: '',
        fecha_vencimiento: '',
        clinica: '',
        observaciones: ''
    });

    useEffect(() => {
        if (collaborator) {
            fetchEmos();
        }
    }, [collaborator]);

    const fetchEmos = async () => {
        try {
            const token = localStorage.getItem('token');
            // We need to implement this endpoint in the backend or use a generic one
            // I'll assume we'll add 'list_emos' action to colaboradores.php or create emos.php
            // Let's use a new file emos.php for clarity
            const response = await axios.get(`${API_URL}emos.php?colaborador_id=${collaborator.id}`, {
                 headers: { Authorization: `Bearer ${token}` }
            });
            setEmos(response.data);
        } catch (error) {
            console.error("Error fetching EMOs:", error);
            // toast.error("Error al cargar EMOs");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}emos.php`, {
                ...formData,
                colaborador_id: collaborator.id
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            toast.success("EMO registrado");
            setFormData({
                fecha_examen: '',
                fecha_vencimiento: '',
                clinica: '',
                observaciones: ''
            });
            fetchEmos();
        } catch (error) {
            console.error("Error saving EMO:", error);
            toast.error("Error al guardar EMO");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar este registro?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}emos.php?id=${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("EMO eliminado");
            fetchEmos();
        } catch (error) {
            toast.error("Error al eliminar");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">Exámenes Médicos (EMO)</h3>
                        <p className="text-gray-500 text-sm">Colaborador: {collaborator.apellidos}, {collaborator.nombres}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Form */}
                    <form onSubmit={handleSubmit} className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-6">
                        <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                            <Plus size={16} /> Registrar Nuevo EMO
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Fecha Examen</label>
                                <input 
                                    type="date" 
                                    required 
                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    value={formData.fecha_examen}
                                    onChange={e => setFormData({...formData, fecha_examen: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Fecha Vencimiento</label>
                                <input 
                                    type="date" 
                                    required 
                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    value={formData.fecha_vencimiento}
                                    onChange={e => setFormData({...formData, fecha_vencimiento: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Clínica / Lugar</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ej. Clínica San Pablo"
                                    value={formData.clinica}
                                    onChange={e => setFormData({...formData, clinica: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    placeholder="Apto / No Apto / Observado"
                                    value={formData.observaciones}
                                    onChange={e => setFormData({...formData, observaciones: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
                                Guardar Registro
                            </button>
                        </div>
                    </form>

                    {/* List */}
                    <div className="space-y-3">
                        {loading ? (
                            <div className="text-center py-4 text-gray-500">Cargando...</div>
                        ) : emos.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                No hay registros de EMO para este colaborador.
                            </div>
                        ) : (
                            emos.map(emo => (
                                <div key={emo.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow flex justify-between items-center group">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-semibold text-gray-800">
                                                {emo.clinica || 'Sin clínica especificada'}
                                            </span>
                                            {new Date(emo.fecha_vencimiento) < new Date() && (
                                                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <AlertTriangle size={10} /> Vencido
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500 flex items-center gap-4">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={14} /> Examen: {emo.fecha_examen}
                                            </span>
                                            <span className="flex items-center gap-1 font-medium text-gray-700">
                                                <Calendar size={14} /> Vence: {emo.fecha_vencimiento}
                                            </span>
                                        </div>
                                        {emo.observaciones && (
                                            <p className="text-sm text-gray-600 mt-1 italic">"{emo.observaciones}"</p>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => handleDelete(emo.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmosModal;
