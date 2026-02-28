import React, { useState, useEffect } from 'react';
import { CheckSquare, AlertCircle, Play, Lock, Check, Loader } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_URL } from '../api/config';

const CierreContable = () => {
    const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [estado, setEstado] = useState('abierto'); // abierto, en_proceso, cerrado
    const [cierreId, setCierreId] = useState(null);
    const [tareas, setTareas] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const fetchCierre = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}api/cierre_contable.php?periodo=${periodo}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
                const { cierre, checklist } = response.data;
                setCierreId(cierre.id);
                setEstado(cierre.estado);
                
                // Convertir 0/1 a boolean si es necesario
                const tasksFormatted = checklist.map(t => ({
                    ...t,
                    completado: t.completado == 1
                }));
                setTareas(tasksFormatted);
            }
        } catch (error) {
            console.error("Error fetching cierre", error);
            toast.error("Error al cargar datos del cierre contable");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCierre();
    }, [periodo]);

    const toggleTarea = async (id, currentStatus) => {
        if (estado === 'cerrado') return;

        // Optimistic update
        const newStatus = !currentStatus;
        setTareas(tareas.map(t => 
            t.id === id ? { ...t, completado: newStatus } : t
        ));

        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}cierre_contable.php`, {
                action: 'toggle_task',
                task_id: id,
                completed: newStatus
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (error) {
            console.error("Error updating task", error);
            toast.error("Error al actualizar tarea");
            // Revert on error
            setTareas(tareas.map(t => 
                t.id === id ? { ...t, completado: currentStatus } : t
            ));
        }
    };

    const cerrarPeriodo = async () => {
        if (!cierreId) return;
        
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}api/cierre_contable.php`, {
                action: 'close_period',
                cierre_id: cierreId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setEstado('cerrado');
            toast.success("Periodo cerrado exitosamente");
        } catch (error) {
            console.error("Error closing period", error);
            toast.error("Error al cerrar el periodo");
        }
    };

    const progreso = tareas.length > 0 ? Math.round((tareas.filter(t => t.completado).length / tareas.length) * 100) : 0;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CheckSquare className="text-blue-600" /> Cierre Contable Express
                    </h1>
                    <div className="mt-2 flex items-center gap-2">
                        <label className="text-gray-500">Periodo:</label>
                        <input 
                            type="month" 
                            value={periodo} 
                            onChange={(e) => setPeriodo(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-gray-700"
                        />
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-sm font-bold text-gray-600">Progreso</p>
                        <p className={`text-2xl font-bold ${progreso === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                            {loading ? '...' : `${progreso}%`}
                        </p>
                    </div>
                    {estado === 'cerrado' ? (
                        <button disabled className="bg-gray-100 text-gray-500 px-6 py-3 rounded-xl flex items-center gap-2 font-bold cursor-not-allowed">
                            <Lock size={20} /> Periodo Cerrado
                        </button>
                    ) : (
                        <button 
                            disabled={progreso < 100 || loading}
                            className={`px-6 py-3 rounded-xl flex items-center gap-2 font-bold shadow-lg transition-all ${
                                progreso === 100 
                                ? 'bg-green-600 text-white hover:bg-green-700 hover:scale-105' 
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                            onClick={cerrarPeriodo}
                        >
                            {loading ? <Loader className="animate-spin" size={20} /> : (progreso === 100 ? <Check size={20} /> : <AlertCircle size={20} />)}
                            {progreso === 100 ? 'Cerrar Periodo' : 'Complete Tareas'}
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader className="animate-spin text-blue-500" size={40} />
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 bg-gray-50 border-b border-gray-100">
                        <h3 className="font-bold text-gray-700">Checklist de Cierre</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {tareas.map(t => (
                            <div 
                                key={t.id} 
                                className={`p-4 flex items-center gap-4 transition-colors cursor-pointer hover:bg-blue-50 ${
                                    t.completado ? 'bg-white' : 'bg-white'
                                }`}
                                onClick={() => estado !== 'cerrado' && toggleTarea(t.id, t.completado)}
                            >
                                <div className={`
                                    w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
                                    ${t.completado ? 'bg-green-500 border-green-500' : 'border-gray-300'}
                                `}>
                                    {t.completado && <Check size={14} className="text-white" />}
                                </div>
                                <span className={`flex-1 font-medium ${t.completado ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                    {t.tarea}
                                </span>
                                {t.completado && <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded">Listo</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CierreContable;
