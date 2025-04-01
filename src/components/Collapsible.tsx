import React, { useEffect, useRef, useState } from "react";

interface CollapsibleProps {
  open: boolean;
  children: React.ReactNode;
  duration?: number;
  className?: string;
}

const Collapsible: React.FC<CollapsibleProps> = ({
  open,
  children,
  duration = 500,
  className = "",
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<string>("0px");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateHeight = () => {
      setHeight(open ? `${element.scrollHeight}px` : "0px");
    };

    updateHeight(); // Set initial height

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [open, children]);

  return (
    <div
      className={`overflow-hidden transition-[max-height] ease-in-out w-full ${className}`}
      style={{ maxHeight: height, transitionDuration: `${duration}ms` }}
    >
      <div ref={ref} className="w-full">
        {children}
      </div>
    </div>
  );
};

export default Collapsible;
