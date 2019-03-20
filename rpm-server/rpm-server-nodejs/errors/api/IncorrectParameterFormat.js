'use strict';

const ApplicationError = require('../ApplicationError');

class IncorrectParameterFormat extends ApplicationError {
  constructor(message) {
    super(message || 'Incorrect Parameter format.', 404);
  }
}

module.exports = IncorrectParameterFormat;