const API_URL = '/api';
console.log("App v10 Loaded"); // Debug version
let State = {
    user: JSON.parse(localStorage.getItem('user')),
    token: localStorage.getItem('token'),
    currentGroup: null,
    groups: [],
    expenses: [],
    hasFetchedGroups: false // Prevent infinite loop
};

// --- API Helpers ---
const apiCall = async (endpoint, method = 'GET', body = null) => {
    const headers = { 'Content-Type': 'application/json' };
    // Bearer token logic if needed

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const res = await fetch(API_URL + endpoint, config);
        if (res.status === 401) logout();
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || 'Request failed');
        }
        return res.json();
    } catch (error) {
        console.error("API Error at " + endpoint, error);
        alert("System Error: " + error.message);
        throw error;
    }
};

// --- Auth Actions ---
const login = async (username, password) => {
    const data = await apiCall('/login', 'POST', { username, password });
    if (data.access_token) {
        State.user = { id: data.user_id, username: data.username };
        State.token = data.access_token;
        localStorage.setItem('user', JSON.stringify(State.user));
        localStorage.setItem('token', State.token);
        render();
    } else {
        alert(data.detail || 'Login failed');
    }
};

const register = async (username, password) => {
    console.log("Registering:", username);
    try {
        const data = await apiCall('/register', 'POST', { username, password });
        if (data.message) {
            alert('Registration successful! Please login.');
            render('login');
        }
    } catch (e) {
        // Error already alerted in apiCall
        console.error("Registration failed flow", e);
    }
};

const logout = () => {
    State.user = null;
    State.token = null;
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    render('login');
};

// --- Data Actions ---
const fetchGroups = async () => {
    if (!State.user) return;
    try {
        const groups = await apiCall(`/groups/${State.user.id}`);
        State.groups = Array.isArray(groups) ? groups : [];
    } catch (e) {
        console.error("Failed to fetch groups", e);
        State.groups = [];
    } finally {
        State.hasFetchedGroups = true; // Mark as fetched regardless of success
        render();
    }
};

const createGroup = async (name) => {
    await apiCall(`/groups?user_id=${State.user.id}`, 'POST', { name });
    fetchGroups();
};

const joinGroup = async (code) => {
    const res = await apiCall(`/groups/join?code=${code}&user_id=${State.user.id}`, 'POST');
    if (res.message === "Joined group successfully") {
        fetchGroups();
    } else {
        alert(res.detail || res.message);
    }
};

const fetchExpenses = async (groupId) => {
    State.expenses = await apiCall(`/group/${groupId}/expenses`);
    render(); // Re-render to show expenses
};

const addExpense = async (amount, category, description) => {
    await apiCall('/expenses', 'POST', {
        amount: parseFloat(amount),
        category,
        description,
        group_id: State.currentGroup.id,
        paid_by_id: State.user.id
    });
    fetchExpenses(State.currentGroup.id);
};

// --- Router / Renderer ---
const app = document.getElementById('app');

const render = (view = null) => {
    try {
        app.innerHTML = '';

        if (!State.user) {
            if (view === 'register') renderRegister();
            else renderLogin();
            return;
        }

        if (State.currentGroup) {
            renderGroupDetails();
        } else {
            renderDashboard();
            renderDashboard();
            // Fetch groups if empty is now handled by init() or explict actions
        }
    } catch (err) {
        console.error("Render Error:", err);
        app.innerHTML = `<div class="p-8 text-center text-red-600">
            <h2 class="text-xl font-bold">Something went wrong</h2>
            <pre class="text-xs mt-2 text-left bg-gray-100 p-2 overflow-auto">${err.message}</pre>
            <button onclick="logout()" class="mt-4 bg-gray-200 px-4 py-2 rounded">Logout & Reset</button>
        </div>`;
    }
};

// --- Views ---
const renderLogin = () => {
    app.innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-gray-100 fade-in">
            <div class="bg-white p-8 rounded shadow-md w-full max-w-md">
                <h2 className="text-2xl font-bold mb-6 text-center text-indigo-600">Login</h2>
                <h1 class="text-3xl font-bold text-center text-indigo-600 mb-6">Expense Tracker</h1>
                <form onsubmit="event.preventDefault(); login(this.username.value, this.password.value)">
                    <input type="text" name="username" placeholder="Username" class="w-full mb-4 p-2 border rounded" required>
                    <input type="password" name="password" placeholder="Password" class="w-full mb-6 p-2 border rounded" required>
                    <button type="submit" class="w-full bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700">Login</button>
                </form>
                <p class="mt-4 text-center text-sm">New here? <a href="#" onclick="render('register')" class="text-indigo-600">Register</a></p>
            </div>
        </div>
    `;
};

const renderRegister = () => {
    app.innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-gray-100 fade-in">
            <div class="bg-white p-8 rounded shadow-md w-full max-w-md">
                <h2 class="text-2xl font-bold mb-6 text-center text-indigo-600">Register</h2>
                <form onsubmit="event.preventDefault(); register(this.username.value, this.password.value)">
                    <input type="text" name="username" placeholder="Username" class="w-full mb-4 p-2 border rounded" required>
                    <input type="password" name="password" placeholder="Password" class="w-full mb-6 p-2 border rounded" required>
                    <button type="submit" class="w-full bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700">Register</button>
                </form>
                <p class="mt-4 text-center text-sm">Already exist? <a href="#" onclick="render('login')" class="text-indigo-600">Login</a></p>
            </div>
        </div>
    `;
};

const renderDashboard = () => {
    const groupList = State.groups.map(g => `
        <div onclick="openGroup(${g.id}, '${g.name}')" class="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition transform hover:-translate-y-1 border-l-4 border-indigo-500 cursor-pointer">
            <h3 class="text-xl font-semibold mb-2">${g.name}</h3>
            <p class="text-gray-500 text-sm">Code: <span class="font-mono bg-gray-100 px-1 rounded">${g.code}</span></p>
        </div>
    `).join('');

    app.innerHTML = `
        <div class="min-h-screen bg-gray-50 fade-in">
            <nav class="bg-indigo-600 p-4 text-white flex justify-between items-center shadow-lg">
                <h1 class="text-xl font-bold">Expense Tracker</h1>
                <div class="flex items-center gap-4">
                    <span>${State.user.username}</span>
                    <button onclick="logout()" class="bg-indigo-800 px-3 py-1 rounded hover:bg-indigo-900 text-sm">Logout</button>
                </div>
            </nav>
            <div class="container mx-auto p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">Your Groups</h2>
                    <div class="flex gap-2">
                        <input id="joinCode" type="text" placeholder="Enter Code" class="p-2 border rounded text-sm w-32">
                        <button onclick="joinGroup(document.getElementById('joinCode').value)" class="bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-300">Join</button>
                        <button onclick="promptCreateGroup()" class="bg-pink-500 text-white px-4 py-2 rounded shadow-lg hover:bg-pink-600 transition text-sm">+ New Group</button>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${State.groups.length ? groupList : '<p class="text-gray-500 col-span-3 text-center">No groups yet. Create or join one!</p>'}
                </div>
            </div>
        </div>
    `;
};

const renderGroupDetails = () => {
    // Ensure we have expenses loaded or loading 
    // (In a real app, might want a loading state, but we fetch on openGroup)

    // --- Category Config ---
    const getCategoryColor = (cat) => {
        const colors = {
            'Grocery': 'bg-green-500',
            'Fuel': 'orange-500',
            'Medical': 'bg-red-500',
            'Household': 'bg-purple-500',
            'Entertainment': 'bg-pink-500',
            'Dining': 'bg-yellow-500',
            'Transport': 'bg-blue-500',
            'Other': 'bg-gray-500'
        };
        return colors[cat] || 'bg-gray-500';
    };

    const expenseList = State.expenses.map(e => `
        <div class="p-4 border-b last:border-0 flex justify-between items-center hover:bg-gray-50 transition">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getCategoryColor(e.category)}">
                  ${e.category[0]}
                </div>
                <div>
                    <h4 class="font-semibold text-gray-800">${e.description}</h4>
                    <p class="text-xs text-gray-500">${e.paid_by} • ${e.date}</p>
                </div>
            </div>
            <span class="font-bold text-gray-800">₹${e.amount}</span>
        </div>
    `).join('');

    app.innerHTML = `
        <div class="min-h-screen bg-gray-50 fade-in">
            <nav class="bg-indigo-600 p-4 text-white shadow-lg sticky top-0 z-10">
                <div class="container mx-auto flex items-center gap-4">
                    <button onclick="closeGroup()" class="text-indigo-200 hover:text-white">&larr; Back</button>
                    <h1 class="text-xl font-bold">${State.currentGroup.name}</h1>
                </div>
            </nav>

            <div class="container mx-auto p-6">
                <div class="flex justify-between items-center mb-6">
                    <div class="flex gap-2 overflow-x-auto pb-2">
                        <span class="px-3 py-1 bg-white text-gray-600 rounded-full text-xs shadow-sm border whitespace-nowrap">Grocery</span>
                        <span class="px-3 py-1 bg-white text-gray-600 rounded-full text-xs shadow-sm border whitespace-nowrap">Fuel</span>
                        <span class="px-3 py-1 bg-white text-gray-600 rounded-full text-xs shadow-sm border whitespace-nowrap">Medical</span>
                        <span class="px-3 py-1 bg-white text-gray-600 rounded-full text-xs shadow-sm border whitespace-nowrap">Household</span>
                        <span class="px-3 py-1 bg-white text-gray-600 rounded-full text-xs shadow-sm border whitespace-nowrap">Dining</span>
                        <span class="px-3 py-1 bg-white text-gray-600 rounded-full text-xs shadow-sm border whitespace-nowrap">Transport</span>
                    </div>
                    <button onclick="document.getElementById('addModal').classList.remove('hidden')" 
                        class="bg-pink-500 text-white px-4 py-2 rounded-full shadow-lg hover:bg-pink-600 transition whitespace-nowrap">
                        + Add Expense
                    </button>
                </div>

                <div class="bg-white rounded-xl shadow overflow-hidden">
                    ${State.expenses.length ? expenseList : '<div class="p-8 text-center text-gray-500">No expenses yet.</div>'}
                </div>
            </div>

            <!-- Add Modal -->
            <div id="addModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 z-50">
                <div class="bg-white p-6 rounded-lg w-full max-w-sm fade-in">
                    <h3 class="text-xl font-bold mb-4">Add Expense</h3>
                    <form onsubmit="event.preventDefault(); submitExpense(this)">
                        <input type="text" name="desc" placeholder="Description" class="w-full border p-2 rounded mb-4" required>
                        <input type="number" name="amount" placeholder="Amount (INR)" class="w-full border p-2 rounded mb-4" required>
                        <select name="category" class="w-full border p-2 rounded mb-4">
                            <option value="Grocery">Grocery</option>
                            <option value="Fuel">Fuel</option>
                            <option value="Medical">Medical</option>
                            <option value="Household">Household</option>
                            <option value="Dining">Dining</option>
                            <option value="Transport">Transport</option>
                            <option value="Entertainment">Entertainment</option>
                            <option value="Other">Other</option>
                        </select>
                        <div class="flex justify-end gap-2">
                            <button type="button" onclick="document.getElementById('addModal').classList.add('hidden')" class="text-gray-500 px-3 py-1">Cancel</button>
                            <button type="submit" class="bg-indigo-600 text-white px-4 py-2 rounded">Add</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
};

// --- Helpers ---
window.openGroup = (id, name) => {
    State.currentGroup = { id, name };
    fetchExpenses(id); // Will trigger render
    renderGroupDetails(); // Optimistic render
};

window.closeGroup = () => {
    State.currentGroup = null;
    renderDashboard();
};

window.promptCreateGroup = () => {
    const name = prompt("Enter Group Name:");
    if (name) createGroup(name);
};

window.submitExpense = (form) => {
    addExpense(form.amount.value, form.category.value, form.desc.value);
    document.getElementById('addModal').classList.add('hidden');
    form.reset();
};

window.login = login;
window.register = register;
window.logout = logout;
window.render = render;

// Initial Render
// --- Initialization ---
const init = () => {
    if (State.user) {
        // If logged in, fetch groups first, then render
        fetchGroups();
    } else {
        render();
    }
};

init();
