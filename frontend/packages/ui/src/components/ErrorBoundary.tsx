import * as React from 'react';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Qué se ve cuando algo revienta. Textos ya traducidos: este paquete no traduce. */
  title: string;
  body: string;
  retryLabel: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Lo que impide que un error se lleve la aplicación entera.
 *
 * <h2>Por qué existe</h2>
 *
 * <p>El 23-09-2026 una opción mal combinada de `Intl.DateTimeFormat` —pedir «mes corto y día» junto
 * a un estilo de fecha, que el constructor rechaza— dejó el portal de administración COMPLETAMENTE
 * en blanco. No una pantalla rota: el `<div id="root">` vacío, sin una sola palabra. React desmonta
 * todo el árbol cuando un render lanza y no hay quien lo agarre, y no había quien lo agarrara.</p>
 *
 * <p>La diferencia que hace esto no es cosmética. Una pantalla en blanco no se puede reportar
 * —«no carga» es todo lo que una municipalidad puede decir— y no deja rastro de dónde falló. Una
 * tarjeta con el mensaje del error y un botón para reintentar convierte una caída total en una
 * pantalla rota, que es un problema mucho más chico y muchísimo más fácil de arreglar.</p>
 *
 * <h2>Lo que NO hace</h2>
 *
 * <p>No oculta el error: lo imprime en consola tal cual, con su traza, porque es lo que un arnés de
 * pruebas lee y lo que alguien va a pegar en un reporte. Tampoco intenta seguir como si nada: el
 * árbol que falló se descarta y se ofrece volver a montarlo, que es lo único honesto que se puede
 * hacer sin saber qué quedó a medias.</p>
 *
 * <p>Sigue siendo una clase porque React no ofrece `componentDidCatch` en componentes de función.
 * Es la única de todo el paquete, y por esa razón.</p>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // A la consola sin adornos: es lo que lee un arnés y lo que alguien copia en un reporte.
    console.error('[LupaRX] Fallo de render sin capturar:', error, info.componentStack);
  }

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="lx-error-boundary" role="alert">
        <div className="lx-error-boundary__card">
          <h1 className="lx-error-boundary__title">{this.props.title}</h1>
          <p className="lx-error-boundary__body">{this.props.body}</p>
          {/* El mensaje técnico se muestra en vez de esconderse: es lo único que distingue este
              fallo del siguiente, y quien lo reporta no tiene otra forma de nombrarlo. */}
          <pre className="lx-error-boundary__detail">{error.message}</pre>
          <button
            type="button"
            className="lx-btn lx-btn--primary"
            onClick={() => this.setState({ error: null })}
          >
            {this.props.retryLabel}
          </button>
        </div>
      </div>
    );
  }
}
