import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { User } from '@/types';

interface UserAvatarProps {
  user: Pick<User, 'name' | 'avatarUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
};

export default function UserAvatar({ user, size = 'md', className = '' }: UserAvatarProps) {
  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
      <AvatarFallback className="bg-primary text-primary-foreground font-bold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
