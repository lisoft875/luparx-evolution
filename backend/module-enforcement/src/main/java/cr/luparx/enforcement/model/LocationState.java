package cr.luparx.enforcement.model;

/**
 * Why an act does or does not carry coordinates (CONTRACT.md v0.29).
 *
 * <p>Until v0.29 all three collapsed into "latitude is null", so a refusal, a timeout and a device
 * with no signal were the same row — and none of them could be told from the others when somebody
 * later asked whether the officer had actually been there. They are three different facts about
 * three different situations, and only one of them is about the officer's choice.</p>
 *
 * <p>Nothing here ever invents a position. A last-known fix or a zone centroid would make every one
 * of these read as {@link #FIX}, which is the one lie this record must never tell.</p>
 */
public enum LocationState {

    /** Coordinates were obtained, and they are on the row. */
    FIX,
    /**
     * The officer had already granted location on this device and no fix arrived — no signal, a
     * timeout, a phone indoors. The permission is not the problem, and saying "not granted" here
     * would blame the officer for a satellite.
     */
    NO_FIX,
    /**
     * Location has not been granted on this device. Also the state of every act recorded before
     * v0.29, and of any client that does not send one — the honest default when nothing is known.
     */
    NOT_GRANTED
}
