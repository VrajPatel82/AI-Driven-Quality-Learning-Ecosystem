import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { getDisplayUser } from '../utils/displayNames';
import { ROLES, normalizeRole } from '../utils/roles';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    return null;
  });
  const loading = false;

  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const res = await authAPI.getProfile();
      const userData = res.data?.user || res.data;
      if (userData) {
        const displayUser = getDisplayUser(userData);
        localStorage.setItem('user', JSON.stringify(displayUser));
        setUser(displayUser);
        return displayUser;
      }
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
      }
    }
    return null;
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      refreshUser();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user: userData } = res.data;
    // Apply display name overrides
    const displayUser = getDisplayUser(userData);
    
    // DEBUG: Log role information
    console.log('[DEBUG] Login successful');
    console.log('[DEBUG] Backend returned user:', userData);
    console.log('[DEBUG] User role:', userData?.role);
    console.log('[DEBUG] User role type:', typeof userData?.role);
    console.log('[DEBUG] After display override:', displayUser);
    console.log('[DEBUG] Display override role:', displayUser?.role);
    
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(displayUser));
    setUser(displayUser);
    return displayUser;
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    const { token, user: userData } = res.data;
    // Apply display name overrides
    const displayUser = getDisplayUser(userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(displayUser));
    setUser(displayUser);
    return displayUser;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (userData) => {
    const updatedUser = getDisplayUser({ ...user, ...userData });
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const isSuperAdmin = () => {
    return user && normalizeRole(user.role) === ROLES.SUPER_ADMIN;
  };

  const isUniversityAdmin = () => {
    return user && normalizeRole(user.role) === ROLES.UNIVERSITY_ADMIN;
  };

  const isInstitutionAdmin = () => {
    return user && normalizeRole(user.role) === ROLES.INSTITUTION_ADMIN;
  };

  const isDepartmentAdmin = () => {
    return user && normalizeRole(user.role) === ROLES.DEPARTMENT_ADMIN;
  };

  const isAcademicAdmin = () => {
    return user && normalizeRole(user.role) === ROLES.ACADEMIC_ADMINISTRATOR;
  };

  const isAdmin = () => {
    const role = normalizeRole(user?.role);
    return [ROLES.SUPER_ADMIN, ROLES.UNIVERSITY_ADMIN, ROLES.INSTITUTION_ADMIN, ROLES.DEPARTMENT_ADMIN, ROLES.ACADEMIC_ADMINISTRATOR].includes(role);
  };

  const isProfessor = () => {
    return user && normalizeRole(user.role) === ROLES.PROFESSOR;
  };

  const isStudent = () => {
    return user && normalizeRole(user.role) === ROLES.STUDENT;
  };

  const canManageContent = () => {
    const role = normalizeRole(user?.role);
    return [ROLES.SUPER_ADMIN, ROLES.UNIVERSITY_ADMIN, ROLES.INSTITUTION_ADMIN, ROLES.DEPARTMENT_ADMIN, ROLES.ACADEMIC_ADMINISTRATOR, ROLES.PROFESSOR].includes(role);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
    refreshUser,
    isAdmin,
    isSuperAdmin,
    isUniversityAdmin,
    isInstitutionAdmin,
    isDepartmentAdmin,
    isAcademicAdmin,
    isProfessor,
    isStudent,
    canManageContent
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

