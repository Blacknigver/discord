// database.js
const { Pool } = require('pg');

let pool = null;
let isConnected = false;
let connectedPromiseResolve;
// Promise that resolves once the initial test connection succeeds
const connectedPromise = new Promise(resolve => {
  connectedPromiseResolve = resolve;
});

(() => {
  // Prefer DATABASE_URL, otherwise build config from PGHOST… vars
  const { DATABASE_URL, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

  let poolConfig = null;

  if (DATABASE_URL) {
    poolConfig = {
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5 // keep below Neon free-tier limit
    };
  } else if (PGHOST && PGDATABASE && PGUSER) {
    poolConfig = {
      host: PGHOST,
      port: PGPORT || 5432,
      database: PGDATABASE,
      user: PGUSER,
      password: PGPASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 5
    };
  }

  if (!poolConfig) {
    console.warn('[DB] No DATABASE_URL or PG* env vars found – database features disabled');
    return; // pool stays null
  }

  pool = new Pool(poolConfig);

  pool.on('error', err => {
    console.error('Unexpected error on idle PG client:', err);
  });

  // Verify connection once
  pool.connect()
    .then(client => {
      isConnected = true;
      console.log('✅ Database connection successful');
      client.release();
      // Resolve the connected promise so callers waiting for readiness can continue
      connectedPromiseResolve();
    })
    .catch(err => {
      console.error('❌ Database connection failed.');
      // Show full error once for debugging
      console.error(err);

      // Helpful hints for common mis-config (Neon, Render, Supabase …)
      console.warn('[DB] Verify that:');
      console.warn(' • The DATABASE_URL/PG* env variables are set in Replit');
      console.warn(' • The connection string ends with "?sslmode=require" (Neon)');
      console.warn(' • The database accepts external connections (firewall/pool)');

      pool = null;
    });
})();

const query = async (text, params) => {
  if (!pool) {
    // DB disabled – act like a stub
    return { rows: [], rowCount: 0 };
  }
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('Database query error:', err.message);
    console.error('SQL:', text);
    throw err;
  }
};

// Export live getters so consumers always get the *current* values, not a snapshot
module.exports = {
  query,
  // Using getter properties ensures modules that `require("./database")`
  // always see the up-to-date Pool instance and connection flag even if
  // they were imported before the initial connection succeeded.
  get pool() {
    return pool;
  },
  get isConnected() {
    return isConnected;
  },
  /**
   * Wait until the database connection test has completed successfully.
   * Useful for code paths that want to perform queries early during startup
   * but still want to fail fast if the DB stays unreachable.
   *
   * @param {number} timeoutMs  Maximum time to wait before rejecting (default 10000ms)
   * @returns {Promise<void>}   Resolves when connected or rejects on timeout
   */
  async waitUntilConnected(timeoutMs = 10000) {
    if (isConnected) return; // already ready

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, timeoutMs);

      connectedPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
};
