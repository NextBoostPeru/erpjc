import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  DollarSign, TrendingUp, TrendingDown, FileText, 
  CreditCard, Activity, ArrowUpRight, ArrowDownRight, PieChart, Users, ShoppingCart
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { API_URL } from '../api/config';

const DashboardContabilidad = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await axios.get(`${API_URL}dashboard_contabilidad.php`, {
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

  const formatCurrency = (amount) => {
    return `S/ ${parseFloat(amount).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Contable</h1>

      {/* Tarjetas de Resumen Financiero */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Ventas del Mes" 
          value={formatCurrency(stats.ventas_mes)} 
          icon={<TrendingUp className="text-green-600" size={24} />}
          bg="bg-green-50"
        />
        <StatCard 
          title="Compras del Mes" 
          value={formatCurrency(stats.compras_mes)} 
          icon={<TrendingDown className="text-red-600" size={24} />}
          bg="bg-red-50"
        />
        <StatCard 
          title="Cuentas por Cobrar" 
          value={formatCurrency(stats.cuentas_por_cobrar)} 
          icon={<ArrowUpRight className="text-blue-600" size={24} />}
          bg="bg-blue-50"
        />
        <StatCard 
          title="Cuentas por Pagar" 
          value={formatCurrency(stats.cuentas_por_pagar)} 
          icon={<ArrowDownRight className="text-orange-600" size={24} />}
          bg="bg-orange-50"
        />
      </div>

      {/* Gráfico de Evolución */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={20} className="text-blue-500" />
            Evolución Semestral: Ventas vs Compras
        </h2>
        <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.evolucion}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                    <Legend />
                    <Bar dataKey="ventas" name="Ventas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="compras" name="Compras" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Clientes */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Users size={20} className="text-blue-500" />
                  Top 5 Clientes (Mes Actual)
              </h2>
              <div className="space-y-3">
                  {stats.top_clientes?.map((cliente, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700 truncate w-2/3" title={cliente.nombre}>{cliente.nombre}</span>
                          <span className="font-semibold text-blue-600 text-sm">{formatCurrency(cliente.total)}</span>
                      </div>
                  ))}
                  {(!stats.top_clientes || stats.top_clientes.length === 0) && (
                      <p className="text-gray-400 text-center py-4">No hay datos registrados</p>
                  )}
              </div>
          </div>

          {/* Top Proveedores */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <ShoppingCart size={20} className="text-orange-500" />
                  Top 5 Proveedores (Mes Actual)
              </h2>
              <div className="space-y-3">
                  {stats.top_proveedores?.map((prov, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700 truncate w-2/3" title={prov.nombre}>{prov.nombre}</span>
                          <span className="font-semibold text-orange-600 text-sm">{formatCurrency(prov.total)}</span>
                      </div>
                  ))}
                  {(!stats.top_proveedores || stats.top_proveedores.length === 0) && (
                      <p className="text-gray-400 text-center py-4">No hay datos registrados</p>
                  )}
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda: Impuestos y Estado */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <PieChart size={20} className="text-purple-500" />
              Estimación IGV (Mes Actual)
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">IGV Ventas</span>
                <span className="font-semibold text-green-600">{formatCurrency(stats.igv_ventas)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">IGV Compras</span>
                <span className="font-semibold text-red-600">{formatCurrency(stats.igv_compras)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                <span className="font-bold text-gray-800">A Pagar Aprox.</span>
                <span className="font-bold text-purple-600 text-lg">{formatCurrency(stats.igv_por_pagar)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Central/Derecha: Últimos Asientos */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-blue-500" />
            Últimos Asientos Contables
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Glosa</th>
                  <th className="p-3 text-right">Debe</th>
                  <th className="p-3 text-right">Haber</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.ultimos_asientos.map((asiento) => (
                  <tr key={asiento.id} className="hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-500">{asiento.fecha}</td>
                    <td className="p-3 text-sm font-medium text-gray-700">{asiento.glosa}</td>
                    <td className="p-3 text-sm text-right font-mono text-gray-700">{formatCurrency(asiento.total_debe)}</td>
                    <td className="p-3 text-sm text-right font-mono text-gray-700">{formatCurrency(asiento.total_haber)}</td>
                  </tr>
                ))}
                {stats.ultimos_asientos.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-4 text-center text-gray-400">No hay asientos recientes</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, bg }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
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

export default DashboardContabilidad;
