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
