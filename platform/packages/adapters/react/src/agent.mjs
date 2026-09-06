/** Uses the host's React instance rather than shipping a second React runtime. */
export function createAgentReact(React, { mountChat, mountFrame }) {
  const { createElement: h, useEffect, useRef } = React;
  function AgentWorkspace({ client, name, mode = 'model', context, onTool, onError, className }) {
    const root = useRef(null);
    useEffect(() => {
      const ui = mountChat(root.current, { client, name, mode, context, onTool, onError });
      return () => ui.destroy();
    }, [client, name, mode, context, onTool, onError]);
    return h('div', { ref: root, className });
  }
  function ArtifactView({ preview, title, onAction, onError, className }) {
    const root = useRef(null);
    useEffect(() => {
      const frame = mountFrame(root.current, preview, { title, onAction, onError });
      return () => frame.destroy();
    }, [preview, title, onAction, onError]);
    return h('div', { ref: root, className });
  }
  return { AgentWorkspace, ArtifactView };
}
