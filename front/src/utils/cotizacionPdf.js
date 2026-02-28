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

export const generateCotizacionPDF = async (cotData, headers, action = 'save', returnBlob = false) => {
    if (!cotData) {
        toast.error("No hay datos de cotización para generar el PDF");
        return;
    }

    let emp = null;
    let acredLogos = [];
    let bancos = [];
    const toastId = toast.loading("Generando PDF...");
    
    try {
        // Load data in parallel
        const [resEmp, resAcred, resBancos] = await Promise.all([
             axios.get(`${API_URL}empresa.php?t=${new Date().getTime()}`, { headers }),
             axios.get(`${API_URL}acreditaciones.php?active=true`, { headers }).catch(() => ({ data: [] })),
             axios.get(`${API_URL}bancos.php?action=listar_cuentas`, { headers }).catch(() => ({ data: [] }))
        ]);
        
        emp = resEmp.data;
        acredLogos = resAcred.data || [];
        bancos = (resBancos.data || []).filter(b => b.mostrar_en_pdf == 1 && b.estado === 'Activo');
        
    } catch (error) {
        console.error("Error cargando datos para PDF", error);
        toast.error("No se pudieron cargar todos los datos auxiliares.", { id: toastId });
        // Continuar con lo que se tenga
    }

    try {
        const doc = new jsPDF();
        
        const razonSocial = emp?.razon_social || emp?.nombre_comercial || "EMPRESA";
        const ruc = emp?.ruc || "";
        const direccion = emp?.domicilio_fiscal || "";
        const logoPath = emp?.logo;

        const primaryColor = [30, 58, 138]; 
        const secondaryColor = [100, 116, 139]; 
        
        let yPos = 20;
        const xPos = 14;
        let logoHeight = 0;

        if (logoPath) {
            try {
                const logoUrl = `${API_URL}public_files.php?path=${logoPath}`;
                const logoBase64 = await getBase64ImageFromURL(logoUrl);
                
                const imgProps = doc.getImageProperties(logoBase64);
                const pdfWidth = 40; 
                logoHeight = (imgProps.height * pdfWidth) / imgProps.width;
                
                doc.addImage(logoBase64, 'PNG', 14, 10, pdfWidth, logoHeight, undefined, 'FAST');
                yPos = Math.max(yPos, 10 + logoHeight + 5);
            } catch (error) {
                console.error("Error loading logo:", error);
            }
        }

        doc.setDrawColor(...primaryColor);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(140, 10, 60, 25, 1, 1, 'FD');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...primaryColor);
        doc.text("R.U.C. " + ruc, 170, 16, { align: "center" });
        
        doc.setFillColor(...primaryColor);
        doc.rect(140, 20, 60, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text("COTIZACIÓN", 170, 25.5, { align: "center" });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text(`${cotData.serie} - ${String(cotData.correlativo).padStart(6, '0')}`, 170, 32, { align: "center" });

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...primaryColor);
        doc.text(razonSocial, xPos, yPos);
        yPos += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...secondaryColor);
        
        const addressLines = doc.splitTextToSize(direccion, 100); 
        doc.text(addressLines, xPos, yPos);
        yPos += (addressLines.length * 3.5) + 5; 
        
        const boxY = Math.max(yPos, 45); 
        
        doc.setFontSize(9);
        const maxTextWidth = 70;
        const clienteNameLines = doc.splitTextToSize(cotData.cliente_razon_social || '', maxTextWidth);
        const clienteDirLines = doc.splitTextToSize(cotData.cliente_direccion || "-", maxTextWidth);
        
        const lineHeight = 4;
        const initialY = boxY;
        
        let leftY = initialY + 12;
        const nameHeight = clienteNameLines.length * lineHeight;
        const docY = leftY + Math.max(nameHeight, lineHeight) + 2; 
        const dirLabelY = docY + lineHeight + 2;
        const dirHeight = clienteDirLines.length * lineHeight;
        
        let extraHeight = 0;
        if (cotData.cliente_nombre_contacto) extraHeight += 5;
        if (cotData.cliente_telefono) extraHeight += 5;

        const leftTotalHeight = (dirLabelY - initialY) + dirHeight + 4 + extraHeight;
        
        let rightTotalHeight = 30; 
        if (cotData.asesor_nombre) rightTotalHeight += 5;
        if (cotData.asesor_telefono) rightTotalHeight += 5;

        const boxHeight = Math.max(leftTotalHeight, rightTotalHeight);

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, boxY, 186, boxHeight, 1, 1, 'F');
        
        doc.setFontSize(9);
        doc.setTextColor(...primaryColor);
        doc.setFont("helvetica", "bold");
        doc.text("DATOS DEL CLIENTE", 20, boxY + 6);
        
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "bold");
        doc.text("Señor(es):", 20, boxY + 12);
        
        doc.setFont("helvetica", "normal");
        doc.text(clienteNameLines, 45, boxY + 12);
        
        const rucY = boxY + 12 + (clienteNameLines.length * 4) + 1; 
        
        doc.setFont("helvetica", "bold");
        doc.text(cotData.cliente_tipo_doc === '6' ? 'RUC:' : 'DNI:', 20, rucY);
        doc.setFont("helvetica", "normal");
        doc.text(cotData.cliente_num_doc || '', 45, rucY);
        
        const dirY = rucY + 5;
        
        doc.setFont("helvetica", "bold");
        doc.text("Dirección:", 20, dirY);
        doc.setFont("helvetica", "normal");
        doc.text(clienteDirLines, 45, dirY);

        // Calculate Y position for next elements based on address lines
        const addressHeight = clienteDirLines.length * 4;
        let nextY = dirY + Math.max(addressHeight, 4) + 1;

        if (cotData.cliente_nombre_contacto) {
            doc.setFont("helvetica", "bold");
            doc.text("Contacto:", 20, nextY);
            doc.setFont("helvetica", "normal");
            doc.text(cotData.cliente_nombre_contacto, 45, nextY);
            nextY += 5;
        }

        if (cotData.cliente_telefono) {
            doc.setFont("helvetica", "bold");
            doc.text("Teléfono:", 20, nextY);
            doc.setFont("helvetica", "normal");
            doc.text(cotData.cliente_telefono, 45, nextY);
        }

        const col2X = 120;
        doc.setTextColor(...primaryColor);
        doc.setFont("helvetica", "bold");
        doc.text("CONDICIONES", col2X, boxY + 6);

        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "bold");
        doc.text("Fecha Emisión:", col2X, boxY + 12);
        doc.setFont("helvetica", "normal");
        doc.text(cotData.fecha_emision || '', col2X + 30, boxY + 12);
        
        doc.setFont("helvetica", "bold");
        doc.text("Moneda:", col2X, boxY + 17);
        doc.setFont("helvetica", "normal");
        doc.text(cotData.moneda === 'PEN' ? 'Soles (S/)' : 'Dólares ($)', col2X + 30, boxY + 17);

        if (cotData.fecha_vencimiento && cotData.fecha_vencimiento !== '0000-00-00') {
            doc.setFont("helvetica", "bold");
            doc.text("Vencimiento:", col2X, boxY + 22);
            doc.setFont("helvetica", "normal");
            doc.text(cotData.fecha_vencimiento, col2X + 30, boxY + 22);
        }

        if (cotData.asesor_nombre) {
            const asesorY = boxY + 27;
            doc.setFont("helvetica", "bold");
            doc.text("Asesor:", col2X, asesorY);
            doc.setFont("helvetica", "normal");
            doc.text(cotData.asesor_nombre, col2X + 30, asesorY);
            
            if (cotData.asesor_telefono) {
                doc.setFont("helvetica", "bold");
                doc.text("Tel:", col2X, asesorY + 5);
                doc.setFont("helvetica", "normal");
                doc.text(cotData.asesor_telefono, col2X + 30, asesorY + 5);
            }
        }

        const tableStartY = boxY + boxHeight + 5;
        
        const tableColumn = ["ITEM", "DESCRIPCIÓN", "CANT.", "U.M.", "P. UNIT", "TOTAL"];
        const tableRows = [];

        // Ensure items is an array
        const items = Array.isArray(cotData.items) ? cotData.items : [];

        items.forEach((item, index) => {
            const subConceptoLines = (item.sub_concepto || '')
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            const descripcion = subConceptoLines.length > 0
                ? `${item.descripcion}\n${subConceptoLines.map(l => `• ${l}`).join('\n')}`
                : item.descripcion;

            const itemData = [
                index + 1,
                descripcion,
                item.cantidad,
                item.unidad_medida || 'NIU',
                parseFloat(item.precio_unitario).toFixed(2),
                parseFloat(item.valor_venta).toFixed(2)
            ];
            tableRows.push(itemData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: tableStartY,
            theme: 'grid',
            headStyles: { 
                fillColor: primaryColor, 
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 8
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [50, 50, 50]
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 15, halign: 'center' },
                3: { cellWidth: 15, halign: 'center' },
                4: { cellWidth: 25, halign: 'right' },
                5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 14, right: 14 }
        });

        const finalY = doc.lastAutoTable.finalY + 5;

        const rightMargin = 196;
        const valueX = 196;
        const labelX = 150;
        
        doc.setFontSize(9);
        
        doc.setTextColor(100);
        doc.text("Op. Gravada:", labelX, finalY + 5);
        doc.setTextColor(0);
        doc.text(`${cotData.moneda} ${parseFloat(cotData.total_gravada || 0).toFixed(2)}`, valueX, finalY + 5, { align: "right" });
        
        if (parseFloat(cotData.descuento_global) > 0) {
            doc.setTextColor(100);
            doc.text("Descuento Global:", labelX, finalY + 9);
            doc.setTextColor(0);
            doc.text(`-${cotData.moneda} ${parseFloat(cotData.descuento_global).toFixed(2)}`, valueX, finalY + 9, { align: "right" });
        }

        doc.setTextColor(100);
        doc.text("I.G.V. (18%):", labelX, finalY + 13);
        doc.setTextColor(0);
        doc.text(`${cotData.moneda} ${parseFloat(cotData.total_igv || 0).toFixed(2)}`, valueX, finalY + 13, { align: "right" });
        
        doc.setDrawColor(200);
        doc.line(labelX, finalY + 16, valueX, finalY + 16);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...primaryColor);
        doc.text("TOTAL:", labelX, finalY + 22);
        doc.text(`${cotData.moneda} ${parseFloat(cotData.total_importe || 0).toFixed(2)}`, valueX, finalY + 22, { align: "right" });

        let footerY = finalY + 28;
        
        const drawFooterBlock = (title, content) => {
            if (!content) return;
            
            if (footerY > 260) {
                doc.addPage();
                footerY = 20;
            }

            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...primaryColor);
            doc.text(title, 14, footerY);
            
            doc.setDrawColor(200);
            const lines = doc.splitTextToSize(content, 176); 
            const height = Math.max(10, lines.length * 4) + 4;
            
            doc.rect(14, footerY + 2, 182, height);
            
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80);
            doc.text(lines, 16, footerY + 6);
            
            footerY += height + 8;
        };

        drawFooterBlock("OBSERVACIONES:", cotData.observaciones || "Sin observaciones.");
        drawFooterBlock("CONDICIÓN DE PAGO:", cotData.condicion_pago);
        drawFooterBlock("VALIDEZ DE LA OFERTA:", cotData.validez_oferta);
        drawFooterBlock("CONDICIONES DEL SERVICIO:", cotData.condiciones_servicio);

        if (bancos && bancos.length > 0) {
            let bancosText = "";
            bancos.forEach(b => {
                bancosText += `${b.nombre_banco} - ${b.moneda}\n`;
                if(b.titular) bancosText += `Titular: ${b.titular}\n`;
                bancosText += `N° Cuenta: ${b.numero_cuenta}\n`;
                if(b.cci) bancosText += `CCI: ${b.cci}\n`;
                bancosText += "\n";
            });
            drawFooterBlock("CUENTAS BANCARIAS:", bancosText);
        }

        // Accreditation Logos
        if (acredLogos && acredLogos.length > 0) {
            // Ensure space
            if (footerY > 250) {
                doc.addPage();
                footerY = 20;
            }

            // Title
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...primaryColor);
            doc.text("NUESTRAS ACREDITACIONES:", 14, footerY);
            footerY += 5;

            const startX = 14;
            const logoW = 22; // Width of each logo
            const gap = 10;
            let currentX = startX;

            for (const acred of acredLogos) {
                if (acred.imagen_path) {
                    try {
                         const imgUrl = `${API_URL}public_files.php?path=${acred.imagen_path}`;
                         const logoBase64 = await getBase64ImageFromURL(imgUrl);
                         
                         // Calculate height to maintain aspect ratio
                         const imgProps = doc.getImageProperties(logoBase64);
                         const logoH = (imgProps.height * logoW) / imgProps.width;
                         
                         // Check if logo fits in remaining height (if close to bottom)
                         if (footerY + logoH > 280) {
                            doc.addPage();
                            footerY = 20;
                            currentX = startX;
                         }

                         doc.addImage(logoBase64, 'PNG', currentX, footerY, logoW, logoH, undefined, 'FAST');
                         
                         currentX += logoW + gap;
                         
                         // Wrap if too many
                         if (currentX > 180) {
                             currentX = startX;
                             footerY += 25; // Move down row
                         }
                    } catch (e) {
                        console.error("Error adding accreditation logo:", e);
                    }
                }
            }
            // Add some padding after logos
             footerY += 20;
        }

        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text("Generado por Sistema ERP", 14, 285, { align: 'left' });
            doc.text(`Página ${i} de ${pageCount}`, 196, 285, { align: 'right' });
            doc.text("Documento generado electrónicamente. No tiene valor fiscal hasta su canje por comprobante de pago.", 105, 285, { align: "center" });
        }
        
        if (returnBlob) {
            toast.dismiss(toastId);
            return doc.output('blob');
        }

        if (action === 'print') {
            doc.autoPrint();
            window.open(doc.output('bloburl'), '_blank');
        } else {
            doc.save(`Cotizacion_${cotData.serie}-${String(cotData.correlativo).padStart(6, '0')}.pdf`);
        }
        toast.dismiss(toastId);

    } catch (e) {
        console.error("Error al generar PDF:", e);
        toast.error("Error al generar el PDF. Intente nuevamente.", { id: toastId });
    }
};
