'use strict';

const ApplicationError = require('../ApplicationError');

class IncorrectTimestampFormat extends ApplicationError {
  constructor(message) {
    super(message || 'The timestamp must comply with ISO 8601.', 404);
  }
}

module.exports = IncorrectTimestampFormat;