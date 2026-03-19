import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  TrendingUp, Calendar, Target, DollarSign, User
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { API_URL } from '../api/config';

const DashboardVendedor = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
      try {
        const res = await axios.get(`${API_URL}dashboard_vendedor.php`, {
          headers: getAuthHeaders()
        });
      setStats(res.data);
    } catch (err) {
      console.error("Error loading dashboard", err);
      setError("No se pudo cargar la información del dashboard.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!stats) return null;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Mis Ventas</h1>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-500 mb-1">Ventas este Mes</p>
                <h3 className="text-2xl font-bold text-blue-600">S/ {parseFloat(stats.ventas_mes).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
                <p className="text-xs text-gray-400 mt-1">{stats.cantidad_ventas} operaciones</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
                <DollarSign className="text-blue-600" size={24} />
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-500 mb-1">Ventas Hoy</p>
                <h3 className="text-2xl font-bold text-green-600">S/ {parseFloat(stats.ventas_hoy).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
                <Calendar className="text-green-600" size={24} />
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-500 mb-1">Meta Mensual</p>
                <h3 className="text-2xl font-bold text-purple-600">{parseFloat(stats.porcentaje_meta).toFixed(1)}%</h3>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                    <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: `${Math.min(stats.porcentaje_meta, 100)}%` }}></div>
                </div>
                <p className="text-xs text-gray-400 mt-1">Meta: S/ {parseFloat(stats.meta_mes).toLocaleString('es-PE')}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
                <Target className="text-purple-600" size={24} />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Evolución de Ventas</h2>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={stats.grafico_ventas}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="mes" />
                        <YAxis />
                        <Tooltip formatter={(value) => `S/ ${parseFloat(value).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`} />
                        <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Últimas Ventas */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Últimas Ventas</h2>
            <div className="overflow-y-auto max-h-80">
                <table className="w-full">
                    <thead className="text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">
                        <tr>
                            <th className="p-3">Cliente</th>
                            <th className="p-3 text-right">Monto</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {stats.ultimas_ventas.map((venta) => (
                            <tr key={venta.id} className="hover:bg-gray-50">
                                <td className="p-3">
                                    <p className="text-sm font-medium text-gray-700">{venta.cliente_nombre || 'Cliente Final'}</p>
                                    <p className="text-xs text-gray-400">{venta.serie}-{venta.correlativo}</p>
                                </td>
                                <td className="p-3 text-right font-bold text-gray-700">
                                    S/ {parseFloat(venta.total_importe).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        ))}
                        {stats.ultimas_ventas.length === 0 && (
                            <tr>
                                <td colSpan="2" className="p-4 text-center text-gray-500">No hay ventas recientes</td>
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

export default DashboardVendedor;
