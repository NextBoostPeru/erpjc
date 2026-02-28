import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!token) {
        toast.error('Token inválido o faltante');
        return;
    }

    if (password !== confirmPassword) {
        toast.error('Las contraseñas no coinciden');
        return;
    }

    if (password.length < 6) {
        toast.error('La contraseña debe tener al menos 6 caracteres');
        return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}auth_recovery.php?action=reset_password`, { 
          token, 
          password 
      });
      setSuccess(true);
      toast.success('Contraseña actualizada correctamente');
      setTimeout(() => navigate('/'), 3000);
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Error al restablecer contraseña';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
             <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                 <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                    <Lock className="h-6 w-6 text-red-600" />
                 </div>
                 <h2 className="text-xl font-bold text-gray-900 mb-2">Enlace inválido</h2>
                 <p className="text-gray-500 mb-6">El enlace de recuperación no es válido o ha expirado.</p>
                 <Link to="/" className="text-blue-600 hover:text-blue-500 font-medium">Volver al inicio</Link>
             </div>
        </div>
      );
  }

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
          Nueva Contraseña
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Establece tu nueva contraseña de acceso
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {!success ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Nueva Contraseña
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirmar Contraseña
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Guardando...' : 'Restablecer Contraseña'}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">¡Contraseña Actualizada!</h3>
              <p className="text-sm text-gray-500 mb-6">
                Tu contraseña ha sido restablecida correctamente. Serás redirigido al inicio de sesión en unos segundos.
              </p>
              <button
                onClick={() => navigate('/')}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Ir al Inicio de Sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
