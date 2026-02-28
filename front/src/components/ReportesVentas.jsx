import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  BarChart3, PieChart, TrendingUp, DollarSign, Calendar, 
  Users, ShoppingBag, ArrowUpRight, ArrowDownRight, Printer 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart as RePie, Pie, Cell 
} from 'recharts';
import { API_URL } from '../api/config';

const ReportesVentas = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}reportes_ventas.php?action=dashboard&start_date=${dateRange.start}&end_date=${dateRange.end}`, { headers });
      setData(res.data);
    } catch (error) {
      toast.error('Error al cargar reportes');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  if (loading && !data) return <div className="p-10 text-center">Cargando reportes...</div>;
  if (!data) return <div className="p-10 text-center text-red-500">Error al cargar datos</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3 mb-4 md:mb-0">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Reportes de Ventas</h1>
            <p className="text-gray-500 text-sm">Análisis y estadísticas en tiempo real</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg overflow-hidden">
                <input 
                    type="date" 
                    className="p-2 border-r outline-none text-sm"
                    value={dateRange.start}
                    onChange={e => setDateRange({...dateRange, start: e.target.value})}
                />
                <input 
                    type="date" 
                    className="p-2 outline-none text-sm"
                    value={dateRange.end}
                    onChange={e => setDateRange({...dateRange, end: e.target.value})}
                />
            </div>
            <button 
                onClick={fetchData}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                title="Actualizar"
            >
                <TrendingUp size={20} />
            </button>
            <button 
                onClick={() => window.print()}
                className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                title="Imprimir"
            >
                <Printer size={20} />
            </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-500 text-sm font-medium">Ventas Totales (Periodo)</p>
                    <h3 className="text-2xl font-bold mt-1">
                        {formatCurrency(data.sales_period.reduce((acc, curr) => acc + parseFloat(curr.total), 0))}
                    </h3>
                </div>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <DollarSign size={20} />
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-500 text-sm font-medium">Margen Estimado</p>
                    <h3 className="text-2xl font-bold mt-1 text-green-600">
                        {formatCurrency(data.margins.ventas_netas - data.margins.costo_estimado)}
                    </h3>
                    <p className="text-xs text-green-500 mt-1">
                        {data.margins.ventas_netas > 0 
                            ? ((1 - (data.margins.costo_estimado / data.margins.ventas_netas)) * 100).toFixed(1) 
                            : 0}% utilidad
                    </p>
                </div>
                <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                    <TrendingUp size={20} />
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-purple-500">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-500 text-sm font-medium">IGV Generado</p>
                    <h3 className="text-2xl font-bold mt-1 text-purple-600">
                        {formatCurrency(data.igv.total_igv)}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">Base: {formatCurrency(data.igv.total_neto)}</p>
                </div>
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <PieChart size={20} />
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-orange-500">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-500 text-sm font-medium">Proyección Mensual</p>
                    <h3 className="text-2xl font-bold mt-1 text-orange-600">
                        {formatCurrency(data.projection.projected_total)}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">Promedio Diario: {formatCurrency(data.projection.daily_average)}</p>
                </div>
                <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                    <Calendar size={20} />
                </div>
            </div>
        </div>
      </div>

      {/* Charts Section 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Period Trend */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center">
                <TrendingUp size={18} className="mr-2 text-blue-600"/> Evolución de Ventas
            </h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.sales_period}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="fecha" />
                        <YAxis />
                        <Tooltip formatter={(val) => formatCurrency(val)} />
                        <Legend />
                        <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} activeDot={{ r: 8 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Sales by Seller */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center">
                <Users size={18} className="mr-2 text-green-600"/> Ventas por Vendedor
            </h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.sales_seller} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="vendedor" type="category" width={100} />
                        <Tooltip formatter={(val) => formatCurrency(val)} />
                        <Legend />
                        <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* Ventas por Area */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Users size={20} className="text-purple-600" />
            Ventas por Área
        </h2>
        <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.sales_area} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="area" type="category" width={120} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="total" name="Total Ventas" fill="#8884d8" radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Section 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Product (Top 10) */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center">
                <ShoppingBag size={18} className="mr-2 text-purple-600"/> Top Productos
            </h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.sales_product}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="descripcion" hide /> {/* Hide text if too long */}
                        <YAxis />
                        <Tooltip formatter={(val) => formatCurrency(val)} />
                        <Legend />
                        <Bar dataKey="total" fill="#8b5cf6" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

         {/* Sales by Client Table */}
         <div className="bg-white p-6 rounded-xl shadow-sm flex flex-col">
            <h3 className="text-lg font-bold mb-4 flex items-center">
                <Users size={18} className="mr-2 text-orange-600"/> Top Clientes
            </h3>
            <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-4 py-3">Cliente</th>
                            <th className="px-4 py-3 text-right">Cant. Compras</th>
                            <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.sales_client.map((client, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-xs" title={client.cliente_razon_social}>
                                    {client.cliente_razon_social}
                                </td>
                                <td className="px-4 py-3 text-right">{client.cantidad}</td>
                                <td className="px-4 py-3 text-right font-bold">{formatCurrency(client.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ReportesVentas;
