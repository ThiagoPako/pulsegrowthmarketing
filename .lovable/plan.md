# Plan: Backend Validation for CRM Meeting Intervals

Implement a server-side check in `vps-api-server/server.mjs` to enforce the 1h30 minimum interval between meetings, ensuring data integrity even if client-side validation is bypassed.

## Proposed Changes

### VPS API Server (`vps-api-server/server.mjs`)

- **Add `validateMeetingInterval` helper**:
  - A function that queries `crm_leads` for existing meetings on a specific date.
  - Checks if a new or updated meeting time conflicts with any existing one (interval < 90 minutes).
- **Update `insert` operation for `crm_leads`**:
  - Intercept insertions where `status === 'meeting'`.
  - Perform the interval validation before allowing the `INSERT`.
- **Update `update` operation for `crm_leads`**:
  - Intercept updates that change `meeting_date`, `meeting_time`, or set `status === 'meeting'`.
  - Perform the interval validation before allowing the `UPDATE`.
- **Error Handling**:
  - Return a `409 Conflict` or `400 Bad Request` with a clear message if a conflict is detected.

### Documentation (`src/routes/index.tsx`)

- Update the documentation to reflect that the system now has "Atomic Backend Validation" for meeting schedules.

## Technical Details

- **Conflict Query**:
  ```sql
  SELECT id, meeting_time FROM crm_leads 
  WHERE meeting_date = $1 AND meeting_time IS NOT NULL AND id != $2
  ```
- **Time Calculation**: Convert `HH:mm` to minutes from midnight and check `Math.abs(t1 - t2) < 90`.
- **Integration Point**: Inside the `case 'insert'` and `case 'update'` blocks in `app.post('/api/db/query', ...)`.
