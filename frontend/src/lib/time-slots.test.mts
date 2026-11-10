import assert from "node:assert/strict";
import test from "node:test";

import { isTimeSlotUnavailable } from "./time-slots.ts";

for (const duration of [1, 30, 60, 90, 480]) {
  test(`a ${duration}-minute booking reserves only its exact start time`, () => {
    const occupied = [{ appointment_time: "12:30", duration_minutes: duration }];

    assert.equal(isTimeSlotUnavailable("12:30", occupied), true);
    assert.equal(isTimeSlotUnavailable("12:30 PM", occupied), true);
    assert.equal(isTimeSlotUnavailable("12:30:00", occupied), true);
    assert.equal(isTimeSlotUnavailable("13:00", occupied), false);
    assert.equal(isTimeSlotUnavailable("1:00 PM", occupied), false);
    assert.equal(isTimeSlotUnavailable("11:00", occupied), false);
  });
}

test("each active booking reserves its own start time", () => {
  const occupied = [
    { appointment_time: "12:30", duration_minutes: 60 },
    { appointment_time: "13:00", duration_minutes: 480 },
  ];

  assert.equal(isTimeSlotUnavailable("12:30 PM", occupied), true);
  assert.equal(isTimeSlotUnavailable("1:00 PM", occupied), true);
  assert.equal(isTimeSlotUnavailable("2:00 PM", occupied), false);
});

test("a blocked time removes only its matching start time", () => {
  const blocked = [{ appointment_time: "12:30:00", duration_minutes: 480 }];

  assert.equal(isTimeSlotUnavailable("13:00", [], blocked), false);
  assert.equal(isTimeSlotUnavailable("12:30 PM", [], blocked), true);
});

test("bookings and blocks both reserve exact start times", () => {
  assert.equal(
    isTimeSlotUnavailable(
      "12:30",
      [{ appointment_time: "13:00" }],
      [{ appointment_time: "12:30" }],
    ),
    true,
  );
});

test("invalid availability times fail closed", () => {
  assert.equal(isTimeSlotUnavailable("invalid", []), true);
  assert.equal(isTimeSlotUnavailable("25:00", []), true);
  assert.equal(isTimeSlotUnavailable("13:00", [{ appointment_time: "invalid" }]), true);
  assert.equal(isTimeSlotUnavailable("13:00", [], [{ appointment_time: "invalid" }]), true);
});

test("midnight and noon reserve different start times", () => {
  assert.equal(isTimeSlotUnavailable("12:00 AM", [{ appointment_time: "00:00" }]), true);
  assert.equal(isTimeSlotUnavailable("12:00 PM", [{ appointment_time: "00:00" }]), false);
});
