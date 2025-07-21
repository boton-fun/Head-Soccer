/**
 * Authentication Manager
 * Handles user authentication, session management, and API communication
 */

class AuthManager {
    constructor() {
        this.apiBaseUrl = 'https://head-soccer-production.up.railway.app/api';
        this.user = null;
        this.token = null;
        
        // Load saved authentication state
        this.loadAuthState();
    }

    /**
     * Load authentication state from localStorage
     */
    loadAuthState() {
        try {
            const savedToken = localStorage.getItem('head_soccer_token');
            const savedUser = localStorage.getItem('head_soccer_user');
            
            if (savedToken && savedUser) {
                this.token = savedToken;
                this.user = JSON.parse(savedUser);
                console.log('✅ Loaded saved auth state for:', this.user.username);
            }
        } catch (error) {
            console.log('No saved auth state found');
            this.clearAuthState();
        }
    }

    /**
     * Save authentication state to localStorage
     */
    saveAuthState() {
        if (this.token && this.user) {
            localStorage.setItem('head_soccer_token', this.token);
            localStorage.setItem('head_soccer_user', JSON.stringify(this.user));
        }
    }

    /**
     * Clear authentication state
     */
    clearAuthState() {
        this.user = null;
        this.token = null;
        localStorage.removeItem('head_soccer_token');
        localStorage.removeItem('head_soccer_user');
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!(this.token && this.user);
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Get authentication token
     */
    getToken() {
        return this.token;
    }

    /**
     * Register new user
     */
    async register(username, password, displayName) {
        try {
            console.log('🔐 Attempting to register user:', username);
            
            const response = await fetch(`${this.apiBaseUrl}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username.toLowerCase().trim(),
                    password: password,
                    display_name: displayName || username
                })
            });

            const data = await response.json();
            console.log('Register response:', data);

            if (data.success) {
                this.token = data.data.token;
                this.user = data.data.user;
                this.saveAuthState();
                
                console.log('✅ Registration successful for:', this.user.username);
                return { success: true, user: this.user };
            } else {
                console.error('❌ Registration failed:', data.error);
                return { success: false, error: data.error || 'Registration failed' };
            }
        } catch (error) {
            console.error('❌ Registration network error:', error);
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    }

    /**
     * Login user
     */
    async login(username, password) {
        try {
            console.log('🔐 Attempting to login user:', username);
            
            const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username.toLowerCase().trim(),
                    password: password
                })
            });

            const data = await response.json();
            console.log('Login response:', data);

            if (data.success) {
                this.token = data.data.token;
                this.user = data.data.user;
                this.saveAuthState();
                
                console.log('✅ Login successful for:', this.user.username);
                return { success: true, user: this.user };
            } else {
                console.error('❌ Login failed:', data.error);
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.error('❌ Login network error:', error);
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    }

    /**
     * Logout user
     */
    logout() {
        console.log('🔐 Logging out user:', this.user?.username);
        this.clearAuthState();
        
        // Dispatch logout event for UI updates
        window.dispatchEvent(new CustomEvent('auth:logout'));
    }

    /**
     * Get user profile
     */
    async getProfile() {
        if (!this.isAuthenticated()) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/profile`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                this.user = data.data;
                this.saveAuthState();
                return { success: true, user: this.user };
            } else {
                if (response.status === 401) {
                    // Token expired, clear auth
                    this.clearAuthState();
                }
                return { success: false, error: data.error };
            }
        } catch (error) {
            console.error('❌ Profile fetch error:', error);
            return { success: false, error: 'Network error' };
        }
    }

    /**
     * Make authenticated API request
     */
    async apiRequest(endpoint, options = {}) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        const config = {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const response = await fetch(`${this.apiBaseUrl}${endpoint}`, config);
        
        if (response.status === 401) {
            // Token expired
            this.clearAuthState();
            window.dispatchEvent(new CustomEvent('auth:tokenExpired'));
            throw new Error('Authentication expired');
        }

        return response;
    }

    /**
     * Check username availability
     */
    async checkUsernameAvailability(username) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/check-username`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username.toLowerCase().trim()
                })
            });

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Username availability check error:', error);
            return { success: false, error: 'Network error' };
        }
    }

    /**
     * Validate username format
     */
    validateUsername(username) {
        if (!username || username.length < 3) {
            return { valid: false, error: 'Username must be at least 3 characters' };
        }
        if (username.length > 20) {
            return { valid: false, error: 'Username must be less than 20 characters' };
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
        }
        return { valid: true };
    }

    /**
     * Validate password format
     */
    validatePassword(password) {
        if (!password || password.length < 6) {
            return { valid: false, error: 'Password must be at least 6 characters' };
        }
        if (password.length > 100) {
            return { valid: false, error: 'Password is too long' };
        }
        return { valid: true };
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();