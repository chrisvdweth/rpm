'use strict';

const request   = require('request');
const async     = require('async');
const moment    = require('moment');
const farmhash  = require('farmhash');
const url       = require('url');
const bigInt    = require('big-integer');
const mysql     = require('../../database/mysql');

const errorlog = require('../../utils/logger').errorlog;

const DatabaseError                   = require('../../errors/db/DatabaseError');
const MissingParametersError          = require('../../errors/api/MissingParametersError');
const IncorrectUrlFormat              = require('../../errors/api/IncorrectUrlFormat');
//const IncorrectTimestampFormat        = require('../../errors/api/IncorrectTimestampFormat');



const Pages = function () {};


Pages.prototype =  {


  updateSocialSignals : function (req, res) {
    let body = req.body;

    if(!body.hasOwnProperty('url') && !body.hasOwnProperty('url_id')){
      return res.json(new MissingParametersError());
    }
    
    if(!body.hasOwnProperty('signal_source') ||  !body.hasOwnProperty('signal_type') || !body.hasOwnProperty('signal_value')){
      return res.json(new MissingParametersError());
    }
    
    let urlId = -1;
    if(body.url_id) {
      urlId = bigInt(body.url_id);
    } else {
      urlId = bigInt(farmhash.hash64(body.url));
    }    
    
    // Generate article id has hash from URL
    let source = body['signal_source'];
    let type = body['signal_type'];
    let value = body['signal_value'];
    //console.log(urlId.toString() + ", " + source + ", " + type + ", " + value);
    mysql.connection.query(
      "INSERT INTO rpm_pages_social_signals (url_id, signal_source, signal_type, signal_value) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE signal_value = ?",
      [ urlId.toString(),
        source,
        type,
        value,
        value
      ],
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        return res.json(new DatabaseError());
      } else {
        return res.json({"msg": "success"});
      }
    });
  },
  
  
  updateCategories : function (req, res) {
    let body = req.body;

    if(!body.hasOwnProperty('url') && !body.hasOwnProperty('url_id')){
      return res.json(new MissingParametersError());
    }
    
    if(!body.hasOwnProperty('categories')){
      return res.json(new MissingParametersError());
    }
    
    let urlId = -1;
    if(body.url_id) {
      urlId = bigInt(body.url_id);
    } else {
      urlId = bigInt(farmhash.hash64(body.url));
    }    
    
    let valuesString = "";
    
    let categories = [];
    body.categories.split(',').forEach(function(val){ categories.push(val); });
    
    if (categories.length > 0) {
      categories.forEach(function(cat) { valuesString += "(" + urlId.toString() + ", " + cat + "), "; } );
    } else {
      res.json({"msg": "success (nothing to do; no categories provided)"});
    }
    
    valuesString = valuesString.slice(0, -2); // Remove trailing comma and whitespace

    let deleteQuery = "DELETE FROM rpm_pages_categories WHERE url_id = " + urlId.toString();
    let insertQuery = "INSERT IGNORE INTO rpm_pages_categories (url_id, category) VALUES " + valuesString;
    
    async.waterfall([
      function (callback) {
        mysql.connection.query(deleteQuery, function (error, result, fields) { if (error) { errorlog.error(error); return res.json(new DatabaseError()); } else { callback(null, callback); } } );
      },
      function (result, callback) {
        mysql.connection.query(insertQuery, function (error, result, fields) { if (error) { errorlog.error(error); return res.json(new DatabaseError()); } else { callback(null, callback); } } );
      }
    ], 
    function (error, result) {
      if (error) {
        res.json(error);  
      } else {
        res.json({'msg': 'success'});  
      }
    });    
    
  },
    
  
};





const pages = new Pages();

module.exports = pages;