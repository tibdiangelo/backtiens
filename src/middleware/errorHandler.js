const { ApiError } = require('../utils/helpers');

function notFound(req, res, next) {
  next(new ApiError(404, 'Recurso no encontrado.'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.name === 'MulterError') {
    if (error.code === 'INVALID_FILE_TYPE') {
      return res.status(422).json({ error: 'Formato de archivo no permitido. Usa JPG, PNG o WebP.' });
    }
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'La imagen supera el tamaño máximo de 5 MB.'
      : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Se enviaron más archivos de los permitidos.'
        : 'No fue posible procesar el archivo.';
    return res.status(400).json({ error: message });
  }

  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
  }

  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(409).json({ error: 'El registro está relacionado con otros datos y no puede eliminarse.' });
  }

  const status = error.status || 500;
  if (status >= 500) console.error(error);
  const payload = { error: status >= 500 ? 'Ocurrió un error inesperado. Intenta nuevamente.' : error.message };
  if (error.details) payload.detalles = error.details;
  return res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
