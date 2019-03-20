'use strict';

const ApplicationError = require('../ApplicationError');

class IncorrectUrlFormat extends ApplicationError {
  constructor(message) {
    super(message || 'Incorrect URL format.', 404);
  }
}

module.exports = IncorrectUrlFormat;