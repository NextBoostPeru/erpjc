import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { User, Calendar, FileText, Download, Plus, AlertCircle, CheckCircle } from 'lucide-react';

const PortalEmpleado = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profile, setProfile] = useState(null);
  const [boletas, setBoletas] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacationForm, setVacationForm] = useState({
    fecha_inicio: '',
    fecha_fin: '',
    motivo: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Get Profile
      const resProfile = await axios.get(`${API_URL}api/portal_empleado.php?action=profile`);
      setProfile(resProfile.data.data);

      if (resProfile.data.linked) {
        // 2. Get Boletas
        const resBoletas = await axios.get(`${API_URL}portal_empleado.php?action=boletas`);
        setBoletas(resBoletas.data.data);

        // 3. Get Vacaciones
        const resVacaciones = await axios.get(`${API_URL}api/portal_empleado.php?action=vacaciones`);
        setVacaciones(resVacaciones.data.data);
      } else {
          setError(resProfile.data.message || "Tu usuario no está vinculado a un perfil de colaborador.");
      }

    } catch (err) {
      console.error("Error loading portal data", err);
      setError("No se pudo cargar la información del portal.");
    } finally {
      setLoading(false);
    }
  };

  const handleVacationSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}portal_empleado.php?action=solicitar_vacaciones`, vacationForm);
      setShowVacationModal(false);
      setVacationForm({ fecha_inicio: '', fecha_fin: '', motivo: '' });
      fetchData(); // Reload data
      alert("Solicitud enviada correctamente");
    } catch (err) {
      alert("Error al enviar solicitud: " + (err.response?.data?.message || err.message));
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando Portal del Empleado...</div>;

  if (error && !profile) return (
      <div className="p-8">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
              <strong className="font-bold">Atención: </strong>
              <span className="block sm:inline">{error}</span>
          </div>
      </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Portal del Empleado</h1>
        <p className="text-gray-600">Bienvenido, {profile?.nombres} {profile?.apellidos}</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        <button 
            className={`pb-2 px-4 ${activeTab === 'dashboard' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('dashboard')}
        >
            Resumen
        </button>
        <button 
            className={`pb-2 px-4 ${activeTab === 'boletas' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('boletas')}
        >
            Mis Boletas
        </button>
        <button 
            className={`pb-2 px-4 ${activeTab === 'vacaciones' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('vacaciones')}
        >
            Vacaciones
        </button>
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">Próximo Pago</h3>
                    <Calendar className="text-blue-500" />
                </div>
                <p className="text-3xl font-bold text-gray-800">30 Ene</p>
                <p className="text-sm text-gray-500">Faltan 20 días</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">Vacaciones Disponibles</h3>
                    <User className="text-green-500" />
                </div>
                <p className="text-3xl font-bold text-gray-800">12 Días</p>
                <button onClick={() => setActiveTab('vacaciones')} className="text-sm text-green-600 hover:underline mt-2">Solicitar ahora</button>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-purple-500">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">Última Boleta</h3>
                    <FileText className="text-purple-500" />
                </div>
                <p className="text-xl font-bold text-gray-800">{boletas[0]?.mes ? `${boletas[0].mes}/${boletas[0].anio}` : 'N/A'}</p>
                <button onClick={() => setActiveTab('boletas')} className="text-sm text-purple-600 hover:underline mt-2">Descargar</button>
            </div>
        </div>
      )}

      {activeTab === 'boletas' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                      <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periodo</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Bruto</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descuentos</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Neto a Pagar</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                      </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                      {boletas.map((boleta) => (
                          <tr key={boleta.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{boleta.mes}/{boleta.anio}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">S/ {boleta.total_bruto}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500">- S/ {boleta.total_descuentos}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">S/ {boleta.neto_pagar}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 hover:text-blue-900 cursor-pointer flex items-center">
                                  <Download size={16} className="mr-1" /> PDF
                              </td>
                          </tr>
                      ))}
                      {boletas.length === 0 && (
                          <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">No hay boletas disponibles</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      )}

      {activeTab === 'vacaciones' && (
          <div>
              <div className="flex justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-700">Historial de Solicitudes</h2>
                  <button 
                    onClick={() => setShowVacationModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
                  >
                      <Plus size={18} className="mr-2" /> Nueva Solicitud
                  </button>
              </div>
              
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                          <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fechas</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Días</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                          {vacaciones.map((vac) => (
                              <tr key={vac.id}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                      {vac.fecha_inicio} al {vac.fecha_fin}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      {/* Calculate days roughly */}
                                      {Math.ceil((new Date(vac.fecha_fin) - new Date(vac.fecha_inicio)) / (1000 * 60 * 60 * 24)) + 1}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vac.motivo}</td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${vac.estado === 'aprobado' ? 'bg-green-100 text-green-800' : 
                                          vac.estado === 'rechazado' ? 'bg-red-100 text-red-800' : 
                                          'bg-yellow-100 text-yellow-800'}`}>
                                          {vac.estado.toUpperCase()}
                                      </span>
                                  </td>
                              </tr>
                          ))}
                          {vacaciones.length === 0 && (
                              <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-500">No hay solicitudes recientes</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* Modal Nueva Solicitud */}
      {showVacationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-bold mb-4">Solicitar Vacaciones</h3>
                <form onSubmit={handleVacationSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">Desde</label>
                        <input 
                            type="date" 
                            className="w-full border rounded px-3 py-2"
                            value={vacationForm.fecha_inicio}
                            onChange={(e) => setVacationForm({...vacationForm, fecha_inicio: e.target.value})}
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">Hasta</label>
                        <input 
                            type="date" 
                            className="w-full border rounded px-3 py-2"
                            value={vacationForm.fecha_fin}
                            onChange={(e) => setVacationForm({...vacationForm, fecha_fin: e.target.value})}
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">Motivo</label>
                        <textarea 
                            className="w-full border rounded px-3 py-2"
                            value={vacationForm.motivo}
                            onChange={(e) => setVacationForm({...vacationForm, motivo: e.target.value})}
                            placeholder="Vacaciones anuales..."
                        />
                    </div>
                    <div className="flex justify-end space-x-2">
                        <button 
                            type="button" 
                            onClick={() => setShowVacationModal(false)}
                            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        >
                            Enviar Solicitud
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

    </div>
  );
};

export default PortalEmpleado;
