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
    const createBookingPayments = `CREATE TABLE IF NOT EXISTS booking_payments (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        payment_date DATE NOT NULL,
        paid BOOLEAN DEFAULT false,
        payment_method VARCHAR(20),
        period_start DATE,
        period_end DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
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
        await db.query(createBookingPayments);
        await db.query(createAnalyticsCache);

        // Optional data migration: create booking_payments from existing booking fields
        const bookingsToMigrate = await db.query(
            `SELECT b.id, b.start_date, b.end_date, b.total_price, b.prepayment, b.prepayment_paid, b.full_amount_paid, b.created_at
             FROM bookings b
             WHERE NOT EXISTS (SELECT 1 FROM booking_payments WHERE booking_id = b.id)
             AND (COALESCE(b.prepayment, 0) > 0 OR b.full_amount_paid = true)`
        );
        if (bookingsToMigrate.rows.length > 0) {
            await db.query('BEGIN');
            try {
                for (const b of bookingsToMigrate.rows) {
                    const prep = parseFloat(b.prepayment) || 0;
                    const total = parseFloat(b.total_price) || 0;
                    const toDateStr = (val) => {
                        if (!val) return new Date().toISOString().slice(0, 10);
                        if (val instanceof Date) return val.toISOString().slice(0, 10);
                        const s = String(val);
                        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
                        return m ? m[1] : s.split('T')[0].substring(0, 10);
                    };
                    const startDate = toDateStr(b.start_date || b.created_at);
                    const endDate = toDateStr(b.end_date || b.start_date || b.created_at);
                    if (prep > 0) {
                        await db.query(
                            `INSERT INTO booking_payments (booking_id, type, amount, payment_date, paid)
                             VALUES ($1, 'prepayment', $2, $3::date, $4)`,
                            [b.id, prep, startDate, !!b.prepayment_paid]
                        );
                    }
                    if (b.full_amount_paid && total > prep) {
                        await db.query(
                            `INSERT INTO booking_payments (booking_id, type, amount, payment_date, period_start, period_end, paid)
                             VALUES ($1, 'main', $2, $3::date, $4::date, $5::date, true)`,
                            [b.id, total - prep, endDate, startDate, endDate]
                        );
                    }
                }
                await db.query('COMMIT');
                console.log('Migrated', bookingsToMigrate.rows.length, 'bookings to booking_payments');
            } catch (migErr) {
                await db.query('ROLLBACK');
                console.error('Payment migration rolled back:', migErr.message || migErr);
            }
        }

        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err.message || err);
    } finally {
        process.exit();
    }
}

runMigration();
