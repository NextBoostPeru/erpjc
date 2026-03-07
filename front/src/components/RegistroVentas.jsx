import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { API_URL } from '../api/config';
import { 
    FileText, Download, Plus, CheckCircle, AlertTriangle, 
    RefreshCw, Search, ShoppingCart, Trash2, X, Save, TrendingUp, DollarSign,
    ChevronLeft, ChevronRight, FileSpreadsheet, Edit, FileX, Paperclip, Upload
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';

const RegistroVentas = () => {
    const navigate = useNavigate();
    const peruDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
    const [currentYear, currentMonth] = peruDate.split('-').map(Number);
    
    const [mes, setMes] = useState(currentMonth);
    const [anio, setAnio] = useState(currentYear);
    const [registros, setRegistros] = useState([]);
    const [apiSummary, setApiSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Pagination & Search
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 20;

    const [cuadre, setCuadre] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showCuadreModal, setShowCuadreModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [uploadingId, setUploadingId] = useState(null);
    const [showCuotaUploadModal, setShowCuotaUploadModal] = useState(false);
    const [cuotaRegId, setCuotaRegId] = useState(null);
    const [cuotas, setCuotas] = useState([]);
    const [cuotaFiles, setCuotaFiles] = useState({});
    const [uploadingCuotaIds, setUploadingCuotaIds] = useState([]);

    const [formData, setFormData] = useState({
        fecha_emision: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        tipo_comprobante: '01',
        serie: '',
        correlativo: '',
        cliente_tipo_doc: '6',
        cliente_num_doc: '',
        cliente_razon_social: '',
        moneda: 'PEN',
        tipo_cambio: '3.750', // Default exchange rate
        condicion_pago: 'Contado',
        total_gravada: 0,
        total_exonerada: 0,
        total_inafecta: 0,
        total_igv: 0,
        total_importe: 0,
        // Referencia
        ref_fecha_emision: '',
        ref_tipo_comprobante: '',
        ref_serie: '',
        ref_numero: ''
    });

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    
    const [files, setFiles] = useState({
        archivo_pago: null,
        archivo_detraccion: null
    });

    const [uploadFiles, setUploadFiles] = useState({
        archivo_pago: [],
        archivo_detraccion: []
    });

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    // Debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleOpenUpload = (reg) => {
        setUploadingId(reg.id);
        setUploadFiles({ archivo_pago: [], archivo_detraccion: [] });
        setShowUploadModal(true);
    };

    const handleOpenCuotaUpload = async (reg) => {
        setCuotaRegId(reg.id);
        setShowCuotaUploadModal(true);
        setCuotas([]);
        setCuotaFiles({});
        try {
            const res = await axios.get(`${API_URL}registro_ventas.php?action=listar_cuotas&id=${reg.id}`, { headers });
            const rows = res.data?.data || [];
            setCuotas(rows);
        } catch (error) {
            toast.error("Error cargando cuotas");
        }
    };

    const handleUploadFiles = async (e) => {
        e.preventDefault();
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('id', uploadingId);

            const hasPago = uploadFiles.archivo_pago && uploadFiles.archivo_pago.length > 0;
            const hasDet = uploadFiles.archivo_detraccion && uploadFiles.archivo_detraccion.length > 0;

            if (!hasPago && !hasDet) {
                toast.error("Debe seleccionar al menos un archivo");
                return;
            }

            if (hasPago) {
                Array.from(uploadFiles.archivo_pago).forEach((file) => {
                    formDataToSend.append('archivo_pago[]', file);
                });
            }

            if (hasDet) {
                Array.from(uploadFiles.archivo_detraccion).forEach((file) => {
                    formDataToSend.append('archivo_detraccion[]', file);
                });
            }

            const res = await axios.post(`${API_URL}registro_ventas.php?action=subir_adjuntos`, formDataToSend, { 
                headers: { 
                    ...headers,
                    'Content-Type': 'multipart/form-data'
                } 
            });

            toast.success(res.data.message);
            setShowUploadModal(false);
            setUploadingId(null);
            setUploadFiles({ archivo_pago: [], archivo_detraccion: [] });
            fetchRegistros();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al subir archivos");
        }
    };

    const handleCuotaFileChange = (cuotaId, filesList) => {
        setCuotaFiles(prev => ({ ...prev, [cuotaId]: filesList }));
    };

    const handleUploadCuotaFiles = async (cuotaId) => {
        try {
            setUploadingCuotaIds(prev => [...prev, cuotaId]);
            const form = new FormData();
            form.append('cuota_id', cuotaId);
            const filesList = cuotaFiles[cuotaId];
            if (!filesList || filesList.length === 0) {
                toast.error("Seleccione uno o más archivos");
                return;
            }
            Array.from(filesList).forEach(f => form.append('archivos_cuota[]', f));
            const res = await axios.post(`${API_URL}registro_ventas.php?action=subir_adjuntos_cuota`, form, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' }
            });
            toast.success(res.data?.message || "Adjuntos subidos");
            // Refresh cuotas to reflect new attachments
            const refreshed = await axios.get(`${API_URL}registro_ventas.php?action=listar_cuotas&id=${cuotaRegId}`, { headers });
            setCuotas(refreshed.data?.data || []);
            setCuotaFiles(prev => ({ ...prev, [cuotaId]: [] }));
        } catch (error) {
            toast.error(error.response?.data?.message || "Error subiendo adjuntos de cuota");
        } finally {
            setUploadingCuotaIds(prev => prev.filter(id => id !== cuotaId));
        }
    };

    const uploadAllSelectedCuotaFiles = async () => {
        const entries = Object.entries(cuotaFiles).filter(([_, files]) => files && files.length > 0);
        if (entries.length === 0) {
            toast.error("No hay archivos seleccionados");
            return;
        }
        for (const [cuotaId] of entries) {
            await handleUploadCuotaFiles(Number(cuotaId));
        }
        toast.success("Adjuntos de cuotas subidos");
    };

    useEffect(() => {
        fetchRegistros();
    }, [mes, anio, page, debouncedSearch]);

    useEffect(() => {
        const gravada = parseFloat(formData.total_gravada) || 0;
        const exonerada = parseFloat(formData.total_exonerada) || 0;
        const inafecta = parseFloat(formData.total_inafecta) || 0;
        // Solo calcular IGV si hay gravada
        const igv = gravada > 0 ? gravada * 0.18 : 0;
        const total = gravada + igv + exonerada + inafecta;
        
        setFormData(prev => ({
            ...prev,
            total_igv: igv.toFixed(2),
            total_importe: total.toFixed(2)
        }));
    }, [formData.total_gravada, formData.total_exonerada, formData.total_inafecta]);

    const fetchRegistros = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                action: 'listar',
                mes: mes.toString(),
                anio: anio.toString(),
                page: page.toString(),
                limit: limit.toString()
            });
            if (debouncedSearch) params.append('search', debouncedSearch);

            const res = await axios.get(`${API_URL}registro_ventas.php?${params}`, { headers });
            
            if (res.data.pagination) {
                setRegistros(res.data.data);
                setTotalPages(res.data.pagination.total_pages);
                setApiSummary(res.data.summary);
            } else {
                setRegistros(Array.isArray(res.data) ? res.data : []);
                setApiSummary(null);
            }
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar registros");
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        const dataToExport = registros.map(r => ({
            Fecha: new Date(r.fecha_emision).toLocaleDateString('es-PE'),
            Tipo: r.tipo_comprobante === '01' ? 'Factura' : r.tipo_comprobante === '03' ? 'Boleta' : r.tipo_comprobante,
            Serie: r.serie,
            Correlativo: r.correlativo,
            Cliente: r.cliente_razon_social,
            RUC: r.cliente_num_doc,
            Moneda: r.moneda,
            TC: r.tipo_cambio,
            Gravada: parseFloat(r.total_gravada).toFixed(2),
            IGV: parseFloat(r.total_igv).toFixed(2),
            Total: parseFloat(r.total_importe).toFixed(2),
            Estado: r.estado
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Ventas");
        XLSX.writeFile(wb, `Ventas_${anio}_${mes}.xlsx`);
    };

    const handleExportPLE = async () => {
        try {
            const res = await axios.get(`${API_URL}registro_ventas.php?action=exportar_ple&mes=${mes}&anio=${anio}`, {
                headers,
                responseType: 'blob'
            });
            
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `LE20100000001${anio}${mes.toString().padStart(2, '0')}00140100001111.txt`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success("PLE exportado correctamente");
        } catch (error) {
            toast.error("Error al exportar PLE");
        }
    };

    const handleAnular = async (id) => {
        if (!window.confirm("¿Está seguro de anular esta venta?")) return;
        try {
            await axios.post(`${API_URL}registro_ventas.php?action=anular`, { id }, { headers });
            toast.success("Venta anulada correctamente");
            fetchRegistros();
        } catch (error) {
            toast.error(error.response?.data?.error || "Error al anular");
        }
    };

    const handleDelete = (id) => {
        setDeletingId(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        try {
            await axios.post(`${API_URL}/registro_ventas.php?action=eliminar`, { id: deletingId }, { headers });
            toast.success("Venta eliminada correctamente");
            setShowDeleteModal(false);
            setDeletingId(null);
            fetchRegistros();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al eliminar");
        }
    };

    const handleCuadre = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}registro_ventas.php?action=cuadre_sunat&mes=${mes}&anio=${anio}`, { headers });
            setCuadre(res.data);
            setShowCuadreModal(true);
        } catch (error) {
            toast.error("Error al realizar cuadre");
        } finally {
            setLoading(false);
        }
    };

    const handleEditManual = (reg) => {
        setFormData({
            fecha_emision: reg.fecha_emision.split(' ')[0],
            tipo_comprobante: reg.tipo_comprobante,
            serie: reg.serie,
            correlativo: reg.correlativo,
            cliente_tipo_doc: reg.cliente_tipo_doc,
            cliente_num_doc: reg.cliente_num_doc,
            cliente_razon_social: reg.cliente_razon_social,
            moneda: reg.moneda,
            tipo_cambio: reg.tipo_cambio || '1.000',
            condicion_pago: reg.condicion_pago || 'Contado',
            total_gravada: parseFloat(reg.total_gravada),
            total_exonerada: parseFloat(reg.total_exonerada),
            total_inafecta: parseFloat(reg.total_inafecta),
            total_igv: parseFloat(reg.total_igv),
            total_importe: parseFloat(reg.total_importe),
            // Referencia
            ref_fecha_emision: reg.ref_fecha_emision || '',
            ref_tipo_comprobante: reg.ref_tipo_comprobante || '',
            ref_serie: reg.ref_serie || '',
            ref_numero: reg.ref_numero || ''
        });
        setFiles({ archivo_pago: null, archivo_detraccion: null });
        setEditingId(reg.id);
        setShowModal(true);
    };

    const handleSubmitManual = async (e) => {
        e.preventDefault();
        try {
            const action = editingId ? 'editar_manual' : 'crear_manual';
            
            const formDataToSend = new FormData();
            // Append all form fields
            Object.keys(formData).forEach(key => {
                formDataToSend.append(key, formData[key]);
            });
            
            if (editingId) {
                formDataToSend.append('id', editingId);
            }
            
            // Append files
            if (files.archivo_pago) {
                formDataToSend.append('archivo_pago', files.archivo_pago);
            }
            if (files.archivo_detraccion) {
                formDataToSend.append('archivo_detraccion', files.archivo_detraccion);
            }

            const res = await axios.post(`${API_URL}registro_ventas.php?action=${action}`, formDataToSend, { 
                headers: { 
                    ...headers,
                    'Content-Type': 'multipart/form-data'
                } 
            });

            toast.success(res.data.message);
            setShowModal(false);
            setEditingId(null);
            fetchRegistros();
            setFormData({
                fecha_emision: new Date().toISOString().split('T')[0],
                tipo_comprobante: '01',
                serie: '',
                correlativo: '',
                cliente_tipo_doc: '6',
                cliente_num_doc: '',
                cliente_razon_social: '',
                moneda: 'PEN',
                tipo_cambio: '3.750',
                condicion_pago: 'Contado',
                total_gravada: 0,
                total_exonerada: 0,
                total_inafecta: 0,
                total_igv: 0,
                total_importe: 0,
                ref_fecha_emision: '',
                ref_tipo_comprobante: '',
                ref_serie: '',
                ref_numero: ''
            });
            setFiles({ archivo_pago: null, archivo_detraccion: null });
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al guardar");
        }
    };

    // Cálculos en tiempo real
    const resumen = useMemo(() => {
        if (apiSummary) {
            return {
                total_ventas: parseFloat(apiSummary.total_ventas),
                total_igv: parseFloat(apiSummary.total_igv),
                total_registros: parseInt(apiSummary.total_registros)
            };
        }

        const activos = registros.filter(r => r.estado !== 'Anulado' && r.estado !== 'Generado');
        return {
            total_ventas: activos.reduce((sum, r) => sum + parseFloat(r.total_importe || 0), 0),
            total_igv: activos.reduce((sum, r) => sum + parseFloat(r.total_igv || 0), 0),
            total_registros: activos.length
        };
    }, [registros, apiSummary]);



    // Chart Data
    const chartData = useMemo(() => {
        if (!apiSummary?.daily_sales) return [];
        return apiSummary.daily_sales.map(d => ({
            dia: new Date(d.fecha).getDate(),
            total: parseFloat(d.total)
        }));
    }, [apiSummary]);

    return (
        <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto space-y-6">
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <ShoppingCart size={32} className="text-blue-600" /> Registro de Ventas
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gestión y control de ventas e ingresos</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <button onClick={fetchRegistros} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Actualizar">
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={() => setShowModal(true)} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm">
                        <Plus size={18} /> <span className="hidden sm:inline">Nueva Venta</span>
                    </button>
                    <button onClick={handleExportExcel} className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm">
                        <FileSpreadsheet size={18} /> <span className="hidden sm:inline">Excel</span>
                    </button>
                    <button onClick={handleExportPLE} className="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm">
                        <Download size={18} /> <span className="hidden sm:inline">PLE</span>
                    </button>
                    <button onClick={handleCuadre} className="flex-1 md:flex-none px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm">
                        <CheckCircle size={18} /> <span className="hidden sm:inline">Cuadre</span>
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Total Ventas</p>
                        <h3 className="text-2xl font-bold text-gray-800">S/ {resumen.total_ventas.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                        <DollarSign size={24} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500">IGV Generado</p>
                        <h3 className="text-2xl font-bold text-gray-800">S/ {resumen.total_igv.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <div className="p-3 bg-green-50 text-green-600 rounded-full">
                        <TrendingUp size={24} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Total Registros</p>
                        <h3 className="text-2xl font-bold text-gray-800">{resumen.total_registros}</h3>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-full">
                        <FileText size={24} />
                    </div>
                </div>
            </div>

            {/* Sales Chart */}
            {chartData.length > 0 && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Evolución de Ventas Diarias</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dia" />
                                <YAxis />
                                <Tooltip 
                                    formatter={(value) => [`S/ ${value.toFixed(2)}`, 'Ventas']}
                                    labelFormatter={(label) => `Día ${label}`}
                                />
                                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="flex gap-4 w-full md:w-auto">
                    <select value={mes} onChange={e => setMes(e.target.value)} className="flex-1 md:w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700">
                        {[...Array(12)].map((_, i) => (
                            <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('es', {month: 'long'})}</option>
                        ))}
                    </select>
                    <select value={anio} onChange={e => setAnio(e.target.value)} className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700">
                        <option value="2024">2024</option>
                        <option value="2025">2025</option>
                        <option value="2026">2026</option>
                    </select>
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar cliente, RUC o serie..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Comprobante</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Gravada</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">IGV</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Total</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Estado</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {registros.map((reg) => (
                                <tr key={reg.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                                        {new Date(reg.fecha_emision).toLocaleDateString('es-PE')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        <div className="font-medium text-gray-900">{reg.serie}-{reg.correlativo}</div>
                                        <div className="text-xs text-gray-500">{reg.tipo_comprobante === '01' ? 'Factura' : reg.tipo_comprobante === '03' ? 'Boleta' : reg.tipo_comprobante}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        <div className="font-medium text-gray-900 truncate max-w-[200px]" title={reg.cliente_razon_social}>
                                            {reg.cliente_razon_social}
                                        </div>
                                        <div className="text-xs text-gray-500">{reg.cliente_num_doc}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700 text-right font-mono">
                                        {parseFloat(reg.total_gravada).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700 text-right font-mono">
                                        {parseFloat(reg.total_igv).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right font-mono">
                                        {parseFloat(reg.total_importe).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            reg.estado === 'Aceptado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {reg.estado}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {reg.archivo_pago && String(reg.archivo_pago).split('|').filter(Boolean).map((path, idx) => (
                                                <a 
                                                    key={`pago-${reg.id}-${idx}`}
                                                    href={`${API_URL}${path}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-emerald-600 hover:text-emerald-900 p-1 hover:bg-emerald-50 rounded transition-colors"
                                                    title="Ver Constancia de Pago"
                                                >
                                                    <DollarSign size={18} />
                                                </a>
                                            ))}
                                            {reg.archivo_detraccion && String(reg.archivo_detraccion).split('|').filter(Boolean).map((path, idx) => (
                                                <a 
                                                    key={`det-${reg.id}-${idx}`}
                                                    href={`${API_URL}${path}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-purple-600 hover:text-purple-900 p-1 hover:bg-purple-50 rounded transition-colors"
                                                    title="Ver Constancia de Detracción"
                                                >
                                                    <Paperclip size={18} />
                                                </a>
                                            ))}
                                            {reg.estado !== 'Anulado' && (
                                                <button 
                                                    onClick={() => handleOpenUpload(reg)}
                                                    className="text-indigo-600 hover:text-indigo-900 p-1 hover:bg-indigo-50 rounded transition-colors"
                                                    title="Adjuntar Comprobantes"
                                                >
                                                    <Upload size={18} />
                                                </button>
                                            )}
                                            {reg.estado !== 'Anulado' && (
                                                <button 
                                                    onClick={() => handleOpenCuotaUpload(reg)}
                                                    className="text-teal-600 hover:text-teal-900 p-1 hover:bg-teal-50 rounded transition-colors"
                                                    title="Adjuntar por Cuota"
                                                >
                                                    <Upload size={18} />
                                                </button>
                                            )}
                                            {reg.modo_registro === 'manual' && reg.estado !== 'Anulado' && (
                                                <button 
                                                    onClick={() => handleEditManual(reg)}
                                                    className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded transition-colors"
                                                    title="Editar Venta Manual"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                            )}
                                            {reg.estado !== 'Anulado' && (
                                                <button 
                                                    onClick={() => navigate('/facturacion-electronica', { state: { invoiceToCredit: reg } })}
                                                    className="text-orange-600 hover:text-orange-900 p-1 hover:bg-orange-50 rounded transition-colors"
                                                    title="Emitir Nota de Crédito"
                                                >
                                                    <FileX size={18} />
                                                </button>
                                            )}
                                            {reg.estado !== 'Anulado' && (
                                                <button 
                                                    onClick={() => handleDelete(reg.id)}
                                                    className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition-colors"
                                                    title="Eliminar Venta"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {registros.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Search size={32} className="text-gray-300" />
                                            <p>No se encontraron registros</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-sm"
                    >
                        <ChevronLeft size={20} /> <span className="hidden sm:inline">Anterior</span>
                    </button>
                    <span className="text-gray-600 font-medium">
                        Página {page} de {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-sm"
                    >
                        <span className="hidden sm:inline">Siguiente</span> <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Modal Nueva Venta */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h2 className="text-xl font-bold text-gray-800">{editingId ? 'Editar Venta Manual' : 'Registrar Venta Manual'}</h2>
                            <button onClick={() => { setShowModal(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitManual} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Emisión</label>
                                    <input type="date" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.fecha_emision} onChange={e => setFormData({...formData, fecha_emision: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Doc.</label>
                                    <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.tipo_comprobante} onChange={e => setFormData({...formData, tipo_comprobante: e.target.value})}>
                                        <option value="01">Factura</option>
                                        <option value="03">Boleta</option>
                                        <option value="07">Nota de Crédito</option>
                                        <option value="08">Nota de Débito</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                                    <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                                        value={formData.serie} onChange={e => setFormData({...formData, serie: e.target.value.toUpperCase()})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Correlativo</label>
                                    <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.correlativo} onChange={e => setFormData({...formData, correlativo: e.target.value})} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                                    <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.moneda} onChange={e => setFormData({...formData, moneda: e.target.value})}>
                                        <option value="PEN">Soles</option>
                                        <option value="USD">Dólares</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Cambio</label>
                                    <input type="number" step="0.001" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.tipo_cambio} onChange={e => setFormData({...formData, tipo_cambio: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Condición Pago</label>
                                    <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.condicion_pago} onChange={e => setFormData({...formData, condicion_pago: e.target.value})}>
                                        <option value="Contado">Contado</option>
                                        <option value="Crédito">Crédito</option>
                                        <option value="Crédito a 30 días">Crédito a 30 días</option>
                                    </select>
                                </div>
                            </div>

                            {/* Referencia (Solo para Notas de Crédito/Débito) */}
                            {(formData.tipo_comprobante === '07' || formData.tipo_comprobante === '08') && (
                                <div className="space-y-4 pt-4 border-t border-gray-100 bg-blue-50 p-4 rounded-lg">
                                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-2">
                                        <FileText size={16} /> Documento que Modifica
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Ref.</label>
                                            <input type="date" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={formData.ref_fecha_emision} onChange={e => setFormData({...formData, ref_fecha_emision: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Ref.</label>
                                            <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={formData.ref_tipo_comprobante} onChange={e => setFormData({...formData, ref_tipo_comprobante: e.target.value})}>
                                                <option value="">Seleccione</option>
                                                <option value="01">Factura</option>
                                                <option value="03">Boleta</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Serie Ref.</label>
                                            <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                                                value={formData.ref_serie} onChange={e => setFormData({...formData, ref_serie: e.target.value.toUpperCase()})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Número Ref.</label>
                                            <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={formData.ref_numero} onChange={e => setFormData({...formData, ref_numero: e.target.value})} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Datos del Cliente</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Doc.</label>
                                        <select className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.cliente_tipo_doc} onChange={e => setFormData({...formData, cliente_tipo_doc: e.target.value})}>
                                            <option value="6">RUC</option>
                                            <option value="1">DNI</option>
                                            <option value="0">Otros</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Número Documento</label>
                                        <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.cliente_num_doc} onChange={e => setFormData({...formData, cliente_num_doc: e.target.value})} />
                                    </div>
                                    <div className="sm:col-span-3">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social / Nombre</label>
                                        <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.cliente_razon_social} onChange={e => setFormData({...formData, cliente_razon_social: e.target.value})} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Adjuntos</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Constancia de Pago</label>
                                        <input 
                                            type="file" 
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            onChange={e => setFiles({...files, archivo_pago: e.target.files[0]})} 
                                        />
                                        {editingId && !files.archivo_pago && (
                                            <p className="text-xs text-gray-500 mt-1">Dejar vacío para mantener el archivo actual (si existe).</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Constancia de Detracción</label>
                                        <input 
                                            type="file" 
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            onChange={e => setFiles({...files, archivo_detraccion: e.target.files[0]})} 
                                        />
                                        {editingId && !files.archivo_detraccion && (
                                            <p className="text-xs text-gray-500 mt-1">Dejar vacío para mantener el archivo actual (si existe).</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Importes</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Gravada</label>
                                        <input type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.total_gravada} onChange={e => setFormData({...formData, total_gravada: parseFloat(e.target.value) || 0})} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Exonerada</label>
                                        <input type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.total_exonerada} onChange={e => setFormData({...formData, total_exonerada: parseFloat(e.target.value) || 0})} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Inafecta</label>
                                        <input type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.total_inafecta} onChange={e => setFormData({...formData, total_inafecta: parseFloat(e.target.value) || 0})} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">IGV</label>
                                        <input type="number" disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
                                            value={formData.total_igv} />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <div className="text-right">
                                        <span className="text-sm text-gray-500 mr-2">Total a Pagar:</span>
                                        <span className="text-2xl font-bold text-gray-800">
                                            {formData.moneda === 'USD' ? '$' : 'S/'} {formData.total_importe}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-6 border-t border-gray-100">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                    <Save size={18} /> Guardar Venta
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Adjuntar Archivos */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h2 className="text-xl font-bold text-gray-800">Adjuntar Comprobantes</h2>
                            <button onClick={() => { setShowUploadModal(false); setUploadingId(null); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleUploadFiles} className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Constancia de Pago</label>
                                    <input 
                                        type="file" 
                                        multiple
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        onChange={e => setUploadFiles(prev => ({...prev, archivo_pago: e.target.files}))} 
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Formatos: PDF, JPG, PNG</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Constancia de Detracción</label>
                                    <input 
                                        type="file" 
                                        multiple
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        onChange={e => setUploadFiles(prev => ({...prev, archivo_detraccion: e.target.files}))} 
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Formatos: PDF, JPG, PNG</p>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 border-t border-gray-100">
                                <button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                                    <Upload size={18} /> Subir Archivos
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Adjuntar por Cuota */}
            {showCuotaUploadModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-gray-800">Adjuntar documentos por cuota</h2>
                                <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700">{cuotas.length} cuotas</span>
                            </div>
                            <button onClick={() => { setShowCuotaUploadModal(false); setCuotaRegId(null); setCuotas([]); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex justify-end">
                                <button
                                    onClick={uploadAllSelectedCuotaFiles}
                                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    disabled={Object.values(cuotaFiles).every(f => !f || f.length === 0)}
                                >
                                    <Upload size={16} /> Subir seleccionados
                                </button>
                            </div>
                            {cuotas.length === 0 ? (
                                <p className="text-gray-500">No hay cuotas registradas para esta venta.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuota</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Pago</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adjuntos</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {cuotas.map(c => (
                                                <tr key={c.id}>
                                                    <td className="px-6 py-4 text-sm text-gray-700">{c.cuota_nro}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">{c.fecha_pago}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-900">S/ {parseFloat(c.monto).toFixed(2)}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">{(c.adjuntos || []).length} adjuntos</span>
                                                            {(c.adjuntos || []).map((path, idx) => {
                                                                const name = String(path).split('/').pop();
                                                                return (
                                                                    <a key={idx} href={`${API_URL}${path}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                                                                        <Paperclip size={14} />
                                                                        <span className="max-w-[150px] truncate" title={name}>{name}</span>
                                                                    </a>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <label className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                                                                <Upload size={16} className="mr-2" />
                                                                Seleccionar archivos
                                                                <input
                                                                    type="file"
                                                                    multiple
                                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                                    onChange={e => handleCuotaFileChange(c.id, e.target.files)}
                                                                    className="hidden"
                                                                />
                                                            </label>
                                                            <button
                                                                onClick={() => handleUploadCuotaFiles(c.id)}
                                                                className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                                                disabled={uploadingCuotaIds.includes(c.id) || !(cuotaFiles[c.id] && cuotaFiles[c.id].length > 0)}
                                                            >
                                                                <Upload size={16} /> Subir
                                                            </button>
                                                        </div>
                                                        {cuotaFiles[c.id] && cuotaFiles[c.id].length > 0 && (
                                                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                                {Array.from(cuotaFiles[c.id]).map((f, idx) => (
                                                                    <span key={idx} className="inline-flex items-center px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 max-w-[180px] truncate" title={f.name}>
                                                                        {f.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Eliminar */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                                <AlertTriangle size={40} />
                            </div>
                            <h2 className="text-xl font-bold text-gray-800">¿Eliminar Venta?</h2>
                            <p className="text-gray-500">
                                Esta acción eliminará permanentemente la venta y su asiento contable asociado. No se puede deshacer.
                            </p>
                            <div className="flex gap-4 pt-4">
                                <button 
                                    onClick={() => setShowDeleteModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Cuadre SUNAT */}
            {showCuadreModal && cuadre && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h2 className="text-xl font-bold text-gray-800">Resultado Cuadre SUNAT</h2>
                            <button onClick={() => setShowCuadreModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-center">
                                {cuadre.estado === 'Cuadrado' ? (
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                        <CheckCircle size={40} />
                                    </div>
                                ) : (
                                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                        <AlertTriangle size={40} />
                                    </div>
                                )}
                            </div>
                            
                            <div className="text-center">
                                <h3 className={`text-lg font-bold ${cuadre.estado === 'Cuadrado' ? 'text-green-600' : 'text-red-600'}`}>
                                    {cuadre.estado}
                                </h3>
                                <p className="text-gray-500 text-sm mt-1">Comparación con propuesta SUNAT</p>
                            </div>

                            <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Total ERP:</span>
                                    <span className="font-mono font-bold">S/ {cuadre.erp.total.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Propuesta SUNAT:</span>
                                    <span className="font-mono font-bold">S/ {cuadre.sunat.total.toFixed(2)}</span>
                                </div>
                                <div className="border-t border-gray-200 pt-2 flex justify-between items-center text-lg">
                                    <span className="font-bold text-gray-800">Diferencia:</span>
                                    <span className={`font-mono font-bold ${cuadre.diferencia === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        S/ {cuadre.diferencia.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            <button onClick={() => setShowCuadreModal(false)} className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegistroVentas;
