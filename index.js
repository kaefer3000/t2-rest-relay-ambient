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
var logger = require('morgan');
// Load RDF
var rdf = require('rdf-ext')
// Load the RDF parsers for HTTP messages
var rdfBodyParser = require('rdf-body-parser');
var RdfXmlSerializer = require('rdf-serializer-rdfxml');

// The root app
app = express();

// Preparing to use my rdf/xml serialiser
var formatparams = {};
formatparams.serializers = new rdf.Serializers();
formatparams.serializers['application/rdf+xml'] = RdfXmlSerializer;
var formats = require('rdf-formats-common')(formatparams);

var configuredBodyParser = rdfBodyParser({'defaultMediaType' : 'text/turtle', 'formats' : formats});

app.use(configuredBodyParser);

var relay   = relaylib.use(tessel.port['A']);  
var ambient = ambientlib.use(tessel.port['B']);

// The two routers for the sensors/actuators
var ambientApp = express.Router({ 'strict' : true });
var relayApp   = express.Router({ 'strict' : true });
relayApp.use(configuredBodyParser);

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
var rootRdfGraph = rdf.createGraph();
rootRdfGraph.addAll(
  [
    new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#BasicContainer')),
    new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
      new rdf.NamedNode('ambient/')),
   new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
      new rdf.NamedNode('relay/'))
  ])

app.all('/', redirectMissingTrailingSlash);
app.get('/', function(request, response) {
  response.sendGraph(rootRdfGraph);
});

var ambientAppLightGraph = rdf.createGraph();
ambientAppLightGraph.addAll(
  [
    new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ssn/SensorOutput')),
    new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://purl.org/linked-data/cube#Observation')),
    new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://xmlns.com/foaf/0.1/isPrimaryTopicOf'),
      new rdf.NamedNode('')),
   new rdf.Triple(
      new rdf.NamedNode('#value'),
      new rdf.NamedNode('http://www.w3.org/ns/ssn/isValueOf'),
      new rdf.NamedNode('#sensorOutput')),
   new rdf.Triple(
      new rdf.NamedNode('#sensorOutput'),
      new rdf.NamedNode('http://www.w3.org/ns/ssn/isProducedBy'),
      new rdf.NamedNode('#sensor')),
  ])
// describing the light sensor
ambientApp.route("/light").get(function (request, response) {

  ambient.getLightLevel(function(err, data) {
    if (err) {
      response.status(500);
      response.send(err);
      return;
    }
    response.sendGraph(
      ambientAppLightGraph.merge(
        [ new rdf.Triple(
            new rdf.NamedNode('#value'),
            new rdf.NamedNode('http://example.org/hasLightValue'),
            new rdf.Literal(data))
        ]))
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
    response.sendGraph(
      ambientAppLightGraph.merge(
        [ new rdf.Triple(
            new rdf.NamedNode('#value'),
            new rdf.NamedNode('http://example.org/hasSoundValue'),
            new rdf.Literal(data))
        ]))
  });
});

var ambientAppGraph = rdf.createGraph();
ambientAppGraph.addAll([
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#IndirectContainer')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#hasMemberRelation'),
      new rdf.NamedNode('http://example.org/hasSensorValue')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#insertedContentRelation'),
      new rdf.NamedNode('http://xmlns.com/foaf/0.1/primaryTopic')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#IndirectContainer'))
]);

// LDP description of the sensors of the ambient module
ambientApp.route('/').all(redirectMissingTrailingSlash);
ambientApp.route('/').get(function(request, response) {

  var ret = ambientAppGraph.clone()
  if (ambientApp.stack)
    ambientApp.stack.forEach(function(blubb){
        if (blubb.route.path)
          if (blubb.route.path.startsWith('/') && blubb.route.path.length > 1) {
            ret.addAll([
              new rdf.Triple(
                  new rdf.NamedNode(''),
                  new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
                  new rdf.NamedNode(blubb.route.path.substring(1))),
              new rdf.Triple(
                  new rdf.NamedNode(''),
                  new rdf.NamedNode('http://example.org/hasSensorValue'),
                  new rdf.NamedNode(blubb.route.path.substring(1) + '#value'))
            ])
          }
    })
  response.sendGraph(ret);
});

var relayAppGraph = rdf.createGraph()
relayAppGraph.addAll([
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#BasicContainer')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
      new rdf.NamedNode('http://example.org/hasSensorValue')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
      new rdf.NamedNode('1')),
  new rdf.Triple(
      new rdf.NamedNode(''),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode(''))
])

// LDP description of the the relay module
relayApp.route('/').all(redirectMissingTrailingSlash)
                   .get(function(request, response) {
  response.sendGraph(relayAppGraph)
});

var relayBaseGraph = rdf.createGraph()
relayBaseGraph.addAll([
  new rdf.Triple(
      new rdf.NamedNode('#actuator'),
      new rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new rdf.NamedNode('http://purl.oclc.org/NET/UNIS/fiware/iot-lite#ActuatingDevice')),
  new rdf.Triple(
      new rdf.NamedNode('#actuator'),
      new rdf.NamedNode('http://xmlns.com/foaf/0.1/isPrimaryTopicOf'),
      new rdf.NamedNode(''))
])
// GETting the state of one switch
relayApp.route("/:id").get(function(request, response) {

  if (request.params.id == 1 || request.params.id == 2) {
    relay.getState(Number(request.params.id), function(err, state) {
      if (err) {
        response.status(500);
        response.send(err);
        return;
      }
      response.sendGraph(relayBaseGraph.merge([
          new rdf.Triple(
            new rdf.NamedNode('#value'),
            new rdf.NamedNode('http://example.org/isSwitchedOn'),
            new rdf.Literal(state, null, 'http://www.w3.org/2001/XMLSchema#boolean'))
        ])
      );
    });
  } else {
    response.sendStatus(404);
  };
});

// PUTting the state of one switch
relayApp.route("/:id").put(function(request, response) {
  if (request.params.id == 1 || request.params.id == 2) {
    if (!request.graph) {
      response.status(400);
      response.send("Please supply a parseable graph.");
      return;
    }
    relay.getState(Number(request.params.id), function(err, state) {
      if (err) {
        response.status(500);
        response.send(err);
        return;
      }
      var targetStateTripleCount = 0;
      var object;
      request.graph.filter(
        function(triple) {
          return triple.predicate.nominalValue === 'http://example.org/isSwitchedOn'
        }).forEach(function(triple) {
          ++targetStateTripleCount;
          // disabled:
          // object = triple.object.valueOf();
          object = triple.object.nominalValue;
        })
      if (targetStateTripleCount === 0 || targetStateTripleCount > 1) {
          response.status(400);
          response.send('Please supply only one triple with desired state');
          return;
      }
      var datatype = typeof object;
      var targetState;
      switch (datatype) {
        case "boolean":
          targetState = object;
          break;
        case "string":
          targetState = object.toLowerCase() == "true";
          if (!targetState && object.toLowerCase() !== "false") {
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

