// How much reading one activity is allowed to carry on a report.
//
// The library keeps every article worth attaching to an activity, and some
// activities have collected a dozen. All of them on one report is a catalogue:
// a reader who is offered twelve links reads none, and a shortlist that long
// stops reading as a recommendation and starts reading as everything we had.
//
// Two is the shortlist. It fits beside the finding it belongs to, it is short
// enough to be read in the room, and the order is the library's own sort_order
// — so which two is an editorial decision made in Settings → Resources rather
// than an accident of insertion order.
export const MAX_READING_PER_ACTIVITY = 2;

export const capReading = (items) => items.slice(0, MAX_READING_PER_ACTIVITY);
