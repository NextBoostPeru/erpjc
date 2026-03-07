import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { API_URL } from '../api/config';
import toast, { Toaster } from 'react-hot-toast';
import { 
    Landmark, Plus, ArrowUpRight, ArrowDownLeft, Repeat, 
    FileText, CheckCircle, X, ArrowLeft, Loader, Search,
    Wallet, CreditCard, DollarSign, Calendar, FileSpreadsheet, User as UserIcon,
    Edit2, Trash2
 } from 'lucide-react';

const isBancoNacion = (nombre) => {
    if (!nombre) return false;
    return nombre.toLowerCase().includes('nacion') || nombre.toLowerCase().includes('nación');
};

const Bancos = () => {
    const navigate = useNavigate();
    const [cuentas, setCuentas] = useState([]);
    const [selectedCuenta, setSelectedCuenta] = useState(null);
    const [movimientos, setMovimientos] = useState([]);
    const [view, setView] = useState('dashboard'); // dashboard, detalle
    const [activeModal, setActiveModal] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pcge, setPcge] = useState([]);
    const [searchMovimiento, setSearchMovimiento] = useState('');

    const [selectedMovimientos, setSelectedMovimientos] = useState([]);

    // Forms
    const [cuentaForm, setCuentaForm] = useState({ nombre_banco: '', numero_cuenta: '', tipo_cuenta: 'Corriente', moneda: 'PEN', saldo_inicial: 0, cuenta_contable: '', cci: '', titular: '', mostrar_en_pdf: false });
    const [movForm, setMovForm] = useState({ id: null, tipo: 'Ingreso', monto: '', concepto: '', referencia: '', entidad: '', cuenta_contable: '', origen_destino: '', fecha: '' });
    const [transfForm, setTransfForm] = useState({ cuenta_destino_id: '', monto: '', concepto: '', referencia: '', fecha: '' });
    const [chequeForm, setChequeForm] = useState({ numero_cheque: '', beneficiario: '', monto: '', fecha_emision: '', fecha_pago: '' });

    const token = localStorage.getItem('token');
    const modulos = JSON.parse(localStorage.getItem('modulos')) || [];
    const hasCaja = modulos.some(m => m.codigo === 'caja');

    const toDateTimeLocal = (v) => {
        if (!v) return '';
        const d = new Date(v);
        const p = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const toServerDateTime = (v) => {
        if (!v) return '';
        return `${v.replace('T', ' ')}:00`;
    };

    useEffect(() => {
        fetchCuentas();
        fetchPCGE();
    }, []);

    const fetchCuentas = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/bancos.php?action=listar_cuentas`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCuentas(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar cuentas');
        } finally {
            setLoading(false);
        }
    };

    const fetchPCGE = async () => {
        try {
            const res = await axios.get(`${API_URL}/caja.php?action=get_pcge`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPcge(Array.isArray(res.data) ? res.data : []);
        } catch (error) { console.error(error); }
    };

    const fetchMovimientos = async (cuentaId) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/bancos.php?action=listar_movimientos&cuenta_id=${cuentaId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMovimientos(Array.isArray(res.data) ? res.data : []);
            setSelectedMovimientos([]);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar movimientos');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectCuenta = (cuenta) => {
        setSelectedCuenta(cuenta);
        setView('detalle');
        fetchMovimientos(cuenta.id);
    };

    const handleCrearCuenta = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/bancos.php?action=crear_cuenta`, cuentaForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setActiveModal(null);
            fetchCuentas();
            toast.success('Cuenta creada exitosamente');
            setCuentaForm({ nombre_banco: '', numero_cuenta: '', tipo_cuenta: 'Corriente', moneda: 'PEN', saldo_inicial: 0, cuenta_contable: '', cci: '', titular: '', mostrar_en_pdf: false });
        } catch (error) { toast.error('Error al crear cuenta'); }
    };

    const handleEditarCuenta = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/bancos.php?action=editar_cuenta`, { ...cuentaForm, id: selectedCuenta.id }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setActiveModal(null);
            fetchCuentas();
            
            // Actualizar la cuenta seleccionada con los nuevos datos
            setSelectedCuenta({ ...selectedCuenta, ...cuentaForm });
            
            toast.success('Cuenta actualizada exitosamente');
            setCuentaForm({ nombre_banco: '', numero_cuenta: '', tipo_cuenta: 'Corriente', moneda: 'PEN', saldo_inicial: 0, cuenta_contable: '', cci: '', titular: '', mostrar_en_pdf: false });
        } catch (error) { toast.error('Error al actualizar cuenta'); }
    };

    const handleEliminarCuenta = async () => {
        if (!selectedCuenta) return;
        if (!window.confirm(`¿Estás seguro de que deseas eliminar la cuenta ${selectedCuenta.nombre_banco}? Esta acción no se puede deshacer.`)) return;

        try {
            await axios.post(`${API_URL}/bancos.php?action=eliminar_cuenta`, { id: selectedCuenta.id }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Cuenta eliminada correctamente');
            setView('dashboard');
            setSelectedCuenta(null);
            fetchCuentas();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Error al eliminar la cuenta');
        }
    };

    const openEditModal = () => {
        setCuentaForm({
            nombre_banco: selectedCuenta.nombre_banco,
            numero_cuenta: selectedCuenta.numero_cuenta,
            tipo_cuenta: selectedCuenta.tipo_cuenta,
            moneda: selectedCuenta.moneda,
            saldo_inicial: selectedCuenta.saldo_inicial, // No se usa en edit pero por si acaso
            cuenta_contable: selectedCuenta.cuenta_contable || '',
            cci: selectedCuenta.cci || '',
            titular: selectedCuenta.titular || '',
            mostrar_en_pdf: selectedCuenta.mostrar_en_pdf == 1
        });
        setActiveModal('editar_cuenta');
    };

    const handleRegistrarMovimiento = async (e) => {
        e.preventDefault();
        if(!movForm.monto || movForm.monto <= 0) return toast.error("Monto inválido");

        try {
            if (movForm.id) {
                const payload = {
                    id: movForm.id,
                    monto: movForm.monto,
                    concepto: movForm.concepto,
                    referencia: movForm.referencia,
                    entidad: movForm.entidad,
                    origen_destino: movForm.origen_destino
                };
                if (movForm.fecha) {
                    payload.fecha = toServerDateTime(movForm.fecha);
                }
                await axios.post(`${API_URL}/bancos.php?action=editar_movimiento`, payload, { headers: { Authorization: `Bearer ${token}` } });
                toast.success('Movimiento actualizado');
            } else {
                const payload = { ...movForm, cuenta_id: selectedCuenta.id };
                if (payload.fecha) {
                    payload.fecha = toServerDateTime(payload.fecha);
                }
                await axios.post(`${API_URL}/bancos.php?action=registrar_movimiento`, payload, { headers: { Authorization: `Bearer ${token}` } });
                toast.success('Movimiento registrado');
            }
            setActiveModal(null);
            fetchMovimientos(selectedCuenta.id);
            // Actualizar saldo de la cuenta seleccionada localmente o recargar cuentas
            fetchCuentas(); 
            // Actualizar selectedCuenta con el nuevo saldo (opcional, pero mejor recargar)
            const updatedCuenta = cuentas.find(c => c.id === selectedCuenta.id);
            if(updatedCuenta) setSelectedCuenta(updatedCuenta);

            setMovForm({ id: null, tipo: 'Ingreso', monto: '', concepto: '', referencia: '', entidad: '', cuenta_contable: '', origen_destino: '', fecha: '' });
        } catch (error) { toast.error('Error: ' + (error.response?.data?.message || 'Error desconocido')); }
    };

    const handleTransferencia = async (e) => {
        e.preventDefault();
        if(!transfForm.monto || transfForm.monto <= 0) return toast.error("Monto inválido");
        if(parseFloat(transfForm.monto) > parseFloat(selectedCuenta.saldo_actual)) return toast.error("Saldo insuficiente");

        try {
            const destino = cuentas.find(c => c.id == transfForm.cuenta_destino_id);
            const payload = {
                ...transfForm,
                cuenta_origen: selectedCuenta.id,
                cuenta_origen_nombre: selectedCuenta.nombre_banco,
                cuenta_destino_nombre: destino ? destino.nombre_banco : 'Externo'
            };
            if (payload.fecha) {
                payload.fecha = toServerDateTime(payload.fecha);
            }
            await axios.post(`${API_URL}/bancos.php?action=transferencia`, payload, { headers: { Authorization: `Bearer ${token}` } });
            setActiveModal(null);
            fetchMovimientos(selectedCuenta.id);
            fetchCuentas();
            toast.success('Transferencia realizada');
            setTransfForm({ cuenta_destino_id: '', monto: '', concepto: '', referencia: '', fecha: '' });
        } catch (error) { toast.error('Error al transferir'); }
    };

    const handleEmitirCheque = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/bancos.php?action=emitir_cheque`, {
                ...chequeForm,
                cuenta_id: selectedCuenta.id
            }, { headers: { Authorization: `Bearer ${token}` } });
            setActiveModal(null);
            fetchMovimientos(selectedCuenta.id);
            fetchCuentas();
            toast.success('Cheque emitido');
            setChequeForm({ numero_cheque: '', beneficiario: '', monto: '', fecha_emision: '', fecha_pago: '' });
        } catch (error) { toast.error('Error al emitir cheque'); }
    };

    const handleConciliar = async () => {
        if (selectedMovimientos.length === 0) return;
        if (!window.confirm('¿Conciliar movimientos seleccionados?')) return;
        
        try {
            await axios.post(`${API_URL}/bancos.php?action=conciliar`, {
                ids: selectedMovimientos
            }, { headers: { Authorization: `Bearer ${token}` } });
            fetchMovimientos(selectedCuenta.id);
            toast.success('Movimientos conciliados');
            setSelectedMovimientos([]);
        } catch (error) { toast.error('Error al conciliar'); }
    };

    const toggleMovimientoSelection = (id) => {
        if (selectedMovimientos.includes(id)) {
            setSelectedMovimientos(selectedMovimientos.filter(sid => sid !== id));
        } else {
            setSelectedMovimientos([...selectedMovimientos, id]);
        }
    };

    const formatCurrency = (amount, currency) => {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: currency || 'PEN' }).format(amount);
    };

    const handleExportExcel = () => {
        const dataToExport = filteredMovimientos.map(m => ({
            Fecha: new Date(m.fecha).toLocaleDateString(),
            Hora: new Date(m.fecha).toLocaleTimeString(),
            Concepto: m.concepto,
            Referencia: m.referencia || '-',
            Entidad: m.entidad || '-',
            Tipo: m.tipo,
            Monto: parseFloat(m.monto).toFixed(2),
            Estado: m.estado
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Movimientos Bancos");
        XLSX.writeFile(wb, `Banco_${selectedCuenta?.nombre_banco}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const chartData = useMemo(() => {
        return cuentas.map(c => ({
            name: c.nombre_banco,
            saldo: parseFloat(c.saldo_actual),
            moneda: c.moneda
        }));
    }, [cuentas]);

    const filteredMovimientos = movimientos.filter(m => 
        (m.concepto || '').toLowerCase().includes(searchMovimiento.toLowerCase()) ||
        (m.referencia && m.referencia.toLowerCase().includes(searchMovimiento.toLowerCase())) ||
        (m.entidad && m.entidad.toLowerCase().includes(searchMovimiento.toLowerCase()))
    );

    return (
        <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto">
            <Toaster position="top-right" />
            
            {/* Header Global */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Landmark className="w-8 h-8 text-blue-600" /> Gestión Bancaria
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gestión de cuentas bancarias y conciliaciones</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    {hasCaja && (
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button 
                                className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-white/50 transition-all flex items-center gap-2"
                                onClick={() => navigate('/caja')}
                            >
                                <Wallet size={16}/> Caja
                            </button>
                            <button 
                                className="px-4 py-2 rounded-md text-sm font-medium bg-white text-blue-600 shadow-sm transition-all flex items-center gap-2"
                            >
                                <Landmark size={16}/> Bancos
                            </button>
                        </div>
                    )}

                    {view === 'dashboard' && (
                        <button 
                            onClick={() => setActiveModal('nueva_cuenta')}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <Plus size={18}/> <span className="hidden sm:inline">Nueva Cuenta</span>
                        </button>
                    )}
                </div>
            </div>

            {/* VISTA DASHBOARD */}
            {view === 'dashboard' && (
                <>
                    {loading ? (
                        <div className="flex justify-center p-12">
                            <Loader className="w-10 h-10 text-blue-600 animate-spin"/>
                        </div>
                    ) : (
                        <div className="space-y-6 fade-in">
                            {/* Chart Section */}
                            {cuentas.length > 0 && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-4">Saldos por Cuenta</h3>
                                    <div className="h-64 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" />
                                                <YAxis />
                                                <Tooltip 
                                                    formatter={(value, name, props) => [formatCurrency(value, props.payload.moneda), 'Saldo']}
                                                />
                                                <Legend />
                                                <Bar dataKey="saldo" fill="#2563eb" name="Saldo Actual" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {cuentas.length === 0 ? (
                                <div className="col-span-full text-center p-12 bg-white rounded-xl border border-dashed border-gray-300">
                                    <Landmark size={48} className="mx-auto text-gray-300 mb-4"/>
                                    <p className="text-gray-500 mb-4">No tienes cuentas bancarias registradas</p>
                                    <button onClick={() => setActiveModal('nueva_cuenta')} className="text-blue-600 font-medium hover:underline">
                                        Crear mi primera cuenta
                                    </button>
                                </div>
                            ) : (
                                cuentas.map(cuenta => (
                                    <div 
                                        key={cuenta.id} 
                                        className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden"
                                        onClick={() => handleSelectCuenta(cuenta)}
                                    >
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Landmark size={80} className="text-blue-600"/>
                                        </div>
                                        
                                        <div className="flex justify-between items-start mb-4 relative z-10">
                                            <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                                                <Wallet size={24}/>
                                            </div>
                                            <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${cuenta.moneda === 'USD' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                                {cuenta.moneda}
                                            </span>
                                        </div>

                                        <div className="relative z-10">
                                            <h3 className="font-bold text-gray-800 text-lg truncate" title={cuenta.nombre_banco}>{cuenta.nombre_banco}</h3>
                                            <p className="text-sm text-gray-500 font-mono mb-4">{cuenta.numero_cuenta}</p>
                                            
                                            <div className="flex flex-col gap-1 mb-4">
                                                <div className="flex justify-between text-xs text-gray-500">
                                                    <span>Ingresos (Mes)</span>
                                                    <span className="text-green-600 font-medium">+{formatCurrency(cuenta.ingresos_mes || 0, cuenta.moneda)}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-gray-500">
                                                    <span>Egresos (Mes)</span>
                                                    <span className="text-red-600 font-medium">-{formatCurrency(cuenta.egresos_mes || 0, cuenta.moneda)}</span>
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t border-gray-100">
                                                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Saldo Disponible</p>
                                                <p className={`text-2xl font-bold ${parseFloat(cuenta.saldo_actual) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {formatCurrency(cuenta.saldo_actual, cuenta.moneda)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* VISTA DETALLE */}
            {view === 'detalle' && selectedCuenta && (
                <div className="flex flex-col lg:flex-row gap-6 fade-in h-full">
                    {/* Sidebar / Info Card */}
                    <div className="w-full lg:w-80 flex flex-col gap-4">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <button 
                                onClick={() => setView('dashboard')} 
                                className="flex items-center gap-2 text-gray-500 hover:text-blue-600 mb-4 transition-colors text-sm font-medium"
                            >
                                <ArrowLeft size={16}/> Volver al panel
                            </button>
                            
                            <div className="mb-6">
                                <div className="flex justify-between items-start">
                                    <h2 className="text-xl font-bold text-gray-800">{selectedCuenta.nombre_banco}</h2>
                                    <div className="flex gap-2">
                                        <button onClick={openEditModal} className="text-blue-600 hover:text-blue-800 text-xs font-medium bg-blue-50 px-2 py-1 rounded">Editar</button>
                                        <button onClick={handleEliminarCuenta} className="text-red-600 hover:text-red-800 text-xs font-medium bg-red-50 px-2 py-1 rounded">Eliminar</button>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 font-mono">{selectedCuenta.numero_cuenta}</p>
                                <span className="inline-block mt-2 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded font-medium">
                                    {selectedCuenta.tipo_cuenta} - {selectedCuenta.moneda}
                                    {isBancoNacion(selectedCuenta.nombre_banco) && (
                                        <span className="ml-2 text-amber-600 font-bold">
                                            (Cuenta de Detracciones)
                                        </span>
                                    )}
                                </span>
                            </div>

                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 mb-6">
                                <p className="text-xs text-blue-600 uppercase font-bold tracking-wider mb-1">Saldo Actual</p>
                                <p className="text-2xl font-bold text-blue-900">{formatCurrency(selectedCuenta.saldo_actual, selectedCuenta.moneda)}</p>
                            </div>

                            <div className="space-y-2">
                                <button onClick={() => { setMovForm({...movForm, tipo: 'Ingreso'}); setActiveModal('movimiento'); }} className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group">
                                    <span className="flex items-center gap-2 text-gray-700 font-medium group-hover:text-green-700"><ArrowDownLeft size={18}/> Registrar Ingreso</span>
                                </button>
                                <button onClick={() => { setMovForm({...movForm, tipo: 'Egreso'}); setActiveModal('movimiento'); }} className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-red-500 hover:bg-red-50 transition-all group">
                                    <span className="flex items-center gap-2 text-gray-700 font-medium group-hover:text-red-700"><ArrowUpRight size={18}/> Registrar Egreso</span>
                                </button>
                                <button onClick={() => setActiveModal('transferencia')} className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-amber-500 hover:bg-amber-50 transition-all group">
                                    <span className="flex items-center gap-2 text-gray-700 font-medium group-hover:text-amber-700"><Repeat size={18}/> Transferencia</span>
                                </button>
                                <button onClick={() => setActiveModal('cheque')} className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group">
                                    <span className="flex items-center gap-2 text-gray-700 font-medium group-hover:text-purple-700"><FileText size={18}/> Emitir Cheque</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Movimientos */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[500px]">
                        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <h3 className="font-bold text-gray-800">Últimos Movimientos</h3>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <div className="relative flex-grow sm:flex-grow-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    <input 
                                        type="text" 
                                        placeholder="Buscar..." 
                                        className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
                                        value={searchMovimiento}
                                        onChange={(e) => setSearchMovimiento(e.target.value)}
                                    />
                                </div>
                                {filteredMovimientos.length > 0 && (
                                    <button 
                                        onClick={handleExportExcel}
                                        className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1"
                                    >
                                        <FileSpreadsheet size={16}/> Excel
                                    </button>
                                )}
                                {selectedMovimientos.length > 0 && (
                                    <button 
                                        onClick={handleConciliar}
                                        className="bg-cyan-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors flex items-center gap-1"
                                    >
                                        <CheckCircle size={16}/> Conciliar ({selectedMovimientos.length})
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 w-10"></th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Concepto</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-center">Ref</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-right">Monto</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-center">Estado</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredMovimientos.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                                                No se encontraron movimientos
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredMovimientos.map(m => (
                                            <tr key={m.id} className="hover:bg-gray-50 group transition-colors">
                                                <td className="px-4 py-3">
                                                    {m.estado !== 'Conciliado' && (
                                                        <input 
                                                            type="checkbox" 
                                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            checked={selectedMovimientos.includes(m.id)}
                                                            onChange={() => toggleMovimientoSelection(m.id)}
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{new Date(m.fecha).toLocaleDateString()}</div>
                                                    <div className="text-xs text-gray-500">{new Date(m.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm text-gray-800 font-medium">{m.concepto}</div>
                                                    {m.entidad && <div className="text-xs text-gray-500">{m.entidad}</div>}
                                                    {m.usuario && <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><UserIcon size={10}/> {m.usuario}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {m.referencia ? (
                                                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-600">{m.referencia}</span>
                                                    ) : '-'}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-bold text-sm ${m.tipo === 'Ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {m.tipo === 'Ingreso' ? '+' : '-'} {formatCurrency(m.monto, selectedCuenta.moneda)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {m.estado === 'Conciliado' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                                                            <CheckCircle size={10}/> Conciliado
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Pendiente</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {m.estado !== 'Conciliado' && (
                                                        <div className="inline-flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                type="button"
                                                                className="p-1 rounded hover:bg-blue-50 text-blue-600"
                                                                onClick={() => {
                                                                    setMovForm({
                                                                        id: m.id,
                                                                        tipo: m.tipo,
                                                                        monto: m.monto,
                                                                        concepto: m.concepto || '',
                                                                        referencia: m.referencia || '',
                                                                        entidad: m.entidad || '',
                                                                        cuenta_contable: m.cuenta_contable || '',
                                                                        origen_destino: m.origen_destino || '',
                                                                        fecha: toDateTimeLocal(m.fecha)
                                                                    });
                                                                    setActiveModal('movimiento');
                                                                }}
                                                            >
                                                                <Edit2 size={14}/>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="p-1 rounded hover:bg-red-50 text-red-600"
                                                                onClick={async () => {
                                                                    if (!window.confirm('¿Eliminar este movimiento? Esta acción ajustará el saldo de la cuenta.')) return;
                                                                    try {
                                                                        await axios.post(`${API_URL}/bancos.php?action=eliminar_movimiento`, { id: m.id }, {
                                                                            headers: { Authorization: `Bearer ${token}` }
                                                                        });
                                                                        fetchMovimientos(selectedCuenta.id);
                                                                        fetchCuentas();
                                                                        toast.success('Movimiento eliminado');
                                                                    } catch (error) {
                                                                        toast.error(error.response?.data?.message || 'No se pudo eliminar el movimiento');
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 size={14}/>
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
                    </div>
                </div>
            )}

            {/* MODALES */}
            {activeModal === 'nueva_cuenta' && (
                <Modal title="Nueva Cuenta Bancaria" onClose={() => setActiveModal(null)}>
                    <form onSubmit={handleCrearCuenta} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Banco</label>
                            <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.nombre_banco} onChange={e => setCuentaForm({...cuentaForm, nombre_banco: e.target.value})} placeholder="Ej. BCP, BBVA"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Titular de la Cuenta</label>
                            <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.titular} onChange={e => setCuentaForm({...cuentaForm, titular: e.target.value})} placeholder="Nombre del titular"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Número de Cuenta</label>
                                <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.numero_cuenta} onChange={e => setCuentaForm({...cuentaForm, numero_cuenta: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">CCI</label>
                                <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.cci} onChange={e => setCuentaForm({...cuentaForm, cci: e.target.value})}/>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select className="w-full px-3 py-2 border rounded-lg outline-none" value={cuentaForm.tipo_cuenta} onChange={e => setCuentaForm({...cuentaForm, tipo_cuenta: e.target.value})}>
                                    <option value="Corriente">Corriente</option>
                                    <option value="Ahorros">Ahorros</option>
                                    <option value="Maestra">Maestra</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                                <select className="w-full px-3 py-2 border rounded-lg outline-none" value={cuentaForm.moneda} onChange={e => setCuentaForm({...cuentaForm, moneda: e.target.value})}>
                                    <option value="PEN">Soles (PEN)</option>
                                    <option value="USD">Dólares (USD)</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial</label>
                            <input type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg outline-none" value={cuentaForm.saldo_inicial} onChange={e => setCuentaForm({...cuentaForm, saldo_inicial: e.target.value})}/>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="mostrar_pdf" className="rounded text-blue-600 focus:ring-blue-500" checked={cuentaForm.mostrar_en_pdf} onChange={e => setCuentaForm({...cuentaForm, mostrar_en_pdf: e.target.checked})}/>
                            <label htmlFor="mostrar_pdf" className="text-sm text-gray-700">Mostrar en PDF (Facturas/Cotizaciones)</label>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">Crear Cuenta</button>
                    </form>
                </Modal>
            )}

            {activeModal === 'editar_cuenta' && (
                <Modal title="Editar Cuenta Bancaria" onClose={() => setActiveModal(null)}>
                    <form onSubmit={handleEditarCuenta} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Banco</label>
                            <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.nombre_banco} onChange={e => setCuentaForm({...cuentaForm, nombre_banco: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Titular de la Cuenta</label>
                            <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.titular} onChange={e => setCuentaForm({...cuentaForm, titular: e.target.value})}/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Número de Cuenta</label>
                                <input type="text" required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.numero_cuenta} onChange={e => setCuentaForm({...cuentaForm, numero_cuenta: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">CCI</label>
                                <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={cuentaForm.cci} onChange={e => setCuentaForm({...cuentaForm, cci: e.target.value})}/>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select className="w-full px-3 py-2 border rounded-lg outline-none" value={cuentaForm.tipo_cuenta} onChange={e => setCuentaForm({...cuentaForm, tipo_cuenta: e.target.value})}>
                                    <option value="Corriente">Corriente</option>
                                    <option value="Ahorros">Ahorros</option>
                                    <option value="Maestra">Maestra</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                                <select className="w-full px-3 py-2 border rounded-lg outline-none" value={cuentaForm.moneda} onChange={e => setCuentaForm({...cuentaForm, moneda: e.target.value})}>
                                    <option value="PEN">Soles (PEN)</option>
                                    <option value="USD">Dólares (USD)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="mostrar_pdf_edit" className="rounded text-blue-600 focus:ring-blue-500" checked={cuentaForm.mostrar_en_pdf} onChange={e => setCuentaForm({...cuentaForm, mostrar_en_pdf: e.target.checked})}/>
                            <label htmlFor="mostrar_pdf_edit" className="text-sm text-gray-700">Mostrar en PDF (Facturas/Cotizaciones)</label>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">Guardar Cambios</button>
                    </form>
                </Modal>
            )}

            {activeModal === 'movimiento' && (
                <Modal title={`${movForm.id ? 'Editar' : 'Registrar'} ${movForm.tipo}`} onClose={() => setActiveModal(null)}>
                    <form onSubmit={handleRegistrarMovimiento} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{selectedCuenta.moneda === 'PEN' ? 'S/' : '$'}</span>
                                <input type="number" step="0.01" required className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold" value={movForm.monto} onChange={e => setMovForm({...movForm, monto: e.target.value})}/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                            <input type="text" required className="w-full px-3 py-2 border rounded-lg outline-none" value={movForm.concepto} onChange={e => setMovForm({...movForm, concepto: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Entidad (Opcional)</label>
                            <input type="text" className="w-full px-3 py-2 border rounded-lg outline-none" placeholder="Cliente o Proveedor" value={movForm.entidad} onChange={e => setMovForm({...movForm, entidad: e.target.value})}/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                                <input type="text" className="w-full px-3 py-2 border rounded-lg outline-none" placeholder="Nro Operación" value={movForm.referencia} onChange={e => setMovForm({...movForm, referencia: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Contable</label>
                                <select className="w-full px-3 py-2 border rounded-lg outline-none" value={movForm.cuenta_contable} onChange={e => setMovForm({...movForm, cuenta_contable: e.target.value})}>
                                    <option value="">Seleccionar...</option>
                                    {pcge.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} - {c.nombre}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                            <input type="datetime-local" className="w-full px-3 py-2 border rounded-lg outline-none" value={movForm.fecha || ''} onChange={e => setMovForm({...movForm, fecha: e.target.value})}/>
                        </div>
                        <button type="submit" className={`w-full text-white py-2 rounded-lg font-medium transition-colors ${movForm.id ? 'bg-blue-600 hover:bg-blue-700' : (movForm.tipo === 'Ingreso' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}`}>
                            {movForm.id ? 'Guardar Cambios' : `Registrar ${movForm.tipo}`}
                        </button>
                    </form>
                </Modal>
            )}

            {activeModal === 'transferencia' && (
                <Modal title="Transferencia entre Cuentas" onClose={() => setActiveModal(null)}>
                    <form onSubmit={handleTransferencia} className="space-y-4">
                         <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm mb-4">
                            Desde: <strong>{selectedCuenta.nombre_banco}</strong> ({selectedCuenta.moneda})
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Destino</label>
                            <select required className="w-full px-3 py-2 border rounded-lg outline-none" value={transfForm.cuenta_destino_id} onChange={e => setTransfForm({...transfForm, cuenta_destino_id: e.target.value})}>
                                <option value="">Seleccione cuenta...</option>
                                {cuentas.filter(c => c.id !== selectedCuenta.id && c.moneda === selectedCuenta.moneda).map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre_banco} - {c.numero_cuenta}</option>
                                ))}
                            </select>
                            {cuentas.filter(c => c.id !== selectedCuenta.id && c.moneda === selectedCuenta.moneda).length === 0 && (
                                <p className="text-xs text-red-500 mt-1">No hay otras cuentas con la misma moneda</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Monto a Transferir</label>
                            <input type="number" step="0.01" required className="w-full px-3 py-2 border rounded-lg outline-none font-bold" value={transfForm.monto} onChange={e => setTransfForm({...transfForm, monto: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                            <input type="datetime-local" className="w-full px-3 py-2 border rounded-lg outline-none" value={transfForm.fecha || ''} onChange={e => setTransfForm({...transfForm, fecha: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                            <input type="text" className="w-full px-3 py-2 border rounded-lg outline-none" value={transfForm.referencia} onChange={e => setTransfForm({...transfForm, referencia: e.target.value})}/>
                        </div>
                        <button type="submit" className="w-full bg-amber-500 text-white py-2 rounded-lg font-medium hover:bg-amber-600 transition-colors">Realizar Transferencia</button>
                    </form>
                </Modal>
            )}

            {activeModal === 'cheque' && (
                <Modal title="Emitir Cheque" onClose={() => setActiveModal(null)}>
                    <form onSubmit={handleEmitirCheque} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Número Cheque</label>
                                <input type="text" required className="w-full px-3 py-2 border rounded-lg outline-none" value={chequeForm.numero_cheque} onChange={e => setChequeForm({...chequeForm, numero_cheque: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                                <input type="number" step="0.01" required className="w-full px-3 py-2 border rounded-lg outline-none font-bold" value={chequeForm.monto} onChange={e => setChequeForm({...chequeForm, monto: e.target.value})}/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Beneficiario</label>
                            <input type="text" required className="w-full px-3 py-2 border rounded-lg outline-none" value={chequeForm.beneficiario} onChange={e => setChequeForm({...chequeForm, beneficiario: e.target.value})}/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Emisión</label>
                                <input type="date" required className="w-full px-3 py-2 border rounded-lg outline-none" value={chequeForm.fecha_emision} onChange={e => setChequeForm({...chequeForm, fecha_emision: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Pago</label>
                                <input type="date" required className="w-full px-3 py-2 border rounded-lg outline-none" value={chequeForm.fecha_pago} onChange={e => setChequeForm({...chequeForm, fecha_pago: e.target.value})}/>
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors">Emitir Cheque</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

// Componente auxiliar Modal
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                <h3 className="font-bold text-gray-800">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X size={20}/>
                </button>
            </div>
            <div className="p-6">
                {children}
            </div>
        </div>
    </div>
);

export default Bancos;
