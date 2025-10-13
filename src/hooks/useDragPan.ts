import { useEffect, useRef } from 'react';

export const useDragPan = () => {
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const containerRef = useRef<HTMLElement | null>(null);
  
  // Movement threshold in pixels before drag starts
  const DRAG_THRESHOLD = 5;

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
      hasMovedRef.current = false;
      dragStartPos.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const dx = dragStartPos.current.x - e.clientX;
      const dy = dragStartPos.current.y - e.clientY;
      
      // Only start dragging if moved beyond threshold
      if (!hasMovedRef.current) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < DRAG_THRESHOLD) return;
        
        hasMovedRef.current = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      window.scrollTo(
        dragStartPos.current.scrollX + dx,
        window.scrollY
      );
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        hasMovedRef.current = false;
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
