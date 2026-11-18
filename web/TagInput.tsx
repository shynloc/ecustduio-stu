import React, { useEffect, useState, useRef } from "react";
export function TagInput({ value, onChange, ...props }: any) {
  const [text, setText] = useState(value.join("，"));
  const own = useRef(JSON.stringify(value));
  useEffect(() => {
    if (JSON.stringify(value) !== own.current) {
      setText(value.join("，"));
      own.current = JSON.stringify(value);
    }
  }, [value]);
  return (
    <input
      {...props}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const next = e.target.value
          .split(/[,，]/)
          .map((v) => v.trim())
          .filter(Boolean);
        own.current = JSON.stringify(next);
        onChange(next);
      }}
    />
  );
}
