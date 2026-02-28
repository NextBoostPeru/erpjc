import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Activity, Search, Calendar, User, Layout as LayoutIcon, AlertCircle, RefreshCw, BarChart2, TrendingUp, Users 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line 
} from 'recharts';

import { API_URL } from '../api/config';

const ReportesLogs = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ daily: [], top_users: [], total_today: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    fecha_inicio: '',
    fecha_fin: '',
    usuario_id: '',
    modulo: ''
  });

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}logs.php?stats=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.fecha_inicio) params.append('fecha_inicio', filters.fecha_inicio);
      if (filters.fecha_fin) params.append('fecha_fin', filters.fecha_fin);
      if (filters.usuario_id) params.append('usuario_id', filters.usuario_id);
      if (filters.modulo) params.append('modulo', filters.modulo);

      const response = await axios.get(`${API_URL}logs.php?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(response.data);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLogs();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
          <Activity className="text-blue-600" />
          Monitoreo y Estadísticas del Sistema
        </h1>
        <p className="text-gray-600 mt-2">Seguimiento de rendimiento y actividad de usuarios.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                    <Activity size={24} />
                </div>
                <div>
                    <p className="text-sm text-gray-500 font-medium">Consultas Hoy</p>
                    <h3 className="text-2xl font-bold text-gray-900">{stats.total_today || 0}</h3>
                </div>
            </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 col-span-2">
            <div className="h-64">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-green-600" />
                    Tendencia de Consultas (Últimos 30 días)
                </h3>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.daily || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                            dataKey="fecha" 
                            tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                            tick={{fontSize: 12}}
                        />
                        <YAxis tick={{fontSize: 12}} />
                        <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Top Users Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 md:col-span-1">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Users size={20} className="text-purple-600" />
                  Usuarios Activos Hoy
              </h3>
              <div className="space-y-4">
                  {(stats.top_users || []).length > 0 ? (
                      stats.top_users.map((user, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs">
                                      {user.usuario.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium text-gray-700">{user.usuario}</span>
                              </div>
                              <span className="text-sm font-bold text-gray-900">{user.total} reqs</span>
                          </div>
                      ))
                  ) : (
                      <p className="text-gray-500 text-center py-4">No hay actividad hoy</p>
                  )}
              </div>
          </div>

          {/* Filters & Logs Table */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                    <input
                        type="date"
                        name="fecha_inicio"
                        value={filters.fecha_inicio}
                        onChange={handleFilterChange}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                    <input
                        type="date"
                        name="fecha_fin"
                        value={filters.fecha_fin}
                        onChange={handleFilterChange}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Módulo</label>
                    <select
                        name="modulo"
                        value={filters.modulo}
                        onChange={handleFilterChange}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="">Todos</option>
                        <option value="LOGIN">Login</option>
                        <option value="API">API</option>
                        <option value="VENTAS">Ventas</option>
                        <option value="COMPRAS">Compras</option>
                    </select>
                </div>
                <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                    <Search size={16} />
                    Filtrar Logs
                </button>
                </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 font-semibold uppercase border-b sticky top-0">
                    <tr>
                        <th className="px-6 py-4">Hora</th>
                        <th className="px-6 py-4">Usuario</th>
                        <th className="px-6 py-4">Acción</th>
                        <th className="px-6 py-4">Detalle</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                    {loading ? (
                        <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                            Cargando...
                        </td>
                        </tr>
                    ) : logs.length === 0 ? (
                        <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                            No se encontraron registros.
                        </td>
                        </tr>
                    ) : (
                        logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-6 py-3 whitespace-nowrap text-xs">
                            {new Date(log.fecha).toLocaleString()}
                            </td>
                            <td className="px-6 py-3 font-medium text-gray-800">
                            {log.usuario_real || log.usuario_nombre}
                            </td>
                            <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                log.accion === 'LOGIN' ? 'bg-green-100 text-green-800' :
                                log.accion === 'DELETE' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                            }`}>
                                {log.accion}
                            </span>
                            </td>
                            <td className="px-6 py-3 text-xs truncate max-w-xs" title={log.descripcion}>
                            {log.descripcion}
                            </td>
                        </tr>
                        ))
                    )}
                    </tbody>
                </table>
                </div>
            </div>
          </div>
      </div>
    </div>
  );
};

export default ReportesLogs;