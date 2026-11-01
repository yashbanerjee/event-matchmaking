import * as React from 'react';
import { cn } from '@/lib/utils';
import { selectClassName } from '@/components/ui/control';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(selectClassName, className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';
