"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  className?: string;
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Select\u2026",
  label,
  error,
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((o) => o.value === value);
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, options, value]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        close();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (focusedIndex >= 0) {
          handleSelect(options[focusedIndex].value);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (isOpen) {
          setFocusedIndex((i) => Math.max(i - 1, 0));
        }
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative flex flex-col gap-1", className)}
    >
      {label && (
        <span className="text-xs font-medium text-[var(--color-primary)]">
          {label}
        </span>
      )}

      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-10 w-full items-center justify-between border bg-[var(--color-surface-raised)] px-3 text-sm",
          "transition-colors duration-200",
          "focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]",
          error
            ? "border-[var(--color-destructive)]"
            : "border-[var(--color-border)]"
        )}
      >
        <span
          className={
            selected
              ? "text-[var(--color-primary)]"
              : "text-[var(--color-muted)]"
          }
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "text-[var(--color-muted)] transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          className={cn(
            "animate-scale-in absolute top-full left-0 z-20 mt-1 w-full",
            "border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg"
          )}
        >
          {options.map((option, i) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors duration-200",
                option.value === value && "text-[var(--color-brand)]",
                i === focusedIndex
                  ? "bg-[var(--color-surface-sunken)]"
                  : "hover:bg-[var(--color-surface-sunken)]"
              )}
            >
              {option.label}
              {option.value === value && (
                <Check size={14} className="text-[var(--color-brand)]" />
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-[var(--color-destructive)]">{error}</p>
      )}
    </div>
  );
}
