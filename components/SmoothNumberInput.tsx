import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus, X, Check } from 'lucide-react';

export interface SmoothNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
  prefix?: string;
  quickDeltas?: number[];
  allowZero?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  showQuickButtons?: boolean;
  label?: string;
  helpText?: string;
  id?: string;
}

export const SmoothNumberInput: React.FC<SmoothNumberInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder = '0',
  suffix = 'ج.م',
  prefix,
  quickDeltas = [50, 100, 500, 1000],
  allowZero = true,
  disabled = false,
  className = '',
  inputClassName = '',
  size = 'md',
  showQuickButtons = true,
  label,
  helpText,
  id,
}) => {
  // Local string representation so user can backspace and type freely
  const [textValue, setTextValue] = useState<string>(() => (value !== undefined && value !== null ? String(value) : ''));
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const isInternalChangeRef = useRef(false);

  // Sync with external value changes when not actively typing or focused
  useEffect(() => {
    if (!isFocused && !isInternalChangeRef.current) {
      setTextValue(value !== undefined && value !== null ? String(value) : '');
    }
    isInternalChangeRef.current = false;
  }, [value, isFocused]);

  const commitValue = (num: number) => {
    let clean = num;
    if (min !== undefined && clean < min) clean = min;
    if (max !== undefined && clean > max) clean = max;
    isInternalChangeRef.current = true;
    setTextValue(String(clean));
    onChange(clean);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextValue(raw);

    // If empty and allowZero, notify 0 or leave uncommitted until blur
    if (raw.trim() === '') {
      if (allowZero) {
        isInternalChangeRef.current = true;
        onChange(min ?? 0);
      }
      return;
    }

    // Convert Arabic-Indic numerals to standard if typed
    const normalized = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const parsed = parseFloat(normalized);

    if (!isNaN(parsed)) {
      isInternalChangeRef.current = true;
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (textValue.trim() === '') {
      commitValue(min ?? 0);
      return;
    }
    const parsed = parseFloat(textValue.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (isNaN(parsed)) {
      commitValue(value || min || 0);
    } else {
      commitValue(parsed);
    }
  };

  const handleDelta = (delta: number) => {
    const current = Number(value) || 0;
    commitValue(Math.max(min, current + delta));
  };

  const handleClear = () => {
    commitValue(min ?? 0);
  };

  const sizeClasses = {
    sm: 'h-8 text-xs px-2',
    md: 'h-10 text-sm px-3',
    lg: 'h-12 text-base px-3.5',
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <label htmlFor={id} className="font-bold text-[#1D1D1F] dark:text-zinc-200">
            {label}
          </label>
          {helpText && <span className="text-[10px] text-[#86868B]">{helpText}</span>}
        </div>
      )}

      <div
        className={`relative flex items-center rounded-xl bg-white dark:bg-black/40 border transition-all ${
          isFocused
            ? 'border-[#0071E3] ring-2 ring-[#0071E3]/20 shadow-xs'
            : 'border-black/[0.12] dark:border-white/10 hover:border-black/[0.2]'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {prefix && (
          <span className="ps-2.5 pe-1 text-xs font-bold text-[#86868B] select-none shrink-0">{prefix}</span>
        )}

        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={textValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-transparent font-mono font-bold text-right outline-none text-[#1D1D1F] dark:text-white ${
            sizeClasses[size]
          } ${inputClassName}`}
        />

        {suffix && (
          <span className="pe-2.5 ps-1 text-xs font-black text-[#86868B] select-none shrink-0">{suffix}</span>
        )}

        {/* Quick Clear Button */}
        {value > 0 && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            title="تصفير القيمة"
            className="p-1 me-1 text-gray-400 hover:text-red-500 rounded-md transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Quick Increment/Decrement Chips */}
      {showQuickButtons && !disabled && quickDeltas.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap pt-0.5 justify-end">
          <span className="text-[10px] font-bold text-gray-400 ms-1">تعديل سريع:</span>
          {quickDeltas.map((d) => (
            <button
              key={`add-${d}`}
              type="button"
              onClick={() => handleDelta(d)}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/[0.04] dark:bg-white/5 hover:bg-[#0071E3] hover:text-white text-[#1D1D1F] dark:text-zinc-300 border border-black/[0.06] dark:border-white/10 transition-colors"
            >
              +{d.toLocaleString('en-US')}
            </button>
          ))}
          {/* Quick decrease option for highest delta */}
          {value >= 100 && (
            <button
              type="button"
              onClick={() => handleDelta(-100)}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/[0.04] dark:bg-white/5 hover:bg-rose-600 hover:text-white text-rose-600 border border-black/[0.06] dark:border-white/10 transition-colors"
            >
              -100
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SmoothNumberInput;
