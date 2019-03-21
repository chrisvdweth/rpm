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



const Parameters = function () {};


Parameters.prototype =  {


  setParameter : function (req, res) {
    let body = req.body;
    
    if(!body.hasOwnProperty('name') && !body.hasOwnProperty('value')){
      return res.json(new MissingParametersError());
    }
    
    let name = body['name'];
    let value = body['value'];
    //console.log(urlId.toString() + ", " + source + ", " + type + ", " + value);
    mysql.connection.query(
      "INSERT INTO rpm_parameters (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?",
      [ name,
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

  
  getParameter : function (req, res) {

    if(!req.query.name){
      return res.json(new MissingParametersError());
    }
    
    let name = req.query['name'];
    
    //console.log(urlId.toString() + ", " + source + ", " + type + ", " + value);
    mysql.connection.query(
      "SELECT value FROM rpm_parameters WHERE name = ?",
      [ name
      ],
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        return res.json(new DatabaseError());
      } else {
        let response = { "value": null };
        result.forEach(function(row) {
          response.value = row.value;
        });
        return res.json(response);
      }
    });
  },

    
  
};





const parameters = new Parameters();

module.exports = parameters;