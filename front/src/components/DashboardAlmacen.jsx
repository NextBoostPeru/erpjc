import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Package, AlertTriangle, TrendingDown, TrendingUp, 
  RotateCcw, DollarSign, Activity, ArrowRight, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { API_URL } from '../api/config';

const DashboardAlmacen = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await axios.get(`${API_URL}dashboard_almacen.php`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setStats(res.data);
    } catch (error) {
      console.error("Error loading dashboard", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando dashboard...</div>;
  }

  if (!stats) return null;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard de Almacén</h1>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Productos" 
          value={stats.total_productos} 
          icon={<Package className="text-blue-600" size={24} />}
          bg="bg-blue-50"
        />
        <StatCard 
          title="Valor Inventario" 
          value={`S/ ${parseFloat(stats.valor_inventario).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`} 
          icon={<DollarSign className="text-green-600" size={24} />}
          bg="bg-green-50"
        />
        <StatCard 
          title="Alertas Stock Bajo" 
          value={stats.stock_bajo_count} 
          icon={<AlertTriangle className="text-orange-600" size={24} />}
          bg="bg-orange-50"
          alert={stats.stock_bajo_count > 0}
        />
        <StatCard 
          title="Devoluciones Pendientes" 
          value={stats.devoluciones_pendientes} 
          icon={<RotateCcw className="text-purple-600" size={24} />}
          bg="bg-purple-50"
          alert={stats.devoluciones_pendientes > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda: Alertas y Movimientos */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Stock Bajo */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-500" />
              Productos con Stock Crítico
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-right">Stock Actual</th>
                    <th className="p-3 text-right">Mínimo</th>
                    <th className="p-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.lista_stock_bajo.map((prod) => (
                    <tr key={prod.id} className="hover:bg-gray-50">
                      <td className="p-3 text-sm font-medium text-gray-700">{prod.nombre}</td>
                      <td className="p-3 text-sm text-right font-bold text-red-600">{parseFloat(prod.stock)} {prod.unidad_medida}</td>
                      <td className="p-3 text-sm text-right text-gray-500">{parseFloat(prod.stock_minimo)}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 font-medium">Bajo</span>
                      </td>
                    </tr>
                  ))}
                  {stats.lista_stock_bajo.length === 0 && (
                    <tr>
                      <td colSpan="4" className="p-4 text-center text-gray-400">Todo en orden</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Últimos Movimientos */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Activity size={20} className="text-blue-500" />
              Últimos Movimientos
            </h2>
            <div className="space-y-4">
              {stats.ultimos_movimientos.map((mov) => (
                <div key={mov.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${mov.tipo === 'entrada' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {mov.tipo === 'entrada' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{mov.motivo}</p>
                      <p className="text-xs text-gray-500">{mov.fecha} • {mov.usuario}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${mov.tipo === 'entrada' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                    {mov.tipo.toUpperCase()}
                  </span>
                </div>
              ))}
              {stats.ultimos_movimientos.length === 0 && (
                <p className="text-center text-gray-400 py-4">No hay movimientos recientes</p>
              )}
            </div>
          </div>

        </div>

        {/* Columna Derecha: Gráficos */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Top Salidas (30 días)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.top_salidas}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="nombre" hide />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f3f4f6' }}
                  />
                  <Bar dataKey="total_salida" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Cantidad" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {stats.top_salidas.map((item, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 truncate w-3/4">{index + 1}. {item.nombre}</span>
                  <span className="font-semibold text-gray-800">{item.total_salida}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, bg, alert }) => (
  <div className={`bg-white p-6 rounded-xl shadow-sm border ${alert ? 'border-red-200 ring-2 ring-red-50' : 'border-gray-100'}`}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-lg ${bg}`}>
        {icon}
      </div>
    </div>
  </div>
);

export default DashboardAlmacen;
