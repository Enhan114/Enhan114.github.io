import React from "react";
import { COLOR_PALETTE, getLyricsColor } from "../services/lyricsColorSettings";

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium text-white/80">歌词颜色</span>
        <span
          className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
          style={{ backgroundColor: value }}
        />
      </div>
      <div className="grid grid-cols-6 gap-2">
        {COLOR_PALETTE.map((c) => {
          const isActive = c.hex === value;
          return (
            <button
              key={c.hex}
              onClick={() => onChange(c.hex)}
              title={c.label}
              className={`
                relative flex flex-col items-center gap-1 p-1.5 rounded-xl
                transition-all duration-150
                ${isActive
                  ? "bg-white/10 ring-1 ring-white/30 scale-105"
                  : "hover:bg-white/5"
                }
              `}
            >
              <span
                className="w-7 h-7 rounded-full border border-white/15 shadow-sm transition-transform duration-150"
                style={{ backgroundColor: c.hex }}
              />
              <span className="text-[10px] text-white/40 leading-tight text-center">
                {c.label}
              </span>
              {isActive && (
                <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-white flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4L3.5 6L6.5 2" stroke="#000" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ColorPicker;
