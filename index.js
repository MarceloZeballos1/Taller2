const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const PDFDocument = require("pdfkit");
const { format } = require("date-fns");
const fs = require("fs");

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Conexión a MySQL (ajusta puerto si es necesario)
const db = mysql.createConnection({
  host: "localhost",
  port: 3308,
  user: "root",
  password: "",
  database: "monitoreo_agua",
});

db.connect((err) => {
  if (err) {
    console.error("❌ Error en conexión a MySQL:", err);
  } else {
    console.log("✅ Conectado a la base de datos MySQL");
  }
});

// Recibir datos del ESP32
app.post("/api/datos", (req, res) => {
  const { temp, tds, ec, resistividad, salinidad, pureza, ph } = req.body;

  if (
    temp === undefined || tds === undefined || ec === undefined ||
    resistividad === undefined || salinidad === undefined ||
    pureza === undefined || ph === undefined
  ) {
    return res.status(400).json({ error: "Faltan datos en la solicitud." });
  }

  const sql = `INSERT INTO mediciones (temp, tds, ec, resistividad, salinidad, pureza, ph, fecha)
               VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;

  const valores = [temp, tds, ec, resistividad, salinidad, pureza, ph];

  db.query(sql, valores, (err) => {
    if (err) {
      console.error("❌ Error al insertar en MySQL:", err);
      return res.status(500).json({ error: "Error al guardar datos." });
    }
    console.log("📥 Datos recibidos y guardados:", req.body);
    res.json({ mensaje: "✅ Datos guardados correctamente" });
  });
});

// Obtener los últimos 100 registros
app.get("/datos", (req, res) => {
  db.query("SELECT * FROM mediciones ORDER BY fecha ASC LIMIT 100", (err, results) => {
    if (err) {
      return res.status(500).send("Error al obtener datos");
    }
    res.json(results);
  });
});

// Obtener datos por rango de fechas
app.get("/datos/rango", (req, res) => {
  const { inicio, fin } = req.query;
  if (!inicio || !fin) {
    return res.status(400).json({ error: "Faltan fechas inicio o fin" });
  }

  // Validar formato de fecha y hora (nuevo)
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;
  if (!dateTimeRegex.test(inicio) || !dateTimeRegex.test(fin)) {
    return res.status(400).json({ 
      error: "Formato de fecha inválido. Use YYYY-MM-DD o YYYY-MM-DD HH:MM:SS" 
    });
  }

  // Asegurar formato completo (nuevo)
  const inicioCompleto = inicio.includes(' ') ? inicio : `${inicio} 00:00:00`;
  const finCompleto = fin.includes(' ') ? fin : `${fin} 23:59:59`;

  const sql = `SELECT * FROM mediciones WHERE fecha BETWEEN ? AND ? ORDER BY fecha ASC`;
  db.query(sql, [inicioCompleto, finCompleto], (err, results) => {
    if (err) return res.status(500).json({ error: "Error al consultar datos" });
    res.json(results);
  });
});

// Generar PDF con tablas perfectamente alineadas en todas las páginas
app.post("/reporte/pdf", (req, res) => {
  const { inicio, fin, nombre } = req.body;

  if (!inicio || !fin || !nombre) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  // Validar formato de fecha y hora
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (!dateTimeRegex.test(inicio) || !dateTimeRegex.test(fin)) {
    return res.status(400).json({ 
      error: "Formato de fecha/hora inválido. Use YYYY-MM-DD HH:MM:SS" 
    });
  }

  const sql = `SELECT * FROM mediciones WHERE fecha BETWEEN ? AND ? ORDER BY fecha ASC`;

  db.query(sql, [inicio, fin], (err, results) => {
    if (err) return res.status(500).json({ error: "Error al consultar datos" });

    if (!results.length) {
      return res.status(404).json({ error: "No hay datos en ese rango" });
    }

    // Calcular estadísticas
    const n = results.length;
    const promedio = results.reduce((acc, row) => {
      acc.temp += row.temp;
      acc.tds += row.tds;
      acc.ec += row.ec;
      acc.resistividad += row.resistividad;
      acc.salinidad += row.salinidad;
      acc.pureza += row.pureza;
      acc.ph += row.ph;
      return acc;
    }, { temp: 0, tds: 0, ec: 0, resistividad: 0, salinidad: 0, pureza: 0, ph: 0 });

    for (const key in promedio) promedio[key] /= n;

    const minimos = {
      temp: Math.min(...results.map(r => r.temp)),
      tds: Math.min(...results.map(r => r.tds)),
      ec: Math.min(...results.map(r => r.ec)),
      resistividad: Math.min(...results.map(r => r.resistividad)),
      salinidad: Math.min(...results.map(r => r.salinidad)),
      pureza: Math.min(...results.map(r => r.pureza)),
      ph: Math.min(...results.map(r => r.ph))
    };

    const maximos = {
      temp: Math.max(...results.map(r => r.temp)),
      tds: Math.max(...results.map(r => r.tds)),
      ec: Math.max(...results.map(r => r.ec)),
      resistividad: Math.max(...results.map(r => r.resistividad)),
      salinidad: Math.max(...results.map(r => r.salinidad)),
      pureza: Math.max(...results.map(r => r.pureza)),
      ph: Math.max(...results.map(r => r.ph))
    };

    // Crear PDF
    const doc = new PDFDocument({ 
      margin: 40, 
      size: 'A4',
      bufferPages: true 
    });
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Reporte_Calidad_Agua_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    doc.pipe(res);

    // Configuración de fuentes
    doc.registerFont('Helvetica-Bold', 'Helvetica-Bold');
    doc.registerFont('Helvetica', 'Helvetica');

    // Encabezado
    doc
      .fillColor('#333333')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('REPORTE DE CALIDAD DE AGUA', { align: 'center' })
      .moveDown(0.5);

    // Información del reporte
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555555')
      .text(`Generado por: ${nombre}`, { align: 'left' })
      .text(`Período: ${format(new Date(inicio), 'dd/MM/yyyy HH:mm:ss')} - ${format(new Date(fin), 'dd/MM/yyyy HH:mm:ss')}`, { align: 'left' })
      .text(`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, { align: 'left' })
      .text(`Total de registros: ${results.length}`, { align: 'left' })
      .moveDown(1);

    // Línea divisoria
    doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke()
      .moveDown(1);

    // Sección de promedios
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#0066cc')
      .text('RESUMEN ESTADÍSTICO', { align: 'left' })
      .moveDown(0.5);

    // Definición de parámetros
    const parametros = [
      { nombre: 'Temperatura', unidad: '°C', key: 'temp' },
      { nombre: 'TDS', unidad: 'ppm', key: 'tds' },
      { nombre: 'Conductividad Eléctrica', unidad: 'µS/cm', key: 'ec' },
      { nombre: 'Resistividad', unidad: 'ohm·cm', key: 'resistividad' },
      { nombre: 'Salinidad', unidad: 'PSU', key: 'salinidad' },
      { nombre: 'Pureza', unidad: '%', key: 'pureza' },
      { nombre: 'pH', unidad: '', key: 'ph' }
    ];

    // Configuración de tabla de resumen
    const resumenCol1 = 180;
    const resumenCols = 90;
    const resumenTableWidth = resumenCol1 + (3 * resumenCols);
    const resumenStartX = (doc.page.width - resumenTableWidth) / 2;
    const rowHeight = 20;

    // Encabezado de tabla de resumen
    const headerY = doc.y;
    doc
      .fillColor('#e0e0e0')
      .rect(resumenStartX, headerY, resumenTableWidth, rowHeight)
      .fill();

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#333333');

    doc.text('PARÁMETRO', resumenStartX + 5, headerY + 5, { width: resumenCol1 - 10, align: 'left' });
    doc.text('PROMEDIO', resumenStartX + resumenCol1, headerY + 5, { width: resumenCols, align: 'center' });
    doc.text('MÍNIMO', resumenStartX + resumenCol1 + resumenCols, headerY + 5, { width: resumenCols, align: 'center' });
    doc.text('MÁXIMO', resumenStartX + resumenCol1 + (2 * resumenCols), headerY + 5, { width: resumenCols, align: 'center' });

    doc.y = headerY + rowHeight;

    // Filas de tabla de resumen
    parametros.forEach((param, i) => {
      const rowY = doc.y;
      
      if (i % 2 === 0) {
        doc
          .fillColor('#f5f5f5')
          .rect(resumenStartX, rowY, resumenTableWidth, rowHeight)
          .fill();
      }

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#333333')
        .text(
          `${param.nombre}${param.unidad ? ` (${param.unidad})` : ''}`,
          resumenStartX + 5,
          rowY + 5,
          { width: resumenCol1 - 10, align: 'left' }
        );

      // Valores numéricos
      const valores = [
        promedio[param.key].toFixed(2),
        minimos[param.key].toFixed(2),
        maximos[param.key].toFixed(2)
      ];

      for (let j = 0; j < 3; j++) {
        doc.text(
          valores[j],
          resumenStartX + resumenCol1 + (j * resumenCols),
          rowY + 5,
          { width: resumenCols, align: 'center' }
        );
      }

      doc.y += rowHeight;
    });

    doc.moveDown(1);

    // Sección de datos detallados
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#0066cc')
      .text('DATOS DETALLADOS', { align: 'left' })
      .moveDown(0.5);

    // Configuración de columnas detalladas
    const detailHeaders = [
      { text: "Fecha y Hora", width: 140 },
      { text: "Temp (°C)", width: 60 },
      { text: "pH", width: 40 },
      { text: "TDS (ppm)", width: 60 },
      { text: "EC (µS/cm)", width: 60 },
      { text: "Resist (ohm·cm)", width: 90 },
      { text: "Sal (PSU)", width: 60 },
      { text: "Pureza (%)", width: 60 }
    ];

    const detailTableWidth = detailHeaders.reduce((sum, h) => sum + h.width, 0);
    const detailStartX = (doc.page.width - detailTableWidth) / 2;

    // Función para dibujar encabezados de tabla detallada
    const drawDetailHeader = (yPos) => {
      doc
        .fillColor('#e0e0e0')
        .rect(detailStartX, yPos, detailTableWidth, rowHeight)
        .fill();

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#333333');

      let currentX = detailStartX;
      detailHeaders.forEach(header => {
        doc.text(
          header.text,
          currentX,
          yPos + 5,
          {
            width: header.width,
            align: 'center'
          }
        );
        currentX += header.width;
      });
    };

    // Dibujar encabezado inicial
    drawDetailHeader(doc.y);
    doc.y += rowHeight;

    // Filas de datos detallados
    doc.fontSize(8).font('Helvetica');
    
    results.forEach((row, rowIndex) => {
      // Verificar si necesita nueva página (dejando espacio para el encabezado)
      if (doc.y > doc.page.height - 50 - rowHeight) {
        doc.addPage();
        doc.y = 40;
        drawDetailHeader(doc.y);
        doc.y += rowHeight;
      }

      const rowY = doc.y;
      
      if (rowIndex % 2 === 0) {
        doc
          .fillColor('#f9f9f9')
          .rect(detailStartX, rowY, detailTableWidth, rowHeight)
          .fill();
      }

      let currentX = detailStartX;
      
      const formattedDate = format(new Date(row.fecha), 'dd/MM/yy HH:mm:ss');
      const values = [
        formattedDate,
        row.temp.toFixed(2),
        row.ph.toFixed(2),
        row.tds.toFixed(2),
        row.ec.toFixed(2),
        row.resistividad.toFixed(2),
        row.salinidad.toFixed(2),
        row.pureza.toFixed(2)
      ];

      values.forEach((value, colIndex) => {
        doc
          .fillColor('#333333')
          .text(
            value,
            currentX,
            rowY + 5,
            {
              width: detailHeaders[colIndex].width,
              align: 'center'
            }
          );
        currentX += detailHeaders[colIndex].width;
      });

      doc.y += rowHeight;
    });

    // Pie de página - solo agregar a las páginas que realmente tienen contenido
    /*const totalPages = doc.bufferedPageRange().count;
    
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `Página ${i + 1} de ${totalPages}`,
          50,
          doc.page.height - 30,
          { align: 'center', width: 500 }
        );
    }
    */
    doc.end();
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${port}`);
});