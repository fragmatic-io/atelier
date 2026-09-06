import { createAtelierSurface } from './surface-class.mjs';
/** React 18/19 context adapter. No HTML injection or server-only imports. */
export function createAtelierReact(React) {
  const { createElement: h, useContext, createContext } = React,
    Context = createContext(null),
    Surface = createAtelierSurface(React);
  function AtelierProvider({ host, children }) {
    return h(Context.Provider, { value: host }, children);
  }
  function useAtelier() {
    const host = useContext(Context);
    if (!host) throw new Error('AtelierProvider is required');
    return host;
  }
  function AtelierSlot(props) {
    return h(Surface, { ...props, host: useAtelier() });
  }
  const modeSurface = (mode) => (props) => h(AtelierSlot, { ...props, mode });
  return {
    AtelierProvider,
    AtelierSlot,
    AtelierRoute: modeSurface('route'),
    AtelierDrawerSlot: modeSurface('drawer'),
    AtelierModalSlot: modeSurface('modal'),
    useAtelier,
  };
}
