//
// Serves the ambient and the relay module on HTTP.
//
// TODO: Other RDF serialisations
// TODO: LDP headers and implementation streamlining
// Author: kaefer3000
//

// Import the interface to Tessel hardware
var tessel = require('tessel');
// Load the interface to the ambient sensor
var ambientlib = require('ambient-attx4');
// Load the interface to the relay
var relaylib = require('relay-mono');
// Load the web framework
var express = require('express');
// Load the logger for the web framework
var logger = require('morgan')
// Load some parsers for HTTP message bodys
var bodyParser = require('body-parser')

var relay   = relaylib.use(tessel.port['A']);  
var ambient = ambientlib.use(tessel.port['B']);

// The root app
var app = express();
// The two routers for the sensors/actuators
var ambientApp = express.Router({ 'strict' : true });
var relayApp   = express.Router({ 'strict' : true });
relayApp.use(bodyParser.json({ 'type' : acceptAnyMediaType }));

app.use(function (req, res, next) {
  res.header("Content-Type",'application/ld+json');
  next();
});

// configuring the app
app.set('json spaces', 2);
app.set('case sensitive routing', true);
app.set('strict routing', true);
app.use(logger('dev'));

// defining a utility method that redirects (301) missing trailing slashes
var redirectMissingTrailingSlash = function(request, response, next) {
  if (!request.originalUrl.endsWith('/'))
    response.redirect(301, request.originalUrl + '/');
  else
    next();
};

// wiring the apps and routers
app.use("/ambient", ambientApp);
app.use("/relay",   relayApp);

// LDP description of the root app
app.all('/', redirectMissingTrailingSlash);
app.get('/', function(request, response) {
  response.json({
    '@id' : '' ,
    '@type' : 'http://www.w3.org/ns/ldp#BasicContainer' ,
    'http://www.w3.org/ns/ldp#contains' : ['ambient/' , 'relay/' ]
  });
});

// describing the light sensor
ambientApp.route("/light").get(function (request, response) {

  ambient.getLightLevel(function(err, data) {
    if (err) {
      response.status(500);
      response.send(err);
      return;
    }
    response.json({
      '@id' : '#value' ,
      '@type' : [ 'http://www.w3.org/ns/ssn/SensorOutput' , 'http://purl.org/linked-data/cube#Observation' ] ,
      'http://xmlns.com/foaf/0.1/isPrimaryTopicOf' : '' ,
      'http://www.w3.org/ns/ssn/isValueOf' : { '@id' : '#sensorOutput' , 'http://www.w3.org/ns/ssn/isProducedBy' : '#sensor' } ,
      'http://example.org/hasLightValue' : data
    });
  });

});

// describing the sound sensor
ambientApp.route('/sound').get(function (request, response) {

  ambient.getSoundLevel(function(err, data) {
    if (err) {
      response.status(500);
      response.send(err);
      return;
    }
    response.json({
      '@id' : '#value' ,
      '@type' : [ 'http://www.w3.org/ns/ssn/SensorOutput' , 'http://purl.org/linked-data/cube#Observation' ] ,
      'http://xmlns.com/foaf/0.1/isPrimaryTopicOf' : '' ,
      'http://www.w3.org/ns/ssn/isValueOf' : {
        '@id' : '#sensorOutput' ,
        'http://www.w3.org/ns/ssn/isProducedBy' : '#sensor'
      } ,
      'http://example.org/hasSoundValue' : data
    });
  });
});

// LDP description of the sensors of the ambient module
ambientApp.route('/').all(redirectMissingTrailingSlash);
ambientApp.route('/').get(function(request, response) {

  var ret = {
    '@id' : '' ,
    '@type' : 'http://www.w3.org/ns/ldp#IndirectContainer' ,
    'http://www.w3.org/ns/ldp#hasMemberRelation' : 'http://example.org/hasSensorValue',
    'http://www.w3.org/ns/ldp#insertedContentRelation' : 'http://xmlns.com/foaf/0.1/primaryTopic',
    'http://www.w3.org/ns/ldp#contains' : [],
    'http://example.org/hasSensorValue' : []
  };

  if (ambientApp.stack)
    ambientApp.stack.forEach(function(blubb){
        if (blubb.route.path)
          if (blubb.route.path.startsWith('/') && blubb.route.path.length > 1) {
            ret['http://www.w3.org/ns/ldp#contains'].push(blubb.route.path.substring(1));
            ret['http://example.org/hasSensorValue'].push(blubb.route.path.substring(1) + '#value');
          }
    });

  response.json(ret);
});

// LDP description of the the relay module
relayApp.route('/').all(redirectMissingTrailingSlash)
                   .get(function(request, response) {
  response.json({
    '@id' : '' ,
    '@type' : 'http://www.w3.org/ns/ldp#BasicContainer' ,
    'http://www.w3.org/ns/ldp#contains' : ['1' , '2' ]
  });
});

// GETting the state of one switch
relayApp.route("/:id").get(function(request, response) {

  if (request.params.id == 1 || request.params.id == 2) {
    relay.getState(Number(request.params.id), function(err, state) {
      if (err) {
        response.status(500);
        response.send(err);
        return;
      }
      response.json({
        '@id' : '#actuator',
        'http://xmlns.com/foaf/0.1/isPrimaryTopicOf' : '',
        '@type' : 'http://purl.oclc.org/NET/UNIS/fiware/iot-lite#ActuatingDevice',
        'http://example.org/isSwitchedOn' : state
      });
    });
  } else {
    response.sendStatus(404);
  };
});

// PUTting the state of one switch
relayApp.route("/:id").put(function(request, response) {
  if (request.params.id == 1 || request.params.id == 2) {
    relay.getState(Number(request.params.id), function(err, state) {
      if (err) {
        response.status(500);
        response.send(err);
        return;
      }
      var datatype = typeof request.body['http://example.org/isSwitchedOn'];
      var targetState;
      switch (datatype) {
        case "boolean":
          targetState = request.body['http://example.org/isSwitchedOn'];
          break;
        case "string":
          targetState = request.body['http://example.org/isSwitchedOn'].toLowerCase() == "true";
          if (!targetState && request.body['http://example.org/isSwitchedOn'].toLowerCase() !== "false") {
            response.status(400);
            response.send("Please supply something with a proper boolean value for the http://example.org/isSwitchedOn property");
            return;
          }
          break;
        case "undefined":
          response.status(400);
          response.send("Please supply something with http://example.org/isSwitchedOn property (and give it a boolean value)");
          return;
        default:
          response.status(400);
          response.send("Please supply something with a proper boolean value for the http://example.org/isSwitchedOn property");
          return;
      }
      if (typeof targetState !== "boolean") {
        response.sendStatus(500);
      } else if (targetState !== state) {
        relay.setState(Number(request.params.id), targetState, function(err) {
          if (err) {
            response.status(500);
            response.send(err);
            return;
          }
        });
        response.sendStatus(204);
        return;
      }
      response.sendStatus(204);
      return;
    });
  } else {
    response.sendStatus(404);
    return;
  }
});

// Startup the server
var port = 8080;
app.listen(port, function () {
  console.log('Example app listening on port ' + port);
});

// For finding the server in the network, some handy output on the console
console.log(require('os').networkInterfaces());

// error output for the ambient module
ambient.on('error', function (err) {
  console.log(err);
});

// check mediatype of a request for json or json-ld
var acceptJSONLDMediaType = function(req) {
  var datatype = typeof req.headers['content-type'];
  switch (datatype) {
    case "string": 
      var mediatype = req.headers['content-type'].toLowerCase();
      if (mediatype.startsWith("application/ld+json")
        || mediatype.startsWith("application/json"))
        return true;
      else
        return false;
      break;
    default:
      return false;
    }
};

// accept any media type for a request
var acceptAnyMediaType = function(req) { return true; };

