import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  ShoppingBag, CheckCircle, XCircle, AlertTriangle, TrendingUp, Users, FileText 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../api/config';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const SupervisionCompras = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [relevantPurchases, setRelevantPurchases] = useState([]);
  const [supplierComparison, setSupplierComparison] = useState([]);
  const [overcosts, setOvercosts] = useState({ average: 0, data: [] });
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = { start: dateRange.start, end: dateRange.end };

      const [relRes, supRes, overRes, appRes] = await Promise.all([
        axios.get(`${API_URL}supervision_compras.php?action=relevant_purchases`, { params, headers }),
        axios.get(`${API_URL}supervision_compras.php?action=supplier_comparison`, { params, headers }),
        axios.get(`${API_URL}supervision_compras.php?action=overcosts`, { params, headers }),
        axios.get(`${API_URL}supervision_compras.php?action=get_approvals`, { headers })
      ]);

      const relData = relRes?.data;
      const supData = supRes?.data;
      const overData = overRes?.data;
      const appData = appRes?.data;

      setRelevantPurchases(Array.isArray(relData) ? relData : []);
      setSupplierComparison(Array.isArray(supData) ? supData : []);
      setOvercosts({
        average: overData?.average || 0,
        data: Array.isArray(overData?.data) ? overData.data : []
      });
      setApprovals(Array.isArray(appData) ? appData : []);
    } catch (error) {
      console.error(error);
      toast.error('Error cargando datos de supervisión');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (id, status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}supervision_compras.php?action=manage_approval`, 
        { id, status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Solicitud ${status === 'aprobado' ? 'aprobada' : 'rechazada'}`);
      // Refresh approvals
      const res = await axios.get(`${API_URL}supervision_compras.php?action=get_approvals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApprovals(res.data);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Error procesando solicitud');
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-sm">Compras Relevantes</p>
              <h3 className="text-2xl font-bold">{relevantPurchases.length}</h3>
            </div>
            <ShoppingBag className="text-blue-500" size={32} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-sm">Proveedores Activos</p>
              <h3 className="text-2xl font-bold">{supplierComparison.length}</h3>
            </div>
            <Users className="text-green-500" size={32} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-yellow-500">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-sm">Pendientes Aprobación</p>
              <h3 className="text-2xl font-bold">
                {approvals.filter(a => a.estado === 'pendiente').length}
              </h3>
            </div>
            <FileText className="text-yellow-500" size={32} />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4">Gasto por Proveedor</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplierComparison}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="proveedor" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#8884d8" name="Total (S/)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4">Top 10 Compras Relevantes</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {relevantPurchases.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.fecha_emision}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.proveedor_razon_social}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">S/ {parseFloat(p.importe_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOvercosts = () => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="text-red-500" />
          Análisis de Sobrecostos (Compras Mayores al Promedio)
        </h3>
        <div className="text-sm text-gray-600">
          Promedio del Periodo: <span className="font-bold">S/ {parseFloat(overcosts.average).toFixed(2)}</span>
        </div>
      </div>

      {overcosts.data.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No se detectaron sobrecostos significativos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Desviación</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {overcosts.data.map((p) => {
                const deviation = ((p.importe_total - overcosts.average) / overcosts.average) * 100;
                return (
                  <tr key={p.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.fecha_emision}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.proveedor_razon_social}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">S/ {parseFloat(p.importe_total).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold">
                      +{deviation.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderApprovals = () => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
        <CheckCircle className="text-blue-500" />
        Gestión de Aprobaciones
      </h3>

      <div className="space-y-4">
        {approvals.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No hay solicitudes pendientes.</p>
        ) : (
          approvals.map((approval) => (
            <div key={approval.id} className="border rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full 
                    ${approval.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-800' : 
                      approval.estado === 'aprobado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {approval.estado.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">{approval.fecha_solicitud}</span>
                </div>
                <h4 className="font-bold text-gray-800">{approval.descripcion}</h4>
                <p className="text-sm text-gray-600">Tipo: {approval.tipo_solicitud}</p>
                {approval.aprobado_por && (
                  <p className="text-xs text-gray-500 mt-1">
                    Gestionado por: {approval.aprobador} el {approval.fecha_respuesta}
                  </p>
                )}
              </div>

              {approval.estado === 'pendiente' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproval(approval.id, 'rechazado')}
                    className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                  >
                    <XCircle size={18} /> Rechazar
                  </button>
                  <button
                    onClick={() => handleApproval(approval.id, 'aprobado')}
                    className="flex items-center gap-1 px-3 py-2 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors"
                  >
                    <CheckCircle size={18} /> Aprobar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <ShoppingBag className="text-blue-600" size={32} />
            Supervisión de Compras
          </h1>
          <p className="text-gray-600 mt-1">Control de gastos, proveedores y aprobaciones</p>
        </div>
        
        <div className="flex gap-2 items-center bg-white p-2 rounded-lg shadow-sm border">
          <input 
            type="date" 
            value={dateRange.start}
            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
            className="border-none outline-none text-sm"
          />
          <span className="text-gray-400">-</span>
          <input 
            type="date" 
            value={dateRange.end}
            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
            className="border-none outline-none text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2 px-4 font-medium transition-colors relative ${
            activeTab === 'overview' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Resumen General
          {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
        </button>
        <button
          onClick={() => setActiveTab('overcosts')}
          className={`pb-2 px-4 font-medium transition-colors relative ${
            activeTab === 'overcosts' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Sobrecostos
          {activeTab === 'overcosts' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
        </button>
        <button
          onClick={() => setActiveTab('approvals')}
          className={`pb-2 px-4 font-medium transition-colors relative ${
            activeTab === 'approvals' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Aprobaciones
          {approvals.filter(a => a.estado === 'pendiente').length > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {approvals.filter(a => a.estado === 'pendiente').length}
            </span>
          )}
          {activeTab === 'approvals' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="animate-fade-in">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'overcosts' && renderOvercosts()}
          {activeTab === 'approvals' && renderApprovals()}
        </div>
      )}
    </div>
  );
};

export default SupervisionCompras;
