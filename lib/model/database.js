const knex = require('knex');
const config = require('config');

// Connects to the postgres database specified in configuration and returns it.
const connect = () => knex({ client: 'pg', connection: config.get('database') });

// Connects to a database, passes it to a function for operations, then ensures its closure.
const withDatabase = (mutator) => {
  const db = connect();
  return mutator(db).finally(() => db.destroy());
};

// Same as withDatabase, but instead of assuming a knex command expects a ExplicitPromise.
const withDatabaseAsync = (mutator) => {
  const db = connect();
  const destroy = (x) => {
    db.destroy();
    return x;
  };
  return mutator(db).then(destroy, destroy); // rawwwr
};

// Given a database, initiates migrations on it.
const migrate = (db) => db.migrate.latest({ directory: `${__dirname}/migrations` });

module.exports = { connect, withDatabase, withDatabaseAsync, migrate };

