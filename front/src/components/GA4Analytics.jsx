import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { BarChart3, Save, Upload, Trash2, RefreshCw, Settings, Activity, FileSpreadsheet, FileText, Download, Plus } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { API_URL } from '../api/config';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

const fmtInt = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString();
};

const fmtSec = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return '0s';
  if (n < 60) return `${Math.round(n)}s`;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}m ${s}s`;
};

const sanitizeSheetName = (name) => {
  const n = String(name || '').replace(/[\[\]\*\/\\\?\:]/g, ' ').trim();
  return (n || 'Sheet').slice(0, 31);
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const tableToAoA = (title, table, extraRows = []) => {
  const dims = Array.isArray(table?.dimensions) ? table.dimensions : [];
  const mets = Array.isArray(table?.metrics) ? table.metrics : [];
  const cols = [...dims, ...mets];
  const rows = Array.isArray(table?.rows) ? table.rows : [];

  const header = [title || ''];
  const columns = cols.length ? [cols] : [];
  const body = cols.length
    ? rows.map((r) => cols.map((c) => (r?.[c] ?? '')))
    : rows.map((r) => [JSON.stringify(r)]);

  return [
    header,
    ...extraRows,
    ...(columns.length ? columns : []),
    ...body
  ];
};

const GA4Analytics = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [uploadingCreds, setUploadingCreds] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const canWrite = canCreate || canEdit;

  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(0);

  const [showCreateSiteModal, setShowCreateSiteModal] = useState(false);
  const [creatingSite, setCreatingSite] = useState(false);
  const [createSiteForm, setCreateSiteForm] = useState({ nombre: '', dominio: '', propertyId: '', measurementId: '' });

  const [config, setConfig] = useState({
    siteId: 0,
    nombre: '',
    dominio: '',
    propertyId: '',
    measurementId: '',
    hasCredentials: false,
    clientEmail: '',
    activo: 1
  });
  const [configForm, setConfigForm] = useState({ nombre: '', dominio: '', propertyId: '', measurementId: '', activo: 1 });
  const [serviceAccountFile, setServiceAccountFile] = useState(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const [range, setRange] = useState({ start: defaultStart, end: today });
  const [ga4Data, setGa4Data] = useState(null);
  const [noCache, setNoCache] = useState(false);
  const [lastCached, setLastCached] = useState(null);

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API_URL}check_my_permissions.php?code=ga4_analytics&token=${encodeURIComponent(token || '')}`,
          { headers: { ...authHeaders } }
        );
        setCanCreate(Number(response.data?.crear || 0) === 1);
        setCanEdit(Number(response.data?.editar || 0) === 1);
        setCanDelete(Number(response.data?.eliminacion || 0) === 1);
      } catch (e) {
        const modulos = JSON.parse(localStorage.getItem('modulos') || '[]');
        const currentModule = Array.isArray(modulos) ? modulos.find((m) => m.codigo === 'ga4_analytics') : null;
        if (currentModule) {
          const canCreateLocal = Number(currentModule.permiso_crear) === 1;
          const canEditLocal = Number(currentModule.permiso_editar) === 1;
          const canWriteLocal = Number(currentModule.permiso_escritura) === 1;
          setCanCreate(canCreateLocal || canWriteLocal);
          setCanEdit(canEditLocal || canWriteLocal);
          setCanDelete(Number(currentModule.permiso_eliminacion) === 1);
        }
      }
    };

    checkPermissions();
  }, [authHeaders]);

  const applySelectedSite = (list, sid) => {
    const nextSel =
      list.find((s) => Number(s?.id) === Number(sid)) ||
      list.find((s) => Number(s?.activo) === 1) ||
      list[0];

    if (!nextSel) {
      setSelectedSiteId(0);
      setConfig({ siteId: 0, nombre: '', dominio: '', propertyId: '', measurementId: '', hasCredentials: false, clientEmail: '', activo: 1 });
      setConfigForm({ nombre: '', dominio: '', propertyId: '', measurementId: '', activo: 1 });
      return;
    }

    const next = {
      siteId: Number(nextSel.id || 0),
      nombre: nextSel.nombre || '',
      dominio: nextSel.dominio || '',
      propertyId: nextSel.propertyId || '',
      measurementId: nextSel.measurementId || '',
      hasCredentials: Boolean(nextSel.hasCredentials),
      clientEmail: nextSel.clientEmail || '',
      activo: Number(nextSel.activo || 0)
    };

    setSelectedSiteId(next.siteId);
    setConfig(next);
    setConfigForm({ nombre: next.nombre, dominio: next.dominio, propertyId: next.propertyId, measurementId: next.measurementId, activo: next.activo || 0 });
  };

  const fetchSites = async (preferredId) => {
    setLoadingConfig(true);
    try {
      const res = await axios.get(`${API_URL}ga4.php?action=sites`, { headers: authHeaders });
      const list = Array.isArray(res.data?.sites) ? res.data.sites : [];
      setSites(list);
      applySelectedSite(list, preferredId || selectedSiteId);
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo cargar sitios GA4';
      toast.error(msg);
    } finally {
      setLoadingConfig(false);
    }
  };

  const updateSite = async (site, patch) => {
    if (!site) return;
    const id = Number(site.id || site.siteId || 0);
    if (!id) return;
    setSavingConfig(true);
    try {
      await axios.post(
        `${API_URL}ga4.php?action=sites_update&id=${encodeURIComponent(id)}`,
        {
          nombre: patch?.nombre ?? site.nombre ?? '',
          dominio: patch?.dominio ?? site.dominio ?? '',
          propertyId: patch?.propertyId ?? site.propertyId ?? '',
          measurementId: patch?.measurementId ?? site.measurementId ?? '',
          activo: patch?.activo ?? site.activo ?? 1
        },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      await fetchSites(id);
      toast.success('Sitio actualizado');
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo actualizar sitio';
      toast.error(msg);
    } finally {
      setSavingConfig(false);
    }
  };

  const deactivateSite = async (id) => {
    const sid = Number(id || 0);
    if (!sid) return;
    if (!window.confirm('¿Desactivar este sitio?')) return;
    setSavingConfig(true);
    try {
      await axios.delete(`${API_URL}ga4.php?action=sites_delete&id=${encodeURIComponent(sid)}`, { headers: authHeaders });
      toast.success('Sitio desactivado');
      await fetchSites();
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo desactivar sitio';
      toast.error(msg);
    } finally {
      setSavingConfig(false);
    }
  };

  const saveConfig = async () => {
    if (!selectedSiteId) {
      toast.error('Selecciona un sitio');
      return;
    }
    setSavingConfig(true);
    try {
      await axios.post(
        `${API_URL}ga4.php?action=sites_update&id=${encodeURIComponent(selectedSiteId)}`,
        {
          nombre: configForm.nombre,
          dominio: configForm.dominio,
          propertyId: configForm.propertyId,
          measurementId: configForm.measurementId,
          activo: configForm.activo
        },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      toast.success('Configuración guardada');
      await fetchSites(selectedSiteId);
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo guardar configuración';
      toast.error(msg);
    } finally {
      setSavingConfig(false);
    }
  };

  const uploadCredentials = async () => {
    if (!selectedSiteId) {
      toast.error('Selecciona un sitio');
      return;
    }
    if (!serviceAccountFile) {
      toast.error('Selecciona un archivo JSON');
      return;
    }
    setUploadingCreds(true);
    try {
      const fd = new FormData();
      fd.append('service_account', serviceAccountFile);
      await axios.post(`${API_URL}ga4.php?action=upload_credentials&site_id=${encodeURIComponent(selectedSiteId)}`, fd, { headers: authHeaders });
      toast.success('Credenciales subidas');
      setServiceAccountFile(null);
      await fetchSites(selectedSiteId);
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo subir credenciales';
      toast.error(msg);
    } finally {
      setUploadingCreds(false);
    }
  };

  const deleteCredentials = async () => {
    if (!selectedSiteId) {
      toast.error('Selecciona un sitio');
      return;
    }
    setUploadingCreds(true);
    try {
      await axios.delete(`${API_URL}ga4.php?action=delete_credentials&site_id=${encodeURIComponent(selectedSiteId)}`, { headers: authHeaders });
      toast.success('Credenciales eliminadas');
      await fetchSites(selectedSiteId);
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo eliminar credenciales';
      toast.error(msg);
    } finally {
      setUploadingCreds(false);
    }
  };

  const testConnection = async () => {
    if (!selectedSiteId) {
      toast.error('Selecciona un sitio');
      return;
    }
    setTesting(true);
    try {
      await axios.get(`${API_URL}ga4.php?action=test&site_id=${encodeURIComponent(selectedSiteId)}`, { headers: authHeaders });
      toast.success('Conexión GA4 OK');
    } catch (e) {
      const msg = e?.response?.data?.message || 'Conexión GA4 falló';
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const fetchAll = async () => {
    if (!selectedSiteId) return;
    setLoadingData(true);
    try {
      const url = `${API_URL}ga4.php?action=dashboard&site_id=${encodeURIComponent(selectedSiteId)}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}&nocache=${noCache ? 1 : 0}`;
      const res = await axios.get(url, { headers: authHeaders });
      setGa4Data(res.data?.data || null);
      setLastCached(typeof res.data?.cached === 'boolean' ? res.data.cached : null);
    } catch (e) {
      setGa4Data(null);
      setLastCached(null);
      const msg = e?.response?.data?.message || 'No se pudo cargar datos GA4';
      toast.error(msg);
    } finally {
      setLoadingData(false);
    }
  };

  const openCreateSite = () => {
    setCreateSiteForm({ nombre: '', dominio: '', propertyId: '', measurementId: '' });
    setShowCreateSiteModal(true);
  };

  const submitCreateSite = async (e) => {
    e?.preventDefault?.();
    if (!createSiteForm.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setCreatingSite(true);
    try {
      const res = await axios.post(
        `${API_URL}ga4.php?action=sites_create`,
        {
          nombre: createSiteForm.nombre,
          dominio: createSiteForm.dominio,
          propertyId: createSiteForm.propertyId,
          measurementId: createSiteForm.measurementId
        },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      const id = Number(res.data?.id || 0);
      setShowCreateSiteModal(false);
      await fetchSites(id || undefined);
      toast.success('Sitio creado');
    } catch (e2) {
      const msg = e2?.response?.data?.message || 'No se pudo crear sitio';
      toast.error(msg);
    } finally {
      setCreatingSite(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  useEffect(() => {
    if (!['dashboard', 'eventos', 'formularios'].includes(activeTab)) return;
    if (!selectedSiteId) return;
    if (!config.propertyId || !config.hasCredentials) return;
    fetchAll();
  }, [activeTab, selectedSiteId, config.propertyId, config.hasCredentials]);

  const summary = ga4Data?.summary || {};
  const newVs = ga4Data?.newVsReturning?.rows || [];
  const age = ga4Data?.age?.rows || [];
  const gender = ga4Data?.gender?.rows || [];
  const device = ga4Data?.device?.rows || [];
  const channel = ga4Data?.channel?.rows || [];
  const platform = ga4Data?.platform?.rows || [];
  const geo = ga4Data?.geo?.rows || [];
  const pages = ga4Data?.pages?.rows || [];
  const flow = ga4Data?.flow?.rows || [];
  const events = ga4Data?.events?.rows || [];
  const formsStart = ga4Data?.formsStart?.rows || [];
  const formsSubmit = ga4Data?.formsSubmit?.rows || [];

  const newVsChart = useMemo(() => {
    return newVs.map((r) => ({
      name: r?.newVsReturning || 'unknown',
      value: Number(r?.totalUsers || 0)
    }));
  }, [newVs]);

  const genderChart = useMemo(() => {
    return gender.map((r) => ({
      name: r?.userGender || 'unknown',
      value: Number(r?.totalUsers || 0)
    }));
  }, [gender]);

  const ageChart = useMemo(() => {
    return age.map((r) => ({
      name: r?.userAgeBracket || 'unknown',
      value: Number(r?.totalUsers || 0)
    }));
  }, [age]);

  const deviceChart = useMemo(() => {
    return device.map((r) => ({
      name: r?.deviceCategory || 'unknown',
      sesiones: Number(r?.sessions || 0),
      usuarios: Number(r?.totalUsers || 0)
    }));
  }, [device]);

  const channelChart = useMemo(() => {
    return channel.slice(0, 12).map((r) => ({
      name: r?.sessionDefaultChannelGroup || 'unknown',
      sesiones: Number(r?.sessions || 0),
      usuarios: Number(r?.totalUsers || 0)
    }));
  }, [channel]);

  const platformChart = useMemo(() => {
    return platform.map((r) => ({
      name: r?.platform || 'unknown',
      sesiones: Number(r?.sessions || 0),
      usuarios: Number(r?.totalUsers || 0)
    }));
  }, [platform]);

  const eventsSorted = useMemo(() => {
    return [...events].sort((a, b) => Number(b?.eventCount || 0) - Number(a?.eventCount || 0));
  }, [events]);

  const formsAgg = useMemo(() => {
    const map = new Map();

    for (const r of formsStart) {
      const name = (r && r['customEvent:form_name']) ? String(r['customEvent:form_name']) : 'unknown';
      const startCount = Number(r?.eventCount || 0);
      const cur = map.get(name) || { formName: name, starts: 0, submits: 0, abandon: 0 };
      cur.starts += startCount;
      map.set(name, cur);
    }

    for (const r of formsSubmit) {
      const name = (r && r['customEvent:form_name']) ? String(r['customEvent:form_name']) : 'unknown';
      const submitCount = Number(r?.eventCount || 0);
      const cur = map.get(name) || { formName: name, starts: 0, submits: 0, abandon: 0 };
      cur.submits += submitCount;
      map.set(name, cur);
    }

    const out = [...map.values()].map((x) => ({ ...x, abandon: Math.max(0, Number(x.starts || 0) - Number(x.submits || 0)) }));
    out.sort((a, b) => Number(b.starts || 0) - Number(a.starts || 0));
    return out;
  }, [formsStart, formsSubmit]);

  const exportJson = () => {
    if (!ga4Data) {
      toast.error('No hay datos para exportar');
      return;
    }
    const payload = { range, data: ga4Data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `GA4_${range.start}_a_${range.end}.json`);
  };

  const exportExcel = () => {
    if (!ga4Data) {
      toast.error('No hay datos para exportar');
      return;
    }

    const wb = XLSX.utils.book_new();
    const metaRows = [[`Rango: ${range.start} a ${range.end}`], ['']];

    const summaryAoA = [
      ['Resumen'],
      ...metaRows,
      ['Métrica', 'Valor'],
      ['Usuarios totales', Number(summary.totalUsers || 0)],
      ['Usuarios nuevos', Number(summary.newUsers || 0)],
      ['Sesiones', Number(summary.sessions || 0)],
      ['Páginas vistas', Number(summary.pageViews || 0)],
      ['Tiempo promedio (s)', Number(summary.avgSessionDuration || 0)],
      ['Engagement rate', Number(summary.engagementRate || 0)]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), sanitizeSheetName('Resumen'));

    const tables = [
      { key: 'newVsReturning', label: 'Nuevos vs Recurrentes', table: ga4Data?.newVsReturning },
      { key: 'age', label: 'Edad', table: ga4Data?.age },
      { key: 'gender', label: 'Sexo', table: ga4Data?.gender },
      { key: 'geo', label: 'Ubicación', table: ga4Data?.geo },
      { key: 'device', label: 'Dispositivo', table: ga4Data?.device },
      { key: 'channel', label: 'Canal', table: ga4Data?.channel },
      { key: 'platform', label: 'Plataforma', table: ga4Data?.platform },
      { key: 'pages', label: 'Páginas', table: ga4Data?.pages },
      { key: 'flow', label: 'Flujo', table: ga4Data?.flow }
    ];

    for (const t of tables) {
      const aoa = tableToAoA(t.label, t.table, metaRows);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(t.label));
    }

    XLSX.writeFile(wb, `GA4_${range.start}_a_${range.end}.xlsx`);
  };

  const exportPdf = () => {
    if (!ga4Data) {
      toast.error('No hay datos para exportar');
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text('Google Analytics 4 - Reporte', 14, 16);
    doc.setFontSize(10);
    doc.text(`Rango: ${range.start} a ${range.end}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Métrica', 'Valor']],
      body: [
        ['Usuarios totales', fmtInt(summary.totalUsers)],
        ['Usuarios nuevos', fmtInt(summary.newUsers)],
        ['Sesiones', fmtInt(summary.sessions)],
        ['Páginas vistas', fmtInt(summary.pageViews)],
        ['Tiempo promedio', fmtSec(summary.avgSessionDuration)],
        ['Engagement rate', String(summary.engagementRate ?? '')]
      ],
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] }
    });

    const pdfSections = [
      { title: 'Usuarios nuevos vs recurrentes', table: ga4Data?.newVsReturning, max: 20 },
      { title: 'Edad', table: ga4Data?.age, max: 25 },
      { title: 'Sexo', table: ga4Data?.gender, max: 25 },
      { title: 'Ubicación (país / ciudad)', table: ga4Data?.geo, max: 30 },
      { title: 'Dispositivo', table: ga4Data?.device, max: 25 },
      { title: 'Canal de ingreso', table: ga4Data?.channel, max: 25 },
      { title: 'Plataforma', table: ga4Data?.platform, max: 25 },
      { title: 'Páginas visitadas', table: ga4Data?.pages, max: 25 },
      { title: 'Flujo (referrer → página)', table: ga4Data?.flow, max: 30 }
    ];

    for (const s of pdfSections) {
      const dims = Array.isArray(s.table?.dimensions) ? s.table.dimensions : [];
      const mets = Array.isArray(s.table?.metrics) ? s.table.metrics : [];
      const cols = [...dims, ...mets];
      const rows = (Array.isArray(s.table?.rows) ? s.table.rows : []).slice(0, s.max);
      if (!cols.length || !rows.length) continue;

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 28) + 8,
        head: [[s.title]],
        body: [],
        theme: 'plain',
        styles: { fontStyle: 'bold', fontSize: 11 }
      });

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 28) + 2,
        head: [cols],
        body: rows.map((r) => cols.map((c) => String(r?.[c] ?? ''))),
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39] }
      });
    }

    doc.save(`GA4_${range.start}_a_${range.end}.pdf`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={24} />
            Analytics Web
          </h1>
          <p className="text-gray-500 mt-1">Métricas GA4 por sitio: audiencia, páginas, eventos y formularios</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-700">Sitio</label>
            <select
              value={selectedSiteId || ''}
              onChange={(e) => {
                const id = Number(e.target.value || 0);
                setGa4Data(null);
                applySelectedSite(sites, id);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            >
              <option value="" disabled>
                Selecciona...
              </option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.nombre || `Sitio ${s.id}`) + (Number(s.activo) === 1 ? '' : ' (inactivo)')}
                </option>
              ))}
            </select>
            {canWrite ? (
              <button
                onClick={openCreateSite}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 font-semibold hover:bg-gray-50"
                title="Crear sitio"
              >
                <Plus size={16} />
              </button>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${activeTab === 'dashboard' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              <Activity size={16} className="inline mr-2" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('eventos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${activeTab === 'eventos' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              <Activity size={16} className="inline mr-2" />
              Eventos
            </button>
            <button
              onClick={() => setActiveTab('formularios')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${activeTab === 'formularios' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              <Activity size={16} className="inline mr-2" />
              Formularios
            </button>
            {canWrite ? (
              <button
                onClick={() => setActiveTab('config')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border ${activeTab === 'config' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
              >
                <Settings size={16} className="inline mr-2" />
                Configuración
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {showCreateSiteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="text-lg font-semibold text-gray-800">Nuevo sitio</div>
              <button
                type="button"
                onClick={() => setShowCreateSiteModal(false)}
                className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={submitCreateSite} className="p-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Nombre</label>
                <input
                  value={createSiteForm.nombre}
                  onChange={(e) => setCreateSiteForm((p) => ({ ...p, nombre: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Web Externa"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700">Dominio (opcional)</label>
                <input
                  value={createSiteForm.dominio}
                  onChange={(e) => setCreateSiteForm((p) => ({ ...p, dominio: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: https://midominio.com"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Si la propiedad GA4 tiene múltiples dominios, esto filtra reportes por hostname.
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700">GA4 Property ID (opcional)</label>
                  <input
                    value={createSiteForm.propertyId}
                    onChange={(e) => setCreateSiteForm((p) => ({ ...p, propertyId: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: 123456789"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Measurement ID (opcional)</label>
                  <input
                    value={createSiteForm.measurementId}
                    onChange={(e) => setCreateSiteForm((p) => ({ ...p, measurementId: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: G-XXXXXXX"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSiteModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 font-semibold hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingSite}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  {creatingSite ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeTab === 'config' && canWrite && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Conexión GA4</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Nombre del sitio</label>
                <input
                  value={configForm.nombre}
                  onChange={(e) => setConfigForm((p) => ({ ...p, nombre: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Web Externa"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700">Dominio (opcional)</label>
                <input
                  value={configForm.dominio}
                  onChange={(e) => setConfigForm((p) => ({ ...p, dominio: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: https://midominio.com"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700">GA4 Property ID</label>
                  <input
                    value={configForm.propertyId}
                    onChange={(e) => setConfigForm((p) => ({ ...p, propertyId: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: 123456789"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Measurement ID (opcional)</label>
                  <input
                    value={configForm.measurementId}
                    onChange={(e) => setConfigForm((p) => ({ ...p, measurementId: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: G-XXXXXXX"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700">Estado</label>
                <select
                  value={String(configForm.activo ?? 1)}
                  onChange={(e) => setConfigForm((p) => ({ ...p, activo: Number(e.target.value) }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save size={16} className="inline mr-2" />
                  {savingConfig ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 font-semibold hover:bg-gray-50 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={`inline mr-2 ${testing ? 'animate-spin' : ''}`} />
                  {testing ? 'Probando...' : 'Probar conexión'}
                </button>
                {canDelete ? (
                  <button
                    onClick={() => deactivateSite(selectedSiteId)}
                    disabled={savingConfig}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                  >
                    <Trash2 size={16} className="inline mr-2" />
                    Desactivar sitio
                  </button>
                ) : null}
              </div>
              {loadingConfig ? (
                <div className="text-sm text-gray-500">Cargando configuración...</div>
              ) : (
                <div className="text-sm text-gray-600">
                  <div>Credenciales: {config.hasCredentials ? 'Cargadas' : 'No cargadas'}</div>
                  {config.clientEmail ? <div>Service Account: {config.clientEmail}</div> : null}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Credenciales (Service Account JSON)</h2>
            <div className="space-y-4">
              <input
                type="file"
                accept="application/json"
                onChange={(e) => setServiceAccountFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700"
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={uploadCredentials}
                  disabled={uploadingCreds}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60"
                >
                  <Upload size={16} className="inline mr-2" />
                  {uploadingCreds ? 'Procesando...' : 'Subir'}
                </button>
                <button
                  onClick={deleteCredentials}
                  disabled={uploadingCreds}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                >
                  <Trash2 size={16} className="inline mr-2" />
                  Eliminar
                </button>
              </div>
              <div className="text-sm text-gray-600">
                Requisito: el Service Account debe tener acceso de Lectura al Property de GA4 (agregar el client_email en GA4 → Admin → Property Access Management).
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Sitios</h2>
              <button
                onClick={() => fetchSites(selectedSiteId || undefined)}
                disabled={loadingConfig}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 font-semibold hover:bg-gray-50 disabled:opacity-60"
              >
                <RefreshCw size={16} className={`inline mr-2 ${loadingConfig ? 'animate-spin' : ''}`} />
                {loadingConfig ? 'Actualizando...' : 'Actualizar lista'}
              </button>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Dominio</th>
                    <th className="py-2 pr-3">Property</th>
                    <th className="py-2 pr-3">Credenciales</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 font-semibold text-gray-800">{s.nombre || '-'}</td>
                      <td className="py-2 pr-3">{s.dominio || '-'}</td>
                      <td className="py-2 pr-3">{s.propertyId || '-'}</td>
                      <td className="py-2 pr-3">{s.hasCredentials ? 'Sí' : 'No'}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full border ${
                            Number(s.activo) === 1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}
                        >
                          {Number(s.activo) === 1 ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => {
                              setGa4Data(null);
                              applySelectedSite(sites, Number(s.id));
                              setActiveTab('config');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-800 font-semibold hover:bg-gray-50"
                          >
                            Seleccionar
                          </button>
                          <button
                            onClick={() => updateSite(s, { activo: Number(s.activo) === 1 ? 0 : 1 })}
                            disabled={savingConfig}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-800 font-semibold hover:bg-gray-50 disabled:opacity-60"
                          >
                            {Number(s.activo) === 1 ? 'Desactivar' : 'Activar'}
                          </button>
                          {canDelete ? (
                            <button
                              onClick={() => deactivateSite(s.id)}
                              disabled={savingConfig}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                            >
                              Eliminar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sites.length === 0 ? (
                    <tr>
                      <td className="py-4 text-gray-500" colSpan={6}>
                        No hay sitios
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Desde</label>
                  <input
                    type="date"
                    value={range.start}
                    onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))}
                    className="mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Hasta</label>
                  <input
                    type="date"
                    value={range.end}
                    onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
                    className="mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <button
                  onClick={fetchAll}
                  disabled={loadingData}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={`inline mr-2 ${loadingData ? 'animate-spin' : ''}`} />
                  {loadingData ? 'Actualizando...' : 'Actualizar'}
                </button>
                <button
                  onClick={exportExcel}
                  disabled={!ga4Data || loadingData}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60"
                >
                  <FileSpreadsheet size={16} className="inline mr-2" />
                  Excel
                </button>
                <button
                  onClick={exportPdf}
                  disabled={!ga4Data || loadingData}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                >
                  <FileText size={16} className="inline mr-2" />
                  PDF
                </button>
                <button
                  onClick={exportJson}
                  disabled={!ga4Data || loadingData}
                  className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-60"
                >
                  <Download size={16} className="inline mr-2" />
                  JSON
                </button>
                {canWrite ? (
                  <label className="flex items-center gap-2 text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded-lg bg-white select-none">
                    <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
                    Sin cache
                  </label>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {typeof lastCached === 'boolean' ? (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${lastCached ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {lastCached ? 'Cache' : 'Directo'}
                  </span>
                ) : null}
                {!config.propertyId || !config.hasCredentials ? (
                  <div className="text-sm text-red-600 font-semibold">
                    Falta configuración. Ve a Configuración y guarda Property ID + credenciales.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="text-sm text-gray-500 font-semibold">Usuarios totales</div>
              <div className="text-3xl font-bold text-gray-800 mt-2">{fmtInt(summary.totalUsers)}</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="text-sm text-gray-500 font-semibold">Usuarios nuevos</div>
              <div className="text-3xl font-bold text-gray-800 mt-2">{fmtInt(summary.newUsers)}</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="text-sm text-gray-500 font-semibold">Sesiones</div>
              <div className="text-3xl font-bold text-gray-800 mt-2">{fmtInt(summary.sessions)}</div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="text-sm text-gray-500 font-semibold">Tiempo promedio</div>
              <div className="text-3xl font-bold text-gray-800 mt-2">{fmtSec(summary.avgSessionDuration)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Usuarios nuevos vs recurrentes</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie data={newVsChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {newVsChart.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtInt(v)} />
                    <Legend />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Sexo</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie data={genderChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {genderChart.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtInt(v)} />
                    <Legend />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Edad</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageChart} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => fmtInt(v)} />
                    <Legend />
                    <Bar dataKey="value" name="Usuarios" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Dispositivo</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deviceChart} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sesiones" name="Sesiones" fill="#10B981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="usuarios" name="Usuarios" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Canal de ingreso</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelChart} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sesiones" name="Sesiones" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Plataforma</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={platformChart} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sesiones" name="Sesiones" fill="#06B6D4" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Ubicación (país y ciudad)</h3>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-2 pr-3">País</th>
                      <th className="py-2 pr-3">Ciudad</th>
                      <th className="py-2 text-right">Usuarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geo.slice(0, 20).map((r, idx) => (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="py-2 pr-3">{r.country || '-'}</td>
                        <td className="py-2 pr-3">{r.city || '-'}</td>
                        <td className="py-2 text-right font-semibold">{fmtInt(r.totalUsers)}</td>
                      </tr>
                    ))}
                    {geo.length === 0 ? (
                      <tr>
                        <td className="py-4 text-gray-500" colSpan={3}>
                          Sin datos
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Páginas visitadas</h3>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-2 pr-3">Título</th>
                      <th className="py-2 pr-3">Path</th>
                      <th className="py-2 text-right">Vistas</th>
                      <th className="py-2 text-right">Usuarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((r, idx) => (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="py-2 pr-3">{r.pageTitle || '-'}</td>
                        <td className="py-2 pr-3">{r.pagePathPlusQueryString || '-'}</td>
                        <td className="py-2 text-right font-semibold">{fmtInt(r.screenPageViews)}</td>
                        <td className="py-2 text-right font-semibold">{fmtInt(r.totalUsers)}</td>
                      </tr>
                    ))}
                    {pages.length === 0 ? (
                      <tr>
                        <td className="py-4 text-gray-500" colSpan={4}>
                          Sin datos
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Flujo de navegación (referrer → página)</h3>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-3">Referrer</th>
                    <th className="py-2 pr-3">Página</th>
                    <th className="py-2 text-right">Usuarios</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.slice(0, 30).map((r, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">{r.pageReferrer || '(direct)'}</td>
                      <td className="py-2 pr-3">{r.pagePathPlusQueryString || '-'}</td>
                      <td className="py-2 text-right font-semibold">{fmtInt(r.totalUsers)}</td>
                    </tr>
                  ))}
                  {flow.length === 0 ? (
                    <tr>
                      <td className="py-4 text-gray-500" colSpan={3}>
                        Sin datos
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'eventos' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Desde</label>
                  <input
                    type="date"
                    value={range.start}
                    onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))}
                    className="mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Hasta</label>
                  <input
                    type="date"
                    value={range.end}
                    onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
                    className="mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <button
                  onClick={fetchAll}
                  disabled={loadingData}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={`inline mr-2 ${loadingData ? 'animate-spin' : ''}`} />
                  {loadingData ? 'Actualizando...' : 'Actualizar'}
                </button>
                {canWrite ? (
                  <label className="flex items-center gap-2 text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded-lg bg-white select-none">
                    <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
                    Sin cache
                  </label>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {typeof lastCached === 'boolean' ? (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${lastCached ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {lastCached ? 'Cache' : 'Directo'}
                  </span>
                ) : null}
                {!config.propertyId || !config.hasCredentials ? (
                  <div className="text-sm text-red-600 font-semibold">
                    Falta configuración. Ve a Configuración y guarda Property ID + credenciales.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {Array.isArray(ga4Data?.warnings) && ga4Data.warnings.length ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
              {ga4Data.warnings.join(' | ')}
            </div>
          ) : null}

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Eventos (top)</h3>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-3">Evento</th>
                    <th className="py-2 text-right">Conteo</th>
                    <th className="py-2 text-right">Usuarios</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsSorted.slice(0, 50).map((r, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">{r.eventName || '-'}</td>
                      <td className="py-2 text-right font-semibold">{fmtInt(r.eventCount)}</td>
                      <td className="py-2 text-right font-semibold">{fmtInt(r.totalUsers)}</td>
                    </tr>
                  ))}
                  {eventsSorted.length === 0 ? (
                    <tr>
                      <td className="py-4 text-gray-500" colSpan={3}>
                        Sin datos
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'formularios' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Desde</label>
                  <input
                    type="date"
                    value={range.start}
                    onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))}
                    className="mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Hasta</label>
                  <input
                    type="date"
                    value={range.end}
                    onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
                    className="mt-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <button
                  onClick={fetchAll}
                  disabled={loadingData}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={`inline mr-2 ${loadingData ? 'animate-spin' : ''}`} />
                  {loadingData ? 'Actualizando...' : 'Actualizar'}
                </button>
                {canWrite ? (
                  <label className="flex items-center gap-2 text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded-lg bg-white select-none">
                    <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
                    Sin cache
                  </label>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {typeof lastCached === 'boolean' ? (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${lastCached ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {lastCached ? 'Cache' : 'Directo'}
                  </span>
                ) : null}
                {!config.propertyId || !config.hasCredentials ? (
                  <div className="text-sm text-red-600 font-semibold">
                    Falta configuración. Ve a Configuración y guarda Property ID + credenciales.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Formularios (inicio, envíos y abandono)</h3>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-3">Formulario</th>
                    <th className="py-2 text-right">Inicios</th>
                    <th className="py-2 text-right">Envíos</th>
                    <th className="py-2 text-right">Abandono</th>
                  </tr>
                </thead>
                <tbody>
                  {formsAgg.slice(0, 80).map((r, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">{r.formName || '-'}</td>
                      <td className="py-2 text-right font-semibold">{fmtInt(r.starts)}</td>
                      <td className="py-2 text-right font-semibold">{fmtInt(r.submits)}</td>
                      <td className="py-2 text-right font-semibold">{fmtInt(r.abandon)}</td>
                    </tr>
                  ))}
                  {formsAgg.length === 0 ? (
                    <tr>
                      <td className="py-4 text-gray-500" colSpan={4}>
                        Sin datos. Requiere eventos form_start y form_submit_success con parámetro form_name en GA4.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GA4Analytics;
