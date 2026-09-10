package cr.luparx.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Entry point of the LupaRX modular monolith.
 *
 * <p>Component, entity and repository scanning is declared explicitly over {@code cr.luparx} rather
 * than relying on the package of this class: the bounded contexts live in sibling Maven modules
 * (module-geo, module-identity, module-tenancy, module-parking) and are deliberately <em>not</em>
 * sub-packages of the application. Making the scan explicit keeps that layout honest.</p>
 */
@SpringBootApplication(scanBasePackages = "cr.luparx")
@EntityScan(basePackages = "cr.luparx")
@EnableJpaRepositories(basePackages = "cr.luparx")
@ConfigurationPropertiesScan(basePackages = "cr.luparx.app.config")
@EnableTransactionManagement
/*
 * Scheduling, as of v0.29 and not before: until the retention purge there was nothing to schedule,
 * and a scheduler with no jobs is a thread pool and a promise. Every job that runs under it must be
 * safe on several instances at once — they all run the same schedule — which is what
 * {@code PlatformJobLock} is for.
 */
@EnableScheduling
public class LuparxApplication {

    public static void main(String[] args) {
        SpringApplication.run(LuparxApplication.class, args);
    }
}
