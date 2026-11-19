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

    let startedOnCellButton = false;
    let suppressCellClick = false;

    const handleMouseDown = (e: MouseEvent) => {
      suppressCellClick = false;
      // Don't pan if clicking on interactive elements
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('button, a, input, select, textarea, [role="button"], [role="link"]');
      
      // A worksheet cell button supports both click-to-edit and drag-to-pan.
      startedOnCellButton = containerOnly && !!isInteractive?.matches('button')
        && !!isInteractive.closest('[data-drag-pan-cell]');
      if (isInteractive && !startedOnCellButton) return;

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
        suppressCellClick = startedOnCellButton && hasMovedRef.current;
        isDraggingRef.current = false;
        hasMovedRef.current = false;
        surface.style.cursor = 'grab';
        surface.style.userSelect = previousUserSelect;
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (suppressCellClick && e.detail > 0) {
        e.preventDefault();
        e.stopPropagation();
      }
      suppressCellClick = false;
    };

    const eventTarget = containerOnly ? surface : window;
    eventTarget.addEventListener('mousedown', handleMouseDown as EventListener);
    if (containerOnly) surface.addEventListener('click', handleClick, true);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    return () => {
      eventTarget.removeEventListener('mousedown', handleMouseDown as EventListener);
      if (containerOnly) surface.removeEventListener('click', handleClick, true);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      surface.style.cursor = previousCursor;
      surface.style.userSelect = previousUserSelect;
    };
  }, [containerOnly]);

  return { containerRef };
};
