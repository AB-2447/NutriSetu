/* 
   NutriSetu — app.js (Upgraded Multi-User Version)
   Fresh botanical UI with premium budget-aware analytics
   and constraint-based meal optimization.
   
   Author: Advanced Full-Stack System Designer
   All visual additions adhere strictly to botanical theme.
 */

const API = `${window.location.origin}/api`;

//  Multi-User & Budget State 
let currentUser    = null;
let authToken      = localStorage.getItem('ns_auth_token') || null;
let allFoods       = [];
let todayLogs      = [];
let currentOptMode = 'normal'; // 'normal' | 'student' | 'budget_challenge'
let activeSwaps    = {};       // stores custom swapped foods locally per category
let activeRecommendations = null; // cached recommendations payload

//  Chart Instances 
let calorieChart   = null;
let budgetChart    = null;
let barChart       = null;
let lineChart      = null;
let roiChart       = null;
let spendingChart  = null;

//  Diet type config 
const DIET_CONFIG = {
    veg: {
        label:      'Vegetarian',
        icon:       '',
        badgeClass: 'badge-veg',
        allowed:    ['vegetarian', 'vegan'],
        color:      '#2D7A4A'
    },
    vegan: {
        label:      'Vegan',
        icon:       '',
        badgeClass: 'badge-vegan',
        allowed:    ['vegan'],
        color:      '#388E3C'
    },
    nonveg: {
        label:      'Non-Vegetarian',
        icon:       '',
        badgeClass: 'badge-non-veg',
        allowed:    ['vegetarian', 'vegan', 'non-vegetarian'],
        color:      '#B33A2A'
    }
};

//  Protected API Fetch Wrapper 
async function fetchAPI(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API}${endpoint}`;
    
    // Inject Authorization headers if token is present
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const config = { ...options, headers };
    
    try {
        const response = await fetch(url, config);
        
        if (response.status === 401) {
            // Unauthenticated/Token expired - clear and redirect to Login
            handleSessionExpiry();
            throw new Error('Session expired. Please log in again.');
        }
        
        return response;
    } catch (err) {
        console.error(`Fetch API Error [${endpoint}]:`, err.message);
        throw err;
    }
}

function handleSessionExpiry() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('ns_auth_token');
    showToast('Your session has expired. Please log in.', 'error');
    showAuthSection();
}

//  Init 
document.addEventListener('DOMContentLoaded', async () => {
    setupNav();
    setupChat();
    setupMealTabs();
    setupRecipeDietFilter();
    setTodayDate();

    // Check session persistence
    if (authToken) {
        try {
            const res = await fetchAPI('/auth/me');
            if (res.ok) {
                currentUser = await res.json();
                showApp();
            } else {
                showAuthSection();
            }
        } catch {
            showAuthSection();
        }
    } else {
        showAuthSection();
    }
});

//  Auth Tab Switching & Submission 
function switchAuthTab(mode) {
    document.querySelectorAll('.authtab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form-wrap').forEach(f => f.classList.add('hidden'));
    
    if (mode === 'login') {
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('login-form-wrap').classList.remove('hidden');
    } else {
        document.getElementById('tab-signup').classList.add('active');
        document.getElementById('signup-form-wrap').classList.remove('hidden');
    }
}

async function submitLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        return showToast('Please enter both email and password.', 'error');
    }

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok) {
            return showToast(data.error || 'Invalid credentials.', 'error');
        }

        authToken = data.token;
        localStorage.setItem('ns_auth_token', authToken);
        currentUser = data.user;

        showToast(`Welcome back, ${currentUser.name.split(' ')[0]}! `);
        showApp();
    } catch {
        showToast('Server connection error. Is the backend active?', 'error');
    }
}

function submitSignupNext() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!name || !email || !password) {
        return showToast('Please fill in all signup details.', 'error');
    }
    if (password.length < 6) {
        return showToast('Password must be at least 6 characters.', 'error');
    }

    // Save temporary state for final registration after onboarding steps
    window._tempSignup = { name, email, password };
    
    // Set wizard name and proceed to onboarding wizard step 1
    document.getElementById('ob-name').value = name;
    
    const authSec = document.getElementById('auth-section');
    const obSec = document.getElementById('onboarding-section');

    // Apply slide transition classes
    authSec.classList.add('slide-out-left');
    obSec.classList.remove('hidden');
    obSec.classList.add('active', 'slide-in-right');

    setTimeout(() => {
        // Cleanup classes after animation completes
        authSec.classList.remove('active', 'slide-out-left');
        authSec.classList.add('hidden');
        obSec.classList.remove('slide-in-right');
    }, 500);

    nextStep(1);
}

async function finishOnboarding() {
    const plan = window._calculatedPlan || {};
    const signup = window._tempSignup || {};
    const budgetTarget = parseFloat(document.getElementById('ob-budget').value) || 300;

    const payload = {
        name:          signup.name || document.getElementById('ob-name').value.trim(),
        email:         signup.email,
        password:      signup.password,
        age:           parseFloat(document.getElementById('ob-age').value),
        gender:        document.getElementById('ob-gender').value,
        height:        parseFloat(document.getElementById('ob-height').value),
        weight:        parseFloat(document.getElementById('ob-weight').value),
        targetWeight:  parseFloat(document.getElementById('ob-target').value),
        activityLevel: plan.activity  || 'sedentary',
        goal:          plan.goal      || 'maintenance',
        dietType:      plan.dietType  || 'veg',
        budgetTarget:  budgetTarget,
        createdAt:     new Date().toISOString()
    };

    try {
        const res = await fetch(`${API}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (!res.ok) {
            return showToast(data.error || 'Signup error.', 'error');
        }

        authToken = data.token;
        localStorage.setItem('ns_auth_token', authToken);
        currentUser = data.user;

        // Seed starting weight locally in WeightHistory via API
        await fetchAPI('/logs/weight', {
            method: 'POST',
            body: JSON.stringify({ weight: currentUser.weight })
        });

        showToast(`Registration complete! Welcome to NutriSetu, ${currentUser.name.split(' ')[0]}! `);
        
        // Hide Onboarding and show Dashboard
        document.getElementById('onboarding-section').classList.remove('active');
        document.getElementById('onboarding-section').classList.add('hidden');
        showApp();
    } catch (err) {
        showToast('Server error registering profile.', 'error');
    }
}

async function handleLogout() {
    if (!confirm('Are you sure you want to log out?')) return;
    try {
        await fetchAPI('/auth/logout', { method: 'POST' });
    } catch {}
    
    authToken = null;
    currentUser = null;
    localStorage.removeItem('ns_auth_token');
    showToast('Logged out successfully.');
    showAuthSection();
}

//  View States 
function showAuthSection() {
    document.getElementById('main-nav').classList.add('hidden');
    document.querySelectorAll('.page-section').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('auth-section').classList.add('active');
}

function showApp() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('onboarding-section').classList.add('hidden');
    document.getElementById('main-nav').classList.remove('hidden');
    
    // Toggle logout button visibility
    const lob = document.getElementById('logout-btn');
    if (lob) lob.classList.remove('hidden');

    navigateTo('dashboard-section');
    loadFoods();
}

//  Navigation 
function setupNav() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(link.dataset.target);
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    document.getElementById('reset-onboarding').addEventListener('click', async () => {
        if (!confirm('Reset your profile? All personalized logs, histories, and accounts will be deleted permanently.')) return;
        try {
            const res = await fetchAPI('/user', { method: 'DELETE' });
            if (res.ok) {
                showToast('Your profile has been wiped.');
                handleSessionExpiry();
            }
        } catch {
            showToast('Error resetting profile.', 'error');
        }
    });

    document.getElementById('hamburger')?.addEventListener('click', () =>
        document.querySelector('.nav-links').classList.toggle('open'));
}

function navigateTo(sectionId) {
    document.querySelectorAll('.page-section').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const target = document.getElementById(sectionId);
    if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
    if (sectionId === 'dashboard-section') refreshDashboard();
    if (sectionId === 'food-log-section')  refreshFoodLog();
    if (sectionId === 'progress-section')  renderProgressCharts();
}

function setTodayDate() {
    const el = document.getElementById('today-date');
    if (el) el.textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

//  Onboarding Wizard 
function nextStep(stepNum) {
    if (stepNum === 2) {
        const name   = document.getElementById('ob-name').value.trim();
        const age    = parseFloat(document.getElementById('ob-age').value);
        const height = document.getElementById('ob-height').value;
        const weight = document.getElementById('ob-weight').value;
        const target = document.getElementById('ob-target').value;
        if (!name)                                  return showToast('Please enter your name.');
        if (!age || age < 1 || age > 130)           return showToast('Please enter a valid age.');
        if (!height || parseFloat(height) < 50 || parseFloat(height) > 300) return showToast('Please enter a valid height (cm).');
        if (!weight || parseFloat(weight) < 10 || parseFloat(weight) > 500) return showToast('Please enter a valid weight (kg).');
        if (!target || parseFloat(target) < 10 || parseFloat(target) > 500) return showToast('Please enter a valid target weight.');
    }

    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${stepNum}`)?.classList.add('active');

    const dotCount = document.querySelectorAll('.sdot').length;
    document.querySelectorAll('.sdot').forEach((dot, i) => {
        dot.classList.toggle('active', i < Math.min(stepNum, dotCount));
    });
}

function calculatePlan() {
    const age    = parseFloat(document.getElementById('ob-age').value);
    const gender = document.getElementById('ob-gender').value;
    const height = parseFloat(document.getElementById('ob-height').value);
    const weight = parseFloat(document.getElementById('ob-weight').value);

    const bmr = gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;

    const multipliers = { sedentary: 1.2, lightly: 1.375, moderately: 1.55, very: 1.725, extra: 1.9 };
    const activity  = document.querySelector('input[name="activity"]:checked').value;
    const goal      = document.querySelector('input[name="goal"]:checked').value;
    const dietType  = document.querySelector('input[name="dietType"]:checked').value;

    const tdee = Math.round(bmr * (multipliers[activity] || 1.2));
    let calorieTarget = tdee;
    if (goal === 'loss') calorieTarget -= 500;
    if (goal === 'gain') calorieTarget += 500;
    calorieTarget = Math.round(calorieTarget);

    document.getElementById('res-calories').textContent = calorieTarget;
    document.getElementById('split-bk').textContent = Math.round(calorieTarget * 0.25) + ' kcal';
    document.getElementById('split-lu').textContent = Math.round(calorieTarget * 0.35) + ' kcal';
    document.getElementById('split-di').textContent = Math.round(calorieTarget * 0.30) + ' kcal';
    document.getElementById('split-sn').textContent = Math.round(calorieTarget * 0.10) + ' kcal';

    const conf = DIET_CONFIG[dietType];
    const badge = document.getElementById('result-diet-badge');
    if (badge) badge.innerHTML = `<span class="diet-badge-pill ${conf.badgeClass}">${conf.icon} ${conf.label} Plan</span>`;

    window._calculatedPlan = { tdee, calorieTarget, goal, activity, dietType };
    nextStep(5);
}

//  Diet Badge Helpers 
function getDietBadgeHTML(dietType, size = 'sm') {
    const conf = DIET_CONFIG[dietType] || DIET_CONFIG.veg;
    return `<span class="diet-badge-pill ${conf.badgeClass} size-${size}">${conf.icon} ${conf.label}</span>`;
}

//  Dashboard Core 
async function refreshDashboard() {
    if (!currentUser) return;

    activeSwaps = {}; // reset active customized swaps on refresh
    const name = currentUser.name || 'User';
    document.getElementById('dash-greeting').textContent = `Hello, ${name.split(' ')[0]} `;
    document.getElementById('sum-name').textContent    = name;
    document.getElementById('sum-weight').textContent  = currentUser.weight;
    document.getElementById('sum-target').textContent  = currentUser.targetWeight;

    const goalMap = { loss: 'Weight Loss', gain: 'Weight Gain', maintenance: 'Maintenance' };
    document.getElementById('sum-goal').textContent = goalMap[currentUser.goal] || currentUser.goal;

    const conf = DIET_CONFIG[currentUser.dietType] || DIET_CONFIG.veg;
    document.getElementById('sum-diet').innerHTML = getDietBadgeHTML(currentUser.dietType);

    const wrap = document.getElementById('diet-badge-wrap');
    if (wrap) wrap.innerHTML = `
        ${getDietBadgeHTML(currentUser.dietType, 'md')}
        <button class="diet-change-btn" onclick="openDietModal()">Change</button>`;

    const mlabel = document.getElementById('meal-diet-label');
    if (mlabel) mlabel.innerHTML = getDietBadgeHTML(currentUser.dietType);

    const bmi = (currentUser.weight / Math.pow(currentUser.height / 100, 2)).toFixed(1);
    document.getElementById('sum-bmi').textContent  = bmi;
    document.getElementById('stat-bmi').textContent = bmi;

    if (currentUser.createdAt) {
        const days = Math.max(1, Math.floor((Date.now() - new Date(currentUser.createdAt)) / 86400000) + 1);
        document.getElementById('stat-days-active').textContent = days;
    }

    // Load logs today
    try {
        const res = await fetchAPI('/logs');
        todayLogs = res.ok ? await res.json() : [];
    } catch { todayLogs = []; }

    // Calorie Tracking Metrics
    const consumed  = todayLogs.reduce((s, l) => s + (l.calories || 0), 0);
    const target    = currentUser.calorieTarget || 2000;
    const remaining = Math.max(0, target - consumed);

    document.getElementById('dash-remaining').textContent  = remaining;
    document.getElementById('dash-consumed').textContent   = consumed;
    document.getElementById('dash-target-lbl').textContent = target;
    document.getElementById('stat-logs-today').textContent = todayLogs.length;

    renderCalorieDonut(consumed, remaining, target);

    // Budget Tracking Metrics
    const spentToday = todayLogs.reduce((s, l) => s + (l.cost || 0), 0);
    const budgetTarget = currentUser.budgetTarget || 300;
    
    document.getElementById('dash-spent').textContent = `₹${Math.round(spentToday)}`;
    document.getElementById('dash-budget-lbl').textContent = `₹${budgetTarget}`;
    document.getElementById('slider-val').textContent = budgetTarget;
    document.getElementById('dash-budget-slider').value = budgetTarget;

    renderBudgetBurnChart(spentToday, budgetTarget);
    
    // Load dynamic optimized recommendations
    renderMealRecommendations();
}

//  Dynamic Budget Gauge Chart 
function renderBudgetBurnChart(spent, target) {
    const canvas = document.getElementById('budgetBurnChart');
    if (!canvas) return;
    if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
    
    const remaining = Math.max(0, target - spent);
    const color = spent > target ? '#C4694A' : '#6AAF8B'; // botanical red/green theme bounds

    budgetChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [spent, remaining],
                backgroundColor: [color, '#EDE5D4'],
                borderWidth: 0,
                borderRadius: 6
            }]
        },
        options: {
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateRotate: true, duration: 600 }
        }
    });
}

function updateBudgetSliderVal(val) {
    document.getElementById('slider-val').textContent = val;
}

async function saveBudgetSliderVal(val) {
    const budgetTarget = parseFloat(val);
    try {
        const res = await fetchAPI('/user/budget', {
            method: 'PATCH',
            body: JSON.stringify({ budgetTarget })
        });
        if (res.ok) {
            currentUser = await res.json();
            showToast(`Daily budget target updated to ₹${budgetTarget}!`);
            refreshDashboard();
        }
    } catch {
        showToast('Error updating budget target.', 'error');
    }
}

function renderCalorieDonut(consumed, remaining, target) {
    const canvas = document.getElementById('calorieDonutChart');
    if (!canvas) return;
    if (calorieChart) { calorieChart.destroy(); calorieChart = null; }
    calorieChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [consumed, Math.max(0, target - consumed)],
                backgroundColor: [consumed > target ? '#C4694A' : '#6AAF8B', '#EDE5D4'],
                borderWidth: 0,
                borderRadius: 6
            }]
        },
        options: {
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateRotate: true, duration: 600 }
        }
    });
}

//  Meal Optimization Mode Switcher 
async function changeOptMode(mode) {
    currentOptMode = mode;
    document.querySelectorAll('.opt-tab').forEach(t => t.classList.remove('active'));
    
    if (mode === 'normal') document.getElementById('opt-mode-normal').classList.add('active');
    else if (mode === 'student') document.getElementById('opt-mode-student').classList.add('active');
    else if (mode === 'budget_challenge') document.getElementById('opt-mode-challenge').classList.add('active');
    
    showToast(`Generating plan: ${mode.replace('_', ' ').toUpperCase()}...`);
    renderMealRecommendations();
}

//  Meal Tabs 
function setupMealTabs() {
    document.querySelectorAll('.mtab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.mtab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${tab.dataset.meal}`)?.classList.add('active');
        });
    });
}

/** Render meal recommendations from optimization service */
async function renderMealRecommendations() {
    if (!currentUser) return;

    const splits     = { bk: 'Breakfast', lu: 'Lunch', di: 'Dinner', sn: 'Snacks' };

    try {
        const res = await fetchAPI(`/meals/recommendations?mode=${currentOptMode}`);
        if (!res.ok) throw new Error();
        
        activeRecommendations = await res.json();
        
        if (currentOptMode === 'budget_challenge') {
            // Render the special ₹100 Challenge daily set
            renderBudgetChallengeRecommendations(activeRecommendations);
            return;
        }

        // Restore normal headers & panels layout in case they were altered by ₹100 Challenge mode
        restoreRegularTabsUI();

        for (const [key, categoryName] of Object.entries(splits)) {
            const recEl = document.getElementById(`rec-${key}`);
            if (!recEl) continue;

            const combos = activeRecommendations[categoryName] || [];
            
            if (combos.length === 0) {
                recEl.innerHTML = `<p class="empty-rec">No budget combos found under your calories target.</p>`;
                continue;
            }

            recEl.innerHTML = combos.map((combo, idx) => {
                // Determine affordability badges
                let badgeClass = 'badge-veg'; // green
                let badgeLabel = 'Affordable';
                const catBudget = currentUser.budgetTarget * (categoryName === 'Breakfast' ? 0.25 : categoryName === 'Lunch' ? 0.35 : categoryName === 'Dinner' ? 0.30 : 0.10);
                
                if (combo.totalCost > catBudget * 1.2) {
                    badgeClass = 'badge-non-veg'; // red
                    badgeLabel = 'Premium';
                } else if (combo.totalCost > catBudget) {
                    badgeClass = 'badge-vegan'; // yellow/amber
                    badgeLabel = 'Moderate';
                }

                // Check for swaps
                const swapBtnHTML = (combo.swaps && combo.swaps.length > 0)
                    ? `<button class="swap-action-btn" onclick="executeSwap('${categoryName}', ${idx})">Swap </button>`
                    : '';

                const swapAlertHTML = activeSwaps[`${categoryName}_${idx}`]
                    ? `<div class="swap-alert">Swapped to ${activeSwaps[`${categoryName}_${idx}`].replacement}! saved ₹${activeSwaps[`${categoryName}_${idx}`].savings}</div>`
                    : '';

                const foodItemsHTML = combo.foods.map(item => `
                    <div class="combo-sub-food">
                        <span>${item.food.name}</span>
                        <span>${(item.food.calories * item.portions).toFixed(2)} kcal · P: ${(item.food.protein * item.portions).toFixed(2)}g</span>
                    </div>
                `).join('');

                const logButtonHTML = `<button class="combo-log-btn" onclick="logOptimizedCombo('${categoryName}', ${idx})">Log Meal </button>`;

                return `
                    <div class="rec-combo-card" id="card-${categoryName}-${idx}">
                        <div class="combo-top">
                            <span class="combo-cost" id="cost-${categoryName}-${idx}">₹${Math.round(combo.totalCost)}</span>
                            <span class="rec-item-badge ${badgeClass}">${badgeLabel}</span>
                            <span class="combo-cals" id="cals-${categoryName}-${idx}">${combo.totalCalories} kcal</span>
                        </div>
                        <div class="combo-foods-list" id="foods-${categoryName}-${idx}">
                            ${foodItemsHTML}
                        </div>
                        ${swapAlertHTML}
                        <div class="combo-actions">
                            ${swapBtnHTML}
                            ${logButtonHTML}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error(err);
        showToast('Error retrieving optimized meal plans.', 'error');
    }
}

//  Restore default view UI (cancelling ₹100 Challenge layout) 
function restoreRegularTabsUI() {
    const panels = document.querySelectorAll('.mtab-panel');
    panels.forEach(p => {
        p.style.display = '';
    });
    
    const mealTabs = document.querySelector('.meal-tabs');
    if (mealTabs) mealTabs.style.display = '';
}

//  Render the daily backtracking ₹100 challenge combinations 
function renderBudgetChallengeRecommendations(plans) {
    restoreRegularTabsUI();
    
    // Hide regular category selector tabs since this returns integrated daily plans!
    const mealTabs = document.querySelector('.meal-tabs');
    if (mealTabs) mealTabs.style.display = 'none';

    // Show plans directly inside Breakfast panel and hide all other panels
    const panels = document.querySelectorAll('.mtab-panel');
    panels.forEach(p => {
        if (p.id === 'panel-bk') {
            p.style.display = 'block';
            p.classList.add('active');
        } else {
            p.style.display = 'none';
            p.classList.remove('active');
        }
    });

    const bkPanel = document.getElementById('panel-bk');
    bkPanel.querySelector('.meal-allowance').innerHTML = ` Top 5 daily plans under <strong>₹100/day</strong> target:`;
    
    const listEl = document.getElementById('rec-bk');
    
    if (!plans || plans.length === 0) {
        listEl.innerHTML = `<p class="empty-rec">No integrated daily plans could be constructed under the strict ₹100/day target. Try adjusting calories or diet preferences.</p>`;
        return;
    }

    listEl.innerHTML = plans.map((plan, idx) => {
        const mealsHTML = Object.entries(plan.meals).map(([catName, combo]) => {
            const foodNames = combo.foods.map(f => `${f.food.name}`).join(' + ');
            return `
                <div class="challenge-meal-row">
                    <span class="challenge-cat">${catName}:</span>
                    <span class="challenge-food">${foodNames}</span>
                    <span class="challenge-metrics">₹${Math.round(combo.totalCost)} · ${combo.totalCalories} kcal</span>
                </div>
            `;
        }).join('');

        return `
            <div class="challenge-plan-card">
                <div class="challenge-plan-top">
                    <span class="challenge-daily-cost">₹${Math.round(plan.totalDailyCost)} / day</span>
                    <span class="rec-item-badge badge-vegan">₹100 Challenge </span>
                    <span class="challenge-daily-cals">${plan.totalDailyCalories} kcal</span>
                </div>
                <div class="challenge-meals-box">
                    ${mealsHTML}
                </div>
                <button class="btn-primary full challenge-log-btn" onclick="logBudgetChallengeDay(${idx})">Log Entire Day's Plan </button>
            </div>
        `;
    }).join('');
}

//  Log the entire ₹100 challenge daily set 
async function logBudgetChallengeDay(idx) {
    if (!activeRecommendations || !activeRecommendations[idx]) return;
    const plan = activeRecommendations[idx];
    
    if (!confirm(`Log all meals in Plan #${idx+1} for today? (Total Cost: ₹${Math.round(plan.totalDailyCost)})`)) return;

    try {
        for (const [catName, combo] of Object.entries(plan.meals)) {
            for (const item of combo.foods) {
                await fetchAPI('/logs', {
                    method: 'POST',
                    body: JSON.stringify({
                        foodId: item.food._id,
                        foodName: item.food.name,
                        calories: item.food.calories * item.portions,
                        portions: item.portions,
                        type: item.food.type
                    })
                });
            }
        }
        showToast('Logged entire daily budget challenge plan successfully! ');
        refreshDashboard();
    } catch {
        showToast('Error logging challenge plan.', 'error');
    }
}

//  Interactive Swap Execution & Roll Odometer Animations 
function executeSwap(category, comboIndex) {
    if (!activeRecommendations || !activeRecommendations[category]) return;
    const combo = activeRecommendations[category][comboIndex];
    if (!combo.swaps || combo.swaps.length === 0) return;
    
    const swap = combo.swaps[0]; // pick first swap
    const key = `${category}_${comboIndex}`;
    
    // Toggle active swaps
    if (activeSwaps[key]) {
        // Swap back to original
        delete activeSwaps[key];
        showToast('Restored meal to original recipe.');
        renderMealRecommendations();
        return;
    }

    activeSwaps[key] = swap;
    showToast(`Swapped ${swap.original} for ${swap.replacement}! saved ₹${swap.savings} `);

    // Perform Odometer rolling animations locally
    const cardEl = document.getElementById(`card-${category}-${comboIndex}`);
    if (cardEl) {
        cardEl.classList.add('swapping-transition');
        setTimeout(() => {
            const costEl = document.getElementById(`cost-${category}-${comboIndex}`);
            const calsEl = document.getElementById(`cals-${category}-${comboIndex}`);
            const foodsEl = document.getElementById(`foods-${category}-${comboIndex}`);
            
            const originalCost = combo.totalCost;
            const newCost = Math.max(5, originalCost - swap.savings);
            
            if (costEl) costEl.textContent = `₹${Math.round(newCost)}`;
            cardEl.classList.remove('swapping-transition');
            
            // Insert visual alert
            const alertDiv = document.createElement('div');
            alertDiv.className = 'swap-alert';
            alertDiv.textContent = `Swapped to ${swap.replacement}! saved ₹${swap.savings}`;
            foodsEl.appendChild(alertDiv);
        }, 300);
    }
}

//  Log customized/swapped recommended combinations 
async function logOptimizedCombo(category, idx) {
    if (!activeRecommendations || !activeRecommendations[category] || !activeRecommendations[category][idx]) return;
    const combo = activeRecommendations[category][idx];
    
    const key = `${category}_${idx}`;
    const swap = activeSwaps[key];

    try {
        for (const item of combo.foods) {
            let logName = item.food.name;
            let logCals = item.food.calories * item.portions;
            let logProtein = item.food.protein * item.portions;

            if (swap && item.food.name.toLowerCase().includes(swap.original.toLowerCase())) {
                logName = logName.replace(new RegExp(swap.original, 'gi'), swap.replacement);
                logCals = Math.round(logCals * 0.7); // soy chunks typically less calorie-dense
            }

            await fetchAPI('/logs', {
                method: 'POST',
                body: JSON.stringify({
                    foodId: item.food._id,
                    foodName: logName,
                    calories: logCals,
                    portions: item.portions,
                    type: item.food.type
                })
            });
        }
        
        showToast(`Logged ${category} combination! `);
        refreshDashboard();
    } catch {
        showToast('Error logging combo.', 'error');
    }
}

//  Food Log Page 
async function loadFoods() {
    try {
        const res = await fetchAPI('/foods');
        if (res.ok) allFoods = await res.json();
    } catch {
        showToast('Could not load food database.', 'error');
    }
}

function getDietFoods() {
    const dt   = currentUser?.dietType || 'veg';
    const conf = DIET_CONFIG[dt];
    return allFoods.filter(f => conf.allowed.includes(f.type));
}

function populateFoodSelect() {
    const sel = document.getElementById('log-food-select');
    if (!sel) return;

    const dietFoods = getDietFoods();
    const categories = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
    
    const target = currentUser?.calorieTarget || 2000;
    const splits = { 'Breakfast': 0.25, 'Lunch': 0.35, 'Dinner': 0.30, 'Snacks': 0.10 };

    sel.innerHTML = categories.map(cat => {
        const allowance = Math.round(target * splits[cat]);
        const items = dietFoods
            .filter(f => f.category === cat && f.calories <= allowance)
            .slice(0, 20);
            
        if (!items.length) return '';
        return `<optgroup label="${cat} (Max ${allowance} kcal)">${items.map(f =>
            `<option value="${f._id}" data-cal="${f.calories}" data-name="${f.name}" data-type="${f.type}" data-protein="${f.protein}" data-carbs="${f.carbs}" data-fats="${f.fats}">${f.name} (${f.calories} kcal)</option>`
        ).join('')}</optgroup>`;
    }).join('');

    const badge = document.getElementById('log-diet-filter-badge');
    if (badge && currentUser) badge.innerHTML = getDietBadgeHTML(currentUser.dietType);

    sel.removeEventListener('change', updateFoodPreview);
    sel.addEventListener('change', updateFoodPreview);
    updateFoodPreview();
}

function updateFoodPreview() {
    const sel     = document.getElementById('log-food-select');
    const preview = document.getElementById('food-preview');
    if (!sel || !preview || !sel.options[sel.selectedIndex]) return;
    const opt      = sel.options[sel.selectedIndex];
    if (!opt.dataset.cal) { preview.classList.add('hidden'); return; }
    const portions = parseFloat(document.getElementById('log-portions').value) || 1;
    const cal      = Math.round(parseFloat(opt.dataset.cal) * portions);
    const protein  = (parseFloat(opt.dataset.protein || 0) * portions).toFixed(1);
    const carbs    = (parseFloat(opt.dataset.carbs || 0) * portions).toFixed(1);
    const fats     = (parseFloat(opt.dataset.fats || 0) * portions).toFixed(1);
    preview.classList.remove('hidden');
    preview.innerHTML = `<strong>${opt.dataset.name}</strong> × ${portions}
        <br><span style="color:var(--green-mid);font-weight:700">${cal} kcal</span>
        &nbsp;·&nbsp; P: ${protein}g &nbsp;·&nbsp; C: ${carbs}g &nbsp;·&nbsp; F: ${fats}g`;
}

function adjustPortion(delta) {
    const input = document.getElementById('log-portions');
    input.value = Math.max(0.5, parseFloat(((parseFloat(input.value) || 1) + delta).toFixed(1)));
    updateFoodPreview();
}

document.addEventListener('change', e => { if (e.target.id === 'log-portions') updateFoodPreview(); });

async function logFood() {
    const sel      = document.getElementById('log-food-select');
    const portions = parseFloat(document.getElementById('log-portions').value) || 1;
    if (!sel || !sel.options[sel.selectedIndex] || !sel.options[sel.selectedIndex].dataset.cal)
        return showToast('Please select a food item.');

    const opt      = sel.options[sel.selectedIndex];
    const calories = Math.round(parseFloat(opt.dataset.cal) * portions);

    try {
        const res = await fetchAPI('/logs', {
            method: 'POST',
            body: JSON.stringify({ foodId: sel.value, foodName: opt.dataset.name, calories, portions, type: opt.dataset.type })
        });
        if (!res.ok) return showToast((await res.json()).error || 'Error logging food.', 'error');
        todayLogs.push(await res.json());
        
        showToast(`Logged ${opt.dataset.name} `);
        refreshFoodLog();
    } catch {
        showToast('Server error logging food.', 'error');
    }
}

async function refreshFoodLog() {
    try {
        const res = await fetchAPI('/logs');
        todayLogs = res.ok ? await res.json() : [];
    } catch { todayLogs = []; }

    if (allFoods.length) populateFoodSelect();

    renderLogList();
    document.getElementById('log-total-cal').textContent =
        todayLogs.reduce((s, l) => s + (l.calories || 0), 0);
}

function renderLogList() {
    const ul = document.getElementById('food-log-ul');
    if (!ul) return;
    if (!todayLogs.length) {
        ul.innerHTML = '<li class="log-empty">No food logged yet today.</li>';
        return;
    }
    ul.innerHTML = todayLogs.map(log => `
        <li class="log-entry">
            <div class="log-entry-info">
                <div class="log-entry-name">${log.foodName}</div>
                <div class="log-entry-meta">×${log.portions} portion${log.portions !== 1 ? 's' : ''}</div>
            </div>
            <span class="log-entry-cal">${log.calories} kcal · ₹${Math.round(log.cost || 0)}</span>
            <button class="log-del-btn" onclick="deleteLog('${log._id}')" title="Remove">×</button>
        </li>`).join('');
}

async function deleteLog(id) {
    try {
        const res = await fetchAPI(`/logs/${id}`, { method: 'DELETE' });
        if (!res.ok) return showToast('Error removing entry.', 'error');
        todayLogs = todayLogs.filter(l => l._id !== id);
        renderLogList();
        
        const newTotal = todayLogs.reduce((s, l) => s + (l.calories || 0), 0);
        document.getElementById('log-total-cal').textContent = newTotal;
        showToast('Entry removed.');
    } catch {
        showToast('Error removing entry.', 'error');
    }
}

//  Diet Modal 
function openDietModal() {
    const modal = document.getElementById('diet-modal');
    modal.classList.remove('hidden');
    const current = currentUser?.dietType || 'veg';
    document.querySelectorAll('input[name="dietTypeModal"]').forEach(r => {
        r.checked = r.value === current;
        r.closest('.diet-card')?.querySelector('.diet-inner')
            ?.classList.toggle('selected-diet', r.checked);
    });
}

function closeDietModal() {
    document.getElementById('diet-modal').classList.add('hidden');
}

async function saveDietChange() {
    const selected = document.querySelector('input[name="dietTypeModal"]:checked');
    if (!selected) return showToast('Please select a diet type.');
    const newDiet = selected.value;

    if (newDiet === currentUser?.dietType) {
        closeDietModal();
        return;
    }

    try {
        const res = await fetchAPI('/user/diet', {
            method: 'PATCH',
            body: JSON.stringify({ dietType: newDiet })
        });
        if (!res.ok) return showToast('Error updating diet preference.', 'error');

        currentUser = await res.json();
        closeDietModal();

        const conf = DIET_CONFIG[newDiet];
        showToast(`Diet updated to ${conf.icon} ${conf.label}!`);

        refreshDashboard();
    } catch {
        showToast('Server error updating diet.', 'error');
    }
}

document.addEventListener('click', e => {
    if (e.target.id === 'diet-modal') closeDietModal();
});

//  Premium Analytics Charts 
async function renderProgressCharts() {
    if (!currentUser) return;

    const bmi = (currentUser.weight / Math.pow(currentUser.height / 100, 2)).toFixed(1);
    const bmiEl = document.getElementById('bstat-bmi');
    if (bmiEl) bmiEl.textContent = bmi;

    if (currentUser.createdAt) {
        const days = Math.max(1, Math.floor((Date.now() - new Date(currentUser.createdAt)) / 86400000) + 1);
        const d = document.getElementById('bstat-days');
        if (d) d.textContent = days;
    }

    // Weight history fetch
    let weightHistory = [];
    try {
        const whRes = await fetchAPI('/logs/weight/history');
        weightHistory = whRes.ok ? await whRes.json() : [];
    } catch {}

    const lastWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].weight : currentUser.weight;
    const diff = Math.abs(lastWeight - currentUser.targetWeight);
    const pct  = diff === 0 ? 100 : Math.min(100, Math.round((1 - diff / Math.max(lastWeight, currentUser.targetWeight)) * 100));
    
    document.getElementById('goal-progress-path')?.setAttribute('stroke-dasharray', `${pct}, 100`);
    const gpEl = document.getElementById('goal-percent-text');
    if (gpEl) gpEl.textContent = pct + '%';
    const etaEl = document.getElementById('goal-eta-text');
    if (etaEl) etaEl.textContent = diff === 0 ? 'Goal reached! ' : `~${Math.ceil(diff / 0.5)} weeks to reach goal`;

    // 1. Calorie History Chart (API Backed)
    const barCtx = document.getElementById('calorieBarChart');
    if (barCtx) {
        if (barChart) { barChart.destroy(); barChart = null; }
        
        let historyData = {};
        try {
            const histRes = await fetchAPI('/logs/history?days=7');
            historyData = histRes.ok ? await histRes.json() : {};
        } catch {}

        const labels  = [];
        const calData = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const labelKey = `${d.getDate()}/${d.getMonth() + 1}`;
            
            labels.push(labelKey);
            calData.push(historyData[key]?.calories || 0);
        }

        const t = currentUser.calorieTarget || 2000;
        barChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Calories', data: calData, backgroundColor: calData.map(v => v === 0 ? '#EDE5D4' : v > t ? '#C4694A' : '#6AAF8B'), borderRadius: 6, borderSkipped: false },
                    { label: 'Target', data: labels.map(() => t), type: 'line', borderColor: '#E8A44A', borderWidth: 2, borderDash: [5,4], pointRadius: 0, fill: false }
                ]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: '#EDE5D4' }, beginAtZero: true }
                }
            }
        });
    }

    // 2. Weight Trend Chart (API Backed)
    const lineCtx = document.getElementById('weightLineChart');
    if (lineCtx) {
        if (lineChart) { lineChart.destroy(); lineChart = null; }
        
        if (weightHistory.length < 2) {
            showChartEmpty(lineCtx, `Starting weight (${currentUser.weight} kg) recorded. Log your weight daily to see your progress.`);
            injectWeightLogBtn(lineCtx);
        } else {
            hideChartEmpty(lineCtx);
            removeWeightLogBtn(lineCtx);

            const weightLabels = weightHistory.map(wh => {
                const d = new Date(wh.date);
                return `${d.getDate()}/${d.getMonth()+1}`;
            });
            const weights = weightHistory.map(wh => wh.weight);

            lineChart = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: weightLabels,
                    datasets: [
                        { label: 'Weight (kg)', data: weights, borderColor: '#3D6B5A', backgroundColor: 'rgba(61,107,90,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#3D6B5A' },
                        { label: 'Target', data: weightLabels.map(() => currentUser.targetWeight), borderColor: '#E8A44A', borderWidth: 2, borderDash: [5,4], pointRadius: 0, fill: false }
                    ]
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false } },
                        y: { grid: { color: '#EDE5D4' } }
                    }
                }
            });
        }
    }

    // 3. Spending & Calories Dual Axis Trend Chart [NEW]
    const spendingCtx = document.getElementById('spendingTrendChart');
    if (spendingCtx) {
        if (spendingChart) { spendingChart.destroy(); spendingChart = null; }
        
        let historyData = {};
        try {
            const histRes = await fetchAPI('/logs/history?days=7');
            historyData = histRes.ok ? await histRes.json() : {};
        } catch {}

        const labels  = [];
        const calData = [];
        const spendData = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const labelKey = `${d.getDate()}/${d.getMonth() + 1}`;
            
            labels.push(labelKey);
            calData.push(historyData[key]?.calories || 0);
            spendData.push(historyData[key]?.cost || 0);
        }

        spendingChart = new Chart(spendingCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Spent (₹)', data: spendData, borderColor: '#E8A44A', backgroundColor: 'rgba(232,164,74,0.06)', fill: true, tension: 0.3, yAxisID: 'ySpent', pointRadius: 3 },
                    { label: 'Calories (kcal)', data: calData, borderColor: '#6AAF8B', borderDash: [4,4], fill: false, tension: 0.3, yAxisID: 'yCal', pointRadius: 0 }
                ]
            },
            options: {
                scales: {
                    ySpent: { type: 'linear', position: 'left', title: { display: true, text: 'Spent (₹)' }, grid: { color: '#EDE5D4' } },
                    yCal: { type: 'linear', position: 'right', title: { display: true, text: 'Calories (kcal)' }, grid: { display: false } }
                }
            }
        });
    }

    // 4. Nutritional ROI (Protein per Rupee) Chart [NEW]
    const roiCtx = document.getElementById('roiBarChart');
    if (roiCtx) {
        if (roiChart) { roiChart.destroy(); roiChart = null; }

        // Compile Protein Density per Rupee of common items
        const rawItems = [
            { name: 'Soy Chunks', val: 0.50 / 0.10 }, // 0.5g/₹0.10 = 5.0g per ₹
            { name: 'Sprouts', val: 0.20 / 0.08 },    // 2.5g per ₹
            { name: 'Eggs', val: 6.0 / 6.5 },         // 0.9g per ₹
            { name: 'Paneer', val: 0.18 / 0.35 },     // 0.5g per ₹
            { name: 'Chicken', val: 0.25 / 0.24 },    // 1.0g per ₹
            { name: 'Almonds', val: 0.20 / 1.00 }     // 0.2g per ₹
        ];

        roiChart = new Chart(roiCtx, {
            type: 'bar',
            data: {
                labels: rawItems.map(item => item.name),
                datasets: [{
                    label: 'Protein per Rupee (g/₹)',
                    data: rawItems.map(item => item.val),
                    backgroundColor: rawItems.map((v, i) => i === 0 ? '#3D6B5A' : i === 1 ? '#6AAF8B' : '#E8A44A'),
                    borderRadius: 6
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: '#EDE5D4' }, beginAtZero: true, title: { display: true, text: 'grams per ₹' } }
                }
            }
        });
    }
}

function showChartEmpty(canvas, msg) {
    canvas.style.display = 'none';
    const wrap = canvas.parentElement;
    let el = wrap.querySelector('.chart-empty');
    if (!el) {
        el = document.createElement('p');
        el.className = 'chart-empty';
        el.style.cssText = 'text-align:center;color:var(--text-muted);font-size:.875rem;padding:3rem 1rem;line-height:1.6;';
        wrap.appendChild(el);
    }
    el.textContent = msg;
}

function hideChartEmpty(canvas) {
    canvas.style.display = '';
    canvas.parentElement.querySelector('.chart-empty')?.remove();
}

function injectWeightLogBtn(canvas) {
    const wrap = canvas.parentElement;
    if (!wrap.querySelector('.weight-log-btn')) {
        const btn = document.createElement('button');
        btn.className = 'btn-primary weight-log-btn';
        btn.style.cssText = 'margin:.75rem auto 0;display:block;font-size:.8rem;padding:.5rem 1.25rem;';
        btn.textContent = ' Log Today\'s Weight';
        btn.onclick = logWeight;
        wrap.appendChild(btn);
    }
}

function removeWeightLogBtn(canvas) {
    canvas.parentElement.querySelector('.weight-log-btn')?.remove();
}

async function logWeight() {
    const val = parseFloat(prompt('Enter your current weight (kg):'));
    if (!val || val < 10 || val > 500) return showToast('Invalid weight entered.', 'error');
    
    try {
        const res = await fetchAPI('/logs/weight', {
            method: 'POST',
            body: JSON.stringify({ weight: val })
        });
        if (res.ok) {
            currentUser.weight = val;
            showToast(`Weight ${val} kg logged successfully! `);
            renderProgressCharts();
            if (document.getElementById('dashboard-section').classList.contains('active')) refreshDashboard();
        }
    } catch {
        showToast('Error logging weight.', 'error');
    }
}

//  Recipe Generator 
const RECIPE_DB = [
    { name: "Masoor Dal",              diet: "vegan",  category: "Dinner",    cal: 190, time: "20 min", ingredients: ["masoor","lentil","red lentil","garlic","tomato"],           steps: "Pressure cook masoor dal 2 whistles. Tadka: ghee, cumin, garlic, dry red chilli, chopped tomato. Mix into dal.", tags: ["Vegan","Budget-Friendly"] },
    { name: "Rajma Chawal",            diet: "vegan",  category: "Lunch",     cal: 430, time: "40 min", ingredients: ["rajma","kidney beans","rice","tomato","onion"],              steps: "Soak rajma overnight, pressure cook. Make tomato-onion masala. Combine, simmer 10 min. Serve with rice.", tags: ["Vegan","High Protein"] },
    { name: "Veggie Upma",             diet: "vegan",  category: "Breakfast", cal: 200, time: "15 min", ingredients: ["semolina","rava","onion","carrot","peas"],                  steps: "Dry roast semolina. Sauté mustard seeds, curry leaves, onions, veg. Add water, stir in semolina. Cook 5 min.", tags: ["Vegan","Budget-Friendly"] },
    { name: "Moong Dal Chilla",        diet: "vegan",  category: "Breakfast", cal: 195, time: "20 min", ingredients: ["moong","moong dal","onion","coriander","chilli"],            steps: "Soak moong 2h, grind to batter. Add onion, chilli, coriander. Spread thin crepes, cook each side 2-3 min.", tags: ["Vegan","High Protein"] },
    { name: "Oats Poha",               diet: "vegan",  category: "Breakfast", cal: 210, time: "15 min", ingredients: ["oats","onion","peanut","peas"],                             steps: "Dry roast oats 3 min. Sauté mustard, curry leaves, onions. Add oats, peas, peanuts. Season with lemon.", tags: ["Vegan","High Fibre"] },
    { name: "Roasted Chana",           diet: "vegan",  category: "Snacks",    cal: 120, time: "5 min",  ingredients: ["chana","chickpea","gram"],                                  steps: "Toss chickpeas with oil, chaat masala, salt. Roast at 200°C 25 min until crispy.", tags: ["Vegan","High Protein"] },
    { name: "Sprout Chaat",            diet: "vegan",  category: "Snacks",    cal: 110, time: "10 min", ingredients: ["sprout","moong sprout","tomato","onion","lemon"],            steps: "Mix sprouts with onion, tomato, coriander, chaat masala, lemon juice. Serve fresh.", tags: ["Vegan","High Protein"] },
    { name: "Baingan Bharta + Roti",   diet: "vegan",  category: "Dinner",    cal: 220, time: "30 min", ingredients: ["brinjal","baingan","eggplant","onion","tomato"],             steps: "Roast brinjal on flame, peel. Sauté onion, tomato, garlic with spices. Mix in brinjal, cook 5 min.", tags: ["Vegan","Low Calorie"] },
    { name: "Mixed Veg Khichdi",       diet: "vegan",  category: "Lunch",     cal: 285, time: "25 min", ingredients: ["rice","dal","moong","carrot","peas","potato"],               steps: "Pressure cook rice, moong dal, veg with turmeric. Add ghee-cumin tadka. Easy one-pot meal.", tags: ["Vegan","Easy Digest"] },
    { name: "Soya Chunks Curry",       diet: "vegan",  category: "Lunch",     cal: 168, time: "20 min", ingredients: ["soya","soya chunks","onion","tomato"],                       steps: "Soak soya chunks. Make onion-tomato masala with spices. Add chunks, simmer 10 min.", tags: ["Vegan","High Protein"] },
    { name: "Besan Cheela",            diet: "vegan",  category: "Breakfast", cal: 170, time: "15 min", ingredients: ["besan","gram flour","onion","tomato","spinach"],             steps: "Mix besan with water to batter. Add chopped veg, salt, cumin. Cook thin pancakes 2 min each side.", tags: ["Vegan","High Protein"] },
    { name: "Banana Smoothie",         diet: "vegan",  category: "Breakfast", cal: 180, time: "5 min",  ingredients: ["banana","oats","almond milk"],                              steps: "Blend banana, oats, almond milk until smooth. Add date syrup if desired.", tags: ["Vegan","Quick"] },
    { name: "Dal Rice",                diet: "vegan",  category: "Lunch",     cal: 380, time: "30 min", ingredients: ["dal","lentil","rice","onion","tomato","garlic"],             steps: "Pressure cook dal with turmeric. Tadka with ghee, cumin, onion, garlic, tomato. Serve with steamed rice.", tags: ["Vegan","Complete Protein"] },
    { name: "Mushroom Matar",          diet: "vegan",  category: "Dinner",    cal: 180, time: "20 min", ingredients: ["mushroom","peas","matar","onion","tomato"],                  steps: "Sauté mushrooms until golden. Cook onion-tomato masala, add peas, add mushrooms back.", tags: ["Vegan","Low Calorie"] },
    { name: "Peanut Ladoo",            diet: "vegan",  category: "Snacks",    cal: 148, time: "15 min", ingredients: ["peanut","groundnut","jaggery","gur","cardamom"],             steps: "Roast peanuts, crush. Melt jaggery, mix in peanuts and cardamom. Shape into balls while warm.", tags: ["Vegan","Energy Boost"] },

    // VEGETARIAN
    { name: "Paneer Tikka",            diet: "veg",    category: "Snacks",    cal: 275, time: "30 min", ingredients: ["paneer","yogurt","curd","capsicum","onion"],                 steps: "Marinate paneer in spiced yogurt 30 min. Grill or tawa-cook until charred. Serve with mint chutney.", tags: ["Vegetarian","High Protein"] },
    { name: "Palak Paneer + Roti",     diet: "veg",    category: "Lunch",     cal: 380, time: "25 min", ingredients: ["spinach","palak","paneer","tomato","onion"],                 steps: "Blanch spinach, blend. Sauté masala, add purée, paneer. Simmer 5 min. Finish with cream.", tags: ["Vegetarian","High Protein"] },
    { name: "Aloo Paratha",            diet: "veg",    category: "Breakfast", cal: 260, time: "25 min", ingredients: ["potato","aloo","wheat","atta","butter","ghee"],              steps: "Mash spiced potato filling. Stuff into dough ball, roll flat. Cook on tawa with butter.", tags: ["Vegetarian","Student-Friendly"] },
    { name: "Dosa with Chutney",       diet: "veg",    category: "Breakfast", cal: 235, time: "20 min", ingredients: ["dosa","rice","urad dal","coconut","chutney"],                steps: "Pour fermented batter on hot tawa, spread thin. Cook until crisp. Serve with coconut chutney.", tags: ["Vegetarian","Fermented"] },
    { name: "Greek Yogurt Parfait",    diet: "veg",    category: "Breakfast", cal: 220, time: "5 min",  ingredients: ["yogurt","curd","oats","banana","honey"],                     steps: "Layer Greek yogurt, rolled oats, sliced banana. Drizzle honey. Add nuts.", tags: ["Vegetarian","Quick"] },
    { name: "Paneer Bhurji + Roti",    diet: "veg",    category: "Dinner",    cal: 360, time: "15 min", ingredients: ["paneer","onion","tomato","capsicum"],                        steps: "Crumble paneer. Sauté onion, capsicum, tomato with spices. Add paneer, stir 3 min.", tags: ["Vegetarian","Quick"] },
    { name: "Dal Makhani + Rice",      diet: "veg",    category: "Dinner",    cal: 400, time: "40 min", ingredients: ["urad dal","dal","rajma","butter","cream","tomato"],          steps: "Soak dal overnight, pressure cook. Slow simmer with butter, tomato, cream 20 min.", tags: ["Vegetarian","Rich"] },
    { name: "Methi Thepla",            diet: "veg",    category: "Lunch",     cal: 240, time: "30 min", ingredients: ["fenugreek","methi","wheat flour","yogurt","curd"],           steps: "Mix fresh methi into wheat flour with yogurt and spices. Roll thin, cook on tawa.", tags: ["Vegetarian","High Fibre"] },
    { name: "Idli with Sambar",        diet: "veg",    category: "Breakfast", cal: 225, time: "20 min", ingredients: ["idli","semolina","rava","sambar","dal"],                     steps: "Steam idli batter in moulds 10-12 min. Serve hot with sambar and coconut chutney.", tags: ["Vegetarian","Fermented"] },
    { name: "Curd with Honey",         diet: "veg",    category: "Snacks",    cal: 110, time: "2 min",  ingredients: ["curd","yogurt","dahi","honey","banana"],                     steps: "Whisk curd smooth. Top with honey and sliced banana. Add cardamom if desired.", tags: ["Vegetarian","Probiotic"] },
    { name: "Makhana (Fox Nuts)",      diet: "veg",    category: "Snacks",    cal: 100, time: "10 min", ingredients: ["makhana","fox nuts","lotus seeds","ghee"],                   steps: "Heat ghee in pan, add makhana. Roast low flame 8-10 min until crunchy. Season with salt.", tags: ["Vegetarian","Low Calorie"] },
    { name: "Masala Buttermilk",       diet: "veg",    category: "Snacks",    cal: 45,  time: "3 min",  ingredients: ["buttermilk","chaas","curd","yogurt","cumin","ginger"],       steps: "Blend curd with water, salt, cumin, ginger, coriander. Refreshing probiotic drink.", tags: ["Vegetarian","Probiotic"] },
    { name: "Cheese Omelette",         diet: "veg",    category: "Breakfast", cal: 210, time: "8 min",  ingredients: ["egg","eggs","cheese","onion","capsicum"],                    steps: "Beat eggs with salt. Cook omelette with onion and capsicum. Add cheese, fold and serve.", tags: ["Vegetarian","High Protein"] },

    // NON-VEG
    { name: "Masala Scrambled Eggs",   diet: "nonveg", category: "Breakfast", cal: 220, time: "10 min", ingredients: ["egg","eggs","onion","tomato","chilli"],                      steps: "Beat eggs with salt. Sauté onion, tomato, chilli. Pour in eggs, stir gently on low heat.", tags: ["Non-Veg","Quick","High Protein"] },
    { name: "Egg Curry + Rice",        diet: "nonveg", category: "Lunch",     cal: 410, time: "25 min", ingredients: ["egg","eggs","onion","tomato","coconut milk"],                steps: "Hard-boil eggs. Make tomato-coconut gravy with spices. Add halved eggs, simmer 10 min.", tags: ["Non-Veg","High Protein"] },
    { name: "Chicken Biryani",         diet: "nonveg", category: "Lunch",     cal: 550, time: "60 min", ingredients: ["chicken","rice","basmati","onion","yogurt","curd"],          steps: "Marinate chicken in spiced yogurt. Caramelise onion. Layer par-cooked rice and chicken. Dum cook 20 min.", tags: ["Non-Veg","High Protein"] },
    { name: "Grilled Chicken Breast",  diet: "nonveg", category: "Dinner",    cal: 165, time: "20 min", ingredients: ["chicken","lemon","garlic","herbs"],                          steps: "Marinate chicken with lemon, garlic, herbs. Grill on high heat 6 min per side. Rest before slicing.", tags: ["Non-Veg","Low Calorie","High Protein"] },
    { name: "Chicken Stir Fry",        diet: "nonveg", category: "Dinner",    cal: 270, time: "20 min", ingredients: ["chicken","capsicum","pepper","onion","garlic","soy sauce"],  steps: "Slice chicken thin, marinate in soy sauce. Stir fry on high heat with veg until cooked.", tags: ["Non-Veg","High Protein"] },
    { name: "Egg Omelette + Salad",    diet: "nonveg", category: "Dinner",    cal: 200, time: "10 min", ingredients: ["egg","eggs","tomato","onion","capsicum","lettuce"],           steps: "Cook folded omelette with onion and capsicum. Serve with fresh tomato-lettuce salad.", tags: ["Non-Veg","Quick","Low Carb"] },
    { name: "Fish Curry + Rice",       diet: "nonveg", category: "Dinner",    cal: 410, time: "30 min", ingredients: ["fish","pomfret","rawas","rohu","tomato","coconut"],           steps: "Marinate fish. Make coconut-tomato gravy with spices. Cook fish gently in gravy. Serve with rice.", tags: ["Non-Veg","High Protein","Omega-3"] },
    { name: "Chicken Curry",           diet: "nonveg", category: "Lunch",     cal: 490, time: "35 min", ingredients: ["chicken","onion","tomato","yogurt","curd","garam masala"],   steps: "Brown chicken. Make onion-tomato-yogurt masala. Combine, pressure cook 2 whistles. Garnish with coriander.", tags: ["Non-Veg","High Protein"] },
    { name: "Boiled Egg Chaat",        diet: "nonveg", category: "Snacks",    cal: 155, time: "8 min",  ingredients: ["egg","eggs","onion","tomato","chaat masala","lemon"],        steps: "Halve boiled eggs. Top with onion, tomato, chaat masala, lemon juice. Quick high-protein snack.", tags: ["Non-Veg","High Protein","Quick"] },
    { name: "Chicken Soup",            diet: "nonveg", category: "Dinner",    cal: 150, time: "30 min", ingredients: ["chicken","carrot","celery","onion","garlic","pepper"],       steps: "Simmer chicken with vegetables and spices 25 min. Shred chicken back into broth. Light and nourishing.", tags: ["Non-Veg","Low Calorie","Comforting"] },
    { name: "Fish Fry",                diet: "nonveg", category: "Lunch",     cal: 290, time: "20 min", ingredients: ["fish","lemon","turmeric","chilli","oil"],              steps: "Marinate fish slices in lemon, turmeric, and chilli powder. Shallow fry until crispy.", tags: ["Non-Veg","High Protein","Omega-3"] },
    { name: "Mutton Biryani",          diet: "nonveg", category: "Dinner",    cal: 600, time: "90 min", ingredients: ["mutton","rice","basmati","onion","yogurt","spices"],   steps: "Layer marinated semi-cooked mutton and par-boiled rice. Dum cook for 45 mins.", tags: ["Non-Veg","High Protein","Special"] }
];

let activeRecipeFilter = 'all';

function setupRecipeDietFilter() {
    document.querySelectorAll('.rdiet-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.rdiet-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeRecipeFilter = btn.dataset.filter;
            const input = document.getElementById('recipe-ingredients').value.trim();
            if (input) generateRecipe();
        });
    });
}

function getCompatibleRecipes() {
    const dt   = currentUser?.dietType || 'veg';
    const conf = DIET_CONFIG[dt];
    const dietMap = { 'vegetarian': 'veg', 'vegan': 'vegan', 'non-vegetarian': 'nonveg' };
    const allowedDiets = conf.allowed.map(t => dietMap[t]);
    return RECIPE_DB.filter(r => allowedDiets.includes(r.diet));
}

async function generateRecipe() {
    const input = document.getElementById('recipe-ingredients').value.trim();
    if (!input) return showToast('Please enter some ingredients.');

    const container = document.getElementById('recipe-results');
    container.innerHTML = '<p style="color:var(--text-muted);margin-top:1rem;text-align:center">Searching recipes…</p>';

    const ingredients = input.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    await new Promise(r => setTimeout(r, 200));

    let pool = getCompatibleRecipes();
    if (activeRecipeFilter !== 'all') {
        pool = RECIPE_DB.filter(r => r.diet === activeRecipeFilter);
    }

    const scored = pool.map(recipe => {
        const matches = ingredients.filter(ing =>
            recipe.ingredients.some(ri => ri.includes(ing) || ing.includes(ri))
        );
        return { recipe, score: matches.length };
    }).filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 9);

    const dietConf = DIET_CONFIG[currentUser?.dietType || 'veg'];

    if (!scored.length) {
        const hint = activeRecipeFilter === 'all'
            ? `No ${dietConf.label} recipes matched. Try: eggs, chicken, paneer, rice, dal, spinach, oats…`
            : 'No matches for that filter. Try different ingredients.';
        container.innerHTML = `<div class="recipe-card" style="grid-column:1/-1"><h3>No matching recipes</h3><p>${hint}</p></div>`;
        return;
    }

    const dietIcons = { veg: '🥦', vegan: '', nonveg: '' };
    const dietLabels = { veg: 'Vegetarian', vegan: 'Vegan', nonveg: 'Non-Veg' };
    const dietBadgeCls = { veg: 'badge-veg', vegan: 'badge-vegan', nonveg: 'badge-non-veg' };

    container.innerHTML = scored.map(({ recipe: r, score }) => `
        <div class="recipe-card">
            <div class="recipe-card-top">
                <h3>${r.name}</h3>
                <span class="recipe-match">${score} match${score > 1 ? 'es' : ''}</span>
            </div>
            <p>${r.steps}</p>
            <div class="recipe-tags">
                <span class="recipe-tag ${dietBadgeCls[r.diet]}">${dietIcons[r.diet]} ${dietLabels[r.diet]}</span>
                <span class="recipe-tag tag-amber">⏱ ${r.time}</span>
                <span class="recipe-tag tag-rust"> ${r.cal} kcal</span>
                ${r.tags.map(t => `<span class="recipe-tag">${t}</span>`).join('')}
            </div>
        </div>`).join('');
}

//  Chatbot (Secure Server-Side & History Load) 
async function setupChat() {
    document.getElementById('chatbot-toggle').addEventListener('click', async () => {
        const panel = document.getElementById('chat-panel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            // Retrieve previous chat transcripts on opening
            await loadChatHistory();
        }
    });
    
    document.getElementById('chat-close').addEventListener('click', () =>
        document.getElementById('chat-panel').classList.add('hidden'));
    
    document.getElementById('chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleChatSubmit();
    });
}

async function loadChatHistory() {
    const body = document.getElementById('chat-body');
    body.innerHTML = '<div class="msg bot-msg">Loading chat history...</div>';
    
    try {
        const res = await fetchAPI('/chat/history');
        if (res.ok) {
            const history = await res.json();
            body.innerHTML = '';
            
            if (history.length === 0) {
                body.innerHTML = '<div class="msg bot-msg">Hi! I\'m NutriBot  Ask me anything about nutrition, calories, or healthy habits!</div>';
            } else {
                history.forEach(chat => {
                    appendMsg(chat.message, chat.role);
                });
            }
        }
    } catch {
        body.innerHTML = '<div class="msg bot-msg">Could not load history. Hi! I\'m NutriBot </div>';
    }
}

async function handleChatSubmit() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    sendChat(msg);
}

async function sendChat(message) {
    appendMsg(message, 'user');
    document.getElementById('typing-indicator').classList.remove('hidden');
    document.querySelector('.quick-chips')?.remove();

    try {
        const res = await fetchAPI('/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });
        
        document.getElementById('typing-indicator').classList.add('hidden');
        if (res.ok) {
            const data = await res.json();
            appendMsg(data.botResponse.message, 'bot');
        } else {
            appendMsg("Sorry, I experienced a minor network interruption. Let's try again! ", 'bot');
        }
    } catch {
        document.getElementById('typing-indicator').classList.add('hidden');
        appendMsg("I'm having trouble connecting to the backend. Please ensure the server is active.", 'bot');
    }
}

function appendMsg(text, role) {
    const body = document.getElementById('chat-body');
    const div = document.createElement('div');
    div.className = `msg ${role === 'bot' || role === 'system' ? 'bot-msg' : 'user-msg'}`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

//  Toast Notifications 
function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast${type === 'error' ? ' error' : ''}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3500);
}
