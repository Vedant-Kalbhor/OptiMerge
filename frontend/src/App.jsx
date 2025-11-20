import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout, ConfigProvider, App as AntdApp } from 'antd';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/UploadPage';
import AnalysisPage from './pages/AnalysisPage';
import ResultsPage from './pages/ResultsPage';
import './App.css';

const { Header, Content, Sider } = Layout;

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
                  alignItems: 'center'
                }}
              >
                <h2 style={{ margin: 0, color: '#1890ff' }}>OptiMerge</h2>
              </Header>
              <Content style={{ margin: '20px', background: '#fff', padding: '20px', borderRadius: '8px' }}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/upload" element={<UploadPage />} />
                  <Route path="/analysis" element={<AnalysisPage />} />
                  <Route path="/results" element={<ResultsPage />} />
                  <Route path="/results/:analysisId" element={<ResultsPage />} />
                </Routes>
              </Content>
            </Layout>
          </Layout>
        </Router>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;