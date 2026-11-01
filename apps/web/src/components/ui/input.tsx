import * as React from 'react';
import { cn } from '@/lib/utils';
import { controlClassName } from '@/components/ui/control';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(controlClassName, className)}
    {...props}
  />
));
Input.displayName = 'Input';
