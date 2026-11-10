'use strict';

const { Pool } = require('pg');

// Host, usuário, senha e banco vêm de PGHOST, PGUSER, PGPASSWORD e PGDATABASE.
const pool = new Pool({ max: 10 });

module.exports = { pool };
