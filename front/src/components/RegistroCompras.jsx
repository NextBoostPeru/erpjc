import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { 
    Plus, Upload, FileText, Search, Download, Filter, Save, X, Trash2, Edit,
    Calendar, DollarSign, CreditCard, ShoppingCart, AlertCircle, CheckCircle, MoreVertical,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const RegistroCompras = () => {
    const peruDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
    const [currentYear, currentMonth] = peruDate.split('-').map(Number);

    const [comprobantes, setComprobantes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [periodo, setPeriodo] = useState({
        mes: currentMonth,
        anio: currentYear
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [apiSummary, setApiSummary] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    const [showModal, setShowModal] = useState(false);
    const [showXmlModal, setShowXmlModal] = useState(false);
    const [showUploadCompraModal, setShowUploadCompraModal] = useState(false);
    const [uploadingCompraId, setUploadingCompraId] = useState(null);
    const [compraAdjuntos, setCompraAdjuntos] = useState([]);
    const [compraUploadFiles, setCompraUploadFiles] = useState([]);
    const [showCuotaUploadCompraModal, setShowCuotaUploadCompraModal] = useState(false);
    const [compraCuotas, setCompraCuotas] = useState([]);
    const [compraCuotaFiles, setCompraCuotaFiles] = useState({});
    const [uploadingCuotaIds, setUploadingCuotaIds] = useState([]);
    const [formData, setFormData] = useState({
        fecha_emision: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        fecha_vencimiento: '',
        tipo_comprobante: '01',
        serie: '',
        numero: '',
        proveedor_tipo_doc: '6',
        proveedor_num_doc: '',
        proveedor_razon_social: '',
        clasificacion_bienes_servicios: '1',
        moneda: 'PEN',
        tipo_cambio: 1.000,
        base_imponible_gravada: 0,
        igv_gravado: 0,
        base_imponible_mixta: 0,
        igv_mixto: 0,
        base_imponible_no_gravada: 0,
        igv_no_gravado: 0,
        valor_no_gravado: 0,
        isc: 0,
        icbper: 0,
        otros_tributos: 0,
        importe_total: 0,
        tiene_detraccion: false,
        constancia_detraccion: '',
        fecha_detraccion: '',
        monto_detraccion: 0,
        monto_retencion: 0,
        condicion_pago: 'Contado',
        ref_fecha_emision: '',
        ref_tipo_comprobante: '',
        ref_serie: '',
        ref_numero: ''
    });

    const token = localStorage.getItem('token');

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchComprobantes();
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [periodo, page, searchTerm]);

    const fetchComprobantes = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}registro_compras.php?action=listar&mes=${periodo.mes}&anio=${periodo.anio}&page=${page}&limit=20&search=${searchTerm}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.data.data) {
                setComprobantes(res.data.data);
                setTotalPages(res.data.meta.total_pages);
                setApiSummary(res.data.summary);
            } else {
                setComprobantes(Array.isArray(res.data) ? res.data : []);
                setTotalPages(1);
                setApiSummary(null);
            }
        } catch (error) {
            console.error("Error cargando compras:", error);
            toast.error("Error al cargar el registro de compras");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        
        setFormData(prev => {
            const newData = { ...prev, [name]: val };
            
            // Cálculo automático de IGV y Total si cambian las bases
            if (['base_imponible_gravada', 'base_imponible_mixta', 'base_imponible_no_gravada', 'valor_no_gravado', 'isc', 'icbper', 'otros_tributos'].includes(name)) {
                const bi_grav = parseFloat(newData.base_imponible_gravada || 0);
                const bi_mix = parseFloat(newData.base_imponible_mixta || 0);
                const bi_no_grav = parseFloat(newData.base_imponible_no_gravada || 0);
                
                const igv_grav = bi_grav * 0.18;
                const igv_mix = bi_mix * 0.18;
                const igv_no_grav = bi_no_grav * 0.18;
                
                newData.igv_gravado = igv_grav.toFixed(2);
                newData.igv_mixto = igv_mix.toFixed(2);
                newData.igv_no_gravado = igv_no_grav.toFixed(2);
                
                const total = bi_grav + igv_grav + 
                              bi_mix + igv_mix + 
                              bi_no_grav + igv_no_grav + 
                              parseFloat(newData.valor_no_gravado || 0) +
                              parseFloat(newData.isc || 0) +
                              parseFloat(newData.icbper || 0) +
                              parseFloat(newData.otros_tributos || 0);
                              
                newData.importe_total = total.toFixed(2);
            }
            return newData;
        });
    };

    const handleProveedorSearch = async () => {
        if (formData.proveedor_num_doc.length !== 11) {
            toast.error("El RUC debe tener 11 dígitos");
            return;
        }
        try {
            // Usamos el endpoint de facturación que ya tiene consulta RUC
            const res = await axios.get(`${API_URL}facturacion.php?action=consulta_ruc&ruc=${formData.proveedor_num_doc}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.razon_social) {
                setFormData(prev => ({
                    ...prev,
                    proveedor_razon_social: res.data.razon_social
                }));
                toast.success("Proveedor encontrado");
            } else {
                toast.error("Proveedor no encontrado");
            }
        } catch (error) {
            console.error("Error buscando proveedor:", error);
            toast.error("Error al buscar proveedor");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const endpoint = editMode ? 'editar' : 'crear';
            await axios.post(`${API_URL}/registro_compras.php?action=${endpoint}`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setShowModal(false);
            fetchComprobantes();
            toast.success(editMode ? "Compra actualizada correctamente" : "Compra registrada correctamente");
            resetForm();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al guardar");
        }
    };

    const handleEdit = (compra) => {
        setFormData({
            id: compra.id,
            fecha_emision: compra.fecha_emision,
            fecha_vencimiento: compra.fecha_vencimiento,
            tipo_comprobante: compra.tipo_comprobante,
            serie: compra.serie,
            numero: compra.numero,
            proveedor_tipo_doc: compra.proveedor_tipo_doc,
            proveedor_num_doc: compra.proveedor_num_doc,
            proveedor_razon_social: compra.proveedor_razon_social,
            clasificacion_bienes_servicios: compra.clasificacion_bienes_servicios || '1',
            moneda: compra.moneda,
            tipo_cambio: compra.tipo_cambio,
            base_imponible_gravada: compra.base_imponible_gravada,
            igv_gravado: compra.igv_gravado,
            base_imponible_mixta: compra.base_imponible_mixta,
            igv_mixto: compra.igv_mixto,
            base_imponible_no_gravada: compra.base_imponible_no_gravada,
            igv_no_gravado: compra.igv_no_gravado,
            valor_no_gravado: compra.valor_no_gravado,
            isc: compra.isc,
            icbper: compra.icbper,
            otros_tributos: compra.otros_tributos,
            importe_total: compra.importe_total,
            tiene_detraccion: compra.tiene_detraccion == 1,
            constancia_detraccion: compra.constancia_detraccion,
            fecha_detraccion: compra.fecha_detraccion,
            monto_detraccion: compra.monto_detraccion,
            monto_retencion: compra.monto_retencion,
            condicion_pago: compra.condicion_pago,
            ref_fecha_emision: compra.ref_fecha_emision || '',
            ref_tipo_comprobante: compra.ref_tipo_comprobante || '',
            ref_serie: compra.ref_serie || '',
            ref_numero: compra.ref_numero || ''
        });
        setEditMode(true);
        setShowModal(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            await axios.post(`${API_URL}registro_compras.php?action=eliminar`, { id: itemToDelete }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Compra eliminada correctamente");
            setShowDeleteModal(false);
            setItemToDelete(null);
            fetchComprobantes();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al eliminar");
        }
    };

    const handleAnular = async (id) => {
        if (!window.confirm("¿Está seguro de anular esta compra? Esta acción revertirá la contabilidad.")) return;
        
        try {
            await axios.post(`${API_URL}registro_compras.php?action=anular`, { id }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Compra anulada correctamente");
            fetchComprobantes();
        } catch (error) {
            toast.error(error.response?.data?.error || "Error al anular");
        }
    };

    const handleExportPLE = async () => {
        try {
            const res = await axios.get(`${API_URL}registro_compras.php?action=exportar_ple&mes=${periodo.mes}&anio=${periodo.anio}`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `LE${20601234567}${periodo.anio}${periodo.mes.toString().padStart(2,'0')}00080100001111.txt`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Archivo PLE exportado");
        } catch (error) {
            console.error("Error exportando PLE:", error);
            toast.error("Error al exportar PLE");
        }
    };
    
    const handleXmlUpload = async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('xmlFile');
        if (!fileInput.files[0]) return;
        
        const formData = new FormData();
        formData.append('xml_file', fileInput.files[0]);
        
        try {
            await axios.post(`${API_URL}registro_compras.php?action=importar_xml`, formData, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            setShowXmlModal(false);
            fetchComprobantes();
            toast.success("XML Importado correctamente");
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al importar XML");
        }
    };

    const handleOpenUploadCompra = async (compra) => {
        try {
            setUploadingCompraId(compra.id);
            setShowUploadCompraModal(true);
            setCompraUploadFiles([]);
            const res = await axios.get(`${API_URL}registro_compras.php?action=listar_adjuntos&id=${compra.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCompraAdjuntos(res.data?.data || []);
        } catch (error) {
            toast.error("Error cargando adjuntos");
        }
    };

    const handleUploadCompraFiles = async (e) => {
        e.preventDefault();
        try {
            if (!compraUploadFiles || compraUploadFiles.length === 0) {
                toast.error("Seleccione uno o más archivos");
                return;
            }
            const form = new FormData();
            form.append('compra_id', uploadingCompraId);
            Array.from(compraUploadFiles).forEach(f => form.append('archivos[]', f));
            const res = await axios.post(`${API_URL}registro_compras.php?action=subir_adjuntos`, form, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            toast.success(res.data?.message || "Adjuntos subidos");
            const refreshed = await axios.get(`${API_URL}registro_compras.php?action=listar_adjuntos&id=${uploadingCompraId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCompraAdjuntos(refreshed.data?.data || []);
            setCompraUploadFiles([]);
        } catch (error) {
            toast.error(error.response?.data?.message || "Error subiendo adjuntos");
        }
    };

    const handleOpenCuotaUploadCompra = async (compra) => {
        try {
            setShowCuotaUploadCompraModal(true);
            setUploadingCompraId(compra.id);
            setCompraCuotas([]);
            setCompraCuotaFiles({});
            setUploadingCuotaIds([]);
            const res = await axios.get(`${API_URL}registro_compras.php?action=listar_cuotas&id=${compra.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCompraCuotas(res.data?.data || []);
        } catch (error) {
            toast.error("Error cargando cuotas");
        }
    };

    const handleCompraCuotaFileChange = (cuotaId, filesList) => {
        setCompraCuotaFiles(prev => ({ ...prev, [cuotaId]: filesList }));
    };

    const handleUploadCompraCuotaFiles = async (cuotaId) => {
        try {
            setUploadingCuotaIds(prev => [...prev, cuotaId]);
            const filesList = compraCuotaFiles[cuotaId];
            if (!filesList || filesList.length === 0) {
                toast.error("Seleccione uno o más archivos");
                return;
            }
            const form = new FormData();
            form.append('cuota_id', cuotaId);
            Array.from(filesList).forEach(f => form.append('archivos_cuota[]', f));
            const res = await axios.post(`${API_URL}registro_compras.php?action=subir_adjuntos_cuota`, form, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            toast.success(res.data?.message || "Adjuntos de cuota subidos");
            const refreshed = await axios.get(`${API_URL}registro_compras.php?action=listar_cuotas&id=${uploadingCompraId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCompraCuotas(refreshed.data?.data || []);
            setCompraCuotaFiles(prev => ({ ...prev, [cuotaId]: [] }));
        } catch (error) {
            toast.error(error.response?.data?.message || "Error subiendo adjuntos de cuota");
        } finally {
            setUploadingCuotaIds(prev => prev.filter(id => id !== cuotaId));
        }
    };

    const resetForm = () => {
        setEditMode(false);
        setFormData({
            fecha_emision: new Date().toISOString().split('T')[0],
            fecha_vencimiento: '',
            tipo_comprobante: '01',
            serie: '',
            numero: '',
            proveedor_tipo_doc: '6',
            proveedor_num_doc: '',
            proveedor_razon_social: '',
            moneda: 'PEN',
            tipo_cambio: 1.000,
            base_imponible_gravada: 0,
            igv_gravado: 0,
            base_imponible_mixta: 0,
            igv_mixto: 0,
            base_imponible_no_gravada: 0,
            igv_no_gravado: 0,
            valor_no_gravado: 0,
            isc: 0,
            icbper: 0,
            otros_tributos: 0,
            importe_total: 0,
            tiene_detraccion: false,
            constancia_detraccion: '',
            fecha_detraccion: '',
            monto_detraccion: 0,
            monto_retencion: 0,
            condicion_pago: 'Contado'
        });
    };

    // Cálculos de resumen
    const resumen = useMemo(() => {
        if (apiSummary) {
            return {
                total_compras: parseFloat(apiSummary.total_compras || 0),
                total_igv: parseFloat(apiSummary.total_igv || 0),
                total_registros: parseInt(apiSummary.total_registros || 0)
            };
        }
        const activos = comprobantes.filter(c => c.estado !== 'Anulado');
        return {
            total_compras: activos.reduce((sum, c) => sum + parseFloat(c.importe_total || 0), 0),
            total_igv: activos.reduce((sum, c) => sum + parseFloat(c.igv_gravado || 0) + parseFloat(c.igv_mixto || 0) + parseFloat(c.igv_no_gravado || 0), 0),
            total_registros: activos.length
        };
    }, [comprobantes, apiSummary]);

    return (
        <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto">
            <Toaster position="top-right" />
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <ShoppingCart className="w-8 h-8 text-blue-600" /> 
                        Registro de Compras
                    </h1>
                    <p className="text-gray-500 mt-1">Gestión de comprobantes y gastos.</p>
                </div>
                
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <button 
                        onClick={() => setShowXmlModal(true)}
                        className="flex-1 md:flex-none bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                        <Upload size={18} /> Importar XML
                    </button>
                    <button 
                        onClick={handleExportPLE}
                        className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                        <Download size={18} /> Exportar PLE
                    </button>
                    <button 
                        onClick={() => { resetForm(); setShowModal(true); }}
                        className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                        <Plus size={18} /> Nueva Compra
                    </button>
                </div>
            </div>

            {/* Resumen Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-gray-500 text-sm font-medium">Total Registros</p>
                        <p className="text-2xl font-bold text-gray-800">{resumen.total_registros}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-green-50 rounded-lg text-green-600">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-gray-500 text-sm font-medium">Total Compras (S/)</p>
                        <p className="text-2xl font-bold text-gray-800">S/ {resumen.total_compras.toFixed(2)}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <p className="text-gray-500 text-sm font-medium">IGV Crédito Fiscal</p>
                        <p className="text-2xl font-bold text-gray-800">S/ {resumen.total_igv.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Filtros y Tabla */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50">
                    <div className="flex gap-2 items-center w-full md:w-auto">
                        <select 
                            value={periodo.mes} 
                            onChange={e => setPeriodo({...periodo, mes: e.target.value})}
                            className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                        >
                            {[...Array(12)].map((_, i) => (
                                <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('es', {month: 'long'})}</option>
                            ))}
                        </select>
                        <select 
                            value={periodo.anio} 
                            onChange={e => setPeriodo({...periodo, anio: e.target.value})}
                            className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                        >
                            {[2023, 2024, 2025, 2026].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="relative w-full md:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={16} className="text-gray-400" />
                        </div>
                        <input 
                            type="text" 
                            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5" 
                            placeholder="Buscar proveedor o número..." 
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-4 py-3">Emisión</th>
                                <th className="px-4 py-3">Comprobante</th>
                                <th className="px-4 py-3">Proveedor</th>
                                <th className="px-4 py-3 text-right">Base Imp.</th>
                                <th className="px-4 py-3 text-right">IGV</th>
                                <th className="px-4 py-3 text-right">Total</th>
                                <th className="px-4 py-3 text-center">Estado</th>
                                <th className="px-4 py-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-8 text-center">
                                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </td>
                                </tr>
                            ) : comprobantes.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                                        No se encontraron registros
                                    </td>
                                </tr>
                            ) : (
                                comprobantes.map((compra) => (
                                    <tr key={compra.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {new Date(compra.fecha_emision).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2 py-0.5 rounded border border-gray-200">
                                                {compra.tipo_comprobante}-{compra.serie}-{compra.numero}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 max-w-xs truncate" title={compra.proveedor_razon_social}>
                                            <div className="font-medium text-gray-900">{compra.proveedor_razon_social}</div>
                                            <div className="text-xs text-gray-400">{compra.proveedor_num_doc}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {parseFloat(compra.base_imponible_gravada).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {(parseFloat(compra.igv_gravado) + parseFloat(compra.igv_mixto) + parseFloat(compra.igv_no_gravado)).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                                            {compra.moneda === 'USD' ? '$' : 'S/'} {parseFloat(compra.importe_total).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                compra.estado === 'Anulado' 
                                                ? 'bg-red-100 text-red-800' 
                                                : 'bg-green-100 text-green-800'
                                            }`}>
                                                {compra.estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {compra.estado !== 'Anulado' && (
                                                <div className="flex justify-center gap-2">
                                                    <button 
                                                        onClick={() => handleEdit(compra)}
                                                        className="text-blue-500 hover:text-blue-700 transition-colors p-1"
                                                        title="Editar"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    {(compra.condicion_pago !== 'Contado' || compra.tiene_detraccion == 1) && (
                                                        <button 
                                                            onClick={() => handleOpenUploadCompra(compra)}
                                                            className="text-green-600 hover:text-green-800 transition-colors p-1"
                                                            title="Adjuntar Documentos"
                                                        >
                                                            <Upload size={18} />
                                                        </button>
                                                    )}
                                                    {compra.condicion_pago !== 'Contado' && (
                                                        <button 
                                                            onClick={() => handleOpenCuotaUploadCompra(compra)}
                                                            className="text-purple-600 hover:text-purple-800 transition-colors p-1"
                                                            title="Adjuntar por Cuota"
                                                        >
                                                            <CreditCard size={18} />
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => { setItemToDelete(compra.id); setShowDeleteModal(true); }}
                                                        className="text-red-500 hover:text-red-700 transition-colors p-1"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
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

            {showUploadCompraModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
                        <div className="bg-green-600 px-6 py-4 rounded-t-xl flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">Adjuntar Documentos</h3>
                            <button onClick={() => setShowUploadCompraModal(false)} className="text-green-100 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleUploadCompraFiles} className="p-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Archivos</label>
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={e => setCompraUploadFiles(e.target.files)}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                                />
                            </div>
                            <div className="mb-4">
                                <div className="text-sm text-gray-600 mb-2">Adjuntos existentes</div>
                                <div className="flex flex-wrap gap-2">
                                    {compraAdjuntos.length === 0 ? (
                                        <span className="text-gray-400 text-sm">Sin adjuntos</span>
                                    ) : compraAdjuntos.map(a => (
                                        <a key={a.path} href={`${API_URL}${a.path}`} target="_blank" rel="noreferrer" className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs border hover:bg-gray-200">
                                            {a.path.split('/').pop()}
                                        </a>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowUploadCompraModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cerrar</button>
                                <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Subir</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCuotaUploadCompraModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
                        <div className="bg-purple-600 px-6 py-4 rounded-t-xl flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">Adjuntar por Cuota</h3>
                            <button onClick={() => setShowCuotaUploadCompraModal(false)} className="text-purple-100 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="text-sm text-gray-600 mb-3">Cuotas: {compraCuotas.length}</div>
                            <div className="space-y-4">
                                {compraCuotas.map(c => (
                                    <div key={c.id} className="border rounded-lg p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="font-medium text-gray-800">Cuota {c.cuota_nro} • {new Date(c.fecha_pago).toLocaleDateString()} • {c.monto}</div>
                                            <button
                                                onClick={() => handleUploadCompraCuotaFiles(c.id)}
                                                disabled={uploadingCuotaIds.includes(c.id)}
                                                className="px-3 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50"
                                            >
                                                Subir
                                            </button>
                                        </div>
                                        <div className="mt-3">
                                            <input
                                                type="file"
                                                multiple
                                                accept=".pdf,.jpg,.jpeg,.png"
                                                onChange={e => handleCompraCuotaFileChange(c.id, e.target.files)}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                                            />
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {(c.adjuntos || []).length === 0 ? (
                                                <span className="text-gray-400 text-xs">Sin adjuntos</span>
                                            ) : c.adjuntos.map(p => (
                                                <a key={p} href={`${API_URL}${p}`} target="_blank" rel="noreferrer" className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs border hover:bg-gray-200">
                                                    {p.split('/').pop()}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Nueva Compra */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8">
                        <div className="bg-blue-600 px-6 py-4 rounded-t-xl flex justify-between items-center sticky top-0 z-10">
                            <h3 className="text-white font-bold text-lg">{editMode ? 'Editar Compra' : 'Nueva Compra'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-blue-100 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                {/* Datos Generales */}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-gray-700 border-b pb-2">Datos del Comprobante</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Fecha Emisión</label>
                                        <input type="date" name="fecha_emision" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.fecha_emision} onChange={handleInputChange} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Serie</label>
                                            <input type="text" name="serie" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.serie} onChange={handleInputChange} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Número</label>
                                            <input type="text" name="numero" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.numero} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Tipo Comprobante</label>
                                        <select name="tipo_comprobante" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.tipo_comprobante} onChange={handleInputChange}>
                                            <option value="01">Factura</option>
                                            <option value="03">Boleta de Venta</option>
                                            <option value="07">Nota de Crédito</option>
                                            <option value="08">Nota de Débito</option>
                                            <option value="02">Recibo por Honorarios</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Clasificación (PLE)</label>
                                        <select name="clasificacion_bienes_servicios" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.clasificacion_bienes_servicios} onChange={handleInputChange}>
                                            <option value="1">1. Mercadería</option>
                                            <option value="2">2. Activo Fijo</option>
                                            <option value="3">3. Otros Activos</option>
                                            <option value="4">4. Gastos Educ/Rec</option>
                                            <option value="5">5. Otros Gastos</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Estado Pago</label>
                                        <select 
                                            name="condicion_pago" 
                                            value={formData.condicion_pago} 
                                            onChange={handleInputChange} 
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                        >
                                            <option value="Contado">Contado</option>
                                            <option value="Crédito">Crédito</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Sección Referencia Comprobante (Solo NC/ND) */}
                                {(formData.tipo_comprobante === '07' || formData.tipo_comprobante === '08') && (
                                    <div className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200 col-span-1 md:col-span-3">
                                        <h4 className="font-semibold text-gray-700 mb-2 text-sm flex items-center">
                                            <FileText size={16} className="mr-1" /> Documento que Modifica
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500">Fecha Ref.</label>
                                                <input 
                                                    type="date" 
                                                    name="ref_fecha_emision" 
                                                    value={formData.ref_fecha_emision} 
                                                    onChange={handleInputChange} 
                                                    className="w-full border p-2 rounded text-sm" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500">Tipo Ref.</label>
                                                <select 
                                                    name="ref_tipo_comprobante" 
                                                    value={formData.ref_tipo_comprobante} 
                                                    onChange={handleInputChange} 
                                                    className="w-full border p-2 rounded text-sm"
                                                >
                                                    <option value="">Seleccione</option>
                                                    <option value="01">Factura</option>
                                                    <option value="03">Boleta</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500">Serie Ref.</label>
                                                <input 
                                                    type="text" 
                                                    name="ref_serie" 
                                                    value={formData.ref_serie} 
                                                    onChange={handleInputChange} 
                                                    className="w-full border p-2 rounded text-sm" 
                                                    placeholder="F001"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500">Número Ref.</label>
                                                <input 
                                                    type="text" 
                                                    name="ref_numero" 
                                                    value={formData.ref_numero} 
                                                    onChange={handleInputChange} 
                                                    className="w-full border p-2 rounded text-sm" 
                                                    placeholder="123456"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Datos Proveedor */}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-gray-700 border-b pb-2">Datos del Proveedor</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">RUC Proveedor</label>
                                        <div className="flex gap-2">
                                            <input type="text" name="proveedor_num_doc" required maxLength="11" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.proveedor_num_doc} onChange={handleInputChange} />
                                            <button type="button" onClick={handleProveedorSearch} className="mt-1 bg-gray-100 hover:bg-gray-200 p-2 rounded-md border border-gray-300 text-gray-600">
                                                <Search size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Razón Social</label>
                                        <input type="text" name="proveedor_razon_social" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-gray-50" value={formData.proveedor_razon_social} onChange={handleInputChange} readOnly />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Moneda</label>
                                        <select name="moneda" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.moneda} onChange={handleInputChange}>
                                            <option value="PEN">Soles (PEN)</option>
                                            <option value="USD">Dólares (USD)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Importes */}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-gray-700 border-b pb-2">Importes</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Base Imponible Gravada</label>
                                        <div className="relative rounded-md shadow-sm">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                <span className="text-gray-500 sm:text-sm">{formData.moneda === 'PEN' ? 'S/' : '$'}</span>
                                            </div>
                                            <input type="number" step="0.01" name="base_imponible_gravada" className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" value={formData.base_imponible_gravada} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">IGV (18%)</label>
                                        <input type="number" step="0.01" name="igv_gravado" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-gray-50" value={formData.igv_gravado} readOnly />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900">Importe Total</label>
                                        <input type="number" step="0.01" name="importe_total" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border font-bold text-lg bg-gray-50" value={formData.importe_total} readOnly />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-gray-50 -mx-6 -mb-6 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Cancelar</button>
                                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">Guardar Compra</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal XML */}
            {showXmlModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Upload size={20} className="text-blue-600" /> Importar XML
                        </h3>
                        <form onSubmit={handleXmlUpload}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Seleccionar archivo XML</label>
                                <input type="file" id="xmlFile" accept=".xml" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setShowXmlModal(false)} className="px-4 py-2 bg-gray-200 rounded text-gray-700">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Importar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Modal Confirmar Eliminación */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600">
                                <AlertCircle size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar compra?</h3>
                            <p className="text-gray-500 mb-6">Esta acción eliminará permanentemente la compra y su asiento contable. No se puede deshacer.</p>
                            
                            <div className="flex gap-3 w-full">
                                <button 
                                    onClick={() => setShowDeleteModal(false)}
                                    className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm"
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegistroCompras;
