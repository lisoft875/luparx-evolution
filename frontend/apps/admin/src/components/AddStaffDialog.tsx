import * as React from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useCountries, useDocumentTypes } from '@luparx/features';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  ApiError,
  TENANT_GRANTABLE_ROLES,
  type IdentityDocumentType,
  type PersonMatch,
  type Portal,
  type Role,
} from '@luparx/api-client';
import { Alert, Badge, Button, FormField, Input, Modal, Select } from '@luparx/ui';

/** The app a role opens. One post per app, so this is also the key the grant collides on. */
function portalOf(role: Role): Portal {
  return role === 'INSPECTOR' || role === 'INSPECTOR_LEAD' ? 'inspector' : 'admin';
}

export interface AddStaffDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a post is granted, so the caller can refresh its list and say so. */
  onGranted: (person: PersonMatch, role: Role) => void;
  /** Called when the person is not on the platform yet and a file has to be opened for them. */
  onCreateNew: (seed: { email?: string; documentNumber?: string }) => void;
}

/**
 * Giving a post to somebody who is already registered (CONTRACT.md v0.26).
 *
 * <p>This dialog exists because of a very ordinary situation the platform used to have no answer
 * for: the person a municipality is about to hire already has an account, usually because they
 * parked downtown once and registered as a citizen. Creating them again is impossible — the identity
 * document is unique across the platform — and until now the administrator hit that wall with
 * nowhere to go from it.</p>
 *
 * <p>So the first question is not "what are this person's details" but "does this person already
 * exist", and it is asked the way one asks about a person one is looking at: with their identity
 * document, or with their email. It is an <b>exact match</b>, deliberately — the register behind it
 * is national, and a municipality gets to confirm somebody it can already name, not to browse.
 * There is no partial search, no list of results, and the address comes back masked.</p>
 *
 * <p>The person keeps one account and one set of personal data. Their citizen life is untouched:
 * they still park, still pay, still see their own fines. They simply hold one post more.</p>
 */
export function AddStaffDialog({ open, onClose, onGranted, onCreateNew }: AddStaffDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient, activeTenant } = useAuth();

  const [by, setBy] = useState<'DOCUMENT' | 'EMAIL'>('DOCUMENT');
  // The municipality's own country: the people a council hires overwhelmingly carry that country's
  // document, and it is read from the tenant rather than fixed in the code, so a council in another
  // country opens this dialog on its own catalogue.
  const [country, setCountry] = useState<string>(activeTenant?.countryCode ?? '');
  const [documentType, setDocumentType] = useState<IdentityDocumentType | ''>('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [match, setMatch] = useState<PersonMatch | null>(null);
  const [searched, setSearched] = useState(false);
  const [role, setRole] = useState<Role | ''>('');
  const [error, setError] = useState<string | null>(null);

  const countries = useCountries(apiClient);
  const documentTypes = useDocumentTypes(apiClient, country || undefined);

  React.useEffect(() => {
    if (!open) return;
    // Every opening starts clean. A dialog that remembered the last person looked up is one
    // mis-click away from granting a post to them.
    setMatch(null);
    setSearched(false);
    setRole('');
    setError(null);
    setEmail('');
    setDocumentNumber('');
    setCountry(activeTenant?.countryCode ?? '');
  }, [open, activeTenant?.countryCode]);

  // A single type in the country's catalogue is not a choice; picking it saves a click without
  // hiding anything.
  React.useEffect(() => {
    const types = documentTypes.data;
    if (types && types.length === 1 && documentType === '') {
      setDocumentType(types[0]!.type);
    }
  }, [documentTypes.data, documentType]);

  const canSearch =
    by === 'EMAIL' ? email.trim() !== '' : country !== '' && documentType !== '' && documentNumber.trim() !== '';

  function describe(err: unknown): string {
    if (!(err instanceof ApiError)) return t('common.error.generic');
    const known: Record<string, TranslationKey> = {
      RATE_LIMITED: 'admin.staff.add.error.rateLimited',
      INVALID_IDENTITY_DOCUMENT: 'admin.staff.add.error.documentInvalid',
      MEMBERSHIP_ALREADY_EXISTS: 'admin.staff.add.error.alreadyHasAccess',
      ROLE_NOT_ALLOWED_FOR_PORTAL: 'admin.users.create.error.ROLE_NOT_ALLOWED_FOR_PORTAL',
      VALIDATION_FAILED: 'admin.staff.add.error.documentInvalid',
    };
    const key = known[err.code];
    return key ? t(key) : t('common.error.generic');
  }

  const searchMutation = useMutation({
    mutationFn: () =>
      apiClient.adminUsers.lookup(
        by === 'EMAIL'
          ? { email: email.trim() }
          : {
              identityDocument: {
                countryCode: country,
                type: documentType as IdentityDocumentType,
                number: documentNumber.trim(),
              },
            },
      ),
    onSuccess: (response) => {
      setError(null);
      setSearched(true);
      setMatch(response.person);
      setRole('');
    },
    onError: (err) => {
      setSearched(false);
      setMatch(null);
      setError(describe(err));
    },
  });

  const grantMutation = useMutation({
    mutationFn: ({ person, granted }: { person: PersonMatch; granted: Role }) =>
      apiClient.adminMemberships.create({
        userId: person.userId,
        portal: portalOf(granted),
        role: granted,
      }),
    onSuccess: (_result, variables) => {
      setError(null);
      onGranted(variables.person, variables.granted);
    },
    onError: (err) => setError(describe(err)),
  });

  /** The apps this person already works in here — what makes a second post on the same app refused. */
  const occupiedPortals = new Set(
    (match?.accessHere ?? [])
      .filter((access) => access.portal !== 'citizen' && access.status !== 'REVOKED')
      .map((access) => access.portal),
  );

  return (
    <Modal open={open} onClose={onClose} title={t('admin.staff.add.title')} closeLabel={t('common.close')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {t('admin.staff.add.help')}
        </p>

        <Select
          aria-label={t('admin.staff.add.searchBy')}
          value={by}
          onChange={(value) => {
            setBy(value as 'DOCUMENT' | 'EMAIL');
            setSearched(false);
            setMatch(null);
            setError(null);
          }}
          options={[
            { value: 'DOCUMENT', label: t('admin.staff.add.by.document') },
            { value: 'EMAIL', label: t('admin.staff.add.by.email') },
          ]}
        />

        {by === 'DOCUMENT' ? (
          <>
            <FormField label={t('user.field.identityDocument.countryCode')}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={country}
                  onChange={(value) => {
                    setCountry(value);
                    setDocumentType('');
                  }}
                  placeholder={t('common.select.placeholder')}
                  options={(countries.data ?? []).map((entry) => ({
                    value: entry.code,
                    label: t(entry.nameKey as TranslationKey),
                  }))}
                />
              )}
            </FormField>
            <FormField label={t('user.field.identityDocument.type')}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={documentType}
                  onChange={(value) => setDocumentType(value as IdentityDocumentType)}
                  placeholder={t('common.select.placeholder')}
                  options={(documentTypes.data ?? []).map((entry) => ({
                    value: entry.type,
                    label: t(`document.type.${entry.type}` as TranslationKey),
                  }))}
                />
              )}
            </FormField>
            <FormField
              label={t('user.field.identityDocument.number')}
              hint={t('admin.staff.add.exactHint')}
            >
              {({ inputId, describedBy }) => (
                <Input
                  id={inputId}
                  aria-describedby={describedBy}
                  value={documentNumber}
                  onChange={(e) => {
                    setDocumentNumber(e.target.value);
                    setSearched(false);
                    setMatch(null);
                  }}
                />
              )}
            </FormField>
          </>
        ) : (
          <FormField label={t('user.field.email')} hint={t('admin.staff.add.exactHint')}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSearched(false);
                  setMatch(null);
                }}
              />
            )}
          </FormField>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {!match ? (
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              disabled={!canSearch}
              loading={searchMutation.isPending}
              onClick={() => searchMutation.mutate()}
            >
              {t('admin.staff.add.search')}
            </Button>
          </div>
        ) : null}

        {/* Nobody with that document or address. Not an error — it is the other normal answer, and
            it is the moment to open a file for them, with what was already typed carried over. */}
        {searched && !match ? (
          <Alert tone="info">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
              <span>{t('admin.staff.add.notFound')}</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  onCreateNew(
                    by === 'EMAIL'
                      ? { email: email.trim() }
                      : { documentNumber: documentNumber.trim() },
                  )
                }
              >
                {t('admin.staff.add.createNew')}
              </Button>
            </div>
          </Alert>
        ) : null}

        {match ? (
          <div className="lx-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
            <strong>{match.fullName ?? '—'}</strong>
            <span className="lx-text-meta">{match.maskedEmail}</span>
            {match.accountStatus === 'BLOCKED' ? (
              <Alert tone="warning">{t('admin.staff.add.blocked')}</Alert>
            ) : null}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {match.accessHere.length === 0 ? (
                <span className="lx-text-meta">{t('admin.staff.add.noAccessHere')}</span>
              ) : (
                match.accessHere.map((access) => (
                  <Badge key={`${access.portal}-${access.role}`} tone={access.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {t(`role.${access.role}` as TranslationKey)}
                  </Badge>
                ))
              )}
            </div>

            <FormField label={t('admin.users.create.roleLabel')} hint={t('admin.staff.add.rolePerApp')}>
              {({ inputId, describedBy }) => (
                <Select
                  id={inputId}
                  aria-describedby={describedBy}
                  value={role}
                  onChange={(value) => setRole(value as Role)}
                  placeholder={t('common.select.placeholder')}
                  // A role whose app this person already works in is shown and disabled, with the
                  // reason: hiding it would leave the administrator wondering where it went, and
                  // offering it would walk them into a conflict the server has to refuse.
                  options={TENANT_GRANTABLE_ROLES.map((option) => ({
                    value: option,
                    label: t(`role.${option}` as TranslationKey),
                    disabled: occupiedPortals.has(portalOf(option)),
                    detail: occupiedPortals.has(portalOf(option))
                      ? t('admin.staff.add.appTaken')
                      : undefined,
                  }))}
                />
              )}
            </FormField>

            <div className="lx-dialog-actions">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  setMatch(null);
                  setSearched(false);
                }}
              >
                {t('admin.staff.add.searchAgain')}
              </Button>
              <Button
                type="button"
                fullWidth
                disabled={role === ''}
                loading={grantMutation.isPending}
                onClick={() => role !== '' && grantMutation.mutate({ person: match, granted: role })}
              >
                {t('admin.staff.add.grant')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
