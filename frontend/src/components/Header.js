import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../utils/auth';

export default function Header() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      const authenticated = isAuthenticated();
      setLoggedIn(authenticated);
      
      if (authenticated) {
        // Get username from localStorage
        const username = localStorage.getItem('username');
        setUser({ username: username || 'User' });
      } else {
        setUser(null);
      }
    };
    
    checkAuth();
    // Listen for storage changes (for logout in other tabs)
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setLoggedIn(false);
    setUser(null);
    navigate('/login');
  };

  return (
    <nav className="bg-white shadow p-4">
      <div className="container mx-auto flex gap-4 items-center">
        <Link to="/" className="font-bold text-lg">AI Cloud</Link>
        {loggedIn && (
          <>
            <Link to="/upload" className="hover:text-blue-600">Upload</Link>
            <Link to="/files" className="hover:text-blue-600">My Files</Link>
            <Link to="/search" className="hover:text-blue-600">Search</Link>
          </>
        )}
        <div className="ml-auto flex gap-3 items-center">
          {loggedIn ? (
            <>
              {user && <span className="text-sm text-gray-600">Welcome, {user.username}</span>}
              <button onClick={logout} className="text-sm text-red-600 hover:text-red-800 font-medium">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Login
              </Link>
              <Link to="/register" className="text-sm text-green-600 hover:text-green-800 font-medium">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
