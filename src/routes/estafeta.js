const fs = require('fs');
const zlib = require('zlib');
const convertCsvToXlsx = require('@aternus/csv-to-xlsx');
const api_successfactors = require("../services/api_successfactors");
const api_pi = require("../services/api_personality");
const pi = require("../helpers/personality-insights");
const moment = require('moment');
const logger = require('../helpers/logger');

/**
 * Buscar un usuario por CURP y verificar la disponibilidad de la encuesta
 */
exports.search = async (req, res) => {
  try {
    const curp = req.body.curp;
    logger.logAction('INFO_SEARCH_START', 'Iniciando búsqueda de CURP', 'estafeta.js:search', { curp });
    
    // Construir filtro para la consulta a la API
    const filter = `nationalIdNav/cardType eq 'PR' and nationalIdNav/nationalId eq '${curp}'`;
    
    // Verificar si la función existe antes de llamarla
    if (typeof api_successfactors.getPersonIdExt !== 'function') {
      throw new Error('La función getPersonIdExt no está definida en el módulo api_successfactors');
    }
    
    // Obtener información de la persona por CURP
    const personResponse = await api_successfactors.getPersonIdExt(filter);
    
    if (personResponse.status !== 200) {
      logger.logAction('ERR_001', 'Error en búsqueda de CURP', 'estafeta.js:search', { 
        status: personResponse.status, 
        message: 'Ocurrio un problema con la busqueda, intentalo nuevamente.',
        curp
      });
      return res.status(422).json({
        message: 'Ocurrio un problema con la busqueda, intentalo nuevamente.'
      });
    }
    
    // Manejar el caso cuando no se encuentra la CURP
    const results = personResponse.data.d.results;
    if (results.length <= 0) {
      logger.logAction('ERR_002', 'CURP no encontrado', 'estafeta.js:search', { curp });
      return res.status(422).json({
        message: 'Tu CURP no se encuentra para realizar la encuesta.'
      });
    }

    // Extraer información del usuario
    const external_code = results[0].personIdExternal;
    const full_name = results[0].personalInfoNav.results[0].displayName;

    logger.logAction('INFO_CURP_FOUND', 'CURP encontrado, verificando disponibilidad de encuesta', 'estafeta.js:search', { 
      external_code,
      full_name,
      curp
    });

    // Verificar si el usuario ya ha respondido la encuesta
    const surveyResponse = await api_successfactors.getOnbKeys(external_code);
    
    if (surveyResponse.status !== 200) {
      logger.logAction('ERR_003', 'Error al verificar disponibilidad de encuesta', 'estafeta.js:search', { 
        status: surveyResponse.status,
        external_code,
        curp
      });
      return res.status(422).json({
        message: 'Ocurrio un problema con la busqueda, intentalo nuevamente.'
      });
    }
    
    // Verificar si la encuesta ya fue respondida
    if (surveyResponse.data.d.results.length > 0) {
      logger.logAction('ERR_004', 'Encuesta ya contestada', 'estafeta.js:search', { 
        external_code,
        curp
      });
      return res.status(422).json({
        message: 'La encuesta para este CURP ya fue contestada.'
      });
    }

    // La encuesta está disponible para este usuario
    logger.logAction('INFO_SURVEY_AVAILABLE', 'Encuesta disponible para contestar', 'estafeta.js:search', { 
      external_code,
      full_name,
      curp
    });

    return res.json({
      message: 'Encontrado!',
      external_code,
      full_name,
    });
  } catch (error) {
  logger.logAction(
    'ERR_COMM_FAILURE', 
    'Error crítico en búsqueda de CURP: ' + error.message,
    'estafeta.js:search',
    { 
      curp: req.body?.curp || 'No disponible',
      error: error.stack
    }
  );
  
  return res.status(500).json({
    message: 'Ocurrió un error inesperado al procesar tu solicitud. Por favor intenta nuevamente más tarde.',
    success: false
  });
}
};

/**
 * Almacenar las respuestas de la encuesta y los archivos asociados
 */
exports.store = async (req, res) => {
  try {
    const external_code = req.body.external_code;
    
    logger.logAction('INFO_STORE_START', 'Iniciando guardado de encuesta', 'estafeta.js:store', { 
      external_code,
      comment_length: req.body.comments.length
    });

    const host = req.protocol + "://" + req.headers.host;
    
    logger.logAction('INFO_ATTACHMENT_START', 'Iniciando guardado de adjunto', 'estafeta.js:store', { 
      host,
      external_code
    });
    
    // Almacenar archivo adjunto (PDF con los detalles de personalidad)

    let attachmentResult;
    try {
      attachmentResult = await storeAttachment(req.body.comments, host);
    } catch (error) {
      logger.logAction('ERR_050', 'Error crítico al crear adjunto', 'estafeta.js:store', { 
        message: error.message,
        stack: error.stack,
        external_code
      });
      return res.status(422).json({
        message: 'Ocurrio un problema al procesar la encuesta, intentelo nuevamente!'
      });
    }

    // Validar la respuesta del almacenamiento del archivo adjunto
    if (attachmentResult.status !== 200) {
      logger.logAction('ERR_005', 'Error al guardar adjunto (1)', 'estafeta.js:store', { 
        status: attachmentResult.status,
        external_code
      });
      return res.status(422).json({
        message: 'Ocurrio un problema al guardar la encuesta (1), intentelo nuevamente!'
      });
    }
    
    if (attachmentResult.data.d[0].httpCode !== 200) {
      logger.logAction('ERR_006', 'Error al guardar adjunto (2)', 'estafeta.js:store', { 
        httpCode: attachmentResult.data.d[0].httpCode,
        external_code
      });
      return res.status(422).json({
        message: 'Ocurrio un problema al guardar la encuesta (2), intentelo más tarde!'
      });
    }

    // Extraer el ID del archivo adjunto de la respuesta
    const attachment_id = attachmentResult.data.d[0].key.split("/", 2)[1];
    
    logger.logAction('INFO_ATTACHMENT_SUCCESS', 'Adjunto guardado exitosamente', 'estafeta.js:store', { 
      attachment_id,
      external_code
    });
    
    logger.logAction('INFO_ANSWERS_START', 'Iniciando guardado de respuestas', 'estafeta.js:store', { 
      external_code,
      attachment_id
    });
    
    // Almacenar las respuestas de la encuesta
    let answersResult;
    try {
      answersResult = await storeAnswers(external_code, attachment_id, req.body);
    } catch (error) {
      logger.logAction('ERR_060', 'Error crítico al guardar respuestas', 'estafeta.js:store', { 
        message: error.message,
        stack: error.stack,
        external_code,
        attachment_id
      });
      return res.status(422).json({
        message: 'Ocurrio un problema al guardar la encuesta, intentelo nuevamente!'
      });
    }

    // Validar la respuesta del almacenamiento de las respuestas
    if (answersResult.status !== 200) {
      logger.logAction('ERR_007', 'Error al guardar respuestas (3)', 'estafeta.js:store', { 
        status: answersResult.status,
        external_code
      });
      return res.status(422).json({
        message: 'Ocurrio un problema al guardar la encuesta (3), intentelo nuevamente!'
      });
    }
    
    if (answersResult.data.d[0].httpCode !== 200) {
      logger.logAction('ERR_008', 'Error al guardar respuestas (4)', 'estafeta.js:store', { 
        httpCode: answersResult.data.d[0].httpCode,
        external_code
      });
      return res.status(422).json({
        message: 'Ocurrio un problema al guardar la encuesta (4), intentelo más tarde!'
      });
    }

    // Encuesta almacenada exitosamente
    logger.logAction('INFO_SURVEY_SUCCESS', 'Encuesta guardada exitosamente', 'estafeta.js:store', { 
      external_code,
      attachment_id
    });

    return res.json({
      message: 'Encuesta enviada correctamente, gracias por tu colaboración!'
    });
  } catch (error) {
    logger.logAction('ERR_COMM_FAILURE', 'Error no controlado en guardado de encuesta', 'estafeta.js:store', { 
      message: error.message,
      stack: error.stack,
      external_code: req.body?.external_code || 'No disponible'
    });
    
    return res.status(500).json({
      message: 'Ocurrió un error inesperado al procesar tu solicitud. Por favor intenta nuevamente más tarde.',
      success: false
    });
  }
};

/**
* Almacenar las respuestas de la encuesta en SuccessFactors
 * @param {string} external_code - Código externo del usuario
 * @param {string} attachment_id - ID del archivo adjunto PDF almacenado
 * @param {object} data - Datos de las respuestas de la encuesta
 * @returns {Promise<object>} - Respuesta de la API
 */

async function storeAnswers(external_code, attachment_id, data) {
  try {
    logger.logAction('INFO_PREPARE_ANSWERS', 'Preparando datos para guardar respuestas', 'estafeta.js:storeAnswers', { 
      external_code,
      attachment_id
    });
    
    const date_now = moment().tz('America/Mexico_City').format('YYYY-MM-DDTHH:mm:ss');

    // Preparar los datos del formulario para la API de SuccessFactors
    const form = {
      "__metadata": {
        "uri": `cust_Claves_ONB(effectiveStartDate=datetime'${date_now}',externalCode='${external_code}')`
      },
      "cust_curso_induccion": strToBool(data.q1),
      "cust_proposito_superior": strToBool(data.q2),
      "cust_valores_organizacionales": strToBool(data.q3),
      "cust_priorizacion_valores": strToBool(data.q4),
      "cust_herramientas_necesarias": strToBool(data.q5),
      "cust_apoyo_lider": strToBool(data.q6),
      "cust_respeto_colaboracion": strToBool(data.q7),
      "cust_clara_idea": strToBool(data.q8),    
      "cust_reclutamiento_seleccion": data.q10,
      "cust_proceso_bienvenida": data.q11,
      "cust_Comentarios_adicionales": data.comments,
      "cust_Carga_documentoNav": {
        "__metadata": { "uri": `Attachment(${attachment_id})` }
      }
    };

    console.log("🧪 Formulario enviado a SuccessFactors:");
    console.log(JSON.stringify(form, null, 2));

    // Registrar los datos de las respuestas (excluyendo los comentarios completos por brevedad)
    logger.logAction('INFO_SENDING_ANSWERS', 'Enviando respuestas a SuccessFactors', 'estafeta.js:storeAnswers', { 
      external_code,
      attachment_id,
      form_data: {
        q1: data.q1,
        q2: data.q2,
        q3: data.q3,
        q4: data.q4,
        q5: data.q5,
        q6: data.q6,
        q7: data.q7,
        q8: data.q8,
        q10: data.q10,
        q11: data.q11,
        comments_length: data.comments.length
      }
    });

    // Enviar los datos a SuccessFactors
    const response = await api_successfactors.storeAnswers(form);
    
    logger.logAction('INFO_ANSWERS_RESPONSE', 'Respuesta recibida de SuccessFactors', 'estafeta.js:storeAnswers', { 
      status: response.status,
      data: response.data
    });
    
    console.log("📬 Respuesta de SuccessFactors:");
    console.log(JSON.stringify(response.data, null, 2));
    
    return response;
  } catch (error) {
    logger.logAction('ERR_COMM_FAILURE', 'Error en la llamada a SuccessFactors', 'estafeta.js:storeAnswers', { 
      message: error.message,
      stack: error.stack,
      external_code,
      attachment_id
    });
    throw error;
  }
}

/**
 * * Generar PDF a partir de texto y almacenarlo como archivo adjunto
 * @param {string} text - Texto para convertir a PDF
 * @param {string} host - URL del servidor host
 * @returns {Promise<object>} - Respuesta de la API
 */

async function storeAttachment(text, host) {
  const filename = 'pi_' + Date.now() + '.pdf';
  const path = '/tmp/' + filename;
    
  logger.logAction('INFO_PDF_START', 'Iniciando generación de PDF', 'estafeta.js:storeAttachment', { 
    filename,
    text_length: text.length
  });
  
  // Crear el directorio de almacenamiento si no existe
  if (!fs.existsSync('./tmp/')) {
    fs.mkdirSync('./tmp/');
  }

  try {
    // Generar PDF a partir de texto
    await pi.getPDF(text, host, path);
    
    const stats = fs.statSync(path);
    console.log("📎 PDF generado:", filename);
    console.log("📎 Tamaño:", stats.size, "bytes");
    
    logger.logAction('INFO_PDF_SUCCESS', 'PDF generado exitosamente', 'estafeta.js:storeAttachment', { 
      filename,
      size: stats.size
    });

    // Leer el contenido del archivo como base64
    const contents = fs.readFileSync(path, { encoding: 'base64' });
    console.log("📎 Archivo base64 (primeros 100):", contents.slice(0, 100) + "...");

    // Preparar los datos del formulario para la API de SuccessFactors
    const form = [{
      "__metadata": { "uri": "Attachment" },
      "fileContent": contents,
      "fileName": filename,
      "module": "GENERIC_OBJECT",
      "userId": "APISAP",
      "ownerIdType": "USERSSYS_ID",
      "ownerId": "APISAP",
      "description": "Análisis de personalidad"
    }];

    logger.logAction('INFO_SENDING_ATTACHMENT', 'Enviando adjunto a SuccessFactors', 'estafeta.js:storeAttachment', { 
      filename,
      size: stats.size
    });
    
    // Enviar archivo adjunto a SuccessFactors
    const response = await api_successfactors.storeAttachment(form);

    logger.logAction('INFO_ATTACHMENT_RESPONSE', 'Respuesta de adjunto recibida', 'estafeta.js:storeAttachment', { 
      status: response.status,
      data: response.data
    });
    
    console.log("📤 Respuesta de storeAttachment:", JSON.stringify(response.data, null, 2));

    // Limpiar archivo temporal
    fs.unlinkSync(path);
    
    return response;
  } catch (error) {
    logger.logAction('ERR_010', 'Error al procesar el adjunto', 'estafeta.js:storeAttachment', { 
      message: error.message,
      stack: error.stack,
      filename
    });
    
    // Limpiar archivo si existe
    if (fs.existsSync(path)) {
      try {
        fs.unlinkSync(path);
      } catch (unlinkError) {
        logger.logAction('ERR_011', 'Error al eliminar archivo temporal', 'estafeta.js:storeAttachment', { 
          message: unlinkError.message,
          filename
        });
      }
    }
    
    throw error;
  }
}

/**
 * Convertir la cadena 'true'/'false' a booleano
 * @param {string} s - Cadena a convertir
 * @returns {boolean} - Valor booleano
 */

function strToBool(s) {
  return s === 'true';
}