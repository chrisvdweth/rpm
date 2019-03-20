'use strict';

const ApplicationError = require('../ApplicationError');

class DatabaseError extends ApplicationError {
  constructor(message) {
    super(message || 'Database error (please contact administrator if problem persists).', 404);
  }
}

module.exports = DatabaseError;