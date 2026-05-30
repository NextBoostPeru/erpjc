import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  CalendarDays, List, Plus, ChevronLeft, ChevronRight,
  Trash2, Upload, Paperclip, X, Loader, AlertCircle,
  Flag, Clock, CheckCircle2, Ban, User, FolderOpen
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../api/config';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'];
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const ESTADOS = ['pendiente','en_progreso','completada','cancelada'];
const PRIORIDADES = ['baja','media','alta','urgente'];

const ESTADO_BADGE = {
  pendiente: 'bg-gray-100 text-gray-700',
  en_progreso: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600'
};
const PRIORIDAD_BADGE = {
  baja: 'bg-green-50 text-green-600 border-green-200',
  media: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  alta: 'bg-orange-50 text-orange-600 border-orange-200',
  urgente: 'bg-red-50 text-red-600 border-red-200'
};
const PRIORIDAD_ICON = {
  baja: Flag, media: Flag, alta: Flag, urgente: AlertCircle
};
const PRIORIDAD_COLOR = { baja: 'text-green-500', media: 'text-yellow-500', alta: 'text-orange-500', urgente: 'text-red-500' };

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const daysInMonth = last.getDate();
  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

const CalendarioRRSS = () => {
  const now = new Date();
  const [view, setView] = useState('calendar');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterPrioridad, setFilterPrioridad] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tarea: '', fecha: new Date().toISOString().split('T')[0],
    prioridad: 'media', estado: 'pendiente',
    encargado_id: '', encargado_nombre: '',
    tipo_proyecto: '', archivos: '[]'
  });
  const [uploading, setUploading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { action: 'list', mes: month + 1, anio: year };
      if (filterEstado) params.estado = filterEstado;
      if (filterPrioridad) params.prioridad = filterPrioridad;
      const res = await axios.get(`${API_URL}calendario_rrss.php`, { params });
      console.log('calendario_rrss list response:', res.data);
      setTasks(Array.isArray(res.data) ? res.data : []);
    } catch { setTasks([]); }
    finally { setLoading(false); }
  }, [month, year, filterEstado, filterPrioridad]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      const d = t.fecha;
      if (!map[d]) map[d] = [];
      map[d].push(t);
    });
    console.log('tasksByDate:', map, 'total tasks:', tasks.length);
    return map;
  }, [tasks]);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  const openCreate = (dateStr = null) => {
    setEditing(null);
    setForm({
      tarea: '', fecha: dateStr || new Date().toISOString().split('T')[0],
      prioridad: 'media', estado: 'pendiente',
      encargado_id: '', encargado_nombre: '',
      tipo_proyecto: '', archivos: '[]'
    });
    setModalOpen(true);
  };

  const openEdit = (task) => {
    setEditing(task);
    setForm({
      tarea: task.tarea,
      fecha: task.fecha,
      prioridad: task.prioridad,
      estado: task.estado,
      encargado_id: task.encargado_id || '',
      encargado_nombre: task.encargado_nombre || '',
      tipo_proyecto: task.tipo_proyecto || '',
      archivos: task.archivos || '[]'
    });
    setModalOpen(true);
  };

  const getFiles = () => {
    try { return JSON.parse(form.archivos || '[]'); }
    catch { return []; }
  };

  const handleFileUpload = async (e) => {
    const fd = new FormData();
    fd.append('file', e.target.files[0]);
    fd.append('action', 'upload_file');
    setUploading(true);
    try {
      const res = await axios.post(`${API_URL}calendario_rrss.php?action=upload_file`, fd);
      if (res.data?.success) {
        const files = getFiles();
        files.push({ nombre: res.data.nombre, ruta: res.data.ruta, ext: res.data.ext, size: res.data.size });
        setForm(f => ({ ...f, archivos: JSON.stringify(files) }));
        toast.success('Archivo subido');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al subir archivo');
    }
    finally { setUploading(false); e.target.value = ''; }
  };

  const removeFile = (idx) => {
    const files = getFiles();
    const removed = files.splice(idx, 1)[0];
    setForm(f => ({ ...f, archivos: JSON.stringify(files) }));
    if (removed?.ruta) {
      axios.post(`${API_URL}calendario_rrss.php?action=delete_file`, { ruta: removed.ruta }).catch(() => {});
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.tarea.trim()) { toast.error('La tarea es requerida'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.post(`${API_URL}calendario_rrss.php?action=update`, { id: editing.id, ...form });
        toast.success('Tarea actualizada');
      } else {
        await axios.post(`${API_URL}calendario_rrss.php?action=create`, form);
        toast.success('Tarea creada');
      }
      setModalOpen(false);
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al guardar');
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`¿Eliminar "${task.tarea}"?`)) return;
    try {
      await axios.post(`${API_URL}calendario_rrss.php?action=delete`, { id: task.id });
      toast.success('Tarea eliminada');
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al eliminar');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const TaskCard = ({ task, compact }) => {
    const PIcon = PRIORIDAD_ICON[task.prioridad] || Flag;
    return (
      <div
        onClick={() => openEdit(task)}
        className={`group cursor-pointer rounded-lg border transition-all hover:shadow-md ${
          compact ? 'p-1.5 text-[11px] mb-1' : 'p-3 mb-2'
        } ${PRIORIDAD_BADGE[task.prioridad] || 'bg-white border-gray-200'}`}
      >
        <div className="flex items-start gap-1.5">
          <PIcon size={compact ? 10 : 14} className={`${PRIORIDAD_COLOR[task.prioridad]} mt-0.5 shrink-0`} />
          <span className={`${compact ? 'line-clamp-2' : ''} flex-1 ${task.estado === 'completada' ? 'line-through opacity-60' : ''}`}>
            {task.tarea}
          </span>
        </div>
        {!compact && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${ESTADO_BADGE[task.estado] || 'bg-gray-100'}`}>
              {task.estado.replace('_', ' ')}
            </span>
            {task.encargado_nombre && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                <User size={10} /> {task.encargado_nombre}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <CalendarDays className="text-blue-600" size={28} />
          Calendario RRSS
        </h2>
        <div className="flex items-center gap-2">
          <div className="bg-gray-100 rounded-lg p-0.5 flex">
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'calendar' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <CalendarDays size={16} className="inline mr-1" />Calendario
            </button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <List size={16} className="inline mr-1" />Lista
            </button>
          </div>
          <button onClick={() => openCreate()} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium transition-colors">
            <Plus size={16} /> Nueva Tarea
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          {ESTADOS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={filterPrioridad} onChange={e => setFilterPrioridad(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {view === 'calendar' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <button onClick={() => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <h3 className="text-lg font-semibold text-gray-800">{MONTHS[month]} {year}</h3>
            <button onClick={() => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(d => (
              <div key={d} className="p-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`e${idx}`} className="min-h-[100px] bg-gray-50/30" />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayTasks = tasksByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={dateStr}
                  className={`min-h-[100px] border-r border-b border-gray-100 p-1.5 transition-colors group ${
                    isToday ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-blue-600 text-white' : 'text-gray-600'
                    }`}>
                      {day}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openCreate(dateStr); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-blue-100 rounded transition-all"
                      title="Agregar tarea en esta fecha"
                    >
                      <Plus size={14} className="text-blue-600" />
                    </button>
                  </div>
                  <div className="space-y-0.5 overflow-hidden max-h-[68px]">
                    {dayTasks.slice(0, 3).map(t => (
                      <TaskCard key={t.id} task={t} compact />
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-blue-600 font-medium cursor-pointer hover:underline">
                        +{dayTasks.length - 3} más
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tarea</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prioridad</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Encargado</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo Proyecto</th>
                  <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Archivos</th>
                  <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 && !loading && (
                  <tr><td colSpan={8} className="text-center p-8 text-gray-400">No hay tareas para este mes</td></tr>
                )}
                {tasks.map(task => {
                  const PIcon = PRIORIDAD_ICON[task.prioridad] || Flag;
                  const files = (() => { try { return JSON.parse(task.archivos || '[]'); } catch { return []; } })();
                  return (
                    <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="p-3">
                        <button onClick={() => openEdit(task)} className="text-gray-800 font-medium hover:text-blue-600 text-left">
                          {task.tarea}
                        </button>
                      </td>
                      <td className="p-3">
                        <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${ESTADO_BADGE[task.estado]}`}>
                          {task.estado.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${PRIORIDAD_BADGE[task.prioridad]}`}>
                          <PIcon size={12} className={PRIORIDAD_COLOR[task.prioridad]} />
                          {task.prioridad}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {task.encargado_nombre ? (
                          <span className="flex items-center gap-1"><User size={14} className="text-gray-400" />{task.encargado_nombre}</span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-sm text-gray-600">{task.fecha}</td>
                      <td className="p-3 text-sm text-gray-600">{task.tipo_proyecto || '-'}</td>
                      <td className="p-3 text-center">
                        {files.length > 0 ? (
                          <span className="text-xs text-blue-600 flex items-center justify-center gap-1">
                            <Paperclip size={14} /> {files.length}
                          </span>
                        ) : <span className="text-xs text-gray-300">-</span>}
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleDelete(task)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <Loader className="animate-spin text-blue-600" size={32} />
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {editing ? <><CalendarDays size={20} className="text-blue-600" /> Editar Tarea</> : <><Plus size={20} className="text-blue-600" /> Nueva Tarea</>}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarea *</label>
                <textarea value={form.tarea} onChange={e => setForm(f => ({ ...f, tarea: e.target.value }))} rows={3} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Describe la tarea..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    {ESTADOS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Proyecto</label>
                  <input type="text" value={form.tipo_proyecto} onChange={e => setForm(f => ({ ...f, tipo_proyecto: e.target.value }))} placeholder="Ej: Campaña Meta"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Encargado</label>
                <div className="flex gap-2">
                  <input type="text" value={form.encargado_nombre} onChange={e => setForm(f => ({ ...f, encargado_nombre: e.target.value }))} placeholder="Nombre del responsable"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Archivos Adjuntos</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-400 transition-colors">
                  <input type="file" id="fileInput" onChange={handleFileUpload} className="hidden" multiple={false} />
                  <label htmlFor="fileInput" className="flex flex-col items-center gap-2 cursor-pointer">
                    <Upload size={24} className="text-gray-400" />
                    <span className="text-sm text-gray-500">{uploading ? 'Subiendo...' : 'Click para adjuntar archivo'}</span>
                    <span className="text-[10px] text-gray-400">PDF, imágenes, office, hasta 50MB</span>
                  </label>
                </div>
                {getFiles().length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {getFiles().map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg text-sm">
                        <span className="flex items-center gap-2 text-gray-700 truncate">
                          <Paperclip size={14} className="text-blue-500 shrink-0" />
                          <span className="truncate">{f.nombre}</span>
                        </span>
                        <button type="button" onClick={() => removeFile(i)} className="p-1 hover:bg-red-100 rounded transition-colors">
                          <X size={14} className="text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving || uploading}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                  {saving ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                  {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarioRRSS;
