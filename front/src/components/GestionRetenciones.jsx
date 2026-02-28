import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Toaster, toast } from 'react-hot-toast';
import { 
    FileText, Plus, Search, Trash2, Save, X, RefreshCw, 
    Download, CheckCircle, XCircle, AlertTriangle, FileCode 
} from 'lucide-react';

// Componente para Gestionar Retenciones
const SearchClientModal = ({ isOpen, onClose, onSelect }) => {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setTerm('');
            setResults([]);
        }
    }, [isOpen]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (term.length >= 2) search();
        }, 500);
        return () => clearTimeout(timer);
    }, [term]);

    const search = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}facturacion.php?action=buscar_clientes&q=${term}`);
            setResults(res.data);
        } catch (error) {
            console.error("Error buscando clientes", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">Buscar Cliente</h3>
                    <button onClick={onClose}><X size={24} className="text-gray-400" /></button>
                </div>
                <div className="p-4 border-b bg-gray-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="RUC o Razón Social..."
                            value={term}
                            onChange={e => setTerm(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-blue-500" /></div>
                    ) : results.length === 0 ? (
                        <div className="text-center p-8 text-gray-500">Sin resultados</div>
                    ) : (
                        <div className="space-y-2">
                            {results.map((item, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => { onSelect(item); onClose(); }}
                                    className="p-3 hover:bg-blue-50 rounded-lg cursor-pointer border border-gray-100 transition-colors"
                                >
                                    <p className="font-medium text-gray-800">{item.razon_social}</p>
                                    <p className="text-xs text-gray-500">{item.tipo_doc === '6' ? 'RUC' : 'DNI'}: {item.num_doc}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Modal de Búsqueda de Facturas Pendientes
const SearchInvoiceModal = ({ isOpen, onClose, onSelect, clientRuc }) => {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && clientRuc) {
            search();
        }
    }, [isOpen, clientRuc]);

    const search = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}retenciones.php?action=buscar_facturas_pendientes&ruc=${clientRuc}`);
            setResults(res.data);
        } catch (error) {
            console.error("Error buscando facturas", error);
            toast.error("Error al cargar facturas pendientes");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">Seleccionar Factura Pendiente</h3>
                    <button onClick={onClose}><X size={24} className="text-gray-400" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-blue-500" /></div>
                    ) : results.length === 0 ? (
                        <div className="text-center p-8 text-gray-500">No se encontraron facturas a crédito pendientes para este cliente</div>
                    ) : (
                        <div className="space-y-2">
                            {results.map((item, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => { onSelect(item); onClose(); }}
                                    className="p-3 hover:bg-blue-50 rounded-lg cursor-pointer border border-gray-100 transition-colors flex justify-between items-center"
                                >
                                    <div>
                                        <p className="font-medium text-gray-800">{item.serie}-{item.correlativo}</p>
                                        <p className="text-xs text-gray-500">{item.fecha_emision}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-blue-600">S/ {parseFloat(item.total).toFixed(2)}</p>
                                        <p className="text-xs text-gray-400">{item.moneda}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const GestionRetenciones = () => {
    const [activeTab, setActiveTab] = useState('listado');
    const [retenciones, setRetenciones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchClientOpen, setSearchClientOpen] = useState(false);
    const [searchInvoiceOpen, setSearchInvoiceOpen] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        serie: 'P001',
        fecha_emision: new Date().toISOString().split('T')[0],
        cliente: null, // { num_doc, razon_social, direccion, email }
        tasa_retencion: 3,
        observaciones: '',
        items: []
    });

    // Item input state
    const [currentItem, setCurrentItem] = useState({
        documento_relacionado_tipo: '01',
        documento_relacionado_serie: '',
        documento_relacionado_numero: '',
        documento_relacionado_fecha_emision: '',
        documento_relacionado_moneda: 'PEN',
        documento_relacionado_total: 0,
        pago_fecha: new Date().toISOString().split('T')[0],
        pago_numero: 1,
        pago_total_sin_retencion: 0
    });

    const fetchRetenciones = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}retenciones.php?action=listar`);
            setRetenciones(res.data);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar retenciones");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'listado') fetchRetenciones();
    }, [activeTab]);

    const handleAddItem = () => {
        if (!currentItem.documento_relacionado_serie || !currentItem.documento_relacionado_numero || !currentItem.documento_relacionado_total) {
            toast.error("Complete los datos del documento");
            return;
        }

        const totalDoc = parseFloat(currentItem.documento_relacionado_total);
        const pagoSinRet = parseFloat(currentItem.pago_total_sin_retencion || totalDoc); // Default to full amount if not specified
        const tasa = formData.tasa_retencion / 100;
        const importeRetenido = parseFloat((pagoSinRet * tasa).toFixed(2));
        const importePagado = parseFloat((pagoSinRet - importeRetenido).toFixed(2));

        const newItem = {
            ...currentItem,
            documento_relacionado_total: totalDoc,
            pago_total_sin_retencion: pagoSinRet,
            importe_retenido: importeRetenido,
            importe_pagado_con_retencion: importePagado,
            id: Date.now()
        };

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));

        // Reset inputs partially
        setCurrentItem(prev => ({
            ...prev,
            documento_relacionado_serie: '',
            documento_relacionado_numero: '',
            documento_relacionado_total: 0,
            pago_total_sin_retencion: 0
        }));
    };

    const removeItem = (id) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const handleSubmit = async () => {
        if (!formData.cliente) return toast.error("Seleccione un cliente");
        if (formData.items.length === 0) return toast.error("Agregue al menos un documento");

        const totalRetenido = formData.items.reduce((acc, item) => acc + item.importe_retenido, 0);
        const totalPagado = formData.items.reduce((acc, item) => acc + item.importe_pagado_con_retencion, 0);

        const payload = {
            serie: formData.serie,
            fecha_emision: formData.fecha_emision,
            cliente_num_doc: formData.cliente.num_doc,
            cliente_razon_social: formData.cliente.razon_social,
            cliente_direccion: formData.cliente.direccion,
            cliente_email: formData.cliente.email,
            tasa_retencion: formData.tasa_retencion,
            observaciones: formData.observaciones,
            total_retenido: totalRetenido,
            total_pagado: totalPagado,
            items: formData.items
        };

        const toastId = toast.loading("Emitiendo Retención...");
        try {
            const res = await axios.post(`${API_URL}retenciones.php?action=crear`, payload);
            if (res.data.nubefact?.success || res.data.message) {
                toast.success("Retención emitida correctamente", { id: toastId });
                setActiveTab('listado');
                setFormData({ ...formData, items: [], cliente: null });
            } else {
                toast.error("Error al emitir: " + (res.data.nubefact?.error || "Desconocido"), { id: toastId });
            }
        } catch (error) {
            toast.error("Error de conexión", { id: toastId });
            console.error(error);
        }
    };

    const handleAnular = async (id) => {
        if (!window.confirm("¿Está seguro de anular esta retención?")) return;
        const toastId = toast.loading("Anulando...");
        try {
            await axios.post(`${API_URL}retenciones.php?action=anular`, { id });
            toast.success("Anulada correctamente", { id: toastId });
            fetchRetenciones();
        } catch (error) {
            toast.error("Error al anular", { id: toastId });
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto animate-fade-in">
            <Toaster position="top-right" />
            
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <FileText className="text-blue-600" /> Gestión de Retenciones
                </h1>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setActiveTab('listado')}
                        className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'listado' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                        Listado
                    </button>
                    <button 
                        onClick={() => setActiveTab('nueva')}
                        className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'nueva' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Plus size={18} className="inline mr-1" /> Nueva Retención
                    </button>
                </div>
            </div>

            {activeTab === 'listado' ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left p-4 text-sm font-semibold text-gray-600">Fecha</th>
                                    <th className="text-left p-4 text-sm font-semibold text-gray-600">Número</th>
                                    <th className="text-left p-4 text-sm font-semibold text-gray-600">Cliente</th>
                                    <th className="text-right p-4 text-sm font-semibold text-gray-600">Total Retenido</th>
                                    <th className="text-center p-4 text-sm font-semibold text-gray-600">Estado</th>
                                    <th className="text-center p-4 text-sm font-semibold text-gray-600">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {retenciones.map(ret => (
                                    <tr key={ret.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 text-sm text-gray-600">{ret.fecha_emision}</td>
                                        <td className="p-4 text-sm font-medium text-gray-800">{ret.serie}-{ret.correlativo}</td>
                                        <td className="p-4 text-sm text-gray-600">
                                            <div className="font-medium">{ret.cliente_razon_social}</div>
                                            <div className="text-xs text-gray-400">{ret.cliente_num_doc}</div>
                                        </td>
                                        <td className="p-4 text-sm text-right font-medium text-gray-800">S/ {parseFloat(ret.total_retenido).toFixed(2)}</td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                ret.estado === 'Aceptado' ? 'bg-green-100 text-green-700' : 
                                                ret.estado === 'Anulado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {ret.estado}
                                            </span>
                                        </td>
                                        <td className="p-4 flex justify-center gap-2">
                                            {ret.enlace_pdf && (
                                                <a href={ret.enlace_pdf} target="_blank" rel="noopener noreferrer" className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="PDF">
                                                    <FileText size={18} />
                                                </a>
                                            )}
                                            {ret.enlace_xml && (
                                                <a href={ret.enlace_xml} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="XML">
                                                    <FileCode size={18} />
                                                </a>
                                            )}
                                            {ret.estado !== 'Anulado' && (
                                                <button onClick={() => handleAnular(ret.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Anular">
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {retenciones.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-gray-400">No hay retenciones registradas</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        {/* Cabecera */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="font-bold text-gray-800 mb-4 border-b pb-2">Datos del Cliente</h2>
                            <div className="flex gap-4 mb-4">
                                <button 
                                    onClick={() => setSearchClientOpen(true)}
                                    className="flex-1 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Search size={20} />
                                    {formData.cliente ? 'Cambiar Cliente' : 'Buscar Cliente (RUC/Razón Social)'}
                                </button>
                            </div>
                            {formData.cliente && (
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                    <p className="font-bold text-blue-800">{formData.cliente.razon_social}</p>
                                    <p className="text-sm text-blue-600">RUC: {formData.cliente.num_doc}</p>
                                    <p className="text-sm text-blue-600">{formData.cliente.direccion}</p>
                                </div>
                            )}
                        </div>

                        {/* Items */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-4 border-b pb-2">
                                <h2 className="font-bold text-gray-800">Documentos Relacionados</h2>
                                {formData.cliente && (
                                    <button 
                                        onClick={() => setSearchInvoiceOpen(true)}
                                        className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 flex items-center gap-1 transition-colors"
                                    >
                                        <Search size={16} /> Buscar Factura Pendiente
                                    </button>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 bg-gray-50 p-4 rounded-lg">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Serie</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded text-sm uppercase"
                                        placeholder="F001"
                                        value={currentItem.documento_relacionado_serie}
                                        onChange={e => setCurrentItem({...currentItem, documento_relacionado_serie: e.target.value.toUpperCase()})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Número</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded text-sm"
                                        placeholder="123"
                                        value={currentItem.documento_relacionado_numero}
                                        onChange={e => setCurrentItem({...currentItem, documento_relacionado_numero: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Fecha Emisión</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 border rounded text-sm"
                                        value={currentItem.documento_relacionado_fecha_emision}
                                        onChange={e => setCurrentItem({...currentItem, documento_relacionado_fecha_emision: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Total Doc.</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 border rounded text-sm"
                                        placeholder="0.00"
                                        value={currentItem.documento_relacionado_total}
                                        onChange={e => setCurrentItem({...currentItem, documento_relacionado_total: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Pago Total (Sin Ret)</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 border rounded text-sm"
                                        placeholder="Igual al total si es pago completo"
                                        value={currentItem.pago_total_sin_retencion}
                                        onChange={e => setCurrentItem({...currentItem, pago_total_sin_retencion: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Retención ({(formData.tasa_retencion)}%)</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded text-sm bg-gray-100 text-gray-500"
                                        readOnly
                                        value={((parseFloat(currentItem.pago_total_sin_retencion || 0) * formData.tasa_retencion) / 100).toFixed(2)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Neto a Pagar</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded text-sm bg-gray-100 text-gray-500"
                                        readOnly
                                        value={(parseFloat(currentItem.pago_total_sin_retencion || 0) - ((parseFloat(currentItem.pago_total_sin_retencion || 0) * formData.tasa_retencion) / 100)).toFixed(2)}
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button 
                                        onClick={handleAddItem}
                                        className="w-full bg-gray-800 text-white py-2 rounded-lg hover:bg-gray-700 text-sm"
                                    >
                                        Agregar Item
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="p-2 text-left">Documento</th>
                                            <th className="p-2 text-right">Total Doc</th>
                                            <th className="p-2 text-right">Pago (Base)</th>
                                            <th className="p-2 text-right">Retenido (3%)</th>
                                            <th className="p-2 text-right">A Pagar</th>
                                            <th className="p-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {formData.items.map(item => (
                                            <tr key={item.id} className="border-b">
                                                <td className="p-2">{item.documento_relacionado_serie}-{item.documento_relacionado_numero}</td>
                                                <td className="p-2 text-right">{item.documento_relacionado_total.toFixed(2)}</td>
                                                <td className="p-2 text-right">{item.pago_total_sin_retencion.toFixed(2)}</td>
                                                <td className="p-2 text-right font-bold text-blue-600">{item.importe_retenido.toFixed(2)}</td>
                                                <td className="p-2 text-right">{item.importe_pagado_con_retencion.toFixed(2)}</td>
                                                <td className="p-2 text-center">
                                                    <button onClick={() => removeItem(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="font-bold text-gray-800 mb-4 border-b pb-2">Resumen</h2>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Serie</span>
                                    <span className="font-medium">{formData.serie}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Fecha</span>
                                    <input 
                                        type="date" 
                                        className="text-right border-none p-0 focus:ring-0 text-sm"
                                        value={formData.fecha_emision}
                                        onChange={e => setFormData({...formData, fecha_emision: e.target.value})}
                                    />
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Tasa Retención</span>
                                    <span className="font-medium">{formData.tasa_retencion}%</span>
                                </div>
                                <div className="border-t pt-3 flex justify-between items-center">
                                    <span className="font-bold text-gray-800">Total Retenido</span>
                                    <span className="font-bold text-2xl text-blue-600">
                                        S/ {formData.items.reduce((acc, i) => acc + i.importe_retenido, 0).toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600">Total a Pagar Neto</span>
                                    <span className="font-medium">
                                        S/ {formData.items.reduce((acc, i) => acc + i.importe_pagado_con_retencion, 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={handleSubmit}
                                className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 flex justify-center items-center gap-2"
                            >
                                <Save size={20} /> Emitir Retención
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SearchClientModal 
                isOpen={searchClientOpen} 
                onClose={() => setSearchClientOpen(false)} 
                onSelect={client => setFormData({...formData, cliente: client})}
            />

            <SearchInvoiceModal 
                isOpen={searchInvoiceOpen} 
                onClose={() => setSearchInvoiceOpen(false)}
                clientRuc={formData.cliente?.num_doc}
                onSelect={(invoice) => {
                    setCurrentItem(prev => ({
                        ...prev,
                        documento_relacionado_serie: invoice.serie,
                        documento_relacionado_numero: invoice.correlativo,
                        documento_relacionado_fecha_emision: invoice.fecha_emision,
                        documento_relacionado_moneda: invoice.moneda,
                        documento_relacionado_total: invoice.total,
                        pago_total_sin_retencion: invoice.total
                    }));
                }}
            />
        </div>
    );
};

export default GestionRetenciones;
