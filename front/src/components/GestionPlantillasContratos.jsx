import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';
import { 
  FileText, Plus, Edit, Trash2, Save, X, ArrowUp, ArrowDown, Layout
} from 'lucide-react';

const GestionPlantillasContratos = () => {
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showForm, setShowForm] = useState(false); // For new template
  const [newTemplateData, setNewTemplateData] = useState({ nombre: '', tipo_contrato: 'Plazo Fijo', descripcion: '' });

  useEffect(() => {
    fetchPlantillas();
  }, []);

  const fetchPlantillas = async () => {
    try {
      const response = await axios.get(`${API_URL}plantillas_contratos.php`);
      setPlantillas(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("Error al cargar plantillas");
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateData.nombre) return toast.error("Nombre requerido");
    try {
      await axios.post(`${API_URL}plantillas_contratos.php?action=create_template`, newTemplateData);
      toast.success("Plantilla creada");
      setShowForm(false);
      setNewTemplateData({ nombre: '', tipo_contrato: 'Plazo Fijo', descripcion: '' });
      fetchPlantillas();
    } catch (error) {
      toast.error("Error al crear plantilla");
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm("¿Seguro que desea eliminar esta plantilla?")) return;
    try {
      await axios.delete(`${API_URL}plantillas_contratos.php?id=${id}`);
      toast.success("Plantilla eliminada");
      if (editingTemplate?.id === id) setEditingTemplate(null);
      fetchPlantillas();
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Layout size={20} /> Plantillas de Contrato
        </h2>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Nueva Plantilla
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-bold mb-3">Nueva Plantilla</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <input 
                    type="text" 
                    placeholder="Nombre de la plantilla" 
                    className="border p-2 rounded w-full"
                    value={newTemplateData.nombre}
                    onChange={e => setNewTemplateData({...newTemplateData, nombre: e.target.value})}
                />
                <select 
                    className="border p-2 rounded w-full"
                    value={newTemplateData.tipo_contrato}
                    onChange={e => setNewTemplateData({...newTemplateData, tipo_contrato: e.target.value})}
                >
                    <option value="Plazo Fijo">Plazo Fijo / Determinado</option>
                    <option value="Indefinido">Indefinido</option>
                    <option value="Locación de Servicios">Locación de Servicios</option>
                    <option value="Prácticas">Prácticas</option>
                </select>
                <input 
                    type="text" 
                    placeholder="Descripción breve" 
                    className="border p-2 rounded w-full"
                    value={newTemplateData.descripcion}
                    onChange={e => setNewTemplateData({...newTemplateData, descripcion: e.target.value})}
                />
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-3 py-1 text-gray-600 hover:bg-gray-200 rounded">Cancelar</button>
                <button onClick={handleCreateTemplate} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Guardar</button>
            </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar List */}
        <div className="border-r pr-4">
            <div className="space-y-2">
                {plantillas.map(p => (
                    <div 
                        key={p.id}
                        onClick={() => setEditingTemplate(p)}
                        className={`p-3 rounded-lg cursor-pointer flex justify-between items-center group ${editingTemplate?.id === p.id ? 'bg-blue-50 border-blue-200 border' : 'hover:bg-gray-50 border border-transparent'}`}
                    >
                        <div>
                            <div className="font-medium text-gray-800">{p.nombre}</div>
                            <div className="text-xs text-gray-500">{p.tipo_contrato}</div>
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(p.id); }}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* Editor Area */}
        <div className="col-span-2">
            {editingTemplate ? (
                <TemplateEditor templateId={editingTemplate.id} key={editingTemplate.id} />
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Layout size={48} className="mb-2 opacity-20" />
                    <p>Selecciona una plantilla para editar sus secciones</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const TemplateEditor = ({ templateId }) => {
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingSection, setEditingSection] = useState(null); // ID or null
    const [formData, setFormData] = useState({ titulo: '', contenido: '', orden: 0 });

    useEffect(() => {
        fetchSections();
    }, [templateId]);

    const fetchSections = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_URL}plantillas_contratos.php?id=${templateId}`);
            setSections(response.data.secciones || []);
        } catch (error) {
            toast.error("Error al cargar secciones");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSection = async () => {
        if (!formData.titulo) return toast.error("Título requerido");
        
        try {
            if (editingSection === 'new') {
                const maxOrder = sections.length > 0 ? Math.max(...sections.map(s => s.orden)) : 0;
                await axios.post(`${API_URL}plantillas_contratos.php?action=create_section`, {
                    ...formData,
                    plantilla_id: templateId,
                    orden: maxOrder + 1
                });
                toast.success("Sección agregada");
            } else {
                await axios.post(`${API_URL}plantillas_contratos.php?action=update_section`, {
                    ...formData,
                    id: editingSection
                });
                toast.success("Sección actualizada");
            }
            setEditingSection(null);
            fetchSections();
        } catch (error) {
            toast.error("Error al guardar sección");
        }
    };

    const handleDeleteSection = async (id) => {
        if (!window.confirm("¿Eliminar esta sección?")) return;
        try {
            await axios.delete(`${API_URL}plantillas_contratos.php?action=delete_section&id=${id}`);
            toast.success("Sección eliminada");
            fetchSections();
        } catch (error) {
            toast.error("Error al eliminar");
        }
    };

    const startEdit = (section) => {
        setEditingSection(section.id);
        setFormData({ titulo: section.titulo, contenido: section.contenido, orden: section.orden });
    };

    const startNew = () => {
        setEditingSection('new');
        setFormData({ titulo: '', contenido: '', orden: 0 });
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-700">Secciones del Contrato</h3>
                <button onClick={startNew} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
                    <Plus size={14} /> Añadir Sección
                </button>
            </div>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {editingSection === 'new' && (
                    <SectionForm 
                        data={formData} 
                        onChange={setFormData} 
                        onSave={handleSaveSection} 
                        onCancel={() => setEditingSection(null)} 
                    />
                )}

                {sections.map(section => (
                    <div key={section.id} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow transition-shadow">
                        {editingSection === section.id ? (
                            <SectionForm 
                                data={formData} 
                                onChange={setFormData} 
                                onSave={handleSaveSection} 
                                onCancel={() => setEditingSection(null)} 
                            />
                        ) : (
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-800">{section.titulo}</h4>
                                    <div className="flex gap-1">
                                        <button onClick={() => startEdit(section)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                                            <Edit size={16} />
                                        </button>
                                        <button onClick={() => handleDeleteSection(section.id)} className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div 
                                    className="text-sm text-gray-600 bg-gray-50 p-3 rounded border"
                                    dangerouslySetInnerHTML={{ __html: section.contenido }}
                                />
                            </div>
                        )}
                    </div>
                ))}

                {sections.length === 0 && !editingSection && (
                    <div className="text-center py-8 text-gray-400 bg-gray-50 rounded border border-dashed">
                        No hay secciones definidas
                    </div>
                )}
            </div>
            
            <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200">
                <strong>Variables disponibles:</strong> {"{{NOMBRE_COLABORADOR}}, {{DNI_COLABORADOR}}, {{DIRECCION_COLABORADOR}}, {{CARGO_COLABORADOR}}, {{AREA_COLABORADOR}}, {{SALARIO}}, {{FECHA_INICIO}}, {{FECHA_FIN}}, {{TITULO_CONTRATO}}, {{DENOMINACION_EMPLEADOR}}, {{DENOMINACION_COLABORADOR}}, {{NOMBRE_GERENTE}}"}
            </div>
        </div>
    );
};

const SectionForm = ({ data, onChange, onSave, onCancel }) => {
    return (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-4">
            <div className="mb-3">
                <label className="block text-xs font-bold text-gray-700 mb-1">Título de la Cláusula</label>
                <input 
                    type="text" 
                    className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={data.titulo}
                    onChange={e => onChange({...data, titulo: e.target.value})}
                    placeholder="Ej. PRIMERA: DEL EMPLEADOR"
                />
            </div>
            <div className="mb-3">
                <label className="block text-xs font-bold text-gray-700 mb-1">Contenido (HTML permitido)</label>
                <textarea 
                    className="w-full border p-2 rounded text-sm h-32 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    value={data.contenido}
                    onChange={e => onChange({...data, contenido: e.target.value})}
                    placeholder="Contenido de la cláusula..."
                />
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1 text-gray-600 hover:bg-gray-200 rounded text-sm">Cancelar</button>
                <button onClick={onSave} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center gap-1">
                    <Save size={14} /> Guardar
                </button>
            </div>
        </div>
    );
};

export default GestionPlantillasContratos;