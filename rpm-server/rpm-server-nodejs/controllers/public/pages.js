'use strict';

const request   = require('request');
const async     = require('async');
const farmhash  = require('farmhash');
const url       = require('url');
const bigInt    = require('big-integer');
const mysql     = require('../../database/mysql');

const errorlog = require('../../utils/logger').errorlog;

const DatabaseError                   = require('../../errors/db/DatabaseError');
const MissingParametersError          = require('../../errors/api/MissingParametersError');
const IncorrectTimestampFormat        = require('../../errors/api/IncorrectTimestampFormat');
const InvalidDateOrderError           = require('../../errors/api/InvalidDateOrderError');


const rpmSocialSignalSources = ['100', '200'];
const rpmSocialSignalTypes = ['101', '102', '103', '104', '201', '202', '203'];
const rpmSocialSignals = {'100': [ '101', '102', '103', '104'], '200': [ '201', '202', '203'] };



String.prototype.format = function() {
  return [...arguments].reduce((p,c) => p.replace(/%s/,c), this);
};

const Pages = function () {};


Pages.prototype =  {

 
  getSocialSignalCounts : function (req, res) {
    let body = req.body;
    
    if (!req.query.urls && !req.query.url_ids){
      return res.json(new MissingParametersError());
    }

    let urlIds = [];
    let urlData = {};
    if(req.query.url_ids) {
      req.query.url_ids.split(',').forEach(function(val){ urlIds.push(bigInt(val)); });
    } else {
      req.query.urls.split(',').forEach(function(val){ let urlId = bigInt(farmhash.hash64(val)); urlIds.push(urlId); urlData[urlId] = val; });      
    }
    
    let sources = rpmSocialSignalSources; // By default, all sources are requested
    if (req.query.signal_sources) {
      sources = [];
      req.query.signal_sources.split(',').forEach(function(val){ sources.push(val); });
    }
  
    let types = rpmSocialSignalTypes; // By default, all types are requested
    if (req.query.signal_types) {
      types = [];
      req.query.signal_types.split(',').forEach(function(val){ types.push(val); });
    }
    
    let groups = [];
    if (req.query.groups) {
      req.query.groups.split(',').forEach(function(val){ groups.push(val.toLowerCase()); });
    }
    
    let evalBySource = false;
    if (groups.indexOf('signal_source') > -1) {
      evalBySource = true;
    } 
    
    let evalByType = false;
    if (groups.indexOf('signal_type') > -1) {
      evalByType = true;
    } 
        
    let signals = pages.generateValidSignalSourcesAndTypes(req);
    let signalSources = signals["sources"];
    let signalTypes = signals["types"]
    
    console.log(signalSources + " / " + signalTypes);
    
    let data = {};
    if (evalBySource && evalByType) { 
      urlIds.forEach(function(id) { data[id] = {}; signalSources.forEach(function(source) { data[id][source] = {}; signalTypes.forEach(function(type) { if(rpmSocialSignals[source].indexOf(type) > -1) { data[id][source][type] = 0; } }); }); });  
    } else if (evalBySource) {
      urlIds.forEach(function(id) { data[id] = {}; signalSources.forEach(function(source) { data[id][source] = 0; }); } );
    } else if (evalByType) {
      urlIds.forEach(function(id) { data[id] = {}; signalTypes.forEach(function(type) { data[id][type] = 0; }); } );
    } else {
      urlIds.forEach(function(id) { data[id] = 0; });
    }
    console.log(data);
    let sourcesWhereClause = '';
    if (signalSources.length > 0) {
      sourcesWhereClause = 'AND %s IN ('.format('signal_source');
      signalSources.forEach(function(val){
        sourcesWhereClause += "'%s', ".format(val);
      });
      sourcesWhereClause = sourcesWhereClause.slice(0, -2); // Remove trailing comma and whitespace
      sourcesWhereClause += ')';
    }
    
    let typesWhereClause = '';
    if (signalTypes.length > 0) {
      typesWhereClause = 'AND %s IN ('.format('signal_type');
      signalTypes.forEach(function(val){
        typesWhereClause += "%s, ".format(val);
      });
      typesWhereClause = typesWhereClause.slice(0, -2); // Remove trailing comma and whitespace
      typesWhereClause += ')';
    }
    
    let groupByClause = "url_id, ";
    let selectClause = "url_id AS urlid, ";
    if (groups.length > 0) {
      groups.forEach(function(val){
        selectClause += "%s, ".format(val);
        groupByClause += "%s, ".format(val);
      });
    }     
    selectClause = selectClause.slice(0, -2); // Remove trailing comma and whitespace
    groupByClause = groupByClause.slice(0, -2); // Remove trailing comma and whitespace

    // Construct database query
    let query = "SELECT %s, SUM(signal_value) AS signal_value FROM rpm_pages_social_signals WHERE url_id IN (%s) %s %s GROUP BY %s".format(selectClause, urlIds.join(','), sourcesWhereClause, typesWhereClause, groupByClause);

    console.log(query);
    // Execute query, update data, generate response, sent response
    mysql.connection.query(
      query,
      function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return res.json(new DatabaseError());
        } else {
          result.forEach(function(row) {
            if (evalBySource && evalByType) {
              try { data[bigInt(row.urlid)][row.signal_source][row.type] = row.signal_value; } catch(err) {}
            } else if (evalBySource) {
              try { data[row.urlid][row.signal_source] = row.signal_value; } catch(err) {}
            } else if (evalByType) {
              try { data[row.urlid][row.signal_type] = row.signal_value; } catch(err) {}
            } else {
              try { data[row.urlid] = row.signal_value; } catch(err) {}
            }
          });
          
          return res.json(pages.generateGetDailySocialSignalsResponse(req, data, urlData, evalBySource, evalByType));
        }
      }
    );
  },
  
  
  
   
  
  generateGetDailySocialSignalsResponse : function (req, data, urlData, evalBySource, evalByType) {
    let response = {"data": []};
    
    for (let urlid in data) {
      let dataItem = { "url_id": urlid };
      // Add url if request has been made with url instead of url id
      if (urlid in urlData) { dataItem["url"] = urlData[urlid]; }
      
      if (evalBySource && evalByType) {
        dataItem["signal_sources"] = [];
        for (let source in data[urlid]) {
          let sourceItem = {"id": source, "signal_types": []}
          for (let type in data[urlid][source]) {
            let tp = {"id": type, "signal_value": data[urlid][source][type] };
            sourceItem["signal_types"].push(tp);
          }
          dataItem["signal_sources"].push(sourceItem);
        }
        response["data"].push(dataItem);
      } else if (evalBySource) {
        dataItem["signal_sources"] = [];
        for (let source in data[urlid]) {
          let src = { "id": source, "signal_value": data[urlid][source] };
          dataItem["signal_sources"].push(src);
        }
        response["data"].push(dataItem);
      } else if (evalByType) {
        dataItem["signal_types"] = [];
        for (let type in data[urlid]) {
          let src = { "id": type, "signal_value": data[urlid][type] };
          dataItem["signal_types"].push(src);
        }
        response["data"].push(dataItem);        
      } else {
        dataItem["signal_value"] = data[urlid];
        response["data"].push(dataItem);
      }
      
    }
    return response;
  },

  generateValidSignalSourcesAndTypes(req) {
    let signalSources = []
    let signalTypes = [];
    
    if (!req.query.signal_sources && !req.query.signal_types) {
      signalSources = rpmSocialSignalSources;
      signalTypes = rpmSocialSignalTypes;
    } else {
      if (req.query.signal_types) {
        req.query.signal_types.split(',').forEach(function(val){ signalTypes.push(val); });
        rpmSocialSignalSources.forEach(function(source) {
          let allSourceTypes = rpmSocialSignals[source];
          signalTypes.forEach(function(type) {
            if (allSourceTypes.indexOf(type) > -1) {
              if (signalSources.indexOf(source) < 0) {
                signalSources.push(source);
              }
            }
          });
        });
      } else {
        req.query.signal_sources.split(',').forEach(function(val){ signalSources.push(val); });
        signalSources.forEach(function(source) {
          try { rpmSocialSignals[source].forEach(function(type) { signalTypes.push(type); }); } catch(err) {};
        });
      }
    }
    
    return {"sources": signalSources, "types": signalTypes };
  },
  
  
  
};





const pages = new Pages();

module.exports = pages;