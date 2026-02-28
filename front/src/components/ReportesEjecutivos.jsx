import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  FileText, TrendingUp, TrendingDown, DollarSign, ShoppingCart, 
  Package, Calendar, Download, Printer 
} from 'lucide-react';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';
import { API_URL } from '../api/config';

const ReportesEjecutivos = () => {
  const [activeTab, setActiveTab] = useState('financiero');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    financiero: {},
    operativo: {},
    comparativos: {}
  });

  const printRef = useRef();

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [finRes, opRes, compRes] = await Promise.all([
        axios.get(`${API_URL}reportes_ejecutivos.php?action=financiero`, { headers }),
        axios.get(`${API_URL}reportes_ejecutivos.php?action=operativo`, { headers }),
        axios.get(`${API_URL}reportes_ejecutivos.php?action=comparativos`, { headers })
      ]);

      setData({
        financiero: finRes.data || {},
        operativo: opRes.data || {},
        comparativos: compRes.data || {}
      });
    } catch (error) {
      console.error("Error fetching executive reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExportPDF = async () => {
    const element = printRef.current;
    if (!element) return;

    try {
      const dataUrl = await toPng(element, { quality: 0.95 });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`reporte_ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert("Error al exportar PDF. Intente nuevamente.");
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Generando reportes ejecutivos...</div>;
  }

  // Colores para gráficos
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Reportes Ejecutivos</h1>
          <p className="text-gray-600">Consolidado estratégico para toma de decisiones</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            <FileText size={20} />
            Exportar PDF
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Printer size={20} />
            Imprimir
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
        {['financiero', 'operativo', 'comparativos'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Contenido Imprimible */}
      <div ref={printRef} className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 min-h-[600px]">
        
        {/* Encabezado del Reporte (Solo visible en PDF/Impresión si se desea) */}
        <div className="mb-6 border-b pb-4">
          <h2 className="text-2xl font-bold text-gray-800">
            {activeTab === 'financiero' ? 'Consolidado Financiero' : 
             activeTab === 'operativo' ? 'Resumen Operativo' : 'Análisis Comparativo'}
          </h2>
          <p className="text-sm text-gray-500">Generado el: {new Date().toLocaleDateString()}</p>
        </div>

        {activeTab === 'financiero' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="p-4 bg-green-50 rounded-lg border border-green-100 h-full flex flex-col justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Ingresos Totales</p>
                  <h3 className="text-2xl font-bold text-green-700">S/ {data.financiero.ingresos_totales?.toLocaleString() || '0.00'}</h3>
                </div>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-100 h-full flex flex-col justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Gastos Totales</p>
                  <h3 className="text-2xl font-bold text-red-700">S/ {data.financiero.gastos_totales?.toLocaleString() || '0.00'}</h3>
                </div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 h-full flex flex-col justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Utilidad Neta</p>
                  <h3 className="text-2xl font-bold text-blue-700">S/ {data.financiero.utilidad_neta?.toLocaleString() || '0.00'}</h3>
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 h-full flex flex-col justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Margen Neto</p>
                  <h3 className="text-2xl font-bold text-purple-700">{data.financiero.margen_neto || 0}%</h3>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="h-96 border rounded-lg p-4 bg-white shadow-sm flex flex-col">
                <h4 className="text-lg font-semibold mb-4 text-center shrink-0">Distribución de Gastos vs Utilidad</h4>
                <div className="flex-grow min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ bottom: 20 }}>
                      <Pie
                        data={[
                          { name: 'Utilidad', value: data.financiero.utilidad_neta || 0 },
                          { name: 'Gastos', value: data.financiero.gastos_totales || 0 }
                        ]}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#10B981" />
                        <Cell fill="#EF4444" />
                      </Pie>
                      <Tooltip formatter={(value) => `S/ ${value.toLocaleString()}`} />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ bottom: 0 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="h-96 border rounded-lg p-4 bg-white shadow-sm flex flex-col">
                <h4 className="text-lg font-semibold mb-4 text-center shrink-0">Resumen Financiero</h4>
                <div className="flex-grow min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Ingresos', monto: data.financiero.ingresos_totales || 0, fill: '#10B981' },
                        { name: 'Gastos', monto: data.financiero.gastos_totales || 0, fill: '#EF4444' },
                        { name: 'Utilidad', monto: data.financiero.utilidad_neta || 0, fill: '#3B82F6' }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => `S/ ${value.toLocaleString()}`} />
                      <Legend />
                      <Bar dataKey="monto" name="Monto (S/)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'operativo' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg border shadow-sm flex items-center gap-4">
                <ShoppingCart className="text-blue-500 h-10 w-10" />
                <div>
                  <p className="text-sm text-gray-500">Transacciones</p>
                  <h3 className="text-2xl font-bold">{data.operativo.num_transacciones}</h3>
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg border shadow-sm flex items-center gap-4">
                <DollarSign className="text-green-500 h-10 w-10" />
                <div>
                  <p className="text-sm text-gray-500">Ticket Promedio</p>
                  <h3 className="text-2xl font-bold">S/ {data.operativo.ticket_promedio?.toFixed(2)}</h3>
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg border shadow-sm flex items-center gap-4">
                <Package className="text-orange-500 h-10 w-10" />
                <div>
                  <p className="text-sm text-gray-500">Valor Inventario</p>
                  <h3 className="text-2xl font-bold">S/ {data.operativo.valor_inventario?.toLocaleString()}</h3>
                </div>
              </div>
            </div>

            <div className="h-96 border rounded-lg p-6">
              <h4 className="text-lg font-semibold mb-4">Top 5 Productos Más Vendidos</h4>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={data.operativo.top_productos || []} 
                  layout="vertical" 
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="nombre" 
                    type="category" 
                    width={200} 
                    tickFormatter={(value) => value.length > 25 ? `${value.substring(0, 25)}...` : value}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    interval={0}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg max-w-xs">
                            <p className="font-bold text-gray-800 text-sm mb-1">{payload[0].payload.nombre}</p>
                            <p className="text-blue-600 text-sm">
                              Vendidos: <span className="font-semibold">{payload[0].value}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="total_vendido" fill="#3B82F6" name="Unidades Vendidas" radius={[0, 4, 4, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'comparativos' && (
          <div className="space-y-12">
            {/* Mes vs Mes */}
            <div>
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Calendar className="text-blue-600" />
                Comparativo Mensual (Mes Actual vs Anterior)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                <div className="bg-gray-50 p-6 rounded-xl text-center border">
                  <p className="text-sm text-gray-500 mb-2">Mes Anterior</p>
                  <h4 className="text-2xl font-bold text-gray-700">S/ {data.comparativos.mes_vs_mes?.anterior?.toLocaleString()}</h4>
                </div>
                
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-4xl font-bold ${data.comparativos.mes_vs_mes?.variacion_pct >= 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                    {data.comparativos.mes_vs_mes?.variacion_pct >= 0 ? <TrendingUp className="mr-2 h-8 w-8" /> : <TrendingDown className="mr-2 h-8 w-8" />}
                    {Math.abs(data.comparativos.mes_vs_mes?.variacion_pct)}%
                  </div>
                  <span className="text-sm text-gray-500 mt-2">Variación Porcentual</span>
                </div>

                <div className="bg-blue-50 p-6 rounded-xl text-center border border-blue-100">
                  <p className="text-sm text-gray-500 mb-2">Mes Actual</p>
                  <h4 className="text-2xl font-bold text-blue-700">S/ {data.comparativos.mes_vs_mes?.actual?.toLocaleString()}</h4>
                </div>
              </div>
            </div>

            <hr />

            {/* Año vs Año */}
            <div>
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <TrendingUp className="text-purple-600" />
                Comparativo Anual (Año Actual vs Anterior)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                <div className="bg-gray-50 p-6 rounded-xl text-center border">
                  <p className="text-sm text-gray-500 mb-2">Año Anterior</p>
                  <h4 className="text-2xl font-bold text-gray-700">S/ {data.comparativos.anio_vs_anio?.anterior?.toLocaleString()}</h4>
                </div>
                
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-4xl font-bold ${data.comparativos.anio_vs_anio?.variacion_pct >= 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                    {data.comparativos.anio_vs_anio?.variacion_pct >= 0 ? <TrendingUp className="mr-2 h-8 w-8" /> : <TrendingDown className="mr-2 h-8 w-8" />}
                    {Math.abs(data.comparativos.anio_vs_anio?.variacion_pct)}%
                  </div>
                  <span className="text-sm text-gray-500 mt-2">Variación Porcentual</span>
                </div>

                <div className="bg-purple-50 p-6 rounded-xl text-center border border-purple-100">
                  <p className="text-sm text-gray-500 mb-2">Año Actual</p>
                  <h4 className="text-2xl font-bold text-purple-700">S/ {data.comparativos.anio_vs_anio?.actual?.toLocaleString()}</h4>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportesEjecutivos;
