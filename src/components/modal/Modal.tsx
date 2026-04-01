import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  modalType?: "side" | "center";
  sideModalOverrideClassname?: string;
  centerModalOverrideClassname?: string;
  /** When "glass", center modal uses frosted glass background and theme-aware border */
  centerVariant?: "default" | "glass";
}

const Modal = ({
  isOpen,
  onClose,
  children,
  modalType = "side",
  sideModalOverrideClassname = "",
  centerModalOverrideClassname = "",
  centerVariant = "default",
}: ModalProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;

      setIsMounted(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";

      const timer = setTimeout(() => {
        setIsMounted(false);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isMounted) return null;

  const isGlass = modalType === "center" && centerVariant === "glass";

  return createPortal(
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[9999] flex transition-opacity duration-300 ${
        modalType === "center"
          ? "items-center justify-center p-4"
          : "justify-end items-stretch"
      } ${
        isVisible
          ? isGlass
            ? "opacity-100"
            : "bg-[var(--surface)]/50 opacity-100"
          : "opacity-0"
      }`}
      style={
        isGlass && isVisible
          ? {
              backgroundColor: "var(--drawer-backdrop, rgba(0, 0, 0, 0.5))",
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
            }
          : undefined
      }
    >
      {modalType === "center" ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`p-6 rounded-2xl shadow-2xl max-w-md w-full transition-all duration-300 transform ${
            !isGlass ? "bg-white text-black" : ""
          } ${
            isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
          } ${centerModalOverrideClassname}`}
          style={
            isGlass
              ? {
                  backgroundColor: "var(--glass-bg)",
                  border: "1px solid var(--glass-active-border)",
                  backdropFilter: "blur(var(--glass-blur))",
                  WebkitBackdropFilter: "blur(var(--glass-blur))",
                  color: "var(--text)",
                }
              : undefined
          }
        >
          {children}
        </div>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`bg-white shadow-lg w-full sm:w-1/2 h-full transform transition-transform duration-300 text-black ${
            isVisible ? "translate-x-0" : "translate-x-full"
          } ${sideModalOverrideClassname}`}
        >
          {children}
        </div>
      )}
    </div>,
    document.body
  );
};

export default Modal;
