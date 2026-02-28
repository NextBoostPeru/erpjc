import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  DollarSign, Calculator, Calendar, User, 
  CreditCard, Gift, Plus, Check, X, Search,
  Edit, Trash2, ChevronRight, Wallet, History
} from 'lucide-react';

import { API_URL } from '../api/config';

const BeneficiosCompensaciones = () => {
  const [activeTab, setActiveTab] = useState('cts');
  const [loading, setLoading] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);
  const [selectedColab, setSelectedColab] = useState('');
  const [calculation, setCalculation] = useState(null);
  const [history, setHistory] = useState([]);
  const [loans, setLoans] = useState([]);
  const [benefits, setBenefits] = useState([]);
  const [internalBenefits, setInternalBenefits] = useState([]);
  
  // Modal states
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false); // For assigning
  const [showManageBenefitModal, setShowManageBenefitModal] = useState(false); // For CRUD
  
  // Forms
  const [loanForm, setLoanForm] = useState({
    colaborador_id: '', monto_total: '', cuotas_totales: '', fecha_solicitud: new Date().toISOString().split('T')[0], motivo: ''
  });

  const [benefitForm, setBenefitForm] = useState({
    id: null, nombre: '', descripcion: '', monto_referencial: ''
  });

  const [assignForm, setAssignForm] = useState({
    colaborador_id: '', beneficio_id: ''
  });

  useEffect(() => {
    fetchColaboradores();
    fetchInternalBenefits();
  }, []);

  useEffect(() => {
    if (activeTab === 'cts' || activeTab === 'grati') fetchHistory(activeTab);
    if (activeTab === 'prestamos') fetchLoans();
    if (activeTab === 'beneficios') fetchBenefits();
  }, [activeTab]);

  const fetchColaboradores = async () => {
    try {
      const res = await axios.get(`${API_URL}/colaboradores.php`);
      setColaboradores(res.data.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchInternalBenefits = async () => {
    try {
      const res = await axios.get(`${API_URL}/beneficios.php?action=beneficios_internos`);
      setInternalBenefits(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchHistory = async (type) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/beneficios.php?action=history&type=${type}`);
      if (Array.isArray(res.data)) {
        setHistory(res.data);
      } else {
        console.error("Invalid history data:", res.data);
        setHistory([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLoans = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/beneficios.php?action=prestamos`);
      setLoans(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBenefits = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/beneficios.php?action=colaboradores_beneficios`);
      setBenefits(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!selectedColab) {
      toast.error('Seleccione un colaborador');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/beneficios.php?action=calculate&type=${activeTab}&colaborador_id=${selectedColab}`);
      setCalculation(res.data);
    } catch (error) {
      toast.error('Error al calcular');
    } finally {
      setLoading(false);
    }
  };

  const saveCalculation = async () => {
    if (!calculation || !selectedColab) return;
    try {
      const payload = {
        colaborador_id: selectedColab,
        periodo: new Date().toISOString().slice(0, 7), // YYYY-MM
        fecha_pago: new Date().toISOString().split('T')[0],
        sueldo_computable: activeTab === 'cts' ? calculation.total_computable : calculation.remuneracion_computable,
        monto_cts: calculation.monto_proyectado,
        monto_gratificacion: calculation.remuneracion_computable,
        bono_extraordinario: calculation.bono_extraordinario,
        monto_total: calculation.monto_proyectado
      };

      await axios.post(`${API_URL}/beneficios.php?action=save_calc&type=${activeTab}`, payload);
      toast.success('Guardado correctamente');
      setCalculation(null);
      fetchHistory(activeTab);
    } catch (error) {
      toast.error('Error al guardar');
    }
  };

  const submitLoan = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/beneficios.php?action=prestamo`, loanForm);
      toast.success('Préstamo registrado');
      setShowLoanModal(false);
      setLoanForm({ ...loanForm, monto_total: '', cuotas_totales: '', motivo: '' });
      fetchLoans();
    } catch (error) {
      toast.error('Error al registrar préstamo');
    }
  };

  const updateLoanStatus = async (id, status) => {
    try {
      await axios.put(`${API_URL}/beneficios.php?action=prestamo_status`, { id, estado: status });
      toast.success('Estado actualizado');
      fetchLoans();
    } catch (error) {
      toast.error('Error al actualizar');
    }
  };

  const handlePayLoan = async (id) => {
    try {
        await axios.put(`${API_URL}/beneficios.php?action=pay_loan`, { id });
        toast.success('Pago registrado');
        fetchLoans();
    } catch (error) {
        toast.error(error.response?.data?.message || 'Error al registrar pago');
    }
  };

  // Internal Benefits Management
  const submitBenefit = async (e) => {
    e.preventDefault();
    try {
        if (benefitForm.id) {
            await axios.put(`${API_URL}/beneficios.php?action=update_beneficio`, benefitForm);
            toast.success('Beneficio actualizado');
        } else {
            await axios.post(`${API_URL}/beneficios.php?action=create_beneficio`, benefitForm);
            toast.success('Beneficio creado');
        }
        setShowManageBenefitModal(false);
        setBenefitForm({ id: null, nombre: '', descripcion: '', monto_referencial: '' });
        fetchInternalBenefits();
    } catch (error) {
        toast.error('Error al guardar beneficio');
    }
  };

  const handleDeleteBenefit = async (id) => {
    if(!window.confirm('¿Está seguro de eliminar este beneficio?')) return;
    try {
        await axios.delete(`${API_URL}/beneficios.php?action=delete_beneficio&id=${id}`);
        toast.success('Beneficio eliminado');
        fetchInternalBenefits();
    } catch (error) {
        toast.error('Error al eliminar');
    }
  };

  const submitAssignBenefit = async (e) => {
    e.preventDefault();
    try {
        await axios.post(`${API_URL}/beneficios.php?action=assign_beneficio`, assignForm);
        toast.success('Beneficio asignado correctamente');
        setShowBenefitModal(false);
        fetchBenefits();
    } catch (error) {
        toast.error('Error al asignar beneficio');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Beneficios y Compensaciones</h2>
          <p className="text-gray-600">Gestión integral de beneficios laborales</p>
        </div>
        <div className="flex gap-2">
            {activeTab === 'beneficios' && (
                <>
                <button 
                    onClick={() => { setBenefitForm({ id: null, nombre: '', descripcion: '', monto_referencial: '' }); setShowManageBenefitModal(true); }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm font-medium"
                >
                    <Gift size={18} /> Gestionar Tipos
                </button>
                <button 
                    onClick={() => setShowBenefitModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
                >
                    <Plus size={18} /> Asignar Beneficio
                </button>
                </>
            )}
            {activeTab === 'prestamos' && (
                <button 
                    onClick={() => setShowLoanModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
                >
                    <Plus size={18} /> Nuevo Préstamo
                </button>
            )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-8 min-w-max">
          {[
            { id: 'cts', label: 'CTS', icon: Wallet },
            { id: 'grati', label: 'Gratificaciones', icon: Gift },
            { id: 'prestamos', label: 'Préstamos', icon: CreditCard },
            { id: 'beneficios', label: 'Beneficios Corp.', icon: Check }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setCalculation(null); setSelectedColab(''); }}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
                ${activeTab === tab.id 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {(activeTab === 'cts' || activeTab === 'grati') && (
        <div className="space-y-6">
          {/* Calculator Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Calculator className="text-blue-500" size={20}/>
                Calculadora de {activeTab.toUpperCase()}
            </h3>
            
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <select 
                    className="pl-10 block w-full rounded-xl border-gray-200 bg-gray-50 p-2.5 focus:border-blue-500 focus:ring-blue-500"
                    value={selectedColab}
                    onChange={(e) => setSelectedColab(e.target.value)}
                    >
                    <option value="">Seleccione un colaborador...</option>
                    {colaboradores.map(c => (
                        <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                    ))}
                    </select>
                </div>
              </div>
              <button 
                onClick={handleCalculate}
                disabled={loading}
                className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Calculando...' : <><Calculator size={18} /> Calcular</>}
              </button>
            </div>

            {calculation && (
              <div className="mt-8 p-6 bg-blue-50/50 rounded-2xl border border-blue-100 animation-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-blue-900">Resultado de Proyección</h4>
                    <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                        {new Date().toLocaleDateString()}
                    </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                    <span className="text-xs text-gray-500 block mb-1">Sueldo Base</span>
                    <span className="font-bold text-gray-800 text-lg">S/ {calculation.sueldo_base}</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                    <span className="text-xs text-gray-500 block mb-1">Asig. Familiar</span>
                    <span className="font-bold text-gray-800 text-lg">S/ {calculation.asignacion_familiar}</span>
                  </div>
                  {activeTab === 'cts' ? (
                    <>
                      <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                        <span className="text-xs text-gray-500 block mb-1">1/6 Gratificación</span>
                        <span className="font-bold text-gray-800 text-lg">S/ {calculation.grati_sexto}</span>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm ring-2 ring-blue-500/20">
                        <span className="text-xs text-blue-600 font-semibold block mb-1">CTS Proyectada</span>
                        <span className="font-bold text-blue-700 text-xl">S/ {calculation.monto_proyectado}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                        <span className="text-xs text-gray-500 block mb-1">Bono 9%</span>
                        <span className="font-bold text-gray-800 text-lg">S/ {calculation.bono_extraordinario}</span>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm ring-2 ring-green-500/20">
                        <span className="text-xs text-green-600 font-semibold block mb-1">Total a Pagar</span>
                        <span className="font-bold text-green-700 text-xl">S/ {calculation.monto_proyectado}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-6 flex justify-end">
                  <button 
                    onClick={saveCalculation}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 flex items-center gap-2 font-medium shadow-sm shadow-green-600/20"
                  >
                    <Check size={18} /> Confirmar y Guardar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* History Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <History size={18} className="text-gray-500"/> Historial de Pagos
              </h3>
            </div>
            
            {/* Mobile View */}
            <div className="md:hidden divide-y divide-gray-100">
                {history.map((h) => (
                    <div key={h.id} className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-gray-800">{h.apellidos}, {h.nombres}</h4>
                                <p className="text-sm text-gray-500">{h.documento_numero}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${h.estado === 'Pagado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {h.estado}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Periodo: {h.periodo}</span>
                            <span className="font-bold text-gray-900 text-lg">
                                S/ {activeTab === 'cts' ? h.monto_cts : h.monto_total}
                            </span>
                        </div>
                    </div>
                ))}
                 {history.length === 0 && <div className="p-8 text-center text-gray-500">No hay registros</div>}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Colaborador</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Periodo</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {history.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{h.apellidos}, {h.nombres}</div>
                            <div className="text-xs text-gray-500">{h.documento_numero}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{h.periodo}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        S/ {activeTab === 'cts' ? h.monto_cts : h.monto_total}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${h.estado === 'Pagado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {h.estado}
                        </span>
                        </td>
                    </tr>
                    ))}
                    {history.length === 0 && (
                        <tr><td colSpan="4" className="p-8 text-center text-gray-500">No hay registros</td></tr>
                    )}
                </tbody>
                </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'prestamos' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
             {/* Mobile View */}
             <div className="md:hidden divide-y divide-gray-100">
                {loans.map((l) => (
                    <div key={l.id} className="p-4 space-y-3">
                         <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-gray-800">{l.apellidos}, {l.nombres}</h4>
                                <p className="text-xs text-gray-500">{l.fecha_solicitud}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium 
                                ${l.estado === 'Aprobado' || l.estado === 'Pagado' ? 'bg-green-100 text-green-700' : 
                                l.estado === 'Rechazado' ? 'bg-red-100 text-red-700' : 
                                'bg-yellow-100 text-yellow-700'}`}>
                                {l.estado}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <span className="block text-xs text-gray-400">Monto Total</span>
                                <span className="font-bold text-gray-800">S/ {l.monto_total}</span>
                            </div>
                            <div>
                                <span className="block text-xs text-gray-400">Cuotas</span>
                                <span className="text-gray-600">{l.cuotas_pagadas} / {l.cuotas_totales}</span>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                             {l.estado === 'Pendiente' && (
                                <>
                                <button onClick={() => updateLoanStatus(l.id, 'Aprobado')} className="p-2 bg-green-50 text-green-600 rounded-lg"><Check size={18}/></button>
                                <button onClick={() => updateLoanStatus(l.id, 'Rechazado')} className="p-2 bg-red-50 text-red-600 rounded-lg"><X size={18}/></button>
                                </>
                             )}
                              {l.estado === 'Aprobado' && l.cuotas_pagadas < l.cuotas_totales && (
                                <button onClick={() => handlePayLoan(l.id)} className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium">Registrar Pago Cuota</button>
                             )}
                        </div>
                    </div>
                ))}
                 {loans.length === 0 && <div className="p-8 text-center text-gray-500">No hay préstamos</div>}
             </div>

            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Colaborador</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Monto</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Cuotas</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {loans.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{l.apellidos}, {l.nombres}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{l.fecha_solicitud}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">S/ {l.monto_total}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                            <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                    <div className="bg-blue-600 h-2 rounded-full" style={{width: `${(l.cuotas_pagadas/l.cuotas_totales)*100}%`}}></div>
                                </div>
                                <span className="text-xs">{l.cuotas_pagadas}/{l.cuotas_totales}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium 
                            ${l.estado === 'Aprobado' || l.estado === 'Pagado' ? 'bg-green-100 text-green-700' : 
                            l.estado === 'Rechazado' ? 'bg-red-100 text-red-700' : 
                            'bg-yellow-100 text-yellow-700'}`}>
                            {l.estado}
                        </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {l.estado === 'Pendiente' && (
                            <div className="flex justify-end gap-2">
                            <button onClick={() => updateLoanStatus(l.id, 'Aprobado')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={18} /></button>
                            <button onClick={() => updateLoanStatus(l.id, 'Rechazado')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><X size={18} /></button>
                            </div>
                        )}
                        {l.estado === 'Aprobado' && l.cuotas_pagadas < l.cuotas_totales && (
                             <button onClick={() => handlePayLoan(l.id)} className="text-blue-600 hover:text-blue-800 text-xs font-medium border border-blue-200 px-2 py-1 rounded bg-blue-50">
                                Registrar Pago
                             </button>
                        )}
                        </td>
                    </tr>
                    ))}
                     {loans.length === 0 && (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-500">No hay préstamos registrados</td></tr>
                    )}
                </tbody>
                </table>
            </div>
        </div>
      )}

      {activeTab === 'beneficios' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
             <h3 className="font-bold text-gray-800">Colaboradores con Beneficios</h3>
          </div>
          
           {/* Mobile View */}
           <div className="md:hidden divide-y divide-gray-100">
               {benefits.map((b) => (
                   <div key={b.id} className="p-4 flex justify-between items-center">
                       <div>
                           <h4 className="font-bold text-gray-800">{b.apellidos}, {b.nombres}</h4>
                           <div className="flex items-center gap-2">
                                <p className="text-sm text-blue-600 font-medium">{b.beneficio}</p>
                                {b.monto_referencial > 0 && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-100">S/ {b.monto_referencial}</span>}
                           </div>
                           <p className="text-xs text-gray-400 mt-1">{b.fecha_asignacion}</p>
                       </div>
                   </div>
               ))}
               {benefits.length === 0 && <div className="p-8 text-center text-gray-500">No hay beneficios asignados</div>}
           </div>

           {/* Desktop View */}
           <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Colaborador</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Beneficio</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Fecha Asignación</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {benefits.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                        {b.apellidos}, {b.nombres}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium bg-blue-50/50">
                            <div className="flex flex-col items-start">
                                <span className="px-3 py-1 rounded-full bg-white/50 border border-blue-100">{b.beneficio}</span>
                                {b.monto_referencial > 0 && <span className="text-xs text-green-600 mt-1 ml-1 font-semibold">Valor: S/ {b.monto_referencial}</span>}
                            </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{b.fecha_asignacion}</td>
                    </tr>
                    ))}
                    {benefits.length === 0 && (
                        <tr><td colSpan="3" className="p-8 text-center text-gray-500">No hay beneficios asignados</td></tr>
                    )}
                </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Modal Prestamo */}
      {showLoanModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md transform transition-all">
            <h3 className="text-xl font-bold mb-6 text-gray-800">Solicitar Préstamo</h3>
            <form onSubmit={submitLoan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                <select 
                  className="w-full rounded-xl border-gray-200 bg-gray-50 p-2.5 focus:border-blue-500 focus:ring-blue-500"
                  required
                  value={loanForm.colaborador_id}
                  onChange={(e) => setLoanForm({...loanForm, colaborador_id: e.target.value})}
                >
                  <option value="">Seleccione...</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto (S/)</label>
                    <input 
                    type="number" step="0.01" required
                    className="w-full rounded-xl border-gray-200 bg-gray-50 p-2.5"
                    value={loanForm.monto_total}
                    onChange={(e) => setLoanForm({...loanForm, monto_total: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cuotas</label>
                    <input 
                    type="number" required
                    className="w-full rounded-xl border-gray-200 bg-gray-50 p-2.5"
                    value={loanForm.cuotas_totales}
                    onChange={(e) => setLoanForm({...loanForm, cuotas_totales: e.target.value})}
                    />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <textarea 
                  className="w-full rounded-xl border-gray-200 bg-gray-50 p-2.5"
                  rows="3"
                  value={loanForm.motivo}
                  onChange={(e) => setLoanForm({...loanForm, motivo: e.target.value})}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowLoanModal(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Manage Benefits (CRUD) */}
      {showManageBenefitModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">Gestionar Tipos de Beneficios</h3>
                    <button onClick={() => setShowManageBenefitModal(false)} className="text-gray-400 hover:text-gray-600"><X/></button>
                </div>
                
                <form onSubmit={submitBenefit} className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100">
                    <h4 className="font-semibold text-gray-700 mb-3">{benefitForm.id ? 'Editar Beneficio' : 'Nuevo Beneficio'}</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <input 
                                type="text" placeholder="Nombre del beneficio" required
                                className="w-full rounded-lg border-gray-200 p-2.5"
                                value={benefitForm.nombre}
                                onChange={(e) => setBenefitForm({...benefitForm, nombre: e.target.value})}
                            />
                        </div>
                        <div>
                            <input 
                                type="text" placeholder="Descripción corta"
                                className="w-full rounded-lg border-gray-200 p-2.5"
                                value={benefitForm.descripcion}
                                onChange={(e) => setBenefitForm({...benefitForm, descripcion: e.target.value})}
                            />
                        </div>
                        <div>
                            <input 
                                type="number" step="0.01" placeholder="Monto Referencial (S/)"
                                className="w-full rounded-lg border-gray-200 p-2.5"
                                value={benefitForm.monto_referencial}
                                onChange={(e) => setBenefitForm({...benefitForm, monto_referencial: e.target.value})}
                            />
                        </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                         {benefitForm.id && (
                             <button type="button" onClick={() => setBenefitForm({id: null, nombre: '', descripcion: '', monto_referencial: ''})} className="text-sm text-gray-500 hover:text-gray-700 underline">Cancelar Edición</button>
                         )}
                         <button type="submit" className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900">
                             {benefitForm.id ? 'Actualizar' : 'Agregar'}
                         </button>
                    </div>
                </form>

                <div className="space-y-3">
                    {internalBenefits.map(ib => (
                        <div key={ib.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:shadow-sm transition-shadow">
                            <div className="flex-1 mr-4">
                                <div className="flex justify-between items-center mb-1">
                                    <h5 className="font-medium text-gray-800">{ib.nombre}</h5>
                                    {ib.monto_referencial > 0 && <span className="text-sm font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">S/ {ib.monto_referencial}</span>}
                                </div>
                                <p className="text-sm text-gray-500">{ib.descripcion}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setBenefitForm(ib)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16}/></button>
                                <button onClick={() => handleDeleteBenefit(ib.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                    {internalBenefits.length === 0 && <p className="text-center text-gray-400 py-4">No hay beneficios configurados</p>}
                </div>
            </div>
          </div>
      )}

      {/* Modal Assign Benefit */}
      {showBenefitModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-6 text-gray-800">Asignar Beneficio</h3>
                <form onSubmit={submitAssignBenefit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                        <select 
                        className="w-full rounded-xl border-gray-200 bg-gray-50 p-2.5"
                        required
                        value={assignForm.colaborador_id}
                        onChange={(e) => setAssignForm({...assignForm, colaborador_id: e.target.value})}
                        >
                        <option value="">Seleccione...</option>
                        {colaboradores.map(c => (
                            <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                        ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Beneficio</label>
                        <select 
                        className="w-full rounded-xl border-gray-200 bg-gray-50 p-2.5"
                        required
                        value={assignForm.beneficio_id}
                        onChange={(e) => setAssignForm({...assignForm, beneficio_id: e.target.value})}
                        >
                        <option value="">Seleccione...</option>
                        {internalBenefits.map(b => (
                            <option key={b.id} value={b.id}>{b.nombre}</option>
                        ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setShowBenefitModal(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Asignar</button>
                    </div>
                </form>
            </div>
          </div>
      )}

    </div>
  );
};

export default BeneficiosCompensaciones;