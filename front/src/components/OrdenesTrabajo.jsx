import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { API_URL } from '../api/config';
import { ClipboardList, Plus, Search, CheckCircle, Edit2, Trash2, X, AlertTriangle, User, Calendar, DollarSign, Briefcase, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const getBase64ImageFromURL = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', 'anonymous');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/png');
      resolve(dataURL);
    };
    img.onerror = error => {
      reject(error);
    };
    img.src = url;
  });
};

const OrdenesTrabajo = () => {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    fecha_inicio: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()).substring(0, 8) + '01',
    fecha_fin: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
    estado: ''
  });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [ordenToDelete, setOrdenToDelete] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const initialForm = {
    id: null,
    titulo: '',
    descripcion: '',
    fecha: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date()),
    prioridad: 'Media',
    responsable_id: '',
    area: '',
    solicitante_nombre: '',
    solicitante_dni: '',
    solicitante_cargo: '',
    lugar_trabajo: '',
    inicio: '',
    fin: '',
    costo_estimado: 0,
    costo_real: 0,
    tareas: []
  };
  const [areas, setAreas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [formData, setFormData] = useState(initialForm);
  const [tareaTemp, setTareaTemp] = useState({ descripcion: '', detalles: '', encargado_id: '', fecha_limite: '', estado: 'Pendiente' });
  
  // Factura Search States
  const [facturaBusqueda, setFacturaBusqueda] = useState('');
  const [facturasEncontradas, setFacturasEncontradas] = useState([]);
  const [buscandoFactura, setBuscandoFactura] = useState(false);
  const [showFacturaDropdown, setShowFacturaDropdown] = useState(false);
  const searchWrapperRef = useRef(null);

  // Client Search States
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const clientSearchWrapperRef = useRef(null);

  useEffect(() => {
    fetchOrdenes();
    fetchAreas();
    fetchUsuarios();
  }, [filters]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setShowFacturaDropdown(false);
      }
      if (clientSearchWrapperRef.current && !clientSearchWrapperRef.current.contains(event.target)) {
        setShowClienteDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounce search Factura
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (facturaBusqueda.length > 2) {
        buscarFacturas();
      } else {
        setFacturasEncontradas([]);
        setShowFacturaDropdown(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [facturaBusqueda]);

  // Debounce search Cliente
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (clienteBusqueda.length > 2) {
        buscarClientes();
      } else {
        setClientesEncontrados([]);
        setShowClienteDropdown(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [clienteBusqueda]);

  const fetchAreas = async () => {
    try {
      const res = await axios.get(`${API_URL}areas.php`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // The API returns { success: true, data: [...] }
      const data = res.data;
      if (Array.isArray(data)) {
        setAreas(data);
      } else if (data && data.data && Array.isArray(data.data)) {
        setAreas(data.data);
      } else {
        setAreas([]);
      }
    } catch (e) {
      console.error('Error cargando áreas');
    }
  };

  const fetchUsuarios = async () => {
    try {
      const res = await axios.get(`${API_URL}usuarios.php`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // La API devuelve { users: [...], roles: [...] }
      setUsuarios(Array.isArray(res.data.users) ? res.data.users : []);
    } catch (e) {
      console.error('Error cargando usuarios');
    }
  };

  const fetchOrdenes = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}ordenes_trabajo.php`, {
        params: filters,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setOrdenes(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      toast.error('Error al cargar órdenes');
      setOrdenes([]);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormData(initialForm);
    setFacturaBusqueda('');
    setFacturasEncontradas([]);
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = async (orden) => {
    setIsEditing(true);
    // Cargar detalles completos si es necesario o usar datos ya disponibles
    try {
        const res = await axios.get(`${API_URL}ordenes_trabajo.php?id=${orden.id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const data = res.data;
        setFormData({
            id: data.id,
            titulo: data.titulo,
            descripcion: data.descripcion,
            fecha: data.fecha,
            prioridad: data.prioridad,
            responsable_id: data.responsable_id || '',
            area: data.area || '',
            solicitante_nombre: data.solicitante_nombre || '',
            solicitante_dni: data.solicitante_dni || '',
            solicitante_cargo: data.solicitante_cargo || '',
            lugar_trabajo: data.lugar_trabajo || '',
            inicio: data.inicio || '',
            fin: data.fin || '',
            costo_estimado: data.costo_estimado || 0,
            costo_real: data.costo_real || 0,
            tareas: data.tareas || []
        });
        setIsModalOpen(true);
    } catch (error) {
        toast.error("Error al cargar detalles de la orden");
    }
  };

  const openDeleteModal = (orden) => {
    setOrdenToDelete(orden);
    setIsDeleteModalOpen(true);
  };

  const addTarea = () => {
    if (!tareaTemp.descripcion) return;
    setFormData({ ...formData, tareas: [...formData.tareas, tareaTemp] });
    setTareaTemp({ descripcion: '', detalles: '', encargado_id: '', fecha_limite: '', estado: 'Pendiente' });
  };

  const removeTarea = (index) => {
    const newTareas = [...formData.tareas];
    newTareas.splice(index, 1);
    setFormData({ ...formData, tareas: newTareas });
  };

  const submitOrden = async (e) => {
    e.preventDefault();
    try {
      let res;
      if (isEditing) {
          // Update
          res = await axios.put(`${API_URL}ordenes_trabajo.php?id=${formData.id}`, {
              action: 'actualizar',
              ...formData
          }, {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
      } else {
          // Create
          res = await axios.post(`${API_URL}ordenes_trabajo.php`, formData, {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
      }

      if (res.data?.success) {
        toast.success(isEditing ? 'Orden actualizada' : 'Orden creada');
        setIsModalOpen(false);
        fetchOrdenes();
      } else {
        toast.error('Error al guardar orden');
      }
    } catch (e) {
      toast.error('Error al guardar orden');
    }
  };

  const confirmDelete = async () => {
    if (!ordenToDelete) return;
    try {
        await axios.delete(`${API_URL}ordenes_trabajo.php?id=${ordenToDelete.id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        toast.success('Orden eliminada correctamente');
        setIsDeleteModalOpen(false);
        fetchOrdenes();
    } catch (error) {
        toast.error('Error al eliminar orden');
    }
  };

  const cambiarEstado = async (orden, estado) => {
    try {
      await axios.put(`${API_URL}ordenes_trabajo.php?id=${orden.id}`, { action: 'cambiar_estado', estado }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Estado actualizado');
      fetchOrdenes();
    } catch {
      toast.error('Error al actualizar estado');
    }
  };

  const handlePrint = async (orden) => {
    const toastId = toast.loading("Generando PDF...");
    try {
      const res = await axios.get(`${API_URL}ordenes_trabajo.php?id=${orden.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const fullOrden = res.data;

      let empresaData = {};
      try {
        const resEmp = await axios.get(`${API_URL}empresa.php`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        empresaData = resEmp.data;
      } catch (e) {
        console.error("Error fetching empresa", e);
      }

      const doc = new jsPDF();
      const primaryColor = [30, 58, 138];
      const secondaryColor = [71, 85, 105];
      const lightBg = [248, 250, 252];

      let yPos = 20;
      let logoHeight = 0;

      if (empresaData.logo) {
        try {
          const logoUrl = `${API_URL}public_files.php?path=${encodeURIComponent(empresaData.logo)}`;
          const logoBase64 = await getBase64ImageFromURL(logoUrl);
          const imgProps = doc.getImageProperties(logoBase64);
          const pdfWidth = 40;
          logoHeight = (imgProps.height * pdfWidth) / imgProps.width;
          doc.addImage(logoBase64, "PNG", 14, 10, pdfWidth, logoHeight, undefined, "FAST");
          yPos = Math.max(yPos, 10 + logoHeight + 5);
        } catch (e) {
          console.error("Logo error", e);
        }
      } else {
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text("SIN LOGO", 14, 20);
        yPos = 30;
      }

      doc.setDrawColor(...primaryColor);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(140, 10, 60, 25, 1, 1, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.text("ORDEN", 170, 16, { align: "center" });
      doc.text("DE TRABAJO", 170, 21, { align: "center" });

      doc.setFillColor(...primaryColor);
      doc.rect(140, 25, 60, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text(fullOrden.codigo || `ID ${fullOrden.id}`, 170, 30.5, { align: "center" });

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryColor);
      doc.text(empresaData.razon_social || "MI EMPRESA", 14, yPos);
      yPos += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...secondaryColor);
      const addressLines = doc.splitTextToSize(empresaData.domicilio_fiscal || "", 100);
      if (addressLines.length > 0) {
        doc.text(addressLines, 14, yPos);
        yPos += addressLines.length * 3.5 + 4;
      }
      doc.text(`RUC: ${empresaData.ruc || "-"}`, 14, yPos);
      yPos += 4;
      doc.text(`Tel: ${empresaData.telefono || "-"}  |  Email: ${empresaData.email || "-"}`, 14, yPos);
      yPos += 12; // Increased spacing

      // --- DYNAMIC BOX CALCULATION ---
      const boxStartY = Math.max(yPos, 50); // Increased min Y
      
      // Prepare text for Left Column
      const labelX_Left = 20;
      const valueX_Left = 55;
      const leftColWidth = 50; // Max width for values
      
      const fechaVal = fullOrden.fecha || "-";
      const prioVal = fullOrden.prioridad || "-";
      const estadoVal = fullOrden.estado || "-";
      const solicVal = doc.splitTextToSize(fullOrden.solicitante_nombre || "-", leftColWidth);
      const dniVal = fullOrden.solicitante_dni || "-";

      // Prepare text for Right Column
      const labelX_Right = 110;
      const valueX_Right = 145;
      const rightColWidth = 50;

      const areaVal = doc.splitTextToSize(fullOrden.area || "-", rightColWidth);
      const responsableName = usuarios.find(u => u.id == fullOrden.responsable_id)?.usuario || "No asignado";
      const respVal = doc.splitTextToSize(responsableName, rightColWidth);
      const fechasVal = `${fullOrden.inicio || "-"} al ${fullOrden.fin || "-"}`;
      const lugarVal = doc.splitTextToSize(fullOrden.lugar_trabajo || "-", rightColWidth);

      // Calculate heights
      let currentY_Left = 10; // Relative to box top
      currentY_Left += 5; // Fecha
      currentY_Left += 5; // Prioridad
      currentY_Left += 5; // Estado
      currentY_Left += (solicVal.length * 5); // Solicitante (multiline)
      currentY_Left += 5; // DNI
      
      let currentY_Right = 10;
      currentY_Right += (areaVal.length * 5); // Area
      currentY_Right += (respVal.length * 5); // Responsable
      currentY_Right += 5; // Fechas
      currentY_Right += (lugarVal.length * 5); // Lugar

      const boxHeight = Math.max(currentY_Left, currentY_Right) + 5;

      // Draw Box
      doc.setFillColor(...lightBg);
      doc.roundedRect(14, boxStartY, 182, boxHeight, 1, 1, "F");

      // Draw Left Column Content
      let y = boxStartY + 10;
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);

      // Fecha
      doc.setFont("helvetica", "bold"); doc.text("Fecha solicitud:", labelX_Left, y);
      doc.setFont("helvetica", "normal"); doc.text(fechaVal, valueX_Left, y);
      y += 5;

      // Prioridad
      doc.setFont("helvetica", "bold"); doc.text("Prioridad:", labelX_Left, y);
      doc.setFont("helvetica", "normal"); doc.text(prioVal, valueX_Left, y);
      y += 5;

      // Estado
      doc.setFont("helvetica", "bold"); doc.text("Estado:", labelX_Left, y);
      doc.setFont("helvetica", "normal"); doc.text(estadoVal, valueX_Left, y);
      y += 5;

      // Solicitante (Multiline)
      doc.setFont("helvetica", "bold"); doc.text("Solicitante:", labelX_Left, y);
      doc.setFont("helvetica", "normal"); doc.text(solicVal, valueX_Left, y);
      y += (solicVal.length * 5);

      // DNI
      doc.setFont("helvetica", "bold"); doc.text("DNI:", labelX_Left, y);
      doc.setFont("helvetica", "normal"); doc.text(dniVal, valueX_Left, y);
      
      // Draw Right Column Content
      y = boxStartY + 10; // Reset Y for right column

      // Area (Multiline)
      doc.setFont("helvetica", "bold"); doc.text("Área solicitante:", labelX_Right, y);
      doc.setFont("helvetica", "normal"); doc.text(areaVal, valueX_Right, y);
      y += (areaVal.length * 5);

      // Responsable (Multiline)
      doc.setFont("helvetica", "bold"); doc.text("Responsable:", labelX_Right, y);
      doc.setFont("helvetica", "normal"); doc.text(respVal, valueX_Right, y);
      y += (respVal.length * 5);

      // Fechas
      doc.setFont("helvetica", "bold"); doc.text("Fechas estimadas:", labelX_Right, y);
      doc.setFont("helvetica", "normal"); doc.text(fechasVal, valueX_Right, y);
      y += 5;

      // Lugar (Multiline)
      doc.setFont("helvetica", "bold"); doc.text("Lugar de trabajo:", labelX_Right, y);
      doc.setFont("helvetica", "normal"); doc.text(lugarVal, valueX_Right, y);

      // --- END DYNAMIC BOX ---

      y = boxStartY + boxHeight + 12;

      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 182, 8, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryColor);
      doc.text("DETALLE DEL TRABAJO", 18, y + 5);
      y += 14;

      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.text(fullOrden.titulo || "Sin título", 14, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const descLines = doc.splitTextToSize(fullOrden.descripcion || "", 180);
      if (descLines.length > 0) {
        doc.text(descLines, 14, y);
        y += descLines.length * 5 + 8;
      } else {
        y += 5;
      }

      if (fullOrden.tareas && fullOrden.tareas.length > 0) {
        if (y > 250) {
          doc.addPage();
          y = 20;
        }

        doc.setFillColor(241, 245, 249);
        doc.rect(14, y, 182, 8, "F");
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...primaryColor);
        doc.text("TAREAS PLANIFICADAS", 18, y + 5);
        y += 12;

        autoTable(doc, {
          startY: y,
          head: [["Estado", "Descripción", "Detalles", "Encargado", "Fecha límite"]],
          body: fullOrden.tareas.map(t => [
            t.estado || "-",
            t.descripcion || "-",
            t.detalles || "-",
            usuarios.find(u => u.id == t.encargado_id)?.usuario || "-",
            t.fecha_limite || "-"
          ]),
          theme: "striped",
          headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: "bold", halign: "center" },
          bodyStyles: { fontSize: 9, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 50 },
            2: { cellWidth: 50 },
            3: { cellWidth: 35 },
            4: { cellWidth: 27 }
          }
        });
        y = doc.lastAutoTable.finalY + 10;
      }

      if (y + 28 > 260) {
        doc.addPage();
        y = 20;
      }

      // Costos removidos a pedido del usuario

      let firmaY = y + 20;
      if (firmaY + 25 > 280) {
        doc.addPage();
        firmaY = 220;
      }

      doc.setDrawColor(200);
      doc.line(35, firmaY, 90, firmaY);
      doc.line(120, firmaY, 175, firmaY);
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text("Solicitante", 62.5, firmaY + 5, { align: "center" });
      doc.text("Responsable", 147.5, firmaY + 5, { align: "center" });

      const generatedAt = new Intl.DateTimeFormat("es-PE", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Lima"
      }).format(new Date());

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 195, 290, { align: "right" });
        doc.text(`Generado el ${generatedAt}`, 14, 290);
      }

      doc.save(`OT-${fullOrden.codigo || fullOrden.id}.pdf`);
      toast.success("PDF Descargado");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar PDF");
    } finally {
      toast.dismiss(toastId);
    }
  };

  const buscarFacturas = async (e) => {
    e?.preventDefault(); // Optional if called from event
    if (!facturaBusqueda.trim()) return;
    
    setBuscandoFactura(true);
    setShowFacturaDropdown(true);
    try {
        const res = await axios.get(`${API_URL}facturacion.php?action=listar&search=${encodeURIComponent(facturaBusqueda)}&limit=5`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const resultados = res.data.data || [];
        setFacturasEncontradas(resultados);
    } catch (error) {
        console.error(error);
        // Silent error for auto-search
    } finally {
        setBuscandoFactura(false);
    }
  };

  const seleccionarFactura = async (factura) => {
    const toastId = toast.loading("Importando datos...");
    try {
        const res = await axios.get(`${API_URL}facturacion.php?action=obtener_detalle&id=${factura.id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const items = res.data;
        
        const newTareas = items.map(item => ({
           descripcion: item.descripcion,
           encargado_id: '',
           fecha_limite: '',
           estado: 'Pendiente'
        }));

        setFormData(prev => ({
           ...prev,
           titulo: `Orden derivada de Factura ${factura.serie}-${factura.correlativo}`,
           descripcion: `Trabajo generado a partir de la factura ${factura.serie}-${factura.correlativo}`,
           solicitante_nombre: factura.cliente_razon_social || '',
           solicitante_dni: factura.cliente_num_doc || '',
           lugar_trabajo: factura.cliente_direccion || prev.lugar_trabajo || '',
           tareas: newTareas,
           costo_estimado: 0,
           costo_real: 0
        }));
        
        setFacturasEncontradas([]);
        setFacturaBusqueda('');
        setShowFacturaDropdown(false);
        toast.success("Datos importados correctamente", { id: toastId });
    } catch (error) {
        console.error(error);
        toast.error("Error al importar detalles", { id: toastId });
    }
  };

  const buscarClientes = async () => {
    if (!clienteBusqueda.trim()) return;
    
    setBuscandoCliente(true);
    setShowClienteDropdown(true);
    try {
        const res = await axios.get(`${API_URL}gestion_clientes.php?action=list&search=${encodeURIComponent(clienteBusqueda)}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setClientesEncontrados(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
        console.error(error);
    } finally {
        setBuscandoCliente(false);
    }
  };

  const seleccionarCliente = (cliente) => {
    setFormData(prev => ({
        ...prev,
        solicitante_nombre: cliente.razon_social || cliente.contacto_nombre || '',
        solicitante_dni: cliente.num_doc || '',
        lugar_trabajo: cliente.direccion || prev.lugar_trabajo || '',
        solicitante_cargo: '', // No cargo data in client search usually
    }));

    setClientesEncontrados([]);
    setClienteBusqueda('');
    setShowClienteDropdown(false);
    toast.success("Datos de cliente importados");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList size={24} className="text-blue-600" />
          Órdenes de Trabajo
        </h2>
        <button onClick={openCreateModal} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm">
          <Plus size={20} /> Nueva Orden
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-xs font-medium text-gray-500">Desde</label>
            <input type="date" value={filters.fecha_inicio} onChange={e => setFilters({ ...filters, fecha_inicio: e.target.value })} className="border border-gray-200 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-xs font-medium text-gray-500">Hasta</label>
            <input type="date" value={filters.fecha_fin} onChange={e => setFilters({ ...filters, fecha_fin: e.target.value })} className="border border-gray-200 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-xs font-medium text-gray-500">Estado</label>
            <select value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })} className="border border-gray-200 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                <option value="">Todos los estados</option>
                <option value="Abierta">Abierta</option>
                <option value="En proceso">En proceso</option>
                <option value="Completada">Completada</option>
                <option value="Cancelada">Cancelada</option>
            </select>
        </div>
        <button onClick={fetchOrdenes} className="bg-gray-100 text-gray-600 p-2.5 rounded-lg hover:bg-gray-200 transition-colors" title="Buscar">
            <Search size={20} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
                <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Código</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Título</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Prioridad</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {ordenes.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{o.fecha}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{o.codigo}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate" title={o.solicitante_nombre || ''}>{o.solicitante_nombre || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800 font-medium">{o.titulo}</td>
                    <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            o.prioridad === 'Alta' || o.prioridad === 'Urgente' ? 'bg-red-50 text-red-700 border border-red-100' :
                            o.prioridad === 'Media' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-green-50 text-green-700 border border-green-100'
                        }`}>
                            {o.prioridad}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        o.estado === 'Abierta' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        o.estado === 'En proceso' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                        o.estado === 'Completada' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}>
                        {o.estado}
                    </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handlePrint(o)} className="text-gray-600 hover:text-gray-900 p-1.5 hover:bg-gray-50 rounded-lg transition-colors" title="Descargar PDF">
                            <Printer size={18} />
                        </button>
                        <button onClick={() => openEditModal(o)} className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                            <Edit2 size={18} />
                        </button>
                        {o.estado !== 'Completada' && (
                            <button onClick={() => cambiarEstado(o, 'Completada')} className="text-emerald-600 hover:text-emerald-900 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="Completar">
                            <CheckCircle size={18} />
                            </button>
                        )}
                        <button onClick={() => openDeleteModal(o)} className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                            <Trash2 size={18} />
                        </button>
                    </div>
                    </td>
                </tr>
                ))}
                {ordenes.length === 0 && !loading && (
                <tr><td colSpan="7" className="text-center py-12 text-gray-500">No se encontraron órdenes de trabajo</td></tr>
                )}
                {loading && (
                <tr><td colSpan="7" className="text-center py-12 text-gray-500">Cargando...</td></tr>
                )}
            </tbody>
            </table>
        </div>
      </div>

      {/* Modal Crear/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] my-auto">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50/50 rounded-t-xl sticky top-0 z-10">
                    <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                        {isEditing ? <Edit2 size={20} className="text-blue-600"/> : <Plus size={20} className="text-blue-600"/>}
                        {isEditing ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-full">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <form onSubmit={submitOrden} className="space-y-6">
                        {!isEditing && (
                            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Buscador de Facturas */}
                                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 relative" ref={searchWrapperRef}>
                                    <label className="block text-sm font-medium text-blue-900 mb-2">Importar desde Factura</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 text-blue-400" size={18} />
                                        <input 
                                            type="text" 
                                            value={facturaBusqueda}
                                            onChange={e => setFacturaBusqueda(e.target.value)}
                                            onFocus={() => facturaBusqueda.length > 2 && setShowFacturaDropdown(true)}
                                            placeholder="Serie-Correlativo o Cliente..."
                                            className="w-full pl-10 pr-10 py-2 border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                        />
                                        {buscandoFactura && (
                                            <div className="absolute right-3 top-2.5">
                                                <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {showFacturaDropdown && facturaBusqueda.length > 2 && (
                                        <div className="absolute z-10 w-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-60 overflow-y-auto">
                                            {facturasEncontradas.length > 0 ? (
                                                facturasEncontradas.map(f => (
                                                    <div 
                                                        key={f.id} 
                                                        onClick={() => seleccionarFactura(f)}
                                                        className="p-3 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center border-b last:border-0 border-gray-50 transition-colors"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-gray-800">{f.serie}-{f.correlativo}</span>
                                                            <span className="text-gray-600 text-xs">{f.cliente_razon_social}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-xs text-gray-500">{f.fecha_emision}</span>
                                                            <span className="text-xs font-medium text-blue-600">S/ {parseFloat(f.total_importe).toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                !buscandoFactura && (
                                                    <div className="p-4 text-center text-gray-500 text-sm">
                                                        No se encontraron facturas
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Buscador de Clientes */}
                                <div className="bg-green-50/50 p-4 rounded-xl border border-green-100 relative" ref={clientSearchWrapperRef}>
                                    <label className="block text-sm font-medium text-green-900 mb-2">Importar desde Cliente</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-2.5 text-green-400" size={18} />
                                        <input 
                                            type="text" 
                                            value={clienteBusqueda}
                                            onChange={e => setClienteBusqueda(e.target.value)}
                                            onFocus={() => clienteBusqueda.length > 2 && setShowClienteDropdown(true)}
                                            placeholder="Razón Social o DNI/RUC..."
                                            className="w-full pl-10 pr-10 py-2 border border-green-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none"
                                        />
                                        {buscandoCliente && (
                                            <div className="absolute right-3 top-2.5">
                                                <div className="animate-spin h-4 w-4 border-2 border-green-500 rounded-full border-t-transparent"></div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {showClienteDropdown && clienteBusqueda.length > 2 && (
                                        <div className="absolute z-10 w-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-60 overflow-y-auto">
                                            {clientesEncontrados.length > 0 ? (
                                                clientesEncontrados.map(c => (
                                                    <div 
                                                        key={c.id} 
                                                        onClick={() => seleccionarCliente(c)}
                                                        className="p-3 hover:bg-green-50 cursor-pointer text-sm flex justify-between items-center border-b last:border-0 border-gray-50 transition-colors"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-gray-800">{c.razon_social || c.contacto_nombre}</span>
                                                            <span className="text-gray-600 text-xs">{c.num_doc}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-xs text-gray-500">{c.email}</span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                !buscandoCliente && (
                                                    <div className="p-4 text-center text-gray-500 text-sm">
                                                        No se encontraron clientes
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {!isEditing && (
                            <div className="flex items-center gap-4 mb-6">
                                <div className="h-px bg-gray-200 flex-1"></div>
                                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Información de la Orden</span>
                                <div className="h-px bg-gray-200 flex-1"></div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            <div className="lg:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Título de la Orden <span className="text-red-500">*</span></label>
                                <input required type="text" value={formData.titulo} onChange={e => setFormData({ ...formData, titulo: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="Ej. Mantenimiento Preventivo de Aire Acondicionado" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Prioridad</label>
                                <select value={formData.prioridad} onChange={e => setFormData({ ...formData, prioridad: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white">
                                    <option value="Baja">Baja</option>
                                    <option value="Media">Media</option>
                                    <option value="Alta">Alta</option>
                                    <option value="Urgente">Urgente</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre del Solicitante <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={formData.solicitante_nombre}
                                    onChange={e => setFormData({ ...formData, solicitante_nombre: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    placeholder="Nombre completo del solicitante"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1"><Calendar size={14}/> Fecha Registro</label>
                                <input required type="date" value={formData.fecha} onChange={e => setFormData({ ...formData, fecha: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1"><Calendar size={14}/> Inicio Estimado</label>
                                <input type="date" value={formData.inicio} onChange={e => setFormData({ ...formData, inicio: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1"><Calendar size={14}/> Fin Estimado</label>
                                <input type="date" value={formData.fin} onChange={e => setFormData({ ...formData, fin: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">DNI del Solicitante <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={formData.solicitante_dni}
                                    onChange={e => setFormData({ ...formData, solicitante_dni: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    placeholder="Documento de identidad"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1"><Briefcase size={14}/> Área Solicitante</label>
                                <select 
                                    value={formData.area} 
                                    onChange={e => setFormData({ ...formData, area: e.target.value })} 
                                    className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                                >
                                    <option value="">Seleccione Área</option>
                                    {areas.map(area => (
                                    <option key={area.id} value={area.nombre}>{area.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cargo del Solicitante</label>
                                <input
                                    type="text"
                                    value={formData.solicitante_cargo}
                                    onChange={e => setFormData({ ...formData, solicitante_cargo: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    placeholder="Cargo o puesto del solicitante"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1"><User size={14}/> Responsable</label>
                                <select 
                                    value={formData.responsable_id} 
                                    onChange={e => setFormData({ ...formData, responsable_id: e.target.value })} 
                                    className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                                >
                                    <option value="">Asignar Responsable</option>
                                    {usuarios.map(u => (
                                    <option key={u.id} value={u.id}>{u.usuario} ({u.email})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="lg:col-span-3">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Lugar de Trabajo <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={formData.lugar_trabajo}
                                    onChange={e => setFormData({ ...formData, lugar_trabajo: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    placeholder="Dirección o zona donde se realizará el trabajo"
                                />
                            </div>

                            <div className="lg:col-span-3">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción Detallada</label>
                                <textarea required value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[100px]" placeholder="Describa el trabajo a realizar, materiales necesarios, etc..." />
                            </div>
                        </div>

                        {/* Tareas Section */}
                        <div className="bg-gray-50/50 p-5 rounded-xl border border-gray-200">
                            <h4 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                                <ClipboardList size={18} className="text-blue-600"/> Tareas y Actividades
                            </h4>
                            
                            <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm mb-4">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                                    <div className="md:col-span-6">
                                        <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
                                        <input 
                                            type="text" 
                                            value={tareaTemp.descripcion} 
                                            onChange={e => setTareaTemp({ ...tareaTemp, descripcion: e.target.value })} 
                                            className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" 
                                            placeholder="Tarea principal..."
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-xs text-gray-500 mb-1 block">Encargado</label>
                                        <select 
                                            value={tareaTemp.encargado_id} 
                                            onChange={e => setTareaTemp({ ...tareaTemp, encargado_id: e.target.value })} 
                                            className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                                        >
                                            <option value="">Sin asignar</option>
                                            {usuarios.map(u => (
                                            <option key={u.id} value={u.id}>{u.usuario}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-xs text-gray-500 mb-1 block">Fecha Límite</label>
                                        <input 
                                            type="date" 
                                            value={tareaTemp.fecha_limite} 
                                            onChange={e => setTareaTemp({ ...tareaTemp, fecha_limite: e.target.value })} 
                                            className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" 
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 mb-1 block">Detalles / Observaciones</label>
                                        <input 
                                            type="text" 
                                            value={tareaTemp.detalles || ''} 
                                            onChange={e => setTareaTemp({ ...tareaTemp, detalles: e.target.value })} 
                                            className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" 
                                            placeholder="Detalles adicionales..."
                                        />
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={addTarea} 
                                        disabled={!tareaTemp.descripcion}
                                        className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-[38px] w-[38px] flex items-center justify-center"
                                        title="Agregar Tarea"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                {formData.tareas.map((t, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-sm group">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="font-medium text-gray-800 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                {t.descripcion}
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => removeTarea(idx)} 
                                                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Quitar tarea"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                        {t.detalles && (
                                            <div className="text-gray-500 text-xs ml-4 mb-2 italic border-l-2 border-gray-100 pl-2">
                                                {t.detalles}
                                            </div>
                                        )}
                                        <div className="flex gap-4 ml-4 text-xs text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <User size={12} />
                                                {t.encargado_id ? usuarios.find(u => u.id == t.encargado_id)?.usuario || 'Usuario ID ' + t.encargado_id : 'Sin encargado'}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Calendar size={12} />
                                                {t.fecha_limite || 'Sin fecha'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {formData.tareas.length === 0 && (
                                    <div className="text-center text-gray-400 text-sm py-8 border-2 border-dashed border-gray-200 rounded-lg">
                                        No hay tareas agregadas a esta orden
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t flex justify-end gap-3 sticky bottom-0 bg-white z-10 pb-2">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium">
                                Cancelar
                            </button>
                            <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all font-medium flex items-center gap-2">
                                {isEditing ? <CheckCircle size={18}/> : <Plus size={18}/>}
                                {isEditing ? 'Guardar Cambios' : 'Crear Orden'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center transform transition-all scale-100">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 animate-pulse">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">¿Eliminar Orden?</h3>
                <p className="text-gray-500 text-sm mb-6">
                    Se eliminará la orden <span className="font-mono font-bold bg-gray-100 px-1 rounded">{ordenToDelete?.codigo}</span> y todas sus tareas asociadas. <br/>Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3 justify-center">
                    <button 
                        onClick={() => setIsDeleteModalOpen(false)} 
                        className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={confirmDelete} 
                        className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-500/30 font-medium"
                    >
                        Sí, Eliminar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default OrdenesTrabajo;
