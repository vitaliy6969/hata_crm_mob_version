#!/usr/bin/env node
require('../src/db').query('SELECT 1').then(() => process.exit(0)).catch(() => process.exit(1));
