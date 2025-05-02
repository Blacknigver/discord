// database.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = {
  /**
   * Run a SQL query against Postgres.
   * @param {string} text  — parameterized SQL
   * @param {any[]}  params — values for placeholders ($1, $2, …)
   * @returns {Promise<import('pg').QueryResult>}
   */
  query: (text, params) => pool.query(text, params),
  
  // expose the pool if you ever need transactions, etc.
  pool
};
