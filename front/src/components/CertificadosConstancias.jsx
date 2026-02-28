import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { FileText, Eye, Edit, Trash2, X, Check, AlertTriangle, Plus } from 'lucide-react';

const CertificadosConstancias = () => {
    const [colaboradores, setColaboradores] = useState([]);
    const [formData, setFormData] = useState({
        colaborador_id: '',
        tipo_documento: 'CT',
        dirigido_a: ''
    });
    const [loading, setLoading] = useState(false);
    
    // Historial State
    const [historial, setHistorial] = useState([]);
    const [histLoading, setHistLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Modal States
    const [selectedItem, setSelectedItem] = useState(null);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');
    const [editDirigidoA, setEditDirigidoA] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [firmas, setFirmas] = useState([]);
    const [firmasLoading, setFirmasLoading] = useState(false);
    const [showFirmaModal, setShowFirmaModal] = useState(false);
    const [firmaNombre, setFirmaNombre] = useState('');
    const [firmaFile, setFirmaFile] = useState(null);
    const [firmaPreview, setFirmaPreview] = useState(null);

    useEffect(() => {
        fetchColaboradores();
        fetchHistorial();
        fetchFirmas();
    }, []);

    const fetchColaboradores = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/certificados.php?action=list_candidates`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (Array.isArray(response.data) && response.data.length > 0) {
                setColaboradores(response.data);
            } else {
                const resp2 = await axios.get(`${API_URL}/colaboradores.php?page=1&limit=500`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const rows = Array.isArray(resp2.data?.data) ? resp2.data.data : [];
                setColaboradores(rows.map(r => ({
                    id: r.id,
                    nombres: r.nombres,
                    apellidos: r.apellidos,
                    documento_numero: r.documento_numero,
                    cargo: r.cargo,
                    tipo_contrato: r.tipo_contrato
                })));
            }
        } catch (error) {
            console.error('Error cargando colaboradores', error);
            toast.error('No se pudo cargar colaboradores');
        }
    };

    const fetchHistorial = async (newPage = 1) => {
        try {
            setHistLoading(true);
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/certificados.php?action=history&page=${newPage}&limit=10`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setHistorial(response.data.data || []);
            setTotalPages(Math.ceil(response.data.total / response.data.limit));
            setPage(newPage);
        } catch (error) {
            console.error('Error cargando historial', error);
        } finally {
            setHistLoading(false);
        }
    };

    const fetchFirmas = async () => {
        try {
            setFirmasLoading(true);
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/certificados.php?action=firmas`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFirmas(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error cargando firmas', error);
            toast.error('No se pudo cargar firmas');
        } finally {
            setFirmasLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(`${API_URL}/certificados.php?action=generate`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                // Open modal with generated PDF
                const url = base64ToBlobUrl(response.data.pdf_base64);
                setPdfUrl(url);
                setShowViewModal(true);
                
                toast.success('Documento generado correctamente');
                fetchHistorial(1);
                setShowCreateModal(false);
                setFormData({
                    colaborador_id: '',
                    tipo_documento: 'CT',
                    dirigido_a: ''
                });
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al generar documento');
        } finally {
            setLoading(false);
        }
    };

    const base64ToBlobUrl = (base64) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        return URL.createObjectURL(blob);
    };

    // --- Modal Handlers ---

    const openViewModal = (item) => {
        const url = base64ToBlobUrl(item.pdf_base64);
        setPdfUrl(url);
        setShowViewModal(true);
    };

    const openEditModal = (item) => {
        setSelectedItem(item);
        setEditDirigidoA(item.dirigido_a || '');
        setShowEditModal(true);
    };

    const openDeleteModal = (item) => {
        setSelectedItem(item);
        setShowDeleteModal(true);
    };

    const closeModals = () => {
        setShowViewModal(false);
        setShowEditModal(false);
        setShowDeleteModal(false);
        setShowCreateModal(false);
        setSelectedItem(null);
        setPdfUrl('');
    };

    const confirmEdit = async () => {
        if (!selectedItem) return;
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/certificados.php?action=edit`, {
                id: selectedItem.id,
                dirigido_a: editDirigidoA
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Actualizado correctamente');
            fetchHistorial(page);
            closeModals();
        } catch (error) {
            toast.error('Error al actualizar');
        }
    };

    const confirmDelete = async () => {
        if (!selectedItem) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/certificados.php?action=delete&id=${selectedItem.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Documento anulado');
            fetchHistorial(page);
            closeModals();
        } catch (error) {
            toast.error('Error al anular');
        }
    };

    const openFirmaModal = () => {
        setFirmaNombre('');
        setFirmaFile(null);
        setFirmaPreview(null);
        setShowFirmaModal(true);
    };

    const handleFirmaFileChange = (e) => {
        const file = e.target.files[0];
        setFirmaFile(file || null);
        if (file) {
            const url = URL.createObjectURL(file);
            setFirmaPreview(url);
        } else {
            setFirmaPreview(null);
        }
    };

    const handleFirmaSubmit = async (e) => {
        e.preventDefault();
        if (!firmaNombre.trim() || !firmaFile) {
            toast.error('Nombre e imagen son obligatorios');
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const form = new FormData();
            form.append('nombre', firmaNombre.trim());
            form.append('imagen', firmaFile);
            const response = await axios.post(`${API_URL}/certificados.php?action=firmas`, form, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data && response.data.success) {
                toast.success('Firma registrada');
                setShowFirmaModal(false);
                setFirmaNombre('');
                setFirmaFile(null);
                setFirmaPreview(null);
                fetchFirmas();
            } else {
                toast.error('No se pudo guardar la firma');
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al guardar firma');
        }
    };

    const toggleFirmaActiva = async (firma) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/certificados.php?action=firmas`, {
                id: firma.id,
                activo: firma.activo ? 0 : 1
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchFirmas();
        } catch (error) {
            toast.error('Error al actualizar firma');
        }
    };

    const deleteFirma = async (firma) => {
        if (!window.confirm('¿Eliminar esta firma?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/certificados.php?action=firmas&id=${firma.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Firma eliminada');
            fetchFirmas();
        } catch (error) {
            toast.error('Error al eliminar firma');
        }
    };

    return (
        <div className="container mx-auto p-6 relative">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Generación de Certificados y Constancias</h1>
                    <p className="text-gray-500 mt-1 text-sm">Genera certificados de trabajo y constancias desde el historial.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={openFirmaModal}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                    >
                        <Plus size={18} />
                        <span>Nueva Firma</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow"
                    >
                        <FileText size={18} />
                        <span>Nuevo Documento</span>
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-lg shadow-md p-6 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-gray-700">Firmas</h2>
                            <button
                                type="button"
                                onClick={fetchFirmas}
                                className="text-blue-600 hover:underline text-xs"
                            >
                                Actualizar
                            </button>
                        </div>
                        {firmasLoading ? (
                            <p className="text-gray-500 text-sm">Cargando firmas...</p>
                        ) : firmas.length === 0 ? (
                            <p className="text-gray-500 text-sm">No hay firmas registradas.</p>
                        ) : (
                            <div className="space-y-3 overflow-y-auto max-h-96 pr-1">
                                {firmas.map(firma => (
                                    <div
                                        key={firma.id}
                                        className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg p-2 hover:bg-gray-50"
                                    >
                                        <div className="flex items-center gap-3">
                                            {firma.imagen_path && (
                                                <img
                                                    src={`${API_URL}/${firma.imagen_path.replace('../', '')}`}
                                                    alt={firma.nombre}
                                                    className="w-16 h-12 object-contain border border-gray-200 rounded bg-white"
                                                />
                                            )}
                                            <div>
                                                <div className="text-sm font-medium text-gray-800 truncate max-w-[140px]">
                                                    {firma.nombre}
                                                </div>
                                                <div className="text-xs">
                                                    <span className={firma.activo ? 'text-emerald-600' : 'text-gray-500'}>
                                                        {firma.activo ? 'Activa' : 'Inactiva'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleFirmaActiva(firma)}
                                                className={`px-2 py-1 rounded text-xs ${
                                                    firma.activo
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}
                                            >
                                                {firma.activo ? 'Desactivar' : 'Activar'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteFirma(firma)}
                                                className="p-1 text-red-600 hover:text-red-800"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Historial */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-700">Historial de Emisiones</h2>
                            <button onClick={() => fetchHistorial(page)} className="text-blue-600 hover:underline text-sm">Actualizar</button>
                        </div>

                        {histLoading ? (
                            <p className="text-center text-gray-500">Cargando historial...</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Colaborador</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dirigido A</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {historial.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="px-4 py-4 text-center text-gray-500">No hay documentos generados.</td>
                                            </tr>
                                        ) : (
                                            historial.map((item) => (
                                                <tr key={item.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                                                        {new Date(item.fecha_emision).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-800">
                                                        {item.codigo || '-'}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                                                        {item.tipo_documento === 'CT' ? 'Certificado Trabajo' : 'Constancia Servicios'}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                                                        {item.apellidos}, {item.nombres}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 max-w-xs truncate">
                                                        {item.dirigido_a || '-'}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-center space-x-2">
                                                        <button 
                                                            onClick={() => openViewModal(item)}
                                                            className="text-blue-600 hover:text-blue-800"
                                                            title="Ver PDF"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        <button 
                                                            onClick={() => openEditModal(item)}
                                                            className="text-amber-600 hover:text-amber-800"
                                                            title="Editar Dirigido A"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button 
                                                            onClick={() => openDeleteModal(item)}
                                                            className="text-red-600 hover:text-red-800"
                                                            title="Anular"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Paginación */}
                        {totalPages > 1 && (
                            <div className="flex justify-center mt-4 space-x-2">
                                <button 
                                    onClick={() => fetchHistorial(page - 1)}
                                    disabled={page === 1}
                                    className={`px-3 py-1 rounded border ${page === 1 ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                >
                                    Anterior
                                </button>
                                <span className="px-3 py-1 text-gray-600">
                                    Página {page} de {totalPages}
                                </span>
                                <button 
                                    onClick={() => fetchHistorial(page + 1)}
                                    disabled={page === totalPages}
                                    className={`px-3 py-1 rounded border ${page === totalPages ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                >
                                    Siguiente
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- MODALS --- */}

            {/* View PDF Modal */}
            {showViewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="text-lg font-semibold text-gray-800">Vista Previa del Documento</h3>
                            <button onClick={closeModals} className="text-gray-500 hover:text-gray-700">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 p-4 bg-gray-100 overflow-hidden">
                            <iframe 
                                src={pdfUrl} 
                                className="w-full h-full rounded border border-gray-300" 
                                title="PDF Viewer"
                            ></iframe>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="text-lg font-semibold text-gray-800">Editar Documento</h3>
                            <button onClick={closeModals} className="text-gray-500 hover:text-gray-700">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6">
                            <label className="block text-gray-700 font-medium mb-2">Dirigido a:</label>
                            <input 
                                type="text"
                                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={editDirigidoA}
                                onChange={(e) => setEditDirigidoA(e.target.value)}
                                placeholder="Ej: Banco BCP"
                            />
                        </div>
                        <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50 rounded-b-lg">
                            <button 
                                onClick={closeModals}
                                className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-100"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmEdit}
                                className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center"
                            >
                                <Check size={18} className="mr-1" /> Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6 text-center">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                                <AlertTriangle className="h-6 w-6 text-red-600" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">¿Anular documento?</h3>
                            <p className="text-sm text-gray-500">
                                ¿Está seguro de que desea anular este documento del historial? Esta acción no se puede deshacer.
                            </p>
                        </div>
                        <div className="flex justify-center space-x-3 p-4 border-t bg-gray-50 rounded-b-lg">
                            <button 
                                onClick={closeModals}
                                className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-100"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmDelete}
                                className="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700"
                            >
                                Sí, Anular
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Document Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-semibold text-gray-800">Nuevo Documento</h2>
                            <button
                                onClick={closeModals}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={22} />
                            </button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-gray-700 font-medium mb-2">Colaborador</label>
                                    <select 
                                        required
                                        className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={formData.colaborador_id}
                                        onChange={(e) => setFormData({...formData, colaborador_id: e.target.value})}
                                    >
                                        <option value="">Seleccione un colaborador</option>
                                        {colaboradores.map(colab => (
                                            <option key={colab.id} value={colab.id}>
                                                {colab.apellidos}, {colab.nombres}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-gray-700 font-medium mb-2">Tipo de Documento</label>
                                    <div className="flex flex-col space-y-2">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="tipo_documento" 
                                                value="CT"
                                                checked={formData.tipo_documento === 'CT'}
                                                onChange={(e) => setFormData({...formData, tipo_documento: e.target.value})}
                                                className="form-radio text-blue-600"
                                            />
                                            <span>Certificado de Trabajo (Planilla)</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="tipo_documento" 
                                                value="CPS"
                                                checked={formData.tipo_documento === 'CPS'}
                                                onChange={(e) => setFormData({...formData, tipo_documento: e.target.value})}
                                                className="form-radio text-blue-600"
                                            />
                                            <span>Constancia de Prestación de Servicios</span>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-gray-700 font-medium mb-2">Dirigido a (Opcional)</label>
                                    <input 
                                        type="text"
                                        placeholder="Ej: A quien corresponda..."
                                        className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={formData.dirigido_a}
                                        onChange={(e) => setFormData({...formData, dirigido_a: e.target.value})}
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={closeModals}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={loading}
                                        className={`px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                                    >
                                        <FileText size={18} />
                                        <span>{loading ? 'Generando...' : 'Generar PDF'}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {showFirmaModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-semibold text-gray-800">Nueva Firma</h2>
                            <button
                                onClick={() => setShowFirmaModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={22} />
                            </button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleFirmaSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                    <input
                                        type="text"
                                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={firmaNombre}
                                        onChange={(e) => setFirmaNombre(e.target.value)}
                                        placeholder="Ej: Firma Gerencia"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Imagen de firma</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFirmaFileChange}
                                        className="w-full text-sm"
                                    />
                                    {firmaPreview && (
                                        <div className="mt-3 flex justify-center">
                                            <img
                                                src={firmaPreview}
                                                alt="Vista previa"
                                                className="max-h-32 object-contain border border-gray-200 rounded bg-white px-2 py-1"
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowFirmaModal(false)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-lg text-white font-semibold bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
                                    >
                                        <Plus size={16} />
                                        <span>Guardar firma</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default CertificadosConstancias;
