'use strict';

const ApplicationError = require('../ApplicationError');

class TweetAlreadyExistsError extends ApplicationError {
  constructor(message) {
    super(message || 'Tweet with this ID already exists.', 404);
  }
}

module.exports = TweetAlreadyExistsError;