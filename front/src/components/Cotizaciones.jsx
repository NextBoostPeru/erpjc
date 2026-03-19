import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { FileText, Plus, Search, Trash2, Printer, CheckCircle, XCircle, ArrowRight, Upload, Paperclip, Download, Edit, Copy, Mail, Save, Book, MessageCircle, Percent, DollarSign, Send, ShieldCheck } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import SearchableSelect from './SearchableSelect';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Cotizaciones = () => {
    const [activeTab, setActiveTab] = useState('listado'); // listado, nueva
    const [cotizaciones, setCotizaciones] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [clientes, setClientes] = useState([]);
    const [filterStatus, setFilterStatus] = useState('Todos');
    const [loading, setLoading] = useState(false);
    const [selectedCotizacion, setSelectedCotizacion] = useState(null); // Para modal de detalles
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [cotizacionToDelete, setCotizacionToDelete] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailData, setEmailData] = useState({ to: '', subject: '', message: '' });
    const [sendingEmail, setSendingEmail] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [newTemplateTitle, setNewTemplateTitle] = useState('');
    const [descuentoGlobal, setDescuentoGlobal] = useState(0);
    const [descuentoValue, setDescuentoValue] = useState(0);
    const [descuentoTipo, setDescuentoTipo] = useState('monto'); // 'monto' | 'porcentaje'

    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectId, setRejectId] = useState(null);

    const navigate = useNavigate();

    const handleWhatsApp = async (cotInput = null) => {
        // Support both direct event call (where argument is event object) and direct cot object passing
        let cot = (cotInput && cotInput.id) ? cotInput : selectedCotizacion;
        
        if (!cot) return;
        const toastId = toast.loading("Preparando envío por WhatsApp...");
        try {
            // Check if items are missing and fetch full details if needed
            if (!cot.items || !Array.isArray(cot.items)) {
                try {
                     const res = await axios.get(`${API_URL}cotizaciones.php?action=get&id=${cot.id}`, { headers });
                     cot = res.data;
                } catch (fetchError) {
                    console.error("Error fetching full details for WhatsApp:", fetchError);
                    throw new Error("No se pudieron cargar los detalles de la cotización", { cause: fetchError });
                }
            }

            // Pass cot explicitly to generatePDF
            const pdfBlob = await generatePDF('save', true, cot);
            if (!pdfBlob) throw new Error("No se pudo generar el PDF");

            const formData = new FormData();
            formData.append('archivo', pdfBlob, `Cotizacion_${cot.serie}-${String(cot.correlativo).padStart(6, '0')}.pdf`);
            formData.append('id', cot.id);

            const res = await axios.post(`${API_URL}cotizaciones.php?action=upload_attachment`, formData, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.path) {
                // Use public_url if available (secure link), otherwise fallback to direct path
                let pdfUrl;
                if (res.data.public_url) {
                    pdfUrl = `${API_URL}${res.data.public_url}`;
                } else {
                    const baseUrl = API_URL.replace(/\/api\/?$/, ''); 
                    pdfUrl = `${baseUrl}/${res.data.path}`;
                }

                const message = `Hola *${cot.cliente_razon_social || 'Cliente'}*, le enviamos la *Cotización ${cot.serie}-${String(cot.correlativo).padStart(6, '0')}*.\n\nPuede verla y descargarla en el siguiente enlace:\n${pdfUrl}`;
                
                const phone = cot.cliente_telefono ? cot.cliente_telefono.replace(/\D/g, '') : '';
                const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
                
                window.open(whatsappUrl, '_blank');
                toast.success("WhatsApp abierto", { id: toastId });
            }
        } catch (error) {
            console.error("WhatsApp Error:", error);
            toast.error("Error al compartir por WhatsApp", { id: toastId });
        }
    };
    const [bancos, setBancos] = useState([]);

    // Fetch Bancos for PDF
    const fetchBancos = async () => {
        try {
            const res = await axios.get(`${API_URL}bancos.php?action=listar_cuentas`, { headers });
            if (Array.isArray(res.data)) {
                setBancos(res.data.filter(b => b.mostrar_en_pdf == 1 && b.estado === 'Activo'));
            }
        } catch (error) {
            console.error("Error cargando bancos:", error);
        }
    };

    // Form State
    const [formData, setFormData] = useState({
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: '',
        cliente_tipo_doc: '6', // 6: RUC, 1: DNI
        cliente_num_doc: '',
        cliente_razon_social: '',
        cliente_direccion: '',
        cliente_email: '',
        cliente_nombre_contacto: '',
        cliente_telefono: '',
        moneda: 'PEN',
        condicion_pago: 'Contado',
        validez_oferta: '',
        observaciones: '',
        items: [],
        descuento_global: 0
    });

    const [currentItem, setCurrentItem] = useState({
        item_codigo: '',
        descripcion: '',
        unidad_medida: 'NIU',
        cantidad: 1,
        valor_unitario: 0,
        descuento: 0
    });

    const [totales, setTotales] = useState({
        gravada: 0,
        igv: 0,
        total: 0
    });

    const [editingIndex, setEditingIndex] = useState(-1);

    // Product Search State
    const [productSearch, setProductSearch] = useState('');
    const [productSuggestions, setProductSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Product Search Debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (productSearch.length > 2) {
                searchProducts(productSearch);
            } else {
                setProductSuggestions([]);
                setShowSuggestions(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [productSearch]);

    const searchProducts = async (term) => {
        try {
            const res = await axios.get(`${API_URL}productos.php?page=1&limit=10&search=${term}`, { headers });
            if (res.data.data) {
                setProductSuggestions(res.data.data);
                setShowSuggestions(true);
            }
        } catch (error) {
            console.error("Error buscando productos:", error);
        }
    };

    const selectProduct = (product) => {
        setCurrentItem({
            ...currentItem,
            item_codigo: product.codigo_interno || '',
            descripcion: product.nombre,
            unidad_medida: product.unidad_medida || 'NIU',
            valor_unitario: parseFloat(product.precio) || 0,
            cantidad: 1
        });
        setProductSearch('');
        setShowSuggestions(false);
        toast.success("Producto cargado");
    };

    const [empresa, setEmpresa] = useState(null);

    const CONDITION_TEMPLATES = [
        { label: "Seleccionar plantilla...", value: "" },
        { label: "Rápida (5 días)", value: "Validez de la oferta: 5 días hábiles.\nTiempo de entrega: Inmediata (Stock disponible).\nPrecios sujetos a variación sin previo aviso." },
        { label: "Estándar (15 días)", value: "Validez de la oferta: 15 días hábiles.\nTiempo de entrega: A coordinar según disponibilidad.\nLa garantía no cubre desperfectos por mal uso." },
        { label: "Estándar (30 días)", value: "Validez de la oferta: 30 días calendario.\nTiempo de entrega: 3-5 días hábiles tras orden de compra." },
        { label: "Servicios (15 días)", value: "Validez de la oferta: 15 días.\nEl servicio se realizará en horario de oficina (Lun-Vie 9am-6pm).\nCualquier trabajo fuera de horario tendrá un recargo adicional." }
    ];

    const [editingId, setEditingId] = useState(null);

    const handleEdit = async (id) => {
        const toastId = toast.loading("Cargando datos...");
        try {
            const res = await axios.get(`${API_URL}cotizaciones.php?action=get&id=${id}`, { headers });
            const cot = res.data;
            
            if (cot.estado === 'Convertida') {
                toast.error("No se puede editar una cotización convertida", { id: toastId });
                return;
            }

            setEditingId(cot.id);
            setFormData({
                fecha_emision: cot.fecha_emision,
                fecha_vencimiento: cot.fecha_vencimiento || '',
                cliente_tipo_doc: cot.cliente_tipo_doc,
                cliente_num_doc: cot.cliente_num_doc,
                cliente_razon_social: cot.cliente_razon_social,
                cliente_direccion: cot.cliente_direccion || '',
                cliente_email: cot.cliente_email || '',
                cliente_nombre_contacto: cot.cliente_nombre_contacto || '',
                cliente_telefono: cot.cliente_telefono || '',
                moneda: cot.moneda,
                condicion_pago: cot.condicion_pago,
                validez_oferta: cot.validez_oferta,
                observaciones: cot.observaciones || '',
                condiciones_servicio: cot.condiciones_servicio || '',
                items: cot.items.map(item => ({
                    ...item,
                    cantidad: parseFloat(item.cantidad),
                    valor_unitario: parseFloat(item.valor_unitario),
                    precio_unitario: parseFloat(item.precio_unitario),
                    descuento: parseFloat(item.descuento || 0),
                    valor_venta: parseFloat(item.valor_venta),
                    igv: parseFloat(item.igv)
                })),
                descuento_global: parseFloat(cot.descuento_global || 0)
            });

            const initialDiscount = parseFloat(cot.descuento_global || 0);
            setDescuentoGlobal(initialDiscount);
            setDescuentoValue(initialDiscount);
            setDescuentoTipo('monto');
            calculateTotales(cot.items.map(item => ({...item, valor_venta: parseFloat(item.valor_venta)})), initialDiscount, 'monto');
            
            setActiveTab('nueva');
            toast.dismiss(toastId);
        } catch (error) {
            console.error("Error cargando cotización para editar:", error);
            toast.error("Error al cargar datos", { id: toastId });
        }
    };

    const cancelForm = () => {
        setActiveTab('listado');
        setEditingId(null);
        setFormData({
            fecha_emision: new Date().toISOString().split('T')[0],
            fecha_vencimiento: '',
            cliente_tipo_doc: '6',
            cliente_num_doc: '',
            cliente_razon_social: '',
            cliente_direccion: '',
            cliente_email: '',
            cliente_nombre_contacto: '',
            cliente_telefono: '',
            moneda: 'PEN',
            condicion_pago: 'Contado',
            validez_oferta: '',
            observaciones: '',
            condiciones_servicio: '',
            items: [],
            descuento_global: 0
        });
        setDescuentoGlobal(0);
        setDescuentoValue(0);
        setDescuentoTipo('monto');
        setTotales({ gravada: 0, igv: 0, total: 0 });
    };


    const token = localStorage.getItem('token');
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
    const abortControllerRef = useRef(null);

    const fetchCotizaciones = async (pageToLoad = 1) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}cotizaciones.php?action=list&page=${pageToLoad}&limit=20&search=${encodeURIComponent(searchTerm)}`, { headers });
            const data = res.data;
            if (Array.isArray(data)) {
                setCotizaciones(data);
                setPage(1);
                setTotalPages(1);
            } else {
                setCotizaciones(data.data || []);
                setPage(data.pagination?.page || pageToLoad);
                setTotalPages(data.pagination?.total_pages || 1);
            }
        } catch (error) {
            console.error("Error cargando cotizaciones:", error);
            toast.error("Error al cargar las cotizaciones");
        } finally {
            setLoading(false);
        }
    };

    // Debounce para búsqueda
    useEffect(() => {
        const timer = setTimeout(() => {
            if (activeTab === 'listado') {
                fetchCotizaciones(1);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        if (activeTab === 'listado') {
            fetchCotizaciones(page);
        }
    }, [activeTab, page]);

    useEffect(() => {
        fetchEmpresaData();
        fetchBancos();
        fetchApproversInit();
        const checkCanConfigureApprovers = async () => {
            try {
                if (!token) {
                    setCanConfigureApprovers(false);
                    return;
                }
                const res = await axios.get(`${API_URL}check_my_permissions.php?code=cotizaciones`, { headers });
                const data = res.data || {};
                setCanConfigureApprovers(data.editar === 1 || data.escritura === 1);
            } catch (e) {
                setCanConfigureApprovers(false);
            }
        };
        checkCanConfigureApprovers();
    }, []);

    const [isSearching, setIsSearching] = useState(false);
    const [clientesLoaded, setClientesLoaded] = useState(false);
    const [canConfigureApprovers, setCanConfigureApprovers] = useState(false);
    const [approverModalOpen, setApproverModalOpen] = useState(false);
    const [approvers, setApprovers] = useState([]);
    const [users, setUsers] = useState([]);
    const [newApproverUserId, setNewApproverUserId] = useState('');

    const fetchClientes = useCallback(async (search = '') => {
        // Evitar búsqueda si no hay término o es muy corto
        if (!search || search.length < 3) {
            setClientes([]);
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setIsSearching(true);
        try {
            const url = `${API_URL}clientes_proveedores.php?action=listar&type=clientes&estado=Activo&page=1&limit=20&search=${encodeURIComponent(search)}`;
            const res = await axios.get(url, { 
                headers,
                signal: abortControllerRef.current.signal
            });
            const data = res.data;
            if (Array.isArray(data)) {
                setClientes(data);
            } else if (data && Array.isArray(data.data)) {
                setClientes(data.data);
            } else {
                setClientes([]);
            }
            setIsSearching(false);
        } catch (error) {
            if (axios.isCancel(error)) {
                return;
            }
            console.error('Error fetching clientes', error);
            setIsSearching(false);
        }
    }, [headers]);

    // useEffect(() => {
    //     if (activeTab === 'nueva' && !clientesLoaded) {
    //         fetchClientes();
    //         setClientesLoaded(true);
    //     }
    // }, [activeTab, clientesLoaded]);

    const fetchEmpresaData = async () => {
        try {
            const res = await axios.get(`${API_URL}empresa.php?t=${new Date().getTime()}`, { headers });
            setEmpresa(res.data);
            console.log("Datos de empresa cargados en Cotizaciones:", res.data);
        } catch (error) {
            console.error("Error cargando datos de empresa", error);
        }
    };

    const fetchApproversInit = async () => {
        try {
            const res = await axios.get(`${API_URL}cotizaciones.php?action=approvers`, { headers });
            setApprovers(Array.isArray(res.data.data) ? res.data.data : []);
            const ures = await axios.get(`${API_URL}usuarios.php`, { headers });
            setUsers(Array.isArray(ures.data.users) ? ures.data.users : []);
        } catch (e) {
            console.error("Error cargando aprobadores de cotizaciones", e);
        }
    };
    const addApprover = async (e) => {
        e.preventDefault();
        if (!newApproverUserId) {
            toast.error("Seleccione un usuario");
            return;
        }
        try {
            await axios.post(`${API_URL}cotizaciones.php?action=approvers`, { usuario_id: newApproverUserId }, { headers });
            toast.success("Aprobador agregado");
            setNewApproverUserId('');
            fetchApproversInit();
        } catch (e) {
            toast.error(e.response?.data?.message || "Error al agregar aprobador");
        }
    };
    const deleteApprover = async (id) => {
        if (!window.confirm("¿Eliminar este aprobador?")) return;
        try {
            await axios.delete(`${API_URL}cotizaciones.php?action=approvers&id=${id}`, { headers });
            toast.success("Aprobador eliminado");
            fetchApproversInit();
        } catch (e) {
            toast.error("Error al eliminar aprobador");
        }
    };

    const getBase64ImageFromURL = (url) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.setAttribute('crossOrigin', 'anonymous');
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL("image/png");
                resolve(dataURL);
            };
            img.onerror = error => reject(error);
            img.src = url;
        });
    };

    const handleSelectCliente = (cliente) => {
        if (!cliente) return;
        setFormData(prev => ({
            ...prev,
            cliente_tipo_doc: cliente.tipo_doc,
            cliente_num_doc: cliente.num_doc,
            cliente_razon_social: cliente.razon_social,
            cliente_direccion: cliente.direccion || '',
            cliente_email: cliente.email || '',
            cliente_nombre_contacto: cliente.contacto_nombre || '',
            cliente_telefono: cliente.telefono || ''
        }));
        toast.success("Cliente cargado de la lista");
    };

    const handleClienteSearch = async () => {
        if (!formData.cliente_num_doc) {
            toast.error("Ingrese un número de documento");
            return;
        }

        const toastId = toast.loading("Buscando cliente...");

        // 1. Buscar en lista cargada actualmente (memoria)
        const existingCliente = clientes.find(c => c.num_doc === formData.cliente_num_doc);
        if (existingCliente) {
            handleSelectCliente(existingCliente);
            toast.dismiss(toastId);
            return;
        }

        try {
            // 2. Buscar en base de datos local (backend)
            // Usamos search=RUC para ver si existe en la BD aunque no esté en la lista actual
            const localRes = await axios.get(`${API_URL}clientes_proveedores.php?action=listar&type=clientes&search=${formData.cliente_num_doc}`, { headers });
            
            let localMatch = null;
            if (localRes.data && Array.isArray(localRes.data.data)) {
                localMatch = localRes.data.data.find(c => c.num_doc === formData.cliente_num_doc);
            } else if (Array.isArray(localRes.data)) {
                localMatch = localRes.data.find(c => c.num_doc === formData.cliente_num_doc);
            }

            if (localMatch) {
                handleSelectCliente(localMatch);
                toast.success("Cliente encontrado en base de datos", { id: toastId });
                return;
            }

            // 3. Si no está localmente, buscar en SUNAT/RENIEC
            toast.loading("Buscando en SUNAT/RENIEC...", { id: toastId });
            
            const action = formData.cliente_tipo_doc === '6' ? 'validate_ruc' : 'validate_dni';
            const param = formData.cliente_tipo_doc === '6' ? 'ruc' : 'dni';
            
            const res = await axios.get(`${API_URL}/gestion_clientes.php?action=${action}&${param}=${formData.cliente_num_doc}`, { headers });
            
            let data = res.data;
            if (typeof data === 'string') {
                try {
                    const jsonStart = data.indexOf('{');
                    if (jsonStart !== -1) {
                        data = JSON.parse(data.substring(jsonStart));
                    } else {
                         data = JSON.parse(data);
                    }
                } catch (e) {
                    console.error("Error parseando respuesta de cliente:", e);
                }
            }

            if (data) {
                setFormData(prev => ({
                    ...prev,
                    cliente_razon_social: data.razonSocial || data.razon_social || data.nombre || data.nombre_o_razon_social || '',
                    cliente_direccion: data.direccion || data.domicilio_fiscal || '',
                    cliente_email: data.email || '',
                    cliente_telefono: '', // API externa no suele devolver teléfono
                    cliente_nombre_contacto: data.nombres || '' // Si es DNI, poner nombre como contacto
                }));
                
                const foundName = data.razonSocial || data.razon_social || data.nombre || data.nombre_o_razon_social;
                if (foundName) {
                    toast.success("Cliente encontrado en SUNAT/RENIEC: " + foundName, { id: toastId });
                } else {
                    toast.success("Cliente encontrado (sin nombre registrado)", { id: toastId });
                }
            }
        } catch (error) {
            console.error("Error buscando cliente:", error);
            toast.error(error.response?.data?.message || "Cliente no encontrado", { id: toastId });
        }
    };

    const addItem = () => {
        if (!currentItem.descripcion || currentItem.cantidad <= 0 || currentItem.valor_unitario < 0) {
            toast.error("Complete los datos del item correctamente");
            return;
        }

        const cantidad = parseFloat(currentItem.cantidad);
        const valorUnitario = parseFloat(currentItem.valor_unitario);
        const descuento = parseFloat(currentItem.descuento || 0);

        const valorVenta = (cantidad * valorUnitario) - descuento;
        const igv = valorVenta * 0.18;
        const precioUnitario = valorUnitario * 1.18; // Referencial

        const newItem = {
            ...currentItem,
            cantidad,
            valor_unitario: valorUnitario,
            descuento,
            valor_venta: valorVenta,
            igv,
            precio_unitario: precioUnitario,
            unidad_medida: currentItem.unidad_medida || 'NIU'
        };

        if (editingIndex >= 0) {
            const newItems = [...formData.items];
            newItems[editingIndex] = newItem;
            setFormData({ ...formData, items: newItems });
            calculateTotales(newItems);
            setEditingIndex(-1);
            toast.success("Item actualizado");
        } else {
            const newItems = [...formData.items, newItem];
            setFormData({ ...formData, items: newItems });
            calculateTotales(newItems);
        }
        
        setCurrentItem({
            item_codigo: '',
            descripcion: '',
            unidad_medida: 'NIU',
            cantidad: 1,
            valor_unitario: 0,
            descuento: 0,
            sub_concepto: ''
        });
    };

    const startEdit = (index) => {
        const item = formData.items[index];
        setCurrentItem({
            ...item,
            sub_concepto: item.sub_concepto || ''
        });
        setEditingIndex(index);
    };

    const cancelEdit = () => {
        setEditingIndex(-1);
        setCurrentItem({
            item_codigo: '',
            descripcion: '',
            unidad_medida: 'NIU',
            cantidad: 1,
            valor_unitario: 0,
            descuento: 0,
            sub_concepto: ''
        });
    };

    const removeItem = (index) => {
        if (editingIndex === index) {
            cancelEdit();
        }
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
        calculateTotales(newItems);
        
        if (editingIndex > index) {
            setEditingIndex(editingIndex - 1);
        }
    };

    const calculateTotales = (items, dValue = descuentoValue, dType = descuentoTipo) => {
        const totalItems = items.reduce((acc, item) => acc + item.valor_venta, 0);
        
        let calculatedDiscount = 0;
        if (dType === 'porcentaje') {
            calculatedDiscount = totalItems * (parseFloat(dValue || 0) / 100);
        } else {
            calculatedDiscount = parseFloat(dValue || 0);
        }
        
        // Ensure discount doesn't exceed total
        calculatedDiscount = Math.min(calculatedDiscount, totalItems);

        const gravada = Math.max(0, totalItems - calculatedDiscount);
        const igv = gravada * 0.18;
        const total = gravada + igv;

        setTotales({
            gravada,
            igv,
            total
        });
        
        setDescuentoGlobal(calculatedDiscount);
        setFormData(prev => ({ ...prev, descuento_global: calculatedDiscount }));
    };

    useEffect(() => {
        // Recalculate if items change (via formData.items dependency implicitly if we add it, but here we watch descuento values)
        // Note: addItem calls calculateTotales manually, so we mainly need this for when descuentoValue/Type changes.
        // However, if items change in formData but calculateTotales wasn't called (unlikely), this might be needed.
        // But to be safe, we can add formData.items to dependency if we want auto-recalc on items change too.
        // But existing code called calculateTotales manually on addItem/removeItem.
        // Let's stick to watching discount changes here.
        calculateTotales(formData.items, descuentoValue, descuentoTipo);
    }, [descuentoValue, descuentoTipo]);


    const handleSubmit = async (e, targetStatus = 'Borrador') => {
        if (e) e.preventDefault();
        
        if (!formData.cliente_num_doc || !formData.cliente_razon_social) {
            toast.error("Datos del cliente incompletos");
            return;
        }

        if (formData.items.length === 0) {
            toast.error("Agregue al menos un item a la cotización");
            return;
        }

        const payload = {
            ...formData,
            total_gravada: totales.gravada,
            total_igv: totales.igv,
            total_importe: totales.total,
            total_exonerada: 0,
            total_inafecta: 0,
            estado: targetStatus
        };

        const toastId = toast.loading(editingId ? "Actualizando cotización..." : "Guardando cotización...");
        try {
            const action = editingId ? 'update' : 'create';
            if (editingId) {
                payload.id = editingId;
            }
            
            await axios.post(`${API_URL}cotizaciones.php?action=${action}`, payload, { headers });
            
            const successMsg = targetStatus === 'Borrador' 
                ? (editingId ? "Borrador actualizado correctamente" : "Guardado como borrador")
                : (editingId ? "Cotización actualizada y emitida" : "Cotización emitida exitosamente");
                
            toast.success(successMsg, { id: toastId });
            setActiveTab('listado');
            setEditingId(null);
            setFormData({
                fecha_emision: new Date().toISOString().split('T')[0],
                fecha_vencimiento: '',
                cliente_tipo_doc: '6',
                cliente_num_doc: '',
                cliente_razon_social: '',
                cliente_direccion: '',
                cliente_email: '',
                cliente_nombre_contacto: '',
                cliente_telefono: '',
                moneda: 'PEN',
                condicion_pago: 'Contado',
                validez_oferta: '',
                observaciones: '',
                condiciones_servicio: '',
                items: [],
                descuento_global: 0
            });
            setDescuentoGlobal(0);
            setDescuentoValue(0);
            setDescuentoTipo('monto');
            setTotales({ gravada: 0, igv: 0, total: 0 });
            fetchCotizaciones();
        } catch (error) {
            console.error("Error guardando cotización:", error);
            toast.error(error.response?.data?.message || "Error al guardar cotización", { id: toastId });
        }
    };

    const handleViewDetails = async (id) => {
        try {
            const res = await axios.get(`${API_URL}/cotizaciones.php?action=get&id=${id}`, { headers });
            setSelectedCotizacion(res.data);
            setShowModal(true);
        } catch (error) {
            console.error("Error cargando detalles:", error);
            toast.error("No se pudo cargar los detalles");
        }
    };

    const handleDelete = (id) => {
        setCotizacionToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!cotizacionToDelete) return;
        
        try {
            await axios.post(`${API_URL}cotizaciones.php?action=delete`, { id: cotizacionToDelete }, { headers });
            toast.success("Cotización eliminada");
            setShowDeleteModal(false);
            setCotizacionToDelete(null);
            fetchCotizaciones();
        } catch (error) {
            console.error("Error eliminando cotización:", error);
            toast.error("Error al eliminar la cotización");
        }
    };

    const handleStatusUpdate = async (id, newStatus) => {
        if (newStatus === 'Rechazada') {
            setRejectId(id);
            setRejectReason('');
            setShowRejectModal(true);
            return;
        }

        try {
            await axios.post(`${API_URL}cotizaciones.php?action=update_status`, { id, estado: newStatus }, { headers });
            toast.success(`Estado actualizado a ${newStatus}`);
            if (selectedCotizacion && selectedCotizacion.id === id) {
                setSelectedCotizacion({ ...selectedCotizacion, estado: newStatus });
            }
            fetchCotizaciones();
        } catch (error) {
            console.error("Error actualizando estado:", error);
            toast.error("Error al actualizar estado");
        }
    };

    const handleConfirmReject = async () => {
        if (!rejectReason.trim()) {
            toast.error("Debe ingresar el motivo del rechazo");
            return;
        }
        try {
            await axios.post(`${API_URL}cotizaciones.php?action=update_status`, { 
                id: rejectId, 
                estado: 'Rechazada',
                observacion_rechazo: rejectReason 
            }, { headers });
            
            toast.success("Cotización rechazada");
            setShowRejectModal(false);
            
            if (selectedCotizacion && selectedCotizacion.id === rejectId) {
                setSelectedCotizacion({ 
                    ...selectedCotizacion, 
                    estado: 'Rechazada',
                    observacion_rechazo: rejectReason 
                });
            }
            fetchCotizaciones();
        } catch (error) {
            console.error("Error rechazando cotización:", error);
            toast.error("Error al rechazar cotización");
        }
    };
    
    const handleDuplicate = async (id) => {
        const toastId = toast.loading("Cargando datos para duplicar...");
        try {
            const res = await axios.get(`${API_URL}cotizaciones.php?action=get&id=${id}`, { headers });
            const cot = res.data;
            
            setFormData({
                fecha_emision: new Date().toISOString().split('T')[0],
                fecha_vencimiento: '',
                cliente_tipo_doc: cot.cliente_tipo_doc,
                cliente_num_doc: cot.cliente_num_doc,
                cliente_razon_social: cot.cliente_razon_social,
                cliente_direccion: cot.cliente_direccion || '',
                cliente_email: cot.cliente_email || '',
                cliente_nombre_contacto: cot.cliente_nombre_contacto || '',
                cliente_telefono: cot.cliente_telefono || '',
                moneda: cot.moneda,
                condicion_pago: cot.condicion_pago,
                validez_oferta: cot.validez_oferta,
                observaciones: cot.observaciones || '',
                condiciones_servicio: cot.condiciones_servicio || '',
                items: cot.items.map(item => ({
                    ...item,
                    cantidad: parseFloat(item.cantidad),
                    valor_unitario: parseFloat(item.valor_unitario),
                    precio_unitario: parseFloat(item.precio_unitario),
                    descuento: parseFloat(item.descuento || 0),
                    valor_venta: parseFloat(item.valor_venta),
                    igv: parseFloat(item.igv),
                    sub_concepto: item.sub_concepto || ''
                })),
                descuento_global: parseFloat(cot.descuento_global || 0)
            });

            const initialDiscount = parseFloat(cot.descuento_global || 0);
            setDescuentoGlobal(initialDiscount);
            setDescuentoValue(initialDiscount);
            setDescuentoTipo('monto');
            
            const itemsWithNumbers = cot.items.map(item => ({
                ...item, 
                valor_venta: parseFloat(item.valor_venta),
                cantidad: parseFloat(item.cantidad),
                precio_unitario: parseFloat(item.precio_unitario),
                descuento: parseFloat(item.descuento || 0),
                igv: parseFloat(item.igv)
            }));
            
            calculateTotales(itemsWithNumbers, initialDiscount, 'monto');
            
            setEditingId(null); 
            setActiveTab('nueva');
            toast.dismiss(toastId);
            toast.success("Cotización duplicada. Puede editarla antes de guardar.");
        } catch (error) {
            console.error("Error duplicando cotización:", error);
            toast.error("Error al cargar datos para duplicar", { id: toastId });
        }
    };

    const handleConvert = async (id) => {
        const toastId = toast.loading("Convirtiendo a venta...");
        try {
            const res = await axios.post(`${API_URL}cotizaciones.php?action=convert`, { id }, { headers });
            const data = res.data;
            
            toast.success(data.message || "Cotización convertida exitosamente", { id: toastId });
            setShowModal(false);
            fetchCotizaciones();
            if (data.comprobante_id) {
                navigate(`/facturacion-electronica?edit=${data.comprobante_id}`);
            }
        } catch (error) {
            console.error("Error convirtiendo a venta:", error);
            toast.error(error.response?.data?.message || "Error al convertir a venta", { id: toastId });
        }
    };

    const handlePrint = () => {
        generatePDF('print');
    };

    const handleFileUpload = async (e, id) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('archivo', file);
        formData.append('id', id);

        const toastId = toast.loading("Subiendo archivo...");
        try {
            await axios.post(`${API_URL}/cotizaciones.php?action=upload_attachment`, formData, { 
                headers: { 
                    ...headers,
                    'Content-Type': 'multipart/form-data'
                } 
            });
            toast.success("Archivo subido exitosamente", { id: toastId });
            
            if (selectedCotizacion && selectedCotizacion.id === id) {
                const res = await axios.get(`${API_URL}cotizaciones.php?action=get&id=${id}`, { headers });
                setSelectedCotizacion(res.data);
            }
            fetchCotizaciones();
        } catch (error) {
            console.error("Error subiendo archivo:", error);
            toast.error("Error al subir archivo", { id: toastId });
        }
    };

    const generatePDF = async (action = 'save', returnBlob = false, cotData = null) => {
        const cot = cotData || selectedCotizacion;
        if (!cot) return;
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const asesorNombre = cot.asesor_nombre || cot.vendedor || currentUser?.nombre_real || currentUser?.usuario || '';
        
        let emp;
        let acredLogos = [];
        const toastId = toast.loading("Obteniendo datos...");
        
        try {
            // Load data in parallel
            const [resEmp, resAcred] = await Promise.all([
                 axios.get(`${API_URL}empresa.php?t=${new Date().getTime()}`, { headers }),
                 axios.get(`${API_URL}acreditaciones.php?active=true`, { headers }).catch(() => ({ data: [] }))
            ]);
            
            emp = resEmp.data;
            setEmpresa(emp);
            acredLogos = resAcred.data || [];
            
            console.log("Datos frescos para PDF:", emp);
            toast.dismiss(toastId);
        } catch (error) {
            console.error("Error cargando datos para PDF", error);
            toast.dismiss(toastId);
            toast.error("No se pudieron cargar todos los datos. Se usarán valores por defecto.");
            emp = empresa;
        }

        const doc = new jsPDF();
        
        const razonSocial = emp?.razon_social || emp?.nombre_comercial || "EMPRESA";
        const ruc = emp?.ruc || "";
        const direccion = emp?.domicilio_fiscal || "";
        const logoPath = emp?.logo;

        const primaryColor = [30, 58, 138]; 
        const secondaryColor = [100, 116, 139]; 
        
        let yPos = 20;
        const xPos = 14;

        if (logoPath) {
            try {
                const logoUrl = `${API_URL}public_files.php?path=${logoPath}`;
                const logoBase64 = await getBase64ImageFromURL(logoUrl);
                
                const imgProps = doc.getImageProperties(logoBase64);
                const pdfWidth = 40; 
                const logoHeight = (imgProps.height * pdfWidth) / imgProps.width;
                
                doc.addImage(logoBase64, 'PNG', 14, 10, pdfWidth, logoHeight, undefined, 'FAST');
                yPos = Math.max(yPos, 10 + logoHeight + 5);
            } catch (error) {
                console.error("Error loading logo:", error);
            }
        }

        doc.setDrawColor(...primaryColor);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(140, 10, 60, 25, 1, 1, 'FD');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...primaryColor);
        doc.text("R.U.C. " + ruc, 170, 16, { align: "center" });
        
        doc.setFillColor(...primaryColor);
        doc.rect(140, 20, 60, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text("COTIZACIÓN", 170, 25.5, { align: "center" });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text(`${cot.serie} - ${String(cot.correlativo).padStart(6, '0')}`, 170, 32, { align: "center" });

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...primaryColor);
        doc.text(razonSocial, xPos, yPos);
        yPos += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...secondaryColor);
        
        const addressLines = doc.splitTextToSize(direccion, 100); 
        doc.text(addressLines, xPos, yPos);
        yPos += (addressLines.length * 3.5) + 5; 
        
        const boxY = Math.max(yPos, 45); 
        
        doc.setFontSize(9);
        const maxTextWidth = 70;
        const clienteNameLines = doc.splitTextToSize(cot.cliente_razon_social, maxTextWidth);
        const clienteDirLines = doc.splitTextToSize(cot.cliente_direccion || "-", maxTextWidth);
        
        const lineHeight = 4;
        const initialY = boxY;
        
        let leftY = initialY + 12;
        const nameHeight = clienteNameLines.length * lineHeight;
        const docY = leftY + Math.max(nameHeight, lineHeight) + 2; 
        const dirLabelY = docY + lineHeight + 2;
        const dirHeight = clienteDirLines.length * lineHeight;
        
        let extraHeight = 0;
        if (cot.cliente_nombre_contacto) extraHeight += 5;
        if (cot.cliente_telefono) extraHeight += 5;

        const leftTotalHeight = (dirLabelY - initialY) + dirHeight + 4 + extraHeight;
        
        let rightTotalHeight = 30; 
        if (asesorNombre) rightTotalHeight += 5;
        if (cot.asesor_telefono) rightTotalHeight += 5;

        const boxHeight = Math.max(leftTotalHeight, rightTotalHeight);

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, boxY, 186, boxHeight, 1, 1, 'F');
        
        doc.setFontSize(9);
        doc.setTextColor(...primaryColor);
        doc.setFont("helvetica", "bold");
        doc.text("DATOS DEL CLIENTE", 20, boxY + 6);
        
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "bold");
        doc.text("Señor(es):", 20, boxY + 12);
        
        doc.setFont("helvetica", "normal");
        doc.text(clienteNameLines, 45, boxY + 12);
        
        const rucY = boxY + 12 + (clienteNameLines.length * 4) + 1; 
        
        doc.setFont("helvetica", "bold");
        doc.text(cot.cliente_tipo_doc === '6' ? 'RUC:' : 'DNI:', 20, rucY);
        doc.setFont("helvetica", "normal");
        doc.text(cot.cliente_num_doc, 45, rucY);
        
        const dirY = rucY + 5;
        
        doc.setFont("helvetica", "bold");
        doc.text("Dirección:", 20, dirY);
        doc.setFont("helvetica", "normal");
        doc.text(clienteDirLines, 45, dirY);

        // Calculate Y position for next elements based on address lines
        const addressHeight = clienteDirLines.length * 4;
        let nextY = dirY + Math.max(addressHeight, 4) + 1;

        if (cot.cliente_nombre_contacto) {
            doc.setFont("helvetica", "bold");
            doc.text("Contacto:", 20, nextY);
            doc.setFont("helvetica", "normal");
            doc.text(cot.cliente_nombre_contacto, 45, nextY);
            nextY += 5;
        }

        if (cot.cliente_telefono) {
            doc.setFont("helvetica", "bold");
            doc.text("Teléfono:", 20, nextY);
            doc.setFont("helvetica", "normal");
            doc.text(cot.cliente_telefono, 45, nextY);
            nextY += 5;
        }

        if (cot.cliente_email) {
            doc.setFont("helvetica", "bold");
            doc.text("Email:", 20, nextY);
            doc.setFont("helvetica", "normal");
            doc.text(cot.cliente_email, 45, nextY);
        }

        const col2X = 120;
        doc.setTextColor(...primaryColor);
        doc.setFont("helvetica", "bold");
        doc.text("CONDICIONES", col2X, boxY + 6);

        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "bold");
        doc.text("Fecha Emisión:", col2X, boxY + 12);
        doc.setFont("helvetica", "normal");
        doc.text(cot.fecha_emision, col2X + 30, boxY + 12);
        
        doc.setFont("helvetica", "bold");
        doc.text("Moneda:", col2X, boxY + 17);
        doc.setFont("helvetica", "normal");
        doc.text(cot.moneda === 'PEN' ? 'Soles (S/)' : 'Dólares ($)', col2X + 30, boxY + 17);

        if (cot.fecha_vencimiento && cot.fecha_vencimiento !== '0000-00-00') {
            doc.setFont("helvetica", "bold");
            doc.text("Vencimiento:", col2X, boxY + 22);
            doc.setFont("helvetica", "normal");
            doc.text(cot.fecha_vencimiento, col2X + 30, boxY + 22);
        }

        if (asesorNombre) {
            const asesorY = boxY + 27;
            doc.setFont("helvetica", "bold");
            doc.text("Asesor:", col2X, asesorY);
            doc.setFont("helvetica", "normal");
            doc.text(asesorNombre, col2X + 30, asesorY);
            
            if (cot.asesor_telefono) {
                doc.setFont("helvetica", "bold");
                doc.text("Tel:", col2X, asesorY + 5);
                doc.setFont("helvetica", "normal");
                doc.text(cot.asesor_telefono, col2X + 30, asesorY + 5);
            }
        }

        const tableStartY = boxY + boxHeight + 5;
        
        const tableColumn = ["ITEM", "DESCRIPCIÓN", "CANT.", "U.M.", "P. UNIT", "TOTAL"];
        const tableRows = [];

        cot.items.forEach((item, index) => {
            const subConceptoLines = (item.sub_concepto || '')
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            const descripcion = subConceptoLines.length > 0
                ? `${item.descripcion}\n${subConceptoLines.map(l => `• ${l}`).join('\n')}`
                : item.descripcion;

            const itemData = [
                index + 1,
                descripcion,
                item.cantidad,
                item.unidad_medida || 'NIU',
                parseFloat(item.precio_unitario).toFixed(2),
                parseFloat(item.valor_venta).toFixed(2)
            ];
            tableRows.push(itemData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: tableStartY,
            theme: 'grid',
            headStyles: { 
                fillColor: primaryColor, 
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 8
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [50, 50, 50]
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 15, halign: 'center' },
                3: { cellWidth: 15, halign: 'center' },
                4: { cellWidth: 25, halign: 'right' },
                5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 14, right: 14 }
        });

        const finalY = doc.lastAutoTable.finalY + 5;

        const rightMargin = 196;
        const valueX = 196;
        const labelX = 150;
        
        doc.setFontSize(9);
        
        doc.setTextColor(100);
        doc.text("Op. Gravada:", labelX, finalY + 5);
        doc.setTextColor(0);
        doc.text(`${cot.moneda} ${parseFloat(cot.total_gravada).toFixed(2)}`, valueX, finalY + 5, { align: "right" });
        
        if (parseFloat(cot.descuento_global) > 0) {
            doc.setTextColor(100);
            doc.text("Descuento Global:", labelX, finalY + 9);
            doc.setTextColor(0);
            doc.text(`-${cot.moneda} ${parseFloat(cot.descuento_global).toFixed(2)}`, valueX, finalY + 9, { align: "right" });
        }

        doc.setTextColor(100);
        doc.text("I.G.V. (18%):", labelX, finalY + 13);
        doc.setTextColor(0);
        doc.text(`${cot.moneda} ${parseFloat(cot.total_igv).toFixed(2)}`, valueX, finalY + 13, { align: "right" });
        
        doc.setDrawColor(200);
        doc.line(labelX, finalY + 16, valueX, finalY + 16);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...primaryColor);
        doc.text("TOTAL:", labelX, finalY + 22);
        doc.text(`${cot.moneda} ${parseFloat(cot.total_importe).toFixed(2)}`, valueX, finalY + 22, { align: "right" });

        let footerY = finalY + 28;
        
        const drawFooterBlock = (title, content) => {
            if (!content) return;
            
            if (footerY > 260) {
                doc.addPage();
                footerY = 20;
            }

            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...primaryColor);
            doc.text(title, 14, footerY);
            
            doc.setDrawColor(200);
            const lines = doc.splitTextToSize(content, 176); 
            const height = Math.max(10, lines.length * 4) + 4;
            
            doc.rect(14, footerY + 2, 182, height);
            
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80);
            doc.text(lines, 16, footerY + 6);
            
            footerY += height + 8;
        };

        drawFooterBlock("OBSERVACIONES:", cot.observaciones || "Sin observaciones.");
        drawFooterBlock("CONDICIÓN DE PAGO:", cot.condicion_pago);
        drawFooterBlock("VALIDEZ DE LA OFERTA:", cot.validez_oferta);
        drawFooterBlock("CONDICIONES DEL SERVICIO:", cot.condiciones_servicio);

        if (bancos.length > 0) {
            let bancosText = "";
            bancos.forEach(b => {
                bancosText += `${b.nombre_banco} - ${b.moneda}\n`;
                if(b.titular) bancosText += `Titular: ${b.titular}\n`;
                bancosText += `N° Cuenta: ${b.numero_cuenta}\n`;
                if(b.cci) bancosText += `CCI: ${b.cci}\n`;
                bancosText += "\n";
            });
            drawFooterBlock("CUENTAS BANCARIAS:", bancosText);
        }

        // Accreditation Logos
        if (acredLogos && acredLogos.length > 0) {
            // Ensure space
            if (footerY > 250) {
                doc.addPage();
                footerY = 20;
            }

            // Title
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...primaryColor);
            doc.text("NUESTRAS ACREDITACIONES:", 14, footerY);
            footerY += 5;

            const startX = 14;
            const logoW = 22; // Width of each logo
            const gap = 10;
            let currentX = startX;

            for (const acred of acredLogos) {
                if (acred.imagen_path) {
                    try {
                         const imgUrl = `${API_URL}public_files.php?path=${acred.imagen_path}`;
                         const logoBase64 = await getBase64ImageFromURL(imgUrl);
                         
                         // Calculate height to maintain aspect ratio
                         const imgProps = doc.getImageProperties(logoBase64);
                         const logoH = (imgProps.height * logoW) / imgProps.width;
                         
                         // Check if logo fits in remaining height (if close to bottom)
                         if (footerY + logoH > 280) {
                            doc.addPage();
                            footerY = 20;
                            currentX = startX;
                         }

                         doc.addImage(logoBase64, 'PNG', currentX, footerY, logoW, logoH, undefined, 'FAST');
                         
                         currentX += logoW + gap;
                         
                         // Wrap if too many
                         if (currentX > 180) {
                             currentX = startX;
                             footerY += 25; // Move down row
                         }
                    } catch (e) {
                        console.error("Error adding accreditation logo:", e);
                    }
                }
            }
            // Add some padding after logos
             footerY += 20;
        }

        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text("Generado por Sistema ERP", 14, 285, { align: 'left' });
            doc.text(`Página ${i} de ${pageCount}`, 196, 285, { align: 'right' });
            doc.text("Documento generado electrónicamente. No tiene valor fiscal hasta su canje por comprobante de pago.", 105, 285, { align: "center" });
        }
        
        if (returnBlob) {
            return doc.output('blob');
        }

        try {
            if (action === 'print') {
                doc.autoPrint();
                window.open(doc.output('bloburl'), '_blank');
            } else {
                doc.save(`Cotizacion_${cot.serie}-${String(cot.correlativo).padStart(6, '0')}.pdf`);
            }
        } catch (e) {
            console.error("Error al generar PDF:", e);
            toast.error("Error al generar el PDF. Intente nuevamente.");
        }
    };

    const handleSendEmail = async (e) => {
        e.preventDefault();
        setSendingEmail(true);
        const toastId = toast.loading("Enviando correo...");
        try {
            const formData = new FormData();
            formData.append('id', selectedCotizacion.id);
            formData.append('email', emailData.to);

            await axios.post(`${API_URL}cotizaciones.php?action=send_email`, formData, { 
                headers: { Authorization: headers.Authorization }
            });
            toast.success("Correo enviado exitosamente", { id: toastId });
            setShowEmailModal(false);
            if (selectedCotizacion) {
                handleStatusUpdate(selectedCotizacion.id, 'Enviada');
            }
        } catch (error) {
            console.error("Error enviando correo:", error);
            toast.error("Error al enviar el correo", { id: toastId });
        } finally {
            setSendingEmail(false);
        }
    };

    const fetchTemplates = async () => {
        try {
            const res = await axios.get(`${API_URL}/cotizaciones.php?action=get_templates`, { headers });
            setTemplates(res.data);
        } catch (error) {
            console.error("Error cargando plantillas:", error);
        }
    };

    const handleSaveTemplate = async () => {
        if (!newTemplateTitle) {
            toast.error("Ingrese un título para la plantilla");
            return;
        }
        if (!formData.condiciones_servicio) {
            toast.error("No hay contenido en condiciones del servicio para guardar");
            return;
        }

        try {
            await axios.post(`${API_URL}cotizaciones.php?action=save_template`, {
                titulo: newTemplateTitle,
                contenido: formData.condiciones_servicio
            }, { headers });
            toast.success("Plantilla guardada");
            setNewTemplateTitle('');
            fetchTemplates();
        } catch (error) {
            toast.error("Error al guardar plantilla");
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm("¿Seguro que desea eliminar esta plantilla?")) return;
        try {
            await axios.post(`${API_URL}/cotizaciones.php?action=delete_template`, { id }, { headers });
            toast.success("Plantilla eliminada");
            fetchTemplates();
        } catch (error) {
            toast.error("Error al eliminar plantilla");
        }
    };

    const handleLoadTemplate = (content) => {
        setFormData(prev => ({ ...prev, condiciones_servicio: content }));
        toast.success("Plantilla cargada");
        setShowTemplateModal(false);
    };

    const openEmailModal = (cot) => {
        setSelectedCotizacion(cot);
        setEmailData({ 
            to: cot.cliente_email || '', 
            subject: `Cotización ${cot.serie}-${String(cot.correlativo).padStart(6, '0')}`,
            message: 'Adjunto encontrará la cotización solicitada.'
        });
        setShowEmailModal(true);
    };

    const openTemplateModal = () => {
        fetchTemplates();
        setShowTemplateModal(true);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 fade-in">
            <Toaster position="top-right" />
            
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <FileText className="text-blue-600" /> Cotizaciones
                </h1>
                <div className="flex items-center gap-2">
                    {activeTab === 'listado' && (
                        <button 
                            onClick={() => setActiveTab('nueva')}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                            <Plus size={18} /> Nueva Cotización
                        </button>
                    )}
                    {canConfigureApprovers && (
                        <button 
                            onClick={() => { setApproverModalOpen(true); fetchApproversInit(); }}
                            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50"
                            title="Configurar Aprobadores"
                        >
                            <ShieldCheck size={18} /> Aprobadores
                        </button>
                    )}
                </div>
                {activeTab === 'nueva' && (
                    <button 
                        onClick={() => setActiveTab('listado')}
                        className="text-gray-600 hover:text-gray-800"
                    >
                        Cancelar
                    </button>
                )}
            </div>

            {activeTab === 'listado' ? (
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar w-full md:w-auto">
                            {['Todos', 'Borrador', 'Enviada', 'Aprobada', 'Convertida', 'Rechazada'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border
                                        ${filterStatus === status 
                                            ? 'bg-blue-600 text-white border-blue-600' 
                                            : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por serie, cliente o RUC..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        {loading ? (
                        <div className="flex flex-col justify-center items-center p-12 space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600"></div>
                            <p className="text-gray-500 font-medium">Cargando cotizaciones...</p>
                        </div>
                    ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="p-4 font-semibold text-gray-600">Serie</th>
                                    <th className="p-4 font-semibold text-gray-600">Cliente</th>
                                    <th className="p-4 font-semibold text-gray-600">Fecha</th>
                                    <th className="p-4 font-semibold text-gray-600">Total</th>
                                    <th className="p-4 font-semibold text-gray-600">Asesor</th>
                                    <th className="p-4 font-semibold text-gray-600">Estado</th>
                                    <th className="p-4 font-semibold text-gray-600">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {cotizaciones
                                    .filter(cot => filterStatus === 'Todos' || cot.estado === filterStatus)
                                    .map(cot => (
                                    <tr key={cot.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-medium text-blue-600">{cot.serie}-{String(cot.correlativo).padStart(6, '0')}</td>
                                        <td className="p-4">{cot.cliente_razon_social}</td>
                                        <td className="p-4">{cot.fecha_emision}</td>
                                        <td className="p-4">{cot.moneda} {parseFloat(cot.total_importe).toFixed(2)}</td>
                                        <td className="p-4">
                                            <div className="text-sm font-medium text-gray-800">{cot.asesor_nombre || 'N/A'}</div>
                                            <div className="text-xs text-gray-500">{cot.asesor_telefono}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold
                                                ${cot.estado === 'Aprobada' ? 'bg-green-100 text-green-700' : 
                                                  cot.estado === 'Rechazada' ? 'bg-red-100 text-red-700' :
                                                  cot.estado === 'Convertida' ? 'bg-purple-100 text-purple-700' :
                                                  cot.estado === 'Enviada' ? 'bg-blue-100 text-blue-700' :
                                                  'bg-gray-100 text-gray-700'}`}>
                                                {cot.estado}
                                            </span>
                                        </td>
                                        <td className="p-4 flex gap-2">
                                            {cot.estado !== 'Convertida' && (
                                                <button 
                                                    onClick={() => handleEdit(cot.id)}
                                                    className="text-green-600 hover:text-green-800 font-medium"
                                                    title="Editar"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                            )}
                                            {cot.estado === 'Aprobada' && (
                                                <button 
                                                    onClick={() => handleConvert(cot.id)}
                                                    className="text-purple-600 hover:text-purple-800 font-medium"
                                                    title="Convertir a Venta"
                                                >
                                                    <ArrowRight size={18} />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleViewDetails(cot.id)}
                                                className="text-blue-600 hover:text-blue-800 font-medium"
                                                title="Ver detalles"
                                            >
                                                <FileText size={18} />
                                            </button>
                                            <button 
                                                onClick={() => openEmailModal(cot)}
                                                className="text-yellow-600 hover:text-yellow-800 font-medium"
                                                title="Enviar por Correo"
                                            >
                                                <Mail size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleWhatsApp(cot)}
                                                className="text-green-500 hover:text-green-700 font-medium"
                                                title="Enviar por WhatsApp"
                                            >
                                                <MessageCircle size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDuplicate(cot.id)}
                                                className="text-gray-600 hover:text-gray-800 font-medium"
                                                title="Duplicar"
                                            >
                                                <Copy size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(cot.id)}
                                                className="text-red-500 hover:text-red-700 font-medium"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {cotizaciones.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-gray-500">
                                            No hay cotizaciones registradas
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    )}
                    
                    {/* Pagination Controls */}
                    {!loading && cotizaciones.length > 0 && (
                        <div className="flex justify-between items-center p-4 border-t border-gray-100">
                            <span className="text-sm text-gray-500">
                                Página {page} de {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium text-gray-600"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium text-gray-600"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        
                        {/* Buscador de clientes registrados */}
                        <div className="mb-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <label className="text-sm font-medium text-blue-800 mb-2 block">Buscar Cliente Registrado (Opcional)</label>
                            <SearchableSelect
                                options={clientes}
                                placeholder="Buscar cliente por nombre o documento..."
                                labelKey="razon_social"
                                secondaryKey="num_doc"
                                valueKey="id"
                                onChange={handleSelectCliente}
                                onSearch={fetchClientes}
                                loading={isSearching}
                            />
                            <p className="text-xs text-blue-600 mt-1">
                                Seleccione un cliente de la lista o ingrese los datos manualmente abajo.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Tipo Doc.</label>
                                <select 
                                    className="w-full p-2 border rounded-lg"
                                    value={formData.cliente_tipo_doc}
                                    onChange={e => setFormData({...formData, cliente_tipo_doc: e.target.value})}
                                >
                                    <option value="6">RUC</option>
                                    <option value="1">DNI</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Número Doc.</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded-lg"
                                        value={formData.cliente_num_doc}
                                        onChange={e => setFormData({...formData, cliente_num_doc: e.target.value})}
                                        placeholder="Ingrese número y presione buscar"
                                    />
                                    <button type="button" onClick={handleClienteSearch} className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                                        <Search size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Razón Social / Nombre</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border rounded-lg bg-gray-50"
                                    value={formData.cliente_razon_social}
                                    readOnly
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Contacto (Opcional)</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Nombre del contacto"
                                    value={formData.cliente_nombre_contacto}
                                    onChange={e => setFormData({...formData, cliente_nombre_contacto: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Teléfono (Opcional)</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Teléfono del contacto"
                                    value={formData.cliente_telefono}
                                    onChange={e => setFormData({...formData, cliente_telefono: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Email (Opcional)</label>
                                <input 
                                    type="email" 
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="correo@ejemplo.com"
                                    value={formData.cliente_email}
                                    onChange={e => setFormData({...formData, cliente_email: e.target.value})}
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Fecha Emisión</label>
                                <input 
                                    type="date" 
                                    className="w-full p-2 border rounded-lg"
                                    value={formData.fecha_emision}
                                    onChange={e => setFormData({...formData, fecha_emision: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Vencimiento (Opcional)</label>
                                <input 
                                    type="date" 
                                    className="w-full p-2 border rounded-lg"
                                    value={formData.fecha_vencimiento}
                                    onChange={e => setFormData({...formData, fecha_vencimiento: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Moneda</label>
                                <select 
                                    className="w-full p-2 border rounded-lg"
                                    value={formData.moneda}
                                    onChange={e => setFormData({...formData, moneda: e.target.value})}
                                >
                                    <option value="PEN">Soles (PEN)</option>
                                    <option value="USD">Dólares (USD)</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Condición de Pago</label>
                                <select 
                                    className="w-full p-2 border rounded-lg"
                                    value={['Contado', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 45 días', 'Crédito 60 días'].includes(formData.condicion_pago) ? formData.condicion_pago : 'Otro'}
                                    onChange={e => {
                                        if (e.target.value === 'Otro') {
                                            setFormData({...formData, condicion_pago: ''});
                                        } else {
                                            setFormData({...formData, condicion_pago: e.target.value});
                                        }
                                    }}
                                >
                                    <option value="Contado">Contado</option>
                                    <option value="Crédito 15 días">Crédito 15 días</option>
                                    <option value="Crédito 30 días">Crédito 30 días</option>
                                    <option value="Crédito 45 días">Crédito 45 días</option>
                                    <option value="Crédito 60 días">Crédito 60 días</option>
                                    <option value="Otro">Otro (Especificar)</option>
                                </select>
                                {!['Contado', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 45 días', 'Crédito 60 días'].includes(formData.condicion_pago) && (
                                    <input 
                                        type="text"
                                        className="w-full p-2 border rounded-lg mt-2 bg-blue-50"
                                        placeholder="Ej. Crédito 90 días"
                                        value={formData.condicion_pago}
                                        onChange={e => setFormData({...formData, condicion_pago: e.target.value})}
                                        autoFocus
                                    />
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Validez Oferta</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Ej. 15 días"
                                    value={formData.validez_oferta}
                                    onChange={e => setFormData({...formData, validez_oferta: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="border-t pt-6">
                            <h3 className="font-semibold text-gray-800 mb-4">Items de la Cotización</h3>
                            
                            {/* Product Search */}
                            <div className="relative mb-6">
                                <label className="text-sm font-medium text-gray-700 block mb-1">Buscar Producto (Opcional)</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full p-2 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Buscar por nombre, código interno o código de barras..."
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        onFocus={() => { if(productSearch.length > 2) setShowSuggestions(true); }}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    />
                                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                </div>
                                {showSuggestions && productSuggestions.length > 0 && (
                                    <div className="absolute z-20 w-full bg-white border rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
                                        {productSuggestions.map(product => (
                                            <div 
                                                key={product.id}
                                                className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 transition-colors"
                                                onClick={() => selectProduct(product)}
                                            >
                                                <div className="font-medium text-gray-800">{product.nombre}</div>
                                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                    <span>Cód: {product.codigo_interno || '-'}</span>
                                                    <span>Stock: {product.stock} | Precio: S/ {parseFloat(product.precio).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-12 gap-2 mb-4 items-end bg-gray-50 p-4 rounded-lg">
                                <div className="col-span-3 space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Descripción</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded"
                                        placeholder="Producto o Servicio"
                                        value={currentItem.descripcion}
                                        onChange={e => setCurrentItem({...currentItem, descripcion: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-3 space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Sub Concepto</label>
                                    <textarea
                                        className="w-full p-2 border rounded text-xs"
                                        placeholder="Detalle adicional (una línea por ítem)"
                                        rows={2}
                                        value={currentItem.sub_concepto}
                                        onChange={e => setCurrentItem({...currentItem, sub_concepto: e.target.value})}
                                    ></textarea>
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Cant.</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 border rounded"
                                        min="1"
                                        value={currentItem.cantidad}
                                        onChange={e => setCurrentItem({...currentItem, cantidad: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Precio Unit.</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 border rounded"
                                        min="0"
                                        step="0.01"
                                        value={currentItem.valor_unitario}
                                        onChange={e => setCurrentItem({...currentItem, valor_unitario: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Desc.</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 border rounded"
                                        min="0"
                                        step="0.01"
                                        value={currentItem.descuento}
                                        onChange={e => setCurrentItem({...currentItem, descuento: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2 flex gap-1">
                                    <button 
                                        type="button" 
                                        onClick={addItem}
                                        className={`w-full text-white p-2 rounded hover:opacity-90 ${editingIndex >= 0 ? 'bg-green-600' : 'bg-blue-600'}`}
                                    >
                                        {editingIndex >= 0 ? 'Actualizar' : 'Agregar'}
                                    </button>
                                    {editingIndex >= 0 && (
                                        <button 
                                            type="button" 
                                            onClick={cancelEdit}
                                            className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                                            title="Cancelar edición"
                                        >
                                            <XCircle size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="p-3 text-left">Descripción</th>
                                            <th className="p-3 text-left">Sub Concepto</th>
                                            <th className="p-3 text-right">Cant.</th>
                                            <th className="p-3 text-right">P. Unit</th>
                                            <th className="p-3 text-right">Desc.</th>
                                            <th className="p-3 text-right">Total</th>
                                            <th className="p-3 text-center"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {formData.items.map((item, index) => (
                                            <tr key={index}>
                                                <td className="p-3">{item.descripcion}</td>
                                                <td className="p-3 text-gray-600 whitespace-pre-line text-xs">
                                                    {item.sub_concepto}
                                                </td>
                                                <td className="p-3 text-right">{item.cantidad}</td>
                                                <td className="p-3 text-right">{parseFloat(item.valor_unitario).toFixed(2)}</td>
                                                <td className="p-3 text-right">{parseFloat(item.descuento).toFixed(2)}</td>
                                                <td className="p-3 text-right">{parseFloat(item.valor_venta).toFixed(2)}</td>
                                                <td className="p-3 text-center flex justify-center gap-2">
                                                    <button type="button" onClick={() => startEdit(index)} className="text-blue-500 hover:text-blue-700">
                                                        <Edit size={16} />
                                                    </button>
                                                    <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <div className="w-64 space-y-2 bg-gray-50 p-4 rounded-lg">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Gravada:</span>
                                    <span className="font-medium">{totales.gravada.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">Descuento:</span>
                                    <div className="flex items-center gap-1">
                                        <div className="flex bg-gray-100 rounded border border-gray-200 p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setDescuentoTipo('monto')}
                                                className={`p-1 rounded text-xs ${descuentoTipo === 'monto' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
                                                title="Monto Fijo"
                                            >
                                                <DollarSign size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDescuentoTipo('porcentaje')}
                                                className={`p-1 rounded text-xs ${descuentoTipo === 'porcentaje' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
                                                title="Porcentaje"
                                            >
                                                <Percent size={12} />
                                            </button>
                                        </div>
                                        <input 
                                            type="number"
                                            className="w-20 p-1 text-right border rounded text-sm"
                                            min="0"
                                            step={descuentoTipo === 'porcentaje' ? "0.1" : "0.01"}
                                            value={descuentoValue}
                                            onChange={(e) => setDescuentoValue(e.target.value)}
                                        />
                                    </div>
                                </div>
                                {descuentoTipo === 'porcentaje' && (
                                    <div className="flex justify-end text-xs text-gray-500 mb-1">
                                        <span>-{formData.moneda} {parseFloat(descuentoGlobal).toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-600">IGV (18%):</span>
                                    <span className="font-medium">{totales.igv.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-gray-200">
                                    <span className="font-bold text-gray-800">Total:</span>
                                    <span className="font-bold text-blue-600">{formData.moneda} {totales.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Observaciones</label>
                            <textarea 
                                className="w-full p-2 border rounded-lg h-24"
                                value={formData.observaciones}
                                onChange={e => setFormData({...formData, observaciones: e.target.value})}
                            ></textarea>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-gray-700">Condiciones del Servicio</label>
                                    <div className="flex gap-2">
                                        <button 
                                            type="button" 
                                            onClick={openTemplateModal}
                                            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800"
                                        >
                                            <Book size={14} /> Gestionar Plantillas
                                        </button>
                                        <select 
                                            className="text-xs border rounded p-1 text-gray-600 bg-white hover:border-blue-400 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                                            onChange={(e) => {
                                                if(e.target.value) setFormData(prev => ({...prev, condiciones_servicio: e.target.value}))
                                            }}
                                            defaultValue=""
                                        >
                                            {CONDITION_TEMPLATES.map((t, i) => (
                                                <option key={i} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <textarea 
                                    className="w-full p-2 border rounded-lg h-24 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                                    value={formData.condiciones_servicio}
                                    onChange={e => setFormData({...formData, condiciones_servicio: e.target.value})}
                                    placeholder="Ej: Validez de la oferta 15 días"
                                ></textarea>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button 
                                type="button" 
                                onClick={() => handleSubmit(null, 'Borrador')}
                                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 font-medium flex items-center gap-2"
                                disabled={loading}
                            >
                                <Save size={18} />
                                Guardar Borrador
                            </button>
                            <button 
                                type="button" 
                                onClick={() => handleSubmit(null, 'Enviada')}
                                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
                                disabled={loading}
                            >
                                <Send size={18} />
                                {editingId ? 'Actualizar y Emitir' : 'Emitir Cotización'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal Eliminar */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar Cotización?</h3>
                        <p className="text-gray-600 mb-6">Esta acción no se puede deshacer. ¿Está seguro que desea eliminar esta cotización?</p>
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Rechazar */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Rechazar Cotización</h3>
                        <p className="text-gray-600 mb-4">Por favor ingrese el motivo del rechazo:</p>
                        <textarea
                            className="w-full p-2 border rounded-lg mb-4 h-24 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Ej: Costos elevados, falta de respuesta, etc."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setShowRejectModal(false)}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleConfirmReject}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Rechazar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Detalles */}
            {showModal && selectedCotizacion && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
                            <h2 className="text-xl font-bold text-gray-800">
                                Cotización {selectedCotizacion.serie}-{String(selectedCotizacion.correlativo).padStart(6, '0')}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                                <XCircle size={24} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6" id="printable-area">
                            {/* ... detalles ... */}
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <h3 className="font-bold text-gray-700 mb-2">Empresa Emisora</h3>
                                    <p className="font-bold">{empresa?.razon_social || "Empresa S.A."}</p>
                                    <p>RUC: {empresa?.ruc || "20100000001"}</p>
                                    <p>{empresa?.domicilio_fiscal || "Av. Principal 123, Lima"}</p>
                                </div>
                                <div className="text-right">
                                    <h3 className="font-bold text-gray-700 mb-2">Cliente</h3>
                                    <p className="font-medium">{selectedCotizacion.cliente_razon_social}</p>
                                    <p>{selectedCotizacion.cliente_tipo_doc === '6' ? 'RUC' : 'DNI'}: {selectedCotizacion.cliente_num_doc}</p>
                                    <p>{selectedCotizacion.cliente_direccion}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg">
                                <div>
                                    <span className="block text-xs text-gray-500">Fecha Emisión</span>
                                    <span className="font-medium">{selectedCotizacion.fecha_emision}</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-gray-500">Vencimiento</span>
                                    <span className="font-medium">{selectedCotizacion.fecha_vencimiento || '-'}</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-gray-500">Moneda</span>
                                    <span className="font-medium">{selectedCotizacion.moneda}</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-gray-500">Estado</span>
                                    <span className={`font-bold ${
                                        selectedCotizacion.estado === 'Aprobada' ? 'text-green-600' : 
                                        selectedCotizacion.estado === 'Rechazada' ? 'text-red-600' : 
                                        'text-blue-600'
                                    }`}>{selectedCotizacion.estado}</span>
                                </div>
                            </div>

                            {selectedCotizacion.estado === 'Rechazada' && selectedCotizacion.observacion_rechazo && (
                                <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                                    <h4 className="font-bold text-sm text-red-800 mb-1">Motivo del Rechazo:</h4>
                                    <p className="text-sm text-red-700">{selectedCotizacion.observacion_rechazo}</p>
                                </div>
                            )}

                            <table className="w-full text-sm border-collapse">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="p-2 border text-left">Descripción</th>
                                        <th className="p-2 border text-right">Cant.</th>
                                        <th className="p-2 border text-right">P. Unit</th>
                                        <th className="p-2 border text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedCotizacion.items?.map((item, i) => (
                                        <tr key={i}>
                                            <td className="p-2 border">{item.descripcion}</td>
                                            <td className="p-2 border text-right">{item.cantidad}</td>
                                            <td className="p-2 border text-right">{parseFloat(item.valor_unitario).toFixed(2)}</td>
                                            <td className="p-2 border text-right">{parseFloat(item.valor_venta).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan="3" className="p-2 border text-right font-bold">Subtotal</td>
                                        <td className="p-2 border text-right">{parseFloat(selectedCotizacion.total_gravada).toFixed(2)}</td>
                                    </tr>
                                    {parseFloat(selectedCotizacion.descuento_global) > 0 && (
                                        <tr>
                                            <td colSpan="3" className="p-2 border text-right font-bold">Descuento Global</td>
                                            <td className="p-2 border text-right">-{parseFloat(selectedCotizacion.descuento_global).toFixed(2)}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td colSpan="4" className="p-2 border text-right font-bold">IGV (18%)</td>
                                        <td className="p-2 border text-right">{parseFloat(selectedCotizacion.total_igv).toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan="4" className="p-2 border text-right font-bold">Total</td>
                                        <td className="p-2 border text-right font-bold">{parseFloat(selectedCotizacion.total_importe).toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            {selectedCotizacion.observaciones && (
                                <div>
                                    <h4 className="font-bold text-sm mb-1">Observaciones:</h4>
                                    <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{selectedCotizacion.observaciones}</p>
                                </div>
                            )}

                            {selectedCotizacion.archivo_adjunto && (
                                <div className="mt-4 p-4 border rounded-lg bg-blue-50 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Paperclip size={20} className="text-blue-600"/>
                                        <span className="text-sm font-medium">Archivo Adjunto Disponible</span>
                                    </div>
                                    <a 
                                        href={`${API_URL.replace('/api', '')}/${selectedCotizacion.archivo_adjunto}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline text-sm font-bold"
                                    >
                                        Descargar / Ver
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t bg-gray-50 flex flex-wrap gap-3 justify-end">
                            {selectedCotizacion.estado === 'Borrador' && (
                                <>
                                    <button onClick={() => handleStatusUpdate(selectedCotizacion.id, 'Enviada')} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                        Marcar Enviada
                                    </button>
                                </>
                            )}

                            {(selectedCotizacion.estado === 'Enviada' || selectedCotizacion.estado === 'Borrador') && (
                                <>
                                    {(() => {
                                        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
                                        const canApprove = approvers.some(a => a.usuario_id === currentUser?.id);
                                        if (!canApprove) return null;
                                        return (
                                            <>
                                                <button onClick={() => handleStatusUpdate(selectedCotizacion.id, 'Aprobada')} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2">
                                                    <CheckCircle size={18}/> Aprobar
                                                </button>
                                                <button onClick={() => handleStatusUpdate(selectedCotizacion.id, 'Rechazada')} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2">
                                                    <XCircle size={18}/> Rechazar
                                                </button>
                                            </>
                                        );
                                    })()}
                                </>
                            )}

                            {selectedCotizacion.estado === 'Aprobada' && (
                                <button onClick={() => handleConvert(selectedCotizacion.id)} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2">
                                    <ArrowRight size={18}/> Convertir a Venta
                                </button>
                            )}

                            <button onClick={() => openEmailModal(selectedCotizacion)} className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 flex items-center gap-2">
                                <Mail size={18} /> Enviar Correo
                            </button>

                            <button onClick={handleWhatsApp} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-2">
                                <MessageCircle size={18} /> WhatsApp
                            </button>

                            <button onClick={generatePDF} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2">
                                <Download size={18} /> Descargar PDF
                            </button>

                            <button onClick={handlePrint} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-2">
                                <Printer size={18} /> Imprimir
                            </button>
                            
                            <div className="flex items-center gap-2 ml-4 border-l pl-4">
                                <label className="cursor-pointer px-4 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-2 text-sm font-medium text-gray-700">
                                    <Upload size={18} /> Adjuntar PDF
                                    <input type="file" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, selectedCotizacion.id)} />
                                </label>
                            </div>

                            <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {approverModalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold">Aprobadores de Cotizaciones</h2>
                            <button className="text-gray-500 hover:text-gray-700" onClick={() => setApproverModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={addApprover} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                            <div className="sm:col-span-3">
                                <label className="block text-sm font-medium mb-1">Usuario</label>
                                <select className="w-full border rounded-lg p-2" value={newApproverUserId} onChange={e => setNewApproverUserId(e.target.value)}>
                                    <option value="">Seleccione usuario</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.usuario} - {u.nombre_real}</option>)}
                                </select>
                            </div>
                            <div className="sm:col-span-1 flex items-end">
                                <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Agregar</button>
                            </div>
                        </form>
                        <div className="border rounded-lg">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-600 text-sm">
                                        <th className="p-2">Usuario</th>
                                        <th className="p-2">Nombre</th>
                                        <th className="p-2 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {approvers.length === 0 ? (
                                        <tr><td colSpan="3" className="p-4 text-center text-gray-500">Sin configuraciones</td></tr>
                                    ) : approvers.map(a => (
                                        <tr key={a.id} className="border-t">
                                            <td className="p-2">{a.usuario}</td>
                                            <td className="p-2">{a.nombre_real}</td>
                                            <td className="p-2 text-right">
                                                <button onClick={() => deleteApprover(a.id)} className="text-red-600 hover:bg-red-50 px-3 py-1 rounded">Eliminar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal Email */}
            {showEmailModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Mail className="text-blue-600" size={20} /> Enviar Cotización
                        </h3>
                        <form onSubmit={handleSendEmail} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Para:</label>
                                <input 
                                    type="email" 
                                    required
                                    className="w-full p-2 border rounded-lg"
                                    value={emailData.to}
                                    onChange={e => setEmailData({...emailData, to: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Asunto:</label>
                                <input 
                                    type="text" 
                                    readOnly
                                    className="w-full p-2 border rounded-lg bg-gray-50"
                                    value={emailData.subject}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje:</label>
                                <textarea 
                                    className="w-full p-2 border rounded-lg h-24"
                                    value={emailData.message}
                                    onChange={e => setEmailData({...emailData, message: e.target.value})}
                                ></textarea>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button 
                                    type="button"
                                    onClick={() => setShowEmailModal(false)}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    disabled={sendingEmail}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                                >
                                    {sendingEmail ? 'Enviando...' : <><Mail size={16}/> Enviar Correo</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Plantillas */}
            {showTemplateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Book className="text-blue-600" size={20} /> Plantillas de Términos
                        </h3>
                        
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    placeholder="Título de nueva plantilla..."
                                    className="flex-1 p-2 border rounded-lg"
                                    value={newTemplateTitle}
                                    onChange={e => setNewTemplateTitle(e.target.value)}
                                />
                                <button 
                                    onClick={handleSaveTemplate}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                                >
                                    <Save size={18} /> Guardar Actual
                                </button>
                            </div>

                            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700">
                                        <tr>
                                            <th className="p-3 text-left">Título</th>
                                            <th className="p-3 text-left">Contenido (Previsualización)</th>
                                            <th className="p-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {templates.map(temp => (
                                            <tr key={temp.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-medium">{temp.titulo}</td>
                                                <td className="p-3 text-gray-500 truncate max-w-xs">{temp.contenido}</td>
                                                <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleLoadTemplate(temp.contenido)}
                                                            className="text-blue-600 hover:text-blue-800 px-2 py-1 rounded bg-blue-50"
                                                        >
                                                            Cargar
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteTemplate(temp.id)}
                                                            className="text-red-500 hover:text-red-700"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {templates.length === 0 && (
                                            <tr>
                                                <td colSpan="3" className="p-4 text-center text-gray-500">No hay plantillas guardadas</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button 
                                    onClick={() => setShowTemplateModal(false)}
                                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Cotizaciones;
