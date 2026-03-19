import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../api/config';
import { 
    FileText, Send, Trash2, Printer, Search, Plus, AlertCircle, 
    CheckCircle, XCircle, RefreshCw, AlertTriangle, Eye, 
    Calendar, DollarSign, TrendingUp, Archive, Save, X, Mail, CloudUpload, FileSymlink, Download, FileCode, Copy, Edit
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';

// Modal de Búsqueda (Productos/Clientes)
const SearchModal = ({ isOpen, onClose, type, onSelect }) => {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setTerm('');
            setResults([]);
            return;
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
            const endpoint = type === 'product' ? 'buscar_productos' : 'buscar_clientes';
            const token = localStorage.getItem('token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const res = await axios.get(`${API_URL}facturacion.php?action=${endpoint}&q=${term}`, { headers });
            setResults(res.data);
        } catch (error) {
            console.error("Error buscando", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800">
                        Buscar {type === 'product' ? 'Producto' : 'Cliente'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-4 border-b bg-gray-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder={type === 'product' ? "Buscar por nombre o código..." : "Buscar por Razón Social o RUC..."}
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
                        <div className="text-center p-8 text-gray-500">
                            {term.length < 2 ? "Ingrese al menos 2 caracteres" : "No se encontraron resultados"}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {results.map((item, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => { onSelect(item); onClose(); }}
                                    className="p-3 hover:bg-blue-50 rounded-lg cursor-pointer border border-gray-100 transition-colors group"
                                >
                                    {type === 'product' ? (
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-medium text-gray-800 group-hover:text-blue-700">{item.nombre}</p>
                                                <p className="text-xs text-gray-500">Cod: {item.codigo_interno} | Precio: S/ {item.precio}</p>
                                            </div>
                                            <span className="text-blue-600 font-bold">S/ {item.precio}</span>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-medium text-gray-800 group-hover:text-blue-700">{item.razon_social}</p>
                                                <p className="text-xs text-gray-500">{item.tipo_doc === '6' ? 'RUC' : 'DNI'}: {item.num_doc}</p>
                                            </div>
                                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">Seleccionar</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Modal de Email
const EmailModal = ({ isOpen, onClose, onSubmit, defaultEmail }) => {
    const [email, setEmail] = useState(defaultEmail || '');
    
    useEffect(() => { setEmail(defaultEmail || ''); }, [defaultEmail, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Mail className="text-blue-600" /> Enviar Comprobante
                </h3>
                <input 
                    type="email" 
                    className="w-full px-4 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                    <button 
                        onClick={() => onSubmit(email)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                        <Send size={16} /> Enviar
                    </button>
                </div>
            </div>
        </div>
    );
};

const FacturacionElectronica = () => {
    const [activeTab, setActiveTab] = useState('emision');
    const [loading, setLoading] = useState(false);
    const [resumen, setResumen] = useState({ hoy: { total: 0, cantidad: 0 }, mes: { total: 0, cantidad: 0 }, pendientes_sunat: 0 });
    const [historial, setHistorial] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    // Estados para Modales
    const [anularModal, setAnularModal] = useState({ isOpen: false, id: null, motivo: '' });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, isDraft: false });
    const [searchModal, setSearchModal] = useState({ isOpen: false, type: 'product' });
    const [emailModal, setEmailModal] = useState({ isOpen: false, id: null, email: '' });
    const [viewModal, setViewModal] = useState({ isOpen: false, data: null, items: [], loading: false });
    const [editingId, setEditingId] = useState(null);
    
    // Formulario Emisión
    const [formData, setFormData] = useState({
        tipo_comprobante: '01',
        serie: '',
        correlativo: '',
        fecha_emision: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        fecha_vencimiento: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
        condicion_pago: 'Contado',
        numero_cuotas: 1,
        cuotas: [], // Array de { fecha, monto }
        cliente_tipo_doc: '6',
        cliente_num_doc: '',
        cliente_razon_social: '',
        cliente_direccion: '',
        moneda: 'PEN',
        tipo_cambio: 1.000,
        generar_asiento: true,
        items: [],
        doc_referencia_tipo: '01',
        doc_referencia_serie: '',
        doc_referencia_correlativo: '',
        doc_referencia_fecha: '',
        motivo_emision: '01',
        motivo_descripcion: '',
        tiene_detraccion: false,
        codigo_bien_detraccion: '',
        porcentaje_detraccion: 0,
        constancia_detraccion: '',
        fecha_detraccion: '',
        monto_detraccion: 0
    });

    const [currentItem, setCurrentItem] = useState({
        codigo: '',
        descripcion: '',
        cantidad: 1,
        valor_unitario: 0,
        unidad_medida: 'NIU'
    });
    
    const [bancos, setBancos] = useState([]);

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const location = useLocation();
    const navigate = useNavigate();
    const targetSerieRef = useRef(null);
    const lastAutoEditIdRef = useRef(null);

    // Refs para control de regeneración de cuotas
    const prevMontoBaseRef = useRef(0);
    const prevNumCuotasRef = useRef(1);
    const prevFechaVencimientoRef = useRef('');

    const prepareNote = (invoice) => {
        setActiveTab('emision');
        
        // Determinar serie por defecto (F... -> FC01/FD01, B... -> BC01/BD01)
        // Por defecto preparamos Nota de Crédito (07), pero el usuario puede cambiar a Débito (08)
        const isBoleta = invoice.serie.charAt(0) === 'B';
        const targetSerie = isBoleta ? 'BC01' : 'FC01';
        targetSerieRef.current = targetSerie;

        setFormData(prev => ({
            ...prev,
            tipo_comprobante: '07',
            serie: targetSerie,
            doc_referencia_tipo: invoice.tipo_comprobante,
            doc_referencia_serie: invoice.serie,
            doc_referencia_correlativo: invoice.correlativo,
            doc_referencia_fecha: invoice.fecha_emision,
            // Pre-fill visual reference field if needed
            doc_referencia_numero: `${invoice.serie}-${invoice.correlativo}`,
            
            cliente_tipo_doc: invoice.cliente_tipo_doc,
            cliente_num_doc: invoice.cliente_num_doc,
            cliente_razon_social: invoice.cliente_razon_social,
            cliente_direccion: '', 
            
            moneda: invoice.moneda,
            tipo_cambio: invoice.tipo_cambio,
            motivo_emision: '01'
        }));

        const fetchInvoiceDetails = async () => {
             try {
                const res = await axios.get(`${API_URL}facturacion.php?action=obtener_detalle&id=${invoice.id}`, { headers });
                const items = res.data.map(d => ({
                    codigo: d.item_codigo || '',
                    descripcion: d.descripcion,
                    unidad_medida: d.unidad_medida,
                    cantidad: parseFloat(d.cantidad),
                    valor_unitario: parseFloat(d.valor_unitario),
                    precio_unitario: parseFloat(d.precio_unitario),
                    valor_venta: parseFloat(d.valor_venta),
                    igv: parseFloat(d.igv)
                }));
                
                setFormData(prev => ({ ...prev, items }));
             } catch (error) {
                 console.error(error);
                 toast.error("Error al cargar detalles de la factura");
             }
        };
        fetchInvoiceDetails();
    };

    const handleEditInvoice = (invoice) => {
        setActiveTab('emision');
        setEditingId(invoice.id);
        
        setFormData(prev => ({
            ...prev,
            tipo_comprobante: invoice.tipo_comprobante,
            serie: invoice.serie,
            correlativo: invoice.correlativo,
            fecha_emision: invoice.fecha_emision,
            fecha_vencimiento: invoice.fecha_vencimiento,
            condicion_pago: invoice.condicion_pago || 'Contado',
            numero_cuotas: invoice.numero_cuotas || 1,
            cliente_tipo_doc: invoice.cliente_tipo_doc,
            cliente_num_doc: invoice.cliente_num_doc,
            cliente_razon_social: invoice.cliente_razon_social,
            cliente_direccion: invoice.cliente_direccion || '',
            moneda: invoice.moneda,
            tipo_cambio: parseFloat(invoice.tipo_cambio || 1),
            doc_referencia_tipo: invoice.doc_referencia_tipo || '01',
            doc_referencia_serie: invoice.ref_serie || invoice.doc_referencia_serie || '',
            doc_referencia_correlativo: invoice.ref_numero || invoice.doc_referencia_numero || '',
            doc_referencia_fecha: invoice.ref_fecha_emision || invoice.fecha_emision,
            doc_referencia_numero: invoice.doc_referencia_numero || (invoice.ref_serie && invoice.ref_numero ? `${invoice.ref_serie}-${invoice.ref_numero}` : ''),
            motivo_emision: invoice.motivo_emision || '01',
            motivo_descripcion: invoice.motivo_descripcion || '',
            tiene_detraccion: invoice.tiene_detraccion === 1 || invoice.tiene_detraccion === '1',
            codigo_bien_detraccion: invoice.codigo_bien_detraccion || '',
            porcentaje_detraccion: parseFloat(invoice.porcentaje_detraccion || 0),
            constancia_detraccion: invoice.constancia_detraccion || '',
            fecha_detraccion: invoice.fecha_detraccion || '',
            monto_detraccion: parseFloat(invoice.monto_detraccion || 0),
            items: []
        }));

        const fetchInvoiceDetails = async () => {
            try {
                const res = await axios.get(`${API_URL}facturacion.php?action=obtener_detalle&id=${invoice.id}`, { headers });
                const items = res.data.map(d => ({
                    codigo: d.item_codigo || '',
                    descripcion: d.descripcion,
                    unidad_medida: d.unidad_medida,
                    cantidad: parseFloat(d.cantidad),
                    valor_unitario: parseFloat(d.valor_unitario),
                    precio_unitario: parseFloat(d.precio_unitario),
                    valor_venta: parseFloat(d.valor_venta),
                    igv: parseFloat(d.igv)
                }));
                
                setFormData(prev => ({ ...prev, items }));
            } catch (error) {
                console.error(error);
                toast.error("Error al cargar detalles del comprobante");
            }
        };
        fetchInvoiceDetails();
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const editId = params.get('edit');
        if (!editId) return;
        if (lastAutoEditIdRef.current === editId) return;
        lastAutoEditIdRef.current = editId;

        const fetchAndEdit = async () => {
            const toastId = toast.loading("Cargando venta...");
            try {
                const res = await axios.get(`${API_URL}facturacion.php?action=obtener_cabecera&id=${editId}`, { headers });
                handleEditInvoice(res.data);
                navigate({ pathname: location.pathname }, { replace: true });
                toast.success("Venta lista para editar", { id: toastId });
            } catch (error) {
                toast.error(error.response?.data?.message || "No se pudo cargar la venta", { id: toastId });
            }
        };

        fetchAndEdit();
    }, [location.pathname, location.search]);

    const handleDuplicateInvoice = (invoice) => {
        setActiveTab('emision');
        
        setFormData(prev => ({
            ...prev,
            tipo_comprobante: invoice.tipo_comprobante,
            serie: '', 
            correlativo: '',
            fecha_emision: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
            fecha_vencimiento: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
            
            cliente_tipo_doc: invoice.cliente_tipo_doc,
            cliente_num_doc: invoice.cliente_num_doc,
            cliente_razon_social: invoice.cliente_razon_social,
            cliente_direccion: invoice.cliente_direccion || '',
            
            moneda: invoice.moneda,
            tipo_cambio: invoice.tipo_cambio,
            
            doc_referencia_tipo: '01',
            doc_referencia_serie: '',
            doc_referencia_correlativo: '',
            doc_referencia_fecha: '',
            doc_referencia_numero: '',
            motivo_emision: '01',
            motivo_descripcion: '',
            
            items: []
        }));

        const fetchInvoiceDetails = async () => {
             try {
                const toastId = toast.loading("Cargando detalles para duplicar...");
                const res = await axios.get(`${API_URL}facturacion.php?action=obtener_detalle&id=${invoice.id}`, { headers });
                const items = res.data.map(d => ({
                    codigo: d.item_codigo || '',
                    descripcion: d.descripcion,
                    unidad_medida: d.unidad_medida,
                    cantidad: parseFloat(d.cantidad),
                    valor_unitario: parseFloat(d.valor_unitario),
                    precio_unitario: parseFloat(d.precio_unitario),
                    valor_venta: parseFloat(d.valor_venta),
                    igv: parseFloat(d.igv)
                }));
                
                setFormData(prev => ({ ...prev, items }));
                toast.success("Factura duplicada para edición", { id: toastId });
             } catch (error) {
                 console.error(error);
                 toast.error("Error al cargar detalles de la factura");
             }
        };
        fetchInvoiceDetails();
    };

    useEffect(() => {
        if (location.state?.invoiceToCredit) {
            prepareNote(location.state.invoiceToCredit);
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Initial load
    useEffect(() => {
        fetchResumen();
        fetchBancos();
    }, []);

    const fetchBancos = async () => {
        try {
            const res = await axios.get(`${API_URL}bancos.php?action=listar_cuentas`, { headers });
            // Filtrar solo las que se mostrarán en PDF y están activas
            const bancosActivos = res.data.filter(b => b.mostrar_en_pdf == 1 && b.estado === 'Activo');
            setBancos(bancosActivos);
        } catch (error) {
            console.error("Error cargando bancos", error);
        }
    };

    // Fetch history when params change
    useEffect(() => {
        if (activeTab === 'historial') {
            fetchHistorial();
        }
    }, [activeTab, page, debouncedSearch]);

    // Fetch correlativo when type changes
    useEffect(() => {
        if (activeTab === 'emision') {
            const serieToUse = targetSerieRef.current || '';
            targetSerieRef.current = null;
            fetchCorrelativo(formData.tipo_comprobante, serieToUse);
        }
    }, [activeTab, formData.tipo_comprobante]);

    const fetchResumen = async () => {
        try {
            const res = await axios.get(`${API_URL}facturacion.php?action=resumen`, { headers });
            setResumen(res.data);
        } catch (error) {
            console.error("Error cargando resumen", error);
        }
    };

    const fetchHistorial = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}facturacion.php?action=listar&page=${page}&search=${debouncedSearch}`, { headers });
            setHistorial(res.data.data || []);
            setTotalPages(res.data.pagination?.total_pages || 1);
        } catch (error) {
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    };

    const fetchCorrelativo = async (tipo, serie = '') => {
        try {
            let url = `${API_URL}facturacion.php?action=obtener_correlativo&tipo=${tipo}`;
            if (serie) url += `&serie=${serie}`;
            const res = await axios.get(url, { headers });
            
            setFormData(prev => ({
                ...prev,
                serie: serie || res.data.serie,
                correlativo: res.data.correlativo
            }));
        } catch (error) {
            console.error("Error obteniendo correlativo", error);
        }
    };

    const handleClienteSearch = async () => {
        if (![8, 11].includes(formData.cliente_num_doc.length)) {
            toast.error("El documento debe tener 8 o 11 dígitos");
            return;
        }
        
        const toastId = toast.loading("Consultando SUNAT...");
        try {
            const res = await axios.get(`${API_URL}facturacion.php?action=consulta_ruc&ruc=${formData.cliente_num_doc}`, { headers });
            const data = res.data;
            
            if (data.success || data.razon_social) {
                setFormData(prev => ({
                    ...prev,
                    cliente_razon_social: data.razon_social || data.nombre || '',
                    cliente_direccion: data.direccion || data.domicilio_fiscal || ''
                }));
                toast.success("Cliente encontrado", { id: toastId });
            } else {
                toast.error("No se encontraron datos", { id: toastId });
            }
        } catch (error) {
            toast.error("Error en consulta: " + (error.response?.data?.message || error.message), { id: toastId });
        }
    };

    const addItem = () => {
        if (!currentItem.descripcion || currentItem.valor_unitario <= 0) {
            toast.error("Complete descripción y valor unitario > 0");
            return;
        }

        const cantidad = parseFloat(currentItem.cantidad);
        const valorUnitario = parseFloat(currentItem.valor_unitario);
        const valorVenta = cantidad * valorUnitario;
        const igv = valorVenta * 0.18;
        const precioUnitario = valorUnitario * 1.18;

        const newItem = {
            ...currentItem,
            cantidad,
            valor_unitario: valorUnitario,
            valor_venta: valorVenta,
            igv,
            precio_unitario: precioUnitario
        };

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));

        setCurrentItem({ ...currentItem, descripcion: '', cantidad: 1, valor_unitario: 0 });
    };

    const removeItem = (index) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const handleEditItem = (index) => {
        const item = formData.items[index];
        setCurrentItem({
            codigo: item.codigo || '',
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            valor_unitario: item.valor_unitario,
            unidad_medida: item.unidad_medida || 'NIU'
        });
        removeItem(index);
        toast("Ítem cargado para editar", { icon: '✏️' });
    };

    const totales = React.useMemo(() => {
        const gravada = formData.items.reduce((acc, item) => acc + item.valor_venta, 0);
        const igv = formData.items.reduce((acc, item) => acc + item.igv, 0);
        return { gravada, igv, total: gravada + igv };
    }, [formData.items]);

    // Actualizar monto de detracción cuando cambia el total
    useEffect(() => {
        if (formData.tiene_detraccion && formData.porcentaje_detraccion > 0) {
            const baseAmount = totales.total;
            const monto = (baseAmount * formData.porcentaje_detraccion) / 100;
            setFormData(prev => ({
                ...prev,
                monto_detraccion: Math.round(monto)
            }));
        }
    }, [totales.total, formData.tiene_detraccion, formData.porcentaje_detraccion]);

    // Generar cuotas automáticamente cuando cambia total, detraccion o numero de cuotas
    useEffect(() => {
        const isPredefined = ['Contado', 'Credito 15 dias', 'Credito 30 dias', 'Credito 45 dias', 'Credito 60 dias'].includes(formData.condicion_pago);
        const isCredito = formData.condicion_pago.toLowerCase().includes('credito') || formData.condicion_pago.toLowerCase().includes('crédito') || (!isPredefined && formData.condicion_pago !== 'Contado');
        
        if (isCredito && formData.numero_cuotas > 0 && totales.total > 0) {
            const montoBase = parseFloat((totales.total - (formData.tiene_detraccion ? formData.monto_detraccion : 0)).toFixed(2));
            const numCuotas = parseInt(formData.numero_cuotas) || 1;
            
            // Detect changes
            const montoBaseChanged = Math.abs(montoBase - prevMontoBaseRef.current) > 0.01;
            const numCuotasChanged = numCuotas !== prevNumCuotasRef.current;
            const fechaChanged = formData.fecha_vencimiento !== prevFechaVencimientoRef.current;
            
            // Update refs immediately
            prevMontoBaseRef.current = montoBase;
            prevNumCuotasRef.current = numCuotas;
            prevFechaVencimientoRef.current = formData.fecha_vencimiento;
            
            // If amount or num cuotas changed, regenerate completely (overwriting manual edits if total changed)
            if (montoBaseChanged || numCuotasChanged) {
                const montoCuota = parseFloat((montoBase / numCuotas).toFixed(2));
                const newCuotas = [];
                let acumulado = 0;
                const fechaBase = new Date(formData.fecha_vencimiento);
                
                for (let i = 0; i < numCuotas; i++) {
                    let monto = montoCuota;
                    if (i === numCuotas - 1) {
                        monto = parseFloat((montoBase - acumulado).toFixed(2));
                    }
                    acumulado += monto;
                    
                    const fecha = new Date(fechaBase);
                    fecha.setDate(fecha.getDate() + (i * 30));
                    
                    newCuotas.push({
                        nro: i + 1,
                        fecha: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(fecha),
                        monto: monto
                    });
                }
                
                setFormData(prev => ({ ...prev, cuotas: newCuotas }));
                
            } else if (fechaChanged) {
                // Update dates only, preserve existing amounts (even if they don't sum up to total)
                setFormData(prev => {
                    if (prev.cuotas.length === 0) return prev; 
                    const updatedCuotas = prev.cuotas.map((c, i) => {
                        const fecha = new Date(formData.fecha_vencimiento);
                        fecha.setDate(fecha.getDate() + (i * 30));
                        return {
                            ...c,
                            fecha: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(fecha)
                        };
                    });
                    return { ...prev, cuotas: updatedCuotas };
                });
            }
        } else if (!isCredito) {
            // Reset refs when switching to non-credit
            prevMontoBaseRef.current = 0;
            prevNumCuotasRef.current = 1;
            prevFechaVencimientoRef.current = '';
            
            setFormData(prev => ({ ...prev, cuotas: [] }));
        }
    }, [totales.total, formData.tiene_detraccion, formData.monto_detraccion, formData.numero_cuotas, formData.condicion_pago, formData.fecha_vencimiento]);

    const handleCuotaChange = (index, field, value) => {
        const newCuotas = [...formData.cuotas];
        newCuotas[index] = { ...newCuotas[index], [field]: value };
        setFormData(prev => ({ ...prev, cuotas: newCuotas }));
    };


    const handleViewData = async (item) => {
        setViewModal({ isOpen: true, data: item, items: [], loading: true });
        try {
            const res = await axios.get(`${API_URL}facturacion.php?action=obtener_detalle&id=${item.id}`, { headers });
            setViewModal(prev => ({ ...prev, items: res.data, loading: false }));
        } catch (error) {
            console.error("Error cargando detalles", error);
            toast.error("Error al cargar detalles");
            setViewModal(prev => ({ ...prev, loading: false }));
        }
    };

    const attemptEmit = async (e) => {
        e.preventDefault();
        if (formData.items.length === 0) return toast.error("Agregue al menos un ítem");
        if (!formData.cliente_razon_social) return toast.error("Faltan datos del cliente");
        setConfirmModal({ isOpen: true });
    };

    const emitComprobante = async () => {
        setLoading(true);
        try {
            const montoDetraccion = formData.tiene_detraccion
                ? Math.round(formData.monto_detraccion || Number((totales.total * (formData.porcentaje_detraccion || 0)) / 100))
                : 0;
            const payload = {
                ...formData,
                total_gravada: totales.gravada,
                total_igv: totales.igv,
                total_importe: totales.total,
                monto_detraccion: montoDetraccion,
                estado: confirmModal.isDraft ? 'Borrador' : 'Generado'
            };
            const action = editingId ? `actualizar&id=${editingId}` : 'crear';
            const res = await axios.post(`${API_URL}facturacion.php?action=${action}`, payload, { headers });
            
            if (confirmModal.isDraft) {
                toast.success("Borrador guardado");
            } else {
                if (res.data.nubefact_enviado) {
                    toast.success("Comprobante emitido y enviado a SUNAT");
                } else {
                    toast.warning("Comprobante generado, pero hubo un error al enviar a SUNAT: " + (res.data.nubefact_mensaje || "Verifique el estado"));
                }
            }
            
            setFormData(prev => ({
                ...prev,
                items: [],
                cliente_num_doc: '',
                cliente_razon_social: '',
                cliente_direccion: '',
                motivo_descripcion: ''
            }));
            setEditingId(null);
            fetchResumen();
            fetchCorrelativo(formData.tipo_comprobante);
            setActiveTab('historial');
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al emitir");
        } finally {
            setLoading(false);
            setConfirmModal({ isOpen: false, isDraft: false });
        }
    };

    const handleSearchSelect = (item) => {
        if (searchModal.type === 'product') {
            setCurrentItem(prev => ({
                ...prev,
                codigo: item.codigo_interno,
                descripcion: item.nombre,
                valor_unitario: parseFloat(item.precio) / 1.18, // Asumiendo precio con IGV
                unidad_medida: item.unidad_medida || 'NIU'
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                cliente_num_doc: item.num_doc,
                cliente_razon_social: item.razon_social,
                cliente_direccion: item.direccion,
                cliente_tipo_doc: item.tipo_doc || (item.num_doc.length === 11 ? '6' : '1')
            }));
        }
    };

    const handleSendEmail = async (email) => {
        const toastId = toast.loading("Enviando correo...");
        try {
            await axios.post(`${API_URL}facturacion.php?action=enviar_correo`, {
                id: emailModal.id,
                email: email
            }, { headers });
            toast.success("Correo enviado", { id: toastId });
            setEmailModal({ isOpen: false, id: null, email: '' });
        } catch (error) {
            toast.error("Error al enviar correo", { id: toastId });
        }
    };

    const handleMassSend = async () => {
        const pendientes = historial.filter(c => c.estado === 'Generado' && !c.sunat_description);
        if (pendientes.length === 0) return toast.info("No hay comprobantes pendientes de envío");
        
        const toastId = toast.loading(`Enviando ${pendientes.length} comprobantes a SUNAT...`);
        let successCount = 0;

        for (const comp of pendientes) {
            try {
                const res = await axios.get(`${API_URL}facturacion.php?action=enviar_sunat&id=${comp.id}`, { headers });
                if (res.data.success) successCount++;
            } catch (error) {
                console.error(`Error enviando ${comp.serie}-${comp.correlativo}`, error);
            }
        }
        
        toast.success(`Proceso finalizado. Enviados: ${successCount}/${pendientes.length}`, { id: toastId });
        fetchHistorial();
        fetchResumen();
    };

    const handleAnular = (id) => {
        setAnularModal({ isOpen: true, id, motivo: '' });
    };

    const confirmAnular = async () => {
        if (!anularModal.motivo.trim()) return toast.error("Debe ingresar un motivo");

        try {
            await axios.post(`${API_URL}facturacion.php?action=anular&id=${anularModal.id}`, { motivo: anularModal.motivo }, { headers });
            toast.success("Comprobante anulado");
            setAnularModal({ isOpen: false, id: null, motivo: '' });
            fetchHistorial();
            fetchResumen();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al anular");
        }
    };

    const handleConsultarSunat = async (id) => {
        const toastId = toast.loading("Consultando estado...");
        try {
            await axios.get(`${API_URL}facturacion.php?action=consultar_sunat&id=${id}`, { headers });
            toast.success("Estado actualizado", { id: toastId });
            fetchHistorial();
        } catch (error) {
            toast.error("Error consultando SUNAT", { id: toastId });
        }
    };

    const openPreview = (comprobante) => {
        if (!comprobante.enlace_pdf) return toast.error("PDF no disponible");
        // Abrir en nueva pestaña para evitar bloqueos por X-Frame-Options
        window.open(comprobante.enlace_pdf, '_blank');
    };

    return (
        <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto space-y-6 relative">
            {loading && (
                <div className="absolute inset-0 z-40 bg-white/50 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="flex flex-col items-center gap-3 bg-white p-6 rounded-xl shadow-xl border border-gray-100">
                        <RefreshCw className="animate-spin text-blue-600" size={40} />
                        <span className="text-sm font-medium text-gray-600">Procesando...</span>
                    </div>
                </div>
            )}
            <Toaster position="top-right" />

            {/* Header & Dashboard */}
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <FileText size={32} className="text-blue-600" /> Facturación Electrónica
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Gestión de comprobantes y envíos a SUNAT</p>
                    </div>
                    <div className="flex gap-2">
                         <button 
                            onClick={handleMassSend}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium text-sm"
                        >
                            <CloudUpload size={18} /> Enviar Pendientes
                        </button>
                        <div className="flex gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                            <button 
                                onClick={() => setActiveTab('emision')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'emision' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Nueva Emisión
                            </button>
                            <button 
                                onClick={() => setActiveTab('historial')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Historial
                            </button>
                        </div>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Ventas Hoy</p>
                            <h3 className="text-2xl font-bold text-gray-800">S/ {resumen.hoy.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                            <span className="text-xs text-green-600 font-medium">{resumen.hoy.cantidad} comprobantes</span>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                            <DollarSign size={24} />
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Acumulado Mes</p>
                            <h3 className="text-2xl font-bold text-gray-800">S/ {resumen.mes.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                            <span className="text-xs text-blue-600 font-medium">{resumen.mes.cantidad} comprobantes</span>
                        </div>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                            <Calendar size={24} />
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Pendientes SUNAT</p>
                            <h3 className="text-2xl font-bold text-gray-800">{resumen.pendientes_sunat}</h3>
                            <span className="text-xs text-orange-600 font-medium">Requieren atención</span>
                        </div>
                        <div className="p-3 bg-orange-50 text-orange-600 rounded-full">
                            <AlertCircle size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {activeTab === 'emision' ? (
                    <form onSubmit={attemptEmit} className="p-6 space-y-8">
                        {/* 1. Datos del Comprobante */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b">Datos Generales</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Comprobante</label>
                                    <select 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.tipo_comprobante}
                                        onChange={e => {
                                            const newType = e.target.value;
                                            let newSerie = '';
                                            
                                            // Auto-adjust serie for Notes based on reference (from hidden fields or visual input)
                                            if (['07', '08'].includes(newType)) {
                                                let refSerie = formData.doc_referencia_serie;
                                                // Fallback to visual input if hidden field is empty
                                                if (!refSerie && formData.doc_referencia_numero && formData.doc_referencia_numero.includes('-')) {
                                                    refSerie = formData.doc_referencia_numero.split('-')[0];
                                                }
                                                
                                                if (refSerie) {
                                                    const isBoleta = refSerie.charAt(0) === 'B';
                                                    const prefix = isBoleta ? 'B' : 'F';
                                                    const typeChar = newType === '07' ? 'C' : 'D';
                                                    newSerie = `${prefix}${typeChar}01`;
                                                }
                                            }

                                            setFormData(prev => ({ 
                                                ...prev, 
                                                tipo_comprobante: newType, 
                                                serie: newSerie || prev.serie 
                                            }));
                                            fetchCorrelativo(newType, newSerie);
                                        }}
                                    >
                                        <option value="01">Factura</option>
                                        <option value="03">Boleta</option>
                                        <option value="07">Nota de Crédito</option>
                                        <option value="08">Nota de Débito</option>
                                    </select>
                                </div>
                                {['07', '08'].includes(formData.tipo_comprobante) && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Doc. Referencia</label>
                                            <div className="flex gap-2">
                                                <select 
                                                    className="w-1/3 px-2 py-2 border rounded-lg text-sm"
                                                    value={formData.doc_referencia_tipo}
                                                    onChange={e => setFormData({...formData, doc_referencia_tipo: e.target.value})}
                                                >
                                                    <option value="01">Factura</option>
                                                    <option value="03">Boleta</option>
                                                </select>
                                                <input 
                                                    type="text" 
                                                    placeholder="F001-123"
                                                    className="w-2/3 px-3 py-2 border rounded-lg"
                                                    value={formData.doc_referencia_numero}
                                                    onChange={e => setFormData({...formData, doc_referencia_numero: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                                            <select 
                                                className="w-full px-3 py-2 border rounded-lg mb-2"
                                                value={formData.motivo_emision}
                                                onChange={e => setFormData({...formData, motivo_emision: e.target.value})}
                                            >
                                                <option value="01">Anulación de la operación</option>
                                                <option value="02">Anulación por error en el RUC</option>
                                                <option value="03">Corrección por error en la descripción</option>
                                                <option value="04">Descuento global</option>
                                                <option value="05">Descuento por ítem</option>
                                                <option value="06">Devolución total</option>
                                                <option value="07">Devolución por ítem</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                                        value={formData.serie} 
                                        onChange={e => setFormData({ ...formData, serie: e.target.value })}
                                        onBlur={() => fetchCorrelativo(formData.tipo_comprobante, formData.serie)}
                                        maxLength={4}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Correlativo</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                                        value={formData.correlativo} 
                                        onChange={e => setFormData({ ...formData, correlativo: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Emisión</label>
                                    <input 
                                        type="date" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.fecha_emision}
                                        onChange={e => {
                                            const newDate = e.target.value;
                                            let dueDate = newDate;
                                            if (formData.condicion_pago !== 'Contado') {
                                                const days = parseInt(formData.condicion_pago.match(/\d+/)?.[0] || 0);
                                                if (days > 0) {
                                                    const date = new Date(newDate);
                                                    date.setDate(date.getDate() + days); // simple addition
                                                    // Fix timezone offset issue by using UTC components or simple string manipulation
                                                    // Using a library like date-fns would be better but let's stick to vanilla for now
                                                    // Ensure we don't shift due to timezone
                                                    const d = new Date(date.valueOf() + date.getTimezoneOffset() * 60000);
                                                    dueDate = d.toISOString().split('T')[0];
                                                }
                                            }
                                            setFormData({ ...formData, fecha_emision: newDate, fecha_vencimiento: dueDate });
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Condición Pago</label>
                                    <select 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={['Contado', 'Credito 15 dias', 'Credito 30 dias', 'Credito 45 dias', 'Credito 60 dias'].includes(formData.condicion_pago) ? formData.condicion_pago : 'Otro'}
                                        onChange={e => {
                                            const condition = e.target.value;
                                            if (condition === 'Otro') {
                                                setFormData({ ...formData, condicion_pago: '' });
                                            } else {
                                                let dueDate = formData.fecha_emision;
                                                if (condition !== 'Contado') {
                                                    const days = parseInt(condition.match(/\d+/)?.[0] || 0);
                                                    if (days > 0) {
                                                        const parts = formData.fecha_emision.split('-');
                                                        const d = new Date(parts[0], parts[1] - 1, parts[2]);
                                                        d.setDate(d.getDate() + days);
                                                        dueDate = d.toISOString().split('T')[0];
                                                    }
                                                }
                                                const isCredito = condition.toLowerCase().includes('credito') || condition.toLowerCase().includes('crédito');
                                                setFormData({ 
                                                    ...formData, 
                                                    condicion_pago: condition, 
                                                    fecha_vencimiento: dueDate,
                                                    numero_cuotas: formData.numero_cuotas || 1
                                                });
                                            }
                                        }}
                                    >
                                        <option value="Contado">Contado</option>
                                        <option value="Credito 15 dias">Crédito 15 días</option>
                                        <option value="Credito 30 dias">Crédito 30 días</option>
                                        <option value="Credito 45 dias">Crédito 45 días</option>
                                        <option value="Credito 60 dias">Crédito 60 días</option>
                                        <option value="Otro">Otro (Especificar)</option>
                                    </select>
                                    {!['Contado', 'Credito 15 dias', 'Credito 30 dias', 'Credito 45 dias', 'Credito 60 dias'].includes(formData.condicion_pago) && (
                                        <input 
                                            type="text"
                                            className="w-full mt-2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-blue-50"
                                            placeholder="Ej. Crédito 90 días"
                                            value={formData.condicion_pago}
                                            onChange={e => {
                                                const condition = e.target.value;
                                                let dueDate = formData.fecha_emision;
                                                const days = parseInt(condition.match(/\d+/)?.[0] || 0);
                                                if (days > 0) {
                                                    const parts = formData.fecha_emision.split('-');
                                                    const d = new Date(parts[0], parts[1] - 1, parts[2]);
                                                    d.setDate(d.getDate() + days);
                                                    dueDate = d.toISOString().split('T')[0];
                                                }
                                                const isCredito = condition.toLowerCase().includes('credito') || condition.toLowerCase().includes('crédito');
                                                setFormData({ 
                                                    ...formData, 
                                                    condicion_pago: condition, 
                                                    fecha_vencimiento: dueDate,
                                                    numero_cuotas: formData.numero_cuotas || 1
                                                });
                                            }}
                                            autoFocus
                                        />
                                    )}
                                </div>
                                {((formData.condicion_pago.toLowerCase().includes('credito') || formData.condicion_pago.toLowerCase().includes('crédito')) || (!['Contado', 'Credito 15 dias', 'Credito 30 dias', 'Credito 45 dias', 'Credito 60 dias'].includes(formData.condicion_pago) && formData.condicion_pago !== 'Contado')) && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">N° Cuotas</label>
                                        <input 
                                            type="number" 
                                            min="1"
                                            max="60"
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.numero_cuotas}
                                            onChange={e => setFormData({ ...formData, numero_cuotas: parseInt(e.target.value) || 1 })}
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Vencimiento</label>
                                    <input 
                                        type="date" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.fecha_vencimiento}
                                        onChange={e => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                                    <select 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.moneda}
                                        onChange={e => setFormData({ ...formData, moneda: e.target.value })}
                                    >
                                        <option value="PEN">Soles (PEN)</option>
                                        <option value="USD">Dólares (USD)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Cambio</label>
                                    <input 
                                        type="number" 
                                        step="0.001"
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.tipo_cambio}
                                        onChange={e => setFormData({ ...formData, tipo_cambio: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div className="flex items-center pt-6">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                            checked={formData.generar_asiento}
                                            onChange={e => setFormData({ ...formData, generar_asiento: e.target.checked })}
                                        />
                                        <span className="text-sm font-medium text-gray-700">Generar Asiento</span>
                                    </label>
                                </div>
                            </div>

                            {['07', '08'].includes(formData.tipo_comprobante) && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-orange-50 p-4 rounded-lg border border-orange-100">
                                    <div>
                                        <label className="block text-sm font-medium text-orange-800 mb-1">Doc. Referencia</label>
                                        <div className="flex gap-2">
                                            <input type="text" placeholder="Serie" className="w-1/3 px-3 py-2 border rounded-lg" value={formData.doc_referencia_serie} onChange={e => setFormData({...formData, doc_referencia_serie: e.target.value})} />
                                            <input type="text" placeholder="Correlativo" className="w-2/3 px-3 py-2 border rounded-lg" value={formData.doc_referencia_correlativo} onChange={e => setFormData({...formData, doc_referencia_correlativo: e.target.value})} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-orange-800 mb-1">Motivo</label>
                                        <select className="w-full px-3 py-2 border rounded-lg" value={formData.motivo_emision} onChange={e => setFormData({...formData, motivo_emision: e.target.value})}>
                                            <option value="01">Anulación de la operación</option>
                                            <option value="02">Anulación por error en el RUC</option>
                                            <option value="03">Corrección por error en la descripción</option>
                                            <option value="04">Descuento global</option>
                                            <option value="05">Descuento por ítem</option>
                                            <option value="06">Devolución total</option>
                                            <option value="07">Devolución por ítem</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-orange-800 mb-1">Descripción Motivo</label>
                                        <input type="text" className="w-full px-3 py-2 border rounded-lg" value={formData.motivo_descripcion} onChange={e => setFormData({...formData, motivo_descripcion: e.target.value})} />
                                    </div>
                                </div>
                            )}

                            {/* Cuotas del Crédito */}
                            {(formData.condicion_pago.toLowerCase().includes('credito') || formData.condicion_pago.toLowerCase().includes('crédito') || (!['Contado', 'Credito 15 dias', 'Credito 30 dias', 'Credito 45 dias', 'Credito 60 dias'].includes(formData.condicion_pago) && formData.condicion_pago !== 'Contado')) && (
                                <div className="mt-4 border-t pt-4">
                                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                        Cronograma de Pagos
                                    </h3>
                                    {formData.cuotas.length > 0 ? (
                                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-gray-50 text-gray-600 font-semibold">
                                                    <tr>
                                                        <th className="px-4 py-2">N°</th>
                                                        <th className="px-4 py-2">Vencimiento</th>
                                                        <th className="px-4 py-2 text-right">Monto</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {formData.cuotas.map((cuota, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50">
                                                            <td className="px-4 py-2 text-gray-500">{cuota.nro}</td>
                                                            <td className="px-4 py-2">
                                                                <input 
                                                                    type="date"
                                                                    className="px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-40"
                                                                    value={cuota.fecha}
                                                                    onChange={e => handleCuotaChange(idx, 'fecha', e.target.value)}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-2 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <span>S/</span>
                                                                    <input 
                                                                        type="number"
                                                                        step="0.01"
                                                                        className="px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-right w-24"
                                                                        value={cuota.monto}
                                                                        onChange={e => handleCuotaChange(idx, 'monto', parseFloat(e.target.value))}
                                                                    />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-gray-50 font-medium">
                                                    <tr>
                                                        <td colSpan="2" className="px-4 py-2 text-right">Total Cuotas:</td>
                                                        <td className="px-4 py-2 text-right">
                                                            S/ {formData.cuotas.reduce((acc, c) => acc + (parseFloat(c.monto) || 0), 0).toFixed(2)}
                                                        </td>
                                                    </tr>

                                                </tfoot>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-200 text-sm flex items-center gap-2">
                                            <AlertCircle size={16} />
                                            <span>Agregue ítems al comprobante para generar el cronograma de cuotas automáticamente.</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. Datos del Cliente */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b">Datos del Cliente</h3>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Doc.</label>
                                    <select 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.cliente_tipo_doc}
                                        onChange={e => setFormData({ ...formData, cliente_tipo_doc: e.target.value })}
                                    >
                                        <option value="6">RUC</option>
                                        <option value="1">DNI</option>
                                    </select>
                                </div>
                                <div className="md:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.cliente_num_doc}
                                            onChange={e => setFormData({ ...formData, cliente_num_doc: e.target.value })}
                                            placeholder="Ingrese número"
                                        />
                                        <button 
                                            type="button" 
                                            onClick={handleClienteSearch}
                                            className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
                                            title="Consultar SUNAT (RUC)"
                                        >
                                            <Search size={20} />
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => setSearchModal({ isOpen: true, type: 'client' })}
                                            className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors"
                                            title="Buscar en Base de Datos"
                                        >
                                            <Archive size={20} />
                                        </button>
                                    </div>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.cliente_razon_social}
                                        onChange={e => setFormData({ ...formData, cliente_razon_social: e.target.value })}
                                        placeholder="Nombre o Razón Social"
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.cliente_direccion}
                                        onChange={e => setFormData({ ...formData, cliente_direccion: e.target.value })}
                                        placeholder="Dirección fiscal"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 3. Ítems */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b">Ítems del Comprobante</h3>
                            
                            {/* Input Row */}
                            <div className="flex flex-col md:flex-row gap-4 mb-4 items-end bg-gray-50 p-4 rounded-lg">
                                <div className="flex-grow relative">
                                    <div className="flex justify-between mb-1">
                                        <label className="block text-xs font-medium text-gray-500">Descripción</label>
                                        <button 
                                            type="button" 
                                            onClick={() => setSearchModal({ isOpen: true, type: 'product' })}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                        >
                                            <Search size={12} /> Buscar Producto
                                        </button>
                                    </div>
                                    <textarea 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                                        rows="2"
                                        value={currentItem.descripcion}
                                        onChange={e => setCurrentItem({ ...currentItem, descripcion: e.target.value })}
                                        placeholder="Descripción del producto o servicio"
                                    />
                                </div>
                                <div className="w-full md:w-32">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Cant.</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={currentItem.cantidad}
                                        onChange={e => setCurrentItem({ ...currentItem, cantidad: e.target.value })}
                                    />
                                </div>
                                <div className="w-full md:w-32">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">V. Unitario</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={currentItem.valor_unitario}
                                        onChange={e => setCurrentItem({ ...currentItem, valor_unitario: e.target.value })}
                                    />
                                </div>
                                <button 
                                    type="button"
                                    onClick={addItem}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                                >
                                    <Plus size={18} /> Agregar
                                </button>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                                        <tr>
                                            <th className="px-4 py-3">Cant.</th>
                                            <th className="px-4 py-3">Descripción</th>
                                            <th className="px-4 py-3 text-right">V. Unit</th>
                                            <th className="px-4 py-3 text-right">P. Unit</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3 text-center">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {formData.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">{item.cantidad}</td>
                                                <td className="px-4 py-3">{item.descripcion}</td>
                                                <td className="px-4 py-3 text-right">{item.valor_unitario.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right">{item.precio_unitario.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right font-medium">{item.valor_venta.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button type="button" onClick={() => handleEditItem(idx)} className="text-blue-500 hover:text-blue-700" title="Editar">
                                                            <Edit size={16} />
                                                        </button>
                                                        <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700" title="Eliminar">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {formData.items.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                                                    No hay ítems agregados
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-6 border-t pt-4 space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Detracción (opcional)</h3>
                                <div className="space-y-3">
                                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                        <input 
                                            type="checkbox"
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                            checked={formData.tiene_detraccion}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                if (checked) {
                                                    const porcentaje = formData.porcentaje_detraccion > 0 ? formData.porcentaje_detraccion : 12;
                                                    const monto = totales.total > 0 && porcentaje > 0 ? parseFloat(((totales.total * porcentaje) / 100).toFixed(2)) : 0;
                                                    setFormData({ 
                                                        ...formData, 
                                                        tiene_detraccion: true,
                                                        porcentaje_detraccion: porcentaje,
                                                        monto_detraccion: monto
                                                    });
                                                } else {
                                                    setFormData({ 
                                                        ...formData, 
                                                        tiene_detraccion: false,
                                                        porcentaje_detraccion: 0,
                                                        monto_detraccion: 0
                                                    });
                                                }
                                            }}
                                        />
                                        <span>Operación sujeta a detracción</span>
                                    </label>
                                    {formData.tiene_detraccion && (
                                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Código bien/servicio</label>
                                                <input 
                                                    type="text"
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    value={formData.codigo_bien_detraccion}
                                                    onChange={e => setFormData({ ...formData, codigo_bien_detraccion: e.target.value })}
                                                    placeholder="Ej: 022"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">% Detracción</label>
                                                <input 
                                                    type="number"
                                                    step="0.01"
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    value={formData.porcentaje_detraccion}
                                                    onChange={e => {
                                                        const porcentaje = parseFloat(e.target.value) || 0;
                                                        const monto = totales.total > 0 && porcentaje > 0 ? parseFloat(((totales.total * porcentaje) / 100).toFixed(2)) : 0;
                                                        setFormData({ 
                                                            ...formData, 
                                                            porcentaje_detraccion: porcentaje,
                                                            monto_detraccion: monto
                                                        });
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Monto detracción</label>
                                                <input 
                                                    type="number"
                                                    step="0.01"
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-100"
                                                    value={formData.monto_detraccion}
                                                    readOnly
                                                    placeholder={totales.total > 0 && formData.porcentaje_detraccion ? ((totales.total * formData.porcentaje_detraccion) / 100).toFixed(2) : ''}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">N° Constancia</label>
                                                <input 
                                                    type="text"
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    value={formData.constancia_detraccion}
                                                    onChange={e => setFormData({ ...formData, constancia_detraccion: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha detracción</label>
                                                <input 
                                                    type="date"
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    value={formData.fecha_detraccion}
                                                    onChange={e => setFormData({ ...formData, fecha_detraccion: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cuentas Bancarias Informativo */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Cuentas Bancarias (Se mostrarán en el PDF)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                    {bancos.length > 0 ? (
                                        bancos.map((banco, index) => {
                                            const isDetraccion = banco.nombre_banco && (banco.nombre_banco.toUpperCase().includes('NACION') || banco.nombre_banco.toUpperCase().includes('NACIÓN'));
                                            return (
                                                <div key={index} className="flex flex-col text-sm text-gray-700">
                                                    <span className="font-bold">
                                                        {banco.nombre_banco}
                                                        {isDetraccion && <span className="ml-1 text-amber-600">(Cuenta de Detracciones)</span>}
                                                    </span>
                                                    <span>N°: {banco.numero_cuenta}</span>
                                                    {banco.cci && <span>CCI: {banco.cci}</span>}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-gray-500 italic">No hay cuentas bancarias configuradas para mostrar en PDF.</div>
                                    )}
                                </div>
                            </div>

                            {/* 4. Totales y Acciones */}
                            <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                                <div className="text-sm text-gray-500">
                                    * Los montos incluyen cálculos automáticos de IGV (18%)
                                </div>
                                <div className="w-full md:w-80 space-y-2">
                                    <div className="flex justify-between items-center text-gray-600">
                                        <span>Op. Gravada:</span>
                                        <span>S/ {totales.gravada.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-gray-600">
                                        <span>IGV (18%):</span>
                                        <span>S/ {totales.igv.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xl font-bold text-gray-800 border-t pt-2">
                                        <span>Total a Pagar:</span>
                                        <span>S/ {totales.total.toFixed(2)}</span>
                                    </div>
                                    <button 
                                        type="submit"
                                        disabled={loading}
                                        className="w-full mt-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex justify-center items-center gap-2 shadow-lg shadow-green-200"
                                    >
                                        {loading ? <RefreshCw className="animate-spin" /> : <Save size={20} />}
                                        Emitir Comprobante
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                ) : (
                    /* Tab Historial */
                    <div className="p-0">
                        {/* Toolbar */}
                        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between bg-gray-50">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por cliente, serie o número..." 
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button 
                                onClick={fetchHistorial}
                                className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                            >
                                <RefreshCw size={18} /> Actualizar
                            </button>
                        </div>

                        {/* Content: Table for Desktop / Cards for Mobile */}
                        <div className="bg-white">
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                        <tr>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Emisión</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Comprobante</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Total</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Estado</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {historial.map((item) => (
                                            <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                                                <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                                                    {new Date(item.fecha_emision).toLocaleDateString('es-PE')}
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    <div className="font-medium text-gray-900">{item.serie}-{item.correlativo}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {item.tipo_comprobante === '01' ? 'Factura' : item.tipo_comprobante === '03' ? 'Boleta' : 'Nota'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    <div className="font-medium text-gray-900 truncate max-w-[200px]" title={item.cliente_razon_social}>
                                                        {item.cliente_razon_social}
                                                    </div>
                                                    <div className="text-xs text-gray-500">{item.cliente_num_doc}</div>
                                                </td>
                                                <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                                                    {item.moneda} {parseFloat(item.total_importe).toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                        item.estado === 'Aceptado' ? 'bg-green-100 text-green-800 border-green-200' :
                                                        item.estado === 'Anulado' ? 'bg-red-100 text-red-800 border-red-200' :
                                                        'bg-yellow-100 text-yellow-800 border-yellow-200'
                                                    }`}>
                                                        {item.estado}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button 
                                                            onClick={() => handleViewData(item)}
                                                            className="text-gray-600 hover:text-teal-600 p-1.5 rounded-full hover:bg-teal-50 transition-colors"
                                                            title="Ver Datos"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDuplicateInvoice(item)}
                                                            className="text-gray-600 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-50 transition-colors"
                                                            title="Duplicar Comprobante"
                                                        >
                                                            <Copy size={18} />
                                                        </button>
                                                        {(item.estado === 'Generado' || item.estado === 'Borrador') && (
                                                            <button 
                                                                onClick={() => handleEditInvoice(item)}
                                                                className="text-gray-600 hover:text-amber-600 p-1.5 rounded-full hover:bg-amber-50 transition-colors"
                                                                title="Editar Comprobante"
                                                            >
                                                                <Edit size={18} />
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => setEmailModal({ isOpen: true, id: item.id, email: '' })}
                                                            className="text-gray-600 hover:text-indigo-600 p-1.5 rounded-full hover:bg-indigo-50 transition-colors"
                                                            title="Enviar por Correo"
                                                        >
                                                            <Mail size={18} />
                                                        </button>
                                                        <button 
                                                        onClick={() => openPreview(item)}
                                                        className="text-gray-600 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-50 transition-colors"
                                                        title="Ver PDF"
                                                    >
                                                        <Printer size={18} />
                                                    </button>
                                                    {item.xml_path && (
                                                        <button 
                                                            onClick={() => window.open(item.xml_path.startsWith('http') ? item.xml_path : `${API_URL}${item.xml_path}`, '_blank')}
                                                            className="text-gray-600 hover:text-green-600 p-1.5 rounded-full hover:bg-green-50 transition-colors"
                                                            title="Descargar XML"
                                                        >
                                                            <FileCode size={18} />
                                                        </button>
                                                    )}
                                                    {item.estado === 'Anulado' && item.enlace_pdf_anulacion && (
                                                        <button 
                                                            onClick={() => window.open(item.enlace_pdf_anulacion, '_blank')}
                                                            className="text-gray-600 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                            title="Ver PDF Baja/Nota"
                                                        >
                                                            <FileText size={18} />
                                                        </button>
                                                    )}
                                                    {['01', '03'].includes(item.tipo_comprobante) && ['Aceptado', 'Anulado'].includes(item.estado) && (
                                                        <button 
                                                            onClick={() => prepareNote(item)}
                                                            className="text-gray-600 hover:text-orange-600 p-1.5 rounded-full hover:bg-orange-50 transition-colors"
                                                            title="Generar Nota de Crédito/Débito"
                                                        >
                                                            <FileSymlink size={18} />
                                                        </button>
                                                    )}
                                                    {item.estado !== 'Anulado' && (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleConsultarSunat(item.id)}
                                                                    className="text-gray-600 hover:text-purple-600 p-1.5 rounded-full hover:bg-purple-50 transition-colors"
                                                                    title="Consultar SUNAT"
                                                                >
                                                                    <RefreshCw size={18} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleAnular(item.id)}
                                                                    className="text-gray-600 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                                    title="Anular Comprobante"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards */}
                            <div className="md:hidden grid grid-cols-1 gap-4 p-4 bg-gray-50">
                                {historial.map((item) => (
                                    <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-1 ${
                                                    item.tipo_comprobante === '01' ? 'bg-blue-100 text-blue-800' : 'bg-indigo-100 text-indigo-800'
                                                }`}>
                                                    {item.tipo_comprobante === '01' ? 'Factura' : item.tipo_comprobante === '03' ? 'Boleta' : 'Nota'}
                                                </span>
                                                <h4 className="font-bold text-gray-800">{item.serie}-{item.correlativo}</h4>
                                                <p className="text-xs text-gray-500">{new Date(item.fecha_emision).toLocaleDateString('es-PE')}</p>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                item.estado === 'Aceptado' ? 'bg-green-100 text-green-800' :
                                                item.estado === 'Anulado' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {item.estado}
                                            </span>
                                        </div>
                                        
                                        <div className="border-t border-b border-gray-50 py-2 my-1">
                                            <p className="text-sm font-medium text-gray-900">{item.cliente_razon_social}</p>
                                            <p className="text-xs text-gray-500">DOC: {item.cliente_num_doc}</p>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <span className="text-lg font-bold text-gray-900">{item.moneda} {parseFloat(item.total_importe).toFixed(2)}</span>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleViewData(item)} className="p-2 bg-gray-50 text-teal-600 rounded-lg"><Eye size={20} /></button>
                                                <button onClick={() => handleDuplicateInvoice(item)} className="p-2 bg-gray-50 text-blue-600 rounded-lg" title="Duplicar"><Copy size={20} /></button>
                                                {(item.estado === 'Generado' || item.estado === 'Borrador') && (
                                                    <button onClick={() => handleEditInvoice(item)} className="p-2 bg-gray-50 text-amber-600 rounded-lg" title="Editar">
                                                        <Edit size={20} />
                                                    </button>
                                                )}
                                                <button onClick={() => setEmailModal({ isOpen: true, id: item.id, email: item.cliente_email || '' })} className="p-2 bg-gray-50 text-indigo-600 rounded-lg"><Mail size={20} /></button>
                                                <button onClick={() => openPreview(item)} className="p-2 bg-gray-50 text-blue-600 rounded-lg" title="Ver PDF"><Printer size={20} /></button>
                                                {item.xml_path && (
                                                    <button onClick={() => window.open(item.xml_path.startsWith('http') ? item.xml_path : `${API_URL}${item.xml_path}`, '_blank')} className="p-2 bg-gray-50 text-green-600 rounded-lg" title="Descargar XML"><FileCode size={20} /></button>
                                                )}
                                                {item.enlace_pdf && (
                                                    <button onClick={() => window.open(item.enlace_pdf, '_blank')} className="p-2 bg-gray-50 text-teal-600 rounded-lg" title="Descargar PDF"><Download size={20} /></button>
                                                )}
                                                {item.xml_path && (
                                                    <button onClick={() => {
                                                        const url = item.xml_path.startsWith('http') ? item.xml_path : `${API_URL.replace(/\/api\/?$/, '')}/${item.xml_path}`;
                                                        window.open(url, '_blank');
                                                    }} className="p-2 bg-gray-50 text-purple-600 rounded-lg" title="Descargar XML"><FileCode size={20} /></button>
                                                )}
                                                {item.estado === 'Anulado' && item.enlace_pdf_anulacion && (
                                                    <button onClick={() => window.open(item.enlace_pdf_anulacion, '_blank')} className="p-2 bg-gray-50 text-red-600 rounded-lg" title="Constancia de Baja"><FileText size={20} /></button>
                                                )}
                                                {item.estado !== 'Anulado' && (
                                                    <>
                                                        <button onClick={() => handleConsultarSunat(item.id)} className="p-2 bg-gray-50 text-purple-600 rounded-lg"><RefreshCw size={20} /></button>
                                                        <button onClick={() => handleAnular(item.id)} className="p-2 bg-gray-50 text-red-600 rounded-lg"><Trash2 size={20} /></button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {historial.length === 0 && (
                                <div className="p-8 text-center text-gray-500">
                                    <Archive className="mx-auto mb-2 opacity-20" size={48} />
                                    <p>No se encontraron comprobantes</p>
                                </div>
                            )}
                        </div>
                        
                        {/* Pagination */}
                        <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
                            <span className="text-sm text-gray-600">Página {page} de {totalPages}</span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-3 py-1 border rounded hover:bg-white disabled:opacity-50"
                                >
                                    Anterior
                                </button>
                                <button 
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="px-3 py-1 border rounded hover:bg-white disabled:opacity-50"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            <SearchModal 
                isOpen={searchModal.isOpen} 
                onClose={() => setSearchModal({ ...searchModal, isOpen: false })} 
                type={searchModal.type} 
                onSelect={handleSearchSelect} 
            />

            <EmailModal 
                isOpen={emailModal.isOpen} 
                onClose={() => setEmailModal({ isOpen: false, id: null, email: '' })} 
                onSubmit={handleSendEmail} 
                defaultEmail={emailModal.email} 
            />

            {/* View Data Modal */}
            {viewModal.isOpen && viewModal.data && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 border-b pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <FileText className="text-blue-600" />
                                    {viewModal.data.serie}-{viewModal.data.correlativo}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {new Date(viewModal.data.fecha_emision).toLocaleDateString('es-PE')}
                                </p>
                            </div>
                            <button 
                                onClick={() => setViewModal({ ...viewModal, isOpen: false })} 
                                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 pr-2">
                            <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-100">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Cliente</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{viewModal.data.cliente_razon_social}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {viewModal.data.cliente_tipo_doc === '6' ? 'RUC' : 'DNI'}: {viewModal.data.cliente_num_doc}
                                        </p>
                                    </div>
                                    <div className="text-right md:text-left">
                                         <p className="text-sm text-gray-700">
                                            <span className="font-medium">Moneda:</span> {viewModal.data.moneda}
                                        </p>
                                        <p className="text-sm text-gray-700 mt-1">
                                            <span className="font-medium">Estado:</span> 
                                            <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                viewModal.data.estado === 'Aceptado' ? 'bg-green-100 text-green-800' :
                                                viewModal.data.estado === 'Anulado' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {viewModal.data.estado}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mb-6">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detalle del Comprobante</h4>
                                {viewModal.loading ? (
                                    <div className="flex justify-center p-8">
                                        <RefreshCw className="animate-spin text-blue-500" size={32} />
                                    </div>
                                ) : (
                                    <div className="border rounded-lg overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                                                <tr>
                                                    <th className="px-4 py-3">Cant</th>
                                                    <th className="px-4 py-3">Descripción</th>
                                                    <th className="px-4 py-3 text-right">P. Unit</th>
                                                    <th className="px-4 py-3 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {viewModal.items.map((item, i) => (
                                                    <tr key={i} className="hover:bg-gray-50/50">
                                                        <td className="px-4 py-3 text-gray-600">{parseFloat(item.cantidad).toFixed(2)}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-800">{item.descripcion}</td>
                                                        <td className="px-4 py-3 text-right text-gray-600">{parseFloat(item.precio_unitario).toFixed(2)}</td>
                                                        <td className="px-4 py-3 text-right font-medium text-gray-900">{parseFloat(item.valor_venta).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Op. Gravada:</span>
                                        <span>{viewModal.data.moneda} {parseFloat(viewModal.data.total_gravada).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600">
                                        <span>IGV (18%):</span>
                                        <span>{viewModal.data.moneda} {parseFloat(viewModal.data.total_igv).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-blue-200 mt-2">
                                        <span>Total:</span>
                                        <span>{viewModal.data.moneda} {parseFloat(viewModal.data.total_importe).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button 
                                onClick={() => setViewModal({ ...viewModal, isOpen: false })}
                                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Anular Modal */}
            {anularModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <AlertTriangle className="text-red-500" />
                                Anular Comprobante
                            </h3>
                            <button onClick={() => setAnularModal({ isOpen: false, id: null, motivo: '' })} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <p className="text-gray-600 text-sm mb-4">
                            Está a punto de comunicar la baja de este comprobante a SUNAT. Esta acción es irreversible.
                        </p>

                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Motivo de anulación <span className="text-red-500">*</span></label>
                            <textarea 
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none resize-none h-24"
                                placeholder="Especifique la razón (ej: Error en RUC, Devolución total...)"
                                value={anularModal.motivo}
                                onChange={e => setAnularModal({ ...anularModal, motivo: e.target.value })}
                            ></textarea>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button 
                                onClick={() => setAnularModal({ isOpen: false, id: null, motivo: '' })}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmAnular}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-lg shadow-red-100"
                            >
                                Confirmar Anulación
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmar Emisión */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <CheckCircle className="text-green-600" />
                                Confirmar Emisión
                            </h3>
                            <button onClick={() => setConfirmModal({ isOpen: false })} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                            ¿Desea emitir el comprobante por un total de <span className="font-semibold text-gray-800">S/ {totales.total.toFixed(2)}</span>?
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
                            <div>Gravada: <span className="font-medium text-gray-800">S/ {totales.gravada.toFixed(2)}</span></div>
                            <div>IGV: <span className="font-medium text-gray-800">S/ {totales.igv.toFixed(2)}</span></div>
                        </div>
                        <div className="flex gap-3 mt-2">
                            <button 
                                onClick={() => setConfirmModal({ isOpen: false })}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={emitComprobante}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-lg shadow-green-100"
                            >
                                Confirmar Emisión
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FacturacionElectronica;
