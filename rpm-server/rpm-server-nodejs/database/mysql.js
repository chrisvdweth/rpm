var mysql = require('mysql');
var config = require('../preferences/config');
console.log(config);

Mysql = function() {
  this.connection = null;
  this.handleDisconnect();
};


Mysql.prototype =  {

  handleDisconnect : function() {
    var that = this;
    
    console.log("Mysql.handleDisconnect: " + config.mysql.host + " / " + config.mysql.dbname);
    
    this.connection = mysql.createPool({
                        connectionLimit: 10,
                        host     : config.mysql.host,
                        user     : config.mysql.user,
                        password : config.mysql.password,
                        database : config.mysql.dbname,
                        charset  : config.mysql.charset,
                        supportBigNumbers: true, 
                        bigNumberStrings: true
                      })  // Recreate the connection, since the old one cannot be reused.

//     this.connection.connect(function(err) {                   // The server is either down
//       if(err) {                                               // or restarting (takes a while sometimes).
//         console.log('error when connecting to db:', err);
//         setTimeout(that.handleDisconnect, 2000);              // We introduce a delay before attempting to reconnect,
//       }                                                       // to avoid a hot loop, and to allow our node script to
//     });                                                       // process asynchronous requests in the meantime.
//                                                               // If you're also serving http, display a 503 error.
//     this.connection.on('error', function(err) {
//       console.log('db error', err);
//       if(err.code === 'PROTOCOL_CONNECTION_LOST') {           // Connection to the MySQL server is usually
//         that.handleDisconnect();                              // lost due to either server restart, or a
//       } else {                                                // connnection idle timeout (the wait_timeout
//         throw err;                                            // server variable configures this)
//       }
//     });
  },

};


var connection = new Mysql();
connection.handleDisconnect();




module.exports = connection