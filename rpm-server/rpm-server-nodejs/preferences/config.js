module.exports = {
  name: 'API',
  env: process.env.NODE_ENV || 'development',
  port_protected: process.env.PORT || 16601,
  port_public: process.env.PORT || 16600,
  mysql: {
    'host': '',
    'user': '',
    'password': '',
    'dbname': '',
    'charset': 'utf8mb4_unicode_ci'
  }
};