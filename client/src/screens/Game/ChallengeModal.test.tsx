import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChallengeModal } from "./ChallengeModal";

describe("ChallengeModal", () => {
  it("renders title, description, and action buttons", () => {
    render(
      <ChallengeModal
        title="Find the dragon mural"
        description="Take a photo of the red dragon tile mosaic near the platform."
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Station challenge" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Find the dragon mural" })).toBeInTheDocument();
    expect(
      screen.getByText("Take a photo of the red dragon tile mosaic near the platform."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete challenge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abandon challenge" })).toBeInTheDocument();
  });

  it("preserves line breaks in the challenge description", () => {
    render(
      <ChallengeModal
        title="High Park Station"
        description={"Intro paragraph.\n\nQ: First?\nA: Answer one"}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.querySelector(".challenge-modal__description")?.textContent).toBe(
      "Intro paragraph.\n\nQ: First?\nA: Answer one",
    );
  });

  it("does not render an image area when no imageUrl is provided", () => {
    render(
      <ChallengeModal
        title="Count the tiles"
        description={null}
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Challenge illustration")).not.toBeInTheDocument();
    expect(document.querySelector(".challenge-modal__image")).toBeNull();
  });

  it("renders the challenge image when imageUrl is set", () => {
    render(
      <ChallengeModal
        title="Spot the station sign"
        description="Locate the vintage TTC sign."
        imageUrl="https://example.com/challenge.jpg"
        onComplete={vi.fn()}
        onAbandon={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.querySelector(".challenge-modal__image-media")).toHaveAttribute(
      "src",
      "https://example.com/challenge.jpg",
    );
  });

  it("calls onComplete, onAbandon, and onClose", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onAbandon = vi.fn();
    const onClose = vi.fn();

    render(
      <ChallengeModal
        title="Wave at the conductor"
        description="Say hello!"
        onComplete={onComplete}
        onAbandon={onAbandon}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Complete challenge" }));
    await user.click(screen.getByRole("button", { name: "Abandon challenge" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onAbandon).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
