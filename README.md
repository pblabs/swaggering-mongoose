# swaggering-mongoose

Generate mongoose schemas and models from Swagger documents

## Installation

```js
npm install swaggering-mongoose
```

## Usage

### Basic usage

Pass a swagger document with `definitions` to the `compile()` method and then dynamically access the underlying mongoose models.

```js
const swaggeringMongoose = require('swaggering-mongoose');

const swagger = fs.readFileSync('./petstore.json');
const { models: { Pet } } = swaggeringMongoose.compile(swagger);
const myPet = new Pet({
    id: 123,
    name: 'Fluffy'
    });
myPet.save();
```

Basic support for OpenApi 3.0.0 has been introduced. See the `components/schemas` in `petstore3.json`

### Advanced usage

The `compile()` method returns both the generated schemas and models from a Swagger document. Internally, the process is composed by three steps:

1. getDefinitions(spec): returns a definition set from a Swagger file (from the `definitions` or the `components/schemas`)
2. getSchemas(definitions): returns a set of mongoose schemas from a definitions set
3. getModels(schemas): creates and returns a set of mongoose models from a schemas set

These functions are exported along with the `compile()`, to be used to hook up the intermediate results for advanced usages. See below: 

```js
const swaggeringMongoose = require('swaggering-mongoose');

const swagger = fs.readFileSync('./petstore.json');

const definitions = swaggeringMongoose.getDefinitions(swagger);
// you can augment/override definitions here

const schemas = swaggeringMongoose.getSchemas(definitions);

// you can augment schemas here, e.g.
schemas.Pet.set('autoIndex', true);
// or
schemas.Pet.set('toJSON', { transform: (doc, pojo) => {
  pojo._id = pojo._id.toString() // the _id object is now a string in the POJO doc
} })

const { Pet } = swaggeringMongoose.getModels(schemas);
const myPet = new Pet({
    id: 123,
    name: 'Fluffy'
    });
myPet.save();
```

## Objects Relationships

swaggering-mongoose supports relationships between definitions in a Swagger document. e.g.

```json
"definitions" : {
    "Book" : {
        "type": "object",
        "properties" : {
            "name" : {
                "type": "string"
            },
            "category" : {
                "type": "array",
                "items": {
                    "$ref" : "#/definitions/Category"
                }
            }
        }
    },

    "Category" : {
        "type" : "object",
        "properties" : {
            "name": {
                "type": "string"
            }
        }
    }
}
```

## Mongoose extension and override

While the Swagger specification tries to accommodate most use cases, additional details can be added to extend the documentation with specific mongoose options, such as indexes, external references or fields selection.

These extras can be defined as JSON objects in a `x-swaggering-mongoose` property, e.g.

```json
"definitions" : {
    "User" : {
        "type": "object",
        "properties" : {
            "name" : {
                "type": "string",
                "x-swaggering-mongoose": {
                    "index": {
                        "unique" : true
                   }
                }
            },
            "role" : {
                "type": "string",
                "x-swaggering-mongoose": {
                    "type": "ObjectId",
                    "ref": "Role"
                }
            },
            "password" : {
                "type": "password",
                "x-swaggering-mongoose": {
                    "select": false
                }
            }
        }
    },
```

Additionally, (thanks @ChrisdeWolf) specific mongoose schema options can be applied using the same `x-swaggering-mongoose` property, e.g.

```json
"schemas": {
    "Owner": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string"
            }
        },
        "x-swaggering-mongoose": {
            "timestamps": true, 
            "versionKey": "_custom"
        }
    },
}
```

## Limitations

swaggering-mongoose supports the following attributes out-of-the-box: integer, long, float, double, string, password, boolean, date, dateTime, date-time, object, array (including nested schemas).

Mongoose doesn't support `required` property for nested object (plain object, not reference). Similarly, swaggering-mongoose silently ignores the property even if explicitly defined with an override.

