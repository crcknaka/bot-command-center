import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface TooltipProps {
  text: string;
  children?: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: number;
}

export function Tooltip({ text, children, position = 'top', maxWidth = 280 }: TooltipProps) {
  const [show, setShow] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className={cn(
            'absolute z-50 px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-normal pointer-events-none',
            'bg-zinc-800 text-zinc-200 border border-zinc-700 shadow-lg',
            positionClasses[position]
          )}
          style={{ maxWidth, width: 'max-content' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** Info icon with tooltip — the most common pattern */
export function InfoTip({ text, position = 'top' }: { text: string; position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip text={text} position={position}>
      <Info size={14} className="text-zinc-500 hover:text-zinc-300 cursor-help transition-colors" />
    </Tooltip>
  );
}
