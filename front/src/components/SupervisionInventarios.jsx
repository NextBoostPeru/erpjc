import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { 
  Package, AlertTriangle, TrendingDown, DollarSign, Calendar, 
  RotateCw, Archive, ClipboardList, AlertCircle 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const SupervisionInventarios = () => {
  const [kpiData, setKpiData] = useState({
    valorizacion: 0,
    rotacion: 0,
    mermas: 0,
    stock_critico: 0,
    vencimientos: 0
  });
  const [stockCriticoData, setStockCriticoData] = useState([]);
  const [vencimientosData, setVencimientosData] = useState([]);
  const [mermasData, setMermasData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, critico, vencimientos, mermas

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const kpiRes = await axios.get(`${API_URL}supervision_inventarios.php?action=dashboard`, { headers });
      setKpiData(kpiRes.data);

      if (activeTab === 'critico') {
        const criticoRes = await axios.get(`${API_URL}supervision_inventarios.php?action=stock_critico`, { headers });
        setStockCriticoData(criticoRes.data);
      } else if (activeTab === 'vencimientos') {
        const vencRes = await axios.get(`${API_URL}supervision_inventarios.php?action=vencimientos`, { headers });
        setVencimientosData(vencRes.data);
      } else if (activeTab === 'mermas') {
        const mermasRes = await axios.get(`${API_URL}supervision_inventarios.php?action=mermas_detalle`, { headers });
        setMermasData(mermasRes.data);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const formatCurrency = (val) => `S/ ${parseFloat(val).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

  const KPICard = ({ title, value, icon: Icon, color, subtext }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
        <span className="text-sm font-medium text-gray-400">{subtext}</span>
      </div>
      <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Control de Inventarios</h1>
        <div className="flex gap-2">
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
                Resumen
            </button>
            <button 
                onClick={() => setActiveTab('critico')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'critico' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
                Stock Crítico
            </button>
            <button 
                onClick={() => setActiveTab('vencimientos')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'vencimientos' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
                Vencimientos
            </button>
             <button 
                onClick={() => setActiveTab('mermas')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'mermas' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
                Mermas
            </button>
        </div>
      </div>

      {/* KPI Section - Always visible or only on dashboard? Let's keep it visible on top or just dashboard */}
      {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <KPICard 
              title="Valorización Total" 
              value={formatCurrency(kpiData.valorizacion)} 
              icon={DollarSign} 
              color="bg-emerald-500"
              subtext="Costo Total"
            />
            <KPICard 
              title="Rotación (30d)" 
              value={`${kpiData.rotacion}x`} 
              icon={RotateCw} 
              color="bg-blue-500"
              subtext="Vueltas"
            />
            <KPICard 
              title="Mermas (30d)" 
              value={formatCurrency(kpiData.mermas)} 
              icon={TrendingDown} 
              color="bg-red-500"
              subtext="Pérdidas"
            />
            <KPICard 
              title="Stock Crítico" 
              value={kpiData.stock_critico} 
              icon={AlertTriangle} 
              color="bg-amber-500"
              subtext="Productos"
            />
            <KPICard 
              title="Vencimientos" 
              value={kpiData.vencimientos} 
              icon={Calendar} 
              color="bg-purple-500"
              subtext="Próx. 30 días"
            />
          </div>
      )}

      {/* Content Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        
        {activeTab === 'dashboard' && (
            <div className="text-center py-10">
                <ClipboardList size={64} className="mx-auto text-gray-300 mb-4"/>
                <h3 className="text-lg font-medium text-gray-600">Resumen General</h3>
                <p className="text-gray-400 max-w-md mx-auto mt-2">
                    Seleccione una pestaña arriba para ver los detalles de stock crítico, vencimientos o mermas.
                </p>
                {/* Could add charts here later */}
            </div>
        )}

        {activeTab === 'critico' && (
            <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-amber-500"/>
                    Productos con Stock Crítico
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-100 text-gray-500 text-sm">
                                <th className="pb-3 font-medium">Código</th>
                                <th className="pb-3 font-medium">Producto</th>
                                <th className="pb-3 font-medium text-right">Stock Actual</th>
                                <th className="pb-3 font-medium text-right">Stock Mínimo</th>
                                <th className="pb-3 font-medium text-right">Déficit</th>
                                <th className="pb-3 font-medium text-right">Valor Stock</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {stockCriticoData.length > 0 ? (
                                stockCriticoData.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-3 text-sm text-gray-600">{item.codigo_interno || '-'}</td>
                                        <td className="py-3 text-sm font-medium text-gray-800">{item.nombre}</td>
                                        <td className="py-3 text-sm text-gray-800 text-right font-bold text-red-600">{item.stock}</td>
                                        <td className="py-3 text-sm text-gray-600 text-right">{item.stock_minimo}</td>
                                        <td className="py-3 text-sm text-gray-600 text-right">{item.stock_minimo - item.stock}</td>
                                        <td className="py-3 text-sm text-gray-600 text-right">{formatCurrency(item.valor_actual)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="py-8 text-center text-gray-500">
                                        No hay productos en estado crítico.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'vencimientos' && (
            <div>
                 <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-purple-500"/>
                    Próximos Vencimientos (60 días)
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-100 text-gray-500 text-sm">
                                <th className="pb-3 font-medium">Lote</th>
                                <th className="pb-3 font-medium">Producto</th>
                                <th className="pb-3 font-medium">Fecha Venc.</th>
                                <th className="pb-3 font-medium text-right">Cantidad</th>
                                <th className="pb-3 font-medium text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {vencimientosData.length > 0 ? (
                                vencimientosData.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-3 text-sm text-gray-600">{item.numero_lote}</td>
                                        <td className="py-3 text-sm font-medium text-gray-800">{item.producto}</td>
                                        <td className="py-3 text-sm text-gray-800">
                                            {new Date(item.fecha_vencimiento).toLocaleDateString()}
                                            {new Date(item.fecha_vencimiento) < new Date() && (
                                                <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Vencido</span>
                                            )}
                                        </td>
                                        <td className="py-3 text-sm text-gray-800 text-right">{item.cantidad_actual}</td>
                                        <td className="py-3 text-center">
                                            <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">Activo</span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="py-8 text-center text-gray-500">
                                        No hay lotes próximos a vencer.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'mermas' && (
            <div>
                 <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingDown size={20} className="text-red-500"/>
                    Registro de Mermas Recientes
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-100 text-gray-500 text-sm">
                                <th className="pb-3 font-medium">Fecha</th>
                                <th className="pb-3 font-medium">Producto</th>
                                <th className="pb-3 font-medium text-right">Cantidad</th>
                                <th className="pb-3 font-medium text-right">Costo Unit.</th>
                                <th className="pb-3 font-medium text-right">Total Pérdida</th>
                                <th className="pb-3 font-medium">Observación</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {mermasData.length > 0 ? (
                                mermasData.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-3 text-sm text-gray-600">{new Date(item.fecha).toLocaleDateString()}</td>
                                        <td className="py-3 text-sm font-medium text-gray-800">{item.producto}</td>
                                        <td className="py-3 text-sm text-gray-800 text-right">{item.cantidad}</td>
                                        <td className="py-3 text-sm text-gray-600 text-right">{formatCurrency(item.costo_unitario)}</td>
                                        <td className="py-3 text-sm font-bold text-red-600 text-right">{formatCurrency(item.total_movimiento)}</td>
                                        <td className="py-3 text-sm text-gray-500 italic">{item.observacion || '-'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="py-8 text-center text-gray-500">
                                        No hay registros de mermas recientes.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default SupervisionInventarios;
