import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
    FileText, 
    Plus, 
    Printer, 
    Calendar, 
    User, 
    X, 
    Search, 
    CheckCircle, 
    XCircle, 
    Clock,
    MapPin
} from 'lucide-react';

const PapeletasServicio = () => {
    const [papeletas, setPapeletas] = useState([]);
    const [colaboradores, setColaboradores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');
    const [formData, setFormData] = useState({
        colaborador_id: '',
        tipo: 'Atencion Medica',
        motivo: '',
        fecha_del: '',
        fecha_al: '',
        hora_salida: '',
        hora_retorno: '',
        lugar: '',
        observaciones: ''
    });

    useEffect(() => {
        fetchPapeletas();
        fetchColaboradores();
    }, []);

    const fetchPapeletas = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}papeletas.php?action=list`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPapeletas(response.data);
        } catch (error) {
            console.error('Error cargando papeletas', error);
            toast.error('Error al cargar papeletas');
        } finally {
            setLoading(false);
        }
    };

    const fetchColaboradores = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}papeletas.php?action=list_colaboradores`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setColaboradores(response.data);
        } catch (error) {
            console.error('Error cargando colaboradores', error);
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
            const response = await axios.post(`${API_URL}papeletas.php?action=create`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
                toast.success('Papeleta creada correctamente');
                setShowModal(false);
                fetchPapeletas();
                setFormData({
                    colaborador_id: '',
                    tipo: 'Atencion Medica',
                    motivo: '',
                    fecha_del: '',
                    fecha_al: '',
                    hora_salida: '',
                    hora_retorno: '',
                    lugar: '',
                    observaciones: ''
                });
            }
        } catch (error) {
            console.error('Error creando papeleta', error);
            toast.error('Error al crear la papeleta');
        }
    };

    const handlePrint = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(`${API_URL}papeletas.php?action=generate_pdf`, { id }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                const url = base64ToBlobUrl(response.data.pdf_base64);
                setPdfUrl(url);
                setShowPdfModal(true);
            }
        } catch (error) {
            console.error('Error generando PDF', error);
            toast.error('Error al generar PDF');
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}papeletas.php?action=update_status`, {
                id,
                estado: newStatus
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(`Estado actualizado a ${newStatus}`);
            fetchPapeletas();
        } catch (error) {
            console.error('Error actualizando estado', error);
            toast.error('Error al actualizar estado');
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

    const filteredPapeletas = papeletas.filter(p => 
        p.nombres.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.tipo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusColor = (status) => {
        switch(status) {
            case 'Aprobado': return 'bg-green-100 text-green-800';
            case 'Rechazado': return 'bg-red-100 text-red-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <FileText className="text-blue-600" size={32} />
                        Papeletas de Servicio
                    </h1>
                    <p className="text-gray-500 mt-1">Gestión de permisos, licencias y atenciones médicas</p>
                </div>
                <button 
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Plus size={20} />
                    Nueva Papeleta
                </button>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
                <div className="relative max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="text-gray-400" size={18} />
                    </div>
                    <input
                        type="text"
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        placeholder="Buscar por colaborador o tipo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Colaborador</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo / Motivo</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fechas</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Horario</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredPapeletas.map((p) => (
                                <tr key={p.id} className="hover:bg-blue-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 flex-shrink-0 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                                                {p.nombres.charAt(0)}{p.apellidos.charAt(0)}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{p.apellidos}, {p.nombres}</div>
                                                <div className="text-xs text-gray-500">{p.cargo}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-900">{p.tipo}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-xs" title={p.motivo}>{p.motivo}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 flex items-center gap-1">
                                            <Calendar size={14} />
                                            {p.fecha_del}
                                        </div>
                                        {p.fecha_al !== p.fecha_del && (
                                            <div className="text-xs text-gray-400 ml-5">al {p.fecha_al}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {(p.hora_salida || p.hora_retorno) ? (
                                            <div className="text-sm text-gray-600 flex items-center gap-1">
                                                <Clock size={14} />
                                                {p.hora_salida ? p.hora_salida.substring(0, 5) : '--'} - {p.hora_retorno ? p.hora_retorno.substring(0, 5) : '--'}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(p.estado)}`}>
                                            {p.estado}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center gap-2">
                                            <button 
                                                onClick={() => handlePrint(p.id)}
                                                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                title="Imprimir PDF"
                                            >
                                                <Printer size={18} />
                                            </button>
                                            
                                            {p.estado === 'Pendiente' && (
                                                <>
                                                    <button 
                                                        onClick={() => handleStatusChange(p.id, 'Aprobado')}
                                                        className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                                                        title="Aprobar"
                                                    >
                                                        <CheckCircle size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleStatusChange(p.id, 'Rechazado')}
                                                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                                        title="Rechazar"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredPapeletas.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                                        No se encontraron papeletas
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
                    <div className="bg-white rounded-none md:rounded-2xl shadow-xl w-full max-w-2xl flex flex-col h-full md:h-auto md:max-h-[90vh] overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <h3 className="text-lg font-bold text-gray-800">Nueva Papeleta de Servicio</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto p-4 md:p-6 flex-1">
                            <form id="papeleta-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                                    <select
                                        required
                                        name="colaborador_id"
                                        value={formData.colaborador_id}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Seleccione un colaborador...</option>
                                        {colaboradores.map(c => (
                                            <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Papeleta</label>
                                    <select
                                        required
                                        name="tipo"
                                        value={formData.tipo}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="Atencion Medica">Atención Médica</option>
                                        <option value="Permiso Con Goce">Permiso Con Goce</option>
                                        <option value="Permiso Sin Goce">Permiso Sin Goce</option>
                                        <option value="Licencia Con Goce">Licencia Con Goce</option>
                                        <option value="Licencia Sin Goce">Licencia Sin Goce</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Del</label>
                                    <input
                                        type="date"
                                        required
                                        name="fecha_del"
                                        value={formData.fecha_del}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Al</label>
                                    <input
                                        type="date"
                                        name="fecha_al"
                                        value={formData.fecha_al}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora Salida</label>
                                    <input
                                        type="time"
                                        name="hora_salida"
                                        value={formData.hora_salida}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora Retorno</label>
                                    <input
                                        type="time"
                                        name="hora_retorno"
                                        value={formData.hora_retorno}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Lugar / Destino</label>
                                    <div className="relative">
                                        <MapPin className="absolute top-2.5 left-3 text-gray-400" size={16} />
                                        <input
                                            type="text"
                                            name="lugar"
                                            value={formData.lugar}
                                            onChange={handleInputChange}
                                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="Ej. Clínica San Pablo, Banco de la Nación..."
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Motivo / Detalle</label>
                                    <textarea
                                        name="motivo"
                                        rows="2"
                                        value={formData.motivo}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        placeholder="Describa el motivo..."
                                    ></textarea>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                                    <textarea
                                        name="observaciones"
                                        rows="2"
                                        value={formData.observaciones}
                                        onChange={handleInputChange}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        placeholder="Observaciones adicionales..."
                                    ></textarea>
                                </div>
                            </form>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                form="papeleta-form"
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                                Guardar Papeleta
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PDF Modal */}
            {showPdfModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
                    <div className="bg-white rounded-none md:rounded-2xl shadow-2xl w-full max-w-5xl h-full md:h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-white">
                            <h3 className="text-lg font-bold text-gray-800">Vista Previa</h3>
                            <button onClick={() => setShowPdfModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 bg-gray-50 p-6">
                            <iframe 
                                src={pdfUrl} 
                                className="w-full h-full rounded-xl border border-gray-200 shadow-sm" 
                                title="PDF Viewer"
                            ></iframe>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PapeletasServicio;
