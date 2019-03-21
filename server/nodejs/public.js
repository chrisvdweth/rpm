'use strict';

// Required Modules
const restify           = require('restify');
const corsMiddleware    = require('restify-cors-middleware')
const bodyParser        = require('body-parser');

const config            = require('./preferences/config');
const constants         = require('./preferences/constants');

const stats             = require('./controllers/public/stats');
const pages             = require('./controllers/public/pages');
const news              = require('./controllers/public/news');
const twitter           = require('./controllers/public/twitter');




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
    this.app.get('/api/v1/stats/repository/', stats.getRepositoryStats);
    
    this.app.get('/api/v1/newsarticles/count/daily/', news.getDailyCounts);
    this.app.get('/api/v1/newsarticles/topwords/', news.getTopWords);
    this.app.get('/api/v1/newsarticles/socialsignals/count/daily/', news.getDailySocialSignalCounts);
    this.app.get('/api/v1/newsarticles/socialsignals/top/daily/', news.getDailyTopArticlesBySocialSignals);
    this.app.get('/api/v1/newsarticles/socialsignals/trend/', news.getSocialSignalCountTrends);
    
    this.app.get('/api/v1/tweets/count/daily/', twitter.getDailyCounts);
    this.app.get('/api/v1/tweets/socialsignals/count/daily/', twitter.getDailySocialSignalCounts);
    this.app.get('/api/v1/tweets/socialsignals/top/daily/', twitter.getDailyTopTweetsBySocialSignals);
    this.app.get('/api/v1/tweets/socialsignals/trend/', twitter.getSocialSignalCountTrends);
    
    this.app.get('/api/v1/pages/socialsignals/count/', pages.getSocialSignalCounts);
    
    
    this.app.listen(config.port_public);
  },

  
};




const server = new Server();

server.initialize();



// curl -k -H "Content-Type: application/json" -X POST -d '{ "event_ids": ["1842179193-1666010373"], "status" : 10 }' "http://172.29.35.42:16601/api/v1/tweet/add" 

