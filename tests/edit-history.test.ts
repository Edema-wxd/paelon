import { describe, expect, it } from "vitest";

import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  TYPING_GROUP_MS,
  caretAfterJump,
  recordChange,
  redoChange,
  undoChange,
} from "@/lib/admin/edit-history";

describe("recordChange", () => {
  it("groups a burst of typing into one step", () => {
    let history = recordChange(EMPTY_HISTORY, "", "typing", 0);
    history = recordChange(history, "H", "typing", 100);
    history = recordChange(history, "He", "typing", 200);
    expect(history.past).toEqual([""]);
  });

  it("starts a new step after a pause", () => {
    let history = recordChange(EMPTY_HISTORY, "", "typing", 0);
    history = recordChange(history, "Hello", "typing", TYPING_GROUP_MS + 1);
    expect(history.past).toEqual(["", "Hello"]);
  });

  it("makes every toolbar command its own step, even mid-typing", () => {
    let history = recordChange(EMPTY_HISTORY, "", "typing", 0);
    history = recordChange(history, "word", "command", 10);
    history = recordChange(history, "**word**", "typing", 20);
    expect(history.past).toEqual(["", "word", "**word**"]);
  });

  it("does not record the same text twice in a row", () => {
    let history = recordChange(EMPTY_HISTORY, "a", "command", 0);
    history = recordChange(history, "a", "command", 10);
    expect(history.past).toEqual(["a"]);
  });

  it("clears redo on a new edit", () => {
    const history = recordChange(EMPTY_HISTORY, "a", "command", 0);
    const undone = undoChange(history, "ab");
    expect(undone?.history.future).toEqual(["ab"]);
    const edited = recordChange(undone!.history, "a", "typing", 50);
    expect(edited.future).toEqual([]);
  });

  it("keeps a bounded number of steps", () => {
    let history = EMPTY_HISTORY;
    for (let step = 0; step < HISTORY_LIMIT + 50; step += 1) {
      history = recordChange(history, `v${step}`, "command", step);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe("v50");
  });
});

describe("undo and redo", () => {
  it("walk back and forth through the same states", () => {
    let history = recordChange(EMPTY_HISTORY, "", "command", 0);
    history = recordChange(history, "one", "command", 10);

    const back = undoChange(history, "one two");
    expect(back?.value).toBe("one");
    const backAgain = undoChange(back!.history, "one");
    expect(backAgain?.value).toBe("");
    expect(undoChange(backAgain!.history, "")).toBeNull();

    const forward = redoChange(backAgain!.history, "");
    expect(forward?.value).toBe("one");
    const forwardAgain = redoChange(forward!.history, "one");
    expect(forwardAgain?.value).toBe("one two");
    expect(redoChange(forwardAgain!.history, "one two")).toBeNull();
  });

  it("make the next keystroke a new step rather than part of the undone one", () => {
    let history = recordChange(EMPTY_HISTORY, "", "typing", 0);
    const back = undoChange(history, "abc");
    history = recordChange(back!.history, "", "typing", 5);
    expect(history.past).toEqual([""]);
    expect(history.lastKind).toBe("typing");
  });
});

describe("caretAfterJump", () => {
  it("lands after inserted text", () => {
    // The shared space is matched as prefix, so the insertion reads as
    // "**big** " and the caret follows it.
    expect(caretAfterJump("Hello world", "Hello **big** world")).toBe("Hello **big** ".length);
    expect(caretAfterJump("one.", "one. two.")).toBe("one. two.".length);
  });

  it("lands where removed text was", () => {
    expect(caretAfterJump("Hello **big** world", "Hello world")).toBe("Hello ".length);
  });

  it("handles a change at either end", () => {
    expect(caretAfterJump("abc", "abcdef")).toBe(6);
    expect(caretAfterJump("abc", "xabc")).toBe(1);
  });
});
