/* eslint-env mocha */
"use strict";
const swaggerMongoose = require("./../lib/index");

const fs = require("fs");
const async = require("async");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
// const Mockgoose = require("mockgoose").Mockgoose;
// const mockgoose = new Mockgoose(mongoose);

const assert = require("chai").assert;
const Schema = mongoose.Schema;

describe("swaggering-mongoose tests", () => {
  let mongo = null;
  beforeEach(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    await mongoose.connect(uri, { useNewUrlParser: true });
  });
  afterEach(async () => {
    delete mongoose.models.Pet;
    delete mongoose.models.Owner;
    delete mongoose.models.Address;
    delete mongoose.models.Error;
    delete mongoose.models.Person;
    delete mongoose.models.House;
    delete mongoose.models.Car;
    delete mongoose.models.Human;
    delete mongoose.models.Contact;
    if (mongo) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
      await mongo.stop();
    }
  });

  it("should create a sample pet and return all valid properties", async () => {
    const swagger = fs.readFileSync("./test/petstore.json");
    const Pet = swaggerMongoose.compile(swagger).models.Pet;
    const myPet = new Pet({
      id: 123,
      name: "Fluffy",
      dob: new Date(),
      price: 99.99,
      sold: true,
      friends: ["Barney", "Fido"],
      favoriteNumbers: [1, 3, 7, 9],
      address: [
        {
          addressLine1: "1 Main St."
        },
        {
          addressLine1: "2 Main St."
        }
      ],
      notAKey: "test"
    });
    await myPet.save();
    const data = await Pet.findOne({ id: 123 });

    assert(data.id === 123, "ID mismatch");
    assert(data.name === "Fluffy", "Name mismatch");
    assert(data.price === 99.99, "Price mismatch");
    assert(data.sold === true, "Sold mismatch");
    assert(data.friends.length === 2, "Friends mismatch");
    assert(data.favoriteNumbers.length === 4, "Favorite numbers mismatch");
    assert(
      data.address[0].addressLine1 === "1 Main St.",
      "Nested address mismatch"
    );
    assert(
      data.address[1].addressLine1 === "2 Main St.",
      "Nested address mismatch"
    );
    assert(!data.notAKey, "Strict schema mismatch");
  });

  it("should not create a sample without required field", async () => {
    const swagger = fs.readFileSync("./test/petstore.json");
    const Pet = swaggerMongoose.compile(swagger).models.Pet;
    const myPet = new Pet({
      id: 123
    });
    const err = await myPet.save().catch(err => err);
    assert(err, "Validation error is missing");
  });

  it("should create a sample pet from a file", async () => {
    const swagger = fs.readFileSync("./test/petstore.json");
    const Pet = swaggerMongoose.compile(swagger).models.Pet;
    const myPet = new Pet({
      id: 123,
      name: "Fluffy"
    });
    await myPet.save();
    const data = await Pet.findOne({ id: 123 });

    assert(data.id === 123, "ID mismatch");
    assert(data.name === "Fluffy", "Name mismatch");
  });

  it("should create a sample pet from a JSON object", async () => {
    const swagger = fs.readFileSync("./test/petstore.json");
    const Pet = swaggerMongoose.compile(JSON.parse(swagger)).models.Pet;
    const myPet = new Pet({
      id: 123,
      name: "Fluffy"
    });
    await myPet.save();
    const data = await Pet.findOne({ id: 123 });

    assert(data.id === 123, "ID mismatch");
    assert(data.name === "Fluffy", "Name mismatch");
  });

  it("should create a sample pet from a string", async () => {
    const swagger = fs.readFileSync("./test/petstore.json");
    const Pet = swaggerMongoose.compile(swagger.toString()).models.Pet;
    const myPet = new Pet({
      id: 123,
      name: "Fluffy"
    });
    await myPet.save();
    const data = await Pet.findOne({ id: 123 });

    assert(data.id === 123, "ID mismatch");
    assert(data.name === "Fluffy", "Name mismatch");
  });

  it("should create a sample person with relations to external collections", async () => {
    const swagger = fs.readFileSync("./test/person.swaggering.json");
    const models = swaggerMongoose.compile(swagger.toString()).models;
    const Person = models.Person;
    const House = models.House;
    const Car = models.Car;

    assert(
      Person.schema.paths.cars.options.type[0].type === Schema.Types.ObjectId,
      'Wrong "car" type'
    );
    assert(
      Person.schema.paths.cars.options.type[0].ref === "Car",
      'Ref to "car" should be "Car"'
    );
    assert(
      Person.schema.paths.houses.options.type[0].type === Schema.Types.ObjectId,
      'Wrong "house" type'
    );
    assert(
      Person.schema.paths.houses.options.type[0].ref === "House",
      'Ref to "house" should be "House"'
    );

    const house = new House({
      description: "Cool house",
      lng: 50.3,
      lat: 30
    });
    const houseData = await house.save();

    const car = new Car({
      provider: "Mazda",
      model: "CX-5"
    });
    const carData = await car.save();

    const person = new Person({
      login: "jb@mi6.gov",
      firstName: "James",
      lastName: "Bond",
      password: "secret",
      houses: [houseData._id],
      cars: [carData._id],
      contacts: [
        {
          contactID: "0000000000000000000000aa"
        }
      ]
    });
    const data = await person.save();
    assert(data, "data should be defined");

    const newPerson = await Person.findOne({ _id: data._id })
      .lean()
      .exec();
    assert(newPerson, "newPerson should be defined");
    const dbCar = await Car.findOne({ _id: newPerson.cars[0] });
    assert(dbCar, "car should be defined");
    const dbHouse = await House.findOne({ _id: newPerson.houses[0] });
    assert(dbHouse, "house should be defined");

    newPerson.cars = [dbCar];
    newPerson.houses = [dbHouse];
    assert(newPerson.login === "jb@mi6.gov", "Login is incorrect");
    assert(newPerson.firstName === "James", "First Name is incorrect");
    assert(newPerson.lastName === "Bond", "Last Name is incorrect");
    assert(
      newPerson.password === undefined,
      "Person password should be not visible"
    );
    assert(newPerson.cars.length === 1, "Cars content is wrong");
    assert(newPerson.cars[0].model === "CX-5", "Car model is incorrect");
    assert(newPerson.cars[0].provider === "Mazda", "Car provider is incorrect");
    assert(newPerson.houses.length === 1, "Houses content is wrong");
    assert(newPerson.houses[0].lat === 30, "House latitude is incorrect");
    assert(newPerson.houses[0].lng === 50.3, "House longitude is incorrect");
    assert(
      newPerson.houses[0].description === "Cool house",
      "House description is incorrect"
    );
    assert(newPerson.contacts.length === 1, "Contacts content is wrong");
    assert(
      newPerson.contacts[0].priority === "high",
      "Contact priority is wrong"
    );
    assert(
      newPerson.contacts[0].contactID.toString() === "0000000000000000000000aa",
      "Contact contactID type is wrong"
    );
    assert(newPerson.contacts[0]._id, "Contact _id should be defined");
  });

  it("should support the Mixed type", async () => {
    const swagger = fs.readFileSync("./test/person.swaggering.json");
    const models = swaggerMongoose.compile(swagger.toString()).models;
    const Person = models.Person;
    const myPerson = new Person({
      login: "jb@mi6.gov",
      firstName: "James",
      lastName: "Bond",
      password: "secret",
      other: {
        phoneNumber: "0123456789",
        tags: ["sample", "list", "of", "tags"]
      }
    });
    const saveData = await myPerson.save();
    assert(saveData, "data should be defined");
    const newPerson = await Person.findOne({ _id: saveData._id })
      .lean()
      .exec();

    assert(newPerson, "newPerson should be defined");
    assert(newPerson.login === "jb@mi6.gov", "Login is incorrect");
    assert(newPerson.firstName === "James", "First Name is incorrect");
    assert(newPerson.lastName === "Bond", "Last Name is incorrect");
    assert(
      newPerson.password === undefined,
      "Person password should be not visible"
    );
    assert(newPerson.cars.length === 0, "Cars content is wrong");
    assert(newPerson.houses.length === 0, "Houses content is wrong");
    assert(newPerson.contacts.length === 0, "Contacts content is wrong");
  });

  it("should avoid reserved mongodb fields", async () => {
    const swagger = fs.readFileSync("./test/person.json");
    const models = swaggerMongoose.compile(swagger.toString()).models;
    const Person = models.Person;

    // next logic is indicate that "_id" and "__v" fields are MongoDB native
    assert(
      Person.schema.paths._id.instance === "ObjectId",
      'Wrong "_id" attributes'
    );
    assert(
      Person.schema.paths._id.options.type === Schema.Types.ObjectId ||
        Person.schema.paths._id.options.type === "ObjectId",
      'Wrong "_id" attributes'
    );
    assert(
      Person.schema.paths.__v.instance === "Number",
      'Wrong "__v" attributes'
    );
    assert(
      Person.schema.paths.__v.options.type === Number,
      'Wrong "__v" attributes'
    );
  });

  it("should supports array of objects as nested schema", async () => {
    const swagger = fs.readFileSync("./test/person.json");
    const models = swaggerMongoose.compile(swagger.toString()).models;
    const Person = models.Person;

    // next logic is indicate that "items" is processed as a nested schema
    assert(
      Person.schema.paths.items.instance === "Array",
      'Wrong "items" attributes: instance'
    );
    var nestedObject = Person.schema.paths.items;
    assert(
      nestedObject.schema.paths._id.instance === "ObjectId",
      'Wrong "_id" attributes'
    );
    assert(
      nestedObject.schema.paths._id.options.type === Schema.Types.ObjectId ||
        nestedObject.schema.paths._id.options.type === "ObjectId",
      'Wrong "_id" attributes'
    );
    assert(
      nestedObject.schema.paths.name.instance === "String",
      'Wrong "name" attributes'
    );
    assert(
      nestedObject.schema.paths.name.options.type === String,
      'Wrong "name" attributes'
    );
  });

  it("should process circular references", async () => {
    const swagger = fs.readFileSync("./test/person.json");
    const models = swaggerMongoose.compile(swagger.toString()).models;
    const Human = models.Human;

    // next logic is indicate that circular references are processed
    assert(
      Human.schema.paths.father.instance === "ObjectId",
      'Wrong "father" attribute: instance'
    );
    assert(
      Human.schema.paths.father.options.type === Schema.Types.ObjectId,
      'Wrong "father" attribute: type'
    );
    assert(
      Human.schema.paths.mother.instance === "ObjectId",
      'Wrong "mother" attribute: instance'
    );
    assert(
      Human.schema.paths.mother.options.type === Schema.Types.ObjectId,
      'Wrong "mother" attribute: type'
    );
  });

  it("should support the openApi 3.0.0 format", async () => {
    const swagger = fs.readFileSync("./test/petstore3.json");
    const Pet = swaggerMongoose.compile(swagger).models.Pet;
    const myPet = new Pet({
      id: 123,
      name: "Fluffy"
    });
    await myPet.save();
    const data = await Pet.findOne({ id: 123 });

    assert(data.id === 123, "ID mismatch");
    assert(data.name === "Fluffy", "Name mismatch");
  });

  it("should handle object reference properties based on reference type", async () => {
    const swagger = fs.readFileSync("./test/petstore3.json");
    const Pet = swaggerMongoose.compile(swagger).models.Pet;
    const myPet = new Pet({
      id: 123,
      name: "Gizmo",
      owner: { name: "Chris" }
    });
    await myPet.save();
    const data = await Pet.findOne({ id: 123 });

    assert(typeof data.owner === "object", "Type mismatch");
    assert(data.owner.name === "Chris", "Name mismatch");
  });

  it("should support schema options", async () => {
    const swagger = fs.readFileSync("./test/petstore3.json");
    const Owner = swaggerMongoose.compile(swagger).models.Owner;
    assert(
      Owner.schema.options.timestamps === true,
      "timestamps schema option not set"
    );
    assert(
      Owner.schema.options.versionKey === "__custom",
      "versionKey schema option not set"
    );

    const myOwner = new Owner({ name: "Chris" });
    await myOwner.save();
    const data = await Owner.findOne({ name: "Chris" });

    assert(!!data.createdAt === true, "timestamp schema option not applied");
    assert(!!data.updatedAt === true, "timestamp schema option not applied");
    assert(data.__custom === 0, "versionKey schema option not applied");
  });

  it("should support default properties directly in the schema definition", async () => {
    const swagger = fs.readFileSync("./test/petstore3.json");
    const Error = swaggerMongoose.compile(swagger).models.Error;
    assert(
      Error.schema.paths.priority.defaultValue === "high",
      "Error priority schema property default not set"
    );
    assert(
      Error.schema.paths.impacted_groups.defaultValue()[0] === "alpha",
      "Error impacted_groups schema property default not set"
    );
    assert(
      Error.schema.paths.impacted_groups.defaultValue()[1] === "beta",
      "Error impacted_groups schema property default not set"
    );

    const myError = new Error({ code: 0, message: "oops!" });
    await myError.save();
    const data = await Error.findOne({ code: 0 });

    assert(
      data.priority === "high",
      "schema property default value is missing"
    );
    assert(
      data.impacted_groups[0] === "alpha",
      "schema property default value is missing"
    );
    assert(
      data.impacted_groups[1] === "beta",
      "schema property default value is missing"
    );
  });
});
