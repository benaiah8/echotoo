import React, { useState, useEffect, useRef, ReactNode } from "react";
import ReactDOM from "react-dom";

type DropdownContainerProps = {
  children: ReactNode;
  dropdown: (closeDropdown: () => void, isOpen?: boolean) => ReactNode;
  className?: string;
  dropdownClassName?: string;
  maxHeight?: string;
  parentToggle?: (dropdown: boolean) => void;
  forceOpen?: boolean;
  left?: boolean;
};

const DropdownContainer: React.FC<DropdownContainerProps> = ({
  children,
  dropdown,
  className = "",
  dropdownClassName = "",
  maxHeight = "max-h-60",
  parentToggle,
  forceOpen,
  left,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const toggleDropdown = () => setIsOpen(!isOpen);
  const closeDropdown = () => setIsOpen(false);

  useEffect(() => {
    parentToggle && parentToggle(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
    }
  }, [forceOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      updateDropdownPosition();
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const updateDropdownPosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

      setDropdownPosition({
        top: rect.bottom + scrollTop,
        left: rect.left + scrollLeft,
        width: rect.width,
      });
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`inline-block text-left ${className}`}
        onClick={toggleDropdown}
      >
        <div className="cursor-pointer w-full">{children}</div>
      </div>

      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            className={`absolute bg-[var(--surface-2)] border text-black border-gray-700 shadow-md rounded-md overflow-auto scroll-hide z-[9999] ${maxHeight} ${dropdownClassName}`}
            style={{
              top: dropdownPosition.top + 6,
              left: left ? dropdownPosition.left : undefined,
              right: !left
                ? `calc(100vw - ${
                    dropdownPosition.left + dropdownPosition.width
                  }px)`
                : undefined,
              position: "absolute",
            }}
          >
            {dropdown(closeDropdown, isOpen)}
          </div>,
          document.body
        )}
    </>
  );
};

export default DropdownContainer;
