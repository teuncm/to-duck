import { describe, expect, it } from "vitest";
import { createPredictor } from "./predictor.js";

describe("instant English n-gram predictions", () => {
  it("predicts immediately from bundled English without any saved tasks", () => {
    const model = createPredictor();
    expect(model.predict("Please send ")).toBe("me");
    expect(model.predict("Please se")).toBe("nd me");
    expect(model.predict("I would like to ")).toBe("go");
    expect(typeof model.predict("Buy ")).toBe("string");
  });
  it("prioritizes saved phrases and backs off to their word context", () => {
    const model = createPredictor(["Please send the invoice"]);
    expect(model.predict("PLEASE SEND ")).toBe("the invoice");
    expect(model.predict("Please se")).toBe("nd the invoice");
    expect(model.predict("Tomorrow please send ")).toBe("the invoice");
  });
  it("prefers familiar next steps in recurring routines", () => {
    const model = createPredictor(["Dry dishes", "Dry laundry"], ["Wash laundry", "Dry laundry", "Wash laundry"]);
    expect(model.predict("Dry ")).toBe("laundry");
  });
  it("learns word transitions from repeated tasks, even with an unfamiliar beginning", () => {
    const model = createPredictor([], ["Send the invoice", "Send the invoice", "Send the invoice"]);
    expect(model.predict("Tomorrow send the ")).toBe("invoice");
  });
  it("does not invent a continuation for blank, punctuation, or unknown context", () => {
    const model = createPredictor();
    for (const text of ["", " ", "a", "qzxw ", "Done!", "<script>"]) {
      expect(model.predict(text)).toBe("");
    }
  });
  it("offers a longer known phrase but only one word when choices are uncertain", () => {
    expect(createPredictor(["Buy apples for dessert"]).predict("Buy ")).toBe("apples for dessert");
    expect(createPredictor(["Buy apples for dessert", "Buy oranges for juice"]).predict("Buy ")).toBe("apples");
    expect(createPredictor().predict("I need to ")).toBe("get");
  });
  it("does not turn a typo match into an inline correction", () => {
    const model = createPredictor(["Buy groceries"]);
    expect(model.predict("buy grocr")).toBe("");
  });
  it("respects the task length limit", () => {
    const model = createPredictor();
    const input = "x".repeat(229) + " Please se";
    expect((input + model.predict(input)).length).toBeLessThanOrEqual(240);
    expect(model.predict("x".repeat(240))).toBe("");
  });
});
