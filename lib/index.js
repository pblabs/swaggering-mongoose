/* eslint dot-notation: 0 */
'use strict';
var forEach = require('foreach');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var MONGOOSE_SPECIFIC = 'x-swaggering-mongoose';
var ALLOWED_TYPES = {
  'integer': Number,
  'long': Number,
  'float': Number,
  'double': Number,
  'password': String,
  'boolean': Boolean,
  'date': Date,
  'dateTime': Date,
  // special case
  'string': true,
  'number': true,
  'array': true
};

var propertyMap = function(property) {
  var type = ALLOWED_TYPES[property.type];
  if (!!type && type !== true) {
    return type;
  }
  switch (property.type) {
    case 'number':
      switch (property.format) {
        case 'integer':
        case 'long':
        case 'float':
        case 'double':
          return Number;
        default:
          throw new Error('Unrecognised schema format: ' + property.format);
      }
    case 'string':
      if (property.format === 'date-time') {
        return Date;
      }
      return String;
    case 'array':
      return [propertyMap(property.items)];
    default:
      throw new Error('Unrecognised property type: ' + property.type);
  }
};

var convertToJSON = function(spec) {
  var swaggerJSON = {};
  var type = typeof (spec);
  switch (type) {
    case 'object':
      if (spec instanceof Buffer) {
        swaggerJSON = JSON.parse(spec);
      } else {
        swaggerJSON = spec;
      }
      break;
    case 'string':
      swaggerJSON = JSON.parse(spec);
      break;
    default:
      throw new Error('Unknown or invalid spec object');
  }
  return swaggerJSON;
};

var isSimpleSchema = function(schema) {
  return schema.type && !!ALLOWED_TYPES[schema.type];
};

var hasPropertyRef = function(property) {
  return property['$ref'] || ((property['type'] === 'array') && (property['items']['$ref']));
};

var fillRequired = function(object, key, template) {
  if (template.indexOf(key) >= 0) {
    object[key].required = true;
  }
};

var isMongooseProperty = function(property) {
  return !!property[MONGOOSE_SPECIFIC];
};

var isMongooseArray = function(property) {
  return property.items && property.items[MONGOOSE_SPECIFIC];
};

// object mixin
var extend = function( destination, source ) {
  for ( var k in source ) {
    if ( source.hasOwnProperty( k ) ) {
      destination[ k ] = source[ k ];
    }
  }
  return destination;
};

var getMongooseSpecific = function(props, property) {
  var mongooseSpecific = property[MONGOOSE_SPECIFIC];
  var ref = property.$ref;

  if (!mongooseSpecific && isMongooseArray(property)) {
    mongooseSpecific = property.items[MONGOOSE_SPECIFIC];
    ref = property.items.$ref;
  }

  if (!mongooseSpecific) {
    return props;
  }

  if (mongooseSpecific.type === 'ObjectId') {
    var ret = {};
    ret.type = Schema.Types.ObjectId;
    if (mongooseSpecific.includeSwaggerRef !== false) {
      ret.ref = ref.replace('#/definitions/', '');
    }
    return ret;
  } else if ( mongooseSpecific.type ) {
    mongooseSpecific.type = Schema.Types[mongooseSpecific.type];
    if (!mongooseSpecific.type) {
      throw new Error('Unrecognised property type: ' + mongooseSpecific.type);
    }
  }
  return mongooseSpecific;
};

var isMongodbReserved = function(fieldKey) {
  return fieldKey === '_id' || fieldKey === '__v';
};

var getSchema = function(fullObject, objectName, definitions) {
  var props = {};
  var required = fullObject.required || [];
  var object = fullObject['properties'] ? fullObject['properties'] : fullObject;

  var processRef = function(property, key) {
    var refRegExp = /^#\/definitions\/(\w*)$/;
    var refString = property['$ref'] ? property['$ref'] : property['items']['$ref'];
    var propType = refString.match(refRegExp)[1];
    if (propType !== objectName) {
      // NOT circular reference
      props[key] = [getSchema(definitions[propType]['properties'] ? definitions[propType]['properties'] : definitions[propType], propType, definitions)];
    } else {
      // circular reference
      props[key] = {
        type: Schema.Types.ObjectId,
        ref: objectName
      };
    }
  };

  forEach(object, function(property, key) {
    if (isMongodbReserved(key) === true) {
      return;
    }

    if (isMongooseArray(property)) {
      props[key] = [getMongooseSpecific(props, property)];
    } else if (hasPropertyRef(property)) {
      processRef(property, key);
    } else if (property.type) {
      if (property.type !== 'object') {
        props[key] = {
          type: propertyMap(property)
        };
      } else {
        props[key] = getSchema(property, key, definitions);
      }
    } else if (isSimpleSchema(object)) {
      props = {
        type: propertyMap(object)
      };
    }

    if (isMongooseProperty(property)) {
      props[key] = extend( props[key] || {}, getMongooseSpecific(props, property));
    }

    fillRequired(props, key, required);
  });

  return props;
};


var m = {};

m.getDefinitions = function(spec) {
  if (!spec) {
    throw new Error('Swagger spec not supplied');
  }
  var swaggerJSON = convertToJSON(spec);
  return swaggerJSON['definitions'];
};

m.getSchemas = function(definitions) {
  if (!definitions) {
    throw new Error('Definitions not supplied');
  }
  var schemas = {};
  forEach(definitions, function(definition, key) {
    var object = getSchema(definition, key, definitions);
    schemas[key] = new mongoose.Schema(object);
  });
  return schemas;
};

m.getModels = function(schemas) {
  if (!schemas) {
    throw new Error('Schemas not supplied');
  }
  var models = {};
  forEach(schemas, function(schema, key) {
    models[key] = mongoose.model(key, schema);
  });
  return models;
};

m.compile = function(spec) {
  var definitions = m.getDefinitions(spec);
  var schemas = m.getSchemas(definitions);
  var models = m.getModels(schemas);

  return {
    schemas: schemas,
    models: models
  };
};

module.exports = m;
