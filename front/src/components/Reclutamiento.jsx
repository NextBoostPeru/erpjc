import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Briefcase, Users, MessageSquare, Plus, Check, X, Clock } from 'lucide-react';

const Reclutamiento = () => {
  const [activeTab, setActiveTab] = useState('vacantes');
  const [vacantes, setVacantes] = useState([]);
  const [postulantes, setPostulantes] = useState([]);
  const [entrevistas, setEntrevistas] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Forms
  const [showVacanteModal, setShowVacanteModal] = useState(false);
  const [showPostulanteModal, setShowPostulanteModal] = useState(false);
  const [vacanteForm, setVacanteForm] = useState({ titulo: '', departamento: '', descripcion: '', requisitos: '', fecha_cierre: '' });
  const [postulanteForm, setPostulanteForm] = useState({ vacante_id: '', nombres: '', apellidos: '', email: '', telefono: '', cv_url: '' });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'vacantes') {
        const res = await axios.get(`${API_URL}api/reclutamiento.php?resource=vacantes`);
        setVacantes(res.data);
      } else if (activeTab === 'postulantes') {
        // Need vacantes for dropdown
        const resVac = await axios.get(`${API_URL}api/reclutamiento.php?resource=vacantes`);
        setVacantes(resVac.data);
        const res = await axios.get(`${API_URL}reclutamiento.php?resource=postulantes`);
        setPostulantes(res.data);
      } else if (activeTab === 'entrevistas') {
        const res = await axios.get(`${API_URL}api/reclutamiento.php?resource=entrevistas`);
        setEntrevistas(res.data);
      }
    } catch (err) {
      console.error("Error fetching data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVacante = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}reclutamiento.php?resource=vacantes`, vacanteForm);
      setShowVacanteModal(false);
      setVacanteForm({ titulo: '', departamento: '', descripcion: '', requisitos: '', fecha_cierre: '' });
      fetchData();
    } catch (err) {
      alert("Error creando vacante");
    }
  };

  const handleCreatePostulante = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}api/reclutamiento.php?resource=postulantes`, postulanteForm);
      setShowPostulanteModal(false);
      setPostulanteForm({ vacante_id: '', nombres: '', apellidos: '', email: '', telefono: '', cv_url: '' });
      fetchData();
    } catch (err) {
      alert("Error registrando postulante");
    }
  };

  const handleStatusChange = async (id, newStatus) => {
      try {
          await axios.put(`${API_URL}reclutamiento.php?resource=postulantes`, { id, estado: newStatus });
          fetchData();
      } catch(err) {
          alert("Error actualizando estado");
      }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Reclutamiento y Selección (ATS)</h1>
        <p className="text-gray-600">Gestión de talento humano</p>
      </div>

      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        <button onClick={() => setActiveTab('vacantes')} className={`pb-2 px-4 flex items-center ${activeTab === 'vacantes' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
            <Briefcase size={18} className="mr-2"/> Vacantes
        </button>
        <button onClick={() => setActiveTab('postulantes')} className={`pb-2 px-4 flex items-center ${activeTab === 'postulantes' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
            <Users size={18} className="mr-2"/> Postulantes
        </button>
        <button onClick={() => setActiveTab('entrevistas')} className={`pb-2 px-4 flex items-center ${activeTab === 'entrevistas' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
            <MessageSquare size={18} className="mr-2"/> Entrevistas
        </button>
      </div>

      {activeTab === 'vacantes' && (
          <div>
              <button onClick={() => setShowVacanteModal(true)} className="mb-4 bg-blue-600 text-white px-4 py-2 rounded flex items-center">
                  <Plus size={18} className="mr-2"/> Nueva Vacante
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {vacantes.map(vac => (
                      <div key={vac.id} className="bg-white p-5 rounded-lg shadow border-t-4 border-blue-500">
                          <div className="flex justify-between items-start">
                              <h3 className="font-bold text-lg">{vac.titulo}</h3>
                              <span className={`px-2 py-1 rounded text-xs ${vac.estado === 'abierta' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                  {vac.estado}
                              </span>
                          </div>
                          <p className="text-sm text-gray-500 mb-2">{vac.departamento}</p>
                          <p className="text-gray-700 text-sm mb-4 line-clamp-3">{vac.descripcion}</p>
                          <div className="flex justify-between items-center text-xs text-gray-400">
                              <span>Publicado: {vac.fecha_publicacion?.split(' ')[0]}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {activeTab === 'postulantes' && (
          <div>
              <button onClick={() => setShowPostulanteModal(true)} className="mb-4 bg-blue-600 text-white px-4 py-2 rounded flex items-center">
                  <Plus size={18} className="mr-2"/> Registrar Postulante
              </button>
              <div className="bg-white rounded shadow overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                          <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Candidato</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vacante</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                          {postulantes.map(pos => (
                              <tr key={pos.id}>
                                  <td className="px-6 py-4">
                                      <div className="font-medium text-gray-900">{pos.nombres} {pos.apellidos}</div>
                                      <div className="text-sm text-gray-500">{pos.email}</div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">{pos.vacante_titulo}</td>
                                  <td className="px-6 py-4">
                                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${pos.estado === 'nuevo' ? 'bg-blue-100 text-blue-800' : 
                                          pos.estado === 'seleccionado' ? 'bg-green-100 text-green-800' : 
                                          'bg-yellow-100 text-yellow-800'}`}>
                                          {pos.estado}
                                      </span>
                                  </td>
                                  <td className="px-6 py-4 text-sm font-medium">
                                      <select 
                                        className="border rounded text-xs p-1"
                                        value={pos.estado}
                                        onChange={(e) => handleStatusChange(pos.id, e.target.value)}
                                      >
                                          <option value="nuevo">Nuevo</option>
                                          <option value="contactado">Contactado</option>
                                          <option value="entrevista">Entrevista</option>
                                          <option value="seleccionado">Seleccionado</option>
                                          <option value="rechazado">Rechazado</option>
                                      </select>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* Modals would go here (Simplified for brevity) */}
       {showVacanteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-bold mb-4">Nueva Vacante</h3>
                <form onSubmit={handleCreateVacante}>
                    <input className="w-full border mb-2 p-2 rounded" placeholder="Título" value={vacanteForm.titulo} onChange={e => setVacanteForm({...vacanteForm, titulo: e.target.value})} required />
                    <input className="w-full border mb-2 p-2 rounded" placeholder="Departamento" value={vacanteForm.departamento} onChange={e => setVacanteForm({...vacanteForm, departamento: e.target.value})} required />
                    <textarea className="w-full border mb-2 p-2 rounded" placeholder="Descripción" value={vacanteForm.descripcion} onChange={e => setVacanteForm({...vacanteForm, descripcion: e.target.value})} />
                    <div className="flex justify-end mt-4">
                        <button type="button" onClick={() => setShowVacanteModal(false)} className="mr-2 text-gray-500">Cancelar</button>
                        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {showPostulanteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-bold mb-4">Registrar Postulante</h3>
                <form onSubmit={handleCreatePostulante}>
                    <select className="w-full border mb-2 p-2 rounded" value={postulanteForm.vacante_id} onChange={e => setPostulanteForm({...postulanteForm, vacante_id: e.target.value})} required>
                        <option value="">Seleccionar Vacante</option>
                        {vacantes.map(v => <option key={v.id} value={v.id}>{v.titulo}</option>)}
                    </select>
                    <input className="w-full border mb-2 p-2 rounded" placeholder="Nombres" value={postulanteForm.nombres} onChange={e => setPostulanteForm({...postulanteForm, nombres: e.target.value})} required />
                    <input className="w-full border mb-2 p-2 rounded" placeholder="Apellidos" value={postulanteForm.apellidos} onChange={e => setPostulanteForm({...postulanteForm, apellidos: e.target.value})} required />
                    <input className="w-full border mb-2 p-2 rounded" placeholder="Email" value={postulanteForm.email} onChange={e => setPostulanteForm({...postulanteForm, email: e.target.value})} required />
                    <div className="flex justify-end mt-4">
                        <button type="button" onClick={() => setShowPostulanteModal(false)} className="mr-2 text-gray-500">Cancelar</button>
                        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default Reclutamiento;
