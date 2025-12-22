import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { isAuthenticated } from '../utils/auth';

export default function Header() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, text: 'Welcome to AI Cloud! Start uploading your files.', time: 'Just now', unread: true },
  ]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, unread: false })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setShowNotifications(false);
  };

  const addNotification = (text) => {
    const newNotification = {
      id: Date.now(),
      text,
      time: 'Just now',
      unread: true
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  // Listen for custom notification events (file uploads, etc.)
  useEffect(() => {
    const handleNotification = (event) => {
      if (event.detail && event.detail.message) {
        addNotification(event.detail.message);
      }
    };
    
    window.addEventListener('app-notification', handleNotification);
    return () => window.removeEventListener('app-notification', handleNotification);
  }, []);

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

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setLoggedIn(false);
    setUser(null);
    setMobileMenuOpen(false);
    setShowLogoutConfirm(false);
    
    // Clear notifications on logout
    setNotifications([]);
    
    navigate('/login');
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  return (
    <nav className="bg-white shadow-lg border-b border-gray-100 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link 
            to="/" 
            className="font-bold text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent hover:from-purple-700 hover:to-pink-700 transition-all"
          >
            ☁️ AI Cloud
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {loggedIn && (
              <div className="flex gap-6">
                <Link 
                  to="/upload" 
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium relative group"
                >
                  Upload
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-600 to-pink-600 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  to="/files" 
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium relative group"
                >
                  My Files
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-600 to-pink-600 group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link 
                  to="/search" 
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium relative group"
                >
                  Search
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-600 to-pink-600 group-hover:w-full transition-all duration-300"></span>
                </Link>
              </div>
            )}
          </div>

          {/* Desktop User Section */}
          <div className="hidden md:flex gap-4 items-center">
            {loggedIn ? (
              <>
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  <span className="text-sm font-medium text-gray-700">👤 {user?.username}</span>
                </div>
                <button 
                  onClick={handleLogoutClick} 
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Logout
                </button>

                {/* Notifications */}
                <div className="relative ml-2">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2.5 rounded-xl hover:bg-purple-50 transition-all duration-300 group"
                  >
                    <Bell className="w-5 h-5 text-gray-600 group-hover:text-purple-600 transition-colors" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
                      <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-3 flex items-center justify-between">
                        <h3 className="font-bold text-white">Notifications</h3>
                        <div className="flex gap-2">
                          <button 
                            onClick={markAllRead}
                            className="text-purple-100 hover:text-white text-xs"
                          >
                            Mark all read
                          </button>
                          <button 
                            onClick={clearAllNotifications}
                            className="text-purple-100 hover:text-white text-xs"
                          >
                            Clear all
                          </button>
                        </div>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-8 text-center text-gray-500">
                            <Bell className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">No notifications yet</p>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`px-4 py-3 hover:bg-purple-50 cursor-pointer transition-colors border-b border-gray-100 ${
                                notif.unread ? 'bg-purple-50/50' : ''
                              }`}
                              onClick={() => {
                                setNotifications(notifications.map(n => 
                                  n.id === notif.id ? { ...n, unread: false } : n
                                ));
                              }}
                            >
                              <div className="flex items-start gap-3">
                                {notif.unread && (
                                  <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 flex-shrink-0" />
                                )}
                                <div className="flex-1">
                                  <p className={`text-sm ${notif.unread ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                                    {notif.text}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1">{notif.time}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      {notifications.length > 0 && (
                        <div className="px-4 py-3 bg-gray-50 text-center">
                          <button 
                            onClick={() => setShowNotifications(false)}
                            className="text-sm text-purple-600 font-semibold hover:text-purple-700"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link 
                  to="/login" 
                  className="text-gray-700 px-4 py-2 rounded-lg font-medium hover:text-purple-600 transition-colors"
                >
                  Login
                </Link>
                <Link 
                  to="/register" 
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-2 rounded-lg font-medium hover:shadow-lg transition-all duration-300"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-2xl text-gray-700 hover:text-purple-600 transition-colors"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl animate-fadeIn">
              <div className="text-center">
                <div className="text-5xl mb-4">👋</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Leaving so soon?</h3>
                <p className="text-gray-600 mb-6">Are you sure you want to logout?</p>
                <div className="flex gap-3">
                  <button
                    onClick={cancelLogout}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={logout}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
                  >
                    Yes, Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-100 animate-slideDown">
            {loggedIn && (
              <div className="flex flex-col gap-3 mb-4">
                <Link 
                  to="/upload" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium py-2"
                >
                  Upload
                </Link>
                <Link 
                  to="/files" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium py-2"
                >
                  My Files
                </Link>
                <Link 
                  to="/search" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium py-2"
                >
                  Search
                </Link>
              </div>
            )}
            
            <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
              {loggedIn ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg mb-2">
                    <span className="text-sm font-medium text-gray-700">👤 {user?.username}</span>
                  </div>
                  <button 
                    onClick={handleLogoutClick} 
                    className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link 
                    to="/login" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center text-gray-700 px-4 py-2 rounded-lg font-medium hover:text-purple-600 transition-colors"
                  >
                    Login
                  </Link>
                  <Link 
                    to="/register" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-all duration-300 text-center"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
