'use strict';

const async     = require('async');
const moment    = require('moment');
const bigInt    = require('big-integer');
const mysql     = require('../../database/mysql');


const errorlog  = require('../../utils/logger').errorlog;

const DatabaseError             = require('../../errors/db/DatabaseError');
const MissingParametersError    = require('../../errors/api/MissingParametersError');
const IncorrectParameterFormat        = require('../../errors/api/IncorrectParameterFormat');
const TweetAlreadyExistsError   = require('../../errors/twitter/TweetAlreadyExistsError');

const ENTITIES_MAPPING = {'hashtag': 10, 'url': 20, 'symbol': 30, 'media': 40, 'photo': 41}


const Twitter = function () { };


Twitter.prototype =  {

  exists : function (tweetId, callback) {
    mysql.connection.query('SELECT COUNT(*) AS count FROM rpm_tweets WHERE id = ? LIMIT 1', [tweetId], function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        callback(new DatabaseError(), null);
      } else {
        if (result[0].count > 0) {
          callback(new TweetAlreadyExistsError(), null);
        } else {
          callback(null, null);
        }
      }
    })
  },
    
  
  insertTweet : function (tweet, callback) {
    let inRetweetToStatusId = null;
    try {
      inRetweetToStatusId = tweet['retweeted_status']['id_str'];
    } catch (e) {
      
    }
    
    let text = tweet['text']
    if (tweet['full_text'] !== undefined) {
      text = tweet['full_text'];
    }
    
    let source = tweet['source'];
    source = source.replace(/<[^>]*>/g, '').toLowerCase();
    
    let createdAt = moment(tweet['created_at'], "ddd MMM DD HH:mm:ss ZZ YYYY").format("YYYY-MM-DD HH:mm:ss");
    
    mysql.connection.query(
      'INSERT INTO rpm_tweets (id, text, lang, source, in_retweet_to_status_id, in_reply_to_status_id, in_reply_to_user_id, quoted_status_id, published_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [ tweet['id_str'], 
        text, 
        tweet['lang'], 
        source, 
        inRetweetToStatusId,
        tweet['in_reply_to_status_id_str'],
        tweet['in_reply_to_user_id_str'],
        tweet['quoted_status_id_str'],
        createdAt,
        tweet['user']['id_str']
      ],
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        return callback(new DatabaseError(), null);
      } else {
        return callback(null, null);
      }
    });
  },
  
  
  
  insertTweetPlace : function (tweet, callback) {
    
    let place = null;
    try {
      place = tweet['place'];
    } catch (e) {
      return callback(null, null);
    }
    
    if (place == null) {
      return callback(null, null);
    }

    let bboxType = null;
    try {
      bboxType = place['bounding_box']['type'].toLowerCase();
    } catch(e) {
      return callback(null, null);
    }

    let polygonString = '';
    if (bboxType == 'polygon') {
      let coords = place['bounding_box']['coordinates'][0];
      coords.push(coords[0]); // Close polygon: last coordinate != for coordinate
      polygonString += 'POLYGON((';
      for (let i = 0; i < coords.length; i++) {
        polygonString += coords[i][0] + ' ' + coords[i][1];
        if (i < coords.length-1) { polygonString += ', '; }
      }
      polygonString += '))'
    } else {
      return callback(null, null);
    }
    
    mysql.connection.query(
      "INSERT INTO rpm_tweet_places (tweet_id, place_id, name, type, country_code, bounding_box) VALUES (?, ?, ?, ?, ?, ST_GeomFromText(?))",
      [ tweet['id_str'], 
        place['id'], 
        place['full_name'], 
        place['place_type'],
        place['country_code'],
        polygonString,
      ],
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        callback(new DatabaseError(), null);
      } else {
        callback(null, null);
      }
    });
  },
    
  
  insertTweetLocation : function(tweet, callback) {
    
    let coordinates = null;
    try {
      coordinates = tweet['coordinates'];
    } catch (e) {
      return callback(null, null);
    }
    
    if (coordinates == null) {
      return callback(null, null);
    }
    
    let pointString = ''
    if (coordinates['type'].toLowerCase() == 'point') {
      let coords = coordinates['coordinates']
      pointString = 'POINT('+coords[0]+' '+coords[1]+')';
    } else {
      return callback(null, null);
    }
    
    mysql.connection.query(
      "INSERT INTO rpm_tweet_locations (tweet_id, coord) VALUES (?, ST_GeomFromText(?))",
      [ tweet['id_str'], 
        pointString,
      ],
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        callback(new DatabaseError(), null);
      } else {
        callback(null, null);
      }
    });
  },
  
  insertOrUpdateUser : function(tweet, callback) {
    let user = tweet['user'];

    let geoEnabled = (user['geo_enabled'] == true) ? (1) : (0);
    let protectedAccount = (user['protected'] == true) ? (1) : (0);
    let verified = (user['verified'] == true) ? (1) : (0);
    
    mysql.connection.query(
      "INSERT INTO rpm_twitter_users (id, name, screen_name, protected, verified, followers_count, friends_count, listed_count, favourites_count, statuses_count, geo_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=?, screen_name=?, protected=?, verified=?, followers_count=?, friends_count=?, listed_count=?, favourites_count=?, statuses_count=?, geo_enabled=?",
      [ user['id_str'], 
        user['name'], 
        user['screen_name'], 
        protectedAccount,
        verified,
        user['followers_count'],
        user['friends_count'],
        user['listed_count'],
        user['favourites_count'],
        user['statuses_count'],
        geoEnabled,
        user['name'], 
        user['screen_name'], 
        protectedAccount,
        verified,
        user['followers_count'],
        user['friends_count'],
        user['listed_count'],
        user['favourites_count'],
        user['statuses_count'],
        geoEnabled
      ],
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        callback(new DatabaseError(), null);
      } else {
        callback(null, null);
      }
    });
  },
  
  
  
  insertTweetEntities : function (tweet, callback) {
    let tweetId = tweet['id_str']
    let entities = tweet['entities'];
    
    let valuesString = "";

    let hashtags = entities['hashtags'];
    if (hashtags !== undefined) {
      for (let i = 0; i < hashtags.length; i++) {
        let h = hashtags[i];
        valuesString += "(" + tweetId + ", " + ENTITIES_MAPPING['hashtag'] + ", " + mysql.connection.escape(h.text) + "), ";
      }
    }

    let urls = entities['urls'];
    if (urls !== undefined) {
      for (let i = 0; i < urls.length; i++) {
        let u = urls[i];
        valuesString += "(" + tweetId + ", " + ENTITIES_MAPPING['url'] + ", '" + u.expanded_url + "'), ";
      }
    }
 
    let media = entities['media'];
    if (media !== undefined) {
      for (let i = 0; i < media.length; i++) {
        let m = media[i];
        valuesString += "(" + tweetId + ", " + ENTITIES_MAPPING[m.type] + ", '" + m.media_url_https + "'), ";
      }
    }
    
    let symbols = entities['symbols'];
    if (symbols !== undefined) {
      for (let i = 0; i < symbols.length; i++) {
        let s = symbols[i];
        valuesString += "(" + tweetId + ", " + ENTITIES_MAPPING['symbol'] + ", " + mysql.connection.escape(s.text) + "), ";
      }
    }
    
    valuesString = valuesString.slice(0, -2); // Remove trailing comma and whitespace
    
    if (valuesString != '') {
      mysql.connection.query(
        "INSERT INTO rpm_tweet_entities (tweet_id, type, value) VALUES " + valuesString,
        function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          callback(new DatabaseError(), null);
        } else {
          callback(null, null);
        }
      });
    } else {
      callback(null, null);
    }
  },
  
  
  addTweet : function (req, res) {
    let tweet = req.body;
    
    if (!('id_str' in tweet)) {
      return res.json(new MissingParametersError());  
    }
    
    let tweetId = tweet['id_str'];      
    
    async.waterfall([
      function (callback) {
        twitter.exists(tweetId, callback);
      },
      function (result, callback) {
        twitter.insertTweet(tweet, callback);
      },
      function (result, callback) {
        twitter.insertTweetEntities(tweet, callback);
      },
      function (result, callback) {
        twitter.insertTweetPlace(tweet, callback);
      },
      function (result, callback) {
        twitter.insertTweetLocation(tweet, callback);
      },
      function (result, callback) {
        twitter.insertOrUpdateUser(tweet, callback);
      },
      function (result, callback) {
        callback(null, {'msg' : 'A-OK'});
      }
    ], 
    function (error, result) {
      if (error) {
        res.json(error);  
      } else {
        res.json({'msg': result});  
      }
    })
  },
  
  
  updateSocialSignals : function (req, res) {
    let body = req.body;

    if(!body.hasOwnProperty('tweet_id')){
      return res.json(new MissingParametersError());
    }
    
    let tweetId = body.tweet_id;
    let tweetIdArray = [tweetId];
    
    
    let query = "INSERT INTO rpm_tweets_social_signals (tweet_id, ";
    let values = "VALUES (?, ";
    let updates = "ON DUPLICATE KEY UPDATE  ";
    let stmtValues = [];
    
    let retweetCount = 0;
    if (body.hasOwnProperty('retweet_count')) { try { retweetCount = parseInt(body.retweet_count); query += "retweet_count, "; values += "?, "; updates += "retweet_count = ?, "; stmtValues.push(retweetCount); } catch (err) { return res.json(new IncorrectParameterFormat()); } }
    
    let quoteCount = 0;
    if (body.hasOwnProperty('quote_count')) { try { quoteCount = parseInt(body.quote_count); query += "retweet_count, "; values += "?, "; updates += "quote_count = ?, "; stmtValues.push(quoteCount); } catch (err) { return res.json(new IncorrectParameterFormat()); } }
    
    let replyCount = 0;
    if (body.hasOwnProperty('reply_count')) { try { replyCount = parseInt(body.reply_count); query += "reply_count, "; values += "?, "; updates += "reply_count = ?, "; stmtValues.push(replyCount); } catch (err) { return res.json(new IncorrectParameterFormat()); } }

    let favoriteCount = 0;
    if (body.hasOwnProperty('favorite_count')) { try { favoriteCount = parseInt(body.favorite_count); query += "favorite_count, "; values += "?, "; updates += "favorite_count = ?, "; stmtValues.push(favoriteCount); } catch (err) { return res.json(new IncorrectParameterFormat()); } }
    
    
    query = query.slice(0, -2);
    query += ") ";
    
    values = values.slice(0, -2);
    values += ") ";
    
    updates = updates.slice(0, -2);
    
    query += values;
    query += updates;
    
    //console.log(urlId.toString() + ", " + source + ", " + type + ", " + value);
    mysql.connection.query(
      query,
      tweetIdArray.concat(stmtValues, stmtValues),
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        return res.json(new DatabaseError());
      } else {
        return res.json({"msg": "success"});
      }
    });
  },
  
    
  
  
};





const twitter = new Twitter();

module.exports = twitter;