import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../api/config';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, AlertTriangle, 
  FileText, Calendar, Activity, CheckCircle 
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const DashboardContador = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  const getAuthHeaders = () => {
    const t = localStorage.getItem('token') || '';
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) {
        navigate('/');
        return;
      }
      try {
        const res = await axios.get(`${API_URL}dashboard_contador.php`, {
          headers: getAuthHeaders()
        });
        setStats(res.data);
      } catch (error) {
        if (error.response && error.response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('modulos');
          toast.error("Sesión expirada. Por favor inicie sesión nuevamente.");
          navigate('/');
          return;
        }
        console.error("Error cargando dashboard:", error);
        toast.error("Error al cargar datos del dashboard");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [token, navigate]);

  const formatCurrency = (val) => {
    const num = parseFloat(val || 0);
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(num);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  const incomeExpenseData = [
    { name: 'Ingresos', value: parseFloat(stats?.ingresos_mes || 0), color: '#10b981' },
    { name: 'Gastos', value: parseFloat(stats?.gastos_mes || 0), color: '#ef4444' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Hola, {user?.usuario || 'Contador'}</h1>
          <p className="text-gray-500">Resumen financiero y operativo del mes.</p>
        </div>
        <div 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                stats?.periodo_actual === 'abierto' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}
        >
            <Calendar size={18} />
            Periodo {stats?.periodo_nombre}: {stats?.periodo_actual?.toUpperCase()}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
            title="Ingresos del Mes" 
            value={formatCurrency(stats?.ingresos_mes)} 
            icon={TrendingUp} 
            color="text-green-600"
            bg="bg-green-50"
        />
        <KpiCard 
            title="Gastos del Mes" 
            value={formatCurrency(stats?.gastos_mes)} 
            icon={TrendingDown} 
            color="text-red-600"
            bg="bg-red-50"
        />
        <KpiCard 
            title="Asientos Borrador" 
            value={stats?.asientos_pendientes} 
            icon={FileText} 
            color="text-yellow-600"
            bg="bg-yellow-50"
        />
        <KpiCard 
            title="Clientes Activos" 
            value={stats?.clientes_count} 
            icon={Users} 
            color="text-blue-600"
            bg="bg-blue-50"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Ingresos vs Gastos</h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={incomeExpenseData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip 
                            formatter={(value) => formatCurrency(value)}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60}>
                            {incomeExpenseData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Taxes & Alerts Section */}
        <div className="space-y-6">
            
            {/* Impuestos Pendientes */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Impuestos por Vencer</h3>
                    <AlertTriangle size={20} className="text-yellow-500" />
                </div>
                {stats?.impuestos_pendientes?.length > 0 ? (
                    <div className="space-y-3">
                        {stats.impuestos_pendientes.map((imp, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div>
                                    <div className="font-medium text-gray-800">{imp.nombre}</div>
                                    <div className="text-xs text-orange-600 font-medium">Vence: {imp.fecha_vencimiento}</div>
                                </div>
                                <div className="font-bold text-gray-900">{formatCurrency(imp.monto)}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
                        <p className="text-sm">No hay impuestos pendientes próximos.</p>
                    </div>
                )}
            </div>

            {/* Actividad Reciente */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Actividad Reciente</h3>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {stats?.auditoria_reciente?.map((audit, idx) => (
                        <div key={idx} className="flex gap-3 text-sm">
                            <div className={`mt-1 p-1.5 rounded-full shrink-0 h-fit ${
                                audit.accion === 'INSERT' ? 'bg-green-100 text-green-600' : 
                                audit.accion === 'DELETE' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                            }`}>
                                <Activity size={14} />
                            </div>
                            <div>
                                <div className="font-medium text-gray-700">
                                    {audit.accion} en <span className="text-gray-900">{audit.tabla_afectada}</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">
                                    {audit.fecha_hora}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

const KpiCard = ({ title, value, icon: Icon, color, bg }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center gap-4 transition-transform hover:-translate-y-1 duration-200">
        <div className={`p-3 rounded-lg ${bg} ${color}`}>
            <Icon size={24} />
        </div>
        <div>
            <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
        </div>
    </div>
);

export default DashboardContador;
