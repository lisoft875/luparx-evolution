import * as React from 'react';
import { useAuth } from '@luparx/auth';
import { ChangeEmailForm, ChangePasswordForm, LocaleSwitcher, ProfileForm } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { useNavigate } from 'react-router-dom';
import { Card, CardStack, FormField, SectionHeader } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';

/**
 * "My account" for the inspector portal (CONTRACT.md v0.3 §"Perfil editable"): the same personal
 * fields as registration, the e-mail behind its own verified flow, and the password behind its
 * own. There is no two-step verification section because the product has no second factor at all
 * (CONTRACT.md v0.20).
 *
 * <h2>Por qué va dentro de InspectorShell y no de PageLayout</h2>
 *
 * <p>Porque esta pantalla vive DENTRO de Fiscalización. Usaba `PageLayout`, que es el armazón de
 * escritorio —barra superior y menú lateral— y no trae la barra inferior de cinco destinos. El
 * efecto era que al entrar en «Más → Mi perfil» la navegación del módulo desaparecía y no había
 * forma de volver a Consulta, Boleta, Mis boletas o Pendientes sin el botón atrás del navegador.</p>
 *
 * <p>Es la única pantalla de este portal que estaba fuera del armazón: las otras cinco ya lo usan.
 * No hacía falta un layout nuevo ni una barra propia —la especificación del 24-09-2026 lo prohíbe
 * expresamente— sino poner esta pantalla donde ya estaban las demás.</p>
 */
export function ProfilePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { me } = useAuth();
  const navigate = useNavigate();

  return (
    // El botón de regreso lleva a Consulta, que es la raíz del módulo: quien entró acá desde «Más»
    // quiere salir de la configuración, no volver a la lista de la que vino.
    <InspectorShell title={t('profile.title')} onBack={() => navigate('/')}>
      {me?.user ? (
        <CardStack>
          <Card>
            <SectionHeader title={t('citizen.profile.personalData.label')} />
            <ProfileForm profile={me.user} />
          </Card>
          <Card>
            <SectionHeader title={t('account.email.title')} />
            <ChangeEmailForm currentEmail={me.user.email} />
          </Card>
          <Card>
            <SectionHeader title={t('account.password.label')} />
            <ChangePasswordForm />
          </Card>
          <Card>
            <SectionHeader title={t('citizen.profile.language.label')} />
            <FormField label={t('common.languageSwitcher.label')} hint={t('account.language.meta')}>
              {({ inputId }) => <LocaleSwitcher id={inputId} />}
            </FormField>
          </Card>
        </CardStack>
      ) : (
        <p>{t('common.loading')}</p>
      )}
    </InspectorShell>
  );
}
