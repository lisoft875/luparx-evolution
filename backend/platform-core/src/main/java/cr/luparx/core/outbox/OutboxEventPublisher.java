package cr.luparx.core.outbox;

/**
 * Output port for the transactional outbox. Implementations MUST write inside the caller's
 * transaction; a relay process publishes the rows later and marks {@code published_at}.
 */
public interface OutboxEventPublisher {

    void publish(OutboxEvent event);
}
