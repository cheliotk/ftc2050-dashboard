const http = require('http');
const urlLib = require('url');
const mongo = require('mongodb');
const fs = require('fs');
const path = require('path');

const config = require('./config.json');

const hostname = config.ServerConfiguration.hostname;
const port = config.ServerConfiguration.port;

const MongoClient = mongo.MongoClient;
const mongoUrl = config.MongoDbConfiguration.url;
const dbsName = config.MongoDbConfiguration.database;
const colName = config.MongoDbConfiguration.collectionTrips;
const waypointsColName = config.MongoDbConfiguration.collectionWaypoints;

const server = http.createServer();

server.on('request', async (req, res, next) => {
  var reqUrl = req.url;
  // console.log(reqUrl);
  reqUrl = reqUrl.replace("/dashboardLive/api", "/");

  try {
    var q = urlLib.parse(reqUrl, true).query;
    var dtMin = new Date(q.dt);
    dtMin = new Date(Date.UTC(dtMin.getFullYear(),dtMin.getMonth(),dtMin.getDate(),dtMin.getHours(),dtMin.getMinutes(),dtMin.getSeconds()));
    
    var dtMax = new Date(q.dtEnd);
    dtMax = new Date(Date.UTC(dtMax.getFullYear(),dtMax.getMonth(),dtMax.getDate(),dtMax.getHours(),dtMax.getMinutes(),dtMax.getSeconds()));

    if(reqUrl.includes("getJourneysByDate")){
      MongoClient.connect(mongoUrl, { useNewUrlParser: true }, function(err, client) {
        const db = client.db(dbsName);
        res.writeHead(200, {'Content-Type': 'application/json'});
        var prevChunk = null;

        var query = {'matchings' : {"$exists" : true}, 'tripData.StartDate' : { '$gte': dtMin, '$lt': dtMax } };
        var projections = config.queryFilters.tripsQuery.projection;

        var cursor = db.collection(colName).find(query).project(projections)
        // .limit(500)  // limits the returned trips to 500, useful for debugging
        .stream({
          transform: function(doc){
            return JSON.stringify(doc);
          }
        })
        ;
        
        cursor.on('data', function onData(data) {
          res.write(data);
        });

        cursor.once('end', function onEnd() {
          res.write(JSON.stringify({'end' : true}));
          res.end();
          client.close();
        });
      });
    }
    else if (reqUrl.includes("getStopsByDate")){
      MongoClient.connect(mongoUrl, { useNewUrlParser: true }, function(err, client) {
        if(err)
          throw err;
        const db = client.db(dbsName);

        var pipeline = [
          {'$match': {'tripData.StartDate' : { '$gte': dtMin, '$lt': dtMax }  } }
          ,{'$project': {
            'Waypoint': { 
              '$arrayElemAt' : ["$SourceWaypoints", -1]
            }
          }}
          ,{'$match': {'Waypoint' : {'$ne' : null} }}
        ];

        var myPromise = () => {
          return new Promise((resolve, reject) => {
            db
              .collection(waypointsColName)
              .aggregate(pipeline)
              .toArray(function(err, data) {
                err 
                  ? reject(err) 
                  : resolve(data);
              });
          });
        };

        var callMyPromise = async () => {
          var result = await (myPromise());
          return result;
        };

        callMyPromise().then(function(result) {
          client.close();
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.write(JSON.stringify(result));
          res.end();
        });
      }); //end mongo client
    }
    
    else if(reqUrl === '/'){
      fs.readFile('templates/index.html', function(err, data) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        res.end();
      });
    }
    else if(reqUrl === '/dashboardLive/app.js'){
      fs.readFile('templates/index.html', function(err, data) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        res.end();
      });
    }
    else{
      var filePath = '.' + reqUrl;
      if (filePath == './')
          filePath = './templates/index.html';

      var extname = path.extname(filePath);
      var contentType = 'text/html';
      switch (extname) {
        case '.js':
          contentType = 'text/javascript';
          break;
        case '.css':
          contentType = 'text/css';
          break;
        case '.json':
          contentType = 'application/json';
          break;
        case '.png':
          contentType = 'image/png';
          break;      
        case '.jpg':
          contentType = 'image/jpg';
          break;
        case '.svg':
          contentType = 'image/svg+xml';
          break;
        case '.wav':
          contentType = 'audio/wav';
          break;
      }

      fs.readFile(filePath, function(error, content) {
        if (error) {
          if(error.code == 'ENOENT'){
            fs.readFile('./404.html', function(error, content) {
              res.writeHead(200, { 'Content-Type': contentType });
              res.end(content, 'utf-8');
            });
          }
          else {
            res.writeHead(500);
            res.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
            res.end(); 
          }
        }
        else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    }
      
   
   } catch (e) {
     console.log(e);
   };
});

server.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});