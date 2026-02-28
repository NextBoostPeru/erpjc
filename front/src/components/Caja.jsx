import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend 
} from 'recharts';
import { API_URL } from '../api/config';
import { 
    DollarSign, ArrowUpCircle, ArrowDownCircle, Lock, Unlock, 
    History, AlertTriangle, Plus, X, Wallet, TrendingUp, TrendingDown,
    FileSpreadsheet, Users, Landmark, Download, Edit, Trash2
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const Caja = () => {
    const navigate = useNavigate();
    const [sesion, setSesion] = useState(null);
    const [movimientos, setMovimientos] = useState([]);
    const [historial, setHistorial] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cuentasPCGE, setCuentasPCGE] = useState([]);
    const [colaboradores, setColaboradores] = useState([]);
    const [view, setView] = useState('dashboard'); // dashboard, historial
    const [resumen, setResumen] = useState({ ingresos: 0, egresos: 0, saldo: 0 });
    const [activeModal, setActiveModal] = useState(null); // 'movimiento', 'cierre', null
    const [usuarios, setUsuarios] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    // Forms state
    const [montoInicial, setMontoInicial] = useState('');
    const [movimientoForm, setMovimientoForm] = useState({ tipo: 'Ingreso', monto: '', concepto: '', referencia: '', receptor: '', cuenta_contable: '' });
    const [cierreForm, setCierreForm] = useState({ monto_final: '', observaciones: '' });
    
    const token = localStorage.getItem('token');
    const modulos = JSON.parse(localStorage.getItem('modulos')) || [];
    const hasBancos = modulos.some(m => m.codigo === 'bancos');

    useEffect(() => {
        fetchCuentasPCGE();
        fetchColaboradores();
        fetchUsuarios();
    }, []);

    useEffect(() => {
        fetchEstadoCaja();
        if (view === 'historial') fetchHistorial();
    }, [selectedUser]);

    const fetchUsuarios = async () => {
        try {
            const res = await axios.get(`${API_URL}/usuarios.php`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsuarios(Array.isArray(res.data.users) ? res.data.users : []);
        } catch (error) {
            console.error("Error cargando usuarios:", error);
        }
    };

    const fetchCuentasPCGE = async () => {
        try {
            const res = await axios.get(`${API_URL}/caja.php?action=get_pcge`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCuentasPCGE(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error("Error cargando cuentas PCGE:", error);
            setCuentasPCGE([]);
        }
    };

    const fetchColaboradores = async () => {
        try {
            const res = await axios.get(`${API_URL}/colaboradores.php?page=1&limit=200`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const list = Array.isArray(res.data?.data) ? res.data.data : [];
            setColaboradores(list);
        } catch (error) {
            console.error("Error cargando colaboradores:", error);
            setColaboradores([]);
        }
    };

    const fetchEstadoCaja = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/caja.php?action=estado&t=${new Date().getTime()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.data && res.data.estado === 'Abierta') {
                setSesion(res.data.sesion);
                setResumen({
                    ingresos: parseFloat(res.data.totales?.ingresos || 0),
                    egresos: parseFloat(res.data.totales?.egresos || 0),
                    saldo: parseFloat(res.data.saldo_actual || 0)
                });
                fetchMovimientos();
            } else {
                setSesion(null);
            }
        } catch (error) {
            console.error("Error cargando estado caja:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMovimientos = async () => {
        try {
            const res = await axios.get(`${API_URL}/caja.php?action=listar_movimientos&t=${new Date().getTime()}&user_id=${selectedUser}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMovimientos(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error("Error cargando movimientos:", error);
            setMovimientos([]);
        }
    };

    const fetchHistorial = async () => {
        try {
            const res = await axios.get(`${API_URL}/caja.php?action=historial_sesiones&t=${new Date().getTime()}&user_id=${selectedUser}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setHistorial(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error("Error cargando historial:", error);
            setHistorial([]);
        }
    };

    const handleAbrirCaja = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${API_URL}/caja.php?action=abrir`, {
                monto_inicial: montoInicial
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            // Actualización optimista
            if (res.data && res.data.sesion) {
                setSesion(res.data.sesion);
                setResumen({
                    ingresos: 0,
                    egresos: 0,
                    saldo: parseFloat(res.data.sesion.monto_inicial || 0)
                });
                setMovimientos([]); 
                setMontoInicial('');
                setView('dashboard');
            } else {
                // Fallback: Si no recibimos la sesión, recargamos la página para forzar la actualización
                window.location.reload();
            }
        } catch (error) {
            toast.error('Error al abrir caja: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleRegistrarMovimiento = async (e) => {
        e.preventDefault();
        try {
            const endpoint = movimientoForm.id ? 'editar_movimiento' : 'movimiento';
            await axios.post(`${API_URL}/caja.php?action=${endpoint}`, movimientoForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            toast.success(movimientoForm.id ? 'Movimiento actualizado' : 'Movimiento registrado');
            setMovimientoForm({ tipo: 'Ingreso', monto: '', concepto: '', referencia: '', receptor: '', cuenta_contable: '' });
            setActiveModal(null);
            fetchEstadoCaja(); 
            fetchMovimientos();
        } catch (error) {
            toast.error('Error: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleEditarMovimiento = (mov) => {
        setMovimientoForm({
            id: mov.id,
            tipo: mov.tipo,
            monto: mov.monto,
            concepto: mov.concepto,
            referencia: mov.referencia || '',
            receptor: mov.receptor || '',
            cuenta_contable: mov.cuenta_contable || ''
        });
        setActiveModal('movimiento');
    };

    const handleEliminarMovimiento = async (id) => {
        if (!window.confirm('¿Está seguro de eliminar este movimiento?')) return;
        try {
            await axios.post(`${API_URL}/caja.php?action=eliminar_movimiento`, { id }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Movimiento eliminado');
            fetchEstadoCaja();
            fetchMovimientos();
        } catch (error) {
            toast.error('Error al eliminar: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleCerrarCaja = async (e) => {
        e.preventDefault();
        if (!window.confirm('¿Está seguro de cerrar la caja? Esta acción no se puede deshacer.')) return;
        
        try {
            const res = await axios.post(`${API_URL}/caja.php?action=cerrar`, {
                sesion_id: sesion.id,
                monto_final: cierreForm.monto_final,
                observaciones: cierreForm.observaciones
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            toast.success(`Caja cerrada. Diferencia: ${res.data.diferencia}`);
            setSesion(null);
            setCierreForm({ monto_final: '', observaciones: '' });
            setActiveModal(null);
            fetchEstadoCaja();
        } catch (error) {
            toast.error('Error al cerrar caja: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleExportExcel = () => {
        const dataToExport = movimientos.map(m => ({
            Fecha: new Date(m.fecha).toLocaleDateString(),
            Hora: new Date(m.fecha).toLocaleTimeString(),
            Tipo: m.tipo,
            Concepto: m.concepto,
            Referencia: m.referencia || '-',
            Monto: parseFloat(m.monto).toFixed(2),
            Receptor: m.receptor || '-'
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Movimientos Caja");
        XLSX.writeFile(wb, `Caja_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const chartData = useMemo(() => {
        return [
            { name: 'Ingresos', value: resumen.ingresos, color: '#16a34a' },
            { name: 'Egresos', value: resumen.egresos, color: '#dc2626' }
        ].filter(d => d.value > 0);
    }, [resumen]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(amount);
    };

    // Pagination logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentMovimientos = movimientos.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(movimientos.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    const handleExportarExcel = () => {
        if (!movimientos.length) {
            toast.error('No hay movimientos para exportar');
            return;
        }

        const data = movimientos.map(m => ({
            Fecha: new Date(m.fecha).toLocaleDateString(),
            Hora: new Date(m.fecha).toLocaleTimeString(),
            Tipo: m.tipo,
            Concepto: m.concepto,
            Referencia: m.referencia || '',
            Receptor: m.receptor || '',
            Usuario: m.nombre_real || m.usuario_nombre || 'Sistema',
            Monto: parseFloat(m.monto).toFixed(2),
            Cuenta: m.cuenta_contable || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
        XLSX.writeFile(wb, `Caja_Movimientos_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (loading && !sesion) return <div className="p-4 text-center text-muted">Cargando módulo de caja...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 fade-in">
            <Toaster position="top-right" />
            
            {/* Navegación Unificada de Tesorería */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Wallet size={32} className="text-blue-600" /> Control de Efectivo
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gestión de caja chica y movimientos en efectivo</p>
                </div>
                
                {hasBancos && (
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            className="px-4 py-2 rounded-md text-sm font-medium bg-white text-blue-600 shadow-sm transition-all flex items-center gap-2"
                        >
                            <Wallet size={16}/> Caja
                        </button>
                        <button 
                            className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-white/50 transition-all flex items-center gap-2"
                            onClick={() => navigate('/bancos')}
                        >
                            <Landmark size={16}/> Bancos
                        </button>
                    </div>
                )}
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                     <button 
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`} 
                        onClick={() => setView('dashboard')}
                    >
                        <DollarSign size={16}/> Panel Principal
                    </button>
                    <button 
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${view === 'historial' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`} 
                        onClick={() => { setView('historial'); fetchHistorial(); }}
                    >
                        <History size={16}/> Historial de Cierres
                    </button>
                </div>
                
                {/* User Filter */}
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 font-medium flex items-center gap-1"><Users size={16}/> Filtrar:</span>
                    <select 
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                    >
                        <option value="">-- Mi Caja --</option>
                        <option value="all">Todos los usuarios (Hoy)</option>
                        {usuarios.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.nombre_real || u.usuario}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Status Bar */}
            {sesion && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">Sesión Activa</div>
                        <small className="text-gray-500">Abierta el: {new Date(sesion.fecha_apertura).toLocaleString()}</small>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {movimientos.length > 0 && (
                            <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-medium shadow-sm" onClick={handleExportExcel}>
                                <FileSpreadsheet size={16}/> Exportar Excel
                            </button>
                        )}
                         <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium shadow-sm" onClick={() => {
                             setMovimientoForm({...movimientoForm, tipo: 'Ingreso'});
                             setActiveModal('movimiento');
                         }}>
                            <Plus size={16}/> Registrar Ingreso
                         </button>
                         <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-medium shadow-sm" onClick={() => {
                             setMovimientoForm({...movimientoForm, tipo: 'Egreso'});
                             setActiveModal('movimiento');
                         }}>
                            <ArrowDownCircle size={16}/> Registrar Egreso
                         </button>
                         <button className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2 font-medium shadow-sm" onClick={() => setActiveModal('cierre')}>
                            <Lock size={16}/> Cerrar Caja
                         </button>
                    </div>
                </div>
            )}

            <div className="module-content">
                {view === 'dashboard' && (
                    <>
                        {!sesion ? (
                            <div className="flex items-center justify-center min-h-[60vh]">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center p-8 w-full max-w-lg">
                                    <div className="mb-4 text-blue-600 flex justify-center">
                                        <Lock size={64} />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-800 mb-2">Apertura de Caja</h3>
                                    <p className="text-gray-500 mb-6">Inicie una nueva sesión para comenzar a registrar movimientos.</p>
                                    <form onSubmit={handleAbrirCaja}>
                                        <div className="text-left mb-4">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Monto Inicial (S/)</label>
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg outline-none transition-all" 
                                                value={montoInicial}
                                                onChange={e => setMontoInicial(e.target.value)}
                                                placeholder="0.00"
                                                required
                                            />
                                        </div>
                                        <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg flex items-center justify-center gap-2">
                                            <Unlock size={18} /> Abrir Caja
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h2 className="mb-4 text-gray-600 font-semibold text-lg">Resumen Financiero del Día</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                        <div className="flex items-center gap-2 mb-2 text-gray-500 font-semibold">
                                            <Wallet size={18}/> Saldo Inicial
                                        </div>
                                        <div className="text-gray-800 text-2xl font-bold">{formatCurrency(sesion.monto_inicial)}</div>
                                    </div>
                                    <div className="bg-green-50 rounded-xl shadow-sm border border-green-100 p-6">
                                        <div className="flex items-center gap-2 mb-2 text-green-700 font-semibold">
                                            <TrendingUp size={18}/> Ingresos
                                        </div>
                                        <div className="text-green-700 text-2xl font-bold">{formatCurrency(resumen.ingresos)}</div>
                                    </div>
                                    <div className="bg-red-50 rounded-xl shadow-sm border border-red-100 p-6">
                                        <div className="flex items-center gap-2 mb-2 text-red-700 font-semibold">
                                            <TrendingDown size={18}/> Egresos
                                        </div>
                                        <div className="text-red-700 text-2xl font-bold">{formatCurrency(resumen.egresos)}</div>
                                    </div>
                                    <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-6 text-white">
                                        <div className="flex items-center gap-2 mb-2 text-gray-300 font-semibold">
                                            <DollarSign size={18}/> Saldo Actual
                                        </div>
                                        <div className="text-white text-2xl font-bold">{formatCurrency(resumen.saldo)}</div>
                                    </div>
                                </div>

                                {/* Charts Section */}
                                {chartData.length > 0 && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribución de Movimientos</h3>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={chartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {chartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                                    <Legend />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <h3 className="m-0 font-semibold text-gray-800">Movimientos Recientes</h3>
                                            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{movimientos.length} registros</span>
                                        </div>
                                        <button 
                                            onClick={handleExportarExcel}
                                            className="text-gray-500 hover:text-green-600 transition-colors p-1 rounded hover:bg-green-50"
                                            title="Exportar a Excel"
                                        >
                                            <Download size={20} />
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3">Fecha</th>
                                                    <th className="px-6 py-3">Hora</th>
                                                    <th className="px-6 py-3">Tipo</th>
                                                    <th className="px-6 py-3">Concepto</th>
                                                    <th className="px-6 py-3">Referencia</th>
                                                    <th className="px-6 py-3">Receptor</th>
                                                    <th className="px-6 py-3">Usuario</th>
                                                    <th className="px-6 py-3 text-right">Monto</th>
                                                    <th className="px-6 py-3 text-center">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {currentMovimientos.map(mov => (
                                                    <tr key={mov.id} className="bg-white border-b hover:bg-gray-50">
                                                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{new Date(mov.fecha).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{new Date(mov.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${mov.tipo === 'Ingreso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                                {mov.tipo}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4">{mov.concepto}</td>
                                                        <td className="px-6 py-4">{mov.referencia || '-'}</td>
                                                        <td className="px-6 py-4">{mov.receptor || '-'}</td>
                                                        <td className="px-6 py-4 text-xs text-gray-500">{mov.nombre_real || mov.usuario_nombre || 'Sistema'}</td>
                                                        <td className="px-6 py-4 text-right font-bold">
                                                            {mov.tipo === 'Egreso' ? '-' : '+'} {formatCurrency(mov.monto)}
                                                        </td>
                                                        <td className="px-6 py-4 flex justify-center gap-2">
                                                            <button onClick={() => handleEditarMovimiento(mov)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" title="Editar">
                                                                <Edit size={16} />
                                                            </button>
                                                            <button onClick={() => handleEliminarMovimiento(mov.id)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50" title="Eliminar">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {movimientos.length === 0 && (
                                                    <tr><td colSpan="8" className="text-center p-8 text-gray-500">No hay movimientos registrados hoy</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {totalPages > 1 && (
                                        <div className="flex justify-between items-center p-4 bg-gray-50 border-t border-gray-100">
                                            <span className="text-xs text-gray-500">
                                                Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, movimientos.length)} de {movimientos.length} registros
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => paginate(currentPage - 1)}
                                                    disabled={currentPage === 1}
                                                    className={`px-3 py-1 rounded-md text-xs font-medium ${currentPage === 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 shadow-sm'}`}
                                                >
                                                    Anterior
                                                </button>
                                                <span className="text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded border border-gray-200">
                                                    {currentPage} / {totalPages}
                                                </span>
                                                <button
                                                    onClick={() => paginate(currentPage + 1)}
                                                    disabled={currentPage === totalPages}
                                                    className={`px-3 py-1 rounded-md text-xs font-medium ${currentPage === totalPages ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 shadow-sm'}`}
                                                >
                                                    Siguiente
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </>
                )}

                {view === 'historial' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                             <h3 className="m-0 text-lg font-semibold text-gray-800">Historial de Cierres</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3">Fecha Apertura</th>
                                        <th className="px-6 py-3">Fecha Cierre</th>
                                        <th className="px-6 py-3">Inicial</th>
                                        <th className="px-6 py-3">Sistema</th>
                                        <th className="px-6 py-3">Real</th>
                                        <th className="px-6 py-3">Diferencia</th>
                                        <th className="px-6 py-3">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historial.map(h => (
                                        <tr key={h.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4">{new Date(h.fecha_apertura).toLocaleString()}</td>
                                            <td className="px-6 py-4">{h.fecha_cierre ? new Date(h.fecha_cierre).toLocaleString() : '-'}</td>
                                            <td className="px-6 py-4">{formatCurrency(h.monto_inicial)}</td>
                                            <td className="px-6 py-4">{h.monto_sistema ? formatCurrency(h.monto_sistema) : '-'}</td>
                                            <td className="px-6 py-4">{h.monto_final ? formatCurrency(h.monto_final) : '-'}</td>
                                            <td className={`px-6 py-4 font-bold ${parseFloat(h.diferencia) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {h.diferencia ? formatCurrency(h.diferencia) : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${h.estado === 'Abierta' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                                    {h.estado}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {historial.length === 0 && (
                                        <tr><td colSpan="7" className="text-center p-8 text-gray-500">No hay historial disponible</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Movimiento */}
            {activeModal === 'movimiento' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all scale-100">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">Registrar {movimientoForm.tipo}</h3>
                            <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setActiveModal(null)}><X size={24}/></button>
                        </div>
                        <form onSubmit={handleRegistrarMovimiento}>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">Monto</label>
                                    <div className="relative">
                                        <input 
                                            type="number" step="0.01" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            value={movimientoForm.monto}
                                            onChange={e => setMovimientoForm({...movimientoForm, monto: e.target.value})}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">Tipo</label>
                                    <select 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                                        value={movimientoForm.tipo}
                                        onChange={e => setMovimientoForm({...movimientoForm, tipo: e.target.value})}
                                    >
                                        <option value="Ingreso">Ingreso</option>
                                        <option value="Egreso">Egreso</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">Referencia</label>
                                    <input 
                                        type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        value={movimientoForm.referencia}
                                        onChange={e => setMovimientoForm({...movimientoForm, referencia: e.target.value})}
                                        placeholder="Ej. Recibo 001-123"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">Receptor</label>
                                    <select 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                                        value={movimientoForm.receptor}
                                        onChange={e => setMovimientoForm({...movimientoForm, receptor: e.target.value})}
                                    >
                                        <option value="">-- Seleccione colaborador --</option>
                                        {colaboradores.map(c => {
                                            const nombre = `${c.nombres} ${c.apellidos}`.trim();
                                            return (
                                                <option key={c.id} value={nombre}>
                                                    {nombre} {c.documento_numero ? `- ${c.documento_numero}` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Concepto</label>
                                    <input 
                                        type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        value={movimientoForm.concepto}
                                        onChange={e => setMovimientoForm({...movimientoForm, concepto: e.target.value})}
                                        required
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Cuenta Contable (Opcional)</label>
                                    <select 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                                        value={movimientoForm.cuenta_contable}
                                        onChange={e => setMovimientoForm({...movimientoForm, cuenta_contable: e.target.value})}
                                    >
                                        <option value="">-- Sin integración --</option>
                                        {cuentasPCGE.map(c => (
                                            <option key={c.codigo} value={c.codigo}>
                                                {c.codigo} - {c.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button type="button" className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors" onClick={() => setActiveModal(null)}>Cancelar</button>
                                <button type="submit" className={`px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors flex items-center gap-2 font-medium shadow-sm ${movimientoForm.tipo === 'Ingreso' ? 'bg-green-600' : 'bg-red-600'}`}>
                                    {movimientoForm.tipo === 'Ingreso' ? <Plus size={18}/> : <ArrowDownCircle size={18}/>} {movimientoForm.id ? 'Actualizar' : 'Guardar'} Movimiento
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Cierre */}
            {activeModal === 'cierre' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Lock size={20}/> Cerrar Caja</h3>
                            <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setActiveModal(null)}><X size={24}/></button>
                        </div>
                        <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 flex items-center gap-2 text-sm mx-6 mt-6">
                            <AlertTriangle size={16}/> Se comparará el saldo del sistema con el efectivo real.
                        </div>
                        <form onSubmit={handleCerrarCaja}>
                            <div className="p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">Monto en Efectivo (Real)</label>
                                    <input 
                                        type="number" step="0.01" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        value={cierreForm.monto_final}
                                        onChange={e => setCierreForm({...cierreForm, monto_final: e.target.value})}
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">Observaciones</label>
                                    <textarea 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        rows="3"
                                        value={cierreForm.observaciones}
                                        onChange={e => setCierreForm({...cierreForm, observaciones: e.target.value})}
                                    ></textarea>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button type="button" className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors" onClick={() => setActiveModal(null)}>Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2 font-medium shadow-sm">
                                    <Lock size={18}/> Confirmar Cierre
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Caja;
