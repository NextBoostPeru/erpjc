import React, { useState } from 'react';
import { FileText, CheckCircle, AlertCircle, HelpCircle, BookOpen, Download, Search } from 'lucide-react';

const InstruccionesFacturacion = () => {
    const [activeTab, setActiveTab] = useState('facturacion');

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-8 fade-in">
            {/* Header General */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-4 mb-6 border-b pb-4">
                    <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                        <BookOpen size={32} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Manual de Usuario</h1>
                        <p className="text-gray-500">Guías y procedimientos para el uso del sistema</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('facturacion')}
                        className={`px-6 py-3 font-medium text-sm transition-colors relative ${
                            activeTab === 'facturacion'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Facturación Electrónica
                    </button>
                    <button
                        onClick={() => setActiveTab('ventas')}
                        className={`px-6 py-3 font-medium text-sm transition-colors relative ${
                            activeTab === 'ventas'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Registro de Ventas
                    </button>
                </div>

                <div className="mt-8">
                    {/* Contenido Facturación Electrónica */}
                    {activeTab === 'facturacion' && (
                        <div className="space-y-8 fade-in">
                            <div className="flex items-center gap-2 mb-4">
                                <FileText className="text-blue-500" />
                                <h2 className="text-xl font-bold text-gray-800">Emisión de Comprobantes</h2>
                            </div>

                            <section className="space-y-4">
                                <p className="text-gray-600 leading-relaxed">
                                    Este módulo permite la emisión de Facturas y Boletas Electrónicas válidas ante la SUNAT. 
                                    Siga los pasos a continuación para asegurar una correcta emisión.
                                </p>
                            </section>

                            <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                                    Selección del Cliente
                                </h3>
                                <ul className="space-y-2 text-gray-600 ml-8 list-disc">
                                    <li>Seleccione el <strong>Tipo de Documento</strong>: RUC (para Facturas) o DNI (para Boletas).</li>
                                    <li>Ingrese el número de documento y haga clic en la <strong>lupa</strong> para buscar datos automáticamente.</li>
                                    <li>Verifique que la Razón Social sea correcta.</li>
                                </ul>
                            </section>

                            <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                                    Detalles del Comprobante
                                </h3>
                                <div className="ml-8 grid md:grid-cols-2 gap-4">
                                    <div className="bg-white p-4 rounded border">
                                        <h4 className="font-semibold text-gray-700 mb-2">Moneda</h4>
                                        <p className="text-sm text-gray-600">Elija Soles (PEN) o Dólares (USD).</p>
                                    </div>
                                    <div className="bg-white p-4 rounded border border-blue-100">
                                        <h4 className="font-semibold text-blue-700 mb-2">Condición de Pago</h4>
                                        <p className="text-sm text-gray-600">
                                            <strong>Contado</strong> (inmediato) o <strong>Crédito</strong> (con vencimiento a 15, 30, 45, 60 días).
                                        </p>
                                    </div>
                                </div>
                            </section>

                            <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
                                    Agregar Items y Emitir
                                </h3>
                                <ul className="space-y-2 text-gray-600 ml-8 list-disc">
                                    <li>Ingrese descripción, cantidad y precio unitario. Haga clic en <strong>Agregar</strong>.</li>
                                    <li>Revise los totales (Gravada, IGV, Total).</li>
                                    <li>Haga clic en <strong>Emitir Comprobante</strong> para finalizar.</li>
                                    <li>Podrá descargar el PDF y XML inmediatamente.</li>
                                </ul>
                            </section>
                        </div>
                    )}

                    {/* Contenido Registro de Ventas */}
                    {activeTab === 'ventas' && (
                        <div className="space-y-8 fade-in">
                            <div className="flex items-center gap-2 mb-4">
                                <BookOpen className="text-green-500" />
                                <h2 className="text-xl font-bold text-gray-800">Gestión de Registro de Ventas</h2>
                            </div>

                            <section className="space-y-4">
                                <p className="text-gray-600 leading-relaxed">
                                    El módulo de Registro de Ventas permite consultar, filtrar y exportar el historial de todos los comprobantes emitidos.
                                </p>
                            </section>

                            <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <Search className="text-blue-600" size={20} />
                                    Búsqueda y Filtros
                                </h3>
                                <p className="text-gray-600 mb-4 ml-8">
                                    Utilice la barra superior para localizar comprobantes específicos:
                                </p>
                                <ul className="space-y-2 text-gray-600 ml-8 list-disc">
                                    <li><strong>Por Fecha:</strong> Seleccione un rango de fechas (Desde - Hasta) para ver ventas de un periodo.</li>
                                    <li><strong>Por Cliente:</strong> Escriba el nombre o número de documento en el buscador.</li>
                                    <li><strong>Por Serie/Número:</strong> Ingrese la serie (ej. F001) o correlativo para búsqueda exacta.</li>
                                </ul>
                            </section>

                            <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <FileText className="text-blue-600" size={20} />
                                    Visualización de Estado
                                </h3>
                                <div className="ml-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-green-50 p-3 rounded border border-green-100">
                                        <span className="font-bold text-green-700 block mb-1">Aceptado</span>
                                        <span className="text-xs text-green-600">Comprobante válido y enviado a SUNAT.</span>
                                    </div>
                                    <div className="bg-red-50 p-3 rounded border border-red-100">
                                        <span className="font-bold text-red-700 block mb-1">Anulado</span>
                                        <span className="text-xs text-red-600">Comprobante dado de baja.</span>
                                    </div>
                                    <div className="bg-yellow-50 p-3 rounded border border-yellow-100">
                                        <span className="font-bold text-yellow-700 block mb-1">Pendiente</span>
                                        <span className="text-xs text-yellow-600">Generado pero no enviado (revisar envío).</span>
                                    </div>
                                </div>
                            </section>

                            <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <Download className="text-blue-600" size={20} />
                                    Exportación y Descargas
                                </h3>
                                <ul className="space-y-2 text-gray-600 ml-8 list-disc">
                                    <li><strong>Excel:</strong> Haga clic en el botón "Exportar Excel" para descargar el reporte completo de las ventas filtradas.</li>
                                    <li><strong>PDF/XML:</strong> En cada fila de la tabla, utilice los botones de acción para volver a descargar el comprobante digital.</li>
                                </ul>
                            </section>
                        </div>
                    )}

                    {/* Contenido Caja y Bancos */}
                    {activeTab === 'tesoreria' && (
                        <div className="space-y-8 fade-in">
                            <div className="flex items-center gap-2 mb-4">
                                <Wallet className="text-purple-600" />
                                <h2 className="text-xl font-bold text-gray-800">Gestión de Tesorería (Caja y Bancos)</h2>
                            </div>

                            <section className="space-y-4">
                                <p className="text-gray-600 leading-relaxed">
                                    Este módulo centraliza el control del flujo de efectivo y operaciones bancarias. 
                                    Se divide en dos áreas principales: <strong>Caja Chica</strong> para efectivo y <strong>Bancos</strong> para cuentas financieras.
                                </p>
                            </section>

                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Sección Caja */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
                                        <Wallet className="text-blue-600" size={20} />
                                        Control de Caja Chica
                                    </h3>
                                    
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
                                        <h4 className="font-semibold text-gray-700">1. Apertura y Cierre</h4>
                                        <ul className="text-sm text-gray-600 space-y-2 list-disc ml-4">
                                            <li><strong>Apertura:</strong> Al inicio del día, ingrese el monto inicial de efectivo. Es obligatorio para registrar movimientos.</li>
                                            <li><strong>Cierre:</strong> Al finalizar, realice el "Arqueo de Caja" ingresando el monto final real. El sistema calculará automáticamente si hay sobrantes o faltantes.</li>
                                        </ul>
                                    </div>

                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
                                        <h4 className="font-semibold text-gray-700">2. Registro de Movimientos</h4>
                                        <ul className="text-sm text-gray-600 space-y-2 list-disc ml-4">
                                            <li>Use los botones <strong>Ingreso</strong> (Verde) o <strong>Egreso</strong> (Rojo) para registrar entradas o salidas de dinero.</li>
                                            <li>Especifique concepto, monto y si es necesario, asocie una cuenta contable.</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Sección Bancos */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
                                        <Landmark className="text-blue-600" size={20} />
                                        Gestión Bancaria
                                    </h3>

                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
                                        <h4 className="font-semibold text-gray-700">1. Cuentas Bancarias</h4>
                                        <p className="text-sm text-gray-600">
                                            Registre sus cuentas (BCP, BBVA, Interbank, etc.) definiendo la moneda (Soles/Dólares) y el saldo inicial.
                                        </p>
                                    </div>

                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
                                        <h4 className="font-semibold text-gray-700">2. Operaciones Disponibles</h4>
                                        <ul className="text-sm text-gray-600 space-y-2">
                                            <li className="flex items-start gap-2">
                                                <ArrowRight size={16} className="mt-0.5 text-blue-500 shrink-0"/>
                                                <span><strong>Transferencias:</strong> Mueva dinero entre sus propias cuentas registradas.</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <ArrowRight size={16} className="mt-0.5 text-blue-500 shrink-0"/>
                                                <span><strong>Cheques:</strong> Emita cheques y lleve el control de su estado (Emitido/Cobrado).</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <ArrowRight size={16} className="mt-0.5 text-blue-500 shrink-0"/>
                                                <span><strong>Conciliación:</strong> Marque movimientos como conciliados para cuadrar con su extracto bancario.</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InstruccionesFacturacion;
