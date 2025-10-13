import { useEffect, useRef, useState } from 'react';

export const useDragPan = () => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Don't pan if clicking on interactive elements
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('button, a, input, select, textarea, [role="button"], [role="link"]');
      
      if (isInteractive) return;

      // Only pan on left mouse button
      if (e.button !== 0) return;

      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };

      // Prevent text selection while dragging
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const dx = dragStartPos.current.x - e.clientX;

      window.scrollTo(
        dragStartPos.current.scrollX + dx,
        window.scrollY
      );
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Apply cursor styles
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'grab';
      document.body.style.userSelect = '';
    }

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return { isDragging, containerRef };
};
