import React from 'react';
import { useAuth } from './AuthContext';
import Login from './Login';

export default function RequireAuth({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return <Login />;
  }
  return children;
}
