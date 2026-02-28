import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { User, Mail, Lock, Save, Shield } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const Perfil = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState({
    usuario: '',
    email: '',
    rol: '',
    created_at: ''
  });
  
  const [formData, setFormData] = useState({
    email: '',
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const token = localStorage.getItem('token');
  const axiosConfig = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/perfil.php`, axiosConfig);
      if (res.data) {
        setUserData(res.data);
        setFormData(prev => ({ ...prev, email: res.data.email }));
      }
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.new_password) {
        if (formData.new_password !== formData.confirm_password) {
            toast.error('Las nuevas contraseñas no coinciden');
            return;
        }
        if (formData.new_password.length < 6) {
            toast.error('La contraseña nueva debe tener al menos 6 caracteres');
            return;
        }
        if (!formData.current_password) {
            toast.error('Debe ingresar su contraseña actual para realizar cambios');
            return;
        }
    }

    try {
      setSaving(true);
      const payload = {
          email: formData.email,
          current_password: formData.current_password,
          new_password: formData.new_password
      };

      await axios.post(`${API_URL}/perfil.php`, payload, axiosConfig);
      toast.success('Perfil actualizado correctamente');
      
      // Clear passwords
      setFormData(prev => ({ 
          ...prev, 
          current_password: '', 
          new_password: '', 
          confirm_password: '' 
      }));
      
      fetchProfile();
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Error al actualizar perfil';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando perfil...</div>;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Toaster position="top-right" />
      
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <User className="text-blue-600" /> Mi Perfil
        </h1>
        <p className="text-gray-500 mt-1">Gestiona tu información personal y seguridad</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Tarjeta de Información */}
        <div className="md:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center text-center">
                <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl font-bold mb-4">
                    {(userData.usuario || '').charAt(0).toUpperCase()}
                </div>
                <h2 className="text-xl font-bold text-gray-800">{userData.usuario}</h2>
                <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    <Shield size={12} className="mr-1" />
                    {userData.rol}
                </div>
                <p className="text-xs text-gray-400 mt-4">
                    Miembro desde {new Date(userData.created_at).toLocaleDateString()}
                </p>
            </div>
        </div>

        {/* Formulario de Edición */}
        <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-semibold text-gray-800">Editar Información</h3>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={userData.usuario || ''}
                                disabled
                                className="w-full pl-10 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">El nombre de usuario no se puede cambiar.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-2.5 text-gray-400" size={18} />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="border-t pt-6 mt-2">
                        <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Lock size={16} /> Cambiar Contraseña
                        </h4>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña Actual</label>
                                <input
                                    type="password"
                                    name="current_password"
                                    value={formData.current_password}
                                    onChange={handleChange}
                                    placeholder="Necesaria para guardar cambios"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                                    <input
                                        type="password"
                                        name="new_password"
                                        value={formData.new_password}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nueva</label>
                                    <input
                                        type="password"
                                        name="confirm_password"
                                        value={formData.confirm_password}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                        >
                            {saving ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                            ) : (
                                <Save size={18} />
                            )}
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Perfil;
