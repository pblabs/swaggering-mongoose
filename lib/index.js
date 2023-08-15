/* eslint dot-notation: 0 */
"use strict";
var forEach = require("foreach");
var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var MONGOOSE_SPECIFIC = "x-swaggering-mongoose";
var ALLOWED_TYPES = {
  integer: Number,
  long: Number,
  float: Number,
  double: Number,
  password: String,
  boolean: Boolean,
  date: Date,
  dateTime: Date,
  // special case
  string: true,
  number: true,
  array: true,
  object: true
};

// object mixin
var extend = function(destination, source) {
  for (var k in source) {
    if (source.hasOwnProperty(k)) {
      destination[k] = source[k];
    }
  }
  return destination;
};

var convertToJSON = function(spec) {
  var swaggerJSON = {};
  var type = typeof spec;
  switch (type) {
    case "object":
      if (spec instanceof Buffer) {
        swaggerJSON = JSON.parse(spec);
      } else {
        swaggerJSON = spec;
      }
      break;
    case "string":
      swaggerJSON = JSON.parse(spec);
      break;
    default:
      throw new Error("Unknown or invalid spec object");
  }
  return swaggerJSON;
};

var isSimpleSchema = function(schema) {
  return schema.type && !!ALLOWED_TYPES[schema.type];
};

var hasPropertyRef = function(property) {
  return (
    property["$ref"] ||
    (property["type"] === "array" && property["items"]["$ref"])
  );
};

var fillRequired = function(object, key, template) {
  if (template.indexOf(key) >= 0) {
    if (object[key].type) {
      object[key].required = true;
    }
  }
};

var isMongooseProperty = function(property) {
  return !!property[MONGOOSE_SPECIFIC];
};

var isMongooseArray = function(property) {
  return property.items && property.items[MONGOOSE_SPECIFIC];
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

  if (mongooseSpecific.type === "ObjectId" && !mongooseSpecific.ref && ref) {
    mongooseSpecific.type = Schema.Types.ObjectId;
    mongooseSpecific.ref = ref.replace("#/definitions/", "");
    mongooseSpecific.ref = mongooseSpecific.ref.replace(
      "#/components/schemas/",
      ""
    );
  } else if (mongooseSpecific.type) {
    if (mongooseSpecific.type === Schema.Types.ObjectId) {
      return mongooseSpecific;
    }
    if (!Schema.Types[mongooseSpecific.type]) {
      throw new Error(
        "Unrecognised " +
          MONGOOSE_SPECIFIC +
          " type: " +
          mongooseSpecific.type +
          " at: " +
          JSON.stringify(property)
      );
    }
    mongooseSpecific.type = Schema.Types[mongooseSpecific.type];
  }
  return mongooseSpecific;
};

var isMongodbReserved = function(fieldKey) {
  return fieldKey === "_id" || fieldKey === "__v";
};

var getSchema = function(fullObject, objectName, definitions) {
  var props = {};
  var required = fullObject.required || [];
  var object = fullObject["properties"] ? fullObject["properties"] : fullObject;

  var propertyMap = function(property) {
    var type = ALLOWED_TYPES[property.type];
    if (!!type && type !== true) {
      return type;
    }
    switch (property.type) {
      case "number":
        switch (property.format) {
          case "integer":
          case "long":
          case "float":
          case "double":
            return Number;
          default:
            throw new Error("Unrecognised schema format: " + property.format);
        }
      case "string":
        if (property.format === "date-time" || property.format === "date") {
          return Date;
        }
        return String;
      case "array":
        return [propertyMap(property.items)];
      case "object":
        return getSchema(property);
      default:
        throw new Error(
          "Unrecognised property type: " +
            property.type +
            " at: " +
            JSON.stringify(property)
        );
    }
  };

  var processRef = function(property, key) {
    var refRegExp = /^#\/(?:definitions|components\/schemas)\/(\w*)$/;
    var refString = property["$ref"]
      ? property["$ref"]
      : property["items"]["$ref"];
    var refDefinition = refString.match(refRegExp);
    if (!refDefinition) {
      throw new Error(
        'Unrecognised reference "' +
          refString +
          '" at: ' +
          JSON.stringify(property)
      );
    }
    var propType = refDefinition[1];
    if (propType !== objectName) {
      // NOT circular reference
      var schema = getSchema(
        definitions[propType]["properties"]
          ? definitions[propType]["properties"]
          : definitions[propType],
        propType,
        definitions
      );
      props[key] =
        property["items"] || object.type === "array" ? [schema] : schema;
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

    try {
      if (isMongooseArray(property)) {
        props[key] = [getMongooseSpecific(props, property)];
      } else if (hasPropertyRef(property)) {
        processRef(property, key);
      } else if (property.type) {
        if (property.type !== "object") {
          props[key] = {
            type: propertyMap(property)
          };
        } else {
          props[key] = getSchema(property, key, definitions);
        }
        if (!!property.default) props[key].default = property.default;
      } else if (isSimpleSchema(object)) {
        props = {
          type: propertyMap(object)
        };
      }

      fillRequired(props, key, required);

      if (isMongooseProperty(property)) {
        props[key] = extend(
          props[key] || {},
          getMongooseSpecific(props, property)
        );
      }
    } catch (ex) {
      throw new Error(
        'Exception processing key "' +
          key +
          '" at: ' +
          JSON.stringify(property) +
          ":\n" +
          ex.stack +
          "\n"
      );
    }
  });

  return props;
};

var m = {};

m.getDefinitions = function(spec) {
  if (!spec) {
    throw new Error("Swagger spec not supplied");
  }
  var swaggerJSON = convertToJSON(spec);
  return swaggerJSON["definitions"] || swaggerJSON["components"]["schemas"];
};

m.getSchemas = function(definitions) {
  if (!definitions) {
    throw new Error("Definitions not supplied");
  }
  var schemas = {};
  forEach(definitions, function(definition, key) {
    var schemaObj = getSchema(definition, key, definitions);
    var schemaOpts = definition[MONGOOSE_SPECIFIC];
    schemas[key] = new mongoose.Schema(schemaObj, schemaOpts);
  });
  return schemas;
};

m.getModels = function(schemas) {
  if (!schemas) {
    throw new Error("Schemas not supplied");
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
