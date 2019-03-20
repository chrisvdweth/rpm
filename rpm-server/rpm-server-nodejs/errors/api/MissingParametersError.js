'use strict';

const ApplicationError = require('../ApplicationError');

class MissingParametersError extends ApplicationError {
  constructor(message) {
    super(message || 'One or more required API call parameters are missing.', 404);
  }
}

module.exports = MissingParametersError;