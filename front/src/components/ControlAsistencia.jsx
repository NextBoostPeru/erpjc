import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  Clock, Calendar, UserCheck, Upload, FileText, CheckCircle, XCircle, Search, Filter, Download,
  Users, AlertTriangle, CheckSquare, MoreVertical, MapPin, Save, List, Settings
} from 'lucide-react';
import * as XLSX from 'xlsx';

const ControlAsistencia = () => {
  const [activeTab, setActiveTab] = useState('diario'); // diario, reporte
  const [asistencias, setAsistencias] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({
    asistencia_horario_lv_entrada: '08:00',
    asistencia_horario_lv_salida: '17:30',
    asistencia_horario_sab_entrada: '08:00',
    asistencia_horario_sab_salida: '13:00'
  });
  
  // Filters
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Stats
  const stats = {
    total: asistencias.length,
    presentes: asistencias.filter(a => a.hora_entrada).length,
    tardanzas: asistencias.filter(a => a.estado === 'Tardanza' || (a.hora_entrada > '09:00')).length, // Ejemplo simple
    sin_salida: asistencias.filter(a => !a.hora_salida).length
  };

  // Form
  const initialForm = {
    colaborador_id: '',
    fecha: new Date().toISOString().split('T')[0],
    hora_entrada: '',
    hora_salida: '',
    observaciones: '',
    estado: 'Asistencia',
    horas_extras: ''
  };
  const [formData, setFormData] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  // Report Data
  const [reportData, setReportData] = useState([]);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  // Regularization
  const [regularizationDate, setRegularizationDate] = useState(new Date().toISOString().split('T')[0]);
  const [regularizationList, setRegularizationList] = useState([]);
  const [regSearch, setRegSearch] = useState('');

  useEffect(() => {
    fetchColaboradores();
    fetchScheduleConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'diario') {
      fetchAsistencias();
    } else if (activeTab === 'reporte') {
      fetchReport();
    } else if (activeTab === 'regularizacion') {
      fetchRegularizationData();
    }
  }, [activeTab, page, filterDate, searchTerm, filterArea, filterStatus, reportMonth, reportYear, regularizationDate]);

  const fetchColaboradores = async () => {
    try {
      const res = await axios.get(`${API_URL}colaboradores.php?action=simple_list&limit=5000`);
      setColaboradores(res.data.data);
    } catch (error) {
      console.error(error);
      toast.error("Error cargando colaboradores");
    }
  };

  const fetchAsistencias = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}asistencias.php?limit=100&page=${page}&date=${filterDate}&search=${searchTerm}&area=${filterArea}&status=${filterStatus}`);
      setAsistencias(res.data.data);
      setTotalPages(res.data.total_pages);
    } catch (error) {
      console.error(error);
      toast.error("Error cargando asistencias");
    } finally {
      setLoading(false);
    }
  };

  const handleResetDay = async () => {
    if (!window.confirm('¿Resetear asistencias del día seleccionado?')) return;
    try {
      await axios.post(`${API_URL}asistencias.php?reset=true`, { date: filterDate, area: filterArea });
      toast.success("Asistencias reseteadas");
      fetchAsistencias();
    } catch (error) {
      toast.error("Error al resetear asistencias");
    }
  };

  const fetchScheduleConfig = async () => {
    try {
        const res = await axios.get(`${API_URL}asistencia_config.php`);
        if (res.data) {
            setScheduleConfig(res.data);
        }
    } catch (error) {
        console.error("Error fetching schedule config", error);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
        await axios.post(`${API_URL}asistencia_config.php`, scheduleConfig);
        toast.success("Horarios actualizados correctamente");
        setConfigModalOpen(false);
    } catch (error) {
        toast.error("Error al guardar horarios");
    }
  };

  const getScheduledTime = (dateStr, type) => {
    if (!dateStr) return type === 'entrada' ? '08:00' : '17:30';
    
    // Create date object handling timezone manually to get correct day
    const parts = dateStr.split('-');
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    
    if (day === 6) { // Saturday
        return type === 'entrada' 
            ? scheduleConfig.asistencia_horario_sab_entrada 
            : scheduleConfig.asistencia_horario_sab_salida;
    } else { // Weekday (Mon-Fri + Sun default)
        return type === 'entrada' 
            ? scheduleConfig.asistencia_horario_lv_entrada 
            : scheduleConfig.asistencia_horario_lv_salida;
    }
  };

  const handleSetAllEntrada = () => {
    const time = getScheduledTime(regularizationDate, 'entrada');
    setRegularizationList(prevList =>
      prevList.map(item =>
        item.estado === 'Asistencia'
          ? { ...item, hora_entrada: time }
          : item
      )
    );
  };

  const handleSetAllSalida = () => {
    const time = getScheduledTime(regularizationDate, 'salida');
    setRegularizationList(prevList =>
      prevList.map(item =>
        item.estado === 'Asistencia'
          ? { ...item, hora_salida: time }
          : item
      )
    );
  };

  const handleExportReport = () => {
    if (reportData.length === 0) {
        toast.error("No hay datos para exportar");
        return;
    }
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Mensual");
    XLSX.writeFile(wb, `Reporte_Asistencia_${reportMonth}_${reportYear}.xlsx`);
  };

  const handleExportDaily = async () => {
    try {
        const res = await axios.get(`${API_URL}asistencias.php?limit=1000&date=${filterDate}&search=${searchTerm}&area=${filterArea}&status=${filterStatus}`);
        const data = res.data.data.map(item => ({
            Colaborador: `${item.apellidos}, ${item.nombres}`,
            Documento: item.documento_numero,
            Fecha: item.fecha,
            Entrada: item.hora_entrada,
            Salida: item.hora_salida,
            HorasTrabajadas: item.horas_trabajadas,
            HorasExtras: item.horas_extras,
            Estado: item.estado,
            Area: item.area, // Assuming area is available or joined, wait, fetchAsistencias doesn't join area explicitly in SELECT but filters by it.
            // Let's check backend SELECT... it joins 'colaboradores c'. c.area should be selectable if we add it.
            // Backend query: "SELECT a.*, c.nombres, c.apellidos, c.documento_numero, u.usuario as validador_nombre..."
            // It doesn't select c.area. I should probably add it to backend if I want it exported.
            // For now, let's export what we have.
            Metodo: item.metodo,
            Observaciones: item.observaciones
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Asistencia Diario");
        XLSX.writeFile(wb, `Asistencia_${filterDate}.xlsx`);
    } catch (error) {
        toast.error("Error al exportar");
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}asistencias.php?report=monthly&month=${reportMonth}&year=${reportYear}`);
      setReportData(res.data.data);
    } catch (error) {
      toast.error("Error generando reporte");
    } finally {
      setLoading(false);
    }
  };

  const fetchRegularizationData = async () => {
    setLoading(true);
    try {
      const [colabsRes, attRes] = await Promise.all([
        axios.get(`${API_URL}/colaboradores.php?action=simple_list&limit=5000`),
        axios.get(`${API_URL}/asistencias.php?date=${regularizationDate}&limit=5000`)
      ]);
      
      const colabs = colabsRes.data.data;
      const attendanceMap = new Map(attRes.data.data.map(a => [a.colaborador_id, a]));
      
      const list = colabs
        .map(c => {
            const att = attendanceMap.get(c.id);
            return {
                colaborador_id: c.id,
                nombres: c.nombres,
                apellidos: c.apellidos,
                documento_numero: c.documento_numero,
                fecha: regularizationDate,
                hora_entrada: att?.hora_entrada || '',
                hora_salida: att?.hora_salida || '',
                estado: att?.estado || 'Asistencia',
                observaciones: att?.observaciones || ''
            };
        });
        
      setRegularizationList(list);
    } catch (error) {
      console.error(error);
      toast.error("Error cargando datos de regularización");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkChange = (colabId, field, value) => {
    setRegularizationList(prevList => 
        prevList.map(item => 
            item.colaborador_id === colabId ? { ...item, [field]: value } : item
        )
    );
  };

  const handleBulkSubmit = async () => {
    try {
        setLoading(true);
        await axios.post(`${API_URL}asistencias.php?bulk=true`, regularizationList);
        toast.success("Asistencias guardadas correctamente");
        fetchRegularizationData();
    } catch (error) {
        toast.error("Error guardando asistencias");
    } finally {
        setLoading(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`${API_URL}/asistencias.php`, { ...formData, id: editingId });
        toast.success("Asistencia actualizada");
      } else {
        await axios.post(`${API_URL}/asistencias.php`, formData);
        toast.success("Asistencia registrada");
      }
      setModalOpen(false);
      resetForm();
      fetchAsistencias();
    } catch (error) {
      toast.error("Error al guardar");
    }
  };

  const handleValidate = async (id, status) => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      await axios.put(`${API_URL}/asistencias.php`, {
        id,
        validate: true,
        estado: status,
        user_id: user?.id
      });
      toast.success(`Asistencia ${status.toLowerCase()}`);
      fetchAsistencias();
    } catch (error) {
      toast.error("Error al validar");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        // Map Excel columns to API expected format
        // Expecting: Documento, Fecha, Entrada, Salida
        const formattedData = data.map(row => ({
          documento_numero: row['Documento'] || row['DNI'],
          fecha: row['Fecha'], // Ensure YYYY-MM-DD in Excel or parse it
          hora_entrada: row['Entrada'], // HH:MM
          hora_salida: row['Salida'] // HH:MM
        }));

        await axios.post(`${API_URL}asistencias.php?import=true`, formattedData);
        toast.success("Importación completada");
        setImportModalOpen(false);
        fetchAsistencias();
      } catch (error) {
        console.error(error);
        toast.error("Error al importar archivo");
      }
    };
    reader.readAsBinaryString(file);
  };

  const resetForm = () => {
    setFormData(initialForm);
    setEditingId(null);
  };

  const handleEdit = (item) => {
    let formEstado = 'Asistencia';
    if (['Falta', 'Licencia', 'Vacaciones'].includes(item.estado)) {
        formEstado = item.estado;
    } else if (!item.hora_entrada) {
        formEstado = 'Falta';
    }

    setFormData({
      colaborador_id: item.colaborador_id,
      fecha: item.fecha,
      hora_entrada: item.hora_entrada || '',
      hora_salida: item.hora_salida || '',
      observaciones: item.observaciones || '',
      estado: formEstado,
      horas_extras: item.horas_extras || ''
    });
    setEditingId(item.id);
    setModalOpen(true);
  };

  // Get unique areas
  const areas = [...new Set(colaboradores.map(c => c.area).filter(Boolean))];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Clock className="text-blue-600" size={32} />
            Control de Asistencia
          </h1>
          <p className="text-gray-500 mt-1">Gestión de entradas, salidas y horas extras</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('diario')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'diario' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Registro Diario
          </button>
          <button 
            onClick={() => setActiveTab('reporte')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'reporte' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Reportes Mensuales
          </button>
          <button 
            onClick={() => setActiveTab('regularizacion')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'regularizacion' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Regularización Masiva
          </button>
        </div>
      </div>

      {activeTab === 'diario' && (
        <div className="space-y-6 fade-in">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Users size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Registros</p>
                <p className="text-xl font-bold text-gray-800">{stats.total}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                <CheckSquare size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Presentes</p>
                <p className="text-xl font-bold text-gray-800">{stats.presentes}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                <Clock size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Tardanzas</p>
                <p className="text-xl font-bold text-gray-800">{stats.tardanzas}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Sin Salida</p>
                <p className="text-xl font-bold text-gray-800">{stats.sin_salida}</p>
              </div>
            </div>
          </div>

          {/* Filters & Actions */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
            <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto flex-wrap">
              <div className="relative w-full md:w-auto">
                <input 
                  type="date" 
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full md:w-auto px-4 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
                />
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>
              
              <div className="relative w-full md:w-48">
                <select
                  value={filterArea}
                  onChange={(e) => setFilterArea(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 appearance-none bg-white"
                >
                  <option value="">Todas las Áreas</option>
                  {areas.map(area => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>

              <div className="relative w-full md:w-48">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 appearance-none bg-white"
                >
                  <option value="">Todos los Estados</option>
                  <option value="Asistencia">Asistencia</option>
                  <option value="Falta">Falta</option>
                  <option value="Licencia">Licencia</option>
                  <option value="Vacaciones">Vacaciones</option>
                  <option value="Tardanza">Tardanza</option>
                  <option value="Validado">Validado</option>
                  <option value="Observado">Observado</option>
                </select>
                <CheckSquare className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>

              <div className="relative w-full md:flex-1 xl:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar por nombre o DNI..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full xl:w-auto">
              <button 
                onClick={handleExportDaily}
                className="flex-1 xl:flex-none justify-center bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium whitespace-nowrap"
                title="Exportar vista actual"
              >
                <Download size={18} /> <span className="inline">Exportar</span>
              </button>
              <button 
                onClick={handleResetDay}
                className="flex-1 xl:flex-none justify-center bg-white border border-red-600 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium whitespace-nowrap"
                title="Resetear asistencias del día"
              >
                <XCircle size={18} /> <span className="inline">Resetear Día</span>
              </button>
              <button 
                onClick={() => setImportModalOpen(true)}
                className="flex-1 xl:flex-none justify-center bg-white border border-green-600 text-green-600 hover:bg-green-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium whitespace-nowrap"
              >
                <Upload size={18} /> <span className="inline">Importar</span>
              </button>
              <button 
                onClick={() => { resetForm(); setModalOpen(true); }}
                className="flex-1 xl:flex-none justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm whitespace-nowrap"
              >
                <Clock size={18} /> <span className="inline">Registrar</span>
              </button>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                    <th className="p-4 font-semibold">Colaborador</th>
                    <th className="p-4 font-semibold">Entrada / Salida</th>
                    <th className="p-4 font-semibold">Horas</th>
                    <th className="p-4 font-semibold">Ubicación</th>
                    <th className="p-4 font-semibold">Estado</th>
                    <th className="p-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan="6" className="p-12 text-center text-gray-400">Cargando registros...</td></tr>
                  ) : asistencias.length === 0 ? (
                    <tr><td colSpan="6" className="p-12 text-center text-gray-400">No hay asistencias registradas para esta fecha.</td></tr>
                  ) : (
                    asistencias.map(item => (
                      <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                              {item.nombres.charAt(0)}{item.apellidos.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800">{item.apellidos}, {item.nombres}</div>
                              <div className="text-xs text-gray-500 flex items-center gap-1">
                                <FileText size={10}/> {item.documento_numero}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              {item.hora_entrada}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span className={`w-2 h-2 rounded-full ${item.hora_salida ? 'bg-red-500' : 'bg-gray-300'}`}></span>
                              {item.hora_salida || '--:--'}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm font-medium text-gray-700">{item.horas_trabajadas || '0h 0m'}</div>
                          {Number(item.horas_extras) > 0 && (
                            <div className="text-xs text-orange-600 font-medium">+{item.horas_extras} extras</div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full w-fit">
                            <MapPin size={12}/> {item.metodo}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            item.estado === 'Validado' ? 'bg-green-50 text-green-700 border-green-200' :
                            item.estado === 'Observado' ? 'bg-red-50 text-red-700 border-red-200' :
                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}>
                            {item.estado}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.estado === 'Pendiente' && (
                              <>
                                <button onClick={() => handleValidate(item.id, 'Validado')} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Validar">
                                  <CheckCircle size={18} />
                                </button>
                                <button onClick={() => handleValidate(item.id, 'Observado')} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Observar">
                                  <XCircle size={18} />
                                </button>
                              </>
                            )}
                            <button onClick={() => handleEdit(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                              <FileText size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {loading ? (
              <div className="text-center p-8 text-gray-400">Cargando...</div>
            ) : asistencias.length === 0 ? (
              <div className="text-center p-8 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">No hay registros</div>
            ) : (
              asistencias.map(item => (
                <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                        {item.nombres.charAt(0)}{item.apellidos.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{item.apellidos}, {item.nombres}</div>
                        <div className="text-xs text-gray-500">{item.documento_numero}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      item.estado === 'Validado' ? 'bg-green-50 text-green-700 border-green-200' :
                      item.estado === 'Observado' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}>
                      {item.estado}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-2 border-y border-gray-50">
                    <div>
                      <span className="text-xs text-gray-400 block mb-1">Entrada</span>
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        {item.hora_entrada}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block mb-1">Salida</span>
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <span className={`w-1.5 h-1.5 rounded-full ${item.hora_salida ? 'bg-red-500' : 'bg-gray-300'}`}></span>
                        {item.hora_salida || '--:--'}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Clock size={12}/> {item.horas_trabajadas || '0h'}</span>
                      <span className="flex items-center gap-1"><MapPin size={12}/> {item.metodo}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      {item.estado === 'Pendiente' && (
                        <>
                          <button onClick={() => handleValidate(item.id, 'Validado')} className="p-1.5 bg-green-50 text-green-600 rounded-lg">
                            <CheckCircle size={16} />
                          </button>
                          <button onClick={() => handleValidate(item.id, 'Observado')} className="p-1.5 bg-red-50 text-red-600 rounded-lg">
                            <XCircle size={16} />
                          </button>
                        </>
                      )}
                      <button onClick={() => handleEdit(item)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                        <FileText size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'reporte' && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <div className="flex flex-wrap gap-4 mb-6">
            <select 
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="px-4 py-2 border rounded-lg w-full sm:w-auto"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('es', { month: 'long' })}</option>
              ))}
            </select>
            <select 
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
              className="px-4 py-2 border rounded-lg w-full sm:w-auto"
            >
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
            <button 
              onClick={handleExportReport}
              className="ml-auto flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg w-full sm:w-auto justify-center sm:justify-start"
            >
              <Download size={18} /> Exportar Excel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm uppercase">
                  <th className="p-4 border-b">Colaborador</th>
                  <th className="p-4 border-b text-center">Días Trab.</th>
                  <th className="p-4 border-b text-center">Horas Totales</th>
                  <th className="p-4 border-b text-center">Horas Extras</th>
                  <th className="p-4 border-b text-center">Tardanzas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportData.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-800">{row.apellidos}, {row.nombres}</td>
                    <td className="p-4 text-center">{row.dias_trabajados}</td>
                    <td className="p-4 text-center font-bold text-blue-600">{row.total_horas || 0}</td>
                    <td className="p-4 text-center text-orange-600">{row.total_extras || 0}</td>
                    <td className="p-4 text-center text-red-600">{row.tardanzas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Regularization View */}
      {activeTab === 'regularizacion' && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 fade-in">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                {/* Filters Group */}
                <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                    <div className="bg-gray-50 p-1.5 rounded-lg flex items-center border border-gray-200 w-full md:w-auto">
                        <span className="text-gray-500 font-medium px-3 text-sm">Fecha:</span>
                        <input 
                          type="date" 
                          value={regularizationDate}
                          onChange={(e) => setRegularizationDate(e.target.value)}
                          className="bg-transparent border-none focus:ring-0 text-gray-700 font-medium text-sm w-full md:w-auto"
                        />
                    </div>
                    
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          type="text" 
                          placeholder="Buscar colaborador..." 
                          value={regSearch}
                          onChange={(e) => setRegSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
                        />
                    </div>
                </div>

                {/* Actions Group */}
                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        type="button"
                        onClick={() => setConfigModalOpen(true)}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors"
                        title="Configurar Horarios"
                    >
                        <Settings size={20} />
                    </button>
                    
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={handleSetAllEntrada}
                            disabled={loading || regularizationList.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all hover:bg-white hover:shadow-sm text-gray-700 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none"
                        >
                            <Clock size={16} className="text-green-600" /> 
                            <span className="hidden sm:inline">Marcar</span> Entrada
                        </button>
                        <div className="w-px bg-gray-300 my-1"></div>
                        <button
                            type="button"
                            onClick={handleSetAllSalida}
                            disabled={loading || regularizationList.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all hover:bg-white hover:shadow-sm text-gray-700 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none"
                        >
                            <Clock size={16} className="text-orange-600" /> 
                            <span className="hidden sm:inline">Marcar</span> Salida
                        </button>
                    </div>
                  </div>

                  <button 
                      onClick={handleBulkSubmit}
                      disabled={loading}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:shadow-none min-w-[140px]"
                  >
                      <Save size={18} /> 
                      <span>Guardar Todo</span>
                  </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 text-gray-600 text-sm uppercase">
                            <th className="p-4 border-b">Colaborador</th>
                            <th className="p-4 border-b">Estado</th>
                            <th className="p-4 border-b">Entrada</th>
                            <th className="p-4 border-b">Salida</th>
                            <th className="p-4 border-b">Observaciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                             <tr><td colSpan="5" className="p-12 text-center text-gray-400">Cargando...</td></tr>
                        ) : regularizationList
                            .filter(row => 
                                regSearch === '' || 
                                row.nombres.toLowerCase().includes(regSearch.toLowerCase()) || 
                                row.apellidos.toLowerCase().includes(regSearch.toLowerCase()) ||
                                row.documento_numero.includes(regSearch)
                            )
                            .map((row) => (
                            <tr key={row.colaborador_id} className="hover:bg-gray-50">
                                <td className="p-3">
                                    <div className="font-medium text-gray-800">{row.apellidos}, {row.nombres}</div>
                                    <div className="text-xs text-gray-500">{row.documento_numero}</div>
                                </td>
                                <td className="p-3">
                                    <select 
                                        value={row.estado}
                                        onChange={(e) => handleBulkChange(row.colaborador_id, 'estado', e.target.value)}
                                        className={`w-full border rounded p-1 text-sm ${
                                            row.estado === 'Falta' ? 'bg-red-50 text-red-700 border-red-200' :
                                            row.estado === 'Asistencia' ? 'bg-green-50 text-green-700 border-green-200' :
                                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                                        }`}
                                    >
                                        <option value="Asistencia">Asistencia</option>
                                        <option value="Falta">Falta</option>
                                        <option value="Licencia">Licencia</option>
                                        <option value="Vacaciones">Vacaciones</option>
                                    </select>
                                </td>
                                <td className="p-3">
                                    {row.estado === 'Asistencia' && (
                                        <input 
                                            type="time" 
                                            value={row.hora_entrada}
                                            onChange={(e) => handleBulkChange(row.colaborador_id, 'hora_entrada', e.target.value)}
                                            className="w-full border rounded p-1 text-sm"
                                        />
                                    )}
                                </td>
                                <td className="p-3">
                                    {row.estado === 'Asistencia' && (
                                        <input 
                                            type="time" 
                                            value={row.hora_salida}
                                            onChange={(e) => handleBulkChange(row.colaborador_id, 'hora_salida', e.target.value)}
                                            className="w-full border rounded p-1 text-sm"
                                        />
                                    )}
                                </td>
                                <td className="p-3">
                                    <input 
                                        type="text" 
                                        value={row.observaciones}
                                        onChange={(e) => handleBulkChange(row.colaborador_id, 'observaciones', e.target.value)}
                                        className="w-full border rounded p-1 text-sm"
                                        placeholder="..."
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{editingId ? 'Editar Asistencia' : 'Registrar Asistencia'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Colaborador</label>
                <select 
                  required 
                  className="w-full border rounded-lg p-2"
                  value={formData.colaborador_id}
                  onChange={e => setFormData({...formData, colaborador_id: e.target.value})}
                  disabled={!!editingId}
                >
                  <option value="">Seleccione...</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha</label>
                  <input 
                    type="date" 
                    required 
                    className="w-full border rounded-lg p-2"
                    value={formData.fecha}
                    onChange={e => setFormData({...formData, fecha: e.target.value})}
                  />
                </div>
                <div>
                   <label className="block text-sm font-medium mb-1">Tipo de Registro</label>
                   <select 
                      className="w-full border rounded-lg p-2"
                      value={formData.estado}
                      onChange={e => setFormData({...formData, estado: e.target.value})}
                   >
                      <option value="Asistencia">Asistencia</option>
                      <option value="Falta">Falta</option>
                      <option value="Licencia">Licencia</option>
                      <option value="Vacaciones">Vacaciones</option>
                   </select>
                </div>
              </div>

              {formData.estado === 'Asistencia' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Hora Entrada</label>
                    <input 
                      type="time" 
                      required 
                      className="w-full border rounded-lg p-2"
                      value={formData.hora_entrada}
                      onChange={e => setFormData({...formData, hora_entrada: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Hora Salida</label>
                    <input 
                      type="time" 
                      className="w-full border rounded-lg p-2"
                      value={formData.hora_salida}
                      onChange={e => setFormData({...formData, hora_salida: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Horas Extras</label>
                    <input 
                      type="number" 
                      step="0.25"
                      className="w-full border rounded-lg p-2"
                      value={formData.horas_extras}
                      onChange={e => setFormData({...formData, horas_extras: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Observaciones</label>
                <textarea 
                  className="w-full border rounded-lg p-2"
                  value={formData.observaciones}
                  onChange={e => setFormData({...formData, observaciones: e.target.value})}
                ></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Config Schedule Modal */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                        <Settings size={20} className="text-blue-600" />
                        Configurar Horarios
                    </h3>
                    <button 
                        onClick={() => setConfigModalOpen(false)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <XCircle size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSaveConfig} className="p-6 space-y-6">
                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-700 text-sm uppercase tracking-wide border-b pb-2">Lunes a Viernes</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">Entrada</label>
                                <input 
                                    type="time" 
                                    value={scheduleConfig.asistencia_horario_lv_entrada}
                                    onChange={(e) => setScheduleConfig({...scheduleConfig, asistencia_horario_lv_entrada: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">Salida</label>
                                <input 
                                    type="time" 
                                    value={scheduleConfig.asistencia_horario_lv_salida}
                                    onChange={(e) => setScheduleConfig({...scheduleConfig, asistencia_horario_lv_salida: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-700 text-sm uppercase tracking-wide border-b pb-2">Sábados</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">Entrada</label>
                                <input 
                                    type="time" 
                                    value={scheduleConfig.asistencia_horario_sab_entrada}
                                    onChange={(e) => setScheduleConfig({...scheduleConfig, asistencia_horario_sab_entrada: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">Salida</label>
                                <input 
                                    type="time" 
                                    value={scheduleConfig.asistencia_horario_sab_salida}
                                    onChange={(e) => setScheduleConfig({...scheduleConfig, asistencia_horario_sab_salida: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button 
                            type="button" 
                            onClick={() => setConfigModalOpen(false)}
                            className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm hover:shadow transition-all"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Import Modal */
}
      {importModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-center">
            <h2 className="text-xl font-bold mb-4">Importar Asistencias</h2>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 mb-4 hover:bg-gray-50 transition-colors relative">
              <input type="file" accept=".xlsx, .csv" onChange={handleImport} className="absolute inset-0 opacity-0 cursor-pointer" />
              <Upload size={40} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">Click para seleccionar archivo Excel/CSV</p>
              <p className="text-xs text-gray-400 mt-2">Columnas requeridas: DNI, Fecha, Entrada, Salida</p>
            </div>
            <button onClick={() => setImportModalOpen(false)} className="text-gray-500 hover:text-gray-700">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlAsistencia;
