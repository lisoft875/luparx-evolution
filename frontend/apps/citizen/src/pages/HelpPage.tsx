import * as React from 'react';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Card, CardStack, SectionHeader } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/**
 * Ayuda del ciudadano: las preguntas que llegan al mostrador.
 *
 * <h2>Cómo se eligieron</h2>
 *
 * <p>No son «preguntas frecuentes» inventadas. Son las que el producto ya contesta de alguna forma
 * —en un mensaje de error, en un texto de ayuda de un campo, en una regla de negocio— y que alguien
 * sólo puede encontrar tropezándose con ellas. Reunirlas acá no agrega comportamiento: agrega un
 * lugar donde buscarlas antes de tropezar.</p>
 *
 * <p>El texto vive en el catálogo de traducciones, como en la ayuda del fiscalizador: es contenido,
 * se corrige sin recompilar y se traduce con el resto.</p>
 */
const TEMAS = ['park', 'extend', 'fine', 'appeal', 'wallet', 'plate'] as const;

export function HelpPage(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <CitizenShell bare heading={<h1 className="lx-text-screen-title">{t('citizen.help.title')}</h1>}>
      <CardStack>
        {TEMAS.map((tema) => (
          <Card key={tema}>
            <SectionHeader title={t(`citizen.help.${tema}.title` as TranslationKey)} />
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t(`citizen.help.${tema}.body` as TranslationKey)}
            </p>
          </Card>
        ))}
      </CardStack>
    </CitizenShell>
  );
}
