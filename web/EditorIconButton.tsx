import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: LucideIcon;
};

export function EditorIconButton({
  label,
  icon: Icon,
  className = "",
  title = label,
  ...props
}: Props) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      title={title}
      className={`editor-icon ${className}`}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
