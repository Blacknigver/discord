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
  const {
    DATABASE_URL,
    PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD,
    DATABASE_PROJECT_URL, DATABASE_PASSWORD,
    // Generic explicit DB pieces (override if present)
    DATABASE_HOST, DATABASE_NAME, DATABASE_USER, DATABASE_PORT,
    // Supabase-specific explicit pieces
    SUPABASE_DB_HOST, SUPABASE_DB_NAME, SUPABASE_DB_USER, SUPABASE_DB_PORT
  } = process.env;

  let poolConfig = null;

  if (DATABASE_URL) {
    poolConfig = {
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5 // keep below Neon free-tier limit
    };
  } else if (SUPABASE_DB_HOST || DATABASE_HOST) {
    // Allow explicit host override (recommended: paste host from Supabase UI)
    const host = SUPABASE_DB_HOST || DATABASE_HOST;
    const user = SUPABASE_DB_USER || DATABASE_USER || 'postgres';
    const dbName = SUPABASE_DB_NAME || DATABASE_NAME || 'postgres';
    const port = parseInt(SUPABASE_DB_PORT || DATABASE_PORT || '5432', 10);
    const encodedPass = encodeURIComponent(DATABASE_PASSWORD || PGPASSWORD || '');
    const connectionString = `postgresql://${user}:${encodedPass}@${host}:${port}/${dbName}?sslmode=require`;
    poolConfig = {
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5
    };
    console.log(`[DB] Using explicit DB host ${host}/${dbName}`);
  } else if (!DATABASE_URL && DATABASE_PROJECT_URL && DATABASE_PASSWORD) {
    // Construct a Supabase Postgres connection string from project URL and password
    // Example: DATABASE_PROJECT_URL=https://<ref>.supabase.co
    // Host should be db.<ref>.supabase.co, database defaults to 'postgres', user 'postgres'
    try {
      const project = DATABASE_PROJECT_URL
        .replace(/^https?:\/\//, '')
        .replace(/^db\./, '')
        .replace(/\/$/, '');
      const host = `db.${project}`;
      const user = process.env.DATABASE_USER || 'postgres';
      const dbName = process.env.DATABASE_NAME || 'postgres';
      const encodedPass = encodeURIComponent(DATABASE_PASSWORD);
      const connectionString = `postgresql://${user}:${encodedPass}@${host}:5432/${dbName}?sslmode=require`;
      poolConfig = {
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 5
      };
      console.log(`[DB] Using Supabase Postgres at ${host}/${dbName}`);
    } catch (e) {
      console.error('[DB] Failed constructing Supabase connection string from env:', e?.message || e);
    }
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
      console.warn(' • One of DATABASE_URL or (DATABASE_PROJECT_URL + DATABASE_PASSWORD) or PG* vars is set');
      console.warn(' • For Neon: the connection string ends with "?sslmode=require"');
      console.warn(' • For Supabase: host should be db.<project-ref>.supabase.co and SSL enabled');
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
  },
  
  /**
   * Stop the database ping timer (useful for testing or shutdown)
   */
  stopDatabasePing() {
    if (pool && pool.pingInterval) {
      clearInterval(pool.pingInterval);
      pool.pingInterval = null;
      console.log('[DB_PING] Database keep-alive ping stopped');
    }
  }
};
