import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
  DollarSign, TrendingUp, TrendingDown, Activity, AlertCircle, FileText, 
  ArrowUpCircle, ArrowDownCircle, PieChart as PieIcon 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../api/config';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const SupervisionFinanciera = () => {
  const [activeTab, setActiveTab] = useState('pnl'); // pnl, balance, cashflow, debt
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Start of year
    end: new Date().toISOString().split('T')[0]
  });

  const [pnlData, setPnlData] = useState(null);
  const [balanceData, setBalanceData] = useState(null);
  const [cashFlowData, setCashFlowData] = useState(null);
  const [debtData, setDebtData] = useState(null);
  const [arApData, setArApData] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeTab, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = { start: dateRange.start, end: dateRange.end };

      if (activeTab === 'pnl') {
        const res = await axios.get(`${API_URL}/supervision_financiera.php?action=pnl`, { params, headers });
        setPnlData(res.data || {});
      } else if (activeTab === 'balance') {
        const res = await axios.get(`${API_URL}/supervision_financiera.php?action=balance`, { headers });
        setBalanceData(res.data || {});
      } else if (activeTab === 'cashflow') {
        const res = await axios.get(`${API_URL}/supervision_financiera.php?action=cash_flow`, { headers });
        setCashFlowData(res.data || { projection: [], current_cash: 0 });
      } else if (activeTab === 'debt') {
        const res = await axios.get(`${API_URL}/supervision_financiera.php?action=debt_metrics`, { headers });
        const res2 = await axios.get(`${API_URL}/supervision_financiera.php?action=ar_ap_details`, { headers });
        setDebtData(res.data || {});
        setArApData(res2.data || { ar: [], ap: [] });
      }
    } catch (error) {
      console.error(error);
      toast.error('Error cargando datos financieros');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => `S/ ${parseFloat(val).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

  const renderPnL = () => {
    if (!pnlData) return null;
    const waterfallData = [
      { name: 'Ingresos', value: parseFloat(pnlData.ingresos), fill: '#4ade80' }, // Green
      { name: 'Costos', value: -parseFloat(pnlData.costos), fill: '#f87171' }, // Red
      { name: 'Gastos Op.', value: -parseFloat(pnlData.gastos_operativos), fill: '#facc15' }, // Yellow
      { name: 'Utilidad Neta', value: parseFloat(pnlData.utilidad_neta), fill: '#60a5fa', isTotal: true } // Blue
    ];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-gray-500 text-sm">Ingresos Totales</p>
            <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(pnlData.ingresos)}</h3>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-400">
            <p className="text-gray-500 text-sm">Costo de Ventas</p>
            <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(pnlData.costos)}</h3>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-400">
            <p className="text-gray-500 text-sm">Gastos Operativos (Est.)</p>
            <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(pnlData.gastos_operativos)}</h3>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
            <p className="text-gray-500 text-sm">Utilidad Neta</p>
            <h3 className={`text-2xl font-bold ${pnlData.utilidad_neta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(pnlData.utilidad_neta)}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md h-96">
          <h3 className="text-lg font-semibold mb-4">Cascada de Resultados</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Math.abs(value))} />
              <Bar dataKey="value">
                {waterfallData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderBalance = () => {
    if (!balanceData) return null;
    const activosTotal = balanceData.activos?.total || 0;
    const pasivosTotal = balanceData.pasivos?.total || 0;
    const patrimonio = balanceData.patrimonio || 0;

    const data = [
      { name: 'Activos', value: parseFloat(activosTotal) },
      { name: 'Pasivos', value: parseFloat(pasivosTotal) },
      { name: 'Patrimonio', value: parseFloat(patrimonio) }
    ];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Activos */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-bold text-green-700 mb-4 flex items-center gap-2">
              <ArrowUpCircle /> Activos
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Caja y Bancos</span>
                <span className="font-semibold">{formatCurrency(balanceData.activos?.caja_bancos || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cuentas por Cobrar</span>
                <span className="font-semibold">{formatCurrency(balanceData.activos?.cuentas_por_cobrar || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Inventario</span>
                <span className="font-semibold">{formatCurrency(balanceData.activos?.inventario || 0)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-lg">
                <span>Total Activos</span>
                <span>{formatCurrency(activosTotal)}</span>
              </div>
            </div>
          </div>

          {/* Pasivos */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
              <ArrowDownCircle /> Pasivos
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Cuentas por Pagar</span>
                <span className="font-semibold">{formatCurrency(balanceData.pasivos?.cuentas_por_pagar || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Préstamos</span>
                <span className="font-semibold">{formatCurrency(balanceData.pasivos?.prestamos || 0)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-lg">
                <span>Total Pasivos</span>
                <span>{formatCurrency(pasivosTotal)}</span>
              </div>
            </div>
          </div>

          {/* Patrimonio */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-bold text-blue-700 mb-4 flex items-center gap-2">
              <PieIcon /> Patrimonio
            </h3>
            <div className="flex justify-center items-center h-40">
               <div className="text-center">
                 <p className="text-gray-500">Patrimonio Neto</p>
                 <h2 className="text-3xl font-bold text-blue-600">{formatCurrency(patrimonio)}</h2>
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCashFlow = () => {
    if (!cashFlowData) return null;
    const projection = cashFlowData.projection || [];
    
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-semibold">Proyección de Flujo de Caja (30 días)</h3>
             <div className="bg-blue-50 px-4 py-2 rounded-lg">
               <span className="text-sm text-blue-600 font-medium">Saldo Actual: </span>
               <span className="text-lg font-bold text-blue-800">{formatCurrency(cashFlowData.current_cash || 0)}</span>
             </div>
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projection}>
                <defs>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="fecha" />
                <YAxis />
                <CartesianGrid strokeDasharray="3 3" />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Area type="monotone" dataKey="saldo_acumulado" stroke="#8884d8" fillOpacity={1} fill="url(#colorSaldo)" name="Saldo Acumulado" />
                <Line type="monotone" dataKey="ingresos" stroke="#82ca9d" name="Ingresos (Proy.)" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="egresos" stroke="#ff7300" name="Egresos (Proy.)" strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
           <h3 className="text-lg font-semibold mb-4">Detalle Diario</h3>
           <div className="overflow-x-auto max-h-64">
             <table className="min-w-full divide-y divide-gray-200">
               <thead className="bg-gray-50 sticky top-0">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-green-600 uppercase">Ingresos</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-red-600 uppercase">Egresos</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Flujo Neto</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-blue-600 uppercase">Saldo Final</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-gray-200">
                 {projection.map((row, idx) => (
                   <tr key={idx}>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.fecha}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">{formatCurrency(row.ingresos)}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">{formatCurrency(row.egresos)}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">{formatCurrency(row.neto)}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-600">{formatCurrency(row.saldo_acumulado)}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    );
  };

  const renderDebt = () => {
    if (!debtData || !arApData) return null;
    
    const ratioEndeudamiento = parseFloat(debtData.ratio_endeudamiento);
    const debtRatio = isNaN(ratioEndeudamiento) ? 0 : ratioEndeudamiento * 100;
    const debtColor = debtRatio < 40 ? 'text-green-600' : (debtRatio < 70 ? 'text-yellow-600' : 'text-red-600');
    
    const ratioDeudaPatrimonio = parseFloat(debtData.ratio_deuda_patrimonio);
    const debtEquityRatio = isNaN(ratioDeudaPatrimonio) ? 0 : ratioDeudaPatrimonio;

    const apList = arApData.ap || [];
    const arList = arApData.ar || [];

    return (
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="bg-white p-6 rounded-lg shadow-md flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Ratio de Endeudamiento (Pasivo/Activo)</p>
                <h3 className={`text-3xl font-bold ${debtColor}`}>{debtRatio.toFixed(1)}%</h3>
                <p className="text-xs text-gray-400 mt-1">Óptimo: &lt; 60%</p>
              </div>
              <Activity className="text-gray-300" size={48} />
           </div>
           <div className="bg-white p-6 rounded-lg shadow-md flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Ratio Deuda/Patrimonio</p>
                <h3 className="text-3xl font-bold text-gray-800">{debtEquityRatio.toFixed(2)}x</h3>
              </div>
              <TrendingDown className="text-gray-300" size={48} />
           </div>
        </div>

        {/* AR / AP Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-4 text-red-600">Cuentas por Pagar (Top 5 Proveedores)</h3>
            <table className="min-w-full">
              <tbody className="divide-y divide-gray-100">
                {apList.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2 text-sm text-gray-700">{item.nombre}</td>
                    <td className="py-2 text-sm font-bold text-right">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
                {apList.length === 0 && <tr><td colSpan="2" className="text-center py-4 text-gray-400">Sin deudas pendientes</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-4 text-green-600">Cuentas por Cobrar (Top 5 Clientes)</h3>
            <table className="min-w-full">
              <tbody className="divide-y divide-gray-100">
                {arList.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2 text-sm text-gray-700">{item.nombre}</td>
                    <td className="py-2 text-sm font-bold text-right">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
                {arList.length === 0 && <tr><td colSpan="2" className="text-center py-4 text-gray-400">Sin cobros pendientes</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <PieIcon className="text-purple-600" size={32} />
            Supervisión Financiera
          </h1>
          <p className="text-gray-600 mt-1">Análisis de rentabilidad, liquidez y solvencia</p>
        </div>
        
        {activeTab === 'pnl' && (
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
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b overflow-x-auto">
        {[
          { id: 'pnl', label: 'Estado de Resultados' },
          { id: 'balance', label: 'Balance General' },
          { id: 'cashflow', label: 'Flujo de Caja' },
          { id: 'debt', label: 'Deuda y Ctas. Por Cobrar/Pagar' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2 px-4 font-medium transition-colors whitespace-nowrap relative ${
              activeTab === tab.id ? 'text-purple-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600"></div>}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <div className="animate-fade-in">
          {activeTab === 'pnl' && renderPnL()}
          {activeTab === 'balance' && renderBalance()}
          {activeTab === 'cashflow' && renderCashFlow()}
          {activeTab === 'debt' && renderDebt()}
        </div>
      )}
    </div>
  );
};

export default SupervisionFinanciera;
