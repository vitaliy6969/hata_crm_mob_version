const db = require('./db');

async function runMigration() {
    try {
        console.log('Creating message_templates table...');

        await db.query(`
            CREATE TABLE IF NOT EXISTS message_templates (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Inserting default templates...');

        const defaults = [
            ['Підтвердження броні', 'Доброго дня! Ваше бронювання підтверджено. Дата заїзду: {start_date}, дата виїзду: {end_date}. Адреса: {address}. WiFi: {wifi}. З повагою, HataCRM.'],
            ['Нагадування про заїзд', 'Доброго дня! Нагадуємо, що завтра у вас заїзд о {check_in_time}. Адреса: {address}. Чекаємо на вас!'],
            ['Подяка після виїзду', 'Дякуємо, що обрали нас! Сподіваємось, вам сподобалось. Будемо раді бачити вас знову!']
        ];
        for (const [title, content] of defaults) {
            const exists = await db.query('SELECT 1 FROM message_templates WHERE title = $1', [title]);
            if (exists.rows.length === 0) {
                await db.query('INSERT INTO message_templates (title, content) VALUES ($1, $2)', [title, content]);
            }
        }

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
