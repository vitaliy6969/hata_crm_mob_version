const db = require('./db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
    console.log('Running schema update...');
    const alters = [
        'ALTER TABLE clients ADD COLUMN IF NOT EXISTS secondary_contact TEXT',
        'ALTER TABLE apartments ADD COLUMN IF NOT EXISTS address TEXT',
        'ALTER TABLE apartments ADD COLUMN IF NOT EXISTS description TEXT',
        'ALTER TABLE apartments ADD COLUMN IF NOT EXISTS wifi VARCHAR(255)',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_time TIME',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_time TIME',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS prepayment NUMERIC(10, 2) DEFAULT 0',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10, 2) DEFAULT 0',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adults INTEGER DEFAULT 1',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS children INTEGER DEFAULT 0',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit NUMERIC(10, 2) DEFAULT 0',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_source TEXT',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS prepayment_paid BOOLEAN DEFAULT false',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS full_amount_paid BOOLEAN DEFAULT false',
        'ALTER TABLE apartments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL'
    ];
    const createAnalyticsCache = `CREATE TABLE IF NOT EXISTS analytics_cache (
        cache_key VARCHAR(120) PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    const createExpenses = `CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        apartment_id INTEGER REFERENCES apartments(id),
        amount NUMERIC(12, 2) NOT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    try {
        for (const sql of alters) {
            await db.query(sql);
        }
        await db.query(createExpenses);
        await db.query(createAnalyticsCache);
        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err.message || err);
    } finally {
        process.exit();
    }
}

runMigration();
