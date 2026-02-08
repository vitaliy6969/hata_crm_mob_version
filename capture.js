const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('--- Testing Modal Closing (Empty Cell) ---');
    await page.evaluate(() => {
        // Find first cell that is NOT booked
        const cells = Array.from(document.querySelectorAll('.day-cell'));
        const emptyCell = cells.find(c => !c.classList.contains('booked'));
        if (emptyCell) emptyCell.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'test_create_modal_opened.png' });

    await page.evaluate(() => {
        const closeBtn = document.querySelector('#bookingModal .close');
        if (closeBtn) closeBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'test_create_modal_closed.png' });

    console.log('--- Testing Booking Submission (Empty Cell) ---');
    await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('.day-cell'));
        const emptyCell = cells.find(c => !c.classList.contains('booked'));
        if (emptyCell) emptyCell.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await page.evaluate(() => {
        document.getElementById('clientName').value = 'Тест Закриття';
        document.getElementById('clientPhone').value = '380670000000';
        document.getElementById('adultsCount').value = '1';
        document.getElementById('dailyRate').value = '1000';
        document.getElementById('startDate').dispatchEvent(new Event('change'));
    });

    await page.screenshot({ path: 'test_create_form_filled.png' });

    await page.evaluate(() => {
        document.querySelector('#bookingForm .submit-btn').click();
    });

    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: 'test_create_after_submit.png' });

    await browser.close();
    console.log('Interactive tests completed!');
})();
