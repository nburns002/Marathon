import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Team, TeamInvitation, Notification } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  primaryTeam: Team | null;
  userTeams: Team[];
  invitations: TeamInvitation[];
  notifications: Notification[];
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  switchDemoUser: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('marathon_jwt_token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('marathon_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [primaryTeam, setPrimaryTeam] = useState<Team | null>(null);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (authToken: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setPrimaryTeam(data.primaryTeam);
        setUserTeams(data.teams || []);
        setInvitations(data.invitations || []);
        setNotifications(data.notifications || []);
        localStorage.setItem('marathon_user', JSON.stringify(data.user));
      } else {
        logout();
      }
    } catch (err) {
      console.error('Error fetching auth user:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUserData(token);
    } else {
      setLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('marathon_jwt_token', newToken);
    localStorage.setItem('marathon_user', JSON.stringify(newUser));
    fetchUserData(newToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setPrimaryTeam(null);
    setUserTeams([]);
    setInvitations([]);
    setNotifications([]);
    localStorage.removeItem('marathon_jwt_token');
    localStorage.removeItem('marathon_user');
    setLoading(false);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUserData(token);
    }
  };

  const switchDemoUser = async (userId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/switch-demo-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        const data = await res.json();
        login(data.token, data.user);
      }
    } catch (err) {
      console.error('Failed to switch demo user:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        primaryTeam,
        userTeams,
        invitations,
        notifications,
        loading,
        login,
        logout,
        refreshUser,
        switchDemoUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
