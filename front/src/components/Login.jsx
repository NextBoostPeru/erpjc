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
  const [branding, setBranding] = useState({ nombre: '', logo: null, portada: null });
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

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const res = await axios.get(`${API_URL}login.php?action=branding`);
        const emp = res.data?.empresa || {};
        setBranding({
          nombre: String(emp?.nombre || ''),
          logo: emp?.logo || null,
          portada: emp?.portada || null
        });
      } catch {
      }
    };
    loadBranding();
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
    <div className="min-h-screen w-full bg-gray-50">
      <div className="flex min-h-screen w-full flex-col md:flex-row">
        <div className="flex w-full items-center justify-center p-4 sm:p-8 md:w-[30%]">
          <div className="w-full max-w-md bg-transparent p-8 sm:p-10">
            <div className="mb-8">
              <div className="mb-5">
                {branding.logo ? (
                  <img
                    src={`${API_URL}public_files.php?path=${encodeURIComponent(String(branding.logo))}`}
                    alt="Logo"
                    className="h-12 w-auto max-w-[220px] object-contain"
                  />
                ) : (
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-extrabold text-white">
                    ERP
                  </div>
                )}
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Iniciar Sesión</h2>
              <p className="mt-1 text-gray-500">Accede a tu panel de control</p>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
                <AlertCircle size={20} />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Usuario o Correo Electrónico</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    name="usuario"
                    value={formData.usuario}
                    onChange={handleChange}
                    placeholder="Usuario o correo"
                    required
                    className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-12 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
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
                <label className="flex cursor-pointer items-center text-gray-600 hover:text-gray-900">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Recordarme
                </label>
                <Link to="/recuperar-password" className="font-medium text-blue-600 hover:text-blue-800 hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl ${
                  loading ? 'cursor-not-allowed opacity-70' : ''
                }`}
              >
                {loading ? 'Iniciando...' : 'Ingresar al Sistema'}
                {!loading && <ArrowRight size={20} />}
              </button>
            </form>

            <div className="mt-8 text-center text-sm text-gray-400">
              &copy; {new Date().getFullYear()} {branding.nombre || 'Empresa'} Todos los derechos reservados.
            </div>
          </div>
        </div>

        <div className="relative hidden w-[70%] overflow-hidden md:block">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                branding.portada
                  ? `linear-gradient(135deg, rgba(2, 6, 23, 0.35), rgba(37, 99, 235, 0.25)), url(${API_URL}public_files.php?path=${encodeURIComponent(String(branding.portada))})`
                  : branding.logo
                    ? `linear-gradient(135deg, rgba(2, 6, 23, 0.35), rgba(37, 99, 235, 0.25)), url(${API_URL}public_files.php?path=${encodeURIComponent(String(branding.logo))})`
                    : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1200' viewBox='0 0 1600 1200'%3E%3Cdefs%3E%3CradialGradient id='g1' cx='30%25' cy='25%25' r='75%25'%3E%3Cstop offset='0%25' stop-color='%2393c5fd'/%3E%3Cstop offset='55%25' stop-color='%232563eb'/%3E%3Cstop offset='100%25' stop-color='%231e3a8a'/%3E%3C/radialGradient%3E%3ClinearGradient id='g2' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff' stop-opacity='0.14'/%3E%3Cstop offset='100%25' stop-color='%23ffffff' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='1200' fill='url(%23g1)'/%3E%3Cpath d='M0,830 C220,740 420,720 640,800 C840,880 980,980 1200,1000 C1380,1016 1490,960 1600,900 L1600,1200 L0,1200 Z' fill='url(%23g2)'/%3E%3Cpath d='M0,520 C250,430 470,430 700,520 C930,610 1040,720 1260,740 C1420,754 1510,700 1600,650 L1600,0 L0,0 Z' fill='url(%23g2)'/%3E%3Ccircle cx='1220' cy='260' r='140' fill='%23ffffff' fill-opacity='0.08'/%3E%3Ccircle cx='1240' cy='260' r='90' fill='%23ffffff' fill-opacity='0.10'/%3E%3Ccircle cx='320' cy='980' r='160' fill='%23ffffff' fill-opacity='0.06'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: branding.portada || branding.logo ? 'cover' : 'cover',
            }}
          />
          {!branding.portada && !branding.logo && <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/25 via-transparent to-white/10" />}

          <div className="relative flex h-full items-end p-10">
            <div className="max-w-xl rounded-2xl bg-white/10 p-8 text-white backdrop-blur-md">
              <h1 className="text-4xl font-bold leading-tight">Sistema de Gestión</h1>
              <p className="mt-3 text-white/85">
                Control total de tu negocio en una sola plataforma.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
