import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { Download, Printer, Filter, PieChart as PieIcon, TrendingUp, DollarSign, FileText, Calendar, ArrowUpCircle, ArrowDownCircle, Activity } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const ReportesFinancieros = () => {
  const [activeTab, setActiveTab] = useState('balance'); // balance, resultados, flujo, analisis
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({
    anio: new Date().getFullYear(),
    mes: new Date().getMonth() + 1
  });

  const token = localStorage.getItem('token');
  const printRef = useRef();

  useEffect(() => {
    fetchReportData();
  }, [activeTab, filters]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      setData(null);
      let action = '';
      switch (activeTab) {
        case 'balance': action = 'balance_general'; break;
        case 'resultados': action = 'estado_resultados'; break;
        case 'flujo': action = 'flujo_caja'; break;
        case 'analisis': action = 'analisis_ingresos_gastos'; break;
        default: action = 'balance_general';
      }

      const res = await axios.get(`${API_URL}/reportes_financieros.php?action=${action}&anio=${filters.anio}&mes=${filters.mes}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (error) {
      console.error("Error cargando reporte:", error);
      toast.error("Error al cargar reporte");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (!data) {
        toast.error("No hay datos para exportar");
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        let wsData = [];
        let sheetName = "";

        if (activeTab === 'balance') {
            sheetName = "Balance General";
            wsData.push(["BALANCE GENERAL", `Periodo: ${filters.anio}-${filters.mes}`]);
            wsData.push([""]); // Espacio
            
            // Activos
            wsData.push(["ACTIVOS"]);
            wsData.push(["Código", "Cuenta", "Saldo"]);
            data.activos?.forEach(item => wsData.push([item.codigo, item.nombre, item.saldo]));
            wsData.push(["TOTAL ACTIVO", "", data.totales?.activo]);
            wsData.push([""]);

            // Pasivos
            wsData.push(["PASIVOS"]);
            wsData.push(["Código", "Cuenta", "Saldo"]);
            data.pasivos?.forEach(item => wsData.push([item.codigo, item.nombre, item.saldo]));
            wsData.push(["TOTAL PASIVO", "", data.totales?.pasivo]);
            wsData.push([""]);

            // Patrimonio
            wsData.push(["PATRIMONIO"]);
            wsData.push(["Código", "Cuenta", "Saldo"]);
            data.patrimonio?.forEach(item => wsData.push([item.codigo, item.nombre, item.saldo]));
            wsData.push(["TOTAL PATRIMONIO", "", data.totales?.patrimonio]);
            wsData.push([""]);
            
            wsData.push(["TOTAL PASIVO + PATRIMONIO", "", data.totales?.pasivo_patrimonio]);

        } else if (activeTab === 'resultados') {
            sheetName = "Estado de Resultados";
            wsData.push(["ESTADO DE RESULTADOS", `Periodo: ${filters.anio}-${filters.mes}`]);
            wsData.push([""]);

            // Ingresos
            wsData.push(["INGRESOS OPERATIVOS"]);
            wsData.push(["Código", "Cuenta", "Monto"]);
            data.ingresos?.forEach(item => wsData.push([item.codigo, item.nombre, item.monto]));
            wsData.push(["TOTAL INGRESOS", "", data.totales?.ingresos]);
            wsData.push([""]);

            // Gastos
            wsData.push(["GASTOS OPERATIVOS"]);
            wsData.push(["Código", "Cuenta", "Monto"]);
            data.gastos?.forEach(item => wsData.push([item.codigo, item.nombre, item.monto]));
            wsData.push(["TOTAL GASTOS", "", data.totales?.gastos]);
            wsData.push([""]);

            wsData.push(["UTILIDAD / PÉRDIDA NETA", "", data.totales?.utilidad_neta]);

        } else if (activeTab === 'flujo') {
            sheetName = "Flujo de Caja";
            wsData.push(["FLUJO DE CAJA", `Año: ${filters.anio}`]);
            wsData.push([""]);
            wsData.push(["Mes", "Ingresos", "Egresos", "Neto"]);
            data.forEach(row => wsData.push([row.mes, row.ingresos, row.egresos, row.neto]));

        } else if (activeTab === 'analisis') {
            sheetName = "Análisis Financiero";
            wsData.push(["ANÁLISIS FINANCIERO", `Año: ${filters.anio}`]);
            wsData.push([""]);
            wsData.push(["Mes", "Ingresos", "Gastos", "Utilidad"]);
            data.forEach(row => wsData.push([row.mes, row.ingresos, row.gastos, row.utilidad]));
        }

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Max 31 chars
        XLSX.writeFile(wb, `Reporte_${sheetName.replace(/\s+/g, '_')}_${filters.anio}_${filters.mes}.xlsx`);
        toast.success("Reporte exportado correctamente");

    } catch (error) {
        console.error("Error exportando excel:", error);
        toast.error("Error al exportar");
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      className={`px-6 py-3 text-sm font-medium transition-colors duration-200 flex items-center gap-2 border-b-2 ${activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
      onClick={() => setActiveTab(id)}
    >
      {Icon && <Icon size={18} />}
      {label}
    </button>
  );

  const SummaryCard = ({ title, value, variant, icon: Icon }) => {
    const borderClass = variant === 'success' ? 'border-green-500' : variant === 'danger' ? 'border-red-500' : 'border-blue-500';
    const textClass = variant === 'success' ? 'text-green-600' : variant === 'danger' ? 'text-red-600' : 'text-blue-600';
    const bgClass = variant === 'success' ? 'bg-green-100' : variant === 'danger' ? 'bg-red-100' : 'bg-blue-100';

    return (
        <div className={`bg-white rounded-lg shadow-md p-6 border-l-4 ${borderClass}`}>
            <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-sm mb-1">{title}</p>
                <h3 className={`text-2xl font-bold ${textClass}`}>{formatCurrency(value || 0)}</h3>
            </div>
            <div className={`rounded-full p-2 ${bgClass}`}>
                <Icon size={24} className={textClass} />
            </div>
            </div>
        </div>
    );
  };

  return (
    <div className="p-6 fade-in" ref={printRef}>
      <Toaster position="top-right" />
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 no-print">
        <h1 className="text-2xl font-bold text-gray-800">Reportes Financieros</h1>
        
        <div className="flex gap-2">
            <div className="flex items-center gap-2 bg-white p-2 rounded shadow-sm border border-gray-200">
                <Calendar size={18} className="text-gray-500 ml-2"/>
                <select 
                    className="border-none bg-transparent font-medium text-gray-700 focus:ring-0 cursor-pointer" 
                    value={filters.anio} 
                    onChange={(e) => setFilters({...filters, anio: e.target.value})}
                >
                    {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>

                {activeTab !== 'flujo' && activeTab !== 'analisis' && (
                    <>
                        <div className="w-px h-6 bg-gray-300 mx-1"></div>
                        <select 
                            className="border-none bg-transparent font-medium text-gray-700 focus:ring-0 cursor-pointer" 
                            value={filters.mes} 
                            onChange={(e) => setFilters({...filters, mes: e.target.value})}
                        >
                            {Array.from({length: 12}, (_, i) => (
                                <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('es', {month: 'long'})}</option>
                            ))}
                        </select>
                    </>
                )}
            </div>
            
            <button className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors" onClick={handlePrint} title="Imprimir / PDF">
                <Printer size={20} />
            </button>
            <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors" onClick={handleExportExcel} title="Exportar Excel">
                <Download size={20} /> <span>Exportar</span>
            </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-gray-200 mb-6 no-print">
        <TabButton id="balance" label="Balance General" icon={FileText} />
        <TabButton id="resultados" label="Estado de Resultados" icon={TrendingUp} />
        <TabButton id="flujo" label="Flujo de Caja" icon={DollarSign} />
        <TabButton id="analisis" label="Análisis Financiero" icon={Activity} />
      </div>

      {loading ? (
        <div className="text-center py-12">
            <div className="inline-block animate-spin mb-4">
                <Activity size={40} className="text-blue-600" />
            </div>
            <p className="text-gray-500">Procesando datos financieros...</p>
        </div>
      ) : !data ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <FileText size={48} className="text-gray-400 mb-4 mx-auto" />
            <p className="text-gray-500">No hay datos disponibles para el período seleccionado.</p>
        </div>
      ) : (
        <div className="fade-in">
            {/* BALANCE GENERAL */}
            {activeTab === 'balance' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <SummaryCard title="Total Activos" value={data.totales?.activo} variant="success" icon={ArrowUpCircle} />
                        <SummaryCard title="Total Pasivos" value={data.totales?.pasivo} variant="danger" icon={ArrowDownCircle} />
                        <SummaryCard title="Patrimonio Neto" value={data.totales?.patrimonio} variant="primary" icon={DollarSign} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-lg shadow-md p-6">
                            <div className="mb-4 pb-2 border-b border-gray-100">
                                <h3 className="text-xl font-bold text-green-600">Activos</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuenta</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {data.activos?.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 text-sm text-gray-900">
                                                    <span className="bg-gray-100 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">{item.codigo}</span>
                                                    {item.nombre}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(item.saldo)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-50">
                                            <td className="px-4 py-3 text-sm font-bold text-green-600">TOTAL ACTIVO</td>
                                            <td className="px-4 py-3 text-lg font-bold text-green-600 text-right">{formatCurrency(data.totales?.activo)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg shadow-md p-6">
                            <div className="mb-4 pb-2 border-b border-gray-100">
                                <h3 className="text-xl font-bold text-red-600">Pasivo y Patrimonio</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuenta</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {/* Pasivos */}
                                        <tr className="bg-gray-50"><td colSpan="2" className="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Pasivos</td></tr>
                                        {data.pasivos?.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 text-sm text-gray-900">
                                                    <span className="bg-gray-100 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">{item.codigo}</span>
                                                    {item.nombre}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(item.saldo)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-red-50">
                                            <td className="px-4 py-3 text-sm font-bold text-red-600">TOTAL PASIVO</td>
                                            <td className="px-4 py-3 text-sm font-bold text-red-600 text-right">{formatCurrency(data.totales?.pasivo)}</td>
                                        </tr>

                                        {/* Patrimonio */}
                                        <tr className="bg-gray-50"><td colSpan="2" className="px-4 py-2 text-xs font-bold text-gray-500 uppercase pt-4">Patrimonio</td></tr>
                                        {data.patrimonio?.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 text-sm text-gray-900">
                                                    <span className="bg-gray-100 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">{item.codigo}</span>
                                                    {item.nombre}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(item.saldo)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-blue-50">
                                            <td className="px-4 py-3 text-sm font-bold text-blue-600">TOTAL PATRIMONIO</td>
                                            <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right">{formatCurrency(data.totales?.patrimonio)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gray-50 p-4 mt-4 text-center rounded-lg border border-gray-100">
                                <span className="text-gray-500 mr-2">Total Pasivo + Patrimonio:</span>
                                <span className="font-bold text-xl text-gray-800">{formatCurrency(data.totales?.pasivo_patrimonio)}</span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ESTADO DE RESULTADOS */}
            {activeTab === 'resultados' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white rounded-lg shadow-md p-6 lg:col-span-2">
                        <div className="mb-4 pb-2 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-800">Detalle de Estado de Resultados</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead>
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Concepto / Cuenta</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {/* Ingresos */}
                                    <tr className="bg-gray-50"><td colSpan="2" className="px-4 py-2 text-xs font-bold text-green-600 uppercase">Ingresos Operativos</td></tr>
                                    {data.ingresos?.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-sm text-gray-900">
                                                <span className="bg-gray-100 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">{item.codigo}</span>
                                                {item.nombre}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">{formatCurrency(item.monto)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-green-50">
                                        <td className="px-4 py-3 text-sm font-bold text-gray-800">TOTAL INGRESOS</td>
                                        <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">{formatCurrency(data.totales?.ingresos)}</td>
                                    </tr>

                                    {/* Gastos */}
                                    <tr className="bg-gray-50"><td colSpan="2" className="px-4 py-2 text-xs font-bold text-red-600 uppercase pt-4">Gastos Operativos</td></tr>
                                    {data.gastos?.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-sm text-gray-900">
                                                <span className="bg-gray-100 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">{item.codigo}</span>
                                                {item.nombre}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-red-600 text-right">{formatCurrency(item.monto)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-red-50">
                                        <td className="px-4 py-3 text-sm font-bold text-gray-800">TOTAL GASTOS</td>
                                        <td className="px-4 py-3 text-sm font-bold text-red-600 text-right">{formatCurrency(data.totales?.gastos)}</td>
                                    </tr>
                                    
                                    {/* Utilidad Neta */}
                                    <tr className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
                                        <td className="px-6 py-4 font-bold text-lg">UTILIDAD / PÉRDIDA NETA</td>
                                        <td className="px-6 py-4 font-bold text-xl text-right">{formatCurrency(data.totales?.utilidad_neta)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <div className="mb-4 pb-2 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-800">Distribución</h3>
                        </div>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={[
                                            { name: 'Ingresos', value: parseFloat(data.totales?.ingresos || 0) },
                                            { name: 'Gastos', value: parseFloat(data.totales?.gastos || 0) }
                                        ]}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70}
                                        outerRadius={90}
                                        fill="#8884d8"
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        <Cell key="cell-0" fill="#10B981" />
                                        <Cell key="cell-1" fill="#EF4444" />
                                    </Pie>
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle"/>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="mt-4 text-center">
                                <div className="flex justify-center gap-6">
                                    <div>
                                        <span className="block text-xs text-gray-500 mb-1">Ingresos</span>
                                        <span className="font-bold text-green-600 text-lg">{formatCurrency(data.totales?.ingresos)}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs text-gray-500 mb-1">Gastos</span>
                                        <span className="font-bold text-red-600 text-lg">{formatCurrency(data.totales?.gastos)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FLUJO DE CAJA */}
            {activeTab === 'flujo' && (
                 <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-center mb-6 pb-2 border-b border-gray-100">
                        <h3 className="text-xl font-bold text-blue-600">Flujo de Caja Anual {filters.anio}</h3>
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">Consolidado Mensual</span>
                    </div>
                    <div>
                        <div className="h-[400px] mb-8">
                            <ResponsiveContainer>
                                <BarChart
                                    data={data}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    barGap={0}
                                    barCategoryGap="20%"
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} tickFormatter={(value) => `S/ ${value/1000}k`} />
                                    <Tooltip 
                                        formatter={(value) => formatCurrency(value)} 
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                                    />
                                    <Legend wrapperStyle={{paddingTop: '20px'}} />
                                    <Bar dataKey="ingresos" fill="#10B981" name="Ingresos" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="egresos" fill="#EF4444" name="Egresos" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="neto" fill="#3B82F6" name="Flujo Neto" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-center">
                                <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-2 text-center">Mes</th>
                                        <th className="px-4 py-2 text-center text-green-600">Ingresos</th>
                                        <th className="px-4 py-2 text-center text-red-600">Egresos</th>
                                        <th className="px-4 py-2 text-center text-blue-600">Flujo Neto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {Array.isArray(data) && data.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-bold text-gray-900">{row.mes}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-green-600">{formatCurrency(row.ingresos)}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-red-600">{formatCurrency(row.egresos)}</td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${row.neto >= 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                                                    {formatCurrency(row.neto)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                 </div>
            )}

            {/* ANALISIS */}
            {activeTab === 'analisis' && (
                 <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="mb-6 pb-2 border-b border-gray-100">
                        <h3 className="text-xl font-bold text-blue-600">Análisis de Rentabilidad y Tendencias</h3>
                    </div>
                    <div>
                        <div className="w-full h-[450px] mb-8">
                            <ResponsiveContainer>
                                <AreaChart
                                    data={data}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <defs>
                                        <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorUtilidad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} />
                                    <Tooltip 
                                        formatter={(value) => formatCurrency(value)}
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
                                    />
                                    <Legend wrapperStyle={{paddingTop: '20px'}} />
                                    <Area type="monotone" dataKey="ingresos" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorIngresos)" name="Ventas/Ingresos" />
                                    <Area type="monotone" dataKey="utilidad" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorUtilidad)" name="Utilidad Neta" />
                                    <Line type="monotone" dataKey="gastos" stroke="#EF4444" strokeWidth={2} dot={false} strokeDasharray="5 5" name="Gastos" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-6 bg-gray-50 rounded-lg text-center border border-gray-200 hover:shadow-md transition-shadow">
                                <h6 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Margen Promedio</h6>
                                <h2 className="text-blue-600 mt-2 text-3xl font-bold">
                                    {Array.isArray(data) && data.length > 0 ? 
                                        ((data.reduce((acc, curr) => acc + parseFloat(curr.utilidad), 0) / 
                                          data.reduce((acc, curr) => acc + parseFloat(curr.ingresos), 0)) * 100).toFixed(1) + '%'
                                        : '0%'}
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">Utilidad Neta / Ingresos Totales</p>
                            </div>
                            <div className="p-6 bg-gray-50 rounded-lg text-center border border-gray-200 hover:shadow-md transition-shadow">
                                <h6 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Ventas Anuales</h6>
                                <h2 className="text-green-600 mt-2 text-3xl font-bold">
                                    {formatCurrency(Array.isArray(data) ? data.reduce((acc, curr) => acc + parseFloat(curr.ingresos), 0) : 0)}
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">Acumulado {filters.anio}</p>
                            </div>
                            <div className="p-6 bg-gray-50 rounded-lg text-center border border-gray-200 hover:shadow-md transition-shadow">
                                <h6 className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Gastos Anuales</h6>
                                <h2 className="text-red-600 mt-2 text-3xl font-bold">
                                    {formatCurrency(Array.isArray(data) ? data.reduce((acc, curr) => acc + parseFloat(curr.gastos), 0) : 0)}
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">Acumulado {filters.anio}</p>
                            </div>
                        </div>
                    </div>
                 </div>
            )}
        </div>
      )}
    </div>
  );
};

export default ReportesFinancieros;
