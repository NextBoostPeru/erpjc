import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Actualiza el estado para que el siguiente renderizado muestre la UI alternativa
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // También puedes registrar el error en un servicio de reporte de errores
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Puedes renderizar cualquier UI personalizada
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
          <AlertTriangle size={64} className="text-red-600 mb-4" />
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Algo salió mal</h1>
          <p className="text-gray-600 mb-6 max-w-md">
            Se ha producido un error inesperado en la aplicación. 
            Por favor, intente recargar la página.
          </p>
          
          <div className="bg-white border border-red-200 rounded-lg p-4 mb-6 text-left w-full max-w-2xl overflow-auto max-h-64 font-mono text-sm shadow-sm text-red-600">
            <strong>{this.state.error && this.state.error.toString()}</strong>
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </div>

          <button 
            onClick={this.handleReload}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={18} /> Recargar Página
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
