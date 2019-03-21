'use strict';

// Required Modules
const restify           = require('restify');
const corsMiddleware    = require('restify-cors-middleware')
const bodyParser        = require('body-parser');

const config            = require('./preferences/config');
const constants         = require('./preferences/constants');

const twitter           = require('./controllers/protected/twitter');
const news              = require('./controllers/protected/news');
const pages             = require('./controllers/protected/pages');
const content           = require('./controllers/protected/content');
const parameters        = require('./controllers/protected/parameters')


let Server = function() {
  this.http = new Server.Http(this);  
};


Server.prototype = {

  initialize : function() {
    this.http.initialize();
  },
  
};




// Server.Util = {
//   
//   bind : function(context, method, arguments) {
//     if (!arguments) { arguments = new Array(); }
//     return function() { return method.apply(context, arguments); };
//   },
//   
// };




Server.Http = function(server) {
  this.server = server;
  this.app = null;
};


Server.Http.prototype = {

  initialize : function() {
    // WITH HTTPS
    //let https_options = {
    //  key: fs.readFileSync('/etc/ssl/private/server-selfsigned.key'),
    //  certificate: fs.readFileSync('/etc/ssl/certs/server-selfsigned.crt')
    //};
    //this.app = restify.createServer(https_options);
    
    // WITHOUT HTTPS
    this.app = restify.createServer();
        
    
    this.cors = corsMiddleware({
      preflightMaxAge: 5, //Optional
      origins: ['*'],
      allowHeaders: ['API-Token'],
      exposeHeaders: ['API-Token-Expiry']
    });
        

    //this.app.opts(/\.*/, function (req, res, next) {
    //  res.send(200);
    //  next();
    //});
    
    this.app.pre(this.cors.preflight);
    this.app.use(this.cors.actual);
    this.app.use(restify.plugins.queryParser());
    this.app.use(restify.plugins.bodyParser());
    
    //this.app.use(morgan("dev"));
    this.app.use(function(req, res, next) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      next();
    });
    
    // Routes
    this.app.post('/api/v1/tweets/', twitter.addTweet);
    this.app.post('/api/v1/tweets/socialsignals/', twitter.updateSocialSignals)
    
    this.app.post('/api/v1/newsarticles/', news.addArticle);
    this.app.post('/api/v1/newsarticles/topwords/daily/', news.addDailyTopWords);
    //this.app.post('/api/v1/newsarticles/category/', news.updateCategory);
    
    this.app.post('/api/v1/pages/categories/', pages.updateCategories);
    this.app.post('/api/v1/pages/socialsignals/', pages.updateSocialSignals);

    this.app.post('/api/v1/content/categories/', content.updateCategories);
    this.app.post('/api/v1/content/socialsignals/', content.updateSocialSignals);
    
    this.app.post('/api/v1/parameters/', parameters.setParameter);
    this.app.get('/api/v1/parameters/', parameters.getParameter);
    
    this.app.listen(config.port_protected);
  },

  
};




const server = new Server();

server.initialize();



// curl -k -H "Content-Type: application/json" -X POST -d '{ "event_ids": ["1842179193-1666010373"], "status" : 10 }' "http://172.29.35.42:16601/api/v1/tweet/add" 

