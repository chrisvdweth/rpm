'use strict';

const ApplicationError = require('../ApplicationError');

class NewsArticleAlreadyExistsError extends ApplicationError {
  constructor(message) {
    super(message || 'News article with this URL already exists.', 404);
  }
}

module.exports = NewsArticleAlreadyExistsError;