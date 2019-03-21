'use strict';

const request       = require('request');
const async         = require('async');
const moment        = require('moment');
const farmhash      = require('farmhash');
const url           = require('url');
const bigInt        = require('big-integer');
const sanitizeHtml  = require('sanitize-html');

const mysql         = require('../../database/mysql');
const errorlog      = require('../../utils/logger').errorlog;
const constants     = require('../../preferences/constants');

const DatabaseError                   = require('../../errors/db/DatabaseError');
const MissingParametersError          = require('../../errors/api/MissingParametersError');
const IncorrectParameterFormat        = require('../../errors/api/IncorrectParameterFormat');
const IncorrectUrlFormat              = require('../../errors/api/IncorrectUrlFormat');
const IncorrectTimestampFormat        = require('../../errors/api/IncorrectTimestampFormat');
const NewsArticleAlreadyExistsError   = require('../../errors/news/NewsArticleAlreadyExistsError');

String.prototype.format = function() {
  return [...arguments].reduce((p,c) => p.replace(/%s/,c), this);
};

const News = function () {};


News.prototype =  {

  /* 
   * Check if a news article with this ID already exists in database
   */
  exists : function (articleId, callback) {
    mysql.connection.query('SELECT COUNT(*) AS count FROM rpm_news_articles WHERE id = ? LIMIT 1', [articleId], function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        return callback(new DatabaseError(), null);
      } else {
        if (result[0].count > 0) {
          return callback(null, {'exists': true});
        } else {
          return callback(null, {'exists': false});
        }
      }
    });
  },
    
  /* 
   * Evaluate the source ID for a news article (create new ID if needed)
   * 
   * Source ID = hash(hostname)
   */  
  getSourceOld : function (article, callback) {
    
    let hostname = url.parse(article['url']).hostname;

    if (hostname == null){
      return callback(new IncorrectUrlFormat(), null);
    }
    
    let name = hostname;
    if(article.hasOwnProperty('source_name')){
      name = article['source_name'];
    } 
        
    let sourceId = farmhash.hash32(hostname)        ;
        
    mysql.connection.query(
      'INSERT INTO rpm_news_article_sources (id, hostname, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=?',
      [ sourceId,
        hostname, 
        hostname,
        name
      ],
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        return callback(new DatabaseError(), null);
      } else {
        return callback(null, {'id': sourceId});
      }
    });    
    
    
//     async.waterfall([
//       function (cb) {
//         mysql.connection.query(
//           'INSERT INTO rpm_news_article_sources (hostname, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=?',
//           [ hostname, 
//             hostname,
//             name
//           ],
//           function (error, result, fields) {
//             if (error) { 
//               return cb(error, null);
//             } else {
//               return cb(null, null);
//             }
//         });    
//       },
//       function (result, cb) {
//         mysql.connection.query(
//           'SELECT id FROM rpm_news_article_sources WHERE hostname = ?',
//           [ hostname
//           ],
//           function (error, result, fields) {
//             if (error) { 
//               return cb(error, null);
//             } else {
//               return cb(null, result[0]);
//             }
//           }  
//         );    
//       }
//     ], 
//     function (error, result) {
//       if (error) {
//         return callback(error, null);
//       } else {
//         return callback(null, result);
//       }
//     })
    
    
  },
  
  
  getSource : function (article, callback) {
    let articleUrl = article['url'];
    let hostname = url.parse(articleUrl).hostname;

    if (hostname == null){
      return callback(new IncorrectUrlFormat(), null);
    }
    
    let sourceId = farmhash.hash32(hostname)        ;
        
    mysql.connection.query(
      "SELECT id, url FROM rpm_news_sources WHERE url LIKE '" + hostname + "%'",
      function (error, result, fields) {
      if (error) { 
        errorlog.error(error);
        return callback(new DatabaseError(), null);
      } else {
        if (result.length == 0) {
          return callback(null, { 'id': 0 });
        } else if (result.length == 1){ 
          return callback(null, { 'id': result[0]['id'] });
        } else {
          let maxPrefixLength = -1;
          let maxPos = -1;
          for (let k = 0; k < result.length; k++) {
            let row = result[k];
            let domain = row['url'];
            if ((articleUrl.indexOf(domain) > -1) && (domain.length > maxPrefixLength)) {
              maxPrefixLength = domain.length;
              maxPos = k;
            }
          }
          return callback(null, { 'id': result[maxPos]['id'] });
        }
      }
    });    
  },  
  
  
  
  insertArticle : function (article, articleId, sourceId, callback) {
    //console.log(article);
    let publishedAt = '';
    try {
      publishedAt = moment(article['published_at'], moment.ISO_8601).format("YYYY-MM-DD HH:mm:ss");
    } catch (error) {
      errorlog.error(error);
      return callback(new IncorrectTimestampFormat(), null);
    }
    
    let lang = 'en';
    if(article.hasOwnProperty('lang')){
      lang = article['lang'];
    }
    let imgUrl = '';
    if(article.hasOwnProperty('img_url')){
      imgUrl = article['img_url'];
    }
    
    let snippet = '';
    if(article.hasOwnProperty('content')){
      snippet = article['content'];
      snippet = sanitizeHtml(snippet);
      snippet = snippet.replace(/(\r\n\t|\n|\r\t)/gm," ");
      snippet = snippet.replace(/\s+/g,' ');
      let words = snippet.split(' ');
      if (words.length > constants.MAX_SNIPPET_LENGTH) {
        words = words.slice(0, constants.MAX_SNIPPET_LENGTH);
        words.push('...');
        snippet = words.join(' ');
      }
    }
   
    let valid = 0;
    if(article.hasOwnProperty('valid')){
      valid = article['valid'];
    }
    
        
    mysql.connection.query(
      'INSERT INTO rpm_news_articles (id, url, lang, source, headline, image_url, snippet, published_at, valid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [ articleId, 
        article['url'], 
        lang,
        sourceId,
        article['title'], 
        imgUrl,
        snippet,
        publishedAt,
        valid
      ],
      function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return callback(new DatabaseError(), null);
        } else {
          return callback(null, result);
        }
      }
    );
  },
  
  
  updateDocumentFrequencies : function (article, callback) {
   
    let title = article['title'];
    let content = article['content'];
    let document = title + " " + content;
    
    document = document.replace(/['’]s/g, "");
    //document = document.replace(/s/g, "");
    document = document.replace(/[\.,\/#!$%\^&\*;:{}"'’”…=\_`~()@\+\?><\[\]\+]/g, " ");
    document = document.replace(/[^\x00-\x7F]/g, "");
    document = document.toLowerCase();
    document = document.replace(/\s{2,}/g, " ");
    
    let terms = document.split(" ");
    let tf_values = {};
    terms.forEach(function(i) { tf_values[i] = (tf_values[i]||0) + 1;});
    
    let valuesString = "";
    for (let term in tf_values) {
      valuesString += "(" + mysql.connection.escape(term) + ", 1), ";
    }
    valuesString = valuesString.slice(0, -2); // Remove trailing comma and whitespace
    
    if (valuesString != '') {
      mysql.connection.query(
        "INSERT INTO rpm_news_articles_document_frequencies (term, df) VALUES " + valuesString + " ON DUPLICATE KEY UPDATE df=df+VALUES(df)",
        function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          return callback(new DatabaseError(), null);
        } else {
          return callback(null, null);
        }
      });
    } else {
      return callback(null, null);
    }
  },
  
  
  
  
  pushArticleToSolr : function (article, articleId, sourceId, callback) {
    var options = {
      uri: 'http://localhost:8983/solr/rpm_news/update/json/docs',
      method: 'POST',
      json: {"id": articleId, "title": article['title'], "content": article['content'], "url": article['url'], "published_at": article['published_at'], "source": sourceId}
    }
    
    request(options, function(error, response, body){
      if(error) {
        errorlog.error(error);
        return callback(error, null);
      } else {
        return callback(null, null);
      }
    });
    
  },
  
    
  addArticle : function (req, res) {
    let article = req.body;
    
    if(!article.hasOwnProperty('title') || !article.hasOwnProperty('url') || !article.hasOwnProperty('published_at')){
      return res.json(new MissingParametersError());
    }
    
    if (moment(article['published_at'], moment.ISO_8601).isValid() == false) {
      return res.json(new IncorrectTimestampFormat());
    }
    
    // Generate article id has hash from URL
    let articleId = farmhash.hash64(article['url'])
    let sourceId = "";
    let exists = false;
    
    let hasContent = false;
    if (article.hasOwnProperty('content')) { hasContent = true; }
      
    
    
    async.waterfall([
      function (callback) {
        news.exists(articleId, callback);
      },
      function (result, callback) {
        exists = result['exists'];
        if ((!exists) || (hasContent)) {
          news.getSource(article, callback);
        }
      },
      function (result, callback) {
        sourceId = result['id'];
        if (!exists) {
          news.insertArticle(article, articleId, sourceId, callback);
        } else {
          callback(null, result);
        }
      },
      function (result, callback) {
        if ((!exists) || (hasContent)) {
          news.updateDocumentFrequencies(article, callback);
        } else {
          callback(null, result);
        }
      },
      function (result, callback) {
        if (hasContent) {
          news.pushArticleToSolr(article, articleId, sourceId, callback);
        } else {
          callback(null, result);
        }
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
  
  
  addDailyTopWords : function(req, res) {
    let body = req.body;
    
    if(!body.hasOwnProperty('published_at') || !body.hasOwnProperty('source') || !body.hasOwnProperty('category') || !body.hasOwnProperty('published_at') || !body.hasOwnProperty('data')){
      return res.json(new MissingParametersError());
    }
    
    if (moment(body['published_at'], moment.ISO_8601).isValid() == false) {
      return res.json(new IncorrectTimestampFormat());
    }
    
    let wordFrequencies = body['data'];
    
    let valuesString = "";

    for (let word in wordFrequencies) {
      valuesString += "(TIMESTAMP('" + body['published_at'] + "'), " + body['source'] + ", " + body['category'] + ", " + mysql.connection.escape(word) + ", " + wordFrequencies[word] + "), ";
    }
    valuesString = valuesString.slice(0, -2); // Remove trailing comma and whitespace
    
    if (valuesString != '') {
      mysql.connection.query(
        "INSERT IGNORE INTO rpm_news_articles_top_words_daily (published_at, article_source, article_category, word, word_count) VALUES " + valuesString + " ON DUPLICATE KEY UPDATE word_count=VALUES(word_count)",
        function (error, result, fields) {
        if (error) { 
          errorlog.error(error);
          res.json(new DatabaseError());
        } else {
          res.json({"msg": "OK"});
        }
      });
    } else {
      res.json({"msg": "NOT QUITE OK"});
    }
  },
  
  
//   updateCategory : function (req, res) {
//     let body = req.body;
//     
//     if(!body.hasOwnProperty('url') && !body.hasOwnProperty('url_id')){
//       return res.json(new MissingParametersError());
//     }    
// 
//     if(!body.hasOwnProperty('category')){
//       return res.json(new MissingParametersError());
//     }    
//     
//     let category = -1;
//     try { category = parseInt(body.category) } catch (err) { return res.json(new IncorrectParameterFormat()); }
//     
//     let urlId = -1;
//     if(body.url_id) {
//       urlId = bigInt(body.url_id);
//     } else {
//       urlId = bigInt(farmhash.hash64(body.url));
//     }
//     
//     // Construct database query
//     let query = "UPDATE rpm_news_articles SET category = ? WHERE id = ?";
// 
//     // Execute query, update data, generate response, sent response
//     mysql.connection.query(
//       query,
//       [ category,
//         urlId.toString()
//       ],
//       function (error, result, fields) {
//         if (error) { 
//           errorlog.error(error);
//           return res.json(new DatabaseError());
//         } else {
//           res.json({'msg': 'success'});  
//         }
//       }
//     );
//   },
  
  
};





const news = new News();

module.exports = news;