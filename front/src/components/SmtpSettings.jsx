import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Mail, Save, Send, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const SmtpSettings = () => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_secure: 'tls',
    smtp_from_email: '',
    smtp_from_name: ''
  });
  const [testEmail, setTestEmail] = useState('');

  const token = localStorage.getItem('token');
  const axiosConfig = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/configuracion.php?action=get_smtp`, axiosConfig);
      if (res.data) {
        setSettings(prev => ({ ...prev, ...res.data }));
      }
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar configuración SMTP');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await axios.post(`${API_URL}/configuracion.php?action=save_smtp`, settings, axiosConfig);
      toast.success('Configuración SMTP guardada');
    } catch (error) {
      console.error(error);
      toast.error('Error al guardar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error('Ingrese un email para la prueba');
      return;
    }
    try {
      setTesting(true);
      await axios.post(`${API_URL}/configuracion.php?action=test_smtp`, { test_email: testEmail }, axiosConfig);
      toast.success('Correo de prueba enviado');
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Error al enviar correo de prueba';
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Mail className="text-blue-600" size={20} />
            Configuración de Correo (SMTP)
          </h2>
          <p className="text-sm text-gray-500 mt-1">Configura el servidor de correo para notificaciones y recuperación de contraseñas</p>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Servidor SMTP (Host)</label>
              <input
                type="text"
                name="smtp_host"
                value={settings.smtp_host}
                onChange={handleChange}
                placeholder="ej. smtp.gmail.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
              <input
                type="text"
                name="smtp_port"
                value={settings.smtp_port}
                onChange={handleChange}
                placeholder="ej. 587"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario SMTP</label>
              <input
                type="text"
                name="smtp_user"
                value={settings.smtp_user}
                onChange={handleChange}
                placeholder="usuario@dominio.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña SMTP</label>
              <input
                type="password"
                name="smtp_pass"
                value={settings.smtp_pass}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seguridad</label>
            <select
              name="smtp_secure"
              value={settings.smtp_secure}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            >
              <option value="">Ninguna</option>
              <option value="tls">TLS</option>
              <option value="ssl">SSL</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 mt-4">
             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Remitente</label>
              <input
                type="text"
                name="smtp_from_name"
                value={settings.smtp_from_name}
                onChange={handleChange}
                placeholder="Mi Empresa ERP"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email del Remitente</label>
              <input
                type="email"
                name="smtp_from_email"
                value={settings.smtp_from_email}
                onChange={handleChange}
                placeholder="no-reply@miempresa.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
            >
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>

        {/* Panel de Prueba */}
        <div className="bg-blue-50 rounded-xl p-6 h-fit border border-blue-100">
          <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
            <CheckCircle size={18} />
            Probar Configuración
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            Envía un correo de prueba para verificar que los credenciales son correctos y el servidor responde adecuadamente.
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">Email de destino</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-white"
              />
            </div>
            <button
              onClick={handleTestEmail}
              disabled={testing || loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
            >
              {testing ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
              ) : (
                <Send size={18} />
              )}
              {testing ? 'Enviando...' : 'Enviar Correo de Prueba'}
            </button>
          </div>

          <div className="mt-6 flex items-start gap-3 p-3 bg-white/50 rounded-lg border border-blue-100">
            <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={16} />
            <div className="text-xs text-blue-800">
              <p className="font-semibold mb-1">Nota importante:</p>
              <p>Si usas Gmail, asegúrate de generar una "Contraseña de Aplicación" si tienes la verificación en dos pasos activada. El uso de tu contraseña normal podría ser bloqueado.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmtpSettings;
