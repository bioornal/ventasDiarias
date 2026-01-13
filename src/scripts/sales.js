import { createClient } from '@supabase/supabase-js';

/**
 * MegaMuebles - Sales Management System
 * Refactored to use Supabase for persistent cloud storage
 * Includes UI refinements: simplified confirmation and improved date selection
 */

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.PUBLIC_SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Configuration & Default Values
// ============================================

const DEFAULT_CONFIG = {
  commissions: {
    efectivo: 0,
    transferencia: 0,
    debito: 0,
    credito_1: 0,
    credito_3: 16.67,
    credito_6: 28.57,
    credito_12: 50
  },
  partners: {
    principal: { name: 'Socio Principal', percentage: 60 },
    menor1: { name: 'Socio Menor 1', percentage: 20 },
    menor2: { name: 'Socio Menor 2', percentage: 20 }
  },
  expenses: [
    { id: 'empleados', name: 'Empleados', amount: 3000000 },
    { id: 'alquileres', name: 'Alquileres', amount: 4000000 },
    { id: 'luz', name: 'Luz', amount: 350000 }
  ],
  usdRate: 1000
};

const PAYMENT_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito_1: 'Crédito 1 pago',
  credito_3: 'Crédito 3 cuotas',
  credito_6: 'Crédito 6 cuotas',
  credito_12: 'Crédito 12 cuotas'
};

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

class SalesManager {
  constructor() {
    this.sales = [];
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.currentTab = 'dashboard';
    this.selectedDate = new Date().toISOString().split('T')[0];
    this.user = null; // Track current user
    this.init();
  }

  async init() {
    // Escuchar cambios en el estado de autenticación
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        this.user = session.user;
        this.onUserAuthenticated();
      } else if (event === 'SIGNED_OUT') {
        this.user = null;
        this.onUserSignedOut();
      }
    });

    // Sesión inicial
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      this.user = session.user;
      this.onUserAuthenticated();
    } else {
      this.renderLogin();
    }
  }

  async onUserAuthenticated() {
    // Mostrar UI protegida
    const nav = document.getElementById('main-nav');
    const userInfo = document.getElementById('user-info');
    if (nav) nav.style.display = 'flex';
    if (userInfo) userInfo.style.display = 'flex';
    document.getElementById('user-display').textContent = this.user.email;

    // Configurar Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => this.handleLogout();

    // Limpiar el contenedor principal de cualquier rastro del login
    const mainContainer = document.querySelector('.main.container');
    if (mainContainer) mainContainer.innerHTML = '<div id="app-content"><h2>Cargando...</h2></div>';

    await this.loadAll();
    await this.checkMigration();

    this.setupNavigation(); // Idempotent check inside or just call
    this.setupModalOverlay();
    this.renderCurrentTab();
  }

  onUserSignedOut() {
    // Ocultar UI protegida y mostrar Login
    const nav = document.getElementById('main-nav');
    const userInfo = document.getElementById('user-info');
    if (nav) nav.style.display = 'none';
    if (userInfo) userInfo.style.display = 'none';
    this.renderLogin();
  }

  async handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Error logout:', error);
  }

  renderLogin() {
    const container = document.querySelector('.main.container');
    container.innerHTML = `
      <div class="login-container animate-in">
        <div class="login-card">
          <div class="text-center mb-lg">
            <span style="font-size: 3rem;">🔐</span>
          </div>
          <h2 class="login-title">Ingreso al Sistema</h2>
          <div id="login-error" class="login-error" style="display: none;"></div>
          <form id="login-form">
            <div class="form-group mb-md">
              <label for="email">Correo Electrónico</label>
              <input type="email" id="email" required placeholder="tu@email.com" class="registration-input" style="width: 100%; border: 1px solid var(--border-color); background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm);" />
            </div>
            <div class="form-group mb-xl">
              <label for="password">Contraseña</label>
              <input type="password" id="password" required placeholder="••••••••" class="registration-input" style="width: 100%; border: 1px solid var(--border-color); background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm);" />
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 1.1rem;" id="login-submit">🔓 Entrar</button>
          </form>
          <p class="text-muted text-center mt-lg" style="font-size: 0.8rem; margin-top: 20px;">MegaMuebles Sales App v2.0</p>
        </div>
      </div>
    `;
    this.setupLogin();
  }

  setupLogin() {
    const form = document.getElementById('login-form');
    const submitBtn = document.getElementById('login-submit');
    const errorDiv = document.getElementById('login-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      submitBtn.disabled = true;
      submitBtn.textContent = '⏱️ Verificando...';
      errorDiv.style.display = 'none';

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        errorDiv.textContent = '❌ ' + (error.message === 'Invalid login credentials' ? 'Credenciales inválidas' : error.message);
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '🔓 Entrar';
      }
      // exitosa -> trigger onAuthStateChange
    });
  }

  setupModalOverlay() {
    if (!document.querySelector('.modal-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '<div class="modal" id="modal-container"></div>';
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModal();
      });

      // Cerrar con tecla Enter
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && overlay.classList.contains('active')) {
          this.closeModal();
        }
      });
    }
  }

  showModal(content) {
    const overlay = document.querySelector('.modal-overlay');
    const container = document.getElementById('modal-container');
    container.innerHTML = content;
    overlay.classList.add('active');
  }

  closeModal() {
    const overlay = document.querySelector('.modal-overlay');
    overlay.classList.remove('active');
  }

  async loadAll() {
    try {
      const { data: configData, error: configError } = await supabase
        .from('config')
        .select('*')
        .single();

      if (configData) {
        this.config = {
          commissions: configData.commissions,
          partners: configData.partners,
          expenses: configData.expenses,
          usdRate: configData.usd_rate
        };
      }

      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .order('date', { ascending: false });

      if (salesData) {
        this.sales = salesData.map(s => ({
          id: s.id,
          date: s.date,
          amounts: s.amounts,
          amountsUSD: s.amounts_usd,
          usdRate: s.usd_rate,
          notes: s.notes,
          createdAt: s.created_at
        }));
      }
    } catch (err) {
      console.error('Error loading:', err);
    }
  }

  async saveConfig() {
    try {
      const { error } = await supabase
        .from('config')
        .upsert({
          id: '00000000-0000-0000-0000-000000000000',
          commissions: this.config.commissions,
          partners: this.config.partners,
          expenses: this.config.expenses,
          usd_rate: this.config.usdRate,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
    } catch (err) {
      console.error('Save config error:', err);
    }
  }

  async addSale(sale) {
    try {
      const { data, error } = await supabase
        .from('sales')
        .insert({
          date: sale.date,
          amounts: sale.amounts,
          amounts_usd: sale.amountsUSD || {},
          usd_rate: sale.usdRate || this.config.usdRate,
          notes: sale.notes
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newSale = {
          id: data.id,
          date: data.date,
          amounts: data.amounts,
          amountsUSD: data.amounts_usd,
          usdRate: data.usd_rate,
          notes: data.notes,
          createdAt: data.created_at
        };
        this.sales.unshift(newSale);
        return newSale;
      }
    } catch (err) {
      console.error('Add sale error:', err);
      return null;
    }
  }

  async deleteSale(id) {
    try {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;
      this.sales = this.sales.filter(s => s.id !== id);
      return true;
    } catch (err) {
      return false;
    }
  }

  async checkMigration() {
    const localSales = localStorage.getItem('megamuebles_sales');
    const migrated = localStorage.getItem('megamuebles_migrated');
    if (migrated || !localSales) return;

    if (confirm('Deseas subir tus datos locales a la nube?')) {
      const parsedSales = JSON.parse(localSales);
      for (const sale of parsedSales) {
        await supabase.from('sales').insert({
          date: sale.date,
          amounts: sale.amounts,
          amounts_usd: sale.amountsUSD || {},
          usd_rate: sale.usdRate || this.config.usdRate,
          notes: sale.notes
        });
      }
      localStorage.setItem('megamuebles_migrated', 'true');
      await this.loadAll();
    }
  }

  setupNavigation() {
    if (this.navSet) return;
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.renderCurrentTab();
      });
    });
    this.navSet = true;
  }

  renderCurrentTab() {
    const content = document.getElementById('app-content');
    if (!content) {
      const main = document.querySelector('.main.container');
      if (main) {
        main.innerHTML = '<div id="app-content"></div>';
        this.renderCurrentTab();
        return;
      }
      return;
    }
    content.innerHTML = '';
    switch (this.currentTab) {
      case 'dashboard': this.renderDashboard(content); break;
      case 'registro': this.renderSalesForm(content); break;
      case 'historial': this.renderHistory(content); break;
      case 'mensual': this.renderMonthlySummary(content); break; // Nueva pestaña
      case 'config': this.renderConfig(content); break;
    }
  }

  groupSalesByMonth() {
    const months = {};
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    this.sales.forEach(s => {
      const date = new Date(s.date + 'T12:00:00');
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      if (!months[key]) {
        months[key] = {
          name: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
          gross: 0,
          net: 0,
          count: 0
        };
      }
      const { gross, net } = this.getSaleTotals(s);
      months[key].gross += gross;
      months[key].net += net;
      months[key].count++;
    });

    return Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]));
  }

  renderMonthlySummary(container) {
    const monthlyData = this.groupSalesByMonth();

    container.innerHTML = `
      <div class="section animate-in">
        <div class="section-header">
          <h2 class="section-title">📅 Resumen Mensual</h2>
          <span class="badge badge-info">${monthlyData.length} Meses</span>
        </div>
        
        <div class="monthly-cards">
          ${monthlyData.map(([key, data]) => `
            <div class="card monthly-card">
              <div class="monthly-card-header">
                <span class="monthly-month">${data.name}</span>
                <span class="badge badge-info">${data.count} ventas</span>
              </div>
              <div class="monthly-card-body">
                <div class="monthly-metric">
                  <span class="monthly-label">Venta Bruta</span>
                  <span class="monthly-value">${this.formatCurrency(data.gross)}</span>
                </div>
                <div class="monthly-metric">
                  <span class="monthly-label">Venta Real</span>
                  <span class="monthly-value text-success">${this.formatCurrency(data.net)}</span>
                </div>
              </div>
            </div>
          `).join('')}
          ${monthlyData.length === 0 ? '<div class="card text-center text-muted" style="padding: var(--spacing-xl);">No hay datos suficientes aún</div>' : ''}
        </div>
      </div>
    `;
  }

  // Common calculations
  getSaleTotals(sale) {
    let gross = 0, commission = 0;
    Object.entries(sale.amounts).forEach(([k, v]) => {
      gross += v;
      commission += v * (this.config.commissions[k] / 100);
    });
    if (sale.amountsUSD) {
      Object.entries(sale.amountsUSD).forEach(([k, v]) => {
        const ar = v * (sale.usdRate || this.config.usdRate);
        gross += ar;
        commission += ar * (this.config.commissions[k] / 100);
      });
    }
    return { gross, commission, net: gross - commission };
  }

  calculateGrossSales(sales = this.sales) {
    return sales.reduce((t, s) => t + this.getSaleTotals(s).gross, 0);
  }

  calculateCommissions(sales = this.sales) {
    return sales.reduce((t, s) => t + this.getSaleTotals(s).commission, 0);
  }

  calculateNetSales(sales = this.sales) {
    return this.calculateGrossSales(sales) - this.calculateCommissions(sales);
  }

  calculateTotalExpenses() {
    return this.config.expenses.reduce((t, e) => t + e.amount, 0);
  }

  calculateProfit(sales = this.sales) {
    return this.calculateNetSales(sales) - this.calculateTotalExpenses();
  }

  calculatePartnerDistribution(sales = this.sales) {
    const profit = this.calculateProfit(sales);
    return {
      principal: profit * (this.config.partners.principal.percentage / 100),
      menor1: profit * (this.config.partners.menor1.percentage / 100),
      menor2: profit * (this.config.partners.menor2.percentage / 100)
    };
  }

  getCurrentMonthSales() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return this.sales.filter(s => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });
  }

  getTodaySales() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const tm = new Date(t); tm.setDate(t.getDate() + 1);
    return this.sales.filter(s => {
      const d = new Date(s.date);
      return d >= t && d < tm;
    });
  }

  formatCurrency(v) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v);
  }

  renderDashboard(container) {
    const monthSales = this.getCurrentMonthSales();
    const todaySales = this.getTodaySales();
    const dist = this.calculatePartnerDistribution(monthSales);
    container.innerHTML = `
      <div class="section">
        <div class="section-header"><h2 class="section-title">📊 Resumen del Mes</h2><span class="badge badge-info">${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}</span></div>
        <div class="grid grid-4 mb-lg">
          ${this.renderMetricCard('Venta Bruta', this.calculateGrossSales(monthSales), '💰', 'primary')}
          ${this.renderMetricCard('Comisiones', this.calculateCommissions(monthSales), '💳', 'warning')}
          ${this.renderMetricCard('Venta Real', this.calculateNetSales(monthSales), '📈', 'success')}
          ${this.renderMetricCard('Ganancia', this.calculateProfit(monthSales), '🎯', this.calculateProfit(monthSales) >= 0 ? 'success' : 'danger')}
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2 class="section-title">👥 Socios</h2></div>
        <div class="grid grid-3 mb-lg">
          ${this.renderPartnerCard('Principal', 60, dist.principal)}
          ${this.renderPartnerCard('Menor 1', 20, dist.menor1)}
          ${this.renderPartnerCard('Menor 2', 20, dist.menor2)}
        </div>
      </div>
    `;
  }

  renderMetricCard(l, v, i, t) {
    const c = t === 'success' ? 'text-success' : t === 'danger' ? 'text-danger' : t === 'warning' ? 'text-warning' : '';
    return `<div class="card metric-card animate-in"><span class="metric-icon">${i}</span><div class="metric-value ${c}">${this.formatCurrency(v)}</div><div class="metric-label">${l}</div></div>`;
  }

  renderPartnerCard(n, p, a) {
    return `<div class="card partner-card animate-in"><div class="partner-percent">${p}%</div><div class="partner-amount ${a >= 0 ? 'text-success' : 'text-danger'}">${this.formatCurrency(a)}</div><div class="partner-name">${n}</div></div>`;
  }

  calculateSelectedDateTotal() {
    const selectedSales = this.sales.filter(s => s.date === this.selectedDate);
    return this.calculateGrossSales(selectedSales);
  }

  renderSalesForm(container) {
    container.innerHTML = `
      <div class="section">
        <div class="card minimalist-registration">
          <form id="sales-form">
            <div class="form-group mb-lg">
              <div class="date-trigger" id="date-picker-trigger">
                <span>📅</span>
                <input type="date" id="sale-date" value="${this.selectedDate}" required style="width: 100%;" />
              </div>
            </div>
            
            <div class="form-grid">
              ${Object.entries(PAYMENT_LABELS).map(([k, l]) => `
                <div class="form-group">
                  <label>${l} ${this.config.commissions[k] > 0 ? `<span class="badge badge-warning">${this.config.commissions[k]}%</span>` : ''}</label>
                  <div class="input-group"><span class="input-prefix">$</span><input type="number" id="amount-${k}" min="0" step="1" placeholder="0" class="registration-input" /></div>
                </div>
              `).join('')}
            </div>
            <div class="form-grid" style="margin-top:20px; border-top: 1px dashed var(--border-color); padding-top: 20px;">
              <div class="form-group">
                <label>Efectivo USD</label>
                <div class="input-group"><span class="input-prefix">U$D</span><input type="number" id="amount-usd-efectivo" min="0" step="0.01" placeholder="0" class="registration-input" /></div>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;
    this.setupSalesForm();
  }

  setupSalesForm() {
    const form = document.getElementById('sales-form');
    const dateInput = document.getElementById('sale-date');
    const dateTrigger = document.getElementById('date-picker-trigger');

    const openPicker = () => {
      try { if (typeof dateInput.showPicker === 'function') dateInput.showPicker(); else dateInput.focus(); }
      catch (err) { dateInput.focus(); }
    };

    dateTrigger.addEventListener('click', (e) => { if (e.target !== dateInput) openPicker(); });
    dateInput.addEventListener('change', (e) => { this.selectedDate = e.target.value; this.renderCurrentTab(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amounts = {}, amountsUSD = {};
      Object.keys(PAYMENT_LABELS).forEach(k => {
        const v = parseFloat(document.getElementById(`amount-${k}`).value) || 0;
        if (v > 0) amounts[k] = v;
      });

      const vUsd = parseFloat(document.getElementById('amount-usd-efectivo').value) || 0;
      if (vUsd > 0) amountsUSD.efectivo = vUsd;

      if (Object.keys(amounts).length || Object.keys(amountsUSD).length) {
        const newSale = await this.addSale({
          date: this.selectedDate,
          amounts, amountsUSD, notes: '' // Notas eliminadas en UI pero mantenemos el campo vacío
        });
        if (newSale) {
          this.showSummaryModal(newSale);
          form.querySelectorAll('input:not(#sale-date)').forEach(i => i.value = '');
        }
      }
    });
  }

  closeModal() {
    const overlay = document.querySelector('.modal-overlay');
    overlay.classList.remove('active');
    // Devolver el foco al primer campo de monto después de cerrar el modal
    setTimeout(() => {
      const firstInput = document.querySelector('.registration-input');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  updateDailySummation() {
    const dailyTotal = this.calculateSelectedDateTotal();
    const element = document.getElementById('daily-accumulated-total');
    if (element) {
      element.textContent = this.formatCurrency(dailyTotal);
    }
  }

  showSummaryModal(sale) {
    const { gross, commission, net } = this.getSaleTotals(sale);
    const content = `
      <div class="summary-modal">
        <h2 class="mb-lg">✅ Venta Confirmada</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Venta Bruta</span>
            <span class="summary-value">${this.formatCurrency(gross)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Comisión</span>
            <span class="summary-value text-warning">${this.formatCurrency(commission)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Venta Real</span>
            <span class="summary-value text-success">${this.formatCurrency(net)}</span>
          </div>
        </div>
        <p class="text-muted mt-lg" style="margin-top:20px;">La venta ha sido registrada exitosamente en el historial.</p>
        <button class="btn btn-primary mt-lg" style="margin-top:20px; width: 100%;" onclick="salesManager.closeModal()">Entendido</button>
      </div>
    `;
    this.showModal(content);
  }

  groupSalesByDate() {
    const groups = {};
    this.sales.forEach(s => {
      if (!groups[s.date]) groups[s.date] = { sales: [], total: 0 };
      groups[s.date].sales.push(s);
      groups[s.date].total += this.getSaleTotals(s).gross;
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }

  renderHistory(container) {
    // Initialize historyMonth to current month if not set
    if (!this.historyMonth) {
      const now = new Date();
      this.historyMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    // Get available months from sales data
    const availableMonths = this.getAvailableMonths();

    // Filter sales by selected month
    const filteredSales = this.sales.filter(s => s.date.startsWith(this.historyMonth));

    // Group filtered sales by date
    const grouped = this.groupSalesByDateFiltered(filteredSales);

    // Get month name for display
    const [year, month] = this.historyMonth.split('-');
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const displayMonth = `${monthNames[parseInt(month) - 1]} ${year}`;

    container.innerHTML = `
      <div class="section">
        <div class="section-header" style="flex-wrap: wrap; gap: var(--spacing-md);">
          <h2 class="section-title">📋 Historial</h2>
          <div class="history-filter" style="display: flex; align-items: center; gap: var(--spacing-sm);">
            <select id="history-month-filter" class="month-filter-select" style="padding: 8px 12px; border-radius: var(--radius-sm); background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); font-size: 0.9rem;">
              ${availableMonths.map(m => `
                <option value="${m.value}" ${m.value === this.historyMonth ? 'selected' : ''}>${m.label}</option>
              `).join('')}
            </select>
            <span class="badge badge-info">${filteredSales.length} ventas</span>
          </div>
        </div>
        
        <div class="history-container">
          ${grouped.map(([date, data]) => `
            <div class="day-group mb-lg">
              <div class="day-header flex justify-between items-center mb-sm">
                <span class="day-date">📅 ${new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <span class="day-total">Total: <strong>${this.formatCurrency(data.total)}</strong></span>
              </div>
              <div class="card" style="padding:0;">
                <table class="history-table">
                  <thead>
                    <tr>
                      <th style="width: 25%;">Nota / Obs</th>
                      <th>Desglose</th>
                      <th class="text-right">Bruto</th>
                      <th class="text-right">Real</th>
                      <th style="width: 50px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.sales.map(s => this.renderSaleRow(s)).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `).join('')}
          ${filteredSales.length === 0 ? '<div class="card text-center text-muted" style="padding: var(--spacing-xl);">No hay ventas en este mes</div>' : ''}
        </div>
      </div>
    `;

    // Setup month filter listener
    document.getElementById('history-month-filter')?.addEventListener('change', (e) => {
      this.historyMonth = e.target.value;
      this.renderCurrentTab();
    });

    document.querySelectorAll('.delete-sale').forEach(b => b.addEventListener('click', async () => {
      if (confirm('¿Seguro que deseas eliminar esta venta?')) {
        await this.deleteSale(b.dataset.id);
      }
    }));
  }

  getAvailableMonths() {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const months = new Set();

    // Always include current month
    const now = new Date();
    months.add(`${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`);

    // Add months from sales
    this.sales.forEach(s => {
      const [year, month] = s.date.split('-');
      months.add(`${year}-${month}`);
    });

    // Convert to array and sort descending
    return Array.from(months)
      .sort((a, b) => b.localeCompare(a))
      .map(m => {
        const [year, month] = m.split('-');
        return {
          value: m,
          label: `${monthNames[parseInt(month) - 1]} ${year}`
        };
      });
  }

  groupSalesByDateFiltered(sales) {
    const groups = {};
    sales.forEach(s => {
      if (!groups[s.date]) groups[s.date] = { sales: [], total: 0 };
      groups[s.date].sales.push(s);
      groups[s.date].total += this.getSaleTotals(s).gross;
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }

  renderSaleRow(s) {
    const { gross, net } = this.getSaleTotals(s);
    const bk = [
      ...Object.entries(s.amounts).map(([k, v]) => `${PAYMENT_LABELS[k]}: ${this.formatCurrency(v)}`),
      ...Object.entries(s.amountsUSD || {}).map(([k, v]) => `${PAYMENT_LABELS[k]} USD: U$D ${v}`)
    ].join(' | ');

    return `
      <tr class="animate-in">
        <td><small>${s.notes || '-'}</small></td>
        <td style="font-size:0.8rem; color: var(--text-muted);">${bk}</td>
        <td class="text-right">${this.formatCurrency(gross)}</td>
        <td class="text-right text-success" style="font-weight:600;">${this.formatCurrency(net)}</td>
        <td>
          <button class="btn btn-sm btn-danger delete-sale" data-id="${s.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>
    `;
  }

  renderConfig(container) {
    container.innerHTML = `
      <div class="grid grid-2">
        <div class="section">
          <div class="section-header"><h2>💳 Comisiones</h2></div>
          <div class="card"><form id="comm-form">
            ${Object.entries(PAYMENT_LABELS).map(([k, l]) => `<div class="form-group"><label>${l}</label><div class="input-group"><input type="number" id="c-${k}" step="0.01" value="${this.config.commissions[k]}" /><span class="input-prefix">%</span></div></div>`).join('')}
            <button type="submit" class="btn btn-primary" style="margin-top:10px;">💾 Guardar Comisiones</button>
          </form></div>
        </div>
        <div class="section">
          <div class="section-header"><h2>👥 Socios</h2></div>
          <div class="card"><form id="part-form">
            <div class="form-group"><label>Principal</label><div class="input-group"><input type="number" id="p-p" value="${this.config.partners.principal.percentage}" /><span class="input-prefix">%</span></div></div>
            <div class="form-group"><label>Menor 1</label><div class="input-group"><input type="number" id="p-m1" value="${this.config.partners.menor1.percentage}" /><span class="input-prefix">%</span></div></div>
            <div class="form-group"><label>Menor 2</label><div class="input-group"><input type="number" id="p-m2" value="${this.config.partners.menor2.percentage}" /><span class="input-prefix">%</span></div></div>
            <button type="submit" class="btn btn-primary" style="margin-top:10px;">💾 Guardar Socios</button>
          </form></div>
          <div class="section-header" style="margin-top:20px;"><h2>💵 USD Cotización</h2></div>
          <div class="card"><form id="usd-form"><div class="form-group"><label>1 USD = ARS</label><div class="input-group"><span class="input-prefix">$</span><input type="number" id="u-rate" value="${this.config.usdRate}" /></div></div><button type="submit" class="btn btn-primary" style="margin-top:10px;">Guardar Cotización</button></form></div>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>💸 Gastos Fijos</h2><button id="add-exp" class="btn btn-sm btn-secondary">➕ Nuevo</button></div>
        <div class="card">
          <div id="exp-list">${this.config.expenses.map((e, i) => `<div class="flex gap-md mb-md exp-item" data-i="${i}"><input type="text" class="e-n" value="${e.name}" style="flex:2"/><div class="input-group"><span class="input-prefix">$</span><input type="number" class="e-a" value="${e.amount}"/></div><button class="btn btn-sm btn-danger r-e">🗑️</button></div>`).join('')}</div>
          <button id="save-exp" class="btn btn-primary">💾 Guardar Gastos</button>
        </div>
      </div>
    `;
    this.setupConfigForms();
  }

  setupConfigForms() {
    document.getElementById('comm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      Object.keys(PAYMENT_LABELS).forEach(k => this.config.commissions[k] = parseFloat(document.getElementById(`c-${k}`).value) || 0);
      await this.saveConfig(); alert('Comisiones guardadas');
    });
    document.getElementById('part-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      this.config.partners.principal.percentage = parseFloat(document.getElementById('p-p').value) || 0;
      this.config.partners.menor1.percentage = parseFloat(document.getElementById('p-m1').value) || 0;
      this.config.partners.menor2.percentage = parseFloat(document.getElementById('p-m2').value) || 0;
      await this.saveConfig(); alert('Distribución guardada');
    });
    document.getElementById('usd-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      this.config.usdRate = parseFloat(document.getElementById('u-rate').value) || 1000;
      await this.saveConfig(); alert('Cotización guardada');
    });
    document.getElementById('add-exp').addEventListener('click', () => {
      const div = document.createElement('div'); div.className = 'flex gap-md mb-md exp-item';
      div.innerHTML = `<input type="text" class="e-n" value="" style="flex:2"/><div class="input-group"><span class="input-prefix">$</span><input type="number" class="e-a" value="0"/></div><button class="btn btn-sm btn-danger r-e">🗑️</button>`;
      document.getElementById('exp-list').appendChild(div);
      div.querySelector('.r-e').addEventListener('click', () => div.remove());
    });
    document.querySelectorAll('.r-e').forEach(b => b.addEventListener('click', () => b.closest('.exp-item').remove()));
    document.getElementById('save-exp').addEventListener('click', async () => {
      this.config.expenses = Array.from(document.querySelectorAll('.exp-item')).map(it => ({
        id: Math.random().toString(36), name: it.querySelector('.e-n').value, amount: parseFloat(it.querySelector('.e-a').value) || 0
      }));
      await this.saveConfig(); alert('Gastos guardados');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.salesManager = new SalesManager();
});
