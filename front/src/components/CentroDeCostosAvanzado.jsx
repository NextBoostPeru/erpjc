import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, X, ArrowRight, PieChart, Calculator } from 'lucide-react';
import { API_URL } from '../api/config';
import toast from 'react-hot-toast';

const CentroDeCostosAvanzado = () => {
  const [reglas, setReglas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [calculadoraOpen, setCalculadoraOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    centro_origen_id: '',
    centro_destino_id: '',
    porcentaje: '',
    descripcion: ''
  });

  // Calculator State
  const [calcData, setCalcData] = useState({
    monto: '',
    centro_origen_id: ''
  });
  const [resultadosCalc, setResultadosCalc] = useState([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const [reglasRes, centrosRes] = await Promise.all([
        axios.get(`${API_URL}centro_de_costos_avanzado.php`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}centros_costos.php`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (reglasRes.data.success) {
        setReglas(reglasRes.data.data);
      }
      if (centrosRes.data.success) {
        setCentros(centrosRes.data.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}centro_de_costos_avanzado.php`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Regla guardada');
      setModalOpen(false);
      fetchInitialData();
      setFormData({ centro_origen_id: '', centro_destino_id: '', porcentaje: '', descripcion: '' });
    } catch (error) {
      toast.error('Error al guardar regla');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta regla?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}centro_de_costos_avanzado.php?id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Regla eliminada');
      fetchInitialData();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const calcularDistribucion = () => {
    if (!calcData.monto || !calcData.centro_origen_id) return;
    
    const reglasAplicables = reglas.filter(r => r.centro_costo_origen_id == calcData.centro_origen_id);
    const monto = parseFloat(calcData.monto);
    
    const resultados = reglasAplicables.map(r => ({
      destino: centros.find(c => c.id === r.centro_costo_destino_id)?.nombre || 'Desconocido',
      porcentaje: r.porcentaje,
      monto: (monto * (r.porcentaje / 100)).toFixed(2)
    }));
    
    setResultadosCalc(resultados);
  };

  const getCentroNombre = (id) => centros.find(c => c.id === id)?.nombre || 'N/A';

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Centro de Costos Avanzado</h1>
          <p className="text-gray-600">Distribución de gastos generales entre áreas</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => setCalculadoraOpen(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700"
            >
                <Calculator size={20} />
                Simular Distribución
            </button>
            <button 
                onClick={() => setModalOpen(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"
            >
                <Plus size={20} />
                Nueva Regla
            </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Cargando...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origen (Gasto General)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destino (Área)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Porcentaje</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reglas.map((regla) => (
                <tr key={regla.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getCentroNombre(regla.centro_costo_origen_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center gap-2">
                    <ArrowRight size={16} className="text-gray-400" />
                    {getCentroNombre(regla.centro_costo_destino_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {regla.porcentaje}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {regla.descripcion}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => handleDelete(regla.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {reglas.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                    No hay reglas de distribución definidas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nueva Regla */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Nueva Regla de Distribución</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Centro Origen (Gasto General)</label>
                <select 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  value={formData.centro_origen_id}
                  onChange={(e) => setFormData({...formData, centro_origen_id: e.target.value})}
                  required
                >
                  <option value="">Seleccione...</option>
                  {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Centro Destino (Área)</label>
                <select 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  value={formData.centro_destino_id}
                  onChange={(e) => setFormData({...formData, centro_destino_id: e.target.value})}
                  required
                >
                  <option value="">Seleccione...</option>
                  {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Porcentaje (%)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  max="100"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  value={formData.porcentaje}
                  onChange={(e) => setFormData({...formData, porcentaje: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <input 
                  type="text" 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Save size={18} />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Calculadora */}
      {calculadoraOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
             <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Calculator size={24} />
                Simulador de Distribución
              </h2>
              <button onClick={() => setCalculadoraOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Centro Origen (Gasto General)</label>
                    <select 
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                      value={calcData.centro_origen_id}
                      onChange={(e) => setCalcData({...calcData, centro_origen_id: e.target.value})}
                    >
                      <option value="">Seleccione...</option>
                      {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                </div>
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">Monto Total ($)</label>
                        <input 
                          type="number" 
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                          value={calcData.monto}
                          onChange={(e) => setCalcData({...calcData, monto: e.target.value})}
                        />
                    </div>
                    <button 
                        onClick={calcularDistribucion}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 h-10"
                    >
                        Calcular
                    </button>
                </div>
            </div>

            {resultadosCalc.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold mb-2">Resultados:</h3>
                    <ul className="space-y-2">
                        {resultadosCalc.map((res, idx) => (
                            <li key={idx} className="flex justify-between text-sm">
                                <span>{res.destino} ({res.porcentaje}%)</span>
                                <span className="font-mono font-medium">${res.monto}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-2 pt-2 border-t flex justify-between font-bold">
                        <span>Total Distribuido:</span>
                        <span>${resultadosCalc.reduce((sum, item) => sum + parseFloat(item.monto), 0).toFixed(2)}</span>
                    </div>
                </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default CentroDeCostosAvanzado;
