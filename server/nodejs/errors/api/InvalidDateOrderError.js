'use strict';

const ApplicationError = require('../ApplicationError');

class InvalidDateOrderError extends ApplicationError {
  constructor(message) {
    super(message || 'Invalide date order: the start date must be before the end date.', 404);
  }
}

module.exports = InvalidDateOrderError;