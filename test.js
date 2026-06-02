const BASE_URL = 'http://localhost:5000/api';

let passed = 0;
let failed = 0;
let token = null;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

// 1. Test Auth Signup
async function testAuthSignup() {
    console.log('\n📋 Test: POST /auth/signup — Create a secure user profile');
    try {
        const res = await fetch(`${BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Arjun Sharma",
                email: "arjun@nutrisetu.com",
                password: "securepassword123",
                age: 26,
                gender: "male",
                height: 178,
                weight: 74,
                targetWeight: 70,
                activityLevel: "moderately",
                goal: "loss",
                dietType: "veg",
                budgetTarget: 300
            })
        });

        assert(res.status === 201, `Status should be 201, got ${res.status}`);
        const body = await res.json();
        assert(body.token !== undefined, 'Token should be returned');
        assert(body.user.email === 'arjun@nutrisetu.com', 'Email should match');
        assert(body.user.budgetTarget === 300, 'Budget target should be 300');
        token = body.token; // save for protected routes
    } catch (err) {
        console.error('Signup test failed:', err.message);
        failed++;
    }
}

// 2. Test Auth Login
async function testAuthLogin() {
    console.log('\n📋 Test: POST /auth/login — Authenticate secure user');
    try {
        const res = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: "arjun@nutrisetu.com",
                password: "securepassword123"
            })
        });

        assert(res.status === 200, `Status should be 200, got ${res.status}`);
        const body = await res.json();
        assert(body.token !== undefined, 'Token should be returned');
        assert(body.user.name === 'Arjun Sharma', 'Name should match');
    } catch (err) {
        console.error('Login test failed:', err.message);
        failed++;
    }
}

// 3. Test Auth Me (Get user details)
async function testAuthMe() {
    console.log('\n📋 Test: GET /auth/me — Fetch profile using JWT');
    try {
        const res = await fetch(`${BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        assert(res.status === 200, `Status should be 200, got ${res.status}`);
        const body = await res.json();
        assert(body.email === 'arjun@nutrisetu.com', 'Profile details should be valid');
        assert(body.calorieTarget > 1500, `Calorie target calculated correctly: ${body.calorieTarget}`);
    } catch (err) {
        console.error('Get profile test failed:', err.message);
        failed++;
    }
}

// 4. Test Update Budget
async function testUpdateBudget() {
    console.log('\n📋 Test: PATCH /user/budget — Change budget target');
    try {
        const res = await fetch(`${BASE_URL}/user/budget`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ budgetTarget: 400 })
        });

        assert(res.status === 200, `Status should be 200, got ${res.status}`);
        const body = await res.json();
        assert(body.budgetTarget === 400, `Budget target updated: ${body.budgetTarget}`);
    } catch (err) {
        console.error('Update budget test failed:', err.message);
        failed++;
    }
}

// 5. Test Food List Retrieval
async function testGetFoods() {
    console.log('\n📋 Test: GET /foods — Retrieve food database');
    try {
        const res = await fetch(`${BASE_URL}/foods`);
        assert(res.status === 200, `Status should be 200, got ${res.status}`);
        const body = await res.json();
        assert(Array.isArray(body), 'Response should be an array');
        assert(body.length > 0, `Should contain items, got ${body.length}`);
    } catch (err) {
        console.error('Get foods test failed:', err.message);
        failed++;
    }
}

// 6. Test Logging Food
async function testLogFood() {
    console.log('\n📋 Test: POST /logs — Log a food item with dynamic cost calculation');
    try {
        // Find a seeded food first
        const foodsRes = await fetch(`${BASE_URL}/foods`);
        const foods = await foodsRes.json();
        const paneerFood = foods.find(f => f.name.toLowerCase().includes('paneer') || f.ingredients.length > 0) || foods[0];

        const res = await fetch(`${BASE_URL}/logs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                foodId: paneerFood._id,
                foodName: paneerFood.name,
                calories: paneerFood.calories,
                portions: 2,
                type: paneerFood.type
            })
        });

        assert(res.status === 201, `Status should be 201, got ${res.status}`);
        const body = await res.json();
        assert(body.foodName === paneerFood.name, 'Logged food name should match');
        assert(body.portions === 2, 'Portions should match');
        assert(body.cost > 0, `Dynamic cost calculation works: ₹${body.cost}`);
    } catch (err) {
        console.error('Log food test failed:', err.message);
        failed++;
    }
}

// 7. Test Meal Optimization recommendations
async function testMealRecommendations() {
    console.log('\n📋 Test: GET /meals/recommendations — Constraint-based meal optimizer');
    try {
        const res = await fetch(`${BASE_URL}/meals/recommendations?mode=normal`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        assert(res.status === 200, `Status should be 200, got ${res.status}`);
        const body = await res.json();
        assert(body.Breakfast !== undefined, 'Should generate breakfast combos');
        assert(body.Lunch !== undefined, 'Should generate lunch combos');
        assert(body.Breakfast[0]?.foods !== undefined, 'Meal should contain list of foods');
        assert(body.Breakfast[0]?.totalCost > 0, `Standard combo cost works: ₹${body.Breakfast[0]?.totalCost}`);
    } catch (err) {
        console.error('Meal recommendation test failed:', err.message);
        failed++;
    }
}

// 8. Test Logging Weight
async function testLogWeight() {
    console.log('\n📋 Test: POST /logs/weight — Progress weight history');
    try {
        const res = await fetch(`${BASE_URL}/logs/weight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ weight: 73.5 })
        });

        assert(res.status === 201, `Status should be 201, got ${res.status}`);
        const body = await res.json();
        assert(body.weight === 73.5, 'Logged weight should match');
    } catch (err) {
        console.error('Weight log test failed:', err.message);
        failed++;
    }
}

// 9. Test Budget History
async function testBudgetHistory() {
    console.log('\n📋 Test: GET /user/budget/history — Visual budget progression');
    try {
        const res = await fetch(`${BASE_URL}/user/budget/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        assert(res.status === 200, `Status should be 200, got ${res.status}`);
        const body = await res.json();
        assert(Array.isArray(body), 'Response should be an array');
        assert(body.length > 0, `Should contain budget log, got ${body.length}`);
    } catch (err) {
        console.error('Budget history test failed:', err.message);
        failed++;
    }
}

// 10. Test Wiping Profile
async function testWipeProfile() {
    console.log('\n📋 Test: DELETE /user — Wipe entire profile');
    try {
        const res = await fetch(`${BASE_URL}/user`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        assert(res.status === 200, `Status should be 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, 'Profile reset success should be true');

        // Confirm database wipe by attempting to query profile
        const checkRes = await fetch(`${BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        assert(checkRes.status === 401, 'Should 401 on wiped profile check');
    } catch (err) {
        console.error('Profile wipe test failed:', err.message);
        failed++;
    }
}

async function runAll() {
    console.log('🚀 NutriSetu Multi-User Integration Tests\n' + '='.repeat(40));
    try {
        await testAuthSignup();
        if (token) {
            await testAuthLogin();
            await testAuthMe();
            await testUpdateBudget();
            await testGetFoods();
            await testLogFood();
            await testMealRecommendations();
            await testLogWeight();
            await testBudgetHistory();
            await testWipeProfile();
        } else {
            console.error('❌ Skipping remaining tests: Registration failed to issue token.');
            failed++;
        }
    } catch (e) {
        console.error('\n💥 Unexpected error during integration run:', e.message);
        failed++;
    }

    console.log('\n' + '='.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAll();
