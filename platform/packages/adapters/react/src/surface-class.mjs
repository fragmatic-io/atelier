import { mountSurface } from '../../../surface/src/browser.mjs';
/** Framework lifecycle bridge. Owns only its empty leaf; the host owns auth and actions. */
export function createAtelierSurface(React) {
  return class AtelierSurface extends React.Component {
    constructor(props) {
      super(props);
      this.state = { ready: false, error: null };
      this.root = null;
      this.abort = null;
      this.surface = null;
      this.unmounted = false;
    }
    componentDidMount() {
      this.begin();
    }
    componentDidUpdate(previous) {
      if (
        previous.host !== this.props.host ||
        previous.id !== this.props.id ||
        JSON.stringify(previous.context ?? {}) !== JSON.stringify(this.props.context ?? {})
      )
        this.begin();
    }
    componentWillUnmount() {
      this.unmounted = true;
      this.cleanup();
    }
    cleanup() {
      this.abort?.abort();
      this.surface?.dispose();
      this.surface = null;
    }
    async begin() {
      this.cleanup();
      const ac = new AbortController();
      this.abort = ac;
      const { host, id, context = {} } = this.props;
      this.setState({ ready: false, error: null });
      try {
        const resolution = await host.resolve(id, context, ac.signal);
        if (ac.signal.aborted || this.unmounted || !resolution?.bundle) return;
        const bundle = resolution.bundle;
        this.surface = mountSurface(this.root, bundle, {
          context,
          load: (cap, ctx, signal) =>
            host.load(
              { slotId: id, releaseId: bundle.releaseId, capability: cap, context: ctx },
              signal,
            ),
          dispatch: async (cap, input) => {
            const args = {
              slotId: id,
              releaseId: bundle.releaseId,
              capability: cap,
              input,
              context,
            };
            const confirmation = await host.confirm(args, ac.signal);
            return host.dispatch({ ...args, ticket: confirmation.ticket }, ac.signal);
          },
        });
        this.setState({ ready: true, error: null });
      } catch (error) {
        if (!ac.signal.aborted && !this.unmounted) {
          this.setState({ ready: false, error });
          this.props.onError?.(error);
        }
      }
    }
    render() {
      const h = React.createElement;
      return h(
        'div',
        { 'data-atelier-boundary': this.props.id },
        !this.state.ready || this.state.error ? (this.props.fallback ?? null) : null,
        h('div', {
          ref: (el) => (this.root = el),
          className: this.props.className ?? '',
          'data-atelier-slot': this.props.id,
          'data-atelier-mode': this.props.mode ?? 'inline',
          hidden: !this.state.ready || !!this.state.error,
        }),
      );
    }
  };
}
