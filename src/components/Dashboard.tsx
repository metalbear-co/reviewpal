import React, { useState, useEffect } from 'react';
import { fetchUserStats } from '../api/stats';

interface DashboardProps {
  userId: string;
  refreshInterval?: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  userId, 
  refreshInterval = 30000 
}) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const data = await fetchUserStats(userId);
        setStats(data);
        setError(null);
      } catch (err) {
        setError('Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    loadStats();

    // Subtle issue: Missing refreshInterval in dependency array
    const interval = setInterval(loadStats, refreshInterval);

    return () => clearInterval(interval);
  }, [userId]); // Missing refreshInterval dependency

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="dashboard">
      <h1>User Dashboard</h1>
      <div className="stats-grid">
        <StatCard title="Total Users" value={stats?.totalUsers} />
        <StatCard title="Active Sessions" value={stats?.activeSessions} />
        <StatCard title="Revenue" value={`$${stats?.revenue?.toFixed(2)}`} />
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: any }> = ({ title, value }) => (
  <div className="stat-card">
    <h3>{title}</h3>
    <p className="value">{value}</p>
  </div>
);
