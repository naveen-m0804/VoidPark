import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/config/firebase';
import api from '@/api/axios';

interface UserProfile {
  id: string;
  firebase_uid: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  firebaseUser: User | null;
  profile: UserProfile | null;
  isNewUser: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: (p: UserProfile | null) => void;
  setIsNewUser: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const { data } = await api.get('/users/me');
      if (data.data?.isNewUser) {
        setIsNewUser(true);
        setProfile(null);
      } else {
        setProfile(data.data);
        setIsNewUser(false);
      }
    } catch (err: any) {
      // 404 is expected for new/unregistered users, don't spam console
      if (err.response?.status !== 404) {
        console.error('Profile fetch failed:', err);
      }
      setProfile(null);
      setIsNewUser(true);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchProfile();
      } else {
        setProfile(null);
        setIsNewUser(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const refreshProfile = async () => {
    if (firebaseUser) await fetchProfile();
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, isNewUser, loading, refreshProfile, setProfile, setIsNewUser }}>
      {children}
    </AuthContext.Provider>
  );
};
