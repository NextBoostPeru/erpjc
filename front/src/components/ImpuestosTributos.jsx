import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Calculator, AlertTriangle, FileText, Save, Calendar, Clock, Edit2, Info, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const ImpuestosTributos = () => {
    const [periodo, setPeriodo] = useState({
        mes: new Date().getMonth() + 1,
        anio: new Date().getFullYear()
    });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [configTributaria, setConfigTributaria] = useState({
        saldo_favor_anterior: 0,
        coeficiente_renta: 0.015
    });
    const [showCronograma, setShowCronograma] = useState(false);
    const token = localStorage.getItem('token');

    useEffect(() => {
        fetchData();
    }, [periodo]);

    useEffect(() => {
        if (data && data.calculos) {
            setConfigTributaria({
                saldo_favor_anterior: parseFloat(data.calculos.saldo_favor_anterior || 0),
                coeficiente_renta: parseFloat(data.calculos.coeficiente_renta || 0.015)
            });
        }
    }, [data]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/impuestos.php?action=resumen_mensual&mes=${periodo.mes}&anio=${periodo.anio}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setData(res.data);
        } catch (error) {
            console.error("Error cargando impuestos:", error);
            toast.error("Error al cargar datos tributarios");
        } finally {
            setLoading(false);
        }
    };

    // Recalcular totales en el cliente cuando cambia la configuración
    const calculosActuales = useMemo(() => {
        if (!data) return null;

        const igv_ventas = parseFloat(data.ventas.igv_ventas || 0);
        const igv_compras = parseFloat(data.compras.igv_compras || 0);
        
        const impuesto_bruto = igv_ventas - igv_compras;
        const saldo_favor_anterior = parseFloat(configTributaria.saldo_favor_anterior || 0);
        const impuesto_resultante = impuesto_bruto - saldo_favor_anterior;

        const ventas_netas = parseFloat(data.ventas.total_ventas || 0) - igv_ventas;
        const coeficiente = parseFloat(configTributaria.coeficiente_renta || 0);
        const renta_estimada = ventas_netas * coeficiente;

        const total_a_pagar = Math.max(0, impuesto_resultante) + renta_estimada;

        return {
            impuesto_bruto,
            impuesto_resultante,
            renta_estimada,
            total_a_pagar
        };
    }, [data, configTributaria]);

    const handleGuardar = async () => {
        if (!data || !calculosActuales) return;
        try {
            const payload = {
                mes: periodo.mes,
                anio: periodo.anio,
                total_ventas: data.ventas.total_ventas,
                total_compras: data.compras.total_compras,
                igv_ventas: data.ventas.igv_ventas,
                igv_compras: data.compras.igv_compras,
                renta: calculosActuales.renta_estimada,
                total_a_pagar: calculosActuales.total_a_pagar,
                saldo_favor_anterior: configTributaria.saldo_favor_anterior,
                coeficiente_renta: configTributaria.coeficiente_renta
            };
            
            await axios.post(`${API_URL}/impuestos.php?action=guardar_determinacion`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Determinación guardada exitosamente");
            fetchData(); 
        } catch (error) {
            console.error("Error guardando:", error);
            toast.error("Error al guardar la determinación");
        }
    };

    const handleExportarPDT = async () => {
        try {
            const res = await axios.get(`${API_URL}/impuestos.php?action=reporte_pdt&mes=${periodo.mes}&anio=${periodo.anio}`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            // Crear url del blob y descargar
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            
            // Intentar obtener nombre del archivo del header o generar uno por defecto
            const contentDisposition = res.headers['content-disposition'];
            let fileName = `PDT621_${periodo.anio}${periodo.mes.toString().padStart(2, '0')}.txt`;
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (fileNameMatch && fileNameMatch.length === 2)
                    fileName = fileNameMatch[1];
            }

            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Archivo PDT generado correctamente");
        } catch (error) {
            console.error("Error exportando PDT:", error);
            if (error.response && error.response.status === 404) {
                toast.error("No se encontró una declaración guardada para este periodo. Por favor guarde antes de exportar.");
            } else {
                toast.error("Error al exportar el archivo PDT");
            }
        }
    };

    const CronogramaModal = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <Calendar size={20} /> Cronograma de Vencimientos
                    </h3>
                    <button onClick={() => setShowCronograma(false)} className="text-blue-100 hover:text-white">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-600 mb-4 text-sm">
                        Fechas de vencimiento para el periodo <strong>{new Date(0, periodo.mes - 1).toLocaleString('es', {month: 'long'})} {periodo.anio}</strong> según el último dígito del RUC.
                    </p>
                    <div className="overflow-hidden border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Último Dígito RUC</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Fecha Vencimiento</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digito) => {
                                    // Generación ficticia de fechas para el ejemplo (en producción usaría una lógica real o tabla maestra)
                                    const fechaBase = new Date(periodo.anio, periodo.mes, 15 + digito); 
                                    return (
                                        <tr key={digito} className="hover:bg-blue-50">
                                            <td className="px-4 py-2 text-sm text-gray-900 font-medium">{digito}</td>
                                            <td className="px-4 py-2 text-sm text-gray-600 text-right">
                                                {fechaBase.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </td>
                                        </tr>
                                    );
                                })}
                                <tr className="bg-blue-50 font-medium">
                                    <td className="px-4 py-2 text-sm text-blue-800">Buenos Contribuyentes</td>
                                    <td className="px-4 py-2 text-sm text-blue-800 text-right">
                                        {new Date(periodo.anio, periodo.mes, 26).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="bg-gray-50 px-6 py-4 flex justify-end">
                    <button onClick={() => setShowCronograma(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );

    if (loading && !data) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
    );

    return (
        <div className="p-4 md:p-6 fade-in max-w-7xl mx-auto">
            <Toaster position="top-right" />
            {showCronograma && <CronogramaModal />}
            
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <Calculator className="w-8 h-8 text-blue-600" /> 
                        Gestión Tributaria
                    </h1>
                    <p className="text-gray-500 mt-1">Cálculo, declaración y seguimiento de impuestos mensuales.</p>
                </div>
                
                <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    <button 
                        className="flex-1 lg:flex-none bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
                        onClick={() => setShowCronograma(true)}
                    >
                        <Calendar size={18} /> Cronograma
                    </button>
                    <button 
                        className="flex-1 lg:flex-none bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm" 
                        onClick={fetchData}
                    >
                        <Clock size={18} /> Actualizar
                    </button>
                    <button 
                        className="flex-1 lg:flex-none bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm" 
                        onClick={handleGuardar}
                    >
                        <Save size={18} /> Guardar
                    </button>
                    <button 
                        className="flex-1 lg:flex-none bg-gray-800 hover:bg-gray-900 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm" 
                        onClick={handleExportarPDT}
                    >
                        <FileText size={18} /> PDT 621
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Selector de Periodo */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-center">
                    <label className="block text-gray-500 text-sm font-medium mb-2">Periodo de Declaración</label>
                    <div className="flex gap-3">
                        <select 
                            value={periodo.mes} 
                            onChange={e => setPeriodo({...periodo, mes: parseInt(e.target.value)})} 
                            className="block w-full rounded-lg border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5"
                        >
                            {[...Array(12)].map((_, i) => (
                                <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('es', {month: 'long'}).charAt(0).toUpperCase() + new Date(0, i).toLocaleString('es', {month: 'long'}).slice(1)}</option>
                            ))}
                        </select>
                        <select 
                            value={periodo.anio} 
                            onChange={e => setPeriodo({...periodo, anio: parseInt(e.target.value)})} 
                            className="block w-1/3 rounded-lg border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5"
                        >
                            {[2023, 2024, 2025, 2026].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    {data && data.declaracion && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md border border-green-100">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            Declarado el {new Date(data.declaracion.fecha_declaracion).toLocaleDateString()}
                        </div>
                    )}
                </div>

                {/* Configuración Tributaria */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
                    <h3 className="text-gray-800 font-bold mb-4 flex items-center gap-2">
                        <Edit2 size={18} className="text-blue-500" /> Configuración de Cálculo
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-gray-500 text-xs uppercase font-bold mb-2">Saldo a Favor Mes Anterior</label>
                            <div className="relative rounded-md shadow-sm">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <span className="text-gray-500 sm:text-sm">S/</span>
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={configTributaria.saldo_favor_anterior}
                                    onChange={(e) => setConfigTributaria({...configTributaria, saldo_favor_anterior: parseFloat(e.target.value) || 0})}
                                    className="block w-full rounded-lg border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5"
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-400">Crédito fiscal acumulado de periodos previos.</p>
                        </div>
                        <div>
                            <label className="block text-gray-500 text-xs uppercase font-bold mb-2">Coeficiente Renta</label>
                            <div className="relative rounded-md shadow-sm">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={configTributaria.coeficiente_renta}
                                    onChange={(e) => setConfigTributaria({...configTributaria, coeficiente_renta: parseFloat(e.target.value) || 0})}
                                    className="block w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5"
                                />
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                    <span className="text-gray-500 sm:text-sm">%</span>
                                </div>
                            </div>
                            <p className="mt-1 text-xs text-gray-400">Por defecto 0.015 (1.5%) para Régimen MYPE Tributario.</p>
                        </div>
                    </div>
                </div>
            </div>

            {data && data.ventas && calculosActuales && (
                <div className="space-y-6">
                    {/* Tarjetas de Resumen */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-red-500">
                            <p className="text-gray-500 text-xs uppercase font-bold">IGV Ventas</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">S/ {parseFloat(data.ventas.igv_ventas || 0).toFixed(2)}</p>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                            <p className="text-gray-500 text-xs uppercase font-bold">IGV Compras</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">S/ {parseFloat(data.compras.igv_compras || 0).toFixed(2)}</p>
                        </div>
                        <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4 ${calculosActuales.impuesto_resultante > 0 ? 'border-orange-500' : 'border-teal-500'}`}>
                            <p className="text-gray-500 text-xs uppercase font-bold">
                                {calculosActuales.impuesto_resultante > 0 ? 'IGV Por Pagar' : 'Saldo a Favor'}
                            </p>
                            <p className={`text-2xl font-bold mt-1 ${calculosActuales.impuesto_resultante > 0 ? 'text-orange-600' : 'text-teal-600'}`}>
                                S/ {Math.abs(calculosActuales.impuesto_resultante).toFixed(2)}
                            </p>
                        </div>
                         <div className="bg-blue-600 p-5 rounded-xl shadow-sm text-white">
                            <p className="text-blue-100 text-xs uppercase font-bold">Total a Pagar (IGV+Renta)</p>
                            <p className="text-3xl font-bold mt-1">S/ {calculosActuales.total_a_pagar.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Detalle de Cálculos */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                                <h3 className="font-bold text-gray-800">Liquidación de Impuestos</h3>
                            </div>
                            <div className="p-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center pb-3 border-b border-gray-100 border-dashed">
                                        <span className="text-gray-600">IGV Bruto (Ventas - Compras)</span>
                                        <span className="font-medium">S/ {calculosActuales.impuesto_bruto.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pb-3 border-b border-gray-100 border-dashed">
                                        <span className="text-gray-600">(-) Saldo a Favor Periodo Anterior</span>
                                        <span className="font-medium text-green-600">- S/ {configTributaria.saldo_favor_anterior.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pb-3 border-b border-gray-100 border-dashed">
                                        <span className="text-gray-800 font-bold">(=) IGV Resultante</span>
                                        <span className={`font-bold ${calculosActuales.impuesto_resultante > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            S/ {calculosActuales.impuesto_resultante.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-gray-200">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-gray-600">Base Imponible Renta (Ventas Netas)</span>
                                            <span className="font-medium">S/ {(parseFloat(data.ventas.total_ventas || 0) - parseFloat(data.ventas.igv_ventas || 0)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-gray-600">Impuesto a la Renta (Coeficiente {configTributaria.coeficiente_renta})</span>
                                            <span className="font-medium text-red-600">+ S/ {calculosActuales.renta_estimada.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-3 border-t border-gray-200 text-lg">
                                            <span className="text-gray-900 font-bold">Importe Total a Pagar</span>
                                            <span className="font-bold text-blue-600">S/ {calculosActuales.total_a_pagar.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Alertas e Información Adicional */}
                        <div className="space-y-6">
                            {data.alertas && data.alertas.length > 0 && (
                                <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-100">
                                    <h4 className="text-yellow-800 font-bold flex items-center gap-2 mb-4">
                                        <AlertTriangle size={20} /> Alertas
                                    </h4>
                                    <ul className="space-y-3">
                                        {data.alertas.map((alerta, idx) => (
                                            <li key={idx} className="flex gap-2 text-sm text-yellow-700 bg-white p-3 rounded-lg border border-yellow-100 shadow-sm">
                                                <Info size={16} className="shrink-0 mt-0.5" />
                                                {alerta}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                <h4 className="font-bold text-gray-800 mb-4 text-sm uppercase">Detracciones y Retenciones</h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm text-gray-600">Detracciones</span>
                                        <span className="font-bold text-gray-800">S/ {parseFloat(data.compras.total_detracciones || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm text-gray-600">Retenciones</span>
                                        <span className="font-bold text-gray-800">S/ {parseFloat(data.compras.total_retenciones || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImpuestosTributos;