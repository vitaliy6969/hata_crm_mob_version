-- Apartments table
CREATE TABLE IF NOT EXISTS apartments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    wix_id VARCHAR(255),
    base_price DECIMAL(10, 2) NOT NULL,
    address TEXT,
    description TEXT,
    wifi VARCHAR(255),
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    phone VARCHAR(50) UNIQUE NOT NULL,
    secondary_contact TEXT,
    notes TEXT,
    is_blacklisted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER REFERENCES apartments(id),
    client_id INTEGER REFERENCES clients(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_price DECIMAL(10, 2),
    daily_rate NUMERIC(10, 2) DEFAULT 0,
    check_in_time TIME,
    check_out_time TIME,
    prepayment NUMERIC(10, 2) DEFAULT 0,
    notes TEXT,
    adults INTEGER DEFAULT 1,
    children INTEGER DEFAULT 0,
    deposit NUMERIC(10, 2) DEFAULT 0,
    booking_source TEXT,
    prepayment_paid BOOLEAN DEFAULT false,
    full_amount_paid BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, CONFIRMED, CANCELLED, COMPLETED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Booking payments (payments linked to a booking)
CREATE TABLE IF NOT EXISTS booking_payments (
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
);

-- Cleaning Tasks table
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER REFERENCES apartments(id),
    booking_id INTEGER REFERENCES bookings(id),
    task_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Analytics cache (pre-computed JSONB results)
CREATE TABLE IF NOT EXISTS analytics_cache (
    cache_key VARCHAR(120) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message templates
CREATE TABLE IF NOT EXISTS message_templates (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
