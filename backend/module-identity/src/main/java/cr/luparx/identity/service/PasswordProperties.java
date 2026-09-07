package cr.luparx.identity.service;

/**
 * Argon2id parameters and password policy, all configurable per environment.
 *
 * <p>The defaults follow the OWASP Password Storage Cheat Sheet recommendation for Argon2id
 * (m=19 MiB, t=2, p=1) rounded up to 64 MiB of memory, which is comfortably affordable on a server
 * sized for this platform and materially raises the cost of an offline attack. Raising the cost
 * later is safe: the parameters are encoded inside every stored hash, so old hashes keep verifying
 * and are re-hashed on the next successful login.</p>
 *
 * @param minLength      minimum accepted password length (the client enforces the same value for UX)
 * @param memoryKib      Argon2 memory cost in KiB
 * @param iterations     Argon2 time cost
 * @param parallelism    Argon2 lanes
 * @param saltLength     salt size in bytes
 * @param hashLength     derived key size in bytes
 */
public record PasswordProperties(
        int minLength,
        int memoryKib,
        int iterations,
        int parallelism,
        int saltLength,
        int hashLength) {

    public static PasswordProperties defaults() {
        return new PasswordProperties(10, 65536, 3, 1, 16, 32);
    }
}
