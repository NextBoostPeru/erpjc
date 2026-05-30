import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  FileText, Plus, Calendar, DollarSign, Eye, Edit2, Trash2,
  Save, Download, CreditCard, History, X, AlertCircle, Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { API_URL } from '../api/config';

const getMonday = (d = new Date()) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
};

const getSunday = (monday) => {
  const date = new Date(monday);
  date.setDate(date.getDate() + 6);
  return date;
};

const fmt = (d) => d.toISOString().split('T')[0];

const GestionPlanillasSecundarias = () => {
  const [planillas, setPlanillas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanilla, setSelectedPlanilla] = useState(null);
  const [details, setDetails] = useState([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [pagoData, setPagoData] = useState({ monto: '', medio_pago: 'Transferencia', referencia: '', observaciones: '' });
  const [historialPagos, setHistorialPagos] = useState([]);

  const monday = getMonday();
  const sunday = getSunday(monday);

  const [generateParams, setGenerateParams] = useState({
    fecha_inicio: fmt(monday),
    fecha_fin: fmt(sunday),
    concepto: 'Pago Semanal'
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => { fetchPlanillas(); }, []);

  const fetchPlanillas = async () => {
    try {
      const response = await axios.get(`${API_URL}planillas_secundarias.php`, { headers: getAuthHeaders() });
      setPlanillas(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      toast.error('Error al cargar planillas secundarias');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!generateParams.fecha_inicio || !generateParams.fecha_fin) {
      toast.error('Seleccione fechas de inicio y fin');
      return;
    }
    if (!generateParams.concepto.trim()) {
      toast.error('Ingrese un concepto');
      return;
    }
    try {
      setLoading(true);
      await axios.post(`${API_URL}planillas_secundarias.php?action=generate`, generateParams, { headers: getAuthHeaders() });
      toast.success('Planilla semanal generada correctamente');
      setShowGenerateModal(false);
      fetchPlanillas();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al generar planilla');
    } finally {
      setLoading(false);
    }
  };

  const viewDetails = async (planilla) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}planillas_secundarias.php?id=${planilla.id}`, { headers: getAuthHeaders() });
      setSelectedPlanilla(response.data.header);
      setDetails(Array.isArray(response.data.details) ? response.data.details : []);
      setShowDetailModal(true);
    } catch (error) {
      toast.error('Error al cargar detalles');
    } finally {
      setLoading(false);
    }
  };

  const updateDetail = async (detail) => {
    try {
      await axios.post(`${API_URL}planillas_secundarias.php`, detail, { headers: getAuthHeaders() });
      toast.success('Detalle actualizado');
      const response = await axios.get(`${API_URL}planillas_secundarias.php?id=${selectedPlanilla.id}`, { headers: getAuthHeaders() });
      setSelectedPlanilla(response.data.header);
      setDetails(Array.isArray(response.data.details) ? response.data.details : []);
    } catch (error) {
      toast.error('Error al actualizar detalle');
    }
  };

  const updateStatus = async (status) => {
    try {
      await axios.put(`${API_URL}planillas_secundarias.php`, { id: selectedPlanilla.id, estado: status }, { headers: getAuthHeaders() });
      toast.success(`Planilla ${status}`);
      setSelectedPlanilla({ ...selectedPlanilla, estado: status });
      fetchPlanillas();
    } catch (error) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Confirme la eliminacion de esta planilla?')) return;
    try {
      setLoading(true);
      await axios.delete(`${API_URL}planillas_secundarias.php?id=${id}`, { headers: getAuthHeaders() });
      toast.success('Planilla eliminada');
      fetchPlanillas();
    } catch (error) {
      toast.error('Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

  const openPagoModal = (detail) => {
    setSelectedDetail(detail);
    setPagoData({
      monto: detail.pendiente?.toString() || detail.neto_pagar?.toString() || '0',
      medio_pago: 'Transferencia',
      referencia: '',
      observaciones: ''
    });
    setShowPagoModal(true);
  };

  const registrarPago = async () => {
    if (!parseFloat(pagoData.monto) || parseFloat(pagoData.monto) <= 0) {
      toast.error('Ingrese un monto valido');
      return;
    }
    try {
      await axios.post(`${API_URL}planillas_secundarias.php?action=registrar_pago`, {
        planilla_secundaria_detalle_id: selectedDetail.id,
        monto: parseFloat(pagoData.monto),
        medio_pago: pagoData.medio_pago,
        referencia: pagoData.referencia,
        observaciones: pagoData.observaciones
      }, { headers: getAuthHeaders() });
      toast.success('Pago registrado correctamente');
      setShowPagoModal(false);
      if (selectedPlanilla) {
        const response = await axios.get(`${API_URL}planillas_secundarias.php?id=${selectedPlanilla.id}`, { headers: getAuthHeaders() });
        setDetails(Array.isArray(response.data.details) ? response.data.details : []);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al registrar pago');
    }
  };

  const openHistorial = async (detail) => {
    setSelectedDetail(detail);
    try {
      const response = await axios.get(`${API_URL}planillas_secundarias.php?action=historial_pagos&id=${detail.id}`, { headers: getAuthHeaders() });
      setHistorialPagos(Array.isArray(response.data) ? response.data : []);
      setShowHistorialModal(true);
    } catch (error) {
      toast.error('Error al cargar historial');
    }
  };

  const exportExcel = () => {
    const data = details.map((d, idx) => ({
      'N°': idx + 1,
      'DNI': d.documento_numero,
      'Colaborador': `${d.apellidos || ''} ${d.nombres || ''}`.trim(),
      'Cargo': d.cargo || '',
      'Sueldo Mensual': d.sueldo_secundario,
      'Dias Trabajados': d.dias_trabajados,
      'Total Bruto': d.total_bruto,
      'Descuentos': d.total_descuentos,
      'Neto a Pagar': d.neto_pagar,
      'Pagado': d.pagado,
      'Pendiente': d.pendiente
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Planilla Secundaria");
    XLSX.writeFile(wb, `Planilla_Sec_${selectedPlanilla?.fecha_inicio || ''}.xlsx`);
  };

  const getStatusColor = (estado) => {
    const s = (estado || '').toLowerCase();
    if (s === 'borrador') return 'bg-gray-100 text-gray-700';
    if (s === 'cerrado') return 'bg-blue-100 text-blue-700';
    if (s === 'enviado') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
  };

  const formatDate = (d) => {
    if (!d) return '';
    const parts = d.split('-');
    return `${parts[2] || ''}/${parts[1] || ''}/${parts[0] || ''}`;
  };

  const formatRange = (ini, fin) => {
    return `${formatDate(ini)} - ${formatDate(fin)}`;
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Planilla Secundaria</h1>
          <p className="text-sm text-gray-500 mt-1">Pago semanal calculado sobre sueldo adicional mensual</p>
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Nueva Semana
        </button>
      </div>

      {loading && planillas.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : planillas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No hay planillas secundarias registradas</p>
          <p className="text-sm text-gray-400 mt-1">Genere una nueva planilla semanal</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Semana</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Concepto</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rango</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total Bruto</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total Neto</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {planillas.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <Calendar size={14} className="inline mr-1 text-gray-400" />
                      {formatDate(p.fecha_inicio)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.concepto}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">
                      {formatRange(p.fecha_inicio, p.fecha_fin)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      S/ {parseFloat(p.total_ingresos || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      S/ {parseFloat(p.total_neto || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(p.estado)}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => viewDetails(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Ver detalles"><Eye size={16} /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Eliminar"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Generar Semana */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Nueva Planilla Semanal</h2>
              <button onClick={() => setShowGenerateModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={generateParams.concepto}
                  onChange={(e) => setGenerateParams({ ...generateParams, concepto: e.target.value })}
                  placeholder="Ej: Pago Semanal, Bono Semanal"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={generateParams.fecha_inicio}
                    onChange={(e) => {
                      const ini = new Date(e.target.value);
                      const fin = getSunday(ini);
                      setGenerateParams({ ...generateParams, fecha_inicio: e.target.value, fecha_fin: fmt(fin) });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={generateParams.fecha_fin}
                    onChange={(e) => setGenerateParams({ ...generateParams, fecha_fin: e.target.value })}
                  />
                </div>
              </div>
              <div className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm flex items-start gap-2">
                <Clock size={16} className="mt-0.5 shrink-0" />
                <div>
                  <strong>Calculo automatico:</strong> Pago = (Sueldo Secundario Mensual / 30) x Dias Asistidos<br />
                  La asistencia se obtiene del modulo de Asistencias para el rango de fechas.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowGenerateModal(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleGenerate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Generar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalles */}
      {showDetailModal && selectedPlanilla && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {selectedPlanilla.concepto}
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    {formatRange(selectedPlanilla.fecha_inicio, selectedPlanilla.fecha_fin)}
                  </span>
                </h2>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span className={getStatusColor(selectedPlanilla.estado) + ' px-2 py-0.5 rounded-full text-xs font-medium'}>
                    {selectedPlanilla.estado}
                  </span>
                  <span>Total Neto: S/ {parseFloat(selectedPlanilla.total_neto || 0).toFixed(2)}</span>
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {formatDate(selectedPlanilla.fecha_inicio)} - {formatDate(selectedPlanilla.fecha_fin)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportExcel} className="p-2 text-green-600 hover:bg-green-50 rounded" title="Exportar Excel"><Download size={18} /></button>
                {['Borrador'].includes(selectedPlanilla.estado) && (
                  <button onClick={() => updateStatus('Cerrado')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Cerrar</button>
                )}
                {['Cerrado'].includes(selectedPlanilla.estado) && (
                  <button onClick={() => updateStatus('Enviado')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Enviar a CxP</button>
                )}
                <button onClick={() => { setShowDetailModal(false); setSelectedDetail(null); }} className="p-2 hover:bg-gray-100 rounded"><X size={20} /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Colaborador</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Cargo</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Sueldo Mens.</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Dias Trab.</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Bruto</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Desc.</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Neto</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Pagado</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Pend.</th>
                    <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 uppercase">Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((d, idx) => {
                    const diasDetectados = d.asistencia_detectada !== undefined ? d.asistencia_detectada : d.dias_trabajados;
                    return (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-sm text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-2 text-sm font-medium text-gray-800">
                        {d.apellidos || ''} {d.nombres || ''}
                        <div className="text-xs text-gray-400">{d.documento_numero}</div>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">{d.cargo || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-gray-400">S/</span>
                          <input
                            type="number" step="0.01"
                            className="w-20 border rounded px-1 py-0.5 text-sm text-right"
                            value={d.sueldo_secundario}
                            onChange={(e) => {
                              const s = parseFloat(e.target.value) || 0;
                              const br = Math.round((s / 30) * (parseInt(d.dias_trabajados) || 0) * 100) / 100;
                              const ne = Math.max(0, br - (parseFloat(d.total_descuentos) || 0));
                              setDetails(details.map(r => r.id === d.id ? { ...r, sueldo_secundario: s, total_bruto: br, neto_pagar: ne } : r));
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number" step="1" min="0" max="7"
                            className="w-12 border rounded px-1 py-0.5 text-sm text-center"
                            value={d.dias_trabajados}
                            onChange={(e) => {
                              const dt = Math.min(7, Math.max(0, parseInt(e.target.value) || 0));
                              const s = parseFloat(d.sueldo_secundario) || 0;
                              const br = Math.round((s / 30) * dt * 100) / 100;
                              const ne = Math.max(0, br - (parseFloat(d.total_descuentos) || 0));
                              setDetails(details.map(r => r.id === d.id ? { ...r, dias_trabajados: dt, total_bruto: br, neto_pagar: ne } : r));
                            }}
                          />
                          {diasDetectados !== d.dias_trabajados && (
                            <span className="text-xs text-amber-500" title={`Asistencia detectada: ${diasDetectados} dias`}>
                              ({diasDetectados})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-gray-800">
                        S/ {parseFloat(d.total_bruto || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-gray-400">S/</span>
                          <input
                            type="number" step="0.01"
                            className="w-16 border rounded px-1 py-0.5 text-sm text-right text-red-600"
                            value={d.total_descuentos}
                            onChange={(e) => {
                              const desc = parseFloat(e.target.value) || 0;
                              const ne = Math.max(0, (parseFloat(d.total_bruto) || 0) - desc);
                              setDetails(details.map(r => r.id === d.id ? { ...r, total_descuentos: desc, neto_pagar: ne } : r));
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">
                        S/ {parseFloat(d.neto_pagar || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-green-600">
                        S/ {parseFloat(d.pagado || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-orange-600 font-medium">
                        S/ {parseFloat(d.pendiente || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => updateDetail(d)}
                            className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100" title="Guardar cambios"
                          >
                            <Save size={15} />
                          </button>
                          {parseFloat(d.pendiente || 0) > 0 && (
                            <button onClick={() => openPagoModal(d)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Registrar pago">
                              <CreditCard size={15} />
                            </button>
                          )}
                          <button onClick={() => openHistorial(d)} className="p-1 text-gray-600 hover:bg-gray-100 rounded" title="Historial">
                            <History size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Pago */}
      {showPagoModal && selectedDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Registrar Pago</h2>
              <button onClick={() => setShowPagoModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm"><strong>Colaborador:</strong> {selectedDetail.apellidos} {selectedDetail.nombres}</p>
              <p className="text-sm"><strong>Neto:</strong> S/ {parseFloat(selectedDetail.neto_pagar || 0).toFixed(2)}</p>
              <p className="text-sm"><strong>Pendiente:</strong> S/ {parseFloat(selectedDetail.pendiente || 0).toFixed(2)}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={pagoData.monto} onChange={(e) => setPagoData({ ...pagoData, monto: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medio de Pago</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={pagoData.medio_pago} onChange={(e) => setPagoData({ ...pagoData, medio_pago: e.target.value })}>
                  <option>Efectivo</option>
                  <option>Transferencia</option>
                  <option>Deposito</option>
                  <option>Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={pagoData.referencia} onChange={(e) => setPagoData({ ...pagoData, referencia: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}
                  value={pagoData.observaciones} onChange={(e) => setPagoData({ ...pagoData, observaciones: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowPagoModal(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancelar</button>
              <button onClick={registrarPago} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                <CreditCard size={16} className="inline mr-1" />Registrar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {showHistorialModal && selectedDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Historial de Pagos</h2>
                <p className="text-sm text-gray-500">{selectedDetail.apellidos} {selectedDetail.nombres}</p>
              </div>
              <button onClick={() => setShowHistorialModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {historialPagos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay pagos registrados</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500">Fecha</th>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500">Monto</th>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500">Medio</th>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500">Referencia</th>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500">Obs.</th>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialPagos.map(h => (
                      <tr key={h.id} className="border-b border-gray-50 text-sm">
                        <td className="px-2 py-2">{h.fecha}</td>
                        <td className="px-2 py-2 font-medium">S/ {parseFloat(h.monto || 0).toFixed(2)}</td>
                        <td className="px-2 py-2">{h.medio_pago || '-'}</td>
                        <td className="px-2 py-2">{h.referencia || '-'}</td>
                        <td className="px-2 py-2 text-gray-500">{h.observaciones || '-'}</td>
                        <td className="px-2 py-2">{h.usuario || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionPlanillasSecundarias;
