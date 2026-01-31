import React, { useState, useEffect } from 'react';
import { getUserProfile } from '../api/users';

interface UserProfileProps {
  userId: string;
}

interface UserData {
  name: string;
  bio: string;
  avatar: string;
  joinedDate: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({ userId }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await getUserProfile(userId);
        setUser(data);
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [userId]);

  if (loading) return <div>Loading profile...</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div className="user-profile">
      <img 
        src={user.avatar} 
        alt={user.name}
        className="avatar"
      />
      <h2>{user.name}</h2>
      
      {/* Subtle XSS issue: dangerouslySetInnerHTML with user-controlled content */}
      <div 
        className="bio"
        dangerouslySetInnerHTML={{ __html: user.bio }}
      />
      
      <p className="joined-date">
        Member since {new Date(user.joinedDate).toLocaleDateString()}
      </p>
    </div>
  );
};
