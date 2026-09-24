import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime, type TranslationKey } from '@luparx/i18n';
import {
  ApiError,
  TENANT_GRANTABLE_ROLES,
  type MembershipStatus,
  type Role,
  type StaffInvitation,
  type StaffMember,
} from '@luparx/api-client';
import { Alert, Badge, Button, Input, Modal, Pagination, Select, Table } from '@luparx/ui';
import { AddStaffDialog } from '../components/AddStaffDialog';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

/** The colour of a post's state. Never the only signal — the label beside it says the same thing. */
const STATUS_TONE: Record<MembershipStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  PENDING_APPROVAL: 'neutral',
  REJECTED: 'danger',
  REVOKED: 'danger',
};

/**
 * The staff administration panel of a municipality (CONTRACT.md v0.15).
 *
 * <p>One row per <em>post</em> and not per person: the same person can be an inspector here and
 * something else elsewhere, and each post answers the same four questions — who holds it, what it
 * lets them do, which sectors it covers, and whether the account is still being used.</p>
 *
 * <p>Suspended and revoked posts stay on the list. This is where a suspension is lifted, and where
 * somebody looks up months later who held a post in March; a list that dropped them would answer
 * neither. What is never dropped is what they did: deactivating an officer does not touch a single
 * citation, and the panel says so where the action is taken rather than in a manual.</p>
 */
export function StaffPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<MembershipStatus | ''>('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [changingRole, setChangingRole] = useState<StaffMember | null>(null);
  const [nextRole, setNextRole] = useState<Role | ''>('');
  const [suspending, setSuspending] = useState<StaffMember | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  // Revocar no se levanta y hasta hoy se disparaba con un solo clic, sin preguntar, mientras que
  // Desactivar —que sí se levanta— sí preguntaba. La confirmación estaba en el lado equivocado.
  const [revoking, setRevoking] = useState<StaffMember | null>(null);
  const [zoning, setZoning] = useState<StaffMember | null>(null);
  const [zoneSelection, setZoneSelection] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'staff', { status, page }],
    queryFn: () => apiClient.adminStaff.list({ status: status || undefined, page, size: PAGE_SIZE }),
  });

  // Invitations that are still waiting (CONTRACT.md v0.27). Only the pending ones: an accepted one
  // has become a post and is already a row in the table above, and showing it twice would make the
  // panel answer "how many people work here" wrongly.
  const invitationsQuery = useQuery({
    queryKey: ['admin', 'staff-invitations'],
    queryFn: () => apiClient.adminStaffInvitations.list({ status: 'PENDING', size: 50 }),
  });

  // The municipality's own sectors, for the assignment dialog. The same list the inspector app is
  // offered, so an administrator cannot assign something that does not exist to work in.
  const zonesQuery = useQuery({
    queryKey: ['admin', 'zones'],
    queryFn: () => apiClient.adminParking.zones(),
  });

  function afterChange(message: TranslationKey): () => void {
    return () => {
      setError(null);
      setFeedback(t(message));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
    };
  }
  /**
   * Un fallo que la persona pueda leer.
   *
   * <p>«No se pudo completar la operación» para todo era lo que había, y para el caso que de verdad
   * ocurrió —intentar terminar el propio puesto— es una respuesta inútil: no dice qué pasó ni qué
   * hacer. El servidor manda un código estable; se traduce el que tiene traducción y se cae al
   * genérico para el resto.</p>
   */
  function onFailure(causa: unknown): void {
    setFeedback(null);
    const codigo = causa instanceof ApiError ? causa.code : null;
    setError(codigo === 'MEMBERSHIP_SELF_MODIFICATION_DENIED' ? t('admin.staff.error.self') : t('admin.staff.error'));
  }

  const suspendMutation = useMutation({
    mutationFn: (member: StaffMember) =>
      apiClient.adminStaff.suspend(member.membershipId, { reason: suspendReason.trim() || undefined }),
    onSuccess: () => {
      setSuspending(null);
      setSuspendReason('');
      afterChange('admin.staff.suspended')();
    },
    onError: onFailure,
  });
  const reactivateMutation = useMutation({
    mutationFn: (member: StaffMember) => apiClient.adminStaff.reactivate(member.membershipId),
    onSuccess: afterChange('admin.staff.reactivated'),
    onError: onFailure,
  });
  const revokeMutation = useMutation({
    mutationFn: (member: StaffMember) => apiClient.adminMemberships.remove(member.membershipId),
    onSuccess: () => {
      setRevoking(null);
      afterChange('admin.staff.revoked')();
    },
    onError: (causa) => {
      setRevoking(null);
      onFailure(causa);
    },
  });
  const resetMutation = useMutation({
    mutationFn: (member: StaffMember) => apiClient.adminUsers.forcePasswordReset(member.userId),
    onSuccess: afterChange('admin.staff.resetSent'),
    onError: onFailure,
  });
  const changeRoleMutation = useMutation({
    mutationFn: ({ member, role }: { member: StaffMember; role: Role }) =>
      apiClient.adminMemberships.update(member.membershipId, { role }),
    onSuccess: () => {
      setChangingRole(null);
      afterChange('admin.staff.changeRole.done')();
    },
    onError: onFailure,
  });
  const resendMutation = useMutation({
    mutationFn: (invitation: StaffInvitation) => apiClient.adminStaffInvitations.resend(invitation.id),
    onSuccess: () => {
      setError(null);
      setFeedback(t('admin.staff.invitations.resent'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'staff-invitations'] });
    },
    onError: onFailure,
  });
  const revokeInvitationMutation = useMutation({
    mutationFn: (invitation: StaffInvitation) => apiClient.adminStaffInvitations.revoke(invitation.id),
    onSuccess: () => {
      setError(null);
      setFeedback(t('admin.staff.invitations.revoked'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'staff-invitations'] });
    },
    onError: onFailure,
  });
  const zonesMutation = useMutation({
    mutationFn: (member: StaffMember) =>
      apiClient.adminStaff.assignZones(member.membershipId, { zoneIds: zoneSelection }),
    onSuccess: () => {
      setZoning(null);
      afterChange('admin.staff.zonesAssigned')();
    },
    onError: onFailure,
  });

  /**
   * Si ESTA fila es la que está esperando respuesta.
   *
   * <p>`isPending` a secas es de la mutación, no de la fila: con él, pulsar «Revocar» en una fila
   * ponía a girar el botón de las veinte. `variables` es el argumento con el que se llamó, así que
   * comparar la membresía es la pregunta correcta.</p>
   *
   * <p>Que un botón diga que está trabajando es la mitad del §2.1 del informe: sin eso, la única
   * diferencia entre «no pasó nada» y «está pasando» es la paciencia de quien mira.</p>
   */
  function enCurso(mutacion: { isPending: boolean; variables?: StaffMember }, member: StaffMember): boolean {
    return mutacion.isPending && mutacion.variables?.membershipId === member.membershipId;
  }

  /** Mientras una acción de esta fila está en vuelo, las demás de la misma fila no se pueden pulsar. */
  function ocupada(member: StaffMember): boolean {
    return (
      enCurso(revokeMutation, member)
      || enCurso(suspendMutation, member)
      || enCurso(reactivateMutation, member)
      || enCurso(resetMutation, member)
    );
  }

  /**
   * Los roles a los que ESTE puesto puede cambiar.
   *
   * <p>Un rol pertenece a una app y sólo a una, así que la lista se limita a la del puesto — y se
   * excluye el que ya tiene, porque «cambiar a lo mismo» no es una opción, es ruido que además
   * dejaba el botón de guardar apagado sin explicar por qué.</p>
   *
   * <p>La comparación normaliza mayúsculas por lo mismo que lo hace `belongsToPortal` en la sesión:
   * es la última línea de defensa si algún día otro camino vuelve a mandar el portal en el formato
   * del enum. El arreglo de verdad está en el servidor; esto sólo hace que, si vuelve a pasar, no
   * sea esta pantalla la que mienta.</p>
   */
  const rolesDisponibles = useMemo(() => {
    if (changingRole === null) return [];
    const appDelPuesto = String(changingRole.portal).toLowerCase();
    return TENANT_GRANTABLE_ROLES.filter((role) => {
      const appDelRol = role === 'INSPECTOR' || role === 'INSPECTOR_LEAD' ? 'inspector' : 'admin';
      return appDelRol === appDelPuesto && role !== changingRole.role;
    });
  }, [changingRole]);

  const data = query.data;

  return (
    <AdminShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>{t('admin.staff.title')}</h1>
        <RequirePermission permission="ROLE_ASSIGN">
          {/* One door, and it opens on the right first question. Hiring somebody starts with "does
              this person already exist here" — most of the time they do, because they parked
              downtown once — and opening the creation form first is what used to walk an
              administrator into a conflict with nowhere to go (CONTRACT.md v0.26). */}
          <Button type="button" onClick={() => setAdding(true)}>
            {t('admin.staff.add.title')}
          </Button>
        </RequirePermission>
      </div>
      <p className="lx-text-meta">{t('admin.staff.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {/* Una consulta que falla al refrescarse deja en pantalla los datos anteriores: es lo correcto
          —mejor una lista de hace diez segundos que una pantalla en blanco— pero callado es una
          trampa. Fue exactamente lo que ocurrió el 24-09-2026: el refresco respondió 403 y la fila
          siguió diciendo «Activo», así que el clic pareció no hacer nada. */}
      {query.isError ? <Alert tone="danger">{t('admin.staff.error.stale')}</Alert> : null}

      <div style={{ maxWidth: 260, margin: '12px 0' }}>
        <Select
          aria-label={t('admin.staff.filter.status')}
          value={status}
          onChange={(value) => {
            setPage(0);
            setStatus(value as MembershipStatus | '');
          }}
          placeholder={t('admin.staff.filter.all')}
          options={(['ACTIVE', 'SUSPENDED', 'REVOKED', 'PENDING_APPROVAL'] as MembershipStatus[]).map((s) => ({
            value: s,
            label: t(`tenant.membership.status.${s}` as TranslationKey),
          }))}
        />
      </div>

      {query.isLoading ? <p>{t('common.loading')}</p> : null}
      {data ? (
        <>
          <Table
            loading={query.isLoading}
            loadingLabel={t('common.loading')}
            emptyLabel={t('admin.staff.empty')}
            rows={data.items}
            rowKey={(row) => row.membershipId}
            columns={[
              {
                key: 'name',
                header: t('admin.staff.column.person'),
                render: (member) => (
                  <>
                    <div>{member.fullName ?? '\u2014'}</div>
                    <div className="lx-text-meta">{member.email}</div>
                  </>
                ),
              },
              {
                key: 'role',
                header: t('admin.staff.column.role'),
                render: (member) => t(`role.${member.role}` as TranslationKey),
              },
              {
                key: 'status',
                header: t('admin.staff.column.status'),
                render: (member) => (
                  <>
                    <Badge tone={STATUS_TONE[member.status]}>
                      {t(`tenant.membership.status.${member.status}` as TranslationKey)}
                    </Badge>
                    {member.statusReason ? <div className="lx-text-meta">{member.statusReason}</div> : null}
                  </>
                ),
              },
              {
                key: 'zones',
                header: t('admin.staff.column.zones'),
                // "Todas" is the honest reading of an empty assignment and the one the server acts
                // on — a blank cell would let an administrator believe somebody is restricted when
                // they are not.
                render: (member) =>
                  member.zones.length === 0
                    ? t('admin.staff.zones.all')
                    : member.zones.map((zone) => zone.name).join(', '),
              },
              {
                key: 'lastUsed',
                header: t('admin.staff.column.lastUsed'),
                // The POST's own use, not the person's last sign-in. Since v0.26 a person may hold
                // two posts, and the person-level stamp cannot tell them apart: it would show the
                // same date on both rows and mark an unused inspector post as busy. When there is no
                // recorded use for this post, the person's own sign-in is offered underneath as
                // context, clearly labelled — never dressed up as this post's.
                render: (member) => (
                  <>
                    <div>
                      {member.lastUsedAt
                        ? formatDateTime(member.lastUsedAt, locale)
                        : t('admin.staff.lastUsed.none')}
                    </div>
                    {!member.lastUsedAt && member.lastLoginAt ? (
                      <div className="lx-text-meta">
                        {t('admin.staff.lastUsed.personHint', {
                          date: formatDateTime(member.lastLoginAt, locale),
                        })}
                      </div>
                    ) : null}
                  </>
                ),
              },
              {
                key: 'actions',
                header: t('admin.staff.column.actions'),
                render: (member) => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <RequirePermission permission="ZONE_ASSIGN">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setZoning(member);
                          setZoneSelection(member.zones.map((zone) => zone.zoneId));
                        }}
                      >
                        {t('admin.staff.action.zones')}
                      </Button>
                    </RequirePermission>
                    <RequirePermission permission="ROLE_ASSIGN">
                      {member.status !== 'REVOKED' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setChangingRole(member);
                            setNextRole(member.role);
                          }}
                        >
                          {t('admin.staff.action.changeRole')}
                        </Button>
                      ) : null}
                      {member.status === 'SUSPENDED' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          loading={enCurso(reactivateMutation, member)}
                          disabled={ocupada(member)}
                          onClick={() => reactivateMutation.mutate(member)}
                        >
                          {t('admin.staff.action.reactivate')}
                        </Button>
                      ) : member.status === 'ACTIVE' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={ocupada(member)}
                          onClick={() => setSuspending(member)}
                        >
                          {t('admin.staff.action.suspend')}
                        </Button>
                      ) : null}
                      {member.status !== 'REVOKED' ? (
                        <Button
                          type="button"
                          variant="danger"
                          loading={enCurso(revokeMutation, member)}
                          disabled={ocupada(member)}
                          onClick={() => setRevoking(member)}
                        >
                          {t('admin.staff.action.revoke')}
                        </Button>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permission="USER_WRITE">
                      <Button
                        type="button"
                        variant="ghost"
                        loading={enCurso(resetMutation, member)}
                        disabled={ocupada(member)}
                        onClick={() => resetMutation.mutate(member)}
                      >
                        {t('admin.staff.action.resetAccess')}
                      </Button>
                    </RequirePermission>
                  </div>
                ),
              },
            ]}
          />
          <Pagination
            page={data.page}
            size={data.size}
            totalPages={data.totalPages}
            totalElements={data.totalElements}
            onPageChange={setPage}
            previousLabel={t('pagination.previous')}
            nextLabel={t('pagination.next')}
            pageLabel={t('pagination.page')}
            ofLabel={t('pagination.of')}
            resultCountLabel={t('pagination.resultCount.other', { count: data.totalElements })}
          />
        </>
      ) : null}

      {/* Suspending says out loud what it does and what it does not: the account survives, and so
          does everything the officer did. That sentence belongs where the button is. */}
      <Modal
        open={suspending !== null}
        onClose={() => setSuspending(null)}
        title={t('admin.staff.suspend.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('admin.staff.suspend.body', { name: suspending?.fullName ?? '' })}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('admin.staff.suspend.keepsHistory')}
          </p>
          <Input
            aria-label={t('admin.staff.suspend.reasonLabel')}
            placeholder={t('admin.staff.suspend.reasonPlaceholder')}
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
          />
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setSuspending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth
              loading={suspendMutation.isPending}
              onClick={() => suspending && suspendMutation.mutate(suspending)}
            >
              {t('admin.staff.action.suspend')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revocar dice lo que lo separa de desactivar, que es lo único que alguien necesita saber
          antes de pulsarlo: esto no se levanta. Y dice lo que NO hace, porque «revocar» suena a
          borrar y no borra una sola boleta. */}
      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={t('admin.staff.revoke.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('admin.staff.revoke.body', { name: revoking?.fullName ?? revoking?.email ?? '' })}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('admin.staff.revoke.keepsHistory')}
          </p>
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setRevoking(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth
              loading={revokeMutation.isPending}
              onClick={() => revoking && revokeMutation.mutate(revoking)}
            >
              {t('admin.staff.revoke.confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Las invitaciones van DEBAJO de la plantilla y aparte: son promesas, no personal. Mezclarlas
          en la misma tabla haría que «cuánta gente trabaja aquí» se conteste mal. */}
      {(invitationsQuery.data?.items.length ?? 0) > 0 ? (
        <div style={{ marginTop: 'var(--lx-space-6)' }}>
          <h2>{t('admin.staff.invitations.title')}</h2>
          <p className="lx-text-meta">{t('admin.staff.invitations.description')}</p>
          <Table
            loading={invitationsQuery.isLoading}
            loadingLabel={t('common.loading')}
            emptyLabel={t('admin.staff.invitations.empty')}
            rows={invitationsQuery.data?.items ?? []}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'email',
                header: t('admin.staff.invitations.column.email'),
                render: (invitation) => invitation.email,
              },
              {
                key: 'role',
                header: t('admin.staff.invitations.column.role'),
                render: (invitation) => t(`role.${invitation.role}` as TranslationKey),
              },
              {
                key: 'sent',
                header: t('admin.staff.invitations.column.sent'),
                render: (invitation) => formatDateTime(invitation.createdAt, locale),
              },
              {
                key: 'expires',
                header: t('admin.staff.invitations.column.expires'),
                // Vencida se muestra como lo que es —una fecha que pasó— y no como un estado
                // distinto: el servidor lo calcula, nadie lo guarda, y sigue siendo reenviable.
                render: (invitation) =>
                  invitation.expired ? (
                    <Badge tone="warning">{t('admin.staff.invitations.expired')}</Badge>
                  ) : (
                    formatDateTime(invitation.expiresAt, locale)
                  ),
              },
              {
                key: 'actions',
                header: t('admin.staff.column.actions'),
                render: (invitation) => (
                  <RequirePermission permission="ROLE_ASSIGN">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button type="button" variant="secondary" onClick={() => resendMutation.mutate(invitation)}>
                        {t('admin.staff.invitations.action.resend')}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => revokeInvitationMutation.mutate(invitation)}
                      >
                        {t('admin.staff.invitations.action.revoke')}
                      </Button>
                    </div>
                  </RequirePermission>
                ),
              },
            ]}
          />
        </div>
      ) : null}

      <Modal
        open={changingRole !== null}
        onClose={() => setChangingRole(null)}
        title={t('admin.staff.changeRole.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('admin.staff.changeRole.body', {
              name: changingRole?.fullName ?? '',
              app: changingRole ? t(`portal.${changingRole.portal}` as TranslationKey) : '',
            })}
          </p>
          {/* Un rol pertenece a un portal y sólo a uno, así que la lista se limita a la app de este
              puesto. Decirlo aquí evita que alguien busque «fiscalizador» en un puesto de admin y
              crea que se perdió la opción. */}
          <Alert tone="info">{t('admin.staff.changeRole.sameApp')}</Alert>
          {/* Vacío de verdad se dice; vacío por accidente se arregla.
              En las pruebas del 24-09-2026 esta lista salía vacía y parecía un puesto sin
              alternativas. No lo era: la comparación era contra el portal, el servidor lo mandaba en
              mayúsculas («INSPECTOR») y el cliente lo escribe en minúsculas, así que no coincidía
              nunca. Eso ya está arreglado en el serializador (JacksonConfiguration). Lo que queda
              aquí es el caso legítimo —un puesto cuya app tiene un solo rol posible— dicho en
              palabras, con el botón apagado, en vez de un desplegable mudo. */}
          {rolesDisponibles.length === 0 ? (
            <Alert tone="warning">{t('admin.staff.changeRole.noAlternatives')}</Alert>
          ) : (
            <Select
              aria-label={t('admin.users.create.roleLabel')}
              value={nextRole}
              onChange={(value) => setNextRole(value as Role)}
              placeholder={t('common.select.placeholder')}
              options={rolesDisponibles.map((role) => ({
                value: role,
                label: t(`role.${role}` as TranslationKey),
                detail: t(`role.${role}.detail` as TranslationKey),
              }))}
            />
          )}
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setChangingRole(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={changeRoleMutation.isPending}
              disabled={rolesDisponibles.length === 0 || nextRole === '' || nextRole === changingRole?.role}
              onClick={() =>
                changingRole && nextRole !== '' && changeRoleMutation.mutate({ member: changingRole, role: nextRole })
              }
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <AddStaffDialog
        open={adding}
        onClose={() => setAdding(false)}
        onGranted={(person, granted) => {
          setAdding(false);
          setError(null);
          setFeedback(
            t('admin.staff.add.granted', {
              name: person.fullName ?? '',
              role: t(`role.${granted}` as TranslationKey),
            }),
          );
          void queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
          void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        }}
        onInvited={(email, granted) => {
          setAdding(false);
          setError(null);
          setFeedback(
            t('admin.staff.add.invited', { email, role: t(`role.${granted}` as TranslationKey) }),
          );
          void queryClient.invalidateQueries({ queryKey: ['admin', 'staff-invitations'] });
        }}
        onCreateNew={(seed) => {
          setAdding(false);
          // What was typed travels to the creation form: the administrator already entered the
          // document or the address once, and typing it a second time is how the two end up
          // disagreeing.
          const params = new URLSearchParams();
          if (seed.email) params.set('email', seed.email);
          if (seed.documentNumber) params.set('document', seed.documentNumber);
          navigate(`/users/new${params.toString() ? `?${params.toString()}` : ''}`);
        }}
      />

      <Modal
        open={zoning !== null}
        onClose={() => setZoning(null)}
        title={t('admin.staff.zones.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('admin.staff.zones.help')}
          </p>
          {(zonesQuery.data ?? []).map((zone) => (
            <label key={zone.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={zoneSelection.includes(zone.id)}
                onChange={(e) =>
                  setZoneSelection((current) =>
                    e.target.checked ? [...current, zone.id] : current.filter((id) => id !== zone.id),
                  )
                }
              />
              <span>
                {zone.name} <span className="lx-text-meta">{zone.code}</span>
              </span>
            </label>
          ))}
          {zoneSelection.length === 0 ? <Alert tone="info">{t('admin.staff.zones.noneMeansAll')}</Alert> : null}
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setZoning(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={zonesMutation.isPending}
              onClick={() => zoning && zonesMutation.mutate(zoning)}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
