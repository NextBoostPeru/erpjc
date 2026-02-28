import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API_URL}auth_recovery.php?action=forgot_password`, { email });
      setSent(true);
      toast.success('Si el correo existe, se enviaron las instrucciones.');
    } catch (error) {
      console.error(error);
      // Even on error, usually good security practice to say sent or generic error
      // But for ERP internal use, showing error might be helpful.
      // However, backend returns success even if not found to prevent enumeration, 
      // so real errors are likely server errors.
      toast.error('Error al procesar solicitud. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                ERP
            </div>
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900">
          Recuperar Contraseña
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Ingrese su correo electrónico para recibir instrucciones
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {!sent ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Correo Electrónico
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
                    placeholder="ejemplo@empresa.com"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"/>
                  ) : (
                      <Send className="w-4 h-4 mr-2" />
                  )}
                  {loading ? 'Enviando...' : 'Enviar Instrucciones'}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <Send className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">Correo Enviado</h3>
              <p className="text-sm text-gray-500 mb-6">
                Si el correo {email} está registrado, recibirás un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y spam.
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-blue-600 hover:text-blue-500 font-medium text-sm"
              >
                Intentar con otro correo
              </button>
            </div>
          )}

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  ¿Ya tienes cuenta?
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
                <Link to="/" className="flex items-center text-blue-600 hover:text-blue-500 font-medium text-sm">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Volver al inicio de sesión
                </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
