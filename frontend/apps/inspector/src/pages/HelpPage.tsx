import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Card, CardStack, SectionHeader } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';

/**
 * Ayuda: lo que hay que saber para trabajar un turno, y nada más.
 *
 * <h2>Por qué es corta</h2>
 *
 * <p>La especificación pide «una guía breve, orientada al uso en campo» y «no sobrecargar la
 * pantalla». Esto se lee de pie, en la calle, a veces con el sol de frente y con guantes: cinco
 * preguntas que de verdad aparecen en un turno, en el orden en que aparecen. Un manual completo no
 * se leería nunca, y tener uno da la falsa impresión de que el asunto está resuelto.</p>
 *
 * <h2>Por qué el texto vive en las traducciones y no acá</h2>
 *
 * <p>Porque es contenido, no código: se corrige sin recompilar y se traduce con el resto. Las
 * entradas se declaran como una lista de claves para que agregar una sea agregar dos líneas al
 * catálogo y un elemento a este arreglo — y para que ninguna quede escrita a mano en español en
 * medio de un componente.</p>
 */
const TEMAS = ['offline', 'plate', 'citation', 'evidence', 'queue'] as const;

export function HelpPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <InspectorShell title={t('inspector.help.title')} onBack={() => navigate('/more')}>
      <CardStack>
        {TEMAS.map((tema) => (
          <Card key={tema}>
            <SectionHeader title={t(`inspector.help.${tema}.title` as TranslationKey)} />
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t(`inspector.help.${tema}.body` as TranslationKey)}
            </p>
          </Card>
        ))}
      </CardStack>
    </InspectorShell>
  );
}
