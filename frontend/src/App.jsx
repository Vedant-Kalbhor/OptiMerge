import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { Layout, ConfigProvider, App as AntdApp } from 'antd';

import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/UploadPage';
import AnalysisPage from './pages/AnalysisPage';
import ClusteringResultsPage from './pages/ClusteringResultsPage';
import BOMResultsPage from './pages/BOMResultsPage';
import PreviousAnalysisPage from './pages/PreviousAnalysisPage';
import WeldmentResultsPage from './pages/WeldmentResultsPage';
import BOMComparePage from './pages/BOMComparePage';
import BOMReplacementSuggestion from './pages/BOMReplacementSuggestion';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { AuthProvider, useAuth } from './context/AuthContext';

import './App.css';

const { Header, Content, Sider } = Layout;

// Protect routes using auth context
function PrivateRoute({ children }) {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    return <div>Loading...</div>; // you can replace with AntD Spin if you like
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <AntdApp>
        <AuthProvider>
          <Router>
            <Layout style={{ minHeight: '100vh' }}>
              <Sider
                width={250}
                breakpoint="lg"
                collapsedWidth="0"
                style={{
                  background: '#001529',
                }}
              >
                <Sidebar />
              </Sider>
              <Layout>
                <Header
                  style={{
                    background: '#fff',
                    padding: '0 20px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <h1 style={{ margin: 0, color: '#1890ff' }}>OptiMerge</h1>
                </Header>
                <Content
                  style={{
                    margin: '20px',
                    background: '#fff',
                    padding: '20px',
                    borderRadius: '20px',
                  }}
                >
                  <Routes>
                    {/* Public routes */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignupPage />} />

                    {/* Protected routes */}
                    <Route
                      path="/"
                      element={
                        <PrivateRoute>
                          <Dashboard />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/upload"
                      element={
                        <PrivateRoute>
                          <UploadPage />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/analysis"
                      element={
                        <PrivateRoute>
                          <AnalysisPage />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/results/clustering/:analysisId"
                      element={
                        <PrivateRoute>
                          <ClusteringResultsPage />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/results/bom/:analysisId"
                      element={
                        <PrivateRoute>
                          <BOMResultsPage />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/previous/:analysisId"
                      element={
                        <PrivateRoute>
                          <PreviousAnalysisPage />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/results/weldment/:analysisId"
                      element={
                        <PrivateRoute>
                          <WeldmentResultsPage />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/results/bom/compare/:bomA/:bomB"
                      element={
                        <PrivateRoute>
                          <BOMComparePage />
                        </PrivateRoute>
                      }
                    />
                    <Route
                      // path="/results/bom/replacements/:analysisId/:bomA/:bomB"
                      path="/results/bom/replacements"
                      element={
                        <PrivateRoute>
                          <BOMReplacementSuggestion />
                        </PrivateRoute>
                      }
                    />

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Content>
              </Layout>
            </Layout>
          </Router>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
