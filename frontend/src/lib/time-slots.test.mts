import assert from "node:assert/strict";
import test from "node:test";

import { isTimeSlotUnavailable } from "./time-slots.ts";

test("an explicit open slot remains available over a standard booking interval", () => {
  assert.equal(
    isTimeSlotUnavailable(
      "10:30",
      60,
      [{ appointment_time: "10:00", duration_minutes: 60 }],
      ["10:30"],
    ),
    false,
  );
});

test("an explicit open slot is unavailable after it is booked", () => {
  assert.equal(
    isTimeSlotUnavailable(
      "10:30",
      60,
      [{ appointment_time: "10:30", duration_minutes: 60 }],
      ["10:30"],
    ),
    true,
  );
});
