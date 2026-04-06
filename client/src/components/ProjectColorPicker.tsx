import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PROJECT_COLOR_SWATCHES,
  normalizeHexColor,
  sanitizeProjectColor,
} from "@shared/projectColors";

interface ProjectColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Prefix for label / input ids when multiple pickers on page */
  idPrefix?: string;
}

export function ProjectColorPicker({ value, onChange, idPrefix = "project-color" }: ProjectColorPickerProps) {
  const safe = sanitizeProjectColor(value);
  const isHex = safe.startsWith("#");
  const pickerValue = isHex ? safe : "#3b82f6";

  const [hexTyping, setHexTyping] = useState(() => (isHex ? safe : ""));
  useEffect(() => {
    setHexTyping(isHex ? safe : "");
  }, [safe, isHex]);

  const hexInputId = `${idPrefix}-hex`;
  const nativePickerId = `${idPrefix}-picker`;

  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase font-semibold text-muted-foreground">Color</Label>
      <div className="flex flex-wrap gap-2">
        {PROJECT_COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Preset ${c}`}
            className={cn(
              "h-8 w-8 shrink-0 rounded-full transition-shadow",
              c,
              value === c ? "ring-2 ring-offset-2 ring-primary ring-offset-background" : "hover:ring-2 hover:ring-offset-1 hover:ring-muted-foreground/30",
            )}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <p className="text-[11px] font-medium text-muted-foreground">Custom color</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor={nativePickerId} className="sr-only">
              Pick color
            </Label>
            <input
              id={nativePickerId}
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-border bg-background p-0.5"
              value={pickerValue}
              onChange={(e) => {
                const n = normalizeHexColor(e.target.value);
                if (n) onChange(n);
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor={hexInputId} className="text-[10px] text-muted-foreground">
              Hex (e.g. #4f46e5)
            </Label>
            <Input
              id={hexInputId}
              placeholder="#4f46e5"
              className="h-9 font-mono text-sm"
              value={hexTyping}
              onChange={(e) => {
                const t = e.target.value;
                setHexTyping(t);
                const n = normalizeHexColor(t);
                if (n) onChange(n);
              }}
              onBlur={() => {
                const n = normalizeHexColor(hexTyping);
                if (hexTyping.trim() === "") {
                  onChange("bg-blue-500");
                  setHexTyping("");
                  return;
                }
                if (n) {
                  onChange(n);
                  setHexTyping(n);
                } else {
                  setHexTyping(isHex ? safe : "");
                }
              }}
            />
          </div>
        </div>
        {isHex && (
          <p className="text-[10px] text-muted-foreground">Using custom color for this project.</p>
        )}
      </div>
    </div>
  );
}
