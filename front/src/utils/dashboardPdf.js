import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';
import { API_URL } from '../api/config';
import { toast } from 'react-hot-toast';

const getBase64ImageFromURL = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute('crossOrigin', 'anonymous');
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL("image/png");
            resolve(dataURL);
        };
        img.onerror = error => reject(error);
        img.src = url;
    });
};

export const generateDashboardPDF = async (data, headers) => {
    if (!data) {
        toast.error("No hay datos para generar el reporte");
        return;
    }

    const toastId = toast.loading("Generando Reporte Gerencial...");
    let emp = null;

    try {
        const resEmp = await axios.get(`${API_URL}empresa.php?t=${new Date().getTime()}`, { headers });
        emp = resEmp.data;
    } catch (error) {
        console.error("Error cargando datos de empresa", error);
    }

    try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        
        // Colors
        const primaryColor = [30, 58, 138]; // Blue-900
        const secondaryColor = [100, 116, 139]; // Slate-500
        const accentColor = [37, 99, 235]; // Blue-600

        // 1. Header
        let yPos = 20;
        
        // Logo
        if (emp?.logo) {
            try {
                const logoUrl = `${API_URL}public_files.php?path=${emp.logo}`;
                const logoBase64 = await getBase64ImageFromURL(logoUrl);
                const imgProps = doc.getImageProperties(logoBase64);
                const pdfWidth = 30; 
                const logoHeight = (imgProps.height * pdfWidth) / imgProps.width;
                doc.addImage(logoBase64, 'PNG', 14, 10, pdfWidth, logoHeight, undefined, 'FAST');
            } catch (error) {
                console.error("Error loading logo:", error);
            }
        }

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(...primaryColor);
        doc.text("Reporte Gerencial", pageWidth - 14, 25, { align: "right" });
        
        doc.setFontSize(10);
        doc.setTextColor(...secondaryColor);
        doc.text(`Generado el: ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pageWidth - 14, 32, { align: "right" });

        yPos = 50;

        // 2. Executive Summary (KPIs)
        doc.setFontSize(16);
        doc.setTextColor(...primaryColor);
        doc.text("Resumen Ejecutivo (Este Mes)", 14, yPos);
        yPos += 10;

        const kpiWidth = (pageWidth - 28) / 4;
        const kpiHeight = 25;
        
        const kpis = [
            { label: "Ventas Mes", value: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(data.kpis.ventas_mes.value) },
            { label: "Ingresos Totales", value: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(data.kpis.ingresos_totales.value) },
            { label: "Nuevos Clientes", value: data.kpis.nuevos_clientes.value },
            { label: "Gastos Operativos", value: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(data.kpis.gastos_operativos.value) }
        ];

        kpis.forEach((kpi, index) => {
            const x = 14 + (index * kpiWidth);
            doc.setFillColor(248, 250, 252); // Slate-50
            doc.setDrawColor(226, 232, 240); // Slate-200
            doc.roundedRect(x, yPos, kpiWidth - 4, kpiHeight, 2, 2, 'FD');
            
            doc.setFontSize(9);
            doc.setTextColor(...secondaryColor);
            doc.text(kpi.label, x + (kpiWidth - 4)/2, yPos + 8, { align: "center" });
            
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...primaryColor);
            doc.text(String(kpi.value), x + (kpiWidth - 4)/2, yPos + 18, { align: "center" });
        });

        yPos += kpiHeight + 15;

        // 3. Financial Summary
        doc.setFontSize(16);
        doc.setTextColor(...primaryColor);
        doc.text("Indicadores Financieros", 14, yPos);
        yPos += 10;

        const financials = [
            { label: "Margen Neto", value: `${data.financieros?.margen_neto?.value || 0}%` },
            { label: "EBITDA", value: `${data.financieros?.ebitda?.value || 0}%` },
            { label: "ROI", value: `${data.financieros?.roi?.value || 0}%` },
            { label: "Cash Flow", value: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(data.financieros?.cash_flow?.value || 0) }
        ];

        financials.forEach((fin, index) => {
            const x = 14 + (index * kpiWidth);
            doc.setFillColor(30, 41, 59); // Slate-800
            doc.setDrawColor(30, 41, 59);
            doc.roundedRect(x, yPos, kpiWidth - 4, kpiHeight, 2, 2, 'FD');
            
            doc.setFontSize(9);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.text(fin.label, x + (kpiWidth - 4)/2, yPos + 8, { align: "center" });
            
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(255, 255, 255);
            doc.text(String(fin.value), x + (kpiWidth - 4)/2, yPos + 18, { align: "center" });
        });

        yPos += kpiHeight + 15;

        // 4. Sales vs Goal Table
        doc.setFontSize(14);
        doc.setTextColor(...primaryColor);
        doc.text("Rendimiento de Ventas (Últimos 6 meses)", 14, yPos);
        yPos += 5;

        autoTable(doc, {
            startY: yPos,
            head: [['Mes', 'Ventas Reales', 'Meta', 'Cumplimiento']],
            body: data.ventas_por_mes.map(item => {
                const cumplimiento = item.meta > 0 ? ((item.ventas / item.meta) * 100).toFixed(1) + '%' : 'N/A';
                return [
                    item.name,
                    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(item.ventas),
                    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(item.meta),
                    cumplimiento
                ];
            }),
            theme: 'striped',
            headStyles: { fillColor: primaryColor },
            styles: { fontSize: 10, cellPadding: 3 },
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // 5. Top Products & Expenses (Side by Side if space permits, otherwise sequential)
        // Sequential is safer for PDF flow
        
        // Top Products
        doc.setFontSize(14);
        doc.setTextColor(...primaryColor);
        doc.text("Top 5 Productos Más Vendidos", 14, yPos);
        yPos += 5;

        autoTable(doc, {
            startY: yPos,
            head: [['Producto', 'Cantidad Vendida']],
            body: data.top_productos.map(item => [
                item.name,
                item.ventas
            ]),
            theme: 'striped',
            headStyles: { fillColor: accentColor },
            styles: { fontSize: 10, cellPadding: 3 },
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // Expense Distribution
        doc.setFontSize(14);
        doc.setTextColor(...primaryColor);
        doc.text("Distribución de Gastos (Top 5)", 14, yPos);
        yPos += 5;

        autoTable(doc, {
            startY: yPos,
            head: [['Concepto / Proveedor', 'Monto']],
            body: data.distribucion_gastos.map(item => [
                item.name,
                new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(item.value)
            ]),
            theme: 'striped',
            headStyles: { fillColor: [225, 29, 72] }, // Rose-600
            styles: { fontSize: 10, cellPadding: 3 },
        });

        // Footer
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: "center" });
        }

        doc.save(`Reporte_Gerencial_${new Date().toISOString().slice(0,10)}.pdf`);
        toast.success("Reporte generado exitosamente", { id: toastId });

    } catch (error) {
        console.error("Error generating dashboard PDF:", error);
        toast.error("Error al generar el reporte PDF", { id: toastId });
    }
};
