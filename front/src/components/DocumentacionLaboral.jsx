import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  FileText, Folder, Upload, Trash2, Download, 
  AlertTriangle, Calendar, Search, Filter, ArrowLeft, Users
} from 'lucide-react';

import { API_URL } from '../api/config';

const DocumentacionLaboral = () => {
  const [viewMode, setViewMode] = useState('folders'); // folders, files
  const [documents, setDocuments] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Selected Context
  const [selectedColab, setSelectedColab] = useState(null);

  // Filters (for files view)
  const [selectedType, setSelectedType] = useState('');
  const [showExpired, setShowExpired] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    colaborador_id: '',
    tipo_documento: 'Contrato',
    fecha_vencimiento: '',
    comentario: '',
    files: [] // Changed from single file to array
  });

  useEffect(() => {
    fetchColaboradores();
  }, []);

  useEffect(() => {
    if (viewMode === 'files' && selectedColab) {
      fetchDocuments(selectedColab.id);
    }
  }, [viewMode, selectedColab, selectedType, showExpired]);

  const fetchColaboradores = async () => {
    try {
      const res = await axios.get(`${API_URL}/colaboradores.php`);
      setColaboradores(res.data.data || []);
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  const fetchDocuments = async (colabId) => {
    setLoading(true);
    try {
      let url = `${API_URL}/documentacion.php?colaborador_id=${colabId}&`;
      if (selectedType) url += `type=${selectedType}&`;
      if (showExpired) url += `alerts=true&`;
      
      const res = await axios.get(url);
      setDocuments(res.data);
    } catch (error) {
      toast.error('Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (colab) => {
    setSelectedColab(colab);
    setViewMode('files');
    // Pre-fill upload form with this colab
    setUploadForm(prev => ({ ...prev, colaborador_id: colab.id }));
  };

  const handleBackToFolders = () => {
    setViewMode('folders');
    setSelectedColab(null);
    setDocuments([]);
    setUploadForm(prev => ({ ...prev, colaborador_id: '' }));
  };

  const handleFileChange = (e) => {
    setUploadForm({ ...uploadForm, files: Array.from(e.target.files) });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (uploadForm.files.length === 0 || !uploadForm.colaborador_id) {
      toast.error('Complete los campos obligatorios');
      return;
    }

    const formData = new FormData();
    formData.append('colaborador_id', uploadForm.colaborador_id);
    formData.append('tipo_documento', uploadForm.tipo_documento);
    formData.append('fecha_vencimiento', uploadForm.fecha_vencimiento);
    formData.append('comentario', uploadForm.comentario);
    
    // Append multiple files
    uploadForm.files.forEach((file) => {
        formData.append('files[]', file);
    });

    try {
      await axios.post(`${API_URL}documentacion.php`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Documentos subidos correctamente');
      setShowUploadModal(false);
      setUploadForm({
        colaborador_id: selectedColab ? selectedColab.id : '',
        tipo_documento: 'Contrato',
        fecha_vencimiento: '',
        comentario: '',
        files: []
      });
      
      if (viewMode === 'files' && selectedColab) {
        fetchDocuments(selectedColab.id);
      }
    } catch (error) {
      toast.error('Error al subir documento');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este documento?')) return;
    try {
      await axios.delete(`${API_URL}documentacion.php?id=${id}`);
      toast.success('Documento eliminado');
      if (selectedColab) fetchDocuments(selectedColab.id);
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date();
    const expiry = new Date(dateStr);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 30 && diffDays >= 0;
  };

  const isExpired = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  // Filter collaborators for folder view
  const filteredColaboradores = collaborators => {
    if (!searchTerm) return collaborators;
    const lower = searchTerm.toLowerCase();
    return collaborators.filter(c => 
      c.nombres.toLowerCase().includes(lower) || 
      c.apellidos.toLowerCase().includes(lower) ||
      c.documento_numero.includes(lower)
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          {viewMode === 'files' && (
            <button 
              onClick={handleBackToFolders}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft size={24} className="text-gray-600" />
            </button>
          )}
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {viewMode === 'folders' ? 'Documentación Laboral' : `Carpeta: ${selectedColab?.apellidos}, ${selectedColab?.nombres}`}
            </h2>
            <p className="text-gray-600">
              {viewMode === 'folders' ? 'Seleccione un colaborador para ver sus documentos' : `DNI: ${selectedColab?.documento_numero}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm"
        >
          <Upload size={20} className="mr-2" />
          Subir Documentos
        </button>
      </div>

      {/* Main Content */}
      {viewMode === 'folders' ? (
        // FOLDERS VIEW
        <>
          <div className="relative">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
             <input 
                type="text"
                placeholder="Buscar colaborador..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredColaboradores(colaboradores).map(colab => (
              <div 
                key={colab.id}
                onClick={() => handleFolderClick(colab)}
                className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <Folder size={32} />
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-semibold text-gray-800 truncate">{colab.apellidos}, {colab.nombres}</h3>
                    <p className="text-sm text-gray-500">{colab.documento_numero}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {colaboradores.length === 0 && !loading && (
               <div className="col-span-full text-center py-10 text-gray-500">No hay colaboradores registrados.</div>
            )}
          </div>
        </>
      ) : (
        // FILES VIEW
        <>
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl shadow-sm flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
                <Filter size={18} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Filtrar:</span>
            </div>
            <select 
              className="rounded-md border border-gray-300 p-2 text-sm"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">Todos los Tipos</option>
              <option value="Contrato">Contratos</option>
              <option value="Boleta">Boletas de Pago</option>
              <option value="DNI">DNI</option>
              <option value="Certificado">Certificados</option>
              <option value="Otro">Otros</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={showExpired}
                onChange={(e) => setShowExpired(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              Mostrar Vencimientos Próximos
            </label>
          </div>

          {/* Documents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow p-5 flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div className={`p-2 rounded-lg ${
                    doc.tipo_documento === 'Contrato' ? 'bg-blue-100 text-blue-600' :
                    doc.tipo_documento === 'Boleta' ? 'bg-green-100 text-green-600' :
                    doc.tipo_documento === 'DNI' ? 'bg-purple-100 text-purple-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    <FileText size={24} />
                  </div>
                  <div className="flex gap-2">
                    <a 
                      href={`${API_URL.replace('/api', '')}${doc.url}`} 
                      target="_blank"  
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      title="Descargar/Ver"
                    >
                      <Download size={18} />
                    </a>
                    <button 
                      onClick={() => handleDelete(doc.id)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <h3 className="font-semibold text-gray-800 truncate" title={doc.nombre_archivo}>
                  {doc.tipo_documento}
                </h3>
                <p className="text-xs text-gray-400 mb-4 break-all truncate">
                  {doc.nombre_archivo}
                </p>

                {doc.fecha_vencimiento && (
                  <div className={`mt-auto text-xs font-medium px-2 py-1 rounded-md inline-flex items-center gap-1 w-fit
                    ${isExpired(doc.fecha_vencimiento) ? 'bg-red-100 text-red-700' : 
                      isExpiringSoon(doc.fecha_vencimiento) ? 'bg-yellow-100 text-yellow-700' : 
                      'bg-gray-100 text-gray-600'}
                  `}>
                    <Calendar size={12} />
                    Vence: {doc.fecha_vencimiento}
                    {isExpiringSoon(doc.fecha_vencimiento) && <AlertTriangle size={12} className="ml-1" />}
                  </div>
                )}
                {!doc.fecha_vencimiento && (
                   <div className="mt-auto text-xs text-gray-400">Sin vencimiento</div>
                )}
                
                <div className="text-[10px] text-gray-400 mt-2 text-right">
                  Subido: {new Date(doc.fecha_carga).toLocaleDateString()}
                </div>
              </div>
            ))}
            
            {documents.length === 0 && !loading && (
              <div className="col-span-full py-12 text-center text-gray-400">
                <FileText size={48} className="mx-auto mb-3 opacity-20" />
                <p>No hay documentos en esta carpeta</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-lg">
            <h3 className="text-lg font-bold mb-4">Subir Documentos</h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Colaborador</label>
                <select 
                  className="mt-1 block w-full rounded-md border border-gray-300 p-2"
                  required
                  value={uploadForm.colaborador_id}
                  onChange={(e) => setUploadForm({...uploadForm, colaborador_id: e.target.value})}
                  disabled={!!selectedColab && viewMode === 'files'} // Lock if inside a folder
                >
                  <option value="">Seleccione...</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo Documento</label>
                <select 
                  className="mt-1 block w-full rounded-md border border-gray-300 p-2"
                  value={uploadForm.tipo_documento}
                  onChange={(e) => setUploadForm({...uploadForm, tipo_documento: e.target.value})}
                >
                  <option value="Contrato">Contrato</option>
                  <option value="Boleta">Boleta de Pago</option>
                  <option value="DNI">DNI</option>
                  <option value="Certificado">Certificado</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha Vencimiento (Opcional)</label>
                <input 
                  type="date"
                  className="mt-1 block w-full rounded-md border border-gray-300 p-2"
                  value={uploadForm.fecha_vencimiento}
                  onChange={(e) => setUploadForm({...uploadForm, fecha_vencimiento: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Archivos</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                        <span>Seleccionar archivos</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple onChange={handleFileChange} required />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      {uploadForm.files.length > 0 ? `${uploadForm.files.length} archivos seleccionados` : 'Puede seleccionar múltiples archivos'}
                    </p>
                  </div>
                </div>
                {uploadForm.files.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 max-h-20 overflow-y-auto">
                        {uploadForm.files.map((f, i) => (
                            <div key={i} className="truncate">• {f.name}</div>
                        ))}
                    </div>
                )}
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-700">Comentario</label>
                 <textarea 
                    className="mt-1 block w-full rounded-md border border-gray-300 p-2"
                    rows="2"
                    value={uploadForm.comentario}
                    onChange={(e) => setUploadForm({...uploadForm, comentario: e.target.value})}
                 ></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-gray-600">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Subir</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentacionLaboral;
