const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone'); // Cambiado a moment-timezone

// Configuración de correo electrónico
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',  // Servidor SMTP de Microsoft 365 (Office 365)
  port: 587,                   // Puerto para STARTTLS
  secure: false,               // STARTTLS
  auth: {
    user: process.env.EMAIL_USER,  
    pass: process.env.EMAIL_PASSWORD
  }
});

// Lista de destinatarios
const destinatarios = [
  process.env.ADMIN_EMAIL,
  process.env.ING_EMAIL,
  process.env.TEC_EMAIL
].filter(Boolean); // Elimina valores undefined o vacíos


// Ruta del archivo de log
const LOG_FILE = path.join(__dirname, '../../logs/application.log');

// Asegurar que el directorio de logs existe
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Registro de la última vez que se envió un reporte semanal
let lastWeeklyReport = null;

// Lista de códigos de error considerados críticos - SOLO ESTOS generarán correos
const CRITICAL_ERROR_CODES = [
  'ERR_050',         // Error crítico al crear adjunto
  'ERR_060',         // Error crítico al guardar respuestas
  'ERR_COMM_FAILURE', // Fallo de comunicación con servicios externos
  'ERR_DB_CONNECTION', // Problemas de conexión a BD
  'ERR_SERVER',      // Problemas del servidor
  'ERR_RUNTIME',     // Errores de ejecución de la aplicación
  'ERR_FILESYSTEM',  // Errores de sistema de archivos
  'ERR_MEMORY',      // Errores de memoria
  'ERR_CONFIG',      // Errores de configuración de entorno
  'ERR_AUTH'         // Errores de autenticación/autorización críticos
];

// Lista de códigos de error que indican encuestas fallidas
const FAILED_SURVEY_CODES = [
  'ERR_005',   // Error al guardar adjunto (1)
  'ERR_006',   // Error al guardar adjunto (2)
  'ERR_007',   // Error al guardar respuestas (3)
  'ERR_008',   // Error al guardar respuestas (4)
  'ERR_050',   // Error crítico al crear adjunto
  'ERR_060'    // Error crítico al guardar respuestas
];

// Función para determinar si un error es crítico basado en su código
function isErrorCritical(code) {
  return CRITICAL_ERROR_CODES.includes(code);
}

// Función para determinar si un error indica una encuesta fallida
function isFailedSurvey(code) {
  return FAILED_SURVEY_CODES.includes(code);
}

// Función para obtener la fecha y hora actual en la zona horaria de México
function getMexicoDateTime() {
  return moment().tz('America/Mexico_City');
}

// Función para formatear una fecha en formato local mexicano
function formatMexicoDate(date) {
  return moment(date).tz('America/Mexico_City').format('DD/MM/YYYY');
}

// Función para formatear fecha y hora en formato local mexicano
function formatMexicoDateTime(date) {
  return moment(date).tz('America/Mexico_City').format('DD/MM/YYYY HH:mm:ss');
}

// Función para obtener las estadísticas de la semana actual
function getWeeklyStatistics() {
  // Definir el rango de la semana actual (desde el lunes anterior hasta ahora)
  const now = getMexicoDateTime().toDate();
  const oneWeekAgo = getMexicoDateTime().subtract(7, 'days').toDate();
  
  // Inicializar estadísticas
  let statistics = {
    totalRequests: 0,
    successfulSurveys: 0,
    failedSurveys: 0,
    errors: {
      critical: 0,
      normal: 0
    },
    uniqueUsers: new Set(),
    errorsByType: {} // Para contar ocurrencias por tipo de error
  };

  try {
    if (!fs.existsSync(LOG_FILE)) {
      return statistics;
    }

    // Leer y procesar el archivo de logs
    const logData = fs.readFileSync(LOG_FILE, 'utf8');
    const logLines = logData.split('\n').filter(line => line.trim());
    
    for (const line of logLines) {
      try {
        const logEntry = JSON.parse(line);
        // Convertir timestamp a fecha en zona horaria de México
        const logDate = moment(logEntry.timestamp).tz('America/Mexico_City').toDate();
        
        // Solo considerar entradas dentro del período de una semana
        if (logDate >= oneWeekAgo && logDate <= now) {
          // Contar todas las peticiones HTTP y de información general
          if (logEntry.code.startsWith('INFO_REQUEST')) {
            statistics.totalRequests++;
          }
          
          // Contar encuestas exitosas
          if (logEntry.code === 'INFO_SURVEY_SUCCESS') {
            statistics.successfulSurveys++;
          }
          
          // Contar errores y encuestas fallidas
          if (logEntry.code.startsWith('ERR_')) {
            // Registrar por tipo de error
            if (!statistics.errorsByType[logEntry.code]) {
              statistics.errorsByType[logEntry.code] = {
                count: 0,
                description: logEntry.description || 'Sin descripción'
              };
            }
            statistics.errorsByType[logEntry.code].count++;
            
            // Clasificar como crítico o normal
            if (isErrorCritical(logEntry.code)) {
              statistics.errors.critical++;
            } else {
              statistics.errors.normal++;
            }
            
            // Verificar si este error indica una encuesta fallida
            if (isFailedSurvey(logEntry.code)) {
              statistics.failedSurveys++;
            }
          }
          
          // Agregar usuarios únicos por CURP o código externo
          if (logEntry.data) {
            if (logEntry.data.curp) {
              statistics.uniqueUsers.add(logEntry.data.curp);
            } else if (logEntry.data.external_code) {
              statistics.uniqueUsers.add(logEntry.data.external_code);
            }
          }
        }
      } catch (error) {
        // Ignorar líneas que no puedan ser parseadas
        console.error('Error al procesar línea de log:', error);
      }
    }
  } catch (error) {
    console.error('Error al leer archivo de log:', error);
  }
  
  return statistics;
}

// Función para enviar correo de error crítico
async function sendCriticalErrorEmail(errorData) {
  // Leer la imagen y convertirla a base64
  let logoHtml = '';
  try {
    const logoPath = path.join(__dirname, '../../public/images/logoholistictec.jpg');
    const logoData = fs.readFileSync(logoPath);
    const logoBase64 = logoData.toString('base64');
    logoHtml = `<img src="data:image/jpeg;base64,${logoBase64}" alt="Logo" style="max-width: 150px;" />`;
  } catch (error) {
    console.error('Error al cargar la imagen del logo:', error);
    logoHtml = '<div style="height: 50px;"></div>'; 
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: destinatarios.join(','),
    subject: '⚠️ ERROR CRÍTICO - Onboarding Estafeta',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
            ${logoHtml}
        </div>
        <h2 style="color: #d32f2f; text-align: center;">Error Crítico Detectado</h2>
        <p><strong>Fecha y Hora:</strong> ${formatMexicoDateTime(new Date())}</p>
        <p><strong>Código:</strong> ${errorData.code}</p>
        <p><strong>Descripción:</strong> ${errorData.description}</p>
        <p><strong>Origen:</strong> ${errorData.origin}</p>
        <p><strong>Detalles:</strong></p>
        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(errorData.data, null, 2)}</pre>
        <p style="text-align: center; font-size: 12px; color: #757575;">HolisticTec - ${getMexicoDateTime().year()}</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✉️ Correo de error crítico enviado');
  } catch (error) {
    console.error('Error al enviar correo de error crítico:', error);
  }
}

// Función para enviar reporte semanal
async function sendWeeklyReport() {
  const today = getMexicoDateTime();
  const oneWeekAgo = getMexicoDateTime().subtract(7, 'days');
  
  // Obtener estadísticas de la semana
  const statistics = getWeeklyStatistics();
  
  // Cargar logo
  let logoHtml = '';
  try {
    const logoPath = path.join(__dirname, '../../public/images/logoholistictec.jpg');
    const logoData = fs.readFileSync(logoPath);
    const logoBase64 = logoData.toString('base64');
    logoHtml = `<img src="data:image/jpeg;base64,${logoBase64}" alt="Logo" style="max-width: 150px;" />`;
  } catch (error) {
    console.error('Error al cargar la imagen del logo:', error);
    logoHtml = '<div style="height: 50px;"></div>';
  }

  // Crear tabla HTML para errores
  let errorsTable = '';
  if (Object.keys(statistics.errorsByType).length > 0) {
    errorsTable = `
      <h3>Errores Detectados</h3>
      <div style="font-size: 80%;">
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f2f2f2;">
            <th>Código</th>
            <th>Descripción</th>
            <th>Ocurrencias</th>
          </tr>
          ${Object.entries(statistics.errorsByType).map(([code, data]) => `
            <tr>
              <td>${code}</td>
              <td>${data.description}</td>
              <td>${data.count}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `;
  } else {
    errorsTable = '<p>No se detectaron errores en la última semana. ¡Sistema funcionando correctamente!</p>';
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: destinatarios.join(','),
    subject: '📊 Reporte Semanal - Onboarding Estafeta',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
            ${logoHtml}
        </div>
        <h2 style="color: #1976d2; text-align: center;">REPORTE SEMANAL ONBOARDING ESTAFETA</h2>
        <p><strong>Período:</strong> ${formatMexicoDate(oneWeekAgo.toDate())} - ${formatMexicoDate(today.toDate())}</p>
        
        <h3>Estadísticas Generales</h3>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f2f2f2;">
            <th>Métrica</th>
            <th>Valor</th>
          </tr>
          <tr>
            <td>Total de Peticiones</td>
            <td>${statistics.totalRequests}</td>
          </tr>
          <tr>
            <td>Encuestas Completadas Exitosamente</td>
            <td>${statistics.successfulSurveys}</td>
          </tr>
          <tr>
            <td>Encuestas Fallidas</td>
            <td>${statistics.failedSurveys}</td>
          </tr>
          <tr>
            <td>Usuarios Únicos</td>
            <td>${statistics.uniqueUsers.size}</td>
          </tr>
          <tr>
            <td>Errores Críticos</td>
            <td>${statistics.errors.critical}</td>
          </tr>
          <tr>
            <td>Errores Normales</td>
            <td>${statistics.errors.normal}</td>
          </tr>
        </table>
        
        ${errorsTable}
        
        <p style="text-align: center; font-size: 12px; color: #757575; margin-top: 30px;">
          HolisticTec - Reporte Generado el ${formatMexicoDateTime(new Date())}
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✉️ Reporte semanal enviado');
    lastWeeklyReport = new Date();
  } catch (error) {
    console.error('Error al enviar reporte semanal:', error);
  }
}

// Verificación para envío de reporte semanal (solo lunes a las 7am)
function shouldSendWeeklyReport() {
  const now = getMexicoDateTime();
  
  // SOLO enviar reporte si es lunes (día 1) Y la hora es 7am (entre 7:00 y 7:15)
  const isMonday = now.day() === 1; // En moment.js, el lunes es 1
  const is7AM = now.hour() === 7 && now.minute() < 15;
  
  // Solo retorna true si ambas condiciones se cumplen
  return isMonday && is7AM;
  // Para pruebas: return true;
}

// Función principal de logging
function logAction(code, description, origin, data = {}) {
  // Utilizar momento actual en zona horaria de México
  const timestamp = getMexicoDateTime().format('YYYY-MM-DDTHH:mm:ss.SSS') + 
                    getMexicoDateTime().format('Z'); // Incluye el offset de zona horaria
  
  const isCritical = isErrorCritical(code);
  
  const logEntry = {
    timestamp,
    code,
    description,
    origin,
    data
  };
  
  // Escribir al log
  fs.appendFileSync(
    LOG_FILE, 
    JSON.stringify(logEntry) + '\n', 
    { encoding: 'utf8' }
  );
  
  // También log a la consola para visibilidad inmediata
  console.log(`[${timestamp}] [${code}] [${origin}] - ${description}`);
  
  // SOLO enviar correo si el error está en la lista explícita de errores críticos
  if (isCritical) {
    sendCriticalErrorEmail(logEntry);
  }
  
  // Verificar si es momento de enviar el reporte semanal
  if (shouldSendWeeklyReport()) {
    // Solo ejecutamos esto si es lunes a las 7am
    // Y solo si no hemos enviado un reporte en las últimas 20 horas (para evitar duplicados)
    const noRecentReport = !lastWeeklyReport || 
                          (getMexicoDateTime().toDate() - lastWeeklyReport) > 20 * 60 * 60 * 1000;
    
    if (noRecentReport) {
      sendWeeklyReport();
    }
  }
}

module.exports = {
  logAction,
};