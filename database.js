// database.js
const { Pool } = require('pg');

// For using with Replit/Render environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Add connection error handling
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection on startup
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Test connection when module is loaded
testConnection().catch(console.error);

module.exports = {
  /**
   * Run a SQL query against Postgres.
   * @param {string} text  — parameterized SQL
   * @param {any[]}  params — values for placeholders ($1, $2, …)
   * @returns {Promise<import('pg').QueryResult>}
   */
  query: async (text, params) => {
    try {
      const result = await pool.query(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error.message);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    }
  },
  
  // expose the pool if you ever need transactions, etc.
  pool,
  
  // Add method to test connection
  testConnection
};
