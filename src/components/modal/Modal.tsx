import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  modalType?: "side" | "center";
  sideModalOverrideClassname?: string;
  centerModalOverrideClassname?: string;
}

const Modal = ({
  isOpen,
  onClose,
  children,
  modalType = "side",
  sideModalOverrideClassname = "",
  centerModalOverrideClassname = "",
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

  return createPortal(
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[9999] flex transition-opacity duration-300 ${
        modalType === "center"
          ? "items-center justify-center"
          : "justify-end items-stretch"
      } ${
        isVisible
          ? "bg-[var(--surface)]/50 opacity-100"
          : "bg-[var(--surface)]/0 opacity-0"
      }`}
    >
      {modalType === "center" ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`bg-white p-6 rounded-md shadow-lg max-w-md w-full transition-all duration-300 transform text-black ${
            isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
          } ${centerModalOverrideClassname}`}
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
