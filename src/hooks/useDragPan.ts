import { useEffect, useRef } from 'react';

export const useDragPan = (containerOnly = false) => {
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Movement threshold in pixels before drag starts
  const DRAG_THRESHOLD = 5;

  useEffect(() => {
    // Scope panning to the table when requested; existing pages pan the window.
    const surface = containerOnly ? containerRef.current : document.body;
    if (!surface) return;
    const previousCursor = surface.style.cursor;
    const previousUserSelect = surface.style.userSelect;
    surface.style.cursor = 'grab';

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
        scrollX: containerOnly ? surface.scrollLeft : window.scrollX,
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
        surface.style.cursor = 'grabbing';
        surface.style.userSelect = 'none';
      }

      if (containerOnly) {
        surface.scrollLeft = dragStartPos.current.scrollX + dx;
      } else {
        window.scrollTo(dragStartPos.current.scrollX + dx, window.scrollY);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        hasMovedRef.current = false;
        surface.style.cursor = 'grab';
        surface.style.userSelect = previousUserSelect;
      }
    };

    const eventTarget = containerOnly ? surface : window;
    eventTarget.addEventListener('mousedown', handleMouseDown as EventListener);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    return () => {
      eventTarget.removeEventListener('mousedown', handleMouseDown as EventListener);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      surface.style.cursor = previousCursor;
      surface.style.userSelect = previousUserSelect;
    };
  }, [containerOnly]);

  return { containerRef };
};
