import React from 'react';
import { Menu, Button } from 'antd';
import {
  DashboardOutlined,
  UploadOutlined,
  BarChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = ({ collapsed, toggleCollapse }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/upload', icon: <UploadOutlined />, label: 'Upload Files' },
    { key: '/analysis', icon: <BarChartOutlined />, label: 'Analysis' },
  ];

  return (
    <div>
      {/* Toggle Button */}
      <div style={{ padding: 10, textAlign: 'center' }}>
        <Button
          type="primary"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={toggleCollapse}
          style={{ width: '100%' }}
        />
      </div>

      <Menu
        theme="dark"
        selectedKeys={[location.pathname]}
        mode="inline"
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </div>
  );
};

export default Sidebar;
