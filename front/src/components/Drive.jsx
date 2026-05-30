import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { API_URL } from '../api/config';
import { Folder, FileText, Upload, Plus, ChevronRight, Home, Eye, Download, Pencil, Trash2, X, Share2, UserPlus, Users, Search } from 'lucide-react';

const Drive = () => {
  const token = localStorage.getItem('token') || '';
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const [folderId, setFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadNames, setUploadNames] = useState({});
  const [uploading, setUploading] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameType, setRenameType] = useState('');
  const [renameId, setRenameId] = useState(0);
  const [renameValue, setRenameValue] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMime, setPreviewMime] = useState('');
  const [previewName, setPreviewName] = useState('');
  const [previewId, setPreviewId] = useState(0);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareType, setShareType] = useState('');
  const [shareId, setShareId] = useState(0);
  const [shareName, setShareName] = useState('');
  const [compartidos, setCompartidos] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searchingUser, setSearchingUser] = useState(false);

  const fetchCompartidos = async (type, id) => {
    try {
      const res = await axios.get(`${API_URL}drive.php`, { headers, params: { action: 'listar_compartidos', type, id, token } });
      setCompartidos(Array.isArray(res.data?.compartidos) ? res.data.compartidos : []);
    } catch {
      setCompartidos([]);
    }
  };

  const openShare = (type, item) => {
    setShareType(type);
    setShareId(Number(item?.id || 0));
    setShareName(String(item?.nombre || item?.nombre_original || ''));
    setUserSearch('');
    setUserResults([]);
    setShareOpen(true);
    fetchCompartidos(type, item?.id);
  };

  const searchUsers = async (q) => {
    const query = String(q || '').trim();
    setUserSearch(query);
    if (query.length < 2) {
      setUserResults([]);
      return;
    }
    setSearchingUser(true);
    try {
      const res = await axios.get(`${API_URL}drive.php`, { headers, params: { action: 'buscar_usuarios', q: query, token } });
      setUserResults(Array.isArray(res.data?.usuarios) ? res.data.usuarios : []);
    } catch {
      setUserResults([]);
    } finally {
      setSearchingUser(false);
    }
  };

  const doCompartir = async (usuarioId, nivel) => {
    if (!shareId || !usuarioId) return;
    try {
      await axios.post(`${API_URL}drive.php`, { type: shareType, id: shareId, usuario_id: usuarioId, nivel }, { headers, params: { action: 'compartir', token } });
      toast.success('Compartido');
      await fetchCompartidos(shareType, shareId);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Error al compartir');
    }
  };

  const doEliminarCompartido = async (compartidoId) => {
    if (!compartidoId) return;
    try {
      await axios.delete(`${API_URL}drive.php`, { headers, params: { action: 'eliminar_compartido', id: compartidoId, token } });
      toast.success('Acceso eliminado');
      await fetchCompartidos(shareType, shareId);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Error al quitar acceso');
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewMime('');
    setPreviewName('');
    setPreviewId(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
  };

  const normalizeBaseName = (name) => {
    const s = String(name || '').trim();
    const idx = s.lastIndexOf('.');
    return idx > 0 ? s.slice(0, idx) : s;
  };

  const fetchTree = async () => {
    try {
      const res = await axios.get(`${API_URL}drive.php`, { headers, params: { action: 'tree', token } });
      const rows = Array.isArray(res.data?.folders) ? res.data.folders : [];
      setTree(rows);
    } catch {
      setTree([]);
    }
  };

  const fetchList = async (fid) => {
    setLoading(true);
    try {
      const params = { action: 'list' };
      if (fid) params.folder_id = fid;
      const res = await axios.get(`${API_URL}drive.php`, { headers, params: { ...params, token } });
      setFolders(Array.isArray(res.data?.folders) ? res.data.folders : []);
      setFiles(Array.isArray(res.data?.files) ? res.data.files : []);
      setBreadcrumbs(Array.isArray(res.data?.breadcrumbs) ? res.data.breadcrumbs : []);
      setFolderId(res.data?.folder_id ?? null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Error al cargar documentos');
      setFolders([]);
      setFiles([]);
      setBreadcrumbs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
    fetchList(null);
  }, []);

  const openFolder = async (id) => {
    await fetchList(id || null);
  };

  const openRename = (type, item) => {
    setRenameType(type);
    setRenameId(Number(item?.id || 0));
    if (type === 'folder') setRenameValue(String(item?.nombre || ''));
    if (type === 'file') setRenameValue(String(item?.nombre || item?.nombre_original || ''));
    setRenameOpen(true);
  };

  const doRename = async () => {
    const id = Number(renameId || 0);
    const type = String(renameType || '');
    const name = String(renameValue || '').trim();
    if (!id || !name || (type !== 'folder' && type !== 'file')) return;
    try {
      await axios.put(`${API_URL}drive.php`, { id, type, name }, { headers, params: { action: 'rename', token } });
      toast.success(type === 'folder' ? 'Carpeta renombrada' : 'Archivo renombrado');
      setRenameOpen(false);
      setRenameId(0);
      setRenameType('');
      setRenameValue('');
      await fetchTree();
      await fetchList(folderId);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'No se pudo renombrar');
    }
  };

  const doCreateFolder = async () => {
    const name = String(newFolderName || '').trim();
    if (!name) return;
    try {
      await axios.post(`${API_URL}drive.php`, { parent_id: folderId || null, name }, { headers, params: { action: 'create_folder', token } });
      toast.success('Carpeta creada');
      setNewFolderOpen(false);
      setNewFolderName('');
      await fetchTree();
      await fetchList(folderId);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'No se pudo crear carpeta');
    }
  };

  const pickFiles = (filesList) => {
    const arr = Array.from(filesList || []);
    setUploadFiles(arr);
    const nextNames = {};
    arr.forEach((f, idx) => {
      nextNames[idx] = normalizeBaseName(f.name);
    });
    setUploadNames(nextNames);
  };

  const doUpload = async () => {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      if (folderId) fd.append('folder_id', String(folderId));
      uploadFiles.forEach((f) => fd.append('files[]', f));
      uploadFiles.forEach((_, idx) => fd.append('names[]', String(uploadNames[idx] || '').trim()));
      const res = await axios.post(`${API_URL}drive.php`, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
        params: { action: 'upload', token },
      });
      const uploaded = Number(res.data?.uploaded || 0);
      toast.success(uploaded > 0 ? `Subidos: ${uploaded}` : 'Subida completada');
      setUploadOpen(false);
      setUploadFiles([]);
      setUploadNames({});
      await fetchTree();
      await fetchList(folderId);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Error al subir archivos');
    } finally {
      setUploading(false);
    }
  };

  const doDelete = async (type, item) => {
    const id = Number(item?.id || 0);
    if (!id) return;
    const ok = window.confirm(type === 'folder' ? '¿Eliminar carpeta?' : '¿Eliminar archivo?');
    if (!ok) return;
    try {
      await axios.delete(`${API_URL}drive.php`, {
        headers,
        params: { action: 'delete', type, id, token },
      });
      toast.success('Eliminado');
      await fetchTree();
      await fetchList(folderId);
    } catch (e) {
      const needsForce = Boolean(e?.response?.data?.needs_force);
      if (needsForce) {
        const forceOk = window.confirm('La carpeta no está vacía. ¿Eliminar todo dentro?');
        if (!forceOk) return;
        try {
          await axios.delete(`${API_URL}drive.php`, {
            headers,
            params: { action: 'delete', type, id, force: 1, token },
          });
          toast.success('Carpeta eliminada');
          await fetchTree();
          await fetchList(folderId);
          return;
        } catch (e2) {
          toast.error(e2?.response?.data?.message || 'No se pudo eliminar');
          return;
        }
      }
      toast.error(e?.response?.data?.message || 'No se pudo eliminar');
    }
  };

  const openPreview = async (file) => {
    const id = Number(file?.id || 0);
    if (!id) return;
    setPreviewId(id);
    setPreviewName(String(file?.nombre || file?.nombre_original || 'Documento'));
    setPreviewLoading(true);
    try {
      const res = await axios.get(`${API_URL}drive.php`, {
        headers,
        params: { action: 'file', id, token },
        responseType: 'blob',
      });
      const mime = String(res.headers?.['content-type'] || '').split(';')[0].trim();
      const url = URL.createObjectURL(res.data);
      setPreviewMime(mime);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'No se pudo abrir la vista previa');
      closePreview();
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFile = async (file) => {
    const id = Number(file?.id || 0);
    if (!id) return;
    try {
      const res = await axios.get(`${API_URL}drive.php`, {
        headers,
        params: { action: 'file', id, download: 1, token },
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      const base = String(file?.nombre || file?.nombre_original || 'archivo').trim() || 'archivo';
      const ext = String(file?.ext || '').trim();
      a.download = ext && !base.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${base}.${ext}` : base;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'No se pudo descargar');
    }
  };

  const folderChildren = useMemo(() => {
    const map = new Map();
    tree.forEach((f) => {
      const pid = f.parent_id === null || f.parent_id === undefined ? null : Number(f.parent_id);
      const arr = map.get(pid) || [];
      arr.push({ id: Number(f.id), nombre: String(f.nombre || '') });
      map.set(pid, arr);
    });
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
      map.set(k, arr);
    }
    return map;
  }, [tree]);

  const TreeNode = ({ id, depth }) => {
    const children = folderChildren.get(id) || [];
    return (
      <div className="space-y-1">
        {children.map((c) => (
          <div key={c.id} className="group">
            <div
              className={`flex w-full items-center justify-between rounded-lg pr-1 text-sm hover:bg-gray-100 ${
                Number(folderId || 0) === c.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              title={c.nombre}
            >
              <button type="button" onClick={() => openFolder(c.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left">
                <Folder size={16} className="shrink-0 text-amber-500" />
                <span className="truncate">{c.nombre}</span>
              </button>

              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  className="rounded-lg p-1.5 hover:bg-white"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openRename('folder', c);
                  }}
                  title="Editar"
                  aria-label="Editar"
                >
                  <Pencil size={14} className="text-gray-700" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 hover:bg-white"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openShare('folder', c);
                  }}
                  title="Compartir"
                >
                  <Share2 size={14} className="text-gray-700" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 hover:bg-white"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    doDelete('folder', c);
                  }}
                  title="Eliminar"
                  aria-label="Eliminar"
                >
                  <Trash2 size={14} className="text-red-600" />
                </button>
              </div>
            </div>
            <TreeNode id={c.id} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drive (Documentos)</h1>
          <p className="mt-1 text-sm text-gray-500">Crea carpetas, sube archivos, asigna nombres y visualiza vista previa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setNewFolderOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
          >
            <Plus size={16} />
            Nueva carpeta
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Upload size={16} />
            Subir
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-gray-800">Carpetas</div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                onClick={() => openFolder(null)}
              >
                <span className="inline-flex items-center gap-1">
                  <Home size={14} />
                  Inicio
                </span>
              </button>
            </div>
            <div className="space-y-1">
              <TreeNode id={null} depth={0} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-9">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => openFolder(null)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-gray-700 hover:bg-gray-100"
              >
                <Home size={14} />
                Inicio
              </button>
              {breadcrumbs.map((b) => (
                <div key={b.id} className="inline-flex items-center gap-2">
                  <ChevronRight size={14} className="text-gray-400" />
                  <button
                    type="button"
                    onClick={() => openFolder(b.id)}
                    className="rounded-lg px-2 py-1 font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    {b.nombre}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="rounded-xl bg-gray-50 p-6 text-sm font-semibold text-gray-600">Cargando...</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {folders.map((f) => (
                    <div key={`f-${f.id}`} className="group rounded-xl border border-gray-200 bg-white p-3 hover:border-blue-200 hover:bg-blue-50/20">
                      <button type="button" onClick={() => openFolder(f.id)} className="w-full text-left">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-lg bg-amber-50 p-2">
                            <Folder size={18} className="text-amber-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-gray-900">{f.nombre}</div>
                            <div className="mt-1 text-xs text-gray-500">Carpeta</div>
                          </div>
                        </div>
                      </button>
                      <div className="mt-2 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => openShare('folder', f)} title="Compartir">
                          <Share2 size={16} className="text-gray-700" />
                        </button>
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => openRename('folder', f)} title="Renombrar">
                          <Pencil size={16} className="text-gray-700" />
                        </button>
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => doDelete('folder', f)} title="Eliminar">
                          <Trash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {files.map((d) => (
                    <div key={`d-${d.id}`} className="group rounded-xl border border-gray-200 bg-white p-3 hover:border-blue-200 hover:bg-blue-50/20">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-gray-50 p-2">
                          <FileText size={18} className="text-gray-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-gray-900">{d.nombre || d.nombre_original || 'Archivo'}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {d.ext ? d.ext.toUpperCase() : 'Archivo'} {d.size_bytes ? `• ${Math.round(Number(d.size_bytes) / 1024)} KB` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => openPreview(d)} title="Vista previa">
                          <Eye size={16} className="text-gray-700" />
                        </button>
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => downloadFile(d)} title="Descargar">
                          <Download size={16} className="text-gray-700" />
                        </button>
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => openShare('file', d)} title="Compartir">
                          <Share2 size={16} className="text-gray-700" />
                        </button>
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => openRename('file', d)} title="Renombrar">
                          <Pencil size={16} className="text-gray-700" />
                        </button>
                        <button type="button" className="rounded-lg p-2 hover:bg-white" onClick={() => doDelete('file', d)} title="Eliminar">
                          <Trash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {folders.length === 0 && files.length === 0 ? (
                    <div className="rounded-xl bg-gray-50 p-6 text-sm font-semibold text-gray-600 md:col-span-2 xl:col-span-3">
                      Esta carpeta está vacía.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {newFolderOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold text-gray-900">Nueva carpeta</div>
                <div className="mt-1 text-sm text-gray-500">Crea una carpeta dentro de la ubicación actual.</div>
              </div>
              <button type="button" onClick={() => setNewFolderOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4">
              <label className="text-sm font-semibold text-gray-700">Nombre</label>
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Ej: Contratos 2026"
                autoFocus
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(false)}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={doCreateFolder}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-700"
                >
                  Crear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl ring-1 ring-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold text-gray-900">Subir archivos</div>
                <div className="mt-1 text-sm text-gray-500">Asigna un nombre y sube uno o más archivos.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (uploading) return;
                  setUploadOpen(false);
                  setUploadFiles([]);
                  setUploadNames({});
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
              <input
                type="file"
                multiple
                onChange={(e) => pickFiles(e.target.files)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-bold file:text-gray-700 file:ring-1 file:ring-gray-200 hover:file:bg-gray-100"
              />
              <div className="mt-2 text-xs text-gray-500">PDF, imágenes, Office, ZIP/RAR (máx 20MB por archivo)</div>
            </div>

            {uploadFiles.length > 0 ? (
              <div className="mt-4 space-y-3">
                {uploadFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-gray-900">{f.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{Math.round(f.size / 1024)} KB</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="text-xs font-semibold text-gray-700">Nombre a mostrar</label>
                      <input
                        value={uploadNames[idx] ?? ''}
                        onChange={(e) => setUploadNames((p) => ({ ...p, [idx]: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Ej: Contrato Juan Pérez"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (uploading) return;
                  setUploadOpen(false);
                  setUploadFiles([]);
                  setUploadNames({});
                }}
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                disabled={uploading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doUpload}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={uploading || uploadFiles.length === 0}
              >
                {uploading ? 'Subiendo...' : 'Subir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-extrabold text-gray-900">Renombrar</div>
              <button type="button" onClick={() => setRenameOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4">
              <label className="text-sm font-semibold text-gray-700">Nuevo nombre</label>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameOpen(false)}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={doRename}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl ring-1 ring-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold text-gray-900">{previewName}</div>
                <div className="mt-1 text-sm text-gray-500">{previewMime || 'Documento'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                  onClick={() => downloadFile({ id: previewId, nombre: previewName })}
                >
                  <span className="inline-flex items-center gap-2">
                    <Download size={16} />
                    Descargar
                  </span>
                </button>
                <button type="button" onClick={closePreview} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Cerrar">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-4">
              {previewLoading ? (
                <div className="rounded-xl bg-gray-50 p-6 text-sm font-semibold text-gray-600">Cargando vista previa...</div>
              ) : previewUrl ? (
                previewMime.startsWith('image/') ? (
                  <div className="grid place-items-center rounded-xl bg-gray-50 p-4">
                    <img src={previewUrl} alt={previewName} className="max-h-[70vh] w-auto rounded-lg shadow" />
                  </div>
                ) : previewMime === 'application/pdf' ? (
                  <iframe title={previewName} src={previewUrl} className="h-[70vh] w-full rounded-xl border border-gray-200" />
                ) : (
                  <div className="rounded-xl bg-gray-50 p-6 text-sm text-gray-700">
                    Vista previa no disponible para este tipo de archivo. Usa Descargar.
                  </div>
                )
              ) : (
                <div className="rounded-xl bg-gray-50 p-6 text-sm text-gray-700">Vista previa no disponible.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl ring-1 ring-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
                  <Share2 size={18} /> Compartir
                </div>
                <div className="mt-1 text-sm text-gray-500 line-clamp-1">{shareName}</div>
              </div>
              <button type="button" onClick={() => setShareOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              <label className="text-sm font-semibold text-gray-700">Buscar usuario</label>
              <div className="relative mt-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={userSearch}
                  onChange={(e) => searchUsers(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Mínimo 2 caracteres..."
                  autoFocus
                />
              </div>

              {searchingUser && <div className="mt-2 text-xs text-gray-500">Buscando...</div>}

              {userResults.length > 0 && (
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2">
                  {userResults.map((u) => (
                    <div key={u.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{u.nombre_real || u.usuario}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          defaultValue="lectura"
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none"
                          onChange={(e) => {
                            const sel = e.target;
                            doCompartir(u.id, sel.value);
                            sel.value = 'lectura';
                          }}
                        >
                          <option value="lectura">Lectura</option>
                          <option value="escritura">Escritura</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => doCompartir(u.id, 'lectura')}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <UserPlus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <Users size={16} /> Usuarios con acceso
              </div>
              {compartidos.length === 0 ? (
                <div className="mt-2 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Sin compartir</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {compartidos.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">{c.nombre_real || c.usuario || `ID: ${c.usuario_id}`}</div>
                        <div className="text-xs text-gray-500 capitalize">{c.nivel}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => doEliminarCompartido(c.id)}
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                        title="Quitar acceso"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Drive;
