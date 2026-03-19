import React, { useState, useEffect } from 'react';
import { Monitor, Plus, Search, TrendingDown, Trash2, Edit, Save, X } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../api/config';
import toast from 'react-hot-toast';

const ActivosFijos = () => {
    const [activos, setActivos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 20;
    
    // Form State
    const [formData, setFormData] = useState({
        codigo: '',
        nombre: '',
        fecha_adquisicion: '',
        valor_compra: '',
        vida_util_meses: 60,
        valor_residual: 0,
        estado: 'Activo'
    });

    useEffect(() => {
        fetchActivos(page);
    }, [page]);

    const fetchActivos = async (currentPage) => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}activos_fijos.php?page=${currentPage}&limit=${limit}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.success) {
                setActivos(response.data.data);
                if (response.data.meta) {
                    setTotalPages(response.data.meta.total_pages);
                }
            }
        } catch (error) {
            console.error("Error fetching activos", error);
            toast.error("Error al cargar activos fijos");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}activos_fijos.php`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Activo registrado correctamente");
            setShowModal(false);
            setFormData({
                codigo: '',
                nombre: '',
                fecha_adquisicion: '',
                valor_compra: '',
                vida_util_meses: 60,
                valor_residual: 0,
                estado: 'Activo'
            });
            fetchActivos(page);
        } catch (error) {
            console.error("Error saving activo", error);
            toast.error("Error al guardar activo");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Estás seguro de eliminar este activo?")) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}activos_fijos.php?id=${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Activo eliminado");
            fetchActivos(page);
        } catch (error) {
            console.error("Error deleting activo", error);
            toast.error("Error al eliminar activo");
        }
    };

    const calcularDepreciacion = (valor, vida, fecha) => {
        const fechaAdq = new Date(fecha);
        const hoy = new Date();
        const diffTime = Math.abs(hoy - fechaAdq);
        const mesesTranscurridos = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); 
        
        const depreciacionMensual = valor / vida;
        const depreciacionAcumulada = Math.min(depreciacionMensual * mesesTranscurridos, valor);
        const valorNeto = valor - depreciacionAcumulada;
        
        return {
            mensual: depreciacionMensual.toFixed(2),
            acumulada: depreciacionAcumulada.toFixed(2),
            neto: valorNeto.toFixed(2)
        };
    };

    const filteredActivos = activos.filter(a => 
        a.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.codigo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Monitor className="text-blue-600" /> Gestión de Activos Fijos
                </h1>
                <button 
                    onClick={() => setShowModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <Plus size={20} /> Nuevo Activo
                </button>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                        <input 
                            type="text" 
                            placeholder="Buscar por código o nombre..." 
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Cargando activos...</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-600 font-semibold text-sm">
                            <tr>
                                <th className="p-4">Código</th>
                                <th className="p-4">Activo</th>
                                <th className="p-4">Adquisición</th>
                                <th className="p-4 text-right">Valor Original</th>
                                <th className="p-4 text-right">Deprec. Acum.</th>
                                <th className="p-4 text-right">Valor Neto</th>
                                <th className="p-4">Estado</th>
                                <th className="p-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredActivos.map(activo => {
                                const dep = calcularDepreciacion(activo.valor_compra, activo.vida_util_meses, activo.fecha_adquisicion);
                                return (
                                    <tr key={activo.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-mono text-sm text-gray-500">{activo.codigo}</td>
                                        <td className="p-4 font-medium">{activo.nombre}</td>
                                        <td className="p-4 text-sm text-gray-500">{activo.fecha_adquisicion}</td>
                                        <td className="p-4 text-right">S/ {parseFloat(activo.valor_compra).toFixed(2)}</td>
                                        <td className="p-4 text-right text-red-500">- S/ {dep.acumulada}</td>
                                        <td className="p-4 text-right font-bold text-green-600">S/ {dep.neto}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                activo.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {activo.estado}
                                            </span>
                                        </td>
                                        <td className="p-4 flex justify-center gap-2">
                                            <button 
                                                onClick={() => handleDelete(activo.id)}
                                                className="p-1 text-gray-400 hover:text-red-600"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={18}/>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredActivos.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-gray-500">No se encontraron activos</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
                
                {/* Paginación */}
                <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Anterior
                    </button>
                    <span className="text-sm text-gray-600">
                        Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Siguiente
                    </button>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Registrar Nuevo Activo</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                                    <input 
                                        type="text" name="codigo" required
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.codigo} onChange={handleInputChange}
                                        placeholder="Ej: LAP-001"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Adquisición</label>
                                    <input 
                                        type="date" name="fecha_adquisicion" required
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.fecha_adquisicion} onChange={handleInputChange}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Descripción</label>
                                <input 
                                    type="text" name="nombre" required
                                    className="w-full border rounded px-3 py-2"
                                    value={formData.nombre} onChange={handleInputChange}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Valor Compra (S/)</label>
                                    <input 
                                        type="number" step="0.01" name="valor_compra" required
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.valor_compra} onChange={handleInputChange}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Vida Útil (Meses)</label>
                                    <input 
                                        type="number" name="vida_util_meses" required
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.vida_util_meses} onChange={handleInputChange}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Valor Residual (S/)</label>
                                    <input 
                                        type="number" step="0.01" name="valor_residual"
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.valor_residual} onChange={handleInputChange}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                    <select 
                                        name="estado"
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.estado} onChange={handleInputChange}
                                    >
                                        <option value="Activo">Activo</option>
                                        <option value="Depreciado">Depreciado</option>
                                        <option value="Baja">Baja</option>
                                        <option value="Mantenimiento">Mantenimiento</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)}
                                    className="mr-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                                >
                                    <Save size={18} className="mr-2" /> Guardar Activo
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActivosFijos;
