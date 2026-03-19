import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  ShoppingCart, 
  Activity, 
  BarChart2, 
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { API_URL } from '../api/config';
import { generateDashboardPDF } from '../utils/dashboardPdf';

const DashboardGerente = () => {
  const [loading, setLoading] = useState(true);
  const [forbiddenMessage, setForbiddenMessage] = useState('');
  const [data, setData] = useState({
    kpis: {
      ventas_mes: { value: 0, change: 0 },
      ingresos_totales: { value: 0, change: 0 },
      nuevos_clientes: { value: 0, change: 0 },
      gastos_operativos: { value: 0, change: 0 }
    },
    ventas_por_mes: [],
    top_productos: [],
    distribucion_gastos: []
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Try fetching from backend first
      const response = await axios.get(`${API_URL}dashboard_gerente.php`, {
        headers: getAuthHeaders(),
        _suppressForbiddenToast: true
      });
      
      if (response.data && response.data.kpis) {
        setData(response.data);
      } else {
        throw new Error('Invalid data structure from API');
      }
      setLoading(false);

    } catch (error) {
      if (error?.response?.status === 403) {
        const msg = error?.response?.data?.message || 'No tienes permiso para ver este dashboard';
        setForbiddenMessage(msg);
        setLoading(false);
        return;
      }
      console.warn('Using mock data due to API error:', error);
      
      // Fallback to mock data for visualization
      setTimeout(() => {
        setData({
          kpis: {
            ventas_mes: { value: 125000, change: 12.5 },
            ingresos_totales: { value: 450000, change: 8.2 },
            nuevos_clientes: { value: 45, change: -2.4 },
            gastos_operativos: { value: 85000, change: 5.1 }
          },
          ventas_por_mes: [
            { name: 'Ene', ventas: 40000, meta: 35000 },
            { name: 'Feb', ventas: 30000, meta: 35000 },
            { name: 'Mar', ventas: 20000, meta: 35000 },
            { name: 'Abr', ventas: 27800, meta: 35000 },
            { name: 'May', ventas: 18900, meta: 35000 },
            { name: 'Jun', ventas: 23900, meta: 35000 },
            { name: 'Jul', ventas: 34900, meta: 40000 },
          ],
          top_productos: [
            { name: 'Laptop Pro X', ventas: 120 },
            { name: 'Monitor 4K', ventas: 98 },
            { name: 'Teclado Mecánico', ventas: 86 },
            { name: 'Mouse Gamer', ventas: 99 },
            { name: 'Auriculares', ventas: 85 },
          ],
          distribucion_gastos: [
            { name: 'Personal', value: 45000 },
            { name: 'Marketing', value: 15000 },
            { name: 'Infraestructura', value: 10000 },
            { name: 'Servicios', value: 5000 },
            { name: 'Otros', value: 10000 },
          ]
        });
        setLoading(false);
      }, 1000);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (forbiddenMessage) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 text-center">
          <h1 className="text-xl font-bold text-slate-800">Acceso restringido</h1>
          <p className="mt-2 text-slate-600">{forbiddenMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Gerencial</h1>
          <p className="text-slate-500">Resumen ejecutivo y métricas clave</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
            <Calendar size={18} />
            <span>Este Mes</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <Activity size={18} />
            <span>Generar Reporte</span>
          </button>
        </div>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          title="Ventas del Mes" 
          value={formatCurrency(data.kpis.ventas_mes.value)}
          change={data.kpis.ventas_mes.change}
          icon={<DollarSign className="text-blue-600" size={24} />}
          color="blue"
        />
        <KpiCard 
          title="Ingresos Totales" 
          value={formatCurrency(data.kpis.ingresos_totales.value)}
          change={data.kpis.ingresos_totales.change}
          icon={<TrendingUp className="text-emerald-600" size={24} />}
          color="emerald"
        />
        <KpiCard 
          title="Nuevos Clientes" 
          value={data.kpis.nuevos_clientes.value}
          change={data.kpis.nuevos_clientes.change}
          icon={<Users className="text-violet-600" size={24} />}
          color="violet"
        />
        <KpiCard 
          title="Gastos Operativos" 
          value={formatCurrency(data.kpis.gastos_operativos.value)}
          change={data.kpis.gastos_operativos.change}
          icon={<Activity className="text-rose-600" size={24} />}
          color="rose"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-w-0">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Rendimiento de Ventas vs Meta</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={data.ventas_por_mes}>
                <defs>
                  <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Area type="monotone" dataKey="ventas" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorVentas)" name="Ventas Reales" />
                <Area type="monotone" dataKey="meta" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="none" name="Meta Mensual" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Top Productos</h3>
          <div className="space-y-4">
            {data.top_productos.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                    ${index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                      index === 1 ? 'bg-slate-100 text-slate-700' : 
                      index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                    {index + 1}
                  </div>
                  <span className="font-medium text-slate-700">{item.name}</span>
                </div>
                <span className="text-slate-500 font-semibold">{item.ventas} un.</span>
              </div>
            ))}
          </div>
          <button className="w-full mt-6 py-2 text-sm text-blue-600 font-medium hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
            Ver Reporte Completo
          </button>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-w-0">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Distribución de Gastos</h3>
          <div className="h-64">
             <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={data.distribucion_gastos} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg text-white">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-lg font-bold opacity-90">Resumen Financiero</h3>
              <p className="text-sm opacity-60">Última actualización: Hace 5 min</p>
            </div>
            <div className="p-2 bg-white/10 rounded-lg">
              <PieChart size={20} />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-sm opacity-60 mb-1">Margen Neto</p>
              <p className="text-3xl font-bold text-emerald-400">{data.financieros?.margen_neto?.value || 0}%</p>
              <div className={`flex items-center gap-1 text-xs ${data.financieros?.margen_neto?.change >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'} mt-1`}>
                {data.financieros?.margen_neto?.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                <span>{Math.abs(data.financieros?.margen_neto?.change || 0)}% vs mes anterior</span>
              </div>
            </div>
            <div>
              <p className="text-sm opacity-60 mb-1">EBITDA</p>
              <p className="text-3xl font-bold text-blue-400">{data.financieros?.ebitda?.value || 0}%</p>
              <div className={`flex items-center gap-1 text-xs ${data.financieros?.ebitda?.change >= 0 ? 'text-blue-400/80' : 'text-rose-400/80'} mt-1`}>
                {data.financieros?.ebitda?.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                <span>{Math.abs(data.financieros?.ebitda?.change || 0)}% vs mes anterior</span>
              </div>
            </div>
            <div>
              <p className="text-sm opacity-60 mb-1">ROI</p>
              <p className="text-3xl font-bold text-violet-400">{data.financieros?.roi?.value || 0}%</p>
              <div className={`flex items-center gap-1 text-xs ${data.financieros?.roi?.change >= 0 ? 'text-violet-400/80' : 'text-rose-400/80'} mt-1`}>
                {data.financieros?.roi?.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                <span>{Math.abs(data.financieros?.roi?.change || 0)}% vs mes anterior</span>
              </div>
            </div>
            <div>
              <p className="text-sm opacity-60 mb-1">Cash Flow</p>
              <p className="text-3xl font-bold text-amber-400">{formatCurrency(data.financieros?.cash_flow?.value || 0)}</p>
              <div className={`flex items-center gap-1 text-xs ${data.financieros?.cash_flow?.change >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'} mt-1`}>
                {data.financieros?.cash_flow?.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                <span>{Math.abs(data.financieros?.cash_flow?.change || 0)}% vs mes anterior</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const KpiCard = ({ title, value, change, icon, color }) => {
  const isPositive = change >= 0;
  
  const colorClasses = {
    blue: 'bg-blue-50',
    emerald: 'bg-emerald-50',
    violet: 'bg-violet-50',
    rose: 'bg-rose-50'
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'} bg-opacity-10 px-2 py-1 rounded-full ${isPositive ? 'bg-emerald-50' : 'bg-rose-50'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{Math.abs(change)}%</span>
        </div>
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      </div>
    </div>
  );
};

export default DashboardGerente;
