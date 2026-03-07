import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Calendar, CheckCircle, XCircle, Clock, Plus, Filter, Info, UserCheck, ShieldCheck, Edit, Trash2, Paperclip, FileText } from 'lucide-react';
import { API_URL } from '../api/config';

const VacacionesPermisos = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [selectedColabBalance, setSelectedColabBalance] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    colaborador_id: '',
    tipo: 'Vacaciones',
    fecha_inicio: '',
    fecha_fin: '',
    motivo: '',
    documento: null,
    documento_url: ''
  });

  const [filters, setFilters] = useState({
    status: '',
    colaborador_id: ''
  });

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setCurrentUser(JSON.parse(userStr));
    }
    fetchColaboradores();
  }, []);

  useEffect(() => {
    fetchSolicitudes();
  }, [filters]);

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.colaborador_id) params.append('colaborador_id', filters.colaborador_id);
      
      const response = await axios.get(`${API_URL}vacaciones.php?${params.toString()}`);
      setSolicitudes(response.data.data);
    } catch (error) {
      toast.error("Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  };

  const fetchColaboradores = async () => {
    try {
      const response = await axios.get(`${API_URL}colaboradores.php?limit=100`);
      setColaboradores(response.data.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        // Updates use JSON (no file update support yet)
        await axios.put(`${API_URL}vacaciones.php`, {
            id: editingId,
            ...formData,
            documento: undefined // Don't send file object in JSON
        });
        toast.success("Solicitud actualizada exitosamente");
      } else {
        // Creation uses FormData for file upload
        const data = new FormData();
        data.append('colaborador_id', formData.colaborador_id);
        data.append('tipo', formData.tipo);
        data.append('fecha_inicio', formData.fecha_inicio);
        data.append('fecha_fin', formData.fecha_fin);
        data.append('motivo', formData.motivo);
        if (formData.documento) {
            data.append('documento', formData.documento);
        }

        await axios.post(`${API_URL}vacaciones.php`, data, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success("Solicitud creada exitosamente");
      }
      setModalOpen(false);
      setEditingId(null);
      setFormData({ colaborador_id: '', tipo: 'Vacaciones', fecha_inicio: '', fecha_fin: '', motivo: '', documento: null });
      fetchSolicitudes();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al procesar solicitud");
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setFormData({
        colaborador_id: item.colaborador_id,
        tipo: item.tipo,
        fecha_inicio: item.fecha_inicio,
        fecha_fin: item.fecha_fin,
        motivo: item.motivo,
        documento_url: item.documento || ''
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar esta solicitud?")) return;
    try {
        await axios.delete(`${API_URL}vacaciones.php`, { data: { id } });
        toast.success("Solicitud eliminada");
        fetchSolicitudes();
    } catch (error) {
        toast.error(error.response?.data?.message || "Error al eliminar");
    }
  };

  const handleAction = async (id, action) => {
    try {
      if (!window.confirm("¿Estás seguro de realizar esta acción?")) return;

      await axios.put(`${API_URL}vacaciones.php`, {
        id,
        action,
        user_id: currentUser?.id
      });
      
      let msg = "";
      if (action === 'approve_rrhh') msg = "Aprobado por RRHH";
      else if (action === 'approve_gerente') msg = "Aprobado Final (Gerencia)";
      else msg = "Solicitud rechazada";

      toast.success(msg);
      fetchSolicitudes();
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  const checkBalance = async (colabId) => {
    if (!colabId) return;
    try {
      const response = await axios.get(`${API_URL}vacaciones.php?balance=true&colaborador_id=${colabId}`);
      setSelectedColabBalance(response.data);
      setBalanceModalOpen(true);
    } catch (error) {
      toast.error("Error al consultar saldo");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Aprobado': 
        return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs flex items-center gap-1 w-fit"><CheckCircle size={12}/> Aprobado</span>;
      case 'Aprobado RRHH': 
        return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs flex items-center gap-1 w-fit"><UserCheck size={12}/> Aprobado RRHH</span>;
      case 'Rechazado': 
        return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs flex items-center gap-1 w-fit"><XCircle size={12}/> Rechazado</span>;
      default: 
        return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs flex items-center gap-1 w-fit"><Clock size={12}/> Pendiente</span>;
    }
  };

  const renderActions = (item) => {
    const role = currentUser?.rol_nombre?.toLowerCase();
    if (!role) return null;

    // Allow 'admin' to act as superuser
    const isRRHH = role.includes('rrhh');
    const isGerente = role.includes('gerente') || role.includes('gerencia');

    // Reject is available to both if pending their approval
    const canReject = (isRRHH && item.estado === 'Pendiente') || 
                      (isGerente && (item.estado === 'Aprobado RRHH' || item.estado === 'Pendiente'));

    return (
      <div className="flex justify-end gap-2">
        {/* Edit/Delete for Pending */}
        {item.estado === 'Pendiente' && (
            <>
                <button onClick={() => handleEdit(item)} className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="Editar">
                    <Edit size={18} />
                </button>
                <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:bg-red-50 p-1 rounded" title="Eliminar">
                    <Trash2 size={18} />
                </button>
            </>
        )}

        {/* RRHH Approval */}
        {isRRHH && item.estado === 'Pendiente' && (
          <button 
            onClick={() => handleAction(item.id, 'approve_rrhh')}
            className="text-blue-600 hover:bg-blue-50 p-1 rounded flex items-center gap-1" 
            title="Aprobar (RRHH)"
          >
            <UserCheck size={18} />
            <span className="text-xs hidden sm:inline">Aprobar RRHH</span>
          </button>
        )}

        {/* Gerente Approval (Can approve Pending or Approved by RRHH) */}
        {isGerente && (item.estado === 'Aprobado RRHH' || item.estado === 'Pendiente') && (
          <button 
            onClick={() => handleAction(item.id, 'approve_gerente')}
            className="text-green-600 hover:bg-green-50 p-1 rounded flex items-center gap-1" 
            title="Aprobar Final"
          >
            <ShieldCheck size={18} />
            <span className="text-xs hidden sm:inline">Aprobar Final</span>
          </button>
        )}

        {/* Reject Button */}
        {canReject && (
          <button 
            onClick={() => handleAction(item.id, 'reject')}
            className="text-red-600 hover:bg-red-50 p-1 rounded flex items-center gap-1" 
            title="Rechazar"
          >
            <XCircle size={18} />
            <span className="text-xs hidden sm:inline">Rechazar</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vacaciones y Permisos</h1>
          <p className="text-gray-500 text-sm">Gestión de solicitudes y saldos vacacionales</p>
          {currentUser && (
            <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-200 inline-block">
                Rol actual: <strong>{currentUser.rol_nombre}</strong> | 
                Usuario: <strong>{currentUser.usuario}</strong>
            </div>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
            <button 
                onClick={() => setBalanceModalOpen(true)}
                className="flex-1 sm:flex-none justify-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm"
            >
                <Info size={18} /> Saldos
            </button>
            <button 
                onClick={() => {
                    setEditingId(null);
                    setFormData({ colaborador_id: '', tipo: 'Vacaciones', fecha_inicio: '', fecha_fin: '', motivo: '', documento: null });
                    setModalOpen(true);
                }}
                className="flex-1 sm:flex-none justify-center bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 text-sm"
            >
                <Plus size={18} /> Nueva
            </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-col sm:flex-row flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 w-full sm:w-auto text-gray-500">
            <Filter size={20} />
            <span className="text-sm font-medium">Filtrar por:</span>
        </div>
        
        <select 
          className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto focus:ring-2 focus:ring-blue-500 outline-none"
          value={filters.colaborador_id}
          onChange={e => setFilters({...filters, colaborador_id: e.target.value})}
        >
          <option value="">Todos los colaboradores</option>
          {colaboradores.map(c => (
            <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
          ))}
        </select>
        
        <select 
          className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto focus:ring-2 focus:ring-blue-500 outline-none"
          value={filters.status}
          onChange={e => setFilters({...filters, status: e.target.value})}
        >
          <option value="">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Aprobado RRHH">Aprobado RRHH</option>
          <option value="Aprobado">Aprobado Final</option>
          <option value="Rechazado">Rechazado</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Tabla (solo en pantallas sm+) */}
        <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm uppercase">
                <th className="p-4 border-b w-64">Colaborador</th>
                <th className="p-4 border-b w-32">Tipo</th>
                <th className="p-4 border-b w-40">Fechas</th>
                <th className="p-4 border-b w-20">Días</th>
                <th className="p-4 border-b w-[280px]">Motivo</th>
                <th className="p-4 border-b w-20 text-center">Doc</th>
                <th className="p-4 border-b w-44">Estado</th>
                <th className="p-4 border-b w-40 text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {loading ? (
                    <tr><td colSpan="7" className="p-8 text-center text-gray-500">Cargando...</td></tr>
                ) : solicitudes.length === 0 ? (
                    <tr><td colSpan="7" className="p-8 text-center text-gray-500">No hay solicitudes registradas</td></tr>
                ) : (
                    solicitudes.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                        <td className="p-4">
                            <div className="font-medium text-gray-800">{item.apellidos}, {item.nombres}</div>
                            <div className="text-xs text-gray-500">{item.documento_numero}</div>
                        </td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap
                                ${item.tipo === 'Vacaciones' ? 'bg-blue-50 text-blue-700' : 
                                item.tipo.includes('Licencia') ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'}`}>
                                {item.tipo}
                            </span>
                        </td>
                        <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                            {item.fecha_inicio} <span className="text-gray-400">al</span> {item.fecha_fin}
                        </td>
                        <td className="p-4 font-bold text-gray-700">{item.dias}</td>
                        <td className="p-4 text-sm text-gray-500 max-w-xs truncate" title={item.motivo}>{item.motivo}</td>
                        <td className="p-4">
                            {item.documento && (
                                <a 
                                    href={`${API_URL}public_files.php?path=${encodeURIComponent(item.documento)}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 flex items-center justify-center w-8 h-8 rounded hover:bg-blue-50 transition-colors"
                                    title="Ver documento"
                                >
                                    <FileText size={18} />
                                </a>
                            )}
                        </td>
                        <td className="p-4">
                            {getStatusBadge(item.estado)}
                            {item.rrhh_nombre && (
                                <div className="text-[10px] text-gray-400 mt-1">
                                    RRHH: {item.rrhh_nombre} <br/>
                                    {item.fecha_aprobacion_rrhh && <span className="text-[9px]">{new Date(item.fecha_aprobacion_rrhh).toLocaleDateString()}</span>}
                                </div>
                            )}
                            {item.gerente_nombre && (
                                <div className="text-[10px] text-gray-400 mt-1">
                                    Gerente: {item.gerente_nombre} <br/>
                                    {item.fecha_aprobacion_gerente && <span className="text-[9px]">{new Date(item.fecha_aprobacion_gerente).toLocaleDateString()}</span>}
                                </div>
                            )}
                        </td>
                        <td className="p-4 text-right">
                            {renderActions(item)}
                        </td>
                    </tr>
                    ))
                )}
            </tbody>
            </table>
        </div>
        {/* Cards (solo móvil) */}
        <div className="sm:hidden p-2 space-y-3">
          {loading ? (
            <div className="p-4 text-center text-gray-500 bg-white rounded-lg border">Cargando...</div>
          ) : solicitudes.length === 0 ? (
            <div className="p-4 text-center text-gray-500 bg-white rounded-lg border">No hay solicitudes registradas</div>
          ) : (
            solicitudes.map(item => (
              <div key={item.id} className="bg-white rounded-lg border shadow-sm p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-800">{item.apellidos}, {item.nombres}</div>
                    <div className="text-[11px] text-gray-500">{item.documento_numero}</div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap
                    ${item.tipo === 'Vacaciones' ? 'bg-blue-50 text-blue-700' : 
                    item.tipo.includes('Licencia') ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'}`}>
                    {item.tipo}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="text-gray-600">
                    <div className="text-gray-400">Fechas</div>
                    <div className="font-medium">{item.fecha_inicio} <span className="text-gray-400">al</span> {item.fecha_fin}</div>
                  </div>
                  <div className="text-gray-600">
                    <div className="text-gray-400">Días</div>
                    <div className="font-bold text-gray-700">{item.dias}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs">
                  <div className="text-gray-400">Motivo</div>
                  <div className="text-gray-600">{item.motivo || '-'}</div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.documento && (
                      <a 
                        href={`${API_URL}public_files.php?path=${encodeURIComponent(item.documento)}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs"
                        title="Ver documento"
                      >
                        <FileText size={16} /> Ver doc
                      </a>
                    )}
                    <div className="text-xs">
                      {getStatusBadge(item.estado)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {renderActions(item)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* New Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <h2 className="text-xl font-bold mb-4">Nueva Solicitud</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Colaborador</label>
                <select 
                  required 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.colaborador_id}
                  onChange={e => setFormData({...formData, colaborador_id: e.target.value})}
                >
                  <option value="">Seleccione...</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipo</label>
                <select 
                  required 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.tipo}
                  onChange={e => setFormData({...formData, tipo: e.target.value})}
                >
                  <option value="Vacaciones">Vacaciones</option>
                  <option value="Licencia con goce">Licencia con goce</option>
                  <option value="Licencia sin goce">Licencia sin goce</option>
                  <option value="Descanso medico">Descanso médico</option>
                  <option value="Subsidio">Subsidio (Essalud)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Desde</label>
                  <input 
                    type="date" 
                    required 
                    className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.fecha_inicio}
                    onChange={e => setFormData({...formData, fecha_inicio: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hasta</label>
                  <input 
                    type="date" 
                    required 
                    className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.fecha_fin}
                    onChange={e => setFormData({...formData, fecha_fin: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Motivo</label>
                <textarea 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  rows="3"
                  value={formData.motivo}
                  onChange={e => setFormData({...formData, motivo: e.target.value})}
                ></textarea>
              </div>
              
              {!editingId && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Adjuntar Documento (Opcional)</label>
                    <div className="flex items-center gap-2">
                        <label className="cursor-pointer bg-white border rounded-lg p-2 w-full flex items-center gap-2 hover:bg-gray-50 transition-colors border-dashed border-gray-400">
                            <Paperclip size={18} className="text-gray-500" />
                            <span className="text-sm text-gray-600 truncate">
                                {formData.documento ? formData.documento.name : "Seleccionar archivo (PDF, JPG, PNG)..."}
                            </span>
                            <input 
                                type="file" 
                                className="hidden" 
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                    if (e.target.files[0]) {
                                        setFormData({...formData, documento: e.target.files[0]});
                                    }
                                }}
                            />
                        </label>
                        {formData.documento && (
                            <button 
                                type="button"
                                onClick={() => setFormData({...formData, documento: null})}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                title="Quitar archivo"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                  </div>
              )}
              {editingId && formData.documento_url && (
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-1">Documento adjunto</label>
                  <a
                    href={`${API_URL}public_files.php?path=${encodeURIComponent(formData.documento_url)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 px-3 py-2 border border-blue-200 rounded-lg bg-blue-50"
                  >
                    <FileText size={18} /> Ver documento
                  </a>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => {
                    setModalOpen(false);
                    setEditingId(null);
                }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">{editingId ? 'Actualizar' : 'Crear Solicitud'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      

      {/* Balance Modal */}
      {balanceModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
                <h2 className="text-xl font-bold mb-4">Consultar Saldos Vacacionales</h2>
                
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Seleccionar Colaborador</label>
                    <select 
                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        onChange={(e) => checkBalance(e.target.value)}
                    >
                        <option value="">Seleccione...</option>
                        {colaboradores.map(c => (
                            <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                        ))}
                    </select>
                </div>

                {selectedColabBalance && (
                    <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Días Ganados:</span>
                            <span className="font-bold text-gray-800">{selectedColabBalance.ganados}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Días Usados:</span>
                            <span className="font-bold text-red-600">-{selectedColabBalance.usados}</span>
                        </div>
                        <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                            <span className="text-gray-800 font-medium">Disponibles:</span>
                            <span className="font-bold text-green-600 text-lg">{selectedColabBalance.disponibles}</span>
                        </div>
                    </div>
                )}

                <div className="flex justify-end mt-6">
                    <button 
                        onClick={() => {
                            setBalanceModalOpen(false);
                            setSelectedColabBalance(null);
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default VacacionesPermisos;
