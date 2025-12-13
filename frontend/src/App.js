import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Files from './pages/Files';
import Search from './pages/Search';
import Register from './pages/Register';
import ShareView from './pages/ShareView';
import Header from './components/Header';
import Footer from './components/Footer';

// Layout wrapper that conditionally shows header/footer
function Layout({ children }) {
  const location = useLocation();
  const isSharePage = location.pathname.startsWith('/share/');
  
  if (isSharePage) {
    return <>{children}</>;
  }
  
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header />
      <div className="container mx-auto p-4 flex-grow">
        {children}
      </div>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/files" element={<Files />} />
          <Route path="/search" element={<Search />} />
          <Route path="/share/:token" element={<ShareView />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
