import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Search, Plus, Save, FileText, History, CheckCircle, XCircle, MapPin, Phone, Mail, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { API_URL } from '../api/config';

const GestionClientes = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [clientes, setClientes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [showHistorialModal, setShowHistorialModal] = useState(false);

  const initialFormState = {
    tipo_doc: '6', // RUC by default
    num_doc: '',
    tipo_persona: 'Juridica',
    razon_social: '',
    direccion: '',
    telefono: '',
    email: '',
    contacto_nombre: '',
    segmento: 'General',
    tipo_cliente: 'Regular',
    condicion_pago: 'Contado',
    estado: 'Activo'
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    try {
      const res = await axios.get(`${API_URL}gestion_clientes.php?action=list`);
      setClientes(res.data);
    } catch (error) {
      console.error('Error fetching clientes', error);
    }
  };

  const handleValidateDoc = async () => {
    if (formData.tipo_doc === '6' && formData.num_doc.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos');
      return;
    }
    if (formData.tipo_doc === '1' && formData.num_doc.length !== 8) {
      toast.error('El DNI debe tener 8 dígitos');
      return;
    }

    try {
      const toastId = toast.loading('Consultando...');
      let url = `${API_URL}/gestion_clientes.php?action=validate_ruc&ruc=${formData.num_doc}`;
      
      if (formData.tipo_doc === '1') {
         url = `${API_URL}gestion_clientes.php?action=validate_dni&dni=${formData.num_doc}`;
      }

      const res = await axios.get(url);
      toast.dismiss(toastId);
      
      if (res.data && (res.data.razonSocial || res.data.nombres)) { // Support both response formats if needed
        const razonSocial = res.data.razonSocial || (res.data.nombres + ' ' + res.data.apellido_paterno + ' ' + res.data.apellido_materno).trim();
        
        setFormData(prev => ({
          ...prev,
          razon_social: razonSocial,
          direccion: res.data.direccion || '',
          estado: res.data.estado === 'ACTIVO' ? 'Activo' : 'Inactivo',
          tipo_persona: formData.tipo_doc === '6' && (razonSocial.startsWith('E.I.R.L') || !razonSocial.includes(' S.A')) ? 'Juridica' : (formData.tipo_doc === '1' ? 'Natural' : 'Juridica')
        }));
        toast.success('Datos encontrados');
      } else {
        toast.error('No se encontraron datos');
      }
    } catch (error) {
      console.error(error);
      toast.dismiss();
      toast.error('Error al consultar documento');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const action = formData.id ? 'update' : 'create';
      await axios.post(`${API_URL}gestion_clientes.php?action=${action}`, formData);
      toast.success(formData.id ? 'Cliente actualizado' : 'Cliente registrado');
      fetchClientes();
      setActiveTab('list');
      setFormData(initialFormState);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al guardar');
    }
  };

  const handleEdit = (cliente) => {
    setFormData(cliente);
    setActiveTab('form');
  };

  const handleHistory = async (cliente) => {
    setSelectedCliente(cliente);
    try {
      const res = await axios.get(`${API_URL}gestion_clientes.php?action=history&num_doc=${cliente.num_doc}`);
      setHistorial(res.data);
      setShowHistorialModal(true);
    } catch (error) {
      toast.error('Error al cargar historial');
    }
  };

  const filteredClientes = clientes.filter(c => 
    c.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.num_doc.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="text-blue-600" />
          Gestión de Clientes
        </h2>
        <button
          onClick={() => {
            setFormData(initialFormState);
            setActiveTab('form');
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} /> Nuevo Cliente
        </button>
      </div>

      {activeTab === 'list' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por Razón Social o RUC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-semibold text-gray-600">Cliente / Razón Social</th>
                <th className="p-4 font-semibold text-gray-600">Documento</th>
                <th className="p-4 font-semibold text-gray-600">Clasificación</th>
                <th className="p-4 font-semibold text-gray-600">Contacto</th>
                <th className="p-4 font-semibold text-gray-600">Estado</th>
                <th className="p-4 font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientes.map((cliente) => (
                <tr key={cliente.id} className="hover:bg-gray-50">
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{cliente.razon_social}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin size={12} /> {cliente.direccion || 'Sin dirección'}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-mono">
                      {cliente.tipo_doc === '1' ? 'DNI' : 'RUC'}: {cliente.num_doc}
                    </span>
                    <div className="text-xs text-gray-400 mt-1">{cliente.tipo_persona}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full w-fit">
                            {cliente.tipo_cliente}
                        </span>
                        <span className="text-xs text-gray-500">Seg: {cliente.segmento}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    {cliente.contacto_nombre ? (
                        <div className="flex items-center gap-1 text-sm text-gray-700">
                            <User size={14} /> {cliente.contacto_nombre}
                        </div>
                    ) : '-'}
                    {cliente.telefono && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <Phone size={12} /> {cliente.telefono}
                        </div>
                    )}
                  </td>
                  <td className="p-4">
                    {cliente.estado === 'Activo' ? (
                      <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                        <CheckCircle size={14} /> Activo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
                        <XCircle size={14} /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="p-4 flex gap-2">
                    <button 
                      onClick={() => handleHistory(cliente)}
                      className="p-1.5 text-purple-600 hover:bg-purple-50 rounded" 
                      title="Historial Comercial"
                    >
                      <History size={18} />
                    </button>
                    <button 
                      onClick={() => handleEdit(cliente)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" 
                      title="Editar"
                    >
                      <FileText size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold">
              {formData.id ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h3>
            <button
              onClick={() => setActiveTab('list')}
              className="text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sección 1: Identificación */}
            <div className="md:col-span-2 border-b border-gray-100 pb-4 mb-2">
                <h4 className="text-sm font-bold text-gray-500 uppercase mb-4">Identificación</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Persona</label>
                        <select
                            value={formData.tipo_persona}
                            onChange={(e) => setFormData({...formData, tipo_persona: e.target.value})}
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="Natural">Natural</option>
                            <option value="Juridica">Jurídica</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Doc</label>
                        <select
                            value={formData.tipo_doc}
                            onChange={(e) => setFormData({...formData, tipo_doc: e.target.value})}
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="1">DNI</option>
                            <option value="6">RUC</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Número Doc</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={formData.num_doc}
                                onChange={(e) => setFormData({...formData, num_doc: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                maxLength={formData.tipo_doc === '6' ? 11 : 8}
                                required
                            />
                            {formData.tipo_doc === '6' && (
                                <button
                                    type="button"
                                    onClick={handleValidateDoc}
                                    className="bg-blue-100 text-blue-600 px-3 rounded-lg hover:bg-blue-200"
                                    title="Validar SUNAT"
                                >
                                    <Search size={18} />
                                </button>
                            )}
                            {formData.tipo_doc === '1' && (
                                <button
                                    type="button"
                                    onClick={handleValidateDoc}
                                    className="bg-blue-100 text-blue-600 px-3 rounded-lg hover:bg-blue-200"
                                    title="Validar RENIEC"
                                >
                                    <Search size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sección 2: Datos Generales */}
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social / Nombre Completo</label>
                <input
                    type="text"
                    value={formData.razon_social}
                    onChange={(e) => setFormData({...formData, razon_social: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
            </div>

            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección Fiscal</label>
                <input
                    type="text"
                    value={formData.direccion}
                    onChange={(e) => setFormData({...formData, direccion: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Sección 3: Contacto */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Contacto</label>
                <input
                    type="text"
                    value={formData.contacto_nombre}
                    onChange={(e) => setFormData({...formData, contacto_nombre: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                    type="text"
                    value={formData.telefono}
                    onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Sección 4: Clasificación */}
            <div className="md:col-span-2 border-t border-gray-100 pt-4 mt-2">
                <h4 className="text-sm font-bold text-gray-500 uppercase mb-4">Clasificación</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Cliente</label>
                        <select
                            value={formData.tipo_cliente}
                            onChange={(e) => setFormData({...formData, tipo_cliente: e.target.value})}
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="Regular">Regular</option>
                            <option value="VIP">VIP</option>
                            <option value="Corporativo">Corporativo</option>
                            <option value="Distribuidor">Distribuidor</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
                        <select
                            value={formData.segmento}
                            onChange={(e) => setFormData({...formData, segmento: e.target.value})}
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="General">General</option>
                            <option value="Retail">Retail</option>
                            <option value="Mayorista">Mayorista</option>
                            <option value="Gobierno">Gobierno</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                        <select
                            value={formData.estado}
                            onChange={(e) => setFormData({...formData, estado: e.target.value})}
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="Activo">Activo</option>
                            <option value="Inactivo">Inactivo</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 pt-4">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save size={20} /> Guardar Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Historial Modal */}
      {showHistorialModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="text-xl font-bold text-gray-800">Historial Comercial</h3>
                <p className="text-sm text-gray-500">{selectedCliente?.razon_social}</p>
              </div>
              <button 
                onClick={() => setShowHistorialModal(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-2 rounded-lg transition-colors"
              >
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Comprobante</th>
                    <th className="p-3">Importe</th>
                    <th className="p-3">Moneda</th>
                    <th className="p-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {historial.map((item, index) => (
                    <tr key={index}>
                      <td className="p-3">{item.fecha_emision}</td>
                      <td className="p-3">{item.serie}-{item.correlativo}</td>
                      <td className="p-3 font-medium">
                         {item.moneda === 'PEN' ? 'S/' : '$'} {item.total_importe}
                      </td>
                      <td className="p-3">{item.moneda}</td>
                      <td className="p-3">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">
                            {item.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {historial.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        No hay historial de compras registrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionClientes;
