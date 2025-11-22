import React from 'react';
import { Menu } from 'antd';
import { 
  DashboardOutlined, 
  UploadOutlined, 
  BarChartOutlined, 
  ClusterOutlined 
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/upload',
      icon: <UploadOutlined />,
      label: 'Upload Files',
    },
    {
      key: '/analysis',
      icon: <BarChartOutlined />,
      label: 'Analysis',
    },
    // {
    //   key: '/results',
    //   icon: <ClusterOutlined />,
    //   label: 'Results',
    // },
  ];

  return (
    <div>
      <div className="logo">
        OptiMerge 
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