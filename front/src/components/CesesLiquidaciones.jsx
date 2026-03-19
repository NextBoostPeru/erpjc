import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, Calculator, Save, UserMinus, FileCheck, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { API_URL } from '../api/config';

const CesesLiquidaciones = () => {
  const [activeTab, setActiveTab] = useState('nuevo');
  const [colaboradores, setColaboradores] = useState([]);
  const [ceses, setCeses] = useState([]);
  const [formData, setFormData] = useState({
    colaborador_id: '',
    fecha_cese: new Date().toISOString().split('T')[0],
    motivo: 'Renuncia',
    observaciones: ''
  });
  const [calculo, setCalculo] = useState(null);

  useEffect(() => {
    fetchColaboradores();
    fetchCeses();
  }, []);

  const fetchColaboradores = async () => {
    try {
      const res = await axios.get(`${API_URL}/colaboradores.php?action=simple_list&limit=5000`);
      const data = res.data?.data || res.data;
      setColaboradores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching colaboradores', error);
      setColaboradores([]);
      toast.error('Error al cargar colaboradores');
    }
  };

  const fetchCeses = async () => {
    try {
      const res = await axios.get(`${API_URL}/ceses.php?action=list`);
      setCeses(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching ceses', error);
      setCeses([]);
      toast.error('Error al cargar historial');
    }
  };

  const handleCalculate = async () => {
    if (!formData.colaborador_id || !formData.fecha_cese) {
      toast.error('Seleccione colaborador y fecha');
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/ceses.php?action=calculate&colaborador_id=${formData.colaborador_id}&fecha_cese=${formData.fecha_cese}`);
      setCalculo(res.data);
      toast.success('Cálculo realizado');
    } catch (error) {
      toast.error('Error al calcular');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!calculo) {
      toast.error('Debe calcular la liquidación primero');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/ceses.php?action=create`, {
        ...formData,
        calculo: calculo
      });
      toast.success('Cese registrado y procesado');
      setFormData({
        colaborador_id: '',
        fecha_cese: new Date().toISOString().split('T')[0],
        motivo: 'Renuncia',
        observaciones: ''
      });
      setCalculo(null);
      fetchCeses();
      setActiveTab('historial');
    } catch (error) {
      toast.error('Error al guardar');
    }
  };

  const generateDoc = (cese, type) => {
    const printWindow = window.open('', '_blank');
    const title = type === 'carta_liquidacion' ? 'HOJA DE LIQUIDACIÓN DE BENEFICIOS SOCIALES' : 'CERTIFICADO DE TRABAJO';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; }
            h1 { text-align: center; font-size: 18px; text-decoration: underline; margin-bottom: 30px; }
            .content { margin-bottom: 40px; text-align: justify; }
            .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .details-table th, .details-table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            .amount { text-align: right; }
            .signature-section { display: flex; justify-content: space-around; margin-top: 80px; }
            .signature { text-align: center; }
            .signature-line { border-top: 1px solid #000; width: 200px; margin: 0 auto 10px auto; }
            @media print { body { padding: 20px; } button { display: none; } }
          </style>
        </head>
        <body>
          <div style="text-align: right; margin-bottom: 20px;">
             Fecha de Impresión: ${new Date().toLocaleDateString()}
          </div>

          <h1>${title}</h1>
          
          <div class="content">
            <p><strong>COLABORADOR:</strong> ${cese.nombres} ${cese.apellidos}</p>
            <p><strong>DOCUMENTO DE IDENTIDAD:</strong> ${cese.documento_numero}</p>
            <p><strong>FECHA DE CESE:</strong> ${cese.fecha_cese}</p>
            <p><strong>MOTIVO DEL CESE:</strong> ${cese.motivo}</p>
          </div>

          ${type === 'carta_liquidacion' ? `
            <h3>DETALLE DE LA LIQUIDACIÓN</h3>
            <table class="details-table">
              <tr>
                <th>Concepto</th>
                <th class="amount">Monto (S/)</th>
              </tr>
              <tr>
                <td>Liquidación Neta a Pagar</td>
                <td class="amount"><strong>${cese.neto_pagar}</strong></td>
              </tr>
            </table>
            <p>El trabajador declara recibir conforme el monto detallado, liberando a la empresa de cualquier responsabilidad futura respecto a los conceptos liquidados en este documento.</p>
          ` : `
            <p>Certificamos que el Sr(a). <strong>${cese.nombres} ${cese.apellidos}</strong>, identificado(a) con DNI N° <strong>${cese.documento_numero}</strong>, ha laborado en nuestra empresa hasta el día <strong>${cese.fecha_cese}</strong>.</p>
            <p>Durante su permanencia, ha demostrado responsabilidad, honestidad y eficiencia en las labores encomendadas.</p>
            <p>Se expide el presente documento a solicitud del interesado para los fines que estime conveniente.</p>
          `}

          <div class="signature-section">
            <div class="signature">
                <div class="signature-line"></div>
                <p>EMPLEADOR</p>
            </div>
            
            ${type === 'carta_liquidacion' ? `
            <div class="signature">
                <div class="signature-line"></div>
                <p>TRABAJADOR</p>
                <p>DNI: ${cese.documento_numero}</p>
            </div>
            ` : ''}
          </div>

          <script>
            setTimeout(() => { window.print(); }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <UserMinus className="text-red-600" />
        Ceses y Liquidaciones
      </h2>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('nuevo')}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeTab === 'nuevo'
              ? 'border-b-2 border-red-600 text-red-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Nuevo Cese
        </button>
        <button
          onClick={() => setActiveTab('historial')}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeTab === 'historial'
              ? 'border-b-2 border-red-600 text-red-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Historial
        </button>
      </div>

      {activeTab === 'nuevo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Datos del Cese</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                <select
                  value={formData.colaborador_id}
                  onChange={(e) => setFormData({...formData, colaborador_id: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  required
                >
                  <option value="">Seleccione colaborador</option>
                  {Array.isArray(colaboradores) && colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.nombres} {c.apellidos}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Cese</label>
                <input
                  type="date"
                  value={formData.fecha_cese}
                  onChange={(e) => setFormData({...formData, fecha_cese: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <select
                  value={formData.motivo}
                  onChange={(e) => setFormData({...formData, motivo: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="Renuncia">Renuncia</option>
                  <option value="Despido">Despido</option>
                  <option value="Fin de Contrato">Fin de Contrato</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  rows="3"
                ></textarea>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCalculate}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Calculator size={18} /> Calcular
                </button>
              </div>
            </form>
          </div>

          {calculo && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">Liquidación Preliminar</h3>
              <div className="space-y-4">
                <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Remuneración Computable</span>
                  <span className="font-semibold">S/ {calculo.remuneracion_computable}</span>
                </div>
                
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Vacaciones Truncas</span>
                    <span className="font-medium">S/ {calculo.vacaciones_truncas}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">CTS Trunca</span>
                    <span className="font-medium">S/ {calculo.cts_trunca}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Gratificación Trunca</span>
                    <span className="font-medium">S/ {calculo.gratificacion_trunca}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Bonif. Extraordinaria (9%)</span>
                    <span className="font-medium">S/ {calculo.bonificacion_extraordinaria}</span>
                  </div>
                </div>

                <div className="flex justify-between p-4 bg-green-50 text-green-700 rounded-lg font-bold text-lg mt-6">
                  <span>Neto a Pagar</span>
                  <span>S/ {calculo.neto_pagar}</span>
                </div>

                <button
                  onClick={handleSubmit}
                  className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 mt-4"
                >
                  <Save size={18} /> Guardar y Procesar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'historial' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Historial de Ceses</h2>
          
          {/* Vista Móvil (Cards) */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {ceses.map((cese) => (
                <div key={cese.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-gray-800">{cese.nombres} {cese.apellidos}</h3>
                            <p className="text-sm text-gray-500">{cese.documento_numero}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            cese.estado === 'Procesado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                            {cese.estado}
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div>
                            <span className="block text-xs text-gray-400">Fecha Cese</span>
                            {cese.fecha_cese}
                        </div>
                        <div>
                            <span className="block text-xs text-gray-400">Motivo</span>
                            {cese.motivo}
                        </div>
                        <div className="col-span-2">
                            <span className="block text-xs text-gray-400">Liquidación</span>
                            <span className="font-medium text-green-600 text-lg">
                                {cese.neto_pagar ? `S/ ${cese.neto_pagar}` : '-'}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-3 border-t border-gray-50">
                         <button 
                            onClick={() => generateDoc(cese, 'carta_liquidacion')}
                            className="flex-1 flex items-center justify-center gap-1 p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm transition-colors" 
                        >
                            <FileText size={16} /> Liquidación
                        </button>
                        <button 
                            onClick={() => generateDoc(cese, 'certificado_trabajo')}
                            className="flex-1 flex items-center justify-center gap-1 p-2 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg text-sm transition-colors" 
                        >
                            <FileCheck size={16} /> Certificado
                        </button>
                    </div>
                </div>
            ))}
            {ceses.length === 0 && (
                <p className="text-center text-gray-500 py-8">No hay ceses registrados</p>
            )}
          </div>

          {/* Vista Desktop (Tabla) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left p-4 text-gray-600 font-medium">Colaborador</th>
                  <th className="text-left p-4 text-gray-600 font-medium">Fecha Cese</th>
                  <th className="text-left p-4 text-gray-600 font-medium">Motivo</th>
                  <th className="text-right p-4 text-gray-600 font-medium">Liquidación</th>
                  <th className="text-center p-4 text-gray-600 font-medium">Estado</th>
                  <th className="text-center p-4 text-gray-600 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ceses.map((cese) => (
                  <tr key={cese.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-gray-800">{cese.nombres} {cese.apellidos}</div>
                      <div className="text-sm text-gray-500">{cese.documento_numero}</div>
                    </td>
                    <td className="p-4 text-gray-600">{cese.fecha_cese}</td>
                    <td className="p-4 text-gray-600">{cese.motivo}</td>
                    <td className="p-4 text-right font-medium text-gray-800">
                      {cese.neto_pagar ? `S/ ${cese.neto_pagar}` : '-'}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        cese.estado === 'Procesado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {cese.estado}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => generateDoc(cese, 'carta_liquidacion')}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                          title="Carta de Liquidación"
                        >
                          <FileText size={18} />
                        </button>
                        <button 
                          onClick={() => generateDoc(cese, 'certificado_trabajo')}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Certificado de Trabajo"
                        >
                          <FileCheck size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {ceses.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center p-8 text-gray-500">
                      No hay ceses registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CesesLiquidaciones;
