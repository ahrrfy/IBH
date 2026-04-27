// DI token used to multi-collect every registered AutopilotJob provider.
// Each job provider attaches itself to this multi-token; the engine reads
// the array in its constructor. Keeping the token in its own file avoids
// circular imports between the engine service and the jobs.
export const AUTOPILOT_JOBS = Symbol('AUTOPILOT_JOBS');
