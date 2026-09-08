import * as React from 'react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { OAuthProvider, Portal } from '@luparx/api-client';
import { oauthStartUrl } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Button, FormField, IconEye, IconEyeOff, Input } from '@luparx/ui';

export interface LoginFormProps {
  portal: Portal;
  apiBaseUrl: string;
  onMfaRequired: () => void;
  onSuccess: () => void;
  forgotPasswordHref: string;
  /** Omit for portals with no self-registration (CONTRACT.md §0 — `platform` has no `/register` route at all). */
  registerHref?: string;
  /** Muted one-line subtitle under the card title, e.g. t('auth.portal.citizen.title'). */
  subtitle: string;
  /** Optional extra notice under the subtitle, e.g. t('auth.login.mfaMandatoryNotice') for `platform`. */
  notice?: string;
}

const OAUTH_PROVIDERS: OAuthProvider[] = ['google', 'microsoft', 'facebook'];

function buildLoginSchema(requiredMessage: string, emailInvalidMessage: string) {
  return z.object({
    email: z
      .string()
      // Trim first so "  user@x.com  " never fails the required/format checks below,
      // then normalize to lowercase — email is the login's natural key (CONTRACT.md §1).
      .transform((value) => value.trim())
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: requiredMessage });
          return;
        }
        if (!z.string().email().safeParse(value).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: emailInvalidMessage });
        }
      })
      .transform((value) => value.toLowerCase()),
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
  subtitle,
  notice,
}: LoginFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const schema = buildLoginSchema(t('validation.required'), t('validation.email.invalid'));
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const emailField = register('email');

  // Autofocus the email field only on desktop widths — on mobile, focusing on
  // mount would pop the keyboard open immediately under the freshly-loaded card.
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(min-width: 1024px)').matches) {
      emailInputRef.current?.focus();
    }
    // Runs once on mount only — this is an initial-focus effect, not a responsive one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="lx-card lx-auth-card">
      <h1 className="lx-auth-card__title">{t('auth.login.title')}</h1>
      <p className="lx-auth-card__subtitle">{subtitle}</p>
      {notice ? <p className="lx-auth-card__notice">{notice}</p> : null}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        <FormField label={t('auth.login.emailLabel')} error={formState.errors.email?.message}>
          {({ inputId, describedBy }) => (
            <Input
              id={inputId}
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={describedBy}
              invalid={!!formState.errors.email}
              {...emailField}
              ref={(el) => {
                emailField.ref(el);
                emailInputRef.current = el;
              }}
              onBlur={(event) => {
                // Trim visibly on blur (CONTRACT.md — trailing/leading spaces in email
                // were causing real login failures); final lowercase happens on submit.
                event.target.value = event.target.value.trim();
                emailField.onBlur(event);
              }}
            />
          )}
        </FormField>
        <FormField label={t('auth.login.passwordLabel')} error={formState.errors.password?.message}>
          {({ inputId, describedBy }) => (
            <div className="lx-password-field">
              <Input
                id={inputId}
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                aria-describedby={describedBy}
                invalid={!!formState.errors.password}
                {...register('password')}
              />
              <button
                type="button"
                className="lx-password-field__toggle"
                aria-pressed={passwordVisible}
                aria-label={t(passwordVisible ? 'auth.login.passwordToggle.hide' : 'auth.login.passwordToggle.show')}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          )}
        </FormField>
        <Button type="submit" fullWidth loading={formState.isSubmitting}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <hr className="lx-auth-card__divider" />
      <p className="lx-auth-card__link-row">
        <a href={forgotPasswordHref} className="lx-link-button">
          {t('auth.login.forgotPassword')}
        </a>
      </p>
      <hr className="lx-auth-card__divider" />
      {registerHref ? (
        <p className="lx-auth-card__footer-line">
          {t('auth.login.noAccount')}{' '}
          <a href={registerHref}>
            <strong>{t('auth.login.registerLink')}</strong>
          </a>
        </p>
      ) : (
        <p className="lx-auth-card__footer-line">{t('auth.login.platformNoRegister')}</p>
      )}
      <div className="lx-auth-card__oauth">
        <hr className="lx-auth-card__divider" />
        <p className="lx-auth-card__oauth-label">{t('auth.login.oauth.divider')}</p>
        <div className="lx-auth-card__oauth-buttons">
          {OAUTH_PROVIDERS.map((provider) => (
            <Button key={provider} type="button" variant="secondary" fullWidth onClick={() => startOAuth(provider)}>
              {t(`auth.login.oauth.${provider}` as TranslationKey)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
