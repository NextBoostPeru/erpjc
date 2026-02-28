import React, { useState, useEffect } from 'react';
import { Upload, Check, AlertTriangle, FileText, ArrowRight, RefreshCw } from 'lucide-react';
import { read, utils } from 'xlsx';
import axios from 'axios';
import { API_URL } from '../api/config';
import toast from 'react-hot-toast';

const ConciliacionBancaria = () => {
    const [step, setStep] = useState(1);
    const [file, setFile] = useState(null);
    const [conciliando, setConciliando] = useState(false);
    
    const [cuentas, setCuentas] = useState([]);
    const [selectedCuenta, setSelectedCuenta] = useState('');
    
    const [movimientosBanco, setMovimientosBanco] = useState([]);
    const [resultadoConciliacion, setResultadoConciliacion] = useState({
        conciliados: [],
        pendientes_banco: [],
        pendientes_sistema: []
    });

    useEffect(() => {
        fetchCuentas();
    }, []);

    const fetchCuentas = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}api/bancos.php?action=listar_cuentas`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCuentas(response.data);
        } catch (error) {
            console.error("Error loading accounts", error);
            toast.error("Error al cargar cuentas bancarias");
        }
    };

    const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files[0];
        setFile(uploadedFile);
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const wb = read(event.target.result, { type: 'binary' });
                const sheets = wb.SheetNames;
                if (sheets.length) {
                    const rows = utils.sheet_to_json(wb.Sheets[sheets[0]]);
                    // Normalize keys
                    const formatted = rows.map(r => ({
                        fecha: r.Fecha || r.Date || r.FECHA,
                        desc: r.Descripcion || r.Description || r.DESCRIPCION || r.Concepto,
                        monto: r.Monto || r.Amount || r.MONTO || r.Valor,
                        ref: r.Referencia || r.Ref || r.REFERENCIA || ''
                    })).filter(r => r.fecha && r.monto); // Basic validation
                    
                    setMovimientosBanco(formatted);
                    toast.success(`${formatted.length} movimientos cargados`);
                    setTimeout(() => setStep(2), 500);
                }
            } catch (error) {
                console.error("Error parsing file", error);
                toast.error("Error al procesar archivo");
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    const realizarConciliacion = async () => {
        if (!selectedCuenta) {
            toast.error("Seleccione una cuenta bancaria");
            return;
        }
        
        setConciliando(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(`${API_URL}conciliacion_bancaria.php?action=conciliar`, {
                cuenta_id: selectedCuenta,
                movimientos_banco: movimientosBanco
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setResultadoConciliacion(response.data); // Adjust based on actual API response structure
            setStep(3); // Go to results view
            toast.success("Conciliación completada");
        } catch (error) {
            console.error("Conciliation error", error);
            toast.error("Error en la conciliación");
        } finally {
            setConciliando(false);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <FileText className="text-green-600" /> Conciliación Bancaria Automática
            </h1>

            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className={`p-4 rounded-xl border-2 ${step === 1 ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                    <h3 className="font-bold text-lg">1. Carga de Extracto</h3>
                    <p className="text-sm text-gray-500">Sube el Excel o TXT del banco</p>
                </div>
                <div className={`p-4 rounded-xl border-2 ${step === 2 ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                    <h3 className="font-bold text-lg">2. Revisión Previa</h3>
                    <p className="text-sm text-gray-500">Verifica los datos cargados</p>
                </div>
                <div className={`p-4 rounded-xl border-2 ${step === 3 ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                    <h3 className="font-bold text-lg">3. Resultados</h3>
                    <p className="text-sm text-gray-500">Cruces y diferencias</p>
                </div>
            </div>

            {step === 1 && (
                <div className="bg-white p-10 rounded-2xl shadow-sm border border-dashed border-gray-300 text-center">
                    <div className="mb-6 max-w-md mx-auto text-left">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Bancaria a Conciliar</label>
                        <select 
                            className="w-full border rounded-lg px-3 py-2"
                            value={selectedCuenta}
                            onChange={(e) => setSelectedCuenta(e.target.value)}
                        >
                            <option value="">-- Seleccione Cuenta --</option>
                            {cuentas.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.nombre_banco} - {c.numero_cuenta} ({c.moneda})
                                </option>
                            ))}
                        </select>
                    </div>

                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">Sube tu extracto bancario</h3>
                    <p className="text-gray-500 mb-6">Formatos soportados: .xlsx, .csv</p>
                    <input 
                        type="file" 
                        className="hidden" 
                        id="file-upload"
                        onChange={handleFileUpload}
                        accept=".xlsx, .xls, .csv"
                        disabled={!selectedCuenta}
                    />
                    <label 
                        htmlFor="file-upload"
                        className={`px-6 py-2 rounded-lg cursor-pointer transition-colors ${
                            !selectedCuenta ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        Seleccionar Archivo
                    </label>
                    {!selectedCuenta && <p className="text-red-500 text-xs mt-2">Seleccione una cuenta primero</p>}
                </div>
            )}

            {step === 2 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-lg mb-4">Vista Previa de Importación</h3>
                    <p className="text-sm text-gray-500 mb-4">Se han detectado {movimientosBanco.length} movimientos.</p>
                    
                    <div className="max-h-60 overflow-y-auto border rounded mb-6">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="p-2">Fecha</th>
                                    <th className="p-2">Descripción</th>
                                    <th className="p-2 text-right">Monto</th>
                                    <th className="p-2">Ref</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {movimientosBanco.map((m, i) => (
                                    <tr key={i}>
                                        <td className="p-2">{m.fecha}</td>
                                        <td className="p-2">{m.desc}</td>
                                        <td className={`p-2 text-right font-bold ${m.monto < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {m.monto}
                                        </td>
                                        <td className="p-2 text-xs text-gray-500">{m.ref}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setStep(1)} className="text-gray-600 hover:underline">Atrás</button>
                        <button 
                            onClick={realizarConciliacion}
                            disabled={conciliando}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                        >
                            {conciliando ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
                            Confirmar y Conciliar
                        </button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-lg">Resultado del Cruce</h3>
                        <div className="flex gap-2">
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">
                                {resultadoConciliacion.conciliados?.length || 0} Conciliados
                            </span>
                            <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-bold">
                                {(resultadoConciliacion.pendientes_banco?.length || 0) + (resultadoConciliacion.pendientes_sistema?.length || 0)} Pendientes
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <h4 className="font-bold text-gray-500 mb-4 uppercase text-xs">Pendientes en Banco (No en Sistema)</h4>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {resultadoConciliacion.pendientes_banco?.map((mov, i) => (
                                    <div key={i} className="p-3 bg-red-50 rounded border border-red-100 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-sm">{mov.desc}</p>
                                            <p className="text-xs text-gray-500">{mov.ref} | {mov.fecha}</p>
                                        </div>
                                        <span className="font-bold">{mov.monto}</span>
                                    </div>
                                ))}
                                {resultadoConciliacion.pendientes_banco?.length === 0 && <p className="text-gray-400 text-sm">Ninguno</p>}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-gray-500 mb-4 uppercase text-xs">Pendientes en Sistema (No en Banco)</h4>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {resultadoConciliacion.pendientes_sistema?.map((mov, i) => (
                                    <div key={i} className="p-3 bg-orange-50 rounded border border-orange-100 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-sm">{mov.concepto}</p>
                                            <p className="text-xs text-gray-500">{mov.referencia} | {mov.fecha}</p>
                                        </div>
                                        <span className="font-bold">{mov.monto}</span>
                                    </div>
                                ))}
                                {resultadoConciliacion.pendientes_sistema?.length === 0 && <p className="text-gray-400 text-sm">Ninguno</p>}
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t flex justify-end">
                         <button 
                            onClick={() => { setStep(1); setFile(null); setMovimientosBanco([]); }}
                            className="text-blue-600 hover:underline"
                        >
                            Nueva Conciliación
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConciliacionBancaria;
