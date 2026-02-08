const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const db = require('./db');
let refreshAnalyticsForYear;
try {
    refreshAnalyticsForYear = require('./analytics-refresh').refreshAnalyticsForYear;
} catch (_) {
    refreshAnalyticsForYear = null;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Basic health check
app.get('/', (req, res) => {
    res.json({ status: 'HataCRM Backend is running', timestamp: new Date() });
});

// Test DB connection
app.get('/test-db', async (req, res) => {
    try {
        const result = await db.query('SELECT current_database(), current_user');
        res.json({ status: 'Database connected', details: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'Database error', error: err.message });
    }
});

// Get all apartments (без видалених — soft delete)
app.get('/api/apartments', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM apartments WHERE deleted_at IS NULL ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create apartment
app.post('/api/apartments', async (req, res) => {
    const { name, address, description, base_price } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Назва об\'єкта обов\'язкова' });
    try {
        const result = await db.query(
            'INSERT INTO apartments (name, address, description, base_price) VALUES ($1, $2, $3, $4) RETURNING *',
            [name.trim(), (address || '').trim() || null, (description || '').trim() || null, base_price != null ? parseFloat(base_price) : 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update apartment
app.patch('/api/apartments/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, address, description, base_price } = req.body;
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const result = await db.query(
            'UPDATE apartments SET name = COALESCE($1, name), address = COALESCE($2, address), description = COALESCE($3, description), base_price = COALESCE($4, base_price) WHERE id = $5 RETURNING *',
            [name || null, address || null, description || null, base_price != null ? base_price : null, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Apartment not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Soft delete apartment: позначаємо видаленим, дані залишаються в БД
app.delete('/api/apartments/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const result = await db.query(
            'UPDATE apartments SET deleted_at = NOW() WHERE id = $1 AND (deleted_at IS NULL) RETURNING id',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Apartment not found' });
        res.json({ ok: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Expenses API ---
app.get('/api/expenses', async (req, res) => {
    const { year, month } = req.query;
    try {
        let sql = 'SELECT * FROM expenses ORDER BY date DESC, id DESC';
        const params = [];
        if (year != null && year !== '') {
            if (month != null && month !== '') {
                sql = 'SELECT * FROM expenses WHERE date >= $1::date AND date < $2::date ORDER BY date DESC, id DESC';
                params.push(`${year}-${String(month).padStart(2, '0')}-01`);
                params.push(month === '12' ? `${parseInt(year, 10) + 1}-01-01` : `${year}-${String(parseInt(month, 10) + 1).padStart(2, '0')}-01`);
            } else {
                sql = 'SELECT * FROM expenses WHERE date >= $1::date AND date < $2::date ORDER BY date DESC, id DESC';
                params.push(`${year}-01-01`);
                params.push(`${parseInt(year, 10) + 1}-01-01`);
            }
        }
        const result = await db.query(params.length ? sql : 'SELECT * FROM expenses ORDER BY date DESC, id DESC', params.length ? params : []);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    const { category, description, apartment_id, amount, date } = req.body;
    if (!category || !category.trim()) return res.status(400).json({ error: 'Категорія обов\'язкова' });
    const amt = amount != null ? parseFloat(amount) : 0;
    const d = date || new Date().toISOString().slice(0, 10);
    try {
        const result = await db.query(
            'INSERT INTO expenses (category, description, apartment_id, amount, date) VALUES ($1, $2, $3, $4, $5::date) RETURNING *',
            [category.trim(), (description || '').trim() || null, apartment_id ? parseInt(apartment_id, 10) : null, amt, d]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/expenses/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { category, description, apartment_id, amount, date } = req.body;
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const result = await db.query(
            `UPDATE expenses SET
             category = COALESCE($1, category),
             description = COALESCE($2, description),
             apartment_id = $3,
             amount = COALESCE($4, amount),
             date = COALESCE($5::date, date)
             WHERE id = $6 RETURNING *`,
            [
                category != null ? category.trim() : null,
                description !== undefined ? (description || null) : null,
                apartment_id === undefined || apartment_id === '' ? null : parseInt(apartment_id, 10),
                amount != null ? parseFloat(amount) : null,
                date || null,
                id
            ]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/expenses/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const result = await db.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
        res.json({ ok: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Analytics: лише читання готових результатів з кешу (обрахунки — скрипт scripts/refresh-analytics.js або POST /refresh)
app.get('/api/analytics/monthly', async (req, res) => {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    try {
        const r = await db.query('SELECT data FROM analytics_cache WHERE cache_key = $1', [`monthly_${year}`]);
        if (r.rows.length === 0) {
            return res.json({
                year,
                months: [],
                totalIncome: 0,
                totalExpenses: 0,
                totalBalance: 0
            });
        }
        res.json(r.rows[0].data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Analytics: by apartment — з кешу
app.get('/api/analytics/by-apartment', async (req, res) => {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = req.query.month;
    const key = month != null && month !== '' ? `by_apartment_${year}_${parseInt(month, 10)}` : `by_apartment_${year}`;
    try {
        const r = await db.query('SELECT data FROM analytics_cache WHERE cache_key = $1', [key]);
        if (r.rows.length === 0) {
            return res.json({
                apartments: [],
                noApartment: { income: 0, expenses: 0, balance: 0 },
                totalIncome: 0,
                totalExpenses: 0,
                totalBalance: 0
            });
        }
        res.json(r.rows[0].data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Analytics: expenses by category — з кешу
app.get('/api/analytics/expenses-by-category', async (req, res) => {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = req.query.month;
    const key = month != null && month !== '' ? `expenses_by_category_${year}_${parseInt(month, 10)}` : `expenses_by_category_${year}`;
    try {
        const r = await db.query('SELECT data FROM analytics_cache WHERE cache_key = $1', [key]);
        if (r.rows.length === 0) return res.json([]);
        res.json(r.rows[0].data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Оновлення кешу аналітики (важкі обрахунки тут — один раз за запит)
app.post('/api/analytics/refresh', async (req, res) => {
    if (!refreshAnalyticsForYear) return res.status(503).json({ error: 'Analytics refresh module not available' });
    const year = parseInt(req.body?.year || req.query.year, 10) || new Date().getFullYear();
    try {
        await refreshAnalyticsForYear(year);
        res.json({ ok: true, year });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get bookings for a date range
app.get('/api/bookings', async (req, res) => {
    const { start, end } = req.query;
    try {
        const result = await db.query(
            `SELECT b.*, c.name as client_name, c.phone as client_phone,
             (SELECT COALESCE(SUM(amount), 0) FROM booking_payments WHERE booking_id = b.id AND paid = true) AS paid_amount,
             (SELECT COUNT(*) FROM booking_payments WHERE booking_id = b.id AND paid = true) AS paid_payment_count
             FROM bookings b LEFT JOIN clients c ON b.client_id = c.id WHERE start_date < $2 AND end_date >= $1`,
            [start || '2000-01-01', end || '2100-01-01']
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a booking
app.post('/api/bookings', async (req, res) => {
    const {
        apartment_id, client_name, client_phone, secondary_contact,
        start_date, end_date, total_price, daily_rate,
        check_in_time, check_out_time, prepayment, notes,
        adults, children, deposit, booking_source, status
    } = req.body;

    if (!apartment_id) return res.status(400).json({ error: 'apartment_id обов\'язковий' });
    if (!client_phone || !client_phone.trim()) return res.status(400).json({ error: 'Телефон клієнта обов\'язковий' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'Дати бронювання обов\'язкові' });

    try {
        // 0. Check for overbooking (overlap)
        const overlapResult = await db.query(
            `SELECT id FROM bookings 
             WHERE apartment_id = $1 
             AND status != 'CANCELLED'
             AND (start_date < $3 AND end_date > $2)`,
            [apartment_id, start_date, end_date]
        );

        if (overlapResult.rows.length > 0) {
            return res.status(400).json({ error: 'Цей період вже заброньовано (Overbooking)' });
        }
        // 1. Ensure client exists and update secondary contact
        let clientResult = await db.query('SELECT id FROM clients WHERE phone = $1', [client_phone]);
        let clientId;
        if (clientResult.rows.length === 0) {
            const newClient = await db.query(
                'INSERT INTO clients (name, phone, secondary_contact) VALUES ($1, $2, $3) RETURNING id',
                [client_name, client_phone, secondary_contact]
            );
            clientId = newClient.rows[0].id;
        } else {
            clientId = clientResult.rows[0].id;
            await db.query('UPDATE clients SET name = $1, secondary_contact = $2 WHERE id = $3', [client_name, secondary_contact, clientId]);
        }

        // 2. Create booking
        const booking = await db.query(
            `INSERT INTO bookings 
            (apartment_id, client_id, start_date, end_date, total_price, daily_rate, check_in_time, check_out_time, prepayment, notes, adults, children, deposit, booking_source, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
            [apartment_id, clientId, start_date, end_date, total_price || 0, daily_rate || 0, check_in_time, check_out_time || null, prepayment || 0, notes, adults || 1, children || 0, deposit || 0, booking_source || 'Direct', status || 'CONFIRMED']
        );

        res.status(201).json(booking.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update booking (e.g. payment flags)
app.patch('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const { prepayment_paid, full_amount_paid } = req.body;
    try {
        const updates = [];
        const values = [];
        let i = 1;
        if (typeof prepayment_paid === 'boolean') {
            updates.push(`prepayment_paid = $${i++}`);
            values.push(prepayment_paid);
        }
        if (typeof full_amount_paid === 'boolean') {
            updates.push(`full_amount_paid = $${i++}`);
            values.push(full_amount_paid);
        }
        if (updates.length === 0) {
            return res.status(400).json({ error: 'Потрібно передати prepayment_paid або full_amount_paid' });
        }
        values.push(id);
        const result = await db.query(
            `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Бронь не знайдена' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Full update booking (edit card)
app.put('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const {
        apartment_id: new_apartment_id,
        client_name, client_phone, secondary_contact,
        start_date, end_date, check_in_time, check_out_time,
        total_price, daily_rate, prepayment, notes,
        adults, children, deposit, booking_source, status
    } = req.body;
    try {
        const existing = await db.query('SELECT id, client_id, apartment_id FROM bookings WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Бронь не знайдена' });
        }
        const { client_id, apartment_id } = existing.rows[0];

        const aptId = new_apartment_id !== undefined ? new_apartment_id : apartment_id;
        if (start_date && end_date) {
            const overlap = await db.query(
                `SELECT id FROM bookings WHERE apartment_id = $1 AND id != $2 AND status != 'CANCELLED'
                 AND (start_date < $4 AND end_date > $3)`,
                [aptId, id, start_date, end_date]
            );
            if (overlap.rows.length > 0) {
                return res.status(400).json({ error: 'Цей період вже заброньовано (Overbooking)' });
            }
        }

        if (client_name !== undefined || client_phone !== undefined || secondary_contact !== undefined) {
            const updates = [];
            const vals = [];
            let i = 1;
            if (client_name !== undefined) { updates.push(`name = $${i++}`); vals.push(client_name); }
            if (client_phone !== undefined) { updates.push(`phone = $${i++}`); vals.push(client_phone); }
            if (secondary_contact !== undefined) { updates.push(`secondary_contact = $${i++}`); vals.push(secondary_contact); }
            if (updates.length) {
                vals.push(client_id);
                await db.query(`UPDATE clients SET ${updates.join(', ')} WHERE id = $${i}`, vals);
            }
        }

        const bUpdates = [];
        const bVals = [];
        let j = 1;
        if (new_apartment_id !== undefined) { bUpdates.push(`apartment_id = $${j++}`); bVals.push(new_apartment_id); }
        if (start_date !== undefined) { bUpdates.push(`start_date = $${j++}`); bVals.push(start_date); }
        if (end_date !== undefined) { bUpdates.push(`end_date = $${j++}`); bVals.push(end_date); }
        if (check_in_time !== undefined) { bUpdates.push(`check_in_time = $${j++}`); bVals.push(check_in_time || null); }
        if (check_out_time !== undefined) { bUpdates.push(`check_out_time = $${j++}`); bVals.push(check_out_time || null); }
        if (total_price !== undefined) { bUpdates.push(`total_price = $${j++}`); bVals.push(total_price); }
        if (daily_rate !== undefined) { bUpdates.push(`daily_rate = $${j++}`); bVals.push(daily_rate); }
        if (prepayment !== undefined) { bUpdates.push(`prepayment = $${j++}`); bVals.push(prepayment); }
        if (notes !== undefined) { bUpdates.push(`notes = $${j++}`); bVals.push(notes); }
        if (adults !== undefined) { bUpdates.push(`adults = $${j++}`); bVals.push(adults); }
        if (children !== undefined) { bUpdates.push(`children = $${j++}`); bVals.push(children); }
        if (deposit !== undefined) { bUpdates.push(`deposit = $${j++}`); bVals.push(deposit); }
        if (booking_source !== undefined) { bUpdates.push(`booking_source = $${j++}`); bVals.push(booking_source); }
        if (status !== undefined) { bUpdates.push(`status = $${j++}`); bVals.push(status); }

        if (bUpdates.length > 0) {
            bVals.push(id);
            await db.query(`UPDATE bookings SET ${bUpdates.join(', ')} WHERE id = $${j}`, bVals);
        }

        const result = await db.query(
            'SELECT b.*, c.name as client_name, c.phone as client_phone FROM bookings b LEFT JOIN clients c ON b.client_id = c.id WHERE b.id = $1',
            [id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete booking
app.delete('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('DELETE FROM bookings WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Бронь не знайдена' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Booking payments API ---
const PAYMENT_TYPES = ['prepayment', 'main', 'extra', 'cleaning'];
const PAYMENT_METHODS = ['cash', 'card'];

async function ensureBookingExists(bookingId) {
    const r = await db.query('SELECT id FROM bookings WHERE id = $1', [bookingId]);
    if (r.rows.length === 0) return null;
    return r.rows[0].id;
}

app.get('/api/bookings/:id/payments', async (req, res) => {
    const bookingId = parseInt(req.params.id, 10);
    if (!bookingId || isNaN(bookingId)) return res.status(400).json({ error: 'Invalid booking id' });
    try {
        const exists = await ensureBookingExists(bookingId);
        if (!exists) return res.status(404).json({ error: 'Бронь не знайдена' });
        const result = await db.query(
            'SELECT * FROM booking_payments WHERE booking_id = $1 ORDER BY type, payment_date, id',
            [bookingId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookings/:id/payments', async (req, res) => {
    const bookingId = parseInt(req.params.id, 10);
    if (!bookingId || isNaN(bookingId)) return res.status(400).json({ error: 'Invalid booking id' });
    const { type, amount, payment_date, paid, payment_method, period_start, period_end } = req.body;
    if (!type || !PAYMENT_TYPES.includes(type)) return res.status(400).json({ error: 'Невірний тип платежу (prepayment, main, extra, cleaning)' });
    const amt = amount != null ? parseFloat(amount) : 0;
    const d = payment_date || new Date().toISOString().slice(0, 10);
    try {
        const exists = await ensureBookingExists(bookingId);
        if (!exists) return res.status(404).json({ error: 'Бронь не знайдена' });
        const method = payment_method && PAYMENT_METHODS.includes(payment_method) ? payment_method : null;
        const result = await db.query(
            `INSERT INTO booking_payments (booking_id, type, amount, payment_date, paid, payment_method, period_start, period_end)
             VALUES ($1, $2, $3, $4::date, $5, $6, $7::date, $8::date) RETURNING *`,
            [bookingId, type, amt, d, !!paid, method, period_start || null, period_end || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/bookings/:bookingId/payments/:paymentId', async (req, res) => {
    const bookingId = parseInt(req.params.bookingId, 10);
    const paymentId = parseInt(req.params.paymentId, 10);
    if (!bookingId || isNaN(bookingId) || !paymentId || isNaN(paymentId)) return res.status(400).json({ error: 'Invalid id' });
    const { type, amount, payment_date, paid, payment_method, period_start, period_end } = req.body;
    try {
        const exists = await ensureBookingExists(bookingId);
        if (!exists) return res.status(404).json({ error: 'Бронь не знайдена' });
        const updates = [];
        const values = [];
        let i = 1;
        if (type !== undefined) {
            if (!PAYMENT_TYPES.includes(type)) return res.status(400).json({ error: 'Невірний тип платежу' });
            updates.push(`type = $${i++}`); values.push(type);
        }
        if (amount !== undefined) { updates.push(`amount = $${i++}`); values.push(parseFloat(amount)); }
        if (payment_date !== undefined) { updates.push(`payment_date = $${i++}`); values.push(payment_date); }
        if (typeof paid === 'boolean') { updates.push(`paid = $${i++}`); values.push(paid); }
        if (payment_method !== undefined) { updates.push(`payment_method = $${i++}`); values.push(payment_method && PAYMENT_METHODS.includes(payment_method) ? payment_method : null); }
        if (period_start !== undefined) { updates.push(`period_start = $${i++}`); values.push(period_start || null); }
        if (period_end !== undefined) { updates.push(`period_end = $${i++}`); values.push(period_end || null); }
        if (updates.length === 0) return res.status(400).json({ error: 'Немає полів для оновлення' });
        values.push(paymentId, bookingId);
        const result = await db.query(
            `UPDATE booking_payments SET ${updates.join(', ')} WHERE id = $${i} AND booking_id = $${i + 1} RETURNING *`,
            values
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Платіж не знайдено' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/bookings/:bookingId/payments/:paymentId', async (req, res) => {
    const bookingId = parseInt(req.params.bookingId, 10);
    const paymentId = parseInt(req.params.paymentId, 10);
    if (!bookingId || isNaN(bookingId) || !paymentId || isNaN(paymentId)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const result = await db.query('DELETE FROM booking_payments WHERE id = $1 AND booking_id = $2 RETURNING id', [paymentId, bookingId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Платіж не знайдено' });
        res.json({ ok: true, id: paymentId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all clients
app.get('/api/clients', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM clients ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all message templates
app.get('/api/templates', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM message_templates ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new template
app.post('/api/templates', async (req, res) => {
    const { title, content } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO message_templates (title, content) VALUES ($1, $2) RETURNING *',
            [title, content]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a template
app.delete('/api/templates/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM message_templates WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`HataCRM Server running on port ${PORT}`);
});
