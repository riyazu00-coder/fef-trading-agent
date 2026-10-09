'use client';

import { useEffect } from 'react';

/**
 * InteractiveGlassProvider
 *
 * Lightweight, event-driven interactive glass illumination.
 * DESKTOP ONLY: Activates ONLY on devices with fine pointer and hover capabilities.
 * ZERO RAF LOOPS: Updates CSS custom variables (--mouse-x, --mouse-y) strictly on pointermove.
 * ZERO WORK on touch/mobile and respects prefers-reduced-motion: reduce.
 */
export const InteractiveGlassProvider: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Strict capability gates: Desktop fine pointer only, motion preferred
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!hasFinePointer || prefersReducedMotion) {
      return;
    }

    let activeCard: HTMLElement | null = null;

    const clearCardProps = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--mouse-x');
      el.style.removeProperty('--mouse-y');
    };

    const handlePointerMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.(
        '.ghost-glass-panel, .ghost-glass-panel-elevated, .interactive-glass'
      ) as HTMLElement | null;

      if (!target) {
        if (activeCard) {
          clearCardProps(activeCard);
          activeCard = null;
        }
        return;
      }

      if (activeCard && activeCard !== target) {
        clearCardProps(activeCard);
      }

      activeCard = target;
      const rect = target.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);

      target.style.setProperty('--mouse-x', `${x}px`);
      target.style.setProperty('--mouse-y', `${y}px`);
    };

    const handlePointerLeave = () => {
      if (activeCard) {
        clearCardProps(activeCard);
        activeCard = null;
      }
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      if (activeCard) {
        clearCardProps(activeCard);
        activeCard = null;
      }
    };
  }, []);

  return null;
};

