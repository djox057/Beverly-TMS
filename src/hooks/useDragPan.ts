import { useEffect, useRef } from 'react';

export const useDragPan = () => {
  const isDraggingRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Set initial cursor
    document.body.style.cursor = 'grab';

    const handleMouseDown = (e: MouseEvent) => {
      // Don't pan if clicking on interactive elements
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('button, a, input, select, textarea, [role="button"], [role="link"]');
      
      if (isInteractive) return;

      // Only pan on left mouse button
      if (e.button !== 0) return;

      isDraggingRef.current = true;
      dragStartPos.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };

      // Apply cursor and prevent selection immediately (no lag)
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const dx = dragStartPos.current.x - e.clientX;

      window.scrollTo(
        dragStartPos.current.scrollX + dx,
        window.scrollY
      );
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = 'grab';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return { containerRef };
};
