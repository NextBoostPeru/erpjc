import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, Users, ShoppingBag, CheckCircle, XCircle, AlertCircle, 
  Calendar, DollarSign, Percent 
} from 'lucide-react';

import { API_URL } from '../api/config';

const SupervisionVentas = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  
  const [reports, setReports] = useState({
    by_area: [],
    by_seller: [],
    by_product: [],
    margins: { ventas_netas: 0, costo_estimado: 0, margen_bruto: 0, margen_porcentaje: 0 },
    projection: { current_total: 0, projected_total: 0, daily_average: 0 }
  });

  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchReports();
    } else {
      fetchApprovals();
    }
  }, [activeTab, startDate, endDate]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}supervision_ventas.php?action=reports&start_date=${startDate}&end_date=${endDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReports(res.data);
    } catch (error) {
      console.error(error);
      toast.error('Error cargando reportes');
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}supervision_ventas.php?action=approvals&status=pendiente`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApprovals(res.data);
    } catch (error) {
      console.error(error);
      toast.error('Error cargando aprobaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (id, status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}supervision_ventas.php?action=manage_approval`, 
        { id, status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Solicitud ${status === 'aprobado' ? 'aprobada' : 'rechazada'}`);
      fetchApprovals();
    } catch (error) {
      console.error(error);
      toast.error('Error procesando solicitud');
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  const truncateText = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="text-blue-600" />
          Supervisión de Ventas
        </h1>
        <div className="flex gap-2">
            <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
            >
                Dashboard
            </button>
            <button
                onClick={() => setActiveTab('approvals')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'approvals' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
            >
                Aprobaciones
                {approvals.length > 0 && (
                    <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {approvals.length}
                    </span>
                )}
            </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 items-center">
            <Calendar className="text-gray-400" size={20} />
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-600">Desde:</span>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                className="border rounded p-1 text-sm"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-600">Hasta:</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                className="border rounded p-1 text-sm"
              />
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">Proyección Mes Actual</p>
                        <h3 className="text-2xl font-bold text-gray-800 mt-1">
                            S/ {Number(reports.projection.projected_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </h3>
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <TrendingUp size={12} />
                            Base: S/ {Number(reports.projection.current_total).toLocaleString('es-PE')} (Actual)
                        </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <TrendingUp className="text-blue-600" size={24} />
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">Margen Bruto</p>
                        <h3 className="text-2xl font-bold text-gray-800 mt-1">
                            {Number(reports.margins.margen_porcentaje).toFixed(2)}%
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            S/ {Number(reports.margins.margen_bruto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                        <Percent className="text-green-600" size={24} />
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">Ventas Totales (Periodo)</p>
                        <h3 className="text-2xl font-bold text-gray-800 mt-1">
                            S/ {Number(reports.margins.ventas_netas).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </h3>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                        <DollarSign className="text-purple-600" size={24} />
                    </div>
                </div>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Users size={18} /> Ranking Comercial (Vendedores)
                </h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reports.by_seller} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="vendedor" type="category" width={100} />
                            <Tooltip formatter={(value) => `S/ ${Number(value).toLocaleString()}`} />
                            <Bar dataKey="total" fill="#4F46E5" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ShoppingBag size={18} /> Top Productos
                </h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reports.by_product} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis 
                                dataKey="descripcion" 
                                type="category" 
                                width={220} 
                                tick={{fontSize: 11}} 
                                tickFormatter={(value) => truncateText(value, 35)}
                                interval={0}
                            />
                            <Tooltip formatter={(value) => `S/ ${Number(value).toLocaleString()}`} />
                            <Bar dataKey="total" fill="#10B981" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4">Ventas por Área</h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={reports.by_area}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="total"
                            >
                                {reports.by_area.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => `S/ ${Number(value).toLocaleString()}`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <AlertCircle className="text-orange-500" />
                    Solicitudes Pendientes
                </h3>
            </div>
            
            {approvals.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                    No hay solicitudes pendientes de aprobación.
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {approvals.map(app => (
                        <div key={app.id} className="p-6 flex items-start justify-between hover:bg-gray-50 transition-colors">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                                        app.tipo === 'descuento' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                    }`}>
                                        {app.tipo.replace('_', ' ')}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        Solicitado por: <span className="font-medium text-gray-800">{app.solicitante}</span>
                                    </span>
                                    <span className="text-sm text-gray-400">
                                        • {new Date(app.fecha_solicitud).toLocaleDateString()}
                                    </span>
                                </div>
                                <h4 className="font-medium text-gray-900 mb-1">{app.descripcion}</h4>
                                <pre className="text-xs text-gray-500 bg-gray-50 p-2 rounded mt-2 font-mono overflow-x-auto max-w-xl">
                                    {app.data_json}
                                </pre>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleApproval(app.id, 'aprobado')}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                                >
                                    <CheckCircle size={16} /> Aprobar
                                </button>
                                <button
                                    onClick={() => handleApproval(app.id, 'rechazado')}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
                                >
                                    <XCircle size={16} /> Rechazar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default SupervisionVentas;
