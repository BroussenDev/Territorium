import { describe, expect, it } from "vitest";
import "../../src/client/components/ConfirmDialog";
import { ConfirmDialog } from "../../src/client/components/ConfirmDialog";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("ConfirmDialog checkbox", () => {
  it("can't be confirmed until the box is ticked", async () => {
    const dialog = document.createElement("confirm-dialog") as ConfirmDialog;
    dialog.message = "Delivered at once";
    dialog.checkboxLabel = "I waive my right of withdrawal";
    let confirmed = 0;
    dialog.addEventListener("confirm", () => confirmed++);
    document.body.appendChild(dialog);
    await dialog.updateComplete;
    await tick();

    const button = document.querySelector<HTMLButtonElement>(
      "[data-confirm-button]",
    )!;
    const box = document.querySelector<HTMLInputElement>(
      "[data-confirm-checkbox] input",
    )!;
    expect(button.disabled).toBe(true);
    button.click();
    expect(confirmed).toBe(0);

    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await dialog.updateComplete;
    await tick();
    expect(button.disabled).toBe(false);
    button.click();
    expect(confirmed).toBe(1);
    dialog.remove();
  });

  it("confirms directly without a checkbox", async () => {
    const dialog = document.createElement("confirm-dialog") as ConfirmDialog;
    dialog.message = "Sure?";
    document.body.appendChild(dialog);
    await dialog.updateComplete;
    await tick();
    expect(document.querySelector("[data-confirm-checkbox]")).toBeNull();
    expect(
      document.querySelector<HTMLButtonElement>("[data-confirm-button]")!
        .disabled,
    ).toBe(false);
    dialog.remove();
  });
});
