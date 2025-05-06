var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var app = express();
var fs = require('fs');
var path = require('path');

var dotenv = require('dotenv');
var estafeta = require('./src/routes/estafeta');
var test_pi = require('./src/routes/test_pi');
var validator = require('./src/validators/encuesta');
const logger = require('./src/helpers/logger');

// Cargar variables de entorno
dotenv.config();

/**
 * Manejador de excepciones no capturadas
 * Ahora registra el error pero no termina la aplicación
 */

process.on('uncaughtException', (error) => {
  logger.logAction(
    'ERR_RUNTIME', 
    'Uncaught exception: ' + error.message,
    'global:exception_handler',
    {
      stack: error.stack,
      name: error.name
    }
  );
  console.error('❌ Uncaught Exception detected:', error.message);
});

/**
 * Manejador de rechazos de promesas no manejadas
 * Registra el error sin terminar el proceso.
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.logAction(
    'ERR_PROMISE_REJECTION', 
    'Unhandled promise rejection: ' + (reason.message || reason),
    'global:promise_handler',
    {
      stack: reason.stack,
      reason: reason
    }
  );
  console.error('❌ Unhandled Promise Rejection:', reason.message || reason);
});

/**
 * Configuración de Express
 */
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json({
  limit: '10mb' // Limitar el tamaño del payload para prevenir ataques DOS
}));
app.use(cookieParser());
app.use(express.static('./public', { 
  maxAge: '1d' // Caché de recursos estáticos para mejor rendimiento
}));

/**
 * Configuración CORS
 */
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

/**
 * Middleware de registro de solicitudes
 * Ignora las solicitudes de recursos estáticos para evitar la saturación de los logs
 */
app.use((req, res, next) => {
  if (!req.path.startsWith('/css/') && !req.path.startsWith('/js/') && !req.path.startsWith('/img/')) {
    logger.logAction('INFO_REQUEST', 'Petición HTTP recibida', 'app.js:middleware', { 
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  }
  next();
});

/**
 * Middleware de tiempo de espera para rutas
 * Previene que las solicitudes se queden colgadas indefinidamente
 */
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    const err = new Error('Request timeout');
    err.status = 408;
    next(err);
  });
  next();
});

/**
 * API Routes
 */
app.post('/search', validator.curp, (req, res, next) => {
  try {
    estafeta.search(req, res).catch(next);
  } catch (error) {
    next(error);
  }
});

app.post('/encuesta', validator.encuesta, (req, res, next) => {
  try {
    estafeta.store(req, res).catch(next);
  } catch (error) {
    next(error);
  }
});

app.get('/test', (req, res, next) => {
  try {
    test_pi.test(req, res).catch(next);
  } catch (error) {
    next(error);
  }
});

// Endpoint de verificación de salud para Code Engine
app.get('/', (req, res) => {
  logger.logAction('INFO_HEALTH', 'Verificación de salud', 'app.js:healthCheck');
  res.status(200).send('🟢 Aplicación corriendo');
});

// Ruta de prueba para disparar un error crítico y validar envío de correo
app.get('/test-error', (req, res) => {
  logger.logAction('ERR_008', '💥 Prueba de error crítico manual', 'app.js:/test-error', {
    mensaje: 'Esto es una prueba para forzar un error crítico'
  });

  res.json({
    message: 'Error crítico de prueba generado'
  });
});


// Manejador de 404 para rutas no definidas
app.use((req, res, next) => {
  if (!res.headersSent) {
    logger.logAction('WARN_NOT_FOUND', 'Ruta no encontrada', 'app.js:notFoundHandler', {
      path: req.path,
      method: req.method
    });
    res.status(404).json({
      message: 'Recurso no encontrado'
    });
  }
});

/**
 * Manejador de errores 
 * Categoriza adecuadamente los errores y proporciona respuestas apropiadas
 */
app.use((err, req, res, next) => {
  // Definir categorías de errores para un procesamiento más fácil
  const connectionErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ESOCKETTIMEDOUT'];
  const fileSystemErrors = ['EACCES', 'ENOENT', 'EISDIR', 'EMFILE'];
  const memoryErrors = ['ENOMEM'];
  
  // Determinar el tipo de error y registrar adecuadamente
  if (connectionErrors.includes(err.code)) {
    logger.logAction('ERR_DB_CONNECTION', 'Error de conexión a base de datos o servicios', 'app.js:errorHandler', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      code: err.code
    });
  } else if (fileSystemErrors.includes(err.code)) {
    logger.logAction('ERR_FILESYSTEM', 'Error en el sistema de archivos', 'app.js:errorHandler', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      code: err.code
    });
  } else if (memoryErrors.includes(err.code)) {
    logger.logAction('ERR_MEMORY', 'Error de memoria en el servidor', 'app.js:errorHandler', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      code: err.code
    });
  } else if (err.name === 'UnauthorizedError' || err.status === 401 || err.status === 403) {
    logger.logAction('ERR_AUTH', 'Error de autenticación o autorización', 'app.js:errorHandler', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      user: req.user ? req.user.id : 'anonymous'
    });
  } else if (err.status === 429) {
    logger.logAction('ERR_RATE_LIMIT', 'Límite de solicitudes excedido', 'app.js:errorHandler', {
      message: err.message,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  } else if (err.message && err.message.includes('env')) {
    logger.logAction('ERR_CONFIG', 'Error en la configuración del entorno', 'app.js:errorHandler', {
      message: err.message,
      stack: err.stack,
      missingEnv: err.requiredVar
    });
  } else if (err.name === 'PayloadTooLargeError' || err.status === 413) {
    logger.logAction('ERR_PAYLOAD', 'Tamaño de solicitud excedido', 'app.js:errorHandler', {
      message: err.message,
      path: req.path,
      method: req.method,
      contentLength: req.headers['content-length']
    });
  } else if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    logger.logAction('ERR_PARSING', 'Error al analizar el cuerpo de la solicitud', 'app.js:errorHandler', {
      message: err.message,
      path: req.path,
      method: req.method
    });
  } else {
    logger.logAction('ERR_SERVER', 'Error no controlado del servidor', 'app.js:errorHandler', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  }
  
  // Asegurarnos de no enviar múltiples respuestas
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      message: process.env.NODE_ENV === 'production' 
        ? 'Ha ocurrido un error interno. Por favor intente más tarde.'
        : err.message || 'Error interno del servidor'
    });
  }
});

/**
 * Arranque del servidor con recuperación de errores
 */
const PORT = process.env.PORT || 8080;
let server;

function startServer() {
  try {
    server = app.listen(PORT, () => {
      logger.logAction('INFO_START', 'Servidor iniciado', 'app.js:server', { 
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
      console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
    });
    
    // Manejar errores específicos del servidor
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.logAction('ERR_PORT_IN_USE', 'Puerto ya está en uso', 'app.js:server', {
          port: PORT,
          message: error.message
        });
        console.error(`❌ Puerto ${PORT} ya está en uso. Intentando otro puerto...`);
        setTimeout(() => {
          server.close();
          app.listen(PORT + 1);
        }, 1000);
      } else {
        logger.logAction('ERR_SERVER', 'Error en el servidor HTTP', 'app.js:server', {
          message: error.message,
          stack: error.stack,
          code: error.code
        });
        console.error('❌ Error en el servidor HTTP:', error.message);
      }
    });
    
    // Apagado limpio al recibir la señal SIGTERM
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    function gracefulShutdown() {
      logger.logAction('INFO_SHUTDOWN', 'Apagado graceful del servidor', 'app.js:server');
      console.log('🛑 Apagando servidor...');
      
      server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
      });
    }
  } catch (error) {
    logger.logAction('ERR_RUNTIME', 'Error crítico al iniciar el servidor', 'app.js:server', {
      message: error.message,
      stack: error.stack,
      port: PORT
    });
    console.error('❌ Error al iniciar el servidor:', error.message);
    
    // Reintentar el arranque del servidor después de un retraso
    console.log('⏳ Intentando reiniciar el servidor en 10 segundos...');
    setTimeout(startServer, 10000);
  }
}

// Iniciar el servidor
startServer();