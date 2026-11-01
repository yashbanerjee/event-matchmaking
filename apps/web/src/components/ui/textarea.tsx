import * as React from 'react';
import { cn } from '@/lib/utils';
import { textareaClassName } from '@/components/ui/control';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(textareaClassName, className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
