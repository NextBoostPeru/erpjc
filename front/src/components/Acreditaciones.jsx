import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import toast, { Toaster } from 'react-hot-toast';
import { Plus, Trash2, Image as ImageIcon, Check, X, Loader, Award } from 'lucide-react';

const Acreditaciones = () => {
    const [acreditaciones, setAcreditaciones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        titulo: '',
        imagen: null
    });
    const [previewUrl, setPreviewUrl] = useState(null);
    const token = localStorage.getItem('token');

    useEffect(() => {
        fetchAcreditaciones();
    }, []);

    const fetchAcreditaciones = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/acreditaciones.php`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAcreditaciones(res.data);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar acreditaciones');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData({ ...formData, imagen: file });
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.titulo || !formData.imagen) {
            toast.error('Todos los campos son obligatorios');
            return;
        }

        const data = new FormData();
        data.append('titulo', formData.titulo);
        data.append('imagen', formData.imagen);
        data.append('estado', 'activo');

        try {
            await axios.post(`${API_URL}/acreditaciones.php`, data, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            toast.success('Acreditación agregada exitosamente');
            setShowModal(false);
            setFormData({ titulo: '', imagen: null });
            setPreviewUrl(null);
            fetchAcreditaciones();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar acreditación');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Está seguro de eliminar esta acreditación?')) return;

        try {
            await axios.delete(`${API_URL}/acreditaciones.php?id=${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Acreditación eliminada');
            fetchAcreditaciones();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar');
        }
    };

    const handleToggleStatus = async (id, currentStatus) => {
        const newStatus = currentStatus === 'activo' ? 'inactivo' : 'activo';
        try {
            await axios.put(`${API_URL}/acreditaciones.php`, { id, estado: newStatus }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(`Estado actualizado a ${newStatus}`);
            fetchAcreditaciones();
        } catch (error) {
            console.error(error);
            toast.error('Error al actualizar estado');
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <Toaster position="top-right" />
            
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Award className="text-blue-600" />
                        Logos de Acreditaciones
                    </h1>
                    <p className="text-gray-600 text-sm mt-1">Gestiona los logos que aparecerán en las cotizaciones</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                    <Plus size={20} />
                    Agregar Logo
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader className="animate-spin text-blue-600" size={40} />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {acreditaciones.map((item) => (
                        <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden group hover:shadow-md transition-shadow">
                            <div className="h-48 bg-gray-100 relative flex items-center justify-center p-4">
                                {item.imagen_path ? (
                                    <img 
                                        src={`${API_URL}public_files.php?path=${item.imagen_path}`} 
                                        alt={item.titulo}
                                        className="max-h-full max-w-full object-contain"
                                    />
                                ) : (
                                    <ImageIcon className="text-gray-400" size={48} />
                                )}
                                <div className="absolute top-2 right-2 flex gap-2">
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="bg-white/90 p-1.5 rounded-full text-red-500 hover:text-red-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="p-4">
                                <h3 className="font-semibold text-gray-800 mb-1">{item.titulo}</h3>
                                <div className="flex justify-between items-center mt-3">
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                        item.estado === 'activo' 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {item.estado === 'activo' ? 'Visible en PDF' : 'Oculto'}
                                    </span>
                                    <button
                                        onClick={() => handleToggleStatus(item.id, item.estado)}
                                        className={`text-sm font-medium ${
                                            item.estado === 'activo' ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800'
                                        }`}
                                    >
                                        {item.estado === 'activo' ? 'Ocultar' : 'Mostrar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {acreditaciones.length === 0 && (
                        <div className="col-span-full text-center py-12 text-gray-500">
                            <ImageIcon size={48} className="mx-auto mb-3 opacity-20" />
                            <p>No hay acreditaciones registradas.</p>
                        </div>
                    )}
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-800">Nueva Acreditación</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Título / Nombre</label>
                                <input
                                    type="text"
                                    name="titulo"
                                    value={formData.titulo}
                                    onChange={handleInputChange}
                                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Ej. ISO 9001"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Logo (Imagen)</label>
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        required
                                    />
                                    {previewUrl ? (
                                        <div className="relative inline-block">
                                            <img src={previewUrl} alt="Preview" className="h-32 object-contain mx-auto" />
                                        </div>
                                    ) : (
                                        <div className="py-4 text-gray-500">
                                            <ImageIcon className="mx-auto mb-2" size={32} />
                                            <p className="text-sm">Click para subir imagen</p>
                                            <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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

export default Acreditaciones;
