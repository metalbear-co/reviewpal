import React from 'react';

interface AvatarProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = 'md',
}) => {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <img
      src={src}
      alt={alt}
      className={`${sizes[size]} rounded-full object-cover`}
    />
  );
};

export default Avatar;
