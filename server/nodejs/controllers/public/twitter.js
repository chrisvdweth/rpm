'use strict';

const async         = require('async');
const Moment        = require('moment');
const MomentRange   = require('moment-range');
const moment        = MomentRange.extendMoment(Moment);
const regression    = require('regression');

const mysql         = require('../../database/mysql');

const errorlog       = require('../../utils/logger').errorlog;

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


const Twitter = function () { };


Twitter.prototype =  {

  
  getDailyCounts : function (req, res) {
    let body = req.body;
    
    if (!req.query.start_date || !req.query.end_date){
      return res.json(new MissingParametersError());
    }

    let startDate = req.query.start_date;
    let endDate = req.query.end_date;
    
    if ((moment(startDate, moment.ISO_8601).isValid() == false) || (moment(endDate, moment.ISO_8601).isValid() == false)) {
      return res.json(new IncorrectTimestampFormat());
    }
    
    let sDate = moment(startDate, moment.ISO_8601).startOf('day');
    let eDate = moment(endDate, moment.ISO_8601).endOf('day');

    if (sDate.isAfter(eDate)) {
      return res.json(new InvalidDateOrderError());
    }
    
    let range = moment.range(sDate, eDate)
    let arrayOfDates = Array.from(range.by('days'))
    
    let dates = [];
    arrayOfDates.forEach(function(val){ dates.push(val.format("YYYY-MM-DD")); });

    let types = [];
    if (req.query.tweet_types) {
      req.query.tweet_types.split(',').forEach(function(val){ types.push(val); });
    }    
    
    let categories = [];
    if (req.query.tweet_categories) {
      req.query.tweet_categories.split(',').forEach(function(val){ categories.push(val); });
    }    
    
    let groups = [];
    if (req.query.groups) {
      req.query.groups.split(',').forEach(function(val){ groups.push(val.toLowerCase()); });
    }    
    
    let evalByCategory = false;
    if (groups.indexOf('tweet_category') > -1) {
      if (categories.length == 0) {
        return res.json({"error": "If CATEGORY is in group then categories parameter cannot be empty" });        
      }
      evalByCategory = true;
    } 
    
    let evalByTweetType = false;
    if (groups.indexOf('tweet_type') > -1) {
      if (types.length == 0) {
        return res.json({"error": "If TWEET_TYPE is in group then tweet types parameter cannot be empty" });        
      }
      evalByTweetType = true;
    }     
    
    let data = twitter.generateDataObject(types, categories, dates, evalByTweetType, evalByCategory, 0);
    //console.log(data);
    
    let categoriesWhereClause = twitter.generateWhereInClause('tweet_category', categories, false);
    let tweetTypesWhereClause = twitter.generateWhereInClause('tweet_type', types, false);
    
    let selectGroupByClause = twitter.generateSelectGroupByClauses("DATE_FORMAT(published_at, '%Y-%m-%d') AS date, ", "date, ", groups);
    let groupByClause = selectGroupByClause["groupby"];
    let selectClause = selectGroupByClause["select"];
    
    // Construct database query
    let query = "SELECT %s, SUM(tweet_count) AS value FROM rpm_tweets_count_daily WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s GROUP BY %s".format(selectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), categoriesWhereClause, tweetTypesWhereClause, groupByClause);
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
           twitter.updateDataObject(data, row, evalByTweetType, evalByCategory);        
          });
          return res.json(twitter.generateGetDailyCountsResponse(req, data, evalByTweetType, evalByCategory));
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
  
    let signals = twitter.generateValidSignalSourcesAndTypes(req);
    let signalSources = signals["sources"];
    let signalTypes = signals["types"]
      
    let tweetTypes = [];
    if (req.query.tweet_types) { req.query.tweet_types.split(',').forEach(function(val){ tweetTypes.push(val); }); }
  
    let tweetCategories = [];
    if (req.query.tweet_categories) { req.query.tweet_categories.split(',').forEach(function(val){ tweetCategories.push(val); }); }
    
    let groups = [];
    if (req.query.groups) { req.query.groups.split(',').forEach(function(val){ groups.push(val.toLowerCase()); }); }
    
    let evalByTweetType = false;
    if (groups.indexOf('tweet_type') > -1) {
      if (tweetTypes.length == 0) {
        return res.json({"error": "If TWEET TYPE is in group then tweet types parameter cannot be empty" });        
      }
      evalByTweetType = true;
    } 
    
    let evalByCategory = false;
    if (groups.indexOf('article_category') > -1) {
      if (tweetCategories.length == 0) {
        return res.json({"error": "If CATEGORY is in group then tweetCategories parameter cannot be empty" });        
      }
      evalByCategory = true;
    } 
    
    let data = twitter.generateDataObject(tweetTypes, tweetCategories, dates, evalByTweetType, evalByCategory, "{}");

    let signalSourceWhereClause = twitter.generateWhereInClause('signal_source', signalSources, true);
    let signalTypeWhereClause = twitter.generateWhereInClause('signal_type', signalTypes, true);
    let tweetTypesWhereClause = twitter.generateWhereInClause('tweet_type', tweetTypes, true);
    let tweetCategoriesWhereClause = twitter.generateWhereInClause('tweet_category', tweetCategories, true);
    
    let innerSelectGroupByClauses = twitter.generateSelectGroupByClauses("DATE_FORMAT(published_at, '%Y-%m-%d') AS date, ", "date, ", groups);
    let innerGroupByClause = innerSelectGroupByClauses["groupby"];
    let innerSelectClause = innerSelectGroupByClauses["select"];
    
    let outerSelectGroupByClauses = twitter.generateSelectGroupByClauses("date, ", "date, ", groups);
    let outerGroupByClause = outerSelectGroupByClauses["groupby"];
    let outerSelectClause = outerSelectGroupByClauses["select"];

    // Construct database query
    let query = "SELECT %s, CONCAT('{' ,GROUP_CONCAT(CONCAT('\"', signal_type, '\": \"',value,'\"')), '}') AS value FROM (SELECT %s, signal_type, SUM(signal_value) AS value FROM rpm_tweets_social_signals_count_daily WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s %s %s GROUP BY %s, signal_type) tab GROUP BY %s".format(outerSelectClause, innerSelectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), tweetTypesWhereClause, tweetCategoriesWhereClause, signalSourceWhereClause, signalTypeWhereClause, innerGroupByClause, outerGroupByClause);
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
            twitter.updateDataObject(data, row, evalByTweetType, evalByCategory);                     
          });
          return res.json(twitter.generateGetDailySocialSignalCountsResponse(req, data, evalByTweetType, evalByCategory, signalTypes));
          //return res.json({});
        }
      }
    );

  },
    
    
  
  


  getSocialSignalCountTrends : function (req, res) {
    let body = req.body;
    
    if (!req.query.date || !req.query.days || !req.query.tweet_categories) { return res.json(new MissingParametersError()); }

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
  
    let signals = twitter.generateValidSignalSourcesAndTypes(req);
    let signalSources = signals["sources"];
    let signalTypes = signals["types"]
      
    let tweetTypes = [];
    if (req.query.tweet_types) { req.query.tweet_types.split(',').forEach(function(val){ tweetTypes.push(val); }); }
  
    let tweetCategories = [];
    if (req.query.tweet_categories) { req.query.tweet_categories.split(',').forEach(function(val){ tweetCategories.push(val); }); }
    
    let evalByTweetType = false;
    let evalByCategory = true;
    
    let data = twitter.generateDataObject(tweetTypes, tweetCategories, dates, evalByTweetType, evalByCategory, 0);
    
    let signalSourceWhereClause = twitter.generateWhereInClause('signal_source', signalSources, true);
    let signalTypeWhereClause = twitter.generateWhereInClause('signal_type', signalTypes, true);
    let tweetTypesWhereClause = twitter.generateWhereInClause('tweet_type', tweetTypes, true);
    let articleCategoriesWhereClause = twitter.generateWhereInClause('tweet_category', tweetCategories, true);
    
    let innerSelectGroupByClauses = twitter.generateSelectGroupByClauses("DATE_FORMAT(published_at, '%Y-%m-%d') AS date, ", "date, ", ["tweet_category"]);
    let innerGroupByClause = innerSelectGroupByClauses["groupby"];
    let innerSelectClause = innerSelectGroupByClauses["select"];
    
    let outerSelectGroupByClauses = twitter.generateSelectGroupByClauses("date, ", "date, ", ["tweet_category"]);
    let outerGroupByClause = outerSelectGroupByClauses["groupby"];
    let outerSelectClause = outerSelectGroupByClauses["select"];

    // Construct database query
    let query = "SELECT %s, SUM(value) AS value FROM (SELECT %s, signal_type, SUM(signal_value) AS value FROM rpm_tweets_social_signals_count_daily WHERE published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s %s %s GROUP BY %s, signal_type) tab GROUP BY %s".format(outerSelectClause, innerSelectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), tweetTypesWhereClause, articleCategoriesWhereClause, signalSourceWhereClause, signalTypeWhereClause, innerGroupByClause, outerGroupByClause);
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
            twitter.updateDataObject(data, row, evalByTweetType, evalByCategory);                     
          });
          return res.json(twitter.generateGetSocialSignalCountTrendsResponse(req, data, days));
        }
      }
    );

  },
    


  generateGetSocialSignalCountTrendsResponse : function(req, data, days) {
    let response = {"date": req.query.start_date };

    response["categories"] = [];
      for (var category in data) {
        let values = twitter.generateDailyCountArray(data[category]);
        //console.log(values);
        let cat = { "id": category, "trends": [] };
        let lastDayValue = values[values.length-1];
        //console.log(lastDayValue);
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
    
  
  

  getDailyTopTweetsBySocialSignals : function (req, res) {
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
    
    let tweetTypes = [];
    if (req.query.tweet_types) { req.query.tweet_types.split(',').forEach(function(val){ tweetTypes.push(val); }); }
  
    let tweetCategories = [];
    if (req.query.article_categories) { req.query.article_categories.split(',').forEach(function(val){ tweetCategories.push(val); }); }  
    
    let groups = [];
    if (req.query.groups) { req.query.groups.split(',').forEach(function(val){ groups.push(val.toLowerCase()); }); }
    
    let evalBySource = false;
    if (groups.indexOf('article_source') > -1) {
      if (tweetTypes.length == 0) {
        return res.json({"error": "If SOURCE is in group then article sources parameter cannot be empty" });        
      }
      evalBySource = true;
    } 
    
    let evalByCategory = false;
    if (groups.indexOf('article_category') > -1) {
      if (tweetCategories.length == 0) {
        return res.json({"error": "If CATEGORY is in group then article categories parameter cannot be empty" });        
      }
      evalByCategory = true;
    }     
  
    let signals = twitter.generateValidSignalSourcesAndTypes(req);
    let signalSources = signals["sources"];
    let signalTypes = signals["types"]
      
    //let signalSourceWhereClause = twitter.generateWhereInClause('signal_source', signalSources, true);
    let signalTypeWhereClause = twitter.generateWhereInClause('signal_type', signalTypes, true);
    let tweetTypesWhereClause = twitter.generateWhereInClause('tweet_type', tweetTypes, true);
    let tweetCategoriesWhereClause = twitter.generateWhereInClause('tweet_category', tweetCategories, true);
    
    let selectGroupByClauses = twitter.generateSelectGroupByClauses("DATE_FORMAT(r.published_at, '%Y-%m-%d') AS date, ", "r.date, ", []);
    let selectClause = selectGroupByClauses["select"];

  
    // Construct database query
    let query = "(SELECT m.date, m.tweet_id, m.signal_type, m.signal_value, t.text, CONCAT('https://api.twitter.com/1/statuses/oembed.json?id=', t.id, '&align=left&callback=?') AS url FROM (SELECT %s, r.tweet_id, r.signal_type, r.signal_value FROM rpm_tweets_ranking r WHERE r.published_at BETWEEN STR_TO_DATE('%s','%Y-%m-%dT%TZ') AND STR_TO_DATE('%s','%Y-%m-%dT%TZ') %s %s AND signal_type = %s GROUP BY DATE_FORMAT(r.published_at, '%Y-%m-%d'), r.tweet_id, r.signal_type, r.signal_value) m, rpm_tweets t WHERE m.tweet_id = t.id ORDER BY signal_value DESC LIMIT %s)".format(selectClause, sDate.format("YYYY-MM-DD"), eDate.format("YYYY-MM-DD"), tweetTypesWhereClause, tweetCategoriesWhereClause, req.query.signal_type, limit);
    console.log(query);
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
            response["data"].push({ "tweet_id": row.tweet_id, "tweet_text": row.text, "tweet_url": row.url, "signal_value": row.signal_value });
          });
          return res.json(response);
        }
      }
    );
    
  },
      
  
  


  
  generateDataObject : function(sources, categories, dates, evalByTweetType, evalByCategory, defaultValue) {
    let data = {};
    if (evalByTweetType && evalByCategory) {
      sources.forEach(function(type) { data[type] = {}; categories.forEach(function(category) { data[type][category] = {}; dates.forEach(function(date) { data[type][category][date] = defaultValue; }); }); });
    } else if (evalByTweetType) {
      sources.forEach(function(type) { data[type] = {}; dates.forEach(function(date) { data[type][date] = defaultValue; }); });
    } else if (evalByCategory) {
      categories.forEach(function(category) { data[category] = {}; dates.forEach(function(date) { data[category][date] = defaultValue; });  });
    } else {
      dates.forEach(function(date) { data[date] = defaultValue; });
    } 
    return data;
  },
    
  
  
  updateDataObject : function(data, row, evalByTweetType, evalByCategory) {
    if (evalByTweetType && evalByCategory) {
      data[row.tweet_type][row.tweet_category][row.date] = row.value;
    } else if (evalByTweetType) {
      data[row.tweet_type][row.date] = row.value;
    } else if (evalByCategory) {
      data[row.tweet_category][row.date] = row.value;
    } else {
      data[row.date] = row.value;
    }    
  },
  
    
  
  
  generateGetDailyCountsResponse : function (req, data, evalByTweetType, evalByCategory) {
    let response = {"start_date": req.query.start_date, "end_date": req.query.end_date };
    if (evalByTweetType && evalByCategory) {
      response["types"] = [];
      for (var type in data) {
        let src = { "id": type, "categories": [] };
        for (var category in data[type]) {
          let cat = { "id": category, "data": twitter.generateDailyCountArray(data[type][category]) };
          src.categories.push(cat);
        }
        response.types.push(src);
      }
    } else if (evalByTweetType) {
      response["types"] = [];
      for (var type in data) {
        let src = { "id": type, "data": twitter.generateDailyCountArray(data[type]) };
        response.types.push(src);
      }
    } else if (evalByCategory) {
      response["categories"] = [];
      for (var category in data) {
        let cat = { "id": category, "data": twitter.generateDailyCountArray(data[category]) };
        response.categories.push(cat);
      }
    } else {
      response["data"] = twitter.generateDailyCountArray(data);
    }    
    return response;
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
    
  
  generateGetDailySocialSignalCountsResponse : function (req, data, evalBySource, evalByCategory, signalTypes) {
    let response = {"start_date": req.query.start_date, "end_date": req.query.end_date };
    if (evalBySource && evalByCategory) {
      response["sources"] = [];
      for (var source in data) {
        let src = { "id": source, "categories": [] };
        for (var category in data[source]) {
          let cat = { "id": category, "signals": twitter.generateSignalTypesArrays(data[source][category], signalTypes) };
          src.categories.push(cat);
        }
        response.sources.push(src);
      }
    } else if (evalBySource) {
      response["sources"] = [];
      for (var source in data) {
        let src = { "id": source, "signals": twitter.generateSignalTypesArrays(data[source], signalTypes) };
        response.sources.push(src);
      }
    } else if (evalByCategory) {
      response["categories"] = [];
      for (var category in data) {
        let cat = { "id": category, "signals": twitter.generateSignalTypesArrays(data[category], signalTypes) };
        response.categories.push(cat);
      }
    } else {
      //response["data"] = twitter.generateDailyCountArray(data);
      response["signals"] = twitter.generateSignalTypesArrays(data, signalTypes);
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
      typeItem["data"] = twitter.generateDailyCountArray(typeData);
      signalTypeArrays.push(typeItem);
    });
    return signalTypeArrays;
  },
  
    
  
    
};





const twitter = new Twitter();

module.exports = twitter;