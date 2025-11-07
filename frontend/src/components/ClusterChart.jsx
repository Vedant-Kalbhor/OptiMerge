import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ClusterChart = ({ data, xKey, yKey }) => {
  if (!data || data.length === 0) {
    return <div>No data available for visualization</div>;
  }

  // Transform data for Recharts
  const chartData = data.map((item, index) => ({
    x: item[xKey],
    y: item[yKey],
    cluster: `Cluster ${index % 5}`,
    name: item.assy_pn || `Item ${index}`
  }));

  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe'];

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart
        data={chartData}
        margin={{
          top: 20,
          right: 20,
          bottom: 20,
          left: 20,
        }}
      >
        <CartesianGrid />
        <XAxis 
          type="number" 
          dataKey="x" 
          name={xKey}
          label={{ value: xKey, position: 'insideBottom', offset: -5 }}
        />
        <YAxis 
          type="number" 
          dataKey="y" 
          name={yKey}
          label={{ value: yKey, angle: -90, position: 'insideLeft' }}
        />
        <ZAxis type="number" dataKey="z" range={[50, 500]} name="size" />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Legend />
        <Scatter name="Weldments" data={chartData} fill="#8884d8" />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

export default ClusterChart;