// import React from 'react';
// import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// const ClusterChart = ({ data, xKey, yKey }) => {
//   if (!data || data.length === 0) {
//     return <div>No data available for visualization</div>;
//   }

//   // Transform data for Recharts
//   const chartData = data.map((item, index) => ({
//     x: item[xKey],
//     y: item[yKey],
//     cluster: `Cluster ${index % 5}`,
//     name: item.assy_pn || `Item ${index}`
//   }));

//   const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe'];

//   return (
//     <ResponsiveContainer width="100%" height={400}>
//       <ScatterChart
//         data={chartData}
//         margin={{
//           top: 20,
//           right: 20,
//           bottom: 20,
//           left: 20,
//         }}
//       >
//         <CartesianGrid />
//         <XAxis 
//           type="number" 
//           dataKey="x" 
//           name={xKey}
//           label={{ value: xKey, position: 'insideBottom', offset: -5 }}
//         />
//         <YAxis 
//           type="number" 
//           dataKey="y" 
//           name={yKey}
//           label={{ value: yKey, angle: -90, position: 'insideLeft' }}
//         />
//         <ZAxis type="number" dataKey="z" range={[50, 500]} name="size" />
//         <Tooltip cursor={{ strokeDasharray: '3 3' }} />
//         <Legend />
//         <Scatter name="Weldments" data={chartData} fill="#8884d8" />
//       </ScatterChart>
//     </ResponsiveContainer>
//   );
// };

// export default ClusterChart;


// import React from 'react';
// import {
//   ScatterChart, Scatter, XAxis, YAxis,
//   CartesianGrid, Tooltip, Legend, ResponsiveContainer
// } from 'recharts';

// const ClusterChart = ({ data, xKey, yKey }) => {
//   if (!data || data.length === 0) {
//     return <div>No data available for visualization</div>;
//   }

//   // Group data by cluster number
//   const clusters = {};
//   console.log(data);
//   data.forEach((item, index) => {
//     const clusterId = item.cluster ?? 0; // handle undefined gracefully
//     if (!clusters[clusterId]) clusters[clusterId] = [];
//     clusters[clusterId].push({
//       x: item[xKey],
//       y: item[yKey],
//       name: item.assy_pn,
//     });
//   });

//   // Predefined colors — automatically cycles if there are more clusters
//   const colors = [
//     '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe',
//     '#ff1493', '#00c49f', '#a83279', '#7fffd4', '#ff4500'
//   ];

//   return (
//     <ResponsiveContainer width="100%" height={400}>
//       <ScatterChart
//         margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
//       >
//         <CartesianGrid />
//         <XAxis
//           type="number"
//           dataKey="x"
//           name={xKey}
//           label={{ value: xKey, position: 'insideBottom', offset: -5 }}
//         />
//         <YAxis
//           type="number"
//           dataKey="y"
//           name={yKey}
//           label={{ value: yKey, angle: -90, position: 'insideLeft' }}
//         />
//         <Tooltip cursor={{ strokeDasharray: '3 3' }} />
//         <Legend />

//         {/* Render each cluster separately with its color */}
//         {Object.keys(clusters).map((clusterId, i) => (
//           <Scatter
//             key={clusterId}
//             name={`Cluster ${clusterId}`}
//             data={clusters[clusterId]}
//             fill={colors[i % colors.length]}
//           />
//         ))}
//       </ScatterChart>
//     </ResponsiveContainer>
//   );
// };

// export default ClusterChart;


import React from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function ClusterChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        No cluster visualization data available.
      </div>
    );
  }

  // ✅ Auto-detect keys
  const sample = data[0];
  const xKey = sample.PC1 !== undefined ? "PC1" : Object.keys(sample)[2];
  const yKey = sample.PC2 !== undefined ? "PC2" : Object.keys(sample)[3];

  // ✅ Unique cluster IDs
  const clusters = [...new Set(data.map((d) => d.cluster))];

  // 🎨 Updated, visually balanced color palette
  const COLORS = [
    "#4F46E5", // Indigo
    "#10B981", // Emerald
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#3B82F6", // Blue
    "#8B5CF6", // Violet
  ];

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-700 mb-4 text-center">
        Cluster Visualization
      </h2>

      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart
          margin={{ top: 30, right: 30, bottom: 40, left: 50 }}
        >
          <CartesianGrid
            stroke="#e5e7eb"
            strokeDasharray="4 4"
            vertical={false}
          />
          <XAxis
            type="number"
            dataKey={xKey}
            name={xKey}
            label={{
              value: xKey,
              position: "bottom",
              offset: 0,
              style: { fill: "#374151", fontSize: 13, fontWeight: 500 },
            }}
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey={yKey}
            name={yKey}
            label={{
              value: yKey,
              angle: -90,
              position: "left",
              style: { fill: "#374151", fontSize: 13, fontWeight: 500 },
            }}
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value, name) => [value.toFixed(3), name]}
            contentStyle={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "10px 12px",
            }}
            labelStyle={{ color: "#111827", fontWeight: 500 }}
            itemStyle={{ color: "#374151" }}
          />
          <Legend
            verticalAlign="top"
            align="center"
            wrapperStyle={{
              paddingBottom: "15px",
              fontSize: "13px",
              color: "#374151",
            }}
          />

          {clusters.map((clusterId, i) => (
            <Scatter
              key={clusterId}
              name={`Cluster ${clusterId}`}
              data={data.filter((d) => d.cluster === clusterId)}
              fill={COLORS[i % COLORS.length]}
              shape="circle"
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

