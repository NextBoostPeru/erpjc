import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { API_URL } from '../api/config';

const AgendaCorporativa = () => {
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [nuevoEvento, setNuevoEvento] = useState({
        titulo: '',
        fecha_inicio: '',
        fecha_fin: '',
        tipo: 'directorio',
        descripcion: ''
    });

    useEffect(() => {
        fetchEventos();
    }, []);

    const fetchEventos = async () => {
        try {
            const res = await axios.get(`${API_URL}agenda_corporativa.php`);
            setEventos(res.data);
        } catch (error) {
            console.error("Error cargando agenda", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}api/agenda_corporativa.php`, nuevoEvento);
            setModalOpen(false);
            fetchEventos();
        } catch (error) {
            alert('Error al guardar evento');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar evento?')) return;
        try {
            await axios.delete(`${API_URL}agenda_corporativa.php?id=${id}`);
            fetchEventos();
        } catch (error) {
            alert('Error eliminando');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Calendar className="text-blue-600" /> Agenda Corporativa
                </h1>
                <button 
                    onClick={() => setModalOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <Plus size={20} /> Nuevo Hito
                </button>
            </div>

            {loading ? (
                <p>Cargando...</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {eventos.map(ev => (
                        <div key={ev.id} className="bg-white p-5 rounded-xl shadow border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase ${
                                        ev.tipo === 'impuesto' ? 'bg-red-100 text-red-600' :
                                        ev.tipo === 'legal' ? 'bg-purple-100 text-purple-600' :
                                        ev.tipo === 'directorio' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {ev.tipo}
                                    </span>
                                    <h3 className="font-bold text-lg mt-2">{ev.titulo}</h3>
                                    <p className="text-gray-500 text-sm mt-1">{ev.descripcion}</p>
                                </div>
                                <button onClick={() => handleDelete(ev.id)} className="text-gray-400 hover:text-red-500">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-600">
                                <Calendar size={16} />
                                {new Date(ev.fecha_inicio).toLocaleDateString()} - {new Date(ev.fecha_fin).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Simple */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Nuevo Hito</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input 
                                className="w-full border p-2 rounded" 
                                placeholder="Título" 
                                required
                                value={nuevoEvento.titulo}
                                onChange={e => setNuevoEvento({...nuevoEvento, titulo: e.target.value})}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <input 
                                    type="date" 
                                    className="border p-2 rounded" 
                                    required
                                    value={nuevoEvento.fecha_inicio}
                                    onChange={e => setNuevoEvento({...nuevoEvento, fecha_inicio: e.target.value})}
                                />
                                <input 
                                    type="date" 
                                    className="border p-2 rounded" 
                                    required
                                    value={nuevoEvento.fecha_fin}
                                    onChange={e => setNuevoEvento({...nuevoEvento, fecha_fin: e.target.value})}
                                />
                            </div>
                            <select 
                                className="w-full border p-2 rounded"
                                value={nuevoEvento.tipo}
                                onChange={e => setNuevoEvento({...nuevoEvento, tipo: e.target.value})}
                            >
                                <option value="impuesto">Declaración de Impuestos</option>
                                <option value="legal">Renovación Legal</option>
                                <option value="directorio">Reunión de Directorio</option>
                                <option value="otro">Otro</option>
                            </select>
                            <textarea 
                                className="w-full border p-2 rounded" 
                                placeholder="Descripción"
                                value={nuevoEvento.descripcion}
                                onChange={e => setNuevoEvento({...nuevoEvento, descripcion: e.target.value})}
                            />
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AgendaCorporativa;
