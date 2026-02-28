import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { API_URL } from '../api/config';
import { User, Lock, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [formData, setFormData] = useState({
    usuario: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const rememberedUser = localStorage.getItem('remember_user');
    if (rememberedUser) {
      setFormData(prev => ({ ...prev, usuario: rememberedUser }));
      setRememberMe(true);
    }
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const loginUrl = `${API_URL}login.php`;
      console.log('Attempting login to:', loginUrl);
      const response = await axios.post(loginUrl, formData);
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.setItem('modulos', JSON.stringify(response.data.modulos));
        if (rememberMe) {
            localStorage.setItem('remember_user', formData.usuario);
        } else {
            localStorage.removeItem('remember_user');
        }

        // Redirección inteligente basada en permisos
        const modulos = response.data.modulos || [];
        
        const hasDashboard = modulos.some(m => m.codigo === 'dashboard');
        
        // Filter out specific problematic modules
        const validModules = modulos.filter(m => m.codigo !== 'comprobantes');

        if (hasDashboard) {
            console.log('Redirecting to dashboard (has dashboard module)');
            navigate('/dashboard', { replace: true });
        } else if (validModules.length > 0) {
            const firstRoute = validModules[0].ruta;
            console.log('Redirecting to first valid module:', firstRoute);
            if (firstRoute) {
                navigate(firstRoute, { replace: true });
            } else {
                console.warn('First module has no route, defaulting to dashboard');
                navigate('/dashboard', { replace: true });
            }
        } else {
            console.log('No modules found, defaulting to dashboard');
            navigate('/dashboard', { replace: true });
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.response && err.response.data && err.response.data.message) {
        setError(err.response.data.message);
      } else {
        setError('Error de conexión. Inténtalo más tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-white">
      <div className="hidden lg:flex flex-1 bg-blue-900 items-center justify-center text-white p-8 relative overflow-hidden">
        <div className="relative z-10 max-w-md text-center">
            <div className="w-20 h-20 bg-white text-blue-900 rounded-full flex items-center justify-center font-extrabold text-2xl mb-8 shadow-lg mx-auto">ERP</div>
            <h1 className="text-5xl font-bold mb-4 leading-tight">Sistema de Gestión</h1>
            <p className="text-xl opacity-90 leading-relaxed">Control total de tu negocio en una sola plataforma.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-gray-50">
        <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-2xl shadow-xl">
            <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Iniciar Sesión</h2>
            <p className="text-gray-500">Accede a tu panel de control</p>
            </div>

            {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 flex items-center gap-3 rounded-r">
                <AlertCircle size={20} />
                <span className="font-medium">{error}</span>
            </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Usuario o Correo Electrónico</label>
                <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    name="usuario"
                    value={formData.usuario}
                    onChange={handleChange}
                    placeholder="Usuario o correo"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contraseña</label>
                <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                </div>
            </div>

            <div className="flex items-center justify-between text-sm">
                <label className="flex items-center text-gray-600 cursor-pointer hover:text-gray-900">
                <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                />
                Recordarme
                </label>
                <Link to="/recuperar-password" className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                ¿Olvidaste tu contraseña?
                </Link>
            </div>

            <button
                type="submit"
                disabled={loading}
                className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
                {loading ? 'Iniciando...' : 'Ingresar al Sistema'}
                {!loading && <ArrowRight size={20} />}
            </button>
            </form>
            
            <div className="mt-8 text-center text-sm text-gray-400">
                &copy; {new Date().getFullYear()} Empresa S.A. Todos los derechos reservados.
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
