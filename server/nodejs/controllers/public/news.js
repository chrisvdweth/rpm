'use strict';

const request     = require('request');
const async       = require('async');
//const moment    = require('moment');
const farmhash    = require('farmhash');
const url         = require('url');
const regression  = require('regression');
const mysql       = require('../../database/mysql');


const Moment = require('moment');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);


const errorlog = require('../../utils/logger').errorlog;

const DatabaseError                   = require('../../errors/db/DatabaseError');
const MissingParametersError          = require('../../errors/api/MissingParametersError');
const IncorrectTimestampFormat        = require('../../errors/api/IncorrectTimestampFormat');
const IncorrectParameterFormat        = require('../../errors/api/IncorrectParameterFormat');
const InvalidDateOrderError           = require('../../errors/api/InvalidDateOrderError');

const rpmSocialSignalSources = ['100', '200'];
const rpmSocialSignalTypes = ['101', '102', '103', '104', '201', '202', '203'];
const rpmSocialSignals = {'100': [ '101', '102', '103', '104'], '200': [ '201', '202', '203'] };


String.prototype.format = function() {
  return [...arguments].reduce((p,c) => p.replace(/%s/,c), this);
};

const News = function () {};


News.prototype =  {

 
  getDailyCounts : function (req, res) {
    let body = req.body;
    
    if (!req.query.start_date || !req.query.end_date){ return res.json(new MissingParametersError()); }

    let startDate = req.query.start_date;
    let endDate = req.query.end_date;
    
    if ((moment(startDate, moment.ISO_8601).isValid() == false) || (moment(endDate, moment.ISO_8601).isValid() == false)) {
      return res.json(new IncorrectTimestampFormat());
    }
    
    let sDate = moment(startDate, moment.ISO_8601).startOf('day');
    let eDate = moment(endDate, moment.ISO_8601).endOf('day');

    if (sDate.isAfter(eDate)) { return res.json(new InvalidDateOrderError()); }
    
    let range = moment.range(sDate, eDate)
    let arrayOfDates = Array.from(range.by('days'))
    
    let dates = [];
    arrayOfDates.forEach(function(val){ dates.push(val.format("YYYY-MM-DD")); });
    
    let sources = [];
    if (req.query.article_sources) { req.query.article_sources.split(',').forEach(function(val){ sources.push(val); }); }
  
    let categories = [];
    if (req.query.article_categories) { req.query.article_categories.split(',').forEach(function(val){ categories.push(val); }); }
    
    let groups = [];
    if (req.query.groups) { req.query.groups.split(',').forEach(function(val){ groups.push(val.toLowerCase()); }); }
    
    let evalBySource = false;
    if (groups.indexOf('article_source') > -1) {
      if (sources.length == 0) {
        return res.json({"error": "If SOURCE is in group then sources parameter cannot be empty" });        
      }
      evalBySource = true;
    } 
    
    let evalByCategory = false;
    if (groups.indexOf('article_category') > -1) {
      if (categories.length == 0) {
        return res.json({"error": "If CATEGORY is in group then categories parameter cannot be empty" });        
      }
      evalByCategory = true;
    } 
        
    let data = news.generateDataObject(sources, categories, dates, evalBySource, evalByCategory, 0);
    
    let sourcesWhereClause = news.generateWhereInClause('article_source', sources, true);

    let categoriesWhereClause = news.generateWhereInClause('article_category', categories, true);
    
    let selectGroupByClauses = news.generateSelectGroupByClauses("DATE_FORMAT(published_at, '%Y-%m-%d') AS date, ", "date, ", groups);
    let groupByClause = selectGroupByClauses["groupby"];
    let selectClause = selectGroupByClauses["select"];

    // Construct database query
    let query = "SELECT %s, SUM(article_count) AS value FROM rpm_news_articles_count_daily WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s GROUP BY %s".format(selectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), sourcesWhereClause, categoriesWhereClause, groupByClause);
    //console.log(query);
    // Execute query, update data, generate response, sent response
    mysql.connection.query(
      query,
      function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return res.json(new DatabaseError());
        } else {
          result.forEach(function(row) { 
            news.updateDataObject(data, row, evalBySource, evalByCategory);                    
          });
          return res.json(news.generateGetDailyCountsResponse(req, data, evalBySource, evalByCategory));
        }
      }
    );
  },
  
  
  
  getDailySocialSignalCounts : function (req, res) {
    let body = req.body;
    
    if (!req.query.start_date || !req.query.end_date){ return res.json(new MissingParametersError()); }

    let startDate = req.query.start_date;
    let endDate = req.query.end_date;
    
    if ((moment(startDate, moment.ISO_8601).isValid() == false) || (moment(endDate, moment.ISO_8601).isValid() == false)) {
      return res.json(new IncorrectTimestampFormat());
    }
    
    let sDate = moment(startDate, moment.ISO_8601).startOf('day');
    let eDate = moment(endDate, moment.ISO_8601).endOf('day');

    if (sDate.isAfter(eDate)) { return res.json(new InvalidDateOrderError()); }
    
    let range = moment.range(sDate, eDate)
    let arrayOfDates = Array.from(range.by('days'))
    
    let dates = [];
    arrayOfDates.forEach(function(val){ dates.push(val.format("YYYY-MM-DD")); });
  
    let signals = news.generateValidSignalSourcesAndTypes(req);
    let signalSources = signals["sources"];
    let signalTypes = signals["types"]
      
    let articleSources = [];
    if (req.query.article_sources) { req.query.article_sources.split(',').forEach(function(val){ articleSources.push(val); }); }
  
    let articleCategories = [];
    if (req.query.article_categories) { req.query.article_categories.split(',').forEach(function(val){ articleCategories.push(val); }); }
    
    let groups = [];
    if (req.query.groups) { req.query.groups.split(',').forEach(function(val){ groups.push(val.toLowerCase()); }); }
    
    let evalBySource = false;
    if (groups.indexOf('article_source') > -1) {
      if (articleSources.length == 0) {
        return res.json({"error": "If SOURCE is in group then articleSources parameter cannot be empty" });        
      }
      evalBySource = true;
    } 
    
    let evalByCategory = false;
    if (groups.indexOf('article_category') > -1) {
      if (articleCategories.length == 0) {
        return res.json({"error": "If CATEGORY is in group then articleCategories parameter cannot be empty" });        
      }
      evalByCategory = true;
    } 
    
    let data = news.generateDataObject(articleSources, articleCategories, dates, evalBySource, evalByCategory, "{}");

    let signalSourceWhereClause = news.generateWhereInClause('signal_source', signalSources, true);
    let signalTypeWhereClause = news.generateWhereInClause('signal_type', signalTypes, true);
    let articleSourcesWhereClause = news.generateWhereInClause('article_source', articleSources, true);
    let articleCategoriesWhereClause = news.generateWhereInClause('article_category', articleCategories, true);
    
    let innerSelectGroupByClauses = news.generateSelectGroupByClauses("DATE_FORMAT(published_at, '%Y-%m-%d') AS date, ", "date, ", groups);
    let innerGroupByClause = innerSelectGroupByClauses["groupby"];
    let innerSelectClause = innerSelectGroupByClauses["select"];
    
    let outerSelectGroupByClauses = news.generateSelectGroupByClauses("date, ", "date, ", groups);
    let outerGroupByClause = outerSelectGroupByClauses["groupby"];
    let outerSelectClause = outerSelectGroupByClauses["select"];

    // Construct database query
    let query = "SELECT %s, CONCAT('{' ,GROUP_CONCAT(CONCAT('\"', signal_type, '\": \"',value,'\"')), '}') AS value FROM (SELECT %s, signal_type, SUM(value) AS value FROM rpm_news_articles_social_signals_count_daily WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s %s %s GROUP BY %s, signal_type) tab GROUP BY %s".format(outerSelectClause, innerSelectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), articleSourcesWhereClause, articleCategoriesWhereClause, signalSourceWhereClause, signalTypeWhereClause, innerGroupByClause, outerGroupByClause);
    //console.log(query);
    // Execute query, update data, generate response, sent response
    mysql.connection.query(
      query,
      function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return res.json(new DatabaseError());
        } else {
          result.forEach(function(row) { 
            news.updateDataObject(data, row, evalBySource, evalByCategory);                     
          });
          return res.json(news.generateGetDailySocialSignalCountsResponse(req, data, evalBySource, evalByCategory, signalTypes));
        }
      }
    );

  },
    
  

  getSocialSignalCountTrends : function (req, res) {
    let body = req.body;
    
    if (!req.query.date || !req.query.days || !req.query.article_categories) { return res.json(new MissingParametersError()); }

    let startDate = req.query.start_date;
    let endDate = req.query.date;
    
    if (moment(endDate, moment.ISO_8601).isValid() == false) {
      return res.json(new IncorrectTimestampFormat());
    }
    
    let days = [];
    let validDays = true;
    req.query.days.split(',').forEach(function(val){ 
      let intVal = parseInt(val);
      if (intVal < 2) { validDays = false }
      days.push(parseInt(val)); 
    });
    
    if (validDays == false) { return res.json(new IncorrectParameterFormat()); }
    
    let maxDay = Math.max(...days);
    
    let eDate = moment(endDate, moment.ISO_8601).endOf('day');
    let sDate = moment(endDate, moment.ISO_8601).endOf('day').subtract(maxDay, "days");;

    let range = moment.range(sDate, eDate)
    let arrayOfDates = Array.from(range.by('days'))
    
    let dates = [];
    arrayOfDates.forEach(function(val){ dates.push(val.format("YYYY-MM-DD")); });
  
    let signals = news.generateValidSignalSourcesAndTypes(req);
    let signalSources = signals["sources"];
    let signalTypes = signals["types"]
      
    let articleSources = [];
    if (req.query.article_sources) { req.query.article_sources.split(',').forEach(function(val){ articleSources.push(val); }); }
  
    let articleCategories = [];
    if (req.query.article_categories) { req.query.article_categories.split(',').forEach(function(val){ articleCategories.push(val); }); }
    
    let evalBySource = false;
    let evalByCategory = true;
    
    let data = news.generateDataObject(articleSources, articleCategories, dates, evalBySource, evalByCategory, "{}");

    let signalSourceWhereClause = news.generateWhereInClause('signal_source', signalSources, true);
    let signalTypeWhereClause = news.generateWhereInClause('signal_type', signalTypes, true);
    let articleSourcesWhereClause = news.generateWhereInClause('article_source', articleSources, true);
    let articleCategoriesWhereClause = news.generateWhereInClause('article_category', articleCategories, true);
    
    let innerSelectGroupByClauses = news.generateSelectGroupByClauses("DATE_FORMAT(published_at, '%Y-%m-%d') AS date, ", "date, ", ["article_category"]);
    let innerGroupByClause = innerSelectGroupByClauses["groupby"];
    let innerSelectClause = innerSelectGroupByClauses["select"];
    
    let outerSelectGroupByClauses = news.generateSelectGroupByClauses("date, ", "date, ", ["article_category"]);
    let outerGroupByClause = outerSelectGroupByClauses["groupby"];
    let outerSelectClause = outerSelectGroupByClauses["select"];

    // Construct database query
    let query = "SELECT %s, SUM(value) AS value FROM (SELECT %s, signal_type, SUM(value) AS value FROM rpm_news_articles_social_signals_count_daily WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s %s %s GROUP BY %s, signal_type) tab GROUP BY %s".format(outerSelectClause, innerSelectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), articleSourcesWhereClause, articleCategoriesWhereClause, signalSourceWhereClause, signalTypeWhereClause, innerGroupByClause, outerGroupByClause);
    //console.log(query);
    // Execute query, update data, generate response, sent response
    mysql.connection.query(
      query,
      function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return res.json(new DatabaseError());
        } else {
          result.forEach(function(row) { 
            news.updateDataObject(data, row, evalBySource, evalByCategory);                     
          });
          return res.json(news.generateGetSocialSignalCountTrendsResponse(req, data, days));
        }
      }
    );

  },
    


  generateGetSocialSignalCountTrendsResponse : function(req, data, days) {
    let response = {"date": req.query.start_date };

    response["categories"] = [];
      for (var category in data) {
        let values = news.generateDailyCountArray(data[category]);
        let cat = { "id": category, "trends": [] };
        let lastDayValue = values[values.length-1];
        for (let i in days) {
          let day = days[i];
          let range = values.slice(values.length - day, values.length);

          let maxVal = Math.max(...range);
          
          let points = [];
          for (let r in range) { points.push( [ parseInt(r), range[r]/maxVal  ]) }
          let result = regression.linear(points, { precision: 5 });
          let gradient = result.equation[0];
          
          cat["trends"].push({"day": day, "value": (Math.round((gradient*100) * 100) / 100) });
        }
        response.categories.push(cat);
      }
    
    return response;
  },
  

  
  getDailyTopArticlesBySocialSignals : function (req, res) {
    let body = req.body;
    
    if (!req.query.start_date || !req.query.end_date || !req.query.signal_type || !req.query.limit ){ return res.json(new MissingParametersError()); }

    let startDate = req.query.start_date;
    let endDate = req.query.end_date;
    
    if ((moment(startDate, moment.ISO_8601).isValid() == false) || (moment(endDate, moment.ISO_8601).isValid() == false)) {
      return res.json(new IncorrectTimestampFormat());
    }
    
    let limit = 0;
    try { limit = parseInt(req.query.limit); } catch (err) { return res.json(new IncorrectParameterFormat()); }
    
    let sDate = moment(startDate, moment.ISO_8601).startOf('day');
    let eDate = moment(endDate, moment.ISO_8601).endOf('day');

    if (sDate.isAfter(eDate)) { return res.json(new InvalidDateOrderError()); }
    
    let range = moment.range(sDate, eDate)
    let arrayOfDates = Array.from(range.by('days'))
    
    let articleSources = [];
    if (req.query.article_sources) { req.query.article_sources.split(',').forEach(function(val){ articleSources.push(val); }); }
  
    let articleCategories = [];
    if (req.query.article_categories) { req.query.article_categories.split(',').forEach(function(val){ articleCategories.push(val); }); }  
    
    let groups = [];
    if (req.query.groups) { req.query.groups.split(',').forEach(function(val){ groups.push(val.toLowerCase()); }); }
    
    let evalBySource = false;
    if (groups.indexOf('article_source') > -1) {
      if (articleSources.length == 0) {
        return res.json({"error": "If SOURCE is in group then article sources parameter cannot be empty" });        
      }
      evalBySource = true;
    } 
    
    let evalByCategory = false;
    if (groups.indexOf('article_category') > -1) {
      if (articleCategories.length == 0) {
        return res.json({"error": "If CATEGORY is in group then article categories parameter cannot be empty" });        
      }
      evalByCategory = true;
    }     
    //console.log(groups);
    //let dates = [];
    //arrayOfDates.forEach(function(val){ dates.push(val.format("YYYY-MM-DD")); });
  
    let signals = news.generateValidSignalSourcesAndTypes(req);
    let signalSources = signals["sources"];
    let signalTypes = signals["types"]
      
    //let signalSourceWhereClause = news.generateWhereInClause('signal_source', signalSources, true);
    let signalTypeWhereClause = news.generateWhereInClause('signal_type', signalTypes, true);
    let articleSourcesWhereClause = news.generateWhereInClause('article_source', articleSources, true);
    let articleCategoriesWhereClause = news.generateWhereInClause('article_category', articleCategories, true);
    
    let selectGroupByClauses = news.generateSelectGroupByClauses("DATE_FORMAT(published_at, '%Y-%m-%d') AS date, ", "date, ", []);
    let selectClause = selectGroupByClauses["select"];


    
//     let baseQuery = "(SELECT %s, article_id, headline, url, image_url, snippet, signal_type, signal_value FROM rpm_news_articles_ranking WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s AND signal_type = %s ORDER BY signal_value DESC LIMIT %s)";
//     
//     let finalQuery = "";
//     if (evalBySource && evalByCategory) {
//       
//     } else if (evalBySource) {
//       let subQueries = [];
//       articleCategoriesWhereClause = news.generateWhereInClause('article_category', articleCategories, true);
//       sources.forEach(function(s){
//         articleSourcesWhereClause = news.generateWhereInClause('article_source', [s], true);
//         subQueries.push(baseQuery.format(selectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), articleSourcesWhereClause, articleCategoriesWhereClause, req.query.signal_type, limit));
//       });
//       finalQuery = subQueries.join(" UNION ");
//     } else if (evalByCategory) {
//       let subQueries = [];
//       articleSourcesWhereClause = news.generateWhereInClause('article_source', articleSources, true);
//       articleCategories.forEach(function(c) {
//         articleCategoriesWhereClause = news.generateWhereInClause('article_category', [c], true);
//         subQueries.push(baseQuery.format(selectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), articleSourcesWhereClause, articleCategoriesWhereClause, req.query.signal_type, limit));
//       });
//       finalQuery = subQueries.join(" UNION ");
//     } else {
//       articleSourcesWhereClause = news.generateWhereInClause('article_source', articleSources, true);
//       articleCategoriesWhereClause = news.generateWhereInClause('article_category', articleCategories, true);
//       finalQuery = baseQuery.format(selectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), articleSourcesWhereClause, articleCategoriesWhereClause, req.query.signal_type, limit);
//     }    
//     
//     console.log(finalQuery);
    
    
    // Construct database query
    let query = "(SELECT m.date, m.article_id, m.signal_type, m.signal_value, a.url, a.headline, a.image_url, a.snippet FROM (SELECT %s, article_id, signal_type, signal_value FROM rpm_news_articles_ranking WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s AND signal_type = %s GROUP BY DATE_FORMAT(published_at, '%Y-%m-%d'), article_id, signal_type, signal_value) m, rpm_news_articles a WHERE m.article_id = a.id ORDER BY signal_value DESC LIMIT %s)".format(selectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), articleSourcesWhereClause, articleCategoriesWhereClause, req.query.signal_type, limit);
    //console.log(query);
    // Execute query, update data, generate response, sent response
    mysql.connection.query(
      query,
      function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return res.json(new DatabaseError());
        } else {
          let response = {"start_date": req.query.start_date, "end_date": req.query.end_date, "data": [] };
          result.forEach(function(row) { 
            response["data"].push({ "article_id": row.article_id, "article_url": row.url, "article_headline": row.headline, "image_url": row.image_url, "snippet": row.snippet, "signal_value": row.signal_value });
          });
          return res.json(response);
        }
      }
    );
    
  },
      
  
  
  updateDataObject : function(data, row, evalBySource, evalByCategory) {
    if (evalBySource && evalByCategory) {
      data[row.article_source][row.article_category][row.date] = row.value;
    } else if (evalBySource) {
      data[row.article_source][row.date] = row.value;
    } else if (evalByCategory) {
      data[row.article_category][row.date] = row.value;
    } else {
      data[row.date] = row.value;
    }    
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
  
  
  generateDataObject : function(sources, categories, dates, evalBySource, evalByCategory, defaultValue) {
    let data = {};
    if (evalBySource && evalByCategory) {
      sources.forEach(function(source) { data[source] = {}; categories.forEach(function(category) { data[source][category] = {}; dates.forEach(function(date) { data[source][category][date] = defaultValue; }); }); });
    } else if (evalBySource) {
      sources.forEach(function(source) { data[source] = {}; dates.forEach(function(date) { data[source][date] = defaultValue; }); });
    } else if (evalByCategory) {
      categories.forEach(function(category) { data[category] = {}; dates.forEach(function(date) { data[category][date] = defaultValue; });  });
    } else {
      dates.forEach(function(date) { data[date] = defaultValue; });
    } 
    return data;
  },
  
  

  
  
  generateWhereInClause : function(column, values, quote) {
    if (values.length == 0) { return ''; }
    let clause = 'AND %s IN ('.format(column);
    values.forEach(function(val){
      if (quote == true) {
        clause += "'%s', ".format(val);
      } else {
        clause += "%s, ".format(val);
      }
    });
    if (clause.endsWith(', ')) { clause = clause.slice(0, -2); } // Remove trailing comma and whitespace
    clause += ')';
    return clause;
  },
  
  
  generateSelectGroupByClauses(selectClause, groupByClause, groups) {
    if (groups.length > 0) {
      groups.forEach(function(val){
        selectClause += "%s, ".format(val);
        groupByClause += "%s, ".format(val);
      });
    } 
    if (selectClause.endsWith(', ')) { selectClause = selectClause.slice(0, -2); } // Remove trailing comma and whitespace
    if (groupByClause.endsWith(', ')) { groupByClause = groupByClause.slice(0, -2); } // Remove trailing comma and whitespace
    return { "select": selectClause, "groupby": groupByClause}
  },
  
  
  generateGetDailyCountsResponse : function (req, data, evalBySource, evalByCategory) {
    let response = {"start_date": req.query.start_date, "end_date": req.query.end_date };
    if (evalBySource && evalByCategory) {
      response["sources"] = [];
      for (var source in data) {
        let src = { "id": source, "categories": [] };
        for (var category in data[source]) {
          let cat = { "id": category, "data": news.generateDailyCountArray(data[source][category]) };
          src.categories.push(cat);
        }
        response.sources.push(src);
      }
    } else if (evalBySource) {
      response["sources"] = [];
      for (var source in data) {
        let src = { "id": source, "data": news.generateDailyCountArray(data[source]) };
        response.sources.push(src);
      }
    } else if (evalByCategory) {
      response["categories"] = [];
      for (var category in data) {
        let cat = { "id": category, "data": news.generateDailyCountArray(data[category]) };
        response.categories.push(cat);
      }
    } else {
      response["data"] = news.generateDailyCountArray(data);
    }    
    return response;
  },
  
  
  
  generateGetDailySocialSignalCountsResponse : function (req, data, evalBySource, evalByCategory, signalTypes) {
    let response = {"start_date": req.query.start_date, "end_date": req.query.end_date };
    if (evalBySource && evalByCategory) {
      response["sources"] = [];
      for (var source in data) {
        let src = { "id": source, "categories": [] };
        for (var category in data[source]) {
          let cat = { "id": category, "signals": news.generateSignalTypesArrays(data[source][category], signalTypes) };
          src.categories.push(cat);
        }
        response.sources.push(src);
      }
    } else if (evalBySource) {
      response["sources"] = [];
      for (var source in data) {
        let src = { "id": source, "signals": news.generateSignalTypesArrays(data[source], signalTypes) };
        response.sources.push(src);
      }
    } else if (evalByCategory) {
      response["categories"] = [];
      for (var category in data) {
        let cat = { "id": category, "signals": news.generateSignalTypesArrays(data[category], signalTypes) };
        response.categories.push(cat);
      }
    } else {
      response["signals"] = news.generateSignalTypesArrays(data, signalTypes);
    }    
    return response;
  },
  
  
  
  generateSignalTypesArrays : function(data, signalTypes) {
    let signalTypeArrays = [];
    signalTypes.forEach(function(type) {
      let typeItem = { "id": type, "data": [] };
      let typeData = {};
      for (let date in data) {
        let val = JSON.parse(data[date]);
        if (type in val) {
          typeData[date] = parseFloat(val[type]);
        } else {
          typeData[date] = 0.0;
        }
      }
      typeItem["data"] = news.generateDailyCountArray(typeData);
      signalTypeArrays.push(typeItem);
    });
    return signalTypeArrays;
  },
  
  
  generateDailyCountArray : function(data) {
    let resultList = [];
    let dates = Object.keys(data);
    // Do the sorting of the dates
    dates.sort();
    // Push the values with respect to the sorted dates into the result list
    for (var i = 0; i < dates.length; i++) { // now lets iterate in sort order
      resultList.push(parseFloat(data[dates[i]]));
    }    
    return resultList;
  },
  
  
  
  
  
  getTopWords : function (req, res) {
    if (!req.query.start_date || !req.query.end_date){
      return res.json(new MissingParametersError());
    }
  
    let limit = 100;
    if (req.query.limit) {
      limit = Math.floor(req.query.limit);
    }
  
    async.waterfall([
      function (callback) {
        news.getTermFrequencies(req, callback);
      },
      function (termFrequencies, callback) {
        news.calculateTfIdfValues(termFrequencies, limit, callback);
      }
    ], 
    function (error, result) {
      if (error) {
        res.json(error);  
      } else {
        res.json({"start_date": req.query.start_date, "end_date": req.query.end_date, "data": result});  
      }
    });
  },
    

  
  getTermFrequencies : function(req, callback) {
    let startDate = req.query.start_date;
    let endDate = req.query.end_date;
    
    if ((moment(startDate, moment.ISO_8601).isValid() == false) || (moment(endDate, moment.ISO_8601).isValid() == false)) {
      return callback(new IncorrectTimestampFormat(), null);
    }
    
    let sDate = moment(startDate, moment.ISO_8601).startOf('day');
    let eDate = moment(endDate, moment.ISO_8601).endOf('day');

    if (sDate.isAfter(eDate)) {
      return callback(new InvalidDateOrderError(), null);
    }
    
    let range = moment.range(sDate, eDate)
    let arrayOfDates = Array.from(range.by('days'))
    
    let dates = [];
    arrayOfDates.forEach(function(val){ dates.push(val.format("YYYY-MM-DD")); });
    
    let sources = [];
    if (req.query.article_sources) { req.query.article_sources.split(',').forEach(function(val){ sources.push(val); }); }
  
    let categories = [];
    if (req.query.article_categories) { req.query.article_categories.split(',').forEach(function(val){ categories.push(val); }); }
    
    let limit = 100;
    if (req.query.limit) { limit = Math.floor(req.query.limit); }

    let sourcesWhereClause = news.generateWhereInClause('article_source', sources, true);
    let categoriesWhereClause = news.generateWhereInClause('article_category', categories, true);
    
    // Construct database query
    let query = "SELECT word, SUM(word_count) AS tf FROM rpm_news_articles_top_words_daily WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s GROUP BY word".format(sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), sourcesWhereClause, categoriesWhereClause);
    //console.log(query);
    
    // Execute query, update data, generate response, sent response
    mysql.connection.query(
      query,
      function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return callback(new DatabaseError(), null);
        } else {
          let termFrequencies = {};
          let wordCount = result.length;
          //console.log(wordCount + ' --- ' + dates.length);
          result.forEach(function(row) {
            if (row.tf > dates.length) {
              termFrequencies[row.word] = (row.tf / wordCount);
            }
            //console.log(row.tf + ' +++ ' + row.tf / wordCount);
          });
          return callback(null, termFrequencies);
        }
      }
    );
  },
  
  
  calculateTfIdfValues : function(termFrequencies, limit, callback) {
    let tmpTableName = "rpm_tmp_%s".format(news.getRandomInt(10000, 99999));
    
    async.waterfall([
      function (cb) {
        mysql.connection.query(
          "CREATE TABLE %s (term VARCHAR(32) PRIMARY KEY, tf DECIMAL(9,8) UNSIGNED DEFAULT 0)".format(tmpTableName), function (error, result, fields) { if (error) { errorlog.error(error); return cb(new DatabaseError(), null); } else { return cb(null, null); } });
      },
      function (result, cb) {
        let valuesString = "";
        for (let term in termFrequencies) {
          valuesString += "(" + mysql.connection.escape(term) + ", " + termFrequencies[term] + "), ";
        }
        valuesString = valuesString.slice(0, -2); // Remove trailing comma and whitespace
      
        if (valuesString != '') {
          mysql.connection.query("INSERT INTO %s (term, tf) VALUES %s ON DUPLICATE KEY UPDATE tf=VALUES(tf)".format(tmpTableName, valuesString), function (error, result, fields) { if (error) { errorlog.error(error); return cb(new DatabaseError(), null); } else { return cb(null, null); }});
        } else {
          return cb(null, null);
        }
      },
      function (result, cb) {
        mysql.connection.query("SELECT COUNT(*) AS cnt FROM rpm_news_articles", function (error, result, fields) { if (error) { errorlog.error(error); return cb(new DatabaseError(), null); } else { let corpusCountResult = {}; result.forEach(function(row) { corpusCountResult["count"] = row.cnt; }); return cb(null, corpusCountResult); } });        
      },      
      function (corpusCountResult, cb) {
        let corpusCount = corpusCountResult['count'];
        mysql.connection.query(
          "SELECT tf.term, tf.tf AS tf, df.df AS df, (tf.tf * LOG(%s/df.df)) AS tfidf FROM rpm_news_articles_document_frequencies df, %s tf WHERE df.term = tf.term ORDER BY tfidf DESC LIMIT %s".format(corpusCount, tmpTableName, limit),
          function (error, result, fields) {
          if (error) { 
            errorlog.error(error);
            return cb(new DatabaseError(), null);
          } else {
            let tfidfs = {};
            result.forEach(function(row) {
              tfidfs[row.term] = row.tfidf;
            });
            return cb(null, tfidfs);
          }
        });
      },
      function (tfidfs, cb) {
        mysql.connection.query("DROP TABLE %s".format(tmpTableName), function (error, result, fields) { if (error) { errorlog.error(error); return cb(new DatabaseError(), null); } else { return cb(null, tfidfs); } });
      }
    ], 
    function (error, result) {
      if (error) {
        return callback(error, null);  
      } else {
        return callback(null, result);
      }
    });
    
  },
  
  
  
  getRandomInt : function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  
};





const news = new News();

module.exports = news;