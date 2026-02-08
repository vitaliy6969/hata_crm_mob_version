/**
 * Обрахунок аналітики в окремому модулі.
 * Результати пишуться в analytics_cache; API лише читає готові дані.
 *
 * Розподіл доходу по місяцях: ніч відноситься до дня заїзду (як у RentalBusiness).
 * Приклад: заїзд 27.02, виїзд 02.03 → 3 ночі: 27→28 і 28→1 у лютому, 1→2 у березні → 2 ночі лютий, 1 ніч березень.
 */
const db = require('./db');

const MS_DAY = 24 * 60 * 60 * 1000;

/** З значення з БД (Date або рядок) отримати YYYY-MM-DD */
function toDateStr(val) {
    if (!val) return '';
    if (val instanceof Date && !isNaN(val.getTime())) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = (val).toString().trim();
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[0] : s.split('T')[0].substring(0, 10) || '';
}

function parseDate(str) {
    const s = toDateStr(str);
    return s.length === 10 ? new Date(s) : null;
}

/** Загальна кількість ночей (виїзд — день виключно, остання ніч має заїзд end_date - 1) */
function totalNights(startStr, endStr) {
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    if (!start || !end || end <= start) return 0;
    return Math.floor((end - start) / MS_DAY);
}

/** Ночей у періоді [periodStart, periodEnd): рахуємо ночі, у яких дата заїзду потрапляє в період */
function nightsInPeriod(startStr, endStr, periodStartStr, periodEndStr) {
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    const pStart = parseDate(periodStartStr);
    const pEnd = parseDate(periodEndStr);
    if (!start || !end || !pStart || !pEnd || end <= start) return 0;
    const overlapStart = new Date(Math.max(start.getTime(), pStart.getTime()));
    const overlapEnd = new Date(Math.min(end.getTime(), pEnd.getTime()));
    if (overlapEnd <= overlapStart) return 0;
    return Math.floor((overlapEnd - overlapStart) / MS_DAY);
}

function getPeriodBounds(year, month) {
    const y = parseInt(year, 10);
    if (month != null && month !== '') {
        const m = parseInt(month, 10);
        const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        return [monthStart, monthEnd];
    }
    return [`${y}-01-01`, `${y + 1}-01-01`];
}

async function upsertCache(cacheKey, data) {
    await db.query(
        `INSERT INTO analytics_cache (cache_key, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [cacheKey, JSON.stringify(data)]
    );
}

/** Розрахунок monthly: 12 місяців для року. Дохід розподіляється по ночах (ніч = день заїзду). */
async function computeMonthly(year) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;
    const bookingsRes = await db.query(
        `SELECT start_date, end_date, total_price, prepayment, prepayment_paid, full_amount_paid,
         (SELECT COALESCE(SUM(amount), 0) FROM booking_payments WHERE booking_id = b.id AND paid = true) AS paid_from_payments,
         (SELECT COUNT(*) FROM booking_payments WHERE booking_id = b.id AND paid = true) AS payment_count
         FROM bookings b
         WHERE status != 'CANCELLED' AND start_date < $2 AND end_date > $1
         AND ((prepayment_paid = true OR full_amount_paid = true) OR EXISTS (SELECT 1 FROM booking_payments WHERE booking_id = b.id AND paid = true))`,
        [yearStart, yearEnd]
    );
    const months = [];
    for (let m = 1; m <= 12; m++) {
        const monthStart = `${year}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = m === 12 ? yearEnd : `${year}-${String(m + 1).padStart(2, '0')}-01`;
        let income = 0;
        for (const b of bookingsRes.rows) {
            const prep = parseFloat(b.prepayment) || 0;
            const totalPrice = parseFloat(b.total_price) || 0;
            const paidAmount = (b.payment_count > 0)
                ? (parseFloat(b.paid_from_payments) || 0)
                : ((b.prepayment_paid ? prep : 0) + (b.full_amount_paid ? (totalPrice - prep) : 0));
            if (paidAmount <= 0) continue;
            const start = toDateStr(b.start_date);
            const end = toDateStr(b.end_date);
            const total = totalNights(start, end);
            if (total <= 0) continue;
            const pricePerNight = paidAmount / total;
            const nights = nightsInPeriod(start, end, monthStart, monthEnd);
            income += pricePerNight * nights;
        }
        const expenseResult = await db.query(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= $1 AND date < $2',
            [monthStart, monthEnd]
        );
        const expenses = parseFloat(expenseResult.rows[0].total) || 0;
        months.push({ month: m, year, income, expenses, balance: income - expenses });
    }
    const totalIncome = months.reduce((s, r) => s + r.income, 0);
    const totalExpenses = months.reduce((s, r) => s + r.expenses, 0);
    return { year, months, totalIncome, totalExpenses, totalBalance: totalIncome - totalExpenses };
}

/** Розрахунок by-apartment для періоду */
async function computeByApartment(year, month) {
    const [periodStart, periodEnd] = getPeriodBounds(year, month);
    const apartments = await db.query('SELECT id, name FROM apartments WHERE deleted_at IS NULL ORDER BY name');
    const result = [];
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const apt of apartments.rows) {
        const bookingsRes = await db.query(
            `SELECT start_date, end_date, total_price, prepayment, prepayment_paid, full_amount_paid,
             (SELECT COALESCE(SUM(amount), 0) FROM booking_payments WHERE booking_id = b.id AND paid = true) AS paid_from_payments,
             (SELECT COUNT(*) FROM booking_payments WHERE booking_id = b.id AND paid = true) AS payment_count
             FROM bookings b
             WHERE apartment_id = $1 AND status != 'CANCELLED' AND start_date < $3 AND end_date > $2
             AND ((prepayment_paid = true OR full_amount_paid = true) OR EXISTS (SELECT 1 FROM booking_payments WHERE booking_id = b.id AND paid = true))`,
            [apt.id, periodStart, periodEnd]
        );
        let income = 0;
        for (const b of bookingsRes.rows) {
            const prep = parseFloat(b.prepayment) || 0;
            const totalPrice = parseFloat(b.total_price) || 0;
            const paidAmount = (b.payment_count > 0)
                ? (parseFloat(b.paid_from_payments) || 0)
                : ((b.prepayment_paid ? prep : 0) + (b.full_amount_paid ? (totalPrice - prep) : 0));
            if (paidAmount <= 0) continue;
            const start = toDateStr(b.start_date);
            const end = toDateStr(b.end_date);
            const total = totalNights(start, end);
            if (total <= 0) continue;
            const pricePerNight = paidAmount / total;
            const nights = nightsInPeriod(start, end, periodStart, periodEnd);
            income += pricePerNight * nights;
        }
        const expRes = await db.query(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE apartment_id = $1 AND date >= $2 AND date < $3',
            [apt.id, periodStart, periodEnd]
        );
        const expenses = parseFloat(expRes.rows[0].total) || 0;
        totalIncome += income;
        totalExpenses += expenses;
        result.push({ id: apt.id, name: apt.name, income, expenses, balance: income - expenses });
    }
    const noAptRes = await db.query(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE apartment_id IS NULL AND date >= $1 AND date < $2',
        [periodStart, periodEnd]
    );
    const noApartmentExpenses = parseFloat(noAptRes.rows[0].total) || 0;
    totalExpenses += noApartmentExpenses;
    return {
        apartments: result,
        noApartment: { income: 0, expenses: noApartmentExpenses, balance: -noApartmentExpenses },
        totalIncome,
        totalExpenses,
        totalBalance: totalIncome - totalExpenses
    };
}

/** Розрахунок витрат по категоріях для періоду */
async function computeExpensesByCategory(year, month) {
    const [periodStart, periodEnd] = getPeriodBounds(year, month);
    const result = await db.query(
        'SELECT category, SUM(amount)::numeric AS amount FROM expenses WHERE date >= $1 AND date < $2 GROUP BY category ORDER BY amount DESC',
        [periodStart, periodEnd]
    );
    return result.rows.map(r => ({ category: r.category, amount: parseFloat(r.amount) || 0 }));
}

/**
 * Оновлює кеш аналітики для одного року (місячний підсумок + по об'єктах і категоріях за рік і по кожному місяцю).
 */
async function refreshAnalyticsForYear(year) {
    const y = parseInt(year, 10);
    if (isNaN(y)) throw new Error('Invalid year');

    await computeMonthly(y).then(data => upsertCache(`monthly_${y}`, data));

    await computeByApartment(y).then(data => upsertCache(`by_apartment_${y}`, data));
    for (let m = 1; m <= 12; m++) {
        await computeByApartment(y, m).then(data => upsertCache(`by_apartment_${y}_${m}`, data));
    }

    await computeExpensesByCategory(y).then(data => upsertCache(`expenses_by_category_${y}`, data));
    for (let m = 1; m <= 12; m++) {
        await computeExpensesByCategory(y, m).then(data => upsertCache(`expenses_by_category_${y}_${m}`, data));
    }
}

module.exports = {
    refreshAnalyticsForYear,
    getPeriodBounds
};
