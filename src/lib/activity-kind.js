// What kind of row an Activity is, as a rule with nothing behind it.
//
// Its own file because it is a pure predicate and activities.js is not: that
// module builds the backend client on import, which means anything wanting this
// one line used to drag the whole SDK along with it. health-checks.js is pure
// by design — given records and a clock, it returns the checks — and could not
// be tested without standing up a browser for a client it never calls.
//
// A library activity is shared across assessments and is not an instrument's
// own question. Instrument questions carry no assessment_id either, so testing
// both fields is what separates the three kinds of row this entity holds.
export const isLibraryActivity = (a) => !a.assessment_id && !(a.instrument_ids || []).length;
