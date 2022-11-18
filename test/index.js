/* eslint-env mocha */
'use strict';
var swaggerMongoose = require('./../lib/index');

var fs = require('fs');
var async = require('async');
var mongoose = require('mongoose');
var Mockgoose = require('mockgoose').Mockgoose;
var mockgoose = new Mockgoose(mongoose);
var assert = require('chai').assert;
var Schema = mongoose.Schema;

describe('swaggering-mongoose tests', function() {

  beforeEach(function(done) {
    mockgoose.prepareStorage().then( function() {
      mongoose.connect('mongodb://localhost/schema-test', { useNewUrlParser: true }, done);
    });
  });

  afterEach(function(done) {
    delete mongoose.models.Pet;
    delete mongoose.models.Owner;
    delete mongoose.models.Address;
    delete mongoose.models.Error;
    delete mongoose.models.Person;
    delete mongoose.models.House;
    delete mongoose.models.Car;
    delete mongoose.models.Human;
    delete mongoose.models.Contact;
    mockgoose.helper.reset().then(function() {
      mongoose.disconnect(done);
    });
  });

  it('should create a sample pet and return all valid properties', function(done) {
    var swagger = fs.readFileSync('./test/petstore.json');
    var Pet = swaggerMongoose.compile(swagger).models.Pet;
    var myPet = new Pet({
      id: 123,
      name: 'Fluffy',
      dob: new Date(),
      price: 99.99,
      sold: true,
      friends: ['Barney', 'Fido'],
      favoriteNumbers: [1, 3, 7, 9],
      address: [
        {
          addressLine1: '1 Main St.'
        },
        {
          addressLine1: '2 Main St.'
        }
      ],
      notAKey: 'test'
    });
    myPet.save(function(err) {
      if (err) {
        throw err;
      }
      Pet.findOne({
        id: 123
      }, function(err, data) {
        assert(data.id === 123, 'ID mismatch');
        assert(data.name === 'Fluffy', 'Name mismatch');
        assert(data.price === 99.99, 'Price mismatch');
        assert(data.sold === true, 'Sold mismatch');
        assert(data.friends.length === 2, 'Friends mismatch');
        assert(data.favoriteNumbers.length === 4, 'Favorite numbers mismatch');
        assert(data.address[0].addressLine1 === '1 Main St.', 'Nested address mismatch');
        assert(data.address[1].addressLine1 === '2 Main St.', 'Nested address mismatch');
        assert(!data.notAKey, 'Strict schema mismatch');
        done();
      });
    });
  });

  it('should not create a sample without required field', function(done) {
    var swagger = fs.readFileSync('./test/petstore.json');
    var Pet = swaggerMongoose.compile(swagger).models.Pet;
    var myPet = new Pet({
      id: 123
    });
    myPet.save(function(err) {
      assert(err, 'Validation error is missing');
      done();
    });
  });

  it('should create a sample pet from a file', function(done) {
    var swagger = fs.readFileSync('./test/petstore.json');
    var Pet = swaggerMongoose.compile(swagger).models.Pet;
    var myPet = new Pet({
      id: 123,
      name: 'Fluffy'
    });
    myPet.save(function(err) {
      if (err) {
        throw err;
      }
      Pet.findOne({
        id: 123
      }, function(err, data) {
        assert(data.id === 123, 'ID mismatch');
        assert(data.name === 'Fluffy', 'Name mismatch');
        done();
      });
    });
  });

  it('should create a sample pet from a JSON object', function(done) {
    var swagger = fs.readFileSync('./test/petstore.json');
    var Pet = swaggerMongoose.compile(JSON.parse(swagger)).models.Pet;
    var myPet = new Pet({
      id: 123,
      name: 'Fluffy'
    });
    myPet.save(function(err) {
      if (err) {
        throw err;
      }
      Pet.findOne({
        id: 123
      }, function(err, data) {
        assert(data.id === 123, 'ID mismatch');
        assert(data.name === 'Fluffy', 'Name mismatch');
        done();
      });
    });
  });

  it('should create a sample pet from a string', function(done) {
    var swagger = fs.readFileSync('./test/petstore.json');
    var Pet = swaggerMongoose.compile(swagger.toString()).models.Pet;
    var myPet = new Pet({
      id: 123,
      name: 'Fluffy'
    });
    myPet.save(function(err) {
      if (err) {
        throw err;
      }
      Pet.findOne({
        id: 123
      }, function(err, data) {
        assert(data.id === 123, 'ID mismatch');
        assert(data.name === 'Fluffy', 'Name mismatch');
        done();
      });
    });
  });

  it('should create a sample person with relations to external collections', function(done) {
    var swagger = fs.readFileSync('./test/person.swaggering.json');

    var models = swaggerMongoose.compile(swagger.toString()).models;

    var Person = models.Person;
    var House = models.House;
    var Car = models.Car;

    assert(Person.schema.paths.cars.options.type[0].type === Schema.Types.ObjectId, 'Wrong "car" type');
    assert(Person.schema.paths.cars.options.type[0].ref === 'Car', 'Ref to "car" should be "Car"');
    assert(Person.schema.paths.houses.options.type[0].type === Schema.Types.ObjectId, 'Wrong "house" type');
    assert(Person.schema.paths.houses.options.type[0].ref === 'House', 'Ref to "house" should be "House"');

    async.parallel({
      house: function(cb) {
        var house = new House({
          description: 'Cool house',
          lng: 50.3,
          lat: 30
        });
        house.save(function(err, data) {
          cb(err, data);
        });
      },
      car: function(cb) {
        var car = new Car({
          provider: 'Mazda',
          model: 'CX-5'
        });
        car.save(function(err, data) {
          cb(err, data);
        });
      }
    }, function(err, results) {
      var person = new Person({
        login: 'jb@mi6.gov',
        firstName: 'James',
        lastName: 'Bond',
        password: 'secret',
        houses: [
          results.house._id
        ],
        cars: [
          results.car._id
        ],
        contacts: [{
          contactID: '0000000000000000000000aa'
        }]
      });
      person.save(function(err, data) {
        assert(!err, 'error should be null');
        assert(data, 'data should be defined');
        Person
          .findOne({
            _id: data._id
          })
          .lean()
          .exec(function(err, newPerson) {
            assert(!err, 'error should be null');
            assert(newPerson, 'newPerson should be defined');
            async.parallel({
              car: function(cb) {
                Car.findOne({
                  _id: newPerson.cars[0]
                }, function(err, car) {
                  assert(!err, 'error should be null');
                  assert(car, 'car should be defined');
                  cb(err, car);
                });
              },
              house: function(cb) {
                House.findOne({
                  _id: newPerson.houses[0]
                }, function(err, house) {
                  assert(!err, 'error should be null');
                  assert(house, 'house should be defined');
                  cb(err, house);
                });
              }
            }, function(err, populated) {
              newPerson.cars = [populated.car];
              newPerson.houses = [populated.house];

              assert(newPerson.login === 'jb@mi6.gov', 'Login is incorrect');
              assert(newPerson.firstName === 'James', 'First Name is incorrect');
              assert(newPerson.lastName === 'Bond', 'Last Name is incorrect');
              assert(newPerson.password === undefined, 'Person password should be not visible');
              assert(newPerson.cars.length === 1, 'Cars content is wrong');
              assert(newPerson.cars[0].model === 'CX-5', 'Car model is incorrect');
              assert(newPerson.cars[0].provider === 'Mazda', 'Car provider is incorrect');
              assert(newPerson.houses.length === 1, 'Houses content is wrong');
              assert(newPerson.houses[0].lat === 30, 'House latitude is incorrect');
              assert(newPerson.houses[0].lng === 50.3, 'House longitude is incorrect');
              assert(newPerson.houses[0].description === 'Cool house', 'House description is incorrect');
              assert(newPerson.contacts.length === 1, 'Contacts content is wrong');
              assert(newPerson.contacts[0].priority === 'high', 'Contact priority is wrong');
              assert(newPerson.contacts[0].contactID.toString() === '0000000000000000000000aa', 'Contact contactID type is wrong');
              assert(newPerson.contacts[0]._id, 'Contact _id should be defined');
              done();
            });
          });
      });
    });
  });

  it('should support the Mixed type', function(done) {
    var swagger = fs.readFileSync('./test/person.swaggering.json');

    var models = swaggerMongoose.compile(swagger.toString()).models;

    var Person = models.Person;

    var person = new Person({
      login: 'jb@mi6.gov',
      firstName: 'James',
      lastName: 'Bond',
      password: 'secret',
      other: {
        phoneNumber: '0123456789',
        tags: [ 'sample', 'list', 'of', 'tags']
      }
    });
    person.save(function(err, data) {
      assert(!err, 'error should be null');
      assert(data, 'data should be defined');
      Person
        .findOne({
          _id: data._id
        })
        .lean()
        .exec(function(err, newPerson) {
          assert(!err, 'error should be null');
          assert(newPerson, 'newPerson should be defined');

          assert(newPerson.login === 'jb@mi6.gov', 'Login is incorrect');
          assert(newPerson.firstName === 'James', 'First Name is incorrect');
          assert(newPerson.lastName === 'Bond', 'Last Name is incorrect');
          assert(newPerson.password === undefined, 'Person password should be not visible');
          assert(newPerson.cars.length === 0, 'Cars content is wrong');
          assert(newPerson.houses.length === 0, 'Houses content is wrong');
          assert(newPerson.contacts.length === 0, 'Contacts content is wrong');
          done();
        });
    });
  });


  it('should avoid reserved mongodb fields', function(done) {
    var swagger = fs.readFileSync('./test/person.json');
    var models = swaggerMongoose.compile(swagger.toString()).models;

    var Person = models.Person;

    // next logic is indicate that "_id" and "__v" fields are MongoDB native
    assert(Person.schema.paths._id.instance === 'ObjectID', 'Wrong "_id" attributes');
    assert(Person.schema.paths._id.options.type === Schema.Types.ObjectId || Person.schema.paths._id.options.type === 'ObjectId', 'Wrong "_id" attributes');
    assert(Person.schema.paths.__v.instance === 'Number', 'Wrong "__v" attributes');
    assert(Person.schema.paths.__v.options.type === Number, 'Wrong "__v" attributes');

    done();
  });

  it('should supports array of objects as nested schema', function(done) {
    var swagger = fs.readFileSync('./test/person.json');
    var models = swaggerMongoose.compile(swagger.toString()).models;

    var Person = models.Person;

    // next logic is indicate that "items" is  processed as a nested schema
    assert(Person.schema.paths.items.instance === 'Array', 'Wrong "items" attributes: instance');

    var nestedObject = Person.schema.paths.items;

    assert(nestedObject.schema.paths._id.instance === 'ObjectID', 'Wrong "_id" attributes');
    assert(nestedObject.schema.paths._id.options.type === Schema.Types.ObjectId || nestedObject.schema.paths._id.options.type === 'ObjectId', 'Wrong "_id" attributes');
    assert(nestedObject.schema.paths.name.instance === 'String', 'Wrong "name" attributes');
    assert(nestedObject.schema.paths.name.options.type === String, 'Wrong "name" attributes');

    done();
  });


  it('should process circular references', function(done) {
    var swagger = fs.readFileSync('./test/person.json');
    var models = swaggerMongoose.compile(swagger.toString()).models;

    var Human = models.Human;

    // next logic is indicate that circular references are processed
    assert(Human.schema.paths.father.instance === 'ObjectID', 'Wrong "father" attribute: instance');
    assert(Human.schema.paths.father.options.type === Schema.Types.ObjectId, 'Wrong "father" attribute: type');
    assert(Human.schema.paths.mother.instance === 'ObjectID', 'Wrong "mother" attribute: instance');
    assert(Human.schema.paths.mother.options.type === Schema.Types.ObjectId, 'Wrong "mother" attribute: type');

    done();
  });


  it('should support the openApi 3.0.0 format', function(done) {
    var swagger = fs.readFileSync('./test/petstore3.json');
    var Pet = swaggerMongoose.compile(swagger).models.Pet;
    var myPet = new Pet({
      id: 123,
      name: 'Fluffy'
    });
    myPet.save(function(err) {
      if (err) {
        throw err;
      }
      Pet.findOne({
        id: 123
      }, function(err, data) {
        assert(data.id === 123, 'ID mismatch');
        assert(data.name === 'Fluffy', 'Name mismatch');
        done();
      });
    });
  });

  it('should handle object reference properties based on reference type', function(done) {
    var swagger = fs.readFileSync('./test/petstore3.json');
    var Pet = swaggerMongoose.compile(swagger).models.Pet;
    var myPet = new Pet({
      id: 123,
      name: 'Gizmo',
      owner: { name: 'Chris' }
    });
    myPet.save(function(err) {
      if (err) {
        throw err;
      }
      Pet.findOne({
        id: 123
      }, function(err, data) {
        assert(typeof data.owner === 'object', 'Type mismatch');
        assert(data.owner.name === 'Chris', 'Name mismatch');
        done();
      });
    });
  });

  it('should support schema options', function(done) {
    var swagger = fs.readFileSync('./test/petstore3.json');
    var Owner = swaggerMongoose.compile(swagger).models.Owner;
    assert(Owner.schema.options.timestamps === true, 'timestamps schema option not set');
    assert(Owner.schema.options.versionKey === '__custom', 'versionKey schema option not set');

    var myOwner = new Owner({ name: 'Chris' });
    myOwner.save(function(err) {
      if (err) {
        throw err;
      }
      Owner.findOne({
        name: 'Chris'
      }, function(err, data) {
        assert(!!data.createdAt === true, 'timestamp schema option not applied');
        assert(!!data.updatedAt === true, 'timestamp schema option not applied');
        assert(data.__custom === 0, 'versionKey schema option not applied');
        done();
      });
    });
  });

  it('should support default properties directly in the schema definition', function(done) {
    var swagger = fs.readFileSync('./test/petstore3.json');
    var Error = swaggerMongoose.compile(swagger).models.Error;
    assert(Error.schema.paths.priority.defaultValue === 'high', 'Error priority schema property default not set');
    assert(Error.schema.paths.impacted_groups.defaultValue()[0] === 'alpha', 'Error impacted_groups schema property default not set');
    assert(Error.schema.paths.impacted_groups.defaultValue()[1] === 'beta', 'Error impacted_groups schema property default not set');

    var error = new Error({ code: 0, message: 'oops!' });
    error.save(function(err) {
      if (err) {
        throw err;
      }
      Error.findOne({
        code: 0
      }, function(err, data) {
        assert(data.priority === 'high', 'schema property default value is missing');
        assert(data.impacted_groups[0] === 'alpha', 'schema property default value is missing');
        assert(data.impacted_groups[1] === 'beta', 'schema property default value is missing');
        done();
      });
    });
  });
});