import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { 
  Users, UserCheck, UserX, Clock, AlertTriangle, 
  Briefcase, Calendar, PieChart, Activity
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell
} from 'recharts';

const DashboardRRHH = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await axios.get(`${API_URL}dashboard_rrhh.php`);
        setStats(response.data);
      } catch (error) {
        console.error("Error cargando dashboard RRHH:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando Dashboard RRHH...</div>;
  }

  if (!stats) {
    return <div className="p-8 text-center text-red-500">Error al cargar datos.</div>;
  }

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
          <Activity className="text-pink-600" size={32} />
          Dashboard de Recursos Humanos
        </h1>
        <p className="text-gray-500 mt-1">Resumen general y alertas de gestión de talento</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl">
            <Users size={32} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Colaboradores</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.total_activos} <span className="text-xs text-gray-400 font-normal">/ {stats.total_colaboradores}</span></h3>
            <p className="text-xs text-green-600 mt-1">Activos actualmente</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-green-50 text-green-600 rounded-xl">
            <UserCheck size={32} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Asistencia Hoy</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.asistencias_hoy}</h3>
            <p className="text-xs text-gray-400 mt-1">Colaboradores presentes</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-yellow-50 text-yellow-600 rounded-xl">
            <UserX size={32} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Ausentismo Hoy</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.ausentes_hoy}</h3>
            <p className="text-xs text-gray-400 mt-1">Estimado (Sin marcar)</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-red-50 text-red-600 rounded-xl">
            <AlertTriangle size={32} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Alertas EMOs</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.total_emos_alertas}</h3>
            <p className="text-xs text-red-500 mt-1">Vencidos o por vencer</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* EMOs Alert List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={20} /> 
            EMOs Próximos a Vencer / Vencidos
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <th className="p-3 font-medium">Colaborador</th>
                  <th className="p-3 font-medium">DNI</th>
                  <th className="p-3 font-medium">Vencimiento</th>
                  <th className="p-3 font-medium">Clínica</th>
                  <th className="p-3 font-medium text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {stats.emos_por_vencer.length === 0 ? (
                    <tr><td colSpan="5" className="p-4 text-center text-gray-400">Sin alertas pendientes</td></tr>
                ) : (
                    stats.emos_por_vencer.map((emo, idx) => {
                        const vencido = new Date(emo.fecha_vencimiento) < new Date();
                        return (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="p-3 font-medium text-gray-700">{emo.apellidos}, {emo.nombres}</td>
                                <td className="p-3 text-gray-500">{emo.documento_numero}</td>
                                <td className="p-3 text-gray-600">{emo.fecha_vencimiento}</td>
                                <td className="p-3 text-gray-500">{emo.clinica || '-'}</td>
                                <td className="p-3 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        vencido ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                        {vencido ? 'VENCIDO' : 'POR VENCER'}
                                    </span>
                                </td>
                            </tr>
                        );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cumpleaños del Mes */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="text-pink-500" size={20} /> 
            Cumpleaños (Este Mes)
          </h3>
          <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
            {stats.cumpleanos_mes.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No hay cumpleaños este mes.</p>
            ) : (
                stats.cumpleanos_mes.map((cumple, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-pink-50 rounded-xl border border-pink-100">
                        <div className="bg-white w-10 h-10 rounded-full flex items-center justify-center text-pink-500 font-bold shadow-sm shrink-0">
                            {cumple.dia}
                        </div>
                        <div>
                            <p className="font-semibold text-gray-800">{cumple.nombres}</p>
                            <p className="text-xs text-gray-500">{cumple.apellidos}</p>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por Área */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <PieChart className="text-indigo-500" size={20} /> 
                Distribución por Área
            </h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                        <Pie
                            data={stats.distribucion_area}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="cantidad"
                            nameKey="area"
                        >
                            {stats.distribucion_area.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend />
                    </RePieChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Distribución por Tipo de Contrato */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Briefcase className="text-blue-500" size={20} /> 
                Colaboradores por Contrato
            </h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={stats.distribucion_contrato}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="tipo_contrato" type="category" width={100} tick={{fontSize: 12}} />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="cantidad" name="Colaboradores" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

    </div>
  );
};

export default DashboardRRHH;
