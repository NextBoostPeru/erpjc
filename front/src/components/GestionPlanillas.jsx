import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  FileText, Plus, Search, Check, X, 
  Calendar, DollarSign, Download, Eye, Edit2, Trash2,
  Save, AlertCircle, Calculator, TrendingUp, Users, Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { API_URL } from '../api/config';

const GestionPlanillas = () => {
  const [planillas, setPlanillas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanilla, setSelectedPlanilla] = useState(null);
  const [details, setDetails] = useState([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Generation Params
  const [generateParams, setGenerateParams] = useState({
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    tipo: 'Mensual'
  });

  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const getAfpRates = (regimen, comisionType = 'Flujo') => {
    if (regimen === 'ONP') return { aporte: 0.13, seguro: 0.0, comision: 0.0 };
    const aporte = 0.10;
    const seguro = 0.0170;
    let comision = 0.01;
    switch (regimen) {
      case 'AFP Integra':
        comision = comisionType === 'Flujo' ? 0.0079 : 0.0000;
        break;
      case 'AFP Prima':
        comision = comisionType === 'Flujo' ? 0.0160 : 0.0018;
        break;
      case 'AFP Profuturo':
        comision = comisionType === 'Flujo' ? 0.0169 : 0.0067;
        break;
      case 'AFP Habitat':
        comision = comisionType === 'Flujo' ? 0.0147 : 0.0023;
        break;
      default:
        comision = 0.01;
        break;
    }
    return { aporte, seguro, comision };
  };
  const calcAfpDetalle = (d) => {
    const regimen = d.regimen_pensionario || 'ONP';
    const base = parseFloat(d.total_bruto || 0);
    const r = getAfpRates(regimen, 'Flujo');
    if (regimen === 'ONP') {
      const aporte = +(base * r.aporte).toFixed(2);
      return {
        tipo: 'ONP',
        aporte_pct: +(r.aporte * 100).toFixed(2),
        seguro_pct: 0.0,
        comision_pct: 0.0,
        aporte,
        seguro: 0.0,
        comision: 0.0,
        total: aporte
      };
    } else {
      const aporte = +(base * r.aporte).toFixed(2);
      const seguro = +(base * r.seguro).toFixed(2);
      const comision = +(base * r.comision).toFixed(2);
      return {
        tipo: regimen,
        aporte_pct: +(r.aporte * 100).toFixed(2),
        seguro_pct: +(r.seguro * 100).toFixed(2),
        comision_pct: +(r.comision * 100).toFixed(2),
        aporte,
        seguro,
        comision,
        total: +(aporte + seguro + comision).toFixed(2)
      };
    }
  };

  useEffect(() => {
    fetchPlanillas();
  }, []);

  const fetchPlanillas = async () => {
    try {
      const response = await axios.get(`${API_URL}planillas.php`);
      setPlanillas(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      toast.error('Error al cargar planillas');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);
      await axios.post(`${API_URL}planillas.php?action=generate`, generateParams);
      toast.success('Planilla generada correctamente');
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
      const response = await axios.get(`${API_URL}planillas.php?id=${planilla.id}`);
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
      await axios.post(`${API_URL}planillas.php`, detail);
      toast.success('Detalle actualizado');
      // Update local state optimistically
      const newDetails = details.map(d => d.id === detail.id ? detail : d);
      setDetails(newDetails);
      
      // Refresh full data to get recalculated totals from backend
      const response = await axios.get(`${API_URL}planillas.php?id=${selectedPlanilla.id}`);
      setSelectedPlanilla(response.data.header);
      setDetails(Array.isArray(response.data.details) ? response.data.details : []);

    } catch (error) {
      toast.error('Error al actualizar detalle');
    }
  };

  const updateStatus = async (status) => {
    try {
      await axios.put(`${API_URL}planillas.php`, {
        id: selectedPlanilla.id,
        estado: status
      });
      toast.success(`Planilla ${status}`);
      setSelectedPlanilla({...selectedPlanilla, estado: status});
      fetchPlanillas();
    } catch (error) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar esta planilla? Se eliminarán todos los detalles asociados.')) {
      return;
    }

    try {
      setLoading(true);
      await axios.delete(`${API_URL}planillas.php?id=${id}`);
      toast.success('Planilla eliminada correctamente');
      fetchPlanillas();
    } catch (error) {
      console.error(error);
      toast.error('Error al eliminar la planilla');
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    const data = details.map((d, idx) => ({
      'N° Orden': idx + 1,
      'DNI': d.documento_numero,
      'Colaborador': `${d.apellidos}, ${d.nombres}`,
      'Sueldo Base': d.sueldo_base,
      'Asig. Familiar': d.asignacion_familiar_monto,
      'Días Trab.': d.dias_trabajados,
      'Horas Extras': d.horas_extras,
      'Monto H.E.': d.monto_horas_extras,
      'Bonos': d.bonos,
      'Comisiones': d.comisiones,
      'Total Bruto': d.total_bruto,
      'AFP/ONP': d.afp_onp_monto,
      '5ta Categoría': d.quinta_categoria_monto,
      'Tardanzas': d.tardanzas_monto,
      'Préstamos': d.prestamos,
      'Total Descuentos': d.total_descuentos,
      'Neto a Pagar': d.neto_pagar
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Planilla");
    XLSX.writeFile(wb, `Planilla_${selectedPlanilla.mes}_${selectedPlanilla.anio}.xlsx`);
  };

  const downloadTxt = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPlameREM = () => {
    let content = "";
    details.forEach(d => {
      const addLine = (cod, val) => {
        if (val && parseFloat(val) > 0) {
          // Estructura: TipoDoc|NumDoc|CodConcepto|MontoDevengado|MontoPagado
          content += `01|${d.documento_numero}|${cod}|${parseFloat(val).toFixed(2)}|${parseFloat(val).toFixed(2)}\n`;
        }
      };
      
      addLine('0121', d.sueldo_base); // Remuneración Básica
      addLine('0201', d.asignacion_familiar_monto); // Asig. Familiar
      addLine('0105', d.monto_horas_extras); // Horas Extras
      addLine('0301', d.bonos); // Bonificaciones
      addLine('0401', d.comisiones); // Comisiones
      
      // Nota: No se exportan descuentos (AFP/ONP, 5ta) aquí, el PLAME los calcula o se importan en otras estructuras.
       // Se priorizan los INGRESOS para la base imponible.
     });
     const ruc = selectedPlanilla.empresa_ruc || '00000000000';
     const filename = `0601${selectedPlanilla.anio}${String(selectedPlanilla.mes).padStart(2, '0')}${ruc}.rem`;
     downloadTxt(content, filename);
   };

   const exportPlameJOR = () => {
     let content = "";
     details.forEach(d => {
      const dias = d.dias_trabajados;
      const horas = parseFloat(d.horas_ordinarias || (dias * 8)); // Usa horas reales si están disponibles
       
       const he_decimal = parseFloat(d.horas_extras || 0);
       const he_horas = Math.floor(he_decimal);
       const he_min = Math.round((he_decimal - he_horas) * 60);
       
       // Estructura: TipoDoc|NumDoc|DiasLab|DiasNoLab|DiasSub|HrsOrd|MinOrd|HrsExt|MinExt
      const ord_horas = Math.floor(horas);
      const ord_min = Math.round((horas - ord_horas) * 60);
      content += `01|${d.documento_numero}|${dias}|0|0|${ord_horas}|${ord_min}|${he_horas}|${he_min}\n`;
     });
     const ruc = selectedPlanilla.empresa_ruc || '00000000000';
     const filename = `0601${selectedPlanilla.anio}${String(selectedPlanilla.mes).padStart(2, '0')}${ruc}.jor`;
     downloadTxt(content, filename);
   };

  const recalculatePlanilla = async () => {
    try {
      setLoading(true);
      await axios.post(`${API_URL}planillas.php?action=recalculate`, { id: selectedPlanilla.id });
      toast.success('Planilla recalculada');
      // Refrescar detalles y encabezado
      const response = await axios.get(`${API_URL}planillas.php?id=${selectedPlanilla.id}`);
      setSelectedPlanilla(response.data.header);
      setDetails(Array.isArray(response.data.details) ? response.data.details : []);
      // Refrescar lista para totales
      fetchPlanillas();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al recalcular planilla');
    } finally {
      setLoading(false);
    }
  };

  // Calculated Stats
  const stats = {
    totalPlanillas: planillas.length,
    totalPagado: planillas
      .filter(p => p.estado === 'Cerrado' || p.estado === 'Enviado')
      .reduce((acc, curr) => acc + parseFloat(curr.total_neto), 0),
    pendientes: planillas.filter(p => p.estado === 'Borrador').length
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Gestión de Planillas</h2>
          <p className="text-gray-600 text-sm md:text-base">Control de remuneraciones y reportes contables</p>
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm w-full md:w-auto justify-center"
        >
          <Plus size={20} className="mr-2" />
          Generar Planilla
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-blue-50 rounded-full mr-4">
            <FileText className="text-blue-600" size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Planillas Generadas</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.totalPlanillas}</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-green-50 rounded-full mr-4">
            <DollarSign className="text-green-600" size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Pagado (Año)</p>
            <h3 className="text-2xl font-bold text-gray-800">S/ {stats.totalPagado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-yellow-50 rounded-full mr-4">
            <Clock className="text-yellow-600" size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Pendientes de Pago</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.pendientes}</h3>
          </div>
        </div>
      </div>

      {/* Main List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">N° Orden</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Periodo</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Ingresos</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Neto</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {planillas.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No hay planillas generadas aún.
                  </td>
                </tr>
              ) : (
                planillas.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900">{idx + 1}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                          <Calendar size={16} />
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          {meses[p.mes - 1]} {p.anio}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{p.tipo}</td>
                    <td className="px-6 py-4 text-sm text-green-600 font-medium">
                      S/ {parseFloat(p.total_ingresos).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-sm text-blue-600 font-bold">
                      S/ {parseFloat(p.total_neto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full 
                        ${p.estado === 'Cerrado' ? 'bg-green-100 text-green-800' : 
                          p.estado === 'Enviado' ? 'bg-purple-100 text-purple-800' : 
                          'bg-yellow-100 text-yellow-800'}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-2">
                        <button 
                          onClick={() => viewDetails(p)}
                          className="text-blue-600 hover:text-blue-900 bg-blue-50 p-2 rounded-lg hover:bg-blue-100 transition-colors"
                          title="Ver / Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={!(p.mes === currentMonth && p.anio === currentYear)}
                          className={`p-2 rounded-lg transition-colors ${p.mes === currentMonth && p.anio === currentYear ? 'text-red-600 bg-red-50 hover:text-red-800 hover:bg-red-100' : 'text-gray-400 bg-gray-100 cursor-not-allowed'}`}
                          title={p.mes === currentMonth && p.anio === currentYear ? 'Eliminar planilla del mes' : 'Solo se puede eliminar la planilla del mes actual'}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Generar */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md transform transition-all">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Generar Nueva Planilla</h3>
              <button onClick={() => setShowGenerateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
                <select 
                  className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={generateParams.mes}
                  onChange={(e) => setGenerateParams({...generateParams, mes: e.target.value})}
                >
                  {meses.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                <input 
                  type="number" 
                  className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={generateParams.anio}
                  onChange={(e) => setGenerateParams({...generateParams, anio: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Planilla</label>
                <select 
                  className="w-full rounded-lg border-gray-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={generateParams.tipo}
                  onChange={(e) => setGenerateParams({...generateParams, tipo: e.target.value})}
                >
                  <option value="Mensual">Mensual (Regular)</option>
                  <option value="Gratificacion">Gratificación (Julio/Dic)</option>
                  <option value="CTS">CTS (Mayo/Nov)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {generateParams.tipo === 'Gratificacion' && 'Calcula sueldo completo + 9% bono (Proporcional a fecha ingreso)'}
                  {generateParams.tipo === 'CTS' && 'Calcula (Sueldo + 1/6 Grati) / 2 (Proporcional)'}
                  {generateParams.tipo === 'Mensual' && 'Cálculo regular con descuentos de ley y horas extras'}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button 
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleGenerate}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition-all flex items-center"
                >
                  {loading ? 'Generando...' : 'Generar Planilla'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalles */}
      {showDetailModal && selectedPlanilla && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-8">
          <div className="bg-white rounded-2xl w-full max-w-[95%] md:max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="p-4 md:p-6 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 gap-4">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                  Planilla {meses[selectedPlanilla.mes - 1]} {selectedPlanilla.anio}
                  <span className="text-sm font-normal text-gray-500 px-2 py-1 bg-gray-200 rounded-full">
                    {selectedPlanilla.tipo}
                  </span>
                </h3>
                <span className={`mt-1 inline-block text-sm font-medium px-2 py-0.5 rounded ${
                  selectedPlanilla.estado === 'Cerrado' ? 'text-green-700 bg-green-100' : 'text-yellow-700 bg-yellow-100'
                }`}>
                  Estado: {selectedPlanilla.estado}
                </span>
              </div>
              
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                 {selectedPlanilla.estado === 'Borrador' && (
                  <button 
                    onClick={() => updateStatus('Cerrado')}
                    className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                  >
                    <Check size={18} className="mr-2" /> Cerrar
                  </button>
                 )}
                 {selectedPlanilla.estado === 'Borrador' && (
                  <button
                    onClick={recalculatePlanilla}
                    className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    title="Recalcular planilla con asistencias del mes"
                  >
                    <Calculator size={18} className="mr-2" /> Volver a calcular
                  </button>
                 )}
                 {selectedPlanilla.estado === 'Cerrado' && (
                  <>
                    <button 
                      onClick={() => updateStatus('Borrador')}
                      className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors shadow-sm"
                      title="Reabrir para editar"
                    >
                      <Edit2 size={18} className="mr-2" /> Reabrir
                    </button>
                    <button 
                      onClick={() => updateStatus('Enviado')}
                      className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                    >
                      <FileText size={18} className="mr-2" /> Enviar
                    </button>
                  </>
                 )}
                
                <div className="flex gap-2 flex-1 md:flex-none">
                  <button onClick={exportExcel} className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors border border-gray-200" title="Exportar Excel">
                    <Download size={18} className="mr-1" /> .xlsx
                  </button>
                  <button onClick={exportPlameREM} className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200" title="Exportar Remuneraciones (.rem)">
                    <FileText size={18} className="mr-1" /> REM
                  </button>
                  <button onClick={exportPlameJOR} className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200" title="Exportar Jornada (.jor)">
                    <Clock size={18} className="mr-1" /> JOR
                  </button>
                </div>

                <button onClick={() => setShowDetailModal(false)} className="hidden md:flex p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              {/* Mobile Close Button */}
              <button onClick={() => setShowDetailModal(false)} className="absolute top-4 right-4 md:hidden p-2 text-gray-400 hover:text-gray-600 bg-white rounded-full shadow-sm">
                <X size={20} />
              </button>
            </div>

            {/* Body Modal - Scrollable */}
            <div className="flex-1 overflow-auto bg-white relative">
              <div className="min-w-[1000px] p-6"> {/* Enforce min-width for scrolling table */}
                <table className="w-full text-sm divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">N° Orden</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">Colaborador</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Sueldo Base</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Asig. Fam.</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">H.E (Monto)</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Bonos</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Comisiones</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Essalud (Aporte)</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Vida Ley (Aporte)</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">SCTR (Aporte)</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-700 uppercase tracking-wider bg-gray-100">Total Bruto</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">AFP/ONP</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">5ta Cat.</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Tardanzas</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 uppercase tracking-wider">Préstamos</th>
                      <th className="px-4 py-3 text-right font-semibold text-red-600 uppercase tracking-wider">Total Desc.</th>
                      <th className="px-4 py-3 text-right font-bold text-blue-600 uppercase tracking-wider bg-blue-50">Neto Pagar</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {details.map((d, idx) => (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-900">{idx + 1}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{d.apellidos}, {d.nombres}</div>
                          <div className="text-gray-500 text-xs flex items-center gap-1">
                            <span className="bg-gray-100 px-1 rounded">{d.documento_numero}</span>
                            <span>|</span>
                            <span>{d.regimen_pensionario}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{parseFloat(d.sueldo_base).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{parseFloat(d.asignacion_familiar_monto || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{parseFloat(d.monto_horas_extras).toFixed(2)}</td>
                        
                        {/* Editable Fields if Borrador */}
                        {selectedPlanilla.estado === 'Borrador' ? (
                          <>
                            <td className="px-4 py-3 text-right">
                              <input 
                                type="number" className="w-20 text-right border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                defaultValue={d.bonos}
                                onBlur={(e) => updateDetail({...d, bonos: parseFloat(e.target.value) || 0})}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input 
                                type="number" className="w-20 text-right border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                defaultValue={d.comisiones}
                                onBlur={(e) => updateDetail({...d, comisiones: parseFloat(e.target.value) || 0})}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right text-gray-600">{d.bonos}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{d.comisiones}</td>
                          </>
                        )}

                        {/* Aportes del empleador (siempre visibles) */}
                        <td className="px-4 py-3 text-right text-gray-600">{parseFloat(d.essalud_aporte || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{parseFloat(d.vida_ley_aporte || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{parseFloat(d.sctr_aporte || 0).toFixed(2)}</td>

                        <td className="px-4 py-3 text-right font-bold bg-gray-50 text-gray-800">{parseFloat(d.total_bruto).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {(d.afp_detalle || calcAfpDetalle(d)) ? (
                            <div className="text-xs text-gray-700 text-right">
                              <div className="font-medium">{(d.afp_detalle || calcAfpDetalle(d)).tipo}</div>
                              {(d.afp_detalle || calcAfpDetalle(d)).tipo !== 'ONP' ? (
                                <>
                                  <div>Aporte {parseFloat((d.afp_detalle || calcAfpDetalle(d)).aporte_pct).toFixed(2)}%: S/ {parseFloat((d.afp_detalle || calcAfpDetalle(d)).aporte).toFixed(2)}</div>
                                  <div>Seguro {parseFloat((d.afp_detalle || calcAfpDetalle(d)).seguro_pct).toFixed(2)}%: S/ {parseFloat((d.afp_detalle || calcAfpDetalle(d)).seguro).toFixed(2)}</div>
                                  <div>Comisión {parseFloat((d.afp_detalle || calcAfpDetalle(d)).comision_pct).toFixed(2)}%: S/ {parseFloat((d.afp_detalle || calcAfpDetalle(d)).comision).toFixed(2)}</div>
                                  <div className="mt-1 font-semibold">Total: S/ {parseFloat((d.afp_detalle || calcAfpDetalle(d)).total).toFixed(2)}</div>
                                </>
                              ) : (
                                <div>Aporte {parseFloat((d.afp_detalle || calcAfpDetalle(d)).aporte_pct).toFixed(2)}%: S/ {parseFloat((d.afp_detalle || calcAfpDetalle(d)).aporte).toFixed(2)}</div>
                              )}
                            </div>
                          ) : (
                            parseFloat(d.afp_onp_monto).toFixed(2)
                          )}
                        </td>
                        
                        {/* 5ta Categoria Editable */}
                        {selectedPlanilla.estado === 'Borrador' ? (
                          <td className="px-4 py-3 text-right">
                             <input 
                                type="number" className="w-20 text-right border border-red-200 rounded px-2 py-1 text-red-600 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-red-50"
                                defaultValue={d.quinta_categoria_monto}
                                onBlur={(e) => updateDetail({...d, quinta_categoria_monto: parseFloat(e.target.value) || 0})}
                              />
                          </td>
                        ) : (
                          <td className="px-4 py-3 text-right text-gray-600">{parseFloat(d.quinta_categoria_monto || 0).toFixed(2)}</td>
                        )}

                         {/* Editable Descuentos */}
                         {selectedPlanilla.estado === 'Borrador' ? (
                          <>
                            <td className="px-4 py-3 text-right">
                              <input 
                                type="number" className="w-20 text-right border border-red-200 rounded px-2 py-1 text-red-600 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-red-50"
                                defaultValue={d.tardanzas_monto}
                                onBlur={(e) => updateDetail({...d, tardanzas_monto: parseFloat(e.target.value) || 0})}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input 
                                type="number" className="w-20 text-right border border-red-200 rounded px-2 py-1 text-red-600 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-red-50"
                                defaultValue={d.prestamos}
                                onBlur={(e) => updateDetail({...d, prestamos: parseFloat(e.target.value) || 0})}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                             <td className="px-4 py-3 text-right text-red-600">{d.tardanzas_monto}</td>
                             <td className="px-4 py-3 text-right text-red-600">{d.prestamos}</td>
                          </>
                        )}

                        <td className="px-4 py-3 text-right font-medium text-red-600">{parseFloat(d.total_descuentos).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600 bg-blue-50">{parseFloat(d.neto_pagar).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 font-bold sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                    <tr>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3">TOTALES</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.sueldo_base), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.asignacion_familiar_monto || 0), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.monto_horas_extras), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.bonos), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.comisiones), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.essalud_aporte || 0), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.vida_ley_aporte || 0), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.sctr_aporte || 0), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-800">{parseFloat(selectedPlanilla.total_ingresos).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{details.reduce((acc, d) => acc + parseFloat(d.afp_onp_monto), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{details.reduce((acc, d) => acc + parseFloat(d.quinta_categoria_monto || 0), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{details.reduce((acc, d) => acc + parseFloat(d.tardanzas_monto), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{details.reduce((acc, d) => acc + parseFloat(d.prestamos), 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{parseFloat(selectedPlanilla.total_descuentos).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{parseFloat(selectedPlanilla.total_neto).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionPlanillas;
