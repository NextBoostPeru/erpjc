import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
    FileText, 
    X, 
    Search, 
    Calendar, 
    Users, 
    DollarSign, 
    CreditCard,
    Filter,
    Mail,
    UploadCloud,
    Trash2
} from 'lucide-react';

const BoletasPago = () => {
    const [planillas, setPlanillas] = useState([]);
    const [selectedPlanilla, setSelectedPlanilla] = useState('');
    const [detalles, setDetalles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');
    const [selectedDetalle, setSelectedDetalle] = useState(null);
    const [withSignature, setWithSignature] = useState(true);
    const [signatureUploading, setSignatureUploading] = useState(false);
    const [signatureInfo, setSignatureInfo] = useState({ exists: false, path: null });
    const [signatureLoading, setSignatureLoading] = useState(false);

    useEffect(() => {
        fetchPlanillas();
        fetchSignatureInfo();
    }, []);

    useEffect(() => {
        if (selectedPlanilla) {
            fetchDetalles(selectedPlanilla);
        } else {
            setDetalles([]);
        }
    }, [selectedPlanilla]);

    // When toggle changes, regenerate PDF if modal is open
    useEffect(() => {
        if (showModal && selectedDetalle) {
            generatePdf(selectedDetalle, withSignature);
        }
    }, [withSignature]);

    const fetchPlanillas = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/boletas.php?action=list_planillas`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlanillas(response.data);
        } catch (error) {
            console.error('Error cargando planillas', error);
            toast.error('Error al cargar planillas');
        }
    };

    const fetchSignatureInfo = async () => {
        setSignatureLoading(true);
        try {
            const token = localStorage.getItem('token');
            const resp = await axios.get(`${API_URL}/boletas.php?action=get_signature`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSignatureInfo(resp.data);
        } catch (error) {
            setSignatureInfo({ exists: false, path: null });
        } finally {
            setSignatureLoading(false);
        }
    };

    const fetchDetalles = async (planillaId) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/boletas.php?action=list_details&planilla_id=${planillaId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDetalles(response.data);
        } catch (error) {
            console.error('Error cargando detalles', error);
            toast.error('Error al cargar empleados');
        } finally {
            setLoading(false);
        }
    };

    const generatePdf = async (detalle, signature) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(`${API_URL}/boletas.php?action=generate_pdf`, {
                detalle_id: detalle.id,
                with_signature: signature
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                const url = base64ToBlobUrl(response.data.pdf_base64);
                setPdfUrl(url);
            }
        } catch (error) {
            console.error('Error generando PDF', error);
            toast.error('Error al generar la boleta');
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

    const handleViewBoleta = (detalle) => {
        setSelectedDetalle(detalle);
        setWithSignature(true); // Reset to default
        setShowModal(true);
        generatePdf(detalle, true);
    };

    const handleSendEmail = async (detalle) => {
        if (!confirm(`¿Enviar boleta por correo a ${detalle.nombres} ${detalle.apellidos}?`)) return;

        const token = localStorage.getItem('token');
        const promise = axios.post(`${API_URL}/boletas.php?action=send_email`, {
            detalle_id: detalle.id
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        toast.promise(promise, {
            loading: 'Enviando correo...',
            success: 'Correo enviado correctamente',
            error: (err) => err.response?.data?.error || 'Error al enviar correo'
        });
    };

    const handleSignatureUploadChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setSignatureUploading(true);
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('firma', file);
            const response = await axios.post(`${API_URL}/boletas.php?action=upload_signature`, formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            if (response.data?.success) {
                toast.success('Firma de gerencia actualizada');
                fetchSignatureInfo();
            } else {
                toast.success('Firma subida');
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al subir la firma');
        } finally {
            setSignatureUploading(false);
            e.target.value = '';
        }
    };

    const handleDeleteSignature = async () => {
        if (!confirm('¿Eliminar la firma de gerencia?')) return;
        try {
            const token = localStorage.getItem('token');
            const resp = await axios.post(`${API_URL}/boletas.php?action=delete_signature`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.success) {
                toast.success('Firma de gerencia eliminada');
                fetchSignatureInfo();
            } else {
                toast.error('No se pudo eliminar la firma');
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Error al eliminar la firma');
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setPdfUrl('');
        setSelectedDetalle(null);
    };

    const getMonthName = (monthNumber) => {
        const date = new Date();
        date.setMonth(monthNumber - 1);
        return date.toLocaleString('es-ES', { month: 'long' });
    };

    // Filtered data
    const filteredDetalles = useMemo(() => {
        return detalles.filter(d => 
            d.nombres.toLowerCase().includes(searchTerm.toLowerCase()) || 
            d.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.documento_numero.includes(searchTerm)
        );
    }, [detalles, searchTerm]);

    // Summary Statistics
    const stats = useMemo(() => {
        const totalNeto = detalles.reduce((acc, curr) => acc + parseFloat(curr.neto_pagar), 0);
        return {
            totalEmpleados: detalles.length,
            totalNeto: totalNeto
        };
    }, [detalles]);

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <FileText className="text-blue-600" size={32} />
                        Boletas de Pago
                    </h1>
                    <p className="text-gray-500 mt-1">Gestión y emisión de boletas de pago para colaboradores</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                        <div className="w-32 h-10 flex items-center justify-center bg-gray-50 rounded-md overflow-hidden">
                            {signatureLoading ? (
                                <span className="text-gray-400 text-sm">Cargando...</span>
                            ) : signatureInfo?.exists ? (
                                <img 
                                    src={`${API_URL}/public_files.php?path=${encodeURIComponent(signatureInfo.path)}`} 
                                    alt="Firma Gerencia" 
                                    className="max-h-10 object-contain"
                                />
                            ) : (
                                <span className="text-gray-400 text-sm">Sin firma</span>
                            )}
                        </div>
                    </div>
                    <input 
                        id="firmaGerenciaInput" 
                        type="file" 
                        accept="image/png,image/jpeg" 
                        className="hidden" 
                        onChange={handleSignatureUploadChange} 
                    />
                    <label 
                        htmlFor="firmaGerenciaInput" 
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all text-sm font-medium shadow-sm cursor-pointer"
                        title="Subir imagen de firma de gerencia"
                    >
                        <UploadCloud size={16} />
                        {signatureUploading ? 'Subiendo...' : 'Subir Firma Gerencia'}
                    </label>
                    <button
                        onClick={handleDeleteSignature}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50 hover:border-red-300 transition-all text-sm font-medium shadow-sm"
                        title="Eliminar firma de gerencia"
                        disabled={!signatureInfo?.exists}
                    >
                        <Trash2 size={16} />
                        Eliminar
                    </button>
                </div>
            </div>

            {/* Selection and Summary Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Selector Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <Calendar size={18} className="text-blue-500" />
                        Seleccionar Periodo
                    </label>
                    <div className="relative">
                        <select 
                            className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 pr-8 rounded-xl leading-tight focus:outline-none focus:bg-white focus:border-blue-500 transition-colors cursor-pointer"
                            value={selectedPlanilla}
                            onChange={(e) => setSelectedPlanilla(e.target.value)}
                        >
                            <option value="">-- Seleccione una Planilla --</option>
                            {planillas.map(p => (
                                <option key={p.id} value={p.id}>
                                    {getMonthName(p.mes).toUpperCase()} {p.anio}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                    {!selectedPlanilla && (
                        <p className="text-sm text-gray-400 mt-3 italic">
                            Seleccione un periodo para visualizar los colaboradores.
                        </p>
                    )}
                </div>

                {/* Stats Cards */}
                {selectedPlanilla && (
                    <>
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
                            <div className="p-4 bg-blue-50 rounded-xl text-blue-600">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500">Total Colaboradores</p>
                                <h3 className="text-2xl font-bold text-gray-800">{stats.totalEmpleados}</h3>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
                            <div className="p-4 bg-green-50 rounded-xl text-green-600">
                                <DollarSign size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500">Total Neto a Pagar</p>
                                <h3 className="text-2xl font-bold text-gray-800">
                                    S/ {stats.totalNeto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h3>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {selectedPlanilla && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Toolbar */}
                    <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <h2 className="text-lg font-bold text-gray-800">Listado de Trabajadores</h2>
                        <div className="relative w-full sm:w-72">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="text-gray-400" size={18} />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                placeholder="Buscar por nombre o DNI..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    {loading ? (
                        <div className="p-12 flex flex-col items-center justify-center text-gray-400">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                            <p>Cargando información de planillas...</p>
                        </div>
                    ) : filteredDetalles.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trabajador</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cargo</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Bruto</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Neto a Pagar</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {filteredDetalles.map((detalle) => (
                                        <tr key={detalle.id} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 flex-shrink-0 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                                                        {detalle.nombres.charAt(0)}{detalle.apellidos.charAt(0)}
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900">{detalle.apellidos}, {detalle.nombres}</div>
                                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                                            <CreditCard size={12} />
                                                            {detalle.documento_numero}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {detalle.cargo}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right font-mono">
                                                S/ {parseFloat(detalle.total_bruto).toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <span className="px-3 py-1 inline-flex text-sm leading-5 font-bold rounded-full bg-green-50 text-green-700 font-mono">
                                                    S/ {parseFloat(detalle.neto_pagar).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button 
                                                        onClick={() => handleViewBoleta(detalle)}
                                                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-all text-sm font-medium shadow-sm"
                                                        title="Ver Boleta"
                                                    >
                                                        <FileText size={16} />
                                                        <span className="hidden xl:inline">Ver</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleSendEmail(detalle)}
                                                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-green-200 rounded-lg text-green-600 hover:bg-green-50 hover:border-green-300 transition-all text-sm font-medium shadow-sm"
                                                        title="Enviar por Correo"
                                                    >
                                                        <Mail size={16} />
                                                        <span className="hidden xl:inline">Enviar</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-12 text-center text-gray-500">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                                <Search size={24} className="text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">No se encontraron resultados</h3>
                            <p className="mt-1 text-sm text-gray-500">Intenta buscar con otro nombre o documento.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Modal View PDF */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-all">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-white">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">Vista Previa de Boleta</h3>
                                    <p className="text-sm text-gray-500">
                                        {selectedDetalle?.apellidos}, {selectedDetalle?.nombres}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                {/* Signature Toggle */}
                                <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer"
                                            checked={withSignature}
                                            onChange={(e) => setWithSignature(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        <span className="ml-3 text-sm font-medium text-gray-700">Incluir Firma</span>
                                    </label>
                                </div>
                                <button 
                                    onClick={closeModal} 
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 bg-gray-50/50 p-6 overflow-hidden relative">
                            {pdfUrl ? (
                                <iframe 
                                    src={pdfUrl} 
                                    className="w-full h-full rounded-xl border border-gray-200 shadow-sm" 
                                    title="PDF Viewer"
                                ></iframe>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                    <p className="text-gray-500 font-medium">Generando vista previa...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoletasPago;
