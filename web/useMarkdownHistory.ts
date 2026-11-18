import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent,
} from "react";

function snapshot(el: HTMLTextAreaElement) {
  return {
    text: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
    direction: el.selectionDirection,
  };
}

type Snapshot = ReturnType<typeof snapshot>;
type Step = { before: Snapshot; after: Snapshot };
type Direction = "undo" | "redo";

// Keep history scoped to this textarea. Browser editing commands can undo changes in another field.
export function useMarkdownHistory(
  input: RefObject<HTMLTextAreaElement | null>,
  text: string,
  onChange: (value: string) => void,
) {
  const steps = useRef<Step[]>([]);
  const position = useRef(0);
  const knownText = useRef(text);
  const beforeInput = useRef<Snapshot | null>(null);
  const composition = useRef<Snapshot | null>(null);
  const lastTyping = useRef({ type: "", time: 0 });
  const [available, setAvailable] = useState({ undo: false, redo: false });

  function updateButtons() {
    setAvailable({
      undo: position.current > 0,
      redo: position.current < steps.current.length,
    });
  }

  function record(before: Snapshot, after: Snapshot, type = "") {
    if (before.text === after.text) return;
    const list = steps.current;
    const previous = list[position.current - 1];
    const now = performance.now();
    const typing = [
      "insertText",
      "deleteContentBackward",
      "deleteContentForward",
    ].includes(type);
    const merge =
      typing &&
      position.current === list.length &&
      previous &&
      lastTyping.current.type === type &&
      now - lastTyping.current.time < 1000 &&
      before.start === before.end &&
      previous.after.start === before.start &&
      previous.after.end === before.end &&
      previous.after.text === before.text;

    if (merge) previous.after = after;
    else {
      list.splice(position.current, list.length - position.current, {
        before,
        after,
      });
      if (list.length > 100) list.shift();
      position.current = list.length;
    }
    lastTyping.current = { type, time: now };
    updateButtons();
  }

  function publish(value: string) {
    knownText.current = value;
    onChange(value);
  }

  function move(direction: Direction) {
    const el = input.current;
    if (!el || composition.current) return;
    const undo = direction === "undo";
    const step = steps.current[position.current - (undo ? 1 : 0)];
    if (!step) return;
    const state = undo ? step.before : step.after;
    position.current += undo ? -1 : 1;
    beforeInput.current = null;
    lastTyping.current.type = "";
    el.focus({ preventScroll: true });
    el.value = state.text;
    el.setSelectionRange(state.start, state.end, state.direction);
    publish(state.text);
    updateButtons();
  }

  useLayoutEffect(() => {
    // A restored revision is a new baseline. Ordinary parent renders and autosaves keep the history.
    if (text !== knownText.current) {
      knownText.current = text;
      steps.current = [];
      position.current = 0;
      composition.current = beforeInput.current = null;
      lastTyping.current.type = "";
      updateButtons();
    }
    const el = input.current;
    if (!el) return;
    function capture(event: InputEvent) {
      if (
        (event.inputType === "historyUndo" ||
          event.inputType === "historyRedo") &&
        event.cancelable
      ) {
        event.preventDefault();
        move(event.inputType === "historyUndo" ? "undo" : "redo");
      } else beforeInput.current = snapshot(el!);
    }
    el.addEventListener("beforeinput", capture);
    return () => el.removeEventListener("beforeinput", capture);
  });

  return {
    available,
    move,
    toolbarEdit(
      el: HTMLTextAreaElement,
      edit: {
        from: number;
        to: number;
        insert: string;
        selectFrom: number;
        selectTo: number;
      },
    ) {
      const before = snapshot(el);
      el.value = before.text.slice(0, edit.from) + edit.insert + before.text.slice(edit.to);
      el.setSelectionRange(edit.selectFrom, edit.selectTo, before.direction);
      beforeInput.current = null;
      record(before, snapshot(el));
      publish(el.value);
    },
    inputChanged(el: HTMLTextAreaElement, type: string) {
      const after = snapshot(el);
      // Some input methods deliver input without a preceding beforeinput event.
      const before = beforeInput.current ?? {
        ...after,
        text: knownText.current,
      };
      beforeInput.current = null;
      if (!composition.current) record(before, after, type);
      publish(after.text);
    },
    startComposition(el: HTMLTextAreaElement) {
      composition.current = snapshot(el);
    },
    endComposition(el: HTMLTextAreaElement) {
      if (composition.current) record(composition.current, snapshot(el));
      composition.current = beforeInput.current = null;
      publish(el.value);
    },
    shortcut(event: KeyboardEvent<HTMLElement>) {
      if (
        composition.current ||
        event.nativeEvent.isComposing ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "z"
      )
        return;
      event.preventDefault();
      move(event.shiftKey ? "redo" : "undo");
    },
  };
}
