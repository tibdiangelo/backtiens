const { validationResult } = require('express-validator');
const { ApiError } = require('../utils/helpers');

function validate(rules) {
  return [
    ...rules,
    (req, res, next) => {
      const result = validationResult(req);
      if (result.isEmpty()) return next();
      const errors = result.array().map((error) => ({ campo: error.path, mensaje: error.msg }));
      return next(new ApiError(422, 'Revisa los datos ingresados.', errors));
    },
  ];
}

module.exports = { validate };
