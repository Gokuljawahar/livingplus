import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export default function Card({ padded = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-[14px] border border-hairline bg-canvas ${padded ? 'p-5' : ''} ${className}`.trim()}
      {...props}
    />
  );
}
