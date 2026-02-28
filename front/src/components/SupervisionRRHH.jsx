import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { API_URL } from '../api/config';
import { Users, DollarSign, Clock, Calendar, TrendingUp } from 'lucide-react';

const SupervisionRRHH = () => {
  const [activeTab, setActiveTab] = useState('headcount');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    headcount: { total: 0, byArea: [], byContract: [] },
    costos: [],
    asistencias: [],
    vacaciones: [],
    indicadores: { attendance_by_area: [] }
  });

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [headcountRes, costosRes, asistenciasRes, vacacionesRes, indicadoresRes] = await Promise.all([
        axios.get(`${API_URL}supervision_rrhh.php?action=headcount`, { headers }),
        axios.get(`${API_URL}supervision_rrhh.php?action=costos`, { headers }),
        axios.get(`${API_URL}supervision_rrhh.php?action=asistencias`, { headers }),
        axios.get(`${API_URL}supervision_rrhh.php?action=vacaciones`, { headers }),
        axios.get(`${API_URL}supervision_rrhh.php?action=indicadores`, { headers })
      ]);

      setData({
        headcount: headcountRes.data?.byContract ? headcountRes.data : { total: 0, byArea: [], byContract: [] },
        costos: Array.isArray(costosRes.data) ? costosRes.data : [],
        asistencias: Array.isArray(asistenciasRes.data) ? asistenciasRes.data : [],
        vacaciones: Array.isArray(vacacionesRes.data) ? vacacionesRes.data : [],
        indicadores: indicadoresRes.data?.attendance_by_area ? indicadoresRes.data : { attendance_by_area: [] }
      });
    } catch (error) {
      console.error("Error fetching RRHH data:", error);
      setError("No se pudo cargar la información. Por favor verifique su conexión o intente más tarde.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Cargando dashboard de RRHH...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>{error}</p>
        <button 
          onClick={fetchAllData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  const renderHeadcount = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Colaboradores</p>
              <h3 className="text-3xl font-bold text-blue-600">{data.headcount.total}</h3>
            </div>
            <Users className="h-8 w-8 text-blue-200" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Headcount por Área</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.headcount.byArea} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="area" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="cantidad" fill="#3B82F6" name="Colaboradores" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Por Tipo de Contrato</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.headcount.byContract}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="cantidad"
                  nameKey="tipo_contrato"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                {data.headcount.byContract?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCostos = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Evolución de Costos de Personal (Últimos 6 meses)</h3>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.costos}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis />
              <Tooltip formatter={(value) => `S/ ${value.toLocaleString()}`} />
              <Legend />
              <Area type="monotone" dataKey="sueldos" stackId="1" stroke="#8884d8" fill="#8884d8" name="Sueldos Netos" />
              <Area type="monotone" dataKey="cargas_sociales" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Cargas Sociales" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderAsistencias = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Asistencia del Mes Actual</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.asistencias}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.asistencias.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Resumen</h3>
          <div className="space-y-4">
             {data.asistencias.map((item) => (
               <div key={item.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                 <div className="flex items-center gap-3">
                   <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                   <span className="font-medium text-gray-700">{item.name}</span>
                 </div>
                 <span className="text-xl font-bold">{item.value}</span>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderVacaciones = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.vacaciones.map((item, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
             <h3 className="text-lg font-semibold text-gray-600 mb-2">{item.estado}</h3>
             <div className="flex items-end gap-2">
                <span className="text-4xl font-bold text-gray-900">{item.cantidad}</span>
                <span className="text-sm text-gray-500 mb-1">solicitudes</span>
             </div>
             <p className="text-sm text-gray-500 mt-2">Total días: {item.total_dias}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderIndicadores = () => (
    <div className="space-y-6">
       <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Puntualidad por Área (%)</h3>
          <div className="h-96">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.indicadores.attendance_by_area} layout="vertical">
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis type="number" domain={[0, 100]} />
                   <YAxis dataKey="area" type="category" width={120} />
                   <Tooltip />
                   <Legend />
                   <Bar dataKey="puntualidad" fill="#10B981" name="Puntualidad" />
                   <Bar dataKey="ausentismo" fill="#EF4444" name="Ausentismo" />
                </BarChart>
             </ResponsiveContainer>
          </div>
       </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Visión Ejecutiva de RRHH</h1>
          <p className="text-gray-600">Indicadores clave de gestión humana</p>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={fetchAllData}
             className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
           >
             <TrendingUp className="w-5 h-5" />
           </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-8 border-b border-gray-200">
        {[
          { id: 'headcount', label: 'Headcount', icon: Users },
          { id: 'costos', label: 'Costos', icon: DollarSign },
          { id: 'asistencias', label: 'Asistencias', icon: Clock },
          { id: 'vacaciones', label: 'Vacaciones', icon: Calendar },
          { id: 'indicadores', label: 'Desempeño', icon: TrendingUp },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="transition-all duration-300">
        {activeTab === 'headcount' && renderHeadcount()}
        {activeTab === 'costos' && renderCostos()}
        {activeTab === 'asistencias' && renderAsistencias()}
        {activeTab === 'vacaciones' && renderVacaciones()}
        {activeTab === 'indicadores' && renderIndicadores()}
      </div>
    </div>
  );
};

export default SupervisionRRHH;
