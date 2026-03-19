import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { FileText, AlertTriangle, TrendingUp, TrendingDown, Package, DollarSign, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

import { API_URL } from '../api/config';

const ReportesAlmacen = () => {
  const [activeTab, setActiveTab] = useState('stock');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({
    fecha_inicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    fecha_fin: new Date().toISOString().split('T')[0],
    almacen_id: ''
  });
  const [almacenes, setAlmacenes] = useState([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchAlmacenes();
  }, []);

  // Reset page when tab or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filters]);

  useEffect(() => {
    fetchData();
  }, [activeTab, filters, currentPage]);

  const fetchAlmacenes = async () => {
    try {
      const response = await axios.get(`${API_URL}almacenes.php`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (Array.isArray(response.data)) {
        setAlmacenes(response.data);
      } else {
        console.error("Expected array from almacenes API but got:", response.data);
        setAlmacenes([]);
      }
    } catch (error) {
      console.error("Error fetching almacenes:", error);
      setAlmacenes([]);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}reportes_almacen.php?action=${getActionName(activeTab)}`;
      url += `&fecha_inicio=${filters.fecha_inicio}&fecha_fin=${filters.fecha_fin}`;
      if (filters.almacen_id) {
        url += `&almacen_id=${filters.almacen_id}`;
      }
      
      // Add pagination params for supported tabs
      if (['stock', 'kardex', 'alertas', 'rotacion'].includes(activeTab)) {
        url += `&page=${currentPage}&limit=${itemsPerPage}`;
      }
      
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      // Handle paginated vs non-paginated response
      if (response.data && response.data.data && typeof response.data.total_pages !== 'undefined') {
          setData(response.data.data);
          setTotalPages(response.data.total_pages);
          setTotalItems(response.data.total);
      } else {
          setData(response.data);
          setTotalPages(0);
          setTotalItems(Array.isArray(response.data) ? response.data.length : 0);
      }
    } catch (error) {
      console.error("Error fetching report data:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const getActionName = (tab) => {
    switch(tab) {
      case 'stock': return 'stock_actual';
      case 'rotacion': return 'rotacion';
      case 'mas_vendidos': return 'mas_vendidos';
      case 'kardex': return 'kardex';
      case 'valorizacion': return 'valorizacion';
      case 'alertas': return 'alertas';
      default: return 'stock_actual';
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value
    });
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex justify-center items-center mt-4 space-x-2 py-4">
        <button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-medium text-gray-700">
          Página {currentPage} de {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) return <div className="p-8 text-center">Cargando datos...</div>;
    if (!data) return <div className="p-8 text-center text-gray-500">No hay datos disponibles</div>;

    switch (activeTab) {
      case 'stock':
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Precio</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.isArray(data) && data.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.nombre} <span className="text-gray-400 text-xs">({item.codigo_interno})</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.almacen}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">S/ {parseFloat(item.precio || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">{item.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );

      case 'rotacion':
        return (
          <div className="space-y-6">
             <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="nombre" width={150} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total_salidas" name="Salidas" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Salidas</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(data) && data.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.nombre}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{item.total_salidas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {renderPagination()}
          </div>
        );

      case 'mas_vendidos':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded shadow">
              <h3 className="text-lg font-medium mb-4 flex items-center text-green-600"><TrendingUp className="mr-2" size={20} /> Más Vendidos</h3>
              {data.mas_vendidos && data.mas_vendidos.length > 0 ? (
                 <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.mas_vendidos}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nombre" hide />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total_vendido" fill="#10B981" name="Cantidad" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-gray-500 text-sm">No hay datos</p>}
              <ul className="mt-4 space-y-2">
                {data.mas_vendidos?.map((item, i) => (
                  <li key={i} className="flex justify-between text-sm border-b pb-1">
                    <span>{i+1}. {item.nombre}</span>
                    <span className="font-bold">{item.total_vendido}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white p-4 rounded shadow">
              <h3 className="text-lg font-medium mb-4 flex items-center text-red-600"><TrendingDown className="mr-2" size={20} /> Menos Vendidos</h3>
               {data.menos_vendidos && data.menos_vendidos.length > 0 ? (
                 <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.menos_vendidos}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nombre" hide />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total_vendido" fill="#EF4444" name="Cantidad" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-gray-500 text-sm">No hay datos</p>}
               <ul className="mt-4 space-y-2">
                {data.menos_vendidos?.map((item, i) => (
                  <li key={i} className="flex justify-between text-sm border-b pb-1">
                    <span>{i+1}. {item.nombre}</span>
                    <span className="font-bold">{item.total_vendido}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      case 'kardex':
        return (
          <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Movimiento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc. Ref.</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Salida</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.isArray(data) && data.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(item.fecha).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.producto}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{item.tipo_movimiento}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.documento_referencia}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                      {item.tipo_movimiento === 'entrada' ? item.cantidad : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                       {item.tipo_movimiento === 'salida' ? item.cantidad : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">{item.saldo_cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );

      case 'valorizacion':
         return (
          <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded shadow flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-gray-500 mb-1">Valor Total Inventario</p>
                    <p className="text-3xl font-bold text-blue-600">
                      S/ {Array.isArray(data) ? data.reduce((acc, curr) => acc + parseFloat(curr.valor_total || 0), 0).toFixed(2) : '0.00'}
                    </p>
                  </div>
                </div>
                 <div className="h-64 w-full bg-white p-4 rounded shadow">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="valor_total"
                      >
                        {Array.isArray(data) && data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `S/ ${parseFloat(value).toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </div>

             <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Items Distintos</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(data) && data.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.almacen}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{item.total_items}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">S/ {parseFloat(item.valor_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
         );

      case 'alertas':
        return (
           <div className="overflow-x-auto">
             <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
                      Se encontraron {totalItems} productos con stock por debajo del mínimo permitido.
                    </p>
                  </div>
                </div>
              </div>

            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Mínimo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Actual</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Déficit</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.isArray(data) && data.map((item, idx) => (
                  <tr key={idx} className="bg-red-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-900">{item.nombre}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{item.stock_minimo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-red-600">{item.stock_actual || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-800 font-medium">{item.deficit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Reportes de Almacén</h1>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
          <input
            type="date"
            name="fecha_inicio"
            value={filters.fecha_inicio}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
          <input
            type="date"
            name="fecha_fin"
            value={filters.fecha_fin}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Almacén</label>
          <select
            name="almacen_id"
            value={filters.almacen_id}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          >
            <option value="">Todos</option>
            {Array.isArray(almacenes) && almacenes.map(almacen => (
              <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            <button
              onClick={() => setActiveTab('stock')}
              className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'stock'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Package className="mr-2" size={18} />
              Stock Actual
            </button>
            <button
              onClick={() => setActiveTab('rotacion')}
              className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'rotacion'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <TrendingUp className="mr-2" size={18} />
              Rotación
            </button>
            <button
              onClick={() => setActiveTab('mas_vendidos')}
              className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'mas_vendidos'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <TrendingUp className="mr-2" size={18} />
              Más/Menos Vendidos
            </button>
            <button
              onClick={() => setActiveTab('kardex')}
              className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'kardex'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="mr-2" size={18} />
              Kardex
            </button>
            <button
              onClick={() => setActiveTab('valorizacion')}
              className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'valorizacion'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <DollarSign className="mr-2" size={18} />
              Valorización
            </button>
            <button
              onClick={() => setActiveTab('alertas')}
              className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'alertas'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <AlertTriangle className="mr-2" size={18} />
              Alertas
            </button>
          </nav>
        </div>

        <div className="p-6 bg-gray-50 min-h-[500px]">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default ReportesAlmacen;
