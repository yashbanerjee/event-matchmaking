import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySlots, scheduleGreedy } from './scheduler.js';

describe('scheduleGreedy', () => {
  it('does not double-book a participant', () => {
    const slots = buildDailySlots({
      date: '2026-11-01',
      startTime: '09:00',
      meetingDurationMinutes: 30,
      bufferMinutes: 10,
      slotCount: 2,
    });

    const result = scheduleGreedy(
      [
        { companyOrgId: 'c1', vendorOrgId: 'v1', score: 90 },
        { companyOrgId: 'c1', vendorOrgId: 'v2', score: 80 },
        { companyOrgId: 'c2', vendorOrgId: 'v1', score: 70 },
      ],
      slots,
      { maxMeetingsPerParticipant: 6 },
    );

    const c1Slots = result.assignments
      .filter((a) => a.companyOrgId === 'c1')
      .map((a) => a.slotIndex);
    assert.equal(new Set(c1Slots).size, c1Slots.length);

    const v1Slots = result.assignments
      .filter((a) => a.vendorOrgId === 'v1')
      .map((a) => a.slotIndex);
    assert.equal(new Set(v1Slots).size, v1Slots.length);
  });

  it('schedules each company–vendor pair at most once', () => {
    const slots = buildDailySlots({
      date: '2026-11-01',
      startTime: '09:00',
      meetingDurationMinutes: 15,
      bufferMinutes: 5,
      slotCount: 4,
    });

    const result = scheduleGreedy(
      [
        { companyOrgId: 'c1', vendorOrgId: 'v1', score: 90 },
        { companyOrgId: 'c1', vendorOrgId: 'v1', score: 85 },
        { companyOrgId: 'c2', vendorOrgId: 'v1', score: 80 },
      ],
      slots,
      { maxMeetingsPerParticipant: 6, vendorGapSlots: 0 },
    );

    const pairCount = result.assignments.filter(
      (a) => a.companyOrgId === 'c1' && a.vendorOrgId === 'v1',
    ).length;
    assert.equal(pairCount, 1);
    assert.ok(result.unassigned.some((u) => u.score === 85));
  });

  it('prefers a gap between vendor meetings when possible', () => {
    const slots = buildDailySlots({
      date: '2026-11-01',
      startTime: '09:00',
      meetingDurationMinutes: 15,
      bufferMinutes: 0,
      slotCount: 4,
    });

    const result = scheduleGreedy(
      [
        { companyOrgId: 'c1', vendorOrgId: 'v1', score: 90 },
        { companyOrgId: 'c2', vendorOrgId: 'v1', score: 80 },
      ],
      slots,
      { maxMeetingsPerParticipant: 6, vendorGapSlots: 1 },
    );

    const v1Slots = result.assignments
      .filter((a) => a.vendorOrgId === 'v1')
      .map((a) => a.slotIndex)
      .sort((a, b) => a - b);

    assert.equal(v1Slots.length, 2);
    assert.ok(v1Slots[1]! - v1Slots[0]! >= 2);
  });

  it('marks exclude intervals as break slots', () => {
    const slots = buildDailySlots({
      date: '2026-11-01',
      startTime: '09:00',
      endTime: '14:00',
      meetingDurationMinutes: 60,
      bufferMinutes: 0,
      excludeIntervals: [{ startTime: '12:00', endTime: '13:00' }],
    });

    const breakSlots = slots.filter((s) => s.isBreak);
    assert.ok(breakSlots.length >= 1);
    assert.ok(
      breakSlots.some(
        (s) =>
          s.startsAt.getUTCHours() === 12 && s.startsAt.getUTCMinutes() === 0,
      ),
    );
  });

  it('respects max meetings per participant', () => {
    const slots = buildDailySlots({
      date: '2026-11-01',
      startTime: '09:00',
      meetingDurationMinutes: 30,
      bufferMinutes: 0,
      slotCount: 3,
    });

    const result = scheduleGreedy(
      [
        { companyOrgId: 'c1', vendorOrgId: 'v1', score: 90 },
        { companyOrgId: 'c1', vendorOrgId: 'v2', score: 80 },
      ],
      slots,
      { maxMeetingsPerParticipant: 1 },
    );

    assert.equal(
      result.assignments.filter((a) => a.companyOrgId === 'c1').length,
      1,
    );
    assert.equal(result.unassigned.length, 1);
  });
});
