# Plan: Dynamic Meeting Time Suggestions with 1h30 Interval

Implement a dynamic time suggestion system for CRM meetings that respects the 1h30 minimum interval, preventing scheduling conflicts by only showing available slots.

## Proposed Changes

### CRM Frontend (`src/pages/CRM.tsx`)

- **Add `getTimeSlots` utility**:
  - Generate 30-minute intervals from 08:00 to 18:00.
  - Filter out slots that are within 90 minutes of existing meetings on the selected date.
- **Update Lead Creation Modal**:
  - When `status === 'meeting'` is selected, show a "Data" and "Horário" picker.
  - Replace the free-text time input with a `Select` component populated by `getTimeSlots`.
  - Dynamically update available times when the date changes.
- **Update Re-scheduling Modal (`MeetingActions`)**:
  - Replace the `time` input with the same `Select` component.
  - Filter slots based on the newly selected date, excluding the current lead's own time slot if it's the same day.
- **Add Visual Feedback**:
  - Show a message if no slots are available for a chosen day.

### Documentation (`src/routes/index.tsx`)

- Update the documentation to reflect that the system now proactively prevents invalid schedules instead of just blocking them on save.

## Technical Details

- **Interval Logic**: `Math.abs(newMinutes - existingMinutes) < 90`.
- **UI Components**: Use `Select`, `SelectItem` from shadcn/ui.
- **State Management**: Local state in modals to track `selectedDate` for time filtering.
