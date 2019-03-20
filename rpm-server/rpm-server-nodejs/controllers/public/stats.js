'use strict';

const request   = require('request');
const async     = require('async');
//const moment    = require('moment');
//const farmhash  = require('farmhash');
//const url       = require('url');
const mysql     = require('../../database/mysql');

//const Moment = require('moment');
//const MomentRange = require('moment-range');
//const moment = MomentRange.extendMoment(Moment);


const errorlog = require('../../utils/logger').errorlog;

const DatabaseError                   = require('../../errors/db/DatabaseError');
//const MissingParametersError          = require('../../errors/api/MissingParametersError');
//const IncorrectTimestampFormat        = require('../../errors/api/IncorrectTimestampFormat');
//const IncorrectParameterFormat        = require('../../errors/api/IncorrectParameterFormat');
//const InvalidDateOrderError           = require('../../errors/api/InvalidDateOrderError');

//const rpmSocialSignalSources = ['100', '200'];
//const rpmSocialSignalTypes = ['101', '102', '103', '104', '201', '202', '203'];
//const rpmSocialSignals = {'100': [ '101', '102', '103', '104'], '200': [ '201', '202', '203'] };


String.prototype.format = function() {
  return [...arguments].reduce((p,c) => p.replace(/%s/,c), this);
};

const Stats = function () {};


Stats.prototype =  {

 
  getRepositoryStats : function (req, res) {
    
    let numOfNewsArticles = 0;
    let numOfNewsSources = 0;
    let numOfTweets = 0;
    
    
    async.waterfall([
      function (callback) {
        stats.getNumberOfRows('rpm_news_sources', '', callback);
      },
      function (result, callback) {
        numOfNewsSources = result[0].count;
        stats.getNumberOfRows('rpm_news_articles', '', callback);
      },
      function (result, callback) {
        numOfNewsArticles = result[0].count;
        stats.getNumberOfRows('rpm_tweets', '', callback);
      },
      function (result, callback) {
        numOfTweets = result[0].count;
        callback(null, {});
      }
    ], 
    function (error, result) {
      if (error) {
        res.json(error);  
      } else {
        res.json({'news_sources_count': numOfNewsSources, 'news_articles_count': numOfNewsArticles, 'tweets_count': numOfTweets });  
      }
    })
  },
  
  
  getNumberOfRows : function (tableName, whereClause, callback) {
    mysql.connection.query('SELECT COUNT(*) AS count FROM %s'.format(tableName), function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        callback(new DatabaseError(), null);
      } else {
        callback(null, result);
      }
    });
  },  
  
  
};





const stats = new Stats();

module.exports = stats;