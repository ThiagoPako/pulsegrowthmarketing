import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { User } from '@/types';

interface UserAvatarProps {
  user: Pick<User, 'name' | 'avatarUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-10 h-10 text-sm',
};

const UserAvatar = React.forwardRef<HTMLSpanElement, UserAvatarProps>(
  ({ user, size = 'md', className = '' }, ref) => {
    const initials = user.name
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return (
      <Avatar ref={ref} className={`${sizeClasses[size]} ${className}`}>
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
        <AvatarFallback className="bg-primary text-primary-foreground font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
    );
  }
);

UserAvatar.displayName = 'UserAvatar';

export default UserAvatar;
