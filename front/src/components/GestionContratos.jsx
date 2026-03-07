import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  FileText, Plus, Search, Calendar, DollarSign, Upload, Eye, RefreshCw, AlertTriangle, CheckCircle, XCircle, File, PenTool, Printer, Trash2, Pencil, Filter, Layout
} from 'lucide-react';
import GestionPlantillasContratos from './GestionPlantillasContratos';

const GestionContratos = () => {
  const [activeTab, setActiveTab] = useState('contratos'); // 'contratos' or 'plantillas'
  const [contratos, setContratos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [areas, setAreas] = useState([]);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Stats
  const [expiringCount, setExpiringCount] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    vigente: 0,
    por_vencer: 0,
    vencido: 0,
    finalizado: 0,
    por_vencer_calculated: 0
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [sigPath, setSigPath] = useState(null);
  const [sigLoading, setSigLoading] = useState(false);

  const initialFormState = {
    colaborador_id: '',
    dni: '',
    nombres: '', 
    apellidos: '',
    direccion: '',
    correo: '',
    celular: '',
    rol_id: '',
    
    tipo_contrato: 'Plazo Fijo',
    fecha_inicio: '',
    fecha_fin: '',
    salario: '',
    cargo: '',
    area: '',
    horas_trabajo: '48 horas semanales',
    regimen_pensionario: 'ONP',
    afp_cuspp: '',
    asignacion_familiar: 0,
    estado: 'Vigente',
    observaciones: '',
    archivo: null,
    generated_filename: null
  };

  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [submitRequested, setSubmitRequested] = useState(false);

  const loadPreviewFromUrl = async (url) => {
    try {
      const extractUploadsPath = (u) => {
        const base = String(u).split('?')[0].split('#')[0];
        const match = base.match(/uploads\/.+$/);
        if (match) return match[0];
        const cleaned = base.replace(/^\//, '');
        return cleaned.startsWith('uploads/') ? cleaned : `uploads/contratos/${cleaned}`;
      };
      const publicPath = extractUploadsPath(url);
      const token = localStorage.getItem('token') || '';
      const downloadUrl = `${API_URL}contratos.php?action=download&file=${encodeURIComponent(publicPath)}`;
      const res = await axios.get(downloadUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: 'blob'
      });
      const blobUrl = URL.createObjectURL(res.data);
      setFilePreview(blobUrl);
    } catch (e) {
      toast.error("Archivo no encontrado");
      setFilePreview(null);
    }
  };

  useEffect(() => {
    fetchData();
    fetchRoles();
    fetchAreas();
    fetchStats();
  }, [page, searchTerm, filterStatus, filterArea]);

  const fetchStats = async () => {
    try {
        const response = await axios.get(`${API_URL}contratos.php?action=stats`);
        if (response.data.success) {
            setStats(response.data.data);
        }
    } catch (error) {
        console.error("Error fetching stats:", error);
    }
  };

  const fetchAreas = async () => {
    try {
        const response = await axios.get(`${API_URL}contratos.php?action=areas`);
        if (response.data.success) {
            setAreas(response.data.data);
        }
    } catch (error) {
        console.error("Error fetching areas:", error);
    }
  };

  const fetchData = async () => {
    try {
      const response = await axios.get(`${API_URL}/contratos.php?page=${page}&search=${searchTerm}&status=${filterStatus}&area=${filterArea}`);
      setContratos(response.data.data);
      if (response.data.pagination) {
        setTotalPages(response.data.pagination.totalPages);
      }
      
      const alertRes = await axios.get(`${API_URL}/contratos.php?alerts=true&limit=1000`);
      setExpiringCount(alertRes.data.pagination.total);

    } catch (error) {
      console.error("Error fetching contratos:", error);
      toast.error("Error al cargar contratos");
    } finally {
      setLoading(false);
    }
  };
  
  const fetchSignature = async () => {
    try {
      setSigLoading(true);
      const res = await axios.get(`${API_URL}contratos.php?action=get_signature`);
      if (res.data && res.data.exists) {
        setSigPath(res.data.path);
      } else {
        setSigPath(null);
      }
    } catch (e) {
      setSigPath(null);
    } finally {
      setSigLoading(false);
    }
  };
  
  useEffect(() => {
    fetchSignature();
  }, []);

  const fetchRoles = async () => {
    try {
      // Fetch roles from usuarios.php
      const response = await axios.get(`${API_URL}usuarios.php`);
      if (response.data.roles) {
          setRoles(response.data.roles);
      }
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  };

  const handleSearchDNI = async (dniValue = null) => {
      const dniToSearch = dniValue || formData.dni;
      if (!dniToSearch || dniToSearch.length !== 8) {
          toast.error("Ingrese un DNI válido de 8 dígitos");
          return;
      }

      const toastId = toast.loading("Consultando DNI...");
      try {
          const response = await axios.get(`${API_URL}consulta_dni.php?dni=${dniToSearch}`);
          const data = response.data;
          
          if (data.success) {
              setFormData(prev => ({
                  ...prev,
                  dni: dniToSearch,
                  nombres: data.nombres,
                apellidos: (data.apellido_paterno || '') + ' ' + (data.apellido_materno || ''),
                direccion: data.direccion || prev.direccion // Use API address if available, else keep current
              }));
              toast.success("Datos encontrados", { id: toastId });
          } else {
              toast.error(data.message || "No se encontraron datos", { id: toastId });
          }
      } catch (error) {
          console.error(error);
          toast.error("Error al consultar DNI", { id: toastId });
      }
  };

  const handleSaveColaborador = async () => {
      // Validate Step 1 fields
      if (!formData.dni || !formData.nombres || !formData.apellidos || !formData.correo || !formData.rol_id) {
          toast.error("Complete todos los campos obligatorios del colaborador (DNI, Nombres, Correo, Rol)");
          return false;
      }

      try {
          // Check if it's an update or new (based on if we have an ID from search, 
          // but here we might be creating a new one always or updating if DNI matches)
          // Since we want to "register", we'll try to create. 
          // If DNI exists, the backend returns error. We should handle that.
          // Ideally, we search first. But let's try to just POST and if it says "exists", we fetch it.
          // Wait, the backend `colaboradores.php` returns 400 if DNI exists.
          
          // Let's first try to find if this DNI already exists in our DB to update it instead of failing
          const searchRes = await axios.get(`${API_URL}colaboradores.php?search=${formData.dni}`);
          const existing = searchRes.data.data.find(c => c.documento_numero === formData.dni);
          
          let colabId = null;

          if (existing) {
              // Update existing
              colabId = existing.id;
              await axios.put(`${API_URL}colaboradores.php`, {
                  id: colabId,
                  nombres: formData.nombres,
                  apellidos: formData.apellidos,
                  documento_numero: formData.dni,
                  direccion: formData.direccion,
                  telefono: formData.celular,
                  email: formData.correo,
                  cargo: formData.cargo, // Might be empty at this step, but updated later
                  area: formData.area,
                  rol_id: formData.rol_id
                  // We don't update user/password here easily without more logic, 
                  // but requirements say "create user automatically". 
                  // If exists, user might already exist.
              });
              toast.success("Colaborador actualizado");
          } else {
              // Create new
                const createRes = await axios.post(`${API_URL}colaboradores.php`, {
                    nombres: formData.nombres,
                    apellidos: formData.apellidos,
                    documento_numero: formData.dni,
                    direccion: formData.direccion,
                    telefono: formData.celular,
                    email: formData.correo,
                    rol_id: formData.rol_id,
                    fecha_ingreso: new Date().toISOString().split('T')[0] // Default to today
                });
                colabId = createRes.data.id;
                
                toast.success("Colaborador registrado");
            }
          
          if (colabId) {
              setFormData(prev => ({ ...prev, colaborador_id: colabId }));
              return true;
          }
          return false;

      } catch (error) {
          console.error(error);
          toast.error(error.response?.data?.message || "Error al guardar colaborador");
          return false;
      }
  };


    const handleGenerate = async () => {
        if (!formData.colaborador_id || !formData.tipo_contrato || !formData.salario || !formData.fecha_inicio) {
            toast.error("Complete los campos requeridos (Colaborador, Tipo, Salario, Fecha Inicio) para generar el contrato.");
            return;
        }

        try {
            const loadingToast = toast.loading("Generando contrato...");
            const response = await axios.post(`${API_URL}contratos.php?action=generate`, {
                colaborador_id: formData.colaborador_id,
                tipo_contrato: formData.tipo_contrato,
                fecha_inicio: formData.fecha_inicio,
                fecha_fin: formData.fecha_fin,
                salario: formData.salario,
                cargo: formData.cargo,
                area: formData.area,
                horas_trabajo: formData.horas_trabajo,
                dni: formData.dni,
                nombres: formData.nombres,
                direccion: formData.direccion
            });

            toast.dismiss(loadingToast);
            
            if (response.data.filename) {
                setFormData({
                    ...formData,
                    generated_filename: response.data.filename,
                    archivo: null
                });
                await loadPreviewFromUrl(response.data.url);
                toast.success("Contrato generado exitosamente. Puede visualizarlo antes de guardar.");
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Error al generar contrato");
        }
    };

  const handleSign = async (id, role) => {
    if (!window.confirm(`¿Está seguro de firmar como ${role === 'gerencia' ? 'Gerencia' : 'Colaborador'}?`)) return;

    try {
        await axios.post(`${API_URL}contratos.php?action=sign`, {
            id,
            role
        });
        toast.success("Contrato firmado correctamente");
        fetchData();
    } catch (error) {
        toast.error("Error al firmar contrato");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este contrato? Esta acción no se puede deshacer.')) return;

    try {
        await axios.delete(`${API_URL}contratos.php?id=${id}`);
        toast.success("Contrato eliminado correctamente");
        fetchData();
    } catch (error) {
        console.error(error);
        toast.error(error.response?.data?.message || "Error al eliminar contrato");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!submitRequested) return;
    if (currentStep < 3) return;
    if (String(formData.regimen_pensionario || '').startsWith('AFP') && !String(formData.afp_cuspp || '').trim()) {
      toast.error("Ingrese el CUSPP para AFP");
      return;
    }
    
    const data = new FormData();
    Object.keys(formData).forEach(key => {
        if (key === 'archivo') {
            if (formData.archivo) data.append('archivo', formData.archivo);
        } else if (key === 'generated_filename') {
             if (formData.generated_filename) data.append('generated_filename', formData.generated_filename);
        } else {
            data.append(key, formData[key] || '');
        }
    });

    if (editingId) {
        data.append('id', editingId);
    }

    try {
      await axios.post(`${API_URL}contratos.php`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(editingId ? "Contrato actualizado" : "Contrato registrado");
      setModalOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error al guardar");
    }
    setSubmitRequested(false);
  };

  const handleEdit = async (item) => {
    setEditingId(item.id);
    setFilePreview(null);
    setModalOpen(true);
    setCurrentStep(2); // Go directly to contract details

    // Initial state with available data
    setFormData({
        colaborador_id: item.colaborador_id,
        tipo_contrato: (item.tipo_contrato === 'Plazo Determinado' ? 'Plazo Fijo' : item.tipo_contrato) || '',
        fecha_inicio: item.fecha_inicio,
        fecha_fin: item.fecha_fin || '',
        salario: item.salario || '',
        estado: item.estado,
        observaciones: item.observaciones || '',
        cargo: item.cargo || '',
        area: item.area || '',
        archivo: null,
        // Basic collaborator info from contract item
        dni: item.documento_numero || '',
        nombres: item.nombres || '',
        apellidos: item.apellidos || '',
        direccion: '',
        correo: '',
        celular: '',
        rol_id: '',
        horas_trabajo: '48 horas semanales',
        regimen_pensionario: item.regimen_pensionario || 'ONP',
        afp_cuspp: item.afp_cuspp || '',
        asignacion_familiar: item.asignacion_familiar ? 1 : 0,
        generated_filename: null
    });

    // Fetch full collaborator details
    try {
        const response = await axios.get(`${API_URL}colaboradores.php?search=${item.documento_numero}`);
        if (response.data.data) {
            const colab = response.data.data.find(c => c.documento_numero === item.documento_numero);
            if (colab) {
                setFormData(prev => ({
                    ...prev,
                    direccion: colab.direccion || '',
                    correo: colab.email || '',
                    celular: colab.telefono || '',
                    rol_id: colab.rol_id || '',
                    // If contract didn't specify cargo/area, maybe use collaborator's? 
                    // But we prefer what was in the contract record (item.cargo) which is already set above
                }));
            }
        }
    } catch (error) {
        console.error("Error loading collaborator details:", error);
    }
  };

  const handleRenew = async (item) => {
    // Pre-fill for renewal
    setEditingId(null); // New record
    setFilePreview(null);
    setModalOpen(true);
    setCurrentStep(2); // Go directly to contract details

    // Initial state
    setFormData({
        colaborador_id: item.colaborador_id,
        tipo_contrato: item.tipo_contrato,
        fecha_inicio: item.fecha_fin ? addDays(item.fecha_fin, 1) : '', // Start next day
        fecha_fin: '',
        salario: item.salario || '',
        estado: 'Vigente',
        observaciones: 'Renovación de contrato anterior.',
        archivo: null,
        cargo: item.cargo || '',
        area: item.area || '',
        horas_trabajo: '48 horas semanales',
        generated_filename: null,

        // Basic collaborator info from contract item
        dni: item.documento_numero || '',
        nombres: item.nombres || '',
        apellidos: item.apellidos || '',
        direccion: '', 
        correo: '',
        celular: '',
        rol_id: '',
        regimen_pensionario: item.regimen_pensionario || 'ONP',
        afp_cuspp: item.afp_cuspp || ''
    });

    // Fetch full collaborator details
    try {
        const response = await axios.get(`${API_URL}colaboradores.php?search=${item.documento_numero}`);
        if (response.data.data) {
            const colab = response.data.data.find(c => c.documento_numero === item.documento_numero);
            if (colab) {
                setFormData(prev => ({
                    ...prev,
                    direccion: colab.direccion || '',
                    correo: colab.email || '',
                    celular: colab.telefono || '',
                    rol_id: colab.rol_id || ''
                }));
            }
        }
    } catch (error) {
        console.error("Error loading collaborator details:", error);
    }
  };

  const handleRegeneratePDF = async (item) => {
    // Validate required data before sending
    if (!item.tipo_contrato) {
        toast.error("Error: Este contrato no tiene un 'Tipo de Contrato' asignado. Por favor edítelo y seleccione un tipo antes de regenerar el PDF.");
        return;
    }

    if (!window.confirm(`¿Seguro que deseas regenerar el PDF para ${item.nombres}? Se sobrescribirá el archivo existente.`)) return;
    
    const toastId = toast.loading('Regenerando documento...');
    try {
        console.log("Regenerando PDF para:", item);
        
        // 1. Generate new PDF
        const genPayload = {
            colaborador_id: item.colaborador_id,
            tipo_contrato: item.tipo_contrato,
            fecha_inicio: item.fecha_inicio,
            fecha_fin: item.fecha_fin || null,
            salario: item.salario,
            cargo: item.cargo || '',
            area: item.area || '',
            horas_trabajo: item.horas_trabajo || '48 horas semanales',
            observaciones: item.observaciones || '',
            // Pass explicit names to ensure correct generation
            nombres: `${item.nombres} ${item.apellidos}`,
            dni: item.documento_numero
        };
        
        const genRes = await axios.post(`${API_URL}contratos.php?action=generate`, genPayload);
        
        if (genRes.data && genRes.data.filename) {
            // 2. Update record with new filename
            const updatePayload = new FormData();
            updatePayload.append('id', item.id);
            updatePayload.append('colaborador_id', item.colaborador_id);
            updatePayload.append('tipo_contrato', item.tipo_contrato);
            updatePayload.append('fecha_inicio', item.fecha_inicio);
            // Send empty string for null dates to ensure FormData sends the key
            updatePayload.append('fecha_fin', item.fecha_fin || '');
            updatePayload.append('salario', item.salario);
            updatePayload.append('estado', item.estado);
            updatePayload.append('observaciones', item.observaciones || '');
            updatePayload.append('cargo', item.cargo || '');
            updatePayload.append('area', item.area || '');
            updatePayload.append('horas_trabajo', item.horas_trabajo || '');
            updatePayload.append('generated_filename', genRes.data.filename);
            
            await axios.post(`${API_URL}contratos.php`, updatePayload);
            
            toast.success('PDF regenerado correctamente', { id: toastId });
            fetchData();
        } else {
            throw new Error('El servidor no devolvió el nombre del archivo generado.');
        }
    } catch (error) {
        console.error("Error regenerando PDF:", error);
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message || 'Error desconocido';
        toast.error(`Error: ${errorMsg}`, { id: toastId });
    }
  };

  const addDays = (dateStr, days) => {
      const date = new Date(dateStr);
      date.setDate(date.getDate() + days);
      return date.toISOString().split('T')[0];
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingId(null);
    setFilePreview(null);
    setCurrentStep(1);
  };

  const getStatusColor = (status) => {
      switch(status) {
          case 'Vigente': return 'bg-green-100 text-green-700 border-green-200';
          case 'Por Vencer': return 'bg-orange-100 text-orange-700 border-orange-200';
          case 'Vencido': return 'bg-red-100 text-red-700 border-red-200';
          case 'Finalizado': return 'bg-gray-100 text-gray-700 border-gray-200';
          default: return 'bg-gray-100 text-gray-700';
      }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <FileText className="text-blue-600" size={32} />
            Contratos Laborales
          </h1>
          <p className="text-gray-500 mt-1">Gestión de contratos, renovaciones y vencimientos</p>
        </div>
        
        {activeTab === 'contratos' && (
            <div className="flex gap-3">
                <button 
                onClick={() => { resetForm(); setModalOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg transition-all"
                >
                <Plus size={20} />
                Nuevo Contrato
                </button>
            </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button 
          className={`px-4 py-2 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'contratos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('contratos')}
        >
          <FileText size={18} /> Gestión de Contratos
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'plantillas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('plantillas')}
        >
          <Layout size={18} /> Plantillas y Secciones
        </button>
      </div>

      {activeTab === 'plantillas' ? (
        <GestionPlantillasContratos />
      ) : (
        <>
      {/* Firma de Gerencia (Contratos) */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <PenTool size={16} className="text-indigo-600" />
            Firma de Gerencia para Contratos
          </h3>
          {sigLoading ? (
            <p className="text-gray-400 text-sm">Cargando...</p>
          ) : (
            <>
              {sigPath ? (
                <div className="flex items-center gap-4">
                  <img 
                    src={`${API_URL.replace(/\/$/, '')}${sigPath}`} 
                    alt="Firma de Gerencia" 
                    className="h-14 object-contain border rounded bg-white"
                  />
                  <button 
                    onClick={async () => {
                      try {
                        await axios.post(`${API_URL}contratos.php?action=delete_signature`);
                        toast.success("Firma eliminada");
                        fetchSignature();
                      } catch {
                        toast.error("No se pudo eliminar la firma");
                      }
                    }}
                    className="px-3 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm flex items-center gap-2"
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm cursor-pointer">
                    <Upload size={16} />
                    <span className="ml-2">Subir Firma (PNG/JPG)</span>
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg" 
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('firma', file);
                        const toastId = toast.loading("Subiendo firma...");
                        try {
                          await axios.post(`${API_URL}contratos.php?action=upload_signature`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });
                          toast.success("Firma subida", { id: toastId });
                          fetchSignature();
                        } catch (err) {
                          toast.error(err.response?.data?.message || "Error al subir firma", { id: toastId });
                        }
                      }}
                    />
                  </label>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Esta firma se inserta automáticamente en el PDF del contrato en la sección del empleador.
              </p>
            </>
          )}
        </div>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <FileText size={24} />
            </div>
            <div>
                <p className="text-sm text-gray-500 font-medium">Total Contratos</p>
                <h3 className="text-xl font-bold text-gray-800">{stats.total}</h3>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                <CheckCircle size={24} />
            </div>
            <div>
                <p className="text-sm text-gray-500 font-medium">Vigentes</p>
                <h3 className="text-xl font-bold text-gray-800">{stats.vigente}</h3>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                <AlertTriangle size={24} />
            </div>
            <div>
                <p className="text-sm text-gray-500 font-medium">Por Vencer (30d)</p>
                <h3 className="text-xl font-bold text-gray-800">{stats.por_vencer_calculated > 0 ? stats.por_vencer_calculated : stats.por_vencer}</h3>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="p-3 bg-gray-50 text-gray-600 rounded-lg">
                <XCircle size={24} />
            </div>
            <div>
                <p className="text-sm text-gray-500 font-medium">Finalizados/Vencidos</p>
                <h3 className="text-xl font-bold text-gray-800">{parseInt(stats.finalizado) + parseInt(stats.vencido)}</h3>
            </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por colaborador o tipo..." 
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="relative min-w-[200px]">
          <select 
              value={filterArea}
              onChange={(e) => { setFilterArea(e.target.value); setPage(1); }}
              className="w-full px-4 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
          >
              <option value="">Todas las Áreas</option>
              {areas.map((area, index) => (
                <option key={index} value={area}>{area}</option>
              ))}
          </select>
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        </div>

        <select 
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
            <option value="">Todos los estados</option>
            <option value="Vigente">Vigente</option>
            <option value="Por Vencer">Por Vencer</option>
            <option value="Vencido">Vencido</option>
            <option value="Finalizado">Finalizado</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 border-b">Colaborador</th>
                <th className="p-4 border-b">Contrato</th>
                <th className="p-4 border-b">Vigencia</th>
                <th className="p-4 border-b">Salario</th>
                <th className="p-4 border-b">Estado</th>
                <th className="p-4 border-b text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Cargando...</td></tr>
              ) : contratos.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">No se encontraron contratos.</td></tr>
              ) : (
                contratos.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                        <div className="font-semibold text-gray-800">{item.apellidos}, {item.nombres}</div>
                        <div className="text-xs text-gray-500">{item.documento_numero}</div>
                    </td>
                    <td className="p-4">
                        <div className="text-gray-800">{item.tipo_contrato}</div>
                        {item.archivo_url && (
                            <a href={`${API_URL.replace(/\/$/, '')}${item.archivo_url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                                <File size={10} /> Ver PDF
                            </a>
                        )}
                    </td>
                    <td className="p-4">
                        <div className="flex flex-col text-sm">
                            <span className="text-gray-600">Inicio: {item.fecha_inicio}</span>
                            <span className={`font-medium ${item.fecha_fin && new Date(item.fecha_fin) < new Date() ? 'text-red-600' : 'text-gray-600'}`}>
                                Fin: {item.fecha_fin || 'Indefinido'}
                            </span>
                        </div>
                    </td>
                    <td className="p-4 text-gray-800">
                        {item.salario ? `S/. ${parseFloat(item.salario).toFixed(2)}` : '-'}
                    </td>
                    <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.estado)}`}>
                            {item.estado}
                        </span>
                        <div className="flex flex-col gap-1 mt-2 text-xs">
                            <div className={`flex items-center gap-1 ${item.firma_gerencia ? 'text-green-600' : 'text-gray-400'}`}>
                                <PenTool size={10} />
                                <span>Gerencia: {item.firma_gerencia ? 'Firmado' : 'Pendiente'}</span>
                            </div>
                            <div className={`flex items-center gap-1 ${item.firma_colaborador ? 'text-green-600' : 'text-gray-400'}`}>
                                <PenTool size={10} />
                                <span>Colaborador: {item.firma_colaborador ? 'Firmado' : 'Pendiente'}</span>
                            </div>
                        </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleRegeneratePDF(item)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Regenerar PDF"
                        >
                          <FileText size={18} />
                        </button>
                        <button 
                          onClick={() => handleRenew(item)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Renovar"
                        >
                          <RefreshCw size={18} />
                        </button>
                        <button 
                          onClick={() => handleEdit(item)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                        {!item.firma_gerencia && (
                            <button 
                                onClick={() => handleSign(item.id, 'gerencia')}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Firmar Gerencia"
                            >
                                <PenTool size={18} />
                            </button>
                        )}
                        {!item.firma_colaborador && (
                            <button 
                                onClick={() => handleSign(item.id, 'colaborador')}
                                className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                title="Firmar Colaborador"
                            >
                                <PenTool size={18} />
                            </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination Controls could be added here */}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
              <h2 className="text-xl font-bold text-gray-800">
                {editingId ? 'Editar Contrato' : 'Nuevo Contrato'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">
                &times;
              </button>
            </div>

            {/* Steps Indicator */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-white">
                <div className={`flex flex-col items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${currentStep >= 1 ? 'bg-blue-100' : 'bg-gray-100'}`}>1</div>
                    <span className="text-xs font-medium">Colaborador</span>
                </div>
                <div className={`flex-1 h-1 mx-2 ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                <div className={`flex flex-col items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${currentStep >= 2 ? 'bg-blue-100' : 'bg-gray-100'}`}>2</div>
                    <span className="text-xs font-medium">Contrato</span>
                </div>
                <div className={`flex-1 h-1 mx-2 ${currentStep >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                <div className={`flex flex-col items-center ${currentStep >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${currentStep >= 3 ? 'bg-blue-100' : 'bg-gray-100'}`}>3</div>
                    <span className="text-xs font-medium">Generar</span>
                </div>
            </div>

            <form 
                onSubmit={handleSubmit} 
                className="p-6 space-y-4 overflow-y-auto flex-grow"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                    }
                }}
            >
                {currentStep === 1 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
                            <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                                <Search size={16} />
                                Registro de Colaborador
                            </h3>
                            <p className="text-xs text-blue-600 mb-3">
                                Ingrese el DNI para buscar los datos en RENIEC/SUNAT. Si el colaborador es nuevo, se creará su usuario automáticamente.
                            </p>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.dni}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                                        setFormData(prev => ({...prev, dni: val}));
                                        if (val.length === 8) {
                                            handleSearchDNI(val);
                                        }
                                    }}
                                    onBlur={() => {
                                        if (formData.dni && formData.dni.length === 8) {
                                            handleSearchDNI();
                                        }
                                    }}
                                    placeholder="Ingrese DNI (8 dígitos)"
                                    maxLength={8}
                                />
                                <button 
                                    type="button"
                                    onClick={handleSearchDNI}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Search size={18} />
                                    Buscar
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombres</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                                    value={formData.nombres}
                                    onChange={e => setFormData({...formData, nombres: e.target.value})}
                                    placeholder="Nombres"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                                    value={formData.apellidos}
                                    onChange={e => setFormData({...formData, apellidos: e.target.value})}
                                    placeholder="Apellidos"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.direccion}
                                onChange={e => setFormData({...formData, direccion: e.target.value})}
                                placeholder="Dirección completa"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico (Usuario)</label>
                                <input 
                                    type="email" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.correo}
                                    onChange={e => setFormData({...formData, correo: e.target.value})}
                                    placeholder="email@empresa.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Celular / Teléfono</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.celular}
                                    onChange={e => setFormData({...formData, celular: e.target.value})}
                                    placeholder="999999999"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rol de Usuario</label>
                            <select 
                                required 
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.rol_id}
                                onChange={e => setFormData({...formData, rol_id: e.target.value})}
                            >
                                <option value="">Seleccione Rol</option>
                                {roles.map(rol => (
                                    <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                Se creará un usuario con este rol automáticamente (Contraseña por defecto: DNI).
                            </p>
                        </div>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Área / Departamento</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.area}
                                    onChange={e => setFormData({...formData, area: e.target.value})}
                                    placeholder="Ej. Tecnología"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Puesto / Cargo</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.cargo}
                                    onChange={e => setFormData({...formData, cargo: e.target.value})}
                                    placeholder="Ej. Analista de Sistemas"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Horas de Trabajo</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.horas_trabajo}
                                    onChange={e => setFormData({...formData, horas_trabajo: e.target.value})}
                                    placeholder="Ej. 48 horas semanales"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sueldo (S/.)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">S/.</span>
                                    <input 
                                        required
                                        type="number" 
                                        step="0.01"
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.salario}
                                        onChange={e => setFormData({...formData, salario: e.target.value})}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sistema Pensionario</label>
                        <select 
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formData.regimen_pensionario}
                            onChange={e => setFormData({...formData, regimen_pensionario: e.target.value})}
                        >
                            <option value="ONP">ONP</option>
                            <option value="AFP Integra">AFP Integra</option>
                            <option value="AFP Prima">AFP Prima</option>
                            <option value="AFP Profuturo">AFP Profuturo</option>
                            <option value="AFP Habitat">AFP Habitat</option>
                        </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Código Único SPP (CUSPP)</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="CUSPP (solo para AFP)"
                        maxLength={20}
                        disabled={formData.regimen_pensionario === 'ONP'}
                        value={formData.afp_cuspp}
                        onChange={e => setFormData({...formData, afp_cuspp: e.target.value.toUpperCase()})}
                      />
                      <p className="text-xs text-gray-500 mt-1">Requerido si el sistema es AFP.</p>
                    </div>
                    <div className="flex items-center mt-6">
                        <label className="inline-flex items-center">
                            <input 
                                type="checkbox"
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={!!formData.asignacion_familiar}
                                onChange={e => setFormData({...formData, asignacion_familiar: e.target.checked ? 1 : 0})}
                            />
                            <span className="ml-2 text-sm text-gray-700">Asignación Familiar</span>
                        </label>
                    </div>
                </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                                <input 
                                    required
                                    type="date" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.fecha_inicio}
                                    onChange={e => setFormData({...formData, fecha_inicio: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin (Opcional)</label>
                                <input 
                                    type="date" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.fecha_fin}
                                    onChange={e => setFormData({...formData, fecha_fin: e.target.value})}
                                />
                            </div>
                        </div>
                        
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Contrato</label>
                                <select 
                                    required 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.tipo_contrato}
                                    onChange={e => setFormData({...formData, tipo_contrato: e.target.value})}
                                >
                                    <option value="">Seleccione tipo de contrato</option>
                                    <option value="Plazo Fijo">Plazo Determinado</option>
                                    <option value="Plazo Fijo">Plazo Fijo</option>
                                    <option value="Indefinido">Indefinido</option>
                                    <option value="Prácticas">Prácticas</option>
                                    <option value="Locación de Servicios">Locación de Servicios</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                <select 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.estado}
                                    onChange={e => setFormData({...formData, estado: e.target.value})}
                                >
                                    <option value="Vigente">Vigente</option>
                                    <option value="Por Vencer">Por Vencer</option>
                                    <option value="Vencido">Vencido</option>
                                    <option value="Finalizado">Finalizado</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h3 className="font-semibold text-blue-800 mb-2">Resumen del Contrato</h3>
                            <div className="text-sm text-blue-700 space-y-1">
                                <p><strong>Colaborador:</strong> {formData.nombres}</p>
                                <p><strong>Cargo:</strong> {formData.cargo} - <strong>Área:</strong> {formData.area}</p>
                                <p><strong>Sueldo:</strong> S/. {formData.salario}</p>
                                <p><strong>Vigencia:</strong> {formData.fecha_inicio} {formData.fecha_fin ? `al ${formData.fecha_fin}` : '(Indefinido)'}</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">Generar o Subir Contrato</label>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button 
                                    type="button"
                                    onClick={handleGenerate}
                                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-300 rounded-xl hover:bg-blue-50 transition-colors group"
                                >
                                    <div className="bg-blue-100 p-3 rounded-full mb-3 group-hover:bg-blue-200 transition-colors">
                                        <FileText className="text-blue-600" size={24} />
                                    </div>
                                    <span className="font-medium text-blue-700">Generar Automáticamente</span>
                                    <span className="text-xs text-blue-500 mt-1">Usar plantilla del sistema</span>
                                </button>

                                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group">
                                    <div className="bg-gray-100 p-3 rounded-full mb-3 group-hover:bg-gray-200 transition-colors">
                                        <Upload className="text-gray-600" size={24} />
                                    </div>
                                    <span className="font-medium text-gray-700">Subir PDF Firmado</span>
                                    <span className="text-xs text-gray-500 mt-1">Si ya tienes el documento</span>
                                    <input 
                                        type="file" 
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                            setFormData({...formData, archivo: e.target.files[0], generated_filename: null});
                                            if(e.target.files[0]) {
                                                const url = URL.createObjectURL(e.target.files[0]);
                                                setFilePreview(url);
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                        </div>

                        {(filePreview || formData.generated_filename || formData.archivo) && (
                            <div className="mt-4 border rounded-lg p-4 bg-gray-50 flex-grow flex flex-col">
                                <div className="flex items-center gap-2 mb-2 text-green-700 font-medium">
                                    <CheckCircle size={18} />
                                    <span>Documento listo para guardar</span>
                                </div>
                                {filePreview && !editingId && (
                                    <iframe 
                                        src={filePreview} 
                                        className="w-full flex-grow min-h-[400px] border rounded bg-white"
                                        title="Vista previa"
                                    />
                                )}
                                {formData.generated_filename && (
                                    <p className="text-xs text-gray-500 mt-2 text-center">Archivo generado: {formData.generated_filename}</p>
                                )}
                                {formData.archivo && (
                                    <p className="text-xs text-gray-500 mt-2 text-center">Archivo seleccionado: {formData.archivo.name}</p>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                            <textarea 
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-20"
                                value={formData.observaciones}
                                onChange={e => setFormData({...formData, observaciones: e.target.value})}
                                placeholder="Notas adicionales..."
                            />
                        </div>
                    </div>
                )}
            
                <div className="flex justify-between pt-4 border-t border-gray-100 mt-6">
                    {currentStep > 1 ? (
                        <button 
                            type="button" 
                            onClick={() => setCurrentStep(prev => prev - 1)}
                            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                        >
                            Atrás
                        </button>
                    ) : (
                        <div></div> 
                    )}

                    {currentStep < 3 ? (
                        <button 
                            type="button" 
                            onClick={async () => {
                                if (currentStep === 1) {
                                    const saved = await handleSaveColaborador();
                                    if (saved) {
                                        setCurrentStep(prev => prev + 1);
                                    }
                                } else {
                                    setCurrentStep(prev => prev + 1);
                                }
                            }}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-200"
                        >
                            Siguiente
                        </button>
                    ) : (
                        <button 
                            type="submit" 
                            disabled={!formData.generated_filename && !formData.archivo && !editingId} // Allow save if editing without changing file, or new file
                            onClick={() => setSubmitRequested(true)}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {editingId ? 'Actualizar Contrato' : 'Guardar Contrato'}
                        </button>
                    )}
                </div>
            </form>
          </div>
        </div>
      )}
    </>
  )}
    </div>
  );
};

export default GestionContratos;
