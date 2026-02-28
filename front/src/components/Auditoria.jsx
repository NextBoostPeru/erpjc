import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Shield, History, Lock, Unlock, FileText, Eye, AlertCircle, Calendar, Search, RefreshCw } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';

const Auditoria = () => {
  const [activeTab, setActiveTab] = useState('bitacora'); // bitacora, accesos, periodos
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [filters, setFilters] = useState({ limit: 100 });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
  }, [activeTab, filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'periodos') {
        const res = await axios.get(`${API_URL}/periodos.php`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPeriodos(res.data);
      } else {
        const res = await axios.get(`${API_URL}/auditoria.php?action=${activeTab}&limit=${filters.limit}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const togglePeriodo = async (id, currentStatus) => {
    const newStatus = currentStatus === 'abierto' ? 'cerrado' : 'abierto';
    try {
      await axios.put(`${API_URL}/periodos.php`, 
        { id, estado: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Periodo ${newStatus} exitosamente`);
      fetchData();
    } catch (error) {
      toast.error("Error al cambiar estado del periodo");
    }
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-6 py-3 text-sm font-medium transition-colors duration-200 flex items-center gap-2 border-b-2 ${activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="p-6 fade-in">
      <Toaster position="top-right" />
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Shield size={32} className="text-blue-600" /> Auditoría y Control
        </h1>
        <div className="flex gap-2">
            <button 
                onClick={fetchData} 
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
            >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
        </div>
      </div>
      
      <p className="text-gray-500 mb-4">Gestión de seguridad, trazabilidad y control de periodos.</p>

      <div className="flex border-b border-gray-200 mb-6">
        <TabButton id="bitacora" label="Bitácora de Cambios" icon={FileText} />
        <TabButton id="accesos" label="Historial de Accesos" icon={History} />
        <TabButton id="periodos" label="Control de Periodos" icon={Calendar} />
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="text-center p-12">
            <div className="inline-block animate-spin mb-4">
                <RefreshCw size={40} className="text-blue-600" />
            </div>
            <p className="text-gray-500">Cargando datos...</p>
          </div>
        ) : (
          <>
            {activeTab === 'bitacora' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha/Hora</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tabla</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalles</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.length > 0 ? data.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.fecha_hora}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{item.usuario || 'Sistema'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.accion === 'DELETE' ? 'bg-red-100 text-red-800' : item.accion === 'INSERT' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                            {item.accion}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.tabla_afectada}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{item.detalles || '-'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" className="text-center p-8 text-gray-500">No hay registros en la bitácora</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'accesos' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha/Hora</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalles</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.length > 0 ? data.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.fecha_hora}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{item.usuario || 'Desconocido'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.ip_address}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.accion}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{item.detalles}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" className="text-center p-8 text-gray-500">No hay historial de accesos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'periodos' && (
              <div className="p-6">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 text-yellow-700 flex items-center gap-2 mb-6 rounded-r">
                    <AlertCircle size={20} />
                    <span>Bloquee los periodos para impedir modificaciones contables.</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {periodos.length > 0 ? periodos.map((p) => (
                    <div key={p.id} className={`border rounded-lg p-4 transition-all hover:shadow-md ${p.estado === 'cerrado' ? 'bg-gray-50 opacity-75' : 'bg-white border-gray-200'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="m-0 text-lg font-bold text-gray-800">{p.nombre} {p.anio}</h3>
                        {p.estado === 'abierto' ? <Unlock size={18} className="text-green-600" /> : <Lock size={18} className="text-red-600" />}
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${p.estado === 'abierto' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {p.estado}
                        </span>
                        <button 
                            onClick={() => togglePeriodo(p.id, p.estado)}
                            className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold py-1 px-3 rounded text-sm transition-colors"
                        >
                            {p.estado === 'abierto' ? 'Cerrar Periodo' : 'Abrir Periodo'}
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-3 text-center p-8 text-gray-500">
                        No hay periodos generados para este año.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Auditoria;
