// HataCRM Core Logic
const API_BASE = ''; // Same origin

/** Без копійок — ціле число для відображення */
function fmtNum(n) {
    const x = parseFloat(n);
    if (isNaN(x)) return '0';
    return String(Math.round(x));
}

/** Escape HTML to prevent XSS */
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

class HataCRM {
    constructor() {
        this.currentMonth = new Date();
        this.apartments = [];
        this.bookings = [];
        this.priceCalcInited = false;
        this.cameFromProfile = false; // показувати кнопку «Назад» у списку об'єктів
        this.expenses = []; // витрати (localStorage)
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateDateDisplay();
        await this.loadData();
        this.renderCalendar();
    }

    setupEventListeners() {
        // Bottom Navigation switching
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                if (tabId === 'apartments') this.cameFromProfile = false;
                this.switchTab(tabId);
            });
        });

        // Context Menu Toggle
        const menuToggle = document.getElementById('menuToggle');
        const contextMenu = document.getElementById('contextMenu');
        if (menuToggle) {
            menuToggle.onclick = (e) => {
                e.stopPropagation();
                contextMenu.style.display = contextMenu.style.display === 'block' ? 'none' : 'block';
            };
        }

        document.addEventListener('click', () => {
            if (contextMenu) contextMenu.style.display = 'none';
        });

        // Add New Booking from menu
        const addBtn = document.getElementById('addNewBooking');
        if (addBtn) {
            addBtn.onclick = () => {
                const today = new Date().toISOString().split('T')[0];
                if (this.apartments.length > 0) {
                    this.openBookingModal(this.apartments[0], today);
                }
            };
        }

        // Month controls
        const prevBtn = document.getElementById('prevMonth');
        if (prevBtn) {
            prevBtn.onclick = () => {
                this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
                this.renderCalendar();
            };
        }
        const nextBtn = document.getElementById('nextMonth');
        if (nextBtn) {
            nextBtn.onclick = () => {
                this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
                this.renderCalendar();
            };
        }

        // Booking form
        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) {
            bookingForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.submitBooking();
            };
        }

        // Close modals: back button in booking modal
        const bookingModalBack = document.getElementById('bookingModalBack');
        if (bookingModalBack) {
            bookingModalBack.onclick = () => {
                document.getElementById('bookingModal').style.display = 'none';
                this.toggleScroll(false);
            };
        }
        document.querySelectorAll('.close').forEach(btn => {
            btn.onclick = () => {
                const modal = btn.closest('.modal');
                if (modal) modal.style.display = 'none';
                this.toggleScroll(false);
            };
        });

        // Settings Modal Triggers
        const openSettings = document.getElementById('openGridSettings');
        if (openSettings) {
            openSettings.onclick = () => {
                const modal = document.getElementById('settingsModal');
                modal.style.display = 'flex';
                this.toggleScroll(true);
            };
        }

        // Open Clients List
        const openClientsList = document.getElementById('openClientsList');
        if (openClientsList) {
            openClientsList.onclick = () => {
                this.openClientsModal();
            };
        }

        // Open Objects List (switch to apartments tab) — з профілю, показуємо «Назад»
        const openObjectsList = document.getElementById('openObjectsList');
        if (openObjectsList) {
            openObjectsList.onclick = () => {
                this.cameFromProfile = true;
                this.switchTab('apartments');
                document.getElementById('clientsModal').style.display = 'none';
                this.toggleScroll(false);
            };
        }

        // Назад зі списку об'єктів у профіль
        const apartmentsBackBtn = document.getElementById('apartmentsBackBtn');
        if (apartmentsBackBtn) {
            apartmentsBackBtn.onclick = () => {
                this.cameFromProfile = false;
                this.switchTab('staff');
            };
        }

        // Open Templates
        const openTemplates = document.getElementById('openTemplates');
        if (openTemplates) {
            openTemplates.onclick = () => {
                this.openTemplatesModal();
            };
        }

        // Витрати: кнопка «+ Додати» та модалка
        const addExpenseBtn = document.getElementById('addExpenseBtn');
        if (addExpenseBtn) addExpenseBtn.onclick = () => this.openExpenseModal(null);
        const expenseModalBack = document.getElementById('expenseModalBack');
        if (expenseModalBack) expenseModalBack.onclick = () => this.closeExpenseModal();
        const expenseForm = document.getElementById('expenseForm');
        if (expenseForm) expenseForm.onsubmit = (e) => { e.preventDefault(); this.submitExpense(); };
        const expenseDeleteBtn = document.getElementById('expenseDeleteBtn');
        if (expenseDeleteBtn) expenseDeleteBtn.onclick = () => this.deleteExpense();

        const analyticsYear = document.getElementById('analyticsYear');
        const analyticsMonth = document.getElementById('analyticsMonth');
        if (analyticsYear) {
            const y = new Date().getFullYear();
            for (let i = y - 2; i <= y + 2; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = i;
                if (i === y) opt.selected = true;
                analyticsYear.appendChild(opt);
            }
            analyticsYear.onchange = () => this.renderAnalytics();
        }
        if (analyticsMonth) {
            const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
            const optAll = document.createElement('option');
            optAll.value = '';
            optAll.textContent = 'Усі місяці';
            analyticsMonth.appendChild(optAll);
            monthNames.forEach((name, i) => {
                const opt = document.createElement('option');
                opt.value = i + 1;
                opt.textContent = name;
                analyticsMonth.appendChild(opt);
            });
            analyticsMonth.onchange = () => this.renderAnalytics();
        }
        const analyticsRefreshBtn = document.getElementById('analyticsRefreshBtn');
        if (analyticsRefreshBtn) {
            analyticsRefreshBtn.onclick = async () => {
                const year = parseInt(document.getElementById('analyticsYear')?.value, 10) || new Date().getFullYear();
                const prevText = analyticsRefreshBtn.textContent;
                analyticsRefreshBtn.disabled = true;
                analyticsRefreshBtn.textContent = 'Оновлення…';
                try {
                    const res = await fetch(`${API_BASE}/api/analytics/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ year })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || data.message || res.statusText);
                    await this.renderAnalytics();
                } catch (e) {
                    alert('Помилка оновлення аналітики: ' + (e.message || e));
                } finally {
                    analyticsRefreshBtn.disabled = false;
                    analyticsRefreshBtn.textContent = prevText;
                }
            };
        }

        this.setupSettingsListeners();
        this.setupObjectCardListeners();
        this.setupPaymentFormModal();
        const addObjectBtn = document.getElementById('addObjectBtn');
        if (addObjectBtn) addObjectBtn.onclick = () => this.openObjectCard(null);
    }

    setupSettingsListeners() {
        const sliders = [
            { id: 'rowHeightSlider', var: '--cell-height', valId: 'rowHeightVal', unit: 'px' },
            { id: 'colWidthSlider', var: '--cell-width', valId: 'colWidthVal', unit: 'px' },
            { id: 'firstColWidthSlider', var: '--first-col-width', valId: 'firstColWidthVal', unit: 'px' }
        ];

        sliders.forEach(s => {
            const el = document.getElementById(s.id);
            const valEl = document.getElementById(s.valId);
            if (!el || !valEl) return;

            const currentVal = localStorage.getItem(s.var) || getComputedStyle(document.documentElement).getPropertyValue(s.var).replace('px', '').trim();
            if (currentVal) {
                el.value = currentVal;
                valEl.innerText = currentVal;
                document.documentElement.style.setProperty(s.var, currentVal + s.unit);
            }

            el.oninput = () => {
                valEl.innerText = el.value;
                document.documentElement.style.setProperty(s.var, el.value + s.unit);
                localStorage.setItem(s.var, el.value);
            };
        });

        const saveSettings = document.getElementById('saveSettings');
        if (saveSettings) {
            saveSettings.onclick = () => {
                document.getElementById('settingsModal').style.display = 'none';
                this.toggleScroll(false);
            };
        }
    }

    toggleScroll(lock) {
        if (lock) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
    }

    showToast(message) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = message || 'Скопійовано в буфер обміну';
        el.classList.add('toast-visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('toast-visible'), 2500);
    }

    async submitBooking() {
        const data = {
            apartment_id: document.getElementById('aptId').value,
            client_name: document.getElementById('clientName').value,
            client_phone: document.getElementById('clientPhone').value,
            secondary_contact: document.getElementById('secondaryContact') ? document.getElementById('secondaryContact').value : '',
            start_date: document.getElementById('startDate').value,
            end_date: document.getElementById('endDate').value,
            daily_rate: document.getElementById('dailyRate').value,
            total_price: document.getElementById('totalPrice').value,
            check_in_time: document.getElementById('checkInTime').value,
            check_out_time: document.getElementById('checkOutTime').value,
            prepayment: document.getElementById('prepayment').value,
            notes: document.getElementById('notes').value,
            adults: document.getElementById('adultsCount').value,
            children: document.getElementById('childrenCount').value,
            deposit: document.getElementById('deposit').value,
            booking_source: document.getElementById('bookingSource').value,
            status: 'CONFIRMED'
        };

        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                document.getElementById('bookingModal').style.display = 'none';
                this.toggleScroll(false);
                await this.loadData();
                this.renderCalendar();
            } else {
                const errorData = await res.json();
                alert(`Помилка: ${errorData.error || 'Невідома помилка'}`);
            }
        } catch (err) {
            console.error('Submit error:', err);
            alert('Помилка при збереженні (Network/Server error)');
        }
    }

    setupPriceCalculation() {
        const startInput = document.getElementById('startDate');
        const endInput = document.getElementById('endDate');
        const rateInput = document.getElementById('dailyRate');
        const priceInput = document.getElementById('totalPrice');
        const hint = document.getElementById('priceHint');

        const calculate = () => {
            const start = startInput.value;
            const end = endInput.value;
            const aptId = parseInt(document.getElementById('aptId').value);
            const rate = parseFloat(rateInput.value) || 0;
            const startDateObj = new Date(start);
            const endDateObj = new Date(end);
            const nights = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));

            // Overlap check
            const hasOverlap = this.bookings.some(b => {
                if (b.apartment_id !== aptId || b.status === 'CANCELLED') return false;
                const bStart = b.start_date.split('T')[0];
                const bEnd = b.end_date.split('T')[0];
                return (start < bEnd && end > bStart);
            });

            if (hasOverlap) {
                hint.innerHTML = `<span style="color: #f43f5e; font-weight: bold;">⚠️ Цей період заброньовано!</span>`;
            } else if (nights > 0) {
                const total = nights * rate;
                priceInput.value = fmtNum(total);
                hint.innerHTML = `<span style="color: var(--primary);">${nights} ночей x ${fmtNum(rate)} грн</span>`;
            } else {
                priceInput.value = 0;
                hint.innerText = 'Некоректні дати';
            }
        };

        startInput.onchange = calculate;
        endInput.onchange = calculate;
        rateInput.oninput = calculate;
    }

    openBookingModal(apt, date) {
        const aptIdEl = document.getElementById('aptId');
        const selectEl = document.getElementById('bookingObjectSelect');
        aptIdEl.value = apt.id;
        document.getElementById('modalTitle').innerText = 'Нова бронь';

        if (selectEl) {
            if (!selectEl.options.length && this.apartments.length) {
                selectEl.innerHTML = this.apartments.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
            }
            selectEl.value = String(apt.id);
            if (!selectEl.onchange) {
                selectEl.onchange = () => { aptIdEl.value = selectEl.value; };
            }
        }

        document.getElementById('clientName').value = '';
        if (document.getElementById('secondaryContact')) document.getElementById('secondaryContact').value = '';
        document.getElementById('clientPhone').value = '';
        document.getElementById('checkInTime').value = '14:00';
        document.getElementById('checkOutTime').value = '12:00';
        document.getElementById('startDate').value = date;
        document.getElementById('dailyRate').value = '';
        document.getElementById('totalPrice').value = '';
        document.getElementById('prepayment').value = '';
        document.getElementById('adultsCount').value = 1;
        document.getElementById('childrenCount').value = 0;
        document.getElementById('deposit').value = '';
        document.getElementById('notes').value = '';

        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        document.getElementById('endDate').value = nextDay.toISOString().split('T')[0];

        document.getElementById('bookingModal').style.display = 'flex';

        if (!this.priceCalcInited) {
            this.setupPriceCalculation();
            this.priceCalcInited = true;
        }
        document.getElementById('startDate').onchange();
        this.toggleScroll(true);
    }

    async openBookingDetails(booking) {
        try {
            console.log('Opening booking:', booking); // Debug log

            let apt = this.apartments.find(a => a.id == booking.apartment_id);

            // Fallback if apartment not found
            if (!apt) {
                apt = {
                    name: `Квартира #${booking.apartment_id} (Не знайдена)`,
                    address: 'Адреса невідома',
                    description: '',
                    base_price: 0
                };
            }

            const startDate = new Date(booking.start_date);
            const endDate = new Date(booking.end_date);
            const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

            // Safely set text content with fallbacks
            const setSafeText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.innerText = text || '-';
            };

            setSafeText('detObjName', apt.name);
            setSafeText('detGuest', booking.client_name || 'Гість');
            setSafeText('detNights', isNaN(nights) ? '0' : nights);

            const dateStr = startDate && endDate ?
                `${startDate.toLocaleDateString('uk-UA')} - ${endDate.toLocaleDateString('uk-UA')}` :
                'Дати не вказані';
            setSafeText('detPeriod', dateStr);

            const fmtTime = (t) => (t && String(t).trim()) ? String(t).slice(0, 5) : '—';
            setSafeText('detCheckIn', fmtTime(booking.check_in_time) || '14:00');
            setSafeText('detCheckOut', fmtTime(booking.check_out_time) || '12:00');

            setSafeText('detGuestsCount', `${booking.adults || 1} дор. + ${booking.children || 0} діт.`);
            setSafeText('detPhone', booking.client_phone || 'Телефон не вказано');
            setSafeText('detRate', booking.daily_rate != null ? fmtNum(booking.daily_rate) : '—');
            setSafeText('detTotal', booking.total_price != null ? fmtNum(booking.total_price) : '—');

            // Notes
            const notesEl = document.getElementById('detNotes');
            if (notesEl) notesEl.innerText = booking.notes || 'Нотатки відсутні';

            // Links protection
            const setupLink = (id, prefix, val) => {
                const el = document.getElementById(id);
                if (el) {
                    el.href = val ? prefix + val.replace(/[^0-9+]/g, '') : '#';
                    el.style.opacity = val ? '1' : '0.5';
                    el.style.pointerEvents = val ? 'auto' : 'none';
                }
            };

            setupLink('callLink', 'tel:', booking.client_phone);
            setupLink('tgLink', 'https://t.me/', booking.client_phone);
            setupLink('waLink', 'https://wa.me/', booking.client_phone);

            const detPhoneEl = document.getElementById('detPhone');
            const detPhoneCopyBtn = document.getElementById('detPhoneCopyBtn');
            const app = this;
            const copyPhoneToClipboard = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                if (!booking.client_phone) return;
                const text = String(booking.client_phone).trim();
                const showDone = () => app.showToast('Скопійовано в буфер обміну');
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(showDone).catch(() => {
                        try {
                            const input = document.createElement('input');
                            input.value = text;
                            input.style.position = 'fixed';
                            input.style.opacity = '0';
                            document.body.appendChild(input);
                            input.select();
                            document.execCommand('copy');
                            document.body.removeChild(input);
                        } catch (_) {}
                        showDone();
                    });
                } else {
                    try {
                        const input = document.createElement('input');
                        input.value = text;
                        input.style.position = 'fixed';
                        input.style.opacity = '0';
                        document.body.appendChild(input);
                        input.select();
                        document.execCommand('copy');
                        document.body.removeChild(input);
                    } catch (_) {}
                    showDone();
                }
            };
            if (detPhoneEl && booking.client_phone) {
                detPhoneEl.style.cursor = 'pointer';
                detPhoneEl.onclick = copyPhoneToClipboard;
                if (detPhoneCopyBtn) {
                    detPhoneCopyBtn.style.display = 'inline-flex';
                    detPhoneCopyBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); copyPhoneToClipboard(e); };
                }
            } else {
                if (detPhoneCopyBtn) detPhoneCopyBtn.style.display = 'none';
            }

            // Payments: load from API and render cards
            const mainPList = document.getElementById('mainPaymentsList');
            const addPList = document.getElementById('extraPaymentsList');
            const cleanPList = document.getElementById('cleaningPaymentsList');

            let payments = [];
            try {
                const payRes = await fetch(`${API_BASE}/api/bookings/${booking.id}/payments`);
                if (payRes.ok) payments = await payRes.json();
            } catch (e) {
                console.warn('Failed to load payments:', e);
            }
            this._currentPayments = payments;
            this._currentDetailBooking = booking; // set early for payment modal
            this.renderPaymentsSection(booking, payments, mainPList, addPList, cleanPList);

            // Hide old payment confirmation block (we use per-payment cards now)
            const paymentConfirmSection = document.querySelector('.payment-confirm-section');
            if (paymentConfirmSection) paymentConfirmSection.style.display = 'none';

            // Created Date
            setSafeText('detCreatedDate', booking.created_at ? new Date(booking.created_at).toLocaleDateString('uk-UA') : new Date().toLocaleDateString('uk-UA'));

            // Load templates and setup selector
            try {
                await this.loadTemplates();
                this.setupTemplateSelector(booking, apt);
            } catch (tplErr) {
                console.warn('Failed to setup templates:', tplErr);
            }

            document.getElementById('detailsModal').style.display = 'flex';
            this.toggleScroll(true);

            this._currentDetailBooking = booking;
            const leftBtn = document.getElementById('detailsHeaderLeft');
            const rightBtn = document.getElementById('detailsHeaderRight');
            const titleEl = document.getElementById('detailsHeaderTitle');
            if (leftBtn) {
                leftBtn.textContent = '⬅️';
                leftBtn.onclick = () => {
                    document.getElementById('detailsModal').style.display = 'none';
                    this.toggleScroll(false);
                };
            }
            if (titleEl) titleEl.textContent = 'Деталі';
            if (rightBtn) {
                rightBtn.textContent = '⋮';
                rightBtn.style.opacity = '0';
                rightBtn.style.pointerEvents = 'none';
                rightBtn.onclick = null;
            }
            document.getElementById('detailsViewBlock').style.display = 'block';
            document.getElementById('detailsEditBlock').style.display = 'none';
            const editBtn = document.getElementById('btnDetailsEdit');
            if (editBtn) editBtn.onclick = () => this.switchToDetailsEdit();
            const btnEditPayments = document.getElementById('btnEditPaymentsFromCard');
            if (btnEditPayments) {
                btnEditPayments.onclick = () => {
                    const hasPaid = (this._currentPayments || []).some(p => p.paid) || !!(booking.prepayment_paid || booking.full_amount_paid);
                    if (hasPaid && !confirm('Ви впевнені, що хочете редагувати бронь з уже оплаченими платежами? Зміни потрібно буде зберегти.')) return;
                    this.switchToDetailsEdit();
                };
            }
            const delBtn = document.getElementById('btnDetailsDelete');
            if (delBtn) delBtn.onclick = () => this.deleteCurrentBooking();

            // "+ Додати" for payments (booking already set as _currentDetailBooking)
            const addMain = document.getElementById('addMainPaymentBtn');
            const addExtra = document.getElementById('addExtraPaymentBtn');
            const addClean = document.getElementById('addCleaningPaymentBtn');
            if (addMain) addMain.onclick = () => this.openPaymentModal(booking.id, 'main', null);
            if (addExtra) addExtra.onclick = () => this.openPaymentModal(booking.id, 'extra', null);
            if (addClean) addClean.onclick = () => this.openPaymentModal(booking.id, 'cleaning', null);

        } catch (err) {
            console.error('Error opening details:', err);
            alert(`Помилка відкриття броні: ${err.message}`);
        }
    }

    switchToDetailsEdit() {
        const b = this._currentDetailBooking;
        if (!b) return;
        const fmtTime = (t) => (t && String(t).trim()) ? String(t).slice(0, 5) : '';
        document.getElementById('editBookingId').value = b.id;
        const sel = document.getElementById('editApartmentId');
        if (sel) {
            sel.innerHTML = this.apartments.map(a => `<option value="${a.id}" ${a.id == b.apartment_id ? 'selected' : ''}>${a.name}</option>`).join('');
        }
        document.getElementById('editClientName').value = b.client_name || '';
        document.getElementById('editClientPhone').value = b.client_phone || '';
        document.getElementById('editSecondaryContact').value = b.secondary_contact || '';
        document.getElementById('editStartDate').value = (b.start_date || '').toString().slice(0, 10);
        document.getElementById('editEndDate').value = (b.end_date || '').toString().slice(0, 10);
        document.getElementById('editCheckIn').value = fmtTime(b.check_in_time) || '14:00';
        document.getElementById('editCheckOut').value = fmtTime(b.check_out_time) || '12:00';
        document.getElementById('editAdults').value = b.adults ?? 1;
        document.getElementById('editChildren').value = b.children ?? 0;
        document.getElementById('editDailyRate').value = b.daily_rate != null ? fmtNum(b.daily_rate) : '';
        document.getElementById('editTotalPrice').value = b.total_price != null ? fmtNum(b.total_price) : '';
        document.getElementById('editPrepayment').value = b.prepayment != null ? fmtNum(b.prepayment) : '';
        document.getElementById('editDeposit').value = b.deposit != null ? fmtNum(b.deposit) : '';
        document.getElementById('editBookingSource').value = b.booking_source || 'Direct';
        document.getElementById('editNotes').value = b.notes || '';

        document.getElementById('detailsViewBlock').style.display = 'none';
        document.getElementById('detailsEditBlock').style.display = 'block';
        document.getElementById('detailsHeaderTitle').textContent = 'Редагувати';
        const leftBtn = document.getElementById('detailsHeaderLeft');
        const rightBtn = document.getElementById('detailsHeaderRight');
        if (leftBtn) {
            leftBtn.textContent = 'Скасувати';
            leftBtn.onclick = () => this.switchToDetailsView();
        }
        if (rightBtn) {
            rightBtn.textContent = 'Зберегти';
            rightBtn.style.opacity = '1';
            rightBtn.style.pointerEvents = 'auto';
            rightBtn.onclick = () => this.saveDetailsEdit();
        }
    }

    switchToDetailsView() {
        document.getElementById('detailsEditBlock').style.display = 'none';
        document.getElementById('detailsViewBlock').style.display = 'block';
        if (this._currentDetailBooking) {
            this.openBookingDetails(this._currentDetailBooking);
        }
    }

    async deleteCurrentBooking() {
        const b = this._currentDetailBooking;
        if (!b || !b.id) return;
        if (!confirm('Видалити цю бронь? Дію скасувати неможливо.')) return;
        try {
            const res = await fetch(`/api/bookings/${b.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Помилка видалення');
            document.getElementById('detailsModal').style.display = 'none';
            this.toggleScroll(false);
            await this.loadData();
            this.renderCalendar();
        } catch (err) {
            alert(err.message || 'Помилка видалення');
        }
    }

    async saveDetailsEdit() {
        const id = document.getElementById('editBookingId').value;
        if (!id) return;
        const payload = {
            apartment_id: parseInt(document.getElementById('editApartmentId').value, 10),
            client_name: document.getElementById('editClientName').value.trim(),
            client_phone: document.getElementById('editClientPhone').value.trim(),
            secondary_contact: document.getElementById('editSecondaryContact').value.trim(),
            start_date: document.getElementById('editStartDate').value,
            end_date: document.getElementById('editEndDate').value,
            check_in_time: document.getElementById('editCheckIn').value || null,
            check_out_time: document.getElementById('editCheckOut').value || null,
            adults: parseInt(document.getElementById('editAdults').value, 10) || 1,
            children: parseInt(document.getElementById('editChildren').value, 10) || 0,
            daily_rate: parseFloat(document.getElementById('editDailyRate').value) || 0,
            total_price: parseFloat(document.getElementById('editTotalPrice').value) || 0,
            prepayment: parseFloat(document.getElementById('editPrepayment').value) || 0,
            deposit: parseFloat(document.getElementById('editDeposit').value) || 0,
            booking_source: document.getElementById('editBookingSource').value || 'Direct',
            notes: document.getElementById('editNotes').value.trim()
        };
        try {
            const res = await fetch(`/api/bookings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Помилка збереження');
            }
            const updated = await res.json();
            const idx = this.bookings.findIndex(x => x.id == id);
            if (idx >= 0) this.bookings[idx] = updated;
            this._currentDetailBooking = updated;
            this.switchToDetailsView();
            this.renderCalendar();
        } catch (err) {
            alert(err.message || 'Помилка збереження');
        }
    }

    /** Format date for display dd.mm.yyyy */
    fmtDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    }

    renderPaymentsSection(booking, payments, mainPList, addPList, cleanPList) {
        const totalPrice = parseFloat(booking.total_price) || 0;
        const paidSum = (payments || []).filter(p => p.paid).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

        const renderGroup = (container, list, types) => {
            if (!container) return;
            container.innerHTML = '';
            if (totalPrice > 0 && container === mainPList) {
                const sumEl = document.createElement('div');
                sumEl.className = 'payment-summary-line';
                sumEl.innerHTML = `<span>Загальна вартість</span><span class="p-amount">${fmtNum(totalPrice)} UAH</span>`;
                container.appendChild(sumEl);
                if (paidSum > 0) {
                    const paidEl = document.createElement('div');
                    paidEl.className = 'payment-summary-line paid-sum';
                    paidEl.innerHTML = `<span>Оплачено</span><span class="p-amount">${fmtNum(paidSum)} UAH</span>`;
                    container.appendChild(paidEl);
                }
            }
            const filtered = (list || []).filter(p => types.includes(p.type));
            if (filtered.length === 0 && container !== mainPList) {
                const empty = document.createElement('div');
                empty.className = 'payment-empty-hint';
                empty.textContent = container === addPList ? 'Немає додаткових платежів' : container === cleanPList ? 'Немає платежів за прибирання' : '';
                if (empty.textContent) container.appendChild(empty);
                return;
            }
            filtered.forEach(p => container.appendChild(this.buildPaymentCard(p, booking.id)));
        };

        const main = (payments || []).filter(p => p.type === 'prepayment' || p.type === 'main');
        const extra = (payments || []).filter(p => p.type === 'extra');
        const cleaning = (payments || []).filter(p => p.type === 'cleaning');
        renderGroup(mainPList, main, ['prepayment', 'main']);
        renderGroup(addPList, extra, ['extra']);
        renderGroup(cleanPList, cleaning, ['cleaning']);
    }

    buildPaymentCard(payment, bookingId) {
        const wrap = document.createElement('div');
        wrap.className = 'payment-card' + (payment.paid ? ' payment-card-paid' : '');
        const title = payment.type === 'prepayment' ? 'Передплата'
            : payment.type === 'main' && payment.period_start && payment.period_end
                ? `Період ${this.fmtDate(payment.period_start)} – ${this.fmtDate(payment.period_end)}`
                : payment.type === 'main' ? 'Основний платіж'
                    : payment.type === 'extra' ? 'Додатковий' : 'Прибирання';
        const dateStr = this.fmtDate(payment.payment_date);
        const amountStr = fmtNum(payment.amount) + ' UAH';
        const methodLabel = payment.payment_method === 'cash' ? ' (готівка)' : payment.payment_method === 'card' ? ' (картка)' : '';
        wrap.innerHTML = `
            <div class="payment-card-main">
                <span class="payment-card-title">${escHtml(title)}</span>
                <span class="payment-card-date">${dateStr}${methodLabel}</span>
                <span class="payment-card-amount">${amountStr}</span>
            </div>
            <div class="payment-card-actions">
                <button type="button" class="payment-card-btn payment-card-edit" data-payment-id="${payment.id}" title="Редагувати">✏️</button>
                <button type="button" class="payment-card-btn payment-card-delete" data-payment-id="${payment.id}" title="Видалити">🗑</button>
                ${!payment.paid ? `<button type="button" class="payment-card-btn payment-card-mark-paid" data-payment-id="${payment.id}">Відмітити оплаченим</button>` : '<span class="payment-card-badge-paid">Оплачено</span>'}
            </div>`;
        const editBtn = wrap.querySelector('.payment-card-edit');
        const deleteBtn = wrap.querySelector('.payment-card-delete');
        const markBtn = wrap.querySelector('.payment-card-mark-paid');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (!confirm('Видалити цей платіж?')) return;
                try {
                    const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/payments/${payment.id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error((await res.json()).error || 'Помилка');
                    const payRes = await fetch(`${API_BASE}/api/bookings/${bookingId}/payments`);
                    const list = payRes.ok ? await payRes.json() : [];
                    this._currentPayments = list;
                    this.renderPaymentsSection(this._currentDetailBooking, list,
                        document.getElementById('mainPaymentsList'),
                        document.getElementById('extraPaymentsList'),
                        document.getElementById('cleaningPaymentsList'));
                    this.renderCalendar();
                } catch (e) {
                    alert(e.message || 'Помилка видалення');
                }
            };
        }
        if (editBtn) {
            editBtn.onclick = () => {
                if (payment.paid && !confirm('Редагувати вже оплачений платіж?')) return;
                this.openPaymentModal(bookingId, null, payment);
            };
        }
        if (markBtn) {
            markBtn.onclick = async () => {
                try {
                    const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/payments/${payment.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ paid: true })
                    });
                    if (!res.ok) throw new Error((await res.json()).error || 'Помилка');
                    const payRes = await fetch(`${API_BASE}/api/bookings/${bookingId}/payments`);
                    const list = payRes.ok ? await payRes.json() : [];
                    this._currentPayments = list;
                    this.renderPaymentsSection(this._currentDetailBooking, list,
                        document.getElementById('mainPaymentsList'),
                        document.getElementById('extraPaymentsList'),
                        document.getElementById('cleaningPaymentsList'));
                    this.renderCalendar();
                } catch (e) {
                    alert(e.message || 'Помилка оновлення');
                }
            };
        }
        return wrap;
    }

    openPaymentModal(bookingId, group, payment) {
        const modal = document.getElementById('paymentFormModal');
        const titleEl = document.getElementById('paymentModalTitle');
        document.getElementById('paymentFormBookingId').value = bookingId;
        document.getElementById('paymentFormPaymentId').value = payment ? payment.id : '';
        const typeSel = document.getElementById('paymentFormType');
        const typeGroupEl = document.getElementById('paymentFormTypeGroup');
        const periodWrap = document.querySelector('.payment-form-period');
        const periodStart = document.getElementById('paymentFormPeriodStart');
        const periodEnd = document.getElementById('paymentFormPeriodEnd');
        const today = new Date().toISOString().slice(0, 10);

        const methodSel = document.getElementById('paymentFormMethod');

        if (payment) {
            titleEl.textContent = 'Редагувати платіж';
            typeSel.value = payment.type;
            typeSel.disabled = true;
            typeGroupEl.style.display = 'block';
            document.getElementById('paymentFormAmount').value = payment.amount != null ? payment.amount : '';
            document.getElementById('paymentFormDate').value = (payment.payment_date || '').toString().slice(0, 10);
            periodStart.value = (payment.period_start || '').toString().slice(0, 10);
            periodEnd.value = (payment.period_end || '').toString().slice(0, 10);
            periodWrap.style.display = payment.type === 'main' ? 'block' : 'none';
            if (methodSel) methodSel.value = payment.payment_method || '';
        } else {
            titleEl.textContent = 'Новий платіж';
            typeSel.disabled = false;
            typeGroupEl.style.display = 'block';
            if (group === 'main') {
                typeSel.innerHTML = '<option value="prepayment">Передплата</option><option value="main">Основний (період)</option>';
            } else if (group === 'extra') {
                typeSel.innerHTML = '<option value="extra">Додатковий</option>';
            } else if (group === 'cleaning') {
                typeSel.innerHTML = '<option value="cleaning">Прибирання</option>';
            } else {
                typeSel.innerHTML = '<option value="prepayment">Передплата</option><option value="main">Основний (період)</option><option value="extra">Додатковий</option><option value="cleaning">Прибирання</option>';
            }
            typeSel.value = group === 'main' ? 'prepayment' : (group || 'prepayment');
            document.getElementById('paymentFormAmount').value = '';
            document.getElementById('paymentFormDate').value = today;
            if (methodSel) methodSel.value = '';
            periodStart.value = '';
            periodEnd.value = '';
            const b = this._currentDetailBooking;
            if (b && typeSel.value === 'main') {
                periodStart.value = (b.start_date || '').toString().slice(0, 10);
                periodEnd.value = (b.end_date || '').toString().slice(0, 10);
            }
            periodWrap.style.display = typeSel.value === 'main' ? 'block' : 'none';
        }

        typeSel.onchange = () => {
            periodWrap.style.display = typeSel.value === 'main' ? 'block' : 'none';
        };

        modal.style.display = 'flex';
        this.toggleScroll(true);
    }

    setupPaymentFormModal() {
        const modal = document.getElementById('paymentFormModal');
        const backBtn = document.getElementById('paymentModalBack');
        const form = document.getElementById('paymentForm');
        if (backBtn) backBtn.onclick = () => { modal.style.display = 'none'; this.toggleScroll(false); };
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const bookingId = document.getElementById('paymentFormBookingId').value;
                const paymentId = document.getElementById('paymentFormPaymentId').value;
                const type = document.getElementById('paymentFormType').value;
                const amount = parseFloat(document.getElementById('paymentFormAmount').value) || 0;
                const payment_date = document.getElementById('paymentFormDate').value;
                const payment_method = document.getElementById('paymentFormMethod')?.value || null;
                const period_start = document.getElementById('paymentFormPeriodStart').value || null;
                const period_end = document.getElementById('paymentFormPeriodEnd').value || null;
                try {
                    if (paymentId) {
                        const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/payments/${paymentId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type, amount, payment_date, payment_method, period_start, period_end })
                        });
                        if (!res.ok) throw new Error((await res.json()).error || 'Помилка');
                    } else {
                        const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/payments`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type, amount, payment_date, payment_method, period_start, period_end })
                        });
                        if (!res.ok) throw new Error((await res.json()).error || 'Помилка');
                    }
                    modal.style.display = 'none';
                    this.toggleScroll(false);
                    const payRes = await fetch(`${API_BASE}/api/bookings/${bookingId}/payments`);
                    const list = payRes.ok ? await payRes.json() : [];
                    this._currentPayments = list;
                    const b = this._currentDetailBooking;
                    if (b) {
                        this.renderPaymentsSection(b, list, document.getElementById('mainPaymentsList'), document.getElementById('extraPaymentsList'), document.getElementById('cleaningPaymentsList'));
                    }
                    this.renderCalendar();
                } catch (err) {
                    alert(err.message || 'Помилка збереження');
                }
            };
        }
    }

    setupPaymentConfirmButtons(bookingId, canConfirmPrepay, canConfirmFull) {
        const btnPrepay = document.getElementById('btnConfirmPrepayment');
        const btnFull = document.getElementById('btnConfirmFullAmount');
        const prepayStatusEl = document.getElementById('detPrepaymentStatus');
        const fullStatusEl = document.getElementById('detFullAmountStatus');

        const updateBookingAndUI = (key, value) => {
            const b = this.bookings.find(x => x.id === bookingId);
            if (b) b[key] = value;
        };

        if (btnPrepay && canConfirmPrepay) {
            btnPrepay.onclick = async () => {
                try {
                    const res = await fetch(`/api/bookings/${bookingId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prepayment_paid: true })
                    });
                    if (!res.ok) throw new Error((await res.json()).error || 'Помилка');
                    updateBookingAndUI('prepayment_paid', true);
                    if (prepayStatusEl) { prepayStatusEl.textContent = 'Оплачено'; prepayStatusEl.className = 'payment-status-badge paid'; }
                    btnPrepay.style.display = 'none';
                    this.renderCalendar();
                } catch (err) {
                    alert(err.message || 'Помилка оновлення');
                }
            };
        }
        if (btnFull && canConfirmFull) {
            btnFull.onclick = async () => {
                try {
                    const res = await fetch(`/api/bookings/${bookingId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ full_amount_paid: true })
                    });
                    if (!res.ok) throw new Error((await res.json()).error || 'Помилка');
                    updateBookingAndUI('full_amount_paid', true);
                    if (fullStatusEl) { fullStatusEl.textContent = 'Оплачено'; fullStatusEl.className = 'payment-status-badge paid'; }
                    btnFull.style.display = 'none';
                    this.renderCalendar();
                } catch (err) {
                    alert(err.message || 'Помилка оновлення');
                }
            };
        }
    }

    setupTemplateSelector(booking, apartment) {
        const selector = document.getElementById('templateSelector');
        const preview = document.getElementById('messagePreview');
        const copyBtn = document.getElementById('copyMessageBtn');

        // Populate selector
        selector.innerHTML = '<option value="">Оберіть шаблон...</option>';
        this.templates.forEach(t => {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = t.title;
            selector.appendChild(option);
        });

        // Handle selection
        selector.onchange = () => {
            const selectedId = selector.value;
            if (!selectedId) {
                preview.value = '';
                copyBtn.style.display = 'none';
                return;
            }

            const template = this.templates.find(t => t.id == selectedId);
            if (template) {
                preview.value = this.fillTemplate(template.content, booking, apartment);
                copyBtn.style.display = 'block';
            }
        };

        // Handle copy
        copyBtn.onclick = () => {
            preview.select();
            document.execCommand('copy');
            copyBtn.textContent = '✅ Скопійовано!';
            setTimeout(() => {
                copyBtn.textContent = '📋 Копіювати';
            }, 2000);
        };
    }

    fillTemplate(content, booking, apartment) {
        const total = parseFloat(booking.total_price) || 0;
        const prepaid = parseFloat(booking.prepayment) || 0;
        const residue = total - prepaid;
        const startDateStr = new Date(booking.start_date).toLocaleDateString('uk-UA');
        const endDateStr = new Date(booking.end_date).toLocaleDateString('uk-UA');
        const checkInTime = (booking.check_in_time && String(booking.check_in_time).slice(0, 5)) || '14:00';

        let text = content
            // *...* placeholders (UI buttons)
            .replace(/\*Имя клиента\*/g, booking.client_name || 'Гість')
            .replace(/\*Название объекта\*/g, apartment.name || 'Об\'єкт')
            .replace(/\*Адрес\*/g, apartment.address || 'Адреса не вказано')
            .replace(/\*Описание объекта\*/g, apartment.description || 'Опис не вказано')
            .replace(/\*Начальная дата\*/g, startDateStr)
            .replace(/\*Конечная дата\*/g, endDateStr)
            .replace(/\*Конечное время\*/g, '12:00')
            .replace(/\*Сумма предоплаты\*/g, fmtNum(prepaid))
            .replace(/\*Сумма следующей оплаты\*/g, fmtNum(residue));
        // {key} placeholders (default templates)
        text = text
            .replace(/\{start_date\}/g, startDateStr)
            .replace(/\{end_date\}/g, endDateStr)
            .replace(/\{address\}/g, apartment.address || 'Адреса не вказано')
            .replace(/\{wifi\}/g, apartment.wifi || '—')
            .replace(/\{check_in_time\}/g, checkInTime)
            .replace(/\{client_name\}/g, booking.client_name || 'Гість')
            .replace(/\{apartment_name\}/g, apartment.name || 'Об\'єкт');
        return text;
    }

    switchTab(tabId) {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const activeTab = document.getElementById(`${tabId}-tab`);
        if (activeTab) activeTab.classList.add('active');

        if (tabId === 'apartments') {
            const backBtn = document.getElementById('apartmentsBackBtn');
            if (backBtn) backBtn.style.display = this.cameFromProfile ? 'flex' : 'none';
            this.renderApartments();
        }
        if (tabId === 'finance') this.renderExpenses();
        if (tabId === 'analytics') this.renderAnalytics();
    }

    updateDateDisplay() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const el = document.getElementById('currentDate');
        if (el) el.innerText = new Date().toLocaleDateString('uk-UA', options);
    }

    async loadData() {
        try {
            const [aptRes, bookRes] = await Promise.all([
                fetch(`${API_BASE}/api/apartments`),
                fetch(`${API_BASE}/api/bookings`)
            ]);
            this.apartments = await aptRes.json();
            this.bookings = await bookRes.json();
        } catch (err) {
            console.error('Failed to load apartments/bookings:', err);
            this.apartments = this.apartments || [];
            this.bookings = this.bookings || [];
        }
        try {
            const expRes = await fetch(`${API_BASE}/api/expenses`);
            const apiExpenses = await expRes.json();
            this.expenses = Array.isArray(apiExpenses) ? apiExpenses : [];
            const raw = localStorage.getItem('hata_expenses');
            if (this.expenses.length === 0 && raw) {
                try {
                    const local = JSON.parse(raw);
                    if (Array.isArray(local) && local.length > 0) {
                        for (const ex of local) {
                            const res = await fetch(`${API_BASE}/api/expenses`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    category: ex.category,
                                    description: ex.description || '',
                                    apartment_id: ex.apartment_id || null,
                                    amount: ex.amount != null ? ex.amount : 0,
                                    date: ex.date || new Date().toISOString().slice(0, 10)
                                })
                            });
                            const created = await res.json();
                            if (created && created.id) this.expenses.push(created);
                        }
                        localStorage.removeItem('hata_expenses');
                    }
                } catch (_) {}
            }
        } catch (_) {
            this.expenses = this.expenses || [];
        }
    }

    renderCalendar() {
        const chessContainer = document.getElementById('chessboard');
        if (!chessContainer) return;
        chessContainer.innerHTML = '';

        const year = this.currentMonth.getFullYear();
        const month = this.currentMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
        const todayDate = today.getDate();

        const monthLabel = document.getElementById('monthLabel');
        if (monthLabel) monthLabel.innerText = this.currentMonth.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });

        // Build Header (Days)
        const header = document.createElement('div');
        header.className = 'calendar-row header-row';
        const gridCols = `var(--first-col-width) repeat(${daysInMonth}, var(--cell-width))`;
        header.style.gridTemplateColumns = gridCols;

        header.innerHTML = '<div class="cell sticky header-cell">Квартира</div>';
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const isWeekend = [0, 6].includes(date.getDay());
            const isToday = isCurrentMonth && d === todayDate;
            const dayName = date.toLocaleDateString('uk-UA', { weekday: 'short' });
            header.innerHTML += `<div class="cell header-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'day-today' : ''}">
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                    <span style="font-size:10px; opacity:0.6;">${dayName}</span>
                    <span>${d}</span>
                </div>
            </div>`;
        }
        chessContainer.appendChild(header);

        // Build Rows (Apartments)
        this.apartments.forEach(apt => {
            const row = document.createElement('div');
            row.className = 'calendar-row';
            row.style.gridTemplateColumns = gridCols;

            row.innerHTML = `<div class="cell name-cell sticky">
                <span>${apt.name}</span>
                <span style="color: #4f46e5; font-size: 10px; margin-left: auto;">↗</span>
            </div>`;

            for (let d = 1; d <= daysInMonth; d++) {
                const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                const booking = this.bookings.find(b => {
                    const start = b.start_date.split('T')[0];
                    const end = b.end_date.split('T')[0];
                    return b.apartment_id === apt.id && dayStr >= start && dayStr <= end;
                });

                const cell = document.createElement('div');
                const isTodayCell = isCurrentMonth && d === todayDate;
                cell.className = `cell day-cell ${booking ? 'booked' : ''} ${isTodayCell ? 'day-today' : ''}`;
                const date = new Date(year, month, d);
                if ([0, 6].includes(date.getDay())) cell.classList.add('weekend');

                if (booking) {
                    const start = booking.start_date.split('T')[0];
                    const pillSet = document.createElement('div');
                    pillSet.className = 'pill';
                    const totalPrice = parseFloat(booking.total_price) || 0;
                    const paidPaymentCount = parseInt(booking.paid_payment_count) || 0;
                    const paidAmount = parseFloat(booking.paid_amount) || 0;
                    let isUnpaid;
                    if (paidPaymentCount > 0) {
                        isUnpaid = totalPrice > 0 && paidAmount < totalPrice;
                    } else {
                        const prepaidAmt = parseFloat(booking.prepayment) || 0;
                        const needsPrepay = prepaidAmt > 0 && !booking.prepayment_paid;
                        const needsFull = !booking.full_amount_paid;
                        isUnpaid = needsPrepay || needsFull;
                    }
                    if (isUnpaid) pillSet.classList.add('pill-unpaid');

                    const colors = ['pill-pink', 'pill-yellow', 'pill-blue', 'pill-green', 'pill-orange', 'pill-cyan'];
                    pillSet.classList.add(colors[booking.id % colors.length]);

                    const endStr = booking.end_date.split('T')[0];

                    if (dayStr === start) pillSet.classList.add('start');
                    else if (dayStr === endStr) pillSet.classList.add('end');
                    else pillSet.classList.add('middle');

                    if (dayStr === start) {
                        const name = booking.client_name || '';
                        const displayName = name.length > 12 ? name.substring(0, 10) + '..' : name || 'Гість';
                        const dotClass = isUnpaid ? 'status-dot dot-unpaid' : 'status-dot';
                        pillSet.innerHTML = `<span class="${dotClass}"></span><span style="overflow:hidden; text-overflow:ellipsis;">${escHtml(displayName)}</span>`;
                    }
                    /* У середині та в кінці смуги крапку не показуємо — лише один раз на початку */

                    // Direct click handler on the pill for better responsiveness
                    pillSet.onclick = (e) => {
                        e.stopPropagation(); // Prevent cell click
                        this.openBookingDetails(booking);
                    };

                    cell.appendChild(pillSet);
                }

                cell.onclick = () => {
                    if (booking) {
                        this.openBookingDetails(booking);
                    } else {
                        this.openBookingModal(apt, dayStr);
                    }
                };
                row.appendChild(cell);
            }
            chessContainer.appendChild(row);
        });

        // Scroll to today when viewing current month
        if (isCurrentMonth && todayDate > 0) {
            const container = document.querySelector('.chessboard-container');
            if (container) {
                requestAnimationFrame(() => {
                    const cellW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-width').trim()) || 50;
                    const firstColW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--first-col-width').trim()) || 130;
                    const scrollTarget = firstColW + (todayDate - 1) * cellW - container.clientWidth / 2 + cellW / 2;
                    container.scrollLeft = Math.max(0, scrollTarget);
                });
            }
        }
    }

    renderApartments() {
        const list = document.getElementById('apartmentsList');
        if (!list) return;
        list.innerHTML = this.apartments.map(apt => `
            <div class="apt-card" data-apt-id="${apt.id}">
                <h3>${escHtml(apt.name)}</h3>
                <p>База: ${fmtNum(apt.base_price)} UAH</p>
                <div class="card-actions">
                    <button type="button" class="edit-btn">Редагувати</button>
                    <button type="button" class="del-btn">Видалити</button>
                </div>
            </div>
        `).join('');
        list.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => {
                const card = btn.closest('.apt-card');
                const id = card && card.getAttribute('data-apt-id');
                const apt = this.apartments.find(a => a.id == id || a.id === parseInt(id, 10));
                if (apt) this.openObjectCard(apt);
            };
        });
        list.querySelectorAll('.del-btn').forEach(btn => {
            btn.onclick = () => {
                const card = btn.closest('.apt-card');
                const id = card && card.getAttribute('data-apt-id');
                if (id) this.deleteApartmentById(id);
            };
        });
    }

    openObjectCard(apt) {
        const isNew = !apt || !apt.id;
        document.getElementById('objectCardId').value = isNew ? '' : apt.id;
        document.getElementById('objectCardTitle').textContent = isNew ? 'Новий об\'єкт' : (apt.name || 'Об\'єкт');
        document.getElementById('objectCardName').value = apt?.name || '';
        document.getElementById('objectCardAddress').value = apt?.address || '';
        document.getElementById('objectCardDescription').value = apt?.description || '';
        document.getElementById('objectCardBasePrice').value = (apt?.base_price != null) ? fmtNum(apt.base_price) : '';
        const color = (apt?.id && localStorage.getItem('objectColor_' + apt.id)) || '#22c55e';
        document.querySelectorAll('.object-color-swatch-btn').forEach(btn => {
            const c = btn.getAttribute('data-color');
            btn.classList.toggle('selected', c === color);
        });
        const deleteBtn = document.getElementById('objectCardDeleteBtn');
        if (deleteBtn) deleteBtn.style.display = isNew ? 'none' : 'block';
        document.getElementById('objectCardModal').style.display = 'flex';
        this.toggleScroll(true);
    }

    setupObjectCardListeners() {
        const back = document.getElementById('objectCardBack');
        if (back) back.onclick = () => {
            document.getElementById('objectCardModal').style.display = 'none';
            this.toggleScroll(false);
        };
        const form = document.getElementById('objectCardForm');
        if (form) form.onsubmit = (e) => {
            e.preventDefault();
            this.saveObjectCard();
        };
        document.querySelectorAll('.object-card-toggle .toggle-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.object-card-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
        document.getElementById('objectColorPalette')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.object-color-swatch-btn');
            if (!btn) return;
            const color = btn.getAttribute('data-color');
            const id = document.getElementById('objectCardId').value;
            document.querySelectorAll('.object-color-swatch-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            if (id) localStorage.setItem('objectColor_' + id, color);
        });
        const deleteBtn = document.getElementById('objectCardDeleteBtn');
        if (deleteBtn) deleteBtn.onclick = () => this.deleteObjectCard();
    }

    async deleteObjectCard() {
        const id = document.getElementById('objectCardId').value.trim();
        if (!id) return;
        const closed = await this.deleteApartmentById(id);
        if (closed) {
            document.getElementById('objectCardModal').style.display = 'none';
            this.toggleScroll(false);
        }
    }

    async deleteApartmentById(id) {
        if (!id) return false;
        if (!confirm('Видалити цей об\'єкт? Броні по ньому залишаться, але об\'єкт зникне зі списку.')) return false;
        try {
            const res = await fetch(`${API_BASE}/api/apartments/${id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || res.statusText);
            this.apartments = this.apartments.filter(a => a.id != id);
            localStorage.removeItem('objectColor_' + id);
            this.renderApartments();
            this.renderCalendar();
            return true;
        } catch (err) {
            alert('Помилка видалення: ' + (err.message || err));
            return false;
        }
    }

    openExpenseModal(expense) {
        const sel = document.getElementById('expenseApartment');
        sel.innerHTML = '<option value="">— Без прив\'язки —</option>' +
            this.apartments.map(a => `<option value="${a.id}">${a.name || 'Об\'єкт'}</option>`).join('');
        const titleEl = document.getElementById('expenseModalTitle');
        const submitBtn = document.getElementById('expenseSubmitBtn');
        const deleteBtn = document.getElementById('expenseDeleteBtn');
        if (expense) {
            document.getElementById('expenseId').value = String(expense.id);
            document.getElementById('expenseCategory').value = expense.category || '';
            document.getElementById('expenseDescription').value = expense.description || '';
            document.getElementById('expenseApartment').value = expense.apartment_id ? String(expense.apartment_id) : '';
            document.getElementById('expenseAmount').value = expense.amount != null ? String(expense.amount) : '';
            document.getElementById('expenseDate').value = expense.date || new Date().toISOString().slice(0, 10);
            if (titleEl) titleEl.textContent = 'Редагувати витрату';
            if (submitBtn) submitBtn.textContent = 'Зберегти';
            if (deleteBtn) deleteBtn.style.display = 'block';
        } else {
            document.getElementById('expenseId').value = '';
            document.getElementById('expenseDate').value = new Date().toISOString().slice(0, 10);
            document.getElementById('expenseCategory').value = '';
            document.getElementById('expenseDescription').value = '';
            document.getElementById('expenseAmount').value = '';
            if (titleEl) titleEl.textContent = 'Нова витрата';
            if (submitBtn) submitBtn.textContent = 'Додати';
            if (deleteBtn) deleteBtn.style.display = 'none';
        }
        document.getElementById('expenseModal').style.display = 'flex';
        this.toggleScroll(true);
    }

    closeExpenseModal() {
        document.getElementById('expenseModal').style.display = 'none';
        this.toggleScroll(false);
    }

    async submitExpense() {
        const idVal = document.getElementById('expenseId').value.trim();
        const category = document.getElementById('expenseCategory').value.trim();
        const description = document.getElementById('expenseDescription').value.trim();
        const apartment_id = document.getElementById('expenseApartment').value ? parseInt(document.getElementById('expenseApartment').value, 10) : null;
        const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
        const date = document.getElementById('expenseDate').value || new Date().toISOString().slice(0, 10);
        if (!category) { alert('Оберіть категорію витрат'); return; }
        const body = { category, description: description || '', apartment_id, amount, date };
        try {
            if (idVal) {
                const res = await fetch(`${API_BASE}/api/expenses/${idVal}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.message || res.statusText);
                const idx = this.expenses.findIndex(e => e.id == idVal || e.id === parseInt(idVal, 10));
                if (idx >= 0) this.expenses[idx] = data;
            } else {
                const res = await fetch(`${API_BASE}/api/expenses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.message || res.statusText);
                this.expenses.push(data);
            }
        } catch (err) {
            alert('Помилка збереження: ' + (err.message || err));
            return;
        }
        this.closeExpenseModal();
        this.renderExpenses();
    }

    async deleteExpense() {
        const idVal = document.getElementById('expenseId').value.trim();
        if (!idVal || !confirm('Видалити цю витрату?')) return;
        try {
            const res = await fetch(`${API_BASE}/api/expenses/${idVal}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || res.statusText);
            this.expenses = this.expenses.filter(e => e.id != idVal && e.id !== parseInt(idVal, 10));
        } catch (err) {
            alert('Помилка видалення: ' + (err.message || err));
            return;
        }
        this.closeExpenseModal();
        this.renderExpenses();
    }

    renderExpenses() {
        const list = document.getElementById('expensesList');
        const empty = document.getElementById('expensesEmpty');
        if (!list || !empty) return;
        if (this.expenses.length === 0) {
            list.style.display = 'none';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        list.style.display = 'flex';
        list.innerHTML = this.expenses.slice().reverse().map(ex => {
            const apt = ex.apartment_name || (ex.apartment_id ? (this.apartments.find(a => a.id === ex.apartment_id)?.name) : null) || '—';
            let dateStr = '—';
            if (ex.date) {
                const d = ex.date instanceof Date ? ex.date : new Date(String(ex.date).slice(0, 10) + 'T12:00:00');
                dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
            }
            return `<li class="expense-item" data-expense-id="${ex.id}" role="button" tabindex="0">
                <span class="expense-item-cat">${escHtml(ex.category)}</span>
                <span class="expense-item-apt">${escHtml(apt)}</span>
                <span class="expense-item-date">${dateStr}</span>
                <span class="expense-item-amount">−${fmtNum(ex.amount)} UAH</span>
                ${ex.description ? `<span class="expense-item-desc">${escHtml(ex.description)}</span>` : ''}
            </li>`;
        }).join('');
        list.querySelectorAll('.expense-item').forEach(li => {
            li.onclick = () => {
                const id = li.getAttribute('data-expense-id');
                const ex = this.expenses.find(e => e.id == id || String(e.id) === id);
                if (ex) this.openExpenseModal(ex);
            };
        });
    }

    async renderAnalytics() {
        const yearEl = document.getElementById('analyticsYear');
        const monthEl = document.getElementById('analyticsMonth');
        const tbody = document.getElementById('analyticsTableBody');
        const tfoot = document.getElementById('analyticsTableFoot');
        const byAptBody = document.getElementById('analyticsByApartmentBody');
        const byAptFoot = document.getElementById('analyticsByApartmentFoot');
        const byCatBody = document.getElementById('analyticsByCategoryBody');
        if (!yearEl || !tbody || !tfoot) return;
        const year = parseInt(yearEl.value, 10) || new Date().getFullYear();
        const month = monthEl ? monthEl.value : '';
        const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
        const monthParam = month ? `&month=${month}` : '';
        try {
            const [monthlyRes, byAptRes, byCatRes] = await Promise.all([
                fetch(`${API_BASE}/api/analytics/monthly?year=${year}`),
                fetch(`${API_BASE}/api/analytics/by-apartment?year=${year}${monthParam}`),
                fetch(`${API_BASE}/api/analytics/expenses-by-category?year=${year}${monthParam}`)
            ]);
            const monthlyData = await monthlyRes.json().catch(() => ({}));
            const byAptData = await byAptRes.json().catch(() => ({}));
            const byCatData = await byCatRes.json().catch(() => ({}));
            if (!monthlyRes.ok) throw new Error(monthlyData.error || monthlyData.message || monthlyRes.statusText);
            const months = monthlyData.months || [];
            if (month) {
                const r = months.find(m => m.month === parseInt(month, 10)) || {};
                const name = monthNames[r.month - 1] || monthNames[parseInt(month, 10) - 1] || '';
                const balanceClass = r.balance >= 0 ? 'analytics-positive' : 'analytics-negative';
                tbody.innerHTML = `<tr>
                    <td>${name}</td>
                    <td class="num">${fmtNum(r.income)} UAH</td>
                    <td class="num">${fmtNum(r.expenses)} UAH</td>
                    <td class="num ${balanceClass}">${r.balance >= 0 ? '' : '−'}${fmtNum(Math.abs(r.balance || 0))} UAH</td>
                </tr>`;
                const totalIncome = r.income || 0;
                const totalExpenses = r.expenses || 0;
                const totalBalance = (r.balance != null) ? r.balance : totalIncome - totalExpenses;
                const totalBalanceClass = totalBalance >= 0 ? 'analytics-positive' : 'analytics-negative';
                tfoot.innerHTML = `<tr class="analytics-total-row">
                    <td><strong>Разом</strong></td>
                    <td class="num"><strong>${fmtNum(totalIncome)} UAH</strong></td>
                    <td class="num"><strong>${fmtNum(totalExpenses)} UAH</strong></td>
                    <td class="num ${totalBalanceClass}"><strong>${totalBalance >= 0 ? '' : '−'}${fmtNum(Math.abs(totalBalance))} UAH</strong></td>
                </tr>`;
            } else {
                tbody.innerHTML = months.map(r => {
                    const name = monthNames[r.month - 1] || r.month;
                    const balanceClass = r.balance >= 0 ? 'analytics-positive' : 'analytics-negative';
                    return `<tr>
                        <td>${name}</td>
                        <td class="num">${fmtNum(r.income)} UAH</td>
                        <td class="num">${fmtNum(r.expenses)} UAH</td>
                        <td class="num ${balanceClass}">${r.balance >= 0 ? '' : '−'}${fmtNum(Math.abs(r.balance))} UAH</td>
                    </tr>`;
                }).join('');
                const totalIncome = monthlyData.totalIncome != null ? monthlyData.totalIncome : months.reduce((s, r) => s + r.income, 0);
                const totalExpenses = monthlyData.totalExpenses != null ? monthlyData.totalExpenses : months.reduce((s, r) => s + r.expenses, 0);
                const totalBalance = monthlyData.totalBalance != null ? monthlyData.totalBalance : totalIncome - totalExpenses;
                const balanceClass = totalBalance >= 0 ? 'analytics-positive' : 'analytics-negative';
                tfoot.innerHTML = `<tr class="analytics-total-row">
                    <td><strong>Разом за ${year}</strong></td>
                    <td class="num"><strong>${fmtNum(totalIncome)} UAH</strong></td>
                    <td class="num"><strong>${fmtNum(totalExpenses)} UAH</strong></td>
                    <td class="num ${balanceClass}"><strong>${totalBalance >= 0 ? '' : '−'}${fmtNum(Math.abs(totalBalance))} UAH</strong></td>
                </tr>`;
            }
            if (byAptBody && byAptFoot) {
                if (!byAptRes.ok || !byAptData.apartments) {
                    byAptBody.innerHTML = '<tr><td colspan="4" class="analytics-error">Не вдалося завантажити</td></tr>';
                    byAptFoot.innerHTML = '';
                } else {
                    const list = byAptData.apartments || [];
                    const noAp = byAptData.noApartment || { income: 0, expenses: 0, balance: 0 };
                    const totalIncome = byAptData.totalIncome != null ? byAptData.totalIncome : list.reduce((s, r) => s + r.income, 0) + 0;
                    const totalExpenses = byAptData.totalExpenses != null ? byAptData.totalExpenses : list.reduce((s, r) => s + r.expenses, 0) + noAp.expenses;
                    const totalBalance = byAptData.totalBalance != null ? byAptData.totalBalance : totalIncome - totalExpenses;
                    byAptBody.innerHTML = list.map(a => {
                        const balanceClass = a.balance >= 0 ? 'analytics-positive' : 'analytics-negative';
                        return `<tr>
                            <td>${a.name || '—'}</td>
                            <td class="num">${fmtNum(a.income)} UAH</td>
                            <td class="num">${fmtNum(a.expenses)} UAH</td>
                            <td class="num ${balanceClass}">${a.balance >= 0 ? '' : '−'}${fmtNum(Math.abs(a.balance))} UAH</td>
                        </tr>`;
                    }).join('') + (noAp.expenses > 0 ? `<tr>
                        <td>Без прив'язки</td>
                        <td class="num">0 UAH</td>
                        <td class="num">${fmtNum(noAp.expenses)} UAH</td>
                        <td class="num analytics-negative">−${fmtNum(noAp.expenses)} UAH</td>
                    </tr>` : '');
                    const totalBalanceClass = totalBalance >= 0 ? 'analytics-positive' : 'analytics-negative';
                    byAptFoot.innerHTML = `<tr class="analytics-total-row">
                        <td><strong>Разом</strong></td>
                        <td class="num"><strong>${fmtNum(totalIncome)} UAH</strong></td>
                        <td class="num"><strong>${fmtNum(totalExpenses)} UAH</strong></td>
                        <td class="num ${totalBalanceClass}"><strong>${totalBalance >= 0 ? '' : '−'}${fmtNum(Math.abs(totalBalance))} UAH</strong></td>
                    </tr>`;
                }
            }
            if (byCatBody) {
                if (!byCatRes.ok || !Array.isArray(byCatData)) {
                    byCatBody.innerHTML = '<tr><td colspan="2" class="analytics-error">Не вдалося завантажити</td></tr>';
                } else if (byCatData.length === 0) {
                    byCatBody.innerHTML = '<tr><td colspan="2" class="analytics-error">Немає витрат за період</td></tr>';
                } else {
                    byCatBody.innerHTML = byCatData.map(r => `
                        <tr>
                            <td>${r.category || '—'}</td>
                            <td class="num">${fmtNum(r.amount)} UAH</td>
                        </tr>
                    `).join('');
                }
            }
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="4" class="analytics-error">Не вдалося завантажити дані</td></tr>';
            tfoot.innerHTML = '';
            if (byAptBody) byAptBody.innerHTML = '<tr><td colspan="4" class="analytics-error">Не вдалося завантажити</td></tr>';
            if (byAptFoot) byAptFoot.innerHTML = '';
            if (byCatBody) byCatBody.innerHTML = '<tr><td colspan="2" class="analytics-error">Не вдалося завантажити</td></tr>';
        }
    }

    async saveObjectCard() {
        const id = document.getElementById('objectCardId').value.trim();
        const name = document.getElementById('objectCardName').value.trim();
        const address = document.getElementById('objectCardAddress').value.trim();
        const description = document.getElementById('objectCardDescription').value.trim();
        const base_price = parseFloat(document.getElementById('objectCardBasePrice').value) || 0;
        if (!name) { alert('Введіть назву об\'єкта'); return; }
        const selectedColorBtn = document.querySelector('.object-color-swatch-btn.selected');
        const color = selectedColorBtn ? selectedColorBtn.getAttribute('data-color') : '#22c55e';
        try {
            if (!id) {
                const res = await fetch(`${API_BASE}/api/apartments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, address, description, base_price })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.message || res.statusText || 'Помилка сервера');
                this.apartments.push(data);
                if (data.id && color) localStorage.setItem('objectColor_' + data.id, color);
            } else {
                const res = await fetch(`${API_BASE}/api/apartments/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, address, description, base_price })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.message || res.statusText || 'Помилка збереження. На сервері має бути оновлений src/index.js і перезапуск PM2.');
                if (color) localStorage.setItem('objectColor_' + id, color);
                const idx = this.apartments.findIndex(a => a.id == id);
                if (idx >= 0) this.apartments[idx] = { ...this.apartments[idx], ...data };
            }
            document.getElementById('objectCardModal').style.display = 'none';
            this.toggleScroll(false);
            this.renderApartments();
            this.renderCalendar();
        } catch (err) {
            alert('Помилка збереження: ' + (err.message || err));
        }
    }

    async openClientsModal() {
        await this.loadClients();
        this.renderClients();
        document.getElementById('clientsModal').style.display = 'flex';
        this.toggleScroll(true);

        // Setup search
        const searchInput = document.getElementById('clientSearch');
        if (searchInput) {
            searchInput.oninput = () => this.renderClients(searchInput.value);
        }
    }

    async loadClients() {
        try {
            const res = await fetch(`${API_BASE}/api/clients`);
            this.clients = await res.json();
        } catch (err) {
            console.error('Failed to load clients:', err);
            this.clients = [];
        }
    }

    renderClients(searchQuery = '') {
        const list = document.getElementById('clientsList');
        if (!list) return;

        const filtered = this.clients.filter(c => {
            const query = searchQuery.toLowerCase();
            return c.name.toLowerCase().includes(query) || c.phone.includes(query);
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Клієнтів не знайдено</div>';
            return;
        }

        list.innerHTML = filtered.map(client => `
            <div class="client-card">
                <div class="client-name">${escHtml(client.name)}</div>
                <div class="client-phone">${escHtml(client.phone)}</div>
                ${client.secondary_contact ? `<div class="client-phone" style="font-size: 0.75rem;">${escHtml(client.secondary_contact)}</div>` : ''}
            </div>
        `).join('');
    }

    async openTemplatesModal() {
        await this.loadTemplates();
        this.renderTemplates();
        document.getElementById('templatesModal').style.display = 'flex';
        this.toggleScroll(true);

        // Setup add template button
        const addBtn = document.getElementById('addTemplateBtn');
        if (addBtn) {
            addBtn.onclick = () => this.promptCreateTemplate();
        }
    }

    async loadTemplates() {
        try {
            const res = await fetch(`${API_BASE}/api/templates`);
            this.templates = await res.json();
        } catch (err) {
            console.error('Failed to load templates:', err);
            this.templates = [];
        }
    }

    renderTemplates() {
        const list = document.getElementById('templatesList');
        if (!list) return;

        if (this.templates.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Шаблонів не знайдено</div>';
            return;
        }

        list.innerHTML = this.templates.map(t => `
            <div class="template-card">
                <button class="template-delete" onclick="app.deleteTemplate(${parseInt(t.id, 10)})">Видалити</button>
                <div class="template-title">${escHtml(t.title)}</div>
                <div class="template-content">${escHtml(t.content)}</div>
            </div>
        `).join('');
    }

    async promptCreateTemplate() {
        // Show form modal
        document.getElementById('templateFormModal').style.display = 'flex';
        document.getElementById('templateTitleInput').value = '';
        document.getElementById('templateContentInput').value = '';

        // Setup placeholder buttons
        document.querySelectorAll('.placeholder-btn').forEach(btn => {
            btn.onclick = () => {
                const textarea = document.getElementById('templateContentInput');
                const placeholder = btn.getAttribute('data-placeholder');
                const cursorPos = textarea.selectionStart;
                const textBefore = textarea.value.substring(0, cursorPos);
                const textAfter = textarea.value.substring(cursorPos);
                textarea.value = textBefore + placeholder + textAfter;
                textarea.focus();
                textarea.selectionStart = textarea.selectionEnd = cursorPos + placeholder.length;
            };
        });

        // Setup save button
        const saveBtn = document.getElementById('saveTemplateBtn');
        saveBtn.onclick = async () => {
            const title = document.getElementById('templateTitleInput').value.trim();
            const content = document.getElementById('templateContentInput').value.trim();

            if (!title || !content) {
                alert('Будь ласка, заповніть всі поля');
                return;
            }

            try {
                await fetch(`${API_BASE}/api/templates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content })
                });
                await this.loadTemplates();
                this.renderTemplates();
                document.getElementById('templateFormModal').style.display = 'none';
            } catch (err) {
                alert('Помилка при створенні шаблону');
                console.error(err);
            }
        };
    }

    async deleteTemplate(id) {
        if (!confirm('Видалити цей шаблон?')) return;

        try {
            await fetch(`${API_BASE}/api/templates/${id}`, { method: 'DELETE' });
            await this.loadTemplates();
            this.renderTemplates();
        } catch (err) {
            alert('Помилка при видаленні');
            console.error(err);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new HataCRM();
});
