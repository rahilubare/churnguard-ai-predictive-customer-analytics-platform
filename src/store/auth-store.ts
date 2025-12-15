import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { api } from '@/lib/api-client';
import type { User, OrgState, AuthResponse, Role } from '@shared/types';
interface AuthState {
  token: string | null;
  user: { id: string; email: string; role: Role } | null;
  org: { id: string; name: string; subTier: 'free' | 'pro' | 'enterprise' } | null;
  orgId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
interface AuthActions {
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string, orgName: string) => Promise<AuthResponse>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  _setAuth: (data: AuthResponse) => void;
}
const initialState: AuthState = {
  token: localStorage.getItem('churnguard_token'),
  user: null,
  org: null,
  orgId: null,
  isAuthenticated: false,
  isLoading: true,
};
export const useAuthStore = create<AuthState & AuthActions>()(
  immer((set, get) => ({
    ...initialState,
    _setAuth: (data) => {
      localStorage.setItem('churnguard_token', data.token);
      set((state) => {
        state.token = data.token;
        state.user = data.user;
        state.org = data.org;
        state.orgId = data.org.id;
        state.isAuthenticated = true;
        state.isLoading = false;
      });
    },
    login: async (email, password) => {
      const data = await api<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      get()._setAuth(data);
      return data;
    },
    register: async (email, password, orgName) => {
      const data = await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, orgName }),
      });
      get()._setAuth(data);
      return data;
    },
    logout: () => {
      localStorage.removeItem('churnguard_token');
      set({ ...initialState, token: null, isLoading: false });
    },
    fetchMe: async () => {
      if (!get().token) {
        set({ isLoading: false });
        return;
      }
      try {
        const orgData = await api<OrgState>('/api/org/me');
        // This is a simplified fetch; a real app would have a /users/me endpoint too
        // For now, we derive user info from the token if needed, but we get it at login.
        // Let's assume the org data is enough to re-validate the session.
        // A more robust solution would be to decode the JWT on the client or have a /me endpoint that returns both user and org.
        // For this phase, we'll just confirm the token is valid by fetching the org.
        set(state => {
            state.isAuthenticated = true;
            state.isLoading = false;
            if (state.org?.id !== orgData.id) {
                state.org = orgData;
                state.orgId = orgData.id;
            }
        });
      } catch (error) {
        console.error("Failed to fetch user data, logging out.", error);
        get().logout();
      }
    },
  }))
);
// Initialize auth state on app load
useAuthStore.getState().fetchMe();