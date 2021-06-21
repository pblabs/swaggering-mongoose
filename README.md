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
var swaggeringMongoose = require('swaggering-mongoose');

var swagger = fs.readFileSync('./petstore.json');
var Pet = swaggeringMongoose.compile(swagger).models.Pet;
var myPet = new Pet({
    id: 123,
    name: 'Fluffy'
    });
myPet.save();
```

Basic support for OpenApi 3.0.0 has been introduced. See the `components/schemas` in `petstore3.json`

### Advanced usage

The `compile()` method returns both the generated schemas and models from a Swagger document. The process is composed in three steps, available to hook up the process for advanced usage:

1. getDefinitions(spec): returns a definition set from a Swagger file (from the `definitions` or the `components/schemas`)
2. getSchemas(definitions): returns a set of mongoose schemas from a definitions set
3. getModels(schemas): returns a set of mongoose models from a schemas set

```js
var swaggeringMongoose = require('swaggering-mongoose');

var swagger = fs.readFileSync('./petstore.json');

var definitions = swaggeringMongoose.getDefinitions(swagger);
// you can augment/override definitions here

var schemas = swaggeringMongoose.getSchemas(definitions);

// you can augment schemas here, e.g.
schemas.Pet.set('autoIndex', true);

var Pet = swaggeringMongoose.getModels(schemas).Pet;
var myPet = new Pet({
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

## Limitations

swaggering-mongoose supports the following attributes out-of-the-box: integer, long, float, double, string, password, boolean, date, dateTime, date-time, object, array (including nested schemas).

Mongoose doesn't support `required` property for nested object (plain object, not reference), so, swaggering-mongoose silently ignores the property (like a `"x-swaggering-mongoose": { required: false }` override, see below).

## Mongoose extension and override

While the Swagger specification tries to accommodate most use cases, additional data can be added to extend the documentation with specific mongoose properties, such as indexes, external references or fields selection.

Extension are defined as JSON objects in a `x-swaggering-mongoose` property, e.g.

```
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



