-- Add additional contact to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS secondary_contact TEXT;

-- Add address/description/wifi to apartments
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS wifi VARCHAR(255);

-- Soft delete: не видаляємо рядок, лише позначаємо видаленим
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- Add new fields to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS prepayment NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS prepayment_paid BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS full_amount_paid BOOLEAN DEFAULT false;

-- Expenses table (витрати)
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    apartment_id INTEGER REFERENCES apartments(id),
    amount NUMERIC(12, 2) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
