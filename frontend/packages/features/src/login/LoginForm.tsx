import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { OAuthProvider, Portal } from '@luparx/api-client';
import { oauthStartUrl } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Button, FormField, Input } from '@luparx/ui';

export interface LoginFormProps {
  portal: Portal;
  apiBaseUrl: string;
  onMfaRequired: () => void;
  onSuccess: () => void;
  forgotPasswordHref: string;
  /** Omit for portals with no self-registration (CONTRACT.md §0 — `platform` has no `/register` route at all). */
  registerHref?: string;
}

const OAUTH_PROVIDERS: OAuthProvider[] = ['google', 'microsoft', 'facebook'];

function buildLoginSchema(requiredMessage: string, emailInvalidMessage: string) {
  return z.object({
    email: z.string().min(1, requiredMessage).email(emailInvalidMessage),
    password: z.string().min(1, requiredMessage),
  });
}

type LoginValues = z.infer<ReturnType<typeof buildLoginSchema>>;

/** One per portal, never a shared entry screen (CONTRACT.md §0): each app mounts this with its own `portal`. */
export function LoginForm({
  portal,
  apiBaseUrl,
  onMfaRequired,
  onSuccess,
  forgotPasswordHref,
  registerHref,
}: LoginFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = buildLoginSchema(t('validation.required'), t('validation.email.invalid'));
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues): Promise<void> {
    setSubmitError(null);
    try {
      const result = await login(values);
      if (result.mfaRequired) {
        onMfaRequired();
      } else {
        onSuccess();
      }
    } catch {
      setSubmitError(t('auth.login.error.invalidCredentials'));
    }
  }

  function startOAuth(provider: OAuthProvider): void {
    window.location.href = oauthStartUrl(apiBaseUrl, portal, provider, window.location.origin);
  }

  return (
    <div>
      <h1>{t('auth.login.title')}</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        <FormField label={t('auth.login.emailLabel')} error={formState.errors.email?.message}>
          {({ inputId, describedBy }) => (
            <Input id={inputId} type="email" autoComplete="email" aria-describedby={describedBy} invalid={!!formState.errors.email} {...register('email')} />
          )}
        </FormField>
        <FormField label={t('auth.login.passwordLabel')} error={formState.errors.password?.message}>
          {({ inputId, describedBy }) => (
            <Input
              id={inputId}
              type="password"
              autoComplete="current-password"
              aria-describedby={describedBy}
              invalid={!!formState.errors.password}
              {...register('password')}
            />
          )}
        </FormField>
        <Button type="submit" fullWidth loading={formState.isSubmitting}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <p>
        <a href={forgotPasswordHref}>{t('auth.login.forgotPassword')}</a>
      </p>
      {registerHref ? (
        <p>
          {t('auth.login.noAccount')} <a href={registerHref}>{t('auth.login.registerLink')}</a>
        </p>
      ) : null}
      <p className="lx-field__hint">{t('auth.login.oauth.divider')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OAUTH_PROVIDERS.map((provider) => (
          <Button key={provider} type="button" variant="secondary" fullWidth onClick={() => startOAuth(provider)}>
            {t(`auth.login.oauth.${provider}` as TranslationKey)}
          </Button>
        ))}
      </div>
    </div>
  );
}
