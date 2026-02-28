import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Package, Search, Plus, Edit, Trash2, Tag, Layers, Settings, Save, X, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

import { API_URL } from '../api/config';

const MaestroProductos = () => {
  const [activeTab, setActiveTab] = useState('productos');
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  // Modals
  const [showProdModal, setShowProdModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showMarcaModal, setShowMarcaModal] = useState(false);

  // Form States
  const [currentProd, setCurrentProd] = useState(null);
  const [currentCat, setCurrentCat] = useState(null);
  const [currentMarca, setCurrentMarca] = useState(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchStaticData();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch products on page/search change
  useEffect(() => {
    fetchProductos();
  }, [page, debouncedSearch]);

  const fetchStaticData = async () => {
    try {
      const [cRes, mRes] = await Promise.all([
        axios.get(`${API_URL}categorias.php`, { headers }),
        axios.get(`${API_URL}marcas.php`, { headers })
      ]);
      setCategorias(cRes.data);
      setMarcas(mRes.data);
    } catch (error) {
      console.error("Error loading static data", error);
    }
  };

  const fetchProductos = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}productos.php`, {
        params: { page, limit, search: debouncedSearch },
        headers
      });
      
      if (response.data.pagination) {
        setProductos(response.data.data);
        setTotalPages(response.data.pagination.total_pages);
      } else {
        setProductos(response.data);
      }
    } catch (error) {
      console.error(error);
      toast.error('Error cargando productos');
    } finally {
      setLoading(false);
    }
  };

  // --- Productos Logic ---
  const handleSaveProducto = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Checkboxes handling
    data.maneja_lotes = formData.get('maneja_lotes') ? 1 : 0;
    data.maneja_series = formData.get('maneja_series') ? 1 : 0;
    data.maneja_vencimiento = formData.get('maneja_vencimiento') ? 1 : 0;

    // Add ID if editing
    if (currentProd) data.id = currentProd.id;

    try {
      const method = currentProd ? 'put' : 'post';
      await axios[method](`${API_URL}productos.php`, data, { headers });
      toast.success(`Producto ${currentProd ? 'actualizado' : 'creado'}`);
      setShowProdModal(false);
      fetchProductos();
    } catch (error) {
      toast.error('Error al guardar producto');
    }
  };

  const handleDeleteProducto = async (id) => {
    if (!window.confirm('¿Eliminar producto?')) return;
    try {
      await axios.delete(`${API_URL}productos.php?id=${id}`, { headers });
      toast.success('Producto eliminado');
      fetchProductos();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  // --- Categorias Logic ---
  const handleSaveCategoria = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (currentCat) data.id = currentCat.id;
    try {
      await axios[currentCat ? 'put' : 'post'](`${API_URL}categorias.php`, data, { headers });
      toast.success('Categoría guardada');
      setShowCatModal(false);
      fetchStaticData(); // Refresh dropdowns
      fetchProductos(); // Refresh table names
    } catch (error) {
      toast.error('Error al guardar categoría');
    }
  };

  const handleDeleteCategoria = async (id) => {
    if (!window.confirm('¿Eliminar categoría?')) return;
    try {
      await axios.delete(`${API_URL}categorias.php?id=${id}`, { headers });
      toast.success('Categoría eliminada');
      fetchStaticData();
      fetchProductos();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  // --- Marcas Logic ---
  const handleSaveMarca = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (currentMarca) data.id = currentMarca.id;
    try {
      await axios[currentMarca ? 'put' : 'post'](`${API_URL}marcas.php`, data, { headers });
      toast.success('Marca guardada');
      setShowMarcaModal(false);
      fetchStaticData();
      fetchProductos();
    } catch (error) {
      toast.error('Error al guardar marca');
    }
  };

  const handleDeleteMarca = async (id) => {
    if (!window.confirm('¿Eliminar marca?')) return;
    try {
      await axios.delete(`${API_URL}marcas.php?id=${id}`, { headers });
      toast.success('Marca eliminada');
      fetchStaticData();
      fetchProductos();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  // const filteredProductos = productos; // Direct use as backend filters it

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package /> Maestro de Productos
        </h1>
        <div className="flex bg-white rounded-lg shadow p-1">
          <button 
            onClick={() => setActiveTab('productos')}
            className={`px-4 py-2 rounded-md ${activeTab === 'productos' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Productos
          </button>
          <button 
            onClick={() => setActiveTab('categorias')}
            className={`px-4 py-2 rounded-md ${activeTab === 'categorias' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Categorías
          </button>
          <button 
            onClick={() => setActiveTab('marcas')}
            className={`px-4 py-2 rounded-md ${activeTab === 'marcas' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Marcas
          </button>
        </div>
      </div>

      {activeTab === 'productos' && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between mb-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input 
                type="text" 
                placeholder="Buscar productos..." 
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={() => { setCurrentProd(null); setShowProdModal(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
            >
              <Plus size={20} /> Nuevo Producto
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría/Marca</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {productos.map(prod => (
                  <tr key={prod.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{prod.codigo_interno || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{prod.nombre}</div>
                      <div className="text-xs text-gray-500">{prod.unidad_medida}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {prod.categoria_nombre || 'Sin Cat.'} <br/>
                      <span className="text-xs">{prod.marca_nombre || 'Sin Marca'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${prod.stock <= prod.stock_minimo ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {prod.stock}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">S/ {parseFloat(prod.precio).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => { setCurrentProd(prod); setShowProdModal(true); }} className="text-blue-600 hover:text-blue-900 mr-3"><Edit size={18} /></button>
                      <button onClick={() => handleDeleteProducto(prod.id)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50"
              >
                <ChevronLeft size={20} /> Anterior
              </button>
              <span className="text-gray-600 font-medium">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 flex items-center gap-2 hover:bg-gray-50"
              >
                Siguiente <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categorias' && (
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-4xl mx-auto">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Listado de Categorías</h2>
            <button onClick={() => { setCurrentCat(null); setShowCatModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
              <Plus size={20} /> Nueva Categoría
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Descripción</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(cat => (
                <tr key={cat.id} className="border-t">
                  <td className="px-6 py-4">{cat.nombre}</td>
                  <td className="px-6 py-4 text-gray-500">{cat.descripcion}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => { setCurrentCat(cat); setShowCatModal(true); }} className="text-blue-600 mr-3"><Edit size={18}/></button>
                    <button onClick={() => handleDeleteCategoria(cat.id)} className="text-red-600"><Trash2 size={18}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Brands Tab */}
      {activeTab === 'marcas' && (
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-4xl mx-auto">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Listado de Marcas</h2>
            <button onClick={() => { setCurrentMarca(null); setShowMarcaModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
              <Plus size={20} /> Nueva Marca
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Descripción</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {marcas.map(marca => (
                <tr key={marca.id} className="border-t">
                  <td className="px-6 py-4">{marca.nombre}</td>
                  <td className="px-6 py-4 text-gray-500">{marca.descripcion}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => { setCurrentMarca(marca); setShowMarcaModal(true); }} className="text-blue-600 mr-3"><Edit size={18}/></button>
                    <button onClick={() => handleDeleteMarca(marca.id)} className="text-red-600"><Trash2 size={18}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Modal */}
      {showProdModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
            <div className="px-4 md:px-6 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h3 className="text-xl font-bold">{currentProd ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button onClick={() => setShowProdModal(false)} className="text-gray-500 hover:text-gray-700"><X /></button>
            </div>
            <form 
              onSubmit={handleSaveProducto} 
              className="px-4 md:px-6 py-4 md:py-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 overflow-y-auto"
            >
              
              {/* General Info */}
              <div className="col-span-1 md:col-span-2">
                <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 border-b pb-1">Información General</h4>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre del Producto</label>
                  <input name="nombre" defaultValue={currentProd?.nombre} required className="mt-1 w-full border rounded-md p-2" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                    <label className="block text-sm font-medium text-gray-700">Código Interno</label>
                    <input name="codigo_interno" defaultValue={currentProd?.codigo_interno} className="mt-1 w-full border rounded-md p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Código Barras</label>
                    <input name="codigo_barras" defaultValue={currentProd?.codigo_barras} className="mt-1 w-full border rounded-md p-2" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Categoría</label>
                    <select name="categoria_id" defaultValue={currentProd?.categoria_id} className="mt-1 w-full border rounded-md p-2">
                      <option value="">Seleccione</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Marca</label>
                    <select name="marca_id" defaultValue={currentProd?.marca_id} className="mt-1 w-full border rounded-md p-2">
                      <option value="">Seleccione</option>
                      {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700">Descripción</label>
                   <textarea name="descripcion" defaultValue={currentProd?.descripcion} className="mt-1 w-full border rounded-md p-2 h-20"></textarea>
                </div>
              </div>

              <div className="space-y-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tipo</label>
                      <select name="tipo" defaultValue={currentProd?.tipo || 'producto'} className="mt-1 w-full border rounded-md p-2">
                        <option value="producto">Producto</option>
                        <option value="servicio">Servicio</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Unidad Medida</label>
                      <select name="unidad_medida" defaultValue={currentProd?.unidad_medida || 'NIU'} className="mt-1 w-full border rounded-md p-2">
                        <option value="NIU">Unidad (NIU)</option>
                        <option value="ZZ">Servicio (ZZ)</option>
                        <option value="KG">Kilogramos</option>
                        <option value="MTR">Metros</option>
                      </select>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Precio Venta</label>
                      <input type="number" step="0.01" name="precio" defaultValue={currentProd?.precio} className="mt-1 w-full border rounded-md p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Stock Inicial</label>
                      <input type="number" name="stock" defaultValue={currentProd?.stock} className="mt-1 w-full border rounded-md p-2" disabled={!!currentProd} />
                    </div>
                 </div>
                 
                 <div className="pt-4">
                   <h4 className="text-sm font-bold text-gray-500 uppercase mb-2 border-b pb-1">Configuración Stock</h4>
                   <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600">Min</label>
                        <input type="number" name="stock_minimo" defaultValue={currentProd?.stock_minimo} className="w-full border rounded p-1" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600">Max</label>
                        <input type="number" name="stock_maximo" defaultValue={currentProd?.stock_maximo} className="w-full border rounded p-1" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600">Reposición</label>
                        <input type="number" name="punto_reposicion" defaultValue={currentProd?.punto_reposicion} className="w-full border rounded p-1" />
                      </div>
                   </div>
                 </div>

                 <div className="flex gap-4 pt-2">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="maneja_lotes" defaultChecked={currentProd?.maneja_lotes} /> Lotes</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="maneja_series" defaultChecked={currentProd?.maneja_series} /> Series</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="maneja_vencimiento" defaultChecked={currentProd?.maneja_vencimiento} /> Vencimientos</label>
                 </div>
              </div>

              {/* Accounting Info */}
              <div className="col-span-1 md:col-span-2">
                 <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 border-b pb-1">Contabilidad</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cta. Contable Compra</label>
                      <input name="cuenta_contable_compra" defaultValue={currentProd?.cuenta_contable_compra} className="mt-1 w-full border rounded-md p-2" placeholder="Ej: 6011" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cta. Contable Venta</label>
                      <input name="cuenta_contable_venta" defaultValue={currentProd?.cuenta_contable_venta} className="mt-1 w-full border rounded-md p-2" placeholder="Ej: 7012" />
                    </div>
                 </div>
              </div>

              <div className="col-span-1 md:col-span-2 flex flex-col md:flex-row justify-end gap-3 mt-4 pt-4 border-t">
                <button type="button" onClick={() => setShowProdModal(false)} className="w-full md:w-auto px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button type="submit" className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar Producto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category/Brand Modals (Simplified) */}
      {(showCatModal || showMarcaModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h3 className="text-lg font-bold mb-4">
              {showCatModal ? (currentCat ? 'Editar Categoría' : 'Nueva Categoría') : (currentMarca ? 'Editar Marca' : 'Nueva Marca')}
            </h3>
            <form onSubmit={showCatModal ? handleSaveCategoria : handleSaveMarca}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Nombre</label>
                <input name="nombre" defaultValue={showCatModal ? currentCat?.nombre : currentMarca?.nombre} required className="w-full border rounded p-2" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Descripción</label>
                <textarea name="descripcion" defaultValue={showCatModal ? currentCat?.descripcion : currentMarca?.descripcion} className="w-full border rounded p-2"></textarea>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowCatModal(false); setShowMarcaModal(false); }} className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default MaestroProductos;
