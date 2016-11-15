# t2-rest-relay-ambient
REST + Linked Data interface for a Tessel 2 with an ambient and relay module.

## Implementation details
Serves [JSON-LD](http://json-ld.org/) on a REST interface. Built on the [Express](http://expressjs.com/) framework. Describes the [Tessel 2](http://tessel.io/) using the following vocabularies: Mainly [LDP](http://www.w3.org/TR/ldp).

Access the root resource like:
````
$ curl http://tessel-ip-or-hostname:8080/
````

## Status
First rough implementation.
