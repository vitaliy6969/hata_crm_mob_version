-- Create message_templates table
CREATE TABLE IF NOT EXISTS message_templates (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add some default templates
INSERT INTO message_templates (title, content) VALUES
('Підтвердження броні', 'Доброго дня! Ваше бронювання підтверджено. Дата заїзду: {start_date}, дата виїзду: {end_date}. Адреса: {address}. WiFi: {wifi}. З повагою, HataCRM.'),
('Нагадування про заїзд', 'Доброго дня! Нагадуємо, що завтра у вас заїзд о {check_in_time}. Адреса: {address}. Чекаємо на вас!'),
('Подяка після виїзду', 'Дякуємо, що обрали нас! Сподіваємось, вам сподобалось. Будемо раді бачити вас знову!');
