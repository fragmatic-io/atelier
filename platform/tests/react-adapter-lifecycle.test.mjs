import assert from 'node:assert/strict';
import test from 'node:test';
import { createAtelierSurface } from '../packages/adapters/react/src/surface-class.mjs';

class Component {
  constructor(props) {
    this.props = props;
    this.state = {};
  }

  setState(next) {
    this.state = { ...this.state, ...next };
  }
}

const React = { Component, createElement: () => null };
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('React StrictMode remount reopens the adapter lifecycle fence', async () => {
  const expected = new Error('second mount failed');
  const errors = [];
  let resolves = 0;
  const Surface = createAtelierSurface(React);
  const component = new Surface({
    id: 'workspace.overview',
    host: {
      resolve: async (_id, _context, signal) => {
        resolves += 1;
        if (resolves === 1) {
          await new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(new Error('first mount aborted')), {
              once: true,
            }),
          );
        }
        throw expected;
      },
    },
    onError: (error) => errors.push(error),
  });

  component.componentDidMount();
  component.componentWillUnmount();
  component.componentDidMount();
  await settle();

  assert.equal(resolves, 2);
  assert.equal(component.state.error, expected);
  assert.deepEqual(errors, [expected]);
});
