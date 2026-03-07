import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { API_URL } from '../api/config';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  Search, 
  Filter, 
  Calendar,
  FileText,
  ArrowRight,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

import SearchableSelect from './SearchableSelect';

const Kardex = () => {
  const [productos, setProductos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [data, setData] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filters, setFilters] = useState({
    producto_id: '',
    almacen_id: '',
    fecha_inicio: '',
    fecha_fin: ''
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchProductos();
    fetchAlmacenes();
    fetchEmpresa();
  }, []);

  // Effect to handle pagination changes
  useEffect(() => {
    if (data && filters.producto_id) {
        fetchKardexData();
    }
  }, [page]);

  const fetchEmpresa = async () => {
    try {
      const response = await axios.get(`${API_URL}empresa.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmpresa(response.data);
    } catch (error) {
      console.error('Error fetching empresa:', error);
    }
  };

  const fetchProductos = async () => {
    try {
      const response = await axios.get(`${API_URL}productos.php`, {
        params: { page: 1, limit: 50 },
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data;
      setProductos(Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []));
    } catch (error) {
      console.error('Error fetching productos:', error);
    }
  };

  const handleProductSearch = async (term) => {
    const q = (term || '').trim();
    if (q.length < 2) {
      // do not query; show initial limited list
      return;
    }
    setLoadingProducts(true);
    try {
      const response = await axios.get(`${API_URL}productos.php`, {
        params: { search: q, limit: 50 },
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data;
      setProductos(Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []));
    } catch (error) {
      console.error('Error searching productos:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchAlmacenes = async () => {
    try {
      const response = await axios.get(`${API_URL}almacenes.php`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlmacenes(response.data);
    } catch (error) {
      console.error('Error fetching almacenes:', error);
    }
  };

  const fetchKardexData = async () => {
    if (!filters.producto_id) {
        toast.error('Seleccione un producto');
        return;
    }

    setLoading(true);
    // setData(null); // Keep previous data while loading for better UX? Or clear it.
    
    try {
        const params = new URLSearchParams({
            ...filters,
            page: page.toString(),
            limit: '20'
        }).toString();

        const response = await axios.get(`${API_URL}kardex.php?${params}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        setData(response.data);
        if (response.data.pagination) {
            setTotalPages(response.data.pagination.total_pages);
        } else {
            setTotalPages(1);
        }

    } catch (error) {
        console.error('Error fetching kardex:', error);
        toast.error('Error al cargar reporte');
    } finally {
        setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setPage(1); // Reset to page 1 on new search
    fetchKardexData();
  };

  const fetchAllKardexData = async () => {
    if (!filters.producto_id) return null;
    const toastId = toast.loading("Descargando datos completos...");
    try {
        const params = new URLSearchParams({
            ...filters
            // No page/limit params to get all data
        }).toString();

        const response = await axios.get(`${API_URL}kardex.php?${params}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.dismiss(toastId);
        return response.data;
    } catch (error) {
        toast.error("Error descargando datos", { id: toastId });
        return null;
    }
  };

  const handleExportPDF = async () => {
    const exportData = await fetchAllKardexData();
    if (!exportData || !exportData.movimientos.length) {
        toast.error("No hay datos para exportar");
        return;
    }

    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
    
    // Header
    doc.setFontSize(18);
    doc.text('KARDEX VALORIZADO', 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Empresa: ${empresa?.razon_social || 'Mi Empresa'}`, 14, 22);
    doc.text(`RUC: ${empresa?.ruc || ''}`, 14, 27);
    
    doc.setFontSize(12);
    doc.text(`Producto: ${exportData.producto.nombre}`, 14, 35);
    doc.setFontSize(10);
    doc.text(`Código: ${exportData.producto.codigo_interno}`, 14, 40);
    doc.text(`Unidad: ${exportData.producto.unidad_medida}`, 80, 40);
    
    if (filters.fecha_inicio || filters.fecha_fin) {
      doc.text(`Periodo: ${filters.fecha_inicio || 'Inicio'} al ${filters.fecha_fin || 'Presente'}`, 14, 45);
    }

    const tableColumn = [
      { content: 'Fecha', rowSpan: 2 },
      { content: 'Documento', rowSpan: 2 },
      { content: 'Concepto', rowSpan: 2 },
      { content: 'ENTRADAS', colSpan: 3, styles: { halign: 'center', fillColor: [220, 252, 231] } },
      { content: 'SALIDAS', colSpan: 3, styles: { halign: 'center', fillColor: [254, 226, 226] } },
      { content: 'SALDOS', colSpan: 3, styles: { halign: 'center', fillColor: [219, 234, 254] } }
    ];

    const subHeader = [
      'Cant.', 'Costo', 'Total',
      'Cant.', 'Costo', 'Total',
      'Cant.', 'Costo', 'Total'
    ];

    const tableRows = exportData.movimientos.map(mov => [
      mov.fecha,
      mov.tipo_documento ? `${mov.tipo_documento} ${mov.serie}-${mov.numero}` : '-',
      mov.motivo_movimiento || '-',
      // Entradas
      mov.tipo_movimiento === 'ENTRADA' ? mov.cantidad : '',
      mov.tipo_movimiento === 'ENTRADA' ? parseFloat(mov.costo_unitario).toFixed(2) : '',
      mov.tipo_movimiento === 'ENTRADA' ? (mov.cantidad * mov.costo_unitario).toFixed(2) : '',
      // Salidas
      mov.tipo_movimiento === 'SALIDA' ? mov.cantidad : '',
      mov.tipo_movimiento === 'SALIDA' ? parseFloat(mov.costo_unitario).toFixed(2) : '',
      mov.tipo_movimiento === 'SALIDA' ? (mov.cantidad * mov.costo_unitario).toFixed(2) : '',
      // Saldos
      mov.saldo_cantidad,
      parseFloat(mov.costo_promedio).toFixed(2),
      (mov.saldo_cantidad * mov.costo_promedio).toFixed(2)
    ]);

    autoTable(doc, {
      startY: 50,
      head: [tableColumn, subHeader],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] }
    });

    doc.save(`Kardex_${exportData.producto.codigo_interno}.pdf`);
  };

  const handleExportExcel = async () => {
    const exportData = await fetchAllKardexData();
    if (!exportData || !exportData.movimientos.length) {
        toast.error("No hay datos para exportar");
        return;
    }

    const wb = XLSX.utils.book_new();
    
    const header = [
      ['KARDEX VALORIZADO'],
      [`Empresa: ${empresa?.razon_social || ''}`],
      [`RUC: ${empresa?.ruc || ''}`],
      [''],
      [`Producto: ${exportData.producto.nombre}`, `Código: ${exportData.producto.codigo_interno}`],
      [''],
      ['Fecha', 'Documento', 'Concepto', 'ENTRADAS', '', '', 'SALIDAS', '', '', 'SALDOS', '', ''],
      ['', '', '', 'Cant.', 'Costo', 'Total', 'Cant.', 'Costo', 'Total', 'Cant.', 'Costo', 'Total']
    ];

    const body = exportData.movimientos.map(mov => [
      mov.fecha,
      mov.tipo_documento ? `${mov.tipo_documento} ${mov.serie}-${mov.numero}` : '-',
      mov.motivo_movimiento || '-',
      // Entradas
      mov.tipo_movimiento === 'ENTRADA' ? parseFloat(mov.cantidad) : '',
      mov.tipo_movimiento === 'ENTRADA' ? parseFloat(mov.costo_unitario) : '',
      mov.tipo_movimiento === 'ENTRADA' ? parseFloat(mov.cantidad * mov.costo_unitario) : '',
      // Salidas
      mov.tipo_movimiento === 'SALIDA' ? parseFloat(mov.cantidad) : '',
      mov.tipo_movimiento === 'SALIDA' ? parseFloat(mov.costo_unitario) : '',
      mov.tipo_movimiento === 'SALIDA' ? parseFloat(mov.cantidad * mov.costo_unitario) : '',
      // Saldos
      parseFloat(mov.saldo_cantidad),
      parseFloat(mov.costo_promedio),
      parseFloat(mov.saldo_cantidad * mov.costo_promedio)
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...header, ...body]);
    
    // Merges
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }, // Title
      { s: { r: 6, c: 0 }, e: { r: 7, c: 0 } }, // Fecha
      { s: { r: 6, c: 1 }, e: { r: 7, c: 1 } }, // Documento
      { s: { r: 6, c: 2 }, e: { r: 7, c: 2 } }, // Concepto
      { s: { r: 6, c: 3 }, e: { r: 6, c: 5 } }, // Entradas
      { s: { r: 6, c: 6 }, e: { r: 6, c: 8 } }, // Salidas
      { s: { r: 6, c: 9 }, e: { r: 6, c: 11 } } // Saldos
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Kardex");
    XLSX.writeFile(wb, `Kardex_${exportData.producto.codigo_interno}.xlsx`);
  };

  const handleChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kardex Valorizado</h1>
          <p className="text-sm text-gray-500">Control de inventario y costos</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleExportExcel}
            disabled={!data}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <FileSpreadsheet size={18} /> 
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button 
            onClick={handleExportPDF}
            disabled={!data}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <FileText size={18} /> 
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Producto *</label>
            <SearchableSelect
              options={Array.isArray(productos) ? productos : []}
              value={filters.producto_id}
              onChange={(item) => setFilters({ ...filters, producto_id: item ? item.id : '' })}
              placeholder="Buscar producto por nombre o código..."
              labelKey="nombre"
              valueKey="id"
              secondaryKey="codigo_interno"
              onSearch={handleProductSearch}
              loading={loadingProducts}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Almacén</label>
            <select
              name="almacen_id"
              value={filters.almacen_id}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Todos</option>
              {almacenes.map(alm => (
                <option key={alm.id} value={alm.id}>{alm.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              name="fecha_inicio"
              value={filters.fecha_inicio}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <Search size={20} /> Consultar
            </button>
          </div>
        </form>
      </div>

      {/* Resultados */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {data && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-gray-800">{data.producto.nombre}</h2>
              <p className="text-sm text-gray-500">
                Código: {data.producto.codigo_interno} | Método Costeo: <span className="uppercase">{data.producto.metodo_costeo}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Stock Actual</p>
              <p className="font-bold text-xl">{data.producto.stock} {data.producto.unidad_medida}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th rowSpan="2" className="px-4 py-3 text-left font-medium text-gray-500 uppercase border-r">Fecha</th>
                  <th rowSpan="2" className="px-4 py-3 text-left font-medium text-gray-500 uppercase border-r">Documento</th>
                  <th rowSpan="2" className="px-4 py-3 text-left font-medium text-gray-500 uppercase border-r">Concepto</th>
                  
                  <th colSpan="3" className="px-4 py-2 text-center font-medium text-gray-500 uppercase border-b border-r bg-green-50 text-green-800">Entradas</th>
                  <th colSpan="3" className="px-4 py-2 text-center font-medium text-gray-500 uppercase border-b border-r bg-red-50 text-red-800">Salidas</th>
                  <th colSpan="3" className="px-4 py-2 text-center font-medium text-gray-500 uppercase border-b bg-blue-50 text-blue-800">Saldos</th>
                </tr>
                <tr>
                  {/* Entradas */}
                  <th className="px-2 py-2 text-right text-xs bg-green-50 border-r">Cant.</th>
                  <th className="px-2 py-2 text-right text-xs bg-green-50 border-r">Costo</th>
                  <th className="px-2 py-2 text-right text-xs bg-green-50 border-r">Total</th>
                  
                  {/* Salidas */}
                  <th className="px-2 py-2 text-right text-xs bg-red-50 border-r">Cant.</th>
                  <th className="px-2 py-2 text-right text-xs bg-red-50 border-r">Costo</th>
                  <th className="px-2 py-2 text-right text-xs bg-red-50 border-r">Total</th>
                  
                  {/* Saldos */}
                  <th className="px-2 py-2 text-right text-xs bg-blue-50 border-r">Cant.</th>
                  <th className="px-2 py-2 text-right text-xs bg-blue-50 border-r">Costo</th>
                  <th className="px-2 py-2 text-right text-xs bg-blue-50">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.movimientos.length > 0 ? (
                  data.movimientos.map((mov, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900 border-r border-gray-100">{mov.fecha}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 border-r border-gray-100">
                        {mov.tipo_documento ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {mov.tipo_documento} {mov.serie}-{mov.numero}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 border-r border-gray-100 max-w-[200px] truncate" title={mov.motivo_movimiento}>{mov.motivo_movimiento || '-'}</td>
                      
                      {/* Entradas */}
                      <td className="px-3 py-3 text-right font-medium text-green-700 bg-green-50/10 border-r border-gray-100">
                        {mov.tipo_movimiento === 'ENTRADA' ? mov.cantidad : ''}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 bg-green-50/10 border-r border-gray-100">
                        {mov.tipo_movimiento === 'ENTRADA' ? parseFloat(mov.costo_unitario).toFixed(2) : ''}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-green-700 bg-green-50/10 border-r border-gray-100">
                        {mov.tipo_movimiento === 'ENTRADA' ? (mov.cantidad * mov.costo_unitario).toFixed(2) : ''}
                      </td>

                      {/* Salidas */}
                      <td className="px-3 py-3 text-right font-medium text-red-700 bg-red-50/10 border-r border-gray-100">
                        {mov.tipo_movimiento === 'SALIDA' ? mov.cantidad : ''}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 bg-red-50/10 border-r border-gray-100">
                        {mov.tipo_movimiento === 'SALIDA' ? parseFloat(mov.costo_unitario).toFixed(2) : ''}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-red-700 bg-red-50/10 border-r border-gray-100">
                        {mov.tipo_movimiento === 'SALIDA' ? (mov.cantidad * mov.costo_unitario).toFixed(2) : ''}
                      </td>

                      {/* Saldos */}
                      <td className="px-3 py-3 text-right font-bold text-blue-700 bg-blue-50/10 border-r border-gray-100">
                        {mov.saldo_cantidad}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 bg-blue-50/10 border-r border-gray-100">
                        {parseFloat(mov.costo_promedio).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-blue-700 bg-blue-50/10">
                        {(mov.saldo_cantidad * mov.costo_promedio).toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="12" className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <FileText size={48} className="text-gray-300" />
                        <p className="text-lg font-medium">No se encontraron movimientos</p>
                        <p className="text-sm">Intente cambiar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-sm"
                >
                    <ChevronLeft size={20} /> <span className="hidden sm:inline">Anterior</span>
                </button>
                <span className="text-gray-600 font-medium">
                    Página {page} de {totalPages}
                </span>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-sm"
                >
                    <span className="hidden sm:inline">Siguiente</span> <ChevronRight size={20} />
                </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Kardex;
